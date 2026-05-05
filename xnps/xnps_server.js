const net = require('net');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const TunnelManager = require('./tunnel_manager');

let webConfig = null;
let pool = null;
let tunnelManager = null;
let npcServer = null;

const activeClients = new Map();
const pendingWebTests = new Map();

function refreshConfig() {
    try {
        const configPath = path.join(__dirname, '../web/server/apps/xnps/config.json');
        webConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!pool) {
            pool = new Pool(webConfig.db);
            tunnelManager = new TunnelManager(pool);
            console.log(`[数据库] 🛢️ 连接池初始化成功。`);
        }
    } catch (e) { console.error('[配置] ❌ 错误:', e.message); }
}

function startNpcServer() {
    const listen = () => {
        npcServer = net.createServer((socket) => {
            let identified = false;
            let buffer = Buffer.alloc(0);

            socket.on('data', (chunk) => {
                if (identified) return;
                buffer = Buffer.concat([buffer, chunk]);
                const str = buffer.toString();
                const lineEnd = str.indexOf('\n');

                if (lineEnd !== -1) {
                    identified = true;
                    const line = str.slice(0, lineEnd).trim();
                    const remaining = buffer.slice(lineEnd + 1);
                    socket.removeAllListeners('data');
                    handleIncomingConnection(socket, line, remaining);
                }
            });
            socket.on('error', (err) => {
                socket.destroy();
            });
        });
        npcServer.listen(webConfig.npc_port, '::', () => {
            console.log(`🚀 [NPC 核心] 正在监听端口 :${webConfig.npc_port}`);
        });
    };
    if (npcServer) npcServer.close(() => listen());
    else listen();
}

function handleIncomingConnection(socket, line, remaining) {
    if (line === 'RELOAD') {
        refreshConfig();
        for (const [key, session] of activeClients) session.socket.destroy();
        socket.end('RELOAD_OK\n');
        return;
    }

    if (line.startsWith('REG ')) {
        handleControlConnection(socket, line.split(' ')[1]);
    } else if (line.length === 16) {
        if (remaining.length > 0) socket.unshift(remaining);
        tunnelManager.pairSocket(line, socket);
    } else if (line.startsWith('SPEED_UP_') || line.startsWith('SPEED_DN_')) {
        handleSpeedTestConnection(socket, line, remaining);
    } else if (line.startsWith('WEB_SPEED_TEST')) {
        handleWebSpeedTestRequest(socket, line);
    } else {
        socket.destroy();
    }
}

async function handleControlConnection(socket, clientKey) {
    const remoteIp = socket.remoteAddress.replace('::ffff:', '');
    try {
        const res = await pool.query('SELECT id, client_name FROM npc_client WHERE client_key = $1', [clientKey]);
        if (res.rows.length === 0) {
            console.error(`[认证] ❌ 密钥 [${clientKey}] 不存在。`);
            return socket.destroy();
        }

        const clientInfo = res.rows[0];
        console.log(`[认证] ✅ 成功: ${clientInfo.client_name}`);

        if (activeClients.has(clientKey)) {
            const old = activeClients.get(clientKey);
            old.socket.destroy();
        }

        activeClients.set(clientKey, { socket, dbId: clientInfo.id, name: clientInfo.client_name, listeners: [] });

        await pool.query('UPDATE npc_client SET status = 1, connect_ip = $1 WHERE id = $2', [remoteIp, clientInfo.id]);

        socket.write('REG_OK\n');
        await loadAndOpenRules(activeClients.get(clientKey));

        socket.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg === 'PING') {
                socket.write('PONG\n');
                pool.query('UPDATE npc_client SET last_heartbeat = NOW() WHERE id = $1', [clientInfo.id]).catch(() => {});
            }
        });

        socket.on('close', async () => {
            const session = activeClients.get(clientKey);
            if (session?.socket === socket) {
                session.listeners.forEach(s => s.close());
                activeClients.delete(clientKey);
                await pool.query('UPDATE npc_client SET status = 0 WHERE id = $1', [clientInfo.id]);
                console.log(`[控制] 🔌 ${clientInfo.client_name} 已离线。`);
            }
        });
    } catch (err) { 
        socket.destroy(); 
    }
}

async function loadAndOpenRules(session) {
    try {
        const res = await pool.query('SELECT id, name, listen_port, target_host, target_port FROM port_mapping WHERE npc_client_id = $1 AND status = 1', [session.dbId]);
        console.log(`[规则] 🛠️ 为 [${session.name}] 开启 ${res.rows.length} 条映射。`);
        res.rows.forEach(rule => {
            const proxy = net.createServer((userSocket) => {
                console.log(`[代理] 🌐 端口 ${rule.listen_port} 收到连接，来自 ${userSocket.remoteAddress}`);
                // 🚀 记录访客信息，用于生成访问日志
                const sessionId = tunnelManager.createSession(userSocket, rule.id, {
                    clientIp: userSocket.remoteAddress.replace('::ffff:', ''),
                    targetHost: rule.target_host,
                    targetPort: rule.target_port
                });
                session.socket.write(`NEW_CONN ${sessionId} ${userSocket.remoteAddress.replace('::ffff:', '')} ${userSocket.localAddress.replace('::ffff:', '')} ${userSocket.remotePort} ${userSocket.localPort} ${rule.target_host} ${rule.target_port}\n`);
            });
            proxy.listen(rule.listen_port, '::');
            session.listeners.push(proxy);
        });
    } catch (e) { }
}

async function handleWebSpeedTestRequest(webSocket, msg) {
    const parts = msg.split(' ');
    const clientId = parts[2];
    const mode = parts[3];

    const target = [...activeClients.values()].find(c => c.dbId == clientId);
    if (!target) return webSocket.end('ERROR: Offline\n');

    const sessionTag = `SPEED_${mode === 'upload' ? 'UP' : 'DN'}_${Date.now()}`;
    pendingWebTests.set(sessionTag, webSocket);
    target.socket.write(`START_SPEED_TEST ${sessionTag}\n`);
}

function handleSpeedTestConnection(socket, sessionTag, initialChunk) {
    const webSocket = pendingWebTests.get(sessionTag);
    if (!webSocket) return socket.destroy();

    const isUpload = sessionTag.startsWith('SPEED_UP_');
    let totalBytes = initialChunk.length;
    let windowBytes = totalBytes;
    const startTime = Date.now();
    let lastSampleTime = startTime;

    const sampleTimer = setInterval(() => {
        const now = Date.now();
        const delta = (now - lastSampleTime) / 1000;
        const mbps = ((windowBytes * 8) / (1024 * 1024) / (delta || 0.1)).toFixed(2);
        if (webSocket.writable) webSocket.write(`PROGRESS ${mbps}\n`);
        windowBytes = 0;
        lastSampleTime = now;
        if (now - startTime > 15000) stopTest();
    }, 500);

    const stopTest = () => {
        clearInterval(sampleTimer);
        const finalMbps = ((totalBytes * 8) / (1024 * 1024) / ((Date.now() - startTime) / 1000)).toFixed(2);
        if (webSocket.writable) {
            webSocket.write(`RESULT ${finalMbps}\n`);
            webSocket.end();
        }
        socket.destroy();
        pendingWebTests.delete(sessionTag);
    };

    if (isUpload) {
        socket.on('data', (chunk) => {
            totalBytes += chunk.length;
            windowBytes += chunk.length;
        });
        socket.on('close', stopTest);
    } else {
        const buf = Buffer.alloc(32 * 1024, 'X');
        const pump = () => {
            while (socket.writable) {
                totalBytes += buf.length;
                windowBytes += buf.length;
                if (!socket.write(buf)) break;
            }
        };
        socket.on('drain', pump);
        pump();
        socket.on('close', stopTest);
    }
}

try { refreshConfig(); startNpcServer(); } catch (e) { }
process.on('SIGINT', async () => { if (pool) await pool.end(); process.exit(0); });
process.on('SIGTERM', async () => { if (pool) await pool.end(); process.exit(0); });

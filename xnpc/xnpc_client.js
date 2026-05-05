const net = require('net');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
    console.error('❌ 找不到配置文件 xnpc/config.json');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const VKEY = config.VKey;
const SERVER_ADDR = config.xnps_address;
const SERVER_PORT = config.npc_port || 6002;

class XNpcClient {
    constructor() {
        this.controlSocket = null;
        this.heartbeatInterval = null;
        this.reconnectAttempts = 0;
        this.isAuth = false;
    }

    connect() {
        console.log(`📡 [${new Date().toLocaleTimeString()}] 正在尝试连接服务端 ${SERVER_ADDR}:${SERVER_PORT}`);
        this.controlSocket = net.connect(SERVER_PORT, SERVER_ADDR, () => {
            console.log(`✅ [${new Date().toLocaleTimeString()}] 物理连接已建立，正在发送认证请求 (REG)...`);
            const success = this.controlSocket.write(`REG ${VKEY}\n`);
            console.log(`📤 [${new Date().toLocaleTimeString()}] 认证请求发送结果: ${success ? '成功' : '失败'}`);
            this.reconnectAttempts = 0;
        });

        let buffer = '';
        this.controlSocket.on('data', (data) => {
            const raw = data.toString();
            console.log(`📥 [${new Date().toLocaleTimeString()}] 收到原始数据: "${raw.replace(/\n/g, '\\n')}"`);
            buffer += raw;
            let boundary = buffer.indexOf('\n');
            while (boundary !== -1) {
                const line = buffer.substring(0, boundary).trim();
                buffer = buffer.substring(boundary + 1);
                if (line) {
                    console.log(`⚙️ [${new Date().toLocaleTimeString()}] 正在处理指令: [${line}]`);
                    this.handleMessage(line);
                }
                boundary = buffer.indexOf('\n');
            }
        });

        this.controlSocket.on('close', () => {
            console.log(`⚠️ [${new Date().toLocaleTimeString()}] 与服务端的控制连接已断开。`);
            this.isAuth = false;
            this.handleDisconnect();
        });

        this.controlSocket.on('error', (err) => {
            console.error(`❌ [${new Date().toLocaleTimeString()}] 连接发生错误:`, err.message);
        });
    }

    handleMessage(line) {
        const parts = line.split(/\s+/);
        const cmd = parts[0];

        if (cmd === 'REG_OK') {
            console.log(`🚀 [${new Date().toLocaleTimeString()}] 认证成功！`);
            this.isAuth = true;
            this.startHeartbeat();
        } else if (cmd === 'NEW_CONN') {
            this.handleNewConnection(parts);
        } else if (cmd === 'START_SPEED_TEST') {
            this.runSpeedTest(parts[1]);
        } else if (cmd === 'PONG') {
            console.log(`💓 [${new Date().toLocaleTimeString()}] 收到服务端心跳回应 (PONG)。`);
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) {
            console.log(`🔄 [${new Date().toLocaleTimeString()}] 清理旧的心跳计时器。`);
            clearInterval(this.heartbeatInterval);
        }
        console.log(`⏰ [${new Date().toLocaleTimeString()}] 启动心跳计时器 (30秒间隔)...`);
        this.heartbeatInterval = setInterval(() => {
            if (this.controlSocket?.writable) {
                console.log(`📤 [${new Date().toLocaleTimeString()}] 正在发送心跳 (PING)...`);
                const success = this.controlSocket.write('PING\n');
                console.log(`📤 [${new Date().toLocaleTimeString()}] PING 发送结果: ${success ? '成功' : '失败'}`);
            } else {
                console.warn(`⚠️ [${new Date().toLocaleTimeString()}] 无法发送心跳：Socket 不可写。`);
            }
        }, 30000);
    }

    handleDisconnect() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        const delay = 5000;
        this.reconnectAttempts++;
        console.log(`🔄 [${new Date().toLocaleTimeString()}] 将在 ${delay/1000} 秒后尝试重新连接 (第 ${this.reconnectAttempts} 次尝试)`);
        setTimeout(() => this.connect(), delay);
    }

    runSpeedTest(sessionTag) {
        console.log(`🚀 [${new Date().toLocaleTimeString()}] 开始测速任务: ${sessionTag}`);
        const testSocket = net.connect(SERVER_PORT, SERVER_ADDR, () => {
            testSocket.write(sessionTag + '\n');

            if (sessionTag.startsWith('SPEED_UP_')) {
                const buf = Buffer.alloc(16 * 1024, 'X');
                const startTime = Date.now();
                const pump = () => {
                    while (testSocket.writable) {
                        if (Date.now() - startTime > 10500) {
                            testSocket.end();
                            return;
                        }
                        if (!testSocket.write(buf)) break;
                    }
                };
                testSocket.on('drain', pump);
                pump();
            } else {
                testSocket.on('data', () => {});
            }
        });

        testSocket.on('error', () => {});
        setTimeout(() => testSocket.destroy(), 12000);
    }

    handleNewConnection(parts) {
        const [_, sessionId, srcIp, dstIp, srcPort, dstPort, targetHost, targetPort] = parts;
        console.log(`[隧道] 🛠️ 收到 NEW_CONN。正在尝试连接内网目标 ${targetHost}:${targetPort}...`);
        
        const localSocket = net.connect(parseInt(targetPort), targetHost, () => {
            console.log(`[隧道] ✅ 内网连接成功: ${targetHost}:${targetPort}。正在建立到服务端的隧道...`);
            
            const tunnelSocket = net.connect(SERVER_PORT, SERVER_ADDR, () => {
                console.log(`[隧道] 🚀 隧道建立成功，SessionID: ${sessionId}`);
                tunnelSocket.write(sessionId + '\n');
                localSocket.pipe(tunnelSocket);
                tunnelSocket.pipe(localSocket);
            });
            tunnelSocket.on('error', (err) => {
                console.error(`[隧道] ❌ 服务端隧道连接失败: ${err.message}`);
                localSocket.destroy();
            });
            tunnelSocket.on('close', () => {
                console.log(`[隧道] 🔌 隧道连接已关闭，SessionID: ${sessionId}`);
                localSocket.destroy();
            });
        });

        localSocket.on('error', (err) => {
            console.error(`[隧道] ❌ 无法连接到内网目标 ${targetHost}:${targetPort}: ${err.message}`);
        });
    }
}

new XNpcClient().connect();

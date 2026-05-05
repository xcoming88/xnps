/**
 * 系统设置处理器 (settingsHandler.js)
 */

const Handler = require('../../lib/mmsrv/handler.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

// 全局测速状态缓存
const speedTestSessions = new Map();

class SettingsHandler extends Handler {
    constructor(server) {
        super(server);
        this.app = server;
    }

    _getUserId() {
        const userHandler = this.server.routeHandlers['/user'];
        return userHandler ? userHandler.getUserId() : null;
    }

    _notifyXnpsReload() {
        const npcPort = this.app.config.npc_port;
        const socket = net.connect(npcPort, '127.0.0.1', () => {
            socket.write('RELOAD\n');
        });
        socket.on('data', (data) => {
            console.log('[XNPS] Server Reload Response:', data.toString().trim());
            socket.end();
        });
        socket.on('error', (err) => {
            console.error('[XNPS] Failed to notify server reload:', err.message);
        });
    }

    async getConfig() {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };
        return { success: true, data: { port: this.app.config.port, npc_port: this.app.config.npc_port } };
    }

    async saveConfig(newConfig) {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };

        const { port, npc_port } = newConfig;
        const configPath = path.join(__dirname, 'config.json');
        const finalConfig = { ...this.app.config, port, npc_port };
        fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 4));
        this.app.config = finalConfig;

        setTimeout(() => exec(`pm2 restart ${this.app.name}`), 1000);
        this._notifyXnpsReload();
        return { success: true, msg: '配置已保存，系统正在同步生效...' };
    }

    /**
     * 启动实时测速会话
     */
    async startTestSpeed(data) {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '未登录' };
        const { clientId, mode } = data;

        const dbClient = await this.app.db.connect();
        const res = await dbClient.query('SELECT client_key FROM npc_client WHERE id = $1 AND user_id = $2', [clientId, userId]);
        dbClient.release();
        if (res.rows.length === 0) return { success: false, error: '客户端不存在' };
        
        const vkey = res.rows[0].client_key;
        const npcPort = this.app.config.npc_port;
        const sessionId = `web_test_${Date.now()}`;

        // 初始化会话状态
        const sessionState = {
            currentMbps: 0,
            finalMbps: 0,
            finished: false,
            error: null,
            history: []
        };
        speedTestSessions.set(sessionId, sessionState);

        // 建立到 NPS 核心的长连接
        const socket = net.connect(npcPort, '127.0.0.1', () => {
            socket.write(`WEB_SPEED_TEST ${vkey} ${clientId} ${mode}\n`);
        });

        socket.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (!line) return;
                if (line.startsWith('PROGRESS ')) {
                    const val = parseFloat(line.split(' ')[1]);
                    sessionState.currentMbps = val;
                    sessionState.history.push(val);
                } else if (line.startsWith('RESULT ')) {
                    sessionState.finalMbps = parseFloat(line.split(' ')[1]);
                    sessionState.finished = true;
                    socket.end();
                } else if (line.startsWith('ERROR ')) {
                    sessionState.error = line.replace('ERROR: ', '');
                    sessionState.finished = true;
                    socket.end();
                }
            });
        });

        socket.on('error', (err) => {
            sessionState.error = '核心服务连接中断: ' + err.message;
            sessionState.finished = true;
        });

        return { success: true, sessionId };
    }

    /**
     * 获取测速进度 (供前端轮询)
     */
    async getTestStatus(sessionId) {
        const session = speedTestSessions.get(sessionId);
        if (!session) return { success: false, error: '会话已过期' };
        
        const data = { ...session };
        if (session.finished) {
            // 测试结束 30 秒后清理缓存
            setTimeout(() => speedTestSessions.delete(sessionId), 30000);
        }
        return { success: true, data };
    }
}

module.exports = SettingsHandler;

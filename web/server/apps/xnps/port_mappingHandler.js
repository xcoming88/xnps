/**
 * 端口映射处理器 (port_mappingHandler.js)
 */

const Handler = require('../../lib/mmsrv/handler.js');
const { exec } = require('child_process');
const net = require('net');

class PortMappingHandler extends Handler {
    constructor(server) {
        super(server);
        this.app = server;
    }

    _isPortBusy(port) {
        return new Promise((resolve) => {
            const server = net.createServer().listen(port, '0.0.0.0');
            server.on('listening', () => {
                server.close();
                resolve(false);
            });
            server.on('error', () => {
                resolve(true);
            });
        });
    }

    /**
     * 核心变更：通过 TCP 通知服务端刷新
     */
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

    _getUserId() {
        const userHandler = this.server.routeHandlers['/user'];
        return userHandler ? userHandler.getUserId() : null;
    }

    async list() {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };
        const client = await this.app.db.connect();
        try {
            const result = await client.query(
                `SELECT m.*, c.client_name FROM port_mapping m
                 LEFT JOIN npc_client c ON m.npc_client_id = c.id
                 WHERE m.user_id = $1 ORDER BY m.created_at DESC`,
                [userId]
            );
            return result.rows;
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    async add(data) {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };
        const { npc_client_id, name, listen_port, target_host, target_port, protocol } = data;
        const client = await this.app.db.connect();
        try {
            const check = await client.query('SELECT id FROM port_mapping WHERE listen_port = $1', [listen_port]);
            if (check.rows.length > 0) return { success: false, error: `端口 ${listen_port} 已占用` };
            
            if (await this._isPortBusy(listen_port)) return { success: false, error: `系统端口 ${listen_port} 被占用` };

            await client.query(
                `INSERT INTO port_mapping (user_id, npc_client_id, name, listen_port, target_host, target_port, protocol, status) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, 1)`,
                [userId, npc_client_id, name, listen_port, target_host, target_port, protocol || 'tcp']
            );
            this._notifyXnpsReload();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    async update(data) {
        const userId = this._getUserId();
        const { id, npc_client_id, name, listen_port, target_host, target_port, protocol } = data;
        const client = await this.app.db.connect();
        try {
            await client.query(
                `UPDATE port_mapping SET npc_client_id = $1, name = $2, listen_port = $3, target_host = $4, target_port = $5, protocol = $6, updated_at = NOW()
                 WHERE id = $7 AND user_id = $8`,
                [npc_client_id, name, listen_port, target_host, target_port, protocol, id, userId]
            );
            this._notifyXnpsReload();
            return { success: true };
        } finally {
            client.release();
        }
    }

    async delete(id) {
        const userId = this._getUserId();
        const client = await this.app.db.connect();
        try {
            await client.query('DELETE FROM port_mapping WHERE id = $1 AND user_id = $2', [id, userId]);
            this._notifyXnpsReload();
            return { success: true };
        } finally {
            client.release();
        }
    }

    async toggleStatus(id, status) {
        const userId = this._getUserId();
        const client = await this.app.db.connect();
        try {
            await client.query(
                'UPDATE port_mapping SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
                [status ? 1 : 0, id, userId]
            );
            this._notifyXnpsReload();
            return { success: true };
        } finally {
            client.release();
        }
    }
}

module.exports = PortMappingHandler;

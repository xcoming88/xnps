const Handler = require('../../lib/mmsrv/handler.js');

class AccessLogHandler extends Handler {
    constructor(server) {
        super(server);
        this.app = server;
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
                `SELECT 
                    l.id, 
                    l.port_mapping_id, 
                    l.client_ip as remote_addr, 
                    l.request_time as access_time, 
                    'success' as status, 
                    m.name as mapping_name,
                    m.listen_port,
                    m.target_host,
                    m.target_port,
                    c.client_name
                 FROM access_log l
                 JOIN port_mapping m ON l.port_mapping_id = m.id
                 JOIN npc_client c ON m.npc_client_id = c.id
                 WHERE m.user_id = $1
                 ORDER BY l.request_time DESC
                 LIMIT 500`, 
                [userId]
            );
            return result.rows;
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    async clear() {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };
        const client = await this.app.db.connect();
        try {
            await client.query(
                `DELETE FROM access_log WHERE port_mapping_id IN (SELECT id FROM port_mapping WHERE user_id = $1)`,
                [userId]
            );
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; } finally { client.release(); }
    }
}

module.exports = AccessLogHandler;

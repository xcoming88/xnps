const Handler = require('../../lib/mmsrv/handler.js');

class TrafficStatsHandler extends Handler {
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
                    m.id as port_mapping_id,
                    m.name as mapping_name,
                    m.listen_port,
                    m.target_host,
                    m.target_port,
                    c.client_name,
                    COALESCE(SUM(s.bytes_sent), 0)::bigint as total_sent,
                    COALESCE(SUM(s.bytes_received), 0)::bigint as total_received,
                    COALESCE(SUM(s.total_bytes), 0)::bigint as total_traffic,
                    COALESCE(SUM(s.total_requests), 0)::integer as total_requests
                 FROM port_mapping m
                 JOIN npc_client c ON m.npc_client_id = c.id
                 LEFT JOIN traffic_stats s ON m.id = s.port_mapping_id
                 WHERE m.user_id = $1
                 GROUP BY m.id, m.name, m.listen_port, m.target_host, m.target_port, c.client_name
                 ORDER BY total_traffic DESC`,
                [userId]
            );
            
            return result.rows.map(row => ({
                ...row,
                total_sent: Number(row.total_sent),
                total_received: Number(row.total_received),
                total_traffic: Number(row.total_traffic)
            }));
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    async getMonthlyStats(mappingId) {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };
        const client = await this.app.db.connect();
        try {
            const result = await client.query(
                `SELECT stat_date::text as date, COALESCE(SUM(total_bytes), 0)::bigint as total
                 FROM traffic_stats
                 WHERE port_mapping_id = $1 AND port_mapping_id IN (SELECT id FROM port_mapping WHERE user_id = $2)
                   AND stat_date >= CURRENT_DATE - INTERVAL '30 days'
                 GROUP BY stat_date ORDER BY stat_date ASC`,
                [mappingId, userId]
            );
            return result.rows.map(r => ({ ...r, total: Number(r.total) }));
        } catch (e) { return { success: false, error: e.message }; } finally { client.release(); }
    }

    async getSummary() {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };
        const client = await this.app.db.connect();
        try {
            const result = await client.query(
                `SELECT 
                    COALESCE(SUM(total_bytes), 0)::bigint as total_traffic,
                    COALESCE(SUM(CASE WHEN stat_date >= CURRENT_DATE THEN total_bytes ELSE 0 END), 0)::bigint as today_traffic
                 FROM traffic_stats
                 WHERE port_mapping_id IN (SELECT id FROM port_mapping WHERE user_id = $1)`,
                [userId]
            );
            return {
                total_traffic: Number(result.rows[0].total_traffic),
                today_traffic: Number(result.rows[0].today_traffic)
            };
        } catch (e) { return { success: false, error: e.message }; } finally { client.release(); }
    }
}

module.exports = TrafficStatsHandler;

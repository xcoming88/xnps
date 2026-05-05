const crypto = require('crypto');

class TunnelManager {
    constructor(dbPool) {
        this.pool = dbPool;
        this.sessions = new Map(); // sessionId -> { userSocket, mappingId, ctx, timer }
    }

    createSession(userSocket, mappingId, ctx = {}) {
        const sessionId = crypto.randomBytes(8).toString('hex');
        
        const timer = setTimeout(() => {
            if (this.sessions.has(sessionId)) {
                console.log(`[超时] 会话 ${sessionId} 配对失败。`);
                this.sessions.get(sessionId).userSocket.destroy();
                this.sessions.delete(sessionId);
            }
        }, 30000); 

        this.sessions.set(sessionId, { userSocket, mappingId, ctx, timer });
        return sessionId;
    }

    pairSocket(sessionId, tunnelSocket) {
        const session = this.sessions.get(sessionId);
        if (!session) return tunnelSocket.destroy();

        clearTimeout(session.timer);
        const userSocket = session.userSocket;
        const mappingId = session.mappingId;
        const ctx = session.ctx;

        // 🚀 记录访问日志
        this.saveAccessLog(mappingId, ctx);

        let bytesIn = 0;
        let bytesOut = 0;

        // 旁路监听进行流量统计（不干扰 pipe）
        userSocket.on('data', (chunk) => { bytesIn += chunk.length; });
        tunnelSocket.on('data', (chunk) => { bytesOut += chunk.length; });

        // 双向 Pipe 转发
        userSocket.pipe(tunnelSocket);
        tunnelSocket.pipe(userSocket);

        const cleanup = () => {
            userSocket.destroy();
            tunnelSocket.destroy();
            if (this.sessions.has(sessionId)) {
                this.saveTraffic(mappingId, bytesIn, bytesOut);
                this.sessions.delete(sessionId);
            }
        };

        userSocket.on('error', cleanup);
        tunnelSocket.on('error', cleanup);
        userSocket.on('close', cleanup);
        tunnelSocket.on('close', cleanup);
    }

    /**
     * 写入访问日志
     */
    async saveAccessLog(mappingId, ctx) {
        try {
            await this.pool.query(
                'INSERT INTO access_log (port_mapping_id, client_ip, target_host, target_port) VALUES ($1, $2, $3, $4)',
                [mappingId, ctx.clientIp || 'unknown', ctx.targetHost || '', ctx.targetPort || 0]
            );
            console.log(`[日志] ✅ 访问日志已存入数据库 (MappingID: ${mappingId})`);
        } catch (err) {
            console.error('[访问日志错误]', err.message);
        }
    }

    /**
     * 异步记录流量到数据库
     */
    async saveTraffic(mappingId, bytesIn, bytesOut) {
        const totalBytes = bytesIn + bytesOut;
        if (!mappingId || totalBytes === 0) return;

        try {
            const sql = `
                INSERT INTO traffic_stats (port_mapping_id, stat_date, bytes_sent, bytes_received, total_bytes, total_requests)
                VALUES ($1, CURRENT_DATE, $2, $3, $4, 1)
                ON CONFLICT (port_mapping_id, stat_date)
                DO UPDATE SET 
                    bytes_sent = traffic_stats.bytes_sent + EXCLUDED.bytes_sent,
                    bytes_received = traffic_stats.bytes_received + EXCLUDED.bytes_received,
                    total_bytes = traffic_stats.total_bytes + EXCLUDED.total_bytes,
                    total_requests = traffic_stats.total_requests + 1,
                    updated_at = NOW();
            `;
            await this.pool.query(sql, [mappingId, bytesOut, bytesIn, totalBytes]);
            console.log(`[统计] ✅ 流量已更新 (MappingID: ${mappingId}, 上传: ${bytesOut}, 下载: ${bytesIn})`);
        } catch (err) {
            console.error('[流量统计错误]', err.message);
        }
    }
}

module.exports = TunnelManager;

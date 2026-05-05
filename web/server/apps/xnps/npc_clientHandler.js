/**
 * NPC 客户端处理器 (npc_clientHandler.js)
 * --------------------------------------------------
 * 逻辑说明：
 * 1. 本处理器负责管理 npc_client 数据表，处理客户端的增删改查。
 * 2. 权限校验：通过 Cookie 中的 xnps_user 获取当前登录用户 ID，确保用户只能操作自己的客户端。
 * 3. 级联影响：删除客户端时，依靠数据库外键 ON DELETE CASCADE 自动清理映射规则、日志和统计数据。
 * 4. 状态计算：根据 last_heartbeat 时间与当前时间差判断在线/离线状态。
 */

const Handler = require('../../lib/mmsrv/handler.js');
const UserHandler = require('./userHandler.js');
const crypto = require('crypto');

class NpcClientHandler extends Handler {
    constructor(server) {
        super(server);
        this.app = server;
    }

    /**
     * 辅助方法：直接通过路由处理器获取当前登录用户 ID
     * @returns {number|null} 用户ID
     */
    _getUserId() {
        const userHandler = this.server.routeHandlers['/user'];
        return userHandler ? userHandler.getUserId() : null;
    }

    /**
     * 生成唯一的 Client Key (VKey)
     * @returns {string} 32位随机字符串
     */
    _generateVKey() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * 获取客户端列表
     * @returns {Array} 客户端对象数组
     */
    async list() {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };

        const client = await this.app.db.connect();
        try {
            // 查询所有属于当前用户的客户端
            const result = await client.query(
                `SELECT id, client_name, client_key, status, last_heartbeat, connect_ip, updated_at, 
                 CASE 
                    WHEN last_heartbeat > NOW() - INTERVAL '90 seconds' THEN 1 
                    ELSE 0 
                 END as is_online
                 FROM npc_client 
                 WHERE user_id = $1 
                 ORDER BY created_at DESC`,
                [userId]
            );
            // 🔍 深度打印：看看数据库给 Web 接口返回了什么
            console.log(`[Web API] List fetch for User ${userId}:`, result.rows.map(r => ({ id: r.id, name: r.client_name, status: r.status, is_online: r.is_online })));
            return result.rows;
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    /**
     * 新增客户端
     * @param {string} name - 客户端名称
     * @returns {Object} 包含新增记录的 ID 和 Key
     */
    async add(name) {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };
        if (!name) return { success: false, error: '名称不能为空' };

        const clientKey = this._generateVKey();
        const client = await this.app.db.connect();
        try {
            const result = await client.query(
                'INSERT INTO npc_client (user_id, client_name, client_key, status) VALUES ($1, $2, $3, 1) RETURNING id',
                [userId, name, clientKey]
            );
            return { success: true, id: result.rows[0].id, client_key: clientKey };
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    /**
     * 更新客户端信息
     * @param {number} id - 客户端ID
     * @param {string} name - 新名称
     * @returns {Object} 操作结果
     */
    async update(id, name) {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };

        const client = await this.app.db.connect();
        try {
            await client.query(
                'UPDATE npc_client SET client_name = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
                [name, id, userId]
            );
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    /**
     * 删除客户端
     * @param {number} id - 客户端ID
     * @returns {Object} 操作结果
     * 说明：关联的端口映射和日志将通过数据库级联删除自动清理
     */
    async delete(id) {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };

        const client = await this.app.db.connect();
        try {
            await client.query(
                'DELETE FROM npc_client WHERE id = $1 AND user_id = $2',
                [id, userId]
            );
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    /**
     * 重置并刷新客户端 VKey
     * @param {number} id - 客户端ID
     * @returns {Object} 新的 client_key
     */
    async refreshKey(id) {
        const userId = this._getUserId();
        if (!userId) return { success: false, error: '请先登录' };

        const newKey = this._generateVKey();
        const client = await this.app.db.connect();
        try {
            await client.query(
                'UPDATE npc_client SET client_key = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
                [newKey, id, userId]
            );
            return { success: true, client_key: newKey };
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }
}

module.exports = NpcClientHandler;

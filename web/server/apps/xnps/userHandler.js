/**
 * 用户处理器 - 处理用户登录、认证等请求
 * 使用 app.db 统一连接池
 */
const Handler = require('../../lib/mmsrv/handler.js');

class UserHandler extends Handler {
    constructor(server) {
        super(server);
        this.app = server;
    }

    /**
     * 统一身份解析方法：从请求 Cookie 中获取当前登录用户 ID
     * @returns {number|null} 用户ID，未登录或校验失败返回 null
     */
    getUserId() {
        const cookie = this.req.headers.cookie || '';
        const match = cookie.match(/(?:^|;\s*)xnps_user=([^;]+)/);
        if (!match) return null;

        let userData = this._decryptCookie(match[1]);
        
        // 如果 _decryptCookie 失败（可能是非加密模式），尝试 Base64 解析
        if (!userData) {
            try {
                const decoded = Buffer.from(match[1], 'base64').toString();
                userData = JSON.parse(decoded);
            } catch (e) {
                return null;
            }
        }

        return (userData && userData.userId) ? userData.userId : null;
    }

    /**
     * 用户登录
     * @param {string} username - 用户名
     * @param {string} password - 密码
     * @returns {Object} 登录结果
     */
    async login(username, password) {
        const client = await this.app.db.connect();
        try {
            const result = await client.query(
                'SELECT id, username, status FROM "user" WHERE username = $1 AND password = $2',
                [username, password]
            );

            if (result.rows.length === 0) {
                return { success: false, error: '用户名或密码错误' };
            }

            const user = result.rows[0];

            if (user.status !== 1) {
                return { success: false, error: '账号已被禁用' };
            }

            const token = `${user.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // 准备用户数据，用于写入 Cookie
            const userData = {
                userId: user.id,
                username: user.username,
                token: token,
                expireTime: '永久'
            };

            // 根据 debug 状态决定是否加密，然后进行 Base64 编码
            let cookieValue = null;
            if (this.server.debug) {
                // debug=true 时加密
                cookieValue = this._encryptCookie(userData);
            } else {
                // debug=false 时不加密，直接 JSON 序列化后 Base64 编码
                cookieValue = Buffer.from(JSON.stringify(userData)).toString('base64');
            }

            // 设置 Cookie（有效期1年）
            const expires = new Date();
            expires.setFullYear(expires.getFullYear() + 1);
            this.res.setHeader('Set-Cookie', `xnps_user=${cookieValue}; Path=/; Expires=${expires.toUTCString()}; SameSite=Strict`);

            return {
                userId: user.id,
                username: user.username,
                token: token
            };
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    /**
     * 验证token有效性
     * @param {string} token - 令牌
     * @returns {boolean} 是否有效
     */
    async validateToken(token) {
        if (!token || typeof token !== 'string') {
            return false;
        }

        const parts = token.split('-');
        return parts.length === 3 && parseInt(parts[0]) > 0;
    }

    /**
     * 用户登出
     */
    async logout() {
        // 清除登录 Cookie（设置过期时间为过去）
        this.res.setHeader('Set-Cookie', 'xnps_user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Strict');
        return {};
    }

    /**
     * 获取用户信息
     * @param {string} token - 令牌
     * @returns {Object} 用户信息
     */
    async getUserInfo(token) {
        const client = await this.app.db.connect();
        try {
            const userId = parseInt(token.split('-')[0]);

            const result = await client.query(
                'SELECT id, username, created_at FROM "user" WHERE id = $1',
                [userId]
            );

            if (result.rows.length === 0) {
                return { success: false, error: '用户不存在' };
            }

            return result.rows[0];
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }

    /**
     * 修改密码
     * @param {string} oldPassword - 旧密码
     * @param {string} newPassword - 新密码
     */
    async updatePassword(oldPassword, newPassword) {
        // 🚀 统一调用：复用 getUserId 方法
        const userId = this.getUserId();
        if (!userId) return { success: false, error: '请先登录' };

        const client = await this.app.db.connect();
        try {
            // 1. 验证旧密码
            const checkResult = await client.query(
                'SELECT id FROM "user" WHERE id = $1 AND password = $2',
                [userId, oldPassword]
            );

            if (checkResult.rows.length === 0) {
                return { success: false, error: '旧密码错误' };
            }

            // 2. 更新新密码
            await client.query(
                'UPDATE "user" SET password = $1, updated_at = NOW() WHERE id = $2',
                [newPassword, userId]
            );

            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            client.release();
        }
    }
}

module.exports = UserHandler;

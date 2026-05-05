const CryptoJS = require('crypto-js');
const fs = require('fs');
const path = require('path');
const fsp = require('fs').promises;

class Handler {
    constructor(server) {
        this.server = server;
    }

    // 🔐 [标准方法] 辅助：解密 Cookie (对齐 Rule 3.5：密文 + secretKey)
    _decryptCookie(cookieStr) {
        try {
            if (!cookieStr) return null;
            const key = (global.mmsrv && global.mmsrv.secretKey) || (this.server && this.server.secretKey);
            if (!key) return null;

            if (cookieStr.endsWith(key)) {
                const encrypted = cookieStr.slice(0, -key.length);
                const bytes = CryptoJS.AES.decrypt(encrypted, key);
                return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
            }
        } catch (e) { console.error("[mmsrv-Handler] Cookie decrypt failed:", e.message); }
        return null;
    }

    // 🔐 [标准方法] 辅助：加密 Cookie (对齐 Rule 3.5：密文 + secretKey)
    _encryptCookie(dataObj) {
        try {
            const key = (global.mmsrv && global.mmsrv.secretKey) || (this.server && this.server.secretKey);
            if (!key) throw new Error("Encryption key not found on server.");
            const encrypted = CryptoJS.AES.encrypt(JSON.stringify(dataObj), key).toString();
            return encrypted + key;
        } catch (e) {
            console.error("[mmsrv-Handler] Cookie encrypt failed:", e.message);
            return "";
        }
    }

    get debug() {
        return this.server ? this.server.debug : false;
    }

    set debug(val) {
        if (this.server) {
            this.server.debug = !!val;
        }
    }

    _handle(req, res) {
        this.sendResponse(res, 400, { success: false, error: 'Invalid operation: Missing act="runWebMethod" or method name' });
    }

    async handle(req, res) {
        this.req = req; // 🚀 物理挂载上下文，业务方法通过 this.req 访问
        this.res = res;

        if (req.method === 'POST') {
            const contentType = req.headers['content-type'] || '';
            if (contentType.includes('multipart/form-data')) {
                this._handle(req, res);
                return;
            }

            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', async () => {
                try {
                    // 🔐 [解密核心逻辑 v1.6 物理强化]
                    if (this.debug && body && !body.trim().startsWith('{')) {
                        const key = this.server && typeof this.server._getSecretKey === 'function'
                            ? this.server._getSecretKey() : null;
                        if (key) {
                            try {
                                const bytes = CryptoJS.AES.decrypt(body, key);
                                const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

                                // 🛡️ 物理感应：若解密失败（如 key 不匹配或 body 损坏），toString 会返回空串
                                if (decryptedString) {
                                    body = decryptedString;
                                } else {
                                    throw new Error('Handler decryption failed: Result is null or corrupted. Check secretKey or input data.');
                                }
                            } catch (e) {
                                console.error('Decryption failed in Handler:', e.message);
                                this.sendResponse(res, 403, { success: false, error: 'Decryption Error: ' + e.message });
                                return;
                            }
                        } else {
                            console.warn('Handler: debug=true but secretKey is not available locally.');
                        }
                    }

                    let data = {};
                    if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
                        data = JSON.parse(body || '{}');
                    } else if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
                        const params = new URLSearchParams(body);
                        for (const [key, value] of params.entries()) {
                            // Automatically parse stringified arrays if the field ends with [] or just as args string
                            if (key === 'args' || key === 'args[]') {
                                try { data.args = JSON.parse(value); } catch (e) { data.args = value; }
                            } else {
                                data[key] = value;
                            }
                        }
                    } else {
                        // Fallback attempt to parse JSON
                        try { data = JSON.parse(body || '{}'); } catch (e) { }
                    }

                    if (data.act === 'runWebMethod' && data.method) {
                        const method = data.method;
                        if (typeof this[method] === 'function') {
                            const args = Array.isArray(data.args) ? data.args : (data.args ? [data.args] : []);

                            // 🚀 [Debug v1.7] 物理输出解密后的请求明文
                            console.log(`[Handler Request] ${this.constructor.name}.${method}(${JSON.stringify(args)})`);

                            // 🚀 执行 WebMethod，物理透传 req/res 以便子类执行权限校验或直接操作响应
                            const result = await this[method](...args);
                            this.sendResponse(res, 200, { success: true, data: result });
                            return;
                        } else {
                            this.sendResponse(res, 404, { success: false, error: `Method '${method}' not found` });
                            return;
                        }
                    } else if (data.act === 'getWebProperty' && data.prop) {
                        const prop = data.prop;
                        let hasProp = prop in this;

                        if (hasProp && this.constructor.name !== 'Handler') {
                            const proto = Object.getPrototypeOf(this);
                            const baseProto = Handler.prototype;
                            // 如果属性定义在 Handler 基类的原型上（且没有在子类或当前实例上重写）
                            if (baseProto && prop in baseProto && !this.hasOwnProperty(prop)) {
                                let current = proto;
                                let overriden = false;
                                while (current && current !== baseProto) {
                                    if (current.hasOwnProperty(prop)) { overriden = true; break; }
                                    current = Object.getPrototypeOf(current);
                                }
                                if (!overriden) hasProp = false; // 说明纯粹是继承自 Handler 的基础属性
                            }
                        }

                        if (hasProp) {
                            const value = this[prop];
                            // 🚀 [Debug v1.7]
                            console.log(`[Handler PropGet] ${this.constructor.name}.${prop}`);
                            this.sendResponse(res, 200, { success: true, data: value });
                            return;
                        } else {
                            this.sendResponse(res, 404, { success: false, error: `Property '${prop}' not defined on handler` });
                            return;
                        }
                    } else if (data.act === 'setWebProperty' && data.prop) {
                        const prop = data.prop;
                        let hasProp = prop in this;

                        if (hasProp && this.constructor.name !== 'Handler') {
                            const proto = Object.getPrototypeOf(this);
                            const baseProto = Handler.prototype;
                            if (baseProto && prop in baseProto && !this.hasOwnProperty(prop)) {
                                let current = proto;
                                let overriden = false;
                                while (current && current !== baseProto) {
                                    if (current.hasOwnProperty(prop)) { overriden = true; break; }
                                    current = Object.getPrototypeOf(current);
                                }
                                if (!overriden) hasProp = false;
                            }
                        }

                        if (hasProp) {
                            this[prop] = data.value;
                            // 🚀 [Debug v1.7]
                            console.log(`[Handler PropSet] ${this.constructor.name}.${prop} = ${JSON.stringify(data.value)}`);
                            this.sendResponse(res, 200, { success: true, message: `Property '${prop}' set successfully` });
                            return;
                        } else {
                            this.sendResponse(res, 404, { success: false, error: `Property '${prop}' not defined on handler` });
                            return;
                        }
                    } else {
                        this._handle(req, res);
                    }
                } catch (err) {
                    console.error("Handler error:", err);
                    this.sendResponse(res, 500, { success: false, error: err.message });
                }
            });
        } else {
            this._handle(req, res);
        }
    }

    sendResponse(res, statusCode, data) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
    }

    /**
     * 🚀 [标准方法] 获取文件属性 (相对于 server.root)
     * @param {string} filepath 相对路径
     */
    async getFile(filepath) {
        if (!filepath) throw new Error('filepath is required');
        const root = this.server.root;
        const fullPath = path.resolve(root, filepath.replace(/^[/\\]+/, ''));

        // 安全检查：防止目录穿越
        if (!fullPath.startsWith(root)) {
            throw new Error('Access denied: path outside of server root');
        }

        try {
            const stats = await fsp.stat(fullPath);
            return {
                name: path.basename(fullPath),
                size: stats.size,
                mtime: stats.mtime,
                ctime: stats.ctime,
                atime: stats.atime,
                birthtime: stats.birthtime,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                ext: path.extname(fullPath),
                exists: true
            };
        } catch (e) {
            return { exists: false, error: e.message };
        }
    }

    /**
     * 🚀 [标准方法] 上传/追加文件 (Base64 转换)
     * @param {string} filepath 相对路径
     * @param {string} base64 Base64 编码的内容
     * @param {boolean} isappend 是否追加 (默认 true)
     */
    async uploadFile(filepath, base64, isappend = true) {
        if (!filepath) throw new Error('filepath is required');
        if (base64 === undefined || base64 === null) throw new Error('base64 content is required');

        const root = this.server.root;
        const fullPath = path.resolve(root, filepath.replace(/^[/\\]+/, ''));

        if (!fullPath.startsWith(root)) {
            throw new Error('Access denied: path outside of server root');
        }

        const buffer = Buffer.from(base64, 'base64');
        const dir = path.dirname(fullPath);

        // 自动创建目录
        if (!fs.existsSync(dir)) {
            await fsp.mkdir(dir, { recursive: true });
        }

        // 物理执行写入
        await fsp.writeFile(fullPath, buffer, { flag: isappend ? 'a' : 'w' });

        console.log(`[mmsrv] File ${isappend ? 'appended' : 'saved'}: ${filepath} (${buffer.length} bytes)`);

        return {
            success: true,
            size: buffer.length,
            path: filepath,
            isAppend: isappend
        };
    }

    /**
     * 🚀 [标准方法] 删除单个文件
     * @param {string} filepath 相对路径
     */
    async deleteFile(filepath) {
        if (!filepath) throw new Error('filepath is required');
        const root = this.server.root;
        const fullPath = path.resolve(root, filepath.replace(/^[/\\]+/, ''));

        if (!fullPath.startsWith(root)) {
            throw new Error('Access denied: path outside of server root');
        }

        try {
            if (fs.existsSync(fullPath)) {
                await fsp.unlink(fullPath);
                console.log(`[mmsrv] File deleted: ${filepath}`);
                return { success: true };
            }
            return { success: false, error: 'File not found' };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 🚀 [标准方法] 递归强制删除整个文件夹 (带深度与 Root 校验)
     * @param {string} folderPath 相对路径
     */
    async deleteFolder(folderPath) {
        if (!folderPath) throw new Error('folderPath is required');
        const root = this.server.root;
        const fullPath = path.resolve(root, folderPath.replace(/^[/\\]+/, ''));

        // 安全检查 1：Root 越界防护
        if (!fullPath.startsWith(root)) {
            throw new Error('Access denied: path outside of server root');
        }

        // 安全检查 2：危险深度防护 (禁止删除根目录或一级目录)
        const relative = path.relative(root, fullPath);
        if (!relative || relative === '.' || relative.split(/[/\\]/).length < 2) {
            throw new Error(`Access denied: folder path too shallow or empty: ${relative}`);
        }

        try {
            // 直接调用 Node 原生强制递归删除，效率最高
            await fsp.rm(fullPath, { recursive: true, force: true });
            console.log(`[mmsrv] Folder deleted: ${folderPath}`);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    hello(msg) {
        return "hello " + msg;
    }
}

module.exports = Handler;

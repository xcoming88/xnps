const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const CryptoJS = require('crypto-js');

class Server {
    constructor() {
        this.isHttps = false;
        this.port = 80;
        this.directPaths = [];
        this.forwardPaths = {};
        this.routeHandlers = {
            '/handler': new (require('./handler.js'))(this)
        };
        this.debug = false;
        this.certOptions = null;
        // The __dirname is /server/lib/mmsrv, so the root is 3 levels up
        this.root = path.resolve(__dirname, '../../..');
    }

    setHttps(useHttps) {
        this.isHttps = useHttps;
        return this;
    }

    setPems(key, cert) {
        const resolvePem = (pem) => {
            // Very simple check if the string contains actual key/cert data instead of a path
            if (pem.includes('BEGIN RSA PRIVATE KEY') ||
                pem.includes('BEGIN CERTIFICATE') ||
                pem.includes('BEGIN PRIVATE KEY')) {
                return pem;
            }
            // Otherwise, treat as path relative to root
            const fullPath = path.resolve(this.root, pem);
            if (fs.existsSync(fullPath)) {
                return fs.readFileSync(fullPath, 'utf8');
            }
            return pem;
        };

        this.certOptions = {
            key: resolvePem(key),
            cert: resolvePem(cert)
        };
        return this;
    }

    setPort(port) {
        this.port = port;
        return this;
    }

    setDebug(debug) {
        this.debug = debug;
        return this;
    }

    setRoot(dir) {
        this.root = dir;
        return this;
    }

    appPath(dir) {
        this.appDir = dir;
        return this;
    }

    setDirectPaths(paths) {
        this.directPaths = paths;
        return this;
    }

    addDirectPaths(paths) {
        this.directPaths = this.directPaths.concat(paths);
        return this;
    }

    addForwardPaths(paths) {
        Object.assign(this.forwardPaths, paths);
        return this;
    }

    setResponseHandler(handlersArray) {
        // Resolve caller directory directly since require.main.filename points to the script calling this
        const callerDir = require.main ? path.dirname(require.main.filename) : __dirname;

        for (const item of handlersArray) {
            if (typeof item === 'string') {
                const route = '/' + item;
                const HandlerClass = require(path.join(callerDir, item + 'Handler.js'));
                this.routeHandlers[route] = new HandlerClass(this);
            } else if (Array.isArray(item) && item.length === 2) {
                const route = '/' + item[0];
                this.routeHandlers[route] = item[1];
            }
        }
        return this;
    }

    start() {
        // Try to load mime-types, handle cleanly if not installed
        let mime;
        try {
            mime = require('mime-types');
        } catch (e) {
            console.warn("mmsrv Server warning: mime-types package not installed. Using application/octet-stream as default content type.");
            mime = { lookup: () => 'application/octet-stream' };
        }

        const handleRequest = (req, res) => {
            // Strip query string for path resolution
            let urlPath = req.url.split('?')[0];

            // 🚀 核心修正：支持中文 URL (URI Decode)
            try {
                urlPath = decodeURIComponent(urlPath);
            } catch (e) {
                console.warn('[mmsrv] Malformed URI:', urlPath);
            }

            console.log("INCOMING REQUEST:", urlPath);
            // console.log("REGISTERED ROUTES:", Object.keys(this.routeHandlers));

            // 🔐 每次请求都注入 mmsrvdata Cookie（确保 JS 启动前 key 就已存在）
            this._injectKeysCookie(res);

            // 0. Check route handlers (dynamic backend logic)
            if (this.routeHandlers[urlPath]) {
                const handler = this.routeHandlers[urlPath];

                // 🔐 debug=true 时：劫持 res.end 对 JSON 响应进行 AES 加密
                if (this.debug) {
                    const key = (typeof global !== 'undefined' && global.mmsrv) ? global.mmsrv.secretKey : null;
                    if (key) {
                        const originalEnd = res.end.bind(res);
                        res.end = (chunk, encoding, callback) => {
                            const ct = res.getHeader('Content-Type') || '';
                            if (chunk && ct.includes('application/json')) {
                                try {
                                    const encrypted = CryptoJS.AES.encrypt(chunk.toString(), key).toString();
                                    return originalEnd(encrypted, encoding, callback);
                                } catch (e) { console.error('Encrypt response error:', e); }
                            }
                            return originalEnd(chunk, encoding, callback);
                        };
                    }
                }

                handler.handle(req, res);
                return;
            }

            // 1. Check forwardPaths first (exact match)
            if (this.forwardPaths[urlPath]) {
                const forwardTarget = this.forwardPaths[urlPath];
                // Resolve relative to project root, strip leading slash so resolve works nicely
                const fullPath = path.resolve(this.root, forwardTarget.replace(/^[/\\]+/, ''));
                this.serveFile(fullPath, res, mime);
                return;
            }

            // 2. Check directPaths (prefix match)
            for (const dp of this.directPaths) {
                if (urlPath.startsWith(dp)) {
                    const fullPath = path.resolve(this.root, urlPath.replace(/^[/\\]+/, ''));
                    this.serveFile(fullPath, res, mime);
                    return;
                }
            }

            // 2.5 Referer Fallback for JS/CSS files requested by Forwarded HTML Pages
            if (urlPath.endsWith('.js') || urlPath.endsWith('.css')) {
                const referer = req.headers['referer'];
                if (referer) {
                    try {
                        // 统一使用 URL 解析出 pathname
                        const refUrl = new URL(referer, `http://${req.headers.host || 'localhost'}`);
                        const refPath = refUrl.pathname;

                        if (this.forwardPaths[refPath]) {
                            const forwardTarget = this.forwardPaths[refPath]; // "/html/apps/demo/index.html"
                            // 获取其同级目录
                            const forwardDir = path.dirname(forwardTarget);  // "/html/apps/demo"
                            const filename = path.basename(urlPath);         // "index.js"
                            const guessedPath = path.join(forwardDir, filename); // "/html/apps/demo/index.js"

                            const fullPath = path.resolve(this.root, guessedPath.replace(/^[/\\]+/, ''));
                            if (fs.existsSync(fullPath)) {
                                this.serveFile(fullPath, res, mime);
                                return;
                            }
                        }
                    } catch (e) {
                        // 避免 URL 报错导致程序崩坍
                    }
                }
            }

            // 3. Not found
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found (mmsrv)');
        };

        let server;

        if (this.isHttps) {
            if (!this.certOptions) {
                let selfsigned;
                try {
                    selfsigned = require('selfsigned');
                } catch (e) {
                    console.error("mmsrv Server error: Cannot generate temporary certificate because 'selfsigned' is not installed. Please run `npm install selfsigned`.");
                    process.exit(1);
                }
                console.log("Generating temporary self-signed certificate (days: 365)...");
                selfsigned.generate([
                    { name: 'commonName', value: 'localhost' }
                ], {
                    days: 365,
                    extensions: [{
                        name: 'subjectAltName',
                        altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }]
                    }]
                }).then(pems => {
                    this.certOptions = { key: pems.private, cert: pems.cert };
                    server = https.createServer(this.certOptions, handleRequest);
                    server.listen(this.port, () => {
                        console.log(`Server listening on https://localhost:${this.port}`);
                    });
                }).catch(err => {
                    console.error("Certificate generation error:", err);
                });
                return this; // Return chainable instance
            } else {
                server = https.createServer(this.certOptions, handleRequest);
            }
        } else {
            server = http.createServer(handleRequest);
        }

        if (server) {
            server.listen(this.port, () => {
                console.log(`Server listening on ${this.isHttps ? 'https' : 'http'}://localhost:${this.port}`);
            });
            return server;
        }
        return this;
    }
    serveFile(fullPath, res, mime) {
        fs.stat(fullPath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(`File Not Found: ${fullPath}`);
                return;
            }

            const contentType = mime.lookup(fullPath) || 'application/octet-stream';

            // 🔐 JS 混淆镜像缓存逻辑 (v3 双轨制映射)
            if (this.debug && (contentType === 'application/javascript' || fullPath.endsWith('.js')) && !fullPath.endsWith('.min.js')) {
                const minPath = this._getMinCachePath(fullPath);
                if (minPath) {
                    return fs.stat(minPath, (errMin, statsMin) => {
                        const needUpdate = errMin || stats.mtime > statsMin.mtime;
                        if (needUpdate) {
                            return fs.readFile(fullPath, 'utf8', (errRead, data) => {
                                if (errRead) return this._serveSimpleFile(fullPath, res, contentType, stats.size);

                                console.log(`[mmsrv-v3] Obfuscating & Mapping: ${path.basename(fullPath)}`);
                                const confusedCode = this.confuse(data, fullPath);
                                fs.mkdirSync(path.dirname(minPath), { recursive: true });
                                fs.writeFile(minPath, confusedCode, (errWrite) => {
                                    this._serveSimpleFile(minPath, res, contentType);
                                });
                            });
                        }
                        return this._serveSimpleFile(minPath, res, contentType);
                    });
                }
            }

            this._serveSimpleFile(fullPath, res, contentType, stats.size);
        });
    }

    // 🔑 辅助：双轨制物理镜像路径映射 (v3)
    _getMinCachePath(fullPath) {
        const htmlPrefix = path.join(this.root, 'html');
        const appsPrefix = path.join(htmlPrefix, 'apps');
        const mmsrvPrefix = path.join(htmlPrefix, 'lib', 'mmsrv');

        // A轨：App 集中式镜像 (html/apps/* -> html/min.js/apps/*)
        if (fullPath.startsWith(appsPrefix)) {
            const relToHtml = path.relative(htmlPrefix, fullPath);
            return path.join(htmlPrefix, 'min.js', relToHtml);
        }

        // B轨：核心库局部镜像 (html/lib/mmsrv/* -> html/lib/mmsrv/min.js/*)
        if (fullPath.startsWith(mmsrvPrefix)) {
            const relToMmsrv = path.relative(mmsrvPrefix, fullPath);
            if (relToMmsrv.startsWith('min.js')) return null; // 排除镜像目录本身
            return path.join(mmsrvPrefix, 'min.js', relToMmsrv);
        }

        return null;
    }

    // 📦 内部：底层静态文件透传
    _serveSimpleFile(fullPath, res, contentType, size) {
        if (size !== undefined) {
            res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': size });
            fs.createReadStream(fullPath).pipe(res);
        } else {
            fs.stat(fullPath, (err, stats) => {
                res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stats ? stats.size : 0 });
                fs.createReadStream(fullPath).pipe(res);
            });
        }
    }

    // 🔐 辅助：向响应注入 mmsrvdata Cookie，告知客户端通讯密钥
    _injectKeysCookie(res) {
        if (this.debug) {
            const key = (typeof global !== 'undefined' && global.mmsrv) ? global.mmsrv.secretKey : null;
            if (key) {
                const timestamp = Date.now();
                const encryptedKey = CryptoJS.AES.encrypt(key, timestamp.toString()).toString();
                const cookieVal = Buffer.from(JSON.stringify({ key: encryptedKey, timestamp })).toString('base64');
                res.setHeader('Set-Cookie', `mmsrvdata=${cookieVal}; path=/; SameSite=Strict`);
            }
        } else {
            // debug=false：清空 Cookie，客户端感知后停止加密
            res.setHeader('Set-Cookie', 'mmsrvdata=; path=/; Max-Age=0');
        }
    }

    // 🔑 辅助：返回当前通讯密钥 (v1.6 安全补强：改用全局访问物理避开循环引用)
    _getSecretKey() {
        if (!this.debug) return null;
        try {
            // 优先从全局单例获取秘密密钥
            if (typeof global !== 'undefined' && global.mmsrv) {
                return global.mmsrv.secretKey || null;
            }
            return null;
        } catch (e) { return null; }
    }

    confuse(code, fullPath) {
        // 🚫 .min.js 已是压缩/混淆版本，跳过再次处理
        if (fullPath && fullPath.endsWith('.min.js')) return code;
        if (!code) return code;

        let JavaScriptObfuscator;
        try {
            JavaScriptObfuscator = require('javascript-obfuscator');
        } catch (e) {
            console.warn("mmsrv Server warning: 'javascript-obfuscator' is not installed. Falling back to basic Base64 encoding. Please run `npm install javascript-obfuscator` for strong obfuscation.");
        }

        if (JavaScriptObfuscator) {
            try {
                // 使用较强且稳定的混淆配置
                const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
                    compact: true,
                    controlFlowFlattening: true, // 控制流平坦化
                    controlFlowFlatteningThreshold: 0.75,
                    deadCodeInjection: true,     // 僵尸代码注入
                    deadCodeInjectionThreshold: 0.4,
                    debugProtection: false,      // 如果开启，可能在调试时陷入无限暂停循环，看需求开启
                    disableConsoleOutput: false,
                    identifierNamesGenerator: 'hexadecimal', // 十六进制变量名
                    log: false,
                    renameGlobals: false,        // 模块作用域下设为 false 比较安全
                    rotateStringArray: true,     // 字符串数组旋转
                    selfDefending: true,         // 自我保护（防格式化）
                    stringArray: true,           // 字符串提取到数组
                    stringArrayThreshold: 0.75,
                    transformObjectKeys: true,    // 转换对象键
                    unicodeEscapeSequence: true  // 统一采用 unicode 字符编码转义
                });
                return obfuscationResult.getObfuscatedCode();
            } catch (err) {
                console.error("Strong obfuscation failed, using fallback:", err);
            }
        }

        // 简易混淆方法兜底：
        try {
            const base64Code = Buffer.from(code, 'utf8').toString('base64');
            const wrapper = `
                (function(){
                    var b64 = "${base64Code}";
                    var binaryString = atob(b64);
                    var bytes = new Uint8Array(binaryString.length);
                    for (var i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    var decoded = new TextDecoder('utf-8').decode(bytes);
                    eval(decoded);
                })();
            `;
            return wrapper;
        } catch (e) {
            console.error("Obfuscation error:", e);
            return code;
        }
    }
}

module.exports = Server;

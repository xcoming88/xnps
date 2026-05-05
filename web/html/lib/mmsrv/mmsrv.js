const mmsrv = {
    encryptionKey: null, // 🔑 全局通讯密鑰（由服务器通过 Cookie 下发）
    // 异步加载库的方法
    loadlib: async function (libname) {
        if (libname === "easyui") {
            // 同步加载 EasyUI 所需的 CSS
            await this.loadCss("/html/lib/jquery-easyui/themes/metro/easyui.css");
            await this.loadCss("/html/lib/jquery-easyui/themes/icon.css");

            // 同步加载 jQuery 然后加载 EasyUI (必须保证顺序)
            await this.loadjs("/html/lib/jquery-easyui/jquery.min.js");
            await this.loadjs("/html/lib/jquery-easyui/jquery.easyui.min.js");
        } else if (libname === "leaflet") {
            // 同步加载 Leaflet 所需的 CSS 和 JS
            await this.loadCss("/html/lib/leaflet/dist/leaflet.css");
            await this.loadjs("/html/lib/leaflet/dist/leaflet.js");
            await this.loadjs("/html/lib/leaflet/dist/leaflet-providers.js");
            await this.loadjs("/html/lib/leaflet/dist/Leaflet.ChineseTmsProviders.js")
        } else if (libname === "echarts") {
            // 同步加载 ECharts 本地高性能可视化库
            await this.loadjs("/html/lib/echarts/echarts.min.js");
        }
    },

    loadCss: function (url) {
        return new Promise((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = "text/css";
            link.href = url;
            link.onload = () => resolve();
            link.onerror = () => reject(new Error("CSS load failed: " + url));
            document.head.appendChild(link);
        });
    },

    loadjs: function (url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.type = "text/javascript";
            script.src = url;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Script load failed: " + url));
            document.head.appendChild(script);
        });
    },

    // 自动初始化逻辑
    init: async function () {
        // 🔒 框架自持逻辑：自动且同步（异步等待）加载加解密引擎
        if (typeof CryptoJS === 'undefined') {
            await this.loadjs("/html/lib/crypto.js");
        }

        // 🔑 同步密钥：此时 CryptoJS 必定已就绪
        this._syncKey();

        // 🚀 自动加载逻辑：获取当前 HTML 同名 JS
        let path = window.location.pathname;
        if (path.endsWith('/')) {
            path += "index.html";
        }
        let jsFile = path.replace(/\.html$/i, ".js");
        if (jsFile === path && !path.endsWith(".js")) {
            jsFile += ".js";
        }

        // 物理加载业务 JS
        await this.loadjs(jsFile);
    },


    // 🔑 辅助：从 mmsrvdata Cookie 中解密还原服务器通讯密鑰
    _syncKey: function () {
        try {
            const value = `; ${document.cookie}`;
            const parts = value.split('; mmsrvdata=');

            // 🛡️ 阅后即焚判定 (v1.8 极简版)：找不到 Cookie 说明已被销毁，保持内存 key 供并发使用
            if (parts.length != 2) return;

            const cookieVal = parts.pop().split(';').shift();

            // 🛡️ 明确卸载：服务器下发的空 Cookie 代表显式关闭加密
            if (!cookieVal) {
                this.encryptionKey = null;
                return;
            }

            const json = JSON.parse(atob(cookieVal));
            if (!json || !json.key || !json.timestamp) return;

            const bytes = CryptoJS.AES.decrypt(json.key, json.timestamp.toString());
            const decryptedKey = bytes.toString(CryptoJS.enc.Utf8) || null;

            if (decryptedKey) {
                this.encryptionKey = decryptedKey;
                // 🚀 [脱敏常驻]：从载荷中移除敏感字段，保留非敏感扩展信息 (如 entry)
                delete json.key;
                delete json.timestamp;
                const safeVal = btoa(JSON.stringify(json));
                document.cookie = `mmsrvdata=${safeVal}; path=/; SameSite=Strict`;
            }
        } catch (e) { }
    },

    // 🔐 辅助：加密数据 (AES)
    _encrypt: function (data) {
        // v1.8 极简：只要内存有 key 就加密
        if (!this.encryptionKey || typeof CryptoJS === 'undefined') return data;
        try {
            const str = typeof data === 'string' ? data : JSON.stringify(data);
            return CryptoJS.AES.encrypt(str, this.encryptionKey).toString();
        } catch (e) { return data; }
    },

    // 🔓 辅助：解密数据 (AES)
    _decrypt: function (str) {
        if (!this.encryptionKey || typeof CryptoJS === 'undefined') return str;
        try {
            const bytes = CryptoJS.AES.decrypt(str, this.encryptionKey);
            return bytes.toString(CryptoJS.enc.Utf8) || str;
        } catch (e) { return str; }
    },

    /**
     * 📋 辅助：复制文字到剪贴板并弹出提示
     */
    copyToClipboard: function (text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            if (typeof $ !== 'undefined' && $.messager) {
                $.messager.show({
                    title: '复制成功',
                    msg: '<div style="text-align:center; padding:5px;">内容已成功复制到剪贴板</div>',
                    timeout: 1000,
                    showType: 'fade',
                    style: { right: '', bottom: '' } // 居中弹出 (取决于 EasyUI 配置，默认右下)
                });
            }
        }).catch(err => {
            console.error('复制失败:', err);
        });
    }
};

// 执行默认初始化
mmsrv.init();

// 建立动态的后端方法调用代理
// 🌟 [标准化调度引擎重构]: 建立递归感应式代理 (Deferred/Thenable Proxy)
// 原理：每一级访问都返回一个 DeferredRequest，它既是 Function (支持调用) 也是 Thenable (支持 await 读取属性)
mmsrv.server = new Proxy({}, {
    get(target, key) {
        // 🚀 初始化层级：默认路由为 /handler，成员名为 key
        return createDeferredRequest('/handler', key);
    },
    set(target, key, value) {
        // v1.8 物理熔断：关闭 debug 时立即焚毁密钥库
        if (key === 'debug' && !value) {
            mmsrv.encryptionKey = null;
            document.cookie = "mmsrvdata=; path=/; Max-Age=0";
        }

        // 执行同步至服务器指令
        mmsrv._post('/handler', { act: 'setWebProperty', prop: key, value: value });
        return true;
    }
});

/**
 * 📦 递进式延迟请求生成器
 * @param {string} route 当前路由 (如 /handler 或 /user)
 * @param {string} member 当前成员名 (如 getFile 或 login)
 */
function createDeferredRequest(route, member) {
    // 1. 定义底层执行函数：当 mmsrv.server.member(...) 被物理调用时执行
    const exec = function (...args) {
        // 特殊处理兼容：mmsrv.server.get('prop') -> 映射为 getWebProperty
        if (member === 'get') return mmsrv._post(route, { act: 'getWebProperty', prop: args[0] });
        if (member === 'set') return mmsrv._post(route, { act: 'setWebProperty', prop: args[0], value: args[1] });

        // 标准调用：runWebMethod
        return mmsrv._post(route, { act: 'runWebMethod', method: member, args: args });
    };

    // 2. 返回包装后的代理对象，处理“下钻”或“等待”
    return new Proxy(exec, {
        get(target, prop) {
            // A. 处理等待逻辑：await mmsrv.server.member
            if (prop === 'then') {
                return (resolve, reject) => {
                    mmsrv._post(route, { act: 'getWebProperty', prop: member }).then(resolve).catch(reject);
                };
            }

            // B. 处理属性设置：mmsrv.server.module.prop = value
            if (prop === 'set') {
                return (p, v) => mmsrv._post(`/${member}`, { act: 'setWebProperty', prop: p, value: v });
            }

            // C. 处理级联下钻：mmsrv.server.user.checklogin
            // 访问 user 时 member='user'，此时 route 变为 /user，下一级成员名为 checklogin
            return createDeferredRequest('/' + member, prop);
        }
    });
}

// 📬 核心辅助：原子化 POST 调度器
mmsrv._post = async function (url, payload) {
    let body = JSON.stringify(payload);
    if (mmsrv.encryptionKey) body = mmsrv._encrypt(body);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
    });

    if (!response.ok) {
        let errText = '';
        try { errText = await response.text(); } catch (e) { }
        if (mmsrv.encryptionKey) errText = mmsrv._decrypt(errText);
        throw new Error(`HTTP Error: ${response.status} ${errText}`);
    }

    let resData = await response.text();
    if (mmsrv.encryptionKey) resData = mmsrv._decrypt(resData);

    try {
        const result = JSON.parse(resData);
        if (result.success) return result.data;
        throw new Error(result.error || 'Server error');
    } catch (e) {
        throw new Error('Parse failed: ' + e.message);
    }
};
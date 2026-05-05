# mmSRV 客户端核心库 (Client-side mmsrv.js)

`mmsrv.js` 是 mmSRV 框架的轻量级前端引擎。它不仅提供了高效的静态资源加载方案，还通过 ES6 Proxy 技术实现了与后端 `Handler` 的无缝透明通讯，支持全自动的端到端 AES 加密。

## 1. 核心特性

- **极致调用体验**: 像调用本地函数一样调用后端服务器方法，无需手动编写复杂的 `fetch` 或 `ajax` 代码。
- **透明安全同步**: 自动从服务器获取通讯密钥，并执行“阅后即焚”式 Cookie 同步，确保密钥仅保留在内存中。
- **动态资源调度**: 内置 `EasyUI`、`Leaflet`、`ECharts` 等主流库的一键加载方案，自动处理 CSS 依赖与脚本执行顺序。
- **自动化初始化**: 遵循“同名原则”，自动为 `.html` 页面匹配并加载同名的 `.js` 脚本。

## 2. 快速上手

在 HTML 头部引入 `mmsrv.js`（确保已引入 `crypto-js` 以支持加密）：

```html
<script src="/html/lib/crypto-js/crypto-js.min.js"></script>
<script src="/html/lib/mmsrv/mmsrv.js"></script>
```

### 2.1 调用后端方法 (WebMethod)
假设后端 `Handler.js` 中定义了一个 `calculate(a, b)` 方法：

```javascript
// 前端直接 await 调用
const result = await mmsrv.server.calculate(10, 20);
console.log("计算结果:", result);
```

### 2.2 访问服务器属性 (WebProperty)
直接 读取/设置 后端处理器的公共属性：

```javascript
// 设置属性
mmsrv.server.debug = true;

// 读取属性 (使用 await)
const isDebug = await mmsrv.server.debug;
```

## 3. 动态加载第三方库

使用 `mmsrv.loadlib` 可以确保库及其样式表按正确顺序加载：

```javascript
// 加载可视化库
await mmsrv.loadlib('echarts');

// 加载地图库 (自动加载 CSS + JS)
await mmsrv.loadlib('leaflet');

// 加载后台 UI 框架
await mmsrv.loadlib('easyui');
```

## 4. 自动化页面初始化逻辑

`mmsrv.js` 在加载时会执行 `init()` 任务：
1. 获取当前 URL，例如 `/html/apps/demo/index.html`。
2. 自动在页面尾部注入 `/html/apps/demo/index.js`。
*开发者只需专注于业务逻辑编写，无需在 HTML 底部手动写 script 标签。*

## 5. 安全机制：端到端加密

当服务器开启 `debug` 模式时，`mmsrv.js` 会自动激活通讯加密：
- **同步密钥**: 从 `mmsrvdata` Cookie 中解密还原服务器下发的通讯密钥。
- **Cookie 销毁**: 密钥读入内存后，立即执行 `Max-Age=0` 物理清除 Cookie，防止嗅探。
- **报文加解密**: 后续所有 `mmsrv.server` 调用都会在发送前自动 AES 加密，并在接收响应后自动解密还原为 JSON。

## 6. 配套组件

- **`jquery.table.js`**: 专为数据展示设计的 jQuery 表格插件，支持远程数据绑定与高度自定义渲染。详细说明见 [jquery.table.md](file:///d:/MyPrograms/mmsrv20260323/html/lib/mmsrv/jquery.table.md)。

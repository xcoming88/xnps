# mmSRV 核心服务器框架 (Custom Server Library)

`mmsrv` 是一个自规划的轻量级 Node.js Web 服务器框架，专为敏捷开发、静态资源托管及安全动态通讯而设计。它集成了智能路由映射、双协议 (HTTP/HTTPS) 支持、自动化 JS 混淆以及透明的端到端加密机制。

## 1. 核心架构

该库由两个核心组件组成：
- **`mmsrv.Server`**: 负责底层网络监听、静态文件服务控制以及请求路由。
- **`mmsrv.Handler`**: 业务处理基类，采用“动作-方法”映射机制，支持直接通过前端调用后端类方法。

## 2. 快速开始

### 2.1 启动基础服务器
```javascript
const mmsrv = require('./lib/mmsrv/mmsrv.js');
const server = new mmsrv.Server();

server.setPort(8080)
      .setDirectPaths(['/html', '/assets']) // 开启特定前缀的静态文件透传
      .start();
```

### 2.2 生产环境部署 (HTTPS)
```javascript
server.setHttps(true)
      .setPems('cert/server.key', 'cert/server.crt') // 相对项目根目录
      .setPort(443)
      .start();
```
> [!TIP]
> 如果未提供证书，框架会自动调用 `selfsigned` 库生成临时证书（需安装依赖）。

## 3. 路由与静态资源管理

`mmsrv` 提供了一套灵活的路径映射机制：

- **Forward Paths (精确路径映射)**: 屏蔽物理路径，将虚拟 URL 映射到特定的 HTML 文件。
- **Direct Paths (前缀透传)**: 指定目录下的资源可以按物理路径直接访问。
- **Referer Fallback (智能依赖解析)**: 框架能自动识别由转发页面请求的 `.js`/`.css` 资源，并根据 Referer 智慧定位其实际物理位置，解决了深层目录引用难题。

## 4. Handler 业务处理器

所有业务逻辑应当继承 `mmsrv.Handler` 类。

### 4.1 定义业务方法 (WebMethod)
```javascript
class MyHandler extends mmsrv.Handler {
    // 这是一个可以从前端直接调用的异步方法
    async calculate(a, b) {
        return a + b;
    }
}
```

### 4.2 前端调用规范
前端通过 POST 请求发送 JSON 或 URL 参数：
- `act`: 执行动作 (如 `runWebMethod`, `getWebProperty`, `setWebProperty`)
- `method`: 调用的类方法名。
- `args`: 数组格式的参数列表。

## 5. 内置标准方法 (Standard APIs)

`Handler` 基类内置了多项高效的底层操作：
- `getFile(filepath)`: 获取相对于根目录的文件属性（大小、修改时间等）。
- `uploadFile(filepath, base64, isappend)`: 支持云端文件上传及日志追加。
- `deleteFile(filepath)`: 删除单个文件。
- `deleteFolder(folderPath)`: 递归强制删除文件夹（具备 Root 级别安全越界保护）。

## 6. 安全与增强特性

### 6.1 JS 自动化混淆 (v3 Dual-Track Mapping)
在 `debug` 模式下，框架会自动探测非压缩的 `.js` 文件，并调用 `javascript-obfuscator` 进行深度混淆。混淆后的镜像会缓存在 `html/min.js/` 目录下，实现即时更新与物理隔离。

### 6.2 透明加密通讯 (AES Encryption)
开启 `debug` 时，框架会激活加密模式：
1.  **注入密钥**：通过 HTTP 头部注入 `mmsrvdata` Cookie。
2.  **解密请求**：后端 `Handler` 自动解密前端发来的加密 Payload。
3.  **加密响应**：劫持 `res.end`，将 JSON 报文二次加密后下发。

## 7. 目录规范
- `/server/lib/mmsrv/mmsrv.js`: 库入口。
- `/server/lib/mmsrv/server.js`: HTTP 应用引擎。
- `/server/lib/mmsrv/handler.js`: 全局业务基类。

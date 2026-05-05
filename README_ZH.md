# X-Tunnel (X-NPS & X-NPC) - 高性能内网穿透系统

X-Tunnel 是一套基于 Node.js 原生 `net` 模块实现的高性能内网穿透方案。采用控制流长连接 + 数据流按需配对的架构，追求极致的转发速度与系统稳定性。

## 核心架构
- **控制通道**：客户端通过 VKey 注册，维持 30s 心跳，保持实时指令下发。
- **数据隧道**：基于 16 位唯一 SessionID 快速配对，实现内网服务到公网端口的透明转发。
- **管理后台**：集成流量统计、访客 IP 记录及实时网速测试。

## 核心特性
- **极速转发**：使用原生 TCP 管道，无额外协议开销，性能接近物理带宽。
- **访客追踪**：服务端实时捕获并记录访问者真实 IP，通过 Web 后台进行可视化日志展示。
- **实时测速**：内置 SpeedTest 模块，支持上传/下载双向测速（Mbps）。
- **动态规则**：端口映射规则动态加载，支持 TCP/HTTP 等全协议透传。

## 项目结构
- `/xnps`：服务端核心，负责端口监听、隧道配对及流量统计。
- `/xnpc`：客户端代理，负责响应服务端指令并建立本地中转连接。
- `/web`：管理系统，包含基于 `mmsrv` 框架的 API 服务及管理页面。

## 部署指南

### 1. 环境准备
确保已安装 Node.js (建议 v14+)。在项目根目录下执行：
```bash
npm install
```

### 2. 配置文件
将各模块下的示例文件复制并重命名为 `config.json`：
- **服务端/Web端**：`web/server/apps/xnps/config.example.json` -> `config.json`
- **客户端**：`xnpc/config.example.json` -> `config.json`

### 3. 启动服务
- **启动 XNPS 服务端**：
  ```bash
  cd xnps
  node xnps_server.js
  ```
- **启动 Web 管理后台**：
  ```bash
  cd web/server/apps/xnps
  node xnps.js
  ```
- **启动 XNPC 客户端**：
  ```bash
  cd xnpc
  node xnpc_client.js
  ```

## 注意事项
- 为追求最高转发效率，目前通信采用明文传输。
- 建议在受信任的网络环境中使用，或在外部叠加安全防护。

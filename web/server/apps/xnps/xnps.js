'use strict';

/**
 * AI 应用后端入口 (链式配置版)
 * 遵循 mmsrv 框架标准规范
 */
const mmsrv = require('../../lib/mmsrv/mmsrv.js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
// 1. 加载本地配置
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// 2. 创建应用实例并进行链式配置
const app = new mmsrv.Server()
    .setHttps(true)
    .setPort(config.port)
    .setDebug(true)
    .setDirectPaths(["/html"])
    .addForwardPaths({
        "/": "/html/apps/xnps/index.html"
    });

// 3. 注册业务响应处理器
app.setResponseHandler(["user", "npc_client", "port_mapping", "access_log", "traffic_stats", "settings"]);
app.name = "xnps_web_app";
app.xnps_name = "xnps_server";
// 4. 初始化业务数据库连接池
const pool = new Pool(config.db);
pool.on('error', (err, client) => {
    console.error('❌ [Pool] 闲置连接发生异常:', err.message);
});

app.db = pool;
app.config = config;

// 5. 启动服务
app.start();

console.log(`🚀 AI Server 启动成功，监听端口: ${app.port}`);
console.log(`✅ PostgreSQL 连接池已物理就绪 (Database: ${config.db.database})`);

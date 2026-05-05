const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const tableOrder = ['user', 'npc_client', 'port_mapping', 'access_log', 'traffic_stats'];

async function executeSqlFile(client, sqlFilePath) {
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    const statements = sql.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
        if (statement.trim()) {
            await client.query(statement);
        }
    }
}

async function createTable(tableName) {
    const client = new Client(config.db);
    
    try {
        await client.connect();
        
        const sqlFilePath = path.join(__dirname, 'sql', `${tableName}.sql`);
        
        if (!fs.existsSync(sqlFilePath)) {
            console.error(`❌ 错误：SQL文件不存在 - ${sqlFilePath}`);
            process.exit(1);
        }
        
        console.log(`🚀 正在创建表: ${tableName}`);
        await executeSqlFile(client, sqlFilePath);
        console.log(`✅ 表 ${tableName} 创建成功`);
        
    } catch (error) {
        console.error(`❌ 创建表 ${tableName} 失败:`, error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

async function createAllTables() {
    const client = new Client(config.db);
    
    try {
        await client.connect();
        console.log('🔌 数据库连接成功');
        console.log('========================================');
        
        for (const tableName of tableOrder) {
            const sqlFilePath = path.join(__dirname, 'sql', `${tableName}.sql`);
            
            if (!fs.existsSync(sqlFilePath)) {
                console.warn(`⚠️ 警告：SQL文件不存在 - ${sqlFilePath}，跳过`);
                continue;
            }
            
            console.log(`🚀 正在创建表: ${tableName}`);
            try {
                await executeSqlFile(client, sqlFilePath);
                console.log(`✅ 表 ${tableName} 创建成功`);
            } catch (error) {
                console.error(`❌ 创建表 ${tableName} 失败:`, error.message);
                throw error;
            }
        }
        
        console.log('========================================');
        console.log('🎉 所有表创建完成！');
        
    } catch (error) {
        console.error('❌ 批量创建失败:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('用法: node create.js <table_name> | all');
        console.log('示例:');
        console.log('  node create.js user           # 创建用户表');
        console.log('  node create.js npc_client     # 创建NPC客户端管理表');
        console.log('  node create.js port_mapping   # 创建端口映射表');
        console.log('  node create.js access_log     # 创建访问日志表');
        console.log('  node create.js traffic_stats  # 创建流量统计表');
        console.log('  node create.js all            # 创建所有表');
        process.exit(0);
    }
    
    const tableName = args[0];
    
    if (tableName === 'all') {
        await createAllTables();
    } else if (tableOrder.includes(tableName)) {
        await createTable(tableName);
    } else {
        console.error(`❌ 错误：未知的表名 - ${tableName}`);
        console.log('可用的表名:', tableOrder.join(', '));
        process.exit(1);
    }
}

main();

CREATE TABLE IF NOT EXISTS npc_client (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    client_name VARCHAR(100) NOT NULL,
    client_key VARCHAR(255) UNIQUE NOT NULL,
    connect_ip VARCHAR(50),
    connect_port INTEGER,
    protocol VARCHAR(10) DEFAULT 'tcp',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_heartbeat TIMESTAMP,
    status SMALLINT DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

COMMENT ON TABLE npc_client IS 'NPC客户端管理表';
COMMENT ON COLUMN npc_client.id IS '客户端ID，自增主键';
COMMENT ON COLUMN npc_client.user_id IS '所属用户ID，关联用户表';
COMMENT ON COLUMN npc_client.client_name IS '客户端名称，便于识别';
COMMENT ON COLUMN npc_client.client_key IS '客户端连接密钥，用于NPC连接认证';
COMMENT ON COLUMN npc_client.connect_ip IS '客户端最近一次连接的IP地址';
COMMENT ON COLUMN npc_client.connect_port IS '客户端连接的端口号';
COMMENT ON COLUMN npc_client.protocol IS '协议类型：tcp/udp';
COMMENT ON COLUMN npc_client.created_at IS '注册时间';
COMMENT ON COLUMN npc_client.updated_at IS '最后更新时间';
COMMENT ON COLUMN npc_client.last_heartbeat IS '最后心跳时间';
COMMENT ON COLUMN npc_client.status IS '客户端状态：1=在线，0=离线';

CREATE INDEX IF NOT EXISTS idx_npc_client_user_id ON npc_client(user_id);
COMMENT ON INDEX idx_npc_client_user_id IS '用户ID索引';

CREATE UNIQUE INDEX IF NOT EXISTS idx_npc_client_client_key ON npc_client(client_key);
COMMENT ON INDEX idx_npc_client_client_key IS '客户端密钥唯一索引';

CREATE INDEX IF NOT EXISTS idx_npc_client_status ON npc_client(status);
COMMENT ON INDEX idx_npc_client_status IS '状态索引';

CREATE INDEX IF NOT EXISTS idx_npc_client_last_heartbeat ON npc_client(last_heartbeat);
COMMENT ON INDEX idx_npc_client_last_heartbeat IS '心跳时间索引';

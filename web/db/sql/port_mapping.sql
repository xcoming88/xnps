CREATE TABLE IF NOT EXISTS port_mapping (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    npc_client_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    listen_port INTEGER NOT NULL,
    target_host VARCHAR(255) NOT NULL,
    target_port INTEGER NOT NULL,
    protocol VARCHAR(10) DEFAULT 'tcp',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    status SMALLINT DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    FOREIGN KEY (npc_client_id) REFERENCES npc_client(id) ON DELETE CASCADE
);

COMMENT ON TABLE port_mapping IS '端口映射表';
COMMENT ON COLUMN port_mapping.id IS '映射规则ID，自增主键';
COMMENT ON COLUMN port_mapping.user_id IS '所属用户ID，关联用户表';
COMMENT ON COLUMN port_mapping.npc_client_id IS '所属NPC客户端ID，关联NPC客户端表';
COMMENT ON COLUMN port_mapping.name IS '映射规则名称，便于识别';
COMMENT ON COLUMN port_mapping.listen_port IS '访问端口，外部访问的端口号';
COMMENT ON COLUMN port_mapping.target_host IS '目标NPC内网地址';
COMMENT ON COLUMN port_mapping.target_port IS '目标NPC端口，转发到这个端口';
COMMENT ON COLUMN port_mapping.protocol IS '协议类型：tcp/udp';
COMMENT ON COLUMN port_mapping.created_at IS '创建时间';
COMMENT ON COLUMN port_mapping.updated_at IS '最后更新时间';
COMMENT ON COLUMN port_mapping.status IS '映射状态：1=启用，0=禁用';

CREATE INDEX IF NOT EXISTS idx_port_mapping_user_id ON port_mapping(user_id);
COMMENT ON INDEX idx_port_mapping_user_id IS '用户ID索引';

CREATE INDEX IF NOT EXISTS idx_port_mapping_npc_client_id ON port_mapping(npc_client_id);
COMMENT ON INDEX idx_port_mapping_npc_client_id IS 'NPC客户端ID索引';

CREATE UNIQUE INDEX IF NOT EXISTS idx_port_mapping_listen_port ON port_mapping(listen_port);
COMMENT ON INDEX idx_port_mapping_listen_port IS '监听端口唯一索引';

CREATE INDEX IF NOT EXISTS idx_port_mapping_status ON port_mapping(status);
COMMENT ON INDEX idx_port_mapping_status IS '状态索引';

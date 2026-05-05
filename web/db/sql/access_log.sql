CREATE TABLE IF NOT EXISTS access_log (
    id BIGSERIAL PRIMARY KEY,
    port_mapping_id INTEGER NOT NULL,
    client_ip VARCHAR(50) NOT NULL,
    target_host VARCHAR(255) NOT NULL,
    target_port INTEGER NOT NULL,
    request_time TIMESTAMP DEFAULT NOW(),
    response_bytes BIGINT DEFAULT 0,
    request_method VARCHAR(20),
    user_agent VARCHAR(500),
    referer VARCHAR(500),
    FOREIGN KEY (port_mapping_id) REFERENCES port_mapping(id) ON DELETE CASCADE
);

COMMENT ON TABLE access_log IS '访问日志表';
COMMENT ON COLUMN access_log.id IS '日志ID，自增主键';
COMMENT ON COLUMN access_log.port_mapping_id IS '关联的端口映射ID';
COMMENT ON COLUMN access_log.client_ip IS '访问来源IP地址';
COMMENT ON COLUMN access_log.target_host IS '请求目标主机';
COMMENT ON COLUMN access_log.target_port IS '请求目标端口';
COMMENT ON COLUMN access_log.request_time IS '请求时间';
COMMENT ON COLUMN access_log.response_bytes IS '响应字节数';
COMMENT ON COLUMN access_log.request_method IS '请求方法（HTTP等）';
COMMENT ON COLUMN access_log.user_agent IS '用户代理信息';
COMMENT ON COLUMN access_log.referer IS '来源页面';

CREATE INDEX IF NOT EXISTS idx_access_log_port_mapping_id ON access_log(port_mapping_id);
COMMENT ON INDEX idx_access_log_port_mapping_id IS '端口映射ID索引';

CREATE INDEX IF NOT EXISTS idx_access_log_client_ip ON access_log(client_ip);
COMMENT ON INDEX idx_access_log_client_ip IS '客户端IP索引';

CREATE INDEX IF NOT EXISTS idx_access_log_request_time ON access_log(request_time);
COMMENT ON INDEX idx_access_log_request_time IS '请求时间索引';

CREATE INDEX IF NOT EXISTS idx_access_log_client_ip_time ON access_log(client_ip, request_time);
COMMENT ON INDEX idx_access_log_client_ip_time IS '客户端IP和时间组合索引';

CREATE INDEX IF NOT EXISTS idx_access_log_target_host_time ON access_log(target_host, request_time);
COMMENT ON INDEX idx_access_log_target_host_time IS '目标主机和时间组合索引';

CREATE INDEX IF NOT EXISTS idx_access_log_mapping_time ON access_log(port_mapping_id, request_time);
COMMENT ON INDEX idx_access_log_mapping_time IS '映射ID和时间组合索引';

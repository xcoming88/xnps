CREATE TABLE IF NOT EXISTS traffic_stats (
    id BIGSERIAL PRIMARY KEY,
    port_mapping_id INTEGER NOT NULL,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    total_bytes BIGINT DEFAULT 0,
    total_requests INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (port_mapping_id) REFERENCES port_mapping(id) ON DELETE CASCADE
);

COMMENT ON TABLE traffic_stats IS '流量统计表';
COMMENT ON COLUMN traffic_stats.id IS '统计记录ID，自增主键';
COMMENT ON COLUMN traffic_stats.port_mapping_id IS '关联的端口映射ID';
COMMENT ON COLUMN traffic_stats.stat_date IS '统计日期';
COMMENT ON COLUMN traffic_stats.bytes_sent IS '发送字节数（累计上传）';
COMMENT ON COLUMN traffic_stats.bytes_received IS '接收字节数（累计下载）';
COMMENT ON COLUMN traffic_stats.total_requests IS '总请求次数';
COMMENT ON COLUMN traffic_stats.total_bytes IS '总流量字节数';
COMMENT ON COLUMN traffic_stats.unique_visitors IS '独立访客数';
COMMENT ON COLUMN traffic_stats.created_at IS '创建时间';
COMMENT ON COLUMN traffic_stats.updated_at IS '更新时间';

-- 索引：按映射ID和日期唯一，支持 ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_traffic_stats_mapping_date ON traffic_stats(port_mapping_id, stat_date);
COMMENT ON INDEX idx_traffic_stats_mapping_date IS '映射ID和日期唯一索引';

CREATE INDEX IF NOT EXISTS idx_traffic_stats_stat_date ON traffic_stats(stat_date);
COMMENT ON INDEX idx_traffic_stats_stat_date IS '统计日期索引';

CREATE INDEX IF NOT EXISTS idx_traffic_stats_port_mapping_id ON traffic_stats(port_mapping_id);
COMMENT ON INDEX idx_traffic_stats_port_mapping_id IS '端口映射ID索引';

CREATE INDEX IF NOT EXISTS idx_traffic_stats_total_bytes ON traffic_stats(total_bytes);
COMMENT ON INDEX idx_traffic_stats_total_bytes IS '流量值排序索引';

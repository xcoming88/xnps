CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    status SMALLINT DEFAULT 1
);

COMMENT ON TABLE "user" IS '用户登录表';
COMMENT ON COLUMN "user".id IS '用户ID，自增主键';
COMMENT ON COLUMN "user".username IS '用户名，用于登录系统';
COMMENT ON COLUMN "user".password IS '密码，明文存储';
COMMENT ON COLUMN "user".created_at IS '创建时间';
COMMENT ON COLUMN "user".updated_at IS '最后更新时间';
COMMENT ON COLUMN "user".status IS '账号状态：1=启用，0=禁用';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON "user"(username);
COMMENT ON INDEX idx_user_username IS '用户名唯一索引';

CREATE INDEX IF NOT EXISTS idx_user_status ON "user"(status);
COMMENT ON INDEX idx_user_status IS '状态索引';

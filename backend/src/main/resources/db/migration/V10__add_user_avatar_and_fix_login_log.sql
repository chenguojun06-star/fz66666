-- V10: 补充手动 ALTER TABLE 到迁移脚本
-- 变更1: 为 t_user 添加 avatar_url 字段（之前代码引用此字段但表中不存在，导致登录 500）
ALTER TABLE t_user
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) DEFAULT NULL COMMENT '用户头像URL（腾讯云COS）';

-- 变更2: 将 t_login_log.error_message 从 VARCHAR 扩展为 TEXT（避免长错误信息被截断）
ALTER TABLE t_login_log
    MODIFY COLUMN error_message TEXT COMMENT '登录失败原因（扩展为TEXT以容纳完整堆栈信息）';

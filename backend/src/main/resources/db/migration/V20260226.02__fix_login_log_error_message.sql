-- 将 t_login_log.error_message 从 VARCHAR(500) 扩展为 TEXT
-- 背景：登录失败时记录完整堆栈，VARCHAR(500) 不够用，导致 Data truncation 异常
-- 注：生产库已手动执行过此 ALTER，此脚本用于新环境 / CI 自动迁移
ALTER TABLE t_login_log
    MODIFY COLUMN error_message TEXT COMMENT '登录失败原因（扩展为TEXT以容纳完整堆栈信息）';

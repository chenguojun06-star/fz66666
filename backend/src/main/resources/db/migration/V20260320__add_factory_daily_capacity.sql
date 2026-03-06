-- 工厂日产能字段
-- 供排产建议引擎读取（替代硬编码500件/天）
ALTER TABLE t_factory ADD COLUMN daily_capacity INT DEFAULT 500 COMMENT '工厂日产能（件/天），用于AI排产建议';

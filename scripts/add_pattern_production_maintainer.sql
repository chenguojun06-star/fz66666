-- 添加样板生产维护人和维护时间字段
-- 2026-01-31

ALTER TABLE t_pattern_production
ADD COLUMN maintainer VARCHAR(100) COMMENT '维护人' AFTER delete_flag,
ADD COLUMN maintain_time DATETIME COMMENT '维护时间' AFTER maintainer;

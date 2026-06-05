-- V20260606001: t_style_info 新增 AI 难度评估持久化字段
-- AI 识别的款式难度结果保存到数据库，避免每次重新计算
-- 使用 IF NOT EXISTS 保证幂等，兼容 DbColumnRepairRunner 已添加列的场景

ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS difficulty_score INT DEFAULT NULL COMMENT 'AI难度评分1-10';
ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20) DEFAULT NULL COMMENT 'AI难度级别: SIMPLE/MEDIUM/COMPLEX/HIGH_END';
ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS difficulty_label VARCHAR(20) DEFAULT NULL COMMENT 'AI难度中文标签';
ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS pricing_multiplier DECIMAL(5,2) DEFAULT NULL COMMENT 'AI难度定价倍率';

-- 新增 t_style_info.sample_start_time 字段（样衣生产开始时间）
-- 原脚本 V20260430001__add_sample_start_time_to_style_info.sql 因版本号与
-- V20260430001__knowledge_base_expansion_35_to_50.sql 冲突导致 Flyway 启动失败
-- 已修复：重命名为 V20260503004，并移除 COMMENT '' 陷阱（Flyway 会将 '' 截断 SET @s 字符串）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='sample_start_time')=0,
  'ALTER TABLE `t_style_info` ADD COLUMN `sample_start_time` DATETIME DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

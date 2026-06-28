-- ============================================================
-- V20260628001: 为 t_style_info 增加 delete_flag 软删除字段
-- 根因：之前款式表没有软删除字段，测试数据无法安全清理
-- 幂等写法：先通过 INFORMATION_SCHEMA.COLUMNS 检测列是否存在
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='delete_flag')=0,
    'ALTER TABLE `t_style_info` ADD COLUMN `delete_flag` TINYINT DEFAULT 0 COMMENT ''删除标记 0-未删除 1-已删除''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

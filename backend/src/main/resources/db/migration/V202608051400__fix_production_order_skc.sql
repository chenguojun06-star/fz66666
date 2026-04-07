-- V202608051400: 修复 t_production_order.skc 缺列（COMMENT '' bug 遗留）
-- 根本原因：V20260309__add_skc_to_style_info.sql 使用了 SET @s = IF(..., 'ALTER TABLE ... COMMENT ''SKC...''', 'SELECT 1')
-- Flyway MySQL 解析器将第一个 '' 识别为字符串结束符，ALTER TABLE 语句被截断，列从未被添加
-- 修复：使用安全模板（不在 SET @s 中包含 COMMENT）
-- 受影响接口：POST /api/warehouse/finished-inventory/list（查询 t_production_order 时 SELECT * 遇缺列 500）

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'skc') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `skc` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

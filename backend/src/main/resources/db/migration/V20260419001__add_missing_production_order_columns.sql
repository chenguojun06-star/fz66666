-- V20260419001: 补全 t_production_order 缺失的 5 个列（修复云端下单 HTTP 500）
-- 根本原因：这 5 列在本地 DB 通过手动 ALTER 添加，从未写入 Flyway 脚本，导致云端 INSERT 失败
-- 幂等写法：使用 INFORMATION_SCHEMA.COLUMNS 判断列是否存在，安全可重复执行

-- ① remarks（备注）：下单表单常用字段，用户填写后 INSERT 含此列，云端无此列则 500
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'remarks') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `remarks` TEXT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② expected_ship_date（预计出货日期）：下单表单字段，用户填写后 INSERT 含此列，云端无此列则 500
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'expected_ship_date') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `expected_ship_date` DATE DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ③ node_operations（工序节点操作记录）：委托授权流程写入，云端无此列 updateById 会 500
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'node_operations') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `node_operations` LONGTEXT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ④ procurement_confirmed_at（采购确认时间）：采购确认操作写入，云端无此列则 500
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'procurement_confirmed_at') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirmed_at` DATETIME DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ⑤ procurement_confirm_remark（采购确认备注）：采购确认操作写入，云端无此列则 500
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'procurement_confirm_remark') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirm_remark` VARCHAR(500) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

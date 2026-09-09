-- ============================================================
-- D-330b：云库缺列补齐 — quotation_unit_price 从未有任何迁移加过
-- 背景：D-330 毛利口径 SQL 依赖 quotation_unit_price（销售额兜底链第二顺位），
--       云上 t_production_order 缺此列 → 数据分析 /overview 500 Unknown column。
-- 策略：逐列 IF NOT EXISTS 补齐，幂等可重复执行（与 V202708130001 同模式）。
-- ============================================================

-- quotation_unit_price：报价单价快照（元/件）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'quotation_unit_price') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `quotation_unit_price` DECIMAL(12,4) DEFAULT NULL COMMENT ''报价单价快照（元/件）''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 保险补齐毛利 SQL 另外两列（V202708130001 已覆盖，若个别环境未跑全此处兜底）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'factory_unit_price') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_unit_price` DECIMAL(12,4) DEFAULT NULL COMMENT ''下单锁定单价（元/件）''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'material_cost') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `material_cost` DECIMAL(14,4) DEFAULT NULL COMMENT ''面辅料成本汇总''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

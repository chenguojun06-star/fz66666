-- ============================================================
-- 修复：t_style_quotation.profit_rate 缺失导致 v_finished_product_settlement 视图查询 500
-- 根因：profit_rate 列仅在 StyleTableMigrator.java 的 CREATE TABLE IF NOT EXISTS 中定义，
--       而 application-prod.yml 设置 initializer-enabled=false，StyleTableMigrator 在云端从不运行。
--       所有视图脚本（V20260221b / V20260303 / V202609021000 / V20260420002 等）均引用
--       sq1.profit_rate，列缺失时 SELECT FROM v_finished_product_settlement 立即报错 500。
--       同理，DbColumnRepairRunner 的 t_style_quotation 补列段也未包含此字段。
-- 修复方式：幂等 ALTER TABLE（INFORMATION_SCHEMA 判断，云端安全）
-- 触发接口：GET /api/finance/finished-settlement/list（及所有查询该视图的接口）
-- ============================================================

-- t_style_quotation.profit_rate — 目标利润率(%)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_quotation'
       AND COLUMN_NAME = 'profit_rate') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `profit_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_style_quotation.total_price — 含利润的最终报价（视图 style_final_price 来源）
-- 防止同批次其他环境漂移
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_quotation'
       AND COLUMN_NAME = 'total_price') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `total_price` DECIMAL(12,2) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_style_quotation.style_id — 关联 t_style_info.id（视图 JOIN 关键列）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_quotation'
       AND COLUMN_NAME = 'style_id') = 0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `style_id` VARCHAR(32) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- V38: 补全 t_scan_record 缺失列
-- 背景：以下7个字段在 Java 实体 ScanRecord.java 中定义，
--        但从未通过 Flyway 迁移添加（仅存在于 scripts/ 手动脚本中）。
--        云端 FLYWAY_ENABLED=false，需手动在云端执行。
-- 影响：INSERT t_scan_record 含非 NULL 的 process_unit_price/scan_cost 时，
--        若列不存在 → BadSqlGrammarException → 500
-- ============================================================

-- 使用 information_schema 检查列是否存在，避免重复添加报错
-- MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，使用 PROCEDURE 包装

DELIMITER $$

DROP PROCEDURE IF EXISTS add_column_if_not_exists$$

CREATE PROCEDURE add_column_if_not_exists(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_definition VARCHAR(500)
)
BEGIN
    DECLARE col_count INT;
    SELECT COUNT(*) INTO col_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column;

    IF col_count = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

-- 1. scan_mode（Phase 3 SKU扫码模式）
CALL add_column_if_not_exists('t_scan_record', 'scan_mode',
    "VARCHAR(20) DEFAULT 'BUNDLE' COMMENT '扫码模式: ORDER/BUNDLE/SKU'");

-- 2. sku_completed_count（SKU完成数）
CALL add_column_if_not_exists('t_scan_record', 'sku_completed_count',
    "INT DEFAULT 0 COMMENT 'SKU完成数'");

-- 3. sku_total_count（SKU总数）
CALL add_column_if_not_exists('t_scan_record', 'sku_total_count',
    "INT DEFAULT 0 COMMENT 'SKU总数'");

-- 4. process_unit_price（Phase 5 工序单价）
CALL add_column_if_not_exists('t_scan_record', 'process_unit_price',
    "DECIMAL(15,2) DEFAULT NULL COMMENT '工序单价'");

-- 5. scan_cost（本次扫码工序成本 = processUnitPrice * quantity）
CALL add_column_if_not_exists('t_scan_record', 'scan_cost',
    "DECIMAL(15,2) DEFAULT NULL COMMENT '扫码工序成本'");

-- 6. actual_operator_id（Phase 6 实际操作员ID）
CALL add_column_if_not_exists('t_scan_record', 'actual_operator_id',
    "VARCHAR(64) DEFAULT NULL COMMENT '实际操作员ID'");

-- 7. actual_operator_name（Phase 6 实际操作员名称）
CALL add_column_if_not_exists('t_scan_record', 'actual_operator_name',
    "VARCHAR(100) DEFAULT NULL COMMENT '实际操作员名称'");

-- 清理临时 PROCEDURE
DROP PROCEDURE IF EXISTS add_column_if_not_exists;

-- 验证
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_scan_record'
  AND COLUMN_NAME IN ('scan_mode', 'sku_completed_count', 'sku_total_count',
                      'process_unit_price', 'scan_cost',
                      'actual_operator_id', 'actual_operator_name')
ORDER BY ORDINAL_POSITION;

-- D-374：t_product_outstock.outstock_no 带 UNIQUE 约束（FinanceTableMigrator 建表时遗留），
-- 与 D-360n「一次出库一个出库单、多行明细共用同一单号」冲突——
-- 插入第 2 行明细即撞唯一键 → DuplicateKeyException → 409「数据已存在，请勿重复提交」。
--
-- 出库单号是业务单号（一张单多行明细），不应唯一。
-- 幂等：按 information_schema 动态定位「包含 outstock_no 列的非主键唯一索引」并删除，
-- 索引不存在时无操作（铁律 #8：MySQL 8.0 用 information_schema + 存储过程模式）。

DROP PROCEDURE IF EXISTS `__mig_V202709110300`;
DELIMITER $$
CREATE PROCEDURE `__mig_V202709110300`()
BEGIN
    DECLARE idx_name VARCHAR(64);
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

    SELECT DISTINCT INDEX_NAME INTO idx_name
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_product_outstock'
       AND COLUMN_NAME = 'outstock_no'
       AND NON_UNIQUE = 0
       AND INDEX_NAME <> 'PRIMARY'
     LIMIT 1;

    IF idx_name IS NOT NULL THEN
        SET @ddl = CONCAT('ALTER TABLE `t_product_outstock` DROP INDEX `', idx_name, '`');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;
CALL `__mig_V202709110300`();
DROP PROCEDURE IF EXISTS `__mig_V202709110300`;

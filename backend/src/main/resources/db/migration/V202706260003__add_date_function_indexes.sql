-- ============================================================
-- V202706260003：为DATE()函数查询添加函数索引
-- 解决问题：MaterialOutboundLog/订单/Dashboard 的 DATE(create_time) 查询无法走普通索引
-- 方案：MySQL 8.0.13+ 支持函数索引（functional index）
-- 兼容性：仅当字段不存在时创建（幂等）
-- ============================================================

DELIMITER $$

-- 1. t_material_outbound_log 的日期查询（DATE(COALESCE(outbound_time, create_time))）
DROP PROCEDURE IF EXISTS add_mat_outbound_date_idx $$
CREATE PROCEDURE add_mat_outbound_date_idx()
BEGIN
    -- 为 outbound_time 添加 DATE() 函数索引（覆盖 outbound_time IS NOT NULL 的场景）
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_material_outbound_log'
                     AND INDEX_NAME = 'idx_outbound_date')
    THEN
        SET @sql = 'CREATE INDEX idx_outbound_date ON t_material_outbound_log ((DATE(COALESCE(outbound_time, create_time))))';
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;

    -- 为 create_time 添加 DATE() 函数索引（覆盖 outbound_time IS NULL 的场景）
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_material_outbound_log'
                     AND INDEX_NAME = 'idx_create_date')
    THEN
        SET @sql = 'CREATE INDEX idx_create_date ON t_material_outbound_log ((DATE(create_time)))';
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

-- 2. t_production_order 的 DATE(create_time) 函数索引
DROP PROCEDURE IF EXISTS add_order_create_date_idx $$
CREATE PROCEDURE add_order_create_date_idx()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_production_order'
                     AND INDEX_NAME = 'idx_create_date')
    THEN
        SET @sql = 'CREATE INDEX idx_create_date ON t_production_order ((DATE(create_time)))';
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

DELIMITER ;

CALL add_mat_outbound_date_idx();
CALL add_order_create_date_idx();

DROP PROCEDURE IF EXISTS add_mat_outbound_date_idx;
DROP PROCEDURE IF EXISTS add_order_create_date_idx;

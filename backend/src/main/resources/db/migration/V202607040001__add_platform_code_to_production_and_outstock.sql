-- 给 t_production_order 和 t_product_outstock 增加 platform_code 字段
-- 用于打通电商平台来源，生产订单和出库记录可直接按平台筛选/统计
-- 幂等：用 PREPARE stmt 模式（项目最新最佳实践，避免 DELIMITER 静默失败风险）

-- t_production_order 加 platform_code
SET @dbname = DATABASE();
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'platform_code');
SET @s = IF(@c = 0,
    'ALTER TABLE t_production_order ADD COLUMN platform_code VARCHAR(32) DEFAULT NULL COMMENT ''电商平台代码（TB/JD/PDD/DY/XHS/WC/SFY/SY/JST），从EC订单同步''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_product_outstock 加 platform_code
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 't_product_outstock' AND COLUMN_NAME = 'platform_code');
SET @s = IF(@c = 0,
    'ALTER TABLE t_product_outstock ADD COLUMN platform_code VARCHAR(32) DEFAULT NULL COMMENT ''电商平台代码（从生产订单或EC订单带入）''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

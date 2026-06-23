-- ========================================================================
-- MaterialPurchase 日期查询性能优化
-- 问题：YEAR(actual_arrival_date) = #{year} 导致索引失效
-- 解决方案：添加复合索引 (tenant_id, delete_flag, actual_arrival_date)
-- ========================================================================

SET NAMES utf8mb4;

-- 使用存储过程实现幂等创建索引（MySQL不支持CREATE INDEX IF NOT EXISTS）
DROP PROCEDURE IF EXISTS create_mpu_date_index;
DELIMITER //
CREATE PROCEDURE create_mpu_date_index()
BEGIN
    -- 检查索引是否已存在
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_material_purchase'
          AND INDEX_NAME = 'idx_mpu_tenant_delete_arrival_date'
    ) THEN
        -- 创建复合索引
        CREATE INDEX idx_mpu_tenant_delete_arrival_date
        ON t_material_purchase (tenant_id, delete_flag, actual_arrival_date);
    END IF;
END//
DELIMITER ;

-- 执行存储过程
CALL create_mpu_date_index();

-- 删除存储过程
DROP PROCEDURE IF EXISTS create_mpu_date_index;

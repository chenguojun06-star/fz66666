-- ========================================================================
-- MaterialPurchase 日期查询性能优化（新增）
-- 问题：YEAR(actual_arrival_date) = #{year} 导致索引失效
-- 解决方案：添加复合索引 (tenant_id, delete_flag, actual_arrival_date)
-- 注意：V20260623001/02已执行但有bug，使用本文件替代修复
-- ========================================================================

SET NAMES utf8mb4;

-- 使用存储过程实现幂等创建索引
DROP PROCEDURE IF EXISTS add_mpu_date_idx;
DELIMITER //
CREATE PROCEDURE add_mpu_date_idx()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_material_purchase'
          AND INDEX_NAME = 'idx_mpu_tenant_delete_arrival_date'
    ) THEN
        CREATE INDEX idx_mpu_tenant_delete_arrival_date
        ON t_material_purchase (tenant_id, delete_flag, actual_arrival_date);
    END IF;
END//
DELIMITER ;
CALL add_mpu_date_idx();
DROP PROCEDURE IF EXISTS add_mpu_date_idx;

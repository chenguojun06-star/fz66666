-- ========================================================================
-- MaterialPurchase 日期查询性能优化
-- 问题：YEAR(actual_arrival_date) = #{year} 导致索引失效
-- 解决方案：添加复合索引 (tenant_id, delete_flag, actual_arrival_date)
-- ========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. 添加日期查询优化索引
-- 这个索引可以优化以下查询模式：
-- - selectTodayArrivalCount: WHERE actual_arrival_date >= ? AND actual_arrival_date < ?
-- - selectTodayArrivals: WHERE actual_arrival_date >= ? AND actual_arrival_date < ?
-- - selectTodayInboundByHourAndType: WHERE actual_arrival_date >= ? AND actual_arrival_date < ?
-- - selectLast7DaysInboundByType: WHERE actual_arrival_date >= ? AND actual_arrival_date <= ?
-- - selectLast30DaysInboundByType: WHERE actual_arrival_date >= ? AND actual_arrival_date <= ?
-- - selectYearInboundByMonthAndType: WHERE YEAR(actual_arrival_date) = ?

CREATE INDEX IF NOT EXISTS idx_mpu_tenant_delete_arrival_date
ON t_material_purchase (tenant_id, delete_flag, actual_arrival_date);

-- 2. 优化 YEAR() 函数查询
-- 将 YEAR(actual_arrival_date) = #{year} 转换为范围查询
-- WHERE actual_arrival_date >= 'year-01-01' AND actual_arrival_date < 'year+1-01-01'

SET FOREIGN_KEY_CHECKS = 1;

-- 验证索引创建
SELECT 
    TABLE_NAME, 
    INDEX_NAME, 
    COLUMN_NAME 
FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 't_material_purchase' 
  AND INDEX_NAME = 'idx_mpu_tenant_delete_arrival_date';

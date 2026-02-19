-- 修复面料采购表中的大写状态值
-- 问题：样衣采购单创建时使用了大写的 "PENDING"，导致前端无法识别
-- 修复：将所有大写状态值转换为小写

USE fashion_supplychain;

-- 备份当前数据（可选）
-- CREATE TABLE material_purchase_backup_20260204 AS SELECT * FROM material_purchase;

-- 更新状态值：大写 -> 小写
UPDATE material_purchase
SET status = LOWER(status)
WHERE status IN ('PENDING', 'RECEIVED', 'PARTIAL', 'COMPLETED', 'CANCELLED')
AND status != LOWER(status);

-- 验证修复结果
SELECT
    status,
    COUNT(*) as count,
    GROUP_CONCAT(DISTINCT source_type) as source_types
FROM material_purchase
GROUP BY status
ORDER BY status;

-- 检查是否还有未识别的状态值
SELECT DISTINCT status
FROM material_purchase
WHERE status NOT IN ('pending', 'received', 'partial', 'completed', 'cancelled', '')
ORDER BY status;

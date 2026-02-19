-- ================================================================
-- 面辅料库存表 - 添加面料属性字段
-- 创建时间：2026-02-05
-- 说明：为面料物料添加幅宽、克重、成分三个属性字段
-- ================================================================

USE fashion_supplychain;

-- 添加面料属性字段
ALTER TABLE t_material_stock
ADD COLUMN fabric_width VARCHAR(50) COMMENT '面料幅宽（如：150cm）' AFTER supplier_name,
ADD COLUMN fabric_weight VARCHAR(50) COMMENT '面料克重（如：200g/m²）' AFTER fabric_width,
ADD COLUMN fabric_composition VARCHAR(200) COMMENT '面料成分（如：100%棉）' AFTER fabric_weight;

-- 验证字段是否添加成功
SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_material_stock'
  AND COLUMN_NAME IN ('fabric_width', 'fabric_weight', 'fabric_composition')
ORDER BY ORDINAL_POSITION;

-- 查看表结构
DESC t_material_stock;

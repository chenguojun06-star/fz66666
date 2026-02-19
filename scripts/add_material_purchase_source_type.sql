-- 添加采购来源类型字段，区分样衣采购和生产订单采购
-- 执行时间：2026-01-28

-- 1. 添加 source_type 字段
ALTER TABLE t_material_purchase
ADD COLUMN source_type VARCHAR(20) DEFAULT 'order' COMMENT '采购来源类型: order=生产订单, sample=样衣开发';

-- 2. 添加 pattern_production_id 字段（样衣生产ID，样衣采购时使用）
ALTER TABLE t_material_purchase
ADD COLUMN pattern_production_id VARCHAR(36) NULL COMMENT '样衣生产ID（样衣采购时关联）';

-- 3. 为现有数据设置默认值（都是生产订单采购）
UPDATE t_material_purchase SET source_type = 'order' WHERE source_type IS NULL;

-- 4. 添加索引
CREATE INDEX idx_material_purchase_source_type ON t_material_purchase(source_type);

-- 验证
SELECT source_type, COUNT(*) as count FROM t_material_purchase GROUP BY source_type;

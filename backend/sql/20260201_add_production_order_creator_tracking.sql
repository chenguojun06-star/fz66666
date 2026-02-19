-- 生产订单添加创建人追踪字段
-- 创建时间: 2026-02-01
-- 目的: 修复生产订单无法追踪创建人的安全问题

-- 添加创建人字段
ALTER TABLE t_production_order
ADD COLUMN created_by_id VARCHAR(50) COMMENT '创建人ID',
ADD COLUMN created_by_name VARCHAR(100) COMMENT '创建人姓名';

-- 添加索引以提高查询性能
ALTER TABLE t_production_order
ADD INDEX idx_created_by (created_by_id);

-- 为现有数据设置默认创建人（系统迁移）
UPDATE t_production_order
SET created_by_id = 'system_migration',
    created_by_name = '系统迁移'
WHERE created_by_id IS NULL;

-- 验证迁移
SELECT
    COUNT(*) as total_orders,
    COUNT(DISTINCT created_by_id) as unique_creators,
    COUNT(CASE WHEN created_by_id IS NULL THEN 1 END) as null_creators
FROM t_production_order;

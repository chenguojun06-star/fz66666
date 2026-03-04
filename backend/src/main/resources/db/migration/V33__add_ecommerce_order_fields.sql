-- 为电商订单表补充关联字段（本地 Flyway 自动执行；云端需手动执行）
ALTER TABLE t_ecommerce_order
    ADD COLUMN IF NOT EXISTS tenant_id BIGINT COMMENT '租户ID',
    ADD COLUMN IF NOT EXISTS production_order_id VARCHAR(64) COMMENT '关联生产订单ID',
    ADD COLUMN IF NOT EXISTS production_order_no VARCHAR(100) COMMENT '关联生产订单号',
    ADD COLUMN IF NOT EXISTS source_platform_code VARCHAR(20) COMMENT '来源平台代码(与AppStore code一致)',
    ADD COLUMN IF NOT EXISTS sku_code VARCHAR(100) COMMENT '下单SKU编码',
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(200) COMMENT '商品名称',
    ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 1 COMMENT '购买件数',
    ADD COLUMN IF NOT EXISTS warehouse_status TINYINT DEFAULT 0 COMMENT '仓库状态: 0-待拣货, 1-备货中, 2-已出库';

-- 索引
ALTER TABLE t_ecommerce_order
    ADD INDEX IF NOT EXISTS idx_tenant_id (tenant_id),
    ADD INDEX IF NOT EXISTS idx_production_order_id (production_order_id),
    ADD INDEX IF NOT EXISTS idx_source_platform (source_platform_code);

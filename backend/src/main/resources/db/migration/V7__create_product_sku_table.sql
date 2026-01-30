CREATE TABLE t_product_sku (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    sku_code VARCHAR(64) NOT NULL COMMENT 'SKU编码 (规则: 款号-颜色-尺码)',
    style_id BIGINT NOT NULL COMMENT '关联款号ID',
    style_no VARCHAR(64) NOT NULL COMMENT '款号',
    color VARCHAR(32) NOT NULL COMMENT '颜色',
    size VARCHAR(32) NOT NULL COMMENT '尺码',
    barcode VARCHAR(64) COMMENT '条形码/69码',
    external_sku_id VARCHAR(128) COMMENT '外部电商平台SKU ID',
    external_platform VARCHAR(32) COMMENT '外部平台标识 (如: taobao, shopify)',
    cost_price DECIMAL(10, 2) COMMENT '成本价',
    sales_price DECIMAL(10, 2) COMMENT '销售价',
    status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态: ENABLED-启用, DISABLED-禁用',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    UNIQUE KEY uk_sku_code (sku_code),
    UNIQUE KEY uk_style_color_size (style_id, color, size),
    INDEX idx_external_sku (external_sku_id),
    INDEX idx_style_no (style_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品SKU主表 (电商对接核心)';

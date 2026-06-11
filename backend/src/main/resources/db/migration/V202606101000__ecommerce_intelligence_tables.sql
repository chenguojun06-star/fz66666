-- ============================================================
-- 电商智能模块：5张核心表
-- 跨平台库存统一池 / 仓库分配 / 订单拆分 / 库存预警 / 采购建议
-- ============================================================

-- 1. 跨平台库存统一池
CREATE TABLE IF NOT EXISTS t_ec_universal_stock (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    style_id BIGINT NOT NULL,
    sku_id BIGINT NOT NULL,
    warehouse VARCHAR(128),
    total_warehoused INT DEFAULT 0,
    total_outstock INT DEFAULT 0,
    pending_orders INT DEFAULT 0,
    available_stock INT DEFAULT 0,
    safe_stock INT DEFAULT 0,
    buffer_stock INT DEFAULT 5,
    on_way_production INT DEFAULT 0,
    last_sync_time DATETIME,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant_style(tenant_id, style_id),
    INDEX idx_tenant_sku(tenant_id, sku_id),
    UNIQUE INDEX uk_tenant_sku_wh(tenant_id, sku_id, warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 仓库分配记录
CREATE TABLE IF NOT EXISTS t_ec_warehouse_allocation (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    order_id BIGINT NOT NULL,
    order_no VARCHAR(50),
    sku_code VARCHAR(100),
    warehouse VARCHAR(128) NOT NULL,
    allocated_quantity INT NOT NULL,
    allocation_type VARCHAR(20) DEFAULT 'AUTO',
    priority INT DEFAULT 0,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_order(tenant_id, order_id),
    INDEX idx_tenant_wh(tenant_id, warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 订单拆分记录
CREATE TABLE IF NOT EXISTS t_ec_order_split (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    original_order_id BIGINT NOT NULL,
    original_order_no VARCHAR(50),
    split_order_no VARCHAR(50),
    sku_code VARCHAR(100),
    warehouse VARCHAR(128),
    split_quantity INT NOT NULL,
    split_reason VARCHAR(100),
    status INT DEFAULT 0,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant_original(tenant_id, original_order_id),
    INDEX idx_tenant_split(tenant_id, split_order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. 库存预警
CREATE TABLE IF NOT EXISTS t_ec_stock_alert (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    style_id BIGINT NOT NULL,
    sku_id BIGINT,
    sku_code VARCHAR(100),
    warehouse VARCHAR(128),
    alert_type VARCHAR(20) NOT NULL,
    current_stock INT,
    safe_stock INT,
    message TEXT,
    is_resolved TINYINT(1) DEFAULT 0,
    resolved_time DATETIME,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_type(tenant_id, alert_type),
    INDEX idx_tenant_unresolved(tenant_id, is_resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 采购建议
CREATE TABLE IF NOT EXISTS t_ec_purchase_suggestion (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    style_id BIGINT NOT NULL,
    sku_id BIGINT,
    sku_code VARCHAR(100),
    style_no VARCHAR(50),
    suggest_quantity INT NOT NULL,
    urgency_level VARCHAR(20) DEFAULT 'MEDIUM',
    reason TEXT,
    sales_30d INT DEFAULT 0,
    available_stock INT DEFAULT 0,
    on_way_stock INT DEFAULT 0,
    on_way_production INT DEFAULT 0,
    target_days INT DEFAULT 30,
    status INT DEFAULT 0,
    purchase_order_id BIGINT,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant_status(tenant_id, status),
    INDEX idx_tenant_style(tenant_id, style_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

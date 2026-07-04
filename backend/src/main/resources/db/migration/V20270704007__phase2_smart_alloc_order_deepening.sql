-- ============================================================
-- Phase 2: 智能分仓增强 + 订单深加工
-- 1. t_ec_warehouse_allocation 加 score/reason/estimated_days（多维度评分透明化）
-- 2. t_ec_order_split 加 split_type（拆单策略类型）
-- 3. t_ecommerce_order 加 is_presale（预售订单标记）
-- 4. 新建 t_ec_gift_rule（赠品规则表）
-- 幂等：使用 INFORMATION_SCHEMA + PREPARE/EXECUTE
-- ============================================================

-- ---------- 1. t_ec_warehouse_allocation 加字段 ----------
DROP PROCEDURE IF EXISTS p_add_alloc_cols;
CREATE PROCEDURE p_add_alloc_cols()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ec_warehouse_allocation'
                     AND COLUMN_NAME = 'score') THEN
        ALTER TABLE t_ec_warehouse_allocation
            ADD COLUMN score DECIMAL(6,2) DEFAULT NULL COMMENT '分配综合得分0-100（库存40+时效30+成本20+退货率10）';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ec_warehouse_allocation'
                     AND COLUMN_NAME = 'reason') THEN
        ALTER TABLE t_ec_warehouse_allocation
            ADD COLUMN reason VARCHAR(512) DEFAULT NULL COMMENT '分配原因（透明化决策依据）';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ec_warehouse_allocation'
                     AND COLUMN_NAME = 'estimated_days') THEN
        ALTER TABLE t_ec_warehouse_allocation
            ADD COLUMN estimated_days INT DEFAULT NULL COMMENT '预估到货时效（天）';
    END IF;
END;
CALL p_add_alloc_cols();
DROP PROCEDURE IF EXISTS p_add_alloc_cols;

-- ---------- 2. t_ec_order_split 加 split_type ----------
DROP PROCEDURE IF EXISTS p_add_split_type;
CREATE PROCEDURE p_add_split_type()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ec_order_split'
                     AND COLUMN_NAME = 'split_type') THEN
        ALTER TABLE t_ec_order_split
            ADD COLUMN split_type VARCHAR(32) DEFAULT 'PARTIAL_STOCK' COMMENT '拆单类型：PARTIAL_STOCK缺货/BY_WAREHOUSE按仓/BY_SKU按SKU/PRESALE预售/ADDRESS按地址';
    END IF;
END;
CALL p_add_split_type();
DROP PROCEDURE IF EXISTS p_add_split_type;

-- ---------- 3. t_ecommerce_order 加 is_presale ----------
DROP PROCEDURE IF EXISTS p_add_presale;
CREATE PROCEDURE p_add_presale()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ecommerce_order'
                     AND COLUMN_NAME = 'is_presale') THEN
        ALTER TABLE t_ecommerce_order
            ADD COLUMN is_presale TINYINT DEFAULT 0 COMMENT '是否预售订单：0否1是';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_ecommerce_order'
                     AND COLUMN_NAME = 'presale_remark') THEN
        ALTER TABLE t_ecommerce_order
            ADD COLUMN presale_remark VARCHAR(255) DEFAULT NULL COMMENT '预售说明（到货时间等）';
    END IF;
END;
CALL p_add_presale();
DROP PROCEDURE IF EXISTS p_add_presale;

-- ---------- 4. 新建 t_ec_gift_rule 赠品规则表 ----------
CREATE TABLE IF NOT EXISTS t_ec_gift_rule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）',
    rule_name VARCHAR(128) NOT NULL COMMENT '规则名称',
    gift_sku_code VARCHAR(64) NOT NULL COMMENT '赠品SKU编码',
    gift_quantity INT NOT NULL DEFAULT 1 COMMENT '赠品数量',
    trigger_type VARCHAR(32) NOT NULL COMMENT '触发类型：AMOUNT按金额/QUANTITY按数量/PLATFORM按平台',
    trigger_value DECIMAL(10,2) DEFAULT NULL COMMENT '触发阈值（金额或数量）',
    trigger_platform VARCHAR(32) DEFAULT NULL COMMENT '触发平台（trigger_type=PLATFORM时）',
    start_time DATETIME DEFAULT NULL COMMENT '生效开始时间',
    end_time DATETIME DEFAULT NULL COMMENT '生效结束时间',
    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用：0否1是',
    delete_flag TINYINT NOT NULL DEFAULT 0,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_rule (tenant_id, rule_name),
    KEY idx_tenant_enabled (tenant_id, enabled, delete_flag)
) COMMENT='电商赠品规则（Phase 2 订单深加工）';

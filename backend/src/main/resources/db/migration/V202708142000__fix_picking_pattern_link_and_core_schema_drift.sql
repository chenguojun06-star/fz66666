-- =====================================================================
-- 全量 schema drift 修复：entity 有字段但云端库缺列导致 500
-- 触发案例：仓库端 GET /production/picking/list 500
--   根因：MaterialPicking.patternProductionId（提交 43192e735 引入）
--         未配套迁移，云端 t_material_picking 缺 pattern_production_id，
--         MyBatis-Plus SELECT 全列 → Unknown column → 500
-- 修复范围：本次根因 + 全库 drift 扫描出的核心业务链路同类缺列
-- 安全规则（D-060 教训）：
--   1. MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS → 存储过程 + information_schema
--   2. 表存在 + 列不存在 双判断：表不存在时静默跳过（功能未启用不炸部署）
--   3. 列类型与 entity java 类型一一对应
-- =====================================================================

DROP PROCEDURE IF EXISTS _fix_core_schema_drift;
DELIMITER //
CREATE PROCEDURE _fix_core_schema_drift()
BEGIN
    DECLARE db VARCHAR(64) DEFAULT DATABASE();

    -- ========== 1. t_material_picking.pattern_production_id（本次500根因） ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_picking')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='pattern_production_id') THEN
        ALTER TABLE t_material_picking ADD COLUMN pattern_production_id VARCHAR(64) DEFAULT NULL COMMENT '样衣领料关联的样衣任务ID（手机端样衣采购闭环）';
    END IF;

    -- ========== 2. t_material_pickup_record 费用归属/结算 ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_pickup_record')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='cost_owner') THEN
        ALTER TABLE t_material_pickup_record ADD COLUMN cost_owner VARCHAR(64) DEFAULT NULL COMMENT '费用归属';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_pickup_record')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='cost_settled') THEN
        ALTER TABLE t_material_pickup_record ADD COLUMN cost_settled INT DEFAULT 0 COMMENT '费用是否已结算：0=未结算，1=已结算';
    END IF;

    -- ========== 3. t_material_inbound 供应商联系人（入库+打印链路） ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_inbound')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='supplier_id') THEN
        ALTER TABLE t_material_inbound ADD COLUMN supplier_id VARCHAR(64) DEFAULT NULL COMMENT '供应商ID（关联 t_factory.id）';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_inbound')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='supplier_contact_person') THEN
        ALTER TABLE t_material_inbound ADD COLUMN supplier_contact_person VARCHAR(64) DEFAULT NULL COMMENT '供应商联系人';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_inbound')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_material_inbound' AND COLUMN_NAME='supplier_contact_phone') THEN
        ALTER TABLE t_material_inbound ADD COLUMN supplier_contact_phone VARCHAR(32) DEFAULT NULL COMMENT '供应商联系电话';
    END IF;

    -- ========== 4. t_expense_reimbursement 供应商三件套 ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_expense_reimbursement')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_expense_reimbursement' AND COLUMN_NAME='supplier_id') THEN
        ALTER TABLE t_expense_reimbursement ADD COLUMN supplier_id VARCHAR(64) DEFAULT NULL COMMENT '供应商ID';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_expense_reimbursement')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_expense_reimbursement' AND COLUMN_NAME='supplier_contact_person') THEN
        ALTER TABLE t_expense_reimbursement ADD COLUMN supplier_contact_person VARCHAR(64) DEFAULT NULL COMMENT '供应商联系人';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_expense_reimbursement')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_expense_reimbursement' AND COLUMN_NAME='supplier_contact_phone') THEN
        ALTER TABLE t_expense_reimbursement ADD COLUMN supplier_contact_phone VARCHAR(32) DEFAULT NULL COMMENT '供应商联系电话';
    END IF;

    -- ========== 5. t_product_warehousing 成品入库（扫码 P0 链路）9列 ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='cutting_quantity') THEN
        ALTER TABLE t_product_warehousing ADD COLUMN cutting_quantity INT DEFAULT NULL COMMENT '裁剪数量';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='factory_name') THEN
        ALTER TABLE t_product_warehousing ADD COLUMN factory_name VARCHAR(128) DEFAULT NULL COMMENT '工厂名称（冗余）';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='factory_type') THEN
        ALTER TABLE t_product_warehousing ADD COLUMN factory_type VARCHAR(32) DEFAULT NULL COMMENT '工厂类型';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='order_biz_type') THEN
        ALTER TABLE t_product_warehousing ADD COLUMN order_biz_type VARCHAR(32) DEFAULT NULL COMMENT '订单业务类型';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='org_unit_id') THEN
        ALTER TABLE t_product_warehousing ADD COLUMN org_unit_id VARCHAR(64) DEFAULT NULL COMMENT '组织单元ID';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='parent_org_unit_id') THEN
        ALTER TABLE t_product_warehousing ADD COLUMN parent_org_unit_id VARCHAR(64) DEFAULT NULL COMMENT '父级组织单元ID';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='parent_org_unit_name') THEN
        ALTER TABLE t_product_warehousing ADD COLUMN parent_org_unit_name VARCHAR(128) DEFAULT NULL COMMENT '父级组织单元名称';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='org_path') THEN
        ALTER TABLE t_product_warehousing ADD COLUMN org_path VARCHAR(255) DEFAULT NULL COMMENT '组织路径';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='scan_code') THEN
        ALTER TABLE t_product_warehousing ADD COLUMN scan_code VARCHAR(128) DEFAULT NULL COMMENT '扫码码内容';
    END IF;

    -- ========== 6. t_production_process_tracking 工序结算 5列 ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking' AND COLUMN_NAME='settled_at') THEN
        ALTER TABLE t_production_process_tracking ADD COLUMN settled_at DATETIME DEFAULT NULL COMMENT '结算时间';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking' AND COLUMN_NAME='settled_batch_no') THEN
        ALTER TABLE t_production_process_tracking ADD COLUMN settled_batch_no VARCHAR(64) DEFAULT NULL COMMENT '结算批次号';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking' AND COLUMN_NAME='settled_by') THEN
        ALTER TABLE t_production_process_tracking ADD COLUMN settled_by VARCHAR(64) DEFAULT NULL COMMENT '结算人';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking' AND COLUMN_NAME='created_at') THEN
        ALTER TABLE t_production_process_tracking ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_production_process_tracking' AND COLUMN_NAME='updated_at') THEN
        ALTER TABLE t_production_process_tracking ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';
    END IF;

    -- ========== 7. t_color_card 色卡 7列 ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card' AND COLUMN_NAME='specifications') THEN
        ALTER TABLE t_color_card ADD COLUMN specifications VARCHAR(255) DEFAULT NULL COMMENT '规格';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card' AND COLUMN_NAME='unit') THEN
        ALTER TABLE t_color_card ADD COLUMN unit VARCHAR(20) DEFAULT NULL COMMENT '单位';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card' AND COLUMN_NAME='supplier_contact_person') THEN
        ALTER TABLE t_color_card ADD COLUMN supplier_contact_person VARCHAR(64) DEFAULT NULL COMMENT '供应商联系人';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card' AND COLUMN_NAME='supplier_contact_phone') THEN
        ALTER TABLE t_color_card ADD COLUMN supplier_contact_phone VARCHAR(32) DEFAULT NULL COMMENT '供应商联系电话';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card' AND COLUMN_NAME='image') THEN
        ALTER TABLE t_color_card ADD COLUMN image VARCHAR(500) DEFAULT NULL COMMENT '色卡图片';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card' AND COLUMN_NAME='status') THEN
        ALTER TABLE t_color_card ADD COLUMN status VARCHAR(20) DEFAULT NULL COMMENT '状态';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card' AND COLUMN_NAME='color_count') THEN
        ALTER TABLE t_color_card ADD COLUMN color_count INT DEFAULT NULL COMMENT '颜色数量';
    END IF;

    -- ========== 8. t_color_card_item 2列 ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card_item')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card_item' AND COLUMN_NAME='image') THEN
        ALTER TABLE t_color_card_item ADD COLUMN image VARCHAR(500) DEFAULT NULL COMMENT '颜色图片';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card_item')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_color_card_item' AND COLUMN_NAME='sort_order') THEN
        ALTER TABLE t_color_card_item ADD COLUMN sort_order INT DEFAULT 0 COMMENT '排序';
    END IF;

    -- ========== 9. order_transfer 转单 3列 ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='order_transfer')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='order_transfer' AND COLUMN_NAME='transfer_type') THEN
        ALTER TABLE order_transfer ADD COLUMN transfer_type VARCHAR(20) DEFAULT NULL COMMENT '转单类型';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='order_transfer')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='order_transfer' AND COLUMN_NAME='to_factory_id') THEN
        ALTER TABLE order_transfer ADD COLUMN to_factory_id VARCHAR(64) DEFAULT NULL COMMENT '转入工厂ID';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='order_transfer')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='order_transfer' AND COLUMN_NAME='to_factory_name') THEN
        ALTER TABLE order_transfer ADD COLUMN to_factory_name VARCHAR(128) DEFAULT NULL COMMENT '转入工厂名称';
    END IF;

    -- ========== 10. 租户隔离 P0：t_express_order / t_unit_price_audit_log 补 tenant_id ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_express_order')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_express_order' AND COLUMN_NAME='tenant_id') THEN
        ALTER TABLE t_express_order ADD COLUMN tenant_id BIGINT DEFAULT NULL COMMENT '租户ID';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_express_order')
       AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_express_order' AND INDEX_NAME='idx_express_order_tenant') THEN
        ALTER TABLE t_express_order ADD INDEX idx_express_order_tenant (tenant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_unit_price_audit_log')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_unit_price_audit_log' AND COLUMN_NAME='tenant_id') THEN
        ALTER TABLE t_unit_price_audit_log ADD COLUMN tenant_id BIGINT DEFAULT NULL COMMENT '租户ID';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_unit_price_audit_log')
       AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_unit_price_audit_log' AND INDEX_NAME='idx_upal_tenant') THEN
        ALTER TABLE t_unit_price_audit_log ADD INDEX idx_upal_tenant (tenant_id);
    END IF;

    -- ========== 11. t_ec_purchase_suggestion ==========
    IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_ec_purchase_suggestion')
       AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=db AND TABLE_NAME='t_ec_purchase_suggestion' AND COLUMN_NAME='sales30d') THEN
        ALTER TABLE t_ec_purchase_suggestion ADD COLUMN sales30d INT DEFAULT NULL COMMENT '近30天销量';
    END IF;
END //
DELIMITER ;

CALL _fix_core_schema_drift();
DROP PROCEDURE IF EXISTS _fix_core_schema_drift;

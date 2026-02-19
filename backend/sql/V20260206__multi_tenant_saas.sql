-- =====================================================================
-- 多租户SaaS架构 - 数据库迁移脚本
-- 执行时间：2026-02-06
-- 说明：为所有业务表添加 tenant_id 字段，创建租户表，迁移现有数据
-- 兼容：MySQL 8.0（不使用 IF NOT EXISTS for ADD COLUMN）
-- =====================================================================

-- 1. 创建租户表
CREATE TABLE IF NOT EXISTS t_tenant (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '租户ID',
    tenant_name VARCHAR(100) NOT NULL COMMENT '租户名称（公司/工厂名）',
    tenant_code VARCHAR(50) NOT NULL COMMENT '租户编码（唯一标识）',
    owner_user_id BIGINT DEFAULT NULL COMMENT '租户主账号用户ID',
    contact_name VARCHAR(50) DEFAULT NULL COMMENT '联系人',
    contact_phone VARCHAR(20) DEFAULT NULL COMMENT '联系电话',
    status VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled/expired',
    max_users INT DEFAULT 50 COMMENT '最大用户数限制（0=不限制）',
    expire_time DATETIME DEFAULT NULL COMMENT '过期时间（null=永不过期）',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_tenant_code (tenant_code),
    KEY idx_status (status),
    KEY idx_owner_user_id (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户表';

-- 2. 创建安全添加列的存储过程（MySQL 8.0 兼容）
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
DELIMITER $$
CREATE PROCEDURE add_column_if_not_exists(
    IN p_table VARCHAR(128),
    IN p_column VARCHAR(128),
    IN p_definition VARCHAR(512)
)
BEGIN
    SET @col_exists = 0;
    SELECT COUNT(*) INTO @col_exists
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column;

    IF @col_exists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

-- 安全添加索引的存储过程
DROP PROCEDURE IF EXISTS add_index_if_not_exists;
DELIMITER $$
CREATE PROCEDURE add_index_if_not_exists(
    IN p_table VARCHAR(128),
    IN p_index VARCHAR(128),
    IN p_column VARCHAR(128)
)
BEGIN
    SET @idx_exists = 0;
    SELECT COUNT(*) INTO @idx_exists
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index;

    IF @idx_exists = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_index, '` (`', p_column, '`)');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

-- 3. 为 t_user 添加租户字段
CALL add_column_if_not_exists('t_user', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''所属租户ID''');
CALL add_column_if_not_exists('t_user', 'is_tenant_owner', 'TINYINT(1) DEFAULT 0 COMMENT ''是否为租户主账号''');
CALL add_index_if_not_exists('t_user', 'idx_user_tenant_id', 'tenant_id');

-- 4. 为所有业务表添加 tenant_id 字段 + 索引
-- 生产模块
CALL add_column_if_not_exists('t_production_order', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_production_order', 'idx_po_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_production_process_tracking', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_production_process_tracking', 'idx_ppt_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_cutting_task', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_cutting_task', 'idx_ct_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_cutting_bundle', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_cutting_bundle', 'idx_cb_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_scan_record', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_scan_record', 'idx_sr_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_secondary_process', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_secondary_process', 'idx_sp_tenant_id', 'tenant_id');

-- 款式模块
CALL add_column_if_not_exists('t_style_info', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_style_info', 'idx_si_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_style_bom', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_style_bom', 'idx_sb_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_style_process', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_style_process', 'idx_spr_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_style_attachment', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_style_attachment', 'idx_sa_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_style_size', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_style_size', 'idx_ss_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_style_size_price', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_style_size_price', 'idx_ssp_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_style_quotation', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_style_quotation', 'idx_sq_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_style_operation_log', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_style_operation_log', 'idx_sol_tenant_id', 'tenant_id');

-- 面辅料/仓库模块
CALL add_column_if_not_exists('t_material_database', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_material_database', 'idx_md_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_material_stock', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_material_stock', 'idx_ms_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_material_inbound', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_material_inbound', 'idx_mi_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_material_inbound_sequence', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_material_inbound_sequence', 'idx_mis_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_material_picking', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_material_picking', 'idx_mp_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_material_picking_item', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_material_picking_item', 'idx_mpi_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_material_purchase', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_material_purchase', 'idx_mpu_tenant_id', 'tenant_id');

-- 成品模块
CALL add_column_if_not_exists('t_product_sku', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_product_sku', 'idx_ps_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_product_warehousing', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_product_warehousing', 'idx_pw_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_product_outstock', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_product_outstock', 'idx_pos_tenant_id', 'tenant_id');

-- 样衣模块
CALL add_column_if_not_exists('t_sample_stock', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_sample_stock', 'idx_sst_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_sample_loan', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_sample_loan', 'idx_sl_tenant_id', 'tenant_id');

-- 财务模块
CALL add_column_if_not_exists('t_material_reconciliation', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_material_reconciliation', 'idx_mr_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_order_reconciliation_approval', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_order_reconciliation_approval', 'idx_ora_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_shipment_reconciliation', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_shipment_reconciliation', 'idx_shr_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_payroll_settlement', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_payroll_settlement', 'idx_pse_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_payroll_settlement_item', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_payroll_settlement_item', 'idx_psi_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_deduction_item', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_deduction_item', 'idx_di_tenant_id', 'tenant_id');

-- 工厂/基础数据
CALL add_column_if_not_exists('t_factory', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_factory', 'idx_f_tenant_id', 'tenant_id');

-- 版型模块
CALL add_column_if_not_exists('t_pattern_production', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_pattern_production', 'idx_pp_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_pattern_revision', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_pattern_revision', 'idx_pr_tenant_id', 'tenant_id');

-- 模板库
CALL add_column_if_not_exists('t_template_library', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_template_library', 'idx_tl_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_template_operation_log', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_template_operation_log', 'idx_tol_tenant_id', 'tenant_id');

-- 操作日志
CALL add_column_if_not_exists('t_operation_log', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_operation_log', 'idx_ol_tenant_id', 'tenant_id');

CALL add_column_if_not_exists('t_system_operation_log', 'tenant_id', 'BIGINT DEFAULT NULL COMMENT ''租户ID''');
CALL add_index_if_not_exists('t_system_operation_log', 'idx_syol_tenant_id', 'tenant_id');

-- =====================================================================
-- 5. 迁移现有数据：创建默认租户
-- =====================================================================

-- 创建默认租户（系统初始租户）
INSERT INTO t_tenant (id, tenant_name, tenant_code, status, max_users, remark, create_time, update_time)
SELECT 1, '默认租户', 'DEFAULT', 'active', 0, '系统初始化默认租户，超级管理员所属', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM t_tenant WHERE id = 1);

-- 注意：超级管理员（admin）的 tenant_id 保持 NULL，表示超级管理员不受租户限制
-- 其他已有用户归属到默认租户
-- UPDATE t_user SET tenant_id = 1 WHERE username != 'admin' AND tenant_id IS NULL;

-- =====================================================================
-- 6. 清理临时存储过程
-- =====================================================================
DROP PROCEDURE IF EXISTS add_column_if_not_exists;
DROP PROCEDURE IF EXISTS add_index_if_not_exists;

-- =====================================================================
-- 7. 验证
-- =====================================================================
SELECT 'Migration completed successfully' AS status;
SELECT COUNT(*) AS tenant_count FROM t_tenant;
SELECT
    TABLE_NAME,
    COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND COLUMN_NAME = 'tenant_id'
ORDER BY TABLE_NAME;

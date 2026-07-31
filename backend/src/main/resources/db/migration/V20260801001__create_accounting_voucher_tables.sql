-- V20260801001: 会计科目映射层 — 科目表/账单映射表/凭证表/分录表
--
-- 背景：
--   从账单（BillAggregation）自动生成会计凭证，实现财务数据链路闭环（D-022）。
--   1. t_account_subject       会计科目表（CAS 中国会计准则基础科目）
--   2. t_bill_subject_mapping   账单分类→会计科目映射（9类billCategory默认规则）
--   3. t_accounting_voucher     会计凭证头（借贷平衡）
--   4. t_accounting_entry       会计分录行
--
-- 多租户隔离（P0 铁律 4）：所有表含 tenant_id，所有查询带 tenant_id WHERE
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 检查表是否存在；
--   动态 SQL 内禁止字符串字面量 COMMENT，用独立 ALTER TABLE 回填注释
-- 事务边界（P0 铁律 2）：Orchestrator 层加 @Transactional，Service 层无事务

-- =============================================
-- 1. 创建 t_account_subject 会计科目表
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_account_subject');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_account_subject (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        subject_code VARCHAR(32) NOT NULL,
        subject_name VARCHAR(64) NOT NULL,
        subject_type VARCHAR(16) NOT NULL,
        balance_direction VARCHAR(4) NOT NULL,
        parent_code VARCHAR(32) NULL DEFAULT NULL,
        is_leaf TINYINT(1) NOT NULL DEFAULT 1,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_tenant_code (tenant_id, subject_code),
        KEY idx_subject_type (tenant_id, subject_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

ALTER TABLE t_account_subject COMMENT '会计科目表（CAS基础科目）';
ALTER TABLE t_account_subject MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_account_subject MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）';
ALTER TABLE t_account_subject MODIFY COLUMN subject_code VARCHAR(32) NOT NULL COMMENT '科目编码（如1001、2202、6001）';
ALTER TABLE t_account_subject MODIFY COLUMN subject_name VARCHAR(64) NOT NULL COMMENT '科目名称';
ALTER TABLE t_account_subject MODIFY COLUMN subject_type VARCHAR(16) NOT NULL COMMENT 'ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE';
ALTER TABLE t_account_subject MODIFY COLUMN balance_direction VARCHAR(4) NOT NULL COMMENT 'DEBIT/CREDIT';
ALTER TABLE t_account_subject MODIFY COLUMN parent_code VARCHAR(32) NULL DEFAULT NULL COMMENT '父科目编码';
ALTER TABLE t_account_subject MODIFY COLUMN is_leaf TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否末级科目：0=否 1=是';
ALTER TABLE t_account_subject MODIFY COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：0=禁用 1=启用';
ALTER TABLE t_account_subject MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';

-- =============================================
-- 2. 创建 t_bill_subject_mapping 账单分类→会计科目映射表
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_bill_subject_mapping');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_bill_subject_mapping (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        bill_type VARCHAR(16) NOT NULL,
        bill_category VARCHAR(32) NOT NULL,
        source_type VARCHAR(64) NULL DEFAULT NULL,
        debit_subject_code VARCHAR(32) NOT NULL,
        credit_subject_code VARCHAR(32) NOT NULL,
        accounting_standard VARCHAR(16) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_tenant_mapping (tenant_id, bill_type, bill_category, source_type, accounting_standard),
        KEY idx_bill_category (tenant_id, bill_category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

ALTER TABLE t_bill_subject_mapping COMMENT '账单分类→会计科目映射';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN bill_type VARCHAR(16) NOT NULL COMMENT 'PAYABLE=应付/RECEIVABLE=应收';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN bill_category VARCHAR(32) NOT NULL COMMENT 'MATERIAL/PRODUCT/EXTERNAL_FACTORY/PAYROLL/EXPENSE/SHIPMENT/DEDUCTION/INVENTORY_PROFIT/INVENTORY_LOSS';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN source_type VARCHAR(64) NULL DEFAULT NULL COMMENT '可选：特定来源类型';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN debit_subject_code VARCHAR(32) NOT NULL COMMENT '借方科目编码';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN credit_subject_code VARCHAR(32) NOT NULL COMMENT '贷方科目编码';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN accounting_standard VARCHAR(16) NOT NULL DEFAULT 'CAS' COMMENT 'CAS=中国会计准则/ASC606=国际收入准则';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：0=禁用 1=启用';
ALTER TABLE t_bill_subject_mapping MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';

-- =============================================
-- 3. 创建 t_accounting_voucher 会计凭证头表
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_accounting_voucher');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_accounting_voucher (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        voucher_no VARCHAR(32) NOT NULL,
        voucher_date DATE NOT NULL,
        bill_aggregation_id VARCHAR(64) NULL DEFAULT NULL,
        source_type VARCHAR(64) NULL DEFAULT NULL,
        source_id VARCHAR(64) NULL DEFAULT NULL,
        summary VARCHAR(256) NULL DEFAULT NULL,
        total_amount DECIMAL(14,2) NOT NULL,
        voucher_type VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL,
        reverse_voucher_id BIGINT NULL DEFAULT NULL,
        accounting_standard VARCHAR(16) NOT NULL,
        create_by VARCHAR(64) NULL DEFAULT NULL,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        UNIQUE KEY uk_tenant_voucher_no (tenant_id, voucher_no),
        KEY idx_bill (tenant_id, bill_aggregation_id),
        KEY idx_source (tenant_id, source_type, source_id),
        KEY idx_voucher_date (tenant_id, voucher_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

ALTER TABLE t_accounting_voucher COMMENT '会计凭证头';
ALTER TABLE t_accounting_voucher MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_accounting_voucher MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）';
ALTER TABLE t_accounting_voucher MODIFY COLUMN voucher_no VARCHAR(32) NOT NULL COMMENT '凭证编号';
ALTER TABLE t_accounting_voucher MODIFY COLUMN voucher_date DATE NOT NULL COMMENT '凭证日期';
ALTER TABLE t_accounting_voucher MODIFY COLUMN bill_aggregation_id VARCHAR(64) NULL DEFAULT NULL COMMENT '关联账单ID（BillAggregation.id）';
ALTER TABLE t_accounting_voucher MODIFY COLUMN source_type VARCHAR(64) NULL DEFAULT NULL COMMENT '来源类型';
ALTER TABLE t_accounting_voucher MODIFY COLUMN source_id VARCHAR(64) NULL DEFAULT NULL COMMENT '来源ID';
ALTER TABLE t_accounting_voucher MODIFY COLUMN summary VARCHAR(256) NULL DEFAULT NULL COMMENT '摘要';
ALTER TABLE t_accounting_voucher MODIFY COLUMN total_amount DECIMAL(14,2) NOT NULL COMMENT '合计金额';
ALTER TABLE t_accounting_voucher MODIFY COLUMN voucher_type VARCHAR(16) NOT NULL DEFAULT 'JOURNAL' COMMENT 'JOURNAL=记账/REVERSAL=冲销';
ALTER TABLE t_accounting_voucher MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT=草稿/POSTED=已过账/REVERSED=已冲销';
ALTER TABLE t_accounting_voucher MODIFY COLUMN reverse_voucher_id BIGINT NULL DEFAULT NULL COMMENT '冲销凭证ID';
ALTER TABLE t_accounting_voucher MODIFY COLUMN accounting_standard VARCHAR(16) NOT NULL DEFAULT 'CAS' COMMENT 'CAS/ASC606';
ALTER TABLE t_accounting_voucher MODIFY COLUMN create_by VARCHAR(64) NULL DEFAULT NULL COMMENT '创建人';
ALTER TABLE t_accounting_voucher MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';

-- =============================================
-- 4. 创建 t_accounting_entry 会计分录行表
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_accounting_entry');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_accounting_entry (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        voucher_id BIGINT NOT NULL,
        line_no INT NOT NULL,
        subject_code VARCHAR(32) NOT NULL,
        subject_name VARCHAR(64) NOT NULL,
        debit_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        credit_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        summary VARCHAR(256) NULL DEFAULT NULL,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_voucher (tenant_id, voucher_id),
        KEY idx_subject (tenant_id, subject_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

ALTER TABLE t_accounting_entry COMMENT '会计分录行';
ALTER TABLE t_accounting_entry MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_accounting_entry MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4）';
ALTER TABLE t_accounting_entry MODIFY COLUMN voucher_id BIGINT NOT NULL COMMENT '凭证ID';
ALTER TABLE t_accounting_entry MODIFY COLUMN line_no INT NOT NULL COMMENT '行号';
ALTER TABLE t_accounting_entry MODIFY COLUMN subject_code VARCHAR(32) NOT NULL COMMENT '科目编码';
ALTER TABLE t_accounting_entry MODIFY COLUMN subject_name VARCHAR(64) NOT NULL COMMENT '科目名称（冗余）';
ALTER TABLE t_accounting_entry MODIFY COLUMN debit_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT '借方金额';
ALTER TABLE t_accounting_entry MODIFY COLUMN credit_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT '贷方金额';
ALTER TABLE t_accounting_entry MODIFY COLUMN summary VARCHAR(256) NULL DEFAULT NULL COMMENT '摘要';
ALTER TABLE t_accounting_entry MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';

-- =============================================
-- 5. 初始化会计科目数据（CAS 中国会计准则基础科目，tenant_id=1）
-- =============================================
INSERT IGNORE INTO t_account_subject (tenant_id, subject_code, subject_name, subject_type, balance_direction, is_leaf) VALUES
(1, '1001', '库存现金', 'ASSET', 'DEBIT', 1),
(1, '1002', '银行存款', 'ASSET', 'DEBIT', 1),
(1, '1122', '应收账款', 'ASSET', 'DEBIT', 1),
(1, '1403', '原材料', 'ASSET', 'DEBIT', 1),
(1, '1408', '委托加工物资', 'ASSET', 'DEBIT', 1),
(1, '1901', '待处理财产损溢', 'ASSET', 'DEBIT', 1),
(1, '2202', '应付账款', 'LIABILITY', 'CREDIT', 1),
(1, '2211', '应付职工薪酬', 'LIABILITY', 'CREDIT', 1),
(1, '4001', '实收资本', 'EQUITY', 'CREDIT', 1),
(1, '5001', '生产成本', 'EXPENSE', 'DEBIT', 1),
(1, '6001', '主营业务收入', 'REVENUE', 'CREDIT', 1),
(1, '6051', '其他业务收入', 'REVENUE', 'CREDIT', 1),
(1, '6301', '营业外收入', 'REVENUE', 'CREDIT', 1),
(1, '6401', '主营业务成本', 'EXPENSE', 'DEBIT', 1),
(1, '6601', '销售费用', 'EXPENSE', 'DEBIT', 1),
(1, '6602', '管理费用', 'EXPENSE', 'DEBIT', 1);

-- =============================================
-- 6. 初始化账单分类→会计科目映射（9类billCategory默认规则，tenant_id=1）
--    借贷方向说明：
--    PAYABLE（应付）：借方=费用/资产，贷方=应付账款
--    RECEIVABLE（应收）：借方=应收账款，贷方=收入
-- =============================================
INSERT IGNORE INTO t_bill_subject_mapping (tenant_id, bill_type, bill_category, source_type, debit_subject_code, credit_subject_code, accounting_standard) VALUES
-- 应付类
(1, 'PAYABLE', 'MATERIAL',          NULL, '1403', '2202', 'CAS'),
(1, 'PAYABLE', 'PRODUCT',           NULL, '6401', '2202', 'CAS'),
(1, 'PAYABLE', 'EXTERNAL_FACTORY',  NULL, '1408', '2202', 'CAS'),
(1, 'PAYABLE', 'PAYROLL',           NULL, '5001', '2211', 'CAS'),
(1, 'PAYABLE', 'EXPENSE',           NULL, '6602', '2202', 'CAS'),
(1, 'PAYABLE', 'SHIPMENT',          NULL, '6601', '2202', 'CAS'),
(1, 'PAYABLE', 'DEDUCTION',         NULL, '2202', '6301', 'CAS'),
(1, 'PAYABLE', 'INVENTORY_PROFIT',  NULL, '1403', '1901', 'CAS'),
(1, 'PAYABLE', 'INVENTORY_LOSS',    NULL, '1901', '1403', 'CAS'),
-- 应收类
(1, 'RECEIVABLE', 'PRODUCT',           NULL, '1122', '6001', 'CAS'),
(1, 'RECEIVABLE', 'SHIPMENT',          NULL, '1122', '6001', 'CAS'),
(1, 'RECEIVABLE', 'DEDUCTION',         NULL, '1122', '6301', 'CAS'),
(1, 'RECEIVABLE', 'INVENTORY_PROFIT',  NULL, '1403', '1901', 'CAS'),
(1, 'RECEIVABLE', 'INVENTORY_LOSS',    NULL, '1901', '1403', 'CAS');

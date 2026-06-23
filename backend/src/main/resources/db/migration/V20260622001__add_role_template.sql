-- 角色模板表（幂等创建）
-- 使用存储过程确保只有表不存在时才创建
DROP PROCEDURE IF EXISTS create_role_template_table;
DELIMITER //
CREATE PROCEDURE create_role_template_table()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 't_role_template'
    ) THEN
        CREATE TABLE t_role_template (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            template_code VARCHAR(64) NOT NULL UNIQUE COMMENT '模板编码',
            template_name VARCHAR(128) NOT NULL COMMENT '模板名称',
            template_desc VARCHAR(512) COMMENT '模板描述',
            category VARCHAR(32) DEFAULT 'CUSTOM' COMMENT 'CUSTOM/INDUSTRY/SYSTEM',
            is_default TINYINT DEFAULT 0 COMMENT '是否为默认模板',
            permissions_json TEXT COMMENT '权限码JSON数组',
            permission_range VARCHAR(32) DEFAULT 'team' COMMENT '数据权限范围',
            sort_order INT DEFAULT 0 COMMENT '排序',
            enabled TINYINT DEFAULT 1,
            delete_flag TINYINT DEFAULT 0,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_code (template_code),
            KEY idx_category (category),
            KEY idx_enabled (enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色模板';
    END IF;
END//
DELIMITER ;
CALL create_role_template_table();
DROP PROCEDURE IF EXISTS create_role_template_table;

-- 插入预设角色模板（幂等：只有不存在时才插入）
INSERT INTO t_role_template (template_code, template_name, template_desc, category, is_default, permissions_json, permission_range, sort_order)
SELECT 'admin', '系统管理员', '拥有系统全部权限，可管理所有模块', 'SYSTEM', true,
       '["MENU_DASHBOARD","MENU_STYLE_INFO","MENU_ORDER_MANAGEMENT","MENU_DATA_CENTER","MENU_PRODUCTION_LIST","MENU_MATERIAL_PURCHASE","MENU_MATERIAL_INVENTORY","MENU_MATERIAL_DATABASE","MENU_CUTTING","MENU_PROGRESS","MENU_WAREHOUSING","MENU_FINISHED_SETTLEMENT","MENU_MATERIAL_RECON","MENU_PAYMENT_APPROVAL","MENU_USER","MENU_ROLE","MENU_FACTORY","MENU_SUPPLIER_USERS","MENU_FINISHED_INVENTORY","MENU_INVENTORY_CHECK","MENU_DATA_IMPORT","MENU_LOGIN_LOG","MENU_DICT","MENU_TUTORIAL","MENU_INTELLIGENCE_CENTER"]',
       'all', 1
WHERE NOT EXISTS (SELECT 1 FROM t_role_template WHERE template_code = 'admin');

INSERT INTO t_role_template (template_code, template_name, template_desc, category, is_default, permissions_json, permission_range, sort_order)
SELECT 'merchandiser', '跟单员', '负责订单跟进、物料采购和生产进度跟踪', 'INDUSTRY', true,
       '["MENU_DASHBOARD","MENU_STYLE_INFO","MENU_ORDER_MANAGEMENT","MENU_DATA_CENTER","MENU_PRODUCTION_LIST","MENU_MATERIAL_PURCHASE","MENU_MATERIAL_INVENTORY","MENU_CUTTING","MENU_PROGRESS","MENU_WAREHOUSING","MENU_MATERIAL_RECON"]',
       'team', 2
WHERE NOT EXISTS (SELECT 1 FROM t_role_template WHERE template_code = 'merchandiser');

INSERT INTO t_role_template (template_code, template_name, template_desc, category, is_default, permissions_json, permission_range, sort_order)
SELECT 'warehouse_keeper', '仓库管理员', '负责物料和成品的出入库、库存管理', 'INDUSTRY', true,
       '["MENU_DASHBOARD","MENU_MATERIAL_INVENTORY","MENU_MATERIAL_DATABASE","MENU_MATERIAL_PURCHASE","MENU_FINISHED_INVENTORY","MENU_WAREHOUSING","MENU_INVENTORY_CHECK","MENU_LABEL_PRINT","MENU_PRODUCT_INFO"]',
       'team', 3
WHERE NOT EXISTS (SELECT 1 FROM t_role_template WHERE template_code = 'warehouse_keeper');

INSERT INTO t_role_template (template_code, template_name, template_desc, category, is_default, permissions_json, permission_range, sort_order)
SELECT 'finance', '财务人员', '负责工资结算、收付款和财务对账', 'INDUSTRY', true,
       '["MENU_DASHBOARD","MENU_FINISHED_SETTLEMENT","MENU_PAYROLL_OPERATOR_SUMMARY","MENU_MATERIAL_RECON","MENU_PAYMENT_APPROVAL","MENU_EXPENSE_REIMBURSEMENT","MENU_EMPLOYEE_ADVANCE","MENU_FINANCE_EXPORT"]',
       'all', 4
WHERE NOT EXISTS (SELECT 1 FROM t_role_template WHERE template_code = 'finance');

INSERT INTO t_role_template (template_code, template_name, template_desc, category, is_default, permissions_json, permission_range, sort_order)
SELECT 'quality_inspector', '质检员', '负责质检入库和质量控制', 'INDUSTRY', true,
       '["MENU_DASHBOARD","MENU_WAREHOUSING","MENU_PROGRESS","MENU_PRODUCTION_LIST"]',
       'team', 5
WHERE NOT EXISTS (SELECT 1 FROM t_role_template WHERE template_code = 'quality_inspector');

INSERT INTO t_role_template (template_code, template_name, template_desc, category, is_default, permissions_json, permission_range, sort_order)
SELECT 'production_manager', '生产主管', '负责生产计划、进度跟踪和人员协调', 'INDUSTRY', true,
       '["MENU_DASHBOARD","MENU_STYLE_INFO","MENU_ORDER_MANAGEMENT","MENU_PRODUCTION_LIST","MENU_MATERIAL_PURCHASE","MENU_CUTTING","MENU_PROGRESS","MENU_MATERIAL_PICKING","MENU_WAREHOUSING","MENU_FINISHED_SETTLEMENT"]',
       'team', 6
WHERE NOT EXISTS (SELECT 1 FROM t_role_template WHERE template_code = 'production_manager');

INSERT INTO t_role_template (template_code, template_name, template_desc, category, is_default, permissions_json, permission_range, sort_order)
SELECT 'cutting_master', '裁剪师傅', '负责裁剪管理和裁剪任务', 'INDUSTRY', true,
       '["MENU_DASHBOARD","MENU_CUTTING","MENU_MATERIAL_INVENTORY","MENU_PROGRESS"]',
       'team', 7
WHERE NOT EXISTS (SELECT 1 FROM t_role_template WHERE template_code = 'cutting_master');

package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 系统基础表迁移器
 * 负责: t_user, t_factory, t_operation_log, t_login_log, t_dict,
 *       t_permission, t_role, t_role_permission, 管理员账号
 */
@Component
@Slf4j
public class SystemTableMigrator {

    @Autowired
    private DatabaseMigrationHelper dbHelper;

    public void initialize() {
        JdbcTemplate jdbc = dbHelper.getJdbcTemplate();

        createUserTable(jdbc);
        ensureLoginLogTable();
        createFactoryTable(jdbc);
        createOperationLogTable(jdbc);
        ensurePermissionTables();
        seedDefaultAuthData();
        ensureDictTable();
        createAdminUser(jdbc);
        fixAppStorePrices(jdbc);
        fixSystemTableEncoding(jdbc);
        ensureMissingColumns(jdbc);
    }

    private void createUserTable(JdbcTemplate jdbc) {
        String createUserTable = "CREATE TABLE IF NOT EXISTS t_user (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID'," +
                "username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名'," +
                "password VARCHAR(100) NOT NULL COMMENT '密码'," +
                "name VARCHAR(50) NOT NULL COMMENT '姓名'," +
                "role_id BIGINT COMMENT '角色ID'," +
                "role_name VARCHAR(50) COMMENT '角色名称'," +
                "permission_range VARCHAR(50) COMMENT '权限范围'," +
                "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                "phone VARCHAR(20) COMMENT '电话'," +
                "email VARCHAR(50) COMMENT '邮箱'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "last_login_time DATETIME COMMENT '最后登录时间'," +
                "last_login_ip VARCHAR(20) COMMENT '最后登录IP'" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'";

        try {
            jdbc.execute(createUserTable);
            log.info("Table t_user checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create t_user table: {}", e.getMessage());
        }
    }

    private void createFactoryTable(JdbcTemplate jdbc) {
        String createFactoryTable = "CREATE TABLE IF NOT EXISTS t_factory (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '加工厂ID'," +
                "factory_code VARCHAR(50) NOT NULL COMMENT '加工厂编码'," +
                "factory_name VARCHAR(100) NOT NULL COMMENT '加工厂名称'," +
                "contact_person VARCHAR(50) COMMENT '联系人'," +
                "contact_phone VARCHAR(30) COMMENT '联系电话'," +
                "address VARCHAR(200) COMMENT '地址'," +
                "business_license VARCHAR(512) COMMENT '营业执照图片URL'," +
                "status VARCHAR(20) DEFAULT 'active' COMMENT '状态'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "tenant_id BIGINT DEFAULT NULL COMMENT '租户ID'," +
                "UNIQUE KEY uq_tenant_factory_code (tenant_id, factory_code)," +
                "INDEX idx_factory_code (factory_code)," +
                "INDEX idx_factory_name (factory_name)," +
                "INDEX idx_f_tenant_id (tenant_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加工厂表'";

        try {
            jdbc.execute(createFactoryTable);
            log.info("System tables checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create system tables: {}", e.getMessage());
        }

        if (dbHelper.tableExists("t_factory")) {
            dbHelper.execSilently("ALTER TABLE t_factory MODIFY COLUMN id VARCHAR(36)");
            if (!dbHelper.columnExists("t_factory", "contact_person") && dbHelper.columnExists("t_factory", "contact_name")) {
                dbHelper.execSilently("ALTER TABLE t_factory CHANGE contact_name contact_person VARCHAR(50) COMMENT '联系人'");
            }
            if (!dbHelper.columnExists("t_factory", "contact_person")) {
                dbHelper.execSilently("ALTER TABLE t_factory ADD COLUMN contact_person VARCHAR(50) COMMENT '联系人'");
            }
            if (!dbHelper.columnExists("t_factory", "contact_phone")) {
                dbHelper.execSilently("ALTER TABLE t_factory ADD COLUMN contact_phone VARCHAR(30) COMMENT '联系电话'");
            }
            if (!dbHelper.columnExists("t_factory", "address")) {
                dbHelper.execSilently("ALTER TABLE t_factory ADD COLUMN address VARCHAR(200) COMMENT '地址'");
            }
            if (!dbHelper.columnExists("t_factory", "business_license")) {
                dbHelper.execSilently("ALTER TABLE t_factory ADD COLUMN business_license VARCHAR(512) COMMENT '营业执照图片URL'");
            }
            if (!dbHelper.columnExists("t_factory", "status")) {
                dbHelper.execSilently("ALTER TABLE t_factory ADD COLUMN status VARCHAR(20) DEFAULT 'active' COMMENT '状态'");
            }
            if (!dbHelper.columnExists("t_factory", "create_time")) {
                dbHelper.execSilently("ALTER TABLE t_factory ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
            }
            if (!dbHelper.columnExists("t_factory", "update_time")) {
                dbHelper.execSilently("ALTER TABLE t_factory ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
            }
            if (!dbHelper.columnExists("t_factory", "delete_flag")) {
                dbHelper.execSilently("ALTER TABLE t_factory ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
            }
            dbHelper.addIndexIfAbsent("t_factory", "idx_factory_code", "factory_code");
            dbHelper.addIndexIfAbsent("t_factory", "idx_factory_name", "factory_name");
            // 添加租户ID列和复合唯一索引（迁移至租户级供应商编码隔离）
            if (!dbHelper.columnExists("t_factory", "tenant_id")) {
                dbHelper.execSilently("ALTER TABLE t_factory ADD COLUMN tenant_id BIGINT DEFAULT NULL");
            }
            dbHelper.addIndexIfAbsent("t_factory", "idx_f_tenant_id", "tenant_id");
            // 将全局 UNIQUE factory_code 改为 (tenant_id, factory_code) 复合唯一，允许不同租户使用相同编码
            dbHelper.execSilently("ALTER TABLE t_factory DROP INDEX factory_code");
            dbHelper.execSilently("ALTER TABLE t_factory ADD UNIQUE KEY uq_tenant_factory_code (tenant_id, factory_code)");
        }
    }

    private void createOperationLogTable(JdbcTemplate jdbc) {
        String sql = "CREATE TABLE IF NOT EXISTS t_operation_log (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY," +
                "module VARCHAR(100) NOT NULL," +
                "operation VARCHAR(50) NOT NULL," +
                "operator_id BIGINT," +
                "operator_name VARCHAR(50)," +
                "target_type VARCHAR(50)," +
                "target_id VARCHAR(64)," +
                "target_name VARCHAR(100)," +
                "reason VARCHAR(255)," +
                "details TEXT," +
                "ip VARCHAR(50)," +
                "user_agent VARCHAR(200)," +
                "operation_time DATETIME DEFAULT CURRENT_TIMESTAMP," +
                "status VARCHAR(20) DEFAULT 'success'," +
                "error_message VARCHAR(500)," +
                "INDEX idx_operation_time (operation_time)," +
                "INDEX idx_module (module)," +
                "INDEX idx_operator_name (operator_name)," +
                "INDEX idx_target_type (target_type)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

        try {
            jdbc.execute(sql);
        } catch (Exception e) {
            log.warn("Failed to create operation log table: {}", e.getMessage());
        }
    }

    private void ensureLoginLogTable() {
        if (!dbHelper.tableExists("t_login_log")) {
            String sqlFromInit = dbHelper.loadCreateTableStatementFromInitSql("t_login_log");
            if (sqlFromInit != null) {
                dbHelper.execSilently(sqlFromInit);
            } else {
                dbHelper.execSilently("CREATE TABLE IF NOT EXISTS t_login_log (" +
                        "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '日志ID'," +
                        "username VARCHAR(50) NOT NULL COMMENT '用户名'," +
                        "login_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间'," +
                        "login_ip VARCHAR(20) NOT NULL COMMENT '登录IP'," +
                        "login_result VARCHAR(20) NOT NULL COMMENT '登录结果：SUCCESS-成功，FAILED-失败'," +
                        "error_message VARCHAR(200) COMMENT '错误信息'" +
                        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='登录日志表'");
            }
        }

        if (!dbHelper.columnExists("t_login_log", "login_ip") && dbHelper.columnExists("t_login_log", "ip")) {
            dbHelper.execSilently("ALTER TABLE t_login_log CHANGE ip login_ip VARCHAR(20) NOT NULL COMMENT '登录IP'");
        }
        if (!dbHelper.columnExists("t_login_log", "login_ip")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN login_ip VARCHAR(20) NOT NULL DEFAULT '' COMMENT '登录IP'");
        }
        if (!dbHelper.columnExists("t_login_log", "login_result") && dbHelper.columnExists("t_login_log", "login_status")) {
            dbHelper.execSilently("ALTER TABLE t_login_log CHANGE login_status login_result VARCHAR(20) NOT NULL COMMENT '登录结果：SUCCESS-成功，FAILED-失败'");
        }
        if (!dbHelper.columnExists("t_login_log", "login_result")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN login_result VARCHAR(20) NOT NULL DEFAULT '' COMMENT '登录结果：SUCCESS-成功，FAILED-失败'");
        }
        if (!dbHelper.columnExists("t_login_log", "error_message") && dbHelper.columnExists("t_login_log", "message")) {
            dbHelper.execSilently("ALTER TABLE t_login_log CHANGE message error_message VARCHAR(200) COMMENT '错误信息'");
        }
        if (!dbHelper.columnExists("t_login_log", "error_message")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN error_message VARCHAR(200) COMMENT '错误信息'");
        }
        if (!dbHelper.columnExists("t_login_log", "login_time")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN login_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间'");
        }

        if (!dbHelper.columnExists("t_login_log", "log_type")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN log_type VARCHAR(20) DEFAULT 'LOGIN' COMMENT '日志类型：LOGIN-登录日志，OPERATION-操作日志'");
        }
        if (!dbHelper.columnExists("t_login_log", "biz_type")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN biz_type VARCHAR(50) COMMENT '业务类型'");
        }
        if (!dbHelper.columnExists("t_login_log", "biz_id")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN biz_id VARCHAR(64) COMMENT '业务ID'");
        }
        if (!dbHelper.columnExists("t_login_log", "action")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN action VARCHAR(50) COMMENT '操作动作'");
        }
        if (!dbHelper.columnExists("t_login_log", "remark")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN remark VARCHAR(500) COMMENT '备注'");
        }
        if (!dbHelper.columnExists("t_login_log", "tenant_id")) {
            dbHelper.execSilently("ALTER TABLE t_login_log ADD COLUMN tenant_id BIGINT DEFAULT NULL COMMENT '租户ID'");
        }

        dbHelper.addIndexIfAbsent("t_login_log", "idx_login_time", "login_time");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_username", "username");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_login_result", "login_result");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_log_type", "log_type");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_biz", "biz_type, biz_id");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_action", "action");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_login_log_tenant_id", "tenant_id");
    }

    private void ensureDictTable() {
        JdbcTemplate jdbc = dbHelper.getJdbcTemplate();
        if (!dbHelper.tableExists("t_dict")) {
            String sqlFromInit = dbHelper.loadCreateTableStatementFromInitSql("t_dict");
            if (sqlFromInit != null) {
                dbHelper.execSilently(sqlFromInit);
            } else {
                dbHelper.execSilently("CREATE TABLE IF NOT EXISTS t_dict (" +
                        "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '字典ID'," +
                        "dict_code VARCHAR(50) NOT NULL COMMENT '字典编码'," +
                        "dict_label VARCHAR(100) NOT NULL COMMENT '字典标签'," +
                        "dict_value VARCHAR(100) NOT NULL COMMENT '字典值'," +
                        "dict_type VARCHAR(50) NOT NULL COMMENT '字典类型'," +
                        "sort INT DEFAULT 0 COMMENT '排序'," +
                        "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                        "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                        "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                        "INDEX idx_dict_type (dict_type)" +
                        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典表'");
            }
        }

        try {
            Integer cnt = jdbc.queryForObject("SELECT COUNT(*) FROM t_dict", Integer.class);
            if (cnt != null && cnt == 0) {
                jdbc.execute(
                        "INSERT INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES" +
                                "('WOMAN', '女装', 'WOMAN', 'category', 1, 'ENABLED')," +
                                "('MAN', '男装', 'MAN', 'category', 2, 'ENABLED')," +
                                "('KID', '童装', 'KID', 'category', 3, 'ENABLED')," +
                                "('SPRING', '春季', 'SPRING', 'season', 1, 'ENABLED')," +
                                "('SUMMER', '夏季', 'SUMMER', 'season', 2, 'ENABLED')," +
                                "('AUTUMN', '秋季', 'AUTUMN', 'season', 3, 'ENABLED')," +
                                "('WINTER', '冬季', 'WINTER', 'season', 4, 'ENABLED')");
            }
        } catch (Exception e) {
            log.warn("Failed to seed dict table: err={}", e.getMessage());
        }
    }

    private void ensurePermissionTables() {
        String createRoleTable = "CREATE TABLE IF NOT EXISTS t_role (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '角色ID'," +
                "role_name VARCHAR(50) NOT NULL UNIQUE COMMENT '角色名称'," +
                "role_code VARCHAR(50) NOT NULL UNIQUE COMMENT '角色编码'," +
                "description VARCHAR(200) COMMENT '角色描述'," +
                "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表'";

        String createPermissionTable = "CREATE TABLE IF NOT EXISTS t_permission (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '权限ID'," +
                "permission_name VARCHAR(50) NOT NULL COMMENT '权限名称'," +
                "permission_code VARCHAR(50) NOT NULL UNIQUE COMMENT '权限编码'," +
                "parent_id BIGINT DEFAULT 0 COMMENT '父权限ID'," +
                "parent_name VARCHAR(50) COMMENT '父权限名称'," +
                "permission_type VARCHAR(20) NOT NULL COMMENT '权限类型：MENU-菜单，BUTTON-按钮'," +
                "path VARCHAR(100) COMMENT '访问路径'," +
                "component VARCHAR(100) COMMENT '组件路径'," +
                "icon VARCHAR(50) COMMENT '图标'," +
                "sort INT DEFAULT 0 COMMENT '排序'," +
                "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表'";

        String createRolePermissionTable = "CREATE TABLE IF NOT EXISTS t_role_permission (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID'," +
                "role_id BIGINT NOT NULL COMMENT '角色ID'," +
                "permission_id BIGINT NOT NULL COMMENT '权限ID'," +
                "UNIQUE KEY uk_role_permission (role_id, permission_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色权限关联表'";

        dbHelper.execSilently(createRoleTable);
        dbHelper.execSilently(createPermissionTable);
        dbHelper.execSilently(createRolePermissionTable);

        if (dbHelper.tableExists("t_permission")) {
            if (!dbHelper.columnExists("t_permission", "parent_id")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN parent_id BIGINT DEFAULT 0 COMMENT '父权限ID'");
            }
            if (!dbHelper.columnExists("t_permission", "parent_name")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN parent_name VARCHAR(50) COMMENT '父权限名称'");
            }
            if (!dbHelper.columnExists("t_permission", "permission_type")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN permission_type VARCHAR(20) NOT NULL DEFAULT 'MENU' COMMENT '权限类型：MENU-菜单，BUTTON-按钮'");
            }
            if (!dbHelper.columnExists("t_permission", "path")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN path VARCHAR(100) COMMENT '访问路径'");
            }
            if (!dbHelper.columnExists("t_permission", "component")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN component VARCHAR(100) COMMENT '组件路径'");
            }
            if (!dbHelper.columnExists("t_permission", "icon")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN icon VARCHAR(50) COMMENT '图标'");
            }
            if (!dbHelper.columnExists("t_permission", "sort")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN sort INT DEFAULT 0 COMMENT '排序'");
            }
            if (!dbHelper.columnExists("t_permission", "status")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'");
            }
            if (!dbHelper.columnExists("t_permission", "create_time")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
            }
            if (!dbHelper.columnExists("t_permission", "update_time")) {
                dbHelper.execSilently("ALTER TABLE t_permission ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
            }
        }
    }

    private void seedDefaultAuthData() {
        JdbcTemplate jdbc = dbHelper.getJdbcTemplate();
        seedDefaultRoles(jdbc);
        Long basicId = ensurePermission("样衣管理", "MENU_BASIC", 0L, null, "menu", null, null, 10);
        Long productionId = ensurePermission("生产管理", "MENU_PRODUCTION", 0L, null, "menu", null, null, 20);
        Long financeId = ensurePermission("财务管理", "MENU_FINANCE", 0L, null, "menu", null, null, 30);
        Long systemId = ensurePermission("系统设置", "MENU_SYSTEM", 0L, null, "menu", null, null, 40);
        seedMenuPermissions(basicId, productionId, financeId, systemId);
        seedButtonPermissions();
        try {
            jdbc.update("INSERT IGNORE INTO t_role_permission (role_id, permission_id) SELECT 1, id FROM t_permission");
        } catch (Exception e) {
            log.warn("Failed to seed role permissions: err={}", e.getMessage());
        }
    }

    private void seedDefaultRoles(JdbcTemplate jdbc) {
        try {
            jdbc.update("INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)", 1L, "系统管理员", "admin", "系统管理员", "active");
            jdbc.update("INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)", 2L, "财务人员", "finance", "财务人员", "active");
            jdbc.update("INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)", 3L, "生产人员", "production", "生产人员", "active");
            jdbc.update("INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)", 4L, "普通用户", "user", "普通用户", "active");
        } catch (Exception e) {
            log.warn("Failed to seed default roles: err={}", e.getMessage());
        }
    }

    private void seedMenuPermissions(Long basicId, Long productionId, Long financeId, Long systemId) {
        ensurePermission("仪表盘", "MENU_DASHBOARD", 0L, null, "menu", "/dashboard", null, 0);

        if (basicId != null) {
            ensurePermission("款号资料", "MENU_STYLE_INFO", basicId, "基础资料", "menu", "/style-info", null, 11);
            ensurePermission("下单管理", "MENU_ORDER_MANAGEMENT", basicId, "基础资料", "menu", "/order-management", null, 12);
            ensurePermission("资料中心", "MENU_DATA_CENTER", basicId, "基础资料", "menu", "/data-center", null, 13);
            ensurePermission("模板中心", "MENU_TEMPLATE_CENTER", basicId, "基础资料", "menu", "/basic/template-center", null, 14);
            ensurePermission("样衣生产", "MENU_PATTERN_PRODUCTION", basicId, "样衣管理", "menu", "/pattern-production", null, 15);
            ensurePermission("样衣修订", "MENU_PATTERN_REVISION", basicId, "样衣管理", "menu", "/basic/pattern-revision", null, 16);
        }
        if (productionId != null) {
            ensurePermission("我的订单", "MENU_PRODUCTION_LIST", productionId, "生产管理", "menu", "/production", null, 21);
            ensurePermission("物料采购", "MENU_MATERIAL_PURCHASE", productionId, "生产管理", "menu", "/production/material", null, 22);
            ensurePermission("裁剪管理", "MENU_CUTTING", productionId, "生产管理", "menu", "/production/cutting", null, 24);
            ensurePermission("工序跟进", "MENU_PROGRESS", productionId, "生产管理", "menu", "/production/progress-detail", null, 25);
            ensurePermission("物料领用", "MENU_MATERIAL_PICKING", productionId, "生产管理", "menu", "/production/picking", null, 26);
            ensurePermission("质检入库", "MENU_WAREHOUSING", productionId, "生产管理", "menu", "/production/warehousing", null, 27);
            ensurePermission("订单转移", "MENU_ORDER_TRANSFER", productionId, "生产管理", "menu", "/production/transfer", null, 28);
            dbHelper.ensurePermissionNameByCode("MENU_WAREHOUSING", "质检入库");
        }
        if (financeId != null) {
            ensurePermission("物料对账", "MENU_MATERIAL_RECON", financeId, "财务管理", "menu", "/finance/material-reconciliation", null, 32);
            ensurePermission("成品结算", "MENU_SHIPMENT_RECON", financeId, "财务管理", "menu", "/finance/shipment-reconciliation", null, 33);
            ensurePermission("审批付款", "MENU_PAYMENT_APPROVAL", financeId, "财务管理", "menu", "/finance/payment-approval", null, 34);
            ensurePermission("人员工序统计", "MENU_PAYROLL_OPERATOR_SUMMARY", financeId, "财务管理", "menu", "/finance/payroll-operator-summary", null, 35);
            ensurePermission("费用报销", "MENU_EXPENSE_REIMBURSEMENT", financeId, "财务管理", "menu", "/finance/expense-reimbursement", null, 36);
            ensurePermission("财税导出", "MENU_FINANCE_EXPORT", financeId, "财务管理", "menu", "/finance/tax-export", null, 37);
            ensurePermission("订单结算(外)", "MENU_FINISHED_SETTLEMENT", financeId, "财务管理", "menu", "/finance/center", null, 38);
        }
        Long warehouseId = ensurePermission("仓库管理", "MENU_WAREHOUSE", 0L, null, "menu", null, null, 45);
        if (warehouseId != null) {
            ensurePermission("仓库仪表盘", "MENU_WAREHOUSE_DASHBOARD", warehouseId, "仓库管理", "menu", "/warehouse/dashboard", null, 46);
            ensurePermission("物料进销存", "MENU_MATERIAL_INVENTORY", warehouseId, "仓库管理", "menu", "/warehouse/material", null, 47);
            ensurePermission("物料新增", "MENU_MATERIAL_DATABASE", warehouseId, "仓库管理", "menu", "/warehouse/material-database", null, 48);
            ensurePermission("成品进销存", "MENU_FINISHED_INVENTORY", warehouseId, "仓库管理", "menu", "/warehouse/finished", null, 49);
            ensurePermission("样衣库存", "MENU_SAMPLE_INVENTORY", warehouseId, "仓库管理", "menu", "/warehouse/sample", null, 50);
        }
        ensurePermission("选品中心", "MENU_SELECTION", 0L, null, "menu", "/selection", null, 55);
        ensurePermission("CRM客户管理", "MENU_CRM", 0L, null, "menu", "/crm", null, 60);
        ensurePermission("客户管理", "MENU_CUSTOMER", 0L, null, "menu", "/system/customer", null, 65);
        ensurePermission("供应商采购", "MENU_PROCUREMENT", 0L, null, "menu", "/procurement", null, 70);
        ensurePermission("应用商店", "MENU_APP_STORE_VIEW", 0L, null, "menu", "/system/app-store", null, 75);
        ensurePermission("API对接管理", "MENU_TENANT_APP", 0L, null, "menu", "/system/tenant", null, 80);
        ensurePermission("集成对接中心", "MENU_INTEGRATION", 0L, null, "menu", "/integration/center", null, 85);
        ensurePermission("智能运营中心", "MENU_INTELLIGENCE_CENTER", 0L, null, "menu", "/intelligence/center", null, 90);
        if (systemId != null) {
            ensurePermission("人员管理", "MENU_USER", systemId, "系统设置", "menu", "/system/user", null, 41);
            ensurePermission("岗位权限", "MENU_ROLE", systemId, "系统设置", "menu", "/system/role", null, 42);
            ensurePermission("供应商管理", "MENU_FACTORY", systemId, "系统设置", "menu", "/system/factory", null, 43);
            ensurePermission("权限管理", "MENU_PERMISSION", systemId, "系统设置", "menu", "/system/permission", null, 44);
            ensurePermission("登录日志", "MENU_LOGIN_LOG", systemId, "系统设置", "menu", "/system/login-log", null, 45);
            ensurePermission("用户审批", "MENU_USER_APPROVAL", systemId, "系统设置", "menu", "/system/user-approval", null, 46);
            ensurePermission("字典管理", "MENU_DICT", systemId, "系统设置", "menu", "/system/dict", null, 47);
            ensurePermission("系统教学", "MENU_TUTORIAL", systemId, "系统设置", "menu", "/system/tutorial", null, 48);
            ensurePermission("数据导入", "MENU_DATA_IMPORT", systemId, "系统设置", "menu", "/system/data-import", null, 49);
        }
    }

    private void seedButtonPermissions() {
        ensurePermission("新增款号", "STYLE_CREATE", null, null, "button", null, null, 100);
        ensurePermission("编辑款号", "STYLE_EDIT", null, null, "button", null, null, 101);
        ensurePermission("删除款号", "STYLE_DELETE", null, null, "button", null, null, 102);
        ensurePermission("导入款号", "STYLE_IMPORT", null, null, "button", null, null, 103);
        ensurePermission("导出款号", "STYLE_EXPORT", null, null, "button", null, null, 104);
        ensurePermission("新增订单", "ORDER_CREATE", null, null, "button", null, null, 110);
        ensurePermission("编辑订单", "ORDER_EDIT", null, null, "button", null, null, 111);
        ensurePermission("删除订单", "ORDER_DELETE", null, null, "button", null, null, 112);
        ensurePermission("取消订单", "ORDER_CANCEL", null, null, "button", null, null, 113);
        ensurePermission("完成订单", "ORDER_COMPLETE", null, null, "button", null, null, 114);
        ensurePermission("导入订单", "ORDER_IMPORT", null, null, "button", null, null, 115);
        ensurePermission("导出订单", "ORDER_EXPORT", null, null, "button", null, null, 116);
        ensurePermission("订单转移", "ORDER_TRANSFER", null, null, "button", null, null, 117);
        ensurePermission("新增采购单", "PURCHASE_CREATE", null, null, "button", null, null, 120);
        ensurePermission("编辑采购单", "PURCHASE_EDIT", null, null, "button", null, null, 121);
        ensurePermission("删除采购单", "PURCHASE_DELETE", null, null, "button", null, null, 122);
        ensurePermission("领取采购任务", "PURCHASE_RECEIVE", null, null, "button", null, null, 123);
        ensurePermission("回料确认", "PURCHASE_RETURN_CONFIRM", null, null, "button", null, null, 124);
        ensurePermission("生成采购单", "PURCHASE_GENERATE", null, null, "button", null, null, 125);
        ensurePermission("新增裁剪", "CUTTING_CREATE", null, null, "button", null, null, 130);
        ensurePermission("编辑裁剪", "CUTTING_EDIT", null, null, "button", null, null, 131);
        ensurePermission("删除裁剪", "CUTTING_DELETE", null, null, "button", null, null, 132);
        ensurePermission("裁剪扫码", "CUTTING_SCAN", null, null, "button", null, null, 133);
        ensurePermission("进度扫码", "PROGRESS_SCAN", null, null, "button", null, null, 140);
        ensurePermission("编辑进度", "PROGRESS_EDIT", null, null, "button", null, null, 141);
        ensurePermission("删除进度", "PROGRESS_DELETE", null, null, "button", null, null, 142);
        ensurePermission("新增入库", "WAREHOUSING_CREATE", null, null, "button", null, null, 150);
        ensurePermission("编辑入库", "WAREHOUSING_EDIT", null, null, "button", null, null, 151);
        ensurePermission("删除入库", "WAREHOUSING_DELETE", null, null, "button", null, null, 152);
        ensurePermission("入库回退", "WAREHOUSING_ROLLBACK", null, null, "button", null, null, 153);
        ensurePermission("新增对账单", "MATERIAL_RECON_CREATE", null, null, "button", null, null, 160);
        ensurePermission("编辑对账单", "MATERIAL_RECON_EDIT", null, null, "button", null, null, 161);
        ensurePermission("删除对账单", "MATERIAL_RECON_DELETE", null, null, "button", null, null, 162);
        ensurePermission("审核对账单", "MATERIAL_RECON_AUDIT", null, null, "button", null, null, 163);
        ensurePermission("结算对账单", "MATERIAL_RECON_SETTLEMENT", null, null, "button", null, null, 164);
        ensurePermission("新增结算单", "SHIPMENT_RECON_CREATE", null, null, "button", null, null, 170);
        ensurePermission("编辑结算单", "SHIPMENT_RECON_EDIT", null, null, "button", null, null, 171);
        ensurePermission("删除结算单", "SHIPMENT_RECON_DELETE", null, null, "button", null, null, 172);
        ensurePermission("审核结算单", "SHIPMENT_RECON_AUDIT", null, null, "button", null, null, 173);
        ensurePermission("审批付款", "PAYMENT_APPROVE", null, null, "button", null, null, 180);
        ensurePermission("拒绝付款", "PAYMENT_REJECT", null, null, "button", null, null, 181);
        ensurePermission("取消付款", "PAYMENT_CANCEL", null, null, "button", null, null, 182);
        ensurePermission("新增用户", "USER_CREATE", null, null, "button", null, null, 190);
        ensurePermission("编辑用户", "USER_EDIT", null, null, "button", null, null, 191);
        ensurePermission("删除用户", "USER_DELETE", null, null, "button", null, null, 192);
        ensurePermission("重置密码", "USER_RESET_PASSWORD", null, null, "button", null, null, 193);
        ensurePermission("新增角色", "ROLE_CREATE", null, null, "button", null, null, 200);
        ensurePermission("编辑角色", "ROLE_EDIT", null, null, "button", null, null, 201);
        ensurePermission("删除角色", "ROLE_DELETE", null, null, "button", null, null, 202);
        ensurePermission("新增供应商", "FACTORY_CREATE", null, null, "button", null, null, 210);
        ensurePermission("编辑供应商", "FACTORY_EDIT", null, null, "button", null, null, 211);
        ensurePermission("删除供应商", "FACTORY_DELETE", null, null, "button", null, null, 212);
        ensurePermission("数据导入", "DATA_IMPORT", null, null, "button", null, null, 220);
        ensurePermission("数据导出", "DATA_EXPORT", null, null, "button", null, null, 221);
        ensurePermission("上传模板", "TEMPLATE_UPLOAD", null, null, "button", null, null, 230);
        ensurePermission("删除模板", "TEMPLATE_DELETE", null, null, "button", null, null, 231);
    }

    private Long ensurePermission(String name, String code, Long parentId, String parentName, String type, String path, String component, int sort) {
        JdbcTemplate jdbc = dbHelper.getJdbcTemplate();
        try {
            jdbc.update(
                    "INSERT IGNORE INTO t_permission (permission_name, permission_code, parent_id, parent_name, permission_type, path, component, icon, sort, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    name, code, parentId == null ? 0L : parentId, parentName, type, path, component, null, sort, "active");
        } catch (Exception e) {
            log.warn("Failed to ensure permission: code={}, name={}, err={}", code, name, e.getMessage());
        }

        try {
            return jdbc.queryForObject("SELECT id FROM t_permission WHERE permission_code = ?", Long.class, code);
        } catch (Exception e) {
            return null;
        }
    }

    private void createAdminUser(JdbcTemplate jdbc) {
        try {
            Integer count = jdbc.queryForObject("SELECT count(*) FROM t_user WHERE username = 'admin'", Integer.class);
            if (count != null && count == 0) {
                BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
                String raw = "admin123";
                String encoded = encoder.encode(raw);
                jdbc.update("INSERT INTO t_user (username, password, name, role_name, status) VALUES (?,?,?,?,?)",
                        "admin", encoded, "Admin", "admin", "ENABLED");
                log.info("Admin user created (password stored as BCrypt hash).");
            } else {
                log.info("Admin user already exists.");
            }
        } catch (Exception e) {
            log.warn("Failed to check/insert admin user: {}", e.getMessage());
        }
    }

    /**
     * 修复应用商店价格数据
     * 初始INSERT遗漏了price_once列，导致买断价格显示为0
     */
    private void fixAppStorePrices(JdbcTemplate jdbc) {
        if (!dbHelper.tableExists("t_app_store")) {
            return;
        }
        try {
            Integer zeroCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM t_app_store WHERE status='PUBLISHED' AND (price_once IS NULL OR price_once = 0)",
                Integer.class
            );
            if (zeroCount != null && zeroCount > 0) {
                log.info("Fixing app store prices: {} apps have price_once=0, updating...", zeroCount);
                jdbc.update("UPDATE t_app_store SET price_monthly=299.00,  price_yearly=2990.00, price_once=19999.00 WHERE app_code='ORDER_SYNC'");
                jdbc.update("UPDATE t_app_store SET price_monthly=199.00,  price_yearly=1990.00, price_once=19999.00 WHERE app_code='QUALITY_FEEDBACK'");
                jdbc.update("UPDATE t_app_store SET price_monthly=149.00,  price_yearly=1490.00, price_once=19999.00 WHERE app_code='LOGISTICS_SYNC'");
                jdbc.update("UPDATE t_app_store SET price_monthly=199.00,  price_yearly=1990.00, price_once=19999.00 WHERE app_code='PAYMENT_SYNC'");
                jdbc.update("UPDATE t_app_store SET price_monthly=249.00,  price_yearly=2490.00, price_once=19999.00 WHERE app_code='MATERIAL_SUPPLY'");
                log.info("App store prices fixed successfully.");
            }
        } catch (Exception e) {
            log.warn("Failed to fix app store prices: {}", e.getMessage());
        }
    }

    private void ensureMissingColumns(JdbcTemplate jdbc) {
        try {
            if (dbHelper.tableExists("t_secondary_process")) {
                addColumnIfNotExists(jdbc, "t_secondary_process", "approval_status", "VARCHAR(32) DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_secondary_process", "approved_by_id", "VARCHAR(64) DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_secondary_process", "approved_by_name", "VARCHAR(128) DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_secondary_process", "approved_time", "DATETIME DEFAULT NULL");
            }
        } catch (Exception e) {
            log.warn("Failed to add missing columns to t_secondary_process: {}", e.getMessage());
        }
        try {
            if (dbHelper.tableExists("t_material_picking")) {
                addColumnIfNotExists(jdbc, "t_material_picking", "purchase_id", "VARCHAR(64) DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_material_picking", "audit_status", "VARCHAR(32) DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_material_picking", "auditor_id", "VARCHAR(64) DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_material_picking", "auditor_name", "VARCHAR(128) DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_material_picking", "audit_time", "DATETIME DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_material_picking", "audit_remark", "VARCHAR(500) DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_material_picking", "finance_status", "VARCHAR(32) DEFAULT NULL");
                addColumnIfNotExists(jdbc, "t_material_picking", "finance_remark", "VARCHAR(500) DEFAULT NULL");
            }
        } catch (Exception e) {
            log.warn("Failed to add columns to t_material_picking: {}", e.getMessage());
        }
    }

    private void fixSystemTableEncoding(JdbcTemplate jdbc) {
        fixAppStoreEncoding(jdbc);
        fixRoleEncoding(jdbc);
        fixDictEncoding(jdbc);
        fixPermissionEncoding(jdbc);
        fixTemplateLibraryEncoding(jdbc);
    }

    private void fixAppStoreEncoding(JdbcTemplate jdbc) {
        if (!dbHelper.tableExists("t_app_store")) {
            return;
        }
        try {
            Integer garbledCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM t_app_store WHERE app_name REGEXP '[\\x{00C0}-\\x{00FF}]'",
                Integer.class);
            if (garbledCount == null || garbledCount == 0) {
                return;
            }
            log.info("[EncodingFix] Detected {} garbled app_store records, fixing...", garbledCount);
            jdbc.update("UPDATE t_app_store SET app_name='下单对接', app_desc='与客户系统对接，自动同步订单数据，减少人工录入', category='CORE', features='[\"自动接收客户订单\",\"订单状态同步\",\"订单变更通知\",\"批量导入导出\",\"订单数据校验\"]' WHERE app_code='ORDER_SYNC'");
            jdbc.update("UPDATE t_app_store SET app_name='质检反馈', app_desc='质检结果实时同步，不良品反馈，质量数据分析', category='CORE', features='[\"质检结果推送\",\"不良品反馈\",\"质检报告生成\",\"质量数据统计\",\"异常预警通知\"]' WHERE app_code='QUALITY_FEEDBACK'");
            jdbc.update("UPDATE t_app_store SET app_name='物流对接', app_desc='物流信息实时同步，发货通知，物流轨迹跟踪', category='CORE', features='[\"发货信息同步\",\"物流轨迹跟踪\",\"签收状态通知\",\"退货物流对接\",\"批量发货管理\"]' WHERE app_code='LOGISTICS_SYNC'");
            jdbc.update("UPDATE t_app_store SET app_name='付款对接', app_desc='付款信息自动同步，对账管理，结算数据对接', category='CORE', features='[\"付款信息同步\",\"自动对账\",\"结算数据推送\",\"账单生成\",\"付款状态跟踪\"]' WHERE app_code='PAYMENT_SYNC'");
            jdbc.update("UPDATE t_app_store SET app_name='面辅料供应对接', app_desc='采购单自动同步、库存实时查询、价格自动更新、物流跟踪', category='CORE', features='[\"采购订单自动推送\",\"供应商库存实时查询\",\"价格自动更新同步\",\"发货物流跟踪\",\"批量采购管理\"]' WHERE app_code='MATERIAL_SUPPLY'");
            jdbc.update("UPDATE t_app_store SET app_name='淘宝', app_desc='对接淘宝平台，导入订单、同步库存', features='[\"订单导入\",\"库存同步\",\"发货管理\"]' WHERE app_code='EC_TAOBAO'");
            jdbc.update("UPDATE t_app_store SET app_name='天猫', app_desc='对接天猫旗舰店，管理品牌订单与退换货', features='[\"订单导入\",\"库存同步\",\"退换货管理\"]' WHERE app_code='EC_TMALL'");
            jdbc.update("UPDATE t_app_store SET app_name='京东', app_desc='对接京东平台，实时同步订单与物流', features='[\"订单同步\",\"物流跟踪\",\"库存管理\"]' WHERE app_code='EC_JD'");
            jdbc.update("UPDATE t_app_store SET app_name='抖音', app_desc='对接抖音小店，直播带货订单自动流转', features='[\"订单导入\",\"直播订单\",\"物流管理\"]' WHERE app_code='EC_DOUYIN'");
            jdbc.update("UPDATE t_app_store SET app_name='拼多多', app_desc='对接拼多多，批量订单处理与发货', features='[\"订单导入\",\"批量发货\",\"库存同步\"]' WHERE app_code='EC_PINDUODUO'");
            jdbc.update("UPDATE t_app_store SET app_name='小红书', app_desc='对接小红书商城，内容种草带来的订单管理', features='[\"订单管理\",\"笔记联动\",\"库存同步\"]' WHERE app_code='EC_XIAOHONGSHU'");
            jdbc.update("UPDATE t_app_store SET app_name='微信小店', app_desc='对接微信小店与视频号，私域订单全管理', features='[\"订单同步\",\"私域管理\",\"客户管理\"]' WHERE app_code='EC_WECHAT_SHOP'");
            jdbc.update("UPDATE t_app_store SET app_name='Shopify', app_desc='对接 Shopify 独立站，跨境订单一体化管理', features='[\"订单同步\",\"多币种\",\"物流对接\"]' WHERE app_code='EC_SHOPIFY'");
            jdbc.update("UPDATE t_app_store SET app_name='客户管理', app_desc='客户档案管理、应收账款跟踪、客户查询门户（扫码查进度）。深度整合生产数据，一站式管理您的客户关系与回款。', features='[\"客户档案\",\"应收账款\",\"客户查询门户\",\"历史订单汇总\",\"催款提醒\"]' WHERE app_code='CRM_MODULE'");
            jdbc.update("UPDATE t_app_store SET app_name='财税对接', app_desc='一键导出金蝶KIS / 用友T3 格式账目，工资汇总表、物料对账单、发货记录单全覆盖，告别手工录入，3分钟完成月结。', features='[\"金蝶KIS导出\",\"用友T3导出\",\"工资汇总\",\"物料对账\",\"发货记录\"]' WHERE app_code='FINANCE_TAX'");
            jdbc.update("UPDATE t_app_store SET app_name='供应商采购', app_desc='采购订单管理、收货确认、应付账款核算，与仓库库存深度联动，自动触发缺料预警，告别 Excel 采购台账。', features='[\"采购订单\",\"收货确认\",\"应付账款\",\"缺料预警\",\"仓库联动\"]' WHERE app_code='PROCUREMENT'");
            log.info("[EncodingFix] App store encoding fixed successfully.");
        } catch (Exception e) {
            log.warn("[EncodingFix] Failed to fix app store encoding: {}", e.getMessage());
        }
    }

    private void fixRoleEncoding(JdbcTemplate jdbc) {
        if (!dbHelper.tableExists("t_role")) {
            return;
        }
        try {
            Integer roleGarbled = jdbc.queryForObject(
                "SELECT COUNT(*) FROM t_role WHERE role_name REGEXP '[\\x{00C0}-\\x{00FF}]'",
                Integer.class);
            if (roleGarbled != null && roleGarbled > 0) {
                log.info("[EncodingFix] Detected {} garbled role records, fixing...", roleGarbled);
                jdbc.update("UPDATE t_role SET role_name='系统管理员', description='系统管理员' WHERE role_code='admin' AND id=1");
                jdbc.update("UPDATE t_role SET role_name='财务人员', description='财务人员' WHERE role_code='finance' AND id=2");
                jdbc.update("UPDATE t_role SET role_name='生产人员', description='生产人员' WHERE role_code='production' AND id=3");
                jdbc.update("UPDATE t_role SET role_name='普通用户', description='普通用户' WHERE role_code='user' AND id=4");
            }
        } catch (Exception e) {
            log.warn("[EncodingFix] Failed to fix role encoding: {}", e.getMessage());
        }
    }

    private void fixDictEncoding(JdbcTemplate jdbc) {
        if (!dbHelper.tableExists("t_dict")) {
            return;
        }
        try {
            Integer dictGarbled = jdbc.queryForObject(
                "SELECT COUNT(*) FROM t_dict WHERE dict_label REGEXP '[\\x{00C0}-\\x{00FF}]'",
                Integer.class);
            if (dictGarbled != null && dictGarbled > 0) {
                log.info("[EncodingFix] Detected {} garbled dict records, fixing...", dictGarbled);
                jdbc.update("UPDATE t_dict SET dict_label='女装' WHERE dict_code='WOMAN' AND dict_type='category'");
                jdbc.update("UPDATE t_dict SET dict_label='男装' WHERE dict_code='MAN' AND dict_type='category'");
                jdbc.update("UPDATE t_dict SET dict_label='童装' WHERE dict_code='KID' AND dict_type='category'");
                jdbc.update("UPDATE t_dict SET dict_label='春季' WHERE dict_code='SPRING' AND dict_type='season'");
                jdbc.update("UPDATE t_dict SET dict_label='夏季' WHERE dict_code='SUMMER' AND dict_type='season'");
                jdbc.update("UPDATE t_dict SET dict_label='秋季' WHERE dict_code='AUTUMN' AND dict_type='season'");
                jdbc.update("UPDATE t_dict SET dict_label='冬季' WHERE dict_code='WINTER' AND dict_type='season'");
            }
        } catch (Exception e) {
            log.warn("[EncodingFix] Failed to fix dict encoding: {}", e.getMessage());
        }
    }

    private void fixPermissionEncoding(JdbcTemplate jdbc) {
        if (!dbHelper.tableExists("t_permission")) {
            return;
        }
        try {
            Integer permGarbled = jdbc.queryForObject(
                "SELECT COUNT(*) FROM t_permission WHERE permission_name REGEXP '[\\x{00C0}-\\x{00FF}]'",
                Integer.class);
            if (permGarbled == null || permGarbled == 0) {
                return;
            }
            log.info("[EncodingFix] Detected {} garbled permission records, fixing...", permGarbled);
            jdbc.update("UPDATE t_permission SET permission_name='仪表盘' WHERE id=1");
            jdbc.update("UPDATE t_permission SET permission_name='基础资料' WHERE id=2");
            jdbc.update("UPDATE t_permission SET permission_name='样衣开发' WHERE id=6");
            jdbc.update("UPDATE t_permission SET permission_name='下单管理' WHERE id=7");
            jdbc.update("UPDATE t_permission SET permission_name='资料中心' WHERE id=8");
            jdbc.update("UPDATE t_permission SET permission_name='单价维护' WHERE id=9");
            jdbc.update("UPDATE t_permission SET permission_name='我的订单' WHERE id=10");
            jdbc.update("UPDATE t_permission SET permission_name='物料采购' WHERE id=11");
            jdbc.update("UPDATE t_permission SET permission_name='裁剪管理' WHERE id=12");
            jdbc.update("UPDATE t_permission SET permission_name='生产进度' WHERE id=13");
            jdbc.update("UPDATE t_permission SET permission_name='物料对账' WHERE id=15");
            jdbc.update("UPDATE t_permission SET permission_name='成品结算' WHERE id=16");
            jdbc.update("UPDATE t_permission SET permission_name='审批付款' WHERE id=17");
            jdbc.update("UPDATE t_permission SET permission_name='人员管理' WHERE id=19");
            jdbc.update("UPDATE t_permission SET permission_name='角色管理' WHERE id=20");
            jdbc.update("UPDATE t_permission SET permission_name='加工厂管理' WHERE id=21");
            jdbc.update("UPDATE t_permission SET permission_name='登录日志' WHERE id=23");
            jdbc.update("UPDATE t_permission SET permission_name='工资支付管理' WHERE id=28713");
            jdbc.update("UPDATE t_permission SET permission_name='工资支付查看' WHERE id=28714");
            jdbc.update("UPDATE t_permission SET permission_name='结算审批' WHERE id=28715");
            jdbc.update("UPDATE t_permission SET permission_name='月度经营汇总' WHERE id=55487");
            jdbc.update("UPDATE t_permission SET permission_name='API对接管理' WHERE permission_code='MENU_TENANT_APP'");
            jdbc.update("UPDATE t_permission SET permission_name='订单转移' WHERE permission_code='MENU_ORDER_TRANSFER'");
            jdbc.update("UPDATE t_permission SET permission_name='智能运营中心' WHERE permission_code='MENU_INTELLIGENCE_CENTER'");
            jdbc.update("UPDATE t_permission SET parent_name='仪表盘' WHERE id=55487");
            jdbc.update("UPDATE t_permission SET parent_name='生产管理' WHERE id=55738");
            log.info("[EncodingFix] Permission encoding fixed successfully.");
        } catch (Exception e) {
            log.warn("[EncodingFix] Failed to fix permission encoding: {}", e.getMessage());
        }
    }

    private void fixTemplateLibraryEncoding(JdbcTemplate jdbc) {
        if (!dbHelper.tableExists("t_template_library")) {
            return;
        }
        try {
            Integer tplGarbled = jdbc.queryForObject(
                "SELECT COUNT(*) FROM t_template_library WHERE template_name REGEXP '[\\x{00C0}-\\x{00FF}]'",
                Integer.class);
            if (tplGarbled == null || tplGarbled == 0) {
                return;
            }
            log.info("[EncodingFix] Detected {} garbled template_library records, fixing...", tplGarbled);
            jdbc.update("UPDATE t_template_library SET template_name='基础工序' WHERE template_type='process' AND template_key='basic'");
            jdbc.update("UPDATE t_template_library SET template_name='针织上衣(常用)' WHERE template_type='process' AND template_key='knit-top'");
            jdbc.update("UPDATE t_template_library SET template_name='梭织衬衫(常用)' WHERE template_type='process' AND template_key='woven-shirt'");
            jdbc.update("UPDATE t_template_library SET template_name='上衣常规(国际参考)' WHERE template_type='size' AND template_key='top-basic'");
            jdbc.update("UPDATE t_template_library SET template_name='裤装常规(国际参考)' WHERE template_type='size' AND template_key='pants-basic'");
            jdbc.update("UPDATE t_template_library SET template_name='童装常规(国际参考)' WHERE template_type='size' AND template_key='kids-basic'");
            jdbc.update("UPDATE t_template_library SET template_name='通用面辅料模板(市面常用)' WHERE template_type='bom' AND template_key='market-basic'");
            jdbc.update("UPDATE t_template_library SET template_name='通用面辅料模板(针织/卫衣)' WHERE template_type='bom' AND template_key='market-knit'");
            jdbc.update("UPDATE t_template_library SET template_name='通用面辅料模板(外套/夹克)' WHERE template_type='bom' AND template_key='market-jacket'");
            jdbc.update("UPDATE t_template_library SET template_name='默认生产进度' WHERE template_type='progress' AND template_key='default'");
            log.info("[EncodingFix] Template library encoding fixed successfully.");
        } catch (Exception e) {
            log.warn("[EncodingFix] Failed to fix template library encoding: {}", e.getMessage());
        }
    }

    private void addColumnIfNotExists(JdbcTemplate jdbc, String table, String column, String definition) {
        try {
            Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
                Integer.class, table, column);
            if (count != null && count == 0) {
                jdbc.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
                log.info("Added column {}.{} to database", table, column);
            }
        } catch (Exception e) {
            log.warn("Failed to add column {}.{}: {}", table, column, e.getMessage());
        }
    }
}

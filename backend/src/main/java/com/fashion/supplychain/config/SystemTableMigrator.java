package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 系统基础表迁移器
 * 负责: t_user, t_factory, t_operation_log, t_system_operation_log, t_login_log, t_dict,
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
        createSystemOperationLogTable(jdbc);
        createOperationLogTable(jdbc);
        ensurePermissionTables();
        seedDefaultAuthData();
        ensureDictTable();
        createAdminUser(jdbc);
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
                "factory_code VARCHAR(50) NOT NULL UNIQUE COMMENT '加工厂编码'," +
                "factory_name VARCHAR(100) NOT NULL COMMENT '加工厂名称'," +
                "contact_person VARCHAR(50) COMMENT '联系人'," +
                "contact_phone VARCHAR(30) COMMENT '联系电话'," +
                "address VARCHAR(200) COMMENT '地址'," +
                "business_license VARCHAR(512) COMMENT '营业执照图片URL'," +
                "status VARCHAR(20) DEFAULT 'active' COMMENT '状态'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "INDEX idx_factory_code (factory_code)," +
                "INDEX idx_factory_name (factory_name)" +
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
        }
    }

    private void createSystemOperationLogTable(JdbcTemplate jdbc) {
        String sql = "CREATE TABLE IF NOT EXISTS t_system_operation_log (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '操作日志ID'," +
                "biz_type VARCHAR(50) NOT NULL COMMENT '业务类型'," +
                "biz_id VARCHAR(64) NOT NULL COMMENT '业务ID'," +
                "action VARCHAR(50) NOT NULL COMMENT '操作动作'," +
                "operator VARCHAR(50) COMMENT '操作人'," +
                "remark VARCHAR(255) COMMENT '备注'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "INDEX idx_system_biz (biz_type, biz_id)," +
                "INDEX idx_system_action (action)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统操作日志表'";

        try {
            jdbc.execute(sql);
        } catch (Exception e) {
            log.warn("Failed to create system operation log table: {}", e.getMessage());
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

        dbHelper.addIndexIfAbsent("t_login_log", "idx_login_time", "login_time");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_username", "username");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_login_result", "login_result");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_log_type", "log_type");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_biz", "biz_type, biz_id");
        dbHelper.addIndexIfAbsent("t_login_log", "idx_action", "action");
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
        try {
            jdbc.update("INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)", 1L, "系统管理员", "admin", "系统管理员", "active");
            jdbc.update("INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)", 2L, "财务人员", "finance", "财务人员", "active");
            jdbc.update("INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)", 3L, "生产人员", "production", "生产人员", "active");
            jdbc.update("INSERT IGNORE INTO t_role (id, role_name, role_code, description, status) VALUES (?,?,?,?,?)", 4L, "普通用户", "user", "普通用户", "active");
        } catch (Exception e) {
            log.warn("Failed to seed default roles: err={}", e.getMessage());
        }

        ensurePermission("仪表盘", "MENU_DASHBOARD", 0L, null, "menu", "/dashboard", null, 0);
        Long basicId = ensurePermission("样衣管理", "MENU_BASIC", 0L, null, "menu", null, null, 10);
        Long productionId = ensurePermission("生产管理", "MENU_PRODUCTION", 0L, null, "menu", null, null, 20);
        Long financeId = ensurePermission("财务管理", "MENU_FINANCE", 0L, null, "menu", null, null, 30);
        Long systemId = ensurePermission("系统设置", "MENU_SYSTEM", 0L, null, "menu", null, null, 40);

        if (basicId != null) {
            ensurePermission("款号资料", "MENU_STYLE_INFO", basicId, "基础资料", "menu", "/style-info", null, 11);
            ensurePermission("下单管理", "MENU_ORDER_MANAGEMENT", basicId, "基础资料", "menu", "/order-management", null, 12);
            ensurePermission("资料中心", "MENU_DATA_CENTER", basicId, "基础资料", "menu", "/data-center", null, 13);
            ensurePermission("模板中心", "MENU_TEMPLATE_CENTER", basicId, "基础资料", "menu", "/basic/template-center", null, 14);
        }
        if (productionId != null) {
            ensurePermission("我的订单", "MENU_PRODUCTION_LIST", productionId, "生产管理", "menu", "/production", null, 21);
            ensurePermission("物料采购", "MENU_MATERIAL_PURCHASE", productionId, "生产管理", "menu", "/production/material", null, 22);
            ensurePermission("裁剪管理", "MENU_CUTTING", productionId, "生产管理", "menu", "/production/cutting", null, 23);
            ensurePermission("生产进度", "MENU_PROGRESS", productionId, "生产管理", "menu", "/production/progress-detail", null, 24);
            ensurePermission("质检入库", "MENU_WAREHOUSING", productionId, "生产管理", "menu", "/production/warehousing", null, 25);
            dbHelper.ensurePermissionNameByCode("MENU_WAREHOUSING", "质检入库");
        }
        if (financeId != null) {
            ensurePermission("物料对账", "MENU_MATERIAL_RECON", financeId, "财务管理", "menu", "/finance/material-reconciliation", null, 32);
            ensurePermission("成品结算", "MENU_SHIPMENT_RECON", financeId, "财务管理", "menu", "/finance/shipment-reconciliation", null, 33);
            ensurePermission("审批付款", "MENU_PAYMENT_APPROVAL", financeId, "财务管理", "menu", "/finance/payment-approval", null, 34);
            ensurePermission("人员工序统计", "MENU_PAYROLL_OPERATOR_SUMMARY", financeId, "财务管理", "menu", "/finance/payroll-operator-summary", null, 35);
            ensurePermission("费用报销", "MENU_EXPENSE_REIMBURSEMENT", financeId, "财务管理", "menu", "/finance/expense-reimbursement", null, 36);
        }
        if (systemId != null) {
            ensurePermission("人员管理", "MENU_USER", systemId, "系统设置", "menu", "/system/user", null, 41);
            ensurePermission("角色管理", "MENU_ROLE", systemId, "系统设置", "menu", "/system/role", null, 42);
            ensurePermission("供应商管理", "MENU_FACTORY", systemId, "系统设置", "menu", "/system/factory", null, 43);
            ensurePermission("权限管理", "MENU_PERMISSION", systemId, "系统设置", "menu", "/system/permission", null, 44);
            ensurePermission("登录日志", "MENU_LOGIN_LOG", systemId, "系统设置", "menu", "/system/login-log", null, 45);
        }

        // 功能按钮权限
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

        try {
            jdbc.update("INSERT IGNORE INTO t_role_permission (role_id, permission_id) SELECT 1, id FROM t_permission");
        } catch (Exception e) {
            log.warn("Failed to seed role permissions: err={}", e.getMessage());
        }
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
}

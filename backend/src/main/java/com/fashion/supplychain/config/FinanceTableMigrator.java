package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 财务与仓库相关表迁移器
 */
@Component
@Slf4j
public class FinanceTableMigrator {

    @Autowired
    private DatabaseMigrationHelper dbHelper;

    public void initialize() {
        ensureMaterialPurchaseTable();
        ensureMaterialDatabaseTable();
        createMaterialReconciliationTable(dbHelper.getJdbcTemplate());
        ensureProductWarehousingTable();
        ensureProductOutstockTable();
        ensureShipmentReconciliationTable();
        ensureMaterialReconciliationTable();
    }

    private void ensureMaterialPurchaseTable() {
        if (dbHelper.tableExists("t_material_purchase")) {
            if (!dbHelper.columnExists("t_material_purchase", "material_id")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN material_id VARCHAR(36) COMMENT '物料ID'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "material_type")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "remark")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN remark VARCHAR(500) COMMENT '备注'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "style_id")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "style_no")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "style_name")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_name VARCHAR(100) COMMENT '款名'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "style_cover")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_cover VARCHAR(500) COMMENT '款式图片'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "delete_flag")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "receiver_id")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN receiver_id VARCHAR(36) COMMENT '收货人ID'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "receiver_name")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN receiver_name VARCHAR(100) COMMENT '收货人名称'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "received_time")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN received_time DATETIME COMMENT '收货时间'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "return_confirmed")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN return_confirmed INT DEFAULT 0 COMMENT '回料是否确认(0-否,1-是)'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "return_quantity")) {
                dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN return_quantity INT DEFAULT 0 COMMENT '回料数量'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "return_confirmer_id")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN return_confirmer_id VARCHAR(36) COMMENT '回料确认人ID'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "return_confirmer_name")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN return_confirmer_name VARCHAR(100) COMMENT '回料确认人名称'");
            }
            if (!dbHelper.columnExists("t_material_purchase", "return_confirm_time")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_purchase ADD COLUMN return_confirm_time DATETIME COMMENT '回料确认时间'");
            }
            return;
        }

        String sqlFromInit = dbHelper.loadCreateTableStatementFromInitSql("t_material_purchase");
        if (sqlFromInit != null) {
            try {
                dbHelper.getJdbcTemplate().execute(sqlFromInit);
                log.info("Table t_material_purchase checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_material_purchase table from init.sql: {}", e.getMessage());
            }
        }

        String createMaterialPurchaseTable = "CREATE TABLE IF NOT EXISTS t_material_purchase (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '采购ID'," +
                "purchase_no VARCHAR(50) NOT NULL UNIQUE COMMENT '采购单号'," +
                "material_id VARCHAR(36) COMMENT '物料ID'," +
                "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                "material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'," +
                "specifications VARCHAR(100) COMMENT '规格'," +
                "unit VARCHAR(20) NOT NULL COMMENT '单位'," +
                "purchase_quantity INT NOT NULL DEFAULT 0 COMMENT '采购数量'," +
                "arrived_quantity INT NOT NULL DEFAULT 0 COMMENT '到货数量'," +
                "supplier_id VARCHAR(36) COMMENT '供应商ID'," +
                "supplier_name VARCHAR(100) COMMENT '供应商名称'," +
                "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'," +
                "receiver_id VARCHAR(36) COMMENT '收货人ID'," +
                "receiver_name VARCHAR(100) COMMENT '收货人名称'," +
                "received_time DATETIME COMMENT '收货时间'," +
                "remark VARCHAR(500) COMMENT '备注'," +
                "order_id VARCHAR(36) COMMENT '生产订单ID'," +
                "order_no VARCHAR(50) COMMENT '生产订单号'," +
                "style_id VARCHAR(36) COMMENT '款号ID'," +
                "style_no VARCHAR(50) COMMENT '款号'," +
                "style_name VARCHAR(100) COMMENT '款名'," +
                "style_cover VARCHAR(500) COMMENT '款式图片'," +
                "return_confirmed INT DEFAULT 0 COMMENT '回料是否确认(0-否,1-是)'," +
                "return_quantity INT DEFAULT 0 COMMENT '回料数量'," +
                "return_confirmer_id VARCHAR(36) COMMENT '回料确认人ID'," +
                "return_confirmer_name VARCHAR(100) COMMENT '回料确认人名称'," +
                "return_confirm_time DATETIME COMMENT '回料确认时间'," +
                "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "INDEX idx_order_id (order_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购表'";

        try {
            dbHelper.getJdbcTemplate().execute(createMaterialPurchaseTable);
            log.info("Table t_material_purchase checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create t_material_purchase table: {}", e.getMessage());
        }

        if (!dbHelper.columnExists("t_material_purchase", "material_id")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN material_id VARCHAR(36) COMMENT '物料ID'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "material_type")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "remark")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN remark VARCHAR(500) COMMENT '备注'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "style_id")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "style_no")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "style_name")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_name VARCHAR(100) COMMENT '款名'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "style_cover")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN style_cover VARCHAR(500) COMMENT '款式图片'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "delete_flag")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "receiver_id")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN receiver_id VARCHAR(36) COMMENT '收货人ID'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "receiver_name")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN receiver_name VARCHAR(100) COMMENT '收货人名称'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "received_time")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN received_time DATETIME COMMENT '收货时间'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "return_confirmed")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN return_confirmed INT DEFAULT 0 COMMENT '回料是否确认(0-否,1-是)'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "return_quantity")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN return_quantity INT DEFAULT 0 COMMENT '回料数量'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "return_confirmer_id")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN return_confirmer_id VARCHAR(36) COMMENT '回料确认人ID'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "return_confirmer_name")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_material_purchase ADD COLUMN return_confirmer_name VARCHAR(100) COMMENT '回料确认人名称'");
        }
        if (!dbHelper.columnExists("t_material_purchase", "return_confirm_time")) {
            dbHelper.execSilently("ALTER TABLE t_material_purchase ADD COLUMN return_confirm_time DATETIME COMMENT '回料确认时间'");
        }
    }

    private void ensureMaterialDatabaseTable() {
        if (dbHelper.tableExists("t_material_database")) {
            if (!dbHelper.columnExists("t_material_database", "material_type")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN material_type VARCHAR(20) DEFAULT 'accessory' COMMENT '物料类型'");
            }
            if (!dbHelper.columnExists("t_material_database", "specifications")) {
                dbHelper.execSilently("ALTER TABLE t_material_database ADD COLUMN specifications VARCHAR(100) COMMENT '规格'");
            }
            if (!dbHelper.columnExists("t_material_database", "unit")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN unit VARCHAR(20) NOT NULL DEFAULT '' COMMENT '单位'");
            }
            if (!dbHelper.columnExists("t_material_database", "supplier_name")) {
                dbHelper.execSilently("ALTER TABLE t_material_database ADD COLUMN supplier_name VARCHAR(100) COMMENT '供应商'");
            }
            if (!dbHelper.columnExists("t_material_database", "unit_price")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'");
            }
            if (!dbHelper.columnExists("t_material_database", "description")) {
                dbHelper.execSilently("ALTER TABLE t_material_database ADD COLUMN description VARCHAR(255) COMMENT '描述'");
            }
            if (!dbHelper.columnExists("t_material_database", "image")) {
                dbHelper.execSilently("ALTER TABLE t_material_database ADD COLUMN image VARCHAR(500) COMMENT '图片URL'");
            }
            if (!dbHelper.columnExists("t_material_database", "remark")) {
                dbHelper.execSilently("ALTER TABLE t_material_database ADD COLUMN remark VARCHAR(500) COMMENT '备注'");
            }
            if (!dbHelper.columnExists("t_material_database", "status")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'");
            }
            if (!dbHelper.columnExists("t_material_database", "completed_time")) {
                dbHelper.execSilently("ALTER TABLE t_material_database ADD COLUMN completed_time DATETIME COMMENT '完成时间'");
            }
            if (!dbHelper.columnExists("t_material_database", "return_reason")) {
                dbHelper.execSilently("ALTER TABLE t_material_database ADD COLUMN return_reason VARCHAR(255) COMMENT '退回原因'");
            }
            if (!dbHelper.columnExists("t_material_database", "delete_flag")) {
                dbHelper.execSilently(
                        "ALTER TABLE t_material_database ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
            }
            return;
        }

        String createTable = "CREATE TABLE IF NOT EXISTS t_material_database (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '物料ID'," +
                "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                "style_no VARCHAR(50) COMMENT '款号'," +
                "material_type VARCHAR(20) DEFAULT 'accessory' COMMENT '物料类型'," +
                "specifications VARCHAR(100) COMMENT '规格'," +
                "unit VARCHAR(20) NOT NULL COMMENT '单位'," +
                "supplier_name VARCHAR(100) COMMENT '供应商'," +
                "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "description VARCHAR(255) COMMENT '描述'," +
                "image VARCHAR(500) COMMENT '图片URL'," +
                "remark VARCHAR(500) COMMENT '备注'," +
                "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'," +
                "completed_time DATETIME COMMENT '完成时间'," +
                "return_reason VARCHAR(255) COMMENT '退回原因'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "INDEX idx_material_code (material_code)," +
                "INDEX idx_style_no (style_no)," +
                "INDEX idx_supplier_name (supplier_name)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='面辅料数据库';";

        dbHelper.execSilently(createTable);
    }

    private void ensureShipmentReconciliationTable() {
        if (!dbHelper.tableExists("t_shipment_reconciliation")) {
            String createShipmentReconciliationTable = "CREATE TABLE IF NOT EXISTS t_shipment_reconciliation (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '对账ID'," +
                    "reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号'," +
                    "customer_id VARCHAR(36) COMMENT '客户ID'," +
                    "customer_name VARCHAR(100) NOT NULL COMMENT '客户名称'," +
                    "style_id VARCHAR(36) COMMENT '款号ID'," +
                    "style_no VARCHAR(50) COMMENT '款号'," +
                    "style_name VARCHAR(100) COMMENT '款名'," +
                    "order_id VARCHAR(36) COMMENT '订单ID'," +
                    "order_no VARCHAR(50) COMMENT '订单号'," +
                    "quantity INT DEFAULT 0 COMMENT '数量'," +
                    "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                    "total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'," +
                    "deduction_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '扣款项金额'," +
                    "final_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '最终金额'," +
                    "reconciliation_date DATETIME COMMENT '对账日期'," +
                    "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'," +
                    "remark VARCHAR(255) COMMENT '备注'," +
                    "verified_at DATETIME COMMENT '验证时间'," +
                    "approved_at DATETIME COMMENT '批准时间'," +
                    "paid_at DATETIME COMMENT '付款时间'," +
                    "re_review_at DATETIME COMMENT '重审时间'," +
                    "re_review_reason VARCHAR(255) COMMENT '重审原因'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "create_by VARCHAR(36) COMMENT '创建人'," +
                    "update_by VARCHAR(36) COMMENT '更新人'," +
                    "INDEX idx_status (status)," +
                    "INDEX idx_reconciliation_no (reconciliation_no)," +
                    "INDEX idx_customer_name (customer_name)," +
                    "INDEX idx_style_no (style_no)," +
                    "INDEX idx_order_no (order_no)," +
                    "INDEX idx_create_time (create_time)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成品出货对账单表'";

            try {
                dbHelper.getJdbcTemplate().execute(createShipmentReconciliationTable);
                log.info("Table t_shipment_reconciliation checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_shipment_reconciliation table: {}", e.getMessage());
            }

            return;
        }

        if (dbHelper.columnExists("t_shipment_reconciliation", "customer")
                && !dbHelper.columnExists("t_shipment_reconciliation", "customer_name")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation CHANGE customer customer_name VARCHAR(100) NOT NULL COMMENT '客户名称'");
        }

        dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation MODIFY COLUMN id VARCHAR(36)");

        if (!dbHelper.columnExists("t_shipment_reconciliation", "reconciliation_no")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "customer_id")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN customer_id VARCHAR(36) COMMENT '客户ID'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "customer_name")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN customer_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '客户名称'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "style_id")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "style_no")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "style_name")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN style_name VARCHAR(100) COMMENT '款名'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "order_id")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN order_id VARCHAR(36) COMMENT '订单ID'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "order_no")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN order_no VARCHAR(50) COMMENT '订单号'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "quantity")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN quantity INT DEFAULT 0 COMMENT '数量'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "unit_price")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "total_amount")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "deduction_amount")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN deduction_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '扣款项金额'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "final_amount")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN final_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '最终金额'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "reconciliation_date")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN reconciliation_date DATETIME COMMENT '对账日期'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "status")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "remark")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN remark VARCHAR(255) COMMENT '备注'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "create_time")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "update_time")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "create_by")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN create_by VARCHAR(36) COMMENT '创建人'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "update_by")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN update_by VARCHAR(36) COMMENT '更新人'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "paid_at")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN paid_at DATETIME COMMENT '付款时间'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "verified_at")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN verified_at DATETIME COMMENT '验证时间'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "approved_at")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN approved_at DATETIME COMMENT '批准时间'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "re_review_at")) {
            dbHelper.execSilently("ALTER TABLE t_shipment_reconciliation ADD COLUMN re_review_at DATETIME COMMENT '重审时间'");
        }
        if (!dbHelper.columnExists("t_shipment_reconciliation", "re_review_reason")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_shipment_reconciliation ADD COLUMN re_review_reason VARCHAR(255) COMMENT '重审原因'");
        }

        dbHelper.addIndexIfAbsent("t_shipment_reconciliation", "idx_status", "status");
        dbHelper.addIndexIfAbsent("t_shipment_reconciliation", "idx_reconciliation_no", "reconciliation_no");
        dbHelper.addIndexIfAbsent("t_shipment_reconciliation", "idx_customer_name", "customer_name");
        dbHelper.addIndexIfAbsent("t_shipment_reconciliation", "idx_style_no", "style_no");
        dbHelper.addIndexIfAbsent("t_shipment_reconciliation", "idx_order_no", "order_no");
        dbHelper.addIndexIfAbsent("t_shipment_reconciliation", "idx_create_time", "create_time");
    }

    private void ensureMaterialReconciliationTable() {
        if (!dbHelper.tableExists("t_material_reconciliation")) {
            String createMaterialReconciliationTable = "CREATE TABLE IF NOT EXISTS t_material_reconciliation (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '对账ID'," +
                    "reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号'," +
                    "supplier_id VARCHAR(36) NOT NULL COMMENT '供应商ID'," +
                    "supplier_name VARCHAR(100) NOT NULL COMMENT '供应商名称'," +
                    "material_id VARCHAR(36) NOT NULL COMMENT '物料ID'," +
                    "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                    "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                    "purchase_id VARCHAR(36) COMMENT '采购单ID'," +
                    "purchase_no VARCHAR(50) COMMENT '采购单号'," +
                    "order_id VARCHAR(36) COMMENT '订单ID'," +
                    "order_no VARCHAR(50) COMMENT '订单号'," +
                    "style_id VARCHAR(36) COMMENT '款号ID'," +
                    "style_no VARCHAR(50) COMMENT '款号'," +
                    "style_name VARCHAR(100) COMMENT '款名'," +
                    "quantity INT DEFAULT 0 COMMENT '数量'," +
                    "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                    "total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'," +
                    "deduction_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '扣款项'," +
                    "final_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '最终金额'," +
                    "reconciliation_date VARCHAR(20) COMMENT '对账日期'," +
                    "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态'," +
                    "remark VARCHAR(255) COMMENT '备注'," +
                    "verified_at DATETIME COMMENT '验证时间'," +
                    "approved_at DATETIME COMMENT '批准时间'," +
                    "paid_at DATETIME COMMENT '付款时间'," +
                    "re_review_at DATETIME COMMENT '重审时间'," +
                    "re_review_reason VARCHAR(255) COMMENT '重审原因'," +
                    "delete_flag INT DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "create_by VARCHAR(36) COMMENT '创建人'," +
                    "update_by VARCHAR(36) COMMENT '更新人'," +
                    "INDEX idx_mr_order_no (order_no)," +
                    "INDEX idx_mr_style_no (style_no)," +
                    "INDEX idx_mr_create_time (create_time)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购对账单表';";

            try {
                dbHelper.getJdbcTemplate().execute(createMaterialReconciliationTable);
                log.info("Table t_material_reconciliation checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_material_reconciliation table: {}", e.getMessage());
            }

            return;
        }

        if (!dbHelper.columnExists("t_material_reconciliation", "order_id")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN order_id VARCHAR(36) COMMENT '订单ID'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "order_no")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN order_no VARCHAR(50) COMMENT '订单号'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "style_id")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN style_id VARCHAR(36) COMMENT '款号ID'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "style_no")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN style_no VARCHAR(50) COMMENT '款号'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "style_name")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN style_name VARCHAR(100) COMMENT '款名'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "create_by")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN create_by VARCHAR(36) COMMENT '创建人'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "update_by")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN update_by VARCHAR(36) COMMENT '更新人'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "paid_at")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN paid_at DATETIME COMMENT '付款时间'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "verified_at")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN verified_at DATETIME COMMENT '验证时间'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "approved_at")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN approved_at DATETIME COMMENT '批准时间'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "re_review_at")) {
            dbHelper.execSilently("ALTER TABLE t_material_reconciliation ADD COLUMN re_review_at DATETIME COMMENT '重审时间'");
        }
        if (!dbHelper.columnExists("t_material_reconciliation", "re_review_reason")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_material_reconciliation ADD COLUMN re_review_reason VARCHAR(255) COMMENT '重审原因'");
        }

        dbHelper.addIndexIfAbsent("t_material_reconciliation", "idx_mr_order_no", "order_no");
        dbHelper.addIndexIfAbsent("t_material_reconciliation", "idx_mr_style_no", "style_no");
    }

    private void createMaterialReconciliationTable(JdbcTemplate jdbc) {
        String createMaterialReconciliationTable = "CREATE TABLE IF NOT EXISTS t_material_reconciliation (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '对账ID'," +
                "reconciliation_no VARCHAR(50) NOT NULL UNIQUE COMMENT '对账单号'," +
                "supplier_id VARCHAR(36) NOT NULL COMMENT '供应商ID'," +
                "supplier_name VARCHAR(100) NOT NULL COMMENT '供应商名称'," +
                "material_id VARCHAR(36) NOT NULL COMMENT '物料ID'," +
                "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                "purchase_id VARCHAR(36) COMMENT '采购单ID'," +
                "purchase_no VARCHAR(50) COMMENT '采购单号'," +
                "order_id VARCHAR(36) COMMENT '订单ID'," +
                "order_no VARCHAR(50) COMMENT '订单号'," +
                "style_id VARCHAR(36) COMMENT '款号ID'," +
                "style_no VARCHAR(50) COMMENT '款号'," +
                "style_name VARCHAR(100) COMMENT '款名'," +
                "quantity INT DEFAULT 0 COMMENT '数量'," +
                "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "total_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '总金额'," +
                "deduction_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '扣款项'," +
                "final_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '最终金额'," +
                "reconciliation_date VARCHAR(20) COMMENT '对账日期'," +
                "status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending-待审核，verified-已验证，approved-已批准，paid-已付款，rejected-已拒绝'," +
                "remark VARCHAR(255) COMMENT '备注'," +
                "verified_at DATETIME COMMENT '验证时间'," +
                "approved_at DATETIME COMMENT '批准时间'," +
                "paid_at DATETIME COMMENT '付款时间'," +
                "re_review_at DATETIME COMMENT '重审时间'," +
                "re_review_reason VARCHAR(255) COMMENT '重审原因'," +
                "delete_flag INT DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_mr_order_no (order_no)," +
                "INDEX idx_mr_style_no (style_no)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物料采购对账单表';";

        try {
            jdbc.execute(createMaterialReconciliationTable);
        } catch (Exception e) {
            log.warn("Failed to create t_material_reconciliation table: {}", e.getMessage());
        }
    }

    private void ensureProductWarehousingTable() {
        JdbcTemplate jdbc = dbHelper.getJdbcTemplate();

        if (!dbHelper.tableExists("t_product_warehousing")) {
            String createProductWarehousingTable = "CREATE TABLE IF NOT EXISTS t_product_warehousing (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '入库ID'," +
                    "warehousing_no VARCHAR(50) NOT NULL COMMENT '入库单号'," +
                    "order_id VARCHAR(36) NOT NULL COMMENT '生产订单ID'," +
                    "order_no VARCHAR(50) NOT NULL COMMENT '生产订单号'," +
                    "style_id VARCHAR(36) NOT NULL COMMENT '款号ID'," +
                    "style_no VARCHAR(50) NOT NULL COMMENT '款号'," +
                    "style_name VARCHAR(100) NOT NULL COMMENT '款名'," +
                    "warehousing_quantity INT NOT NULL DEFAULT 0 COMMENT '入库数量'," +
                    "qualified_quantity INT NOT NULL DEFAULT 0 COMMENT '合格数量'," +
                    "unqualified_quantity INT NOT NULL DEFAULT 0 COMMENT '不合格数量'," +
                    "warehousing_type VARCHAR(20) DEFAULT 'manual' COMMENT '入库类型'," +
                    "warehouse VARCHAR(50) COMMENT '仓库'," +
                    "quality_status VARCHAR(20) DEFAULT 'qualified' COMMENT '质检状态'," +
                    "cutting_bundle_id VARCHAR(36) COMMENT '裁剪扎号ID'," +
                    "cutting_bundle_no INT COMMENT '裁剪扎号序号'," +
                    "cutting_bundle_qr_code VARCHAR(200) COMMENT '裁剪扎号二维码内容'," +
                    "unqualified_image_urls TEXT COMMENT '不合格图片URL列表'," +
                    "defect_category VARCHAR(64) COMMENT '次品类别'," +
                    "defect_remark VARCHAR(500) COMMENT '次品备注'," +
                    "repair_remark VARCHAR(255) COMMENT '返修备注'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                    "INDEX idx_order_id (order_id)," +
                    "INDEX idx_order_no (order_no)," +
                    "INDEX idx_style_no (style_no)," +
                    "INDEX idx_create_time (create_time)," +
                    "INDEX idx_cutting_bundle_id (cutting_bundle_id)," +
                    "INDEX idx_warehousing_no (warehousing_no)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='质检入库表'";

            try {
                jdbc.execute(createProductWarehousingTable);
                log.info("Table t_product_warehousing checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_product_warehousing table: {}", e.getMessage());
            }

            return;
        }

        // Rename old columns if they exist
        if (dbHelper.columnExists("t_product_warehousing", "warehouse_no")
                && !dbHelper.columnExists("t_product_warehousing", "warehousing_no")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing CHANGE warehouse_no warehousing_no VARCHAR(50) NOT NULL COMMENT '入库单号'");
        }
        if (dbHelper.columnExists("t_product_warehousing", "production_order_id")
                && !dbHelper.columnExists("t_product_warehousing", "order_id")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing CHANGE production_order_id order_id VARCHAR(36) NOT NULL COMMENT '生产订单ID'");
        }
        if (dbHelper.columnExists("t_product_warehousing", "production_order_no")
                && !dbHelper.columnExists("t_product_warehousing", "order_no")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing CHANGE production_order_no order_no VARCHAR(50) NOT NULL COMMENT '生产订单号'");
        }
        if (dbHelper.columnExists("t_product_warehousing", "quantity")
                && !dbHelper.columnExists("t_product_warehousing", "warehousing_quantity")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing CHANGE quantity warehousing_quantity INT NOT NULL DEFAULT 0 COMMENT '入库数量'");
        }

        dbHelper.execSilently("ALTER TABLE t_product_warehousing MODIFY COLUMN id VARCHAR(36)");

        if (!dbHelper.columnExists("t_product_warehousing", "warehousing_no")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN warehousing_no VARCHAR(50) NOT NULL COMMENT '入库单号'");
        }

        // Cleanup unique indexes on warehousing_no
        try {
            java.util.List<java.util.Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT DISTINCT INDEX_NAME FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 't_product_warehousing' AND column_name = 'warehousing_no' AND non_unique = 0");
            if (rows != null) {
                for (java.util.Map<String, Object> r : rows) {
                    if (r == null) continue;
                    String idx = r.get("INDEX_NAME") == null ? null : String.valueOf(r.get("INDEX_NAME"));
                    idx = idx == null ? null : idx.trim();
                    if (!org.springframework.util.StringUtils.hasText(idx)) continue;
                    if ("PRIMARY".equalsIgnoreCase(idx)) continue;
                    dbHelper.execSilently("ALTER TABLE t_product_warehousing DROP INDEX " + idx);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to cleanup warehousing unique indexes: err={}", e.getMessage());
        }

        // Add missing columns
        if (!dbHelper.columnExists("t_product_warehousing", "order_id")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN order_id VARCHAR(36) NOT NULL DEFAULT '' COMMENT '生产订单ID'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "order_no")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN order_no VARCHAR(50) NOT NULL DEFAULT '' COMMENT '生产订单号'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "style_id")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN style_id VARCHAR(36) NOT NULL DEFAULT '' COMMENT '款号ID'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "style_no")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN style_no VARCHAR(50) NOT NULL DEFAULT '' COMMENT '款号'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "style_name")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN style_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '款名'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "warehousing_quantity")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN warehousing_quantity INT NOT NULL DEFAULT 0 COMMENT '入库数量'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "qualified_quantity")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN qualified_quantity INT NOT NULL DEFAULT 0 COMMENT '合格数量'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "unqualified_quantity")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN unqualified_quantity INT NOT NULL DEFAULT 0 COMMENT '不合格数量'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "receiver_id")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN receiver_id VARCHAR(36) NULL COMMENT '领取人ID'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "receiver_name")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN receiver_name VARCHAR(50) NULL COMMENT '领取人名称'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "received_time")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN received_time DATETIME NULL COMMENT '领取时间'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "inspection_status")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN inspection_status VARCHAR(20) NULL COMMENT '验收状态'"
                            + " AFTER repair_remark");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "warehousing_type")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN warehousing_type VARCHAR(20) DEFAULT 'manual' COMMENT '入库类型'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "warehouse")) {
            dbHelper.execSilently("ALTER TABLE t_product_warehousing ADD COLUMN warehouse VARCHAR(50) COMMENT '仓库'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "quality_status")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN quality_status VARCHAR(20) DEFAULT 'qualified' COMMENT '质检状态'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "cutting_bundle_id")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN cutting_bundle_id VARCHAR(36) COMMENT '裁剪扎号ID'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "cutting_bundle_no")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN cutting_bundle_no INT COMMENT '裁剪扎号序号'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "cutting_bundle_qr_code")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN cutting_bundle_qr_code VARCHAR(200) COMMENT '裁剪扎号二维码内容'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "unqualified_image_urls")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN unqualified_image_urls TEXT COMMENT '不合格图片URL列表'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "defect_category")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN defect_category VARCHAR(64) COMMENT '次品类别'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "defect_remark")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN defect_remark VARCHAR(500) COMMENT '次品备注'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "repair_remark")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN repair_remark VARCHAR(255) COMMENT '返修备注'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "create_time")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "update_time")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
        }
        if (!dbHelper.columnExists("t_product_warehousing", "delete_flag")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_warehousing ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
        }

        dbHelper.addIndexIfAbsent("t_product_warehousing", "idx_order_id", "order_id");
        dbHelper.addIndexIfAbsent("t_product_warehousing", "idx_order_no", "order_no");
        dbHelper.addIndexIfAbsent("t_product_warehousing", "idx_style_no", "style_no");
        dbHelper.addIndexIfAbsent("t_product_warehousing", "idx_create_time", "create_time");
        dbHelper.addIndexIfAbsent("t_product_warehousing", "idx_cutting_bundle_id", "cutting_bundle_id");
        dbHelper.addIndexIfAbsent("t_product_warehousing", "idx_warehousing_no", "warehousing_no");
    }

    private void ensureProductOutstockTable() {
        if (!dbHelper.tableExists("t_product_outstock")) {
            String createProductOutstockTable = "CREATE TABLE IF NOT EXISTS t_product_outstock (" +
                    "id VARCHAR(36) PRIMARY KEY COMMENT '出库ID'," +
                    "outstock_no VARCHAR(50) NOT NULL UNIQUE COMMENT '出库单号'," +
                    "order_id VARCHAR(36) NOT NULL COMMENT '订单ID'," +
                    "order_no VARCHAR(50) NOT NULL COMMENT '订单号'," +
                    "style_id VARCHAR(36) COMMENT '款号ID'," +
                    "style_no VARCHAR(50) COMMENT '款号'," +
                    "style_name VARCHAR(100) COMMENT '款名'," +
                    "outstock_quantity INT NOT NULL DEFAULT 0 COMMENT '出库数量'," +
                    "outstock_type VARCHAR(20) DEFAULT 'shipment' COMMENT '出库类型'," +
                    "warehouse VARCHAR(50) COMMENT '仓库'," +
                    "remark VARCHAR(255) COMMENT '备注'," +
                    "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                    "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                    "delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'," +
                    "INDEX idx_order_id (order_id)," +
                    "INDEX idx_order_no (order_no)," +
                    "INDEX idx_style_no (style_no)," +
                    "INDEX idx_create_time (create_time)" +
                    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成品出库表'";

            try {
                dbHelper.getJdbcTemplate().execute(createProductOutstockTable);
                log.info("Table t_product_outstock checked/created.");
            } catch (Exception e) {
                log.warn("Failed to create t_product_outstock table: {}", e.getMessage());
            }
            return;
        }

        dbHelper.execSilently("ALTER TABLE t_product_outstock MODIFY COLUMN id VARCHAR(36)");
        if (!dbHelper.columnExists("t_product_outstock", "outstock_no")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_outstock ADD COLUMN outstock_no VARCHAR(50) NOT NULL UNIQUE COMMENT '出库单号'");
        }
        if (!dbHelper.columnExists("t_product_outstock", "outstock_type")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_outstock ADD COLUMN outstock_type VARCHAR(20) DEFAULT 'shipment' COMMENT '出库类型'");
        }
        if (!dbHelper.columnExists("t_product_outstock", "delete_flag")) {
            dbHelper.execSilently(
                    "ALTER TABLE t_product_outstock ADD COLUMN delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标识：0-未删除，1-已删除'");
        }
    }
}

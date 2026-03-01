package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 生产相关表迁移器
 */
@Slf4j
@Component
public class ProductionTableMigrator {

    @Autowired
    private DatabaseMigrationHelper dbHelper;

    public void initialize() {
        createProductionOrderTable(dbHelper.getJdbcTemplate());
        ensureScanRecordTable();
        ensurePayrollSettlementTable();
        ensurePayrollSettlementItemTable();
        ensureCuttingBundleTable();
        ensureProductionOrderTable();
        ensureCuttingTaskTable();
    }

    private void ensureScanRecordTable() {
        // If table exists and has old columns → rename to backup
        if (dbHelper.tableExists("t_scan_record")) {
            if (dbHelper.columnExists("t_scan_record", "production_order_no")
                    || dbHelper.columnExists("t_scan_record", "production_order_id")) {
                log.warn("t_scan_record 表结构过旧(含 production_order_no/production_order_id)，重命名为备份表");
                dbHelper.execSilently("RENAME TABLE t_scan_record TO t_scan_record_backup_" + System.currentTimeMillis());
            }
        }

        // If table doesn't exist → try load from init.sql
        if (!dbHelper.tableExists("t_scan_record")) {
            dbHelper.loadCreateTableStatementFromInitSql("t_scan_record");
            return;
        }

        // Modify id to VARCHAR(36)
        dbHelper.execSilently("ALTER TABLE t_scan_record MODIFY COLUMN id VARCHAR(36)");

        // Add columns if absent
        if (!dbHelper.columnExists("t_scan_record", "scan_code")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN scan_code VARCHAR(200)");
        }
        if (!dbHelper.columnExists("t_scan_record", "request_id")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN request_id VARCHAR(64)");
        }
        if (!dbHelper.columnExists("t_scan_record", "order_id")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN order_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_scan_record", "order_no")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN order_no VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_scan_record", "style_id")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN style_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_scan_record", "style_no")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN style_no VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_scan_record", "color")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN color VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_scan_record", "quantity")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN quantity INT DEFAULT 0");
        }
        if (!dbHelper.columnExists("t_scan_record", "unit_price")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN unit_price DECIMAL(10,2)");
        }
        if (!dbHelper.columnExists("t_scan_record", "total_amount")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN total_amount DECIMAL(10,2)");
        }
        if (!dbHelper.columnExists("t_scan_record", "settlement_status")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN settlement_status VARCHAR(20)");
        }
        if (!dbHelper.columnExists("t_scan_record", "payroll_settlement_id")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN payroll_settlement_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_scan_record", "process_code")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN process_code VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_scan_record", "process_name")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN process_name VARCHAR(100)");
        }
        if (!dbHelper.columnExists("t_scan_record", "progress_stage")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN progress_stage VARCHAR(100)");
        }
        if (!dbHelper.columnExists("t_scan_record", "operator_id")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN operator_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_scan_record", "operator_name")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN operator_name VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_scan_record", "scan_type")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN scan_type VARCHAR(20) DEFAULT 'production'");
        }
        if (!dbHelper.columnExists("t_scan_record", "scan_result")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN scan_result VARCHAR(20) DEFAULT 'success'");
        }
        if (!dbHelper.columnExists("t_scan_record", "remark")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN remark VARCHAR(255)");
        }
        if (!dbHelper.columnExists("t_scan_record", "cutting_bundle_id")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN cutting_bundle_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_scan_record", "cutting_bundle_no")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN cutting_bundle_no INT");
        }
        if (!dbHelper.columnExists("t_scan_record", "cutting_bundle_qr_code")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN cutting_bundle_qr_code VARCHAR(200)");
        }
        if (!dbHelper.columnExists("t_scan_record", "size")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN size VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_scan_record", "scan_time")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN scan_time DATETIME DEFAULT CURRENT_TIMESTAMP");
        }
        if (!dbHelper.columnExists("t_scan_record", "scan_ip")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN scan_ip VARCHAR(20)");
        }
        if (!dbHelper.columnExists("t_scan_record", "create_time")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP");
        }
        if (!dbHelper.columnExists("t_scan_record", "update_time")) {
            dbHelper.execSilently("ALTER TABLE t_scan_record ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
        }

        // Modify scan_code to VARCHAR(200) if it already exists
        dbHelper.execSilently("ALTER TABLE t_scan_record MODIFY COLUMN scan_code VARCHAR(200)");

        // Update progress_stage from process_name where applicable
        if (dbHelper.columnExists("t_scan_record", "progress_stage")
                && dbHelper.columnExists("t_scan_record", "process_name")) {
            dbHelper.execSilently("UPDATE t_scan_record SET progress_stage = process_name "
                    + "WHERE (progress_stage IS NULL OR progress_stage = '') "
                    + "AND process_name IS NOT NULL AND process_name != ''");
        }

        // Drop old unique index
        dbHelper.dropIndexIfExists("t_scan_record", "uk_scan_code_process");

        // Add unique keys
        dbHelper.addUniqueKeyIfAbsent("t_scan_record", "uk_scan_request_id", "request_id");
        // 唯一键按子工序名(process_code)去重，而非父节点名(progress_stage)
        // 原因：动态映射后多个子工序共用同一父节点（如 剪线/质检/整烫 → 尾部），按 progress_stage 会冲突
        dbHelper.dropIndexIfExists("t_scan_record", "uk_bundle_stage");
        dbHelper.dropIndexIfExists("t_scan_record", "uk_bundle_stage_progress");
        dbHelper.addUniqueKeyIfAbsent("t_scan_record", "uk_bundle_process", "cutting_bundle_id, scan_type, process_code");

        // Add indexes
        dbHelper.addIndexIfAbsent("t_scan_record", "idx_request_id", "request_id");
        dbHelper.addIndexIfAbsent("t_scan_record", "idx_payroll_settlement_id", "payroll_settlement_id");
    }

    private void ensurePayrollSettlementTable() {
        if (!dbHelper.tableExists("t_payroll_settlement")) {
            dbHelper.loadCreateTableStatementFromInitSql("t_payroll_settlement");
            return;
        }

        // Modify id to VARCHAR(36)
        dbHelper.execSilently("ALTER TABLE t_payroll_settlement MODIFY COLUMN id VARCHAR(36)");

        // Add columns if absent
        if (!dbHelper.columnExists("t_payroll_settlement", "settlement_no")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN settlement_no VARCHAR(50) NOT NULL");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "order_id")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN order_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "order_no")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN order_no VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "style_id")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN style_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "style_no")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN style_no VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "style_name")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN style_name VARCHAR(100)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "start_time")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN start_time DATETIME");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "end_time")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN end_time DATETIME");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "total_quantity")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN total_quantity INT DEFAULT 0");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "total_amount")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN total_amount DECIMAL(10,2) DEFAULT 0.00");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "status")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN status VARCHAR(20)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "remark")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN remark VARCHAR(255)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "create_time")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "update_time")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "create_by")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN create_by VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement", "update_by")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement ADD COLUMN update_by VARCHAR(36)");
        }

        // Add unique key and indexes
        dbHelper.addUniqueKeyIfAbsent("t_payroll_settlement", "uk_payroll_settlement_no", "settlement_no");
        dbHelper.addIndexIfAbsent("t_payroll_settlement", "idx_payroll_order_no", "order_no");
        dbHelper.addIndexIfAbsent("t_payroll_settlement", "idx_payroll_style_no", "style_no");
        dbHelper.addIndexIfAbsent("t_payroll_settlement", "idx_payroll_create_time", "create_time");
    }

    private void ensurePayrollSettlementItemTable() {
        if (!dbHelper.tableExists("t_payroll_settlement_item")) {
            dbHelper.loadCreateTableStatementFromInitSql("t_payroll_settlement_item");
            return;
        }

        // Modify id to VARCHAR(36)
        dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item MODIFY COLUMN id VARCHAR(36)");

        // Add columns if absent
        if (!dbHelper.columnExists("t_payroll_settlement_item", "settlement_id")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN settlement_id VARCHAR(36) NOT NULL");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "operator_id")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN operator_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "operator_name")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN operator_name VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "process_name")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN process_name VARCHAR(100)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "quantity")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN quantity INT DEFAULT 0");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "unit_price")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN unit_price DECIMAL(10,2)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "total_amount")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN total_amount DECIMAL(10,2)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "order_id")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN order_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "order_no")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN order_no VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "style_no")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN style_no VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "scan_type")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN scan_type VARCHAR(20)");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "create_time")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP");
        }
        if (!dbHelper.columnExists("t_payroll_settlement_item", "update_time")) {
            dbHelper.execSilently("ALTER TABLE t_payroll_settlement_item ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
        }

        // Add indexes
        dbHelper.addIndexIfAbsent("t_payroll_settlement_item", "idx_payroll_item_settlement_id", "settlement_id");
        dbHelper.addIndexIfAbsent("t_payroll_settlement_item", "idx_payroll_item_operator_id", "operator_id");
        dbHelper.addIndexIfAbsent("t_payroll_settlement_item", "idx_payroll_item_order_no", "order_no");
        dbHelper.addIndexIfAbsent("t_payroll_settlement_item", "idx_payroll_item_style_no", "style_no");
    }

    private void ensureCuttingBundleTable() {
        if (!dbHelper.tableExists("t_cutting_bundle")) {
            try {
                dbHelper.loadCreateTableStatementFromInitSql("t_cutting_bundle");
            } catch (Exception e) {
                log.info("从 init.sql 加载 t_cutting_bundle 失败，使用内置建表语句");
                dbHelper.execSilently("CREATE TABLE t_cutting_bundle ("
                        + "id VARCHAR(36) PRIMARY KEY, "
                        + "production_order_id VARCHAR(36) NOT NULL, "
                        + "production_order_no VARCHAR(50) NOT NULL, "
                        + "style_id VARCHAR(36) NOT NULL, "
                        + "style_no VARCHAR(50) NOT NULL, "
                        + "color VARCHAR(50), "
                        + "size VARCHAR(50), "
                        + "bundle_no INT NOT NULL, "
                        + "quantity INT DEFAULT 0, "
                        + "qr_code VARCHAR(200) NOT NULL UNIQUE, "
                        + "status VARCHAR(20) DEFAULT 'created', "
                        + "create_time DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "INDEX idx_order_id (production_order_id), "
                        + "INDEX idx_order_no (production_order_no), "
                        + "INDEX idx_style_no (style_no)"
                        + ")");
            }
            return;
        }

        // If table exists, add missing columns
        if (!dbHelper.columnExists("t_cutting_bundle", "qr_code")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN qr_code VARCHAR(200)");
        }
        if (!dbHelper.columnExists("t_cutting_bundle", "production_order_id")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN production_order_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_cutting_bundle", "production_order_no")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN production_order_no VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_cutting_bundle", "style_id")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN style_id VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_cutting_bundle", "style_no")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN style_no VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_cutting_bundle", "bundle_no")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN bundle_no INT");
        }
        if (!dbHelper.columnExists("t_cutting_bundle", "quantity")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN quantity INT DEFAULT 0");
        }
        if (!dbHelper.columnExists("t_cutting_bundle", "status")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN status VARCHAR(20) DEFAULT 'created'");
        }
        if (!dbHelper.columnExists("t_cutting_bundle", "create_time")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN create_time DATETIME DEFAULT CURRENT_TIMESTAMP");
        }
        if (!dbHelper.columnExists("t_cutting_bundle", "update_time")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_bundle ADD COLUMN update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
        }
    }

    private void ensureProductionOrderTable() {
        if (!dbHelper.tableExists("t_production_order")) {
            return;
        }

        if (!dbHelper.columnExists("t_production_order", "qr_code")) {
            dbHelper.execSilently("ALTER TABLE t_production_order ADD COLUMN qr_code VARCHAR(100)");
        }
        if (!dbHelper.columnExists("t_production_order", "color")) {
            dbHelper.execSilently("ALTER TABLE t_production_order ADD COLUMN color VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_production_order", "size")) {
            dbHelper.execSilently("ALTER TABLE t_production_order ADD COLUMN size VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_production_order", "order_details")) {
            dbHelper.execSilently("ALTER TABLE t_production_order ADD COLUMN order_details LONGTEXT");
        }
        if (!dbHelper.columnExists("t_production_order", "progress_workflow_json")) {
            dbHelper.execSilently("ALTER TABLE t_production_order ADD COLUMN progress_workflow_json LONGTEXT");
        }
        if (!dbHelper.columnExists("t_production_order", "progress_workflow_locked")) {
            dbHelper.execSilently("ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked INT DEFAULT 0");
        }
        if (!dbHelper.columnExists("t_production_order", "progress_workflow_locked_at")) {
            dbHelper.execSilently("ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_at DATETIME");
        }
        if (!dbHelper.columnExists("t_production_order", "progress_workflow_locked_by")) {
            dbHelper.execSilently("ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_by VARCHAR(36)");
        }
        if (!dbHelper.columnExists("t_production_order", "progress_workflow_locked_by_name")) {
            dbHelper.execSilently("ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_by_name VARCHAR(50)");
        }
    }

    private void createProductionOrderTable(JdbcTemplate jdbc) {
        dbHelper.execSilently("CREATE TABLE IF NOT EXISTS t_production_order ("
                + "id VARCHAR(36) PRIMARY KEY, "
                + "order_no VARCHAR(50) NOT NULL UNIQUE, "
                + "qr_code VARCHAR(100), "
                + "style_id VARCHAR(36) NOT NULL, "
                + "style_no VARCHAR(50) NOT NULL, "
                + "style_name VARCHAR(100) NOT NULL, "
                + "color VARCHAR(50), "
                + "size VARCHAR(50), "
                + "order_details LONGTEXT, "
                + "progress_workflow_json LONGTEXT, "
                + "progress_workflow_locked INT DEFAULT 0, "
                + "progress_workflow_locked_at DATETIME, "
                + "progress_workflow_locked_by VARCHAR(36), "
                + "progress_workflow_locked_by_name VARCHAR(50), "
                + "factory_id VARCHAR(36) NOT NULL, "
                + "factory_name VARCHAR(100) NOT NULL, "
                + "order_quantity INT DEFAULT 0, "
                + "completed_quantity INT DEFAULT 0, "
                + "material_arrival_rate INT DEFAULT 0, "
                + "production_progress INT DEFAULT 0, "
                + "status VARCHAR(20) DEFAULT 'pending', "
                + "planned_start_date DATETIME, "
                + "planned_end_date DATETIME, "
                + "actual_start_date DATETIME, "
                + "actual_end_date DATETIME, "
                + "delete_flag INT DEFAULT 0, "
                + "create_time DATETIME DEFAULT CURRENT_TIMESTAMP, "
                + "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                + ")");
    }

    private void ensureCuttingTaskTable() {
        if (!dbHelper.tableExists("t_cutting_task")) {
            dbHelper.execSilently("CREATE TABLE t_cutting_task ("
                    + "id VARCHAR(36) PRIMARY KEY, "
                    + "production_order_id VARCHAR(36) NOT NULL, "
                    + "production_order_no VARCHAR(50) NOT NULL, "
                    + "order_qr_code VARCHAR(100), "
                    + "style_id VARCHAR(36) NOT NULL, "
                    + "style_no VARCHAR(50) NOT NULL, "
                    + "style_name VARCHAR(100), "
                    + "color VARCHAR(50), "
                    + "size VARCHAR(50), "
                    + "order_quantity INT DEFAULT 0, "
                    + "status VARCHAR(20) DEFAULT 'pending', "
                    + "receiver_id VARCHAR(36), "
                    + "receiver_name VARCHAR(50), "
                    + "received_time DATETIME, "
                    + "bundled_time DATETIME, "
                    + "create_time DATETIME DEFAULT CURRENT_TIMESTAMP, "
                    + "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                    + "UNIQUE KEY uk_order_id (production_order_id), "
                    + "INDEX idx_order_no (production_order_no), "
                    + "INDEX idx_style_no (style_no), "
                    + "INDEX idx_status (status)"
                    + ")");
            return;
        }

        // If table exists, add missing columns
        if (!dbHelper.columnExists("t_cutting_task", "order_qr_code")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_task ADD COLUMN order_qr_code VARCHAR(100)");
        }
        if (!dbHelper.columnExists("t_cutting_task", "bundled_time")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_task ADD COLUMN bundled_time DATETIME");
        }
        if (!dbHelper.columnExists("t_cutting_task", "color")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_task ADD COLUMN color VARCHAR(50)");
        }
        if (!dbHelper.columnExists("t_cutting_task", "size")) {
            dbHelper.execSilently("ALTER TABLE t_cutting_task ADD COLUMN size VARCHAR(50)");
        }
    }
}

package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 款式相关表迁移器
 * 负责: t_style_info, t_style_bom, t_style_size, t_style_process, t_style_quotation,
 *       t_style_attachment, t_style_operation_log
 */
@Component
@Slf4j
public class StyleTableMigrator {

    @Autowired
    private DatabaseMigrationHelper dbHelper;

    public void initialize() {
        JdbcTemplate jdbc = dbHelper.getJdbcTemplate();
        createStyleTables(jdbc);
        migrateStyleInfo();
        migrateStyleBom();
        migrateStyleSize();
        migrateStyleProcess();
        migrateStyleQuotation();
        migrateStyleAttachment();
    }

    private void createStyleTables(JdbcTemplate jdbc) {
        String createStyleInfoTable = "CREATE TABLE IF NOT EXISTS t_style_info (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '款号ID'," +
                "style_no VARCHAR(50) NOT NULL UNIQUE COMMENT '款号'," +
                "style_name VARCHAR(100) NOT NULL COMMENT '款名'," +
                "category VARCHAR(20) NOT NULL COMMENT '品类：WOMAN-女装，MAN-男装，KID-童装'," +
                "year INT COMMENT '年份'," +
                "month INT COMMENT '月份'," +
                "season VARCHAR(20) COMMENT '季节：SPRING-春季，SUMMER-夏季，AUTUMN-秋季，WINTER-冬季'," +
                "color VARCHAR(20) COMMENT '颜色'," +
                "size VARCHAR(20) COMMENT '码数'," +
                "price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "cycle INT DEFAULT 0 COMMENT '生产周期(天)'," +
                "cover VARCHAR(200) COMMENT '封面图片'," +
                "description TEXT COMMENT '描述'," +
                "pattern_status VARCHAR(20) COMMENT '纸样状态：IN_PROGRESS/COMPLETED'," +
                "pattern_completed_time DATETIME COMMENT '纸样完成时间'," +
                "sample_status VARCHAR(20) COMMENT '样衣状态：IN_PROGRESS/COMPLETED'," +
                "sample_progress INT DEFAULT 0 COMMENT '样衣进度(%)'," +
                "sample_completed_time DATETIME COMMENT '样衣完成时间'," +
                "status VARCHAR(20) DEFAULT 'ENABLED' COMMENT '状态：ENABLED-启用，DISABLED-禁用'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号信息表'";

        String createStyleBomTable = "CREATE TABLE IF NOT EXISTS t_style_bom (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT 'BOM ID'," +
                "style_id BIGINT NOT NULL COMMENT '款号ID'," +
                "material_code VARCHAR(50) NOT NULL COMMENT '物料编码'," +
                "material_name VARCHAR(100) NOT NULL COMMENT '物料名称'," +
                "material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'," +
                "color VARCHAR(20) COMMENT '颜色'," +
                "specification VARCHAR(100) COMMENT '规格'," +
                "size VARCHAR(20) COMMENT '尺码/规格'," +
                "unit VARCHAR(20) NOT NULL COMMENT '单位'," +
                "usage_amount DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT '单件用量'," +
                "loss_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT '损耗率(%)'," +
                "unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'," +
                "total_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '总价'," +
                "supplier VARCHAR(100) COMMENT '供应商'," +
                "remark VARCHAR(200) COMMENT '备注'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号BOM表'";

        String createStyleSizeTable = "CREATE TABLE IF NOT EXISTS t_style_size (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '尺寸ID'," +
                "style_id BIGINT NOT NULL COMMENT '款号ID'," +
                "size_name VARCHAR(20) NOT NULL COMMENT '尺码名称'," +
                "part_name VARCHAR(50) NOT NULL COMMENT '部位名称'," +
                "measure_method VARCHAR(50) COMMENT '度量方式'," +
                "standard_value DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '标准数值'," +
                "tolerance DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '公差'," +
                "sort INT NOT NULL DEFAULT 0 COMMENT '排序'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号尺寸表'";

        String createStyleProcessTable = "CREATE TABLE IF NOT EXISTS t_style_process (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '工序ID'," +
                "style_id BIGINT NOT NULL COMMENT '款号ID'," +
                "process_code VARCHAR(50) NOT NULL COMMENT '工序编码'," +
                "process_name VARCHAR(100) NOT NULL COMMENT '工序名称'," +
                "machine_type VARCHAR(50) COMMENT '机器类型'," +
                "standard_time INT NOT NULL DEFAULT 0 COMMENT '标准工时(秒)'," +
                "price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '工价(元)'," +
                "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序号'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号工序表'";

        String createStyleQuotationTable = "CREATE TABLE IF NOT EXISTS t_style_quotation (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '报价单ID'," +
                "style_id BIGINT NOT NULL UNIQUE COMMENT '款号ID'," +
                "material_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '物料总成本'," +
                "process_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '工序总成本'," +
                "other_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '其它费用'," +
                "profit_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT '目标利润率(%)'," +
                "total_cost DECIMAL(10,2) DEFAULT 0.00 COMMENT '总成本'," +
                "total_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '报价'," +
                "currency VARCHAR(20) COMMENT '币种'," +
                "version VARCHAR(20) COMMENT '版本号'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号报价单表'";

        String createStyleAttachmentTable = "CREATE TABLE IF NOT EXISTS t_style_attachment (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '附件ID'," +
                "style_id VARCHAR(36) NOT NULL COMMENT '款号ID'," +
                "file_name VARCHAR(100) NOT NULL COMMENT '文件名'," +
                "file_type VARCHAR(200) NOT NULL COMMENT '文件类型'," +
                "biz_type VARCHAR(20) DEFAULT 'general' COMMENT '业务类型：general/pattern/sample'," +
                "file_size BIGINT NOT NULL COMMENT '文件大小(字节)'," +
                "file_url VARCHAR(200) NOT NULL COMMENT '文件URL'," +
                "uploader VARCHAR(50) COMMENT '上传人'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'," +
                "INDEX idx_style_id (style_id)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号附件表'";

        String createStyleOperationLogTable = "CREATE TABLE IF NOT EXISTS t_style_operation_log (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '操作日志ID'," +
                "style_id BIGINT NOT NULL COMMENT '款号ID'," +
                "biz_type VARCHAR(20) NOT NULL COMMENT '业务类型：sample/pattern'," +
                "action VARCHAR(50) NOT NULL COMMENT '操作动作'," +
                "operator VARCHAR(50) COMMENT '操作人'," +
                "remark VARCHAR(255) COMMENT '备注'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "INDEX idx_style_id (style_id)," +
                "INDEX idx_biz_type (biz_type)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='款号操作日志表'";

        String createTemplateOperationLogTable = "CREATE TABLE IF NOT EXISTS t_template_operation_log (" +
                "id VARCHAR(36) PRIMARY KEY COMMENT '操作日志ID'," +
                "template_id VARCHAR(36) NOT NULL COMMENT '模板ID'," +
                "action VARCHAR(50) NOT NULL COMMENT '操作动作'," +
                "operator VARCHAR(50) COMMENT '操作人'," +
                "remark VARCHAR(255) COMMENT '备注'," +
                "create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'," +
                "INDEX idx_template_id (template_id)," +
                "INDEX idx_action (action)" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板操作日志表'";

        try {
            jdbc.execute(createStyleInfoTable);
            jdbc.execute(createStyleBomTable);
            jdbc.execute(createStyleSizeTable);
            jdbc.execute(createStyleProcessTable);
            jdbc.execute(createStyleQuotationTable);
            jdbc.execute(createStyleAttachmentTable);
            jdbc.execute(createStyleOperationLogTable);
            jdbc.execute(createTemplateOperationLogTable);
            log.info("Style tables and operation log tables checked/created.");
        } catch (Exception e) {
            log.warn("Failed to create style tables: {}", e.getMessage());
        }
    }

    private void migrateStyleInfo() {
        if (!dbHelper.tableExists("t_style_info")) return;
        if (!dbHelper.columnExists("t_style_info", "month"))
            dbHelper.execSilently("ALTER TABLE t_style_info ADD COLUMN month INT COMMENT '月份'");
        if (!dbHelper.columnExists("t_style_info", "color"))
            dbHelper.execSilently("ALTER TABLE t_style_info ADD COLUMN color VARCHAR(20) COMMENT '颜色'");
        if (!dbHelper.columnExists("t_style_info", "size"))
            dbHelper.execSilently("ALTER TABLE t_style_info ADD COLUMN size VARCHAR(20) COMMENT '码数'");
        if (!dbHelper.columnExists("t_style_info", "pattern_status"))
            dbHelper.execSilently("ALTER TABLE t_style_info ADD COLUMN pattern_status VARCHAR(20) COMMENT '纸样状态：IN_PROGRESS/COMPLETED'");
        if (!dbHelper.columnExists("t_style_info", "pattern_completed_time"))
            dbHelper.execSilently("ALTER TABLE t_style_info ADD COLUMN pattern_completed_time DATETIME COMMENT '纸样完成时间'");
        if (!dbHelper.columnExists("t_style_info", "sample_status"))
            dbHelper.execSilently("ALTER TABLE t_style_info ADD COLUMN sample_status VARCHAR(20) COMMENT '样衣状态：IN_PROGRESS/COMPLETED'");
        if (!dbHelper.columnExists("t_style_info", "sample_progress"))
            dbHelper.execSilently("ALTER TABLE t_style_info ADD COLUMN sample_progress INT DEFAULT 0 COMMENT '样衣进度(%)'");
        if (!dbHelper.columnExists("t_style_info", "sample_completed_time"))
            dbHelper.execSilently("ALTER TABLE t_style_info ADD COLUMN sample_completed_time DATETIME COMMENT '样衣完成时间'");
    }

    private void migrateStyleBom() {
        if (!dbHelper.tableExists("t_style_bom")) return;
        dbHelper.execSilently("ALTER TABLE t_style_bom MODIFY COLUMN id VARCHAR(36)");
        if (!dbHelper.columnExists("t_style_bom", "usage_amount") && dbHelper.columnExists("t_style_bom", "consumption"))
            dbHelper.execSilently("ALTER TABLE t_style_bom CHANGE consumption usage_amount DECIMAL(10,4) NOT NULL DEFAULT 0");
        else if (!dbHelper.columnExists("t_style_bom", "usage_amount"))
            dbHelper.execSilently("ALTER TABLE t_style_bom ADD COLUMN usage_amount DECIMAL(10,4) NOT NULL DEFAULT 0");
        if (!dbHelper.columnExists("t_style_bom", "material_type"))
            dbHelper.execSilently("ALTER TABLE t_style_bom ADD COLUMN material_type VARCHAR(20) DEFAULT 'fabric' COMMENT '物料类型：fabric-面料，accessory-辅料'");
        if (!dbHelper.columnExists("t_style_bom", "supplier"))
            dbHelper.execSilently("ALTER TABLE t_style_bom ADD COLUMN supplier VARCHAR(100)");
        if (!dbHelper.columnExists("t_style_bom", "remark"))
            dbHelper.execSilently("ALTER TABLE t_style_bom ADD COLUMN remark VARCHAR(200)");
        if (!dbHelper.columnExists("t_style_bom", "size"))
            dbHelper.execSilently("ALTER TABLE t_style_bom ADD COLUMN size VARCHAR(20)");
        if (!dbHelper.columnExists("t_style_bom", "specification"))
            dbHelper.execSilently("ALTER TABLE t_style_bom ADD COLUMN specification VARCHAR(100)");
    }

    private void migrateStyleSize() {
        if (!dbHelper.tableExists("t_style_size")) return;
        dbHelper.execSilently("ALTER TABLE t_style_size MODIFY COLUMN id VARCHAR(36)");
        if (!dbHelper.columnExists("t_style_size", "size_name") && dbHelper.columnExists("t_style_size", "size_code"))
            dbHelper.execSilently("ALTER TABLE t_style_size CHANGE size_code size_name VARCHAR(20) NOT NULL");
        else if (!dbHelper.columnExists("t_style_size", "size_name"))
            dbHelper.execSilently("ALTER TABLE t_style_size ADD COLUMN size_name VARCHAR(20) NOT NULL DEFAULT ''");
        if (!dbHelper.columnExists("t_style_size", "standard_value") && dbHelper.columnExists("t_style_size", "part_value"))
            dbHelper.execSilently("ALTER TABLE t_style_size CHANGE part_value standard_value DECIMAL(10,2) NOT NULL DEFAULT 0");
        else if (!dbHelper.columnExists("t_style_size", "standard_value"))
            dbHelper.execSilently("ALTER TABLE t_style_size ADD COLUMN standard_value DECIMAL(10,2) NOT NULL DEFAULT 0");
        if (!dbHelper.columnExists("t_style_size", "tolerance"))
            dbHelper.execSilently("ALTER TABLE t_style_size ADD COLUMN tolerance DECIMAL(10,2) NOT NULL DEFAULT 0");
        if (!dbHelper.columnExists("t_style_size", "sort"))
            dbHelper.execSilently("ALTER TABLE t_style_size ADD COLUMN sort INT NOT NULL DEFAULT 0");
        if (!dbHelper.columnExists("t_style_size", "measure_method"))
            dbHelper.execSilently("ALTER TABLE t_style_size ADD COLUMN measure_method VARCHAR(50) COMMENT '度量方式'");
    }

    private void migrateStyleProcess() {
        if (!dbHelper.tableExists("t_style_process")) return;
        dbHelper.execSilently("ALTER TABLE t_style_process MODIFY COLUMN id VARCHAR(36)");
        if (!dbHelper.columnExists("t_style_process", "sort_order") && dbHelper.columnExists("t_style_process", "process_order"))
            dbHelper.execSilently("ALTER TABLE t_style_process CHANGE process_order sort_order INT NOT NULL DEFAULT 0");
        else if (!dbHelper.columnExists("t_style_process", "sort_order"))
            dbHelper.execSilently("ALTER TABLE t_style_process ADD COLUMN sort_order INT NOT NULL DEFAULT 0");
        if (!dbHelper.columnExists("t_style_process", "price") && dbHelper.columnExists("t_style_process", "unit_price"))
            dbHelper.execSilently("ALTER TABLE t_style_process CHANGE unit_price price DECIMAL(10,2) NOT NULL DEFAULT 0");
        else if (!dbHelper.columnExists("t_style_process", "price"))
            dbHelper.execSilently("ALTER TABLE t_style_process ADD COLUMN price DECIMAL(10,2) NOT NULL DEFAULT 0");
        if (!dbHelper.columnExists("t_style_process", "machine_type"))
            dbHelper.execSilently("ALTER TABLE t_style_process ADD COLUMN machine_type VARCHAR(50)");
        if (!dbHelper.columnExists("t_style_process", "standard_time"))
            dbHelper.execSilently("ALTER TABLE t_style_process ADD COLUMN standard_time INT NOT NULL DEFAULT 0");
    }

    private void migrateStyleQuotation() {
        if (!dbHelper.tableExists("t_style_quotation")) return;
        dbHelper.execSilently("ALTER TABLE t_style_quotation MODIFY COLUMN id VARCHAR(36)");
        if (!dbHelper.columnExists("t_style_quotation", "total_price") && dbHelper.columnExists("t_style_quotation", "quoted_price"))
            dbHelper.execSilently("ALTER TABLE t_style_quotation CHANGE quoted_price total_price DECIMAL(10,2) NOT NULL DEFAULT 0");
        else if (!dbHelper.columnExists("t_style_quotation", "total_price"))
            dbHelper.execSilently("ALTER TABLE t_style_quotation ADD COLUMN total_price DECIMAL(10,2) NOT NULL DEFAULT 0");
        if (!dbHelper.columnExists("t_style_quotation", "currency"))
            dbHelper.execSilently("ALTER TABLE t_style_quotation ADD COLUMN currency VARCHAR(20)");
        if (!dbHelper.columnExists("t_style_quotation", "version"))
            dbHelper.execSilently("ALTER TABLE t_style_quotation ADD COLUMN version VARCHAR(20)");
    }

    private void migrateStyleAttachment() {
        if (!dbHelper.tableExists("t_style_attachment")) return;
        dbHelper.execSilently("ALTER TABLE t_style_attachment MODIFY COLUMN id VARCHAR(36)");
        if (dbHelper.columnExists("t_style_attachment", "file_type"))
            dbHelper.execSilently("ALTER TABLE t_style_attachment MODIFY COLUMN file_type VARCHAR(200) NOT NULL COMMENT '文件类型'");
        if (!dbHelper.columnExists("t_style_attachment", "uploader"))
            dbHelper.execSilently("ALTER TABLE t_style_attachment ADD COLUMN uploader VARCHAR(50)");
        if (!dbHelper.columnExists("t_style_attachment", "biz_type"))
            dbHelper.execSilently("ALTER TABLE t_style_attachment ADD COLUMN biz_type VARCHAR(20) DEFAULT 'general' COMMENT '业务类型：general/pattern/sample'");
    }
}

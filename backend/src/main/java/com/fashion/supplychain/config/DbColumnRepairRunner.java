package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import com.fashion.supplychain.service.RedisService;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * 启动时自动修复关键业务表可能缺失的列。
 * 独立于 Flyway 运行——即使 Flyway 迁移被阻塞/跳过，本 Runner 也能保证关键列存在。
 * 所有操作均为幂等（先查 INFORMATION_SCHEMA，不存在才 ALTER TABLE）。
 */
@Component
@Order(10)
@Slf4j
public class DbColumnRepairRunner implements ApplicationRunner {

    @Autowired
    private DataSource dataSource;

    @Autowired(required = false)
    private RedisService redisService;

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection()) {
            String schema = conn.getCatalog();
            int repaired = 0;

            repaired += ensureColumn(conn, schema, "t_user", "factory_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '外发工厂ID'");
            repaired += ensureColumn(conn, schema, "t_user", "is_factory_owner",
                    "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为外发工厂主账号'");
            repaired += ensureColumn(conn, schema, "t_user", "org_unit_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '所属组织节点ID'");
            repaired += ensureColumn(conn, schema, "t_user", "org_unit_name",
                    "VARCHAR(100) DEFAULT NULL COMMENT '所属组织节点名称'");
            repaired += ensureColumn(conn, schema, "t_user", "org_path",
                    "VARCHAR(500) DEFAULT NULL COMMENT '所属组织路径'");
            repaired += ensureColumn(conn, schema, "t_user", "avatar_url",
                    "VARCHAR(255) DEFAULT NULL COMMENT '用户头像URL'");

            repaired += ensureColumn(conn, schema, "t_material_purchase", "evidence_image_urls",
                    "TEXT DEFAULT NULL COMMENT '回料确认凭证图片URLs（逗号分隔）'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "fabric_composition",
                    "VARCHAR(500) DEFAULT NULL COMMENT '面料成分（从物料资料库同步）'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "invoice_urls",
                    "TEXT DEFAULT NULL COMMENT '发票/单据图片URL列表(JSON数组)，用于财务留底'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "conversion_rate",
                    "DECIMAL(10,4) DEFAULT NULL COMMENT '米重换算值（米/公斤，参考值）'");
            repaired += ensureColumn(conn, schema, "t_material_database", "conversion_rate",
                    "DECIMAL(10,4) DEFAULT NULL COMMENT '米重换算值（米/公斤，参考值）'");
            repaired += ensureColumn(conn, schema, "t_material_stock", "conversion_rate",
                    "DECIMAL(10,4) DEFAULT NULL COMMENT '米重换算值（米/公斤，参考值）'");
                repaired += ensureColumn(conn, schema, "t_material_purchase", "audit_status",
                    "VARCHAR(32) DEFAULT NULL COMMENT '初审状态: pending_audit=待初审 passed=初审通过 rejected=初审驳回'");
                repaired += ensureColumn(conn, schema, "t_material_purchase", "audit_reason",
                    "VARCHAR(500) DEFAULT NULL COMMENT '初审驳回原因'");
                repaired += ensureColumn(conn, schema, "t_material_purchase", "audit_time",
                    "DATETIME DEFAULT NULL COMMENT '初审操作时间'");
                repaired += ensureColumn(conn, schema, "t_material_purchase", "audit_operator_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '初审操作人ID'");
                repaired += ensureColumn(conn, schema, "t_material_purchase", "audit_operator_name",
                    "VARCHAR(100) DEFAULT NULL COMMENT '初审操作人姓名'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "fabric_width",
                    "VARCHAR(100) DEFAULT NULL COMMENT '面料门幅'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "fabric_weight",
                    "VARCHAR(100) DEFAULT NULL COMMENT '面料克重'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "supplier_contact_person",
                    "VARCHAR(50) DEFAULT NULL COMMENT '供应商联系人'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "supplier_contact_phone",
                    "VARCHAR(20) DEFAULT NULL COMMENT '供应商联系电话'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "return_confirmed",
                    "TINYINT(1) DEFAULT NULL COMMENT '是否确认退货'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "return_quantity",
                    "INT DEFAULT NULL COMMENT '退货数量'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "return_confirmer_id",
                    "VARCHAR(36) DEFAULT NULL COMMENT '退货确认人ID'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "return_confirmer_name",
                    "VARCHAR(50) DEFAULT NULL COMMENT '退货确认人姓名'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "return_confirm_time",
                    "DATETIME DEFAULT NULL COMMENT '退货确认时间'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "expected_ship_date",
                    "DATE DEFAULT NULL COMMENT '预计发货日期'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "source_type",
                    "VARCHAR(20) DEFAULT NULL COMMENT '来源类型'");
            repaired += ensureColumn(conn, schema, "t_material_purchase", "pattern_production_id",
                    "VARCHAR(36) DEFAULT NULL COMMENT '关联样板生产ID'");

                repaired += ensureColumn(conn, schema, "t_mind_push_rule", "notify_time_start",
                    "VARCHAR(5) NOT NULL DEFAULT '08:00' COMMENT '推送开始时间 HH:mm'");
                repaired += ensureColumn(conn, schema, "t_mind_push_rule", "notify_time_end",
                    "VARCHAR(5) NOT NULL DEFAULT '22:00' COMMENT '推送结束时间 HH:mm'");

            repaired += ensureColumn(conn, schema, "t_style_info", "development_source_type",
                    "VARCHAR(32) DEFAULT NULL COMMENT '开发来源类型：SELF_DEVELOPED / SELECTION_CENTER'");
            repaired += ensureColumn(conn, schema, "t_style_info", "development_source_detail",
                    "VARCHAR(64) DEFAULT NULL COMMENT '开发来源明细：自主开发 / 选品中心'");
            repaired += ensureColumn(conn, schema, "t_style_info", "size_color_config",
                    "MEDIUMTEXT DEFAULT NULL COMMENT '颜色尺码数量矩阵JSON'");
            repaired += ensureColumnType(conn, schema, "t_style_info", "size_color_config",
                    "mediumtext", "MODIFY COLUMN `size_color_config` MEDIUMTEXT DEFAULT NULL COMMENT '颜色尺码数量矩阵JSON'");
            repaired += ensureColumn(conn, schema, "t_style_info", "image_insight",
                    "VARCHAR(500) DEFAULT NULL COMMENT 'AI图片洞察'");
            repaired += ensureColumn(conn, schema, "t_style_info", "fabric_composition",
                    "VARCHAR(500) DEFAULT NULL COMMENT '面料成分，如：70%棉 30%涤纶'");
            repaired += ensureColumn(conn, schema, "t_style_info", "wash_instructions",
                    "VARCHAR(500) DEFAULT NULL COMMENT '洗涤说明，如：30°C水洗，不可漂白'");
            repaired += ensureColumn(conn, schema, "t_style_info", "u_code",
                    "VARCHAR(100) DEFAULT NULL COMMENT 'U编码/品质追溯码，用于吊牌打印'");
            repaired += ensureColumn(conn, schema, "t_style_info", "wash_temp_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '洗涤温度代码：W30/W40/W60/W95/HAND/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "bleach_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '漂白代码：ANY/NON_CHL/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "tumble_dry_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '烘干代码：NORMAL/LOW/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "iron_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '熨烫代码：LOW/MED/HIGH/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "dry_clean_code",
                    "VARCHAR(20) DEFAULT NULL COMMENT '干洗代码：YES/NO'");
            repaired += ensureColumn(conn, schema, "t_style_info", "fabric_composition_parts",
                    "TEXT DEFAULT NULL COMMENT '多部位面料成分JSON:[{part,materials}]'");
            repaired += ensureColumn(conn, schema, "t_style_info", "update_by",
                    "VARCHAR(100) DEFAULT NULL COMMENT '最后维护人'");
            repaired += ensureColumn(conn, schema, "t_style_info", "description_locked",
                    "INT NOT NULL DEFAULT 1 COMMENT '制单锁定:1=已锁定,0=退回可编辑'");
            repaired += ensureColumn(conn, schema, "t_style_info", "description_return_comment",
                    "VARCHAR(500) DEFAULT NULL COMMENT '制单退回备注'");
            repaired += ensureColumn(conn, schema, "t_style_info", "description_return_by",
                    "VARCHAR(100) DEFAULT NULL COMMENT '制单退回人'");
            repaired += ensureColumn(conn, schema, "t_style_info", "description_return_time",
                    "DATETIME DEFAULT NULL COMMENT '制单退回时间'");
            repaired += ensureColumn(conn, schema, "t_style_info", "pattern_rev_locked",
                    "INT NOT NULL DEFAULT 0 COMMENT '纸样修改锁定:1=已提交,0=可提交'");
            repaired += ensureColumn(conn, schema, "t_style_info", "pattern_rev_return_comment",
                    "VARCHAR(500) DEFAULT NULL COMMENT '纸样退回备注'");
            repaired += ensureColumn(conn, schema, "t_style_info", "pattern_rev_return_by",
                    "VARCHAR(100) DEFAULT NULL COMMENT '纸样退回人'");
            repaired += ensureColumn(conn, schema, "t_style_info", "pattern_rev_return_time",
                    "DATETIME DEFAULT NULL COMMENT '纸样退回时间'");
            repaired += ensureColumn(conn, schema, "t_style_info", "pushed_by_name",
                    "VARCHAR(50) DEFAULT NULL COMMENT '推版人姓名'");
            // sample_review_* 字段：V10 因 DELIMITER $$ 语法在 JDBC 环境不支持，云端实际未执行，需启动自愈补齐
            repaired += ensureColumn(conn, schema, "t_style_info", "sample_review_status",
                    "VARCHAR(20) DEFAULT NULL COMMENT '样衣审核状态: PASS/REWORK/REJECT'");
            repaired += ensureColumn(conn, schema, "t_style_info", "sample_review_comment",
                    "TEXT DEFAULT NULL COMMENT '样衣审核评语（选填）'");
            repaired += ensureColumn(conn, schema, "t_style_info", "sample_reviewer",
                    "VARCHAR(100) DEFAULT NULL COMMENT '审核人'");
            repaired += ensureColumn(conn, schema, "t_style_info", "sample_review_time",
                    "DATETIME DEFAULT NULL COMMENT '审核时间'");
            repaired += ensureColumn(conn, schema, "t_style_bom", "image_urls",
                    "TEXT DEFAULT NULL COMMENT '物料图片URLs(JSON数组)' ");
            repaired += ensureColumn(conn, schema, "t_style_bom", "fabric_composition",
                    "VARCHAR(100) DEFAULT NULL COMMENT '物料成分，优先从面辅料资料带入' ");
            repaired += ensureColumn(conn, schema, "t_style_bom", "fabric_weight",
                    "VARCHAR(50) DEFAULT NULL COMMENT '克重'");
            repaired += ensureColumn(conn, schema, "t_style_bom", "group_name",
                    "VARCHAR(100) DEFAULT NULL COMMENT '分组名称（如：上衣、裤子、亲子装-大人款）'");
            repaired += ensureColumn(conn, schema, "t_style_bom", "size_usage_map",
                    "TEXT DEFAULT NULL COMMENT '码数用量配比(JSON，格式：{\"S\":1.5,\"M\":1.6,\"L\":1.7}，为空则统一用usageAmount)'");
            repaired += ensureColumn(conn, schema, "t_style_bom", "pattern_size_usage_map",
                    "TEXT DEFAULT NULL COMMENT '纸样录入各码用量(JSON，原始单位)'");
            repaired += ensureColumn(conn, schema, "t_style_bom", "size_spec_map",
                    "TEXT DEFAULT NULL COMMENT '各码规格尺寸(JSON，常用于拉链长度cm)'");
            repaired += ensureColumn(conn, schema, "t_style_bom", "pattern_unit",
                    "VARCHAR(20) DEFAULT NULL COMMENT '纸样录入单位'");
            repaired += ensureColumn(conn, schema, "t_style_bom", "conversion_rate",
                    "DECIMAL(10,4) DEFAULT NULL COMMENT '换算系数：1个纸样录入单位=x个BOM单位'");
            repaired += ensureColumn(conn, schema, "t_style_bom", "dev_usage_amount",
                    "DECIMAL(18,4) DEFAULT NULL COMMENT '开发用量（开发阶段预估用量，输入后自动带入单件用量）'");
            repaired += ensureColumn(conn, schema, "t_style_size", "image_urls",
                    "TEXT DEFAULT NULL COMMENT '部位参考图片URLs(JSON数组)' ");
            repaired += ensureColumn(conn, schema, "t_style_size", "group_name",
                    "VARCHAR(50) DEFAULT NULL COMMENT '尺寸分组名，如上装区/下装区' ");
            repaired += ensureColumn(conn, schema, "t_style_size", "base_size",
                    "VARCHAR(50) DEFAULT NULL COMMENT '基准码/样衣码' ");
            repaired += ensureColumn(conn, schema, "t_style_size", "grading_rule",
                    "TEXT DEFAULT NULL COMMENT '跳码规则JSON' ");
            repaired += ensureColumnType(conn, schema, "t_style_size", "tolerance",
                    "varchar", "MODIFY COLUMN `tolerance` VARCHAR(50) DEFAULT NULL");
                repaired += ensureColumn(conn, schema, "t_cutting_task", "factory_type",
                    "VARCHAR(20) DEFAULT NULL COMMENT '工厂类型：internal=内部工厂 external=外发工厂'");
                repaired += ensureColumn(conn, schema, "t_product_warehousing", "repair_status",
                    "VARCHAR(30) DEFAULT NULL COMMENT '返修状态：pending_repair/in_repair/repaired_confirmed'");
                repaired += ensureColumn(conn, schema, "t_product_warehousing", "repair_operator_name",
                    "VARCHAR(50) DEFAULT NULL COMMENT '返修操作人姓名'");
                repaired += ensureColumn(conn, schema, "t_product_warehousing", "repair_completed_time",
                    "DATETIME DEFAULT NULL COMMENT '返修完成时间'");
                repaired += ensureColumn(conn, schema, "t_product_warehousing", "unqualified_quantity",
                    "INT NOT NULL DEFAULT 0 COMMENT '不合格数量'");
            repaired += ensureColumnType(conn, schema, "t_production_process_tracking", "id",
                    "varchar", "MODIFY COLUMN `id` VARCHAR(64) NOT NULL COMMENT '主键ID（UUID）'");

            // --- t_material_picking_item 补列 ---
            repaired += ensureColumn(conn, schema, "t_material_picking_item", "specification",
                    "VARCHAR(200) DEFAULT NULL COMMENT '规格'");
            repaired += ensureColumn(conn, schema, "t_material_picking_item", "unit_price",
                    "DECIMAL(12,2) DEFAULT NULL COMMENT '单价'");
            repaired += ensureColumn(conn, schema, "t_material_picking_item", "fabric_width",
                    "VARCHAR(100) DEFAULT NULL COMMENT '面料门幅'");
            repaired += ensureColumn(conn, schema, "t_material_picking_item", "fabric_composition",
                    "VARCHAR(500) DEFAULT NULL COMMENT '面料成分'");
            repaired += ensureColumn(conn, schema, "t_material_picking_item", "supplier_name",
                    "VARCHAR(200) DEFAULT NULL COMMENT '供应商名称'");
            repaired += ensureColumn(conn, schema, "t_material_picking_item", "warehouse_location",
                    "VARCHAR(200) DEFAULT NULL COMMENT '仓库位置'");
            repaired += ensureColumn(conn, schema, "t_material_picking_item", "material_type",
                    "VARCHAR(50) DEFAULT NULL COMMENT '物料类型'");

            // --- t_cutting_bundle 补列 ---
            repaired += ensureColumn(conn, schema, "t_cutting_bundle", "root_bundle_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '根菲号ID'");
            repaired += ensureColumn(conn, schema, "t_cutting_bundle", "parent_bundle_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '父菲号ID'");
            repaired += ensureColumn(conn, schema, "t_cutting_bundle", "source_bundle_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '来源菲号ID'");
            repaired += ensureColumn(conn, schema, "t_cutting_bundle", "bundle_label",
                    "VARCHAR(64) DEFAULT NULL COMMENT '菲号标签'");
            repaired += ensureColumn(conn, schema, "t_cutting_bundle", "split_status",
                    "VARCHAR(20) DEFAULT NULL COMMENT '拆分状态'");
            repaired += ensureColumn(conn, schema, "t_cutting_bundle", "split_seq",
                    "INT NOT NULL DEFAULT 0 COMMENT '拆分序号'");
            repaired += ensureColumn(conn, schema, "t_cutting_bundle", "bed_sub_no",
                    "INT DEFAULT NULL COMMENT '床次子序号'");
            repaired += ensureColumn(conn, schema, "t_cutting_bundle", "split_process_name",
                    "VARCHAR(100) DEFAULT NULL COMMENT '拆分工序名称'");
            repaired += ensureColumn(conn, schema, "t_cutting_bundle", "split_process_order",
                    "INT DEFAULT NULL COMMENT '拆分工序序号'");

            // --- t_intelligence_prediction_log 补列（修复云端缺失列导致预测日志写入失败）---
            repaired += ensureColumn(conn, schema, "t_intelligence_prediction_log", "factory_name",
                    "VARCHAR(128) DEFAULT NULL COMMENT '生产工厂名称'");
            repaired += ensureColumn(conn, schema, "t_intelligence_prediction_log", "daily_velocity",
                    "DOUBLE DEFAULT NULL COMMENT '日均产量（件/天）'");
            repaired += ensureColumn(conn, schema, "t_intelligence_prediction_log", "remaining_qty",
                    "BIGINT DEFAULT NULL COMMENT '预测时剩余件数'");
            repaired += ensureColumn(conn, schema, "t_intelligence_prediction_log", "delete_flag",
                    "INT NOT NULL DEFAULT 0 COMMENT '删除标记：0正常 1删除'");

            // --- t_scan_record 补列（Phase 3/5/6 扩展字段，高频业务热路径）---
            repaired += ensureColumn(conn, schema, "t_scan_record", "scan_mode",
                    "VARCHAR(20) DEFAULT NULL COMMENT '扫码模式:ORDER/BUNDLE/SKU'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "sku_completed_count",
                    "INT DEFAULT NULL COMMENT 'SKU已完成数'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "sku_total_count",
                    "INT DEFAULT NULL COMMENT 'SKU总数'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "process_unit_price",
                    "DECIMAL(12,4) DEFAULT NULL COMMENT '工序单价'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "scan_cost",
                    "DECIMAL(12,4) DEFAULT NULL COMMENT '本次扫码工序成本'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "delegate_target_type",
                    "VARCHAR(20) DEFAULT NULL COMMENT '指派目标类型:internal/external/none'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "delegate_target_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '指派目标ID'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "delegate_target_name",
                    "VARCHAR(100) DEFAULT NULL COMMENT '指派目标名称'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "actual_operator_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '实际操作员ID（追溯）'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "actual_operator_name",
                    "VARCHAR(100) DEFAULT NULL COMMENT '实际操作员名称'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "cutting_bundle_qr_code",
                    "VARCHAR(200) DEFAULT NULL COMMENT '裁剪菲号二维码原始串'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "progress_stage",
                    "VARCHAR(30) DEFAULT NULL COMMENT '生产阶段:cutting/production/quality/warehouse'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "payroll_settlement_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '关联工资结算单ID'");
            repaired += ensureColumn(conn, schema, "t_scan_record", "factory_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '扫码时归属外发工厂ID'");

            // --- t_production_order 补列（PreflightChecker已监控，RepairRunner同步覆盖）---
            repaired += ensureColumn(conn, schema, "t_production_order", "progress_workflow_json",
                    "LONGTEXT DEFAULT NULL COMMENT '生产进度工作流JSON'");
            repaired += ensureColumn(conn, schema, "t_production_order", "progress_workflow_locked",
                    "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '进度流程是否锁定'");
            repaired += ensureColumn(conn, schema, "t_production_order", "skc",
                    "VARCHAR(100) DEFAULT NULL COMMENT 'SKC编码'");
            repaired += ensureColumn(conn, schema, "t_production_order", "urgency_level",
                    "INT NOT NULL DEFAULT 0 COMMENT '紧急程度:0普通 1加急 2特急'");
            repaired += ensureColumn(conn, schema, "t_production_order", "plate_type",
                    "VARCHAR(20) DEFAULT NULL COMMENT '板型:SAMPLE/BATCH'");
            repaired += ensureColumn(conn, schema, "t_production_order", "order_biz_type",
                    "VARCHAR(30) DEFAULT NULL COMMENT '订单业务类型'");
            repaired += ensureColumn(conn, schema, "t_production_order", "factory_type",
                    "VARCHAR(20) DEFAULT NULL COMMENT '工厂类型:internal/external'");
            repaired += ensureColumn(conn, schema, "t_production_order", "procurement_manually_completed",
                    "TINYINT(1) DEFAULT NULL COMMENT '采购是否手动标记完成'");

            // --- t_payroll_settlement 补列（审核/确认字段，工资结算高频写路径）---
            repaired += ensureColumn(conn, schema, "t_payroll_settlement", "settlement_no",
                    "VARCHAR(64) DEFAULT NULL COMMENT '结算单号'");
            repaired += ensureColumn(conn, schema, "t_payroll_settlement", "auditor_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '审核人ID'");
            repaired += ensureColumn(conn, schema, "t_payroll_settlement", "auditor_name",
                    "VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名'");
            repaired += ensureColumn(conn, schema, "t_payroll_settlement", "audit_time",
                    "DATETIME DEFAULT NULL COMMENT '审核时间'");
            repaired += ensureColumn(conn, schema, "t_payroll_settlement", "confirmer_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT '确认人ID'");
            repaired += ensureColumn(conn, schema, "t_payroll_settlement", "confirmer_name",
                    "VARCHAR(100) DEFAULT NULL COMMENT '确认人姓名'");
            repaired += ensureColumn(conn, schema, "t_payroll_settlement", "confirm_time",
                    "DATETIME DEFAULT NULL COMMENT '确认时间'");
            repaired += ensureColumn(conn, schema, "t_payroll_settlement", "tenant_id",
                    "BIGINT DEFAULT NULL COMMENT '租户ID'");

            int repairedTables = 0;
                repairedTables += ensureTable(conn, schema,
                        "t_intelligence_audit_log",
                        "CREATE TABLE IF NOT EXISTS `t_intelligence_audit_log` ("
                        + "`id` VARCHAR(32) NOT NULL COMMENT '审计日志ID',"
                        + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                        + "`command_id` VARCHAR(64) DEFAULT NULL COMMENT '命令ID（关联命令）',"
                        + "`action` VARCHAR(100) DEFAULT NULL COMMENT '命令类型，如 order:hold',"
                        + "`target_id` VARCHAR(100) DEFAULT NULL COMMENT '目标对象ID，如订单号',"
                        + "`executor_id` VARCHAR(64) DEFAULT NULL COMMENT '执行人ID',"
                        + "`status` VARCHAR(32) DEFAULT 'EXECUTING' COMMENT '执行状态 EXECUTING/SUCCESS/FAILED/CANCELLED',"
                        + "`reason` VARCHAR(500) DEFAULT NULL COMMENT '命令原始理由',"
                        + "`risk_level` INT DEFAULT NULL COMMENT '风险等级 1-5',"
                        + "`result_data` TEXT DEFAULT NULL COMMENT '执行结果JSON',"
                        + "`error_message` TEXT DEFAULT NULL COMMENT '错误信息（失败时）',"
                        + "`duration_ms` BIGINT DEFAULT NULL COMMENT '执行耗时（毫秒）',"
                        + "`remark` VARCHAR(500) DEFAULT NULL COMMENT '备注',"
                        + "`created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
                        + "`requires_approval` TINYINT(1) DEFAULT 0 COMMENT '是否需要人工审批',"
                        + "`approved_by` VARCHAR(64) DEFAULT NULL COMMENT '审批人ID',"
                        + "`approved_at` DATETIME DEFAULT NULL COMMENT '审批时间',"
                        + "`approval_remark` VARCHAR(500) DEFAULT NULL COMMENT '审批备注',"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_audit_tenant_status` (`tenant_id`, `status`),"
                        + "KEY `idx_audit_command_id` (`command_id`),"
                        + "KEY `idx_audit_created_at` (`tenant_id`, `created_at`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能执行审计日志'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "created_at",
                        "DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "tenant_id",
                        "BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "command_id",
                        "VARCHAR(64) DEFAULT NULL COMMENT '命令ID（关联命令）'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "action",
                        "VARCHAR(100) DEFAULT NULL COMMENT '命令类型，如 order:hold'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "target_id",
                        "VARCHAR(100) DEFAULT NULL COMMENT '目标对象ID，如订单号'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "executor_id",
                        "VARCHAR(64) DEFAULT NULL COMMENT '执行人ID'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "status",
                        "VARCHAR(32) DEFAULT 'EXECUTING' COMMENT '执行状态 EXECUTING/SUCCESS/FAILED/CANCELLED'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "reason",
                        "VARCHAR(500) DEFAULT NULL COMMENT '命令原始理由'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "risk_level",
                        "INT DEFAULT NULL COMMENT '风险等级 1-5'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "result_data",
                        "TEXT DEFAULT NULL COMMENT '执行结果JSON'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "error_message",
                        "TEXT DEFAULT NULL COMMENT '错误信息（失败时）'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "duration_ms",
                        "BIGINT DEFAULT NULL COMMENT '执行耗时（毫秒）'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "remark",
                        "VARCHAR(500) DEFAULT NULL COMMENT '备注'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "requires_approval",
                        "TINYINT(1) DEFAULT 0 COMMENT '是否需要人工审批'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "approved_by",
                        "VARCHAR(64) DEFAULT NULL COMMENT '审批人ID'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "approved_at",
                        "DATETIME DEFAULT NULL COMMENT '审批时间'");
                repaired += ensureColumn(conn, schema, "t_intelligence_audit_log", "approval_remark",
                        "VARCHAR(500) DEFAULT NULL COMMENT '审批备注'");
                repairedTables += ensureTable(conn, schema,
                        "t_agent_meeting",
                        "CREATE TABLE IF NOT EXISTS `t_agent_meeting` ("
                        + "`id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',"
                        + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                        + "`meeting_type` VARCHAR(50) NOT NULL COMMENT '例会类型',"
                        + "`topic` VARCHAR(300) NOT NULL COMMENT '会议主题',"
                        + "`participants` VARCHAR(500) DEFAULT NULL COMMENT '参与Agent列表(JSON数组)',"
                        + "`agenda` TEXT DEFAULT NULL COMMENT '议程(JSON数组)',"
                        + "`debate_rounds` TEXT DEFAULT NULL COMMENT '辩论轮次(JSON)',"
                        + "`consensus` TEXT DEFAULT NULL COMMENT '最终共识',"
                        + "`dissent` TEXT DEFAULT NULL COMMENT '保留意见',"
                        + "`action_items` TEXT DEFAULT NULL COMMENT '行动项(JSON数组)',"
                        + "`confidence_score` INT DEFAULT NULL COMMENT '共识置信度0-100',"
                        + "`linked_decision_ids` VARCHAR(500) DEFAULT NULL COMMENT '关联决策记忆ID',"
                        + "`linked_rca_ids` VARCHAR(500) DEFAULT NULL COMMENT '关联根因分析ID',"
                        + "`duration_ms` BIGINT DEFAULT NULL COMMENT '会议耗时(毫秒)',"
                        + "`status` VARCHAR(20) DEFAULT 'concluded' COMMENT 'in_progress|concluded|actions_pending|all_done',"
                        + "`delete_flag` INT DEFAULT 0 COMMENT '删除标记',"
                        + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_am_tenant_type` (`tenant_id`, `meeting_type`),"
                        + "KEY `idx_am_create_time` (`create_time`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent例会-辩论+共识'");
                    repairedTables += ensureTable(conn, schema,
                        "t_material_pickup_record",
                        "CREATE TABLE IF NOT EXISTS `t_material_pickup_record` ("
                        + "`id` VARCHAR(64) NOT NULL COMMENT '主键UUID',"
                        + "`tenant_id` VARCHAR(64) DEFAULT NULL COMMENT '租户ID',"
                        + "`pickup_no` VARCHAR(64) NOT NULL COMMENT '领取单号（自动生成）',"
                        + "`pickup_type` VARCHAR(20) NOT NULL DEFAULT 'INTERNAL' COMMENT '领取类型：INTERNAL=内部 EXTERNAL=外部',"
                        + "`order_no` VARCHAR(100) DEFAULT NULL COMMENT '关联生产订单号',"
                        + "`style_no` VARCHAR(100) DEFAULT NULL COMMENT '关联款号',"
                        + "`material_id` VARCHAR(64) DEFAULT NULL COMMENT '物料ID',"
                        + "`material_code` VARCHAR(100) DEFAULT NULL COMMENT '物料编号',"
                        + "`material_name` VARCHAR(200) DEFAULT NULL COMMENT '物料名称',"
                        + "`material_type` VARCHAR(50) DEFAULT NULL COMMENT '物料类型',"
                        + "`color` VARCHAR(100) DEFAULT NULL COMMENT '颜色',"
                        + "`specification` VARCHAR(200) DEFAULT NULL COMMENT '规格',"
                        + "`fabric_width` VARCHAR(50) DEFAULT NULL COMMENT '幅宽',"
                        + "`fabric_weight` VARCHAR(50) DEFAULT NULL COMMENT '克重',"
                        + "`fabric_composition` VARCHAR(200) DEFAULT NULL COMMENT '成分',"
                        + "`quantity` DECIMAL(14,3) DEFAULT NULL COMMENT '领取数量',"
                        + "`unit` VARCHAR(20) DEFAULT NULL COMMENT '单位',"
                        + "`unit_price` DECIMAL(14,4) DEFAULT NULL COMMENT '单价',"
                        + "`amount` DECIMAL(14,2) DEFAULT NULL COMMENT '金额小计（数量×单价）',"
                        + "`picker_id` VARCHAR(64) DEFAULT NULL COMMENT '领取人ID',"
                        + "`picker_name` VARCHAR(100) DEFAULT NULL COMMENT '领取人姓名',"
                        + "`pickup_time` DATETIME DEFAULT NULL COMMENT '领取时间',"
                        + "`audit_status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '审核状态',"
                        + "`auditor_id` VARCHAR(64) DEFAULT NULL COMMENT '审核人ID',"
                        + "`auditor_name` VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',"
                        + "`audit_time` DATETIME DEFAULT NULL COMMENT '审核时间',"
                        + "`audit_remark` VARCHAR(500) DEFAULT NULL COMMENT '审核备注',"
                        + "`finance_status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '财务状态',"
                        + "`finance_remark` VARCHAR(500) DEFAULT NULL COMMENT '财务核算备注',"
                        + "`remark` VARCHAR(500) DEFAULT NULL COMMENT '领取备注',"
                        + "`create_time` DATETIME DEFAULT NULL COMMENT '创建时间',"
                        + "`update_time` DATETIME DEFAULT NULL COMMENT '更新时间',"
                        + "`delete_flag` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标记：0=正常 1=已删除',"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_mpick_tenant_audit` (`tenant_id`, `audit_status`),"
                        + "KEY `idx_mpick_order_style` (`order_no`, `style_no`),"
                        + "KEY `idx_mpick_finance` (`tenant_id`, `finance_status`),"
                        + "KEY `idx_mpick_create_time` (`create_time`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='面辅料领取记录'");
                    repaired += ensureColumn(conn, schema, "t_material_pickup_record", "fabric_width",
                        "VARCHAR(50) DEFAULT NULL COMMENT '幅宽'");
                    repaired += ensureColumn(conn, schema, "t_material_pickup_record", "fabric_weight",
                        "VARCHAR(50) DEFAULT NULL COMMENT '克重'");
                    repaired += ensureColumn(conn, schema, "t_material_pickup_record", "fabric_composition",
                        "VARCHAR(200) DEFAULT NULL COMMENT '成分'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "movement_type",
                                        "VARCHAR(20) DEFAULT NULL COMMENT '流向类型:OUTBOUND/INBOUND'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "source_type",
                                        "VARCHAR(30) DEFAULT NULL COMMENT '来源类型'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "usage_type",
                                        "VARCHAR(30) DEFAULT NULL COMMENT '用途类型'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "source_record_id",
                                        "VARCHAR(64) DEFAULT NULL COMMENT '来源记录ID'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "source_document_no",
                                        "VARCHAR(64) DEFAULT NULL COMMENT '来源单号'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "receiver_id",
                                        "VARCHAR(64) DEFAULT NULL COMMENT '收料人ID'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "receiver_name",
                                        "VARCHAR(100) DEFAULT NULL COMMENT '收料人姓名'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "issuer_id",
                                        "VARCHAR(64) DEFAULT NULL COMMENT '发料人ID'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "issuer_name",
                                        "VARCHAR(100) DEFAULT NULL COMMENT '发料人姓名'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "warehouse_location",
                                        "VARCHAR(200) DEFAULT NULL COMMENT '仓库库位'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "receivable_id",
                                        "VARCHAR(64) DEFAULT NULL COMMENT '关联应收ID'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "receivable_no",
                                        "VARCHAR(64) DEFAULT NULL COMMENT '关联应收单号'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "receivable_status",
                                        "VARCHAR(20) DEFAULT NULL COMMENT '应收状态'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "received_amount",
                                        "DECIMAL(14,2) DEFAULT NULL COMMENT '累计收款金额'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "received_time",
                                        "DATETIME DEFAULT NULL COMMENT '收款完成时间'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "factory_id",
                                        "VARCHAR(64) DEFAULT NULL COMMENT '生产方ID'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "factory_name",
                                        "VARCHAR(100) DEFAULT NULL COMMENT '生产方名称'");
                                repaired += ensureColumn(conn, schema, "t_material_pickup_record", "factory_type",
                                        "VARCHAR(20) DEFAULT NULL COMMENT '生产方类型:INTERNAL/EXTERNAL'");
                    repairedTables += ensureTable(conn, schema,
                    "t_hyper_advisor_session",
                    "CREATE TABLE IF NOT EXISTS `t_hyper_advisor_session` ("
                    + "`id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',"
                    + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                    + "`user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',"
                    + "`session_id` VARCHAR(128) NOT NULL COMMENT '会话ID',"
                    + "`role` VARCHAR(32) DEFAULT NULL COMMENT '消息角色（user/assistant/system）',"
                    + "`content` LONGTEXT DEFAULT NULL COMMENT '消息内容',"
                    + "`metadata_json` TEXT DEFAULT NULL COMMENT '元数据JSON',"
                    + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
                    + "`delete_flag` INT NOT NULL DEFAULT 0 COMMENT '删除标记（0正常 1删除）',"
                    + "PRIMARY KEY (`id`),"
                    + "KEY `idx_session_id` (`session_id`),"
                    + "KEY `idx_tenant_user` (`tenant_id`, `user_id`),"
                    + "KEY `idx_tenant_create` (`tenant_id`, `create_time`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='超级顾问会话记录'");
                repairedTables += ensureTable(conn, schema,
                    "t_advisor_feedback",
                    "CREATE TABLE IF NOT EXISTS `t_advisor_feedback` ("
                    + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
                    + "`tenant_id` BIGINT NOT NULL,"
                    + "`user_id` VARCHAR(64) NOT NULL,"
                    + "`session_id` VARCHAR(64) NOT NULL,"
                    + "`trace_id` VARCHAR(64) DEFAULT NULL COMMENT 'Langfuse trace ID',"
                    + "`query_text` TEXT NOT NULL COMMENT '用户原始提问',"
                    + "`advice_text` TEXT NOT NULL COMMENT 'AI建议摘要',"
                    + "`score` DOUBLE NOT NULL DEFAULT 0 COMMENT '评分 0~1（1=好建议）',"
                    + "`feedback_text` VARCHAR(500) DEFAULT NULL COMMENT '用户文字反馈',"
                    + "`harvested` TINYINT NOT NULL DEFAULT 0 COMMENT '是否已提炼为知识库条目 0=未 1=已',"
                    + "`harvested_kb_id` VARCHAR(64) DEFAULT NULL COMMENT '提炼后写入 t_knowledge_base 的记录ID',"
                    + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + "PRIMARY KEY (`id`),"
                    + "KEY `idx_feedback_harvest` (`harvested`, `score`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='超级顾问-反馈与知识提炼'");
                repairedTables += ensureTable(conn, schema,
                    "t_ai_user_profile",
                    "CREATE TABLE IF NOT EXISTS `t_ai_user_profile` ("
                    + "`id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',"
                    + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                    + "`user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',"
                    + "`behavior_summary` TEXT DEFAULT NULL COMMENT '行为摘要（AI生成）',"
                    + "`preferences_json` LONGTEXT DEFAULT NULL COMMENT '偏好JSON',"
                    + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
                    + "`update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',"
                    + "PRIMARY KEY (`id`),"
                    + "UNIQUE KEY `uk_tenant_user` (`tenant_id`, `user_id`),"
                    + "KEY `idx_tenant_id` (`tenant_id`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI用户画像'");
            repairedTables += ensureTable(conn, schema,
                    "t_purchase_order_doc",
                    "CREATE TABLE IF NOT EXISTS `t_purchase_order_doc` ("
                        + "`id` VARCHAR(36) NOT NULL,"
                        + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                        + "`order_no` VARCHAR(100) NOT NULL COMMENT '关联订单编号',"
                        + "`image_url` VARCHAR(1000) NOT NULL COMMENT '单据图片COS访问URL',"
                        + "`raw_text` TEXT DEFAULT NULL COMMENT 'AI识别原始文字',"
                        + "`match_count` INT NOT NULL DEFAULT 0 COMMENT '已匹配条目数',"
                        + "`total_recognized` INT NOT NULL DEFAULT 0 COMMENT 'AI识别出的条目总数',"
                        + "`uploader_id` VARCHAR(36) DEFAULT NULL COMMENT '上传人ID',"
                        + "`uploader_name` VARCHAR(100) DEFAULT NULL COMMENT '上传人姓名',"
                        + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',"
                        + "`delete_flag` INT NOT NULL DEFAULT 0 COMMENT '0=正常 1=删除',"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_pod_order_no` (`order_no`),"
                        + "KEY `idx_pod_tenant_id` (`tenant_id`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='采购单据上传记录表'");
            repairedTables += ensureTable(conn, schema,
                    "t_material_database",
                    "CREATE TABLE IF NOT EXISTS `t_material_database` ("
                        + "`id` VARCHAR(36) NOT NULL,"
                        + "`material_code` VARCHAR(50) NOT NULL,"
                        + "`material_name` VARCHAR(100) NOT NULL,"
                        + "`style_no` VARCHAR(50) DEFAULT NULL,"
                        + "`material_type` VARCHAR(20) DEFAULT 'accessory',"
                        + "`color` VARCHAR(50) DEFAULT NULL,"
                        + "`fabric_width` VARCHAR(50) DEFAULT NULL,"
                        + "`fabric_weight` VARCHAR(50) DEFAULT NULL,"
                        + "`fabric_composition` VARCHAR(100) DEFAULT NULL,"
                        + "`specifications` VARCHAR(100) DEFAULT NULL,"
                        + "`unit` VARCHAR(20) NOT NULL DEFAULT '',"
                        + "`supplier_id` VARCHAR(36) DEFAULT NULL,"
                        + "`supplier_name` VARCHAR(100) DEFAULT NULL,"
                        + "`supplier_contact_person` VARCHAR(100) DEFAULT NULL,"
                        + "`supplier_contact_phone` VARCHAR(50) DEFAULT NULL,"
                        + "`unit_price` DECIMAL(10,2) DEFAULT 0.00,"
                        + "`description` VARCHAR(255) DEFAULT NULL,"
                        + "`image` VARCHAR(500) DEFAULT NULL,"
                        + "`remark` VARCHAR(500) DEFAULT NULL,"
                        + "`status` VARCHAR(20) DEFAULT 'pending',"
                        + "`completed_time` DATETIME DEFAULT NULL,"
                        + "`return_reason` VARCHAR(255) DEFAULT NULL,"
                        + "`tenant_id` BIGINT DEFAULT NULL,"
                        + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,"
                        + "`update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                        + "`delete_flag` INT NOT NULL DEFAULT 0,"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_material_code` (`material_code`),"
                        + "KEY `idx_style_no` (`style_no`),"
                        + "KEY `idx_supplier_name` (`supplier_name`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='面辅料数据库'");
                repaired += ensureColumn(conn, schema, "t_material_database", "color",
                    "VARCHAR(50) DEFAULT NULL COMMENT '颜色'");
                repaired += ensureColumn(conn, schema, "t_material_database", "fabric_width",
                    "VARCHAR(50) DEFAULT NULL COMMENT '门幅'");
                repaired += ensureColumn(conn, schema, "t_material_database", "fabric_weight",
                    "VARCHAR(50) DEFAULT NULL COMMENT '克重'");
                repaired += ensureColumn(conn, schema, "t_material_database", "fabric_composition",
                    "VARCHAR(100) DEFAULT NULL COMMENT '成分'");
                repaired += ensureColumn(conn, schema, "t_material_database", "supplier_id",
                    "VARCHAR(36) DEFAULT NULL COMMENT '供应商ID'");
                repaired += ensureColumn(conn, schema, "t_material_database", "supplier_contact_person",
                    "VARCHAR(100) DEFAULT NULL COMMENT '供应商联系人'");
                repaired += ensureColumn(conn, schema, "t_material_database", "supplier_contact_phone",
                    "VARCHAR(50) DEFAULT NULL COMMENT '供应商联系电话'");
                repaired += ensureColumn(conn, schema, "t_material_database", "tenant_id",
                    "BIGINT DEFAULT NULL COMMENT '租户ID'");
                repairedTables += ensureTable(conn, schema,
                    "t_intelligence_metrics",
                    "CREATE TABLE IF NOT EXISTS `t_intelligence_metrics` ("
                        + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
                        + "`tenant_id` BIGINT NOT NULL,"
                        + "`scene` VARCHAR(100) NOT NULL,"
                        + "`provider` VARCHAR(50) DEFAULT NULL,"
                        + "`model` VARCHAR(100) DEFAULT NULL,"
                        + "`trace_id` VARCHAR(64) DEFAULT NULL,"
                        + "`trace_url` VARCHAR(500) DEFAULT NULL,"
                        + "`success` TINYINT(1) NOT NULL DEFAULT 0,"
                        + "`fallback_used` TINYINT(1) NOT NULL DEFAULT 0,"
                        + "`latency_ms` INT DEFAULT NULL,"
                        + "`prompt_chars` INT DEFAULT NULL,"
                        + "`response_chars` INT DEFAULT NULL,"
                        + "`tool_call_count` INT DEFAULT NULL,"
                        + "`error_message` VARCHAR(500) DEFAULT NULL,"
                        + "`user_id` VARCHAR(64) DEFAULT NULL,"
                        + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                        + "`delete_flag` TINYINT(1) NOT NULL DEFAULT 0,"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_metrics_tenant_scene` (`tenant_id`, `scene`, `create_time`),"
                        + "KEY `idx_metrics_create_time` (`create_time`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能模块AI调用度量表'");
                repaired += ensureColumn(conn, schema, "t_intelligence_metrics", "trace_id",
                    "VARCHAR(64) DEFAULT NULL COMMENT 'AI调用追踪ID'");
                repaired += ensureColumn(conn, schema, "t_intelligence_metrics", "trace_url",
                    "VARCHAR(500) DEFAULT NULL COMMENT '外部观测平台Trace链接'");
                repaired += ensureColumn(conn, schema, "t_intelligence_metrics", "tool_call_count",
                    "INT DEFAULT NULL COMMENT '本次AI调用工具次数'");
                repaired += ensureColumn(conn, schema, "t_intelligence_metrics", "prompt_tokens",
                    "INT DEFAULT NULL");
                repaired += ensureColumn(conn, schema, "t_intelligence_metrics", "completion_tokens",
                    "INT DEFAULT NULL");
                repairedTables += ensureTable(conn, schema,
                    "t_intelligence_signal",
                    "CREATE TABLE IF NOT EXISTS `t_intelligence_signal` ("
                        + "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,"
                        + "`tenant_id` BIGINT NOT NULL,"
                        + "`signal_type` VARCHAR(50) NOT NULL,"
                        + "`signal_code` VARCHAR(100) NOT NULL,"
                        + "`signal_level` VARCHAR(20) NOT NULL DEFAULT 'info',"
                        + "`source_domain` VARCHAR(50) DEFAULT NULL,"
                        + "`source_id` VARCHAR(100) DEFAULT NULL,"
                        + "`source_name` VARCHAR(200) DEFAULT NULL,"
                        + "`signal_title` VARCHAR(500) DEFAULT NULL,"
                        + "`signal_detail` TEXT DEFAULT NULL,"
                        + "`signal_analysis` TEXT DEFAULT NULL,"
                        + "`related_ids` VARCHAR(500) DEFAULT NULL,"
                        + "`priority_score` INT NOT NULL DEFAULT 50,"
                        + "`status` VARCHAR(20) NOT NULL DEFAULT 'open',"
                        + "`resolved_at` DATETIME DEFAULT NULL,"
                        + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                        + "`update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                        + "`delete_flag` INT NOT NULL DEFAULT 0,"
                        + "PRIMARY KEY (`id`),"
                        + "KEY `idx_tenant_status` (`tenant_id`, `status`, `create_time`),"
                        + "KEY `idx_tenant_level` (`tenant_id`, `signal_level`, `priority_score`)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一智能信号表'");
            repairedTables += ensureTable(conn, schema,
                    "t_intelligence_action_task_feedback",
                    "CREATE TABLE IF NOT EXISTS `t_intelligence_action_task_feedback` ("
                            + "`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,"
                            + "`tenant_id` BIGINT NOT NULL,"
                            + "`task_code` VARCHAR(100) NOT NULL,"
                            + "`related_order_no` VARCHAR(64) DEFAULT NULL,"
                            + "`feedback_status` VARCHAR(32) NOT NULL,"
                            + "`feedback_reason` VARCHAR(500) DEFAULT NULL,"
                            + "`completion_note` VARCHAR(500) DEFAULT NULL,"
                            + "`source_signal` VARCHAR(100) DEFAULT NULL,"
                            + "`next_review_at` VARCHAR(32) DEFAULT NULL,"
                            + "`operator_id` VARCHAR(64) DEFAULT NULL,"
                            + "`operator_name` VARCHAR(100) DEFAULT NULL,"
                            + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                            + "`update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                            + "`delete_flag` INT NOT NULL DEFAULT 0,"
                            + "PRIMARY KEY (`id`),"
                            + "KEY `idx_tenant_task` (`tenant_id`, `task_code`, `related_order_no`, `create_time`),"
                            + "KEY `idx_tenant_status` (`tenant_id`, `feedback_status`, `create_time`)"
                            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动作中心任务回执表'");

            // t_order_remark 订单/款式备注表（Flyway 链断裂时兜底建表）
            repairedTables += ensureTable(conn, schema,
                    "t_order_remark",
                    "CREATE TABLE IF NOT EXISTS `t_order_remark` ("
                            + "`id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',"
                            + "`target_type` VARCHAR(20) NOT NULL COMMENT 'order=大货订单 style=样衣开发',"
                            + "`target_no` VARCHAR(100) NOT NULL COMMENT '订单号或款号',"
                            + "`author_id` VARCHAR(64) DEFAULT NULL COMMENT '填写人ID',"
                            + "`author_name` VARCHAR(100) DEFAULT NULL COMMENT '填写人姓名',"
                            + "`author_role` VARCHAR(100) DEFAULT NULL COMMENT '填写人角色/工序节点',"
                            + "`content` TEXT NOT NULL COMMENT '备注内容',"
                            + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                            + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
                            + "`delete_flag` INT NOT NULL DEFAULT 0 COMMENT '删除标记',"
                            + "PRIMARY KEY (`id`),"
                            + "KEY `idx_remark_target` (`tenant_id`,`target_type`,`target_no`),"
                            + "KEY `idx_remark_time` (`tenant_id`,`create_time`)"
                            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='订单/款式备注'");

            // t_style_attachment.style_no — 云端手动添加时设为NOT NULL无DEFAULT，确保为可空
            // Flyway V202608011500 handles both EXISTS->MODIFY and NOT EXISTS->ADD cases
            repaired += ensureColumn(conn, schema, "t_style_attachment", "style_no",
                    "VARCHAR(64) DEFAULT NULL");
            // Also handle case where column already EXISTS but is NOT NULL (ensureColumn only ADDs)
            repaired += ensureColumnIsNullable(conn, schema, "t_style_attachment", "style_no", "VARCHAR(64)");

            // t_secondary_process 二次工艺图片/附件字段（V20260501002 可能未执行）
            repaired += ensureColumn(conn, schema, "t_secondary_process", "images",
                    "TEXT DEFAULT NULL COMMENT '工艺图片URL列表(JSON数组)'");
            repaired += ensureColumn(conn, schema, "t_secondary_process", "attachments",
                    "TEXT DEFAULT NULL COMMENT '工艺附件列表(JSON数组，格式[{name,url}])'");

            // t_agent_execution_log 多代理图执行日志（V20260415001/002 在云端可能未执行）
            repairedTables += ensureTable(conn, schema,
                    "t_agent_execution_log",
                    "CREATE TABLE IF NOT EXISTS `t_agent_execution_log` ("
                    + "`id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',"
                    + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
                    + "`scene` VARCHAR(50) DEFAULT NULL COMMENT '分析场景',"
                    + "`route` VARCHAR(100) DEFAULT NULL COMMENT 'Supervisor路由决策',"
                    + "`context_summary` TEXT DEFAULT NULL COMMENT '分析摘要文本',"
                    + "`reflection` TEXT DEFAULT NULL COMMENT 'LLM批判性反思内容',"
                    + "`optimization_suggestion` TEXT DEFAULT NULL COMMENT '优化建议',"
                    + "`confidence_score` INT DEFAULT 0 COMMENT '置信分0-100',"
                    + "`status` VARCHAR(20) DEFAULT 'COMPLETED' COMMENT 'COMPLETED|ERROR',"
                    + "`latency_ms` BIGINT DEFAULT 0 COMMENT '执行耗时(毫秒)',"
                    + "`create_time` DATETIME DEFAULT NULL COMMENT '执行时间',"
                    + "PRIMARY KEY (`id`),"
                    + "KEY `idx_aex_tenant_time` (`tenant_id`,`create_time`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='多代理图执行日志'");
            repaired += ensureColumn(conn, schema, "t_agent_execution_log", "specialist_results",
                    "TEXT DEFAULT NULL COMMENT '专家Agent执行结果(JSON)'");
            repaired += ensureColumn(conn, schema, "t_agent_execution_log", "node_trace",
                    "TEXT DEFAULT NULL COMMENT '图节点执行轨迹(JSON)'");
            repaired += ensureColumn(conn, schema, "t_agent_execution_log", "digital_twin_snapshot",
                    "TEXT DEFAULT NULL COMMENT '数字孪生快照(JSON)'");
            repaired += ensureColumn(conn, schema, "t_agent_execution_log", "user_feedback",
                    "INT DEFAULT NULL COMMENT '用户反馈评分'");
            repaired += ensureColumn(conn, schema, "t_agent_execution_log", "feedback_note",
                    "VARCHAR(500) DEFAULT NULL COMMENT '反馈备注'");

            // t_production_order.skc — V20260309 COMMENT '' bug 遗留，Flyway 从未成功添加此列
            repaired += ensureColumn(conn, schema, "t_production_order", "skc",
                    "VARCHAR(64) DEFAULT NULL COMMENT 'SKC统一编号'");

            // t_production_order 定价快照列 — V20260327001 COMMENT '' bug，Flyway 从未实际添加
            repaired += ensureColumn(conn, schema, "t_production_order", "factory_unit_price",
                    "DECIMAL(10,2) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_production_order", "pricing_mode",
                    "VARCHAR(20) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_production_order", "scatter_pricing_mode",
                    "VARCHAR(20) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_production_order", "scatter_cutting_unit_price",
                    "DECIMAL(10,2) DEFAULT NULL");
            // t_production_order.material_arrival_rate — 从未写入任何 Flyway 脚本
            repaired += ensureColumn(conn, schema, "t_production_order", "material_arrival_rate",
                    "INT DEFAULT NULL");

            // --- t_style_process 补列 ---
            repaired += ensureColumn(conn, schema, "t_style_process", "difficulty",
                    "VARCHAR(10) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_process", "rate_multiplier",
                    "DECIMAL(5,2) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_process", "tenant_id",
                    "BIGINT DEFAULT NULL");

            // --- t_style_quotation 补列 ---
            // profit_rate：目标利润率，被视图 v_finished_product_settlement 引用（sq1.profit_rate）
            // StyleTableMigrator 在云端禁用，此列从未通过 DataInitializer 创建
            // → 视图查询 SELECT FROM v_finished_product_settlement 会 500（Unknown column 'profit_rate'）
            repaired += ensureColumn(conn, schema, "t_style_quotation", "profit_rate",
                    "DECIMAL(5,2) NOT NULL DEFAULT 0.00");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "total_price",
                    "DECIMAL(12,2) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "style_id",
                    "VARCHAR(32) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "tenant_id",
                    "BIGINT DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "creator_id",
                    "VARCHAR(32) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "creator_name",
                    "VARCHAR(100) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "updater_id",
                    "VARCHAR(32) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "updater_name",
                    "VARCHAR(100) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "auditor_id",
                    "VARCHAR(32) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "auditor_name",
                    "VARCHAR(100) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "audit_time",
                    "DATETIME DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "audit_status",
                    "INT NOT NULL DEFAULT 0");
            repaired += ensureColumn(conn, schema, "t_style_quotation", "audit_remark",
                    "VARCHAR(500) DEFAULT NULL");

            // ── t_product_outstock 表（成品出库记录，DataInitializer 在云端被禁用导致表不存在）
            repairedTables += ensureTable(conn, schema, "t_product_outstock",
                    "CREATE TABLE IF NOT EXISTS `t_product_outstock` ("
                    + "`id` VARCHAR(64) NOT NULL, "
                    + "`outstock_no` VARCHAR(64) DEFAULT NULL, "
                    + "`order_id` VARCHAR(64) DEFAULT NULL, "
                    + "`order_no` VARCHAR(64) DEFAULT NULL, "
                    + "`style_id` VARCHAR(64) DEFAULT NULL, "
                    + "`style_no` VARCHAR(64) DEFAULT NULL, "
                    + "`style_name` VARCHAR(200) DEFAULT NULL, "
                    + "`outstock_quantity` INT DEFAULT 0, "
                    + "`outstock_type` VARCHAR(32) DEFAULT NULL, "
                    + "`warehouse` VARCHAR(100) DEFAULT NULL, "
                    + "`remark` TEXT, "
                    + "`create_time` DATETIME DEFAULT NULL, "
                    + "`update_time` DATETIME DEFAULT NULL, "
                    + "`delete_flag` INT DEFAULT 0, "
                    + "`operator_id` VARCHAR(64) DEFAULT NULL, "
                    + "`operator_name` VARCHAR(100) DEFAULT NULL, "
                    + "`creator_id` VARCHAR(64) DEFAULT NULL, "
                    + "`creator_name` VARCHAR(100) DEFAULT NULL, "
                    + "`tenant_id` BIGINT DEFAULT NULL, "
                    + "`sku_code` VARCHAR(100) DEFAULT NULL, "
                    + "`color` VARCHAR(50) DEFAULT NULL, "
                    + "`size` VARCHAR(50) DEFAULT NULL, "
                    + "`cost_price` DECIMAL(12,2) DEFAULT NULL, "
                    + "`sales_price` DECIMAL(12,2) DEFAULT NULL, "
                    + "`tracking_no` VARCHAR(100) DEFAULT NULL, "
                    + "`express_company` VARCHAR(50) DEFAULT NULL, "
                    + "`receive_status` VARCHAR(20) DEFAULT NULL, "
                    + "`receive_time` DATETIME DEFAULT NULL, "
                    + "`received_by` VARCHAR(36) DEFAULT NULL, "
                    + "`received_by_name` VARCHAR(100) DEFAULT NULL, "
                    + "`customer_name` VARCHAR(100) DEFAULT NULL, "
                    + "`customer_phone` VARCHAR(50) DEFAULT NULL, "
                    + "`shipping_address` VARCHAR(500) DEFAULT NULL, "
                    + "`total_amount` DECIMAL(12,2) DEFAULT NULL, "
                    + "`paid_amount` DECIMAL(12,2) DEFAULT 0.00, "
                    + "`payment_status` VARCHAR(20) DEFAULT NULL, "
                    + "`settlement_time` DATETIME DEFAULT NULL, "
                    + "PRIMARY KEY (`id`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");

            // ── t_product_sku 补齐 stock_quantity / tenant_id（V7 CREATE TABLE 遗漏）
            repaired += ensureColumn(conn, schema, "t_product_sku", "stock_quantity",
                    "INT NOT NULL DEFAULT 0");
            repaired += ensureColumn(conn, schema, "t_product_sku", "tenant_id",
                    "BIGINT DEFAULT NULL");
            // t_product_sku.version — @Version 乐观锁注解要求此列必须存在；
            // V202609151001 使用了 DELIMITER $$ 语法，Flyway JDBC 解析器无法处理，
            // 导致云端该列从未被添加 → ProductSku 所有 SELECT 抛 Unknown column 'version' → HTTP 500
            repaired += ensureColumn(conn, schema, "t_product_sku", "version",
                    "INT NOT NULL DEFAULT 0");

            // ── t_style_attachment 补齐 5 列（V202608011400 可能因 Flyway 解析器截断未生效）
            repaired += ensureColumn(conn, schema, "t_style_attachment", "version",
                    "INT DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_attachment", "version_remark",
                    "VARCHAR(200) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_attachment", "status",
                    "VARCHAR(20) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_attachment", "parent_id",
                    "VARCHAR(64) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_style_attachment", "tenant_id",
                    "BIGINT DEFAULT NULL");

            // ── t_factory_shipment + t_factory_shipment_detail（本地 FLYWAY_ENABLED=false，需启动自愈）
            repairedTables += ensureTable(conn, schema,
                    "t_factory_shipment",
                    "CREATE TABLE IF NOT EXISTS `t_factory_shipment` ("
                    + "`id` VARCHAR(36) NOT NULL,"
                    + "`shipment_no` VARCHAR(50) NOT NULL,"
                    + "`order_id` VARCHAR(36) NOT NULL,"
                    + "`order_no` VARCHAR(50) DEFAULT NULL,"
                    + "`style_no` VARCHAR(50) DEFAULT NULL,"
                    + "`style_name` VARCHAR(200) DEFAULT NULL,"
                    + "`factory_id` VARCHAR(36) DEFAULT NULL,"
                    + "`factory_name` VARCHAR(100) DEFAULT NULL,"
                    + "`ship_quantity` INT NOT NULL DEFAULT 0,"
                    + "`ship_time` DATETIME DEFAULT NULL,"
                    + "`shipped_by` VARCHAR(36) DEFAULT NULL,"
                    + "`shipped_by_name` VARCHAR(50) DEFAULT NULL,"
                    + "`tracking_no` VARCHAR(100) DEFAULT NULL,"
                    + "`express_company` VARCHAR(100) DEFAULT NULL,"
                    + "`ship_method` VARCHAR(32) DEFAULT 'EXPRESS',"
                    + "`receive_status` VARCHAR(20) NOT NULL DEFAULT 'pending',"
                    + "`receive_time` DATETIME DEFAULT NULL,"
                    + "`received_by` VARCHAR(36) DEFAULT NULL,"
                    + "`received_by_name` VARCHAR(50) DEFAULT NULL,"
                    + "`remark` VARCHAR(500) DEFAULT NULL,"
                    + "`tenant_id` BIGINT DEFAULT NULL,"
                    + "`creator_id` VARCHAR(36) DEFAULT NULL,"
                    + "`creator_name` VARCHAR(50) DEFAULT NULL,"
                    + "`create_time` DATETIME DEFAULT NULL,"
                    + "`update_time` DATETIME DEFAULT NULL,"
                    + "`delete_flag` INT NOT NULL DEFAULT 0,"
                    + "PRIMARY KEY (`id`),"
                    + "KEY `idx_fs_order_id` (`order_id`),"
                    + "KEY `idx_fs_factory_id` (`factory_id`),"
                    + "KEY `idx_fs_tenant_status` (`tenant_id`, `receive_status`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
            // ship_method 可能已存在于早期建表但需补齐新增列
            repaired += ensureColumn(conn, schema, "t_factory_shipment", "ship_method",
                    "VARCHAR(32) DEFAULT 'EXPRESS'");

            repairedTables += ensureTable(conn, schema,
                    "t_factory_shipment_detail",
                    "CREATE TABLE IF NOT EXISTS `t_factory_shipment_detail` ("
                    + "`id` VARCHAR(64) NOT NULL,"
                    + "`shipment_id` VARCHAR(64) NOT NULL,"
                    + "`color` VARCHAR(50) NOT NULL DEFAULT '',"
                    + "`size_name` VARCHAR(50) NOT NULL DEFAULT '',"
                    + "`quantity` INT NOT NULL DEFAULT 0,"
                    + "`tenant_id` BIGINT DEFAULT NULL,"
                    + "`create_time` DATETIME DEFAULT NULL,"
                    + "PRIMARY KEY (`id`),"
                    + "KEY `idx_shipment_id` (`shipment_id`),"
                    + "KEY `idx_tenant_id` (`tenant_id`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            repaired += ensureColumn(conn, schema, "t_production_order", "transfer_log_json",
                    "LONGTEXT DEFAULT NULL");

            // t_process_price_adjustment 工序调价记录（V202607201400 本地未执行时缺失）
            repairedTables += ensureTable(conn, schema,
                    "t_process_price_adjustment",
                    "CREATE TABLE IF NOT EXISTS `t_process_price_adjustment` ("
                    + "`id` VARCHAR(36) NOT NULL,"
                    + "`tenant_id` BIGINT NOT NULL,"
                    + "`order_id` VARCHAR(36) NOT NULL,"
                    + "`order_no` VARCHAR(50) DEFAULT NULL,"
                    + "`bundle_id` VARCHAR(36) DEFAULT NULL,"
                    + "`bundle_no` VARCHAR(50) DEFAULT NULL,"
                    + "`process_name` VARCHAR(100) NOT NULL,"
                    + "`process_code` VARCHAR(50) DEFAULT NULL,"
                    + "`progress_stage` VARCHAR(50) DEFAULT NULL,"
                    + "`original_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,"
                    + "`adjusted_price` DECIMAL(10,2) NOT NULL,"
                    + "`reason` TEXT NOT NULL,"
                    + "`adjusted_by` VARCHAR(36) NOT NULL,"
                    + "`adjusted_by_name` VARCHAR(50) DEFAULT NULL,"
                    + "`adjusted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + "`delete_flag` INT NOT NULL DEFAULT 0,"
                    + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,"
                    + "`update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
                    + "PRIMARY KEY (`id`),"
                    + "INDEX `idx_ppa_tenant` (`tenant_id`),"
                    + "INDEX `idx_ppa_order` (`order_id`),"
                    + "INDEX `idx_ppa_order_no` (`order_no`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // v_finished_product_settlement 视图若缺少 complete_time 列则重建（V202609021000 本地未执行）
            repaired += ensureSettlementViewHasCompleteTime(conn, schema);

            // ── t_ai_job_run_log（V20260413001 创建时遗漏 tenant_id，V202608151001 受 Flyway 链断裂阻塞）──
            repairedTables += ensureTable(conn, schema,
                    "t_ai_job_run_log",
                    "CREATE TABLE IF NOT EXISTS `t_ai_job_run_log` ("
                    + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
                    + "`tenant_id` BIGINT DEFAULT NULL,"
                    + "`job_name` VARCHAR(100) DEFAULT NULL,"
                    + "`method_name` VARCHAR(100) DEFAULT NULL,"
                    + "`start_time` DATETIME DEFAULT NULL,"
                    + "`duration_ms` BIGINT DEFAULT NULL,"
                    + "`status` VARCHAR(20) DEFAULT NULL,"
                    + "`tenant_count` INT DEFAULT NULL,"
                    + "`result_summary` VARCHAR(500) DEFAULT NULL,"
                    + "`error_message` TEXT DEFAULT NULL,"
                    + "`created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,"
                    + "PRIMARY KEY (`id`),"
                    + "INDEX `idx_ajrl_tenant` (`tenant_id`),"
                    + "INDEX `idx_ajrl_job_time` (`job_name`, `start_time`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            repaired += ensureColumn(conn, schema, "t_ai_job_run_log", "tenant_id",
                    "BIGINT DEFAULT NULL AFTER `id`");

            // ── t_shipment_reconciliation 审核人三列（V20260223b CONTINUE HANDLER 吞错导致缺失）──
            repaired += ensureColumn(conn, schema, "t_shipment_reconciliation", "auditor_id",
                    "VARCHAR(32) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_shipment_reconciliation", "auditor_name",
                    "VARCHAR(100) DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_shipment_reconciliation", "audit_time",
                    "DATETIME DEFAULT NULL");
            repaired += ensureColumn(conn, schema, "t_shipment_reconciliation", "delete_flag",
                    "TINYINT(1) NOT NULL DEFAULT 0");

            // ── t_bill_aggregation / t_receivable 逻辑删除列（历史环境跳脚本时会缺失，导致 list/stats 500）──
            repaired += ensureColumn(conn, schema, "t_bill_aggregation", "delete_flag",
                    "INT NOT NULL DEFAULT 0");
            repaired += ensureColumn(conn, schema, "t_receivable", "delete_flag",
                    "TINYINT(1) NOT NULL DEFAULT 0");

            // ── t_sys_notice（V20260322b 可能因 Flyway 链断裂未创建，content 原 VARCHAR(512) 需扩容）──
            repairedTables += ensureTable(conn, schema,
                    "t_sys_notice",
                    "CREATE TABLE IF NOT EXISTS `t_sys_notice` ("
                    + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
                    + "`tenant_id` BIGINT DEFAULT NULL,"
                    + "`to_name` VARCHAR(50) DEFAULT NULL,"
                    + "`from_name` VARCHAR(50) DEFAULT NULL,"
                    + "`order_no` VARCHAR(50) DEFAULT NULL,"
                    + "`title` VARCHAR(200) DEFAULT NULL,"
                    + "`content` TEXT DEFAULT NULL,"
                    + "`notice_type` VARCHAR(50) DEFAULT NULL,"
                    + "`is_read` INT NOT NULL DEFAULT 0,"
                    + "`created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,"
                    + "PRIMARY KEY (`id`),"
                    + "INDEX `idx_sn_tenant` (`tenant_id`),"
                    + "INDEX `idx_sn_to_name` (`to_name`),"
                    + "INDEX `idx_sn_created_at` (`created_at`)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            if (repaired > 0) {
                log.warn("[DbRepair] 共修复 {} 个缺失列，Flyway 可能未正常执行对应迁移脚本", repaired);
            }
            if (repairedTables > 0) {
                log.warn("[DbRepair] 共修复 {} 张缺失表，Flyway/DataInitializer 可能未正常执行", repairedTables);
            }
            if (repaired == 0 && repairedTables == 0) {
                log.info("[DbRepair] 关键表结构完整，无需修复");
            }
        } catch (Exception e) {
            log.error("[DbRepair] 列修复失败，应用继续启动。原因: {}", e.getMessage());
        }

        // 清理旧格式 role:perms:* 缓存（一次性，启动时执行）
        // 避免登录时因缓存命中旧数据而多走一次 DB
        if (redisService != null) {
            try {
                long deleted = redisService.deleteByPattern("role:perms:*");
                if (deleted > 0) {
                    log.info("[DbRepair] 已清理 {} 个 role:perms:* 旧格式权限缓存", deleted);
                }
            } catch (Exception e) {
                log.warn("[DbRepair] role:perms:* 缓存清理失败（忽略）: {}", e.getMessage());
            }
        }
    }

    private int ensureColumn(Connection conn, String schema, String table, String column, String definition) {
        try {
            if (!columnExists(conn, schema, table, column)) {
                String sql = "ALTER TABLE `" + table + "` ADD COLUMN `" + column + "` " + definition;
                try (PreparedStatement ps = conn.prepareStatement(sql)) {
                    ps.executeUpdate();
                }
                log.warn("[DbRepair] 已添加缺失列: {}.{}", table, column);
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 添加列 {}.{} 失败: {}", table, column, e.getMessage());
        }
        return 0;
    }

    private int ensureTable(Connection conn, String schema, String table, String createSql) {
        try {
            if (!tableExists(conn, schema, table)) {
                try (Statement stmt = conn.createStatement()) {
                    stmt.execute(createSql);
                }
                log.warn("[DbRepair] 已创建缺失表: {}", table);
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 创建表 {} 失败: {}", table, e.getMessage());
        }
        return 0;
    }

    /**
     * 重建 v_finished_product_settlement 视图以补充 complete_time 字段。
     * 本地 FLYWAY_ENABLED=false 时 V202609021000 未执行，视图无 complete_time 列，
     * 而 FinishedProductSettlement 实体有 completeTime 字段（无 @TableField(exist=false)），
     * 导致 MyBatis-Plus 生成 SELECT ..., complete_time, ... → MySQL 报 Unknown column → 500。
     */
    private int ensureSettlementViewHasCompleteTime(Connection conn, String schema) {
        try {
            // 同时检查 complete_time（V202609021000）和 dev_cost_price（V20260420002）
            // 任一列缺失均重建为最新完整视图 DDL，防止本地 FLYWAY_ENABLED=false 场景缺列
            boolean missingCompleteTime = !columnExists(conn, schema, "v_finished_product_settlement", "complete_time");
            boolean missingDevCostPrice = !columnExists(conn, schema, "v_finished_product_settlement", "dev_cost_price");
            if (missingCompleteTime || missingDevCostPrice) {
                try (Statement stmt = conn.createStatement()) {
                    stmt.executeUpdate("DROP VIEW IF EXISTS `v_finished_product_settlement`");
                    String createView = "CREATE VIEW `v_finished_product_settlement` AS"
                        + " SELECT `po`.`id` AS `order_id`,"
                        + " `po`.`order_no` AS `order_no`,"
                        + " `po`.`status` AS `status`,"
                        + " `po`.`style_no` AS `style_no`,"
                        + " `po`.`factory_id` AS `factory_id`,"
                        + " `po`.`factory_name` AS `factory_name`,"
                        + " `po`.`order_quantity` AS `order_quantity`,"
                        + " COALESCE(`sq`.`total_price`,`si`.`price`,0) AS `style_final_price`,"
                        + " COALESCE(`sq`.`profit_rate`,0) AS `target_profit_rate`,"
                        + " COALESCE(`si`.`price`,0) AS `dev_cost_price`,"
                        + " COALESCE(`wh`.`total_warehoused`,0) AS `warehoused_quantity`,"
                        + " COALESCE(`wh`.`total_defects`,0) AS `defect_quantity`,"
                        + " COALESCE(`wh`.`colors`,'') AS `colors`,"
                        + " COALESCE(`mat`.`total_material_cost`,0) AS `material_cost`,"
                        + " COALESCE(`scan`.`total_production_cost`,0) AS `production_cost`,"
                        + " (CASE WHEN (`po`.`order_quantity`>0)"
                        + "   THEN ROUND(COALESCE(`wh`.`total_defects`,0)"
                        + "     *((COALESCE(`mat`.`total_material_cost`,0)+COALESCE(`scan`.`total_production_cost`,0))"
                        + "     /`po`.`order_quantity`),2) ELSE 0 END) AS `defect_loss`,"
                        + " ROUND(COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0),2) AS `total_amount`,"
                        + " ROUND((COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0))"
                        + "   -COALESCE(`mat`.`total_material_cost`,0)-COALESCE(`scan`.`total_production_cost`,0)"
                        + "   -(CASE WHEN (`po`.`order_quantity`>0)"
                        + "     THEN COALESCE(`wh`.`total_defects`,0)"
                        + "       *((COALESCE(`mat`.`total_material_cost`,0)+COALESCE(`scan`.`total_production_cost`,0))"
                        + "       /`po`.`order_quantity`) ELSE 0 END),2) AS `profit`,"
                        + " (CASE WHEN (COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0))>0"
                        + "   THEN ROUND(((COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0))"
                        + "     -COALESCE(`mat`.`total_material_cost`,0)-COALESCE(`scan`.`total_production_cost`,0)"
                        + "     -(CASE WHEN (`po`.`order_quantity`>0)"
                        + "       THEN COALESCE(`wh`.`total_defects`,0)"
                        + "         *((COALESCE(`mat`.`total_material_cost`,0)+COALESCE(`scan`.`total_production_cost`,0))"
                        + "         /`po`.`order_quantity`) ELSE 0 END))"
                        + "     /(COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0))*100,2)"
                        + "   ELSE 0 END) AS `profit_margin`,"
                        + " COALESCE(`po`.`actual_end_date`,`wh`.`last_warehoused_time`) AS `complete_time`,"
                        + " `po`.`create_time` AS `create_time`,"
                        + " `po`.`update_time` AS `update_time`,"
                        + " `po`.`tenant_id` AS `tenant_id`"
                        + " FROM `t_production_order` `po`"
                        + " LEFT JOIN `t_style_info` `si` ON `po`.`style_no`=`si`.`style_no`"
                        + " LEFT JOIN (SELECT sq1.`style_id`,sq1.`total_price`,sq1.`profit_rate`"
                        + "   FROM `t_style_quotation` sq1"
                        + "   INNER JOIN (SELECT `style_id`,MAX(`update_time`) AS max_update_time"
                        + "     FROM `t_style_quotation` GROUP BY `style_id`) sq_latest"
                        + "   ON sq1.`style_id`=sq_latest.`style_id` AND sq1.`update_time`=sq_latest.`max_update_time`"
                        + " ) `sq` ON `sq`.`style_id`=`si`.`id`"
                        + " LEFT JOIN (SELECT `pw`.`order_no`,"
                        + "   SUM(COALESCE(`pw`.`qualified_quantity`,0)) AS `total_warehoused`,"
                        + "   SUM(COALESCE(`pw`.`unqualified_quantity`,0)) AS `total_defects`,"
                        + "   MAX(`pw`.`create_time`) AS `last_warehoused_time`,"
                        + "   GROUP_CONCAT(DISTINCT CASE WHEN `cb`.`color` IS NOT NULL THEN `cb`.`color` ELSE '' END"
                        + "     ORDER BY `cb`.`color` ASC SEPARATOR ', ') AS `colors`"
                        + "   FROM `t_product_warehousing` `pw`"
                        + "   LEFT JOIN `t_cutting_bundle` `cb` ON `pw`.`cutting_bundle_id`=`cb`.`id`"
                        + "   WHERE `pw`.`delete_flag`=0 GROUP BY `pw`.`order_no`"
                        + " ) `wh` ON `po`.`order_no`=`wh`.`order_no`"
                        + " LEFT JOIN (SELECT `order_no`,SUM(`total_amount`) AS `total_material_cost`"
                        + "   FROM `t_material_purchase` WHERE `status` IN ('RECEIVED','COMPLETED')"
                        + "   GROUP BY `order_no`) `mat` ON `po`.`order_no`=`mat`.`order_no`"
                        + " LEFT JOIN (SELECT `order_no`,SUM(`scan_cost`) AS `total_production_cost`"
                        + "   FROM `t_scan_record` WHERE `scan_cost` IS NOT NULL GROUP BY `order_no`"
                        + " ) `scan` ON `po`.`order_no`=`scan`.`order_no`"
                        + " WHERE `po`.`delete_flag`=0"
                        + "   AND `po`.`status` NOT IN ('CANCELLED','cancelled','DELETED','deleted','废弃','已取消')"
                        + "   AND `po`.`order_no` NOT LIKE 'CUT%'"
                        + " ORDER BY `po`.`create_time` DESC";
                    stmt.executeUpdate(createView);
                }
                log.warn("[DbRepair] 已重建视图 v_finished_product_settlement（补齐 complete_time/dev_cost_price 字段，missing complete_time={}, missing dev_cost_price={}）", missingCompleteTime, missingDevCostPrice);
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 重建视图 v_finished_product_settlement 失败: {}", e.getMessage());
        }
        return 0;
    }

    /**
     * If column exists as NOT NULL (IS_NULLABLE='NO'), MODIFY it to typeDefinition DEFAULT NULL.
     * Complements ensureColumn which only handles the ADD case (column not existing).
     */
    private int ensureColumnIsNullable(Connection conn, String schema, String table, String column, String typeDefinition) {
        try {
            String checkSql = "SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1";
            String isNullable;
            try (PreparedStatement ps = conn.prepareStatement(checkSql)) {
                ps.setString(1, schema);
                ps.setString(2, table);
                ps.setString(3, column);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return 0; // column doesn't exist — handled by ensureColumn
                    isNullable = rs.getString(1);
                }
            }
            if ("NO".equalsIgnoreCase(isNullable)) {
                String sql = "ALTER TABLE `" + table + "` MODIFY COLUMN `" + column + "` " + typeDefinition + " DEFAULT NULL";
                try (PreparedStatement ps = conn.prepareStatement(sql)) {
                    ps.executeUpdate();
                }
                log.warn("[DbRepair] 已修正列为可空: {}.{}", table, column);
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 检查/修复列可空性 {}.{} 失败: {}", table, column, e.getMessage());
        }
        return 0;
    }

    private int ensureColumnType(Connection conn, String schema, String table, String column,
            String expectedTypePrefix, String alterFragment) {
        try {
            String actualType = getColumnType(conn, schema, table, column);
            if (actualType == null || actualType.toLowerCase().startsWith(expectedTypePrefix.toLowerCase())) {
                return 0;
            }
            String sql = "ALTER TABLE `" + table + "` " + alterFragment;
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.executeUpdate();
            }
            log.warn("[DbRepair] 已修正列类型: {}.{} {} -> {}", table, column, actualType, expectedTypePrefix);
            return 1;
        } catch (Exception e) {
            log.error("[DbRepair] 修正列类型 {}.{} 失败: {}", table, column, e.getMessage());
        }
        return 0;
    }

    private boolean columnExists(Connection conn, String schema, String table, String column) throws Exception {
        String sql = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            ps.setString(3, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    private String getColumnType(Connection conn, String schema, String table, String column) throws Exception {
        String sql = "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            ps.setString(3, column);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getString(1);
                }
            }
        }
        return null;
    }

    private boolean tableExists(Connection conn, String schema, String table) throws Exception {
        String sql = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }
}

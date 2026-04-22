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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
@Order(10)
@Slf4j
public class DbColumnRepairRunner implements ApplicationRunner {

    @Autowired
    private DataSource dataSource;

    @Autowired(required = false)
    private RedisService redisService;

    private static final LinkedHashMap<String, List<String[]>> COLUMN_FIXES = new LinkedHashMap<>();
    private static final LinkedHashMap<String, String> TABLE_FIXES = new LinkedHashMap<>();

    static {
        add("t_user", "factory_id", "VARCHAR(64) DEFAULT NULL COMMENT '外发工厂ID'");
        add("t_user", "is_factory_owner", "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为外发工厂主账号'");
        add("t_user", "org_unit_id", "VARCHAR(64) DEFAULT NULL COMMENT '所属组织节点ID'");
        add("t_user", "org_unit_name", "VARCHAR(100) DEFAULT NULL COMMENT '所属组织节点名称'");
        add("t_user", "org_path", "VARCHAR(500) DEFAULT NULL COMMENT '所属组织路径'");
        add("t_user", "avatar_url", "VARCHAR(255) DEFAULT NULL COMMENT '用户头像URL'");
        add("t_user", "approval_status", "VARCHAR(20) DEFAULT NULL COMMENT '审批状态'");
        add("t_user", "approval_time", "DATETIME DEFAULT NULL COMMENT '审批时间'");
        add("t_user", "approval_remark", "VARCHAR(500) DEFAULT NULL COMMENT '审批备注'");
        add("t_user", "registration_status", "VARCHAR(20) DEFAULT NULL COMMENT '注册状态'");
        add("t_user", "registration_tenant_code", "VARCHAR(50) DEFAULT NULL COMMENT '注册租户码'");
        add("t_user", "reject_reason", "VARCHAR(500) DEFAULT NULL COMMENT '拒绝原因'");
        add("t_user", "phone", "VARCHAR(20) DEFAULT NULL COMMENT '手机号'");
        add("t_user", "email", "VARCHAR(100) DEFAULT NULL COMMENT '邮箱'");
        add("t_user", "last_login_time", "DATETIME DEFAULT NULL COMMENT '最后登录时间'");
        add("t_user", "last_login_ip", "VARCHAR(50) DEFAULT NULL COMMENT '最后登录IP'");
        add("t_user", "openid", "VARCHAR(100) DEFAULT NULL COMMENT '微信openid'");

        add("t_material_purchase", "evidence_image_urls", "TEXT DEFAULT NULL COMMENT '回料凭证图片URLs'");
        add("t_material_purchase", "fabric_composition", "VARCHAR(500) DEFAULT NULL COMMENT '面料成分'");
        add("t_material_purchase", "invoice_urls", "TEXT DEFAULT NULL COMMENT '发票图片URL列表'");
        add("t_material_purchase", "conversion_rate", "DECIMAL(10,4) DEFAULT NULL COMMENT '米重换算值'");
        add("t_material_purchase", "audit_status", "VARCHAR(32) DEFAULT NULL COMMENT '初审状态'");
        add("t_material_purchase", "audit_reason", "VARCHAR(500) DEFAULT NULL COMMENT '初审驳回原因'");
        add("t_material_purchase", "audit_time", "DATETIME DEFAULT NULL COMMENT '初审操作时间'");
        add("t_material_purchase", "audit_operator_id", "VARCHAR(64) DEFAULT NULL COMMENT '初审操作人ID'");
        add("t_material_purchase", "audit_operator_name", "VARCHAR(100) DEFAULT NULL COMMENT '初审操作人姓名'");
        add("t_material_purchase", "fabric_width", "VARCHAR(100) DEFAULT NULL COMMENT '面料门幅'");
        add("t_material_purchase", "fabric_weight", "VARCHAR(100) DEFAULT NULL COMMENT '面料克重'");
        add("t_material_purchase", "supplier_contact_person", "VARCHAR(50) DEFAULT NULL COMMENT '供应商联系人'");
        add("t_material_purchase", "supplier_contact_phone", "VARCHAR(20) DEFAULT NULL COMMENT '供应商联系电话'");
        add("t_material_purchase", "return_confirmed", "TINYINT(1) DEFAULT NULL COMMENT '是否确认退货'");
        add("t_material_purchase", "return_quantity", "INT DEFAULT NULL COMMENT '退货数量'");
        add("t_material_purchase", "return_confirmer_id", "VARCHAR(36) DEFAULT NULL COMMENT '退货确认人ID'");
        add("t_material_purchase", "return_confirmer_name", "VARCHAR(50) DEFAULT NULL COMMENT '退货确认人姓名'");
        add("t_material_purchase", "return_confirm_time", "DATETIME DEFAULT NULL COMMENT '退货确认时间'");
        add("t_material_purchase", "expected_ship_date", "DATE DEFAULT NULL COMMENT '预计发货日期'");
        add("t_material_purchase", "source_type", "VARCHAR(20) DEFAULT NULL COMMENT '来源类型'");
        add("t_material_purchase", "pattern_production_id", "VARCHAR(36) DEFAULT NULL COMMENT '关联样板生产ID'");
        add("t_material_purchase", "delete_flag", "INT NOT NULL DEFAULT 0 COMMENT '删除标志'");
        add("t_material_purchase", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_material_database", "conversion_rate", "DECIMAL(10,4) DEFAULT NULL COMMENT '米重换算值'");
        add("t_material_database", "color", "VARCHAR(50) DEFAULT NULL COMMENT '颜色'");
        add("t_material_database", "fabric_width", "VARCHAR(50) DEFAULT NULL COMMENT '门幅'");
        add("t_material_database", "fabric_weight", "VARCHAR(50) DEFAULT NULL COMMENT '克重'");
        add("t_material_database", "fabric_composition", "VARCHAR(100) DEFAULT NULL COMMENT '成分'");
        add("t_material_database", "supplier_id", "VARCHAR(36) DEFAULT NULL COMMENT '供应商ID'");
        add("t_material_database", "supplier_contact_person", "VARCHAR(100) DEFAULT NULL COMMENT '供应商联系人'");
        add("t_material_database", "supplier_contact_phone", "VARCHAR(50) DEFAULT NULL COMMENT '供应商联系电话'");
        add("t_material_database", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");
        add("t_material_database", "disabled", "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否禁用'");
        add("t_material_database", "image", "VARCHAR(500) DEFAULT NULL COMMENT '物料图片URL'");
        add("t_material_database", "description", "VARCHAR(255) DEFAULT NULL COMMENT '描述'");
        add("t_material_database", "unit_price", "DECIMAL(10,2) DEFAULT 0.00 COMMENT '单价'");
        add("t_material_database", "status", "VARCHAR(20) DEFAULT 'pending' COMMENT '状态'");
        add("t_material_database", "completed_time", "DATETIME DEFAULT NULL COMMENT '完成时间'");
        add("t_material_database", "return_reason", "VARCHAR(255) DEFAULT NULL COMMENT '退回原因'");
        add("t_material_database", "delete_flag", "INT NOT NULL DEFAULT 0 COMMENT '删除标记'");

        add("t_material_stock", "conversion_rate", "DECIMAL(10,4) DEFAULT NULL COMMENT '米重换算值'");
        add("t_material_stock", "safety_stock", "DECIMAL(14,3) DEFAULT NULL COMMENT '安全库存'");
        add("t_material_stock", "last_inbound_date", "DATETIME DEFAULT NULL COMMENT '最后入库日期'");
        add("t_material_stock", "last_outbound_date", "DATETIME DEFAULT NULL COMMENT '最后出库日期'");
        add("t_material_stock", "version", "INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号'");
        add("t_material_stock", "total_value", "DECIMAL(14,2) DEFAULT NULL COMMENT '库存总值'");
        add("t_material_stock", "location", "VARCHAR(200) DEFAULT NULL COMMENT '仓库位置'");
        add("t_material_stock", "locked_quantity", "DECIMAL(14,3) DEFAULT NULL COMMENT '锁定数量'");

        add("t_mind_push_rule", "notify_time_start", "VARCHAR(5) NOT NULL DEFAULT '08:00' COMMENT '推送开始时间'");
        add("t_mind_push_rule", "notify_time_end", "VARCHAR(5) NOT NULL DEFAULT '22:00' COMMENT '推送结束时间'");

        add("t_style_info", "development_source_type", "VARCHAR(32) DEFAULT NULL COMMENT '开发来源类型'");
        add("t_style_info", "development_source_detail", "VARCHAR(64) DEFAULT NULL COMMENT '开发来源明细'");
        add("t_style_info", "size_color_config", "MEDIUMTEXT DEFAULT NULL COMMENT '颜色尺码数量矩阵JSON'");
        add("t_style_info", "image_insight", "VARCHAR(500) DEFAULT NULL COMMENT 'AI图片洞察'");
        add("t_style_info", "fabric_composition", "VARCHAR(500) DEFAULT NULL COMMENT '面料成分'");
        add("t_style_info", "wash_instructions", "VARCHAR(500) DEFAULT NULL COMMENT '洗涤说明'");
        add("t_style_info", "u_code", "VARCHAR(100) DEFAULT NULL COMMENT 'U编码'");
        add("t_style_info", "wash_temp_code", "VARCHAR(20) DEFAULT NULL COMMENT '洗涤温度代码'");
        add("t_style_info", "bleach_code", "VARCHAR(20) DEFAULT NULL COMMENT '漂白代码'");
        add("t_style_info", "tumble_dry_code", "VARCHAR(20) DEFAULT NULL COMMENT '烘干代码'");
        add("t_style_info", "iron_code", "VARCHAR(20) DEFAULT NULL COMMENT '熨烫代码'");
        add("t_style_info", "dry_clean_code", "VARCHAR(20) DEFAULT NULL COMMENT '干洗代码'");
        add("t_style_info", "fabric_composition_parts", "TEXT DEFAULT NULL COMMENT '多部位面料成分JSON'");
        add("t_style_info", "update_by", "VARCHAR(100) DEFAULT NULL COMMENT '最后维护人'");
        add("t_style_info", "description_locked", "INT NOT NULL DEFAULT 1 COMMENT '制单锁定'");
        add("t_style_info", "description_return_comment", "VARCHAR(500) DEFAULT NULL COMMENT '制单退回备注'");
        add("t_style_info", "description_return_by", "VARCHAR(100) DEFAULT NULL COMMENT '制单退回人'");
        add("t_style_info", "description_return_time", "DATETIME DEFAULT NULL COMMENT '制单退回时间'");
        add("t_style_info", "pattern_rev_locked", "INT NOT NULL DEFAULT 0 COMMENT '纸样修改锁定'");
        add("t_style_info", "pattern_rev_return_comment", "VARCHAR(500) DEFAULT NULL COMMENT '纸样退回备注'");
        add("t_style_info", "pattern_rev_return_by", "VARCHAR(100) DEFAULT NULL COMMENT '纸样退回人'");
        add("t_style_info", "pattern_rev_return_time", "DATETIME DEFAULT NULL COMMENT '纸样退回时间'");
        add("t_style_info", "pushed_by_name", "VARCHAR(50) DEFAULT NULL COMMENT '推版人姓名'");
        add("t_style_info", "sample_review_status", "VARCHAR(20) DEFAULT NULL COMMENT '样衣审核状态'");
        add("t_style_info", "sample_review_comment", "TEXT DEFAULT NULL COMMENT '样衣审核评语'");
        add("t_style_info", "sample_reviewer", "VARCHAR(100) DEFAULT NULL COMMENT '审核人'");
        add("t_style_info", "sample_review_time", "DATETIME DEFAULT NULL COMMENT '审核时间'");
        add("t_style_info", "skc", "VARCHAR(100) DEFAULT NULL COMMENT 'SKC统编号'");
        add("t_style_info", "pushed_to_order", "INT DEFAULT NULL COMMENT '是否已推送到下单管理'");
        add("t_style_info", "pushed_to_order_time", "DATETIME DEFAULT NULL COMMENT '推送时间'");
        add("t_style_info", "customer", "VARCHAR(100) DEFAULT NULL COMMENT '客户'");
        add("t_style_info", "order_no", "VARCHAR(100) DEFAULT NULL COMMENT '关联订单号'");
        add("t_style_info", "sample_status", "VARCHAR(20) DEFAULT NULL COMMENT '样衣状态'");
        add("t_style_info", "sample_progress", "INT DEFAULT NULL COMMENT '样衣进度'");
        add("t_style_info", "sample_completed_time", "DATETIME DEFAULT NULL COMMENT '样衣完成时间'");
        add("t_style_info", "sample_no", "VARCHAR(100) DEFAULT NULL COMMENT '设计师'");
        add("t_style_info", "vehicle_supplier", "VARCHAR(100) DEFAULT NULL COMMENT '设计号'");
        add("t_style_info", "sample_supplier", "VARCHAR(100) DEFAULT NULL COMMENT '纸样师'");
        add("t_style_info", "pattern_no", "VARCHAR(100) DEFAULT NULL COMMENT '纸样号'");
        add("t_style_info", "plate_worker", "VARCHAR(100) DEFAULT NULL COMMENT '车板师'");
        add("t_style_info", "plate_type", "VARCHAR(20) DEFAULT NULL COMMENT '板类'");
        add("t_style_info", "order_type", "VARCHAR(100) DEFAULT NULL COMMENT '跟单员'");

        add("t_style_bom", "image_urls", "TEXT DEFAULT NULL COMMENT '物料图片URLs'");
        add("t_style_bom", "fabric_composition", "VARCHAR(100) DEFAULT NULL COMMENT '物料成分'");
        add("t_style_bom", "fabric_weight", "VARCHAR(50) DEFAULT NULL COMMENT '克重'");
        add("t_style_bom", "group_name", "VARCHAR(100) DEFAULT NULL COMMENT '分组名称'");
        add("t_style_bom", "size_usage_map", "TEXT DEFAULT NULL COMMENT '码数用量配比JSON'");
        add("t_style_bom", "pattern_size_usage_map", "TEXT DEFAULT NULL COMMENT '纸样录入各码用量JSON'");
        add("t_style_bom", "size_spec_map", "TEXT DEFAULT NULL COMMENT '各码规格尺寸JSON'");
        add("t_style_bom", "pattern_unit", "VARCHAR(20) DEFAULT NULL COMMENT '纸样录入单位'");
        add("t_style_bom", "conversion_rate", "DECIMAL(10,4) DEFAULT NULL COMMENT '换算系数'");
        add("t_style_bom", "dev_usage_amount", "DECIMAL(18,4) DEFAULT NULL COMMENT '开发用量'");

        add("t_style_size", "image_urls", "TEXT DEFAULT NULL COMMENT '部位参考图片URLs'");
        add("t_style_size", "group_name", "VARCHAR(50) DEFAULT NULL COMMENT '尺寸分组名'");
        add("t_style_size", "base_size", "VARCHAR(50) DEFAULT NULL COMMENT '基准码'");
        add("t_style_size", "grading_rule", "TEXT DEFAULT NULL COMMENT '跳码规则JSON'");

        add("t_style_quotation", "profit_rate", "DECIMAL(5,2) NOT NULL DEFAULT 0.00");
        add("t_style_quotation", "total_price", "DECIMAL(12,2) DEFAULT NULL");
        add("t_style_quotation", "style_id", "VARCHAR(32) DEFAULT NULL");
        add("t_style_quotation", "tenant_id", "BIGINT DEFAULT NULL");
        add("t_style_quotation", "creator_id", "VARCHAR(32) DEFAULT NULL");
        add("t_style_quotation", "creator_name", "VARCHAR(100) DEFAULT NULL");
        add("t_style_quotation", "updater_id", "VARCHAR(32) DEFAULT NULL");
        add("t_style_quotation", "updater_name", "VARCHAR(100) DEFAULT NULL");
        add("t_style_quotation", "auditor_id", "VARCHAR(32) DEFAULT NULL");
        add("t_style_quotation", "auditor_name", "VARCHAR(100) DEFAULT NULL");
        add("t_style_quotation", "audit_time", "DATETIME DEFAULT NULL");
        add("t_style_quotation", "audit_status", "INT NOT NULL DEFAULT 0");
        add("t_style_quotation", "audit_remark", "VARCHAR(500) DEFAULT NULL");

        add("t_style_process", "difficulty", "VARCHAR(10) DEFAULT NULL");
        add("t_style_process", "rate_multiplier", "DECIMAL(5,2) DEFAULT NULL");
        add("t_style_process", "tenant_id", "BIGINT DEFAULT NULL");

        add("t_style_attachment", "style_no", "VARCHAR(64) DEFAULT NULL");
        add("t_style_attachment", "version", "INT DEFAULT NULL");
        add("t_style_attachment", "version_remark", "VARCHAR(200) DEFAULT NULL");
        add("t_style_attachment", "status", "VARCHAR(20) DEFAULT NULL");
        add("t_style_attachment", "parent_id", "VARCHAR(64) DEFAULT NULL");
        add("t_style_attachment", "tenant_id", "BIGINT DEFAULT NULL");

        add("t_cutting_task", "factory_type", "VARCHAR(20) DEFAULT NULL COMMENT '工厂类型'");
        add("t_cutting_task", "receiver_id", "VARCHAR(64) DEFAULT NULL COMMENT '领取人ID'");
        add("t_cutting_task", "receiver_name", "VARCHAR(100) DEFAULT NULL COMMENT '领取人姓名'");
        add("t_cutting_task", "received_time", "DATETIME DEFAULT NULL COMMENT '领取时间'");
        add("t_cutting_task", "bundled_time", "DATETIME DEFAULT NULL COMMENT '扎单时间'");
        add("t_cutting_task", "remarks", "VARCHAR(500) DEFAULT NULL COMMENT '备注'");
        add("t_cutting_task", "expected_ship_date", "DATE DEFAULT NULL COMMENT '预计出货日期'");
        add("t_cutting_task", "creator_id", "VARCHAR(64) DEFAULT NULL COMMENT '创建人ID'");
        add("t_cutting_task", "creator_name", "VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名'");
        add("t_cutting_task", "updater_id", "VARCHAR(64) DEFAULT NULL COMMENT '更新人ID'");
        add("t_cutting_task", "updater_name", "VARCHAR(100) DEFAULT NULL COMMENT '更新人姓名'");
        add("t_cutting_task", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_cutting_bundle", "root_bundle_id", "VARCHAR(64) DEFAULT NULL COMMENT '根菲号ID'");
        add("t_cutting_bundle", "parent_bundle_id", "VARCHAR(64) DEFAULT NULL COMMENT '父菲号ID'");
        add("t_cutting_bundle", "source_bundle_id", "VARCHAR(64) DEFAULT NULL COMMENT '来源菲号ID'");
        add("t_cutting_bundle", "bundle_label", "VARCHAR(64) DEFAULT NULL COMMENT '菲号标签'");
        add("t_cutting_bundle", "split_status", "VARCHAR(20) DEFAULT NULL COMMENT '拆分状态'");
        add("t_cutting_bundle", "split_seq", "INT NOT NULL DEFAULT 0 COMMENT '拆分序号'");
        add("t_cutting_bundle", "bed_sub_no", "INT DEFAULT NULL COMMENT '床次子序号'");
        add("t_cutting_bundle", "split_process_name", "VARCHAR(100) DEFAULT NULL COMMENT '拆分工序名称'");
        add("t_cutting_bundle", "split_process_order", "INT DEFAULT NULL COMMENT '拆分工序序号'");

        add("t_product_warehousing", "repair_status", "VARCHAR(30) DEFAULT NULL COMMENT '返修状态'");
        add("t_product_warehousing", "repair_operator_name", "VARCHAR(50) DEFAULT NULL COMMENT '返修操作人姓名'");
        add("t_product_warehousing", "repair_completed_time", "DATETIME DEFAULT NULL COMMENT '返修完成时间'");
        add("t_product_warehousing", "unqualified_quantity", "INT NOT NULL DEFAULT 0 COMMENT '不合格数量'");
        add("t_product_warehousing", "quality_status", "VARCHAR(20) DEFAULT NULL COMMENT '质检状态'");
        add("t_product_warehousing", "inspection_status", "VARCHAR(20) DEFAULT NULL COMMENT '检验状态'");
        add("t_product_warehousing", "scan_mode", "VARCHAR(20) DEFAULT NULL COMMENT '扫码模式'");
        add("t_product_warehousing", "quality_operator_id", "VARCHAR(64) DEFAULT NULL COMMENT '质检操作员ID'");
        add("t_product_warehousing", "quality_operator_name", "VARCHAR(100) DEFAULT NULL COMMENT '质检操作员姓名'");
        add("t_product_warehousing", "defect_category", "VARCHAR(50) DEFAULT NULL COMMENT '缺陷类别'");
        add("t_product_warehousing", "defect_remark", "VARCHAR(500) DEFAULT NULL COMMENT '缺陷备注'");
        add("t_product_warehousing", "unqualified_image_urls", "TEXT DEFAULT NULL COMMENT '不合格图片URL列表'");
        add("t_product_warehousing", "receiver_id", "VARCHAR(64) DEFAULT NULL COMMENT '收货人ID'");
        add("t_product_warehousing", "receiver_name", "VARCHAR(100) DEFAULT NULL COMMENT '收货人姓名'");
        add("t_product_warehousing", "received_time", "DATETIME DEFAULT NULL COMMENT '收货时间'");
        add("t_product_warehousing", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_product_outstock", "approval_status", "VARCHAR(20) DEFAULT NULL COMMENT '审批状态'");
        add("t_product_outstock", "approve_by", "VARCHAR(64) DEFAULT NULL COMMENT '审批人ID'");
        add("t_product_outstock", "approve_by_name", "VARCHAR(100) DEFAULT NULL COMMENT '审批人姓名'");
        add("t_product_outstock", "approve_time", "DATETIME DEFAULT NULL COMMENT '审批时间'");

        add("t_product_sku", "stock_quantity", "INT NOT NULL DEFAULT 0");
        add("t_product_sku", "tenant_id", "BIGINT DEFAULT NULL");
        add("t_product_sku", "version", "INT NOT NULL DEFAULT 0");

        add("t_secondary_process", "approval_status", "VARCHAR(20) DEFAULT NULL COMMENT '审批状态'");
        add("t_secondary_process", "approved_by_id", "VARCHAR(64) DEFAULT NULL COMMENT '审批人ID'");
        add("t_secondary_process", "approved_by_name", "VARCHAR(128) DEFAULT NULL COMMENT '审批人姓名'");
        add("t_secondary_process", "approved_time", "DATETIME DEFAULT NULL COMMENT '审批时间'");
        add("t_secondary_process", "images", "TEXT DEFAULT NULL COMMENT '工艺图片URL列表'");
        add("t_secondary_process", "attachments", "TEXT DEFAULT NULL COMMENT '工艺附件列表'");
        add("t_secondary_process", "assignee_id", "VARCHAR(64) DEFAULT NULL COMMENT '领取人ID'");
        add("t_secondary_process", "operator_id", "VARCHAR(64) DEFAULT NULL COMMENT '操作人ID'");
        add("t_secondary_process", "operator_name", "VARCHAR(100) DEFAULT NULL COMMENT '操作人姓名'");
        add("t_secondary_process", "factory_id", "VARCHAR(64) DEFAULT NULL COMMENT '工厂ID'");
        add("t_secondary_process", "factory_contact_person", "VARCHAR(50) DEFAULT NULL COMMENT '工厂联系人'");
        add("t_secondary_process", "factory_contact_phone", "VARCHAR(20) DEFAULT NULL COMMENT '工厂联系电话'");
        add("t_secondary_process", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_pattern_production", "review_status", "VARCHAR(20) DEFAULT NULL COMMENT '审核状态'");
        add("t_pattern_production", "review_result", "VARCHAR(20) DEFAULT NULL COMMENT '审核结论'");
        add("t_pattern_production", "review_remark", "VARCHAR(500) DEFAULT NULL COMMENT '审核备注'");
        add("t_pattern_production", "review_by", "VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名'");
        add("t_pattern_production", "review_by_id", "VARCHAR(64) DEFAULT NULL COMMENT '审核人ID'");
        add("t_pattern_production", "review_time", "DATETIME DEFAULT NULL COMMENT '审核时间'");
        add("t_pattern_production", "receiver_id", "VARCHAR(64) DEFAULT NULL COMMENT '领取人ID'");
        add("t_pattern_production", "pattern_maker_id", "VARCHAR(64) DEFAULT NULL COMMENT '纸样师ID'");
        add("t_pattern_production", "has_secondary_process", "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否有二次工艺'");
        add("t_pattern_production", "maintainer", "VARCHAR(100) DEFAULT NULL COMMENT '维护人'");
        add("t_pattern_production", "maintain_time", "DATETIME DEFAULT NULL COMMENT '维护时间'");
        add("t_pattern_production", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_material_picking_item", "specification", "VARCHAR(200) DEFAULT NULL COMMENT '规格'");
        add("t_material_picking_item", "unit_price", "DECIMAL(12,2) DEFAULT NULL COMMENT '单价'");
        add("t_material_picking_item", "fabric_width", "VARCHAR(100) DEFAULT NULL COMMENT '面料门幅'");
        add("t_material_picking_item", "fabric_composition", "VARCHAR(500) DEFAULT NULL COMMENT '面料成分'");
        add("t_material_picking_item", "fabric_weight", "VARCHAR(50) DEFAULT NULL COMMENT '克重'");
        add("t_material_picking_item", "supplier_name", "VARCHAR(200) DEFAULT NULL COMMENT '供应商名称'");
        add("t_material_picking_item", "warehouse_location", "VARCHAR(200) DEFAULT NULL COMMENT '仓库位置'");
        add("t_material_picking_item", "material_type", "VARCHAR(50) DEFAULT NULL COMMENT '物料类型'");

        add("t_material_picking", "purchase_id", "VARCHAR(64) DEFAULT NULL COMMENT '关联采购单ID'");
        add("t_material_picking", "audit_status", "VARCHAR(32) DEFAULT NULL COMMENT '审核状态'");
        add("t_material_picking", "auditor_id", "VARCHAR(64) DEFAULT NULL COMMENT '审核人ID'");
        add("t_material_picking", "auditor_name", "VARCHAR(128) DEFAULT NULL COMMENT '审核人姓名'");
        add("t_material_picking", "audit_time", "DATETIME DEFAULT NULL COMMENT '审核时间'");
        add("t_material_picking", "audit_remark", "VARCHAR(500) DEFAULT NULL COMMENT '审核备注'");
        add("t_material_picking", "finance_status", "VARCHAR(32) DEFAULT NULL COMMENT '财务状态'");
        add("t_material_picking", "finance_remark", "VARCHAR(500) DEFAULT NULL COMMENT '财务备注'");
        add("t_material_picking", "pickup_type", "VARCHAR(20) DEFAULT NULL COMMENT '领取类型'");
        add("t_material_picking", "usage_type", "VARCHAR(30) DEFAULT NULL COMMENT '用途类型'");
        add("t_material_picking", "pick_time", "DATETIME DEFAULT NULL COMMENT '领取时间'");
        add("t_material_picking", "delete_flag", "INT NOT NULL DEFAULT 0 COMMENT '删除标记'");

        add("t_material_pickup_record", "fabric_width", "VARCHAR(50) DEFAULT NULL COMMENT '幅宽'");
        add("t_material_pickup_record", "fabric_weight", "VARCHAR(50) DEFAULT NULL COMMENT '克重'");
        add("t_material_pickup_record", "fabric_composition", "VARCHAR(200) DEFAULT NULL COMMENT '成分'");
        add("t_material_pickup_record", "movement_type", "VARCHAR(20) DEFAULT NULL COMMENT '流向类型'");
        add("t_material_pickup_record", "source_type", "VARCHAR(30) DEFAULT NULL COMMENT '来源类型'");
        add("t_material_pickup_record", "usage_type", "VARCHAR(30) DEFAULT NULL COMMENT '用途类型'");
        add("t_material_pickup_record", "source_record_id", "VARCHAR(64) DEFAULT NULL COMMENT '来源记录ID'");
        add("t_material_pickup_record", "source_document_no", "VARCHAR(64) DEFAULT NULL COMMENT '来源单号'");
        add("t_material_pickup_record", "receiver_id", "VARCHAR(64) DEFAULT NULL COMMENT '收料人ID'");
        add("t_material_pickup_record", "receiver_name", "VARCHAR(100) DEFAULT NULL COMMENT '收料人姓名'");
        add("t_material_pickup_record", "issuer_id", "VARCHAR(64) DEFAULT NULL COMMENT '发料人ID'");
        add("t_material_pickup_record", "issuer_name", "VARCHAR(100) DEFAULT NULL COMMENT '发料人姓名'");
        add("t_material_pickup_record", "warehouse_location", "VARCHAR(200) DEFAULT NULL COMMENT '仓库库位'");
        add("t_material_pickup_record", "receivable_id", "VARCHAR(64) DEFAULT NULL COMMENT '关联应收ID'");
        add("t_material_pickup_record", "receivable_no", "VARCHAR(64) DEFAULT NULL COMMENT '关联应收单号'");
        add("t_material_pickup_record", "receivable_status", "VARCHAR(20) DEFAULT NULL COMMENT '应收状态'");
        add("t_material_pickup_record", "received_amount", "DECIMAL(14,2) DEFAULT NULL COMMENT '累计收款金额'");
        add("t_material_pickup_record", "received_time", "DATETIME DEFAULT NULL COMMENT '收款完成时间'");
        add("t_material_pickup_record", "factory_id", "VARCHAR(64) DEFAULT NULL COMMENT '生产方ID'");
        add("t_material_pickup_record", "factory_name", "VARCHAR(100) DEFAULT NULL COMMENT '生产方名称'");
        add("t_material_pickup_record", "factory_type", "VARCHAR(20) DEFAULT NULL COMMENT '生产方类型'");
        add("t_material_pickup_record", "amount", "DECIMAL(14,2) DEFAULT NULL COMMENT '金额小计'");
        add("t_material_pickup_record", "unit_price", "DECIMAL(14,4) DEFAULT NULL COMMENT '单价'");

        add("t_scan_record", "scan_mode", "VARCHAR(20) DEFAULT NULL COMMENT '扫码模式'");
        add("t_scan_record", "sku_completed_count", "INT DEFAULT NULL COMMENT 'SKU已完成数'");
        add("t_scan_record", "sku_total_count", "INT DEFAULT NULL COMMENT 'SKU总数'");
        add("t_scan_record", "process_unit_price", "DECIMAL(12,4) DEFAULT NULL COMMENT '工序单价'");
        add("t_scan_record", "scan_cost", "DECIMAL(12,4) DEFAULT NULL COMMENT '本次扫码工序成本'");
        add("t_scan_record", "delegate_target_type", "VARCHAR(20) DEFAULT NULL COMMENT '指派目标类型'");
        add("t_scan_record", "delegate_target_id", "VARCHAR(64) DEFAULT NULL COMMENT '指派目标ID'");
        add("t_scan_record", "delegate_target_name", "VARCHAR(100) DEFAULT NULL COMMENT '指派目标名称'");
        add("t_scan_record", "actual_operator_id", "VARCHAR(64) DEFAULT NULL COMMENT '实际操作员ID'");
        add("t_scan_record", "actual_operator_name", "VARCHAR(100) DEFAULT NULL COMMENT '实际操作员名称'");
        add("t_scan_record", "cutting_bundle_qr_code", "VARCHAR(200) DEFAULT NULL COMMENT '裁剪菲号二维码'");
        add("t_scan_record", "progress_stage", "VARCHAR(30) DEFAULT NULL COMMENT '生产阶段'");
        add("t_scan_record", "payroll_settlement_id", "VARCHAR(64) DEFAULT NULL COMMENT '关联工资结算单ID'");
        add("t_scan_record", "factory_id", "VARCHAR(64) DEFAULT NULL COMMENT '扫码时归属外发工厂ID'");
        add("t_scan_record", "process_code", "VARCHAR(50) DEFAULT NULL COMMENT '工序代码'");
        add("t_scan_record", "process_name", "VARCHAR(100) DEFAULT NULL COMMENT '工序名称'");
        add("t_scan_record", "settlement_status", "VARCHAR(20) DEFAULT NULL COMMENT '结算状态'");
        add("t_scan_record", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");
        add("t_scan_record", "current_progress_stage", "VARCHAR(64) DEFAULT NULL COMMENT '当前工序阶段'");
        add("t_scan_record", "progress_node_unit_prices", "TEXT DEFAULT NULL COMMENT '工序节点单价列表JSON'");
        add("t_scan_record", "cumulative_scan_count", "INT DEFAULT NULL COMMENT '累计扫码次数'");
        add("t_scan_record", "total_scan_count", "INT DEFAULT NULL COMMENT '总扫码次数'");
        add("t_scan_record", "progress_percentage", "DECIMAL(5,2) DEFAULT NULL COMMENT '进度百分比'");
        add("t_scan_record", "total_piece_cost", "DECIMAL(12,2) DEFAULT NULL COMMENT '总成本'");
        add("t_scan_record", "average_piece_cost", "DECIMAL(12,2) DEFAULT NULL COMMENT '平均成本'");
        add("t_scan_record", "assignment_id", "VARCHAR(64) DEFAULT NULL COMMENT '工序指派ID'");
        add("t_scan_record", "assigned_operator_name", "VARCHAR(64) DEFAULT NULL COMMENT '指派操作员名称'");
        add("t_scan_record", "receive_time", "DATETIME DEFAULT NULL COMMENT '领取/开始时间'");
        add("t_scan_record", "confirm_time", "DATETIME DEFAULT NULL COMMENT '录入结果/完成时间'");

        add("t_production_order", "progress_workflow_json", "LONGTEXT DEFAULT NULL COMMENT '生产进度工作流JSON'");
        add("t_production_order", "progress_workflow_locked", "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '进度流程是否锁定'");
        add("t_production_order", "progress_workflow_locked_at", "DATETIME DEFAULT NULL COMMENT '锁定时间'");
        add("t_production_order", "progress_workflow_locked_by", "VARCHAR(64) DEFAULT NULL COMMENT '锁定人ID'");
        add("t_production_order", "progress_workflow_locked_by_name", "VARCHAR(100) DEFAULT NULL COMMENT '锁定人姓名'");
        add("t_production_order", "skc", "VARCHAR(64) DEFAULT NULL COMMENT 'SKC统一编号'");
        add("t_production_order", "urgency_level", "INT NOT NULL DEFAULT 0 COMMENT '紧急程度'");
        add("t_production_order", "plate_type", "VARCHAR(20) DEFAULT NULL COMMENT '板型'");
        add("t_production_order", "order_biz_type", "VARCHAR(30) DEFAULT NULL COMMENT '订单业务类型'");
        add("t_production_order", "factory_type", "VARCHAR(20) DEFAULT NULL COMMENT '工厂类型'");
        add("t_production_order", "procurement_manually_completed", "TINYINT(1) DEFAULT NULL COMMENT '采购是否手动标记完成'");
        add("t_production_order", "org_unit_id", "VARCHAR(64) DEFAULT NULL");
        add("t_production_order", "parent_org_unit_id", "VARCHAR(64) DEFAULT NULL");
        add("t_production_order", "parent_org_unit_name", "VARCHAR(100) DEFAULT NULL");
        add("t_production_order", "org_path", "VARCHAR(500) DEFAULT NULL");
        add("t_production_order", "factory_contact_person", "VARCHAR(50) DEFAULT NULL");
        add("t_production_order", "factory_contact_phone", "VARCHAR(20) DEFAULT NULL");
        add("t_production_order", "merchandiser", "VARCHAR(50) DEFAULT NULL");
        add("t_production_order", "customer_id", "VARCHAR(64) DEFAULT NULL");
        add("t_production_order", "company", "VARCHAR(100) DEFAULT NULL");
        add("t_production_order", "product_category", "VARCHAR(50) DEFAULT NULL");
        add("t_production_order", "pattern_maker", "VARCHAR(50) DEFAULT NULL");
        add("t_production_order", "production_progress", "INT DEFAULT NULL");
        add("t_production_order", "expected_ship_date", "DATE DEFAULT NULL");
        add("t_production_order", "node_operations", "LONGTEXT DEFAULT NULL");
        add("t_production_order", "created_by_id", "VARCHAR(64) DEFAULT NULL");
        add("t_production_order", "created_by_name", "VARCHAR(100) DEFAULT NULL");
        add("t_production_order", "source_biz_type", "VARCHAR(30) DEFAULT NULL");
        add("t_production_order", "pushed_to_order", "INT DEFAULT NULL");
        add("t_production_order", "version", "INT NOT NULL DEFAULT 0");
        add("t_production_order", "remarks", "VARCHAR(500) DEFAULT NULL");
        add("t_production_order", "procurement_confirmed_by", "VARCHAR(64) DEFAULT NULL");
        add("t_production_order", "procurement_confirmed_by_name", "VARCHAR(100) DEFAULT NULL");
        add("t_production_order", "procurement_confirmed_at", "DATETIME DEFAULT NULL");
        add("t_production_order", "procurement_confirm_remark", "VARCHAR(500) DEFAULT NULL");
        add("t_production_order", "transfer_log_json", "LONGTEXT DEFAULT NULL");
        add("t_production_order", "factory_unit_price", "DECIMAL(10,2) DEFAULT NULL");
        add("t_production_order", "pricing_mode", "VARCHAR(20) DEFAULT NULL");
        add("t_production_order", "scatter_pricing_mode", "VARCHAR(20) DEFAULT NULL");
        add("t_production_order", "scatter_cutting_unit_price", "DECIMAL(10,2) DEFAULT NULL");
        add("t_production_order", "material_arrival_rate", "INT DEFAULT NULL");
        add("t_production_order", "delete_flag", "INT NOT NULL DEFAULT 0 COMMENT '删除标志'");
        add("t_production_order", "completed_quantity", "INT DEFAULT NULL COMMENT '完成数量'");
        add("t_production_order", "order_details", "LONGTEXT DEFAULT NULL COMMENT '订单明细JSON'");
        add("t_production_order", "qr_code", "VARCHAR(200) DEFAULT NULL COMMENT '二维码'");
        add("t_production_order", "color", "VARCHAR(50) DEFAULT NULL COMMENT '颜色'");
        add("t_production_order", "size", "VARCHAR(50) DEFAULT NULL COMMENT '尺码'");
        add("t_production_order", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_payroll_settlement", "settlement_no", "VARCHAR(64) DEFAULT NULL COMMENT '结算单号'");
        add("t_payroll_settlement", "auditor_id", "VARCHAR(64) DEFAULT NULL COMMENT '审核人ID'");
        add("t_payroll_settlement", "auditor_name", "VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名'");
        add("t_payroll_settlement", "audit_time", "DATETIME DEFAULT NULL COMMENT '审核时间'");
        add("t_payroll_settlement", "confirmer_id", "VARCHAR(64) DEFAULT NULL COMMENT '确认人ID'");
        add("t_payroll_settlement", "confirmer_name", "VARCHAR(100) DEFAULT NULL COMMENT '确认人姓名'");
        add("t_payroll_settlement", "confirm_time", "DATETIME DEFAULT NULL COMMENT '确认时间'");
        add("t_payroll_settlement", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_intelligence_prediction_log", "factory_name", "VARCHAR(128) DEFAULT NULL COMMENT '工厂名称'");
        add("t_intelligence_prediction_log", "daily_velocity", "DOUBLE DEFAULT NULL COMMENT '日均产量'");
        add("t_intelligence_prediction_log", "remaining_qty", "BIGINT DEFAULT NULL COMMENT '剩余件数'");
        add("t_intelligence_prediction_log", "delete_flag", "INT NOT NULL DEFAULT 0 COMMENT '删除标记'");

        add("t_intelligence_audit_log", "created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
        add("t_intelligence_audit_log", "tenant_id", "BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID'");
        add("t_intelligence_audit_log", "command_id", "VARCHAR(64) DEFAULT NULL COMMENT '命令ID'");
        add("t_intelligence_audit_log", "action", "VARCHAR(100) DEFAULT NULL COMMENT '命令类型'");
        add("t_intelligence_audit_log", "target_id", "VARCHAR(100) DEFAULT NULL COMMENT '目标对象ID'");
        add("t_intelligence_audit_log", "executor_id", "VARCHAR(64) DEFAULT NULL COMMENT '执行人ID'");
        add("t_intelligence_audit_log", "status", "VARCHAR(32) DEFAULT 'EXECUTING' COMMENT '执行状态'");
        add("t_intelligence_audit_log", "reason", "VARCHAR(500) DEFAULT NULL COMMENT '命令原始理由'");
        add("t_intelligence_audit_log", "risk_level", "INT DEFAULT NULL COMMENT '风险等级'");
        add("t_intelligence_audit_log", "result_data", "TEXT DEFAULT NULL COMMENT '执行结果JSON'");
        add("t_intelligence_audit_log", "error_message", "TEXT DEFAULT NULL COMMENT '错误信息'");
        add("t_intelligence_audit_log", "duration_ms", "BIGINT DEFAULT NULL COMMENT '执行耗时'");
        add("t_intelligence_audit_log", "remark", "VARCHAR(500) DEFAULT NULL COMMENT '备注'");
        add("t_intelligence_audit_log", "requires_approval", "TINYINT(1) DEFAULT 0 COMMENT '是否需要人工审批'");
        add("t_intelligence_audit_log", "approved_by", "VARCHAR(64) DEFAULT NULL COMMENT '审批人ID'");
        add("t_intelligence_audit_log", "approved_at", "DATETIME DEFAULT NULL COMMENT '审批时间'");
        add("t_intelligence_audit_log", "approval_remark", "VARCHAR(500) DEFAULT NULL COMMENT '审批备注'");

        add("t_intelligence_metrics", "trace_id", "VARCHAR(64) DEFAULT NULL COMMENT 'AI调用追踪ID'");
        add("t_intelligence_metrics", "trace_url", "VARCHAR(500) DEFAULT NULL COMMENT 'Trace链接'");
        add("t_intelligence_metrics", "tool_call_count", "INT DEFAULT NULL COMMENT '工具次数'");
        add("t_intelligence_metrics", "prompt_tokens", "INT DEFAULT NULL");
        add("t_intelligence_metrics", "completion_tokens", "INT DEFAULT NULL");

        add("t_agent_execution_log", "specialist_results", "TEXT DEFAULT NULL COMMENT '专家Agent执行结果'");
        add("t_agent_execution_log", "node_trace", "TEXT DEFAULT NULL COMMENT '图节点执行轨迹'");
        add("t_agent_execution_log", "digital_twin_snapshot", "TEXT DEFAULT NULL COMMENT '数字孪生快照'");
        add("t_agent_execution_log", "user_feedback", "INT DEFAULT NULL COMMENT '用户反馈评分'");
        add("t_agent_execution_log", "feedback_note", "VARCHAR(500) DEFAULT NULL COMMENT '反馈备注'");

        add("t_ai_job_run_log", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_shipment_reconciliation", "auditor_id", "VARCHAR(32) DEFAULT NULL");
        add("t_shipment_reconciliation", "auditor_name", "VARCHAR(100) DEFAULT NULL");
        add("t_shipment_reconciliation", "audit_time", "DATETIME DEFAULT NULL");
        add("t_shipment_reconciliation", "delete_flag", "TINYINT(1) NOT NULL DEFAULT 0");
        add("t_shipment_reconciliation", "scan_cost", "DECIMAL(15,2) DEFAULT NULL COMMENT '工序成本'");
        add("t_shipment_reconciliation", "material_cost", "DECIMAL(15,2) DEFAULT NULL COMMENT '物料成本'");
        add("t_shipment_reconciliation", "total_cost", "DECIMAL(15,2) DEFAULT NULL COMMENT '总成本'");
        add("t_shipment_reconciliation", "profit_amount", "DECIMAL(15,2) DEFAULT NULL COMMENT '利润'");
        add("t_shipment_reconciliation", "profit_margin", "DECIMAL(5,2) DEFAULT NULL COMMENT '利润率'");
        add("t_shipment_reconciliation", "reconciliation_operator_id", "VARCHAR(64) DEFAULT NULL COMMENT '对账操作人ID'");
        add("t_shipment_reconciliation", "reconciliation_operator_name", "VARCHAR(100) DEFAULT NULL COMMENT '对账操作人姓名'");
        add("t_shipment_reconciliation", "reconciliation_time", "DATETIME DEFAULT NULL COMMENT '对账时间'");
        add("t_shipment_reconciliation", "is_own_factory", "INT DEFAULT NULL COMMENT '是否本厂'");
        add("t_shipment_reconciliation", "reconciliation_date", "DATETIME DEFAULT NULL COMMENT '对账日期'");
        add("t_shipment_reconciliation", "verified_at", "DATETIME DEFAULT NULL COMMENT '验证时间'");
        add("t_shipment_reconciliation", "approved_at", "DATETIME DEFAULT NULL COMMENT '批准时间'");
        add("t_shipment_reconciliation", "paid_at", "DATETIME DEFAULT NULL COMMENT '收款时间'");
        add("t_shipment_reconciliation", "re_review_at", "DATETIME DEFAULT NULL COMMENT '复审时间'");
        add("t_shipment_reconciliation", "re_review_reason", "VARCHAR(500) DEFAULT NULL COMMENT '复审原因'");
        add("t_shipment_reconciliation", "create_by", "VARCHAR(64) DEFAULT NULL COMMENT '创建人'");
        add("t_shipment_reconciliation", "update_by", "VARCHAR(64) DEFAULT NULL COMMENT '更新人'");
        add("t_shipment_reconciliation", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_bill_aggregation", "delete_flag", "INT NOT NULL DEFAULT 0");
        add("t_receivable", "delete_flag", "TINYINT(1) NOT NULL DEFAULT 0");

        add("t_deduction_item", "source_type", "VARCHAR(64) DEFAULT NULL COMMENT '来源类型'");
        add("t_deduction_item", "source_id", "VARCHAR(64) DEFAULT NULL COMMENT '来源ID'");
        add("t_deduction_item", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_payable", "bill_aggregation_id", "VARCHAR(64) DEFAULT NULL COMMENT '关联账单汇总ID'");
        add("t_receivable", "bill_aggregation_id", "VARCHAR(64) DEFAULT NULL COMMENT '关联账单汇总ID'");
        add("t_receivable", "source_biz_type", "VARCHAR(30) DEFAULT NULL COMMENT '来源业务类型'");
        add("t_receivable", "source_biz_id", "VARCHAR(64) DEFAULT NULL COMMENT '来源业务ID'");
        add("t_receivable", "source_biz_no", "VARCHAR(64) DEFAULT NULL COMMENT '来源业务单号'");
        add("t_receivable", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_material_purchase", "inbound_record_id", "VARCHAR(64) DEFAULT NULL COMMENT '入库记录ID'");
        add("t_material_purchase", "color", "VARCHAR(50) DEFAULT NULL COMMENT '颜色'");
        add("t_material_purchase", "size", "VARCHAR(50) DEFAULT NULL COMMENT '尺码'");
        add("t_material_purchase", "expected_arrival_date", "DATETIME DEFAULT NULL COMMENT '预计到货日期'");
        add("t_material_purchase", "actual_arrival_date", "DATETIME DEFAULT NULL COMMENT '实际到货日期'");
        add("t_material_purchase", "creator_id", "VARCHAR(64) DEFAULT NULL COMMENT '创建人ID'");
        add("t_material_purchase", "creator_name", "VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名'");
        add("t_material_purchase", "updater_id", "VARCHAR(64) DEFAULT NULL COMMENT '更新人ID'");
        add("t_material_purchase", "updater_name", "VARCHAR(100) DEFAULT NULL COMMENT '更新人姓名'");

        add("t_product_outstock", "operator_id", "VARCHAR(64) DEFAULT NULL COMMENT '操作人ID'");
        add("t_product_outstock", "operator_name", "VARCHAR(100) DEFAULT NULL COMMENT '操作人姓名'");
        add("t_product_outstock", "creator_id", "VARCHAR(64) DEFAULT NULL COMMENT '创建人ID'");
        add("t_product_outstock", "creator_name", "VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名'");
        add("t_product_outstock", "sku_code", "VARCHAR(100) DEFAULT NULL COMMENT 'SKU编码'");
        add("t_product_outstock", "color", "VARCHAR(50) DEFAULT NULL COMMENT '颜色'");
        add("t_product_outstock", "size", "VARCHAR(50) DEFAULT NULL COMMENT '尺码'");
        add("t_product_outstock", "cost_price", "DECIMAL(12,2) DEFAULT NULL COMMENT '成本价'");
        add("t_product_outstock", "sales_price", "DECIMAL(12,2) DEFAULT NULL COMMENT '销售价'");
        add("t_product_outstock", "tracking_no", "VARCHAR(100) DEFAULT NULL COMMENT '快递单号'");
        add("t_product_outstock", "express_company", "VARCHAR(50) DEFAULT NULL COMMENT '快递公司'");
        add("t_product_outstock", "receive_status", "VARCHAR(20) DEFAULT NULL COMMENT '收货状态'");
        add("t_product_outstock", "receive_time", "DATETIME DEFAULT NULL COMMENT '收货时间'");
        add("t_product_outstock", "received_by", "VARCHAR(36) DEFAULT NULL COMMENT '收货人ID'");
        add("t_product_outstock", "received_by_name", "VARCHAR(100) DEFAULT NULL COMMENT '收货人姓名'");
        add("t_product_outstock", "customer_name", "VARCHAR(100) DEFAULT NULL COMMENT '客户名称'");
        add("t_product_outstock", "customer_phone", "VARCHAR(50) DEFAULT NULL COMMENT '客户电话'");
        add("t_product_outstock", "shipping_address", "VARCHAR(500) DEFAULT NULL COMMENT '收货地址'");
        add("t_product_outstock", "total_amount", "DECIMAL(12,2) DEFAULT NULL COMMENT '总金额'");
        add("t_product_outstock", "paid_amount", "DECIMAL(12,2) DEFAULT 0.00 COMMENT '已付金额'");
        add("t_product_outstock", "payment_status", "VARCHAR(20) DEFAULT NULL COMMENT '付款状态'");
        add("t_product_outstock", "settlement_time", "DATETIME DEFAULT NULL COMMENT '结算时间'");
        add("t_product_outstock", "tenant_id", "BIGINT DEFAULT NULL COMMENT '租户ID'");

        add("t_factory_shipment", "ship_method", "VARCHAR(32) DEFAULT 'EXPRESS'");
        add("t_factory_shipment", "delete_flag", "INT NOT NULL DEFAULT 0 COMMENT '删除标记'");

        add("t_order_remark", "id", "BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键'");

        TABLE_FIXES.put("t_intelligence_audit_log",
            "CREATE TABLE IF NOT EXISTS `t_intelligence_audit_log` ("
            + "`id` VARCHAR(32) NOT NULL COMMENT '审计日志ID',"
            + "`tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID',"
            + "`command_id` VARCHAR(64) DEFAULT NULL COMMENT '命令ID',"
            + "`action` VARCHAR(100) DEFAULT NULL COMMENT '命令类型',"
            + "`target_id` VARCHAR(100) DEFAULT NULL COMMENT '目标对象ID',"
            + "`executor_id` VARCHAR(64) DEFAULT NULL COMMENT '执行人ID',"
            + "`status` VARCHAR(32) DEFAULT 'EXECUTING' COMMENT '执行状态',"
            + "`reason` VARCHAR(500) DEFAULT NULL COMMENT '命令原始理由',"
            + "`risk_level` INT DEFAULT NULL COMMENT '风险等级',"
            + "`result_data` TEXT DEFAULT NULL COMMENT '执行结果JSON',"
            + "`error_message` TEXT DEFAULT NULL COMMENT '错误信息',"
            + "`duration_ms` BIGINT DEFAULT NULL COMMENT '执行耗时',"
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

        TABLE_FIXES.put("t_agent_meeting",
            "CREATE TABLE IF NOT EXISTS `t_agent_meeting` ("
            + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
            + "`tenant_id` BIGINT NOT NULL,"
            + "`meeting_type` VARCHAR(50) NOT NULL,"
            + "`topic` VARCHAR(300) NOT NULL,"
            + "`participants` VARCHAR(500) DEFAULT NULL,"
            + "`agenda` TEXT DEFAULT NULL,"
            + "`debate_rounds` TEXT DEFAULT NULL,"
            + "`consensus` TEXT DEFAULT NULL,"
            + "`dissent` TEXT DEFAULT NULL,"
            + "`action_items` TEXT DEFAULT NULL,"
            + "`confidence_score` INT DEFAULT NULL,"
            + "`linked_decision_ids` VARCHAR(500) DEFAULT NULL,"
            + "`linked_rca_ids` VARCHAR(500) DEFAULT NULL,"
            + "`duration_ms` BIGINT DEFAULT NULL,"
            + "`status` VARCHAR(20) DEFAULT 'concluded',"
            + "`delete_flag` INT DEFAULT 0,"
            + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "PRIMARY KEY (`id`),"
            + "KEY `idx_am_tenant_type` (`tenant_id`, `meeting_type`),"
            + "KEY `idx_am_create_time` (`create_time`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent例会'");

        TABLE_FIXES.put("t_material_pickup_record",
            "CREATE TABLE IF NOT EXISTS `t_material_pickup_record` ("
            + "`id` VARCHAR(64) NOT NULL COMMENT '主键UUID',"
            + "`tenant_id` VARCHAR(64) DEFAULT NULL COMMENT '租户ID',"
            + "`pickup_no` VARCHAR(64) NOT NULL COMMENT '领取单号',"
            + "`pickup_type` VARCHAR(20) NOT NULL DEFAULT 'INTERNAL' COMMENT '领取类型',"
            + "`order_no` VARCHAR(100) DEFAULT NULL COMMENT '关联生产订单号',"
            + "`style_no` VARCHAR(100) DEFAULT NULL COMMENT '关联款号',"
            + "`material_id` VARCHAR(64) DEFAULT NULL COMMENT '物料ID',"
            + "`material_code` VARCHAR(100) DEFAULT NULL COMMENT '物料编号',"
            + "`material_name` VARCHAR(200) DEFAULT NULL COMMENT '物料名称',"
            + "`material_type` VARCHAR(50) DEFAULT NULL COMMENT '物料类型',"
            + "`color` VARCHAR(100) DEFAULT NULL COMMENT '颜色',"
            + "`specification` VARCHAR(200) DEFAULT NULL COMMENT '规格',"
            + "`quantity` DECIMAL(14,3) DEFAULT NULL COMMENT '领取数量',"
            + "`unit` VARCHAR(20) DEFAULT NULL COMMENT '单位',"
            + "`unit_price` DECIMAL(14,4) DEFAULT NULL COMMENT '单价',"
            + "`amount` DECIMAL(14,2) DEFAULT NULL COMMENT '金额小计',"
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
            + "`delete_flag` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标记',"
            + "PRIMARY KEY (`id`),"
            + "KEY `idx_mpick_tenant_audit` (`tenant_id`, `audit_status`),"
            + "KEY `idx_mpick_order_style` (`order_no`, `style_no`),"
            + "KEY `idx_mpick_finance` (`tenant_id`, `finance_status`),"
            + "KEY `idx_mpick_create_time` (`create_time`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='面辅料领取记录'");

        TABLE_FIXES.put("t_hyper_advisor_session",
            "CREATE TABLE IF NOT EXISTS `t_hyper_advisor_session` ("
            + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
            + "`tenant_id` BIGINT NOT NULL,"
            + "`user_id` VARCHAR(64) NOT NULL,"
            + "`session_id` VARCHAR(128) NOT NULL,"
            + "`role` VARCHAR(32) DEFAULT NULL,"
            + "`content` LONGTEXT DEFAULT NULL,"
            + "`metadata_json` TEXT DEFAULT NULL,"
            + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "`delete_flag` INT NOT NULL DEFAULT 0,"
            + "PRIMARY KEY (`id`),"
            + "KEY `idx_session_id` (`session_id`),"
            + "KEY `idx_tenant_user` (`tenant_id`, `user_id`),"
            + "KEY `idx_tenant_create` (`tenant_id`, `create_time`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='超级顾问会话记录'");

        TABLE_FIXES.put("t_advisor_feedback",
            "CREATE TABLE IF NOT EXISTS `t_advisor_feedback` ("
            + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
            + "`tenant_id` BIGINT NOT NULL,"
            + "`user_id` VARCHAR(64) NOT NULL,"
            + "`session_id` VARCHAR(64) NOT NULL,"
            + "`trace_id` VARCHAR(64) DEFAULT NULL,"
            + "`query_text` TEXT NOT NULL,"
            + "`advice_text` TEXT NOT NULL,"
            + "`score` DOUBLE NOT NULL DEFAULT 0,"
            + "`feedback_text` VARCHAR(500) DEFAULT NULL,"
            + "`harvested` TINYINT NOT NULL DEFAULT 0,"
            + "`harvested_kb_id` VARCHAR(64) DEFAULT NULL,"
            + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
            + "PRIMARY KEY (`id`),"
            + "KEY `idx_feedback_harvest` (`harvested`, `score`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='超级顾问反馈'");

        TABLE_FIXES.put("t_ai_user_profile",
            "CREATE TABLE IF NOT EXISTS `t_ai_user_profile` ("
            + "`id` BIGINT NOT NULL AUTO_INCREMENT,"
            + "`tenant_id` BIGINT NOT NULL,"
            + "`user_id` VARCHAR(64) NOT NULL,"
            + "`behavior_summary` TEXT DEFAULT NULL,"
            + "`preferences_json` LONGTEXT DEFAULT NULL,"
            + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "`update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            + "PRIMARY KEY (`id`),"
            + "UNIQUE KEY `uk_tenant_user` (`tenant_id`, `user_id`),"
            + "KEY `idx_tenant_id` (`tenant_id`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI用户画像'");

        TABLE_FIXES.put("t_purchase_order_doc",
            "CREATE TABLE IF NOT EXISTS `t_purchase_order_doc` ("
            + "`id` VARCHAR(36) NOT NULL,"
            + "`tenant_id` BIGINT NOT NULL,"
            + "`order_no` VARCHAR(100) NOT NULL,"
            + "`image_url` VARCHAR(1000) NOT NULL,"
            + "`raw_text` TEXT DEFAULT NULL,"
            + "`match_count` INT NOT NULL DEFAULT 0,"
            + "`total_recognized` INT NOT NULL DEFAULT 0,"
            + "`uploader_id` VARCHAR(36) DEFAULT NULL,"
            + "`uploader_name` VARCHAR(100) DEFAULT NULL,"
            + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"
            + "`delete_flag` INT NOT NULL DEFAULT 0,"
            + "PRIMARY KEY (`id`),"
            + "KEY `idx_pod_order_no` (`order_no`),"
            + "KEY `idx_pod_tenant_id` (`tenant_id`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='采购单据上传记录表'");

        TABLE_FIXES.put("t_material_database",
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

        TABLE_FIXES.put("t_intelligence_metrics",
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

        TABLE_FIXES.put("t_intelligence_signal",
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

        TABLE_FIXES.put("t_intelligence_action_task_feedback",
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

        TABLE_FIXES.put("t_order_remark",
            "CREATE TABLE IF NOT EXISTS `t_order_remark` ("
            + "`id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',"
            + "`target_type` VARCHAR(20) NOT NULL COMMENT 'order=大货订单 style=样衣开发',"
            + "`target_no` VARCHAR(100) NOT NULL COMMENT '订单号或款号',"
            + "`author_id` VARCHAR(64) DEFAULT NULL COMMENT '填写人ID',"
            + "`author_name` VARCHAR(100) DEFAULT NULL COMMENT '填写人姓名',"
            + "`author_role` VARCHAR(100) DEFAULT NULL COMMENT '填写人角色',"
            + "`content` TEXT NOT NULL COMMENT '备注内容',"
            + "`tenant_id` BIGINT NOT NULL COMMENT '租户ID',"
            + "`create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
            + "`delete_flag` INT NOT NULL DEFAULT 0 COMMENT '删除标记',"
            + "PRIMARY KEY (`id`),"
            + "KEY `idx_remark_target` (`tenant_id`,`target_type`,`target_no`),"
            + "KEY `idx_remark_time` (`tenant_id`,`create_time`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='订单/款式备注'");

        TABLE_FIXES.put("t_agent_execution_log",
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

        TABLE_FIXES.put("t_product_outstock",
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

        TABLE_FIXES.put("t_factory_shipment",
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

        TABLE_FIXES.put("t_factory_shipment_detail",
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

        TABLE_FIXES.put("t_process_price_adjustment",
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

        TABLE_FIXES.put("t_ai_job_run_log",
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

        TABLE_FIXES.put("t_sys_notice",
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

        TABLE_FIXES.put("t_production_process_tracking",
            "CREATE TABLE IF NOT EXISTS `t_production_process_tracking` ("
            + "`id` VARCHAR(64) NOT NULL COMMENT '主键ID',"
            + "`production_order_id` VARCHAR(64) DEFAULT NULL,"
            + "`production_order_no` VARCHAR(64) DEFAULT NULL,"
            + "`cutting_bundle_id` VARCHAR(64) DEFAULT NULL,"
            + "`bundle_no` VARCHAR(50) DEFAULT NULL,"
            + "`sku` VARCHAR(100) DEFAULT NULL,"
            + "`color` VARCHAR(50) DEFAULT NULL,"
            + "`size` VARCHAR(50) DEFAULT NULL,"
            + "`quantity` INT DEFAULT NULL,"
            + "`process_code` VARCHAR(50) DEFAULT NULL,"
            + "`process_name` VARCHAR(100) DEFAULT NULL,"
            + "`process_order` INT DEFAULT NULL,"
            + "`unit_price` DECIMAL(10,4) DEFAULT NULL,"
            + "`scan_status` VARCHAR(20) DEFAULT NULL,"
            + "`scan_time` DATETIME DEFAULT NULL,"
            + "`scan_record_id` VARCHAR(64) DEFAULT NULL,"
            + "`operator_id` VARCHAR(64) DEFAULT NULL,"
            + "`operator_name` VARCHAR(100) DEFAULT NULL,"
            + "`settlement_amount` DECIMAL(12,2) DEFAULT NULL,"
            + "`is_settled` TINYINT(1) DEFAULT 0,"
            + "`settled_at` DATETIME DEFAULT NULL,"
            + "`settled_batch_no` VARCHAR(64) DEFAULT NULL,"
            + "`settled_by` VARCHAR(64) DEFAULT NULL,"
            + "`created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "`updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            + "`creator` VARCHAR(64) DEFAULT NULL,"
            + "`updater` VARCHAR(64) DEFAULT NULL,"
            + "`tenant_id` BIGINT DEFAULT NULL,"
            + "PRIMARY KEY (`id`),"
            + "KEY `idx_ppt_order` (`production_order_no`),"
            + "KEY `idx_ppt_bundle` (`cutting_bundle_id`),"
            + "KEY `idx_ppt_tenant` (`tenant_id`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产工序追踪表'");

        TABLE_FIXES.put("t_customer_client_user",
            "CREATE TABLE IF NOT EXISTS `t_customer_client_user` ("
            + "`id` VARCHAR(36) NOT NULL COMMENT '主键',"
            + "`customer_id` VARCHAR(36) NOT NULL COMMENT '关联客户ID',"
            + "`tenant_id` BIGINT NOT NULL COMMENT '所属租户ID',"
            + "`username` VARCHAR(100) NOT NULL COMMENT '登录用户名',"
            + "`password_hash` VARCHAR(255) NOT NULL COMMENT '加密后的密码',"
            + "`contact_person` VARCHAR(100) DEFAULT NULL COMMENT '联系人姓名',"
            + "`contact_phone` VARCHAR(50) DEFAULT NULL COMMENT '联系电话',"
            + "`contact_email` VARCHAR(100) DEFAULT NULL COMMENT '联系邮箱',"
            + "`status` VARCHAR(20) DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE/INACTIVE',"
            + "`last_login_time` DATETIME DEFAULT NULL COMMENT '最后登录时间',"
            + "`create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
            + "`update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',"
            + "`delete_flag` INT DEFAULT 0 COMMENT '软删除标志：0正常1已删除',"
            + "PRIMARY KEY (`id`),"
            + "UNIQUE KEY `idx_ccu_username` (`username`),"
            + "KEY `idx_ccu_customer_id` (`customer_id`),"
            + "KEY `idx_ccu_tenant_id` (`tenant_id`)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户用户表'");
    }

    private static void add(String table, String column, String definition) {
        COLUMN_FIXES.computeIfAbsent(table, k -> new ArrayList<>()).add(new String[]{column, definition});
    }

    @Override
    public void run(ApplicationArguments args) {
        try (Connection conn = dataSource.getConnection()) {
            String schema = conn.getCatalog();
            int repaired = 0;
            int repairedTables = 0;

            for (Map.Entry<String, List<String[]>> entry : COLUMN_FIXES.entrySet()) {
                String table = entry.getKey();
                List<String[]> columns = entry.getValue();
                Set<String> existingColumns = getExistingColumns(conn, schema, table);
                for (String[] col : columns) {
                    if (!existingColumns.contains(col[0])) {
                        repaired += addColumn(conn, table, col[0], col[1]);
                    }
                }
            }

            for (Map.Entry<String, String> entry : TABLE_FIXES.entrySet()) {
                if (!tableExists(conn, schema, entry.getKey())) {
                    try (Statement stmt = conn.createStatement()) {
                        stmt.execute(entry.getValue());
                    }
                    log.warn("[DbRepair] 已创建缺失表: {}", entry.getKey());
                    repairedTables++;
                }
            }

            repaired += ensureSettlementViewHasCompleteTime(conn, schema);
            repaired += ensureColumnType(conn, schema, "t_style_info", "size_color_config",
                    "mediumtext", "MODIFY COLUMN `size_color_config` MEDIUMTEXT DEFAULT NULL COMMENT '颜色尺码数量矩阵JSON'");
            repaired += ensureColumnType(conn, schema, "t_style_size", "tolerance",
                    "varchar", "MODIFY COLUMN `tolerance` VARCHAR(50) DEFAULT NULL");
            repaired += ensureColumnType(conn, schema, "t_production_process_tracking", "id",
                    "varchar", "MODIFY COLUMN `id` VARCHAR(64) NOT NULL COMMENT '主键ID（UUID）'");
            repaired += ensureColumnIsNullable(conn, schema, "t_style_attachment", "style_no", "VARCHAR(64)");

            if (repaired > 0) {
                log.warn("[DbRepair] 共修复 {} 个缺失列", repaired);
            }
            if (repairedTables > 0) {
                log.warn("[DbRepair] 共修复 {} 张缺失表", repairedTables);
            }
            if (repaired == 0 && repairedTables == 0) {
                log.info("[DbRepair] 关键表结构完整，无需修复");
            }
        } catch (Exception e) {
            log.error("[DbRepair] 列修复失败，应用继续启动。原因: {}", e.getMessage());
        }

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

    private Set<String> getExistingColumns(Connection conn, String schema, String table) {
        try {
            String sql = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, schema);
                ps.setString(2, table);
                try (ResultSet rs = ps.executeQuery()) {
                    java.util.Set<String> cols = new java.util.HashSet<>();
                    while (rs.next()) {
                        cols.add(rs.getString(1));
                    }
                    return cols;
                }
            }
        } catch (Exception e) {
            log.error("[DbRepair] 查询表 {} 列信息失败: {}", table, e.getMessage());
            return java.util.Collections.emptySet();
        }
    }

    private int addColumn(Connection conn, String table, String column, String definition) {
        try {
            String sql = "ALTER TABLE `" + table + "` ADD COLUMN `" + column + "` " + definition;
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.executeUpdate();
            }
            log.warn("[DbRepair] 已添加缺失列: {}.{}", table, column);
            return 1;
        } catch (Exception e) {
            log.error("[DbRepair] 添加列 {}.{} 失败: {}", table, column, e.getMessage());
            return 0;
        }
    }

    private int ensureColumnIsNullable(Connection conn, String schema, String table, String column, String typeDefinition) {
        try {
            String checkSql = "SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1";
            String isNullable;
            try (PreparedStatement ps = conn.prepareStatement(checkSql)) {
                ps.setString(1, schema);
                ps.setString(2, table);
                ps.setString(3, column);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return 0;
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

    private int ensureSettlementViewHasCompleteTime(Connection conn, String schema) {
        try {
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
                log.warn("[DbRepair] 已重建视图 v_finished_product_settlement");
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 重建视图 v_finished_product_settlement 失败: {}", e.getMessage());
        }
        return 0;
    }

    private boolean columnExists(Connection conn, String schema, String table, String column) throws Exception {
        String sql = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?";
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
        String sql = "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1";
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

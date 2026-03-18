-- 云端核心表结构一键体检脚本（2026-03-18）
-- 用途：发布前或线上排障时，快速检查生产/采购/打版/工厂/款式核心表是否缺列。
-- 使用方式：在云端 SQL 控制台直接执行；结果为空表示当前核心缺列为 0。
-- 说明：本脚本只读 INFORMATION_SCHEMA，不修改任何业务数据。

SELECT expected.table_name,
       expected.column_name
FROM (
    SELECT 't_material_purchase' AS table_name, 'tenant_id' AS column_name
    UNION ALL SELECT 't_material_purchase', 'inbound_record_id'
    UNION ALL SELECT 't_material_purchase', 'supplier_contact_person'
    UNION ALL SELECT 't_material_purchase', 'supplier_contact_phone'
    UNION ALL SELECT 't_material_purchase', 'color'
    UNION ALL SELECT 't_material_purchase', 'size'
    UNION ALL SELECT 't_material_purchase', 'return_confirmed'
    UNION ALL SELECT 't_material_purchase', 'return_quantity'
    UNION ALL SELECT 't_material_purchase', 'return_confirmer_id'
    UNION ALL SELECT 't_material_purchase', 'return_confirmer_name'
    UNION ALL SELECT 't_material_purchase', 'return_confirm_time'
    UNION ALL SELECT 't_material_purchase', 'creator_id'
    UNION ALL SELECT 't_material_purchase', 'creator_name'
    UNION ALL SELECT 't_material_purchase', 'updater_id'
    UNION ALL SELECT 't_material_purchase', 'updater_name'
    UNION ALL SELECT 't_material_purchase', 'expected_arrival_date'
    UNION ALL SELECT 't_material_purchase', 'actual_arrival_date'
    UNION ALL SELECT 't_material_purchase', 'expected_ship_date'
    UNION ALL SELECT 't_material_purchase', 'source_type'
    UNION ALL SELECT 't_material_purchase', 'pattern_production_id'
    UNION ALL SELECT 't_material_purchase', 'evidence_image_urls'
    UNION ALL SELECT 't_material_purchase', 'fabric_composition'
    UNION ALL SELECT 't_material_purchase', 'invoice_urls'
    UNION ALL SELECT 't_purchase_order_doc', 'tenant_id'
    UNION ALL SELECT 't_purchase_order_doc', 'order_no'
    UNION ALL SELECT 't_purchase_order_doc', 'image_url'
    UNION ALL SELECT 't_purchase_order_doc', 'raw_text'
    UNION ALL SELECT 't_purchase_order_doc', 'match_count'
    UNION ALL SELECT 't_purchase_order_doc', 'total_recognized'
    UNION ALL SELECT 't_purchase_order_doc', 'uploader_id'
    UNION ALL SELECT 't_purchase_order_doc', 'uploader_name'
    UNION ALL SELECT 't_purchase_order_doc', 'create_time'
    UNION ALL SELECT 't_purchase_order_doc', 'delete_flag'
    UNION ALL SELECT 't_production_order', 'progress_workflow_json'
    UNION ALL SELECT 't_production_order', 'progress_workflow_locked'
    UNION ALL SELECT 't_production_order', 'progress_workflow_locked_at'
    UNION ALL SELECT 't_production_order', 'progress_workflow_locked_by'
    UNION ALL SELECT 't_production_order', 'progress_workflow_locked_by_name'
    UNION ALL SELECT 't_production_order', 'skc'
    UNION ALL SELECT 't_production_order', 'org_unit_id'
    UNION ALL SELECT 't_production_order', 'parent_org_unit_id'
    UNION ALL SELECT 't_production_order', 'parent_org_unit_name'
    UNION ALL SELECT 't_production_order', 'org_path'
    UNION ALL SELECT 't_production_order', 'factory_type'
    UNION ALL SELECT 't_production_order', 'factory_contact_person'
    UNION ALL SELECT 't_production_order', 'factory_contact_phone'
    UNION ALL SELECT 't_production_order', 'procurement_manually_completed'
    UNION ALL SELECT 't_production_order', 'procurement_confirmed_by'
    UNION ALL SELECT 't_production_order', 'procurement_confirmed_by_name'
    UNION ALL SELECT 't_production_order', 'procurement_confirmed_at'
    UNION ALL SELECT 't_production_order', 'procurement_confirm_remark'
    UNION ALL SELECT 't_production_order', 'urgency_level'
    UNION ALL SELECT 't_production_order', 'plate_type'
    UNION ALL SELECT 't_production_order', 'order_biz_type'
    UNION ALL SELECT 't_pattern_production', 'review_status'
    UNION ALL SELECT 't_pattern_production', 'receiver_id'
    UNION ALL SELECT 't_pattern_production', 'pattern_maker_id'
    UNION ALL SELECT 't_pattern_production', 'tenant_id'
    UNION ALL SELECT 't_pattern_production', 'has_secondary_process'
    UNION ALL SELECT 't_factory', 'supplier_type'
    UNION ALL SELECT 't_style_info', 'fabric_composition'
    UNION ALL SELECT 't_style_info', 'wash_instructions'
    UNION ALL SELECT 't_style_info', 'u_code'
    UNION ALL SELECT 't_style_info', 'fabric_composition_parts'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = expected.table_name
 AND actual.COLUMN_NAME = expected.column_name
WHERE actual.COLUMN_NAME IS NULL
ORDER BY expected.table_name, expected.column_name;

-- 扫码表租户归属完整性体检：任一结果非 0 都属于严重数据异常
SELECT COUNT(*) AS scan_record_null_tenant_count
FROM t_scan_record
WHERE tenant_id IS NULL;

SELECT COUNT(*) AS scan_record_zero_tenant_count
FROM t_scan_record
WHERE tenant_id = 0;

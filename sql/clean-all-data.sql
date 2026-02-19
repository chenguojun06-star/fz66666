SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE t_style_info;
TRUNCATE TABLE t_style_size;
TRUNCATE TABLE t_style_size_price;
TRUNCATE TABLE t_style_bom;
TRUNCATE TABLE t_style_process;
TRUNCATE TABLE t_style_quotation;
TRUNCATE TABLE t_style_attachment;
TRUNCATE TABLE t_style_operation_log;
TRUNCATE TABLE t_production_order;
TRUNCATE TABLE t_production_process_tracking;
TRUNCATE TABLE t_cutting_task;
TRUNCATE TABLE t_cutting_bundle;
TRUNCATE TABLE t_material_purchase;
TRUNCATE TABLE t_material_inbound;
TRUNCATE TABLE t_material_stock;
TRUNCATE TABLE t_material_database;
TRUNCATE TABLE t_scan_record;
TRUNCATE TABLE t_pattern_scan_record;
TRUNCATE TABLE t_pattern_production;
TRUNCATE TABLE t_pattern_revision;
TRUNCATE TABLE t_product_sku;
TRUNCATE TABLE t_sample_stock;
TRUNCATE TABLE t_secondary_process;
TRUNCATE TABLE t_expense_reimbursement;
TRUNCATE TABLE t_template_library;
TRUNCATE TABLE t_template_operation_log;
TRUNCATE TABLE t_login_log;
TRUNCATE TABLE t_operation_log;
TRUNCATE TABLE t_system_operation_log;
TRUNCATE TABLE t_factory;
TRUNCATE TABLE t_tenant;

DELETE FROM t_user WHERE id != 1;

UPDATE t_user SET tenant_id = NULL, is_tenant_owner = 0 WHERE id = 1;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'CLEAN DONE' as result;

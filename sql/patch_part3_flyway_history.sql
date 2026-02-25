-- PART 3/3: Flyway历史写入
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '10', 'add sample review fields', 'SQL', 'V10__add_sample_review_fields.sql',
    110028303, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260131', 'add performance indexes', 'SQL', 'V20260131__add_performance_indexes.sql',
    510076515, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260201', 'add foreign key constraints', 'SQL', 'V20260201__add_foreign_key_constraints.sql',
    1185713555, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260205', 'add order management fields', 'SQL', 'V20260205__add_order_management_fields.sql',
    1529555536, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260219', 'fix permission structure', 'SQL', 'V20260219__fix_permission_structure.sql',
    1245547631, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260221', 'init role templates and superadmin', 'SQL', 'V20260221__init_role_templates_and_superadmin.sql',
    969006084, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260221b', 'consolidate all missing migrations', 'SQL', 'V20260221b__consolidate_all_missing_migrations.sql',
    1640640703, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '2026022201', 'fix views and appstore prices', 'SQL', 'V2026022201__fix_views_and_appstore_prices.sql',
    116073704, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222', 'fix superadmin bcrypt password', 'SQL', 'V20260222__fix_superadmin_bcrypt_password.sql',
    1538398428, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222b', 'tenant storage billing', 'SQL', 'V20260222b__tenant_storage_billing.sql',
    1692666555, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222c', 'billing cycle', 'SQL', 'V20260222c__billing_cycle.sql',
    63202504, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222d', 'add tenant app permission', 'SQL', 'V20260222d__add_tenant_app_permission.sql',
    1874786357, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260222e', 'user feedback', 'SQL', 'V20260222e__user_feedback.sql',
    1496333103, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260223', 'unit price audit and pattern version', 'SQL', 'V20260223__unit_price_audit_and_pattern_version.sql',
    1136684691, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260223b', 'remaining tables and operator fields', 'SQL', 'V20260223b__remaining_tables_and_operator_fields.sql',
    1674290355, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260223c', 'add payment approval permissions', 'SQL', 'V20260223c__add_payment_approval_permissions.sql',
    1923624794, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260223d', 'billing invoice and tenant self service', 'SQL', 'V20260223d__billing_invoice_and_tenant_self_service.sql',
    1279588680, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260224', 'add data import permission', 'SQL', 'V20260224__add_data_import_permission.sql',
    1886750889, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260225', 'add user avatar url', 'SQL', 'V20260225__add_user_avatar_url.sql',
    1004891919, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '2026022601', 'sync flow stage view latest', 'SQL', 'V2026022601__sync_flow_stage_view_latest.sql',
    1060420605, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '2026022602', 'fix process tracking id types', 'SQL', 'V2026022602__fix_process_tracking_id_types.sql',
    668656949, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '20260226', 'add notify config', 'SQL', 'V20260226__add_notify_config.sql',
    1786844837, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '25', 'create logistics tables', 'SQL', 'V25__create_logistics_tables.sql',
    422347506, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '26', 'add scan record phase3 6 fields', 'SQL', 'V26__add_scan_record_phase3_6_fields.sql',
    333395036, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '2', 'baseline marker', 'SQL', 'V2__baseline_marker.sql',
    1032057997, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '30', 'create system config and audit log tables', 'SQL', 'V30__create_system_config_and_audit_log_tables.sql',
    1955086280, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '31', 'create logistics ecommerce tables', 'SQL', 'V31__create_logistics_ecommerce_tables.sql',
    1788090457, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '32', 'add logistics ecommerce permissions', 'SQL', 'V32__add_logistics_ecommerce_permissions.sql',
    433890950, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '33', 'order transfer', 'SQL', 'V33__order_transfer.sql',
    1983511376, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '34', 'add production process tracking table', 'SQL', 'V34__add_production_process_tracking_table.sql',
    1027034368, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '35', 'add tenant id to pattern scan record', 'SQL', 'V35__add_tenant_id_to_pattern_scan_record.sql',
    950705510, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '36', 'create integration tracking tables', 'SQL', 'V36__create_integration_tracking_tables.sql',
    1345647659, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '3', 'add defect fields to product warehousing', 'SQL', 'V3__add_defect_fields_to_product_warehousing.sql',
    1334982952, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '4', 'add missing fields for frontend', 'SQL', 'V4__add_missing_fields_for_frontend.sql',
    817947267, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '5', 'update flow stage snapshot view', 'SQL', 'V5__update_flow_stage_snapshot_view.sql',
    396035373, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '6', 'add sku fields to production order', 'SQL', 'V6__add_sku_fields_to_production_order.sql',
    76366543, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '7', 'create product sku table', 'SQL', 'V7__create_product_sku_table.sql',
    1196807412, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '8', 'add index scan stats', 'SQL', 'V8__add_index_scan_stats.sql',
    335744559, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;
INSERT IGNORE INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
  SELECT COALESCE(MAX(installed_rank),0)+1,
    '9', 'add stock quantity to product sku', 'SQL', 'V9__add_stock_quantity_to_product_sku.sql',
    537897495, 'cloud_patch', NOW(), 0, 1
  FROM flyway_schema_history;

DROP PROCEDURE IF EXISTS _add_col;
DROP PROCEDURE IF EXISTS _add_idx;

SELECT 'Part 3 DONE - Flyway history updated! Patch complete.' AS result;
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;
-- ======================== END PART 3 ========================

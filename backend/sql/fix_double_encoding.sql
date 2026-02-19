-- ============================================================
-- 修复 UTF-8 双重编码数据
-- 原因：UTF-8 中文被当作 CP1252/Latin1 重新编码为 UTF-8 写入
-- 方法：CONVERT(CAST(CONVERT(col USING latin1) AS BINARY) USING utf8mb4)
-- 日期：2026-02-10
-- ============================================================

-- 安全检查：先预览修复效果
-- SELECT role_name, CONVERT(CAST(CONVERT(role_name USING latin1) AS BINARY) USING utf8mb4) FROM t_role WHERE HEX(role_name) REGEXP 'C3A[4-9]';

SET NAMES utf8mb4;
SET @affected = 0;

-- ========== 1. t_role (角色表) ==========
UPDATE t_role SET role_name = CONVERT(CAST(CONVERT(role_name USING latin1) AS BINARY) USING utf8mb4)
WHERE HEX(role_name) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;
SELECT CONCAT('t_role.role_name: ', @cnt, ' rows fixed') AS progress;

UPDATE t_role SET description = CONVERT(CAST(CONVERT(description USING latin1) AS BINARY) USING utf8mb4)
WHERE description IS NOT NULL AND HEX(description) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;
SELECT CONCAT('t_role.description: ', @cnt, ' rows fixed') AS progress;

-- ========== 2. t_permission (权限表) ==========
UPDATE t_permission SET permission_name = CONVERT(CAST(CONVERT(permission_name USING latin1) AS BINARY) USING utf8mb4)
WHERE HEX(permission_name) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;
SELECT CONCAT('t_permission.permission_name: ', @cnt, ' rows fixed') AS progress;

UPDATE t_permission SET parent_name = CONVERT(CAST(CONVERT(parent_name USING latin1) AS BINARY) USING utf8mb4)
WHERE parent_name IS NOT NULL AND HEX(parent_name) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;
SELECT CONCAT('t_permission.parent_name: ', @cnt, ' rows fixed') AS progress;

-- ========== 3. t_dict (数据字典) ==========
UPDATE t_dict SET dict_label = CONVERT(CAST(CONVERT(dict_label USING latin1) AS BINARY) USING utf8mb4)
WHERE HEX(dict_label) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;
SELECT CONCAT('t_dict.dict_label: ', @cnt, ' rows fixed') AS progress;

-- ========== 4. t_factory (工厂) ==========
UPDATE t_factory SET factory_name = CONVERT(CAST(CONVERT(factory_name USING latin1) AS BINARY) USING utf8mb4)
WHERE HEX(factory_name) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_factory SET contact_person = CONVERT(CAST(CONVERT(contact_person USING latin1) AS BINARY) USING utf8mb4)
WHERE contact_person IS NOT NULL AND HEX(contact_person) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_factory SET address = CONVERT(CAST(CONVERT(address USING latin1) AS BINARY) USING utf8mb4)
WHERE address IS NOT NULL AND HEX(address) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;
SELECT CONCAT('t_factory: fixed') AS progress;

-- ========== 5. t_tenant (租户) ==========
UPDATE t_tenant SET tenant_name = CONVERT(CAST(CONVERT(tenant_name USING latin1) AS BINARY) USING utf8mb4)
WHERE HEX(tenant_name) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_tenant SET remark = CONVERT(CAST(CONVERT(remark USING latin1) AS BINARY) USING utf8mb4)
WHERE remark IS NOT NULL AND HEX(remark) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;
SELECT CONCAT('t_tenant: fixed') AS progress;

-- ========== 6. t_material_stock (面辅料库存) ==========
UPDATE t_material_stock SET material_name = CONVERT(CAST(CONVERT(material_name USING latin1) AS BINARY) USING utf8mb4)
WHERE material_name IS NOT NULL AND HEX(material_name) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_material_stock SET material_type = CONVERT(CAST(CONVERT(material_type USING latin1) AS BINARY) USING utf8mb4)
WHERE material_type IS NOT NULL AND HEX(material_type) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_material_stock SET specifications = CONVERT(CAST(CONVERT(specifications USING latin1) AS BINARY) USING utf8mb4)
WHERE specifications IS NOT NULL AND HEX(specifications) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_material_stock SET color = CONVERT(CAST(CONVERT(color USING latin1) AS BINARY) USING utf8mb4)
WHERE color IS NOT NULL AND HEX(color) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_material_stock SET unit = CONVERT(CAST(CONVERT(unit USING latin1) AS BINARY) USING utf8mb4)
WHERE unit IS NOT NULL AND HEX(unit) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_material_stock SET supplier_name = CONVERT(CAST(CONVERT(supplier_name USING latin1) AS BINARY) USING utf8mb4)
WHERE supplier_name IS NOT NULL AND HEX(supplier_name) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_material_stock SET location = CONVERT(CAST(CONVERT(location USING latin1) AS BINARY) USING utf8mb4)
WHERE location IS NOT NULL AND HEX(location) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;

UPDATE t_material_stock SET fabric_composition = CONVERT(CAST(CONVERT(fabric_composition USING latin1) AS BINARY) USING utf8mb4)
WHERE fabric_composition IS NOT NULL AND HEX(fabric_composition) REGEXP 'C3A[4-9]';
SELECT ROW_COUNT() INTO @cnt; SET @affected = @affected + @cnt;
SELECT CONCAT('t_material_stock: fixed') AS progress;

-- ========== 7. t_material_inbound (入库记录) ==========
UPDATE t_material_inbound SET material_name = CONVERT(CAST(CONVERT(material_name USING latin1) AS BINARY) USING utf8mb4)
WHERE material_name IS NOT NULL AND HEX(material_name) REGEXP 'C3A[4-9]';
UPDATE t_material_inbound SET material_type = CONVERT(CAST(CONVERT(material_type USING latin1) AS BINARY) USING utf8mb4)
WHERE material_type IS NOT NULL AND HEX(material_type) REGEXP 'C3A[4-9]';
UPDATE t_material_inbound SET supplier_name = CONVERT(CAST(CONVERT(supplier_name USING latin1) AS BINARY) USING utf8mb4)
WHERE supplier_name IS NOT NULL AND HEX(supplier_name) REGEXP 'C3A[4-9]';
UPDATE t_material_inbound SET operator_name = CONVERT(CAST(CONVERT(operator_name USING latin1) AS BINARY) USING utf8mb4)
WHERE operator_name IS NOT NULL AND HEX(operator_name) REGEXP 'C3A[4-9]';
UPDATE t_material_inbound SET remark = CONVERT(CAST(CONVERT(remark USING latin1) AS BINARY) USING utf8mb4)
WHERE remark IS NOT NULL AND HEX(remark) REGEXP 'C3A[4-9]';
UPDATE t_material_inbound SET color = CONVERT(CAST(CONVERT(color USING latin1) AS BINARY) USING utf8mb4)
WHERE color IS NOT NULL AND HEX(color) REGEXP 'C3A[4-9]';
UPDATE t_material_inbound SET warehouse_location = CONVERT(CAST(CONVERT(warehouse_location USING latin1) AS BINARY) USING utf8mb4)
WHERE warehouse_location IS NOT NULL AND HEX(warehouse_location) REGEXP 'C3A[4-9]';
SELECT 't_material_inbound: fixed' AS progress;

-- ========== 8. t_material_purchase (采购) ==========
UPDATE t_material_purchase SET material_name = CONVERT(CAST(CONVERT(material_name USING latin1) AS BINARY) USING utf8mb4)
WHERE material_name IS NOT NULL AND HEX(material_name) REGEXP 'C3A[4-9]';
UPDATE t_material_purchase SET material_type = CONVERT(CAST(CONVERT(material_type USING latin1) AS BINARY) USING utf8mb4)
WHERE material_type IS NOT NULL AND HEX(material_type) REGEXP 'C3A[4-9]';
UPDATE t_material_purchase SET specifications = CONVERT(CAST(CONVERT(specifications USING latin1) AS BINARY) USING utf8mb4)
WHERE specifications IS NOT NULL AND HEX(specifications) REGEXP 'C3A[4-9]';
UPDATE t_material_purchase SET unit = CONVERT(CAST(CONVERT(unit USING latin1) AS BINARY) USING utf8mb4)
WHERE unit IS NOT NULL AND HEX(unit) REGEXP 'C3A[4-9]';
UPDATE t_material_purchase SET supplier_name = CONVERT(CAST(CONVERT(supplier_name USING latin1) AS BINARY) USING utf8mb4)
WHERE supplier_name IS NOT NULL AND HEX(supplier_name) REGEXP 'C3A[4-9]';
UPDATE t_material_purchase SET color = CONVERT(CAST(CONVERT(color USING latin1) AS BINARY) USING utf8mb4)
WHERE color IS NOT NULL AND HEX(color) REGEXP 'C3A[4-9]';
SELECT 't_material_purchase: fixed' AS progress;

-- ========== 9. t_style_process (款式工序) ==========
UPDATE t_style_process SET progress_stage = CONVERT(CAST(CONVERT(progress_stage USING latin1) AS BINARY) USING utf8mb4)
WHERE progress_stage IS NOT NULL AND HEX(progress_stage) REGEXP 'C3A[4-9]';
UPDATE t_style_process SET process_name = CONVERT(CAST(CONVERT(process_name USING latin1) AS BINARY) USING utf8mb4)
WHERE process_name IS NOT NULL AND HEX(process_name) REGEXP 'C3A[4-9]';
UPDATE t_style_process SET description = CONVERT(CAST(CONVERT(description USING latin1) AS BINARY) USING utf8mb4)
WHERE description IS NOT NULL AND HEX(description) REGEXP 'C3A[4-9]';
SELECT 't_style_process: fixed' AS progress;

-- ========== 10. t_style_operation_log (款式操作日志) ==========
UPDATE t_style_operation_log SET operator = CONVERT(CAST(CONVERT(operator USING latin1) AS BINARY) USING utf8mb4)
WHERE operator IS NOT NULL AND HEX(operator) REGEXP 'C3A[4-9]';
SELECT 't_style_operation_log: fixed' AS progress;

-- ========== 11. t_style_size (款式尺码) ==========
UPDATE t_style_size SET part_name = CONVERT(CAST(CONVERT(part_name USING latin1) AS BINARY) USING utf8mb4)
WHERE part_name IS NOT NULL AND HEX(part_name) REGEXP 'C3A[4-9]';
SELECT 't_style_size: fixed' AS progress;

-- ========== 12. t_style_attachment ==========
UPDATE t_style_attachment SET uploader = CONVERT(CAST(CONVERT(uploader USING latin1) AS BINARY) USING utf8mb4)
WHERE uploader IS NOT NULL AND HEX(uploader) REGEXP 'C3A[4-9]';
SELECT 't_style_attachment: fixed' AS progress;

-- ========== 13. t_style_info ==========
UPDATE t_style_info SET style_name = CONVERT(CAST(CONVERT(style_name USING latin1) AS BINARY) USING utf8mb4)
WHERE style_name IS NOT NULL AND HEX(style_name) REGEXP 'C3A[4-9]';
UPDATE t_style_info SET category = CONVERT(CAST(CONVERT(category USING latin1) AS BINARY) USING utf8mb4)
WHERE category IS NOT NULL AND HEX(category) REGEXP 'C3A[4-9]';
UPDATE t_style_info SET season = CONVERT(CAST(CONVERT(season USING latin1) AS BINARY) USING utf8mb4)
WHERE season IS NOT NULL AND HEX(season) REGEXP 'C3A[4-9]';
UPDATE t_style_info SET description = CONVERT(CAST(CONVERT(description USING latin1) AS BINARY) USING utf8mb4)
WHERE description IS NOT NULL AND HEX(description) REGEXP 'C3A[4-9]';
SELECT 't_style_info: fixed' AS progress;

-- ========== 14. t_cutting_bundle (裁剪菲号) ==========
UPDATE t_cutting_bundle SET color = CONVERT(CAST(CONVERT(color USING latin1) AS BINARY) USING utf8mb4)
WHERE color IS NOT NULL AND HEX(color) REGEXP 'C3A[4-9]';
UPDATE t_cutting_bundle SET qr_code = CONVERT(CAST(CONVERT(qr_code USING latin1) AS BINARY) USING utf8mb4)
WHERE qr_code IS NOT NULL AND HEX(qr_code) REGEXP 'C3A[4-9]';
SELECT 't_cutting_bundle: fixed' AS progress;

-- ========== 15. t_scan_record (扫码记录) ==========
UPDATE t_scan_record SET process_name = CONVERT(CAST(CONVERT(process_name USING latin1) AS BINARY) USING utf8mb4)
WHERE process_name IS NOT NULL AND HEX(process_name) REGEXP 'C3A[4-9]';
UPDATE t_scan_record SET progress_stage = CONVERT(CAST(CONVERT(progress_stage USING latin1) AS BINARY) USING utf8mb4)
WHERE progress_stage IS NOT NULL AND HEX(progress_stage) REGEXP 'C3A[4-9]';
UPDATE t_scan_record SET remark = CONVERT(CAST(CONVERT(remark USING latin1) AS BINARY) USING utf8mb4)
WHERE remark IS NOT NULL AND HEX(remark) REGEXP 'C3A[4-9]';
SELECT 't_scan_record: fixed' AS progress;

-- ========== 16. t_param_config (系统参数) ==========
UPDATE t_param_config SET param_desc = CONVERT(CAST(CONVERT(param_desc USING latin1) AS BINARY) USING utf8mb4)
WHERE param_desc IS NOT NULL AND HEX(param_desc) REGEXP 'C3A[4-9]';
UPDATE t_param_config SET param_value = CONVERT(CAST(CONVERT(param_value USING latin1) AS BINARY) USING utf8mb4)
WHERE param_value IS NOT NULL AND HEX(param_value) REGEXP 'C3A[4-9]';
SELECT 't_param_config: fixed' AS progress;

-- ========== 17. t_serial_rule (编号规则) ==========
UPDATE t_serial_rule SET rule_name = CONVERT(CAST(CONVERT(rule_name USING latin1) AS BINARY) USING utf8mb4)
WHERE rule_name IS NOT NULL AND HEX(rule_name) REGEXP 'C3A[4-9]';
SELECT 't_serial_rule: fixed' AS progress;

-- ========== 18. t_production_order (生产订单) ==========
UPDATE t_production_order SET style_name = CONVERT(CAST(CONVERT(style_name USING latin1) AS BINARY) USING utf8mb4)
WHERE style_name IS NOT NULL AND HEX(style_name) REGEXP 'C3A[4-9]';
UPDATE t_production_order SET factory_name = CONVERT(CAST(CONVERT(factory_name USING latin1) AS BINARY) USING utf8mb4)
WHERE factory_name IS NOT NULL AND HEX(factory_name) REGEXP 'C3A[4-9]';
UPDATE t_production_order SET order_details = CONVERT(CAST(CONVERT(order_details USING latin1) AS BINARY) USING utf8mb4)
WHERE order_details IS NOT NULL AND HEX(order_details) REGEXP 'C3A[4-9]';
UPDATE t_production_order SET progress_workflow_json = CONVERT(CAST(CONVERT(progress_workflow_json USING latin1) AS BINARY) USING utf8mb4)
WHERE progress_workflow_json IS NOT NULL AND HEX(progress_workflow_json) REGEXP 'C3A[4-9]';
SELECT 't_production_order: fixed' AS progress;

-- ========== 19. t_template_library ==========
UPDATE t_template_library SET template_content = CONVERT(CAST(CONVERT(template_content USING latin1) AS BINARY) USING utf8mb4)
WHERE template_content IS NOT NULL AND HEX(template_content) REGEXP 'C3A[4-9]';
SELECT 't_template_library: fixed' AS progress;

-- ========== 20. t_system_operation_log ==========
UPDATE t_system_operation_log SET operator = CONVERT(CAST(CONVERT(operator USING latin1) AS BINARY) USING utf8mb4)
WHERE operator IS NOT NULL AND HEX(operator) REGEXP 'C3A[4-9]';
SELECT 't_system_operation_log: fixed' AS progress;

-- ========== 验证修复结果 ==========
SELECT '=== 验证修复 ===' AS result;
SELECT id, role_name, role_code FROM t_role WHERE is_template=1 AND role_code IN ('full_admin','production_supervisor','merchandiser','finance','worker','warehouse_mgr') ORDER BY sort_order;
SELECT id, permission_name, permission_code FROM t_permission WHERE HEX(permission_name) REGEXP 'C3A[4-9]' LIMIT 5;
SELECT CONCAT('验证: permission 残留乱码 = ', COUNT(*)) AS result FROM t_permission WHERE HEX(permission_name) REGEXP 'C3A[4-9]';
SELECT CONCAT('验证: role 残留乱码 = ', COUNT(*)) AS result FROM t_role WHERE HEX(role_name) REGEXP 'C3A[4-9]';
SELECT CONCAT('验证: dict 残留乱码 = ', COUNT(*)) AS result FROM t_dict WHERE HEX(dict_label) REGEXP 'C3A[4-9]';

SELECT '全部修复完成！' AS final_result;

-- ============================================================
-- V20260412003: 为 V20260412001 新增 tenant_id 列的表补刷历史数据
-- + 防御性清洗 t_material_pickup_record 非数字 tenant_id
--
-- 核心问题：V20260412001 为 11 张表新增了 tenant_id 列，
-- 但历史数据 tenant_id 全部为 NULL。TenantInterceptor 追加
-- WHERE tenant_id = ?，NULL 行对租户不可见，必须补刷。
--
-- 幂等安全：所有 UPDATE 都带 WHERE tenant_id IS NULL 条件，
-- 重复执行不会覆盖已补刷的数据。
-- ============================================================

-- ── Step 1: 防御性清洗 t_material_pickup_record.tenant_id ──
-- 如果该列仍为 VARCHAR 类型（V20260412001 尚未执行），
-- 先将非数字值置 NULL，避免后续 MODIFY COLUMN 失败。
SET @col_type = (SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='tenant_id');

SET @s = IF(@col_type = 'varchar',
    'UPDATE `t_material_pickup_record` SET `tenant_id` = NULL WHERE `tenant_id` IS NOT NULL AND `tenant_id` REGEXP ''[^0-9]'' = 1',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(@col_type = 'varchar',
    'UPDATE `t_material_pickup_record` SET `tenant_id` = NULL WHERE `tenant_id` = ''''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Step 2: 按 FK 关系补刷 tenant_id ──

-- 2-1. t_cutting_bundle_split_log → t_cutting_bundle (source_bundle_id)
-- fix: 两表排序规则不同（utf8mb4_unicode_ci vs utf8mb4_0900_ai_ci），显式指定 COLLATE 避免 Error 1267
UPDATE `t_cutting_bundle_split_log` t
    INNER JOIN `t_cutting_bundle` cb ON t.source_bundle_id COLLATE utf8mb4_unicode_ci = cb.id COLLATE utf8mb4_unicode_ci
    SET t.tenant_id = cb.tenant_id
    WHERE t.tenant_id IS NULL AND cb.tenant_id IS NOT NULL;

-- 2-2. t_pattern_revision → t_style_info (style_id)
UPDATE `t_pattern_revision` t
    INNER JOIN `t_style_info` si ON t.style_id = si.id
    SET t.tenant_id = si.tenant_id
    WHERE t.tenant_id IS NULL AND si.tenant_id IS NOT NULL;

-- 2-3. t_pattern_scan_record → t_style_info (style_id)
-- fix: t_pattern_scan_record 无 order_id 列，通过 style_id 关联 t_style_info 获取 tenant_id
UPDATE `t_pattern_scan_record` t
    INNER JOIN `t_style_info` si ON t.style_id = si.id
    SET t.tenant_id = si.tenant_id
    WHERE t.tenant_id IS NULL AND si.tenant_id IS NOT NULL;

-- 2-4. t_process_price_adjustment → t_production_order (order_id)
UPDATE `t_process_price_adjustment` t
    INNER JOIN `t_production_order` po ON t.order_id COLLATE utf8mb4_unicode_ci = po.id COLLATE utf8mb4_unicode_ci
    SET t.tenant_id = po.tenant_id
    WHERE t.tenant_id IS NULL AND po.tenant_id IS NOT NULL;

-- 2-5. order_transfer → t_production_order (order_id)
UPDATE `order_transfer` t
    INNER JOIN `t_production_order` po ON t.order_id COLLATE utf8mb4_unicode_ci = po.id COLLATE utf8mb4_unicode_ci
    SET t.tenant_id = po.tenant_id
    WHERE t.tenant_id IS NULL AND po.tenant_id IS NOT NULL;

-- 2-6. t_purchase_order_doc → t_production_order (order_no)
UPDATE `t_purchase_order_doc` t
    INNER JOIN `t_production_order` po ON t.order_no COLLATE utf8mb4_unicode_ci = po.order_no COLLATE utf8mb4_unicode_ci
    SET t.tenant_id = po.tenant_id
    WHERE t.tenant_id IS NULL AND po.tenant_id IS NOT NULL;

-- 2-7. t_factory_shipment_detail → t_factory_shipment (shipment_id)
UPDATE `t_factory_shipment_detail` t
    INNER JOIN `t_factory_shipment` fs ON t.shipment_id COLLATE utf8mb4_unicode_ci = fs.id COLLATE utf8mb4_unicode_ci
    SET t.tenant_id = fs.tenant_id
    WHERE t.tenant_id IS NULL AND fs.tenant_id IS NOT NULL;

-- 2-8. t_material_picking_item → t_material_picking (picking_id)
UPDATE `t_material_picking_item` t
    INNER JOIN `t_material_picking` mp ON t.picking_id COLLATE utf8mb4_unicode_ci = mp.id COLLATE utf8mb4_unicode_ci
    SET t.tenant_id = mp.tenant_id
    WHERE t.tenant_id IS NULL AND mp.tenant_id IS NOT NULL;

-- 2-9. t_product_outstock → t_production_order (order_id)
UPDATE `t_product_outstock` t
    INNER JOIN `t_production_order` po ON t.order_id COLLATE utf8mb4_unicode_ci = po.id COLLATE utf8mb4_unicode_ci
    SET t.tenant_id = po.tenant_id
    WHERE t.tenant_id IS NULL AND po.tenant_id IS NOT NULL;

-- 2-10. t_production_exception_report → t_production_order (order_no)
UPDATE `t_production_exception_report` t
    INNER JOIN `t_production_order` po ON t.order_no COLLATE utf8mb4_unicode_ci = po.order_no COLLATE utf8mb4_unicode_ci
    SET t.tenant_id = po.tenant_id
    WHERE t.tenant_id IS NULL AND po.tenant_id IS NOT NULL;

-- 2-11. t_process_parent_mapping: 无 FK 关联父表，使用默认租户
-- fix: uk_keyword_tenant(process_keyword, tenant_id) 唯一索引会导致重复 keyword
-- 批量赋同一 tenant_id 时 Error 1062。用 UPDATE IGNORE 跳过冲突行，再清理重复行。
SET @default_tenant_id = (SELECT MIN(id) FROM `t_tenant` WHERE id IS NOT NULL LIMIT 1);
UPDATE IGNORE `t_process_parent_mapping`
    SET `tenant_id` = @default_tenant_id
    WHERE `tenant_id` IS NULL AND @default_tenant_id IS NOT NULL;
-- 清理被 IGNORE 跳过的重复行（同一 keyword 只保留已赋值的那条）
DELETE FROM `t_process_parent_mapping` WHERE `tenant_id` IS NULL;

-- ── Step 3: 补刷 t_material_pickup_record 的 NULL tenant_id ──
-- fix: t_material_pickup_record 无 order_id 列，通过 order_no 关联 t_production_order 补刷
UPDATE `t_material_pickup_record` t
    INNER JOIN `t_production_order` po ON t.order_no COLLATE utf8mb4_unicode_ci = po.order_no COLLATE utf8mb4_unicode_ci
    SET t.tenant_id = po.tenant_id
    WHERE t.tenant_id IS NULL AND po.tenant_id IS NOT NULL;

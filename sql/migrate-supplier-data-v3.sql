-- ========================================
-- 供应商数据迁移（使用 CONVERT 强制字符集转换）
-- 日期: 2026-02-17
-- ========================================

-- 4. 面辅料采购表 - 关联历史供应商
UPDATE t_material_purchase mp
INNER JOIN t_factory f ON
  CONVERT(mp.supplier_name USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(f.factory_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND mp.tenant_id = f.tenant_id
SET
  mp.supplier_id = COALESCE(mp.supplier_id, f.id),
  mp.supplier_contact_person = COALESCE(mp.supplier_contact_person, f.contact_person),
  mp.supplier_contact_phone = COALESCE(mp.supplier_contact_phone, f.contact_phone)
WHERE mp.supplier_name IS NOT NULL;

-- 5. 面辅料资料库 - 关联历史供应商
UPDATE t_material_database md
INNER  JOIN t_factory f ON
  CONVERT(md.supplier_name USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(f.factory_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND md.tenant_id = f.tenant_id
SET
  md.supplier_id = COALESCE(md.supplier_id, f.id),
  md.supplier_contact_person = COALESCE(md.supplier_contact_person, f.contact_person),
  md.supplier_contact_phone = COALESCE(md.supplier_contact_phone, f.contact_phone)
WHERE md.supplier_name IS NOT NULL;

-- 6. 费用报销表 - 关联历史供应商
UPDATE t_expense_reimbursement er
INNER JOIN t_factory f ON
  CONVERT(er.supplier_name USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(f.factory_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND er.tenant_id = f.tenant_id
SET
  er.supplier_id = COALESCE(er.supplier_id, f.id),
  er.supplier_contact_person = COALESCE(er.supplier_contact_person, f.contact_person),
  er.supplier_contact_phone = COALESCE(er.supplier_contact_phone, f.contact_phone)
WHERE er.supplier_name IS NOT NULL;

-- 7. 样式BOM表 - 关联历史供应商
UPDATE t_style_bom sb
INNER JOIN t_factory f ON
  CONVERT(sb.supplier USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(f.factory_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND sb.tenant_id = f.tenant_id
SET
  sb.supplier_id = COALESCE(sb.supplier_id, f.id),
  sb.supplier_contact_person = COALESCE(sb.supplier_contact_person, f.contact_person),
  sb.supplier_contact_phone = COALESCE(sb.supplier_contact_phone, f.contact_phone)
WHERE sb.supplier IS NOT NULL;

-- 8. 二次工艺表 - 关联历史工厂
UPDATE t_secondary_process sp
INNER JOIN t_factory f ON
  CONVERT(sp.factory_name USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(f.factory_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND sp.tenant_id = f.tenant_id
SET
  sp.factory_id = COALESCE(sp.factory_id, f.id),
  sp.factory_contact_person = COALESCE(sp.factory_contact_person, f.contact_person),
  sp.factory_contact_phone = COALESCE(sp.factory_contact_phone, f.contact_phone)
WHERE sp.factory_name IS NOT NULL;

-- 9. 面料入库表 - 关联历史供应商
UPDATE t_material_inbound mi
INNER JOIN t_factory f ON
  CONVERT(mi.supplier_name USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(f.factory_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND mi.tenant_id = f.tenant_id
SET
  mi.supplier_id = COALESCE(mi.supplier_id, f.id),
  mi.supplier_contact_person = COALESCE(mi.supplier_contact_person, f.contact_person),
  mi.supplier_contact_phone = COALESCE(mi.supplier_contact_phone, f.contact_phone)
WHERE mi.supplier_name IS NOT NULL;

-- 10. 面料库存表 - 关联历史供应商
UPDATE t_material_stock ms
INNER JOIN t_factory f ON
  CONVERT(ms.supplier_name USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(f.factory_name USING utf8mb4) COLLATE utf8mb4_general_ci
  AND ms.tenant_id = f.tenant_id
SET
  ms.supplier_id = COALESCE(ms.supplier_id, f.id),
  ms.supplier_contact_person = COALESCE(ms.supplier_contact_person, f.contact_person),
  ms.supplier_contact_phone = COALESCE(ms.supplier_contact_phone, f.contact_phone)
WHERE ms.supplier_name IS NOT NULL AND ms.supplier_name != '';

-- 11. 物料对账表 - 补充联系人信息
UPDATE t_material_reconciliation mr
INNER JOIN t_factory f ON mr.supplier_id = f.id AND mr.tenant_id = f.tenant_id
SET
  mr.supplier_contact_person = COALESCE(mr.supplier_contact_person, f.contact_person),
  mr.supplier_contact_phone = COALESCE(mr.supplier_contact_phone, f.contact_phone)
WHERE mr.supplier_id IS NOT NULL;

-- 12. 生产订单表 - 补充联系人信息
UPDATE t_production_order po
INNER JOIN t_factory f ON po.factory_id = f.id AND po.tenant_id = f.tenant_id
SET
  po.factory_contact_person = COALESCE(po.factory_contact_person, f.contact_person),
  po.factory_contact_phone = COALESCE(po.factory_contact_phone, f.contact_phone)
WHERE po.factory_id IS NOT NULL;

-- 验证
SELECT '✅ 数据迁移完成' AS Status, NOW() AS CompletedAt;

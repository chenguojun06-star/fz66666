-- =====================================================================
-- D-513 会计闭环：补齐所有租户的会计科目与账单科目映射 + 登记「会计凭证」菜单权限
-- =====================================================================
-- 背景（2026-10-08 实测）
--
-- 1) 科目/映射只有 1 号租户有 —— V20260801001 的种子把 tenant_id 硬编码为 1，
--    导致**除 1 号租户外所有租户**的 t_account_subject / t_bill_subject_mapping 都是空的。
--    后果：账单确认时凭证生成必然抛「未找到科目映射: RECEIVABLE/PRODUCT」，
--    而业务侧只记 WARN 降级（提示"可在会计模块手动补录"）→ 问题长期静默。
--    实测：t_account_subject 仅 tenant 1 有 16 行；t_bill_subject_mapping 616 行全是 tenant 1。
--
-- 2) t_bill_subject_mapping 每个键重复 44 行 —— 唯一键 uk_tenant_mapping 含可空列 source_type，
--    而 MySQL 唯一索引不约束 NULL，INSERT IGNORE 因此完全失效。
--    实测同键各行的借贷科目码完全一致（0 个键存在差异），故删除重复是安全的。
--
-- 3) 「会计凭证」模块后端已完整（AccountingVoucherController + AccountingVoucherOrchestrator），
--    缺的是前端菜单与权限码。本迁移登记权限码 MENU_FINANCE_VOUCHER，
--    **默认不授予任何角色**（会计数据按最小权限处理），由管理员在
--    系统设置 → 岗位与权限 按需勾选；租户管理员/超管本身拥有全量权限，不受影响。
--
-- 幂等性：本迁移可重复执行（清理用 keep_id 判定，补齐用 NOT EXISTS 判定，权限用 INSERT IGNORE）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 清理 t_bill_subject_mapping 重复行（同键保留最小 id）
-- ---------------------------------------------------------------------
DELETE m FROM t_bill_subject_mapping m
JOIN (
    SELECT MIN(id) AS keep_id,
           tenant_id, bill_type, bill_category,
           IFNULL(source_type, '') AS st, accounting_standard
    FROM t_bill_subject_mapping
    GROUP BY tenant_id, bill_type, bill_category, IFNULL(source_type, ''), accounting_standard
    HAVING COUNT(*) > 1
) d
  ON m.tenant_id = d.tenant_id
 AND m.bill_type = d.bill_type
 AND m.bill_category = d.bill_category
 AND IFNULL(m.source_type, '') = d.st
 AND m.accounting_standard = d.accounting_standard
 AND m.id <> d.keep_id;

-- ---------------------------------------------------------------------
-- 2. 为缺少会计科目的租户补齐标准 CAS 科目（模板取 1 号租户的 16 个科目）
-- ---------------------------------------------------------------------
INSERT INTO t_account_subject
    (tenant_id, subject_code, subject_name, subject_type, balance_direction,
     parent_code, is_leaf, enabled, delete_flag)
SELECT t.id, s.subject_code, s.subject_name, s.subject_type, s.balance_direction,
       s.parent_code, s.is_leaf, 1, 0
FROM t_tenant t
JOIN t_account_subject s ON s.tenant_id = 1 AND s.delete_flag = 0
LEFT JOIN t_account_subject x ON x.tenant_id = t.id AND x.subject_code = s.subject_code
WHERE t.status = 'active'
  AND x.id IS NULL;

-- ---------------------------------------------------------------------
-- 3. 为缺少科目映射的租户补齐账单分类 → 科目映射（模板取 1 号租户的 14 条）
--    这 14 条覆盖 PAYABLE/RECEIVABLE × MATERIAL/PRODUCT/SHIPMENT/PAYROLL/
--    EXTERNAL_FACTORY/EXPENSE/DEDUCTION/INVENTORY_PROFIT/INVENTORY_LOSS
-- ---------------------------------------------------------------------
INSERT INTO t_bill_subject_mapping
    (tenant_id, bill_type, bill_category, source_type, debit_subject_code, credit_subject_code,
     accounting_standard, enabled, delete_flag)
SELECT t.id, m.bill_type, m.bill_category, m.source_type, m.debit_subject_code, m.credit_subject_code,
       m.accounting_standard, 1, 0
FROM t_tenant t
JOIN t_bill_subject_mapping m ON m.tenant_id = 1 AND m.delete_flag = 0
LEFT JOIN t_bill_subject_mapping x
       ON x.tenant_id = t.id
      AND x.bill_type = m.bill_type
      AND x.bill_category = m.bill_category
      AND IFNULL(x.source_type, '') = IFNULL(m.source_type, '')
      AND x.accounting_standard = m.accounting_standard
WHERE t.status = 'active'
  AND x.id IS NULL;

-- ---------------------------------------------------------------------
-- 4. 登记「会计凭证」菜单权限码（挂在「财务管理」下）
--    用变量承接父级 id，避免 INSERT 时对同表做子查询（MySQL 1093）
-- ---------------------------------------------------------------------
SET @finance_parent_id = (SELECT id FROM t_permission WHERE permission_code = 'MENU_FINANCE' LIMIT 1);

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name,
     path, component, icon, sort, status)
VALUES
    ('会计凭证', 'MENU_FINANCE_VOUCHER', 'MENU', @finance_parent_id, '财务管理',
     '/finance/accounting-voucher', NULL, NULL, 99, 'ENABLED');

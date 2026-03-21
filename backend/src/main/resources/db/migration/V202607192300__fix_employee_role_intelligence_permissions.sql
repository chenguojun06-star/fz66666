-- ================================================================
-- V202607192300: 修复租户员工权限越界问题
-- 问题：生产/工人角色错误持有财税/单价维护/智能中心访问权限
-- 变更：
--   1. 新增独立权限码 MENU_INTELLIGENCE_CENTER（智能运营中心）
--      原来与 MENU_DASHBOARD 共用权限码 → 所有有仪表盘的员工都能进智能中心
--   2. 将 MENU_INTELLIGENCE_CENTER 仅授予 full_admin 角色
--   3. 从所有 worker 角色移除 MENU_FINANCE_EXPORT（EC/财税导出不属于工人职责）
--   4. 从所有 production_supervisor 角色移除 MENU_FINANCE_EXPORT 和 MENU_TEMPLATE_CENTER
--      （EC/税收/单价维护不属于生产主管职责）
-- 幂等性：使用 INSERT IGNORE / NOT EXISTS / 多表 DELETE，重复执行安全
-- ================================================================

-- Step 1: 新增 MENU_INTELLIGENCE_CENTER 权限码（幂等，UNI 约束保障）
INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, sort, status)
VALUES ('智能运营中心', 'MENU_INTELLIGENCE_CENTER', 'MENU', 0, 92, 'ENABLED');

-- Step 2: 将 MENU_INTELLIGENCE_CENTER 授予所有 full_admin 角色（模板+所有租户实例）
INSERT INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
     CROSS JOIN t_permission p
WHERE r.role_code = 'full_admin'
  AND p.permission_code = 'MENU_INTELLIGENCE_CENTER'
  AND NOT EXISTS (
      SELECT 1 FROM t_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Step 3: 从所有 worker 角色移除 MENU_FINANCE_EXPORT
--         （EC 销售收入 / 财税导出 不属于工人职责）
DELETE rp FROM t_role_permission rp
    JOIN t_role r ON r.id = rp.role_id
    JOIN t_permission p ON p.id = rp.permission_id
WHERE r.role_code = 'worker'
  AND p.permission_code = 'MENU_FINANCE_EXPORT';

-- Step 4: 从所有 production_supervisor 角色移除 MENU_FINANCE_EXPORT 和 MENU_TEMPLATE_CENTER
--         （EC/税收/单价维护 不属于生产主管职责）
DELETE rp FROM t_role_permission rp
    JOIN t_role r ON r.id = rp.role_id
    JOIN t_permission p ON p.id = rp.permission_id
WHERE r.role_code = 'production_supervisor'
  AND p.permission_code IN ('MENU_FINANCE_EXPORT', 'MENU_TEMPLATE_CENTER');

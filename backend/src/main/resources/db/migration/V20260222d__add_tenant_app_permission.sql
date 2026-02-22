-- ============================================================
-- 新增 MENU_TENANT_APP 权限码（API对接管理菜单）
-- 该菜单归属系统设置分组，租户主账号和有权限的角色可见
-- 日期：2026-02-22
-- ============================================================

-- 新增 API对接管理 菜单权限（parent_id=5 即系统设置分组）
INSERT INTO t_permission (permission_name, permission_code, permission_type, parent_id, status)
SELECT 'API对接管理', 'MENU_TENANT_APP', 'menu', 5, 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_TENANT_APP');

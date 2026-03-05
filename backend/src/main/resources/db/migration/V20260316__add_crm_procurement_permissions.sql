-- 新增三个付费模块的菜单权限
-- CRM客户管理、供应商采购、财税导出
-- 这些是可独立售卖的功能模块，需要在 t_permission 中注册才能分配给角色

-- 1. 插入顶级菜单权限
INSERT INTO t_permission (permission_name, permission_code, permission_type, parent_id, status)
SELECT 'CRM客户管理', 'MENU_CRM', 'MENU', 0, 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_CRM');

INSERT INTO t_permission (permission_name, permission_code, permission_type, parent_id, status)
SELECT '供应商采购', 'MENU_PROCUREMENT', 'MENU', 0, 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT');

INSERT INTO t_permission (permission_name, permission_code, permission_type, parent_id, status)
SELECT '财税导出', 'MENU_FINANCE_EXPORT', 'MENU', 0, 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_FINANCE_EXPORT');

-- 2. 将新权限分配给所有系统角色模板（is_system=1 的角色，即租户主账号模板角色）
-- 这样新租户开通时自动拥有这些菜单权限（显示模块预览/购买入口）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE p.permission_code IN ('MENU_CRM', 'MENU_PROCUREMENT', 'MENU_FINANCE_EXPORT')
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

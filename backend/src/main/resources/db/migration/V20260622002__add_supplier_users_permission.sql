-- 供应商账号管理权限
-- 日期：2026-06-22
-- 说明：新增供应商账号管理独立页面的权限码

-- 1. 添加供应商账号菜单权限（挂在系统设置下）
INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '供应商账号', 'MENU_SUPPLIER_USERS', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_SYSTEM'), 0),
       '系统设置', '/system/supplier-users', 45, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_SUPPLIER_USERS');

-- 2. 更新admin角色的权限列表，加入供应商账号权限
-- 注意：admin角色的permissions_json在t_role_template表中，需要在创建角色时手动添加或更新模板

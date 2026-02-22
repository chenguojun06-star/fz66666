-- 添加数据导入菜单权限
INSERT INTO t_permission (permission_code, permission_name, permission_type, description, create_time, update_time)
SELECT 'MENU_DATA_IMPORT', '数据导入', 'MENU', 'Excel批量导入基础数据（款式、供应商、员工、工序）', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM t_permission WHERE permission_code = 'MENU_DATA_IMPORT'
);

-- 为所有租户主账号角色分配数据导入权限（租户主账号=租户内最高权限）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN (SELECT id FROM t_permission WHERE permission_code = 'MENU_DATA_IMPORT') p
WHERE r.role_name = 'tenant_owner';

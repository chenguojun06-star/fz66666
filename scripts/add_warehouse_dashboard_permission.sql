-- 添加仓库数据看板权限
INSERT INTO t_permission (id, code, name, type, parent_id, path, icon, sort, status, create_time, update_time, delete_flag)
VALUES
(UUID(), 'MENU_WAREHOUSE_DASHBOARD', '仓库数据看板', 'MENU', (SELECT id FROM t_permission WHERE code = 'MENU_WAREHOUSE'), '/warehouse/dashboard', 'DashboardOutlined', 1, 1, NOW(), NOW(), 0);

-- 为超级管理员角色授权
INSERT INTO t_role_permission (id, role_id, permission_id, create_time, update_time, delete_flag)
SELECT UUID(), r.id, p.id, NOW(), NOW(), 0
FROM t_role r, t_permission p
WHERE r.role_code = 'SUPER_ADMIN' AND p.code = 'MENU_WAREHOUSE_DASHBOARD'
AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id AND rp.delete_flag = 0
);

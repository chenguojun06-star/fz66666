-- =============================================
-- 仓库管理模块权限配置
-- 创建时间: 2026-01-28
-- =============================================

-- 1. 添加仓库管理菜单权限
INSERT INTO t_role_permission (role_id, permission_code, permission_name, permission_type, create_time)
SELECT id, 'MENU_WAREHOUSE_DASHBOARD', '仓库数据看板', 'MENU', NOW()
FROM t_role WHERE role_code = 'ADMIN'
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT INTO t_role_permission (role_id, permission_code, permission_name, permission_type, create_time)
SELECT id, 'MENU_MATERIAL_INVENTORY', '面辅料进销存', 'MENU', NOW()
FROM t_role WHERE role_code = 'ADMIN'
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT INTO t_role_permission (role_id, permission_code, permission_name, permission_type, create_time)
SELECT id, 'MENU_FINISHED_INVENTORY', '成品进销存', 'MENU', NOW()
FROM t_role WHERE role_code = 'ADMIN'
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT INTO t_role_permission (role_id, permission_code, permission_name, permission_type, create_time)
SELECT id, 'MENU_SAMPLE_INVENTORY', '样衣出入库', 'MENU', NOW()
FROM t_role WHERE role_code = 'ADMIN'
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

-- 2. 为工厂管理员角色添加仓库查询权限（只读）
INSERT INTO t_role_permission (role_id, permission_code, permission_name, permission_type, create_time)
SELECT id, 'MENU_WAREHOUSE_DASHBOARD', '仓库数据看板', 'MENU', NOW()
FROM t_role WHERE role_code = 'FACTORY_MANAGER'
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT INTO t_role_permission (role_id, permission_code, permission_name, permission_type, create_time)
SELECT id, 'MENU_SAMPLE_INVENTORY', '样衣出入库', 'MENU', NOW()
FROM t_role WHERE role_code = 'FACTORY_MANAGER'
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

-- 验证权限配置
SELECT
    r.role_name AS '角色名称',
    rp.permission_name AS '权限名称',
    rp.permission_code AS '权限代码',
    rp.permission_type AS '权限类型'
FROM t_role r
JOIN t_role_permission rp ON r.id = rp.role_id
WHERE rp.permission_code LIKE 'MENU_WAREHOUSE%'
   OR rp.permission_code LIKE '%_INVENTORY'
ORDER BY r.role_name, rp.permission_code;

-- 查看总数
SELECT
    COUNT(*) AS '仓库权限总数'
FROM t_role_permission
WHERE permission_code LIKE 'MENU_WAREHOUSE%'
   OR permission_code LIKE '%_INVENTORY';

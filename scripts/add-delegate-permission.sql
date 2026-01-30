-- 添加工序委派权限
-- 2026-01-31

-- 插入权限代码（如果不存在）
INSERT IGNORE INTO t_role_permission (role_id, permission_code)
SELECT 1, 'PRODUCTION_ORDER_DELEGATE'
WHERE NOT EXISTS (
    SELECT 1 FROM t_role_permission
    WHERE role_id = 1 AND permission_code = 'PRODUCTION_ORDER_DELEGATE'
);

-- 为超级管理员角色添加权限
INSERT IGNORE INTO t_role_permission (role_id, permission_code)
SELECT 2, 'PRODUCTION_ORDER_DELEGATE'
WHERE NOT EXISTS (
    SELECT 1 FROM t_role_permission
    WHERE role_id = 2 AND permission_code = 'PRODUCTION_ORDER_DELEGATE'
);

-- 为生产管理角色添加权限
INSERT IGNORE INTO t_role_permission (role_id, permission_code)
SELECT 3, 'PRODUCTION_ORDER_DELEGATE'
WHERE NOT EXISTS (
    SELECT 1 FROM t_role_permission
    WHERE role_id = 3 AND permission_code = 'PRODUCTION_ORDER_DELEGATE'
);

-- 添加系统教学菜单权限
-- 执行日期: 2026-01-28

-- 1. 在字典表中添加系统教学权限（如果使用权限字典管理）
INSERT INTO t_dict (dict_type, dict_label, dict_value, sort_order, status, remark, created_at, updated_at)
VALUES
('permission_code', '系统教学', 'MENU_TUTORIAL', 1500, 1, '系统教学中心菜单权限', NOW(), NOW())
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- 2. 为管理员角色添加系统教学权限（假设管理员角色ID=1）
-- 注意：根据实际数据库结构调整表名和字段名

-- 如果使用 t_role_permission 表存储角色权限
INSERT INTO t_role_permission (role_id, permission_code, created_at)
SELECT
    r.id as role_id,
    'MENU_TUTORIAL' as permission_code,
    NOW() as created_at
FROM t_role r
WHERE r.role_name = '管理员' OR r.role_code = 'ADMIN'
ON DUPLICATE KEY UPDATE updated_at = NOW();

-- 如果使用 t_role 表的 permission_codes 字段（JSON格式）
-- 需要在应用层或手动更新 JSON 数组，添加 "MENU_TUTORIAL"

-- 3. 验证权限是否添加成功
SELECT
    r.role_name,
    rp.permission_code,
    rp.created_at
FROM t_role r
LEFT JOIN t_role_permission rp ON r.id = rp.role_id
WHERE rp.permission_code = 'MENU_TUTORIAL';

-- 执行说明：
-- 1. 本脚本为系统教学功能添加菜单权限
-- 2. 默认为管理员角色开放权限
-- 3. 其他角色可在【角色管理】页面手动配置权限
-- 4. 执行前请根据实际数据库结构调整表名和字段名

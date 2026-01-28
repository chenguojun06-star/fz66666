-- 添加二次工艺管理权限
-- 执行日期: 2026-01-28

-- 1. 添加二次工艺菜单权限
INSERT INTO `t_role_permission` (`role_id`, `permission_code`, `permission_name`, `created_at`)
SELECT `id`, 'MENU_SECONDARY_PROCESS', '二次工艺管理', NOW()
FROM `t_role`
WHERE `role_name` IN ('管理员', '主管', '厂长')
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

-- 2. 添加二次工艺操作权限（如需要）
INSERT INTO `t_role_permission` (`role_id`, `permission_code`, `permission_name`, `created_at`)
SELECT `id`, 'SECONDARY_PROCESS_CREATE', '创建二次工艺', NOW()
FROM `t_role`
WHERE `role_name` IN ('管理员', '主管', '厂长')
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

INSERT INTO `t_role_permission` (`role_id`, `permission_code`, `permission_name`, `created_at`)
SELECT `id`, 'SECONDARY_PROCESS_EDIT', '编辑二次工艺', NOW()
FROM `t_role`
WHERE `role_name` IN ('管理员', '主管', '厂长')
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

INSERT INTO `t_role_permission` (`role_id`, `permission_code`, `permission_name`, `created_at`)
SELECT `id`, 'SECONDARY_PROCESS_DELETE', '删除二次工艺', NOW()
FROM `t_role`
WHERE `role_name` IN ('管理员', '主管')
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

INSERT INTO `t_role_permission` (`role_id`, `permission_code`, `permission_name`, `created_at`)
SELECT `id`, 'SECONDARY_PROCESS_VIEW', '查看二次工艺', NOW()
FROM `t_role`
WHERE `role_name` IN ('管理员', '主管', '厂长', '操作员')
ON DUPLICATE KEY UPDATE `updated_at` = NOW();

-- 验证权限是否添加成功
SELECT
    r.role_name AS '角色名称',
    rp.permission_code AS '权限代码',
    rp.permission_name AS '权限名称',
    rp.created_at AS '创建时间'
FROM t_role r
JOIN t_role_permission rp ON r.id = rp.role_id
WHERE rp.permission_code LIKE 'SECONDARY_PROCESS%' OR rp.permission_code = 'MENU_SECONDARY_PROCESS'
ORDER BY r.role_name, rp.permission_code;

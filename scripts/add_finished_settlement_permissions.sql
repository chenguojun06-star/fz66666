-- 添加成品结算财务汇总权限
-- 2026-01-25

-- 1. 先查找财务管理菜单的parent_id
SET @finance_parent_id = (SELECT id FROM `t_permission` WHERE `permission_code` = 'MENU_FINANCE' LIMIT 1);

-- 2. 添加财务汇总菜单
INSERT INTO `t_permission` (`permission_code`, `permission_name`, `permission_type`, `parent_id`, `parent_name`, `sort`, `status`, `create_time`, `update_time`)
VALUES
('MENU_FINISHED_SETTLEMENT', '财务汇总', 'MENU', @finance_parent_id, '财务管理', 5, 'ENABLED', NOW(), NOW());

-- 3. 获取刚插入的菜单ID
SET @settlement_menu_id = LAST_INSERT_ID();

-- 4. 添加查看权限和审批权限
INSERT INTO `t_permission` (`permission_code`, `permission_name`, `permission_type`, `parent_id`, `parent_name`, `sort`, `status`, `create_time`, `update_time`)
VALUES
('FINANCE_SETTLEMENT_VIEW', '查看财务汇总', 'BUTTON', @settlement_menu_id, '财务汇总', 1, 'ENABLED', NOW(), NOW()),
('FINANCE_SETTLEMENT_APPROVE', '审批财务汇总', 'BUTTON', @settlement_menu_id, '财务汇总', 2, 'ENABLED', NOW(), NOW());

-- 5. 获取权限ID
SET @settlement_view_id = (SELECT id FROM `t_permission` WHERE `permission_code` = 'FINANCE_SETTLEMENT_VIEW' LIMIT 1);
SET @settlement_approve_id = (SELECT id FROM `t_permission` WHERE `permission_code` = 'FINANCE_SETTLEMENT_APPROVE' LIMIT 1);

-- 6. 为系统管理员角色添加权限 (role_id = 1)
INSERT INTO `t_role_permission` (`role_id`, `permission_id`)
SELECT 1, @settlement_menu_id
WHERE NOT EXISTS (
    SELECT 1 FROM `t_role_permission` WHERE `role_id` = 1 AND `permission_id` = @settlement_menu_id
);

INSERT INTO `t_role_permission` (`role_id`, `permission_id`)
SELECT 1, @settlement_view_id
WHERE NOT EXISTS (
    SELECT 1 FROM `t_role_permission` WHERE `role_id` = 1 AND `permission_id` = @settlement_view_id
);

INSERT INTO `t_role_permission` (`role_id`, `permission_id`)
SELECT 1, @settlement_approve_id
WHERE NOT EXISTS (
    SELECT 1 FROM `t_role_permission` WHERE `role_id` = 1 AND `permission_id` = @settlement_approve_id
);

-- 7. 查看结果
SELECT * FROM `t_permission` WHERE `permission_code` LIKE '%SETTLEMENT%';

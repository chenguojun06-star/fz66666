INSERT INTO t_role (role_name, role_code, description, status, data_scope, tenant_id, is_template, sort_order)
VALUES ('外发工厂', 'factory_owner', '外发工厂主账号：查看订单+生产进度+扫码+入库，禁止查看金额/对账/结算/审批/人员管理', 'active', 'own', NULL, 1, 7);

SET @factory_role_id = (SELECT id FROM t_role WHERE role_code = 'factory_owner' AND tenant_id IS NULL AND is_template = 1 LIMIT 1);

INSERT INTO t_role_permission (role_id, permission_id) VALUES
(@factory_role_id, 1),
(@factory_role_id, 2),
(@factory_role_id, 6),
(@factory_role_id, 7),
(@factory_role_id, 3),
(@factory_role_id, 10),
(@factory_role_id, 13),
(@factory_role_id, 14),
(@factory_role_id, 47),
(@factory_role_id, 48),
(@factory_role_id, 50),
(@factory_role_id, 51),
(@factory_role_id, 8456);

INSERT INTO t_role (role_name, role_code, description, status, data_scope, tenant_id, is_template, sort_order)
SELECT '外发工厂', 'factory_owner', '外发工厂主账号：查看订单+生产进度+扫码+入库，禁止查看金额/对账/结算/审批/人员管理', 'active', 'own', t.id, 0, 7
FROM t_tenant t
WHERE t.status = 'ACTIVE'
AND NOT EXISTS (SELECT 1 FROM t_role r WHERE r.tenant_id = t.id AND r.role_code = 'factory_owner');

INSERT INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'factory_owner'
AND r.tenant_id IS NOT NULL
AND p.permission_code IN (
    'MENU_DASHBOARD', 'MENU_BASIC', 'MENU_STYLE_INFO', 'MENU_ORDER_MANAGEMENT',
    'MENU_PRODUCTION', 'MENU_PRODUCTION_LIST', 'MENU_PROGRESS', 'MENU_WAREHOUSING',
    'PROGRESS_SCAN', 'PROGRESS_EDIT',
    'WAREHOUSING_CREATE', 'WAREHOUSING_EDIT',
    'FINANCE_BASIC_DATA_ONLY'
);

UPDATE t_user u
JOIN t_factory f ON u.factory_id = f.id
JOIN t_role r ON r.tenant_id = u.tenant_id AND r.role_code = 'factory_owner'
SET u.role_id = r.id, u.role_name = r.role_name, u.permission_range = 'own'
WHERE u.role_id IS NULL
AND u.is_factory_owner = 1
AND f.factory_type = 'EXTERNAL'
AND u.tenant_id IS NOT NULL;

-- 添加物流管理和电商管理权限
INSERT INTO t_permission (permission_code, permission_name, type, description, create_time, update_time) VALUES
-- 物流管理权限
('MENU_LOGISTICS', '物流管理菜单', 'MENU', '物流管理模块菜单权限', NOW(), NOW()),
('LOGISTICS_EXPRESS_VIEW', '查看快递单', 'BUTTON', '查看快递单列表和详情', NOW(), NOW()),
('LOGISTICS_EXPRESS_CREATE', '创建快递单', 'BUTTON', '创建新的快递单', NOW(), NOW()),
('LOGISTICS_EXPRESS_UPDATE', '更新快递单', 'BUTTON', '修改快递单信息', NOW(), NOW()),
('LOGISTICS_EXPRESS_DELETE', '删除快递单', 'BUTTON', '删除快递单', NOW(), NOW()),

-- 电商管理权限
('MENU_ECOMMERCE', '电商管理菜单', 'MENU', '电商管理模块菜单权限', NOW(), NOW()),
('ECOMMERCE_ORDER_VIEW', '查看电商订单', 'BUTTON', '查看电商订单列表和详情', NOW(), NOW()),
('ECOMMERCE_ORDER_CREATE', '创建电商订单', 'BUTTON', '创建新的电商订单', NOW(), NOW()),
('ECOMMERCE_ORDER_UPDATE', '更新电商订单', 'BUTTON', '修改电商订单信息', NOW(), NOW()),
('ECOMMERCE_ORDER_DELETE', '删除电商订单', 'BUTTON', '删除电商订单', NOW(), NOW());

-- 给管理员角色添加权限（假设角色ID为1是管理员）
INSERT INTO t_role_permission (role_id, permission_id, create_time)
SELECT 1, id, NOW() FROM t_permission 
WHERE permission_code IN (
    'MENU_LOGISTICS', 'LOGISTICS_EXPRESS_VIEW', 'LOGISTICS_EXPRESS_CREATE', 
    'LOGISTICS_EXPRESS_UPDATE', 'LOGISTICS_EXPRESS_DELETE',
    'MENU_ECOMMERCE', 'ECOMMERCE_ORDER_VIEW', 'ECOMMERCE_ORDER_CREATE',
    'ECOMMERCE_ORDER_UPDATE', 'ECOMMERCE_ORDER_DELETE'
)
AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp 
    WHERE rp.role_id = 1 AND rp.permission_id = t_permission.id
);

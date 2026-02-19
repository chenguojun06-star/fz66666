-- ============================================
-- 初始化菜单权限数据
-- 适用于：服装供应链管理系统
-- 日期：2026-01-21
-- ============================================

-- 1. 插入所有菜单权限
INSERT INTO t_permission (permission_name, permission_code, permission_type, parent_id, status) VALUES
-- 仪表盘
('仪表盘', 'MENU_DASHBOARD', 'MENU', NULL, 'ENABLED'),
-- 基础资料
('款号资料', 'MENU_STYLE_INFO', 'MENU', NULL, 'ENABLED'),
('下单管理', 'MENU_ORDER_MANAGEMENT', 'MENU', NULL, 'ENABLED'),
('资料中心', 'MENU_DATA_CENTER', 'MENU', NULL, 'ENABLED'),
('单价流程', 'MENU_TEMPLATE_CENTER', 'MENU', NULL, 'ENABLED'),
-- 生产管理
('我的订单', 'MENU_PRODUCTION_LIST', 'MENU', NULL, 'ENABLED'),
('物料采购', 'MENU_MATERIAL_PURCHASE', 'MENU', NULL, 'ENABLED'),
('裁剪管理', 'MENU_CUTTING', 'MENU', NULL, 'ENABLED'),
('生产进度', 'MENU_PROGRESS', 'MENU', NULL, 'ENABLED'),
('质检入库', 'MENU_WAREHOUSING', 'MENU', NULL, 'ENABLED'),
('订单转移', 'MENU_ORDER_TRANSFER', 'MENU', NULL, 'ENABLED'),
-- 财务管理
('物料对账', 'MENU_MATERIAL_RECON', 'MENU', NULL, 'ENABLED'),
('成品结算', 'MENU_SHIPMENT_RECON', 'MENU', NULL, 'ENABLED'),
('审批付款', 'MENU_PAYMENT_APPROVAL', 'MENU', NULL, 'ENABLED'),
-- 系统设置
('人员管理', 'MENU_USER', 'MENU', NULL, 'ENABLED'),
('角色管理', 'MENU_ROLE', 'MENU', NULL, 'ENABLED'),
('加工厂管理', 'MENU_FACTORY', 'MENU', NULL, 'ENABLED'),
('登录日志', 'MENU_LOGIN_LOG', 'MENU', NULL, 'ENABLED')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name), status = 'ENABLED';

-- 2. 为"普通用户"角色（role_id=2）分配基本菜单权限
-- 先删除已有的角色权限，避免重复
DELETE FROM t_role_permission WHERE role_id = 2;

-- 为普通用户分配生产相关的菜单权限
INSERT INTO t_role_permission (role_id, permission_id)
SELECT 2, id FROM t_permission WHERE permission_code IN (
    'MENU_DASHBOARD',        -- 仪表盘
    'MENU_STYLE_INFO',       -- 款号资料
    'MENU_ORDER_MANAGEMENT', -- 下单管理
    'MENU_DATA_CENTER',      -- 资料中心
    'MENU_PRODUCTION_LIST',  -- 我的订单
    'MENU_MATERIAL_PURCHASE',-- 物料采购
    'MENU_CUTTING',          -- 裁剪管理
    'MENU_PROGRESS',         -- 生产进度
    'MENU_WAREHOUSING'       -- 质检入库
);

-- 3. 为"管理员"角色（role_id=1）分配所有菜单权限
DELETE FROM t_role_permission WHERE role_id = 1;

INSERT INTO t_role_permission (role_id, permission_id)
SELECT 1, id FROM t_permission WHERE permission_type = 'MENU';

-- 4. 确保用户199711有正确的角色
-- 如果用户角色ID为空，设置为普通用户(2)
UPDATE t_user SET role_id = 2, role_name = '普通用户' 
WHERE username = '199711' AND (role_id IS NULL OR role_id = 0);

-- 提交
COMMIT;

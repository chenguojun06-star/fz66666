-- 收银台菜单权限（POS 开单）
--
-- 用户诉求：「有的客户需要这种收银台类似的客户端」。
-- 权限口径：与「员工借支」那次一样——顶层菜单 + 按角色授权，
-- 只给 full_admin 默认开，其它角色由管理员在「角色权限」里勾选。
-- （收银台动的是库存与应收，绝不能像 C 端店铺页那样免登录或默认全员可见。）

SET @menu_exists = (SELECT COUNT(*) FROM t_permission WHERE permission_code = 'MENU_POS');

INSERT INTO t_permission (permission_code, permission_name, permission_type, parent_id, parent_name, path, sort, status)
SELECT 'MENU_POS', '收银台', 'MENU', NULL, NULL, '/pos',
  COALESCE((SELECT MAX(sort) + 1 FROM t_permission WHERE parent_id IS NULL), 99), 'ENABLED'
FROM DUAL WHERE @menu_exists = 0;

SET @menu_id = (SELECT id FROM t_permission WHERE permission_code = 'MENU_POS' LIMIT 1);

INSERT INTO t_permission (permission_code, permission_name, permission_type, parent_id, parent_name, sort, status)
SELECT 'POS_CHECKOUT', '开单收款', 'button', @menu_id, '收银台', 1, 'ENABLED'
FROM DUAL WHERE @menu_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'POS_CHECKOUT');

INSERT INTO t_permission (permission_code, permission_name, permission_type, parent_id, parent_name, sort, status)
SELECT 'POS_CREDIT', '挂账', 'button', @menu_id, '收银台', 2, 'ENABLED'
FROM DUAL WHERE @menu_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'POS_CREDIT');

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'full_admin'
  AND p.permission_code IN ('MENU_POS', 'POS_CHECKOUT', 'POS_CREDIT')
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- 已有「收银台」菜单的角色，自动补上两个按钮权限（避免菜单可见但按钮点不动）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT rp_menu.role_id, p_btn.id
FROM t_role_permission rp_menu
JOIN t_permission p_menu ON p_menu.id = rp_menu.permission_id
JOIN t_permission p_btn ON p_btn.parent_id = p_menu.id AND p_btn.permission_type = 'button'
WHERE p_menu.permission_code = 'MENU_POS'
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp2
    WHERE rp2.role_id = rp_menu.role_id AND rp2.permission_id = p_btn.id
  );

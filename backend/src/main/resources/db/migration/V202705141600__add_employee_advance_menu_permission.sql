INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
SELECT 'MENU_EMPLOYEE_ADVANCE', '员工借支', 'menu',
  (SELECT id FROM t_permission WHERE permission_code = 'MENU_FINISHED_SETTLEMENT' LIMIT 1),
  (SELECT COALESCE(MAX(sort) + 1, 1) FROM t_permission WHERE parent_id = (SELECT id FROM t_permission WHERE permission_code = 'MENU_FINISHED_SETTLEMENT' LIMIT 1));

INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('EMPLOYEE_ADVANCE_CREATE', '新增', 'button',
    (SELECT id FROM t_permission WHERE permission_code = 'MENU_EMPLOYEE_ADVANCE' LIMIT 1), 1),
  ('EMPLOYEE_ADVANCE_APPROVE', '审批', 'button',
    (SELECT id FROM t_permission WHERE permission_code = 'MENU_EMPLOYEE_ADVANCE' LIMIT 1), 2),
  ('EMPLOYEE_ADVANCE_REPAY', '还款', 'button',
    (SELECT id FROM t_permission WHERE permission_code = 'MENU_EMPLOYEE_ADVANCE' LIMIT 1), 3);

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'full_admin'
  AND p.permission_code IN ('MENU_EMPLOYEE_ADVANCE', 'EMPLOYEE_ADVANCE_CREATE', 'EMPLOYEE_ADVANCE_APPROVE', 'EMPLOYEE_ADVANCE_REPAY')
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT rp_menu.role_id, p_btn.id
FROM t_role_permission rp_menu
JOIN t_permission p_menu ON p_menu.id = rp_menu.permission_id
JOIN t_permission p_btn ON p_btn.parent_id = p_menu.id AND p_btn.permission_type = 'button'
WHERE p_menu.permission_code = 'MENU_EMPLOYEE_ADVANCE'
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp2
    WHERE rp2.role_id = rp_menu.role_id AND rp2.permission_id = p_btn.id
  );

-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V20260223c__add_payment_approval_permissions`;
DELIMITER $$
CREATE PROCEDURE `__mig_V20260223c__add_payment_approval_permissions`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    -- 添加付款审批管理和查看权限
    -- WagePaymentController 方法级 @PreAuthorize 引用了这两个权限码
    -- 如果不存在则插入，避免重复

    INSERT IGNORE INTO t_permission (name, code, type, parent_id, status, created_at, updated_at)
    SELECT '付款审批管理', 'MENU_FINANCE_PAYROLL_APPROVAL_MANAGE', 'menu',
           (SELECT id FROM (SELECT id FROM t_permission WHERE code = 'MENU_FINANCE') tmp), 'active', NOW(), NOW()
    FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE code = 'MENU_FINANCE_PAYROLL_APPROVAL_MANAGE');

    INSERT IGNORE INTO t_permission (name, code, type, parent_id, status, created_at, updated_at)
    SELECT '待付款查看', 'MENU_FINANCE_PAYROLL_APPROVAL_VIEW', 'menu',
           (SELECT id FROM (SELECT id FROM t_permission WHERE code = 'MENU_FINANCE') tmp), 'active', NOW(), NOW()
    FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE code = 'MENU_FINANCE_PAYROLL_APPROVAL_VIEW');

    -- 为所有角色模板分配新权限（确保租户主账号可用）
    INSERT IGNORE INTO t_role_permission (role_id, permission_id)
    SELECT r.id, p.id
    FROM t_role r
    CROSS JOIN t_permission p
    WHERE p.code IN ('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE', 'MENU_FINANCE_PAYROLL_APPROVAL_VIEW')
      AND r.is_system = 1
      AND NOT EXISTS (
        SELECT 1 FROM t_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
      );

END$$
DELIMITER ;
CALL `__mig_V20260223c__add_payment_approval_permissions`();
DROP PROCEDURE IF EXISTS `__mig_V20260223c__add_payment_approval_permissions`;

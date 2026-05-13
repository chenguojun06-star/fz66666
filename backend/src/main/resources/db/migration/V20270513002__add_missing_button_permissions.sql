-- 补全所有子菜单缺失的按钮权限节点
-- 只 INSERT 不 UPDATE 不 DELETE，不影响现有数据
-- 所有新按钮权限自动分配给现有角色

-- ============================================================
-- 1. 资料单价 (MENU_DATA_CENTER, id=8)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('DATA_CENTER_EDIT', '编辑', 'button', 8, 1),
  ('DATA_CENTER_EXPORT', '导出', 'button', 8, 2);

-- ============================================================
-- 2. 订单管理/生产列表 (MENU_PRODUCTION_LIST, id=10)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('PRODUCTION_LIST_EDIT', '编辑', 'button', 10, 1),
  ('PRODUCTION_LIST_CLOSE', '关单', 'button', 10, 2),
  ('PRODUCTION_LIST_SCRAP', '报废', 'button', 10, 3),
  ('PRODUCTION_LIST_TRANSFER', '转单', 'button', 10, 4),
  ('PRODUCTION_LIST_COPY', '复制', 'button', 10, 5),
  ('PRODUCTION_LIST_SHARE', '分享', 'button', 10, 6),
  ('PRODUCTION_LIST_PRINT', '打印', 'button', 10, 7),
  ('PRODUCTION_LIST_LABEL', '标签', 'button', 10, 8),
  ('PRODUCTION_LIST_REMARK', '备注', 'button', 10, 9);

-- ============================================================
-- 3. 工序跟进 (MENU_PROGRESS, id=13) — 已有3个，补缺
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('PROGRESS_CLOSE', '关单', 'button', 13, 4),
  ('PROGRESS_PRINT', '打印', 'button', 13, 5),
  ('PROGRESS_LABEL', '标签', 'button', 13, 6),
  ('PROGRESS_SHARE', '分享', 'button', 13, 7),
  ('PROGRESS_REMARK', '备注', 'button', 13, 8),
  ('PROGRESS_KANBAN', '看板', 'button', 13, 9),
  ('PROGRESS_SHIP', '外发', 'button', 13, 10);

-- ============================================================
-- 4. 样衣库存 (MENU_SAMPLE_INVENTORY, id=39661)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('SAMPLE_INVENTORY_INBOUND', '入库', 'button', 39661, 1),
  ('SAMPLE_INVENTORY_OUTBOUND', '借出', 'button', 39661, 2),
  ('SAMPLE_INVENTORY_DESTROY', '销毁', 'button', 39661, 3),
  ('SAMPLE_INVENTORY_RECORD', '借出记录', 'button', 39661, 4);

-- ============================================================
-- 5. 物料进销存 (MENU_MATERIAL_INVENTORY, id=39658)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('MAT_INV_INBOUND', '入库', 'button', 39658, 1),
  ('MAT_INV_OUTBOUND', '出库', 'button', 39658, 2),
  ('MAT_INV_PRINT', '打印', 'button', 39658, 3),
  ('MAT_INV_SAFETY_STOCK', '安全库存', 'button', 39658, 4),
  ('MAT_INV_PICKUP', '领料', 'button', 39658, 5);

-- ============================================================
-- 6. 物料新增 (MENU_MATERIAL_DATABASE, id=39659)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('MAT_DB_CREATE', '新增', 'button', 39659, 1),
  ('MAT_DB_EDIT', '编辑', 'button', 39659, 2),
  ('MAT_DB_DELETE', '删除', 'button', 39659, 3),
  ('MAT_DB_COPY', '复制新建', 'button', 39659, 4),
  ('MAT_DB_COMPLETE', '标记完成', 'button', 39659, 5),
  ('MAT_DB_ENABLE', '停用启用', 'button', 39659, 6);

-- ============================================================
-- 7. 成品进销存 (MENU_FINISHED_INVENTORY, id=39660)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('FIN_INV_INBOUND', '入库', 'button', 39660, 1),
  ('FIN_INV_OUTBOUND', '出库', 'button', 39660, 2),
  ('FIN_INV_PRINT', '打印', 'button', 39660, 3),
  ('FIN_INV_SAFETY_STOCK', '安全库存', 'button', 39660, 4);

-- ============================================================
-- 8. 仓库看板 (MENU_WAREHOUSE_DASHBOARD, id=39657)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('WH_DASHBOARD_EXPORT', '导出', 'button', 39657, 1);

-- ============================================================
-- 9. 领料管理 (MENU_MATERIAL_PICKING, id=39663)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('MAT_PICK_APPROVE', '审核通过', 'button', 39663, 1),
  ('MAT_PICK_CONFIRM', '确认出库', 'button', 39663, 2),
  ('MAT_PICK_CANCEL', '取消领料', 'button', 39663, 3),
  ('MAT_PICK_PRINT', '打印标签', 'button', 39663, 4);

-- ============================================================
-- 10. 转单管理 (MENU_ORDER_TRANSFER, id=55738)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('ORDER_TRANSFER_CREATE', '新增转单', 'button', 55738, 1),
  ('ORDER_TRANSFER_EDIT', '编辑', 'button', 55738, 2),
  ('ORDER_TRANSFER_CANCEL', '取消', 'button', 55738, 3);

-- ============================================================
-- 11. 智能排产 (MENU_SMART_SCHEDULING, id=81456)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('SMART_SCHEDULING_VIEW', '查看排产', 'button', 81456, 1),
  ('SMART_SCHEDULING_EDIT', '调整排产', 'button', 81456, 2);

-- ============================================================
-- 12. 纸样生产 (MENU_PATTERN_PRODUCTION, id=39656)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('PATTERN_PROD_CREATE', '新增', 'button', 39656, 1),
  ('PATTERN_PROD_EDIT', '编辑', 'button', 39656, 2),
  ('PATTERN_PROD_DELETE', '删除', 'button', 39656, 3);

-- ============================================================
-- 13. 纸样修改 (MENU_PATTERN_REVISION, id=39662)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('PATTERN_REV_CREATE', '新增', 'button', 39662, 1),
  ('PATTERN_REV_EDIT', '编辑', 'button', 39662, 2),
  ('PATTERN_REV_DELETE', '删除', 'button', 39662, 3);

-- ============================================================
-- 14. 外发结算 (MENU_FINISHED_SETTLEMENT, id=8056) — 只有1个，补缺
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('FINISH_SETTLEMENT_CREATE', '新增', 'button', 8056, 2),
  ('FINISH_SETTLEMENT_EDIT', '编辑', 'button', 8056, 3),
  ('FINISH_SETTLEMENT_AUDIT', '审核', 'button', 8056, 4),
  ('FINISH_SETTLEMENT_EXPORT', '导出', 'button', 8056, 5);

-- ============================================================
-- 15. 费用报销 (MENU_EXPENSE_REIMBURSEMENT, id=28712)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('EXPENSE_CREATE', '新增', 'button', 28712, 1),
  ('EXPENSE_EDIT', '编辑', 'button', 28712, 2),
  ('EXPENSE_DELETE', '删除', 'button', 28712, 3),
  ('EXPENSE_APPROVE', '审批', 'button', 28712, 4);

-- ============================================================
-- 16. 财税导出 (MENU_FINANCE_EXPORT, id=51605)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('FIN_EXPORT_EXECUTE', '导出', 'button', 51605, 1);

-- ============================================================
-- 17. 字典管理 (MENU_DICT, id=39654)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('DICT_CREATE', '新增', 'button', 39654, 1),
  ('DICT_EDIT', '编辑', 'button', 39654, 2),
  ('DICT_DELETE', '删除', 'button', 39654, 3);

-- ============================================================
-- 18. 系统日志 (MENU_LOGIN_LOG, id=23)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('LOGIN_LOG_EXPORT', '导出', 'button', 23, 1);

-- ============================================================
-- 19. 数据导入 (MENU_DATA_IMPORT, id=81492)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('DATA_IMPORT_EXECUTE', '执行导入', 'button', 81492, 1);

-- ============================================================
-- 20. 用户审批 (MENU_USER_APPROVAL, id=39664)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('USER_APPROVAL_APPROVE', '审批通过', 'button', 39664, 1),
  ('USER_APPROVAL_REJECT', '审批拒绝', 'button', 39664, 2);

-- ============================================================
-- 21. 选品中心 (MENU_SELECTION, id=81476)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('SELECTION_CREATE', '新增选品', 'button', 81476, 1),
  ('SELECTION_EDIT', '编辑', 'button', 81476, 2),
  ('SELECTION_DELETE', '删除', 'button', 81476, 3);

-- ============================================================
-- 22. 集成对接中心 (MENU_INTEGRATION, id=81482)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('INTEGRATION_CONFIG', '配置', 'button', 81482, 1),
  ('INTEGRATION_TEST', '测试连接', 'button', 81482, 2);

-- ============================================================
-- 23. 权限管理 (MENU_PERMISSION, id=22)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('PERMISSION_EDIT', '编辑', 'button', 22, 1);

-- ============================================================
-- 24. 租户管理 (MENU_TENANT, id=27891)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('TENANT_EDIT', '编辑', 'button', 27891, 1);

-- ============================================================
-- 25. API管理 (MENU_TENANT_APP, id=55737)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('TENANT_APP_CREATE', '新增', 'button', 55737, 1),
  ('TENANT_APP_EDIT', '编辑', 'button', 55737, 2),
  ('TENANT_APP_DELETE', '删除', 'button', 55737, 3);

-- ============================================================
-- 26. 工资结算 (MENU_PAYROLL_OPERATOR_SUMMARY, id=18)
-- ============================================================
INSERT IGNORE INTO t_permission (permission_code, permission_name, permission_type, parent_id, sort)
VALUES
  ('PAYROLL_CREATE', '新增', 'button', 18, 1),
  ('PAYROLL_EDIT', '编辑', 'button', 18, 2),
  ('PAYROLL_APPROVE', '审批', 'button', 18, 3),
  ('PAYROLL_EXPORT', '导出', 'button', 18, 4);

-- ============================================================
-- 给所有 full_admin 角色自动补上新按钮权限
-- ============================================================
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
JOIN t_permission p ON p.permission_type = 'button'
WHERE r.role_code = 'full_admin'
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ============================================================
-- 给其他现有角色补上其父菜单对应的按钮权限
-- 逻辑：如果角色有某个菜单权限，就自动补上该菜单下的所有按钮权限
-- ============================================================
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT rp_menu.role_id, p_btn.id
FROM t_role_permission rp_menu
JOIN t_permission p_menu ON p_menu.id = rp_menu.permission_id
JOIN t_permission p_btn ON p_btn.parent_id = p_menu.id AND p_btn.permission_type = 'button'
WHERE p_menu.permission_type = 'menu'
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp2
    WHERE rp2.role_id = rp_menu.role_id AND rp2.permission_id = p_btn.id
  );

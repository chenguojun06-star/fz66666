-- ============================================================
-- D-279：权限树名称/挂靠对齐侧边栏权威命名（menuConfig）
-- 背景：岗位权限矩阵按 DB 节点名渲染，历史节点名与侧边栏页面名大量脱节
-- （样衣出入库/面辅料进销存/我的订单/审批付款/登录日志…），用户反馈
-- "名字对不上、子模块权限堆积看不清"。
-- 原则：全部按 permission_code 定位（本地/云端 id 漂移），只 UPDATE 不 INSERT，
--       重复执行结果不变（幂等）。
-- ============================================================

-- 1) 子菜单名对齐侧边栏（menuConfig 为命名权威）
UPDATE t_permission SET permission_name = '资料维护' WHERE permission_code = 'MENU_DATA_CENTER' AND permission_name <> '资料维护';
UPDATE t_permission SET permission_name = '样衣库存' WHERE permission_code = 'MENU_SAMPLE_INVENTORY' AND permission_name <> '样衣库存';
UPDATE t_permission SET permission_name = '商品下单' WHERE permission_code = 'MENU_ORDER_MANAGEMENT' AND permission_name <> '商品下单';
UPDATE t_permission SET permission_name = '物料出入库' WHERE permission_code = 'MENU_MATERIAL_INVENTORY' AND permission_name <> '物料出入库';
UPDATE t_permission SET permission_name = '物料资料' WHERE permission_code = 'MENU_MATERIAL_DATABASE' AND permission_name <> '物料资料';
UPDATE t_permission SET permission_name = '生产订单' WHERE permission_code = 'MENU_PRODUCTION_LIST' AND permission_name <> '生产订单';
UPDATE t_permission SET permission_name = '工序跟进' WHERE permission_code = 'MENU_PROGRESS' AND permission_name <> '工序跟进';
UPDATE t_permission SET permission_name = '质检入库' WHERE permission_code = 'MENU_WAREHOUSING' AND permission_name <> '质检入库';
UPDATE t_permission SET permission_name = '供应商管理' WHERE permission_code = 'MENU_FACTORY' AND permission_name <> '供应商管理';
UPDATE t_permission SET permission_name = '成品仓库' WHERE permission_code = 'MENU_FINISHED_INVENTORY' AND permission_name <> '成品仓库';
UPDATE t_permission SET permission_name = '工资结算' WHERE permission_code = 'MENU_PAYROLL_OPERATOR_SUMMARY' AND permission_name <> '工资结算';
UPDATE t_permission SET permission_name = '外发结算' WHERE permission_code = 'MENU_FINISHED_SETTLEMENT' AND permission_name <> '外发结算';
UPDATE t_permission SET permission_name = '收付款中心' WHERE permission_code = 'MENU_PAYMENT_APPROVAL' AND permission_name <> '收付款中心';
UPDATE t_permission SET permission_name = '费用管理' WHERE permission_code = 'MENU_EXPENSE_REIMBURSEMENT' AND permission_name <> '费用管理';
UPDATE t_permission SET permission_name = '财税工具' WHERE permission_code = 'MENU_FINANCE_EXPORT' AND permission_name <> '财税工具';
UPDATE t_permission SET permission_name = '员工借支' WHERE permission_code = 'MENU_EMPLOYEE_ADVANCE' AND permission_name <> '员工借支';
UPDATE t_permission SET permission_name = '岗位与权限' WHERE permission_code = 'MENU_ROLE' AND permission_name <> '岗位与权限';
UPDATE t_permission SET permission_name = '系统日志' WHERE permission_code = 'MENU_LOGIN_LOG' AND permission_name <> '系统日志';

-- 2) 按钮名对齐（消除"节点与子按钮重名"）
UPDATE t_permission SET permission_name = '查看财务数据' WHERE permission_code = 'FINANCE_TOTAL_AMOUNT_VIEW' AND permission_name <> '查看财务数据';
UPDATE t_permission SET permission_name = '应用商店' WHERE permission_code = 'MENU_APP_STORE_VIEW' AND permission_name <> '应用商店';
UPDATE t_permission SET permission_name = '应用购买' WHERE permission_code = 'MENU_APP_STORE_BUY' AND permission_name <> '应用购买';

-- 3) 挂靠修正：按 code 子查询定位父 id（UPDATE 同表需包一层派生表）
-- 3.1 员工借支是独立子菜单，历史数据挂在 成品结算单/财务汇总 下 → 回到财务管理顶级下
UPDATE t_permission p
SET p.parent_id = (SELECT t.id FROM (SELECT id FROM t_permission WHERE permission_code = 'MENU_FINANCE' LIMIT 1) t)
WHERE p.permission_code = 'MENU_EMPLOYEE_ADVANCE';

-- 3.2 查看财务数据按钮归入工资结算菜单（历史挂在财务管理顶级下，矩阵渲染不到）
UPDATE t_permission p
SET p.parent_id = (SELECT t.id FROM (SELECT id FROM t_permission WHERE permission_code = 'MENU_PAYROLL_OPERATOR_SUMMARY' LIMIT 1) t)
WHERE p.permission_code = 'FINANCE_TOTAL_AMOUNT_VIEW';

-- 3.3 财税工具归位财务管理顶级；其执行按钮归入财税工具
UPDATE t_permission p
SET p.parent_id = (SELECT t.id FROM (SELECT id FROM t_permission WHERE permission_code = 'MENU_FINANCE' LIMIT 1) t)
WHERE p.permission_code = 'MENU_FINANCE_EXPORT';

UPDATE t_permission p
SET p.parent_id = (SELECT t.id FROM (SELECT id FROM t_permission WHERE permission_code = 'MENU_FINANCE_EXPORT' LIMIT 1) t)
WHERE p.permission_code = 'FIN_EXPORT_EXECUTE';

-- ============================================================
-- 修复权限数据结构
-- 1. 修复3条乱码权限名称
-- 2. 新增"仓库管理"顶级分组
-- 3. 修正各级权限的 parent_id（button权限归入对应菜单）
-- 4. 统一显示名称与前端一致
-- 日期：2026-02-19
-- ============================================================

-- 0. 先新增"仓库管理"顶级分组（如果不存在）
INSERT INTO t_permission (permission_name, permission_code, permission_type, parent_id, status)
SELECT '仓库管理', 'MENU_WAREHOUSE', 'MENU', 0, 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE');

-- 1. 修复3条乱码名称
UPDATE t_permission SET permission_name = '工资支付管理' WHERE id = 28713;
UPDATE t_permission SET permission_name = '工资支付查看' WHERE id = 28714;
UPDATE t_permission SET permission_name = '结算审批'     WHERE id = 28715;

-- 2. 统一顶级分组名称（与前端菜单标题一致）
UPDATE t_permission SET permission_name = '样衣管理' WHERE permission_code = 'MENU_BASIC';
UPDATE t_permission SET permission_name = '样衣开发' WHERE permission_code = 'MENU_STYLE_INFO';
UPDATE t_permission SET permission_name = '单价维护' WHERE permission_code = 'MENU_TEMPLATE_CENTER';

-- 3. 将"仓库管理"下的菜单归入新分组
UPDATE t_permission
SET parent_id = (SELECT id FROM (SELECT id FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE') t)
WHERE permission_code IN (
    'MENU_WAREHOUSE_DASHBOARD',
    'MENU_MATERIAL_INVENTORY',
    'MENU_MATERIAL_DATABASE',
    'MENU_FINISHED_INVENTORY',
    'MENU_SAMPLE_INVENTORY'
);

-- 4. 将"样衣管理"下的菜单归入正确父级（parent_id=样衣管理id=2）
UPDATE t_permission SET parent_id = 2 WHERE permission_code = 'MENU_PATTERN_PRODUCTION';
UPDATE t_permission SET parent_id = 2 WHERE permission_code = 'MENU_PATTERN_REVISION';

-- 5. 将"生产管理"下的菜单归入正确父级（parent_id=3）
UPDATE t_permission SET parent_id = 3 WHERE permission_code = 'MENU_MATERIAL_PICKING';

-- 6. 将"财务管理"下的新权限归入正确父级（parent_id=4）
UPDATE t_permission SET parent_id = 4 WHERE id IN (28713, 28714, 28715);

-- 7. 将"系统设置"下的菜单归入正确父级（parent_id=5）
UPDATE t_permission SET parent_id = 5 WHERE permission_code = 'MENU_DICT';
UPDATE t_permission SET parent_id = 5 WHERE permission_code = 'MENU_TUTORIAL';
UPDATE t_permission SET parent_id = 5 WHERE permission_code = 'MENU_USER_APPROVAL';

-- 8. 应用商店：子权限归入父级
UPDATE t_permission SET parent_id = (
    SELECT id FROM (SELECT id FROM t_permission WHERE permission_code = 'MENU_APP_STORE_VIEW') t
) WHERE permission_code = 'MENU_APP_STORE_BUY';

-- 9. 按钮级权限归入对应子菜单

-- 样衣/款号按钮 → 款号资料(样衣开发) id=6
UPDATE t_permission SET parent_id = 6
WHERE permission_code IN ('STYLE_CREATE','STYLE_EDIT','STYLE_DELETE','STYLE_IMPORT','STYLE_EXPORT');

-- 下单管理按钮 → 下单管理 id=7
UPDATE t_permission SET parent_id = 7
WHERE permission_code IN ('ORDER_CREATE','ORDER_EDIT','ORDER_DELETE','ORDER_CANCEL',
                          'ORDER_COMPLETE','ORDER_IMPORT','ORDER_EXPORT','ORDER_TRANSFER');

-- 模板中心按钮 → 模板/单价维护 id=9
UPDATE t_permission SET parent_id = 9
WHERE permission_code IN ('TEMPLATE_UPLOAD','TEMPLATE_DELETE');

-- 物料采购按钮 → 物料采购 id=11
UPDATE t_permission SET parent_id = 11
WHERE permission_code IN ('PURCHASE_CREATE','PURCHASE_EDIT','PURCHASE_DELETE',
                          'PURCHASE_RECEIVE','PURCHASE_RETURN_CONFIRM','PURCHASE_GENERATE');

-- 裁剪管理按钮 → 裁剪管理 id=12
UPDATE t_permission SET parent_id = 12
WHERE permission_code IN ('CUTTING_CREATE','CUTTING_EDIT','CUTTING_DELETE','CUTTING_SCAN');

-- 生产进度按钮 → 生产进度 id=13
UPDATE t_permission SET parent_id = 13
WHERE permission_code IN ('PROGRESS_SCAN','PROGRESS_EDIT','PROGRESS_DELETE');

-- 质检入库按钮 → 质检入库 id=14
UPDATE t_permission SET parent_id = 14
WHERE permission_code IN ('WAREHOUSING_CREATE','WAREHOUSING_EDIT','WAREHOUSING_DELETE','WAREHOUSING_ROLLBACK');

-- 物料对账按钮 → 物料对账 id=15
UPDATE t_permission SET parent_id = 15
WHERE permission_code IN ('MATERIAL_RECON_CREATE','MATERIAL_RECON_EDIT','MATERIAL_RECON_DELETE',
                          'MATERIAL_RECON_AUDIT','MATERIAL_RECON_SETTLEMENT');

-- 成品结算按钮 → 成品结算 id=16
UPDATE t_permission SET parent_id = 16
WHERE permission_code IN ('SHIPMENT_RECON_CREATE','SHIPMENT_RECON_EDIT','SHIPMENT_RECON_DELETE','SHIPMENT_RECON_AUDIT');

-- 审批付款按钮 → 审批付款 id=17
UPDATE t_permission SET parent_id = 17
WHERE permission_code IN ('PAYMENT_APPROVE','PAYMENT_REJECT','PAYMENT_CANCEL');

-- 人员管理按钮 → 人员管理 id=19
UPDATE t_permission SET parent_id = 19
WHERE permission_code IN ('USER_CREATE','USER_EDIT','USER_DELETE','USER_RESET_PASSWORD');

-- 角色管理按钮 → 角色管理 id=20
UPDATE t_permission SET parent_id = 20
WHERE permission_code IN ('ROLE_CREATE','ROLE_EDIT','ROLE_DELETE');

-- 供应商管理按钮 → 供应商管理 id=21
UPDATE t_permission SET parent_id = 21
WHERE permission_code IN ('FACTORY_CREATE','FACTORY_EDIT','FACTORY_DELETE');

-- 数据导入导出 → 系统设置 id=5
UPDATE t_permission SET parent_id = 5
WHERE permission_code IN ('DATA_IMPORT','DATA_EXPORT');

COMMIT;

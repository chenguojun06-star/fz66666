-- ============================================================
-- V202607192100__add_procurement_crm_permissions.sql
-- 为「供应商采购」(MENU_PROCUREMENT id=51607) 和
--    「客户管理」  (MENU_CRM        id=51606) 两个顶级模块
-- 新增二、三级子权限记录。
--
-- 根因：两模块在 t_permission 中只有顶级行，无任何子项，
--       导致角色授权弹窗中对应列仅显示「仅页面入口」，
--       无法为角色分配细粒度权限。
--
-- 幂等性：使用 INSERT IGNORE + permission_code 唯一键约束，
--         重复执行不会报错也不会产生重复数据。
-- ============================================================

SET NAMES utf8mb4;

-- ============================================================
-- 一、供应商采购模块 (MENU_PROCUREMENT, id=51607)
-- ============================================================

-- 1-A  子菜单：供应商管理
INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
VALUES ('供应商管理', 'MENU_PROCUREMENT_SUPPLIER', 'MENU', 51607, '供应商采购', 1, 'ENABLED');

-- 1-B  供应商管理 → 按钮权限（parent_id 动态取刚插入的菜单ID）
INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '查看供应商', 'PROCUREMENT_SUPPLIER_VIEW', 'BUTTON', id, '供应商管理', 1, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_SUPPLIER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '新增供应商', 'PROCUREMENT_SUPPLIER_CREATE', 'BUTTON', id, '供应商管理', 2, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_SUPPLIER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '编辑供应商', 'PROCUREMENT_SUPPLIER_EDIT', 'BUTTON', id, '供应商管理', 3, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_SUPPLIER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '删除供应商', 'PROCUREMENT_SUPPLIER_DELETE', 'BUTTON', id, '供应商管理', 4, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_SUPPLIER';

-- 1-C  子菜单：采购单管理
INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
VALUES ('采购单管理', 'MENU_PROCUREMENT_ORDER', 'MENU', 51607, '供应商采购', 2, 'ENABLED');

-- 1-D  采购单管理 → 按钮权限
INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '查看采购单', 'PROCUREMENT_ORDER_VIEW', 'BUTTON', id, '采购单管理', 1, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_ORDER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '新建采购单', 'PROCUREMENT_ORDER_CREATE', 'BUTTON', id, '采购单管理', 2, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_ORDER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '编辑采购单', 'PROCUREMENT_ORDER_EDIT', 'BUTTON', id, '采购单管理', 3, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_ORDER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '确认到货', 'PROCUREMENT_ORDER_CONFIRM', 'BUTTON', id, '采购单管理', 4, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_ORDER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '审核采购单', 'PROCUREMENT_ORDER_AUDIT', 'BUTTON', id, '采购单管理', 5, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_ORDER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '取消收货', 'PROCUREMENT_ORDER_CANCEL', 'BUTTON', id, '采购单管理', 6, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_ORDER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '上传发票', 'PROCUREMENT_ORDER_INVOICE', 'BUTTON', id, '采购单管理', 7, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_PROCUREMENT_ORDER';

-- ============================================================
-- 二、客户管理模块 (MENU_CRM, id=51606)
-- ============================================================

-- 2-A  子菜单：客户档案
INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
VALUES ('客户档案', 'MENU_CRM_CUSTOMER', 'MENU', 51606, '客户管理', 1, 'ENABLED');

-- 2-B  客户档案 → 按钮权限
INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '查看客户', 'CRM_CUSTOMER_VIEW', 'BUTTON', id, '客户档案', 1, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_CRM_CUSTOMER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '新增客户', 'CRM_CUSTOMER_CREATE', 'BUTTON', id, '客户档案', 2, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_CRM_CUSTOMER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '编辑客户', 'CRM_CUSTOMER_EDIT', 'BUTTON', id, '客户档案', 3, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_CRM_CUSTOMER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '删除客户', 'CRM_CUSTOMER_DELETE', 'BUTTON', id, '客户档案', 4, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_CRM_CUSTOMER';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '生成门户链接', 'CRM_CUSTOMER_PORTAL', 'BUTTON', id, '客户档案', 5, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_CRM_CUSTOMER';

-- 2-C  子菜单：应收款管理
INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
VALUES ('应收款管理', 'MENU_CRM_RECEIVABLE', 'MENU', 51606, '客户管理', 2, 'ENABLED');

-- 2-D  应收款管理 → 按钮权限
INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '查看应收款', 'CRM_RECEIVABLE_VIEW', 'BUTTON', id, '应收款管理', 1, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_CRM_RECEIVABLE';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '新增应收款', 'CRM_RECEIVABLE_CREATE', 'BUTTON', id, '应收款管理', 2, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_CRM_RECEIVABLE';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '标记收款', 'CRM_RECEIVABLE_COLLECT', 'BUTTON', id, '应收款管理', 3, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_CRM_RECEIVABLE';

INSERT IGNORE INTO t_permission
    (permission_name, permission_code, permission_type, parent_id, parent_name, sort, status)
SELECT '删除应收款', 'CRM_RECEIVABLE_DELETE', 'BUTTON', id, '应收款管理', 4, 'ENABLED'
FROM t_permission WHERE permission_code = 'MENU_CRM_RECEIVABLE';

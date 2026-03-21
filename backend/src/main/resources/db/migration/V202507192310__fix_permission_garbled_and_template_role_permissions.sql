-- ============================================================
-- V202507192310 修复权限表乱码 + 补全模板角色权限
-- 问题1: MENU_INTELLIGENCE_CENTER 因插入时连接字符集为 latin1，
--        导致 permission_name 双重编码，显示为乱码 "æ™ºèƒ½è¿ä¸å¿ƒ"
-- 问题2: warehouse_mgr 模板角色缺少父节点 MENU_WAREHOUSE，
--        导致授权弹窗中"仓库管理"列不显示
-- 问题3: cutter/packager/quality 模板角色缺少核心业务权限
-- ============================================================

-- --------------------------------------------------------
-- 1. 修复 MENU_INTELLIGENCE_CENTER 乱码名称
-- --------------------------------------------------------
UPDATE t_permission
SET permission_name = '智能运营中心'
WHERE id = 61109
  AND permission_code = 'MENU_INTELLIGENCE_CENTER';

-- --------------------------------------------------------
-- 2. warehouse_mgr (role_id=9) 补加 MENU_WAREHOUSE 父节点
--    (该节点 id=41825，使授权弹窗能渲染"仓库管理"列)
-- --------------------------------------------------------
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT 9, id FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE';

-- --------------------------------------------------------
-- 3. cutter 裁剪员 (role_id=5) 补全裁剪管理核心权限
--    原来仅有 APP_STORE/TUTORIAL 等，缺少实际工作权限
-- --------------------------------------------------------
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT 5, id FROM t_permission WHERE permission_code IN (
    'MENU_DASHBOARD',
    'MENU_PRODUCTION',
    'MENU_PRODUCTION_LIST',
    'MENU_CUTTING',
    'CUTTING_CREATE',
    'CUTTING_EDIT',
    'CUTTING_SCAN'
);

-- --------------------------------------------------------
-- 4. packager 包装员 (role_id=7) 补全质检入库相关权限
-- --------------------------------------------------------
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT 7, id FROM t_permission WHERE permission_code IN (
    'MENU_DASHBOARD',
    'MENU_PRODUCTION',
    'MENU_PRODUCTION_LIST',
    'MENU_WAREHOUSING',
    'WAREHOUSING_CREATE',
    'WAREHOUSING_EDIT'
);

-- --------------------------------------------------------
-- 5. quality 质检员 (role_id=8) 补全质检入库权限
-- --------------------------------------------------------
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT 8, id FROM t_permission WHERE permission_code IN (
    'MENU_DASHBOARD',
    'MENU_PRODUCTION',
    'MENU_PRODUCTION_LIST',
    'MENU_PROGRESS',
    'PROGRESS_SCAN',
    'MENU_WAREHOUSING',
    'WAREHOUSING_CREATE',
    'WAREHOUSING_EDIT'
);

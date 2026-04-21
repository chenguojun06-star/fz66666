-- =====================================================================
-- 补充前端已使用但后端缺失的菜单权限码
-- 问题：前端 routeConfig.ts 定义了多个权限码，但 t_permission 表中
--       缺少对应记录，导致非管理员用户看不到相关菜单。
-- 日期：2026-04-21
-- =====================================================================

-- 1. 新增缺失的菜单权限（INSERT IGNORE 保证幂等）

-- 生产管理子菜单
INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '物料领用', 'MENU_MATERIAL_PICKING', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_PRODUCTION'), 0),
       '生产管理', '/production/picking', 26, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_MATERIAL_PICKING');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '订单转移', 'MENU_ORDER_TRANSFER', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_PRODUCTION'), 0),
       '生产管理', '/production/transfer', 28, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_ORDER_TRANSFER');

-- 财务管理子菜单
INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '订单结算(外)', 'MENU_FINISHED_SETTLEMENT', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_FINANCE'), 0),
       '财务管理', '/finance/center', 38, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_FINISHED_SETTLEMENT');

-- 仓库管理分组及子菜单
INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '仓库管理', 'MENU_WAREHOUSE', 'MENU', 0, NULL, NULL, 45, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '仓库仪表盘', 'MENU_WAREHOUSE_DASHBOARD', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE'), 0),
       '仓库管理', '/warehouse/dashboard', 46, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE_DASHBOARD');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '物料进销存', 'MENU_MATERIAL_INVENTORY', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE'), 0),
       '仓库管理', '/warehouse/material', 47, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_MATERIAL_INVENTORY');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '物料新增', 'MENU_MATERIAL_DATABASE', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE'), 0),
       '仓库管理', '/warehouse/material-database', 48, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_MATERIAL_DATABASE');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '成品进销存', 'MENU_FINISHED_INVENTORY', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE'), 0),
       '仓库管理', '/warehouse/finished', 49, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_FINISHED_INVENTORY');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '样衣库存', 'MENU_SAMPLE_INVENTORY', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_WAREHOUSE'), 0),
       '仓库管理', '/warehouse/sample', 50, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_SAMPLE_INVENTORY');

-- 独立模块菜单
INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '选品中心', 'MENU_SELECTION', 'MENU', 0, NULL, '/selection', 55, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_SELECTION');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '客户管理', 'MENU_CUSTOMER', 'MENU', 0, NULL, '/system/customer', 65, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_CUSTOMER');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '应用商店', 'MENU_APP_STORE_VIEW', 'MENU', 0, NULL, '/system/app-store', 75, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_APP_STORE_VIEW');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT 'API对接管理', 'MENU_TENANT_APP', 'MENU', 0, NULL, '/system/tenant', 80, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_TENANT_APP');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '集成对接中心', 'MENU_INTEGRATION', 'MENU', 0, NULL, '/integration/center', 85, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_INTEGRATION');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '智能运营中心', 'MENU_INTELLIGENCE_CENTER', 'MENU', 0, NULL, '/intelligence/center', 90, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_INTELLIGENCE_CENTER');

-- 系统设置子菜单
INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '用户审批', 'MENU_USER_APPROVAL', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_SYSTEM'), 0),
       '系统设置', '/system/user-approval', 46, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_USER_APPROVAL');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '字典管理', 'MENU_DICT', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_SYSTEM'), 0),
       '系统设置', '/system/dict', 47, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_DICT');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '系统教学', 'MENU_TUTORIAL', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_SYSTEM'), 0),
       '系统设置', '/system/tutorial', 48, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_TUTORIAL');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '数据导入', 'MENU_DATA_IMPORT', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_SYSTEM'), 0),
       '系统设置', '/system/data-import', 49, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_DATA_IMPORT');

-- 样衣管理子菜单
INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '样衣生产', 'MENU_PATTERN_PRODUCTION', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_BASIC'), 0),
       '样衣管理', '/pattern-production', 15, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_PATTERN_PRODUCTION');

INSERT IGNORE INTO t_permission (permission_name, permission_code, permission_type, parent_id, parent_name, path, sort, status)
SELECT '样衣修订', 'MENU_PATTERN_REVISION', 'MENU',
       COALESCE((SELECT id FROM t_permission WHERE permission_code = 'MENU_BASIC'), 0),
       '样衣管理', '/basic/pattern-revision', 16, 'ENABLED'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_PATTERN_REVISION');


-- 2. 将新增权限分配给 full_admin 角色模板（新租户克隆时会继承）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'full_admin'
  AND r.is_template = 1
  AND p.permission_code IN (
      'MENU_MATERIAL_PICKING', 'MENU_ORDER_TRANSFER',
      'MENU_FINISHED_SETTLEMENT', 'MENU_WAREHOUSE', 'MENU_WAREHOUSE_DASHBOARD',
      'MENU_MATERIAL_INVENTORY', 'MENU_MATERIAL_DATABASE', 'MENU_FINISHED_INVENTORY',
      'MENU_SAMPLE_INVENTORY', 'MENU_SELECTION', 'MENU_CUSTOMER',
      'MENU_APP_STORE_VIEW', 'MENU_TENANT_APP', 'MENU_INTEGRATION',
      'MENU_INTELLIGENCE_CENTER', 'MENU_USER_APPROVAL', 'MENU_DICT',
      'MENU_TUTORIAL', 'MENU_DATA_IMPORT', 'MENU_PATTERN_PRODUCTION',
      'MENU_PATTERN_REVISION'
  )
  AND NOT EXISTS (
      SELECT 1 FROM t_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- 3. 将新增权限分配给所有租户的 full_admin 角色实例（已克隆的角色）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'full_admin'
  AND r.is_template = 0
  AND r.tenant_id IS NOT NULL
  AND p.permission_code IN (
      'MENU_MATERIAL_PICKING', 'MENU_ORDER_TRANSFER',
      'MENU_FINISHED_SETTLEMENT', 'MENU_WAREHOUSE', 'MENU_WAREHOUSE_DASHBOARD',
      'MENU_MATERIAL_INVENTORY', 'MENU_MATERIAL_DATABASE', 'MENU_FINISHED_INVENTORY',
      'MENU_SAMPLE_INVENTORY', 'MENU_SELECTION', 'MENU_CUSTOMER',
      'MENU_APP_STORE_VIEW', 'MENU_TENANT_APP', 'MENU_INTEGRATION',
      'MENU_INTELLIGENCE_CENTER', 'MENU_USER_APPROVAL', 'MENU_DICT',
      'MENU_TUTORIAL', 'MENU_DATA_IMPORT', 'MENU_PATTERN_PRODUCTION',
      'MENU_PATTERN_REVISION'
  )
  AND p.status = 'ENABLED'
  AND NOT EXISTS (
      SELECT 1 FROM t_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- 4. 将新增权限分配给全局管理员角色 (role_id=1, 系统管理员)
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT 1, p.id
FROM t_permission p
WHERE p.permission_code IN (
    'MENU_MATERIAL_PICKING', 'MENU_ORDER_TRANSFER',
    'MENU_FINISHED_SETTLEMENT', 'MENU_WAREHOUSE', 'MENU_WAREHOUSE_DASHBOARD',
    'MENU_MATERIAL_INVENTORY', 'MENU_MATERIAL_DATABASE', 'MENU_FINISHED_INVENTORY',
    'MENU_SAMPLE_INVENTORY', 'MENU_SELECTION', 'MENU_CUSTOMER',
    'MENU_APP_STORE_VIEW', 'MENU_TENANT_APP', 'MENU_INTEGRATION',
    'MENU_INTELLIGENCE_CENTER', 'MENU_USER_APPROVAL', 'MENU_DICT',
    'MENU_TUTORIAL', 'MENU_DATA_IMPORT', 'MENU_PATTERN_PRODUCTION',
    'MENU_PATTERN_REVISION'
)
AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp
    WHERE rp.role_id = 1 AND rp.permission_id = p.id
);

COMMIT;

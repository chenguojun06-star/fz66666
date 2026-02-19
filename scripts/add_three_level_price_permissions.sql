-- =====================================================
-- 财务数据三级权限配置脚本
-- =====================================================
-- 功能：添加3个细粒度权限，实现总单价、车缝单价、基础数据的分级控制
--
-- 🔴 权限1: FINANCE_TOTAL_AMOUNT_VIEW（最高权限）
--    - 查看所有单价和金额（订单总价、所有工序单价、员工工资等）
--    - 分配角色：admin, finance_supervisor, purchaser
--
-- 🟡 权限2: FINANCE_SEWING_PRICE_ONLY（中级权限）
--    - 只能查看车缝工序的单价和金额，其他工序隐藏
--    - 分配角色：workshop_director, cutter, sewing, quality（车间主任和生产一线员工）
--    - 说明：生产相关员工都能看车缝单价，方便了解车缝工序成本
--
-- 🟢 权限3: FINANCE_BASIC_DATA_ONLY（基础权限）
--    - 只能查看基础数据（订单号、数量、进度），所有单价隐藏
--    - 分配角色：packager, warehouse（后勤人员）
--    - 说明：非生产线员工不涉及单价，只看基础信息
-- =====================================================

USE fashion_supplychain;

-- ========== 第1步：添加3个权限定义 ==========

-- 🔴 权限1：查看总单价和总金额（最高权限）
INSERT INTO t_permission (
  permission_code,
  permission_name,
  permission_type,
  parent_id,
  sort
)
SELECT
  'FINANCE_TOTAL_AMOUNT_VIEW',
  '查看总单价和总金额',
  'button',
  4,
  10
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM t_permission WHERE permission_code = 'FINANCE_TOTAL_AMOUNT_VIEW'
);

-- 🟡 权限2：只能查看车缝单价（中级权限）
INSERT INTO t_permission (
  permission_code,
  permission_name,
  permission_type,
  parent_id,
  sort
)
SELECT
  'FINANCE_SEWING_PRICE_ONLY',
  '只能查看车缝单价',
  'button',
  4,
  20
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM t_permission WHERE permission_code = 'FINANCE_SEWING_PRICE_ONLY'
);

-- 🟢 权限3：只能查看基础数据（无单价）
INSERT INTO t_permission (
  permission_code,
  permission_name,
  permission_type,
  parent_id,
  sort
)
SELECT
  'FINANCE_BASIC_DATA_ONLY',
  '只能查看基础数据（无单价）',
  'button',
  4,
  30
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM t_permission WHERE permission_code = 'FINANCE_BASIC_DATA_ONLY'
);

-- ========== 第2步：分配权限给不同角色 ==========

-- 🔴 高权限角色：管理员（查看所有数据）
INSERT INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'admin'
AND p.permission_code = 'FINANCE_TOTAL_AMOUNT_VIEW'
AND NOT EXISTS (
  SELECT 1 FROM t_role_permission rp
  WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

-- 🔴 高权限角色：财务主管（查看所有数据）
INSERT INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'finance_supervisor'
AND p.permission_code = 'FINANCE_TOTAL_AMOUNT_VIEW'
AND NOT EXISTS (
  SELECT 1 FROM t_role_permission rp
  WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

-- 🔴 高权限角色：采购主管（查看所有数据）
INSERT INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code = 'purchaser'
AND p.permission_code = 'FINANCE_TOTAL_AMOUNT_VIEW'
AND NOT EXISTS (
  SELECT 1 FROM t_role_permission rp
  WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

-- 🟡 中级权限角色：车间主任+生产一线员工（都能看车缝单价）
INSERT INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code IN ('workshop_director', 'cutter', 'sewing', 'quality')
AND p.permission_code = 'FINANCE_SEWING_PRICE_ONLY'
AND NOT EXISTS (
  SELECT 1 FROM t_role_permission rp
  WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

-- 🟢 基础权限角色：后勤人员（只看基础数据，不看任何单价）
INSERT INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code IN ('packager', 'warehouse')
AND p.permission_code = 'FINANCE_BASIC_DATA_ONLY'
AND NOT EXISTS (
  SELECT 1 FROM t_role_permission rp
  WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

-- ========== 第3步：验证配置结果 ==========

-- 查看3个权限是否添加成功
SELECT
  p.id AS '权限ID',
  p.permission_code AS '权限码',
  p.permission_name AS '权限名称',
  p.permission_type AS '类型',
  p.sort AS '排序'
FROM t_permission p
WHERE p.permission_code IN (
  'FINANCE_TOTAL_AMOUNT_VIEW',
  'FINANCE_SEWING_PRICE_ONLY',
  'FINANCE_BASIC_DATA_ONLY'
)
ORDER BY p.sort;

-- 查看各角色拥有的财务权限
SELECT
  r.role_code AS '角色代码',
  r.role_name AS '角色名称',
  p.permission_code AS '权限码',
  p.permission_name AS '权限名称',
  CASE
    WHEN p.permission_code = 'FINANCE_TOTAL_AMOUNT_VIEW' THEN '🔴 最高权限 - 查看所有单价和金额'
    WHEN p.permission_code = 'FINANCE_SEWING_PRICE_ONLY' THEN '🟡 中级权限 - 只看车缝单价'
    WHEN p.permission_code = 'FINANCE_BASIC_DATA_ONLY' THEN '🟢 基础权限 - 只看基础数据'
    ELSE '其他'
  END AS '权限级别说明'
FROM t_role r
INNER JOIN t_role_permission rp ON r.id = rp.role_id
INNER JOIN t_permission p ON rp.permission_id = p.id
WHERE p.permission_code IN (
  'FINANCE_TOTAL_AMOUNT_VIEW',
  'FINANCE_SEWING_PRICE_ONLY',
  'FINANCE_BASIC_DATA_ONLY'
)
ORDER BY
  FIELD(p.permission_code, 'FINANCE_TOTAL_AMOUNT_VIEW', 'FINANCE_SEWING_PRICE_ONLY', 'FINANCE_BASIC_DATA_ONLY'),
  r.role_code;

-- 统计每个角色的财务权限数量
SELECT
  r.role_code AS '角色代码',
  r.role_name AS '角色名称',
  COUNT(p.id) AS '拥有的财务权限数',
  GROUP_CONCAT(p.permission_name SEPARATOR ', ') AS '权限列表'
FROM t_role r
LEFT JOIN t_role_permission rp ON r.id = rp.role_id
LEFT JOIN t_permission p ON rp.permission_id = p.id
WHERE p.permission_code IN (
  'FINANCE_TOTAL_AMOUNT_VIEW',
  'FINANCE_SEWING_PRICE_ONLY',
  'FINANCE_BASIC_DATA_ONLY'
)
GROUP BY r.id, r.role_code, r.role_name
ORDER BY COUNT(p.id) DESC;

-- ========== 第4步：如果角色不存在，创建角色（可选）==========

/*
-- 如果 workshop_director 角色不存在，执行以下SQL创建
INSERT INTO t_role (role_code, role_name, data_scope, status, create_time, update_time)
SELECT 'workshop_director', '车间主任', 'department', 1, NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM t_role WHERE role_code = 'workshop_director'
);

-- 如果 finance_supervisor 角色不存在，执行以下SQL创建
INSERT INTO t_role (role_code, role_name, data_scope, status, create_time, update_time)
SELECT 'finance_supervisor', '财务主管', 'all', 1, NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM t_role WHERE role_code = 'finance_supervisor'
);
*/

-- ========== 回滚脚本（如需撤销所有更改）==========

/*
-- 删除角色权限关联
DELETE rp FROM t_role_permission rp
INNER JOIN t_permission p ON rp.permission_id = p.id
WHERE p.permission_code IN (
  'FINANCE_TOTAL_AMOUNT_VIEW',
  'FINANCE_SEWING_PRICE_ONLY',
  'FINANCE_BASIC_DATA_ONLY'
);

-- 删除权限定义
DELETE FROM t_permission
WHERE permission_code IN (
  'FINANCE_TOTAL_AMOUNT_VIEW',
  'FINANCE_SEWING_PRICE_ONLY',
  'FINANCE_BASIC_DATA_ONLY'
);

-- 验证删除结果
SELECT COUNT(*) AS '剩余财务权限数'
FROM t_permission
WHERE permission_code IN (
  'FINANCE_TOTAL_AMOUNT_VIEW',
  'FINANCE_SEWING_PRICE_ONLY',
  'FINANCE_BASIC_DATA_ONLY'
);
*/

-- ========== 权限分配逻辑说明 ==========

/*
┌──────────────────────────────────────────────────────────────┐
│ 📊 三级权限分配矩阵                                           │
├────────────────┬─────────────────────────────────────────────┤
│ 🔴 最高权限    │ FINANCE_TOTAL_AMOUNT_VIEW                   │
│                │ • 分配角色：admin, finance_supervisor,       │
│                │              purchaser                       │
│                │ • 可见数据：所有单价、所有金额、所有工序     │
│                │ • 应用场景：财务报表、成本分析、对账结算     │
├────────────────┼─────────────────────────────────────────────┤
│ 🟡 中级权限    │ FINANCE_SEWING_PRICE_ONLY                   │
│                │ • 分配角色：workshop_director（车间主任）   │
│                │ • 可见数据：只能看车缝单价和车缝金额         │
│                │ • 限制范围：不能看裁剪、质检、包装等单价     │
│                │ • 应用场景：车间成本管理、车缝工资核算       │
├────────────────┼─────────────────────────────────────────────┤
│ 🟢 基础权限    │ FINANCE_BASIC_DATA_ONLY                     │
│                │ • 分配角色：cutter, sewing, quality,        │
│                │              packager, warehouse             │
│                │ • 可见数据：订单号、数量、进度、状态         │
│                │ • 隐藏数据：所有单价、所有金额               │
│                │ • 应用场景：一线员工扫码、查看工作任务       │
└────────────────┴─────────────────────────────────────────────┘

扫码系统不受影响的设计原理：
┌──────────────────────────────────────────────────────────────┐
│ 后端（ScanRecordOrchestrator）：                              │
│   • 所有员工扫码时，后端都保存完整数据（含单价和金额）        │
│   • 确保数据完整性，财务统计不受权限影响                      │
│                                                               │
│ 前端（React/TypeScript）：                                    │
│   • 管理员：显示所有单价和金额（¥1.5，¥75）                 │
│   • 车间主任：只显示车缝单价（¥1.5），其他显示 ***           │
│   • 普通员工：全部显示 ***                                    │
│                                                               │
│ 小程序（miniprogram）：                                       │
│   • 所有角色：全部隐藏单价和金额（安全第一）                  │
│   • 只显示：订单号、工序名、数量                              │
└──────────────────────────────────────────────────────────────┘
*/

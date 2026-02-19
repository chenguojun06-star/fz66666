-- 添加查看单价和金额的权限
-- 用于控制敏感财务数据的可见性

-- ========================================
-- 第1步：添加权限定义
-- ========================================

-- 检查权限是否已存在，避免重复插入
INSERT INTO t_permission (permission_code, permission_name, permission_type, parent_id, create_time)
SELECT 'FINANCE_PRICE_VIEW', '查看单价和金额', 'button', 4, NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM t_permission WHERE permission_code = 'FINANCE_PRICE_VIEW'
);

-- ========================================
-- 第2步：给管理类角色分配权限
-- ========================================

-- 给管理员、主管、采购员分配查看单价权限
INSERT INTO t_role_permission (role_id, permission_id, create_time)
SELECT r.id, p.id, NOW()
FROM t_role r
CROSS JOIN t_permission p
WHERE r.role_code IN ('admin', 'supervisor', 'purchaser')  -- 管理类角色
AND p.permission_code = 'FINANCE_PRICE_VIEW'
AND NOT EXISTS (
  SELECT 1 FROM t_role_permission rp
  WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

-- ========================================
-- 第3步：验证配置结果
-- ========================================

-- 查看权限是否添加成功
SELECT
  p.id,
  p.permission_code,
  p.permission_name,
  p.permission_type
FROM t_permission p
WHERE p.permission_code = 'FINANCE_PRICE_VIEW';

-- 查看哪些角色有查看单价权限
SELECT
  r.role_code,
  r.role_name,
  r.data_scope,
  p.permission_code,
  p.permission_name
FROM t_role r
INNER JOIN t_role_permission rp ON r.id = rp.role_id
INNER JOIN t_permission p ON rp.permission_id = p.id
WHERE p.permission_code = 'FINANCE_PRICE_VIEW'
ORDER BY r.role_code;

-- ========================================
-- 权限说明
-- ========================================

/*
角色权限分配规则：

1. ✅ 有权限（可以看到单价和金额）：
   - admin (管理员)         - 全局管理，需要查看所有财务数据
   - supervisor (主管)      - 部门管理，需要查看本部门成本
   - purchaser (采购员)     - 采购管理，需要查看采购单价

2. ❌ 无权限（单价/金额显示为 ***）：
   - cutter (裁剪员)        - 一线员工，只需知道工作量
   - sewing (车缝员)        - 一线员工，只需知道工作量
   - quality (质检员)       - 一线员工，只需知道工作量
   - packager (包装员)      - 一线员工，只需知道工作量
   - warehouse (仓管员)     - 一线员工，只需知道工作量

3. 扫码功能不受影响：
   - 后端照常保存单价和金额数据
   - 前端根据权限决定是否显示
   - 小程序端全部隐藏敏感信息
*/

-- ========================================
-- 回滚脚本（如需撤销，执行以下语句）
-- ========================================

/*
-- 删除角色权限关联
DELETE rp FROM t_role_permission rp
INNER JOIN t_permission p ON rp.permission_id = p.id
WHERE p.permission_code = 'FINANCE_PRICE_VIEW';

-- 删除权限定义
DELETE FROM t_permission
WHERE permission_code = 'FINANCE_PRICE_VIEW';
*/

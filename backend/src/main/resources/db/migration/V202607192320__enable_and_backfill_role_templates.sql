-- ============================================================
-- V202507192320: 职位模板启用 + 存量租户批量回填
--
-- 1. 启用被误设为 DISABLED 的 3 个职位模板（裁剪员/包装员/质检员）
-- 2. 为所有现有活跃租户批量克隆缺失的职位角色
-- 3. 为新克隆的零权限角色从模板复制权限
--
-- 注：full_admin 已在租户创建时自动克隆，本脚本只处理其他 8 个职位模板
-- ============================================================

-- Step 1: 启用 3 个被误设为 DISABLED 的职位模板
UPDATE t_role
SET    status      = 'active',
       update_time = NOW()
WHERE  id          IN (5, 7, 8)
  AND  is_template = 1
  AND  status      = 'DISABLED';

-- Step 2: 为所有现有活跃租户批量克隆缺失的职位角色模板
--   CROSS JOIN 枚举"所有活跃租户 × 所有活跃非 full_admin 模板"，
--   NOT EXISTS 子查询排除已有克隆，脚本可重复执行（幂等）
INSERT INTO t_role
    (role_name, role_code, description, status, data_scope,
     tenant_id, is_template, source_template_id, sort_order,
     create_time, update_time)
SELECT
    tmpl.role_name,
    tmpl.role_code,
    tmpl.description,
    'active',
    tmpl.data_scope,
    ten.id,
    0,
    tmpl.id,
    tmpl.sort_order,
    NOW(),
    NOW()
FROM   t_tenant  ten
CROSS JOIN t_role tmpl
WHERE  ten.status      = 'active'
  AND  tmpl.is_template  = 1
  AND  tmpl.status       = 'active'
  AND  tmpl.role_code   != 'full_admin'
  AND  NOT EXISTS (
           SELECT 1
           FROM   t_role r2
           WHERE  r2.tenant_id   = ten.id
             AND  r2.role_code   = tmpl.role_code
             AND  r2.is_template = 0
       );

-- Step 3: 为 Step 2 新建的零权限角色从对应模板复制权限
--   只处理无任何权限的克隆角色（保护已有自定义权限不被覆盖）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id,
       rp.permission_id
FROM   t_role           r
JOIN   t_role_permission rp ON rp.role_id = r.source_template_id
WHERE  r.is_template          = 0
  AND  r.tenant_id            IS NOT NULL
  AND  r.source_template_id   IS NOT NULL
  AND  r.role_code           != 'full_admin'
  AND  NOT EXISTS (
           SELECT 1
           FROM   t_role_permission rp2
           WHERE  rp2.role_id = r.id
       );

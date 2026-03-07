-- ============================================================
-- V20260323: 修复租户主账号 t_user.tenant_id 为 NULL 的数据异常
-- 问题根因：部分租户主账号（is_tenant_owner=1）的 tenant_id 字段
--           在 DB 中为 NULL，导致 TenantInterceptor 将其误判为
--           超级管理员，查询追加 "AND tenant_id IS NULL" → 返回 0 行
-- 修复逻辑：通过 t_tenant.owner_user_id 关联找到对应租户ID，
--           回填到 t_user.tenant_id
-- ============================================================

-- 1. 修复 is_tenant_owner=1 但 tenant_id IS NULL 的账号
--    通过 t_tenant.owner_user_id = t_user.id 关联回填
UPDATE t_user u
    INNER JOIN t_tenant t ON t.owner_user_id = u.id
SET u.tenant_id = t.id
WHERE u.tenant_id IS NULL
  AND u.is_tenant_owner = 1;

-- 2. 兜底：如果 t_tenant.owner_user_id 未设置，则通过用户名/手机号等
--    逻辑无法自动关联，仅记录日志供人工处理
--    （此 SELECT 仅用于记录，不影响数据）
-- SELECT u.id, u.username, u.name, '请手动设置 tenant_id'
-- FROM t_user u
-- WHERE u.tenant_id IS NULL AND u.is_tenant_owner = 1;

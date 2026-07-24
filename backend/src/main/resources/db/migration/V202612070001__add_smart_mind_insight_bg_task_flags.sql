-- =====================================================================
-- V202612070001__add_smart_mind_insight_bg_task_flags.sql
-- =====================================================================
-- 用途：为已有租户初始化新增的 3 个后端动作类智能开关，默认全部关闭。
--      遵循用户诉求"智能能力不要自动执行，让用户可以设置"。
--
-- 新增开关：
--   backend.action.auto_mind_push              生产智能提醒自动推送（微信/站内通知）
--   backend.action.auto_daily_insight_dispatch 每日洞察自动生成并派发协作任务
--   backend.action.auto_agent_background_task  AI 后台任务自动执行
--
-- 注意：
--   - 用 NOT EXISTS 子查询模式实现幂等（P0 #1）
--   - 已存在的开关记录不重复插入
--   - 仅初始化数据，不修改表结构
-- =====================================================================

INSERT INTO t_tenant_smart_feature (tenant_id, feature_key, enabled, create_time, update_time)
SELECT DISTINCT t.tenant_id, k.feature_key, 0, NOW(), NOW()
FROM (
    -- 取所有已存在智能开关记录的租户（说明已使用智能配置中心）
    SELECT DISTINCT tenant_id FROM t_tenant_smart_feature
    WHERE tenant_id IS NOT NULL
) t
CROSS JOIN (
    SELECT 'backend.action.auto_mind_push' AS feature_key UNION ALL
    SELECT 'backend.action.auto_daily_insight_dispatch' UNION ALL
    SELECT 'backend.action.auto_agent_background_task'
) k
WHERE NOT EXISTS (
    SELECT 1 FROM t_tenant_smart_feature f
    WHERE f.tenant_id = t.tenant_id AND f.feature_key = k.feature_key
);

-- 补充：对没有任何智能开关记录的活跃租户，也初始化这 3 个新开关
-- （从 t_tenant 表找活跃租户，避免遗漏新租户或未配置过的租户）
INSERT INTO t_tenant_smart_feature (tenant_id, feature_key, enabled, create_time, update_time)
SELECT t.id, k.feature_key, 0, NOW(), NOW()
FROM t_tenant t
CROSS JOIN (
    SELECT 'backend.action.auto_mind_push' AS feature_key UNION ALL
    SELECT 'backend.action.auto_daily_insight_dispatch' UNION ALL
    SELECT 'backend.action.auto_agent_background_task'
) k
WHERE t.id IS NOT NULL
  AND (t.status IS NULL OR (UPPER(t.status) NOT IN ('DISABLED', 'SUSPENDED')))
  AND NOT EXISTS (
    SELECT 1 FROM t_tenant_smart_feature f
    WHERE f.tenant_id = t.id AND f.feature_key = k.feature_key
  );

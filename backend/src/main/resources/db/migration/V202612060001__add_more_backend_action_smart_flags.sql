-- =====================================================================
-- V202612060001__add_more_backend_action_smart_flags.sql
-- =====================================================================
-- 用途：为已有租户初始化新增的 5 个后端动作类智能开关，默认全部关闭。
--      遵循用户诉求"智能能力不要自动执行，让用户可以设置"。
--
-- 新增开关：
--   backend.action.auto_patrol_exec            巡检自动执行（创建跟进任务+微信通知）
--   backend.action.auto_task_escalation        协作任务逾期自动升级
--   backend.action.auto_task_reminder          个人任务到期自动提醒
--   backend.action.auto_ec_stock_sync          电商库存自动同步到平台
--   backend.action.auto_high_severity_dispatch 高危巡检告警自动派发
--
-- 注意：
--   - 必须用 information_schema + NOT EXISTS 模式实现幂等（P0 #1）
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
    SELECT 'backend.action.auto_patrol_exec' AS feature_key UNION ALL
    SELECT 'backend.action.auto_task_escalation' UNION ALL
    SELECT 'backend.action.auto_task_reminder' UNION ALL
    SELECT 'backend.action.auto_ec_stock_sync' UNION ALL
    SELECT 'backend.action.auto_high_severity_dispatch'
) k
WHERE NOT EXISTS (
    SELECT 1 FROM t_tenant_smart_feature f
    WHERE f.tenant_id = t.tenant_id AND f.feature_key = k.feature_key
);

-- 补充：对没有任何智能开关记录的活跃租户，也初始化全部 12 个后端动作开关
-- （从 t_tenant 表找活跃租户，避免遗漏新租户或未配置过的租户）
INSERT INTO t_tenant_smart_feature (tenant_id, feature_key, enabled, create_time, update_time)
SELECT t.id, k.feature_key, 0, NOW(), NOW()
FROM t_tenant t
CROSS JOIN (
    SELECT 'backend.action.auto_price_sync' AS feature_key UNION ALL
    SELECT 'backend.action.auto_refund_approve' UNION ALL
    SELECT 'backend.action.auto_stock_delist' UNION ALL
    SELECT 'backend.action.auto_receivable_notify' UNION ALL
    SELECT 'backend.action.auto_worker_anomaly_notify' UNION ALL
    SELECT 'backend.action.auto_delivery_risk_notify' UNION ALL
    SELECT 'backend.action.auto_stagnant_notify' UNION ALL
    SELECT 'backend.action.auto_patrol_exec' UNION ALL
    SELECT 'backend.action.auto_task_escalation' UNION ALL
    SELECT 'backend.action.auto_task_reminder' UNION ALL
    SELECT 'backend.action.auto_ec_stock_sync' UNION ALL
    SELECT 'backend.action.auto_high_severity_dispatch'
) k
WHERE t.id IS NOT NULL
  AND (t.status IS NULL OR (UPPER(t.status) NOT IN ('DISABLED', 'SUSPENDED')))
  AND NOT EXISTS (
    SELECT 1 FROM t_tenant_smart_feature f
    WHERE f.tenant_id = t.id AND f.feature_key = k.feature_key
  );

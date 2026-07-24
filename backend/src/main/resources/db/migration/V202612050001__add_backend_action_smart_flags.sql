-- ============================================================
-- 扩展智能化配置中心：新增"后端动作类"开关
--
-- 背景：
--   现有 t_tenant_smart_feature 表已支持前端显示类开关（如 smart.guide.enabled）。
--   用户要求"智能能力不要自动执行，让用户可以设置"，
--   需新增后端动作类开关，控制自动改价/自动退款/自动下架/自动通知等"会触发实际操作"的智能能力。
--
-- 实现方式：
--   不新建表，直接复用 t_tenant_smart_feature 表（feature_key 字段支持任意字符串）。
--   本迁移仅为存量租户初始化"后端动作类"开关的默认值（全部关闭，符合"怕出现问题"的用户诉求）。
--
-- 多租户隔离（P0 铁律 4）：所有记录带 tenant_id
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 检查 + 动态 SQL
-- ============================================================

-- 后端动作类开关默认值（全部关闭）
-- 包含：
--   backend.action.auto_price_sync        — 自动改价同步到平台
--   backend.action.auto_refund_approve    — 退款自动审核通过
--   backend.action.auto_stock_delist      — 缺货自动下架
--   backend.action.auto_receivable_notify — 逾期应收自动通知
--   backend.action.auto_worker_anomaly_notify — 工人效率异常自动通知
--   backend.action.auto_delivery_risk_notify  — 交期风险自动通知
--   backend.action.auto_stagnant_notify   — 工序停滞自动通知

-- 为所有现有租户插入"后端动作类"开关（默认关闭）
-- 使用 INSERT ... SELECT ... WHERE NOT EXISTS 模式保证幂等
INSERT INTO t_tenant_smart_feature (tenant_id, feature_key, enabled, create_time, update_time)
SELECT DISTINCT t.tenant_id, k.feature_key, 0, NOW(), NOW()
FROM (
    SELECT DISTINCT tenant_id FROM t_tenant_smart_feature
    WHERE tenant_id IS NOT NULL
) t
CROSS JOIN (
    SELECT 'backend.action.auto_price_sync' AS feature_key UNION ALL
    SELECT 'backend.action.auto_refund_approve' UNION ALL
    SELECT 'backend.action.auto_stock_delist' UNION ALL
    SELECT 'backend.action.auto_receivable_notify' UNION ALL
    SELECT 'backend.action.auto_worker_anomaly_notify' UNION ALL
    SELECT 'backend.action.auto_delivery_risk_notify' UNION ALL
    SELECT 'backend.action.auto_stagnant_notify'
) k
WHERE NOT EXISTS (
    SELECT 1 FROM t_tenant_smart_feature f
    WHERE f.tenant_id = t.tenant_id AND f.feature_key = k.feature_key
);

-- 为没有 t_tenant_smart_feature 记录的租户也初始化（从 t_user 表获取租户列表）
INSERT INTO t_tenant_smart_feature (tenant_id, feature_key, enabled, create_time, update_time)
SELECT DISTINCT u.tenant_id, k.feature_key, 0, NOW(), NOW()
FROM t_user u
CROSS JOIN (
    SELECT 'backend.action.auto_price_sync' AS feature_key UNION ALL
    SELECT 'backend.action.auto_refund_approve' UNION ALL
    SELECT 'backend.action.auto_stock_delist' UNION ALL
    SELECT 'backend.action.auto_receivable_notify' UNION ALL
    SELECT 'backend.action.auto_worker_anomaly_notify' UNION ALL
    SELECT 'backend.action.auto_delivery_risk_notify' UNION ALL
    SELECT 'backend.action.auto_stagnant_notify'
) k
WHERE u.tenant_id IS NOT NULL
  AND u.tenant_id > 0
  AND NOT EXISTS (
    SELECT 1 FROM t_tenant_smart_feature f
    WHERE f.tenant_id = u.tenant_id AND f.feature_key = k.feature_key
);

-- 添加索引便于按 feature_key 查询（如果不存在则创建）
SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_smart_feature'
    AND INDEX_NAME='idx_tenant_feature_key');
SET @s_idx = IF(@idx_exists=0,
    'CREATE INDEX idx_tenant_feature_key ON t_tenant_smart_feature (tenant_id, feature_key)',
    'SELECT 1');
PREPARE stmt_idx FROM @s_idx; EXECUTE stmt_idx; DEALLOCATE PREPARE stmt_idx;

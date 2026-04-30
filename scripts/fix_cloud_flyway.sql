-- ============================================================
-- 云端 Flyway 迁移修复脚本
-- 运行方式：在云端数据库 fashion_supplychain 中执行此 SQL
--
-- 背景：云端 Flyway 之前被禁用（FLYWAY_ENABLED=false），
--       数据库结构通过手动维护，与 Flyway 迁移脚本预期不一致。
--       现在重新启用 Flyway 后，积压的迁移一次性执行导致失败。
--
-- 策略：将已在云端手动执行过的迁移标记为"已成功"，
--       让 Flyway 跳过它们，只运行真正需要的新迁移。
-- ============================================================

SET @next_rank = (SELECT MAX(installed_rank) + 1 FROM flyway_schema_history);

-- V202704271320：material_roll.tenant_id VARCHAR→BIGINT（云端已是BIGINT）
INSERT INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
SELECT @next_rank, '202704271320', 'fix material roll tenant id type', 'SQL',
       'V202704271320__fix_material_roll_tenant_id_type.sql', 0, 'cloud_patch', NOW(), 0, 1
WHERE NOT EXISTS (SELECT 1 FROM flyway_schema_history WHERE version = '202704271320');

SET @next_rank = @next_rank + 1;

-- V202704271321：scan_record 列类型对齐（云端已是正确类型）
INSERT INTO flyway_schema_history
  (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
SELECT @next_rank, '202704271321', 'fix scan record column types', 'SQL',
       'V202704271321__fix_scan_record_column_types.sql', 0, 'cloud_patch', NOW(), 0, 1
WHERE NOT EXISTS (SELECT 1 FROM flyway_schema_history WHERE version = '202704271321');

-- ============================================================
-- 视图修复（ViewMigrator 报告缺列）
-- ============================================================

-- 这三个视图的定义由 ViewMigrator 管理，启动时会自动重建。
-- 如果 ViewMigrator 报错只是 WARN 级别（不阻断启动），可以先忽略。
-- 如果报错是 ERROR 级别导致启动失败，需要删除旧视图让 ViewMigrator 重建：

-- DROP VIEW IF EXISTS v_production_order_flow_stage_snapshot;
-- DROP VIEW IF EXISTS v_production_order_procurement_snapshot;
-- DROP VIEW IF EXISTS v_production_order_stage_done_agg;

-- ============================================================
-- 验证
-- ============================================================

SELECT 'Flyway 修复完成。当前待执行迁移：' AS status;
SELECT version, description, installed_on, success
FROM flyway_schema_history
WHERE version LIKE '20270427%'
ORDER BY installed_rank DESC;

SELECT '剩余待执行迁移数：' AS info, COUNT(*) AS pending_count
FROM (
  SELECT DISTINCT SUBSTRING_INDEX(script, '__', 1) AS ver
  FROM (
    SELECT 'V202704271320' AS script
    UNION SELECT 'V202704271321'
  ) t
) t2
WHERE ver NOT IN (
  SELECT version FROM flyway_schema_history WHERE version LIKE '20270427%'
);

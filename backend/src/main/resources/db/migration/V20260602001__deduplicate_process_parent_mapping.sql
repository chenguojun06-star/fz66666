-- ============================================================
-- 清理 t_process_parent_mapping 中 tenant_id=NULL 下的重复数据
--
-- 根因：2026-05-10 期间通过 docker exec 手动插入了两次
--       V202605101000 迁移文件中的 15 条数据（车缝12+尾部2+二次工艺1），
--       但该迁移文件没有走 Flyway 通道，导致 flyway_schema_history
--       中没有记录，新部署时还会再次执行（与历史数据叠加）。
--
-- 修复：删除 id 268-280（第二次插入的 13 条），保留 id 253-267（首次插入）。
--       后续新部署执行 V202605101000 时不会冲突（INSERT IGNORE 唯一键约束）。
--
-- 数据影响：仅删除冗余数据，ProcessParentMappingService 缓存层用 Map 去重，
--           业务功能完全不变。
-- ============================================================

-- 备份核对：执行前应只匹配 13 条（id 268-280）
-- SELECT id, process_keyword, parent_node, tenant_id
-- FROM t_process_parent_mapping
-- WHERE id BETWEEN 268 AND 280
-- ORDER BY id;

DELETE FROM t_process_parent_mapping
WHERE id BETWEEN 268 AND 280;

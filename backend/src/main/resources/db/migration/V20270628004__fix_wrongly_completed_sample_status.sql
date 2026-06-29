-- 修复历史脏数据：样衣生产还在进行中但样衣状态被错误标记为已完成
-- 根因：PatternStatusHelper.syncStyleInfoSampleStage 旧逻辑在 PatternProduction 状态变为
--       PRODUCTION_COMPLETED / COMPLETED / WAREHOUSE_OUT 时，错误地把 StyleInfo.sample_status
--       设为 'COMPLETED'，导致款号从前端活跃列表（activeStyles）消失。
-- 修复：PatternProduction 完成只代表"样板制作"完成，不等于整个样衣开发流程完成。
--       把 PatternProduction 仍在 PENDING/IN_PROGRESS 的款号 sample_status 改回 PRODUCTION_COMPLETED。
-- 注意：UPDATE 本身幂等，可重复执行；只修复 PatternProduction 仍在进行中的明显错误数据。
--       其他被错误标记的款号（PatternProduction 已完成但样衣开发流程未完成）由用户通过前端"维护"功能重置。

UPDATE t_style_info si
INNER JOIN t_pattern_production pp
    ON pp.style_id = si.id
    AND pp.tenant_id = si.tenant_id
SET si.sample_status = 'PRODUCTION_COMPLETED',
    si.sample_completed_time = NULL,
    si.update_time = NOW()
WHERE si.sample_status = 'COMPLETED'
  AND si.delete_flag = 0
  AND pp.status IN ('PENDING', 'IN_PROGRESS')
  AND pp.delete_flag = 0;

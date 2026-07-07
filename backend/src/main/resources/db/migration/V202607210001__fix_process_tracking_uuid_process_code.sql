-- 修复 t_production_process_tracking.process_code 被错误写入 UUID 的问题
-- 根因：TrackingRecordInitHelper 之前用 node.id（前端工艺流程编辑器生成的 UUID）作为 processCode
-- 影响：前端工序跟踪表格"工序"列显示为 "e4aa4f39240a25aabefad26f5a4c3518 裁剪" 这样的乱码
-- 修复：将 UUID 格式的 process_code 回填为 process_name
-- 幂等：只影响 process_code 仍是 UUID 格式的记录，重复执行无副作用
UPDATE t_production_process_tracking
SET process_code = process_name,
    updated_at = NOW()
WHERE process_name IS NOT NULL
  AND process_name != ''
  AND (process_code REGEXP '^[0-9a-f]{32}$'
       OR process_code REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

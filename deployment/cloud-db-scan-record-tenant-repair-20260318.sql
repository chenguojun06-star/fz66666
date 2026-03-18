-- 云端扫码记录租户归属排查/修复脚本（2026-03-18）
-- 用途：定位并修复 t_scan_record 中 tenant_id 为空的历史脏数据。
-- 原则：优先按 order_id 回填；order_id 缺失时再按 order_no 回填；执行前先看明细，确认无误后再执行 UPDATE。

-- 1) 当前异常总量
SELECT COUNT(*) AS null_tenant_count
FROM t_scan_record
WHERE tenant_id IS NULL;

SELECT COUNT(*) AS zero_tenant_count
FROM t_scan_record
WHERE tenant_id = 0;

-- 2) 查看异常明细（前 50 条）
SELECT id,
       request_id,
       order_id,
       order_no,
       style_no,
       scan_type,
       process_code,
       progress_stage,
       operator_id,
       operator_name,
       scan_time,
       create_time,
       tenant_id
FROM t_scan_record
WHERE tenant_id IS NULL
ORDER BY create_time DESC
LIMIT 50;

-- 3) 按 order_id 预览可回填的租户归属
SELECT sr.id,
       sr.order_id,
       sr.order_no,
       sr.request_id,
       po.tenant_id AS should_fill_tenant_id
FROM t_scan_record sr
JOIN t_production_order po ON po.id = sr.order_id
WHERE sr.tenant_id IS NULL
  AND po.tenant_id IS NOT NULL
ORDER BY sr.create_time DESC;

-- 4) 按 order_no 预览可回填的租户归属（仅用于 order_id 为空或失配场景）
SELECT sr.id,
       sr.order_id,
       sr.order_no,
       sr.request_id,
       po.tenant_id AS should_fill_tenant_id
FROM t_scan_record sr
JOIN t_production_order po ON po.order_no = sr.order_no
WHERE sr.tenant_id IS NULL
  AND (sr.order_id IS NULL OR sr.order_id = '')
  AND po.tenant_id IS NOT NULL
ORDER BY sr.create_time DESC;

-- 5) 修复步骤 A：优先按 order_id 回填
UPDATE t_scan_record sr
JOIN t_production_order po ON po.id = sr.order_id
SET sr.tenant_id = po.tenant_id
WHERE sr.tenant_id IS NULL
  AND po.tenant_id IS NOT NULL;

-- 6) 修复步骤 B：仍未回填的，再按 order_no 回填
UPDATE t_scan_record sr
JOIN t_production_order po ON po.order_no = sr.order_no
SET sr.tenant_id = po.tenant_id
WHERE sr.tenant_id IS NULL
  AND (sr.order_id IS NULL OR sr.order_id = '')
  AND po.tenant_id IS NOT NULL;

-- 7) 修复后复核
SELECT COUNT(*) AS remaining_null_tenant_count
FROM t_scan_record
WHERE tenant_id IS NULL;

SELECT COUNT(*) AS remaining_zero_tenant_count
FROM t_scan_record
WHERE tenant_id = 0;

-- 8) 如仍有残留，继续人工定位这些无法按订单自动归属的记录
SELECT id,
       request_id,
       order_id,
       order_no,
       style_no,
       scan_type,
       process_code,
       progress_stage,
       operator_id,
       operator_name,
       scan_time,
       create_time
FROM t_scan_record
WHERE tenant_id IS NULL
ORDER BY create_time DESC;
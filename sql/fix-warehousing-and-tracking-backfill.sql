-- ============================================================================
-- 入库扫码记录补录 + 工序跟踪状态修复
-- 目标：修复历史数据中缺失的入库扫码记录 和 未更新的工序跟踪（入库/整烫等）
-- 执行环境：云端数据库（微信云托管控制台）
-- 创建时间：2026-03-01
-- ============================================================================
-- 注意事项：
-- 1. 建议在执行前先备份，或在事务中执行后检查结果
-- 2. t_production_process_tracking 使用 utf8mb4_unicode_ci
--    t_scan_record / t_product_warehousing 使用 utf8mb4_0900_ai_ci
--    跨表 JOIN 字符串列需要 COLLATE utf8mb4_unicode_ci

-- ============================================================================
-- 第1步：诊断 — 查看当前缺失情况（先执行此步确认需要修复的数据量）
-- ============================================================================

-- 1a. 查看入库记录中缺少对应扫码记录的数量
SELECT '缺少入库扫码记录的入库单' AS 诊断项,
       COUNT(*) AS 数量
FROM t_product_warehousing pw
WHERE pw.delete_flag = 0
  AND pw.qualified_quantity > 0
  AND pw.cutting_bundle_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM t_scan_record sr
    WHERE sr.cutting_bundle_id = pw.cutting_bundle_id
      AND sr.scan_type = 'warehouse'
      AND sr.process_code = 'warehouse'
  );

-- 1b. 查看工序跟踪中有扫码记录但状态仍为 pending 的数量（整烫/入库等）
SELECT '有扫码但跟踪仍pending的工序' AS 诊断项,
       ppt.process_code AS 工序,
       COUNT(*) AS 数量
FROM t_production_process_tracking ppt
WHERE ppt.scan_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM t_scan_record sr
    WHERE sr.cutting_bundle_id COLLATE utf8mb4_unicode_ci = ppt.cutting_bundle_id
      AND sr.scan_result = 'success'
      AND (
        sr.process_code COLLATE utf8mb4_unicode_ci = ppt.process_code
        OR sr.process_name COLLATE utf8mb4_unicode_ci = ppt.process_code
        OR sr.progress_stage COLLATE utf8mb4_unicode_ci = ppt.process_code
        OR sr.process_name COLLATE utf8mb4_unicode_ci = ppt.process_name
      )
  )
GROUP BY ppt.process_code;


-- ============================================================================
-- 第2步：补录入库扫码记录（从 t_product_warehousing → t_scan_record）
-- 仅补录 cutting_bundle_id 非空且无已有 warehouse 扫码记录的入库单
-- ============================================================================

INSERT INTO t_scan_record (
    id, request_id, scan_code,
    order_id, order_no, style_id, style_no,
    color, size, quantity,
    process_code, progress_stage, process_name,
    operator_id, operator_name,
    scan_time, scan_type, scan_result,
    remark,
    cutting_bundle_id, cutting_bundle_no, cutting_bundle_qr_code,
    tenant_id, create_time
)
SELECT
    REPLACE(UUID(), '-', ''),                           -- id (UUID)
    CONCAT('BACKFILL_WH:', pw.id),                      -- request_id (防重复)
    pw.cutting_bundle_qr_code,                           -- scan_code
    pw.order_id,                                         -- order_id
    pw.order_no,                                         -- order_no
    pw.style_id,                                         -- style_id
    pw.style_no,                                         -- style_no
    NULL,                                                -- color
    NULL,                                                -- size
    pw.qualified_quantity,                                -- quantity (合格数量)
    'warehouse',                                         -- process_code
    '入库',                                               -- progress_stage
    '仓库入库',                                            -- process_name
    pw.warehousing_operator_id,                          -- operator_id
    pw.warehousing_operator_name,                        -- operator_name
    COALESCE(pw.warehousing_end_time, pw.create_time),   -- scan_time (优先用结束时间)
    'warehouse',                                         -- scan_type
    'success',                                           -- scan_result
    CONCAT('仓库入库: ', COALESCE(pw.warehouse, '默认仓库'), ' [历史数据补录]'),
    pw.cutting_bundle_id,                                -- cutting_bundle_id
    pw.cutting_bundle_no,                                -- cutting_bundle_no
    pw.cutting_bundle_qr_code,                           -- cutting_bundle_qr_code
    pw.tenant_id,                                        -- tenant_id
    NOW()                                                -- create_time
FROM t_product_warehousing pw
WHERE pw.delete_flag = 0
  AND pw.qualified_quantity > 0
  AND pw.cutting_bundle_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM t_scan_record sr
    WHERE sr.cutting_bundle_id = pw.cutting_bundle_id
      AND sr.scan_type = 'warehouse'
      AND sr.process_code = 'warehouse'
  );

-- 预期输出: Query OK, N rows affected （N = 缺失的入库记录数）


-- ============================================================================
-- 第3步：更新入库工序跟踪记录
-- 将已有入库扫码记录的 tracking 从 pending → scanned
-- ============================================================================

UPDATE t_production_process_tracking ppt
INNER JOIN (
    SELECT sr.cutting_bundle_id,
           sr.id AS scan_record_id,
           sr.scan_time,
           sr.operator_id,
           sr.operator_name
    FROM t_scan_record sr
    WHERE sr.scan_type = 'warehouse'
      AND sr.scan_result = 'success'
      AND sr.cutting_bundle_id IS NOT NULL
) latest_sr ON latest_sr.cutting_bundle_id COLLATE utf8mb4_unicode_ci = ppt.cutting_bundle_id
SET ppt.scan_status = 'scanned',
    ppt.scan_time = latest_sr.scan_time,
    ppt.scan_record_id = latest_sr.scan_record_id,
    ppt.operator_id = latest_sr.operator_id,
    ppt.operator_name = latest_sr.operator_name
WHERE (ppt.process_code = '入库' OR ppt.process_name = '入库')
  AND ppt.scan_status = 'pending';

-- 预期输出: Query OK, N rows affected


-- ============================================================================
-- 第4步：修复生产类工序跟踪（整烫、剪线、包装、车缝等所有 pending 但有扫码的）
-- 匹配策略：scan_record 的 process_code/process_name/progress_stage 与 tracking 的 
--           process_code/process_name 匹配
-- ============================================================================

-- 4a. 创建临时表：找到每个 (bundleId + 工序) 的最新扫码记录
CREATE TEMPORARY TABLE tmp_latest_scan AS
SELECT
    ppt.id AS tracking_id,
    sr.id AS scan_record_id,
    sr.scan_time,
    sr.operator_id,
    sr.operator_name
FROM t_production_process_tracking ppt
INNER JOIN t_scan_record sr ON sr.cutting_bundle_id COLLATE utf8mb4_unicode_ci = ppt.cutting_bundle_id
  AND sr.scan_result = 'success'
  AND (
    -- 策略1: process_code 精确匹配
    sr.process_code COLLATE utf8mb4_unicode_ci = ppt.process_code
    -- 策略2: process_name 匹配 tracking 的 process_code
    OR sr.process_name COLLATE utf8mb4_unicode_ci = ppt.process_code
    -- 策略3: progress_stage 匹配 tracking 的 process_code（如 progress_stage='整烫'）
    OR sr.progress_stage COLLATE utf8mb4_unicode_ci = ppt.process_code
    -- 策略4: process_name 互相匹配
    OR sr.process_name COLLATE utf8mb4_unicode_ci = ppt.process_name
  )
WHERE ppt.scan_status = 'pending'
  -- 排除入库（已在第3步处理）
  AND ppt.process_code != '入库'
  AND ppt.process_name != '入库';

-- 如果一个 tracking_id 匹配到多条扫码记录，保留最新的一条
CREATE TEMPORARY TABLE tmp_best_scan AS
SELECT tracking_id,
       scan_record_id,
       scan_time,
       operator_id,
       operator_name
FROM (
    SELECT tracking_id, scan_record_id, scan_time, operator_id, operator_name,
           ROW_NUMBER() OVER (PARTITION BY tracking_id ORDER BY scan_time DESC) AS rn
    FROM tmp_latest_scan
) ranked
WHERE rn = 1;

-- 4b. 执行更新
UPDATE t_production_process_tracking ppt
INNER JOIN tmp_best_scan bs ON bs.tracking_id = ppt.id
SET ppt.scan_status = 'scanned',
    ppt.scan_time = bs.scan_time,
    ppt.scan_record_id = bs.scan_record_id,
    ppt.operator_id = bs.operator_id,
    ppt.operator_name = bs.operator_name;

-- 预期输出: Query OK, N rows affected（N = 整烫/剪线/包装等被修复的数量）

-- 4c. 清理临时表
DROP TEMPORARY TABLE IF EXISTS tmp_latest_scan;
DROP TEMPORARY TABLE IF EXISTS tmp_best_scan;


-- ============================================================================
-- 第5步：验证结果
-- ============================================================================

-- 5a. 检查是否还有缺失的入库扫码记录
SELECT '修复后仍缺少入库扫码记录' AS 检查项,
       COUNT(*) AS 数量
FROM t_product_warehousing pw
WHERE pw.delete_flag = 0
  AND pw.qualified_quantity > 0
  AND pw.cutting_bundle_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM t_scan_record sr
    WHERE sr.cutting_bundle_id = pw.cutting_bundle_id
      AND sr.scan_type = 'warehouse'
      AND sr.process_code = 'warehouse'
  );

-- 5b. 查看还有哪些工序跟踪仍为 pending
SELECT '仍为pending的工序跟踪' AS 检查项,
       ppt.process_code AS 工序,
       ppt.scan_status AS 状态,
       COUNT(*) AS 数量
FROM t_production_process_tracking ppt
GROUP BY ppt.process_code, ppt.scan_status
ORDER BY ppt.process_code;

-- 5c. 检查入库扫码记录分布
SELECT '入库扫码记录统计' AS 检查项,
       sr.scan_type, sr.progress_stage, sr.process_code, COUNT(*) AS 数量
FROM t_scan_record sr
WHERE sr.scan_type = 'warehouse'
GROUP BY sr.scan_type, sr.progress_stage, sr.process_code;

-- ============================================================
-- 修复 t_scan_record.progress_stage 历史脏数据
-- 将非标准子工序名/旧写法统一映射到标准父工序名
-- 执行时间：2026-03-03
-- ⚠️ 云端需手动在微信云托管控制台 SQL 面板执行
-- ============================================================

-- 质检系列（最多）
UPDATE t_scan_record SET progress_stage = '质检'
WHERE progress_stage IN ('质检领取','质检验收','质检确认','质检收货');

-- 入库系列
UPDATE t_scan_record SET progress_stage = '入库'
WHERE progress_stage IN ('仓库入库','成品入库');

-- 二次工艺子工序
UPDATE t_scan_record SET progress_stage = '二次工艺'
WHERE progress_stage IN ('绣花','印花','烟洗','压花','洗水');

-- 尾部子工序（剪线/整烫/包装/辅料 → 尾部）
UPDATE t_scan_record SET progress_stage = '尾部'
WHERE progress_stage IN ('剪线','整烫','包装','辅料');

-- 无效业务动作（下单/裁剪退回等，quantity=0，置空）
UPDATE t_scan_record SET progress_stage = NULL
WHERE progress_stage = '下单';

-- 其余非标准值（数量=0 的审计记录，兜底置空）
UPDATE t_scan_record SET progress_stage = NULL
WHERE progress_stage NOT IN ('采购','裁剪','二次工艺','车缝','尾部','质检','入库')
  AND progress_stage IS NOT NULL
  AND quantity = 0;

-- 核查剩余非标准值（执行后应返回空结果）
SELECT progress_stage, COUNT(*) AS cnt
FROM t_scan_record
WHERE progress_stage NOT IN ('采购','裁剪','二次工艺','车缝','尾部','质检','入库')
  AND progress_stage IS NOT NULL
GROUP BY progress_stage
ORDER BY cnt DESC;

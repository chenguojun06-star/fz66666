-- ============================================================
-- 数据迁移：将旧扫码记录 progress_stage 修正为6父节点模型
-- 6个父进度节点：采购, 裁剪, 二次工艺, 车缝, 尾部, 入库
-- 大烫/整烫/质检/剪线/包装/尾工 → 全部归入「尾部」
-- 执行前请先备份:
--   docker exec fashion-mysql-simple mysqldump -uroot -pchangeme fashion_supplychain t_scan_record > backup_scan_record_$(date +%Y%m%d).sql
-- ============================================================

-- 1) 旧英文 key → 中文父节点（生产扫码记录）
UPDATE t_scan_record
SET progress_stage = '车缝'
WHERE scan_type = 'production'
  AND progress_stage IN ('carSewing', 'car_sewing')
  AND progress_stage NOT IN ('采购', '裁剪', '二次工艺', '车缝', '尾部', '入库');

UPDATE t_scan_record
SET progress_stage = '二次工艺'
WHERE scan_type = 'production'
  AND progress_stage IN ('secondaryProcess', 'secondary_process')
  AND progress_stage NOT IN ('采购', '裁剪', '二次工艺', '车缝', '尾部', '入库');

-- 2) 所有「尾部」子节点 → 统一为「尾部」
UPDATE t_scan_record
SET progress_stage = '尾部'
WHERE scan_type = 'production'
  AND (
    progress_stage IN ('ironing', 'packaging', 'tailProcess', 'tail_process', '大烫', '整烫', '包装', '剪线', '尾工', '质检')
    OR progress_stage LIKE '%尾部%'
    OR progress_stage LIKE '%大烫%'
    OR progress_stage LIKE '%整烫%'
    OR progress_stage LIKE '%包装%'
    OR progress_stage LIKE '%剪线%'
    OR progress_stage LIKE '%尾工%'
  )
  AND progress_stage NOT IN ('采购', '裁剪', '二次工艺', '车缝', '尾部', '入库');

-- 3) 验证：统计各 progress_stage 分布（执行完上面3条后运行）
SELECT progress_stage, COUNT(*) AS cnt
FROM t_scan_record
WHERE scan_type = 'production'
GROUP BY progress_stage
ORDER BY cnt DESC;

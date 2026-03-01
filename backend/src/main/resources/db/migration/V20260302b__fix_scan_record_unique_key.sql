-- ========================================================================
-- 修复扫码记录唯一键：加入 process_code（子工序名）
--
-- 原来唯一键：(cutting_bundle_id, scan_type, progress_stage)
-- 问题：动态映射后，剪线/质检/整烫 都映射到父节点'尾部'，
--       同一菲号多个子工序扫码会因 progress_stage 都是'尾部'而冲突
-- 修复：唯一键改为 (cutting_bundle_id, scan_type, process_code)
--       这样同一菲号的不同子工序可以各自独立记录
-- ========================================================================

-- 删除旧唯一键（两个同结构的冗余键）
ALTER TABLE t_scan_record DROP INDEX uk_bundle_stage;
ALTER TABLE t_scan_record DROP INDEX uk_bundle_stage_progress;

-- 新建唯一键：按子工序名去重（而非父节点名）
ALTER TABLE t_scan_record ADD UNIQUE KEY uk_bundle_process (cutting_bundle_id, scan_type, process_code);

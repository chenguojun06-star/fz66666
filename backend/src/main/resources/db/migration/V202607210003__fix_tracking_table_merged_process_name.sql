-- 修复 t_production_process_tracking 表中残留的"剪线大烫包装"记录
-- 根因：V202607210002 只修复了 progress_workflow_json，但 tracking 表的 process_name 是独立存储的
-- 修复：直接清理 tracking 表中"剪线大烫包装"相关记录
-- 幂等：只影响 process_name 含"剪线大烫包装"的记录

-- 步骤1：删除待扫码的"剪线大烫包装"记录（待扫码的没扫描数据，直接删）
DELETE FROM t_production_process_tracking WHERE process_name = '剪线大烫包装' AND scan_status = 'pending';

-- 步骤2：已扫码的"剪线大烫包装"记录重命名为"剪线"（保留扫描和工资数据）
UPDATE t_production_process_tracking SET process_name = '剪线', process_code = '剪线', updated_at = NOW() WHERE process_name = '剪线大烫包装' AND scan_status = 'scanned';

-- 步骤3：扫描全表，找出所有包含合并名称的记录（名称含2+个标准工序关键词），记录到告警日志
-- 这里只做查询，不做自动修改，避免误伤
-- SELECT id, production_order_no, process_name, scan_status FROM t_production_process_tracking
-- WHERE process_name LIKE '%剪线%' AND process_name LIKE '%大烫%'
--    OR process_name LIKE '%剪线%' AND process_name LIKE '%包装%'
--    OR process_name LIKE '%大烫%' AND process_name LIKE '%包装%';

-- 修复 progressWorkflowJson 中"剪线大烫包装"合并名称节点
-- 根因：用户在编辑器手动输入合并名称，且错误归到"二次工艺"阶段
-- 修复：将"剪线大烫包装"节点替换为3个独立节点（剪线/大烫/包装），都归到"尾部"阶段
-- 幂等：只影响 progress_workflow_json 含"剪线大烫包装"的订单，已修复则跳过

-- 步骤1：把"剪线大烫包装"节点（无论原stage是二次工艺还是尾部）替换为3个独立节点
-- 利用 REPLACE 字符串替换 + JSON 数组结构
UPDATE t_production_order
SET progress_workflow_json = REPLACE(
    REPLACE(
        progress_workflow_json,
        '{"id":"剪线大烫包装","name":"剪线大烫包装","progressStage":"二次工艺"',
        '{"id":"剪线","name":"剪线","progressStage":"尾部"'
    ),
    '{"id":"剪线大烫包装","name":"剪线大烫包装","progressStage":"尾部"',
    '{"id":"剪线","name":"剪线","progressStage":"尾部"'
)
WHERE progress_workflow_json LIKE '%剪线大烫包装%';

-- 步骤2：同步更新 processesByNode 分组（如果JSON里有的话）
-- 把"二次工艺"分组下的"剪线大烫包装"移到"尾部"分组
-- 注：processesByNode 是冗余字段，前端会重新计算，这里做简单清理
UPDATE t_production_order
SET progress_workflow_json = REPLACE(
    progress_workflow_json,
    '"二次工艺":[{"id":"剪线大烫包装","name":"剪线大烫包装","progressStage":"二次工艺"',
    '"尾部":[{"id":"剪线","name":"剪线","progressStage":"尾部"'
)
WHERE progress_workflow_json LIKE '%"二次工艺":[{"id":"剪线大烫包装"%';

-- 步骤3：删除"剪线大烫包装"相关的待扫码跟踪记录（已扫码的保留，避免丢工资数据）
-- 删除后，用户下次打开订单详情页时，TrackingRecordInitHelper 会根据修正后的JSON重新生成
DELETE FROM t_production_process_tracking WHERE process_name = '剪线大烫包装' AND scan_status = 'pending';

-- 步骤4：把已扫码的"剪线大烫包装"记录重命名为"剪线"（保留扫描和工资数据）
UPDATE t_production_process_tracking
SET process_name = '剪线',
    process_code = '剪线',
    updated_at = NOW()
WHERE process_name = '剪线大烫包装'
  AND scan_status = 'scanned';

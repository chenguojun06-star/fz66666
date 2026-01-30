-- 给多码单价表添加进度节点字段
-- 2026-01-30

-- 添加 progress_stage 列
ALTER TABLE t_style_size_price
ADD COLUMN progress_stage VARCHAR(100) NULL COMMENT '进度节点' AFTER process_name;

-- 更新现有数据：从工序表中获取进度节点（如果有的话）
UPDATE t_style_size_price sp
LEFT JOIN t_style_process p ON sp.style_id = p.style_id AND sp.process_code = p.process_code
SET sp.progress_stage = p.progress_stage
WHERE sp.progress_stage IS NULL AND p.progress_stage IS NOT NULL;

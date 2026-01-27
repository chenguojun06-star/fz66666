-- 为 t_style_process 表添加 progress_stage 字段
-- 用于标记工序属于哪个进度节点（采购、裁剪、车缝、尾部、入库）

-- 添加字段
ALTER TABLE t_style_process
ADD COLUMN progress_stage VARCHAR(50) DEFAULT NULL COMMENT '进度节点（采购/裁剪/车缝/尾部/入库）' AFTER process_name;

-- 为现有数据设置默认值（假设现有工序都属于车缝节点）
UPDATE t_style_process
SET progress_stage = '车缝'
WHERE progress_stage IS NULL;

-- 添加索引以提升查询性能
CREATE INDEX idx_progress_stage ON t_style_process(progress_stage);

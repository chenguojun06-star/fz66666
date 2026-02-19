-- 为样衣开发相关表添加领取人、开始时间、完成时间字段
-- 执行日期: 2026-01-28
-- 描述: 支持BOM、尺寸、工序表的任务追踪

USE fashion_supplychain;

-- 1. BOM物料清单表 t_style_bom
ALTER TABLE t_style_bom
ADD COLUMN assignee VARCHAR(100) COMMENT '领取人' AFTER specifications,
ADD COLUMN start_time DATETIME COMMENT '开始时间' AFTER assignee,
ADD COLUMN completed_time DATETIME COMMENT '完成时间' AFTER start_time;

-- 2. 尺寸表 t_style_size
ALTER TABLE t_style_size
ADD COLUMN assignee VARCHAR(100) COMMENT '领取人' AFTER size_value,
ADD COLUMN start_time DATETIME COMMENT '开始时间' AFTER assignee,
ADD COLUMN completed_time DATETIME COMMENT '完成时间' AFTER start_time;

-- 3. 工序表 t_style_process
ALTER TABLE t_style_process
ADD COLUMN assignee VARCHAR(100) COMMENT '领取人' AFTER description,
ADD COLUMN start_time DATETIME COMMENT '开始时间' AFTER assignee,
ADD COLUMN completed_time DATETIME COMMENT '完成时间' AFTER start_time;

-- 验证
SELECT '=== BOM表字段 ===' as info;
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_style_bom'
  AND COLUMN_NAME IN ('assignee', 'start_time', 'completed_time');

SELECT '=== 尺寸表字段 ===' as info;
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_style_size'
  AND COLUMN_NAME IN ('assignee', 'start_time', 'completed_time');

SELECT '=== 工序表字段 ===' as info;
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_style_process'
  AND COLUMN_NAME IN ('assignee', 'start_time', 'completed_time');

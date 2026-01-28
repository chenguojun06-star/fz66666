-- 为 t_style_info 表添加 size_color_config 字段
-- 用于存储样板的尺码、颜色、数量配置信息（JSON格式）
-- 创建日期：2026-01-28

USE fashion_supplychain;

-- 添加 size_color_config 字段
ALTER TABLE t_style_info
ADD COLUMN size_color_config TEXT COMMENT '码数颜色配置（JSON格式，包含sizes/colors/quantities/commonSizes/commonColors）';

-- 验证字段是否添加成功
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_style_info'
  AND COLUMN_NAME = 'size_color_config';

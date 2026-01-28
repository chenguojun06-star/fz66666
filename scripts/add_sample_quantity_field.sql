-- 为样衣信息表添加样板数字段
-- 创建时间：2026-01-28

USE fashion_supplychain;

-- 添加样板数字段
ALTER TABLE t_style_info
ADD COLUMN sample_quantity INT DEFAULT 0 COMMENT '样板数'
AFTER size;

-- 验证字段是否添加成功
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_style_info'
  AND COLUMN_NAME = 'sample_quantity';

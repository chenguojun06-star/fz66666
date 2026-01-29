-- 为报价单表添加锁定状态字段
-- 日期: 2026-01-30
-- 目的: 保存报价单后自动锁定，再次打开时保持锁定状态

USE fashion_supplychain;

-- 添加 is_locked 字段
ALTER TABLE t_style_quotation
ADD COLUMN is_locked TINYINT DEFAULT 0 COMMENT '是否锁定(0=未锁定,1=已锁定)';

-- 验证字段添加成功
DESCRIBE t_style_quotation;

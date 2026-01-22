-- 为t_factory表添加营业执照字段
-- 用于存储供应商营业执照图片URL

ALTER TABLE t_factory 
ADD COLUMN business_license VARCHAR(512) COMMENT '营业执照图片URL' AFTER status;

-- 查看表结构确认
DESC t_factory;

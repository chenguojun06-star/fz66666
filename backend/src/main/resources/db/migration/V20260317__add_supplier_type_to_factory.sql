-- 为 t_factory 表添加 supplier_type 字段
-- 供应商类型：MATERIAL=面辅料供应商，OUTSOURCE=外发厂
ALTER TABLE t_factory
    ADD COLUMN supplier_type VARCHAR(20) NULL COMMENT '供应商类型：MATERIAL-面辅料供应商，OUTSOURCE-外发厂' AFTER factory_type;

-- 添加 scan_mode 字段到 t_scan_record 表
-- 用于记录扫码模式（ORDER/BUNDLE/SKU）

USE fashion_supplychain;

ALTER TABLE t_scan_record 
ADD COLUMN scan_mode VARCHAR(20) DEFAULT 'BUNDLE' COMMENT '扫码模式: ORDER-订单扫码, BUNDLE-菲号扫码, SKU-SKU扫码' 
AFTER scan_time;

-- 更新说明：scan_mode 字段用于SKU系统，区分三种扫码模式

-- 为生产订单表增加下单业务类型字段
-- FOB=离岸价交货  ODM=原创设计制造  OEM=代工贴牌  CMT=纯加工
-- ⚠️ 改为幂等写法（INFORMATION_SCHEMA 判断），支持 FLYWAY_ENABLED=true 自动执行
SET @s_order_biz_type = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'order_biz_type') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `order_biz_type` VARCHAR(20) NULL COMMENT ''下单业务类型：FOB/ODM/OEM/CMT'' AFTER `factory_name`',
    'SELECT 1'
);
PREPARE stmt FROM @s_order_biz_type; EXECUTE stmt; DEALLOCATE PREPARE stmt;

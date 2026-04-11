-- 为生产订单表新增转厂日志字段
-- 存储每次转厂操作的历史记录（JSON 数组），用于支持撤回转单功能
-- 典型结构：[{"seq":1,"timestamp":"...","operator":"...","oldFactoryId":"...","oldFactoryName":"...","newFactoryId":"...","newFactoryName":"...","isFullTransfer":true,"transferQuantity":null,"colorSizeLines":null,"reason":"...","status":"active"}]

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'transfer_log_json') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `transfer_log_json` LONGTEXT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

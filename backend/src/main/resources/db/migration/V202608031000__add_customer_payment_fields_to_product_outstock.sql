-- 出库记录增加客户信息与收款跟踪字段
-- 解决出库流程缺少客户关联、应收款、结算追踪的问题

-- customer_name: 客户/收货人姓名
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='customer_name')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `customer_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- customer_phone: 客户联系电话
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='customer_phone')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `customer_phone` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- shipping_address: 收货地址
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='shipping_address')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `shipping_address` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- total_amount: 出库总金额（salesPrice × quantity）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='total_amount')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `total_amount` DECIMAL(12,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- paid_amount: 已收款金额
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='paid_amount')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `paid_amount` DECIMAL(12,2) DEFAULT 0.00',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payment_status: 收款状态（unpaid/partial/paid）
-- 注意：DEFAULT 值不能放在 SET @s IF 块内（Flyway 解析器会截断双单引号字符串）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='payment_status')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `payment_status` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填默认值：新增列后将 NULL 值设为 unpaid
UPDATE `t_product_outstock` SET `payment_status` = 'unpaid' WHERE `payment_status` IS NULL;

-- settlement_time: 结算完成时间
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='settlement_time')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `settlement_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

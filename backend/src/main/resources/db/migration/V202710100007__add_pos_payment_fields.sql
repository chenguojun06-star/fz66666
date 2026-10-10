-- 收银台在线支付字段（微信/支付宝）
--
-- 背景：收银台原先只支持「现金/刷卡/挂账」——收款方式只是**登记**。
-- 现在接入真实支付通道后，一笔在线支付有明确的生命周期：
--   创建待支付单 → 顾客扫码 → 渠道回调（或收银台轮询）→ 确认已支付 → 出库
-- 所以销售单要能表达「待支付」这个中间态，并留下渠道交易号与支付时间以便对账。
--
-- pay_status 取值（VARCHAR，无需改类型）：
--   PAYING   待支付（二维码已生成，顾客还没付）
--   PAID     已收款（现金/刷卡当场收，或在线支付已确认）
--   UNPAID   挂账未收（生成应收单，进收付款中心核销）
--   CANCELLED 已取消（待支付超时或收银员取消，未出库）
--
-- 幂等：先判断列是否存在再添加（MySQL 8 不支持 ADD COLUMN IF NOT EXISTS）。

SET @schema = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_pos_sale' AND COLUMN_NAME = 'channel_trade_no') = 0,
    'ALTER TABLE `t_pos_sale` ADD COLUMN `channel_trade_no` VARCHAR(64) NULL COMMENT ''渠道交易号（微信 transaction_id / 支付宝 trade_no，对账用）'' AFTER `receivable_id`',
    'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_pos_sale' AND COLUMN_NAME = 'paid_time') = 0,
    'ALTER TABLE `t_pos_sale` ADD COLUMN `paid_time` DATETIME NULL COMMENT ''实际收款时间（在线支付为渠道确认时间）'' AFTER `channel_trade_no`',
    'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

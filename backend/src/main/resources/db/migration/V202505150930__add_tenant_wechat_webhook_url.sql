-- 为 t_tenant 新增企业微信群机器人 Webhook URL 字段（每租户独立配置）
-- 允许超管或租户主账号通过接口设置；为空时发通知时回退到全局 webhook-url 配置
-- 幂等写法：先判断列是否存在再 ALTER
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_tenant'
       AND COLUMN_NAME  = 'wechat_work_webhook_url') = 0,
    'ALTER TABLE `t_tenant` ADD COLUMN `wechat_work_webhook_url` VARCHAR(500) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

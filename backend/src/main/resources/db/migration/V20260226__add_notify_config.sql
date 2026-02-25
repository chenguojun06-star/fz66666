-- V20260226: 添加通知配置（Server酱微信推送Key）
-- 管理员可在后台"应用订单管理"中配置，客户购买后自动推送微信通知

INSERT INTO t_param_config (param_key, param_value, param_desc)
VALUES ('notify.serverchan.key', '', 'Server酱微信推送Key（在 sct.ftqq.com 获取，配置后客户购买App时自动推送通知到管理员微信）')
ON DUPLICATE KEY UPDATE param_desc = VALUES(param_desc);

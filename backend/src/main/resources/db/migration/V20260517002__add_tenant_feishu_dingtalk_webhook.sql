ALTER TABLE t_tenant
    ADD COLUMN feishu_webhook_url VARCHAR(512) DEFAULT NULL COMMENT '飞书群机器人 Webhook 地址',
    ADD COLUMN dingtalk_webhook_url VARCHAR(512) DEFAULT NULL COMMENT '钉钉群机器人 Webhook 地址';
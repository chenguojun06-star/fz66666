-- D-741：租户级设置表（键值，可放数字/文本配置）
--
-- 背景：应收账款需要「账期天数」（出货后 N 天到期，默认 30）这类**租户级数值配置**，
-- 但现有 t_tenant_smart_feature 只能存布尔开关、t_param_config 是全局键（param_key 全局
-- 唯一，放不了按租户的值）。建一张通用租户设置表，后续其他设置也可复用。
--
-- 初始不插数据：代码侧读不到时回退默认值（账期默认 30 天），避免迁移与代码默认值两处维护。

CREATE TABLE IF NOT EXISTS t_tenant_setting (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    setting_key VARCHAR(100) NOT NULL COMMENT '设置键（如 crm.receivable.paymentTermDays）',
    setting_value VARCHAR(200) NOT NULL COMMENT '设置值',
    remark VARCHAR(255) DEFAULT NULL COMMENT '说明',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_ts_tenant_key (tenant_id, setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='租户级设置（键值）';

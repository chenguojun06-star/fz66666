-- ========================================================
-- 物流管理模块数据库表结构
-- 创建时间: 2026-02-01
-- 说明: 物流管理预留模块的数据库表
-- ========================================================

-- 快递单主表
CREATE TABLE IF NOT EXISTS t_express_order (
    id VARCHAR(64) NOT NULL COMMENT '主键ID',
    tracking_no VARCHAR(64) NOT NULL COMMENT '快递单号',
    tracking_no_sub VARCHAR(64) DEFAULT NULL COMMENT '快递单号（备用）',
    express_company INT DEFAULT NULL COMMENT '快递公司(1-顺丰,2-京东,3-EMS,4-中通,5-圆通,6-申通,7-韵达,8-德邦,9-九曳,10-百世,11-天天,12-优速,99-其他)',
    shipment_type INT DEFAULT 1 COMMENT '发货类型(1-普通,2-加急,3-样品,4-退货,5-换货,6-批发,7-零售)',
    logistics_status INT DEFAULT 0 COMMENT '物流状态(0-待发货,1-已发货,2-运输中,3-已到达,4-已签收,5-异常,6-已退回,7-已取消)',
    order_id VARCHAR(64) DEFAULT NULL COMMENT '关联订单ID',
    order_no VARCHAR(64) DEFAULT NULL COMMENT '关联订单号',
    style_id VARCHAR(64) DEFAULT NULL COMMENT '款式ID',
    style_no VARCHAR(64) DEFAULT NULL COMMENT '款式编号',
    style_name VARCHAR(255) DEFAULT NULL COMMENT '款式名称',
    shipment_quantity INT DEFAULT 0 COMMENT '发货数量',
    weight DECIMAL(10,3) DEFAULT NULL COMMENT '发货重量(kg)',
    freight_amount DECIMAL(12,2) DEFAULT NULL COMMENT '运费金额',
    freight_pay_type INT DEFAULT 1 COMMENT '运费支付方式(1-寄付,2-到付)',
    shipper_id VARCHAR(64) DEFAULT NULL COMMENT '发货人ID',
    shipper_name VARCHAR(64) DEFAULT NULL COMMENT '发货人姓名',
    ship_time DATETIME DEFAULT NULL COMMENT '发货时间',
    receiver_name VARCHAR(64) NOT NULL COMMENT '收货人姓名',
    receiver_phone VARCHAR(32) NOT NULL COMMENT '收货人电话',
    receiver_address VARCHAR(500) NOT NULL COMMENT '收货人地址',
    receiver_province VARCHAR(64) DEFAULT NULL COMMENT '收货人省份',
    receiver_city VARCHAR(64) DEFAULT NULL COMMENT '收货人城市',
    receiver_district VARCHAR(64) DEFAULT NULL COMMENT '收货人区县',
    estimated_arrival_time DATETIME DEFAULT NULL COMMENT '预计到达时间',
    actual_sign_time DATETIME DEFAULT NULL COMMENT '实际签收时间',
    sign_person VARCHAR(64) DEFAULT NULL COMMENT '签收人',
    track_update_time DATETIME DEFAULT NULL COMMENT '物流轨迹最后更新时间',
    track_data TEXT DEFAULT NULL COMMENT '物流轨迹数据(JSON格式)',
    platform_order_no VARCHAR(128) DEFAULT NULL COMMENT '电商平台订单号（预留）',
    platform_code VARCHAR(32) DEFAULT NULL COMMENT '电商平台标识（预留）',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    creator_id VARCHAR(64) DEFAULT NULL COMMENT '创建人ID',
    creator_name VARCHAR(64) DEFAULT NULL COMMENT '创建人姓名',
    updater_id VARCHAR(64) DEFAULT NULL COMMENT '更新人ID',
    updater_name VARCHAR(64) DEFAULT NULL COMMENT '更新人姓名',
    delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标志(0-未删除,1-已删除)',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tracking_no (tracking_no),
    KEY idx_order_id (order_id),
    KEY idx_order_no (order_no),
    KEY idx_style_no (style_no),
    KEY idx_express_company (express_company),
    KEY idx_logistics_status (logistics_status),
    KEY idx_ship_time (ship_time),
    KEY idx_platform_order_no (platform_order_no),
    KEY idx_platform_code (platform_code),
    KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='快递单主表（物流管理预留）';

-- 物流轨迹明细表
CREATE TABLE IF NOT EXISTS t_logistics_track (
    id VARCHAR(64) NOT NULL COMMENT '主键ID',
    express_order_id VARCHAR(64) NOT NULL COMMENT '快递单ID',
    tracking_no VARCHAR(64) NOT NULL COMMENT '快递单号',
    track_time DATETIME NOT NULL COMMENT '轨迹时间',
    track_desc VARCHAR(500) NOT NULL COMMENT '轨迹描述',
    track_location VARCHAR(255) DEFAULT NULL COMMENT '轨迹地点',
    action_code VARCHAR(64) DEFAULT NULL COMMENT '操作码',
    action_name VARCHAR(128) DEFAULT NULL COMMENT '操作名称',
    courier_name VARCHAR(64) DEFAULT NULL COMMENT '快递员名称',
    courier_phone VARCHAR(32) DEFAULT NULL COMMENT '快递员电话',
    signed TINYINT(1) DEFAULT 0 COMMENT '是否已签收(0-否,1-是)',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    data_source INT DEFAULT 1 COMMENT '数据来源(1-API推送,2-手动录入)',
    PRIMARY KEY (id),
    KEY idx_express_order_id (express_order_id),
    KEY idx_tracking_no (tracking_no),
    KEY idx_track_time (track_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流轨迹明细表（物流管理预留）';

-- 物流服务商配置表
CREATE TABLE IF NOT EXISTS t_logistics_provider (
    id VARCHAR(64) NOT NULL COMMENT '主键ID',
    provider_code VARCHAR(64) NOT NULL COMMENT '服务商编码',
    provider_name VARCHAR(128) NOT NULL COMMENT '服务商名称',
    express_company_code VARCHAR(32) DEFAULT NULL COMMENT '快递公司代码',
    api_url VARCHAR(255) DEFAULT NULL COMMENT 'API接口地址',
    api_key VARCHAR(255) DEFAULT NULL COMMENT 'API密钥',
    api_secret VARCHAR(255) DEFAULT NULL COMMENT 'API密钥（备用）',
    merchant_id VARCHAR(128) DEFAULT NULL COMMENT '商户ID',
    ebill_account VARCHAR(128) DEFAULT NULL COMMENT '电子面单账号',
    ebill_password VARCHAR(128) DEFAULT NULL COMMENT '电子面单密码',
    monthly_account VARCHAR(128) DEFAULT NULL COMMENT '月结账号',
    enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用(0-禁用,1-启用)',
    is_default TINYINT(1) DEFAULT 0 COMMENT '是否默认(0-否,1-是)',
    timeout INT DEFAULT 30 COMMENT '请求超时时间(秒)',
    daily_query_limit INT DEFAULT 1000 COMMENT '每日查询限额',
    used_query_count INT DEFAULT 0 COMMENT '已使用查询次数',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    delete_flag INT NOT NULL DEFAULT 0 COMMENT '删除标志(0-未删除,1-已删除)',
    PRIMARY KEY (id),
    UNIQUE KEY uk_provider_code (provider_code),
    KEY idx_express_company_code (express_company_code),
    KEY idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流服务商配置表（物流管理预留）';

-- 初始化物流服务商配置数据（预留）
INSERT INTO t_logistics_provider (id, provider_code, provider_name, express_company_code, enabled, is_default, remark) VALUES
('1', 'SF_EXPRESS', '顺丰速运', 'SF', 1, 1, '顺丰速运接口配置（预留）'),
('2', 'JD_LOGISTICS', '京东物流', 'JD', 1, 0, '京东物流接口配置（预留）'),
('3', 'EMS_EXPRESS', '中国邮政', 'EMS', 1, 0, '中国邮政接口配置（预留）'),
('4', 'ZTO_EXPRESS', '中通快递', 'ZTO', 1, 0, '中通快递接口配置（预留）'),
('5', 'YTO_EXPRESS', '圆通速递', 'YTO', 1, 0, '圆通速递接口配置（预留）')
ON DUPLICATE KEY UPDATE update_time = CURRENT_TIMESTAMP;

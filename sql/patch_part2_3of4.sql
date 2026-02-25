-- ======================== PART 2/6 - 第3段 共4段 ========================

-- ---- V2026022602: fix process tracking id types ----
-- =====================================================================================
-- Migration: V2026022602__fix_process_tracking_id_types.sql
--
-- 【根本原因】V34 migration 将 t_production_process_tracking 所有 ID 字段错误定义为 BIGINT，
-- 但 Java 实体类 ProductionProcessTracking 使用 @TableId(type=IdType.ASSIGN_UUID) 和
-- String 类型存储 UUID。云端执行 V34 后建出的是 BIGINT 列，写入 UUID 字符串时 MySQL
-- 静默截断为 0，导致：
--   1. 所有 process_tracking 行的外键都是 0（关联全部断裂）
--   2. 按真实 UUID 查询永远返回空（扫码更新 process_tracking 全部无效）
--   3. 工序进度、工资结算依赖该表的功能全部失效
--
-- 本地开发从未跑过 V34（FLYWAY_ENABLED=false，手动建表且字段正确为 VARCHAR(64)），
-- 所以本地正常，一上云就全部失效。
--
-- 【修复策略】
--   - 不修改 V34（修改会导致 Flyway checksum 校验失败，阻断所有已部署环境）
--   - 本迁移：TRUNCATE 清理 BIGINT 截断的垃圾数据 + ALTER 修正所有 ID 列类型
--   - 新鲜环境：V34 建 BIGINT → 本脚本立即 ALTER 为 VARCHAR(64) → 最终正确
--   - 已部署云端：直接修正列类型 + 清理垃圾数据 → 重新初始化 process_tracking
--
-- 【注意】TRUNCATE 是安全的：云端已有的 BIGINT 数据是被截断的垃圾（UUID→BIGINT=0），
-- 无任何有价值的数据，可以且应当清除后重新从裁剪单数据初始化。
-- =====================================================================================

-- Step 1: 清理被 BIGINT 截断导致的垃圾数据（UUID→BIGINT 全部截断为 0，无法恢复，必须清除）
TRUNCATE TABLE t_production_process_tracking;

-- Step 2: 移除 id 列的 AUTO_INCREMENT（BIGINT AUTO_INCREMENT 不允许直接改为 VARCHAR，须先去掉自增）
ALTER TABLE t_production_process_tracking
    MODIFY COLUMN id BIGINT NOT NULL COMMENT '临时移除AUTO_INCREMENT';

-- Step 3: 删除主键约束（更换主键列类型时必须先删除主键再重建）
ALTER TABLE t_production_process_tracking
    DROP PRIMARY KEY;

-- Step 4: 将所有 BIGINT ID 字段改为 VARCHAR(64) 以匹配 UUID 类型
ALTER TABLE t_production_process_tracking
    MODIFY COLUMN id                  VARCHAR(64)  NOT NULL    COMMENT '主键ID（UUID）',
    MODIFY COLUMN production_order_id VARCHAR(64)  NOT NULL    COMMENT '生产订单ID（UUID）',
    MODIFY COLUMN cutting_bundle_id   VARCHAR(64)  NOT NULL    COMMENT '菲号ID（裁剪单ID，UUID）',
    MODIFY COLUMN scan_record_id      VARCHAR(64)  DEFAULT NULL COMMENT '关联的扫码记录ID（UUID）',
    MODIFY COLUMN operator_id         VARCHAR(64)  DEFAULT NULL COMMENT '操作人ID（UUID）',
    MODIFY COLUMN factory_id          VARCHAR(64)  DEFAULT NULL COMMENT '执行工厂ID（UUID）';

-- Step 5: 重新添加主键
ALTER TABLE t_production_process_tracking
    ADD PRIMARY KEY (id);

-- =====================================================================================
-- 执行完本迁移后，t_production_process_tracking 表结构与本地开发库完全一致：
--   id                 VARCHAR(64) NOT NULL (PRIMARY KEY)
--   production_order_id VARCHAR(64) NOT NULL
--   cutting_bundle_id   VARCHAR(64) NOT NULL
--   scan_record_id      VARCHAR(64) DEFAULT NULL
--   operator_id         VARCHAR(64) DEFAULT NULL
--   factory_id          VARCHAR(64) DEFAULT NULL
--
-- 【部署后操作】表数据已清空，需要重新初始化 process_tracking 记录：
--   对所有「裁剪完成」状态的裁剪单，调用后端初始化接口，或重新触发扫码初始化逻辑。
--   可以通过业务接口 POST /api/internal/maintenance/reinit-process-tracking 重新初始化。
-- =====================================================================================



-- ---- V20260226: add notify config ----
-- V20260226: 添加通知配置（Server酱微信推送Key）
-- 管理员可在后台"应用订单管理"中配置，客户购买后自动推送微信通知

INSERT INTO t_param_config (param_key, param_value, param_desc)
VALUES ('notify.serverchan.key', '', 'Server酱微信推送Key（在 sct.ftqq.com 获取，配置后客户购买App时自动推送通知到管理员微信）')
ON DUPLICATE KEY UPDATE param_desc = VALUES(param_desc);



-- ---- V25: create logistics tables ----
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



-- ---- V26: add scan record phase3 6 fields ----
-- ========================================================
-- ScanRecord Phase 3-6 字段新增
-- 创建时间: 2026-02-01
-- 说明: 为扫码记录表添加Phase 3-6阶段的新字段
-- ========================================================

-- 检查表是否存在
SET @table_exists = (SELECT COUNT(*) FROM information_schema.tables 
                     WHERE table_schema = DATABASE() 
                     AND table_name = 't_scan_record');

-- 添加Phase 3字段（进度相关）
ALTER TABLE t_scan_record
    ADD COLUMN current_progress_stage VARCHAR(64) DEFAULT NULL COMMENT '当前工序阶段（Phase 3新增）',
    ADD COLUMN progress_node_unit_prices TEXT DEFAULT NULL COMMENT '工序节点单价列表，JSON格式（Phase 3新增）',
    ADD COLUMN cumulative_scan_count INT DEFAULT 0 COMMENT '累计扫码次数（Phase 3新增）',
    ADD COLUMN total_scan_count INT DEFAULT 0 COMMENT '总扫码次数（Phase 3新增）',
    ADD COLUMN progress_percentage DECIMAL(5,2) DEFAULT NULL COMMENT '进度百分比（Phase 3新增）';

-- 添加Phase 4字段（成本相关）
ALTER TABLE t_scan_record
    ADD COLUMN total_piece_cost DECIMAL(12,2) DEFAULT NULL COMMENT '总成本（Phase 4新增）',
    ADD COLUMN average_piece_cost DECIMAL(12,2) DEFAULT NULL COMMENT '平均成本（Phase 4新增）';

-- 添加Phase 5-6字段（指派相关）
ALTER TABLE t_scan_record
    ADD COLUMN assignment_id BIGINT DEFAULT NULL COMMENT '工序指派ID（Phase 5-6新增）',
    ADD COLUMN assigned_operator_name VARCHAR(64) DEFAULT NULL COMMENT '指派操作员名称（Phase 5-6新增）';

-- 添加索引优化查询性能
CALL _add_idx('t_scan_record', 'idx_current_progress_stage', 'INDEX `idx_current_progress_stage` (current_progress_stage)');
CALL _add_idx('t_scan_record', 'idx_assignment_id', 'INDEX `idx_assignment_id` (assignment_id)');



-- ---- V2: baseline marker ----
SELECT 1;




-- ---- V30: create system config and audit log tables ----
-- 系统参数配置表
CREATE TABLE IF NOT EXISTS t_system_config (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    config_key VARCHAR(100) NOT NULL COMMENT '配置键',
    config_name VARCHAR(200) NOT NULL COMMENT '配置名称',
    config_value TEXT COMMENT '配置值',
    default_value TEXT COMMENT '默认值',
    config_type VARCHAR(20) DEFAULT 'string' COMMENT '配置类型: string-字符串, number-数字, boolean-布尔, json-JSON对象',
    category VARCHAR(100) COMMENT '配置分类',
    description TEXT COMMENT '配置描述',
    editable TINYINT DEFAULT 1 COMMENT '是否可编辑: 0-不可编辑, 1-可编辑',
    is_system TINYINT DEFAULT 0 COMMENT '是否系统内置: 0-否, 1-是',
    sort_order INT DEFAULT 0 COMMENT '排序号',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(50) COMMENT '创建人',
    update_by VARCHAR(50) COMMENT '更新人',
    UNIQUE KEY uk_config_key (config_key),
    INDEX idx_category (category),
    INDEX idx_is_system (is_system)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统参数配置表';

-- 操作审计日志表
CREATE TABLE IF NOT EXISTS t_audit_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    operation_type VARCHAR(50) COMMENT '操作类型: CREATE-创建, UPDATE-更新, DELETE-删除, QUERY-查询, EXPORT-导出, LOGIN-登录, LOGOUT-登出',
    module VARCHAR(50) COMMENT '业务模块: system-系统, style-款式, production-生产, finance-财务, warehouse-仓库',
    biz_type VARCHAR(100) COMMENT '业务类型',
    biz_id VARCHAR(100) COMMENT '业务ID',
    biz_desc VARCHAR(500) COMMENT '业务描述',
    operation_content TEXT COMMENT '操作内容',
    before_data LONGTEXT COMMENT '变更前数据(JSON)',
    after_data LONGTEXT COMMENT '变更后数据(JSON)',
    operator_id VARCHAR(50) COMMENT '操作人ID',
    operator_name VARCHAR(100) COMMENT '操作人名称',
    operator_ip VARCHAR(50) COMMENT '操作人IP',
    user_agent VARCHAR(500) COMMENT '操作人设备信息',
    request_url VARCHAR(500) COMMENT '请求URL',
    request_method VARCHAR(10) COMMENT '请求方法: GET, POST, PUT, DELETE',
    request_params LONGTEXT COMMENT '请求参数',
    response_result LONGTEXT COMMENT '响应结果',
    status TINYINT DEFAULT 1 COMMENT '执行状态: 0-失败, 1-成功',
    error_msg TEXT COMMENT '错误信息',
    execution_time BIGINT COMMENT '执行耗时(ms)',
    operation_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    remark VARCHAR(500) COMMENT '备注',
    INDEX idx_operation_type (operation_type),
    INDEX idx_module (module),
    INDEX idx_operator_id (operator_id),
    INDEX idx_status (status),
    INDEX idx_operation_time (operation_time),
    INDEX idx_biz_type_biz_id (biz_type, biz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作审计日志表';

-- 插入默认系统配置
INSERT INTO t_system_config (config_key, config_name, config_value, config_type, category, description, editable, is_system, sort_order) VALUES
('system.name', '系统名称', '服装供应链管理系统', 'string', '基础配置', '系统显示名称', 1, 1, 1),
('system.logo', '系统Logo', '', 'string', '基础配置', '系统Logo URL', 1, 1, 2),
('system.copyright', '版权信息', '© 2024 服装供应链管理系统', 'string', '基础配置', '页面底部版权信息', 1, 1, 3),
('system.login.captcha', '登录验证码', 'true', 'boolean', '安全设置', '是否开启登录验证码', 1, 1, 10),
('system.login.maxRetry', '登录最大重试次数', '5', 'number', '安全设置', '登录失败最大重试次数', 1, 1, 11),
('system.login.lockTime', '登录锁定时间(分钟)', '30', 'number', '安全设置', '登录失败锁定时间', 1, 1, 12),
('system.password.minLength', '密码最小长度', '6', 'number', '安全设置', '密码最小长度要求', 1, 1, 13),
('system.password.complexity', '密码复杂度', 'false', 'boolean', '安全设置', '是否要求密码包含字母和数字', 1, 1, 14),
('system.session.timeout', '会话超时时间(分钟)', '120', 'number', '安全设置', '用户会话超时时间', 1, 1, 15),
('system.file.maxSize', '文件上传最大大小(MB)', '50', 'number', '文件设置', '允许上传的文件最大大小', 1, 1, 20),
('system.file.allowedTypes', '允许的文件类型', 'jpg,png,gif,pdf,doc,docx,xls,xlsx', 'string', '文件设置', '允许上传的文件类型', 1, 1, 21),
('system.auditLog.retentionDays', '审计日志保留天数', '90', 'number', '日志设置', '审计日志保留天数', 1, 1, 30),
('system.order.autoComplete', '订单自动完成天数', '7', 'number', '业务设置', '订单完成后自动确认天数', 1, 1, 40),
('system.order.reminderDays', '订单提醒提前天数', '3', 'number', '业务设置', '交期提醒提前天数', 1, 1, 41);



-- ---- V31: create logistics ecommerce tables ----
-- 快递单表
CREATE TABLE IF NOT EXISTS t_express_order (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tracking_no VARCHAR(100) NOT NULL COMMENT '快递单号',
    company_code VARCHAR(50) COMMENT '快递公司编码',
    company_name VARCHAR(100) COMMENT '快递公司名称',
    order_no VARCHAR(100) COMMENT '关联订单号',
    shipment_type TINYINT DEFAULT 1 COMMENT '发货类型: 1-成品发货, 2-样衣发货, 3-物料发货',
    receiver_name VARCHAR(100) COMMENT '收件人姓名',
    receiver_phone VARCHAR(50) COMMENT '收件人电话',
    receiver_address TEXT COMMENT '收件人地址',
    sender_name VARCHAR(100) COMMENT '寄件人姓名',
    sender_phone VARCHAR(50) COMMENT '寄件人电话',
    sender_address TEXT COMMENT '寄件人地址',
    goods_name VARCHAR(200) COMMENT '货物名称',
    goods_quantity INT DEFAULT 1 COMMENT '货物数量',
    weight DECIMAL(10,2) COMMENT '重量(kg)',
    freight DECIMAL(10,2) COMMENT '运费',
    status TINYINT DEFAULT 0 COMMENT '状态: 0-待发货, 1-已发货, 2-运输中, 3-已到达, 4-已签收, 5-异常, 6-已退回',
    ship_time DATETIME COMMENT '发货时间',
    sign_time DATETIME COMMENT '签收时间',
    sign_person VARCHAR(100) COMMENT '签收人',
    remark TEXT COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(50) COMMENT '创建人',
    update_by VARCHAR(50) COMMENT '更新人',
    INDEX idx_tracking_no (tracking_no),
    INDEX idx_order_no (order_no),
    INDEX idx_status (status),
    INDEX idx_company_code (company_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='快递单表';

-- 电商订单表
CREATE TABLE IF NOT EXISTS t_ecommerce_order (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    order_no VARCHAR(100) NOT NULL COMMENT '订单编号',
    platform VARCHAR(20) COMMENT '电商平台: TB-淘宝, JD-京东, PDD-拼多多, DY-抖音',
    platform_order_no VARCHAR(100) COMMENT '平台订单号',
    shop_name VARCHAR(200) COMMENT '店铺名称',
    buyer_nick VARCHAR(100) COMMENT '买家昵称',
    status TINYINT DEFAULT 0 COMMENT '状态: 0-待付款, 1-待发货, 2-已发货, 3-已完成, 4-已取消, 5-退款中',
    total_amount DECIMAL(12,2) COMMENT '订单金额',
    pay_amount DECIMAL(12,2) COMMENT '实付金额',
    freight DECIMAL(10,2) COMMENT '运费',
    discount DECIMAL(10,2) COMMENT '优惠金额',
    pay_type VARCHAR(50) COMMENT '支付方式',
    pay_time DATETIME COMMENT '支付时间',
    ship_time DATETIME COMMENT '发货时间',
    complete_time DATETIME COMMENT '完成时间',
    receiver_name VARCHAR(100) COMMENT '收件人姓名',
    receiver_phone VARCHAR(50) COMMENT '收件人电话',
    receiver_address TEXT COMMENT '收件人地址',
    tracking_no VARCHAR(100) COMMENT '快递单号',
    express_company VARCHAR(100) COMMENT '快递公司',
    buyer_remark TEXT COMMENT '买家备注',
    seller_remark TEXT COMMENT '卖家备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_order_no (order_no),
    INDEX idx_platform (platform),
    INDEX idx_status (status),
    INDEX idx_shop_name (shop_name),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电商订单表';



-- ---- V32: add logistics ecommerce permissions ----
-- 添加物流管理和电商管理权限
INSERT INTO t_permission (permission_code, permission_name, type, description, create_time, update_time) VALUES
-- 物流管理权限
('MENU_LOGISTICS', '物流管理菜单', 'MENU', '物流管理模块菜单权限', NOW(), NOW()),
('LOGISTICS_EXPRESS_VIEW', '查看快递单', 'BUTTON', '查看快递单列表和详情', NOW(), NOW()),
('LOGISTICS_EXPRESS_CREATE', '创建快递单', 'BUTTON', '创建新的快递单', NOW(), NOW()),
('LOGISTICS_EXPRESS_UPDATE', '更新快递单', 'BUTTON', '修改快递单信息', NOW(), NOW()),
('LOGISTICS_EXPRESS_DELETE', '删除快递单', 'BUTTON', '删除快递单', NOW(), NOW()),

-- 电商管理权限
('MENU_ECOMMERCE', '电商管理菜单', 'MENU', '电商管理模块菜单权限', NOW(), NOW()),
('ECOMMERCE_ORDER_VIEW', '查看电商订单', 'BUTTON', '查看电商订单列表和详情', NOW(), NOW()),
('ECOMMERCE_ORDER_CREATE', '创建电商订单', 'BUTTON', '创建新的电商订单', NOW(), NOW()),
('ECOMMERCE_ORDER_UPDATE', '更新电商订单', 'BUTTON', '修改电商订单信息', NOW(), NOW()),
('ECOMMERCE_ORDER_DELETE', '删除电商订单', 'BUTTON', '删除电商订单', NOW(), NOW());

-- 给管理员角色添加权限（假设角色ID为1是管理员）
INSERT INTO t_role_permission (role_id, permission_id, create_time)
SELECT 1, id, NOW() FROM t_permission 
WHERE permission_code IN (
    'MENU_LOGISTICS', 'LOGISTICS_EXPRESS_VIEW', 'LOGISTICS_EXPRESS_CREATE', 
    'LOGISTICS_EXPRESS_UPDATE', 'LOGISTICS_EXPRESS_DELETE',
    'MENU_ECOMMERCE', 'ECOMMERCE_ORDER_VIEW', 'ECOMMERCE_ORDER_CREATE',
    'ECOMMERCE_ORDER_UPDATE', 'ECOMMERCE_ORDER_DELETE'
)
AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp 
    WHERE rp.role_id = 1 AND rp.permission_id = t_permission.id
);



-- ---- V33: order transfer ----
-- 订单转移表
CREATE TABLE IF NOT EXISTS `order_transfer` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '转移ID',
  `order_id` bigint(20) NOT NULL COMMENT '订单ID',
  `from_user_id` bigint(20) NOT NULL COMMENT '发起人ID',
  `to_user_id` bigint(20) NOT NULL COMMENT '接收人ID',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '转移状态: pending-待处理, accepted-已接受, rejected-已拒绝',
  `message` varchar(500) DEFAULT NULL COMMENT '转移留言',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '拒绝原因',
  `created_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `handled_time` datetime DEFAULT NULL COMMENT '处理时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_from_user_id` (`from_user_id`),
  KEY `idx_to_user_id` (`to_user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_time` (`created_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单转移记录表';



-- ---- V34: add production process tracking table ----
-- 生产工序跟踪表（用于工资结算和进度跟踪）
-- 裁剪完成后自动生成：菲号 × 工序 = N条记录
-- 扫码时更新状态，作为工资结算依据

CREATE TABLE IF NOT EXISTS t_production_process_tracking (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',

  -- 订单关联
  production_order_id BIGINT NOT NULL COMMENT '生产订单ID',
  production_order_no VARCHAR(50) NOT NULL COMMENT '订单号',

  -- 菲号关联
  cutting_bundle_id BIGINT NOT NULL COMMENT '菲号ID（裁剪单ID）',
  bundle_no VARCHAR(50) COMMENT '菲号编号',

  -- SKU信息（从菲号带入）
  sku VARCHAR(50) COMMENT 'SKU号',
  color VARCHAR(50) COMMENT '颜色',
  size VARCHAR(20) COMMENT '尺码',
  quantity INT COMMENT '数量',

  -- 工序信息（从订单 progressNodeUnitPrices 带入）
  process_code VARCHAR(50) NOT NULL COMMENT '工序编号（如：sewing_001）',
  process_name VARCHAR(50) NOT NULL COMMENT '工序名称（如：车缝）',
  process_order INT COMMENT '工序顺序（1,2,3...）',
  unit_price DECIMAL(10,2) COMMENT '单价（元/件，用于工资结算）',

  -- 扫码状态
  scan_status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending=待扫码, scanned=已扫码, reset=已重置',
  scan_time DATETIME COMMENT '扫码时间',
  scan_record_id BIGINT COMMENT '关联的扫码记录ID（t_scan_record）',

  -- 操作人信息
  operator_id BIGINT COMMENT '操作人ID',
  operator_name VARCHAR(50) COMMENT '操作人姓名',
  factory_id BIGINT COMMENT '执行工厂ID',
  factory_name VARCHAR(100) COMMENT '执行工厂名称',

  -- 工资结算
  settlement_amount DECIMAL(10,2) COMMENT '结算金额（quantity × unit_price）',
  is_settled TINYINT(1) DEFAULT 0 COMMENT '是否已结算（0=未结算，1=已结算）',
  settlement_time DATETIME COMMENT '结算时间',

  -- 审计字段
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  creator VARCHAR(50) COMMENT '创建人',
  updater VARCHAR(50) COMMENT '更新人',

  -- 索引
  INDEX idx_order (production_order_id),
  INDEX idx_bundle (cutting_bundle_id),
  INDEX idx_process (process_code),
  INDEX idx_status (scan_status),
  INDEX idx_operator (operator_id),
  UNIQUE KEY uk_bundle_process (cutting_bundle_id, process_code) COMMENT '菲号+工序唯一（防重复扫码）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产工序跟踪表（工资结算依据）';

-- 索引说明
-- 1. idx_order: 查询某订单的所有跟踪记录
-- 2. idx_bundle: 查询某菲号的所有工序记录
-- 3. idx_process: 查询某工序的所有扫码情况
-- 4. idx_status: 查询待扫码/已扫码记录
-- 5. idx_operator: 查询某工人的工作量
-- 6. uk_bundle_process: 唯一键防止重复扫码（核心约束）


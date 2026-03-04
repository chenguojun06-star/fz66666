-- ============================================================
--  云端数据库手动执行脚本
--  生成日期：2026-03-04
--  背景：云端 FLYWAY_ENABLED=false，所有结构变更必须手动执行
--  操作路径：微信云托管控制台 → 数据库 → 执行 SQL
--
--  执行顺序：按脚本块编号从上往下，每块执行完确认无报错再执行下一块
--  全部使用 IF NOT EXISTS / IF EXISTS / ON DUPLICATE KEY，幂等重复执行安全
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 块 1：V33 — 电商订单表补充字段（tenant_id / production_order_no 等）
--        对应文件：V33__add_ecommerce_order_fields.sql
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE t_ecommerce_order
    ADD COLUMN IF NOT EXISTS tenant_id          BIGINT       COMMENT '租户ID',
    ADD COLUMN IF NOT EXISTS production_order_id VARCHAR(64)  COMMENT '关联生产订单ID',
    ADD COLUMN IF NOT EXISTS production_order_no VARCHAR(100) COMMENT '关联生产订单号',
    ADD COLUMN IF NOT EXISTS source_platform_code VARCHAR(20) COMMENT '来源平台代码(与AppStore code一致)',
    ADD COLUMN IF NOT EXISTS sku_code           VARCHAR(100) COMMENT '下单SKU编码',
    ADD COLUMN IF NOT EXISTS product_name       VARCHAR(200) COMMENT '商品名称',
    ADD COLUMN IF NOT EXISTS quantity           INT DEFAULT 1 COMMENT '购买件数',
    ADD COLUMN IF NOT EXISTS warehouse_status   TINYINT DEFAULT 0
                                                COMMENT '仓库状态: 0-待拣货 1-备货中 2-已出库';

ALTER TABLE t_ecommerce_order
    ADD INDEX IF NOT EXISTS idx_tenant_id         (tenant_id),
    ADD INDEX IF NOT EXISTS idx_production_order_id (production_order_id),
    ADD INDEX IF NOT EXISTS idx_source_platform   (source_platform_code);


-- ─────────────────────────────────────────────────────────────────────────────
-- 块 2：V34 — 电商订单单价字段
--        对应文件：V34__add_ecommerce_unit_price.sql
--        注意：云端 MySQL 不支持 ADD COLUMN IF NOT EXISTS，执行前先检查列是否存在
--             若已执行则会报 Duplicate column 错误，忽略即可
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE t_ecommerce_order
    ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2) DEFAULT NULL
    COMMENT '商品单价（元/件）';


-- ─────────────────────────────────────────────────────────────────────────────
-- 块 3：V33b — 订单转移记录表
--        对应文件：V33b__order_transfer.sql
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `order_transfer` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '转移ID',
  `order_id`      BIGINT       NOT NULL COMMENT '订单ID',
  `from_user_id`  BIGINT       NOT NULL COMMENT '发起人ID',
  `to_user_id`    BIGINT       NOT NULL COMMENT '接收人ID',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'pending'
                               COMMENT '状态: pending-待处理, accepted-已接受, rejected-已拒绝',
  `message`       VARCHAR(500) DEFAULT NULL COMMENT '转移留言',
  `reject_reason` VARCHAR(500) DEFAULT NULL COMMENT '拒绝原因',
  `created_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `handled_time`  DATETIME     DEFAULT NULL COMMENT '处理时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_id`      (`order_id`),
  KEY `idx_from_user_id`  (`from_user_id`),
  KEY `idx_to_user_id`    (`to_user_id`),
  KEY `idx_status`        (`status`),
  KEY `idx_created_time`  (`created_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单转移记录表';


-- ─────────────────────────────────────────────────────────────────────────────
-- 块 4：V34b — 生产工序跟踪表（工资结算依据）
--        对应文件：V34b__add_production_process_tracking_table.sql
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_production_process_tracking (
  id                  BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  production_order_id BIGINT      NOT NULL COMMENT '生产订单ID',
  production_order_no VARCHAR(50) NOT NULL COMMENT '订单号',
  cutting_bundle_id   BIGINT      NOT NULL COMMENT '菲号ID',
  bundle_no           VARCHAR(50) DEFAULT NULL COMMENT '菲号编号',
  sku                 VARCHAR(50) DEFAULT NULL,
  color               VARCHAR(50) DEFAULT NULL,
  size                VARCHAR(20) DEFAULT NULL,
  quantity            INT         DEFAULT NULL,
  process_code        VARCHAR(50) NOT NULL COMMENT '工序编号',
  process_name        VARCHAR(50) NOT NULL COMMENT '工序名称',
  process_order       INT         DEFAULT NULL,
  unit_price          DECIMAL(10,2) DEFAULT NULL COMMENT '单价（元/件）',
  scan_status         VARCHAR(20) DEFAULT 'pending'
                                  COMMENT 'pending=待扫码 scanned=已扫码 reset=已重置',
  scan_time           DATETIME    DEFAULT NULL,
  scan_record_id      BIGINT      DEFAULT NULL COMMENT '关联 t_scan_record.id',
  operator_id         BIGINT      DEFAULT NULL,
  operator_name       VARCHAR(50) DEFAULT NULL,
  factory_id          BIGINT      DEFAULT NULL,
  factory_name        VARCHAR(100) DEFAULT NULL,
  settlement_amount   DECIMAL(10,2) DEFAULT NULL,
  is_settled          TINYINT(1)  DEFAULT 0,
  settlement_time     DATETIME    DEFAULT NULL,
  create_time         DATETIME    DEFAULT CURRENT_TIMESTAMP,
  update_time         DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  creator             VARCHAR(50) DEFAULT NULL,
  updater             VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_order   (production_order_id),
  INDEX idx_bundle  (cutting_bundle_id),
  INDEX idx_process (process_code),
  INDEX idx_status  (scan_status),
  INDEX idx_operator (operator_id),
  UNIQUE KEY uk_bundle_process (cutting_bundle_id, process_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='生产工序跟踪表（工资结算依据）';


-- ─────────────────────────────────────────────────────────────────────────────
-- 块 5：V20260302c — 工序→父节点动态映射表 + 初始数据
--        对应文件：V20260302c__create_process_parent_mapping.sql
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_process_parent_mapping (
    id              BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    process_keyword VARCHAR(50) NOT NULL COMMENT '子工序关键词（contains 匹配）',
    parent_node     VARCHAR(20) NOT NULL
                    COMMENT '父进度节点: 采购/裁剪/二次工艺/车缝/尾部/入库',
    tenant_id       BIGINT      DEFAULT NULL COMMENT 'NULL=全局通用',
    create_time     DATETIME    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_keyword_tenant (process_keyword, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工序→父进度节点动态映射';

-- 尾部子工序
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('整烫','尾部'),('大烫','尾部'),('熨烫','尾部'),('烫整','尾部'),
('质检','尾部'),('检验','尾部'),('品检','尾部'),('验货','尾部'),('验收','尾部'),
('包装','尾部'),('打包','尾部'),('装箱','尾部'),('后整','尾部'),
('剪线','尾部'),('尾工','尾部'),('钉扣','尾部'),('锁眼','尾部');

-- 二次工艺子工序
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('绣花','二次工艺'),('印花','二次工艺'),('水洗','二次工艺'),
('染色','二次工艺'),('压花','二次工艺'),('烫钻','二次工艺');

-- 车缝子工序
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('缝制','车缝'),('缝纫','车缝'),('车工','车缝'),
('上领','车缝'),('上袖','车缝'),('锁边','车缝'),
('拼缝','车缝'),('上拉链','车缝'),('上腰','车缝'),('辑线','车缝');

-- 裁剪子工序
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('裁床','裁剪'),('剪裁','裁剪'),('开裁','裁剪');

-- 采购子工序
INSERT IGNORE INTO t_process_parent_mapping (process_keyword, parent_node) VALUES
('物料','采购'),('面辅料','采购'),('备料','采购'),('到料','采购');


-- ─────────────────────────────────────────────────────────────────────────────
-- 块 6：V20260304 — 电商平台凭证配置表
--        对应文件：V20260304__add_ec_platform_config.sql
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_ec_platform_config (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id     BIGINT       NOT NULL COMMENT '租户ID',
    platform_code VARCHAR(32)  NOT NULL COMMENT '平台编码 TAOBAO/JD/DOUYIN 等',
    shop_name     VARCHAR(128) DEFAULT NULL COMMENT '店铺名称',
    app_key       VARCHAR(256) DEFAULT NULL COMMENT 'AppKey / Client ID',
    app_secret    VARCHAR(512) DEFAULT NULL COMMENT 'AppSecret（建议加密存储）',
    extra_field   VARCHAR(256) DEFAULT NULL COMMENT '扩展字段（如 Shopify 店铺域名）',
    status        VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / DISABLED',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_platform (tenant_id, platform_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电商平台对接凭证配置';


-- ─────────────────────────────────────────────────────────────────────────────
-- 块 7：V20260310 — 应用商店电商平台条目
--        对应文件：V20260310__add_ec_platform_apps.sql
--        依赖：t_app_store 表已存在（由更早期迁移脚本创建）
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO t_app_store (app_code, app_name, app_icon, app_desc, category,
    price_monthly, price_yearly, price_once, trial_days, sort_order, is_hot, is_new, status, features)
VALUES
('EC_TAOBAO',      '淘宝',     'tb',  '对接淘宝平台，导入订单、同步库存',
    'ECOMMERCE', 149.00, 1490.00, 19999.00, 7, 100, 1, 0, 'PUBLISHED', '订单导入,库存同步,发货管理'),
('EC_TMALL',       '天猫',     'tm',  '对接天猫旗舰店，管理品牌订单与退换货',
    'ECOMMERCE', 199.00, 1990.00, 19999.00, 7, 101, 1, 0, 'PUBLISHED', '订单导入,库存同步,退换货管理'),
('EC_JD',          '京东',     'jd',  '对接京东平台，实时同步订单与物流',
    'ECOMMERCE', 249.00, 2490.00, 19999.00, 7, 102, 0, 0, 'PUBLISHED', '订单同步,物流跟踪,库存管理'),
('EC_DOUYIN',      '抖音',     'dy',  '对接抖音小店，直播带货订单自动流转',
    'ECOMMERCE', 299.00, 2990.00, 19999.00, 7, 103, 1, 1, 'PUBLISHED', '订单导入,直播订单,物流管理'),
('EC_PINDUODUO',   '拼多多',   'pdd', '对接拼多多，批量订单处理与发货',
    'ECOMMERCE', 149.00, 1490.00, 19999.00, 7, 104, 0, 0, 'PUBLISHED', '订单导入,批量发货,库存同步'),
('EC_XIAOHONGSHU', '小红书',   'xhs', '对接小红书商城，内容种草带来的订单管理',
    'ECOMMERCE', 199.00, 1990.00, 19999.00, 7, 105, 0, 1, 'PUBLISHED', '订单管理,笔记联动,库存同步'),
('EC_WECHAT_SHOP', '微信小店', 'wx',  '对接微信小店与视频号，私域订单全管理',
    'ECOMMERCE', 149.00, 1490.00, 19999.00, 7, 106, 0, 0, 'PUBLISHED', '订单同步,私域管理,客户管理'),
('EC_SHOPIFY',     'Shopify',  'sf',  '对接 Shopify 独立站，跨境订单一体化管理',
    'ECOMMERCE', 299.00, 2990.00, 19999.00, 7, 107, 0, 1, 'PUBLISHED', '订单同步,多币种,物流对接')
ON DUPLICATE KEY UPDATE
    app_name      = VALUES(app_name),
    app_icon      = VALUES(app_icon),
    app_desc      = VALUES(app_desc),
    price_monthly = VALUES(price_monthly),
    price_yearly  = VALUES(price_yearly),
    price_once    = VALUES(price_once),
    trial_days    = VALUES(trial_days),
    status        = VALUES(status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 块 8：V20260304b — 【新增】电商销售收入流水表
--        对应文件：V20260304b__create_ec_sales_revenue.sql
--        功能：出库时自动记录销售收入，财务可核账/入账
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_ec_sales_revenue (
    id                 BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    revenue_no         VARCHAR(50)   NOT NULL COMMENT '流水号 REV-{platform}-yyyyMMdd-xxxxx',
    ec_order_id        BIGINT        NOT NULL COMMENT '关联 t_ecommerce_order.id',
    ec_order_no        VARCHAR(60)   DEFAULT NULL COMMENT '内部 EC 单号',
    platform_order_no  VARCHAR(120)  DEFAULT NULL COMMENT '平台原始订单号',
    platform           VARCHAR(20)   DEFAULT NULL COMMENT 'TB/JD/PDD/DY/XHS/WC/SFY',
    shop_name          VARCHAR(120)  DEFAULT NULL COMMENT '店铺名称',
    product_name       VARCHAR(255)  DEFAULT NULL COMMENT '商品名称',
    sku_code           VARCHAR(120)  DEFAULT NULL COMMENT 'SKU 码',
    quantity           INT           DEFAULT 0   COMMENT '销售数量',
    unit_price         DECIMAL(12,2) DEFAULT NULL COMMENT '商品单价（元/件）',
    total_amount       DECIMAL(14,2) DEFAULT NULL COMMENT '商品总金额',
    pay_amount         DECIMAL(14,2) DEFAULT NULL COMMENT '买家实付金额（核心收入）',
    freight            DECIMAL(10,2) DEFAULT NULL COMMENT '运费',
    discount           DECIMAL(10,2) DEFAULT NULL COMMENT '平台优惠折扣',
    production_order_no VARCHAR(60)  DEFAULT NULL COMMENT '关联生产订单号',
    status             VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                     COMMENT 'pending待确认 / confirmed已核账 / reconciled已入账',
    ship_time          DATETIME      DEFAULT NULL COMMENT '发货时间',
    complete_time      DATETIME      DEFAULT NULL COMMENT '买家确认收货时间',
    remark             VARCHAR(500)  DEFAULT NULL COMMENT '财务备注',
    tenant_id          BIGINT        NOT NULL    COMMENT '租户 ID',
    create_time        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE  KEY uk_revenue_no  (revenue_no),
    UNIQUE  KEY uk_ec_order_id (ec_order_id) COMMENT '同一 EC 订单只记录一条（幂等）',
    INDEX   ix_tenant_status   (tenant_id, status),
    INDEX   ix_tenant_platform (tenant_id, platform),
    INDEX   ix_create_time     (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电商销售收入流水';


-- ─────────────────────────────────────────────────────────────────────────────
-- 执行完成后验证（可选）
-- ─────────────────────────────────────────────────────────────────────────────
-- SHOW TABLES LIKE 't_ec%';
-- SHOW TABLES LIKE 't_process_parent%';
-- SHOW TABLES LIKE 't_production_process%';
-- SHOW TABLES LIKE 'order_transfer%';
-- SELECT COUNT(*) FROM t_process_parent_mapping;  -- 应返回 ≥ 24
-- SELECT COUNT(*) FROM t_app_store WHERE category='ECOMMERCE'; -- 应返回 8
-- DESCRIBE t_ec_sales_revenue;
-- ─────────────────────────────────────────────────────────────────────────────
-- END OF FILE
-- ─────────────────────────────────────────────────────────────────────────────

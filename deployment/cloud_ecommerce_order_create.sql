-- ============================================================
-- 云端一次性建表脚本：t_ecommerce_order
-- 包含 V31 基础表 + V33 扩展字段 + V34 单价字段
-- 在微信云托管控制台数据库面板直接执行这一条即可
-- ============================================================

CREATE TABLE IF NOT EXISTS t_ecommerce_order (
    id                  BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',

    -- 基础订单信息（V31）
    order_no            VARCHAR(100) NOT NULL                  COMMENT '订单编号（系统内部）',
    platform            VARCHAR(20)                            COMMENT '电商平台: TB/JD/PDD/DY',
    platform_order_no   VARCHAR(100)                           COMMENT '平台订单号',
    shop_name           VARCHAR(200)                           COMMENT '店铺名称',
    buyer_nick          VARCHAR(100)                           COMMENT '买家昵称',
    status              TINYINT      DEFAULT 0                 COMMENT '状态: 0-待付款 1-待发货 2-已发货 3-已完成 4-已取消 5-退款中',

    -- 金额（V31 + V34）
    unit_price          DECIMAL(10,2)                          COMMENT '商品单价（元/件）',
    total_amount        DECIMAL(12,2)                          COMMENT '订单金额',
    pay_amount          DECIMAL(12,2)                          COMMENT '实付金额',
    freight             DECIMAL(10,2)                          COMMENT '运费',
    discount            DECIMAL(10,2)                          COMMENT '优惠金额',
    pay_type            VARCHAR(50)                            COMMENT '支付方式',

    -- 时间（V31）
    pay_time            DATETIME                               COMMENT '支付时间',
    ship_time           DATETIME                               COMMENT '发货时间',
    complete_time       DATETIME                               COMMENT '完成时间',

    -- 收件人（V31）
    receiver_name       VARCHAR(100)                           COMMENT '收件人姓名',
    receiver_phone      VARCHAR(50)                            COMMENT '收件人电话',
    receiver_address    TEXT                                   COMMENT '收件人地址',

    -- 物流（V31）
    tracking_no         VARCHAR(100)                           COMMENT '快递单号',
    express_company     VARCHAR(100)                           COMMENT '快递公司',

    -- 备注（V31）
    buyer_remark        TEXT                                   COMMENT '买家备注',
    seller_remark       TEXT                                   COMMENT '卖家备注',

    -- 商品信息（V33）
    product_name        VARCHAR(200)                           COMMENT '商品名称',
    sku_code            VARCHAR(100)                           COMMENT '下单SKU编码',
    quantity            INT          DEFAULT 1                 COMMENT '购买件数',

    -- 平台与仓库关联（V33）
    source_platform_code VARCHAR(20)                           COMMENT '来源平台代码（与AppStore code一致）',
    warehouse_status    TINYINT      DEFAULT 0                 COMMENT '仓库状态: 0-待拣货 1-备货中 2-已出库',

    -- 关联生产订单（V33）
    production_order_id  VARCHAR(64)                           COMMENT '关联生产订单ID',
    production_order_no  VARCHAR(100)                          COMMENT '关联生产订单号',

    -- 租户（V33）
    tenant_id           BIGINT                                 COMMENT '租户ID',

    -- 时间戳（V31）
    create_time         DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    -- 索引
    UNIQUE KEY uk_order_no          (order_no),
    INDEX      idx_platform         (platform),
    INDEX      idx_status           (status),
    INDEX      idx_shop_name        (shop_name),
    INDEX      idx_create_time      (create_time),
    INDEX      idx_tenant_id        (tenant_id),
    INDEX      idx_production_order (production_order_id),
    INDEX      idx_source_platform  (source_platform_code)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电商订单表';

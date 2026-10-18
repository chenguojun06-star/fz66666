-- 电子小票（电子开票）—— 销售单据的统一扫码凭证与签收回写
--
-- 背景（用户诉求，参照竞品衣科ecool）：电子小票贯通 POS 收银 / C端店铺订单 / 批发销售出库，
-- 扫码打开免登录 H5 小票（款式图 + 颜色×码数矩阵 + 支付/应收状态），客户「确认收货」回写签收。
--
-- 口径：
--   ① 一张销售单据对应一张小票（uk_ticket_biz 幂等），小票不复制业务数据，
--      聚合时实时查源单据（PosSale / ShopOrder / ProductOutstock）；
--   ② sign_token 是唯一扫码凭证（Base64url 43 位随机，不可遍历），公开接口无登录态，
--      tenant_id 从本表行取后注入聚合查询（P0 铁律 4）；
--   ③ 签收只回写本表 status，源单据状态机不动（不侵入既有出库/应收流程）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS `t_sales_ticket` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `tenant_id`       BIGINT       NOT NULL                COMMENT '所属租户（公开接口按行取，注入聚合查询）',
  `ticket_no`       VARCHAR(32)  NOT NULL                COMMENT '小票号 T+日期+当日序号',
  `source_biz_type` VARCHAR(20)  NOT NULL                COMMENT '来源单据类型 POS_SALE/SHOP_ORDER/OUTSTOCK',
  `source_biz_id`   VARCHAR(64)  NOT NULL                COMMENT '来源单据ID（ShopOrder 为 UUID，故用 VARCHAR）',
  `source_biz_no`   VARCHAR(64)  NULL                    COMMENT '来源单据号（列表展示用）',
  `sign_token`      CHAR(43)     NOT NULL                COMMENT '扫码凭证（Base64url 随机43位，不可遍历）',
  `status`          VARCHAR(20)  NOT NULL DEFAULT 'UNSIGNED' COMMENT 'UNSIGNED 未签收 / SIGNED 已签收 / VOID 已作废',
  `signed_time`     DATETIME     NULL                    COMMENT '签收时间',
  `signed_by`       VARCHAR(64)  NULL                    COMMENT '签收人（客户自填姓名）',
  `view_count`      INT          NOT NULL DEFAULT 0      COMMENT '扫码/查看次数',
  `create_time`     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  `update_time`     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ticket_biz` (`tenant_id`, `source_biz_type`, `source_biz_id`),
  UNIQUE KEY `uk_ticket_token` (`sign_token`),
  UNIQUE KEY `uk_ticket_no` (`tenant_id`, `ticket_no`),
  KEY `idx_ticket_tenant_time` (`tenant_id`, `create_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '电子小票（销售单据统一扫码凭证与签收回写）';

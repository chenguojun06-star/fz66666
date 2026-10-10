-- 店铺经营日报计数器（数据看板用）
--
-- 背景：数据看板要「浏览 → 加购 → 下单 → 成交」四个数的日报。其中
--   ① 下单 / 成交金额：t_shop_order 是**逐单落行**的事件表，按 DATE(create_time) 聚合即可；
--   ② 加购：t_shop_cart_item **结算成功就被删掉**，事后无法还原「当天加购了多少次」；
--   ③ 浏览：t_shop_browse_log 是按「顾客+款式」合并计数的（为推荐服务，不是为统计服务），
--      合并后也拿不到按天的浏览数。
-- 所以 ②③ 必须有独立的按天计数器。这里只存「无法从既有表还原」的原始计数，
-- 订单类指标一律实时查 t_shop_order —— 不把能从事实表算出来的数字再抄一份，
-- 否则两份数据迟早对不上（本项目已因「派生数据不一致」栽过跟头）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。

SET @schema = DATABASE();

CREATE TABLE IF NOT EXISTS `t_shop_stat_daily` (
  `id`           BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id`    BIGINT NOT NULL             COMMENT '店铺所属租户',
  `stat_date`    DATE   NOT NULL             COMMENT '统计日期（服务器本地日期）',
  `browse_count` INT    NOT NULL DEFAULT 0   COMMENT '商品详情浏览次数（含匿名访客）',
  `cart_add_count` INT  NOT NULL DEFAULT 0   COMMENT '加入购物车次数（结算后购物车行会被删除，故必须独立计数）',
  `create_time`  DATETIME DEFAULT CURRENT_TIMESTAMP,
  `update_time`  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_date` (`tenant_id`, `stat_date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '店铺经营日报计数器（浏览/加购；订单类指标实时查 t_shop_order）';

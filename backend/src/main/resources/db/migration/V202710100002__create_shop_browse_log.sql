-- D-784：店铺商品推荐（含用户浏览偏好）
--
-- 背景（用户诉求）：「详情页 到底部的时候 是不是有一些推荐 根据用户的这些 喜欢的」
-- 实测：顾客端推荐相关代码 0 处、后端也没有任何推荐逻辑 —— 详情页到最底是死胡同。
--
-- 推荐要「结合用户历史」，前提是**先有浏览行为可依**。此前系统没有记录任何浏览行为，
-- 只能做「谁看这件都推一样的」弱推荐。
--
-- 设计取舍：
--   ① **只记登录用户**。匿名顾客没有稳定身份，记下来既无法跨设备复用、
--      又容易变成无法清理的垃圾数据（CLAUDE.md：不做无主数据）。
--      匿名访客走「纯商品关系推荐」，不假装有个性化。
--   ② 同一顾客同一款式重复浏览要**合并计数**而不是每次插一行 ——
--      详情页刷新/返回再进很常见，逐条插入会让热度假象严重失真。
--   ③ 浏览记录是**行为数据不是业务数据**，加保留期（默认 90 天）由清理任务处理，
--      避免无限增长。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。

SET @schema = DATABASE();

CREATE TABLE IF NOT EXISTS `t_shop_browse_log` (
  `id`          BIGINT      NOT NULL AUTO_INCREMENT,
  `tenant_id`   BIGINT      NOT NULL            COMMENT '店铺所属租户',
  `consumer_id` VARCHAR(36) NOT NULL            COMMENT '顾客ID（仅登录用户）',
  `style_id`    BIGINT      NOT NULL            COMMENT '浏览的款式ID',
  `style_no`    VARCHAR(64) NULL                COMMENT '款号（冗余，便于排查）',
  `view_count`  INT         NOT NULL DEFAULT 1  COMMENT '浏览次数（重复浏览合并累加）',
  `first_time`  DATETIME    DEFAULT CURRENT_TIMESTAMP COMMENT '首次浏览时间',
  `last_time`   DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近浏览时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_consumer_style` (`tenant_id`, `consumer_id`, `style_id`),
  KEY `idx_consumer_time` (`tenant_id`, `consumer_id`, `last_time`),
  KEY `idx_style` (`tenant_id`, `style_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '店铺顾客浏览行为（推荐用，按顾客+款式合并计数）';
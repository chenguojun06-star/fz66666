-- D-782：店铺商品「详情内容」—— 轮播图/视频/品牌/尺码表/卖点/常见问题/价格说明
--
-- 背景（用户诉求，原话要点）：
--   「最基本的图片都上传不了，更别说别的了」——此前上架编辑页只有
--   「单张主图 + 每色一张图」，没有轮播图、没有视频、没有品牌、没有
--   常见问题、没有价格说明。运营想编辑这些内容却**根本没有入口**。
--
-- 设计取舍：
--   ① 用**一张宽表存整款内容**，而不是每个内容一张表。
--      理由：这些字段总是「一起被读、一起被写」（详情页一次读完），
--      拆成 7 张表只会带来 7 次查询和 7 套 CRUD，没有收益。
--   ② **不预置行**：与 t_shop_style_layout 同一策略，未保存过的款式
--      走默认值渲染，避免给 112 款逐个插行。
--   ③ 列表类内容用 JSON 数组存（轮播图、卖点、常见问题），
--      字段少、需要保序、不需要按元素检索 —— JSON 列是最合适的形态。
--   ④ 轮播图与既有 color_images **并存不冲突**：详情页按
--      「手填轮播图优先，没有才回落到主图+颜色图」渲染（见前端）。
--   ⑤ 尺码表手工值与 D-780 自动生成的矩阵表**并存**：人工填了就用人工的
--      （那是量体表，自动表替代不了），没填才自动生成。
--
-- 幂等：CREATE TABLE IF NOT EXISTS + information_schema 补列。

SET @schema = DATABASE();

CREATE TABLE IF NOT EXISTS `t_shop_listing_content` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT,
  `tenant_id`     BIGINT       NOT NULL            COMMENT '租户ID',
  `style_id`      BIGINT       NOT NULL            COMMENT '款式ID',
  `gallery_json`  TEXT         NULL                COMMENT '轮播图URL数组(JSON)，已按顺序排列，第1张为主图',
  `video_url`     VARCHAR(500) NULL                COMMENT '商品视频URL（MP4等）',
  `brand`         VARCHAR(64)  NULL                COMMENT '品牌（顾客端展示用）',
  `size_chart`    TEXT         NULL                COMMENT '手工尺码表（富文本HTML）；为空则由 SKU 自动生成',
  `points_json`   TEXT         NULL                COMMENT '核心卖点数组(JSON字符串数组)',
  `faq_json`      TEXT         NULL                COMMENT '常见问题数组(JSON对象数组[{q,a}])',
  `price_note`    VARCHAR(500) NULL                COMMENT '价格说明（如：含运费/开票说明/活动价说明）',
  `create_time`   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_style` (`tenant_id`, `style_id`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '店铺商品详情内容（轮播图/视频/品牌/尺码表/卖点/常见问题/价格说明）';
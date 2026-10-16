-- D-806：详情描述内容块（图 + 文交错）
--
-- 背景：淘宝/拼多多的详情页是**图文交错**的 —— 卖点图 → 一段文字 → 细节图 → 一段文字。
-- 现有 t_shop_listing_content.gallery_json 只能存一个纯图片数组，
-- 表达不了「图和文字按顺序交错」这件事：
-- 要么全图，要么把文字塞到别的模块（points/faq）里，
-- 都无法还原「这一段文字是夹在第 2、3 张图之间的」。
--
-- 设计：新增 blocks_json 存有序内容块数组，每块两种类型：
--   {"type":"image","url":"..."} 或 {"type":"text","content":"..."}
--
-- 兼容策略（关键：老数据零影响）：
--   blocks_json 为空 → 顾客端与编辑端一律回退用 gallery_json 渲染，
--   与本迁移之前的行为完全一致，不需要回填、不需要双写。
--
-- 幂等：先查 INFORMATION_SCHEMA 再决定是否 ALTER。

SET @schema = DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_shop_listing_content'
    AND COLUMN_NAME = 'blocks_json'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE `t_shop_listing_content` ADD COLUMN `blocks_json` TEXT NULL COMMENT ''详情内容块JSON数组：图/文交错顺序；为空时回退读gallery_json''',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
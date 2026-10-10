-- 顾客端详情页图片轮播设置（店铺级统一）
--
-- 背景（用户实测反馈）：「现在的图片轮播也不自动动 也没有设置这些时间的地方
--   还有用户都无法左右滑动看图片这些 全都是死的」。
-- 实测确认两件事：
--   ① 顾客端详情页画廊**没有任何自动播放逻辑**（autoplay/setInterval 均为 0 处），
--      也没有任何地方能设置间隔；
--   ② 左右滑动"死"的根因是**渲染与绑定的图片列表不是同一份** ——
--      画廊按商家排好的「轮播图」(d.gallery) 渲染，而交互绑定却按「主图+各色图」算总数；
--      商家配了轮播图时两者数量对不上（常见 5 张 vs 1 张），
--      `if (galTotal > 1)` 直接为假 → 左右按钮/指示点/触摸滑动全部不绑定。
--      该 bug 在顾客端代码修（以渲染出来的 cell 数为唯一准绳），此处只补「可配置」。
--
-- 设计取舍：轮播间隔做成**店铺级统一设置**，不做商品级。
-- 理由：淘宝/1688 的店铺装修也是全局设置；商品级会让商家逐款去调，
-- 与「更好用更简单」相反。默认开启、4 秒，与主流电商一致。

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_shop_config'
               AND COLUMN_NAME  = 'carousel_autoplay') = 0,
    'ALTER TABLE `t_shop_config` ADD COLUMN `carousel_autoplay` TINYINT DEFAULT 1 COMMENT ''详情页图片轮播自动播放 1=是 0=否''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_shop_config'
               AND COLUMN_NAME  = 'carousel_interval_ms') = 0,
    'ALTER TABLE `t_shop_config` ADD COLUMN `carousel_interval_ms` INT DEFAULT 4000 COMMENT ''轮播间隔毫秒（2000~10000）''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

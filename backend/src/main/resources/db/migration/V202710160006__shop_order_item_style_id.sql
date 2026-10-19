-- D-811 后续：t_shop_order_item 补 style_id
--
-- 为什么必须补：
-- 这张表<b>只有 style_no、没有 style_id</b>（历史设计留下的坑）。
-- 款号一旦修改，历史销量就再也关联不上 —— 表现为「改款号后已售数清零」
-- 且全程无任何报错。款号是可编辑的业务字段，不是主键，拿它当关联键迟早出事。
--
-- 迁移分两步：
-- ① 加列（幂等）
-- ② 用 t_style_info 回填存量（按 tenant_id + style_no 精确匹配）
--    回填不到的不填 NULL —— 宁可空着也不要瞎配一个 id，配错比不配更糟。
--
-- 幂等：每条语句单行，避免多行字符串引号配对出错
-- （V202710160003 因此炸过一次，见 commit 2b5e3d24）。

SET @ddl := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_shop_order_item'
       AND COLUMN_NAME = 'style_id') = 0,
  'ALTER TABLE `t_shop_order_item` ADD COLUMN `style_id` BIGINT NULL COMMENT ''款式ID(t_style_info.id)，销量等统计一律按此列关联''',
  'DO 0'
);
PREPARE s FROM @ddl;
EXECUTE s;
DEALLOCATE PREPARE s;

-- 回填存量：只回填能**精确**匹配到款号的行
UPDATE `t_shop_order_item` oi
JOIN `t_style_info` si
  ON si.`tenant_id` = oi.`tenant_id`
 AND si.`style_no` = oi.`style_no`
SET oi.`style_id` = si.`id`
WHERE oi.`style_id` IS NULL
  AND oi.`style_no` IS NOT NULL
  AND oi.`style_no` <> '';
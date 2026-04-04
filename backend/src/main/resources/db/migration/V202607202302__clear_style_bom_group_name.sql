-- 清空历史 BOM 分组数据，避免旧数据继续回流到模板或复制链路
UPDATE `t_style_bom`
SET `group_name` = NULL
WHERE `group_name` IS NOT NULL
  AND TRIM(`group_name`) <> '';

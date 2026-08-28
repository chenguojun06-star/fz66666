-- D-207：系统预置模板默认可编辑（种子 INSERT 未指定 locked 落表默认1所致），存量一次性解锁
UPDATE t_template_library
SET locked = 0
WHERE (source_style_no IS NULL OR source_style_no = '')
  AND template_key IN ('basic', 'top-basic', 'pants-basic', 'kids-basic', 'market-basic', 'market-knit', 'market-jacket', 'default');

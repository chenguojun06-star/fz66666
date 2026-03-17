-- ============================================================
-- 服装部位词典种子数据 (garment_part)
-- 支持动态部位：单件款只有"整件"，两件套有"上装/下装"，
-- 三件套有"上装/马甲/下装"，可在系统词典管理中随时扩充
-- ============================================================

-- 幂等写法：已存在则跳过
INSERT IGNORE INTO `t_dict` (dict_type, dict_code, dict_label, dict_value, sort, status, create_time)
VALUES
  ('garment_part', 'GARMENT_PART_WHOLE',  '整件',  'GARMENT_PART_WHOLE',  10, 'ENABLED', NOW()),
  ('garment_part', 'GARMENT_PART_UPPER',  '上装',  'GARMENT_PART_UPPER',  20, 'ENABLED', NOW()),
  ('garment_part', 'GARMENT_PART_VEST',   '马甲',  'GARMENT_PART_VEST',   30, 'ENABLED', NOW()),
  ('garment_part', 'GARMENT_PART_LOWER',  '下装',  'GARMENT_PART_LOWER',  40, 'ENABLED', NOW()),
  ('garment_part', 'GARMENT_PART_LINING', '里布',  'GARMENT_PART_LINING', 50, 'ENABLED', NOW()),
  ('garment_part', 'GARMENT_PART_OTHER',  '其他',  'GARMENT_PART_OTHER',  99, 'ENABLED', NOW());

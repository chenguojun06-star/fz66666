-- ============================================================  
-- 为不同仓库类型创建独立的库位字典
-- 
-- 需求：
--   1. 成品仓库库位字典
--   2. 面辅料仓库库位字典  
--   3. 样衣仓库库位字典
--   4. 每种仓库类型使用独立的字典类型，便于前端按类型选择库位
-- ============================================================

-- 1. 成品仓库库位字典
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'A-001',    CONCAT('FW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'finished_warehouse_location', 10, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'A-002',    CONCAT('FW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'finished_warehouse_location', 11, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'B-001',    CONCAT('FW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'finished_warehouse_location', 12, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'B-002',    CONCAT('FW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'finished_warehouse_location', 13, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('C-001'),   1, 8))), 'C-001',    CONCAT('FW_', UPPER(SUBSTRING(MD5('C-001'),   1, 8))), 'finished_warehouse_location', 14, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('C-002'),   1, 8))), 'C-002',    CONCAT('FW_', UPPER(SUBSTRING(MD5('C-002'),   1, 8))), 'finished_warehouse_location', 15, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('成品A仓'), 1, 8))), '成品A仓',  CONCAT('FW_', UPPER(SUBSTRING(MD5('成品A仓'), 1, 8))), 'finished_warehouse_location', 20, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('成品B仓'), 1, 8))), '成品B仓',  CONCAT('FW_', UPPER(SUBSTRING(MD5('成品B仓'), 1, 8))), 'finished_warehouse_location', 21, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('成品默认仓'), 1, 8))), '成品默认仓', CONCAT('FW_', UPPER(SUBSTRING(MD5('成品默认仓'), 1, 8))), 'finished_warehouse_location', 99, 'ENABLED');

-- 2. 面辅料仓库库位字典
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'A-001',    CONCAT('MW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'material_warehouse_location', 10, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'A-002',    CONCAT('MW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'material_warehouse_location', 11, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'B-001',    CONCAT('MW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'material_warehouse_location', 12, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'B-002',    CONCAT('MW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'material_warehouse_location', 13, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('面料仓'), 1, 8))), '面料仓',    CONCAT('MW_', UPPER(SUBSTRING(MD5('面料仓'), 1, 8))), 'material_warehouse_location', 20, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('辅料仓'), 1, 8))), '辅料仓',    CONCAT('MW_', UPPER(SUBSTRING(MD5('辅料仓'), 1, 8))), 'material_warehouse_location', 21, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('面辅料默认仓'), 1, 8))), '面辅料默认仓', CONCAT('MW_', UPPER(SUBSTRING(MD5('面辅料默认仓'), 1, 8))), 'material_warehouse_location', 99, 'ENABLED');

-- 3. 样衣仓库库位字典
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'A-001',    CONCAT('SW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'sample_warehouse_location', 10, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'A-002',    CONCAT('SW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'sample_warehouse_location', 11, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'B-001',    CONCAT('SW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'sample_warehouse_location', 12, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'B-002',    CONCAT('SW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'sample_warehouse_location', 13, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('样衣A仓'), 1, 8))), '样衣A仓',  CONCAT('SW_', UPPER(SUBSTRING(MD5('样衣A仓'), 1, 8))), 'sample_warehouse_location', 20, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('样衣B仓'), 1, 8))), '样衣B仓',  CONCAT('SW_', UPPER(SUBSTRING(MD5('样衣B仓'), 1, 8))), 'sample_warehouse_location', 21, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('样衣默认仓'), 1, 8))), '样衣默认仓', CONCAT('SW_', UPPER(SUBSTRING(MD5('样衣默认仓'), 1, 8))), 'sample_warehouse_location', 99, 'ENABLED');

-- 4. 仓库类型字典（用于前端选择仓库类型）
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
    ('WT_FINISHED', '成品仓库', 'FINISHED', 'warehouse_type', 10, 'ENABLED'),
    ('WT_MATERIAL', '面辅料仓库', 'MATERIAL', 'warehouse_type', 20, 'ENABLED'),
    ('WT_SAMPLE', '样衣仓库', 'SAMPLE', 'warehouse_type', 30, 'ENABLED');

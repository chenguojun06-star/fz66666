-- ============================================================  
-- 为不同仓库类型创建独立的库位字典
-- 
-- 需求：
--   1. 成品仓库库位字典
--   2. 面辅料仓库库位字典  
--   3. 样衣仓库库位字典
--   4. 每种仓库类型使用独立的字典类型，便于前端按类型选择库位
--   5. 库位只包含编号（如A-001），仓库名称由前端固定显示
-- ============================================================

-- 1. 成品仓库库位字典
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'A-001',    CONCAT('FW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'finished_warehouse_location', 10, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'A-002',    CONCAT('FW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'finished_warehouse_location', 11, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'B-001',    CONCAT('FW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'finished_warehouse_location', 12, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'B-002',    CONCAT('FW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'finished_warehouse_location', 13, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('C-001'),   1, 8))), 'C-001',    CONCAT('FW_', UPPER(SUBSTRING(MD5('C-001'),   1, 8))), 'finished_warehouse_location', 14, 'ENABLED'),
    (CONCAT('FW_', UPPER(SUBSTRING(MD5('C-002'),   1, 8))), 'C-002',    CONCAT('FW_', UPPER(SUBSTRING(MD5('C-002'),   1, 8))), 'finished_warehouse_location', 15, 'ENABLED');

-- 2. 面辅料仓库库位字典
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'A-001',    CONCAT('MW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'material_warehouse_location', 10, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'A-002',    CONCAT('MW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'material_warehouse_location', 11, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'B-001',    CONCAT('MW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'material_warehouse_location', 12, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'B-002',    CONCAT('MW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'material_warehouse_location', 13, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('C-001'),   1, 8))), 'C-001',    CONCAT('MW_', UPPER(SUBSTRING(MD5('C-001'),   1, 8))), 'material_warehouse_location', 14, 'ENABLED'),
    (CONCAT('MW_', UPPER(SUBSTRING(MD5('C-002'),   1, 8))), 'C-002',    CONCAT('MW_', UPPER(SUBSTRING(MD5('C-002'),   1, 8))), 'material_warehouse_location', 15, 'ENABLED');

-- 3. 样衣仓库库位字典
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'A-001',    CONCAT('SW_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'sample_warehouse_location', 10, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'A-002',    CONCAT('SW_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'sample_warehouse_location', 11, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'B-001',    CONCAT('SW_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'sample_warehouse_location', 12, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'B-002',    CONCAT('SW_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'sample_warehouse_location', 13, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('C-001'),   1, 8))), 'C-001',    CONCAT('SW_', UPPER(SUBSTRING(MD5('C-001'),   1, 8))), 'sample_warehouse_location', 14, 'ENABLED'),
    (CONCAT('SW_', UPPER(SUBSTRING(MD5('C-002'),   1, 8))), 'C-002',    CONCAT('SW_', UPPER(SUBSTRING(MD5('C-002'),   1, 8))), 'sample_warehouse_location', 15, 'ENABLED');

-- ============================================================
-- 种子 warehouse_location 字典，修复手机端扫码无法选择仓库
--
-- 背景：
--   miniprogram/pages/scan/mixins/scanLifecycleMixin.js#_loadWarehouseOptions
--   通过 /api/system/dict/by-type?type=warehouse_location 拉取可选仓库，
--   但 t_dict 中该字典历史只维护了少量条目，历史 t_product_warehousing.warehouse
--   里实际出现过的仓库/库位名未被沉淀 → 手机端只能选到极少选项。
--
-- 本脚本作用（完全幂等）：
--   1. 把 t_product_warehousing 里所有真实使用过的 DISTINCT warehouse 回灌到 t_dict
--   2. 同时补一批常用预置值（A-001 / A-002 / B-001 / B-002 / A仓 / B仓 / 默认仓库）
--   3. 冲突时跳过（dict_type + dict_label 唯一索引）
--
-- 策略：使用 INSERT IGNORE + 稳定 dict_code（基于 label 的 MD5 前 8 位）
--       dict_code 同一 label 每次生成相同，确保重复执行幂等。
-- ============================================================

-- 1. 回灌历史 t_product_warehousing.warehouse 到字典
--    稳定 dict_code：WH_ + 大写前缀 + MD5(label) 前 8 位，长度 ≤ 50
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status)
SELECT
    CONCAT('WH_', UPPER(SUBSTRING(MD5(warehouse), 1, 8))) AS dict_code,
    warehouse AS dict_label,
    CONCAT('WH_', UPPER(SUBSTRING(MD5(warehouse), 1, 8))) AS dict_value,
    'warehouse_location' AS dict_type,
    50 AS sort,
    'ENABLED' AS status
FROM (
    SELECT DISTINCT TRIM(warehouse) AS warehouse
    FROM t_product_warehousing
    WHERE warehouse IS NOT NULL
      AND TRIM(warehouse) <> ''
      AND (delete_flag IS NULL OR delete_flag = 0)
) t
WHERE CHAR_LENGTH(warehouse) <= 100;

-- 2. 补充常用预置仓库（如果 label 已被上一步回灌则跳过）
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
    (CONCAT('WH_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'A-001',    CONCAT('WH_', UPPER(SUBSTRING(MD5('A-001'),   1, 8))), 'warehouse_location', 10, 'ENABLED'),
    (CONCAT('WH_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'A-002',    CONCAT('WH_', UPPER(SUBSTRING(MD5('A-002'),   1, 8))), 'warehouse_location', 11, 'ENABLED'),
    (CONCAT('WH_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'B-001',    CONCAT('WH_', UPPER(SUBSTRING(MD5('B-001'),   1, 8))), 'warehouse_location', 12, 'ENABLED'),
    (CONCAT('WH_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'B-002',    CONCAT('WH_', UPPER(SUBSTRING(MD5('B-002'),   1, 8))), 'warehouse_location', 13, 'ENABLED'),
    (CONCAT('WH_', UPPER(SUBSTRING(MD5('A仓'),     1, 8))), 'A仓',      CONCAT('WH_', UPPER(SUBSTRING(MD5('A仓'),     1, 8))), 'warehouse_location', 20, 'ENABLED'),
    (CONCAT('WH_', UPPER(SUBSTRING(MD5('B仓'),     1, 8))), 'B仓',      CONCAT('WH_', UPPER(SUBSTRING(MD5('B仓'),     1, 8))), 'warehouse_location', 21, 'ENABLED'),
    (CONCAT('WH_', UPPER(SUBSTRING(MD5('默认仓库'), 1, 8))), '默认仓库', CONCAT('WH_', UPPER(SUBSTRING(MD5('默认仓库'), 1, 8))), 'warehouse_location', 99, 'ENABLED');

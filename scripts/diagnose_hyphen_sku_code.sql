-- 诊断：历史横线格式 SKU 编码盘点（只读，不修改任何数据）
--
-- 背景：D-228 起 SKU 编码统一为「直拼」格式（款号+颜色+尺码，如 BR26X1K0651A棕色XS）。
--       出入库链路 6 处代码已改为直拼，但 t_product_sku 仍残留历史「横线」格式数据
--       （款号-颜色-尺码）。因 upsert 有「按款色码二次查找」兜底，
--       库存归集正确、功能不受影响，仅显示格式不统一。
--
-- 目的：归一化之前先摸清三件事
--   ① 到底还剩多少条横线编码
--   ② 归一化（去掉横线）后会不会撞唯一索引 uk_sku_code / uk_style_color_size
--   ③ 哪些表还引用着旧的横线编码（评估联动改的影响面）
--
-- 执行：在生产库**手动**执行一次（只读 SELECT，可放心重复执行）。
--       看结果再决定是否跑归一化。

-- ========== Part 1：t_product_sku 横线编码明细 + 撞号检测 ==========
-- conflict 列含义：
--   OK                        → 可安全改成直拼
--   撞号：直拼编码已存在      → 直接 UPDATE 会违反 uk_sku_code，需先合并两行
--   撞(style,color,size)      → 同款同色同码已存在另一行，需合并库存后删旧行
SELECT
    a.id,
    a.tenant_id,
    a.sku_code                     AS old_hyphen_code,
    a.style_no,
    a.color,
    a.size,
    REPLACE(a.sku_code, '-', '')   AS new_flat_code,
    CASE
        WHEN b.id IS NOT NULL THEN '撞号：直拼编码已存在'
        WHEN c.id IS NOT NULL THEN '撞(style,color,size)：同款同色同码已存在'
        ELSE 'OK'
    END                            AS conflict,
    a.stock_quantity,
    b.id                           AS conflict_code_row_id,
    c.id                           AS conflict_scs_row_id
FROM t_product_sku a
LEFT JOIN t_product_sku b
       ON b.sku_code = REPLACE(a.sku_code, '-', '')
      AND b.id <> a.id
LEFT JOIN t_product_sku c
       ON c.style_id = a.style_id
      AND c.color    = a.color
      AND c.size     = a.size
      AND c.id <> a.id
WHERE a.sku_code LIKE '%-%'
ORDER BY FIELD(CASE
        WHEN b.id IS NOT NULL THEN '撞号：直拼编码已存在'
        WHEN c.id IS NOT NULL THEN '撞(style,color,size)：同款同色同码已存在'
        ELSE 'OK'
    END, '撞号：直拼编码已存在', '撞(style,color,size)：同款同色同码已存在', 'OK'),
    a.id;

-- ========== Part 2：汇总（先看这个） ==========
SELECT
    COUNT(*)                                                        AS 横线编码总行数,
    SUM(CASE WHEN b.id IS NOT NULL THEN 1 ELSE 0 END)               AS 撞直拼编码数,
    SUM(CASE WHEN b.id IS NULL AND c.id IS NOT NULL THEN 1 ELSE 0 END) AS 撞款色码数,
    SUM(CASE WHEN b.id IS NULL AND c.id IS NULL THEN 1 ELSE 0 END)  AS 可直接归一化数
FROM t_product_sku a
LEFT JOIN t_product_sku b
       ON b.sku_code = REPLACE(a.sku_code, '-', '') AND b.id <> a.id
LEFT JOIN t_product_sku c
       ON c.style_id = a.style_id AND c.color = a.color AND c.size = a.size AND c.id <> a.id
WHERE a.sku_code LIKE '%-%';

-- ========== Part 3：各表横线编码分布（影响面） ==========
-- 自适应遍历当前库中所有含 sku_code 列的表，统计其中的横线编码行数。
-- 用于判断：只改 t_product_sku 主表够不够，还是出入库/盘点等表也要联动改。
DROP PROCEDURE IF EXISTS diag_hyphen_by_table;
DELIMITER //
CREATE PROCEDURE diag_hyphen_by_table()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE tname VARCHAR(128);
    DECLARE cur CURSOR FOR
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'sku_code'
        ORDER BY TABLE_NAME;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    DROP TEMPORARY TABLE IF EXISTS tmp_hyphen_stat;
    CREATE TEMPORARY TABLE tmp_hyphen_stat (
        tbl VARCHAR(128),
        total_rows INT,
        hyphen_rows INT
    );

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO tname;
        IF done THEN LEAVE read_loop; END IF;
        SET @sql = CONCAT(
            'INSERT INTO tmp_hyphen_stat SELECT ''', tname, ''', COUNT(*), ',
            'SUM(CASE WHEN sku_code LIKE ''%-%'' THEN 1 ELSE 0 END) FROM `', tname, '`'
        );
        PREPARE st FROM @sql;
        EXECUTE st;
        DEALLOCATE PREPARE st;
    END LOOP;
    CLOSE cur;

    SELECT tbl               AS 表名,
           total_rows        AS 总行数,
           hyphen_rows       AS 横线编码行数,
           ROUND(hyphen_rows * 100.0 / NULLIF(total_rows, 0), 1) AS 占比百分比
    FROM tmp_hyphen_stat
    ORDER BY hyphen_rows DESC, total_rows DESC;
END //
DELIMITER ;

CALL diag_hyphen_by_table();
DROP PROCEDURE IF EXISTS diag_hyphen_by_table;

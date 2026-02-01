-- ============================================
-- 开发端 → 单价维护 数据同步脚本
-- 只同步有数据的款号，不回流
-- ============================================

SET @now = NOW();

-- 1. 为开发端有工艺数据但没有工序模板的款号创建模板
INSERT INTO t_template_library (id, template_type, template_key, template_name, source_style_no, template_content, locked, create_time, update_time)
SELECT
    UUID() AS id,
    'process' AS template_type,
    CONCAT('style_', si.style_no) AS template_key,
    CONCAT(si.style_no, '-工艺模板') AS template_name,
    si.style_no AS source_style_no,
    CONCAT('{"steps":[',
        GROUP_CONCAT(
            CONCAT('{"processCode":"', LPAD(sp.sort_order, 2, '0'),
                   '","processName":"', sp.process_name,
                   '","unitPrice":', sp.price,
                   ',"machineType":"', IFNULL(sp.machine_type, ''),
                   '","progressStage":"', IFNULL(sp.progress_stage, ''),
                   '","standardTime":', sp.standard_time, '}')
            ORDER BY sp.sort_order
            SEPARATOR ','
        ),
    ']}') AS template_content,
    1 AS locked,
    @now AS create_time,
    @now AS update_time
FROM t_style_process sp
JOIN t_style_info si ON sp.style_id = si.id
WHERE sp.price > 0
  AND si.style_no NOT IN (
      SELECT source_style_no FROM t_template_library
      WHERE template_type = 'process' AND source_style_no IS NOT NULL
  )
GROUP BY si.style_no, si.id;

SELECT CONCAT('新增工序模板: ', ROW_COUNT(), ' 个') AS result;

-- 2. 更新已存在但内容为空的模板
UPDATE t_template_library tl
JOIN (
    SELECT
        si.style_no,
        CONCAT('{"steps":[',
            GROUP_CONCAT(
                CONCAT('{"processCode":"', LPAD(sp.sort_order, 2, '0'),
                       '","processName":"', sp.process_name,
                       '","unitPrice":', sp.price,
                       ',"machineType":"', IFNULL(sp.machine_type, ''),
                       '","progressStage":"', IFNULL(sp.progress_stage, ''),
                       '","standardTime":', sp.standard_time, '}')
                ORDER BY sp.sort_order
                SEPARATOR ','
            ),
        ']}') AS new_content
    FROM t_style_process sp
    JOIN t_style_info si ON sp.style_id = si.id
    WHERE sp.price > 0
    GROUP BY si.style_no, si.id
) src ON tl.source_style_no = src.style_no
SET tl.template_content = src.new_content,
    tl.update_time = @now
WHERE tl.template_type = 'process'
  AND (tl.template_content IS NULL
       OR tl.template_content = ''
       OR tl.template_content = '{"steps":[]}');

SELECT CONCAT('更新空模板: ', ROW_COUNT(), ' 个') AS result;

-- 3. 验证结果
SELECT
    source_style_no,
    template_name,
    CASE
        WHEN template_content LIKE '%unitPrice%' THEN 'HAS_UNITPRICE'
        ELSE 'NO_UNITPRICE'
    END AS status,
    LEFT(template_content, 100) AS preview
FROM t_template_library
WHERE template_type = 'process'
  AND source_style_no IN (
      SELECT DISTINCT si.style_no
      FROM t_style_process sp
      JOIN t_style_info si ON sp.style_id = si.id
      WHERE sp.price > 0
  )
ORDER BY source_style_no;

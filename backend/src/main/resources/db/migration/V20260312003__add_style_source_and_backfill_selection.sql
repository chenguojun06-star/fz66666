SET @s_add_style_source_type = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'development_source_type') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `development_source_type` VARCHAR(32) NULL COMMENT ''开发来源类型：SELF_DEVELOPED/SELECTION_CENTER'' AFTER `sample_review_time`',
    'SELECT 1'
);
PREPARE stmt FROM @s_add_style_source_type; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s_add_style_source_detail = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'development_source_detail') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `development_source_detail` VARCHAR(64) NULL COMMENT ''开发来源明细：自主开发/外部市场/供应商/客户定制/内部选品'' AFTER `development_source_type`',
    'SELECT 1'
);
PREPARE stmt FROM @s_add_style_source_detail; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE t_style_info si
JOIN t_selection_candidate sc
  ON (sc.created_style_id = si.id OR (sc.created_style_id IS NULL AND sc.created_style_no = si.style_no))
SET si.development_source_type = CASE
        WHEN COALESCE(si.development_source_type, '') = '' THEN 'SELECTION_CENTER'
        ELSE si.development_source_type
    END,
    si.development_source_detail = CASE
        WHEN COALESCE(si.development_source_detail, '') <> '' THEN si.development_source_detail
        WHEN UPPER(COALESCE(sc.source_type, '')) = 'EXTERNAL' THEN '外部市场'
        WHEN UPPER(COALESCE(sc.source_type, '')) = 'SUPPLIER' THEN '供应商'
        WHEN UPPER(COALESCE(sc.source_type, '')) = 'CLIENT' THEN '客户定制'
        WHEN UPPER(COALESCE(sc.source_type, '')) = 'INTERNAL' THEN '内部选品'
        ELSE '选品中心'
    END,
    si.cover = CASE
        WHEN COALESCE(si.cover, '') <> '' THEN si.cover
        WHEN JSON_VALID(sc.reference_images) AND JSON_LENGTH(sc.reference_images) > 0
            THEN JSON_UNQUOTE(JSON_EXTRACT(sc.reference_images, '$[0]'))
        ELSE si.cover
    END
WHERE COALESCE(sc.delete_flag, 0) = 0;

UPDATE t_style_info si
SET si.development_source_type = 'SELF_DEVELOPED',
    si.development_source_detail = '自主开发'
WHERE COALESCE(si.development_source_type, '') = ''
  AND NOT EXISTS (
      SELECT 1
      FROM t_selection_candidate sc
      WHERE COALESCE(sc.delete_flag, 0) = 0
        AND (sc.created_style_id = si.id OR (sc.created_style_id IS NULL AND sc.created_style_no = si.style_no))
  );

INSERT INTO t_pattern_production (
    id, style_id, style_no, color, quantity, release_time, delivery_time,
    receiver, receive_time, complete_time, pattern_maker, progress_nodes, status,
    create_time, update_time, create_by, update_by, delete_flag, review_status,
    review_result, review_remark, review_by, review_time, tenant_id
)
SELECT
    REPLACE(UUID(), '-', ''),
    CAST(si.id AS CHAR),
    si.style_no,
    COALESCE(NULLIF(si.color, ''), '-'),
    CASE WHEN COALESCE(si.sample_quantity, 0) > 0 THEN si.sample_quantity ELSE 1 END,
    si.create_time,
    si.delivery_date,
    NULL,
    NULL,
    CASE WHEN UPPER(COALESCE(si.sample_status, '')) = 'COMPLETED' THEN si.sample_completed_time ELSE NULL END,
    NULL,
    CASE
        WHEN UPPER(COALESCE(si.sample_status, '')) = 'COMPLETED' THEN '{"cutting":100,"sewing":100,"ironing":100,"quality":100,"secondary":100,"packaging":100}'
        WHEN COALESCE(si.sample_progress, 0) > 0 THEN CONCAT('{"cutting":', si.sample_progress, ',"sewing":', si.sample_progress, ',"ironing":', si.sample_progress, ',"quality":', si.sample_progress, ',"secondary":', si.sample_progress, ',"packaging":', si.sample_progress, '}')
        ELSE '{"cutting":0,"sewing":0,"ironing":0,"quality":0,"secondary":0,"packaging":0}'
    END,
    CASE
        WHEN UPPER(COALESCE(si.sample_status, '')) = 'COMPLETED' THEN 'COMPLETED'
        WHEN UPPER(COALESCE(si.sample_status, '')) = 'IN_PROGRESS' THEN 'IN_PROGRESS'
        ELSE 'PENDING'
    END,
    NOW(),
    NOW(),
    'system-backfill',
    'system-backfill',
    0,
    CASE
        WHEN UPPER(COALESCE(si.sample_review_status, '')) = 'PASS' THEN 'APPROVED'
        WHEN UPPER(COALESCE(si.sample_review_status, '')) = 'REJECT' THEN 'REJECTED'
        ELSE 'PENDING'
    END,
    CASE
        WHEN UPPER(COALESCE(si.sample_review_status, '')) = 'PASS' THEN 'APPROVED'
        WHEN UPPER(COALESCE(si.sample_review_status, '')) = 'REJECT' THEN 'REJECTED'
        ELSE NULL
    END,
    si.sample_review_comment,
    si.sample_reviewer,
    si.sample_review_time,
    si.tenant_id
FROM t_style_info si
JOIN t_selection_candidate sc
  ON (sc.created_style_id = si.id OR (sc.created_style_id IS NULL AND sc.created_style_no = si.style_no))
LEFT JOIN t_pattern_production pp
  ON pp.style_id = CAST(si.id AS CHAR) AND COALESCE(pp.delete_flag, 0) = 0
WHERE COALESCE(sc.delete_flag, 0) = 0
  AND pp.id IS NULL;

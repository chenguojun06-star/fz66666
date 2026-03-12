UPDATE t_style_info
SET development_source_type = CASE
        WHEN UPPER(COALESCE(TRIM(development_source_type), '')) = 'SELECTION_CENTER' THEN 'SELECTION_CENTER'
        WHEN UPPER(COALESCE(TRIM(development_source_type), '')) = 'SELF_DEVELOPED' THEN 'SELF_DEVELOPED'
        WHEN COALESCE(description, '') LIKE '%选品中心%' THEN 'SELECTION_CENTER'
        ELSE 'SELF_DEVELOPED'
    END;

UPDATE t_style_info
SET development_source_detail = CASE
        WHEN development_source_type = 'SELF_DEVELOPED' THEN '自主开发'
        WHEN COALESCE(development_source_detail, '') LIKE '%外部市场%' THEN '外部市场'
        WHEN COALESCE(development_source_detail, '') LIKE '%供应商%' THEN '供应商'
        WHEN COALESCE(development_source_detail, '') LIKE '%客户定制%' THEN '客户定制'
        WHEN COALESCE(development_source_detail, '') LIKE '%内部选品%' THEN '内部选品'
        WHEN COALESCE(development_source_detail, '') LIKE '%选品中心%' THEN '选品中心'
        WHEN COALESCE(description, '') LIKE '%外部市场%' THEN '外部市场'
        WHEN COALESCE(description, '') LIKE '%供应商%' THEN '供应商'
        WHEN COALESCE(description, '') LIKE '%客户定制%' THEN '客户定制'
        WHEN COALESCE(description, '') LIKE '%内部选品%' THEN '内部选品'
        ELSE '选品中心'
    END
WHERE development_source_type = 'SELECTION_CENTER';

UPDATE t_style_info
SET development_source_detail = '自主开发'
WHERE development_source_type = 'SELF_DEVELOPED'
  AND COALESCE(development_source_detail, '') <> '自主开发';

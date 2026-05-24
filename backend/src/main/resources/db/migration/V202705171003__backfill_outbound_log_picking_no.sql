-- ============================================================
-- V202705171003 防御式重写：回填 t_material_outbound_log 的 outbound_no 和 picking_no
-- 旧版 recordOutboundLog 未设置这两个字段
-- 防御策略: 动态 SQL + 前置列存在性检查
-- ============================================================

SET @dbname = DATABASE();

SET @ol_has_cols = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_outbound_log'
    AND COLUMN_NAME IN ('picking_no','outbound_no'));

SET @s = IF(@ol_has_cols >= 2,
    'UPDATE t_material_outbound_log ol SET ol.picking_no = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(ol.remark, ''pickingNo='', -1), ''|'', 1)), ol.outbound_no = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(ol.remark, ''pickingNo='', -1), ''|'', 1)) WHERE ol.remark LIKE ''%pickingNo=%'' AND ol.picking_no IS NULL',
    'SELECT ''SKIP: V202705171003 t_material_outbound_log missing picking_no/outbound_no columns'' AS info');

PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

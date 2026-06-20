-- V202606201006: t_product_warehousing 表加 creatorId/creatorName 字段
--
-- 背景：
--   全系统"谁创建的"审计——产品入库环节首次发起时必须有创建人记录。
--   t_product_warehousing 表目前没有 creatorId/creatorName 列，
--   与 t_material_purchase / t_cutting_bundle / t_factory_shipment 等表不一致。
--
-- 修改内容：
--   ALTER TABLE t_product_warehousing ADD COLUMN creator_id VARCHAR(64)
--   ALTER TABLE t_product_warehousing ADD COLUMN creator_name VARCHAR(128)
--
-- 幂等写法（P0 铁律 1 / D-004）：
--   information_schema 检查列是否存在，只在不存在时才 ADD；
--   注释用独立 ALTER TABLE 语句回填（禁止在动态 SQL 内写 COMMENT）

-- =============================================
-- 1. 检查并添加 creator_id 列
-- =============================================
SET @col_exists = (SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_product_warehousing'
      AND COLUMN_NAME = 'creator_id');
SET @s_add1 = IF(@col_exists = 0,
    'ALTER TABLE t_product_warehousing ADD COLUMN creator_id VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt_add1 FROM @s_add1; EXECUTE stmt_add1; DEALLOCATE PREPARE stmt_add1;

-- =============================================
-- 2. 检查并添加 creator_name 列
-- =============================================
SET @col_exists = (SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_product_warehousing'
      AND COLUMN_NAME = 'creator_name');
SET @s_add2 = IF(@col_exists = 0,
    'ALTER TABLE t_product_warehousing ADD COLUMN creator_name VARCHAR(128) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt_add2 FROM @s_add2; EXECUTE stmt_add2; DEALLOCATE PREPARE stmt_add2;

-- =============================================
-- 3. 回填列注释（D-004：禁止在动态 SQL 内写 COMMENT）
-- =============================================
ALTER TABLE t_product_warehousing MODIFY COLUMN creator_id VARCHAR(64) DEFAULT NULL COMMENT '创建人ID（FieldFill.INSERT）';
ALTER TABLE t_product_warehousing MODIFY COLUMN creator_name VARCHAR(128) DEFAULT NULL COMMENT '创建人姓名';

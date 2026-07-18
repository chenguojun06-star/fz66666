-- ============================================================
-- 为BOM清单新增"部位"字段，支持套装/亲子装/拼接款按部位分组管理
-- 部位编码引用 t_dict 词典 garment_part（V20260505001已种子）
-- 历史 group_name 字段废弃但保留（向后兼容），新增 part_code/part_name 正式启用
-- 历史BOM数据全部默认"整件"（GARMENT_PART_WHOLE）
-- 关联铁律：P0 #1 Flyway强制 / 多租户隔离（本表已有tenant_id）
-- ============================================================

-- ① t_style_bom 新增部位字段
-- 幂等写法：用 information_schema 检查列是否存在，避免重复添加报错
DROP PROCEDURE IF EXISTS `proc_add_bom_part_columns`;
DELIMITER $$
CREATE PROCEDURE `proc_add_bom_part_columns`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_style_bom'
                     AND COLUMN_NAME = 'part_code') THEN
        ALTER TABLE `t_style_bom`
            ADD COLUMN `part_code` VARCHAR(32) DEFAULT NULL COMMENT '部位编码（引用t_dict.dict_type=garment_part，如GARMENT_PART_UPPER）'
            AFTER `group_name`;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_style_bom'
                     AND COLUMN_NAME = 'part_name') THEN
        ALTER TABLE `t_style_bom`
            ADD COLUMN `part_name` VARCHAR(32) DEFAULT NULL COMMENT '部位名称（冗余字段，便于展示，如：上装）'
            AFTER `part_code`;
    END IF;
END$$
DELIMITER ;
CALL `proc_add_bom_part_columns`();
DROP PROCEDURE IF EXISTS `proc_add_bom_part_columns`;

-- ② t_cutting_bom 新增部位字段
DROP PROCEDURE IF EXISTS `proc_add_cutting_bom_part_columns`;
DELIMITER $$
CREATE PROCEDURE `proc_add_cutting_bom_part_columns`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_cutting_bom'
                     AND COLUMN_NAME = 'part_code') THEN
        ALTER TABLE `t_cutting_bom`
            ADD COLUMN `part_code` VARCHAR(32) DEFAULT NULL COMMENT '部位编码（引用t_dict.dict_type=garment_part）'
            AFTER `material_type`;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_cutting_bom'
                     AND COLUMN_NAME = 'part_name') THEN
        ALTER TABLE `t_cutting_bom`
            ADD COLUMN `part_name` VARCHAR(32) DEFAULT NULL COMMENT '部位名称（冗余字段，便于展示）'
            AFTER `part_code`;
    END IF;
END$$
DELIMITER ;
CALL `proc_add_cutting_bom_part_columns`();
DROP PROCEDURE IF EXISTS `proc_add_cutting_bom_part_columns`;

-- ③ 历史数据回填：所有BOM默认"整件"
-- 幂等：只在 part_code 为空时回填，可重复执行
UPDATE `t_style_bom`
SET `part_code` = 'GARMENT_PART_WHOLE',
    `part_name` = '整件'
WHERE `part_code` IS NULL OR TRIM(`part_code`) = '';

UPDATE `t_cutting_bom`
SET `part_code` = 'GARMENT_PART_WHOLE',
    `part_name` = '整件'
WHERE `part_code` IS NULL OR TRIM(`part_code`) = '';

-- ④ 部位字段索引（便于按部位筛选）
-- MySQL 8.0 不支持 CREATE INDEX IF NOT EXISTS，用 information_schema 检查
DROP PROCEDURE IF EXISTS `proc_add_bom_part_index`;
DELIMITER $$
CREATE PROCEDURE `proc_add_bom_part_index`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_style_bom'
                     AND INDEX_NAME = 'idx_style_bom_part_code') THEN
        ALTER TABLE `t_style_bom` ADD INDEX `idx_style_bom_part_code` (`tenant_id`, `part_code`);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_cutting_bom'
                     AND INDEX_NAME = 'idx_cutting_bom_part_code') THEN
        ALTER TABLE `t_cutting_bom` ADD INDEX `idx_cutting_bom_part_code` (`tenant_id`, `part_code`);
    END IF;
END$$
DELIMITER ;
CALL `proc_add_bom_part_index`();
DROP PROCEDURE IF EXISTS `proc_add_bom_part_index`;

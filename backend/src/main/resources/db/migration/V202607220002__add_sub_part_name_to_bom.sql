-- ============================================================
-- 为BOM清单新增"子部位"字段，支持多面料拼接款（如上装-袖口/领子/门襟）
-- 与 part_code（主部位）配合形成两级部位：
--   主部位 part_code：整件/上装/马甲/下装/里布（garment_part 词典）
--   子部位 sub_part_name：袖口/领子/门襟/下摆等（garment_sub_part 词典，自由文本可扩展）
-- 关联铁律：P0 #1 Flyway强制
-- ============================================================

-- ① t_style_bom 新增 sub_part_name 字段
DROP PROCEDURE IF EXISTS `proc_add_bom_sub_part`;
DELIMITER $$
CREATE PROCEDURE `proc_add_bom_sub_part`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_style_bom'
                     AND COLUMN_NAME = 'sub_part_name') THEN
        ALTER TABLE `t_style_bom`
            ADD COLUMN `sub_part_name` VARCHAR(64) DEFAULT NULL COMMENT '子部位名称（如：袖口、领子、门襟、下摆；为空表示主部位整件使用）'
            AFTER `part_name`;
    END IF;
END$$
DELIMITER ;
CALL `proc_add_bom_sub_part`();
DROP PROCEDURE IF EXISTS `proc_add_bom_sub_part`;

-- ② t_cutting_bom 新增 sub_part_name 字段
DROP PROCEDURE IF EXISTS `proc_add_cutting_bom_sub_part`;
DELIMITER $$
CREATE PROCEDURE `proc_add_cutting_bom_sub_part`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_cutting_bom'
                     AND COLUMN_NAME = 'sub_part_name') THEN
        ALTER TABLE `t_cutting_bom`
            ADD COLUMN `sub_part_name` VARCHAR(64) DEFAULT NULL COMMENT '子部位名称（如：袖口、领子、门襟、下摆）'
            AFTER `part_name`;
    END IF;
END$$
DELIMITER ;
CALL `proc_add_cutting_bom_sub_part`();
DROP PROCEDURE IF EXISTS `proc_add_cutting_bom_sub_part`;

-- ③ 种子子部位词典 garment_sub_part（袖口/领子/门襟等常见细分部位）
-- 词典可动态扩展，DictAutoComplete 组件支持自由输入+自动收录
INSERT IGNORE INTO `t_dict` (dict_type, dict_code, dict_label, dict_value, sort, status, create_time)
VALUES
  ('garment_sub_part', 'SUB_PART_BODY',     '衣身',   'SUB_PART_BODY',     10, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_SLEEVE',   '袖子',   'SUB_PART_SLEEVE',   20, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_CUFF',     '袖口',   'SUB_PART_CUFF',     30, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_COLLAR',   '领子',   'SUB_PART_COLLAR',   40, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_PLACKET',  '门襟',   'SUB_PART_PLACKET',  50, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_HEM',      '下摆',   'SUB_PART_HEM',      60, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_POCKET',   '口袋',   'SUB_PART_POCKET',   70, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_WAISTBAND','腰头',   'SUB_PART_WAISTBAND',80, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_LEG',      '裤腿',   'SUB_PART_LEG',      90, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_LEGHOLE',  '裤脚',   'SUB_PART_LEGHOLE', 100, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_FRONT',    '前片',   'SUB_PART_FRONT',   110, 'ENABLED', NOW()),
  ('garment_sub_part', 'SUB_PART_BACK',     '后片',   'SUB_PART_BACK',    120, 'ENABLED', NOW());

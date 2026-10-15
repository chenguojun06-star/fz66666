-- D-800：款式主图组（支持 5 张，第 1 张为主图）
--
-- 背景：淘宝 / 拼多多 / 天猫的商品主图均为 5 张，第 1 张作为搜索结果展示图。
-- 现有 t_style_info.cover 是单值 VARCHAR，只能放 1 张，运营无法上传多张主图。
--
-- 设计要点：
--   ① 用 JSON 数组存（TEXT），不新建关联表 —— 主图是款式的固有属性，
--      没有独立的生命周期（不单独审批/下架），拆表反而增加一致性成本。
--   ② **不改 cover 字段** —— C 端列表卡片、商品列表缩略图、
--      款式图列工厂（styleImageColumns）等大量代码都在读 cover，
--      改它等于全链路返工。约定：cover_group[0] 即 cover，两者由后端保证同步。
--   ③ 历史数据不迁移 —— cover_group 初始为空时，C 端与前端一律回退读 cover，
--      老款式零影响，无需回填。
--   ④ 幂等：先查 INFORMATION_SCHEMA 再决定是否 ALTER。

SET @schema = DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 't_style_info'
    AND COLUMN_NAME = 'cover_group'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `cover_group` TEXT NULL COMMENT ''主图组JSON数组，最多5张，第1张为主图；为空时回退读cover''',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
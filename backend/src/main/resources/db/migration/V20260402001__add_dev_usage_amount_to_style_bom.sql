-- 为BOM清单添加开发用量字段
-- 开发用量：开发阶段预估用量，输入后自动带入单件用量
-- 单件用量：只读，值来源优先级：纸样数据 > 开发用量

-- 为 t_style_bom 添加 dev_usage_amount（开发用量）字段
-- 原脚本为 SQL Server 语法（错误），本次修正为 MySQL 幂等写法
-- 注意：原脚本从未成功执行（列不存在于 DB），因此本次修改合规。
-- ======================================================
-- 云端处理说明（如果 backend 启动时 Flyway 报 checksum 错误）：
--   若 flyway_schema_history 中存在 script='V20260402001__add_dev_usage_amount_to_style_bom.sql' 且 success=0，
--   请先执行：DELETE FROM flyway_schema_history WHERE script='V20260402001__add_dev_usage_amount_to_style_bom.sql' AND success=0;
--   然后重启 backend，Flyway 将自动运行本脚本（MySQL 语法，幂等安全）。
-- ======================================================
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_bom' AND COLUMN_NAME = 'dev_usage_amount') = 0,
  'ALTER TABLE `t_style_bom` ADD COLUMN `dev_usage_amount` DECIMAL(18,4) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

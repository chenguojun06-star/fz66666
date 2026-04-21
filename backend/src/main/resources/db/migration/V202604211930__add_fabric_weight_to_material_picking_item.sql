-- ============================================================
-- V202604211930 — t_material_picking_item 补加 fabric_weight 列
-- 根因：Entity 字段 fabricWeight 早于本次脚本加入，但之前所有迁移脚本
--       （V202604211800、V202608021520）均遗漏此列，导致 MyBatis 整实体查询
--       SELECT ... fabric_weight ... 抛出 Unknown column 500。
-- 影响接口：
--   GET /api/production/material/stock/alerts（每60s定时轮询）
--   GET /api/production/picking/list
-- 规则：幂等 INFORMATION_SCHEMA 判断，动态 SQL 内禁止 COMMENT
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE()
               AND TABLE_NAME='t_material_picking_item'
               AND COLUMN_NAME='fabric_weight')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `fabric_weight` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

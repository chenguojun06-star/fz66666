-- V202606181001: 添加 safety_stock 安全库存字段到 t_material_stock 表
-- 修复 MenuBadgeCountController 查询 "quantity < safety_stock" 导致的 500 错误
-- Entity MaterialStock.safetyStock 已定义，但 Flyway 迁移遗漏了该列

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_stock'
       AND COLUMN_NAME = 'safety_stock') = 0,
    'ALTER TABLE `t_material_stock` ADD COLUMN `safety_stock` INT DEFAULT 100 COMMENT ''安全库存（低于此值触发库存预警）'' AFTER `version`',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

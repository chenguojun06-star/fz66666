-- 为 t_factory_shipment 添加实际到货数量列（点货数量，可与发货数量不一致）
-- 幂等写法：MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，使用 INFORMATION_SCHEMA 守卫
-- 注意：该列在部分历史环境已通过其他途径添加，本脚本必须幂等以兼容存量数据库
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE()
              AND TABLE_NAME='t_factory_shipment'
              AND COLUMN_NAME='received_quantity');
SET @s = IF(@col=0,
    'ALTER TABLE t_factory_shipment ADD COLUMN received_quantity INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 将 t_factory.factory_code 的全局 UNIQUE 约束改为 (tenant_id, factory_code) 复合唯一约束
-- 不同租户可以使用相同的供应商编码（租户级唯一）
-- 幂等脚本：可多次执行，不会报错

-- Step 1: 确保 tenant_id 列存在
SET @add_tenant_id = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_factory'
       AND COLUMN_NAME = 'tenant_id') = 0,
    'ALTER TABLE `t_factory` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @add_tenant_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: 删除 factory_code 列上的全局唯一索引（名称可能是 'factory_code' 或 'uq_factory_code'）
SET @drop_factory_code_uniq = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_factory'
       AND INDEX_NAME = 'factory_code'
       AND NON_UNIQUE = 0) > 0,
    'ALTER TABLE `t_factory` DROP INDEX `factory_code`',
    'SELECT 1'
);
PREPARE stmt FROM @drop_factory_code_uniq;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: 添加 (tenant_id, factory_code) 复合唯一索引
SET @add_composite_uniq = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_factory'
       AND INDEX_NAME = 'uq_tenant_factory_code') = 0,
    'ALTER TABLE `t_factory` ADD UNIQUE KEY `uq_tenant_factory_code` (`tenant_id`, `factory_code`)',
    'SELECT 1'
);
PREPARE stmt FROM @add_composite_uniq;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: 确保 tenant_id 有普通索引（加速租户隔离查询）
SET @add_tenant_idx = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_factory'
       AND INDEX_NAME = 'idx_f_tenant_id') = 0,
    'ALTER TABLE `t_factory` ADD INDEX `idx_f_tenant_id` (`tenant_id`)',
    'SELECT 1'
);
PREPARE stmt FROM @add_tenant_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

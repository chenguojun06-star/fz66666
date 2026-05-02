-- 为 t_cutting_bundle 添加 factory_id 字段（支持菲号级工厂隔离）
SET @s = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_bundle' AND COLUMN_NAME = 'factory_id'),
    'ALTER TABLE t_cutting_bundle ADD COLUMN factory_id VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为 t_cutting_task 添加 factory_id 字段（支持裁剪任务级工厂隔离）
SET @s = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_task' AND COLUMN_NAME = 'factory_id'),
    'ALTER TABLE t_cutting_task ADD COLUMN factory_id VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 创建索引加速工厂隔离查询
SET @s = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_bundle' AND INDEX_NAME = 'idx_cb_factory_id'),
    'CREATE INDEX idx_cb_factory_id ON t_cutting_bundle (factory_id)',
    'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_task' AND INDEX_NAME = 'idx_ct_factory_id'),
    'CREATE INDEX idx_ct_factory_id ON t_cutting_task (factory_id)',
    'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

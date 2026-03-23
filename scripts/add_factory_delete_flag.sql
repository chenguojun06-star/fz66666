-- 添加工厂表缺失的 delete_flag 字段（幂等更新）
SET NAMES utf8mb4;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='delete_flag')=0,
    'ALTER TABLE t_factory ADD COLUMN delete_flag TINYINT(1) DEFAULT 0 COMMENT ''删除标记: 0-未删除, 1-已删除''',
    'SELECT ''Column delete_flag already exists in t_factory'' AS msg');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 验证结果
SHOW COLUMNS FROM t_factory LIKE 'delete_flag';

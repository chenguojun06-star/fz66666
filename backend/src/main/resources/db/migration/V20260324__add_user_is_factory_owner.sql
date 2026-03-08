-- V20260324: 为 t_user 表添加 is_factory_owner 字段
-- 用于标记外发工厂的主账号（老板/联系人），每个external工厂只有一个主账号
-- 使用 INFORMATION_SCHEMA 条件判断实现幂等（兼容 MySQL 8.0 不支持 IF NOT EXISTS）

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_user'
       AND COLUMN_NAME = 'is_factory_owner') = 0,
    'ALTER TABLE `t_user` ADD COLUMN `is_factory_owner` TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''是否为外发工厂主账号（每个工厂只有一个）''',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

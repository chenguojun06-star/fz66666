-- V202609151001 使用了 DELIMITER $$ 语法（MySQL 客户端命令，不是合法 SQL），
-- Flyway 的 JDBC 执行器无法解析，导致 ADD COLUMN 存储过程从未被调用。
-- 本脚本采用 SET @s = IF(... INFORMATION_SCHEMA ...) 的幂等写法，不依赖 DELIMITER，
-- 云端 Flyway 自动执行后即可补齐 t_product_sku.version 列。

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_product_sku'
       AND COLUMN_NAME  = 'version') = 0,
    'ALTER TABLE `t_product_sku` ADD COLUMN `version` INT NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

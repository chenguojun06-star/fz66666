-- 为 t_tenant 表新增 enabled_modules 列，用于存储租户开通的菜单路径列表（JSON数组字符串）
-- null = 全部开放（向后兼容），有值时前端按照路径列表过滤侧边栏菜单

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_tenant'
       AND COLUMN_NAME  = 'enabled_modules') = 0,
    'ALTER TABLE `t_tenant` ADD COLUMN `enabled_modules` VARCHAR(2000) NULL COMMENT ''已启用的菜单路径列表(JSON数组), null=全部开放''',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

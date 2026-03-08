-- V20260312: 新增租户类型字段
-- SELF_FACTORY  = 自建工厂（仅自有工厂，无外发管理）
-- HYBRID        = 混合型（自有+外发，默认值，不影响存量租户）
-- BRAND         = 纯品牌（纯外发，无裁剪管理）
-- ⚠️ 改为幂等写法（INFORMATION_SCHEMA 判断），支持 FLYWAY_ENABLED=true 自动执行

SET @s_tenant_type = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_tenant' AND COLUMN_NAME = 'tenant_type') = 0,
    'ALTER TABLE `t_tenant` ADD COLUMN `tenant_type` VARCHAR(30) NOT NULL DEFAULT ''HYBRID'' COMMENT ''租户类型: SELF_FACTORY=自建工厂 HYBRID=自有+外发 BRAND=纯外发品牌'' AFTER `remark`',
    'SELECT 1'
);
PREPARE stmt FROM @s_tenant_type; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 存量租户全部设为 HYBRID，保持现有权限不变
UPDATE `t_tenant` SET `tenant_type` = 'HYBRID' WHERE `tenant_type` IS NULL OR `tenant_type` = '';

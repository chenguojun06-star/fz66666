-- V202704271320: 统一 t_material_roll.tenant_id 类型为 BIGINT
-- 原因：全系统所有业务表 tenant_id 均为 BIGINT，唯独此表为 VARCHAR(32)
--       导致跨表 JOIN 时 MySQL 隐式类型转换，索引不生效
-- 参考：V20260412001 已对 t_material_pickup_record 做过同样修复
-- 安全：已有数据均为数字字符串，MODIFY COLUMN 会自动转换

ALTER TABLE `t_material_roll`
    MODIFY COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID，多租户数据隔离';

-- 重建索引以适配新类型（MODIFY COLUMN 后原索引仍有效，但显式重建更安全）
-- ALTER TABLE `t_material_roll` DROP INDEX `idx_tenant_id`;
-- ALTER TABLE `t_material_roll` ADD INDEX `idx_tenant_id` (`tenant_id`);

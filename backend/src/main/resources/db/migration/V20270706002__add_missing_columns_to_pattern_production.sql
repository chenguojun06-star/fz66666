-- ============================================================
-- 标题：补齐 t_pattern_production 缺失字段
-- 背景：Entity 已有 maintainer/maintainTime/receiverId/patternMakerId/tenantId 字段，
--      但 Flyway 历史迁移未添加这 5 个字段，新环境部署会报 Unknown column 错误。
-- 策略：使用 INFORMATION_SCHEMA + 存储过程实现幂等列添加，符合 P0 #1 规范。
-- 关联：P0 #1 Flyway 强制幂等；P0 #4 多租户隔离
-- ============================================================

-- 1. maintainer 维护人
DROP PROCEDURE IF EXISTS proc_add_maintainer_to_pattern_production;
DELIMITER //
CREATE PROCEDURE proc_add_maintainer_to_pattern_production()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_pattern_production'
                     AND COLUMN_NAME = 'maintainer') THEN
        ALTER TABLE `t_pattern_production` ADD COLUMN `maintainer` VARCHAR(100) DEFAULT NULL COMMENT '维护人';
    END IF;
END //
DELIMITER ;
CALL proc_add_maintainer_to_pattern_production();
DROP PROCEDURE IF EXISTS proc_add_maintainer_to_pattern_production;

-- 2. maintain_time 维护时间
DROP PROCEDURE IF EXISTS proc_add_maintain_time_to_pattern_production;
DELIMITER //
CREATE PROCEDURE proc_add_maintain_time_to_pattern_production()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_pattern_production'
                     AND COLUMN_NAME = 'maintain_time') THEN
        ALTER TABLE `t_pattern_production` ADD COLUMN `maintain_time` DATETIME DEFAULT NULL COMMENT '维护时间';
    END IF;
END //
DELIMITER ;
CALL proc_add_maintain_time_to_pattern_production();
DROP PROCEDURE IF EXISTS proc_add_maintain_time_to_pattern_production;

-- 3. receiver_id 领取人ID
DROP PROCEDURE IF EXISTS proc_add_receiver_id_to_pattern_production;
DELIMITER //
CREATE PROCEDURE proc_add_receiver_id_to_pattern_production()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_pattern_production'
                     AND COLUMN_NAME = 'receiver_id') THEN
        ALTER TABLE `t_pattern_production` ADD COLUMN `receiver_id` VARCHAR(64) DEFAULT NULL COMMENT '领取人ID';
    END IF;
END //
DELIMITER ;
CALL proc_add_receiver_id_to_pattern_production();
DROP PROCEDURE IF EXISTS proc_add_receiver_id_to_pattern_production;

-- 4. pattern_maker_id 纸样师傅ID
DROP PROCEDURE IF EXISTS proc_add_pattern_maker_id_to_pattern_production;
DELIMITER //
CREATE PROCEDURE proc_add_pattern_maker_id_to_pattern_production()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_pattern_production'
                     AND COLUMN_NAME = 'pattern_maker_id') THEN
        ALTER TABLE `t_pattern_production` ADD COLUMN `pattern_maker_id` VARCHAR(64) DEFAULT NULL COMMENT '纸样师傅ID';
    END IF;
END //
DELIMITER ;
CALL proc_add_pattern_maker_id_to_pattern_production();
DROP PROCEDURE IF EXISTS proc_add_pattern_maker_id_to_pattern_production;

-- 5. tenant_id 租户ID（P0 #4 多租户隔离必需字段）
DROP PROCEDURE IF EXISTS proc_add_tenant_id_to_pattern_production;
DELIMITER //
CREATE PROCEDURE proc_add_tenant_id_to_pattern_production()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 't_pattern_production'
                     AND COLUMN_NAME = 'tenant_id') THEN
        ALTER TABLE `t_pattern_production` ADD COLUMN `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID';
        ALTER TABLE `t_pattern_production` ADD INDEX `idx_pp_tenant_id` (`tenant_id`);
    END IF;
END //
DELIMITER ;
CALL proc_add_tenant_id_to_pattern_production();
DROP PROCEDURE IF EXISTS proc_add_tenant_id_to_pattern_production;

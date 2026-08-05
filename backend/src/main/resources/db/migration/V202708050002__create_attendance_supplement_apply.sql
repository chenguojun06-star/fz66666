-- ==================================================================
-- V202708050002: 创建补卡申请表 t_attendance_supplement_apply
-- ==================================================================
-- 背景：
--   员工提交补卡申请 → 管理员审批通过/拒绝 → 通过后自动写入 t_work_attendance 打卡记录
--   状态流转：PENDING → APPROVED / REJECTED
--
-- 策略（参考 V202708050001 最佳实践）：
--   1. 用 IF(condition, 'CREATE TABLE ...', 'SELECT 1') + PREPARE/EXECUTE/DEALLOCATE 幂等创建
--   2. 不使用 CONCAT / COMMENT，避免 Flyway SQL 解析器截断
--   3. PREPARE 内不使用字符串字面量（避免 ''xxx'' 静默失败风险），
--      status 字段的 DEFAULT 'PENDING' 由代码层 Orchestrator.submitApply 显式 setStatus 控制
--   4. 多租户安全（P0 铁律4）：强制 tenant_id 字段 + 索引
--   5. 版本号 202708050002 > 202708050001，确保在 t_work_attendance 字段补齐后执行
-- ==================================================================

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_attendance_supplement_apply') = 0,
    'CREATE TABLE `t_attendance_supplement_apply` (
       `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
       `tenant_id` BIGINT NOT NULL,
       `user_id` VARCHAR(64) NOT NULL,
       `user_name` VARCHAR(64) NOT NULL,
       `factory_id` VARCHAR(64) DEFAULT NULL,
       `work_date` DATE NOT NULL,
       `clock_in_time` DATETIME DEFAULT NULL,
       `clock_out_time` DATETIME DEFAULT NULL,
       `reason` VARCHAR(500) DEFAULT NULL,
       `status` VARCHAR(16) NOT NULL,
       `approver_id` VARCHAR(64) DEFAULT NULL,
       `approver_name` VARCHAR(64) DEFAULT NULL,
       `approve_time` DATETIME DEFAULT NULL,
       `approve_remark` VARCHAR(500) DEFAULT NULL,
       `attendance_id` BIGINT DEFAULT NULL,
       `delete_flag` TINYINT DEFAULT 0,
       `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
       `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       UNIQUE KEY `uk_tenant_user_date` (`tenant_id`, `user_id`, `work_date`),
       KEY `idx_tenant_status` (`tenant_id`, `status`),
       KEY `idx_tenant_approver` (`tenant_id`, `approver_id`)
     )',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

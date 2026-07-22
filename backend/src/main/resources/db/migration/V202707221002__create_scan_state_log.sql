-- ==================================================================
-- V202707221002: 创建扫码状态机日志表 t_scan_state_log
-- ==================================================================
-- 背景（P1-2 扫码全流程 LangGraph State Graph + HITL 升级）：
--   当前扫码流程是命令式代码，状态转换散落在多个 Service/Orchestrator，
--   难以追踪和回放。前沿方向（LangGraph 状态图）：
--   用显式状态机定义扫码全流程，每个状态节点可中断（HITL），支持人工审批后继续。
--
-- 策略：information_schema 检查表是否存在，存在则跳过
--   （禁止 IF NOT EXISTS，MySQL 8.0 不支持；安全模板参考 V202707221001）
--   CREATE TABLE 不含 COMMENT（避免 SET @s 引号冲突），COMMENT 用独立 ALTER 追加
-- 多租户安全（P0 铁律4）：
--   表强制 tenant_id NOT NULL + 索引含 tenant_id
-- 关联：P0 #1 Flyway 强制幂等；P0 #4 多租户隔离；P0 #2 事务边界（仅在 Orchestrator 层）
-- ==================================================================

-- ── 1. 幂等建表（若已存在则跳过；CREATE TABLE 不含 COMMENT，避免 SET @s 引号冲突） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_scan_state_log') = 0,
    'CREATE TABLE `t_scan_state_log` ( `id` BIGINT NOT NULL AUTO_INCREMENT, `tenant_id` BIGINT NOT NULL, `bundle_id` BIGINT NOT NULL, `from_state` VARCHAR(32) DEFAULT NULL, `to_state` VARCHAR(32) NOT NULL, `operator` VARCHAR(64) DEFAULT NULL, `reason` VARCHAR(256) DEFAULT NULL, `approved` TINYINT DEFAULT NULL, `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), KEY `idx_bundle` (`tenant_id`, `bundle_id`, `create_time`), KEY `idx_tenant_state` (`tenant_id`, `to_state`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. 追加表级 COMMENT（独立语句，不在 SET @s 内） ──
ALTER TABLE `t_scan_state_log` COMMENT '扫码状态机日志（P1-2 LangGraph State Graph）';

-- ── 3. 追加列级 COMMENT（独立 ALTER MODIFY，不在 SET @s 内，幂等可重复执行） ──
ALTER TABLE `t_scan_state_log` MODIFY COLUMN `tenant_id` BIGINT NOT NULL COMMENT '租户ID（P0铁律4）';
ALTER TABLE `t_scan_state_log` MODIFY COLUMN `bundle_id` BIGINT NOT NULL COMMENT '裁剪菲号ID';
ALTER TABLE `t_scan_state_log` MODIFY COLUMN `from_state` VARCHAR(32) DEFAULT NULL COMMENT '原状态（首次为NULL）';
ALTER TABLE `t_scan_state_log` MODIFY COLUMN `to_state` VARCHAR(32) NOT NULL COMMENT '目标状态';
ALTER TABLE `t_scan_state_log` MODIFY COLUMN `operator` VARCHAR(64) DEFAULT NULL COMMENT '操作人';
ALTER TABLE `t_scan_state_log` MODIFY COLUMN `reason` VARCHAR(256) DEFAULT NULL COMMENT '转换原因';
ALTER TABLE `t_scan_state_log` MODIFY COLUMN `approved` TINYINT DEFAULT NULL COMMENT 'HITL审批结果（NULL=非HITL；1=通过；0=拒绝）';
ALTER TABLE `t_scan_state_log` MODIFY COLUMN `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

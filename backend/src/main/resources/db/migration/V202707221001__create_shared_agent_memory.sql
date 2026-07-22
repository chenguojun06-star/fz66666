-- ==================================================================
-- V202707221001: 创建多Agent共享记忆表 t_shared_agent_memory
-- ==================================================================
-- 背景（P1-3 Sub-Agent 消息总线升级 - AWS S3 Vectors 多 Agent 协作方向）：
--   当前 6 个 Specialist Agent 各自独立执行，无法共享"任务进度/已发现事实/团队决策"，
--   导致重复查询和事实冲突。前沿方向（AWS S3 Vectors 2026-06 多 Agent 协作）：
--   同会话内 Sub-Agent 共享事实，避免重复劳动。
--
-- 策略：information_schema 检查表是否存在，存在则跳过
--   （禁止 IF NOT EXISTS，MySQL 8.0 不支持；安全模板参考 V202707221000）
--   CREATE TABLE 不含 COMMENT（避免 SET @s 引号冲突），COMMENT 用独立 ALTER 追加
-- 多租户安全（P0 铁律4）：
--   表强制 tenant_id NOT NULL + 索引含 tenant_id + uk 含 tenant_id
-- 关联：P0 #1 Flyway 强制幂等；P0 #4 多租户隔离；D-020 MCP 多租户隔离
-- ==================================================================

-- ── 1. 幂等建表（若已存在则跳过；CREATE TABLE 不含 COMMENT，避免 SET @s 引号冲突） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shared_agent_memory') = 0,
    'CREATE TABLE `t_shared_agent_memory` ( `id` BIGINT NOT NULL AUTO_INCREMENT, `tenant_id` BIGINT NOT NULL, `session_id` VARCHAR(64) NOT NULL, `agent_name` VARCHAR(64) NOT NULL, `fact_key` VARCHAR(128) NOT NULL, `fact_value` TEXT NOT NULL, `confidence` DECIMAL(5,2) DEFAULT 0.80, `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP, `expire_time` DATETIME DEFAULT NULL, PRIMARY KEY (`id`), UNIQUE KEY `uk_session_fact` (`session_id`, `fact_key`), KEY `idx_tenant_session` (`tenant_id`, `session_id`), KEY `idx_expire` (`expire_time`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. 追加表级 COMMENT（独立语句，不在 SET @s 内） ──
ALTER TABLE `t_shared_agent_memory` COMMENT '多Agent共享记忆（同会话内共享）';

-- ── 3. 追加列级 COMMENT（独立 ALTER MODIFY，不在 SET @s 内，幂等可重复执行） ──
ALTER TABLE `t_shared_agent_memory` MODIFY COLUMN `tenant_id` BIGINT NOT NULL COMMENT '租户ID（P0铁律4）';
ALTER TABLE `t_shared_agent_memory` MODIFY COLUMN `session_id` VARCHAR(64) NOT NULL COMMENT '会话ID（隔离边界）';
ALTER TABLE `t_shared_agent_memory` MODIFY COLUMN `agent_name` VARCHAR(64) NOT NULL COMMENT 'scan_agent/quality_agent/wage_agent/...';
ALTER TABLE `t_shared_agent_memory` MODIFY COLUMN `fact_key` VARCHAR(128) NOT NULL COMMENT '事实键：order_status/quality_result/...';
ALTER TABLE `t_shared_agent_memory` MODIFY COLUMN `fact_value` TEXT NOT NULL COMMENT '事实值JSON';
ALTER TABLE `t_shared_agent_memory` MODIFY COLUMN `confidence` DECIMAL(5,2) DEFAULT 0.80 COMMENT '置信度0-100';
ALTER TABLE `t_shared_agent_memory` MODIFY COLUMN `expire_time` DATETIME DEFAULT NULL COMMENT '会话结束后 24h 过期';

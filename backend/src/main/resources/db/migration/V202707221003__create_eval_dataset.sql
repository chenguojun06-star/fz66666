-- ==================================================================
-- V202707221003: 创建离线评估数据集 t_eval_dataset + t_eval_item
-- ==================================================================
-- 背景（P1-4 离线评估 dataset 升级，Langfuse/Eval 框架方向）：
--   当前 AI 回答质量只靠 SelfCritic 实时评分，无离线评估机制，
--   无法系统性回放历史对话、对比模型版本、追踪质量趋势。
--   前沿方向（Langfuse 28.4k star 离线评估）：定时采样历史对话，
--   用评估器跑离线评分，生成质量趋势报告。
--
-- 策略：information_schema 检查表是否存在，存在则跳过
--   （禁止 IF NOT EXISTS，MySQL 8.0 不支持；安全模板参考 V202707221001/V202707221002）
--   CREATE TABLE 不含 COMMENT（避免 SET @s 引号冲突），COMMENT 用独立 ALTER 追加
-- 多租户安全（P0 铁律4）：
--   两表强制 tenant_id NOT NULL + 索引含 tenant_id
-- 关联：P0 #1 Flyway 强制幂等；P0 #4 多租户隔离；P0 #2 事务边界（仅在 Orchestrator 层）
-- ==================================================================

-- ── 1. 幂等建表 t_eval_dataset（若已存在则跳过；CREATE TABLE 不含 COMMENT，避免 SET @s 引号冲突） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_eval_dataset') = 0,
    'CREATE TABLE `t_eval_dataset` ( `id` BIGINT NOT NULL AUTO_INCREMENT, `tenant_id` BIGINT NOT NULL, `dataset_name` VARCHAR(128) NOT NULL, `description` VARCHAR(512) DEFAULT NULL, `dataset_type` VARCHAR(32) NOT NULL, `item_count` INT DEFAULT 0, `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP, `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`id`), KEY `idx_tenant_type` (`tenant_id`, `dataset_type`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. 幂等建表 t_eval_item（若已存在则跳过） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_eval_item') = 0,
    'CREATE TABLE `t_eval_item` ( `id` BIGINT NOT NULL AUTO_INCREMENT, `tenant_id` BIGINT NOT NULL, `dataset_id` BIGINT NOT NULL, `session_id` VARCHAR(64) DEFAULT NULL, `user_message` TEXT NOT NULL, `expected_answer` TEXT, `actual_answer` TEXT, `score` DECIMAL(5,2) DEFAULT NULL, `score_dimensions` TEXT, `evaluator` VARCHAR(32) DEFAULT NULL, `evaluated` TINYINT DEFAULT 0, `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), KEY `idx_dataset` (`tenant_id`, `dataset_id`, `evaluated`), KEY `idx_tenant_eval` (`tenant_id`, `evaluated`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. 追加表级 COMMENT（独立语句，不在 SET @s 内） ──
ALTER TABLE `t_eval_dataset` COMMENT '离线评估数据集';
ALTER TABLE `t_eval_item` COMMENT '离线评估数据项';

-- ── 4. 追加列级 COMMENT（独立 ALTER MODIFY，不在 SET @s 内，幂等可重复执行） ──
ALTER TABLE `t_eval_dataset` MODIFY COLUMN `tenant_id` BIGINT NOT NULL COMMENT '租户ID（P0铁律4）';
ALTER TABLE `t_eval_dataset` MODIFY COLUMN `dataset_name` VARCHAR(128) NOT NULL COMMENT '数据集名称';
ALTER TABLE `t_eval_dataset` MODIFY COLUMN `description` VARCHAR(512) DEFAULT NULL COMMENT '描述';
ALTER TABLE `t_eval_dataset` MODIFY COLUMN `dataset_type` VARCHAR(32) NOT NULL COMMENT '数据集类型：CONVERSATION/TOOL_CALL/SCAN_FLOW';
ALTER TABLE `t_eval_dataset` MODIFY COLUMN `item_count` INT DEFAULT 0 COMMENT '数据项数量';
ALTER TABLE `t_eval_dataset` MODIFY COLUMN `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE `t_eval_dataset` MODIFY COLUMN `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `t_eval_item` MODIFY COLUMN `tenant_id` BIGINT NOT NULL COMMENT '租户ID（P0铁律4）';
ALTER TABLE `t_eval_item` MODIFY COLUMN `dataset_id` BIGINT NOT NULL COMMENT '数据集ID';
ALTER TABLE `t_eval_item` MODIFY COLUMN `session_id` VARCHAR(64) DEFAULT NULL COMMENT '会话ID（采样来源）';
ALTER TABLE `t_eval_item` MODIFY COLUMN `user_message` TEXT NOT NULL COMMENT '用户问题';
ALTER TABLE `t_eval_item` MODIFY COLUMN `expected_answer` TEXT COMMENT '期望答案（人工标注）';
ALTER TABLE `t_eval_item` MODIFY COLUMN `actual_answer` TEXT COMMENT 'AI实际答案';
ALTER TABLE `t_eval_item` MODIFY COLUMN `score` DECIMAL(5,2) DEFAULT NULL COMMENT '评估得分0-100';
ALTER TABLE `t_eval_item` MODIFY COLUMN `score_dimensions` TEXT COMMENT '多维度评分JSON';
ALTER TABLE `t_eval_item` MODIFY COLUMN `evaluator` VARCHAR(32) DEFAULT NULL COMMENT '评估器名称';
ALTER TABLE `t_eval_item` MODIFY COLUMN `evaluated` TINYINT DEFAULT 0 COMMENT '是否已评估：0=未评估，1=已评估';
ALTER TABLE `t_eval_item` MODIFY COLUMN `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

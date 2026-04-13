-- V20260413001: AI定时任务执行日志表（hotfix版，消除云端启动异常）
-- 原脚本 V202608151000 版本号过新被跳过，此为提前补救脚本（版本号为当前日期）
-- 幂等安全：CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS `t_ai_job_run_log` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `job_name`        VARCHAR(100)  NOT NULL                COMMENT '任务类名（如 AiPatrolOrchestrator）',
  `method_name`     VARCHAR(100)  DEFAULT NULL            COMMENT '方法名（如 schedulePatrol）',
  `start_time`      DATETIME      NOT NULL                COMMENT '任务开始时间',
  `duration_ms`     BIGINT        DEFAULT NULL            COMMENT '执行耗时(毫秒)',
  `status`          VARCHAR(20)   NOT NULL                COMMENT 'SUCCESS | FAILED | SKIPPED',
  `tenant_count`    INT           DEFAULT NULL            COMMENT '本次处理的租户数量（迭代多租户的任务填写）',
  `result_summary`  VARCHAR(500)  DEFAULT NULL            COMMENT '执行结果摘要，如"共处理3个租户,生成5条信号"',
  `error_message`   TEXT          DEFAULT NULL            COMMENT '失败时的错误信息',
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_job_start` (`job_name`, `start_time`),
  INDEX `idx_start_time` (`start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI定时任务执行日志';

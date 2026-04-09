-- V202608081200 — 补建 t_order_remark 表
-- 背景：V202608021400 因云端 Flyway 链断裂（早期脚本 COMMENT '' 语法 Silent failure）
--       从未在云端执行，导致 t_order_remark 表不存在，/api/system/order-remark/list 持续 500。
-- 策略：直接 CREATE TABLE IF NOT EXISTS（无 PREPARE/EXECUTE 包裹），
--       表已存在则静默跳过，安全幂等。

CREATE TABLE IF NOT EXISTS `t_order_remark` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `target_type` VARCHAR(20)  NOT NULL,
  `target_no`   VARCHAR(100) NOT NULL,
  `author_id`   VARCHAR(64)  DEFAULT NULL,
  `author_name` VARCHAR(100) DEFAULT NULL,
  `author_role` VARCHAR(100) DEFAULT NULL,
  `content`     TEXT         NOT NULL,
  `tenant_id`   BIGINT       NOT NULL,
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delete_flag` INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `idx_remark_target` (`tenant_id`, `target_type`, `target_no`),
  INDEX `idx_remark_time`   (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

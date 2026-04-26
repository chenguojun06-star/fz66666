-- ─────────────────────────────────────────────────────────────────────────────
-- V202612040000  高风险 AI 工具调用审计表
--
-- 目的：
--   1) 修复内存 ConcurrentHashMap 单实例缺陷（重启 / 多 Pod 部署丢失 pending 记录）
--   2) 修复 args 仅前 32 字符取样导致的"假命中通过"绕过审批 bug
--   3) 补齐企业级合规要求的高风险操作审计追溯能力
--
-- 状态机：PENDING → APPROVED → EXECUTED  (正常路径)
--               └─→ REJECTED              (用户拒绝)
--               └─→ EXPIRED               (60秒未确认自动过期)
--
-- 注意（铁律）：
--   1) 严禁使用 SET @s = IF(... 'ALTER ... COMMENT ''xxx'' '...) 形式 (Flyway 解析器
--      会把第一个 '' 当字符串结束符，导致 ALTER 被截断 → 列永远不会被添加)
--   2) 字段注释只在 .sql 文件的 -- 行注释里描述, 不要放进动态 SQL 字符串
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `t_intelligence_high_risk_audit` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT,
    `tenant_id`      BIGINT           NULL,
    `user_id`        VARCHAR(64)      NULL,
    `user_name`      VARCHAR(64)      NULL,
    `tool_name`      VARCHAR(64)  NOT NULL,
    -- args_hash 使用 SHA-256 全量哈希（64 hex chars），替代旧版仅取前 32 字符的脆弱键
    `args_hash`      CHAR(64)     NOT NULL,
    -- args 原始字符串前 500 字符预览（用于审计回看，过长截断）
    `args_preview`   VARCHAR(500)     NULL,
    -- 状态：PENDING / APPROVED / REJECTED / EXECUTED / EXPIRED
    `status`         VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `decided_at`     DATETIME         NULL,
    `executed_at`    DATETIME         NULL,
    `elapsed_ms`     BIGINT           NULL,
    `success`        TINYINT(1)       NULL,
    `result_preview` VARCHAR(500)     NULL,
    `error_message`  VARCHAR(500)     NULL,
    PRIMARY KEY (`id`),
    KEY `idx_hra_tenant_user_time` (`tenant_id`, `user_id`, `created_at`),
    KEY `idx_hra_args_hash_status` (`args_hash`, `status`),
    KEY `idx_hra_tool_status_time` (`tool_name`, `status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

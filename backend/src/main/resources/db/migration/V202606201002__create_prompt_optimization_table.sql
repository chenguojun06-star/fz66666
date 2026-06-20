-- V202606201002: 创建 t_prompt_optimization 表（GEPA 遗传优化记录）
--
-- 背景：
--   借鉴 Hermes Self-Evolution GEPA，把 xiaoyun-base-prompt.yaml 的 17 个上下文块当基因，
--   用遗传算法优化组合。优化结果（个体配置 JSON + 适应度评分 + 代数 + 门控状态）存入此表。
--
-- 用途：
--   - GepaPromptOptimizer.optimizeAsync() 每天离线优化后持久化最优个体
--   - EvolutionOrchestrator.getUnifiedMetrics() 聚合 promptOptimizationFitness 指标
--   - ConstraintGates 验证后的个体 gate_passed=1，未通过的 gate_passed=0
--
-- 幂等写法：使用 information_schema 检查表是否存在（参考 V202606201001 模式）

-- =============================================
-- 1. 检查表是否存在，不存在则创建
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_prompt_optimization');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_prompt_optimization (
        id VARCHAR(32) NOT NULL COMMENT ''主键ID（UUID去横线前32位）'',
        tenant_id BIGINT NOT NULL COMMENT ''租户ID（多租户隔离）'',
        individual_json TEXT NOT NULL COMMENT ''个体配置JSON（genes/generation/fitnessScore）'',
        fitness_score DECIMAL(5,2) NULL DEFAULT NULL COMMENT ''适应度评分（0-100）'',
        generation INT NULL DEFAULT NULL COMMENT ''代数（0-5）'',
        gate_passed TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''是否通过三重门控（0=未通过 1=通过）'',
        applied TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''是否已应用到线上prompt（0=未应用 1=已应用）'',
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''创建时间'',
        PRIMARY KEY (id),
        INDEX idx_tenant_fitness (tenant_id, fitness_score DESC),
        INDEX idx_tenant_applied (tenant_id, applied, create_time DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''GEPA遗传优化记录表''',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

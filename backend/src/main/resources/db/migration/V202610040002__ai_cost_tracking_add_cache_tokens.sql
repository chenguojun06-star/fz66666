-- D-702：t_ai_cost_tracking 增加 DeepSeek 上下文缓存字段
--
-- 背景：调研确认 Prompt Caching 可使 LLM 成本降低 45–80%（arXiv 2601.06007），
-- DeepSeek 缓存命中价约为未命中的 1/10。但项目此前**无法回答「缓存命中率多少」**：
--   · cacheHitTokens / cacheMissTokens 只累计在内存 AtomicLong
--   · 唯一出口是管理端 health 接口，且被 `if (cacheObservedRequests.get() > 0)` 门控
--   · 重启即清零，无历史、无法看趋势、无法定位「什么时候命中率掉了」
--   · 唯一会打印 cacheHit 的日志行被 `shouldRecord()` 门控，而 ai.observability.enabled
--     默认 false、provider 默认 none（线上未配置）→ **那行日志永远不执行**
-- 结果：字段解析了、统计了，但没人看得见，等于没有。
--
-- 本迁移把缓存命中/未命中 token 随每次推理落库，使命中率可查询、可趋势分析，
-- 为后续「prompt 前缀稳定性优化」提供决策依据。
--
-- 列名与实体 camelCase 推导一致：promptCacheHitTokens → prompt_cache_hit_tokens。

-- 加列写成幂等形式（与 V45 / V202709200001 同一写法）：
-- 云端该列若已存在，无条件 ADD COLUMN 会每次都报 Duplicate column name 且迁移永远无法成功。
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_ai_cost_tracking'
               AND COLUMN_NAME  = 'prompt_cache_hit_tokens') = 0,
    'ALTER TABLE `t_ai_cost_tracking` ADD COLUMN `prompt_cache_hit_tokens` INT NOT NULL DEFAULT 0 COMMENT ''Prompt缓存命中token（DeepSeek prompt_cache_hit_tokens）'' AFTER `completion_tokens`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_ai_cost_tracking'
               AND COLUMN_NAME  = 'prompt_cache_miss_tokens') = 0,
    'ALTER TABLE `t_ai_cost_tracking` ADD COLUMN `prompt_cache_miss_tokens` INT NOT NULL DEFAULT 0 COMMENT ''Prompt缓存未命中token（DeepSeek prompt_cache_miss_tokens）'' AFTER `prompt_cache_hit_tokens`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 命中率查询用：按天/场景聚合时避免全表扫描（同为幂等，避免 Duplicate key name）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_ai_cost_tracking'
               AND INDEX_NAME    = 'idx_cost_tracking_cache') = 0,
    'CREATE INDEX `idx_cost_tracking_cache` ON `t_ai_cost_tracking` (`created_at`, `prompt_cache_hit_tokens`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
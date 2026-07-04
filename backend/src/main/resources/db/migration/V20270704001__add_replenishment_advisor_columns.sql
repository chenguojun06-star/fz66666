-- ================================================================
-- V20270704001: AI 补货顾问 Phase 1 —— t_ec_purchase_suggestion 加 4 列
--
-- 背景：
--   聚水潭竞品对标 Phase 1：AI 缺货预警 + 自动转生产建议
--   现有 EcPurchaseSuggestion 只支持"转采购单"，不支持"转生产订单"
--   自有工厂客户收到缺货预警应走"生产"而非"采购"
--   复用现有 tenant.tenant_type 字段区分客户类型（SELF_FACTORY/HYBRID/BRAND）
--
-- 新增字段：
--   suggestion_type   VARCHAR(16)  建议类型 PURCHASE/PRODUCTION（默认 PURCHASE 保持兼容）
--   production_order_id BIGINT     关联生产订单ID（转生产后回填）
--   ai_confidence     INT          AI 置信度 0-100
--   ai_reason         TEXT         AI 推理过程（透明化决策依据）
--
-- 幂等性：所有操作前用 INFORMATION_SCHEMA 检查
-- ================================================================

SET @dbname = DATABASE();

-- suggestion_type
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_ec_purchase_suggestion' AND COLUMN_NAME='suggestion_type');
SET @s = IF(@c=0, 'ALTER TABLE t_ec_purchase_suggestion ADD COLUMN suggestion_type VARCHAR(16) NOT NULL DEFAULT ''PURCHASE'' AFTER status', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- production_order_id
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_ec_purchase_suggestion' AND COLUMN_NAME='production_order_id');
SET @s = IF(@c=0, 'ALTER TABLE t_ec_purchase_suggestion ADD COLUMN production_order_id BIGINT DEFAULT NULL AFTER purchase_order_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ai_confidence
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_ec_purchase_suggestion' AND COLUMN_NAME='ai_confidence');
SET @s = IF(@c=0, 'ALTER TABLE t_ec_purchase_suggestion ADD COLUMN ai_confidence INT DEFAULT NULL AFTER target_days', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ai_reason
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_ec_purchase_suggestion' AND COLUMN_NAME='ai_reason');
SET @s = IF(@c=0, 'ALTER TABLE t_ec_purchase_suggestion ADD COLUMN ai_reason TEXT AFTER ai_confidence', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------
-- 索引：按租户+建议类型+状态查询（AI 补货顾问面板高频查询）
-- ----------------------------------------------------------------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_ec_purchase_suggestion' AND INDEX_NAME='idx_eps_tenant_type_status');
SET @s = IF(@c=0, 'CREATE INDEX idx_eps_tenant_type_status ON t_ec_purchase_suggestion (tenant_id, suggestion_type, status)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

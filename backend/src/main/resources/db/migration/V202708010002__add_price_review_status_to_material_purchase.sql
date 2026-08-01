-- ==================================================================
-- V202708010002: 采购单审价工作流字段
-- ==================================================================
-- 背景：MaterialPurchase 仅有 audit_status（财务初审），缺 price_review_status
--   （提交前审价）。审价能力分散在购物车改价/quick-edit/audit 三处。
--   现新增 price_review_status 状态机，统一审价流程：
--   pending_review（待审价）→ approved（审价通过，采购单可领取）
--                         → rejected（审价拒绝，返回草稿）
--
-- 策略：information_schema 检查列是否存在，存在则跳过
--   （禁止 IF NOT EXISTS，MySQL 8.0 不支持）
--   SET @s 内不含 COMMENT（避免引号冲突导致 Flyway 静默失败），
--   COMMENT 用独立 ALTER MODIFY 追加（幂等可重复执行）
-- 关联：P0 #1 Flyway 强制幂等；P0 #2 事务边界（审价逻辑在 Orchestrator 层）
-- ==================================================================

-- ── 1. price_review_status：审价状态 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_material_purchase'
       AND COLUMN_NAME  = 'price_review_status') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `price_review_status` VARCHAR(32) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE `t_material_purchase` MODIFY COLUMN `price_review_status` VARCHAR(32) DEFAULT NULL COMMENT '审价状态: pending_review=待审价 approved=审价通过 rejected=审价拒绝';

-- ── 2. price_review_reason：审价驳回原因 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_material_purchase'
       AND COLUMN_NAME  = 'price_review_reason') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `price_review_reason` VARCHAR(500) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE `t_material_purchase` MODIFY COLUMN `price_review_reason` VARCHAR(500) DEFAULT NULL COMMENT '审价驳回原因（rejected 时必填）';

-- ── 3. price_review_time：审价操作时间 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_material_purchase'
       AND COLUMN_NAME  = 'price_review_time') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `price_review_time` DATETIME DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE `t_material_purchase` MODIFY COLUMN `price_review_time` DATETIME DEFAULT NULL COMMENT '审价操作时间';

-- ── 4. price_review_operator_id：审价操作人ID ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_material_purchase'
       AND COLUMN_NAME  = 'price_review_operator_id') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `price_review_operator_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE `t_material_purchase` MODIFY COLUMN `price_review_operator_id` VARCHAR(64) DEFAULT NULL COMMENT '审价操作人ID';

-- ── 5. price_review_operator_name：审价操作人姓名 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_material_purchase'
       AND COLUMN_NAME  = 'price_review_operator_name') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `price_review_operator_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE `t_material_purchase` MODIFY COLUMN `price_review_operator_name` VARCHAR(100) DEFAULT NULL COMMENT '审价操作人姓名';

-- ── 6. 索引：加速待审价列表查询（含 tenant_id，P0 铁律4 多租户隔离） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_material_purchase'
       AND INDEX_NAME   = 'idx_tenant_price_review_status') = 0,
    'ALTER TABLE `t_material_purchase` ADD KEY `idx_tenant_price_review_status` (`tenant_id`, `price_review_status`)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

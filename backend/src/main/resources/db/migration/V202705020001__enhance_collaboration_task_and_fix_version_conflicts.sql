-- ============================================================
-- 协作任务闭环增强 — 新增全生命周期管理字段
-- ============================================================
-- 原始版本号 V20260501001 与 add_secondary_process_images 冲突，
-- Flyway 认为 V20260501001 已执行而跳过本脚本，导致所有列从未添加。
-- 版本号必须大于当前 schema 最大版本 202704271319 才会被 Flyway 执行。
-- 修复：去掉 IF NOT EXISTS（MySQL 8.0 不支持），改用 INFORMATION_SCHEMA 幂等模式。
-- 动态SQL内只用 DEFAULT NULL，避免 Flyway SET @s 截断（铁律#11）。
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='task_status')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `task_status` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `t_collaboration_task` SET `task_status` = 'PENDING' WHERE `task_status` IS NULL;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='priority')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `priority` VARCHAR(16) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `t_collaboration_task` SET `priority` = 'MEDIUM' WHERE `priority` IS NULL;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='assignee_name')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `assignee_name` VARCHAR(128) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='acceptance_criteria')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `acceptance_criteria` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='escalated_at')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `escalated_at` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='escalated_to')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `escalated_to` VARCHAR(128) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='source_type')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `source_type` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='source_instruction')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `source_instruction` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='completion_note')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `completion_note` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='completed_at')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `completed_at` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_status')=0,
    'CREATE INDEX `idx_collab_status` ON `t_collaboration_task` (`task_status`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_priority_due')=0,
    'CREATE INDEX `idx_collab_priority_due` ON `t_collaboration_task` (`priority`, `due_at`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_assignee')=0,
    'CREATE INDEX `idx_collab_assignee` ON `t_collaboration_task` (`assignee_name`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_tenant_status')=0,
    'CREATE INDEX `idx_collab_tenant_status` ON `t_collaboration_task` (`tenant_id`, `task_status`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- P1-4: AI 指标看板 — 创建智能指标快照表
-- ============================================================

CREATE TABLE IF NOT EXISTS t_ai_metrics_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT,
    snapshot_date DATE NOT NULL,
    intent_hit_rate DECIMAL(5,2),
    tool_call_success_rate DECIMAL(5,2),
    first_response_accept_rate DECIMAL(5,2),
    manual_override_rate DECIMAL(5,2),
    approval_turnaround_avg_minutes INT,
    total_ai_requests INT,
    total_tool_calls INT,
    total_escalations INT,
    active_collab_tasks INT,
    overdue_collab_tasks INT,
    avg_agent_iterations DECIMAL(4,1),
    cost_estimated_cents INT,
    metrics_json JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_metrics_date (snapshot_date),
    INDEX idx_metrics_tenant_date (tenant_id, snapshot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- P1-5: Agent 执行日志增强 — 新增一致性验证字段
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_audit_log' AND COLUMN_NAME='self_consistency_agreement')=0,
    'ALTER TABLE `t_intelligence_audit_log` ADD COLUMN `self_consistency_agreement` DECIMAL(5,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_audit_log' AND COLUMN_NAME='guard_warnings')=0,
    'ALTER TABLE `t_intelligence_audit_log` ADD COLUMN `guard_warnings` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 补偿：外发工厂发货明细质检/收货字段（原 V20260501002 版本号冲突被跳过）
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail' AND COLUMN_NAME='received_quantity')=0,
    'ALTER TABLE `t_factory_shipment_detail` ADD COLUMN `received_quantity` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail' AND COLUMN_NAME='qualified_quantity')=0,
    'ALTER TABLE `t_factory_shipment_detail` ADD COLUMN `qualified_quantity` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail' AND COLUMN_NAME='defective_quantity')=0,
    'ALTER TABLE `t_factory_shipment_detail` ADD COLUMN `defective_quantity` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail' AND COLUMN_NAME='returned_quantity')=0,
    'ALTER TABLE `t_factory_shipment_detail` ADD COLUMN `returned_quantity` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

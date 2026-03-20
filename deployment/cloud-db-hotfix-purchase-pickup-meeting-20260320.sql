-- 云端热修脚本（2026-03-20）
-- 用途：修复以下接口因缺表/缺列导致的 500
-- 1) GET  /api/production/purchase/list
-- 2) POST /api/warehouse/material-pickup/payment-center/list
-- 3) GET  /api/intelligence/meeting/list
--
-- 执行方式：在云端 SQL 控制台直接执行。
-- 特点：全部使用 INFORMATION_SCHEMA 幂等判断，可重复执行。

-- ==================== 1. t_material_purchase 缺列补齐 ====================
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'evidence_image_urls') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `evidence_image_urls` TEXT DEFAULT NULL COMMENT ''回料确认凭证图片URLs（逗号分隔）''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'fabric_composition') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `fabric_composition` VARCHAR(500) DEFAULT NULL COMMENT ''面料成分（从物料资料库同步）''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'invoice_urls') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `invoice_urls` TEXT DEFAULT NULL COMMENT ''发票/单据图片URL列表(JSON数组)，用于财务留底''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'audit_status') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_status` VARCHAR(32) DEFAULT NULL COMMENT ''初审状态: pending_audit=待初审 passed=初审通过 rejected=初审驳回''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'audit_reason') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_reason` VARCHAR(500) DEFAULT NULL COMMENT ''初审驳回原因''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'audit_time') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_time` DATETIME DEFAULT NULL COMMENT ''初审操作时间''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'audit_operator_id') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_operator_id` VARCHAR(64) DEFAULT NULL COMMENT ''初审操作人ID''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'audit_operator_name') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_operator_name` VARCHAR(100) DEFAULT NULL COMMENT ''初审操作人姓名''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== 2. t_agent_meeting 缺表补齐 ====================
CREATE TABLE IF NOT EXISTS `t_agent_meeting` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
  `meeting_type` VARCHAR(50) NOT NULL COMMENT '例会类型',
  `topic` VARCHAR(300) NOT NULL COMMENT '会议主题',
  `participants` VARCHAR(500) DEFAULT NULL COMMENT '参与Agent列表(JSON数组)',
  `agenda` TEXT DEFAULT NULL COMMENT '议程(JSON数组)',
  `debate_rounds` TEXT DEFAULT NULL COMMENT '辩论轮次(JSON)',
  `consensus` TEXT DEFAULT NULL COMMENT '最终共识',
  `dissent` TEXT DEFAULT NULL COMMENT '保留意见',
  `action_items` TEXT DEFAULT NULL COMMENT '行动项(JSON数组)',
  `confidence_score` INT DEFAULT NULL COMMENT '共识置信度0-100',
  `linked_decision_ids` VARCHAR(500) DEFAULT NULL COMMENT '关联决策记忆ID',
  `linked_rca_ids` VARCHAR(500) DEFAULT NULL COMMENT '关联根因分析ID',
  `duration_ms` BIGINT DEFAULT NULL COMMENT '会议耗时(毫秒)',
  `status` VARCHAR(20) DEFAULT 'concluded' COMMENT 'in_progress|concluded|actions_pending|all_done',
  `delete_flag` INT DEFAULT 0 COMMENT '删除标记',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_am_tenant_type` (`tenant_id`, `meeting_type`),
  KEY `idx_am_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent例会-辩论+共识';

-- ==================== 3. t_material_pickup_record 缺表/缺列补齐 ====================
CREATE TABLE IF NOT EXISTS `t_material_pickup_record` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键UUID',
  `tenant_id` VARCHAR(64) DEFAULT NULL COMMENT '租户ID',
  `pickup_no` VARCHAR(64) NOT NULL COMMENT '领取单号（自动生成）',
  `pickup_type` VARCHAR(20) NOT NULL DEFAULT 'INTERNAL' COMMENT '领取类型：INTERNAL=内部 EXTERNAL=外部',
  `order_no` VARCHAR(100) DEFAULT NULL COMMENT '关联生产订单号',
  `style_no` VARCHAR(100) DEFAULT NULL COMMENT '关联款号',
  `material_id` VARCHAR(64) DEFAULT NULL COMMENT '物料ID',
  `material_code` VARCHAR(100) DEFAULT NULL COMMENT '物料编号',
  `material_name` VARCHAR(200) DEFAULT NULL COMMENT '物料名称',
  `material_type` VARCHAR(50) DEFAULT NULL COMMENT '物料类型',
  `color` VARCHAR(100) DEFAULT NULL COMMENT '颜色',
  `specification` VARCHAR(200) DEFAULT NULL COMMENT '规格',
  `fabric_width` VARCHAR(50) DEFAULT NULL COMMENT '幅宽',
  `fabric_weight` VARCHAR(50) DEFAULT NULL COMMENT '克重',
  `fabric_composition` VARCHAR(200) DEFAULT NULL COMMENT '成分',
  `quantity` DECIMAL(14,3) DEFAULT NULL COMMENT '领取数量',
  `unit` VARCHAR(20) DEFAULT NULL COMMENT '单位',
  `unit_price` DECIMAL(14,4) DEFAULT NULL COMMENT '单价',
  `amount` DECIMAL(14,2) DEFAULT NULL COMMENT '金额小计（数量×单价）',
  `picker_id` VARCHAR(64) DEFAULT NULL COMMENT '领取人ID',
  `picker_name` VARCHAR(100) DEFAULT NULL COMMENT '领取人姓名',
  `pickup_time` DATETIME DEFAULT NULL COMMENT '领取时间',
  `audit_status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '审核状态',
  `auditor_id` VARCHAR(64) DEFAULT NULL COMMENT '审核人ID',
  `auditor_name` VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
  `audit_time` DATETIME DEFAULT NULL COMMENT '审核时间',
  `audit_remark` VARCHAR(500) DEFAULT NULL COMMENT '审核备注',
  `finance_status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '财务状态',
  `finance_remark` VARCHAR(500) DEFAULT NULL COMMENT '财务核算备注',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '领取备注',
  `create_time` DATETIME DEFAULT NULL COMMENT '创建时间',
  `update_time` DATETIME DEFAULT NULL COMMENT '更新时间',
  `delete_flag` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标记：0=正常 1=已删除',
  PRIMARY KEY (`id`),
  KEY `idx_mpick_tenant_audit` (`tenant_id`, `audit_status`),
  KEY `idx_mpick_order_style` (`order_no`, `style_no`),
  KEY `idx_mpick_finance` (`tenant_id`, `finance_status`),
  KEY `idx_mpick_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='面辅料领取记录';

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_pickup_record' AND COLUMN_NAME = 'fabric_width') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `fabric_width` VARCHAR(50) DEFAULT NULL COMMENT ''幅宽'' AFTER `specification`',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_pickup_record' AND COLUMN_NAME = 'fabric_weight') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `fabric_weight` VARCHAR(50) DEFAULT NULL COMMENT ''克重'' AFTER `fabric_width`',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_pickup_record' AND COLUMN_NAME = 'fabric_composition') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `fabric_composition` VARCHAR(200) DEFAULT NULL COMMENT ''成分'' AFTER `fabric_weight`',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== 4. 执行后复核 ====================
SELECT expected.table_name,
       expected.column_name
FROM (
    SELECT 't_material_purchase' AS table_name, 'evidence_image_urls' AS column_name
    UNION ALL SELECT 't_material_purchase', 'fabric_composition'
    UNION ALL SELECT 't_material_purchase', 'invoice_urls'
    UNION ALL SELECT 't_material_purchase', 'audit_status'
    UNION ALL SELECT 't_material_purchase', 'audit_reason'
    UNION ALL SELECT 't_material_purchase', 'audit_time'
    UNION ALL SELECT 't_material_purchase', 'audit_operator_id'
    UNION ALL SELECT 't_material_purchase', 'audit_operator_name'
    UNION ALL SELECT 't_material_pickup_record', 'fabric_width'
    UNION ALL SELECT 't_material_pickup_record', 'fabric_weight'
    UNION ALL SELECT 't_material_pickup_record', 'fabric_composition'
    UNION ALL SELECT 't_agent_meeting', 'tenant_id'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = expected.table_name
 AND actual.COLUMN_NAME = expected.column_name
WHERE actual.COLUMN_NAME IS NULL;

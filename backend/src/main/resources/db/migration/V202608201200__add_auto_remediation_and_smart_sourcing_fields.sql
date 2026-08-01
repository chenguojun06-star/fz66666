-- V202608201200: 异常自愈引擎 + 智能采购推荐 + 闭环补齐字段
-- 1. t_ai_patrol_action 加执行人/反馈/撤销字段（闭环补齐）
-- 2. t_purchase_cart_item 加款式ID/款式图片字段（智能采购）
-- 3. t_order_risk_tracking 加撤销/重开字段（闭环补齐）

-- ========== 1. t_ai_patrol_action 补齐闭环字段 ==========
-- 使用 information_schema 幂等添加列（MySQL 8.0 不支持 IF NOT EXISTS）

-- executed_by: 执行人ID（区别于审批人 approverId）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action' AND COLUMN_NAME = 'executed_by');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_ai_patrol_action ADD COLUMN executed_by VARCHAR(64) DEFAULT NULL COMMENT ''执行人ID''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- executed_by_name: 执行人姓名
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action' AND COLUMN_NAME = 'executed_by_name');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_ai_patrol_action ADD COLUMN executed_by_name VARCHAR(64) DEFAULT NULL COMMENT ''执行人姓名''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- feedback: 人员反馈
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action' AND COLUMN_NAME = 'feedback');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_ai_patrol_action ADD COLUMN feedback TEXT DEFAULT NULL COMMENT ''人员反馈''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- feedback_rating: 反馈评分 1-5
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action' AND COLUMN_NAME = 'feedback_rating');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_ai_patrol_action ADD COLUMN feedback_rating TINYINT DEFAULT NULL COMMENT ''反馈评分1-5''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- cancel_reason: 撤销原因
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action' AND COLUMN_NAME = 'cancel_reason');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_ai_patrol_action ADD COLUMN cancel_reason VARCHAR(500) DEFAULT NULL COMMENT ''撤销原因''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- cancelled_by: 撤销人
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action' AND COLUMN_NAME = 'cancelled_by');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_ai_patrol_action ADD COLUMN cancelled_by VARCHAR(64) DEFAULT NULL COMMENT ''撤销人ID''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- cancelled_at: 撤销时间
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action' AND COLUMN_NAME = 'cancelled_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_ai_patrol_action ADD COLUMN cancelled_at DATETIME DEFAULT NULL COMMENT ''撤销时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- remediation_type: 自愈类型 AUTO / SUGGESTION
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action' AND COLUMN_NAME = 'remediation_type');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_ai_patrol_action ADD COLUMN remediation_type VARCHAR(20) DEFAULT NULL COMMENT ''自愈类型: AUTO/SUGGESTION''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 2. t_purchase_cart_item 加款式字段 ==========
-- style_id: 款式ID
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_purchase_cart_item' AND COLUMN_NAME = 'style_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_purchase_cart_item ADD COLUMN style_id VARCHAR(36) DEFAULT NULL COMMENT ''款式ID''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- style_no: 款号
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_purchase_cart_item' AND COLUMN_NAME = 'style_no');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_purchase_cart_item ADD COLUMN style_no VARCHAR(50) DEFAULT NULL COMMENT ''款号''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- style_image_url: 款式图片
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_purchase_cart_item' AND COLUMN_NAME = 'style_image_url');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_purchase_cart_item ADD COLUMN style_image_url VARCHAR(500) DEFAULT NULL COMMENT ''款式图片URL''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 3. t_order_risk_tracking 加撤销/重开字段 ==========
-- cancelled_at: 撤销时间
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_risk_tracking' AND COLUMN_NAME = 'cancelled_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_order_risk_tracking ADD COLUMN cancelled_at DATETIME DEFAULT NULL COMMENT ''撤销时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- cancelled_by: 撤销人
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_risk_tracking' AND COLUMN_NAME = 'cancelled_by');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_order_risk_tracking ADD COLUMN cancelled_by VARCHAR(64) DEFAULT NULL COMMENT ''撤销人''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- cancel_reason: 撤销原因
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_risk_tracking' AND COLUMN_NAME = 'cancel_reason');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_order_risk_tracking ADD COLUMN cancel_reason VARCHAR(500) DEFAULT NULL COMMENT ''撤销原因''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ========== 4. t_sys_notice 加处理状态字段 ==========
-- handling_status: 处理状态 none/handled/revoked
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_sys_notice' AND COLUMN_NAME = 'handling_status');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_sys_notice ADD COLUMN handling_status VARCHAR(20) DEFAULT ''none'' COMMENT ''处理状态: none/handled/revoked''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- revoked_at: 撤回时间
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_sys_notice' AND COLUMN_NAME = 'revoked_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_sys_notice ADD COLUMN revoked_at DATETIME DEFAULT NULL COMMENT ''撤回时间''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

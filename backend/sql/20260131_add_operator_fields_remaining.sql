-- ============================================================
-- 操作人字段补充脚本（剩余表）
-- 日期：2026-01-31
-- 说明：t_material_purchase 和 t_product_outstock 已完成，此脚本仅处理剩余表
-- ============================================================

-- 3. t_cutting_bundle（裁剪扎）- 添加创建人和操作人
ALTER TABLE t_cutting_bundle
ADD COLUMN creator_id VARCHAR(32) COMMENT '创建人ID（创建扎号）' AFTER update_time,
ADD COLUMN creator_name VARCHAR(100) COMMENT '创建人姓名' AFTER creator_id,
ADD COLUMN operator_id VARCHAR(32) COMMENT '操作人ID（最后扫码人）' AFTER creator_name,
ADD COLUMN operator_name VARCHAR(100) COMMENT '操作人姓名' AFTER operator_id,
ADD INDEX idx_creator_id (creator_id),
ADD INDEX idx_operator_id (operator_id);

-- 4. t_style_quotation（款号报价）- 添加创建人、更新人、审核人
ALTER TABLE t_style_quotation
ADD COLUMN creator_id VARCHAR(32) COMMENT '创建人ID' AFTER is_locked,
ADD COLUMN creator_name VARCHAR(100) COMMENT '创建人姓名' AFTER creator_id,
ADD COLUMN updater_id VARCHAR(32) COMMENT '更新人ID' AFTER creator_name,
ADD COLUMN updater_name VARCHAR(100) COMMENT '更新人姓名' AFTER updater_id,
ADD COLUMN auditor_id VARCHAR(32) COMMENT '审核人ID' AFTER updater_name,
ADD COLUMN auditor_name VARCHAR(100) COMMENT '审核人姓名' AFTER auditor_id,
ADD COLUMN audit_time DATETIME COMMENT '审核时间' AFTER auditor_name,
ADD INDEX idx_creator_id (creator_id),
ADD INDEX idx_updater_id (updater_id),
ADD INDEX idx_auditor_id (auditor_id);

-- 6. t_payroll_settlement（工资结算）- 添加审核人和确认人
ALTER TABLE t_payroll_settlement
ADD COLUMN auditor_id VARCHAR(32) COMMENT '审核人ID' AFTER update_by,
ADD COLUMN auditor_name VARCHAR(100) COMMENT '审核人姓名' AFTER auditor_id,
ADD COLUMN audit_time DATETIME COMMENT '审核时间' AFTER auditor_name,
ADD COLUMN confirmer_id VARCHAR(32) COMMENT '确认人ID' AFTER audit_time,
ADD COLUMN confirmer_name VARCHAR(100) COMMENT '确认人姓名' AFTER confirmer_id,
ADD COLUMN confirm_time DATETIME COMMENT '确认时间' AFTER confirmer_name,
ADD INDEX idx_auditor_id (auditor_id),
ADD INDEX idx_confirmer_id (confirmer_id);

-- 7. t_cutting_task（裁剪任务）- 添加创建人和更新人
ALTER TABLE t_cutting_task
ADD COLUMN creator_id VARCHAR(32) COMMENT '创建人ID' AFTER update_time,
ADD COLUMN creator_name VARCHAR(100) COMMENT '创建人姓名' AFTER creator_id,
ADD COLUMN updater_id VARCHAR(32) COMMENT '更新人ID' AFTER creator_name,
ADD COLUMN updater_name VARCHAR(100) COMMENT '更新人姓名' AFTER updater_id,
ADD INDEX idx_creator_id (creator_id),
ADD INDEX idx_updater_id (updater_id);

-- 8. t_secondary_process（二次工艺）- 添加创建人和操作人ID
ALTER TABLE t_secondary_process
ADD COLUMN creator_id VARCHAR(32) COMMENT '创建人ID' AFTER updated_at,
ADD COLUMN creator_name VARCHAR(100) COMMENT '创建人姓名' AFTER creator_id,
ADD COLUMN assignee_id VARCHAR(32) COMMENT '领取人ID' AFTER creator_name,
ADD COLUMN operator_id VARCHAR(32) COMMENT '完成操作人ID' AFTER assignee,
ADD COLUMN operator_name VARCHAR(100) COMMENT '完成操作人姓名' AFTER operator_id,
ADD INDEX idx_creator_id (creator_id),
ADD INDEX idx_assignee_id (assignee_id),
ADD INDEX idx_operator_id (operator_id);

-- 9. t_pattern_production（样衣生产）- 字段格式统一
ALTER TABLE t_pattern_production
ADD COLUMN receiver_id VARCHAR(32) COMMENT '领取人ID' AFTER receiver,
ADD COLUMN pattern_maker_id VARCHAR(32) COMMENT '纸样师傅ID' AFTER pattern_maker,
ADD INDEX idx_receiver_id (receiver_id),
ADD INDEX idx_pattern_maker_id (pattern_maker_id);

-- 10. t_shipment_reconciliation（发货对账）- 添加对账人和审核人
ALTER TABLE t_shipment_reconciliation
ADD COLUMN reconciliation_operator_id VARCHAR(32) COMMENT '对账操作人ID' AFTER is_own_factory,
ADD COLUMN reconciliation_operator_name VARCHAR(100) COMMENT '对账操作人姓名' AFTER reconciliation_operator_id,
ADD COLUMN reconciliation_time DATETIME COMMENT '对账时间' AFTER reconciliation_operator_name,
ADD COLUMN auditor_id VARCHAR(32) COMMENT '审核人ID' AFTER reconciliation_time,
ADD COLUMN auditor_name VARCHAR(100) COMMENT '审核人姓名' AFTER auditor_id,
ADD COLUMN audit_time DATETIME COMMENT '审核时间' AFTER auditor_name,
ADD INDEX idx_reconciliation_operator_id (reconciliation_operator_id),
ADD INDEX idx_auditor_id (auditor_id);

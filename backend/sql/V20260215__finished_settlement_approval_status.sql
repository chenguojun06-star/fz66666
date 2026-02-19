-- ============================================
-- 成品结算审批状态持久化表
-- 表: t_finished_settlement_approval
-- 日期: 2026-02-15
-- ============================================

CREATE TABLE IF NOT EXISTS `t_finished_settlement_approval` (
    `settlement_id` varchar(64) NOT NULL COMMENT '成品结算ID（对应结算视图ID）',
    `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '审批状态: pending/approved',
    `approved_by_id` varchar(64) DEFAULT NULL COMMENT '审批人ID',
    `approved_by_name` varchar(100) DEFAULT NULL COMMENT '审批人名称',
    `approved_time` datetime DEFAULT NULL COMMENT '审批时间',
    `tenant_id` bigint DEFAULT NULL COMMENT '租户ID',
    `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`settlement_id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='成品结算审批状态';

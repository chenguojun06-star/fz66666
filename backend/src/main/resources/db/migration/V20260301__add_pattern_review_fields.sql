-- 样衣审核字段：用于“样衣完成后、入库前必须审核”流程
ALTER TABLE `t_pattern_production`
    ADD COLUMN `review_status` VARCHAR(20) DEFAULT 'PENDING' COMMENT '样衣审核状态：PENDING/APPROVED/REJECTED',
    ADD COLUMN `review_result` VARCHAR(20) DEFAULT NULL COMMENT '审核结论：APPROVED/REJECTED',
    ADD COLUMN `review_remark` VARCHAR(500) DEFAULT NULL COMMENT '审核备注',
    ADD COLUMN `review_by` VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
    ADD COLUMN `review_by_id` VARCHAR(32) DEFAULT NULL COMMENT '审核人ID',
    ADD COLUMN `review_time` DATETIME DEFAULT NULL COMMENT '审核时间';

CREATE INDEX IF NOT EXISTS `idx_pp_review_status` ON `t_pattern_production` (`review_status`);
CREATE INDEX IF NOT EXISTS `idx_pp_review_by_id` ON `t_pattern_production` (`review_by_id`);

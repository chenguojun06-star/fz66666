-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V10__add_sample_review_fields`;
DELIMITER $$
CREATE PROCEDURE `__mig_V10__add_sample_review_fields`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    -- 样衣审核字段
    ALTER TABLE t_style_info
        ADD COLUMN sample_review_status  VARCHAR(20)  DEFAULT NULL COMMENT '样衣审核状态: PASS/REWORK/REJECT',
        ADD COLUMN sample_review_comment TEXT         DEFAULT NULL COMMENT '样衣审核评语（选填）',
        ADD COLUMN sample_reviewer       VARCHAR(100) DEFAULT NULL COMMENT '审核人',
        ADD COLUMN sample_review_time    DATETIME     DEFAULT NULL COMMENT '审核时间';

END$$
DELIMITER ;
CALL `__mig_V10__add_sample_review_fields`();
DROP PROCEDURE IF EXISTS `__mig_V10__add_sample_review_fields`;

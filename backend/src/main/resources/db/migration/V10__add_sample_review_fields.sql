-- 样衣审核字段
ALTER TABLE t_style_info
    ADD COLUMN IF NOT EXISTS sample_review_status  VARCHAR(20)  DEFAULT NULL COMMENT '样衣审核状态: PASS/REWORK/REJECT',
    ADD COLUMN IF NOT EXISTS sample_review_comment TEXT         DEFAULT NULL COMMENT '样衣审核评语（选填）',
    ADD COLUMN IF NOT EXISTS sample_reviewer       VARCHAR(100) DEFAULT NULL COMMENT '审核人',
    ADD COLUMN IF NOT EXISTS sample_review_time    DATETIME     DEFAULT NULL COMMENT '审核时间';

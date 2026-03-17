-- =====================================================================
-- 报销单附件/凭证表（支持AI识别结果持久化）
-- V20260503002 - 新建 t_expense_reimbursement_doc
-- =====================================================================

CREATE TABLE IF NOT EXISTS `t_expense_reimbursement_doc` (
  `id`                  VARCHAR(36) NOT NULL               COMMENT '主键, UUID',
  `tenant_id`           BIGINT      NOT NULL               COMMENT '租户ID',
  `reimbursement_id`    VARCHAR(36)  DEFAULT NULL          COMMENT '关联报销单ID（提交后回填）',
  `reimbursement_no`    VARCHAR(100) DEFAULT NULL          COMMENT '报销单号',
  `image_url`           VARCHAR(1000) NOT NULL             COMMENT 'COS图片地址（预签名URL）',
  `raw_text`            MEDIUMTEXT   DEFAULT NULL          COMMENT 'AI识别原始文本',
  `recognized_amount`   DECIMAL(12,2) DEFAULT NULL         COMMENT 'AI识别金额',
  `recognized_date`     VARCHAR(20)   DEFAULT NULL         COMMENT 'AI识别日期 YYYY-MM-DD',
  `recognized_title`    VARCHAR(500)  DEFAULT NULL         COMMENT 'AI识别事由',
  `recognized_type`     VARCHAR(50)   DEFAULT NULL         COMMENT 'AI识别费用类型',
  `uploader_id`         VARCHAR(36)   DEFAULT NULL         COMMENT '上传人ID',
  `uploader_name`       VARCHAR(100)  DEFAULT NULL         COMMENT '上传人姓名',
  `create_time`         DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `delete_flag`         INT           NOT NULL DEFAULT 0   COMMENT '软删除 0=正常 1=删除',
  PRIMARY KEY (`id`),
  INDEX `idx_erd_reimbursement_id` (`reimbursement_id`),
  INDEX `idx_erd_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='报销单凭证/附件表（含AI识别结果）';

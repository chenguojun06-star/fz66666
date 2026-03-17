-- V20260503001 — 创建采购单据上传记录表
-- 功能：持久化保存供应商发货单上传记录（图片URL + AI识别摘要）
--       关联到订单编号，供采购单详情页永久展示历史单据

CREATE TABLE IF NOT EXISTS `t_purchase_order_doc` (
    `id`              VARCHAR(36)   NOT NULL,
    `tenant_id`       BIGINT        NOT NULL                    COMMENT '租户ID',
    `order_no`        VARCHAR(100)  NOT NULL                    COMMENT '关联订单编号',
    `image_url`       VARCHAR(1000) NOT NULL                    COMMENT '单据图片COS访问URL',
    `raw_text`        TEXT          DEFAULT NULL                COMMENT 'AI识别原始文字',
    `match_count`     INT           NOT NULL DEFAULT 0          COMMENT '已匹配条目数',
    `total_recognized` INT          NOT NULL DEFAULT 0          COMMENT 'AI识别出的条目总数',
    `uploader_id`     VARCHAR(36)   DEFAULT NULL                COMMENT '上传人ID',
    `uploader_name`   VARCHAR(100)  DEFAULT NULL                COMMENT '上传人姓名',
    `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
    `delete_flag`     INT           NOT NULL DEFAULT 0          COMMENT '0=正常 1=删除',
    PRIMARY KEY (`id`),
    INDEX `idx_pod_order_no`   (`order_no`),
    INDEX `idx_pod_tenant_id`  (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='采购单据上传记录表';

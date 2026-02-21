-- ======================================================================
-- 单价审计日志 + 纸样版本管理 (来自错误放置的 db/V2026012101 文件)
-- 原文件位于 db/ 根目录，Flyway 未能识别，本文件将其正式纳入迁移管理
-- 日期：2026-02-23
-- ======================================================================

-- 1. 单价修改审计日志表
CREATE TABLE IF NOT EXISTS `t_unit_price_audit_log` (
    `id`            VARCHAR(36)   NOT NULL PRIMARY KEY COMMENT '主键ID',
    `style_no`      VARCHAR(50)   NOT NULL COMMENT '款号',
    `process_name`  VARCHAR(50)   NOT NULL COMMENT '工序名称',
    `old_price`     DECIMAL(10,2) DEFAULT 0.00 COMMENT '修改前单价',
    `new_price`     DECIMAL(10,2) DEFAULT 0.00 COMMENT '修改后单价',
    `change_source` VARCHAR(30)   NOT NULL COMMENT '变更来源: template/scan/reconciliation',
    `related_id`    VARCHAR(36)   DEFAULT NULL COMMENT '关联ID',
    `operator`      VARCHAR(50)   DEFAULT NULL COMMENT '操作人',
    `create_time`   DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `remark`        VARCHAR(200)  DEFAULT NULL COMMENT '备注',
    INDEX `idx_style_no`    (`style_no`),
    INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单价修改审计日志表';

-- 2. 为款号附件表添加版本管理字段（ADD COLUMN IF NOT EXISTS 保证幂等）
ALTER TABLE `t_style_attachment`
    ADD COLUMN IF NOT EXISTS `biz_type`       VARCHAR(30)  DEFAULT 'general'
        COMMENT '业务类型: general/pattern/pattern_grading/workorder',
    ADD COLUMN IF NOT EXISTS `version`        INT          DEFAULT 1
        COMMENT '版本号',
    ADD COLUMN IF NOT EXISTS `version_remark` VARCHAR(200) DEFAULT NULL
        COMMENT '版本说明',
    ADD COLUMN IF NOT EXISTS `status`         VARCHAR(20)  DEFAULT 'active'
        COMMENT '状态: active/archived',
    ADD COLUMN IF NOT EXISTS `uploader`       VARCHAR(50)  DEFAULT NULL
        COMMENT '上传人',
    ADD COLUMN IF NOT EXISTS `parent_id`      VARCHAR(36)  DEFAULT NULL
        COMMENT '父版本ID';

CREATE INDEX IF NOT EXISTS `idx_style_attachment_biz_type` ON `t_style_attachment` (`biz_type`);
CREATE INDEX IF NOT EXISTS `idx_style_attachment_status`   ON `t_style_attachment` (`status`);

-- 3. 纸样检查配置表
CREATE TABLE IF NOT EXISTS `t_pattern_check_config` (
    `id`                    VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '主键ID',
    `style_no`              VARCHAR(50) NOT NULL COMMENT '款号',
    `require_pattern`       TINYINT     DEFAULT 1 COMMENT '是否需要纸样',
    `require_grading`       TINYINT     DEFAULT 1 COMMENT '是否需要放码文件',
    `require_marker`        TINYINT     DEFAULT 0 COMMENT '是否需要排料图',
    `check_on_order_create` TINYINT     DEFAULT 1 COMMENT '创建订单时检查',
    `check_on_cutting`      TINYINT     DEFAULT 1 COMMENT '裁剪时检查',
    `create_time`           DATETIME    DEFAULT CURRENT_TIMESTAMP,
    `update_time`           DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_style_no` (`style_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='纸样检查配置表';

-- 4. 为款号信息表添加纸样相关字段
ALTER TABLE `t_style_info`
    ADD COLUMN IF NOT EXISTS `pattern_status`       VARCHAR(20) DEFAULT 'pending'
        COMMENT '纸样状态: pending/in_progress/completed',
    ADD COLUMN IF NOT EXISTS `pattern_started_at`   DATETIME DEFAULT NULL
        COMMENT '纸样开始时间',
    ADD COLUMN IF NOT EXISTS `pattern_completed_at` DATETIME DEFAULT NULL
        COMMENT '纸样完成时间',
    ADD COLUMN IF NOT EXISTS `grading_status`       VARCHAR(20) DEFAULT 'pending'
        COMMENT '放码状态: pending/in_progress/completed',
    ADD COLUMN IF NOT EXISTS `grading_completed_at` DATETIME DEFAULT NULL
        COMMENT '放码完成时间';

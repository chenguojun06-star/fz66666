-- V40: 组织架构节点增加管理人字段 + 创建变更审批表

-- 1. t_organization_unit 增加管理人字段 (幂等写法)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_organization_unit' AND COLUMN_NAME = 'manager_user_id') = 0,
    'ALTER TABLE `t_organization_unit` ADD COLUMN `manager_user_id` VARCHAR(64) NULL COMMENT ''该节点的审批负责人userId''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_organization_unit' AND COLUMN_NAME = 'manager_user_name') = 0,
    'ALTER TABLE `t_organization_unit` ADD COLUMN `manager_user_name` VARCHAR(100) NULL COMMENT ''审批负责人姓名''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 创建变更审批申请表
CREATE TABLE IF NOT EXISTS `t_change_approval` (
    `id`              VARCHAR(64)   NOT NULL                         COMMENT '主键UUID',
    `tenant_id`       BIGINT        NOT NULL                         COMMENT '租户ID',
    `operation_type`  VARCHAR(50)   NOT NULL                         COMMENT '操作类型: SCAN_UNDO/ORDER_DELETE/STYLE_DELETE/ORDER_MODIFY/SAMPLE_DELETE',
    `target_id`       VARCHAR(64)   NOT NULL                         COMMENT '被操作记录ID',
    `target_no`       VARCHAR(200)  NULL                             COMMENT '业务单号（显示用）',
    `operation_data`  TEXT          NULL                             COMMENT '操作参数JSON，审批通过后执行用',
    `applicant_id`    VARCHAR(64)   NOT NULL                         COMMENT '申请人userId',
    `applicant_name`  VARCHAR(100)  NULL                             COMMENT '申请人姓名',
    `org_unit_id`     VARCHAR(64)   NULL                             COMMENT '申请人所属组织节点ID',
    `org_unit_name`   VARCHAR(200)  NULL                             COMMENT '组织节点名称',
    `approver_id`     VARCHAR(64)   NULL                             COMMENT '审批人userId',
    `approver_name`   VARCHAR(100)  NULL                             COMMENT '审批人姓名',
    `apply_reason`    TEXT          NULL                             COMMENT '申请原因/备注',
    `status`          VARCHAR(20)   NOT NULL DEFAULT 'PENDING'       COMMENT '状态: PENDING/APPROVED/REJECTED/CANCELLED',
    `review_remark`   TEXT          NULL                             COMMENT '审批意见',
    `review_time`     DATETIME      NULL                             COMMENT '审批时间',
    `apply_time`      DATETIME      NULL                             COMMENT '申请时间',
    `create_time`     DATETIME      NULL                             COMMENT '创建时间',
    `update_time`     DATETIME      NULL                             COMMENT '更新时间',
    `delete_flag`     TINYINT       NOT NULL DEFAULT 0               COMMENT '逻辑删除: 0正常 1删除',
    PRIMARY KEY (`id`),
    INDEX `idx_approver_status`  (`approver_id`, `status`, `delete_flag`),
    INDEX `idx_applicant_status` (`applicant_id`, `status`, `delete_flag`),
    INDEX `idx_tenant_status`    (`tenant_id`, `status`, `delete_flag`),
    INDEX `idx_target`           (`target_id`, `operation_type`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '变更审批申请表';

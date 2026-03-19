-- 面辅料领取记录表
-- 支持内部/外部区分、审核流程、财务核算
CREATE TABLE IF NOT EXISTS `t_material_pickup_record` (
  `id`              VARCHAR(64)    NOT NULL               COMMENT '主键UUID',
  `tenant_id`       VARCHAR(64)    DEFAULT NULL           COMMENT '租户ID',
  `pickup_no`       VARCHAR(64)    NOT NULL               COMMENT '领取单号（自动生成）',
  `pickup_type`     VARCHAR(20)    NOT NULL DEFAULT 'INTERNAL' COMMENT '领取类型：INTERNAL=内部 EXTERNAL=外部',
  `order_no`        VARCHAR(100)   DEFAULT NULL           COMMENT '关联生产订单号',
  `style_no`        VARCHAR(100)   DEFAULT NULL           COMMENT '关联款号',
  `material_id`     VARCHAR(64)    DEFAULT NULL           COMMENT '物料ID',
  `material_code`   VARCHAR(100)   DEFAULT NULL           COMMENT '物料编号',
  `material_name`   VARCHAR(200)   DEFAULT NULL           COMMENT '物料名称',
  `material_type`   VARCHAR(50)    DEFAULT NULL           COMMENT '物料类型',
  `color`           VARCHAR(100)   DEFAULT NULL           COMMENT '颜色',
  `specification`   VARCHAR(200)   DEFAULT NULL           COMMENT '规格',
  `quantity`        DECIMAL(14,3)  DEFAULT NULL           COMMENT '领取数量',
  `unit`            VARCHAR(20)    DEFAULT NULL           COMMENT '单位',
  `unit_price`      DECIMAL(14,4)  DEFAULT NULL           COMMENT '单价',
  `amount`          DECIMAL(14,2)  DEFAULT NULL           COMMENT '金额小计（数量×单价）',
  `picker_id`       VARCHAR(64)    DEFAULT NULL           COMMENT '领取人ID',
  `picker_name`     VARCHAR(100)   DEFAULT NULL           COMMENT '领取人姓名',
  `pickup_time`     DATETIME       DEFAULT NULL           COMMENT '领取时间',
  `audit_status`    VARCHAR(20)    NOT NULL DEFAULT 'PENDING' COMMENT '审核状态：PENDING=待审核 APPROVED=已通过 REJECTED=已拒绝',
  `auditor_id`      VARCHAR(64)    DEFAULT NULL           COMMENT '审核人ID',
  `auditor_name`    VARCHAR(100)   DEFAULT NULL           COMMENT '审核人姓名',
  `audit_time`      DATETIME       DEFAULT NULL           COMMENT '审核时间',
  `audit_remark`    VARCHAR(500)   DEFAULT NULL           COMMENT '审核备注',
  `finance_status`  VARCHAR(20)    NOT NULL DEFAULT 'PENDING' COMMENT '财务状态：PENDING=待核算 SETTLED=已核算',
  `finance_remark`  VARCHAR(500)   DEFAULT NULL           COMMENT '财务核算备注',
  `remark`          VARCHAR(500)   DEFAULT NULL           COMMENT '领取备注',
  `create_time`     DATETIME       DEFAULT NULL           COMMENT '创建时间',
  `update_time`     DATETIME       DEFAULT NULL           COMMENT '更新时间',
  `delete_flag`     TINYINT(1)     NOT NULL DEFAULT 0     COMMENT '删除标记：0=正常 1=已删除',
  PRIMARY KEY (`id`),
  INDEX `idx_mpick_tenant_audit`  (`tenant_id`, `audit_status`),
  INDEX `idx_mpick_order_style`   (`order_no`, `style_no`),
  INDEX `idx_mpick_finance`       (`tenant_id`, `finance_status`),
  INDEX `idx_mpick_create_time`   (`create_time`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '面辅料领取记录';

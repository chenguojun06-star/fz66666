-- Fix production DB: add missing invoice columns to t_tenant_billing_record
ALTER TABLE t_tenant_billing_record
  ADD COLUMN invoice_required TINYINT DEFAULT 0 COMMENT '是否需要发票',
  ADD COLUMN invoice_status VARCHAR(20) DEFAULT 'NOT_REQUIRED' COMMENT '发票状态',
  ADD COLUMN invoice_title VARCHAR(200) DEFAULT NULL COMMENT '发票抬头',
  ADD COLUMN invoice_tax_no VARCHAR(50) DEFAULT NULL COMMENT '纳税人识别号',
  ADD COLUMN invoice_no VARCHAR(50) DEFAULT NULL COMMENT '发票号码',
  ADD COLUMN invoice_amount DECIMAL(12,2) DEFAULT NULL COMMENT '发票金额',
  ADD COLUMN invoice_issued_time DATETIME DEFAULT NULL COMMENT '开票时间',
  ADD COLUMN invoice_bank_name VARCHAR(100) DEFAULT NULL COMMENT '开户银行',
  ADD COLUMN invoice_bank_account VARCHAR(50) DEFAULT NULL COMMENT '银行账号',
  ADD COLUMN invoice_address VARCHAR(200) DEFAULT NULL COMMENT '注册地址',
  ADD COLUMN invoice_phone VARCHAR(30) DEFAULT NULL COMMENT '注册电话';

-- Fix production DB: create t_user_feedback table
CREATE TABLE IF NOT EXISTS t_user_feedback (
  id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id     BIGINT       NULL     COMMENT '租户ID',
  user_id       BIGINT       NULL     COMMENT '提交人ID',
  user_name     VARCHAR(100) NULL     COMMENT '提交人姓名',
  tenant_name   VARCHAR(200) NULL     COMMENT '租户名称',
  source        VARCHAR(20)  NOT NULL DEFAULT 'PC' COMMENT '来源：PC / MINIPROGRAM',
  category      VARCHAR(50)  NOT NULL DEFAULT 'BUG' COMMENT '分类',
  title         VARCHAR(200) NOT NULL COMMENT '标题',
  content       TEXT         NOT NULL COMMENT '详细描述',
  screenshot_urls TEXT       NULL     COMMENT '截图URL',
  contact       VARCHAR(100) NULL     COMMENT '联系方式',
  status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态',
  reply         TEXT         NULL     COMMENT '管理员回复',
  reply_time    DATETIME     NULL     COMMENT '回复时间',
  reply_user_id BIGINT       NULL     COMMENT '回复人ID',
  create_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_user_id (user_id),
  KEY idx_status (status),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户问题反馈';

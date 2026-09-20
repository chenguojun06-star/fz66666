-- D-474：扣款类型配置表（管理员设定有哪些扣款项：质量/延期/次品/其他）
-- 对应实体：com.fashion.supplychain.finance.entity.DeductionTypeConfig
CREATE TABLE IF NOT EXISTS t_deduction_type_config (
  id varchar(36) NOT NULL,
  tenant_id bigint NOT NULL,
  type_code varchar(32) NOT NULL COMMENT '扣款类型编码，如 QUALITY/DELAY/DEFECT',
  type_name varchar(64) NOT NULL COMMENT '扣款类型名称，如 质量扣款/延期扣款/次品扣款',
  apply_target varchar(20) NOT NULL DEFAULT 'WORKER' COMMENT '适用对象：WORKER=员工, FACTORY=外发工厂, BOTH=两者',
  default_amount decimal(12,2) DEFAULT 0 COMMENT '默认扣款金额（录入时带出，可改）',
  deduct_ratio decimal(5,2) DEFAULT 0 COMMENT '按金额比例扣款(%)，>0 时按货款比例算',
  sort_order int DEFAULT 0,
  status varchar(20) DEFAULT 'ACTIVE',
  delete_flag tinyint DEFAULT 0,
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_code (tenant_id, type_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扣款类型配置（管理员设定有哪些扣款项）';

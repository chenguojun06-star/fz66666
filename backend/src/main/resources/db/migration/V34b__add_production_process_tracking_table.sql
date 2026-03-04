-- 生产工序跟踪表（用于工资结算和进度跟踪）
-- 裁剪完成后自动生成：菲号 × 工序 = N条记录
-- 扫码时更新状态，作为工资结算依据

CREATE TABLE IF NOT EXISTS t_production_process_tracking (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',

  -- 订单关联
  production_order_id BIGINT NOT NULL COMMENT '生产订单ID',
  production_order_no VARCHAR(50) NOT NULL COMMENT '订单号',

  -- 菲号关联
  cutting_bundle_id BIGINT NOT NULL COMMENT '菲号ID（裁剪单ID）',
  bundle_no VARCHAR(50) COMMENT '菲号编号',

  -- SKU信息（从菲号带入）
  sku VARCHAR(50) COMMENT 'SKU号',
  color VARCHAR(50) COMMENT '颜色',
  size VARCHAR(20) COMMENT '尺码',
  quantity INT COMMENT '数量',

  -- 工序信息（从订单 progressNodeUnitPrices 带入）
  process_code VARCHAR(50) NOT NULL COMMENT '工序编号（如：sewing_001）',
  process_name VARCHAR(50) NOT NULL COMMENT '工序名称（如：车缝）',
  process_order INT COMMENT '工序顺序（1,2,3...）',
  unit_price DECIMAL(10,2) COMMENT '单价（元/件，用于工资结算）',

  -- 扫码状态
  scan_status VARCHAR(20) DEFAULT 'pending' COMMENT '状态：pending=待扫码, scanned=已扫码, reset=已重置',
  scan_time DATETIME COMMENT '扫码时间',
  scan_record_id BIGINT COMMENT '关联的扫码记录ID（t_scan_record）',

  -- 操作人信息
  operator_id BIGINT COMMENT '操作人ID',
  operator_name VARCHAR(50) COMMENT '操作人姓名',
  factory_id BIGINT COMMENT '执行工厂ID',
  factory_name VARCHAR(100) COMMENT '执行工厂名称',

  -- 工资结算
  settlement_amount DECIMAL(10,2) COMMENT '结算金额（quantity × unit_price）',
  is_settled TINYINT(1) DEFAULT 0 COMMENT '是否已结算（0=未结算，1=已结算）',
  settlement_time DATETIME COMMENT '结算时间',

  -- 审计字段
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  creator VARCHAR(50) COMMENT '创建人',
  updater VARCHAR(50) COMMENT '更新人',

  -- 索引
  INDEX idx_order (production_order_id),
  INDEX idx_bundle (cutting_bundle_id),
  INDEX idx_process (process_code),
  INDEX idx_status (scan_status),
  INDEX idx_operator (operator_id),
  UNIQUE KEY uk_bundle_process (cutting_bundle_id, process_code) COMMENT '菲号+工序唯一（防重复扫码）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产工序跟踪表（工资结算依据）';

-- 索引说明
-- 1. idx_order: 查询某订单的所有跟踪记录
-- 2. idx_bundle: 查询某菲号的所有工序记录
-- 3. idx_process: 查询某工序的所有扫码情况
-- 4. idx_status: 查询待扫码/已扫码记录
-- 5. idx_operator: 查询某工人的工作量
-- 6. uk_bundle_process: 唯一键防止重复扫码（核心约束）

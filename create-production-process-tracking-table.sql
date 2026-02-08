-- 生产工序跟踪表（工资结算依据）
-- 用途：记录每个菲号（裁剪扎号）× 每个工序的扫码状态，作为工资结算依据
-- 设计：菲号 × 工序 = N条记录，每次扫码更新对应记录
-- 创建时间：2026-02-06

CREATE TABLE IF NOT EXISTS `t_production_process_tracking` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键ID（UUID）',
  `production_order_id` VARCHAR(64) NOT NULL COMMENT '生产订单ID',
  `production_order_no` VARCHAR(50) NOT NULL COMMENT '生产订单号',
  `cutting_bundle_id` VARCHAR(64) NOT NULL COMMENT '菲号ID（裁剪扎号ID）',
  `bundle_no` INT DEFAULT NULL COMMENT '菲号编号',
  `sku` VARCHAR(100) DEFAULT NULL COMMENT 'SKU号（styleNo-color-size）',
  `color` VARCHAR(50) DEFAULT NULL COMMENT '颜色',
  `size` VARCHAR(50) DEFAULT NULL COMMENT '尺码',
  `quantity` INT DEFAULT NULL COMMENT '数量（菲号数量）',
  `process_code` VARCHAR(50) NOT NULL COMMENT '工序编号（如：sewing, quality）',
  `process_name` VARCHAR(100) NOT NULL COMMENT '工序名称（如：车缝、质检）',
  `process_order` INT DEFAULT NULL COMMENT '工序顺序（用于排序）',
  `unit_price` DECIMAL(10, 2) DEFAULT 0.00 COMMENT '单价（元/件）',
  `scan_status` VARCHAR(20) DEFAULT 'pending' COMMENT '扫码状态：pending-待扫码，scanned-已完成，reset-已重置',
  `scan_time` DATETIME DEFAULT NULL COMMENT '扫码时间',
  `scan_record_id` VARCHAR(64) DEFAULT NULL COMMENT '扫码记录ID（关联 t_scan_record）',
  `operator_id` VARCHAR(64) DEFAULT NULL COMMENT '操作人ID（扫码人）',
  `operator_name` VARCHAR(100) DEFAULT NULL COMMENT '操作人姓名',
  `settlement_amount` DECIMAL(10, 2) DEFAULT NULL COMMENT '结算金额（quantity × unit_price）',
  `is_settled` TINYINT(1) DEFAULT 0 COMMENT '是否已结算（0-未结算，1-已结算）',
  `settled_at` DATETIME DEFAULT NULL COMMENT '结算时间',
  `settled_by` VARCHAR(64) DEFAULT NULL COMMENT '结算人ID',
  `settled_batch_no` VARCHAR(100) DEFAULT NULL COMMENT '结算批次号',
  `creator` VARCHAR(100) DEFAULT NULL COMMENT '创建人',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updater` VARCHAR(100) DEFAULT NULL COMMENT '更新人',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_bundle_process` (`cutting_bundle_id`, `process_code`) COMMENT '防重复：每个菲号的每个工序只能扫码一次',
  KEY `idx_order_id` (`production_order_id`) COMMENT '订单查询索引',
  KEY `idx_order_no` (`production_order_no`) COMMENT '订单号查询索引',
  KEY `idx_operator` (`operator_id`, `scan_status`) COMMENT '操作人统计索引',
  KEY `idx_settlement` (`is_settled`, `settled_at`) COMMENT '结算状态索引',
  KEY `idx_scan_record` (`scan_record_id`) COMMENT '扫码记录关联索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='生产工序跟踪表（工资结算依据）';

-- 索引说明：
-- 1. uk_bundle_process：UNIQUE KEY，防止同一个菲号的同一个工序被重复扫码
-- 2. idx_order_id：订单查询（PC端弹窗显示该订单的所有跟踪记录）
-- 3. idx_operator：操作人统计（工资汇总时按操作人分组）
-- 4. idx_settlement：结算状态查询（财务结算模块使用）

-- 数据示例：
-- 订单：PO20260202001，裁剪了 5个菲号，有 3个工序（裁剪、车缝、质检）
-- 生成记录：5 × 3 = 15条
-- 菲号1-裁剪（pending）、菲号1-车缝（pending）、菲号1-质检（pending）
-- 菲号2-裁剪（pending）、菲号2-车缝（pending）、菲号2-质检（pending）
-- ...
-- 扫码后状态变为 scanned，记录操作人和扫码时间
-- 工资结算时，按操作人分组汇总 settlement_amount

-- =====================================================
-- 成品入库记录表
-- 用于追溯成品仓库的入库历史
-- 创建时间: 2026-01-29
-- =====================================================

USE fashion_supplychain;

-- 创建成品入库记录表
CREATE TABLE IF NOT EXISTS `t_finished_inbound_history` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
  `inbound_no` VARCHAR(50) NOT NULL COMMENT '入库单号',
  `quality_inspection_no` VARCHAR(50) COMMENT '质检入库号',
  `style_no` VARCHAR(100) NOT NULL COMMENT '款号',
  `order_no` VARCHAR(50) COMMENT '订单号',
  `color` VARCHAR(50) COMMENT '颜色',
  `size` VARCHAR(20) COMMENT '尺码',
  `quantity` INT NOT NULL DEFAULT 0 COMMENT '入库数量',
  `warehouse_location` VARCHAR(50) COMMENT '仓库位置（库位号）',
  `operator` VARCHAR(100) COMMENT '操作人',
  `inbound_date` DATETIME NOT NULL COMMENT '入库时间',
  `remark` TEXT COMMENT '备注',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `delete_flag` TINYINT DEFAULT 0 COMMENT '删除标记（0=未删除，1=已删除）',

  INDEX `idx_inbound_no` (`inbound_no`),
  INDEX `idx_quality_inspection_no` (`quality_inspection_no`),
  INDEX `idx_style_no` (`style_no`),
  INDEX `idx_order_no` (`order_no`),
  INDEX `idx_inbound_date` (`inbound_date`),
  INDEX `idx_delete_flag` (`delete_flag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成品入库记录表';

-- 插入测试数据
INSERT INTO `t_finished_inbound_history` (
  `inbound_no`,
  `quality_inspection_no`,
  `style_no`,
  `order_no`,
  `color`,
  `size`,
  `quantity`,
  `warehouse_location`,
  `operator`,
  `inbound_date`,
  `remark`
) VALUES
  ('IB20260126001', 'QC20260126001', 'ST001', 'PO20260120001', '黑色', 'L', 500, 'C-01-01', '张三', '2026-01-26 10:30:00', '首次入库'),
  ('IB20260125001', 'QC20260125002', 'ST001', 'PO20260120001', '黑色', 'L', 300, 'C-01-02', '李四', '2026-01-25 14:20:00', '补充入库'),
  ('IB20260127001', 'QC20260127001', 'ST002', 'PO20260121001', '白色', 'M', 450, 'C-02-01', '王五', '2026-01-27 09:15:00', '首次入库'),
  ('IB20260128001', 'QC20260128001', 'ST003', 'PO20260122001', '蓝色', 'XL', 600, 'C-03-01', '赵六', '2026-01-28 11:00:00', '首次入库');

-- 验证数据
SELECT
  inbound_no AS '入库单号',
  quality_inspection_no AS '质检号',
  style_no AS '款号',
  order_no AS '订单号',
  CONCAT(color, '-', size) AS '颜色尺码',
  quantity AS '数量',
  warehouse_location AS '库位',
  operator AS '操作人',
  DATE_FORMAT(inbound_date, '%Y-%m-%d %H:%i') AS '入库时间'
FROM t_finished_inbound_history
WHERE delete_flag = 0
ORDER BY inbound_date DESC
LIMIT 10;

-- 按款号统计入库记录
SELECT
  style_no AS '款号',
  COUNT(*) AS '入库次数',
  SUM(quantity) AS '累计入库数量',
  MAX(inbound_date) AS '最近入库时间'
FROM t_finished_inbound_history
WHERE delete_flag = 0
GROUP BY style_no
ORDER BY MAX(inbound_date) DESC;

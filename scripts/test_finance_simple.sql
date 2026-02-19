-- ================================================================
-- 财务模块集成测试脚本 (简化版)
-- ================================================================

-- 1. 查询现有的生产订单 (用于测试)
SELECT id, order_no, order_quantity FROM t_production_order LIMIT 1;

-- 获取第一个订单ID作为测试对象
SET @test_order_id = (SELECT id FROM t_production_order LIMIT 1);

-- 2. 为这个订单创建测试扫码记录 (模拟Phase 5)
-- 模拟场景: 100件产品，分别进行不同工序扫码
INSERT INTO t_scan_record (id, order_id, process_step, quantity, process_unit_price, scan_cost, scan_time, create_time, update_time)
VALUES
  (UUID(), @test_order_id, '做领', 25, 2.50, 62.50, NOW(), NOW(), NOW()),
  (UUID(), @test_order_id, '上领', 25, 1.50, 37.50, NOW(), NOW(), NOW()),
  (UUID(), @test_order_id, '做袖', 25, 1.50, 37.50, NOW(), NOW(), NOW()),
  (UUID(), @test_order_id, '侧缝', 25, 1.00, 25.00, NOW(), NOW(), NOW())
ON DUPLICATE KEY UPDATE update_time = NOW();

-- 3. 验证扫码记录总成本
SELECT 
  @test_order_id AS 测试订单ID,
  (SELECT order_no FROM t_production_order WHERE id = @test_order_id) AS 订单号,
  SUM(scan_cost) AS 工序成本总和,
  COUNT(*) AS 扫码次数
FROM t_scan_record 
WHERE order_id = @test_order_id
GROUP BY order_id;

-- 4. 如果成品结算表中没有该订单记录，则创建一个
INSERT IGNORE INTO t_shipment_reconciliation (
  id,
  order_id, 
  shipment_date, 
  final_amount,
  reconciliation_date,
  reconciliation_type,
  status,
  create_time,
  update_time
) VALUES (
  UUID(),
  @test_order_id,
  NOW(),
  5000.00,
  NOW(),
  'FACTORY',
  'PENDING',
  NOW(),
  NOW()
);

-- 5. 查看成品结算表的所有数据 (检查新增字段)
SELECT 
  DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS 创建时间,
  (SELECT order_no FROM t_production_order WHERE id = order_id) AS 订单号,
  final_amount AS 销售金额,
  scan_cost AS 工序成本,
  material_cost AS 物料成本,
  total_cost AS 总成本,
  profit_amount AS 利润,
  profit_margin AS 利润率,
  status AS 状态
FROM t_shipment_reconciliation 
WHERE order_id = @test_order_id
LIMIT 5;

-- 6. 打印测试完成
SELECT '✅ 财务模块集成测试数据创建完成' AS 测试状态;

-- 财务模块集成测试脚本
SET @test_order_id = (SELECT id FROM t_production_order LIMIT 1);

-- 创建测试扫码记录
INSERT INTO t_scan_record (id, order_id, order_no, quantity, process_unit_price, scan_cost, scan_time, create_time, update_time)
VALUES
  (UUID(), @test_order_id, (SELECT order_no FROM t_production_order WHERE id = @test_order_id LIMIT 1), 25, 2.50, 62.50, NOW(), NOW(), NOW()),
  (UUID(), @test_order_id, (SELECT order_no FROM t_production_order WHERE id = @test_order_id LIMIT 1), 25, 1.50, 37.50, NOW(), NOW(), NOW()),
  (UUID(), @test_order_id, (SELECT order_no FROM t_production_order WHERE id = @test_order_id LIMIT 1), 25, 1.50, 37.50, NOW(), NOW(), NOW()),
  (UUID(), @test_order_id, (SELECT order_no FROM t_production_order WHERE id = @test_order_id LIMIT 1), 25, 1.00, 25.00, NOW(), NOW(), NOW());

-- 验证扫码记录
SELECT 
  'Step1: 扫码记录创建' AS 步骤,
  (SELECT order_no FROM t_production_order WHERE id = @test_order_id LIMIT 1) AS 订单号,
  SUM(scan_cost) AS 工序成本总和,
  COUNT(*) AS 扫码次数
FROM t_scan_record 
WHERE order_id = @test_order_id;

-- 为这个订单创建成品结算记录
INSERT IGNORE INTO t_shipment_reconciliation (id, order_id, shipment_date, final_amount, reconciliation_date, reconciliation_type, status, create_time, update_time)
VALUES (UUID(), @test_order_id, NOW(), 5000.00, NOW(), 'FACTORY', 'PENDING', NOW(), NOW());

-- 验证成品结算表
SELECT 
  'Step2: 成品结算记录' AS 步骤,
  (SELECT order_no FROM t_production_order WHERE id = order_id LIMIT 1) AS 订单号,
  final_amount AS 销售金额,
  scan_cost AS 工序成本,
  material_cost AS 物料成本,
  total_cost AS 总成本,
  profit_amount AS 利润,
  profit_margin AS 利润率,
  status AS 状态
FROM t_shipment_reconciliation 
WHERE order_id = @test_order_id
LIMIT 1;

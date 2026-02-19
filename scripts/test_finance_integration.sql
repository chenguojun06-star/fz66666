-- ================================================================
-- 财务模块集成测试脚本
-- ================================================================
-- 此脚本创建测试数据来验证工序成本自动流入成品结算的完整链路

-- ================================================================
-- 1. 创建测试订单 (如果不存在)
-- ================================================================
INSERT IGNORE INTO t_production_order (
  order_no, customer_id, season, color, quantity, 
  unit_price, order_date, status, created_at, updated_at
) VALUES (
  'TEST-FINANCE-001', 1, 'Spring 2026', 'Black', 100,
  25.00, NOW(), 'IN_PROGRESS', NOW(), NOW()
);

-- 获取测试订单ID
SET @order_id = (SELECT id FROM t_production_order WHERE order_no = 'TEST-FINANCE-001' LIMIT 1);

-- ================================================================
-- 2. 创建测试扫码记录 (模拟Phase 5工序成本)
-- ================================================================
-- 工序单价设置: 领口=2.50, 袖口=1.50, 侧缝=1.00
INSERT IGNORE INTO t_scan_record (
  order_id, process_step, quantity, 
  process_unit_price, scan_cost, 
  scan_time, created_at, updated_at
) VALUES
  (@order_id, '做领', 20, 2.50, 50.00, NOW(), NOW(), NOW()),
  (@order_id, '上领', 20, 1.50, 30.00, NOW(), NOW(), NOW()),
  (@order_id, '做袖', 20, 1.50, 30.00, NOW(), NOW(), NOW()),
  (@order_id, '侧缝', 20, 1.00, 20.00, NOW(), NOW(), NOW());

-- ================================================================
-- 3. 验证扫码记录的工序成本总和
-- ================================================================
-- 预期: 50 + 30 + 30 + 20 = 130.00
SELECT 
  @order_id AS order_id,
  (SELECT order_no FROM t_production_order WHERE id = @order_id) AS order_no,
  SUM(scan_cost) AS total_scan_cost,
  COUNT(*) AS scan_count
FROM t_scan_record 
WHERE order_id = @order_id
GROUP BY order_id;

-- ================================================================
-- 4. 创建成品结算记录 (ShipmentReconciliation)
-- ================================================================
INSERT IGNORE INTO t_shipment_reconciliation (
  order_id, 
  shipment_date, 
  final_amount,
  reconciliation_date,
  reconciliation_type,
  status,
  created_at,
  updated_at
) VALUES (
  @order_id,
  NOW(),
  5000.00,  -- 销售金额: 5000元
  NOW(),
  'FACTORY',  -- 工厂对账
  'PENDING',
  NOW(),
  NOW()
);

-- ================================================================
-- 5. 验证成品结算的成本字段是否自动计算
-- ================================================================
-- 预期结果:
-- - scan_cost: 130.00 (从4条扫码记录汇总)
-- - material_cost: (可能为NULL)
-- - total_cost: 130.00
-- - final_amount: 5000.00
-- - profit_amount: 4870.00 (5000 - 130)
-- - profit_margin: 97.40% ((5000-130)/5000*100)

SELECT 
  sr.id,
  sr.order_id,
  (SELECT order_no FROM t_production_order WHERE id = sr.order_id) AS order_no,
  sr.final_amount AS 销售金额,
  sr.scan_cost AS 工序成本,
  sr.material_cost AS 物料成本,
  sr.total_cost AS 总成本,
  sr.profit_amount AS 利润,
  sr.profit_margin AS 利润率,
  sr.status,
  sr.created_at
FROM t_shipment_reconciliation sr
WHERE sr.order_id = @order_id;

-- ================================================================
-- 6. 测试数据验证清单
-- ================================================================
-- ✅ 检查项:
-- 1. t_scan_record 有4条记录，scan_cost总和 = 130.00
-- 2. t_shipment_reconciliation 的 scan_cost 是否自动计算为 130.00
-- 3. profit_amount = final_amount - scan_cost = 5000 - 130 = 4870.00
-- 4. profit_margin = 4870/5000 * 100 = 97.40%

-- ================================================================
-- 7. 生成测试报告
-- ================================================================
SELECT 
  '财务成本流向验证' AS 测试项,
  CASE 
    WHEN (SELECT SUM(scan_cost) FROM t_scan_record WHERE order_id = @order_id) = 130.00 
    THEN '✅ PASS: 工序成本总和正确'
    ELSE '❌ FAIL: 工序成本总和错误'
  END AS 结果1,
  CASE 
    WHEN (SELECT scan_cost FROM t_shipment_reconciliation WHERE order_id = @order_id LIMIT 1) = 130.00 
    THEN '✅ PASS: 工序成本自动流入成品结算'
    ELSE '❌ FAIL: 工序成本未正确流入'
  END AS 结果2,
  CASE 
    WHEN (SELECT profit_amount FROM t_shipment_reconciliation WHERE order_id = @order_id LIMIT 1) = 4870.00 
    THEN '✅ PASS: 利润计算正确'
    ELSE '❌ FAIL: 利润计算错误'
  END AS 结果3;

-- ================================================================
-- 清理脚本 (可选，测试完后运行)
-- ================================================================
-- DELETE FROM t_scan_record WHERE order_id = @order_id;
-- DELETE FROM t_shipment_reconciliation WHERE order_id = @order_id;
-- DELETE FROM t_production_order WHERE order_no = 'TEST-FINANCE-001';

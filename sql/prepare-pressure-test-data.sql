-- 压力测试数据准备脚本
-- 用途：为压力测试生成批量订单、扫码记录、库存数据
-- 执行：docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < prepare-pressure-test-data.sql

USE fashion_supplychain;

-- ==============================================
-- 1. 批量生成生产订单（1000条）
-- ==============================================
DROP PROCEDURE IF EXISTS generate_test_orders;

DELIMITER $$
CREATE PROCEDURE generate_test_orders(IN batch_size INT)
BEGIN
  DECLARE i INT DEFAULT 1;
  DECLARE order_no VARCHAR(50);
  DECLARE qty INT;
  DECLARE delivery_days INT;

  -- 禁用外键检查加速插入
  SET FOREIGN_KEY_CHECKS = 0;

  WHILE i <= batch_size DO
    SET order_no = CONCAT('PO202602', LPAD(i, 7, '0'));
    SET qty = FLOOR(100 + RAND() * 900);
    SET delivery_days = FLOOR(RAND() * 60);

    INSERT INTO t_production_order (
      id, tenant_id, order_no, style_id, style_no, style_name,
      factory_name, order_quantity, status,
      create_time, update_time, delete_flag, version
    ) VALUES (
      UUID(),
      99,
      order_no,
      '1',  -- 款式ID
      'FZ2024001',  -- 款式编号
      CONCAT('测试款式', i),  -- 款式名称
      '测试工厂',  -- 工厂名称
      qty,
      CASE FLOOR(RAND() * 4)
        WHEN 0 THEN 'pending'
        WHEN 1 THEN 'in_progress'
        WHEN 2 THEN 'completed'
        ELSE 'draft'
      END,
      NOW(),
      NOW(),
      0,
      0
    );

    SET i = i + 1;

    -- 每100条提交一次
    IF i MOD 100 = 0 THEN
      COMMIT;
    END IF;
  END WHILE;

  COMMIT;
  SET FOREIGN_KEY_CHECKS = 1;

  SELECT CONCAT('✅ 成功生成 ', batch_size, ' 条生产订单') AS result;
END$$
DELIMITER ;

-- 执行生成
CALL generate_test_orders(1000);

-- ==============================================
-- 2. 批量生成扫码记录（10000条）
-- ==============================================
DROP PROCEDURE IF EXISTS generate_scan_records;

DELIMITER $$
CREATE PROCEDURE generate_scan_records(IN batch_size INT)
BEGIN
  DECLARE i INT DEFAULT 1;
  DECLARE order_id_val BIGINT;
  DECLARE process_code_val VARCHAR(20);
  DECLARE qty INT;
  DECLARE scan_days_ago INT;

  SET FOREIGN_KEY_CHECKS = 0;

  WHILE i <= batch_size DO
    -- 随机选择订单号（从已生成的订单中选择）
    SET order_id_val = FLOOR(1 + RAND() * 1000);

    -- 随机选择工序
    SET process_code_val = CASE FLOOR(RAND() * 6)
      WHEN 0 THEN 'CUT'
      WHEN 1 THEN 'SEW'      WHEN 2 THEN 'IRON'
      WHEN 3 THEN 'QC'
      WHEN 4 THEN 'PACK'
      ELSE 'WAREHOUSE'
    END;

    SET qty = FLOOR(10 + RAND() * 90);
    SET scan_days_ago = FLOOR(RAND() * 30);

    INSERT INTO t_scan_record (
      id, tenant_id, order_no, style_no,
      process_code, process_name, quantity,
      actual_operator_name, scan_time, create_time
    ) VALUES (
      UUID(),
      99,
      CONCAT('PO202602', LPAD(order_id_val, 7, '0')),  -- 对应已生成的订单号
      'FZ2024001',  -- 款式编号
      process_code_val,
      CASE process_code_val
        WHEN 'CUT' THEN '裁剪'
        WHEN 'SEW' THEN '缝制'
        WHEN 'IRON' THEN '大烫'
        WHEN 'QC' THEN '质检'
        WHEN 'PACK' THEN '包装'
        ELSE '入库'
      END,
      qty,
      CONCAT('员工', FLOOR(RAND() * 100)),
      DATE_SUB(NOW(), INTERVAL scan_days_ago DAY),
      NOW()
    );

    SET i = i + 1;

    IF i MOD 500 = 0 THEN
      COMMIT;
    END IF;
  END WHILE;

  COMMIT;
  SET FOREIGN_KEY_CHECKS = 1;

  SELECT CONCAT('✅ 成功生成 ', batch_size, ' 条扫码记录') AS result;
END$$
DELIMITER ;

-- 执行生成
CALL generate_scan_records(10000);

-- ==============================================
-- 3. 批量生成面辅料库存（跳过 - 表结构不匹配）
-- ==============================================
-- 注释: t_material_stock 表结构与测试脚本不匹配，跳过此部分
-- 压力测试主要关注订单列表查询和扫码录入性能

-- ==============================================
-- 4. 创建性能优化索引
-- ==============================================

-- 生产订单表索引
CREATE INDEX IF NOT EXISTS idx_tenant_status_time
  ON t_production_order(tenant_id, status, create_time);

CREATE INDEX IF NOT EXISTS idx_tenant_order_no
  ON t_production_order(tenant_id, order_no);

-- 扫码记录表索引
CREATE INDEX IF NOT EXISTS idx_tenant_order_process
  ON t_scan_record(tenant_id, order_no, process_code);

CREATE INDEX IF NOT EXISTS idx_tenant_scan_time
  ON t_scan_record(tenant_id, scan_time);

-- ==============================================
-- 5. 数据统计与验证
-- ==============================================

SELECT '==================== 数据统计 ====================' AS '';

SELECT
  '生产订单' AS 表名,
  COUNT(*) AS 记录数,
  COUNT(DISTINCT tenant_id) AS 租户数,
  COUNT(DISTINCT status) AS 状态数
FROM t_production_order
WHERE tenant_id = 99;

SELECT
  '扫码记录' AS 表名,
  COUNT(*) AS 记录数,
  COUNT(DISTINCT order_no) AS 订单数,
  COUNT(DISTINCT process_code) AS 工序数
FROM t_scan_record
WHERE tenant_id = 99;

SELECT '==================== 索引检查 ====================' AS '';

SHOW INDEX FROM t_production_order
WHERE Key_name LIKE 'idx_%';

SHOW INDEX FROM t_scan_record
WHERE Key_name LIKE 'idx_%';

SELECT '✅ 压力测试数据准备完成！' AS result;

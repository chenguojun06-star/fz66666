-- 测试基础数据初始化脚本

-- 1. 创建测试用户
INSERT INTO t_user (id, username, password, real_name, phone, role_id, factory_id, status, create_time)
VALUES
('test-user-001', 'test_worker', '$2a$10$N.zmdr9k7uOCQb376NoUnuTXJg4akfcVjnY8fRk8z6qQn9EDJqP8.', '测试工人A', '13800138001', '2', '1', 1, NOW()),
('test-user-002', 'test_qc', '$2a$10$N.zmdr9k7uOCQb376NoUnuTXJg4akfcVjnY8fRk8z6qQn9EDJqP8.', '测试质检员', '13800138002', '2', '1', 1, NOW())
ON DUPLICATE KEY UPDATE username=username;

-- 2. 创建测试工厂
INSERT INTO t_factory (id, factory_no, factory_name, contact_person, contact_phone, address, status, create_time)
VALUES
('test-factory-001', 'F-TEST-001', '测试工厂A', '张三', '13900139001', '广东省广州市', 'active', NOW()),
('test-factory-002', 'F-TEST-002', '测试工厂B', '李四', '13900139002', '广东省深圳市', 'active', NOW())
ON DUPLICATE KEY UPDATE factory_name=factory_name;

-- 3. 创建测试供应商
INSERT INTO t_supplier (id, supplier_no, supplier_name, contact_person, contact_phone, address, supplier_type, status, create_time)
VALUES
('test-supplier-001', 'S-TEST-001', '测试面料供应商', '王五', '13700137001', '浙江省杭州市', 'fabric', 'active', NOW()),
('test-supplier-002', 'S-TEST-002', '测试辅料供应商', '赵六', '13700137002', '江苏省苏州市', 'accessories', 'active', NOW())
ON DUPLICATE KEY UPDATE supplier_name=supplier_name;

-- 4. 创建测试款式
INSERT INTO t_style (id, style_no, style_name, season, category, create_time)
VALUES
('test-style-001', 'ST-TEST-001', '测试连衣裙', '春夏', '连衣裙', NOW()),
('test-style-002', 'ST-TEST-002', '测试衬衫', '全年', '衬衫', NOW())
ON DUPLICATE KEY UPDATE style_name=style_name;

SELECT '✅ 测试基础数据创建完成' as 状态;

-- 查看创建结果
SELECT '工厂' as 类型, COUNT(*) as 数量 FROM t_factory WHERE factory_no LIKE 'F-TEST%'
UNION ALL
SELECT '供应商', COUNT(*) FROM t_supplier WHERE supplier_no LIKE 'S-TEST%'
UNION ALL
SELECT '款式', COUNT(*) FROM t_style WHERE style_no LIKE 'ST-TEST%'
UNION ALL
SELECT '用户', COUNT(*) FROM t_user WHERE username LIKE 'test_%';

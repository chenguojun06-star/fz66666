-- 订单数据修复验证 - 测试数据生成脚本
-- 用途：创建最小化测试数据，用于验证订单字段完整性修复
-- 使用：docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < sql/insert-test-data-for-order-fix.sql

-- ===========================
-- 1. 创建测试工厂
-- ===========================
INSERT INTO t_factory (
    id, factory_code, factory_name, contact_person, contact_phone,
    address, status, delete_flag
) VALUES (
    'test-factory-9901', 'TEST-FACTORY-001', '修复测试工厂', '测试联系人', '13800138000',
    '测试地址', 'ENABLED', 0
) ON DUPLICATE KEY UPDATE
    factory_name = '修复测试工厂';

-- ===========================
-- 2. 创建测试款式
-- ===========================
INSERT INTO t_style_info (
    style_no, style_name, category, season, price, status
) VALUES (
    'TEST-STYLE-001', '修复测试款式', '上衣', '春季', 199.00, 'ENABLED'
) ON DUPLICATE KEY UPDATE
    style_name = '修复测试款式';

-- ===========================
-- 3. 获取款式ID并创建测试订单 - 场景A：完整字段
-- ===========================
SET @style_id = (SELECT id FROM t_style_info WHERE style_no = 'TEST-STYLE-001' LIMIT 1);

INSERT INTO t_production_order (
    id, order_no, style_no, style_id, style_name,
    order_quantity, factory_id, factory_name,
    merchandiser, company, product_category, pattern_maker,
    status, delete_flag
) VALUES (
    'test-order-9901', 'TEST-FIX-001-FULL', 'TEST-STYLE-001', @style_id, '修复测试款式',
    100, 'test-factory-9901', '修复测试工厂',
    '张三（完整字段测试）', '测试公司A', '春装上衣', '李四',
    'pending', 0
) ON DUPLICATE KEY UPDATE
    merchandiser = '张三（完整字段测试）',
    company = '测试公司A',
    product_category = '春装上衣',
    pattern_maker = '李四';

-- ===========================
-- 4. 创建测试订单 - 场景B：部分字段为空（模拟旧数据）
-- ===========================
INSERT INTO t_production_order (
    id, order_no, style_no, style_id, style_name,
    order_quantity, factory_id, factory_name,
    merchandiser, company, product_category, pattern_maker,
    status, delete_flag
) VALUES (
    'test-order-9902', 'TEST-FIX-002-PARTIAL', 'TEST-STYLE-001', @style_id, '修复测试款式',
    150, 'test-factory-9901', '修复测试工厂',
    NULL, NULL, NULL, NULL,
    'pending', 0
) ON DUPLICATE KEY UPDATE
    merchandiser = NULL,
    company = NULL,
    product_category = NULL,
    pattern_maker = NULL;

-- ===========================
-- 5. 验证插入结果
-- ===========================
SELECT
    '===== 测试数据插入完成 =====' AS '状态',
    (SELECT COUNT(*) FROM t_factory WHERE id = 'test-factory-9901') AS '工厂数量',
    (SELECT COUNT(*) FROM t_style_info WHERE style_no = 'TEST-STYLE-001') AS '款式数量',
    (SELECT COUNT(*) FROM t_production_order WHERE order_no LIKE 'TEST-FIX-%') AS '订单数量';

-- ===========================
-- 6. 显示测试订单详情
-- ===========================
SELECT
    '===== 订单字段完整性检查 =====' AS '检查项';

SELECT
    order_no AS '订单号',
    CASE WHEN merchandiser IS NOT NULL THEN '✓' ELSE '✗' END AS '跟单员',
    CASE WHEN company IS NOT NULL THEN '✓' ELSE '✗' END AS '公司',
    CASE WHEN product_category IS NOT NULL THEN '✓' ELSE '✗' END AS '产品类别',
    CASE WHEN pattern_maker IS NOT NULL THEN '✓' ELSE '✗' END AS '打样员',
    merchandiser AS '跟单员值',
    company AS '公司值',
    product_category AS '产品类别值',
    pattern_maker AS '打样员值'
FROM t_production_order
WHERE order_no LIKE 'TEST-FIX-%'
ORDER BY create_time;

-- ===========================
-- 7. 使用说明
-- ===========================
SELECT '
========================================
测试数据创建成功！
========================================

现在可以进行测试：
1. 访问前端：http://localhost:5173
2. 进入「生产管理」→「我的订单」
3. 查看测试订单：
   - TEST-FIX-001-FULL：应显示所有字段（跟单员、公司、产品类别、打样员）
   - TEST-FIX-002-PARTIAL：部分字段为空（模拟旧数据）
4. 编辑 TEST-FIX-002-PARTIAL，补充字段后保存
5. 验证字段是否正确保存和显示

清理测试数据（测试完成后）：
DELETE FROM t_production_order WHERE order_no LIKE "TEST-FIX-%";
DELETE FROM t_style_info WHERE style_no = "TEST-STYLE-001";
DELETE FROM t_factory WHERE id = "test-factory-9901";
========================================
' AS '使用说明';

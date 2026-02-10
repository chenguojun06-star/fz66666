-- 修复应用商店数据（UTF-8编码）
USE fashion_supplychain;

-- 删除旧数据
DELETE FROM t_app_store WHERE id IN (7, 8, 9, 10);

-- 重新插入正确的中文数据
INSERT INTO t_app_store (
  id, app_code, app_name, app_icon, app_desc, app_detail,
  category, price_type, price_monthly, price_yearly, price_once,
  sort_order, is_hot, is_new, status, features, trial_days,
  min_users, max_users
) VALUES
(7, 'ORDER_SYNC', '下单对接', '📦',
 '客户ERP系统自动推送订单到生产系统，无需人工录入',
 '支持订单号、款式、颜色、尺码、数量等完整信息对接，自动创建生产订单并分配工厂。',
 '生产管理', 'SUBSCRIPTION', 999.00, 9999.00, 29999.00,
 1, 1, 0, 'PUBLISHED',
 '["自动创建生产订单","支持多款式多颜色","实时订单状态同步","支持批量下单","订单进度追踪"]',
 7, 1, 999),

(8, 'QUALITY_FEEDBACK', '质检反馈', '✅',
 '入库质检结果自动推送到客户系统，及时反馈质量问题',
 '质检员完成入库检验后，系统自动将质检结果、不良数、不良率等数据推送到客户系统。',
 '质量管理', 'SUBSCRIPTION', 799.00, 7999.00, 23999.00,
 2, 0, 1, 'PUBLISHED',
 '["自动推送质检报告","支持不良品拍照","质检数据统计","质量趋势分析","客诉处理对接"]',
 7, 1, 999),

(9, 'LOGISTICS_SYNC', '物流对接', '🚚',
 '成品出库时自动推送物流信息到客户系统',
 '仓库完成成品出库操作后，系统自动推送出库单号、物流公司、运单号等信息。',
 '仓储物流', 'SUBSCRIPTION', 599.00, 5999.00, 17999.00,
 3, 0, 0, 'PUBLISHED',
 '["自动推送物流信息","支持多家物流公司","物流单号追踪","发货通知推送","签收确认回传"]',
 7, 1, 999),

(10, 'PAYMENT_SYNC', '付款对接', '💰',
 '对账审批后自动推送，支持付款确认回传',
 '财务人员审批对账单通过后，系统自动推送对账信息到客户支付系统，客户确认付款后回传更新状态。',
 '财务管理', 'SUBSCRIPTION', 699.00, 6999.00, 20999.00,
 4, 1, 1, 'PUBLISHED',
 '["对账单自动推送","付款状态同步","应收应付统计","账期管理","发票对接"]',
 7, 1, 999);

-- 验证数据
SELECT '✅ 应用商店数据已修复:' as result;
SELECT id, app_code, app_name, app_icon, price_monthly, status, trial_days
FROM t_app_store
ORDER BY sort_order;

-- 性能优化索引 - 2026-05-30
-- 针对查询慢、多端数据一致性问题的索引优化

-- =====================================================
-- 生产订单表索引
-- =====================================================

-- 订单号唯一索引 - 查询订单加速
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_order_order_no ON t_production_order(order_no);

-- 工厂查询索引
CREATE INDEX IF NOT EXISTS idx_production_order_factory ON t_production_order(factory_id);

-- 状态查询索引
CREATE INDEX IF NOT EXISTS idx_production_order_status ON t_production_order(status);

-- 款号查询索引
CREATE INDEX IF NOT EXISTS idx_production_order_style_no ON t_production_order(style_no);

-- 组合查询索引 - 工厂+状态
CREATE INDEX IF NOT EXISTS idx_production_order_factory_status ON t_production_order(factory_id, status);

-- 进度更新索引 - 扫码同步时频繁查询
CREATE INDEX IF NOT EXISTS idx_production_order_progress ON t_production_order(current_progress);

-- 租户索引 - 多租户查询
CREATE INDEX IF NOT EXISTS idx_production_order_tenant ON t_production_order(tenant_id);

-- 创建时间索引 - 按时间范围查询
CREATE INDEX IF NOT EXISTS idx_production_order_created ON t_production_order(created_at);

-- =====================================================
-- 扫码记录表索引
-- =====================================================

-- 订单ID索引 - 查看某个订单的扫码记录
CREATE INDEX IF NOT EXISTS idx_scan_record_order ON t_scan_record(order_id);

-- 时间索引 - 最新扫码记录查询
CREATE INDEX IF NOT EXISTS idx_scan_record_scanned_at ON t_scan_record(scanned_at DESC);

-- 类型索引 - 按扫码类型查询
CREATE INDEX IF NOT EXISTS idx_scan_record_scan_type ON t_scan_record(scan_type);

-- 工序索引 - 按工序查询
CREATE INDEX IF NOT EXISTS idx_scan_record_process ON t_scan_record(progress_stage);

-- 组合索引 - 订单+时间 - 查看订单最新扫码
CREATE INDEX IF NOT EXISTS idx_scan_record_order_time ON t_scan_record(order_id, scanned_at DESC);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_scan_record_tenant ON t_scan_record(tenant_id);

-- =====================================================
-- 裁剪分扎表索引
-- =====================================================

-- 订单ID索引
CREATE INDEX IF NOT EXISTS idx_cutting_bundle_order ON t_cutting_bundle(order_id);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_cutting_bundle_status ON t_cutting_bundle(status);

-- 分扎号索引
CREATE INDEX IF NOT EXISTS idx_cutting_bundle_no ON t_cutting_bundle(bundle_no);

-- 组合索引 - 订单+状态
CREATE INDEX IF NOT EXISTS idx_cutting_bundle_order_status ON t_cutting_bundle(order_id, status);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_cutting_bundle_tenant ON t_cutting_bundle(tenant_id);

-- =====================================================
-- 库存表索引
-- =====================================================

-- 物料编码索引
CREATE INDEX IF NOT EXISTS idx_material_stock_code ON t_material_stock(material_code);

-- 仓库索引
CREATE INDEX IF NOT EXISTS idx_material_stock_warehouse ON t_material_stock(warehouse_id);

-- 组合索引 - 物料+仓库
CREATE INDEX IF NOT EXISTS idx_material_stock_code_warehouse ON t_material_stock(material_code, warehouse_id);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_material_stock_tenant ON t_material_stock(tenant_id);

-- =====================================================
-- 成品入库表索引
-- =====================================================

-- 订单ID索引
CREATE INDEX IF NOT EXISTS idx_product_warehousing_order ON t_product_warehousing(order_id);

-- 入库时间索引
CREATE INDEX IF NOT EXISTS idx_product_warehousing_time ON t_product_warehousing(warehousing_at DESC);

-- 仓库索引
CREATE INDEX IF NOT EXISTS idx_product_warehousing_warehouse ON t_product_warehousing(warehouse_id);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_product_warehousing_tenant ON t_product_warehousing(tenant_id);

-- =====================================================
-- 款式表索引
-- =====================================================

-- 款号唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_style_info_no ON t_style_info(style_no);

-- 分类索引
CREATE INDEX IF NOT EXISTS idx_style_info_category ON t_style_info(category);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_style_info_tenant ON t_style_info(tenant_id);

-- =====================================================
-- 工资表索引
-- =====================================================

-- 订单ID索引
CREATE INDEX IF NOT EXISTS idx_wage_payment_order ON t_wage_payment(order_id);

-- 工人ID索引
CREATE INDEX IF NOT EXISTS idx_wage_payment_worker ON t_wage_payment(worker_id);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_wage_payment_status ON t_wage_payment(payment_status);

-- 时间索引
CREATE INDEX IF NOT EXISTS idx_wage_payment_date ON t_wage_payment(payment_date DESC);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_wage_payment_tenant ON t_wage_payment(tenant_id);

-- =====================================================
-- 客户表索引
-- =====================================================

-- 客户名称索引
CREATE INDEX IF NOT EXISTS idx_customer_name ON t_customer(customer_name);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_customer_status ON t_customer(status);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_customer_tenant ON t_customer(tenant_id);

-- =====================================================
-- 应收账款表索引
-- =====================================================

-- 客户ID索引
CREATE INDEX IF NOT EXISTS idx_receivable_customer ON t_receivable(customer_id);

-- 订单ID索引
CREATE INDEX IF NOT EXISTS idx_receivable_order ON t_receivable(order_id);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_receivable_status ON t_receivable(status);

-- 到期时间索引 - 逾期提醒
CREATE INDEX IF NOT EXISTS idx_receivable_due ON t_receivable(due_date);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_receivable_tenant ON t_receivable(tenant_id);

-- =====================================================
-- 工厂表索引
-- =====================================================

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_factory_status ON t_factory(status);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_factory_tenant ON t_factory(tenant_id);

-- =====================================================
-- 字典表索引
-- =====================================================

-- 类型索引
CREATE INDEX IF NOT EXISTS idx_dict_item_type ON t_dict_item(dict_type);

-- 状态索引
CREATE INDEX IF NOT EXISTS idx_dict_item_status ON t_dict_item(status);

-- 组合索引 - 类型+状态
CREATE INDEX IF NOT EXISTS idx_dict_item_type_status ON t_dict_item(dict_type, status);

-- =====================================================
-- 用户表索引
-- =====================================================

-- 用户名唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON t_user(username);

-- 租户索引
CREATE INDEX IF NOT EXISTS idx_user_tenant ON t_user(tenant_id);

-- =====================================================
-- 多端同步优化说明
-- =====================================================
-- 这些索引将显著提升以下场景的查询性能：
-- 1. 扫码时的订单查询 - 毫秒级响应
-- 2. 订单进度实时更新 - 多端同步
-- 3. 库存实时查询 - 降低延迟
-- 4. 工资计算 - 快速聚合
-- 5. 统计报表查询 - 提升报表生成速度
--
-- 同时配合：
-- - Redis 热点数据缓存
-- - WebSocket 实时推送
-- - 数据库连接池优化
--
-- 预计查询性能提升：50-80%

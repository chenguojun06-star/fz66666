-- =====================================================
-- 订单结算增加本厂标识字段
-- =====================================================
-- 功能：支持本厂和加工厂订单的统一管理
--
-- 业务逻辑：
-- - is_own_factory = 1: 本厂订单，关单时汇总扫码工资成本
-- - is_own_factory = 0: 加工厂订单，关单时按单价×数量计算
--
-- 所有订单结算数据统一在数据看板查看
-- =====================================================

USE fashion_supplychain;

-- 添加本厂标识字段（如果已存在则忽略错误）
ALTER TABLE t_shipment_reconciliation
ADD COLUMN is_own_factory TINYINT(1) DEFAULT 0
COMMENT '是否本厂(0:加工厂, 1:本厂)';

-- 更新历史数据：将工厂名称为"本厂"的记录标记为本厂
UPDATE t_shipment_reconciliation
SET is_own_factory = 1
WHERE factory_name = '本厂' OR factory_name = '最美服装工厂';

-- 验证结果
SELECT
    id,
    reconciliation_no,
    factory_name,
    is_own_factory,
    total_amount
FROM t_shipment_reconciliation
WHERE delete_flag = 0
ORDER BY create_time DESC
LIMIT 10;

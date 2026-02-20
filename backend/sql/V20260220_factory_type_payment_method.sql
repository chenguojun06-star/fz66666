-- =====================================================================
-- 迁移：工厂类型区分 + 工资支付方式默认值
-- 日期：2026-02-20
-- 说明：
--   1. t_wage_payment.payment_method 加 DEFAULT 'OFFLINE'，修复创建pending记录500错误
--   2. t_factory 新增 factory_type 列，区分内部工厂(INTERNAL)和外部工厂(EXTERNAL)
-- =====================================================================

-- 修复 payment_method 缺少默认值导致的 500 错误
ALTER TABLE t_wage_payment
    MODIFY COLUMN payment_method VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
    COMMENT '支付方式: OFFLINE=线下, BANK=银行转账, WECHAT=微信, ALIPAY=支付宝';

-- 新增工厂类型字段：默认所有工厂为 EXTERNAL（外部工厂）
-- INTERNAL = 本厂（内部人员结算）：通过工资结算模块按人员结算
-- EXTERNAL = 外部工厂：通过订单结算模块按工厂名结算
ALTER TABLE t_factory
    ADD COLUMN factory_type VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL'
    COMMENT '工厂类型: INTERNAL=本厂内部按人员结算, EXTERNAL=外部工厂按工厂结算';

-- 说明：如需将某个工厂标记为内部工厂，执行：
-- UPDATE t_factory SET factory_type = 'INTERNAL' WHERE factory_name = '本厂名称' AND tenant_id = 1;

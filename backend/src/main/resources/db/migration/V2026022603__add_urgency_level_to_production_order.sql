-- 为生产订单表添加紧急程度字段
-- urgent=急单，normal=普通（默认）
ALTER TABLE t_production_order
    ADD COLUMN urgency_level VARCHAR(20) NOT NULL DEFAULT 'normal' COMMENT '紧急程度:urgent=急单,normal=普通';

-- 云端环境 FLYWAY_ENABLED=false，需在微信云托管控制台手动执行以下 SQL：
-- ALTER TABLE t_production_order ADD COLUMN urgency_level VARCHAR(20) NOT NULL DEFAULT 'normal' COMMENT '紧急程度:urgent=急单,normal=普通';

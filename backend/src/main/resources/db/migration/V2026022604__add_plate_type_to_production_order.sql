-- 为生产订单表添加首单/翻单字段
-- FIRST=首单，REORDER=翻单（默认FIRST）
ALTER TABLE t_production_order
    ADD COLUMN plate_type VARCHAR(20) NOT NULL DEFAULT 'FIRST' COMMENT '订单类型:FIRST=首单,REORDER=翻单';

-- 云端环境 FLYWAY_ENABLED=false，需在微信云托管控制台手动执行以下 SQL：
-- ALTER TABLE t_production_order ADD COLUMN plate_type VARCHAR(20) NOT NULL DEFAULT 'FIRST' COMMENT '订单类型:FIRST=首单,REORDER=翻单';

-- V20260205b: 样衣库存表添加乐观锁版本号字段
-- 与 MaterialStock、ProductionOrder 保持一致的并发控制策略

ALTER TABLE t_sample_stock ADD COLUMN version int DEFAULT 0 COMMENT '乐观锁版本号（并发库存操作防覆盖）';

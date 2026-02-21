-- ==================================================================
-- 支持月付/年付计费周期
-- ==================================================================

-- 1. 给 t_tenant 增加计费周期字段
ALTER TABLE t_tenant
    ADD COLUMN billing_cycle VARCHAR(10) NOT NULL DEFAULT 'MONTHLY' COMMENT '计费周期: MONTHLY/YEARLY' AFTER storage_used_mb;

-- 2. 给 t_tenant_billing_record 增加计费周期字段
ALTER TABLE t_tenant_billing_record
    ADD COLUMN billing_cycle VARCHAR(10) NOT NULL DEFAULT 'MONTHLY' COMMENT '计费周期: MONTHLY/YEARLY' AFTER plan_type;

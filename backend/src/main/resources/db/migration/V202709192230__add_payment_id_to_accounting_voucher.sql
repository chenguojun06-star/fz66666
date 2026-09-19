-- D-474：付款凭证关联付款记录
-- 一笔账单可分多次付款（部分付款挂账），每次付款生成一张付款凭证，
-- 靠 payment_id 精确幂等、可追溯到具体那一次付款。
ALTER TABLE t_accounting_voucher
    ADD COLUMN payment_id VARCHAR(64) DEFAULT NULL COMMENT '关联付款记录ID（付款凭证专用）' AFTER bill_aggregation_id;

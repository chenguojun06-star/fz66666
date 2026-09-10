-- D-360d：采购单据支持样衣归属——样衣采购没有订单号，单据按款号(style_no)归属与查询
ALTER TABLE t_purchase_order_doc
    ADD COLUMN style_no VARCHAR(64) DEFAULT NULL COMMENT '款号（样衣采购无订单号时的单据归属）' AFTER order_no;

CREATE INDEX idx_purchase_order_doc_style_no ON t_purchase_order_doc (tenant_id, style_no);

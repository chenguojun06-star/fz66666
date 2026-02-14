SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS _tmp_keep_orders_cleanup;
CREATE TABLE _tmp_keep_orders_cleanup (
  id VARCHAR(64) PRIMARY KEY,
  order_no VARCHAR(128)
);

INSERT INTO _tmp_keep_orders_cleanup (id, order_no)
SELECT id, order_no
FROM t_production_order
ORDER BY COALESCE(update_time, create_time) DESC
LIMIT 3;

DELETE FROM t_scan_record
WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup))
   OR (order_no IS NOT NULL AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup));

DELETE FROM t_product_warehousing
WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup))
   OR (order_no IS NOT NULL AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup));

DELETE FROM t_product_outstock
WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup))
   OR (order_no IS NOT NULL AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup));

DELETE FROM t_material_purchase
WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup))
   OR (order_no IS NOT NULL AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup));

DELETE FROM t_material_picking
WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup))
   OR (order_no IS NOT NULL AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup));

DELETE FROM t_material_reconciliation
WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup))
   OR (order_no IS NOT NULL AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup));

DELETE FROM t_payroll_settlement
WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup))
   OR (order_no IS NOT NULL AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup));

DELETE FROM t_payroll_settlement_item
WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup))
   OR (order_no IS NOT NULL AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup));

DELETE FROM t_shipment_reconciliation
WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup))
   OR (order_no IS NOT NULL AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup));

DELETE FROM t_style_info
WHERE order_no IS NOT NULL AND order_no <> ''
   AND order_no NOT IN (SELECT order_no FROM _tmp_keep_orders_cleanup);

DELETE FROM t_production_order
WHERE id NOT IN (SELECT id FROM _tmp_keep_orders_cleanup);

SET FOREIGN_KEY_CHECKS=1;

SELECT 'KEPT_ORDERS' AS tag, id, order_no FROM _tmp_keep_orders_cleanup;

DROP TABLE IF EXISTS _tmp_keep_orders_cleanup;

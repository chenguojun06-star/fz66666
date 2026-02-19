CREATE OR REPLACE VIEW v_production_order_procurement_snapshot AS
SELECT
  p.order_id AS order_id,
  MIN(CASE WHEN p.status <> 'pending' THEN p.create_time END) AS procurement_start_time,
  MAX(CASE WHEN p.status <> 'pending' THEN COALESCE(p.received_time, p.update_time) END) AS procurement_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN p.status <> 'pending' THEN CONCAT(LPAD(UNIX_TIMESTAMP(COALESCE(p.received_time, p.update_time)), 20, '0'), LPAD(UNIX_TIMESTAMP(p.update_time), 20, '0'), '|', IFNULL(p.receiver_name, '')) END),
    '|', -1
  ) AS procurement_operator_name,
  SUM(IFNULL(p.purchase_quantity, 0)) AS purchase_quantity,
  SUM(IFNULL(p.arrived_quantity, 0)) AS arrived_quantity
FROM t_material_purchase p
WHERE p.delete_flag = 0
  AND p.order_id IS NOT NULL
  AND p.order_id <> ''
GROUP BY p.order_id;

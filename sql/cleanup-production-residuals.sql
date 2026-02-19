SET FOREIGN_KEY_CHECKS=0;

DELETE FROM t_cutting_bundle
WHERE production_order_id IS NULL
   OR CAST(production_order_id AS BINARY(64)) NOT IN (SELECT CAST(id AS BINARY(64)) FROM t_production_order);

DELETE FROM t_cutting_task
WHERE production_order_id IS NULL
   OR CAST(production_order_id AS BINARY(64)) NOT IN (SELECT CAST(id AS BINARY(64)) FROM t_production_order);

DELETE FROM t_production_process_tracking
WHERE production_order_id IS NULL
   OR CAST(production_order_id AS BINARY(64)) NOT IN (SELECT CAST(id AS BINARY(64)) FROM t_production_order);

DELETE FROM t_material_picking_item;

SET FOREIGN_KEY_CHECKS=1;

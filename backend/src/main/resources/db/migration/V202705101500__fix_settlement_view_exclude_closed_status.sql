CREATE OR REPLACE VIEW `v_finished_product_settlement` AS
SELECT `po`.`id` AS `order_id`,
       `po`.`order_no` AS `order_no`,
       `po`.`status` AS `status`,
       `po`.`style_no` AS `style_no`,
       `po`.`factory_id` AS `factory_id`,
       `po`.`factory_name` AS `factory_name`,
       `po`.`order_quantity` AS `order_quantity`,
       COALESCE(`sq`.`total_price`, `si`.`price`, 0) AS `style_final_price`,
       COALESCE(`sq`.`profit_rate`, 0) AS `target_profit_rate`,
       COALESCE(`si`.`price`, 0) AS `dev_cost_price`,
       COALESCE(`wh`.`total_warehoused`, 0) AS `warehoused_quantity`,
       COALESCE(`wh`.`total_defects`, 0) AS `defect_quantity`,
       COALESCE(`wh`.`colors`, '') AS `colors`,
       COALESCE(`mat`.`total_material_cost`, 0) AS `material_cost`,
       COALESCE(`scan`.`total_production_cost`, 0) AS `production_cost`,
       (CASE WHEN (`po`.`order_quantity` > 0)
         THEN ROUND(COALESCE(`wh`.`total_defects`, 0)
           * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
           / `po`.`order_quantity`), 2) ELSE 0 END) AS `defect_loss`,
       ROUND(COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0), 2) AS `total_amount`,
       ROUND((COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
         - COALESCE(`mat`.`total_material_cost`, 0) - COALESCE(`scan`.`total_production_cost`, 0)
         - (CASE WHEN (`po`.`order_quantity` > 0)
           THEN COALESCE(`wh`.`total_defects`, 0)
             * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
             / `po`.`order_quantity`) ELSE 0 END), 2) AS `profit`,
       (CASE WHEN (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0)) > 0
         THEN ROUND(((COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
           - COALESCE(`mat`.`total_material_cost`, 0) - COALESCE(`scan`.`total_production_cost`, 0)
           - (CASE WHEN (`po`.`order_quantity` > 0)
             THEN COALESCE(`wh`.`total_defects`, 0)
               * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
               / `po`.`order_quantity`) ELSE 0 END))
           / (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0)) * 100, 2)
         ELSE 0 END) AS `profit_margin`,
       COALESCE(`po`.`actual_end_date`, `wh`.`last_warehoused_time`) AS `complete_time`,
       `po`.`create_time` AS `create_time`,
       `po`.`update_time` AS `update_time`,
       `po`.`tenant_id` AS `tenant_id`
FROM `t_production_order` `po`
LEFT JOIN `t_style_info` `si` ON `po`.`style_no` = `si`.`style_no`
LEFT JOIN (
    SELECT `sq1`.`style_id`, `sq1`.`total_price`, `sq1`.`profit_rate`
    FROM `t_style_quotation` `sq1`
    INNER JOIN (
        SELECT `style_id`, MAX(`update_time`) AS `max_update_time`
        FROM `t_style_quotation` GROUP BY `style_id`
    ) `sq_latest` ON `sq1`.`style_id` = `sq_latest`.`style_id` AND `sq1`.`update_time` = `sq_latest`.`max_update_time`
) `sq` ON `sq`.`style_id` = `si`.`id`
LEFT JOIN (
    SELECT `pw`.`order_no`,
      SUM(COALESCE(`pw`.`qualified_quantity`, 0)) AS `total_warehoused`,
      SUM(COALESCE(`pw`.`unqualified_quantity`, 0)) AS `total_defects`,
      MAX(`pw`.`create_time`) AS `last_warehoused_time`,
      GROUP_CONCAT(DISTINCT CASE WHEN `cb`.`color` IS NOT NULL THEN `cb`.`color` ELSE '' END
        ORDER BY `cb`.`color` ASC SEPARATOR ', ') AS `colors`
    FROM `t_product_warehousing` `pw`
    LEFT JOIN `t_cutting_bundle` `cb` ON `pw`.`cutting_bundle_id` = `cb`.`id`
    WHERE `pw`.`delete_flag` = 0
    GROUP BY `pw`.`order_no`
) `wh` ON `po`.`order_no` = `wh`.`order_no`
LEFT JOIN (
    SELECT `order_no`, SUM(`total_amount`) AS `total_material_cost`
    FROM `t_material_purchase`
    WHERE `delete_flag` = 0
      AND `status` IN ('pending', 'received', 'completed', 'PENDING', 'RECEIVED', 'COMPLETED')
    GROUP BY `order_no`
) `mat` ON `po`.`order_no` = `mat`.`order_no`
LEFT JOIN (
    SELECT `order_no`, SUM(`scan_cost`) AS `total_production_cost`
    FROM `t_scan_record`
    WHERE `scan_cost` IS NOT NULL
      AND (`scan_type` IS NULL OR `scan_type` != 'orchestration')
      AND `factory_id` IS NULL
    GROUP BY `order_no`
) `scan` ON `po`.`order_no` = `scan`.`order_no`
WHERE `po`.`delete_flag` = 0
  AND `po`.`status` NOT IN ('CANCELLED', 'cancelled', 'DELETED', 'deleted', 'scrapped', 'SCRAPPED', 'archived', 'ARCHIVED', 'closed', 'CLOSED', '废弃', '已取消', '已报废', '已归档', '已关单')
  AND `po`.`order_no` NOT LIKE 'CUT%'
ORDER BY `po`.`create_time` DESC;

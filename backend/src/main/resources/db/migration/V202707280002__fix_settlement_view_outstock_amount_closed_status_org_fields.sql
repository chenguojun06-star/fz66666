-- 修复结算视图：outstock_amount 冲销计算 + closed 状态排除 + factory_type 等组织字段
-- 关联铁律：财务数据链路闭环（出库冲销金额不得计入；已关单订单不进入结算）
-- 修复内容：
--   1. outstock_amount CASE 两分支相同的 BUG → 冲销取 0（与 outstock_quantity 逻辑一致）
--   2. WHERE 状态排除列表补回 closed/CLOSED/已关单
--   3. SELECT 补回 factory_type/parent_org_unit_id/parent_org_unit_name/org_path 字段
--   4. t_scan_record 历史上从未定义 delete_flag（见 V20260617002/V20260618004 注释），scan 子查询不加该条件
--   5. material_cost 保留 COALESCE(mat.total_material_cost, po.material_cost, 0) 兜底

CREATE OR REPLACE VIEW `v_finished_product_settlement` AS
SELECT `po`.`id` AS `order_id`,
       `po`.`order_no` AS `order_no`,
       `po`.`status` AS `status`,
       `po`.`style_no` AS `style_no`,
       `po`.`factory_id` AS `factory_id`,
       `po`.`factory_name` AS `factory_name`,
       `po`.`factory_type` AS `factory_type`,
       `po`.`parent_org_unit_id` AS `parent_org_unit_id`,
       `po`.`parent_org_unit_name` AS `parent_org_unit_name`,
       `po`.`org_path` AS `org_path`,
       `po`.`order_quantity` AS `order_quantity`,
       COALESCE(`sq`.`total_price`, `si`.`price`, 0) AS `style_final_price`,
       COALESCE(`sq`.`profit_rate`, 0) AS `target_profit_rate`,
       COALESCE(`si`.`price`, 0) AS `dev_cost_price`,
       COALESCE(`wh`.`total_warehoused`, 0) AS `warehoused_quantity`,
       COALESCE(`wh`.`total_defects`, 0) AS `defect_quantity`,
       COALESCE(`wh`.`colors`, '') AS `colors`,
       COALESCE(`mat`.`total_material_cost`, `po`.`material_cost`, 0) AS `material_cost`,
       COALESCE(`scan`.`total_production_cost`, 0) AS `production_cost`,
       COALESCE(`out`.`total_outstock_qty`, 0) AS `outstock_quantity`,
       COALESCE(`out`.`total_outstock_amount`, 0) AS `outstock_amount`,
       GREATEST(COALESCE(`wh`.`total_warehoused`, 0) - COALESCE(`out`.`total_outstock_qty`, 0), 0) AS `current_stock`,
       (CASE WHEN (`po`.`order_quantity` > 0)
         THEN ROUND(COALESCE(`wh`.`total_defects`, 0)
           * ((COALESCE(`mat`.`total_material_cost`, `po`.`material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
           / `po`.`order_quantity`), 2) ELSE 0 END) AS `defect_loss`,
       ROUND(COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0), 2) AS `total_amount`,
       ROUND((COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
         - COALESCE(`mat`.`total_material_cost`, `po`.`material_cost`, 0) - COALESCE(`scan`.`total_production_cost`, 0)
         - (CASE WHEN (`po`.`order_quantity` > 0)
           THEN COALESCE(`wh`.`total_defects`, 0)
             * ((COALESCE(`mat`.`total_material_cost`, `po`.`material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
             / `po`.`order_quantity`) ELSE 0 END), 2) AS `profit`,
       (CASE WHEN (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0)) > 0
         THEN ROUND(((COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
           - COALESCE(`mat`.`total_material_cost`, `po`.`material_cost`, 0) - COALESCE(`scan`.`total_production_cost`,0)
           - (CASE WHEN (`po`.`order_quantity` > 0)
             THEN COALESCE(`wh`.`total_defects`,0)
               * ((COALESCE(`mat`.`total_material_cost`, `po`.`material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
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
      AND (`pw`.`reversal_status` IS NULL OR `pw`.`reversal_status` != 'REVERSED')
    GROUP BY `pw`.`order_no`
) `wh` ON `po`.`order_no` = `wh`.`order_no`
LEFT JOIN (
    SELECT `order_no`,
      SUM(COALESCE(`total_amount`, 0)) AS `total_material_cost`
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
LEFT JOIN (
    SELECT `order_no`,
      SUM(CASE WHEN `outstock_type` != 'reversal' THEN COALESCE(`outstock_quantity`, 0) ELSE 0 END) AS `total_outstock_qty`,
      SUM(CASE WHEN `outstock_type` != 'reversal' THEN COALESCE(`total_amount`, 0) ELSE 0 END) AS `total_outstock_amount`
    FROM `t_product_outstock`
    WHERE `delete_flag` = 0
      AND (`reversal_status` IS NULL OR `reversal_status` != 'REVERSED')
    GROUP BY `order_no`
) `out` ON `po`.`order_no` = `out`.`order_no`
WHERE `po`.`delete_flag` = 0
  AND `po`.`status` NOT IN ('CANCELLED', 'cancelled', 'DELETED', 'deleted', 'scrapped', 'SCRAPPED', 'archived', 'ARCHIVED', '废弃', '已取消', '已报废', '已归档', 'closed', 'CLOSED', '已关单')
  AND `po`.`order_no` NOT LIKE 'CUT%'
ORDER BY `po`.`create_time` DESC;

-- ======================================================================
-- V20260303: 修复成品结算视图 —— 入库数/次品数计算逻辑错误
-- 问题根因：旧视图用 quality_status 字段过滤后取 warehousing_quantity（整行总数），
--   导致"有次品的混合批次"（如合格8+次品2=10件，quality_status='UNQUALIFIED'）
--   的 10 件全部被计入次品，而非应有的 8 件合格入库 + 2 件次品。
-- 修复方案：直接使用 qualified_quantity 和 unqualified_quantity 字段（已由业务层按件分拆写入）。
-- 影响：订单汇总/成品结算页面的"入库数"和"次品数"恢复正确。
-- ======================================================================

DROP VIEW IF EXISTS `v_finished_product_settlement`;

CREATE VIEW `v_finished_product_settlement` AS
SELECT
    `po`.`id`             AS `order_id`,
    `po`.`order_no`       AS `order_no`,
    `po`.`status`         AS `status`,
    `po`.`style_no`       AS `style_no`,
    `po`.`factory_id`     AS `factory_id`,
    `po`.`factory_name`   AS `factory_name`,
    `po`.`order_quantity` AS `order_quantity`,

    -- 款式单价：优先使用含利润率的报价，没有报价时退回到 t_style_info.price
    COALESCE(`sq`.`total_price`, `si`.`price`, 0)         AS `style_final_price`,
    COALESCE(`sq`.`profit_rate`, 0)                        AS `target_profit_rate`,
    COALESCE(`wh`.`total_warehoused`, 0)                   AS `warehoused_quantity`,
    COALESCE(`wh`.`total_defects`, 0)                      AS `defect_quantity`,
    COALESCE(`wh`.`colors`, '')                            AS `colors`,
    COALESCE(`mat`.`total_material_cost`, 0)               AS `material_cost`,
    COALESCE(`scan`.`total_production_cost`, 0)            AS `production_cost`,

    (CASE
        WHEN (`po`.`order_quantity` > 0)
        THEN ROUND(COALESCE(`wh`.`total_defects`, 0)
            * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
               / `po`.`order_quantity`), 2)
        ELSE 0
    END) AS `defect_loss`,

    ROUND(COALESCE(`sq`.`total_price`, `si`.`price`, 0)
          * COALESCE(`wh`.`total_warehoused`, 0), 2) AS `total_amount`,

    ROUND(
        (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
        - COALESCE(`mat`.`total_material_cost`, 0)
        - COALESCE(`scan`.`total_production_cost`, 0)
        - (CASE
            WHEN (`po`.`order_quantity` > 0)
            THEN COALESCE(`wh`.`total_defects`, 0)
                 * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
                    / `po`.`order_quantity`)
            ELSE 0
           END)
    , 2) AS `profit`,

    (CASE
        WHEN (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0)) > 0
        THEN ROUND(
            (
                (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
                - COALESCE(`mat`.`total_material_cost`, 0)
                - COALESCE(`scan`.`total_production_cost`, 0)
                - (CASE
                    WHEN (`po`.`order_quantity` > 0)
                    THEN COALESCE(`wh`.`total_defects`, 0)
                         * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
                            / `po`.`order_quantity`)
                    ELSE 0
                   END)
            )
            / (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
            * 100
        , 2)
        ELSE 0
    END) AS `profit_margin`,

    `po`.`create_time` AS `create_time`,
    `po`.`update_time` AS `update_time`,
    `po`.`tenant_id`   AS `tenant_id`

FROM `t_production_order` `po`
LEFT JOIN `t_style_info` `si`
    ON `po`.`style_no` = `si`.`style_no`
LEFT JOIN (
    SELECT sq1.`style_id`, sq1.`total_price`, sq1.`profit_rate`
    FROM `t_style_quotation` sq1
    INNER JOIN (
        SELECT `style_id`, MAX(`update_time`) AS max_update_time
        FROM `t_style_quotation`
        GROUP BY `style_id`
    ) sq_latest ON sq1.`style_id` = sq_latest.`style_id`
               AND sq1.`update_time` = sq_latest.`max_update_time`
) `sq` ON `sq`.`style_id` = `si`.`id`
LEFT JOIN (
    SELECT `pw`.`order_no`,
           -- ✅ 修复：直接使用 qualified_quantity / unqualified_quantity 字段，
           --         而非通过 quality_status 过滤 warehousing_quantity（整行总数）。
           --         旧逻辑会把"合格8+次品2=10件"的整行10件全部计为次品。
           SUM(COALESCE(`pw`.`qualified_quantity`, 0))   AS `total_warehoused`,
           SUM(COALESCE(`pw`.`unqualified_quantity`, 0)) AS `total_defects`,
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
    WHERE `status` IN ('RECEIVED','COMPLETED')
    GROUP BY `order_no`
) `mat` ON `po`.`order_no` = `mat`.`order_no`
LEFT JOIN (
    SELECT `order_no`, SUM(`scan_cost`) AS `total_production_cost`
    FROM `t_scan_record`
    WHERE `scan_cost` IS NOT NULL
    GROUP BY `order_no`
) `scan` ON `po`.`order_no` = `scan`.`order_no`
-- 排除已取消/报废的订单
WHERE `po`.`status` NOT IN ('CANCELLED','cancelled','DELETED','deleted','废弃','已取消')
ORDER BY `po`.`create_time` DESC;

-- ============================================================
-- 修复 v_finished_product_settlement 视图
-- 问题1：款式单价应使用含利润率的报价价格（t_style_quotation.total_price）
--        而不是 t_style_info.price（可能是手动录入的基础价格）
-- 问题2：被取消(CANCELLED)的订单不应出现在结算管理中
-- ============================================================

DROP VIEW IF EXISTS `v_finished_product_settlement`;

CREATE VIEW `v_finished_product_settlement` AS
SELECT
    `po`.`id`               AS `order_id`,
    `po`.`order_no`         AS `order_no`,
    `po`.`status`           AS `status`,
    `po`.`style_no`         AS `style_no`,
    `po`.`factory_id`       AS `factory_id`,
    `po`.`factory_name`     AS `factory_name`,
    `po`.`order_quantity`   AS `order_quantity`,

    -- 款式单价：优先使用含利润率的报价（t_style_quotation.total_price），
    -- 没有报价时退回到 t_style_info.price
    COALESCE(`sq`.`total_price`, `si`.`price`, 0) AS `style_final_price`,

    -- 目标利润率（来自报价单）
    COALESCE(`sq`.`profit_rate`, 0) AS `target_profit_rate`,

    COALESCE(`wh`.`total_warehoused`, 0)  AS `warehoused_quantity`,
    COALESCE(`wh`.`total_defects`, 0)     AS `defect_quantity`,
    COALESCE(`wh`.`colors`, '')           AS `colors`,
    COALESCE(`mat`.`total_material_cost`, 0)   AS `material_cost`,
    COALESCE(`scan`.`total_production_cost`, 0) AS `production_cost`,

    -- 次品报废金额 = 次品数 × 单件成本（面辅料+生产）
    (CASE
        WHEN (`po`.`order_quantity` > 0)
        THEN ROUND(COALESCE(`wh`.`total_defects`, 0)
            * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
               / `po`.`order_quantity`), 2)
        ELSE 0
    END) AS `defect_loss`,

    -- 总金额 = 含利润率单价 × 入库数
    ROUND(COALESCE(`sq`.`total_price`, `si`.`price`, 0)
          * COALESCE(`wh`.`total_warehoused`, 0), 2) AS `total_amount`,

    -- 利润 = 总金额 - 面辅料成本 - 生产成本 - 次品报废
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

    -- 利润率(%) = 利润 / 总金额 × 100
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

    `po`.`create_time`  AS `create_time`,
    `po`.`update_time`  AS `update_time`,
    `po`.`tenant_id`    AS `tenant_id`

FROM `t_production_order` `po`

-- 关联款式基础信息
LEFT JOIN `t_style_info` `si`
    ON `po`.`style_no` = `si`.`style_no`

-- 关联含利润率的报价单（取每款最新的报价记录）
LEFT JOIN (
    SELECT
        sq1.`style_id`,
        sq1.`total_price`,
        sq1.`profit_rate`
    FROM `t_style_quotation` sq1
    INNER JOIN (
        SELECT `style_id`, MAX(`update_time`) AS max_update_time
        FROM `t_style_quotation`
        GROUP BY `style_id`
    ) sq_latest
        ON sq1.`style_id` = sq_latest.`style_id`
       AND sq1.`update_time` = sq_latest.`max_update_time`
) `sq`
    ON `sq`.`style_id` = `si`.`id`

-- 入库汇总：合格品数量、次品数量、颜色列表
LEFT JOIN (
    SELECT
        `pw`.`order_no`                                                          AS `order_no`,
        SUM(CASE WHEN `pw`.`quality_status` = 'QUALIFIED'                THEN `pw`.`warehousing_quantity` ELSE 0 END) AS `total_warehoused`,
        SUM(CASE WHEN `pw`.`quality_status` IN ('UNQUALIFIED', 'DEFECTIVE') THEN `pw`.`warehousing_quantity` ELSE 0 END) AS `total_defects`,
        GROUP_CONCAT(DISTINCT CASE WHEN `cb`.`color` IS NOT NULL THEN `cb`.`color` ELSE '' END
                     ORDER BY `cb`.`color` ASC SEPARATOR ', ')                  AS `colors`
    FROM `t_product_warehousing` `pw`
    LEFT JOIN `t_cutting_bundle` `cb` ON `pw`.`cutting_bundle_id` = `cb`.`id`
    GROUP BY `pw`.`order_no`
) `wh` ON `po`.`order_no` = `wh`.`order_no`

-- 面辅料采购成本汇总（已收货或已完成状态）
LEFT JOIN (
    SELECT
        `order_no`,
        SUM(`total_amount`) AS `total_material_cost`
    FROM `t_material_purchase`
    WHERE `status` IN ('RECEIVED', 'COMPLETED')
    GROUP BY `order_no`
) `mat` ON `po`.`order_no` = `mat`.`order_no`

-- 生产扫码成本汇总
LEFT JOIN (
    SELECT
        `order_no`,
        SUM(`scan_cost`) AS `total_production_cost`
    FROM `t_scan_record`
    WHERE `scan_cost` IS NOT NULL
    GROUP BY `order_no`
) `scan` ON `po`.`order_no` = `scan`.`order_no`

-- ★ 关键过滤：排除已取消/报废的订单，这些不参与结算
WHERE `po`.`status` NOT IN ('CANCELLED', 'cancelled', 'DELETED', 'deleted', '废弃', '已取消')

ORDER BY `po`.`create_time` DESC;

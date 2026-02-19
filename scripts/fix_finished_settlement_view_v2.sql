-- 修复 v_finished_product_settlement 视图
-- 1. 加入 tenant_id 列（修复 SQL 500 Unknown column 错误）
-- 2. 统一用 COALESCE(sq.total_price, si.price, 0) 计算 total_amount / profit / profit_margin

CREATE OR REPLACE VIEW `v_finished_product_settlement` AS
SELECT
  po.id                                          AS order_id,
  po.order_no                                    AS order_no,
  po.status                                      AS status,
  po.style_no                                    AS style_no,
  po.factory_id                                  AS factory_id,
  po.factory_name                                AS factory_name,
  po.order_quantity                              AS order_quantity,
  po.tenant_id                                   AS tenant_id,
  COALESCE(sq.total_price, si.price, 0)          AS style_final_price,
  COALESCE(wh.total_warehoused, 0)               AS warehoused_quantity,
  COALESCE(wh.total_defects, 0)                  AS defect_quantity,
  COALESCE(wh.colors, '')                        AS colors,
  COALESCE(mat.total_material_cost, 0)           AS material_cost,
  COALESCE(scan.total_production_cost, 0)        AS production_cost,
  CASE
    WHEN po.order_quantity > 0
    THEN ROUND(
      COALESCE(wh.total_defects, 0)
      * ((COALESCE(mat.total_material_cost, 0) + COALESCE(scan.total_production_cost, 0))
         / po.order_quantity)
    , 2)
    ELSE 0
  END                                            AS defect_loss,
  ROUND(
    COALESCE(sq.total_price, si.price, 0) * COALESCE(wh.total_warehoused, 0)
  , 2)                                           AS total_amount,
  ROUND(
    (COALESCE(sq.total_price, si.price, 0) * COALESCE(wh.total_warehoused, 0))
    - COALESCE(mat.total_material_cost, 0)
    - COALESCE(scan.total_production_cost, 0)
    - CASE
        WHEN po.order_quantity > 0
        THEN COALESCE(wh.total_defects, 0)
             * ((COALESCE(mat.total_material_cost, 0) + COALESCE(scan.total_production_cost, 0))
                / po.order_quantity)
        ELSE 0
      END
  , 2)                                           AS profit,
  CASE
    WHEN (COALESCE(sq.total_price, si.price, 0) * COALESCE(wh.total_warehoused, 0)) > 0
    THEN ROUND(
      (
        (COALESCE(sq.total_price, si.price, 0) * COALESCE(wh.total_warehoused, 0))
        - COALESCE(mat.total_material_cost, 0)
        - COALESCE(scan.total_production_cost, 0)
        - CASE
            WHEN po.order_quantity > 0
            THEN COALESCE(wh.total_defects, 0)
                 * ((COALESCE(mat.total_material_cost, 0) + COALESCE(scan.total_production_cost, 0))
                    / po.order_quantity)
            ELSE 0
          END
      )
      / (COALESCE(sq.total_price, si.price, 0) * COALESCE(wh.total_warehoused, 0))
      * 100
    , 2)
    ELSE 0
  END                                            AS profit_margin,
  po.create_time                                 AS create_time,
  po.update_time                                 AS update_time
FROM t_production_order po
LEFT JOIN t_style_info      si   ON po.style_no = si.style_no
LEFT JOIN t_style_quotation sq   ON si.id = sq.style_id
LEFT JOIN (
  SELECT
    pw.order_no,
    SUM(CASE WHEN pw.quality_status = 'QUALIFIED'
             THEN pw.warehousing_quantity ELSE 0 END)               AS total_warehoused,
    SUM(CASE WHEN pw.quality_status IN ('UNQUALIFIED','DEFECTIVE')
             THEN pw.warehousing_quantity ELSE 0 END)               AS total_defects,
    GROUP_CONCAT(
      DISTINCT CASE WHEN cb.color IS NOT NULL THEN cb.color ELSE '' END
      ORDER BY cb.color SEPARATOR ', '
    )                                                                AS colors
  FROM t_product_warehousing pw
  LEFT JOIN t_cutting_bundle cb ON pw.cutting_bundle_id = cb.id
  GROUP BY pw.order_no
) wh   ON po.order_no = wh.order_no
LEFT JOIN (
  SELECT order_no, SUM(total_amount) AS total_material_cost
  FROM t_material_purchase
  WHERE status IN ('RECEIVED','COMPLETED')
  GROUP BY order_no
) mat  ON po.order_no = mat.order_no
LEFT JOIN (
  SELECT order_no, SUM(scan_cost) AS total_production_cost
  FROM t_scan_record
  WHERE scan_cost IS NOT NULL
  GROUP BY order_no
) scan ON po.order_no = scan.order_no
WHERE po.status NOT IN ('draft','cancelled','CANCELLED')
ORDER BY po.create_time DESC;

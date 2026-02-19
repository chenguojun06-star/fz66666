-- =====================================================
-- 成品结算汇总视图 - 超级财务中心
-- =====================================================
-- 功能：汇总订单的所有财务数据，包括成本、收益、利润
-- 数据来源：订单、款式、入库、物料采购、扫码记录
-- =====================================================

CREATE OR REPLACE VIEW v_finished_product_settlement AS
SELECT
    -- 订单基础信息
    po.id AS order_id,
    po.order_no,
    po.status,
    po.style_no,
    po.order_quantity AS order_quantity,

    -- 款式信息
    si.price AS style_final_price,

    -- 生产执行数据（从入库表汇总）
    COALESCE(wh.total_warehoused, 0) AS warehoused_quantity,
    COALESCE(wh.total_defects, 0) AS defect_quantity,
    COALESCE(wh.colors, '') AS colors,

    -- 面辅料总采购价（从物料采购汇总）
    COALESCE(mat.total_material_cost, 0) AS material_cost,

    -- 生产成本（从扫码记录汇总）
    COALESCE(scan.total_production_cost, 0) AS production_cost,

    -- 次品报废金额计算
    -- 平均单位成本 = (面辅料成本 + 生产成本) / 下单数
    -- 次品报废 = 次品数 × 平均单位成本
    CASE
        WHEN po.order_quantity > 0 THEN
            ROUND(COALESCE(wh.total_defects, 0) *
                  ((COALESCE(mat.total_material_cost, 0) + COALESCE(scan.total_production_cost, 0)) / po.order_quantity), 2)
        ELSE 0
    END AS defect_loss,

    -- 总金额 = 款号资料最终价格 × 入库数
    ROUND(COALESCE(si.price, 0) * COALESCE(wh.total_warehoused, 0), 2) AS total_amount,

    -- 利润 = 总金额 - 面辅料成本 - 生产成本 - 次品报废
    ROUND(
        (COALESCE(si.price, 0) * COALESCE(wh.total_warehoused, 0)) -
        COALESCE(mat.total_material_cost, 0) -
        COALESCE(scan.total_production_cost, 0) -
        CASE
            WHEN po.order_quantity > 0 THEN
                COALESCE(wh.total_defects, 0) *
                ((COALESCE(mat.total_material_cost, 0) + COALESCE(scan.total_production_cost, 0)) / po.order_quantity)
            ELSE 0
        END,
    2) AS profit,

    -- 利润率
    CASE
        WHEN (COALESCE(si.price, 0) * COALESCE(wh.total_warehoused, 0)) > 0 THEN
            ROUND(
                ((COALESCE(si.price, 0) * COALESCE(wh.total_warehoused, 0)) -
                 COALESCE(mat.total_material_cost, 0) -
                 COALESCE(scan.total_production_cost, 0) -
                 CASE
                     WHEN po.order_quantity > 0 THEN
                         COALESCE(wh.total_defects, 0) *
                         ((COALESCE(mat.total_material_cost, 0) + COALESCE(scan.total_production_cost, 0)) / po.order_quantity)
                     ELSE 0
                 END) /
                (COALESCE(si.price, 0) * COALESCE(wh.total_warehoused, 0)) * 100,
            2)
        ELSE 0
    END AS profit_margin,

    -- 时间信息
    po.create_time,
    po.update_time

FROM t_production_order po

-- 关联款式信息（获取最终价格）
LEFT JOIN t_style_info si ON po.style_no = si.style_no

-- 汇总入库数据（合格数、次品数、颜色）
LEFT JOIN (
    SELECT
        order_no,
        SUM(CASE WHEN quality_status = 'QUALIFIED' THEN warehousing_quantity ELSE 0 END) AS total_warehoused,
        SUM(CASE WHEN quality_status IN ('UNQUALIFIED', 'DEFECTIVE') THEN warehousing_quantity ELSE 0 END) AS total_defects,
        GROUP_CONCAT(DISTINCT
            CASE
                WHEN cb.color IS NOT NULL THEN cb.color
                ELSE ''
            END
            ORDER BY cb.color
            SEPARATOR ', '
        ) AS colors
    FROM t_product_warehousing pw
    LEFT JOIN t_cutting_bundle cb ON pw.cutting_bundle_id = cb.id
    GROUP BY order_no
) wh ON po.order_no = wh.order_no

-- 汇总物料采购成本
LEFT JOIN (
    SELECT
        order_no,
        SUM(total_amount) AS total_material_cost
    FROM t_material_purchase
    WHERE status IN ('RECEIVED', 'COMPLETED')
    GROUP BY order_no
) mat ON po.order_no = mat.order_no

-- 汇总生产扫码成本
LEFT JOIN (
    SELECT
        order_no,
        SUM(scan_cost) AS total_production_cost
    FROM t_scan_record
    WHERE scan_cost IS NOT NULL
    GROUP BY order_no
) scan ON po.order_no = scan.order_no

ORDER BY po.create_time DESC;

-- =====================================================
-- 创建索引优化查询性能（如果不存在）
-- =====================================================
-- CREATE INDEX idx_production_order_no ON t_production_order(order_no);
-- CREATE INDEX idx_material_purchase_order_no ON t_material_purchase(order_no, status);
-- CREATE INDEX idx_scan_record_order_no ON t_scan_record(order_no);
-- CREATE INDEX idx_warehousing_order_no ON t_product_warehousing(order_no, quality_status);

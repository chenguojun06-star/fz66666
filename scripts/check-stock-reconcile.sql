-- =====================================================================
-- 成品库存对账巡检（D-841）
--
-- 背景（2026-10-23 生产报障「入库记录全没、0=110+0+0」）：SKU 库存与入库单是
-- 两条独立路径——建款/导入可直写 stock_quantity，入库单只由质检入库/扫码/补录生成。
-- 两条路不交叉就会「有库存无入库单」，对账公式呈现刺眼的 0 = N + 0 + 0。
--
-- 用法（生产服务器）：
--   docker compose exec -T mysql sh -c "mysql -uroot -p\$MYSQL_ROOT_PASSWORD \
--     fashion_supplychain --default-character-set=utf8mb4" < scripts/check-stock-reconcile.sql
--
-- 判定：第二个查询返回的行即为「有库存但无入库单」的款——需要走补录入库单闭合
-- （UI：成品仓详情抽屉「补入库单」，或上架编辑页；backfill 单只补单不动库存）。
-- 建议每轮大版本部署后跑一次；返回空 = 账目全闭合。
-- =====================================================================

SELECT '=== 1. 总览：有库存款 vs 有入库单款 ===' AS section;
SELECT
  (SELECT COUNT(DISTINCT style_no) FROM t_product_sku WHERE stock_quantity > 0) AS style_with_stock,
  (SELECT COUNT(DISTINCT style_no) FROM t_product_warehousing WHERE delete_flag = 0) AS style_with_inbound;

SELECT '=== 2. 异常清单：有库存但无入库单（应返回空） ===' AS section;
SELECT s.style_no,
       SUM(s.stock_quantity) AS stock_qty,
       (SELECT COUNT(*) FROM t_production_order o WHERE o.style_no = s.style_no) AS order_cnt,
       (SELECT COUNT(*) FROM t_cutting_task c WHERE c.style_no = s.style_no) AS cutting_cnt,
       (SELECT COUNT(*) FROM t_scan_record r WHERE r.style_no = s.style_no
          AND r.process_name IN ('入库', '质检')) AS qc_scan_cnt
FROM t_product_sku s
WHERE s.stock_quantity > 0
  AND NOT EXISTS (
    SELECT 1 FROM t_product_warehousing w
    WHERE TRIM(w.style_no) = TRIM(s.style_no) AND w.delete_flag = 0
  )
GROUP BY s.style_no
ORDER BY stock_qty DESC;

SELECT '=== 3. 闭合校验：库存 ≠ 入库+出库+次品 的款 ===' AS section;
SELECT s.style_no,
       SUM(s.stock_quantity) AS stock_qty,
       COALESCE((SELECT SUM(w.qualified_quantity) FROM t_product_warehousing w
                 WHERE TRIM(w.style_no) = TRIM(s.style_no) AND w.delete_flag = 0), 0) AS inbound_qty
FROM t_product_sku s
WHERE s.stock_quantity > 0
GROUP BY s.style_no
HAVING stock_qty <> inbound_qty;

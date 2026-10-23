-- D-844 收尾数据修正（2026-10-23 顾客拍板四项）
-- ⚠️ 执行前提：含中文字面量（备注/库区名），flyway 走 JDBC 无虞；
--    手工执行务必带 --default-character-set=utf8mb4（V202710230004 的教训）。
-- ① BR25CQ0573B：3 个生产单全部 scrapped（报废样衣款），款式状态 ENABLED→SCRAPPED，
--    补 1 件次品报废出库单销账（库存 1→0），此后 excludeScrapped 将其排除出上架列表
-- ② H0002/hyy111111 历史手工调账差额 4 件：补 4 张期初单（backfill，只补单不动库存）
-- ③ 直发客户 20 条：保留数据不动（业务设计：货不落库位）
-- ④ 地图外库位已由 V202710230004 订正完毕，此处仅复核

-- ── ① 报废款状态 + 销账 ──────────────────────────────────────────────
UPDATE t_style_info SET status = 'SCRAPPED'
WHERE style_no = 'BR25CQ0573B' AND status = 'ENABLED';

INSERT INTO t_product_outstock
  (id, outstock_no, sku_code, style_no, outstock_type, outstock_quantity,
   warehouse, warehouse_area_id, warehouse_area_name, create_time, remark)
SELECT
  REPLACE(UUID(), '-', ''), CONCAT('OS', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s'), '01'),
  'BR25CQ0573B天青色XS(155/72A)', 'BR25CQ0573B', 'damage_out', 1,
  'A-01-1-1', '2058914984537559042', '广州成品仓库1', NOW(),
  '次品报废销账（D-844：全报废样衣款清理，对上架侧不可见）'
WHERE EXISTS (SELECT 1 FROM t_product_sku WHERE sku_code = 'BR25CQ0573B天青色XS(155/72A)' AND stock_quantity >= 1)
  AND NOT EXISTS (
    SELECT 1 FROM t_product_outstock o
    WHERE o.sku_code = 'BR25CQ0573B天青色XS(155/72A)'
      AND o.outstock_type = 'damage_out'
      AND DATE(o.create_time) = CURDATE()
  );

UPDATE t_product_sku SET stock_quantity = stock_quantity - 1
WHERE sku_code = 'BR25CQ0573B天青色XS(155/72A)' AND stock_quantity >= 1;

-- ── ② 补 4 件期初单（只补单不动库存，backfill 通道语义）────────────────
INSERT INTO t_product_warehousing
  (id, order_id, order_no, style_id, style_no, style_name,
   warehousing_no, warehousing_type, warehousing_quantity, qualified_quantity, unqualified_quantity,
   sku_code, warehouse, warehouse_area_id, warehouse_area_name,
   quality_status, reversal_status, create_time, update_time, delete_flag, tenant_id, paid_amount)
SELECT
  REPLACE(UUID(), '-', ''), '', 'BACKFILL-D844', s.style_id, s.style_no,
  COALESCE(st.style_name, ''),
  CONCAT('WH', DATE_FORMAT(NOW(), '%Y%m%d%H%i%s'), LPAD(t.n, 2, '0')),
  'backfill', t.qty, t.qty, 0,
  s.sku_code, 'A-01-1-1', '2058914984537559042', '广州成品仓库1',
  'qualified', 'NONE', NOW(), NOW(), 0, s.tenant_id, 0.00
FROM (SELECT 1 AS n, 'H0002白色S' AS sku, 1 AS qty UNION ALL
      SELECT 2, 'H0002白色XS', 1 UNION ALL
      SELECT 3, 'hyy111111白色L', 2) t
JOIN t_product_sku s ON s.sku_code = t.sku
LEFT JOIN t_style_info st ON st.style_no = s.style_no
WHERE NOT EXISTS (
  SELECT 1 FROM t_product_warehousing w
  WHERE w.sku_code = t.sku AND w.warehousing_type = 'backfill' AND DATE(w.create_time) = CURDATE()
);

-- ── ③ 复核：地图外库位（直发客户除外，应为 0）────────────────────────
SELECT COUNT(*) AS offmap_after FROM t_product_warehousing w WHERE w.delete_flag = 0
  AND w.warehouse <> '直发客户'
  AND (w.warehouse IS NULL OR NOT EXISTS (SELECT 1 FROM t_warehouse_location l WHERE l.location_code = w.warehouse));

-- ── ④ 复核：报废款不应再出现在可上架口径（pushed_to_order=1 且非 SCRAPPED）──
SELECT style_no, status FROM t_style_info WHERE style_no = 'BR25CQ0573B';

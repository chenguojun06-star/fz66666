-- D-843 巡检：入库单库位是否都在仓库地图内
-- 用法：mysql < connect.php 后执行；期望 still_bad = 0（"直发客户"是直发流程合法值，已排除）
--
-- 背景：2026-10-23 顾客报障"补入库单的库位关联不到仓库地图"。
-- 排查发现 88 条入库单库位在地图外（默认仓 44/NULL 12/手输 A-002 9、A仓 3），
-- 根因是入库兜底「默认仓」+ 三个入口有两个没接地图下拉。
-- 修复：服务端硬闸（非地图库位拒绝入库）+ 数据订正（V202710230004）。
-- 本脚本用于日常巡检，防止再出现地图外库位。

SELECT '--- 地图外库位的入库单（除直发客户外应为 0 条）---' AS section;

SELECT w.id, w.warehousing_no, w.sku_code, w.tenant_id,
       IFNULL(w.warehouse, '<NULL>') AS warehouse,
       w.warehousing_type, w.create_time
FROM t_product_warehousing w
WHERE w.delete_flag = 0
  AND (w.warehouse IS NULL OR w.warehouse NOT IN ('直发客户'))
  AND NOT EXISTS (
    SELECT 1 FROM t_warehouse_location l WHERE l.location_code = w.warehouse
  )
ORDER BY w.create_time DESC
LIMIT 50;

SELECT '--- 按库位分布（一眼看有没有异常值）---' AS section;

SELECT IFNULL(w.warehouse, '<NULL>') AS warehouse, COUNT(*) AS cnt
FROM t_product_warehousing w
WHERE w.delete_flag = 0
GROUP BY w.warehouse
ORDER BY cnt DESC;

SELECT '--- 订正留痕（D-843 迁移写入）---' AS section;

SELECT old_warehouse, new_warehouse, COUNT(*) AS cnt
FROM t_product_warehousing_loc_fix_log
GROUP BY old_warehouse, new_warehouse
ORDER BY cnt DESC;

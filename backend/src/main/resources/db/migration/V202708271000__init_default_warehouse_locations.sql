-- D-169：为「0 库位」的默认库区批量初始化标准库位（区-架-层-位）
-- 根因：历史脚本只建了默认库区（default-{tenantId}-{TYPE}），从未初始化库位；
--       除测试租户 2 外全部租户的样衣/物料/成品仓库位为 0，小程序扫码入库无库位可选。
-- 方案：为每个 0 库位的 default-% 库区生成 A/B 区 × 2架 × 3层 × 2位 = 12 个库位，
--       编码格式与既有数据对齐（A-01-3-1 / A区 1架3层1位，参考 t_warehouse_location 租户 2 数据）。
-- 幂等：双重 NOT EXISTS（库区已有库位则跳过；目标 id 已存在则跳过），可重复执行。

INSERT INTO t_warehouse_location
    (id, location_code, location_name, zone_code, zone_name, aisle_code, rack_code,
     level_code, position_code, location_type, warehouse_type, capacity, used_capacity,
     status, tenant_id, create_time, update_time, delete_flag, area_id)
SELECT
    CONCAT('autoloc-', a.id, '-', z.zone_code, '-', r.rack_no, '-', l.level_no, '-', p.pos_no),
    CONCAT(z.zone_code, '-', LPAD(r.rack_no, 2, '0'), '-', l.level_no, '-', p.pos_no),
    CONCAT(z.zone_name, ' ', r.rack_no, '架', l.level_no, '层', p.pos_no, '位'),
    z.zone_code, z.zone_name, z.zone_code,
    CONCAT(z.zone_code, '-', LPAD(r.rack_no, 2, '0')),
    l.level_no, p.pos_no,
    'STORAGE', a.warehouse_type, 100, 0,
    'ACTIVE', a.tenant_id, NOW(), NOW(), 0, a.id
FROM t_warehouse_area a
JOIN (SELECT 'A' AS zone_code, 'A区' AS zone_name
      UNION ALL SELECT 'B', 'B区') z
JOIN (SELECT 1 AS rack_no UNION ALL SELECT 2) r
JOIN (SELECT 1 AS level_no UNION ALL SELECT 2 UNION ALL SELECT 3) l
JOIN (SELECT 1 AS pos_no UNION ALL SELECT 2) p
WHERE a.id LIKE 'default-%'
  AND a.delete_flag = 0
  AND NOT EXISTS (
      SELECT 1 FROM t_warehouse_location exist_loc
      WHERE exist_loc.area_id = a.id AND exist_loc.delete_flag = 0
  )
  AND NOT EXISTS (
      SELECT 1 FROM t_warehouse_location dup_loc
      WHERE dup_loc.id = CONCAT('autoloc-', a.id, '-', z.zone_code, '-', r.rack_no, '-', l.level_no, '-', p.pos_no)
  );

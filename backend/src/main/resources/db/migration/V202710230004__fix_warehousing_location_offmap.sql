-- D-843：入库单库位地图外数据订正（2026-10-23 顾客报障"库位对不上仓库地图"）
--
-- 背景：88 条入库单的 warehouse 不在仓库地图（t_warehouse_location）里：
--   默认仓 44（补录没选库位、后端兜底"默认仓"）+ NULL 12 + 手输 A-002 9 + A仓 3
--   （另有 20 条"直发客户"是直发流程的合法特殊值，**不动**）。
-- 后果：详情页「库位」显示的值仓库地图不认识，按库位找货/盘点全线对不上。
--
-- 订正目标库位按租户分支（location_code 跨租户重复，必须按租户选）：
--   tenant 2（主租户）  → A-01-1-1（其成品区 2058914984537559042 下的启用库位）
--   tenant 106          → A-001（其成品区 2055960236683132929 下的启用库位）
--
-- 幂等：只订正地图外的行（NOT EXISTS 子查询），重跑无副作用。
-- 留痕：原值先落 t_product_warehousing_loc_fix_log，再 UPDATE。

CREATE TABLE IF NOT EXISTS t_product_warehousing_loc_fix_log (
  id             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  warehousing_id VARCHAR(64)  NOT NULL COMMENT '被订正的入库单 id',
  sku_code       VARCHAR(128) NULL COMMENT '商品编码',
  tenant_id      BIGINT       NULL COMMENT '租户',
  old_warehouse  VARCHAR(100) NULL COMMENT '订正前库位（地图外值，可能为 NULL）',
  new_warehouse  VARCHAR(100) NOT NULL COMMENT '订正后库位（仓库地图编码）',
  fix_time       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '订正时间',
  PRIMARY KEY (id),
  KEY idx_wh_id (warehousing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入库单库位订正留痕（D-843）';

-- 幂等：留痕按 warehousing_id 去重（Flyway 重跑/重复执行不重复留痕）
INSERT INTO t_product_warehousing_loc_fix_log (warehousing_id, sku_code, tenant_id, old_warehouse, new_warehouse)
SELECT w.id, w.sku_code, w.tenant_id, w.warehouse,
       CASE w.tenant_id WHEN 2 THEN 'A-01-1-1' ELSE 'A-001' END
FROM t_product_warehousing w
WHERE w.delete_flag = 0
  AND (w.warehouse IS NULL OR w.warehouse NOT IN ('直发客户'))
  AND (w.warehouse IS NULL
       OR NOT EXISTS (SELECT 1 FROM t_warehouse_location l WHERE l.location_code = w.warehouse))
  AND NOT EXISTS (SELECT 1 FROM t_product_warehousing_loc_fix_log f WHERE f.warehousing_id = w.id);

-- 主租户 2：订正到其成品区下的启用库位 A-01-1-1
UPDATE t_product_warehousing w
SET w.warehouse = 'A-01-1-1',
    w.warehouse_area_id = '2058914984537559042',
    w.warehouse_area_name = '广州成品仓库1'
WHERE w.delete_flag = 0
  AND w.tenant_id = 2
  AND (w.warehouse IS NULL OR w.warehouse NOT IN ('直发客户'))
  AND (w.warehouse IS NULL
       OR NOT EXISTS (SELECT 1 FROM t_warehouse_location l WHERE l.location_code = w.warehouse));

-- 租户 106：订正到其成品区下的启用库位 A-001
UPDATE t_product_warehousing w
SET w.warehouse = 'A-001',
    w.warehouse_area_id = '2055960236683132929',
    w.warehouse_area_name = '广州成品仓库1'
WHERE w.delete_flag = 0
  AND w.tenant_id = 106
  AND (w.warehouse IS NULL OR w.warehouse NOT IN ('直发客户'))
  AND (w.warehouse IS NULL
       OR NOT EXISTS (SELECT 1 FROM t_warehouse_location l WHERE l.location_code = w.warehouse));

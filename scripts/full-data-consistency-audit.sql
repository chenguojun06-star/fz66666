-- ========================================================
-- 全系统数据一致性专项核查 SQL 合集
-- 解决 python 脚本中 collation 冲突问题
-- 执行方式：mysql -h127.0.0.1 -P3308 -uroot -pchangeme fashion_supplychain < audit.sql
-- ========================================================

SELECT '===【模块1】工资结算 ↔ 扫码 ↔ tracking 一致性 ===' AS step;

-- 1.1 扫码记录settlement_status=settled 但 tracking.is_settled 未标记
SELECT '1.1' AS item, COUNT(*) AS cnt
FROM t_scan_record sr
INNER JOIN t_production_process_tracking pt
  ON pt.scan_record_id COLLATE utf8mb4_unicode_ci = sr.id COLLATE utf8mb4_unicode_ci
 AND pt.tenant_id = sr.tenant_id
WHERE sr.settlement_status = 'settled'
  AND pt.delete_flag = 0
  AND (pt.is_settled = 0 OR pt.is_settled IS NULL);

-- 1.2 tracking已结算但 settled_batch_no 找不到结算单
SELECT '1.2' AS item, COUNT(*) AS cnt
FROM t_production_process_tracking pt
WHERE pt.is_settled = 1
  AND pt.settled_batch_no IS NOT NULL AND pt.settled_batch_no != ''
  AND NOT EXISTS (
      SELECT 1 FROM t_payroll_settlement ps
      WHERE ps.id COLLATE utf8mb4_unicode_ci = pt.settled_batch_no COLLATE utf8mb4_unicode_ci
        AND ps.tenant_id = pt.tenant_id
  )
  AND pt.delete_flag = 0;

-- 1.3 扫码记录有payroll_settlement_id 但settlement_status≠settled
SELECT '1.3' AS item, COUNT(*) AS cnt
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
  AND sr.payroll_settlement_id IS NOT NULL AND sr.payroll_settlement_id != ''
  AND (sr.settlement_status != 'settled' OR sr.settlement_status IS NULL);

-- 1.4 结算单approved状态 但明细为空
SELECT '1.4' AS item, COUNT(*) AS cnt
FROM t_payroll_settlement ps
WHERE ps.status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM t_payroll_settlement_item psi WHERE psi.settlement_id COLLATE utf8mb4_unicode_ci = ps.id COLLATE utf8mb4_unicode_ci);

-- 1.5 结算单金额与明细合计不一致（差异>0.01）
SELECT '1.5' AS item, COUNT(*) AS cnt FROM (
    SELECT ps.id
    FROM t_payroll_settlement ps
    LEFT JOIN t_payroll_settlement_item psi ON psi.settlement_id COLLATE utf8mb4_unicode_ci = ps.id COLLATE utf8mb4_unicode_ci
    WHERE ps.status = 'approved'
    GROUP BY ps.id
    HAVING ABS(ps.total_amount - COALESCE(SUM(psi.total_amount), 0)) > 0.01
) t;

SELECT '===【模块2】工序跟踪完整性核查 ===' AS step;

-- 2.1 tracking已扫码但scan_record_id为空
SELECT '2.1' AS item, COUNT(*) AS cnt
FROM t_production_process_tracking
WHERE scan_status = 'scanned'
  AND (scan_record_id IS NULL OR scan_record_id = '')
  AND delete_flag = 0;

-- 2.2 tracking.scan_record_id 指向不存在的扫码记录
SELECT '2.2' AS item, COUNT(*) AS cnt
FROM t_production_process_tracking pt
WHERE pt.scan_record_id IS NOT NULL AND pt.scan_record_id != ''
  AND pt.delete_flag = 0
  AND NOT EXISTS (
      SELECT 1 FROM t_scan_record sr
      WHERE sr.id COLLATE utf8mb4_unicode_ci = pt.scan_record_id COLLATE utf8mb4_unicode_ci
        AND sr.tenant_id = pt.tenant_id
  );

-- 2.3 扫码成功但未生成对应tracking记录（扫码→跟踪断链）
SELECT '2.3' AS item, COUNT(*) AS cnt
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
  AND sr.scan_type != 'orchestration'
  AND NOT EXISTS (
      SELECT 1 FROM t_production_process_tracking pt
      WHERE pt.scan_record_id COLLATE utf8mb4_unicode_ci = sr.id COLLATE utf8mb4_unicode_ci
        AND pt.tenant_id = sr.tenant_id
        AND pt.delete_flag = 0
  );

-- 2.4 订单已开始生产（已确认/生产中/已完成）但裁剪分菲无tracking记录
SELECT '2.4' AS item, COUNT(DISTINCT cb.id) AS cnt
FROM t_cutting_bundle cb
INNER JOIN t_production_order po
  ON cb.production_order_id COLLATE utf8mb4_unicode_ci = po.id COLLATE utf8mb4_unicode_ci
 AND po.tenant_id = cb.tenant_id
WHERE po.delete_flag = 0 AND cb.delete_flag = 0
  AND po.status IN ('CONFIRMED','IN_PROGRESS','COMPLETED','QC_PASSED','WAREHOUSED')
  AND NOT EXISTS (
      SELECT 1 FROM t_production_process_tracking pt
      WHERE pt.cutting_bundle_id COLLATE utf8mb4_unicode_ci = cb.id COLLATE utf8mb4_unicode_ci
        AND pt.tenant_id = cb.tenant_id
  );

-- 2.5 同菲号同工序多条已扫码tracking（重复扫码）
SELECT '2.5' AS item, COUNT(*) AS cnt FROM (
    SELECT cutting_bundle_id, process_code, COUNT(*) c
    FROM t_production_process_tracking
    WHERE scan_status = 'scanned' AND delete_flag = 0
    GROUP BY cutting_bundle_id, process_code
    HAVING COUNT(*) > 1
) t;

SELECT '===【模块3】BOM物料 & 大货采购 ===' AS step;

-- 3.1 样衣已完成BOM阶段，但物料缺失用量/损耗率/单位
SELECT '3.1' AS item, COUNT(*) AS cnt
FROM t_style_bom sb
INNER JOIN t_style_info si
  ON sb.style_id COLLATE utf8mb4_unicode_ci = si.id COLLATE utf8mb4_unicode_ci
 AND si.tenant_id = sb.tenant_id
WHERE (si.bom_completed_time IS NOT NULL OR si.sample_completed_time IS NOT NULL)
  AND (sb.usage_amount IS NULL OR sb.usage_amount = 0
       OR sb.loss_rate IS NULL OR sb.unit IS NULL OR sb.unit = '')
  AND si.delete_flag = 0;

-- 3.2 大货订单采购需求数量缺失（0/NULL）
SELECT '3.2' AS item, COUNT(*) AS cnt
FROM t_material_purchase mp
INNER JOIN t_production_order po
  ON mp.order_id COLLATE utf8mb4_unicode_ci = po.id COLLATE utf8mb4_unicode_ci
 AND mp.tenant_id = po.tenant_id
WHERE mp.delete_flag = 0 AND po.delete_flag = 0
  AND (mp.purchase_quantity IS NULL OR mp.purchase_quantity <= 0)
  AND po.status NOT IN ('PENDING', 'CANCELLED', 'CLOSED');

-- 3.3 同名物料在不同样衣中使用了不同单位
SELECT '3.3' AS item, COUNT(DISTINCT material_name) AS cnt FROM (
    SELECT material_name, COUNT(DISTINCT unit) u_cnt
    FROM t_style_bom
    WHERE material_name IS NOT NULL AND unit IS NOT NULL
    GROUP BY material_name
    HAVING COUNT(DISTINCT unit) > 1
) t;

SELECT '===【模块4】订单状态机合法性 ===' AS step;

-- 4.1 订单delete_flag=1但状态在流转中
SELECT '4.1' AS item, COUNT(*) AS cnt
FROM t_production_order
WHERE delete_flag = 1 AND status IN ('PENDING','IN_PROGRESS','CONFIRMED');

-- 4.2 订单已终态（完成/入库/关单）但仍有pending tracking
SELECT '4.2' AS item, COUNT(DISTINCT po.id) AS cnt
FROM t_production_order po
INNER JOIN t_production_process_tracking pt
  ON pt.production_order_id COLLATE utf8mb4_unicode_ci = po.id COLLATE utf8mb4_unicode_ci
 AND pt.tenant_id = po.tenant_id
WHERE po.delete_flag = 0
  AND po.status IN ('COMPLETED','WAREHOUSED','CLOSED','QC_PASSED')
  AND pt.scan_status = 'pending'
  AND pt.delete_flag = 0;

-- 4.3 订单工序tracking全已扫码但状态未推进
SELECT '4.3' AS item, COUNT(DISTINCT po.id) AS cnt
FROM t_production_order po
WHERE po.status IN ('IN_PROGRESS','CONFIRMED')
  AND po.delete_flag = 0
  AND EXISTS (
      SELECT 1 FROM t_production_process_tracking pt
      WHERE pt.production_order_id COLLATE utf8mb4_unicode_ci = po.id COLLATE utf8mb4_unicode_ci
        AND pt.tenant_id = po.tenant_id
        AND pt.scan_status = 'scanned'
        AND pt.delete_flag = 0
  )
  AND NOT EXISTS (
      SELECT 1 FROM t_production_process_tracking pt
      WHERE pt.production_order_id COLLATE utf8mb4_unicode_ci = po.id COLLATE utf8mb4_unicode_ci
        AND pt.tenant_id = po.tenant_id
        AND pt.scan_status != 'scanned'
        AND pt.delete_flag = 0
  );

-- 4.4 订单status=EXTERNAL（外发中）但factory_id为空
SELECT '4.4' AS item, COUNT(*) AS cnt
FROM t_production_order
WHERE delete_flag = 0 AND status = 'EXTERNAL'
  AND (factory_id IS NULL OR factory_id = 0);

SELECT '===【模块5】补充核查 ===' AS step;

-- 5.1 扫码成功但quantity为0/NULL
SELECT '5.1' AS item, COUNT(*) AS cnt
FROM t_scan_record
WHERE scan_result = 'success'
  AND (quantity IS NULL OR quantity = 0);

-- 5.2 库存变更流水指向不存在的订单
SELECT '5.2' AS item, COUNT(*) AS cnt
FROM t_stock_change_log scl
WHERE scl.related_order_id IS NOT NULL AND scl.related_order_id != ''
  AND NOT EXISTS (
      SELECT 1 FROM t_production_order po
      WHERE po.id COLLATE utf8mb4_unicode_ci = scl.related_order_id COLLATE utf8mb4_unicode_ci
  );

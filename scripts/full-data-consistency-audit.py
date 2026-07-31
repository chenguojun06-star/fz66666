#!/usr/bin/env python3
"""全系统数据一致性专项核查 - 每个JOIN显式COLLATE规避列级字符集冲突"""

import pymysql, os, sys
from collections import defaultdict

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")
C = "utf8mb4_unicode_ci"

conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                       password=DB_PASSWORD, database=DB_NAME,
                       cursorclass=pymysql.cursors.DictCursor,
                       charset='utf8mb4')
cur = conn.cursor()

ALL = []
def Q(sql, one=False):
    cur.execute(sql)
    return cur.fetchone() if one else cur.fetchall()

def rep(level, cat, desc, n=0, hint=None):
    ALL.append((level, cat, desc, n, hint))
    icon = {"P0":"🛑","P1":"⚠️ ","P2":"🔍","OK":"✅"}.get(level, "❓")
    ns = f" [{n}条]" if n else ""
    print(f"  {icon} {level} {desc}{ns}")
    if hint and n:
        print(f"      ↳ {hint}")

print("\n===【模块1】工资结算 ↔ 扫码 ↔ tracking 一致性 ===")

# 1.1
r = Q(f"""SELECT COUNT(*) AS c FROM t_scan_record sr
INNER JOIN t_production_process_tracking pt
  ON pt.scan_record_id COLLATE {C} = sr.id COLLATE {C}
 AND pt.tenant_id = sr.tenant_id
WHERE sr.settlement_status = 'settled'
  AND pt.delete_flag = 0 AND (pt.is_settled=0 OR pt.is_settled IS NULL)""", True)
if r['c']: rep("P1","工资结算","settled扫码记录但tracking.is_settled未标记（历史脏数据）", r['c'],
               "可用批量更新修复：JOIN两表按scan_record_id匹配SET is_settled=1")
else: print("  ✅ 已结算扫码与tracking.is_settled一致")

# 1.2
r = Q(f"""SELECT COUNT(*) AS c FROM t_production_process_tracking pt
WHERE pt.is_settled=1 AND pt.settled_batch_no IS NOT NULL AND pt.settled_batch_no!=''
  AND pt.delete_flag=0
  AND NOT EXISTS (SELECT 1 FROM t_payroll_settlement ps
    WHERE ps.id COLLATE {C}=pt.settled_batch_no COLLATE {C} AND ps.tenant_id=pt.tenant_id)""", True)
if r['c']: rep("P1","工资结算","tracking标记已结算但settled_batch_no对应结算单不存在", r['c'])
else: print("  ✅ tracking.settled_batch_no与结算单匹配正常")

# 1.3
r = Q("""SELECT COUNT(*) AS c FROM t_scan_record sr
WHERE sr.scan_result='success'
  AND sr.payroll_settlement_id IS NOT NULL AND sr.payroll_settlement_id!=''
  AND (sr.settlement_status!='settled' OR sr.settlement_status IS NULL)""", True)
if r['c']: rep("P2","工资结算","扫码有payroll_settlement_id但settlement_status未标记settled", r['c'])
else: print("  ✅ 扫码记录的settlement_status标记正常")

# 1.4
r = Q(f"""SELECT COUNT(*) AS c FROM t_payroll_settlement ps
WHERE ps.status='approved' AND NOT EXISTS
  (SELECT 1 FROM t_payroll_settlement_item psi
    WHERE psi.settlement_id COLLATE {C}=ps.id COLLATE {C})""", True)
if r['c']: rep("P1","工资结算","已通过结算单存在，但结算明细为空", r['c'])
else: print("  ✅ 已审核结算单均有明细")

# 1.5
r = Q(f"""SELECT COUNT(*) AS c FROM (
    SELECT ps.id, ps.total_amount AS settle_total,
           COALESCE(SUM(psi.total_amount),0) AS items_sum
    FROM t_payroll_settlement ps
    LEFT JOIN t_payroll_settlement_item psi
      ON psi.settlement_id COLLATE {C}=ps.id COLLATE {C}
    WHERE ps.status='approved' GROUP BY ps.id, ps.total_amount
    HAVING ABS(settle_total - items_sum) > 0.01) t""", True)
if r['c']: rep("P1","工资结算","已通过结算单金额与明细合计不一致（差异>0.01）", r['c'])
else: print("  ✅ 结算单金额与明细合计一致（<0.01）")

print("\n===【模块2】工序跟踪完整性 ===")

# 2.1
r = Q("""SELECT COUNT(*) AS c FROM t_production_process_tracking
WHERE scan_status='scanned' AND (scan_record_id IS NULL OR scan_record_id='')
  AND delete_flag=0""", True)
if r['c']: rep("P1","工序跟踪","tracking已扫码但scan_record_id为空（断链）", r['c'])
else: print("  ✅ 已扫码tracking都有关联scan_record_id")

# 2.2
r = Q(f"""SELECT COUNT(*) AS c FROM t_production_process_tracking pt
WHERE pt.scan_record_id IS NOT NULL AND pt.scan_record_id!=''
  AND pt.delete_flag=0 AND NOT EXISTS
  (SELECT 1 FROM t_scan_record sr
    WHERE sr.id COLLATE {C}=pt.scan_record_id COLLATE {C}
      AND sr.tenant_id=pt.tenant_id)""", True)
if r['c']: rep("P1","工序跟踪","tracking.scan_record_id指向不存在扫码记录（孤儿ID）", r['c'])
else: print("  ✅ tracking.scan_record_id都存在对应扫码记录")

# 2.3
# 排除 pattern（样衣扫码走PatternScanOrchestrator，不需要tracking）
# 排除 cutting（裁剪扫码是裁剪阶段完成标记，不需要生产工序tracking）
r = Q(f"""SELECT COUNT(*) AS c FROM t_scan_record sr
WHERE sr.scan_result='success' AND sr.scan_type!='orchestration' AND sr.scan_type!='pattern' AND sr.scan_type!='cutting'
  AND sr.cutting_bundle_id IS NOT NULL AND sr.cutting_bundle_id!=''
  AND NOT EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
      AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0)""", True)
if r['c']: rep("P1","工序跟踪","扫码成功但未生成对应tracking记录（扫码→跟踪断链）", r['c'])
else: print("  ✅ 所有成功扫码都已生成tracking记录")

# 2.4
r = Q(f"""SELECT COUNT(DISTINCT cb.id) AS c FROM t_cutting_bundle cb
INNER JOIN t_production_order po
  ON cb.production_order_id COLLATE {C}=po.id COLLATE {C} AND po.tenant_id=cb.tenant_id
WHERE po.delete_flag=0
  AND po.status IN ('CONFIRMED','IN_PROGRESS','COMPLETED','QC_PASSED','WAREHOUSED')
  AND NOT EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.cutting_bundle_id COLLATE {C}=cb.id COLLATE {C} AND pt.tenant_id=cb.tenant_id)""", True)
if r['c']: rep("P2","工序跟踪","订单已生产但裁剪分菲tracking为空（工序未初始化）", r['c'])
else: print("  ✅ 裁剪分菲均已初始化工序跟踪记录")

# 2.5
r = Q("""SELECT COUNT(*) AS c FROM (
    SELECT cutting_bundle_id, process_code, COUNT(*) c FROM t_production_process_tracking
    WHERE scan_status='scanned' AND delete_flag=0
    GROUP BY cutting_bundle_id, process_code HAVING COUNT(*)>1) t""", True)
if r['c']: rep("P2","工序跟踪","同一菲号同一工序存在多条已扫码记录（重复扫码）", r['c'])
else: print("  ✅ 菲号-工序维度无重复已扫码记录")

print("\n===【模块3】BOM物料 & 大货采购 ===")

# 3.1
r = Q(f"""SELECT COUNT(*) AS c FROM t_style_bom sb
INNER JOIN t_style_info si
  ON sb.style_id COLLATE {C}=si.id COLLATE {C} AND si.tenant_id=sb.tenant_id
WHERE (si.bom_completed_time IS NOT NULL OR si.sample_completed_time IS NOT NULL)
  AND (sb.usage_amount IS NULL OR sb.usage_amount=0
       OR sb.loss_rate IS NULL OR sb.unit IS NULL OR sb.unit='')
  AND si.delete_flag=0""", True)
if r['c']: rep("P1","BOM数据","已完成BOM阶段样衣存在缺失用量/损耗率/单位的物料", r['c'])
else: print("  ✅ 已完成BOM阶段的样衣物料数据完整")

# 3.2
r = Q(f"""SELECT COUNT(*) AS c FROM t_material_purchase mp
INNER JOIN t_production_order po
  ON mp.order_id COLLATE {C}=po.id COLLATE {C} AND mp.tenant_id=po.tenant_id
WHERE mp.delete_flag=0 AND po.delete_flag=0
  AND (mp.purchase_quantity IS NULL OR mp.purchase_quantity<=0)
  AND po.status NOT IN ('PENDING','CANCELLED','CLOSED')""", True)
if r['c']: rep("P1","大货采购","大货订单面辅料采购需求存在数量为0/NULL（采购计算数据缺失）", r['c'])
else: print("  ✅ 大货订单面辅料采购数量完整")

# 3.3
r = Q("""SELECT COUNT(DISTINCT material_name) AS c FROM (
    SELECT material_name, COUNT(DISTINCT unit) u_cnt FROM t_style_bom
    WHERE material_name IS NOT NULL AND unit IS NOT NULL
    GROUP BY material_name HAVING COUNT(DISTINCT unit)>1) t""", True)
if r['c']: rep("P2","BOM数据","同名物料在不同样衣中使用了不同单位（数据治理隐患）", r['c'])
else: print("  ✅ 样衣BOM同名物料单位一致")

print("\n===【模块4】订单状态机合法性 ===")

# 4.1
r = Q("""SELECT COUNT(*) AS c FROM t_production_order
WHERE delete_flag=1 AND status IN ('PENDING','IN_PROGRESS','CONFIRMED')""", True)
if r['c']:
    rows = Q("""SELECT id, order_no, status, tenant_id FROM t_production_order
                WHERE delete_flag=1 AND status IN ('PENDING','IN_PROGRESS','CONFIRMED') LIMIT 3""")
    sample = ", ".join([f"{x['order_no']}({x['status']})" for x in rows])
    rep("P2","订单状态","订单delete_flag=1但状态仍为流转中（脏数据）", r['c'], f"示例：{sample}")
else: print("  ✅ 订单delete_flag与status标记一致")

# 4.2
r = Q(f"""SELECT COUNT(DISTINCT po.id) AS c FROM t_production_order po
INNER JOIN t_production_process_tracking pt
  ON pt.production_order_id COLLATE {C}=po.id COLLATE {C} AND pt.tenant_id=po.tenant_id
WHERE po.delete_flag=0 AND po.status IN ('COMPLETED','WAREHOUSED','CLOSED','QC_PASSED')
  AND pt.scan_status='pending' AND pt.delete_flag=0""", True)
if r['c']: rep("P2","订单状态","订单已完成/关单但仍有pending工序跟踪", r['c'])
else: print("  ✅ 已关单订单无待扫码工序跟踪")

# 4.3
r = Q(f"""SELECT COUNT(DISTINCT po.id) AS c FROM t_production_order po
WHERE po.status IN ('IN_PROGRESS','CONFIRMED') AND po.delete_flag=0
  AND EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.production_order_id COLLATE {C}=po.id COLLATE {C}
      AND pt.tenant_id=po.tenant_id AND pt.scan_status='scanned' AND pt.delete_flag=0)
  AND NOT EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.production_order_id COLLATE {C}=po.id COLLATE {C}
      AND pt.tenant_id=po.tenant_id AND pt.scan_status!='scanned' AND pt.delete_flag=0)""", True)
if r['c']: rep("P2","订单状态","订单工序全部扫码完成但状态未推进（状态未自动推进）", r['c'])
else: print("  ✅ 工序全完成订单均正确推进状态")

# 4.4
r = Q("""SELECT COUNT(*) AS c FROM t_production_order
WHERE delete_flag=0 AND status='EXTERNAL' AND (factory_id IS NULL OR factory_id=0)""", True)
if r['c']: rep("P2","订单状态","订单EXTERNAL（外发中）但factory_id为空", r['c'])
else: print("  ✅ 外发订单factory_id标记正常")

print("\n===【模块5】补充核查 ===")

# 5.1
r = Q("""SELECT COUNT(*) AS c FROM t_scan_record
WHERE scan_result='success' AND (quantity IS NULL OR quantity=0)""", True)
if r['c']: rep("P2","扫码记录","扫码success但数量0/NULL（无效数据）", r['c'])
else: print("  ✅ 成功扫码都有有效数量")

# 5.2
try:
    r = Q(f"""SELECT COUNT(*) AS c FROM t_stock_change_log scl
WHERE scl.related_order_id IS NOT NULL AND scl.related_order_id!=''
  AND NOT EXISTS (SELECT 1 FROM t_production_order po
    WHERE po.id COLLATE {C}=scl.related_order_id COLLATE {C})""", True)
    if r['c']: rep("P2","库存流水","库存变更流水related_order_id指向不存在订单（orphan）", r['c'])
    else: print("  ✅ 库存流水关联订单均存在")
except Exception as e:
    print(f"  ℹ️  库存表核查跳过（{str(e)[:30]}）")

cur.close(); conn.close()

print("\n" + "=" * 60)
print("【汇总报告】")
print("=" * 60)
if not ALL:
    print("\n✅ 全系统数据一致性核查通过，未发现问题！")
    sys.exit(0)

by_lvl = defaultdict(list)
for x in ALL: by_lvl[x[0]].append(x)
print(f"\n共发现 {len(ALL)} 个数据问题：")
for lv in ["P0","P1","P2"]:
    if lv in by_lvl: print(f"  {lv}: {len(by_lvl[lv])} 项")

print("\n--- 详细清单 ---")
for i,(lv,cat,desc,n,h) in enumerate(ALL,1):
    icon = {"P0":"🛑","P1":"⚠️ ","P2":"🔍"}.get(lv, "❓")
    print(f"\n{i:>2}. {icon} [{lv}] [{cat}] {desc}")
    if n: print(f"    数量：{n} 条")
    if h: print(f"    建议：{h}")
print("\n--- 结束 ---")

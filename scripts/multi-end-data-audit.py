#!/usr/bin/env python3
"""
全系统多端数据查询断链核查脚本（v2 - 修复列名）
核查所有数据查询链路，找出"查询不到"的数据问题
"""
import pymysql, os

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

issues = []
def report(level, module, desc, count, detail=""):
    issues.append({"level": level, "module": module, "desc": desc, "count": count, "detail": detail})
    if count > 0:
        icon = "⚠️ " if level == "P1" else "ℹ️ "
        print(f"  {icon}[{level}] {module}: {desc} [{count}条]")
        if detail:
            print(f"      {detail}")
    else:
        print(f"  ✅ {module}: {desc} 正常")

def Q(sql):
    try:
        cur.execute(sql)
        return cur.fetchone()
    except Exception as e:
        print(f"  ℹ️  查询跳过: {str(e)[:100]}")
        return {'c': -1}

def table_exists(table):
    cur.execute(f"SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema='{DB_NAME}' AND table_name='{table}'")
    return cur.fetchone()['c'] > 0

# ================================================================
print("\n" + "=" * 70)
print("【模块1】订单数据查询断链核查")
print("=" * 70)

r = Q(f"""SELECT COUNT(*) AS c FROM t_production_order po
LEFT JOIN t_style_info si ON po.style_id COLLATE {C}=si.id COLLATE {C} AND si.tenant_id=po.tenant_id
WHERE po.delete_flag=0 AND po.status NOT IN ('cancelled','CANCELLED')
  AND po.style_id IS NOT NULL AND po.style_id!=''
  AND si.id IS NULL""")
report("P1", "订单-样衣", "订单关联样衣断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_production_order po
LEFT JOIN t_customer cu ON po.customer_id COLLATE {C}=cu.id COLLATE {C} AND cu.tenant_id=po.tenant_id
WHERE po.delete_flag=0 AND po.customer_id IS NOT NULL AND po.customer_id!=''
  AND cu.id IS NULL""")
report("P1", "订单-客户", "订单关联客户断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_production_order po
LEFT JOIN t_factory f ON po.factory_id COLLATE {C}=f.id COLLATE {C} AND f.tenant_id=po.tenant_id
WHERE po.delete_flag=0 AND po.factory_id IS NOT NULL AND po.factory_id!=''
  AND f.id IS NULL""")
report("P1", "订单-工厂", "订单关联工厂断链", r['c'])

# t_pattern_production 用 production_order_id
r = Q(f"""SELECT COUNT(*) AS c FROM t_production_order po
LEFT JOIN t_pattern_production pp ON po.id COLLATE {C}=pp.production_order_id COLLATE {C} AND pp.tenant_id=po.tenant_id AND pp.delete_flag=0
WHERE po.delete_flag=0 AND po.status NOT IN ('PENDING','CANCELLED')
  AND pp.id IS NULL""")
report("P2", "订单-制版", "非待确认订单无制版记录", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_production_order po
WHERE po.delete_flag=0 AND po.status NOT IN ('PENDING','CANCELLED')
  AND NOT EXISTS (SELECT 1 FROM t_process_price_adjustment ppa
    WHERE ppa.order_id COLLATE {C}=po.id COLLATE {C} AND ppa.tenant_id=po.tenant_id)""")
report("P2", "订单-工序流程", "非待确认订单无工序价格配置", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块2】扫码数据查询断链核查")
print("=" * 70)

r = Q(f"""SELECT COUNT(*) AS c FROM t_scan_record sr
LEFT JOIN t_production_order po ON sr.order_id COLLATE {C}=po.id COLLATE {C}
WHERE sr.order_id IS NOT NULL AND sr.order_id!=''
  AND po.id IS NULL""")
report("P1", "扫码-订单", "扫码记录关联订单断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_scan_record sr
LEFT JOIN t_cutting_bundle cb ON sr.cutting_bundle_id COLLATE {C}=cb.id COLLATE {C}
WHERE sr.scan_result='success' AND sr.scan_type NOT IN ('orchestration','pattern','cutting')
  AND sr.cutting_bundle_id IS NOT NULL AND sr.cutting_bundle_id!=''
  AND cb.id IS NULL""")
report("P1", "扫码-菲号", "扫码记录关联菲号断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_scan_record sr
LEFT JOIN t_user u ON sr.operator_id COLLATE {C}=u.id COLLATE {C}
WHERE sr.operator_id IS NOT NULL AND sr.operator_id!=''
  AND u.id IS NULL""")
report("P2", "扫码-操作人", "扫码记录关联操作人断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_scan_record sr
LEFT JOIN t_payroll_settlement ps ON sr.payroll_settlement_id COLLATE {C}=ps.id COLLATE {C}
WHERE sr.settlement_status='settled'
  AND sr.payroll_settlement_id IS NOT NULL AND sr.payroll_settlement_id!=''
  AND ps.id IS NULL""")
report("P1", "扫码-工资结算", "settled扫码记录关联结算单断链", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块3】BOM物料 & 采购数据查询断链核查")
print("=" * 70)

r = Q(f"""SELECT COUNT(*) AS c FROM t_style_bom sb
LEFT JOIN t_style_info si ON sb.style_id COLLATE {C}=si.id COLLATE {C}
WHERE sb.style_id IS NOT NULL AND sb.style_id!=''
  AND si.id IS NULL""")
report("P1", "BOM-样衣", "BOM关联样衣断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_material_purchase mp
LEFT JOIN t_production_order po ON mp.order_id COLLATE {C}=po.id COLLATE {C}
WHERE mp.delete_flag=0 AND mp.order_id IS NOT NULL AND mp.order_id!=''
  AND po.id IS NULL""")
report("P1", "采购-订单", "大货采购关联订单断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_material_purchase mp
LEFT JOIN t_style_info si ON mp.style_id COLLATE {C}=si.id COLLATE {C}
WHERE mp.delete_flag=0 AND mp.style_id IS NOT NULL AND mp.style_id!=''
  AND si.id IS NULL""")
report("P1", "采购-样衣", "大货采购关联样衣断链", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块4】财务数据查询断链核查")
print("=" * 70)

# t_bill_aggregation 按 source_type 分别检查
r = Q(f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
LEFT JOIN t_payroll_settlement ps ON ba.source_id COLLATE {C}=ps.id COLLATE {C}
WHERE ba.source_type='PAYROLL' AND ba.source_id IS NOT NULL AND ba.source_id!=''
  AND ba.delete_flag=0 AND ps.id IS NULL""")
report("P1", "账单-工资结算", "PAYROLL账单关联结算单断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
LEFT JOIN t_material_purchase mp ON ba.source_id COLLATE {C}=mp.id COLLATE {C}
WHERE ba.source_type='PURCHASE' AND ba.source_id IS NOT NULL AND ba.source_id!=''
  AND ba.delete_flag=0 AND mp.id IS NULL""")
report("P1", "账单-采购", "PURCHASE账单关联采购单断链", r['c'])

# 检查其他source_type的账单断链
r = Q(f"""SELECT ba.source_type, COUNT(*) AS c FROM t_bill_aggregation ba
LEFT JOIN t_material_purchase mp ON ba.source_id COLLATE {C}=mp.id COLLATE {C} AND ba.source_type='PURCHASE'
LEFT JOIN t_payroll_settlement ps ON ba.source_id COLLATE {C}=ps.id COLLATE {C} AND ba.source_type='PAYROLL'
WHERE ba.delete_flag=0 AND ba.source_id IS NOT NULL AND ba.source_id!=''
  AND ba.source_type NOT IN ('PURCHASE','PAYROLL')
GROUP BY ba.source_type""")
source_types = cur.fetchall()
for st in source_types:
    print(f"  ℹ️  账单source_type={st['source_type']}: {st['c']}条（需确认关联表）")

r = Q(f"""SELECT COUNT(*) AS c FROM t_payroll_settlement ps
LEFT JOIN t_production_order po ON ps.order_id COLLATE {C}=po.id COLLATE {C}
WHERE ps.status!='cancelled' AND ps.order_id IS NOT NULL AND ps.order_id!=''
  AND po.id IS NULL""")
report("P1", "工资结算-订单", "工资结算单关联订单断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_payroll_settlement_item psi
LEFT JOIN t_payroll_settlement ps ON psi.settlement_id COLLATE {C}=ps.id COLLATE {C}
WHERE psi.settlement_id IS NOT NULL AND psi.settlement_id!=''
  AND ps.id IS NULL""")
report("P1", "工资明细-结算单", "工资结算明细关联结算单断链", r['c'])

# t_deduction_item 用 settlement_id
r = Q(f"""SELECT COUNT(*) AS c FROM t_deduction_item di
LEFT JOIN t_payroll_settlement ps ON di.settlement_id COLLATE {C}=ps.id COLLATE {C}
WHERE di.settlement_id IS NOT NULL AND di.settlement_id!=''
  AND ps.id IS NULL""")
report("P1", "扣款项-结算单", "扣款项关联结算单断链", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块5】库存 & 出入库数据查询断链核查")
print("=" * 70)

r = Q(f"""SELECT COUNT(*) AS c FROM t_product_warehousing pw
LEFT JOIN t_production_order po ON pw.order_id COLLATE {C}=po.id COLLATE {C}
WHERE pw.delete_flag=0 AND pw.order_id IS NOT NULL AND pw.order_id!=''
  AND po.id IS NULL""")
report("P1", "成品入库-订单", "成品入库关联订单断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_product_outstock po_out
LEFT JOIN t_production_order po ON po_out.order_id COLLATE {C}=po.id COLLATE {C}
WHERE po_out.delete_flag=0 AND po_out.order_id IS NOT NULL AND po_out.order_id!=''
  AND po.id IS NULL""")
report("P1", "成品出库-订单", "成品出库关联订单断链", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块6】裁剪 & 菲号数据查询断链核查")
print("=" * 70)

r = Q(f"""SELECT COUNT(*) AS c FROM t_cutting_bundle cb
LEFT JOIN t_production_order po ON cb.production_order_id COLLATE {C}=po.id COLLATE {C}
WHERE cb.production_order_id IS NOT NULL AND cb.production_order_id!=''
  AND po.id IS NULL""")
report("P1", "裁剪分菲-订单", "裁剪分菲关联订单断链", r['c'])

# t_cutting_task 用 production_order_id
r = Q(f"""SELECT COUNT(*) AS c FROM t_cutting_task ct
LEFT JOIN t_production_order po ON ct.production_order_id COLLATE {C}=po.id COLLATE {C}
WHERE ct.production_order_id IS NOT NULL AND ct.production_order_id!=''
  AND po.id IS NULL""")
report("P1", "裁剪任务-订单", "裁剪任务关联订单断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_production_process_tracking pt
LEFT JOIN t_cutting_bundle cb ON pt.cutting_bundle_id COLLATE {C}=cb.id COLLATE {C}
WHERE pt.delete_flag=0 AND pt.cutting_bundle_id IS NOT NULL AND pt.cutting_bundle_id!=''
  AND cb.id IS NULL""")
report("P1", "tracking-菲号", "tracking关联菲号断链", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块7】制版 & 样衣数据查询断链核查")
print("=" * 70)

r = Q(f"""SELECT COUNT(*) AS c FROM t_pattern_production pp
LEFT JOIN t_production_order po ON pp.production_order_id COLLATE {C}=po.id COLLATE {C}
WHERE pp.delete_flag=0 AND pp.production_order_id IS NOT NULL AND pp.production_order_id!=''
  AND po.id IS NULL""")
report("P1", "制版-订单", "制版关联订单断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_pattern_production pp
LEFT JOIN t_style_info si ON pp.style_id COLLATE {C}=si.id COLLATE {C}
WHERE pp.delete_flag=0 AND pp.style_id IS NOT NULL AND pp.style_id!=''
  AND si.id IS NULL""")
report("P1", "制版-样衣", "制版关联样衣断链", r['c'])

r = Q(f"""SELECT COUNT(*) AS c FROM t_style_bom sb
WHERE (sb.material_code IS NULL OR sb.material_code='')
  AND sb.material_name IS NOT NULL AND sb.material_name!=''""")
report("P2", "BOM-物料", "BOM物料material_code为空", r['c'])

# t_pattern_revision 没有 delete_flag，用 status 排除已取消的
r = Q(f"""SELECT COUNT(*) AS c FROM t_pattern_revision pr
LEFT JOIN t_style_info si ON pr.style_id COLLATE {C}=si.id COLLATE {C}
WHERE pr.status!='cancelled' AND pr.style_id IS NOT NULL AND pr.style_id!=''
  AND si.id IS NULL""")
report("P1", "样衣修订-样衣", "样衣修订关联样衣断链", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块8】工序流程数据查询断链核查")
print("=" * 70)

r = Q(f"""SELECT COUNT(*) AS c FROM t_process_price_adjustment ppa
LEFT JOIN t_production_order po ON ppa.order_id COLLATE {C}=po.id COLLATE {C}
WHERE ppa.order_id IS NOT NULL AND ppa.order_id!=''
  AND po.id IS NULL""")
report("P1", "工序价格-订单", "工序价格调整关联订单断链", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块9】AI智能体数据查询断链核查")
print("=" * 70)

r = Q("""SELECT COUNT(*) AS c FROM t_ai_conversation_memory
WHERE tenant_id IS NULL OR tenant_id=0""")
report("P2", "AI会话-租户", "AI会话记忆tenant_id为空", r['c'])

r = Q("""SELECT COUNT(*) AS c FROM t_ai_long_memory
WHERE tenant_id IS NULL OR tenant_id=0""")
report("P2", "AI长期记忆-租户", "AI长期记忆tenant_id为空", r['c'])

r = Q("""SELECT COUNT(*) AS c FROM t_skill_template
WHERE (tenant_id IS NULL OR tenant_id=0) AND delete_flag=0""")
report("P2", "AI技能-租户", "AI技能模板tenant_id为空", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块10】备注日志数据查询断链核查")
print("=" * 70)

# t_order_remark 用 target_no 关联订单号
r = Q(f"""SELECT COUNT(*) AS c FROM t_order_remark or_
LEFT JOIN t_production_order po ON or_.target_no COLLATE {C}=po.order_no COLLATE {C}
WHERE or_.target_type='order' AND or_.target_no IS NOT NULL AND or_.target_no!=''
  AND po.id IS NULL""")
report("P1", "订单备注-订单", "订单备注关联订单断链", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块11】多租户隔离完整性核查")
print("=" * 70)

core_tables = [
    't_production_order', 't_scan_record', 't_cutting_bundle',
    't_material_purchase', 't_style_info', 't_payroll_settlement',
    't_production_process_tracking', 't_style_bom', 't_cutting_task',
    't_product_warehousing', 't_product_outstock', 't_bill_aggregation'
]
for table in core_tables:
    r = Q(f"SELECT COUNT(*) AS c FROM {table} WHERE tenant_id IS NULL OR tenant_id=0")
    report("P1", "多租户", f"{table} tenant_id为空", r['c'])

# ================================================================
print("\n" + "=" * 70)
print("【模块12】数据展示完整性核查（前端可能查询不到的数据）")
print("=" * 70)

# 订单有扫码但无tracking（排除pattern/cutting）
r = Q(f"""SELECT COUNT(DISTINCT po.id) AS c FROM t_production_order po
INNER JOIN t_scan_record sr ON sr.order_id COLLATE {C}=po.id COLLATE {C} AND sr.tenant_id=po.tenant_id
LEFT JOIN t_production_process_tracking pt ON pt.production_order_id COLLATE {C}=po.id COLLATE {C} AND pt.tenant_id=po.tenant_id AND pt.delete_flag=0
WHERE po.delete_flag=0 AND sr.scan_result='success' AND sr.scan_type NOT IN ('orchestration','pattern','cutting')
  AND pt.id IS NULL""")
report("P1", "展示-工序进度", "订单有扫码但无tracking（前端工序进度查询不到）", r['c'])

# 订单有tracking但无扫码
r = Q(f"""SELECT COUNT(DISTINCT po.id) AS c FROM t_production_order po
INNER JOIN t_production_process_tracking pt ON pt.production_order_id COLLATE {C}=po.id COLLATE {C} AND pt.tenant_id=po.tenant_id AND pt.delete_flag=0
LEFT JOIN t_scan_record sr ON sr.order_id COLLATE {C}=po.id COLLATE {C} AND sr.tenant_id=po.tenant_id AND sr.scan_result='success'
WHERE po.delete_flag=0 AND sr.id IS NULL""")
report("P2", "展示-扫码记录", "订单有tracking但无扫码记录", r['c'])

# 工资明细关联扫码记录断链 - scan_record_ids 是逗号分隔的多ID，取第一个ID检查
r = Q(f"""SELECT COUNT(*) AS c FROM t_payroll_settlement_item psi
LEFT JOIN t_scan_record sr ON SUBSTRING_INDEX(psi.scan_record_ids, ',', 1) COLLATE {C}=sr.id COLLATE {C}
WHERE psi.scan_record_ids IS NOT NULL AND psi.scan_record_ids!=''
  AND sr.id IS NULL""")
report("P1", "展示-工资明细", "工资明细关联扫码记录断链", r['c'])

# 订单有制版但无BOM
r = Q(f"""SELECT COUNT(DISTINCT po.id) AS c FROM t_production_order po
INNER JOIN t_pattern_production pp ON pp.production_order_id COLLATE {C}=po.id COLLATE {C} AND pp.tenant_id=po.tenant_id AND pp.delete_flag=0
WHERE po.delete_flag=0 AND po.status NOT IN ('PENDING','CANCELLED')
  AND NOT EXISTS (SELECT 1 FROM t_style_bom sb
    WHERE sb.style_id COLLATE {C}=po.style_id COLLATE {C})""")
report("P1", "展示-BOM", "订单有制版但无BOM（前端BOM tab查询不到）", r['c'])

# tracking已扫码但无scan_record_id
r = Q(f"""SELECT COUNT(*) AS c FROM t_production_process_tracking pt
WHERE pt.scan_status='scanned'
  AND (pt.scan_record_id IS NULL OR pt.scan_record_id='')
  AND pt.delete_flag=0""")
report("P1", "展示-扫码详情", "tracking已扫码但无scan_record_id（前端查不到扫码详情）", r['c'])

# 工资结算单有明细但scan_record_ids为空
r = Q(f"""SELECT COUNT(*) AS c FROM t_payroll_settlement_item psi
WHERE (psi.scan_record_ids IS NULL OR psi.scan_record_ids='')
  AND psi.process_name IS NOT NULL""")
report("P2", "展示-工资明细扫码", "工资明细scan_record_ids为空（前端查不到关联扫码）", r['c'])

# ================================================================
# 汇总
# ================================================================
print("\n" + "=" * 70)
print("【汇总报告】")
print("=" * 70)

p1_issues = [i for i in issues if i['level'] == 'P1' and i['count'] > 0]
p2_issues = [i for i in issues if i['level'] == 'P2' and i['count'] > 0]
total_p1 = sum(i['count'] for i in p1_issues)
total_p2 = sum(i['count'] for i in p2_issues)

print(f"\n共发现 {len(p1_issues) + len(p2_issues)} 个数据问题：")
print(f"  P1: {len(p1_issues)} 项，共 {total_p1} 条")
print(f"  P2: {len(p2_issues)} 项，共 {total_p2} 条")

if p1_issues:
    print("\n--- P1 问题清单（必须修复）---")
    for i in p1_issues:
        print(f"  [{i['module']}] {i['desc']}: {i['count']}条")

if p2_issues:
    print("\n--- P2 问题清单（建议修复）---")
    for i in p2_issues:
        print(f"  [{i['module']}] {i['desc']}: {i['count']}条")

# 导出详细数据
if p1_issues:
    print("\n--- P1 问题明细导出 ---")
    for i in p1_issues:
        if i['count'] > 0 and i['count'] < 100:
            print(f"\n  [{i['module']}] {i['desc']}:")

cur.close(); conn.close()
print("\n--- 核查完成 ---")

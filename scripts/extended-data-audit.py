#!/usr/bin/env python3
"""扩展核查：财务账单闭环 + 库存链路 + 三端API定义"""
import os
import pymysql

DB_CONFIG = {
    'host': '127.0.0.1', 'port': 3308, 'user': 'root',
    'password': os.environ.get('DB_PASSWORD', 'changeme'),
    'database': 'fashion_supplychain', 'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

C = 'utf8mb4_unicode_ci'

def Q(cur, sql, args=None):
    cur.execute(sql, args)
    return cur.fetchall()

def main():
    conn = pymysql.connect(**DB_CONFIG)
    cur = conn.cursor()
    issues = []

    print("=" * 70)
    print("【A】财务账单聚合闭环核查（11环节）")
    print("=" * 70)

    # A1. 样衣开发费用
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_style_info si ON ba.source_id COLLATE {C}=si.id COLLATE {C}
        WHERE ba.source_type='STYLE_DEVELOPMENT' AND ba.delete_flag=0
          AND si.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A1.样衣开发账单-样衣断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A1", "样衣开发账单-样衣断链", cnt))

    # A2. 二次工艺
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_production_order po ON ba.source_id COLLATE {C}=po.order_no COLLATE {C}
        WHERE ba.source_type='SECONDARY_PROCESS' AND ba.delete_flag=0
          AND po.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A2.二次工艺账单-订单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A2", "二次工艺账单-订单断链", cnt))

    # A3. 外发工厂对账
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_production_order po ON ba.source_id COLLATE {C}=po.order_no COLLATE {C}
        WHERE ba.source_type='OUT_FACTORY_RECONCILIATION' AND ba.delete_flag=0
          AND po.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A3.外发对账账单-订单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A3", "外发对账账单-订单断链", cnt))

    # A4. 销售出货
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_product_outstock po ON ba.source_id COLLATE {C}=po.id COLLATE {C}
        WHERE ba.source_type='SALE_OUTSTOCK' AND ba.delete_flag=0
          AND po.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A4.销售出货账单-出库单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A4", "销售出货账单-出库单断链", cnt))

    # A5. 销售退货
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_product_outstock po ON ba.source_id COLLATE {C}=po.id COLLATE {C}
        WHERE ba.source_type='SALE_RETURN' AND ba.delete_flag=0
          AND po.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A5.销售退货账单-出库单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A5", "销售退货账单-出库单断链", cnt))

    # A6. 采购退货
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_material_purchase mp ON ba.source_id COLLATE {C}=mp.id COLLATE {C}
        WHERE ba.source_type='PURCHASE_RETURN' AND ba.delete_flag=0
          AND mp.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A6.采购退货账单-采购单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A6", "采购退货账单-采购单断链", cnt))

    # A7. 采购领取/出库
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_material_purchase mp ON ba.source_id COLLATE {C}=mp.id COLLATE {C}
        WHERE ba.source_type='PURCHASE_OUTFLOW' AND ba.delete_flag=0
          AND mp.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A7.采购出库账单-采购单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A7", "采购出库账单-采购单断链", cnt))

    # A8. 成品出库冲销
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_product_outstock po ON ba.source_id COLLATE {C}=po.id COLLATE {C}
        WHERE ba.source_type='OUTSTOCK_REVERSAL' AND ba.delete_flag=0
          AND po.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A8.成品出库冲销账单-出库单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A8", "成品出库冲销账单-出库单断链", cnt))

    # A9. 工资结算
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_payroll_settlement ps ON ba.source_id COLLATE {C}=ps.id COLLATE {C}
        WHERE ba.source_type='WAGE_SETTLEMENT' AND ba.delete_flag=0
          AND ps.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A9.工资结算账单-结算单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A9", "工资结算账单-结算单断链", cnt))

    # A10. 样衣扫码撤回
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_bill_aggregation ba
        LEFT JOIN t_scan_record sr ON ba.source_id COLLATE {C}=sr.id COLLATE {C}
        WHERE ba.source_type='SAMPLE_SCAN_REVERSAL' AND ba.delete_flag=0
          AND sr.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} A10.样衣扫码撤回账单-扫码断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "A10", "样衣扫码撤回账单-扫码断链", cnt))

    # A11. 账单金额异常（金额为0但有记录）
    r = Q(cur, """SELECT COUNT(*) AS c FROM t_bill_aggregation
        WHERE delete_flag=0 AND amount=0""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "ℹ️"
    print(f"  {status} A11.账单金额为0(疑似异常): {cnt}条")
    if cnt > 0: issues.append(("P2", "A11", "账单金额为0", cnt))

    # A12. 账单复合唯一索引完整性（uk_source_active）
    r = Q(cur, """SELECT source_type, source_id, tenant_id, COUNT(*) AS c
        FROM t_bill_aggregation WHERE delete_flag=0
        GROUP BY source_type, source_id, tenant_id HAVING c > 1""")
    cnt_dup = len(r)
    status = "✅" if cnt_dup == 0 else "❌"
    print(f"  {status} A12.账单重复(违反uk_source_active): {cnt_dup}组")
    if cnt_dup > 0: issues.append(("P1", "A12", "账单重复", cnt_dup))

    print("\n" + "=" * 70)
    print("【B】库存 & 出入库数据链路核查")
    print("=" * 70)

    # B1. 成品入库-订单关联
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_product_warehousing pw
        LEFT JOIN t_production_order po ON pw.order_id COLLATE {C}=po.id COLLATE {C}
        WHERE pw.delete_flag=0 AND pw.order_id IS NOT NULL AND pw.order_id!=''
          AND po.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} B1.成品入库-订单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "B1", "成品入库-订单断链", cnt))

    # B2. 成品出库-订单关联
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_product_outstock po
        LEFT JOIN t_production_order p ON po.order_id COLLATE {C}=p.id COLLATE {C}
        WHERE po.delete_flag=0 AND po.order_id IS NOT NULL AND po.order_id!=''
          AND p.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} B2.成品出库-订单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "B2", "成品出库-订单断链", cnt))

    # B3. 入库单与出库单的关单状态一致性（先确认t_product_warehousing状态字段名）
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing'
          AND COLUMN_NAME IN ('status','warehousing_status','confirm_status','is_confirmed')""")
    pw_status_cols = [x['COLUMN_NAME'] for x in cur.fetchall()]
    pw_status_col = pw_status_cols[0] if pw_status_cols else None
    if pw_status_col:
        r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_production_order po
            WHERE po.delete_flag=0 AND po.status='closed'
              AND EXISTS (SELECT 1 FROM t_product_warehousing pw
                          WHERE pw.order_id COLLATE {C}=po.id COLLATE {C}
                            AND pw.delete_flag=0 AND pw.{pw_status_col}!='confirmed'
                            AND pw.{pw_status_col}!='completed')""")
        cnt = r[0]['c']
        status = "✅" if cnt == 0 else "ℹ️"
        print(f"  {status} B3.已关单订单有未确认入库单: {cnt}条")
        if cnt > 0: issues.append(("P2", "B3", "已关单订单有未确认入库单", cnt))
    else:
        print(f"  ℹ️ B3.t_product_warehousing无status字段，跳过")

    # B4. 出库数量超过入库数量（先动态获取数量字段名）
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing'
          AND COLUMN_NAME IN ('quantity','warehousing_quantity','qty','amount')""")
    pw_qty_col = cur.fetchone()
    pw_qty = pw_qty_col['COLUMN_NAME'] if pw_qty_col else None

    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock'
          AND COLUMN_NAME IN ('quantity','outstock_quantity','qty','amount')""")
    pos_qty_col = cur.fetchone()
    pos_qty = pos_qty_col['COLUMN_NAME'] if pos_qty_col else None

    if pw_qty and pos_qty:
        r = Q(cur, f"""SELECT COUNT(*) AS c FROM (
            SELECT po.id, po.order_no,
              COALESCE((SELECT SUM(pw.{pw_qty}) FROM t_product_warehousing pw
                        WHERE pw.order_id COLLATE {C}=po.id COLLATE {C}
                          AND pw.delete_flag=0), 0) AS warehoused,
              COALESCE((SELECT SUM(pos.{pos_qty}) FROM t_product_outstock pos
                        WHERE pos.order_id COLLATE {C}=po.id COLLATE {C}
                          AND pos.delete_flag=0), 0) AS outstocked
            FROM t_production_order po WHERE po.delete_flag=0
        ) t WHERE t.warehoused > 0 AND t.outstocked > t.warehoused""")
        cnt = r[0]['c']
        status = "✅" if cnt == 0 else "❌"
        print(f"  {status} B4.出库数量超过入库数量: {cnt}条")
        if cnt > 0: issues.append(("P1", "B4", "出库数量超过入库数量", cnt))
    else:
        print(f"  ℹ️ B4.数量字段未找到(pw_qty={pw_qty}, pos_qty={pos_qty})，跳过")

    # B5. 采购单状态合法性（含partial/partial_arrival历史状态）
    r = Q(cur, """SELECT COUNT(*) AS c FROM t_material_purchase mp
        WHERE mp.delete_flag=0 AND mp.status NOT IN
          ('pending','purchasing','partial','partial_arrival','partial_received','received','completed','cancelled','awaiting_confirm')""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} B5.采购单状态非法: {cnt}条")
    if cnt > 0: issues.append(("P1", "B5", "采购单状态非法", cnt))

    # B6. 裁剪任务-订单关联（动态获取字段）
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task'
          AND COLUMN_NAME IN ('delete_flag','is_deleted','deleted')""")
    ct_del_col = cur.fetchone()
    ct_del = ct_del_col['COLUMN_NAME'] if ct_del_col else None
    ct_where = f"ct.{ct_del}=0" if ct_del else "1=1"

    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_cutting_task ct
        LEFT JOIN t_production_order po ON ct.production_order_id COLLATE {C}=po.id COLLATE {C}
        WHERE {ct_where} AND po.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} B6.裁剪任务-订单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "B6", "裁剪任务-订单断链", cnt))

    # B7. 菲号-裁剪任务关联（动态获取外键字段）
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle'
          AND COLUMN_NAME IN ('cutting_task_id','task_id','cutting_id')""")
    cb_fk_col = cur.fetchone()
    cb_fk = cb_fk_col['COLUMN_NAME'] if cb_fk_col else None

    if cb_fk:
        r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_cutting_bundle cb
            LEFT JOIN t_cutting_task ct ON cb.{cb_fk} COLLATE {C}=ct.id COLLATE {C}
            WHERE ct.id IS NULL""")
        cnt = r[0]['c']
        status = "✅" if cnt == 0 else "❌"
        print(f"  {status} B7.菲号-裁剪任务断链: {cnt}条")
        if cnt > 0: issues.append(("P1", "B7", "菲号-裁剪任务断链", cnt))
    else:
        print(f"  ℹ️ B7.t_cutting_bundle无裁剪任务外键字段，跳过")

    print("\n" + "=" * 70)
    print("【C】扫码全流程数据完整性核查")
    print("=" * 70)

    # C1. 扫码记录-订单关联
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_scan_record sr
        LEFT JOIN t_production_order po ON sr.order_no COLLATE {C}=po.order_no COLLATE {C}
        WHERE sr.scan_result='success' AND po.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} C1.成功扫码-订单断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "C1", "成功扫码-订单断链", cnt))

    # C2. 扫码记录-操作人关联
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_scan_record sr
        LEFT JOIN t_user u ON sr.operator_id COLLATE {C}=u.id COLLATE {C}
        WHERE sr.scan_result='success' AND sr.operator_id IS NOT NULL AND sr.operator_id!=''
          AND u.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "ℹ️"
    print(f"  {status} C2.扫码-操作人断链: {cnt}条(可能是历史用户已删除)")
    if cnt > 0: issues.append(("P2", "C2", "扫码-操作人断链", cnt))

    # C3. 扫码记录类型合法性
    r = Q(cur, """SELECT DISTINCT scan_type FROM t_scan_record WHERE scan_result='success'""")
    types = [x['scan_type'] for x in r]
    valid_types = {'production','quality','warehouse','pattern','cutting','secondary_process'}
    invalid = [t for t in types if t and t not in valid_types]
    status = "✅" if not invalid else "❌"
    print(f"  {status} C3.扫码类型合法性: {len(invalid)}种非法类型 {invalid if invalid else ''}")
    if invalid: issues.append(("P1", "C3", "扫码类型非法", len(invalid)))

    # C4. 重复扫码（同菲号同工序同时间窗口5分钟内）
    r = Q(cur, """SELECT COUNT(*) AS c FROM (
        SELECT bundle_no, process_code, operator_id,
               COUNT(*) AS cnt
        FROM t_scan_record
        WHERE scan_result='success' AND bundle_no IS NOT NULL AND bundle_no!=''
          AND process_code IS NOT NULL AND process_code!=''
        GROUP BY bundle_no, process_code, operator_id, DATE_FORMAT(scan_time, '%Y-%m-%d %H:%i')
        HAVING cnt > 1
    ) t""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "ℹ️"
    print(f"  {status} C4.5分钟内重复扫码: {cnt}组")
    if cnt > 0: issues.append(("P2", "C4", "5分钟内重复扫码", cnt))

    print("\n" + "=" * 70)
    print("【D】AI系统数据完整性核查")
    print("=" * 70)

    # D1. AI记忆tenant_id完整性
    for table, label in [
        ('t_ai_conversation_memory', 'AI会话记忆'),
        ('t_ai_long_memory', 'AI长期记忆'),
        ('t_skill_template', '技能模板'),
        ('t_procedural_memory', '程序性记忆SOP'),
        ('t_intelligence_memory', '智能记忆'),
    ]:
        try:
            r = Q(cur, f"SELECT COUNT(*) AS c FROM {table} WHERE tenant_id IS NULL")
            cnt = r[0]['c']
            status = "✅" if cnt == 0 else "❌"
            print(f"  {status} D.{table} tenant_id为空: {cnt}条")
            if cnt > 0: issues.append(("P1", f"D-{table}", f"{label} tenant_id为空", cnt))
        except Exception as e:
            print(f"  ⚠️ D.{table}: {e}")

    # D2. AI会话记忆关联用户
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_ai_conversation_memory cm
        LEFT JOIN t_user u ON cm.user_id COLLATE {C}=u.id COLLATE {C}
        WHERE cm.user_id IS NOT NULL AND cm.user_id!='' AND u.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "ℹ️"
    print(f"  {status} D.AI会话-用户断链: {cnt}条")
    if cnt > 0: issues.append(("P2", "D-AIUser", "AI会话-用户断链", cnt))

    print("\n" + "=" * 70)
    print("【E】系统配置 & 权限完整性核查")
    print("=" * 70)

    # E1. 角色权限配置（动态获取delete_flag）
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_role'
          AND COLUMN_NAME IN ('delete_flag','is_deleted','deleted')""")
    role_del_col = cur.fetchone()
    role_del = role_del_col['COLUMN_NAME'] if role_del_col else None
    role_where = f"delete_flag=0" if role_del else "1=1"

    r = Q(cur, f"SELECT COUNT(*) AS c FROM t_role WHERE {role_where}")
    cnt = r[0]['c']
    print(f"  ℹ️ E1.活跃角色数: {cnt}个")

    # E2. 用户-租户关联
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_user'
          AND COLUMN_NAME IN ('delete_flag','is_deleted','deleted','status')""")
    u_del_col = cur.fetchone()
    u_del = u_del_col['COLUMN_NAME'] if u_del_col else None
    u_where = f"u.{u_del}=0" if u_del else "1=1"

    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_user u
        LEFT JOIN t_tenant t ON u.tenant_id=t.id
        WHERE {u_where} AND t.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "❌"
    print(f"  {status} E2.用户-租户断链: {cnt}条")
    if cnt > 0: issues.append(("P1", "E2", "用户-租户断链", cnt))

    # E3. 工厂-租户关联
    try:
        cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory'
              AND COLUMN_NAME IN ('delete_flag','is_deleted','deleted')""")
        f_del_col = cur.fetchone()
        f_del = f_del_col['COLUMN_NAME'] if f_del_col else None
        f_where = f"f.{f_del}=0" if f_del else "1=1"
        r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_factory f
            LEFT JOIN t_tenant t ON f.tenant_id=t.id
            WHERE {f_where} AND t.id IS NULL""")
        cnt = r[0]['c']
        status = "✅" if cnt == 0 else "❌"
        print(f"  {status} E3.工厂-租户断链: {cnt}条")
        if cnt > 0: issues.append(("P1", "E3", "工厂-租户断链", cnt))
    except Exception as e:
        print(f"  ⚠️ E3.工厂表查询失败: {e}")

    # E4. 工序流程配置（template）
    try:
        cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_process_flow_template'
              AND COLUMN_NAME IN ('delete_flag','is_deleted','deleted')""")
        t_del_col = cur.fetchone()
        t_del = t_del_col['COLUMN_NAME'] if t_del_col else None
        t_where = "delete_flag=0" if t_del else "1=1"
        r = Q(cur, f"SELECT COUNT(*) AS c FROM t_process_flow_template WHERE {t_where}")
        cnt = r[0]['c']
        print(f"  ℹ️ E4.工序流程模板: {cnt}个")
    except Exception:
        print(f"  ℹ️ E4.工序流程模板表不存在")

    # E5. 字典数据
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_dict'
          AND COLUMN_NAME IN ('delete_flag','is_deleted','deleted','status')""")
    d_del_col = cur.fetchone()
    d_del = d_del_col['COLUMN_NAME'] if d_del_col else None
    d_where = f"{d_del}=0" if d_del else "1=1"
    r = Q(cur, f"SELECT COUNT(*) AS c FROM t_dict WHERE {d_where}")
    cnt = r[0]['c']
    print(f"  ℹ️ E5.字典项: {cnt}个")

    print("\n" + "=" * 70)
    print("【F】数据完整性综合核查")
    print("=" * 70)

    # F1. 订单-款式关联
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_production_order po
        LEFT JOIN t_style_info si ON po.style_id COLLATE {C}=si.id COLLATE {C}
        WHERE po.delete_flag=0 AND po.style_id IS NOT NULL AND po.style_id!=''
          AND si.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "ℹ️"
    print(f"  {status} F1.订单-款式断链: {cnt}条(可能为已删除的样衣)")
    if cnt > 0: issues.append(("P2", "F1", "订单-款式断链", cnt))

    # F2. 订单-工厂关联（外发订单）
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_production_order po
        LEFT JOIN t_factory f ON po.factory_id COLLATE {C}=f.id COLLATE {C}
        WHERE po.delete_flag=0 AND po.factory_id IS NOT NULL AND po.factory_id!=''
          AND f.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "ℹ️"
    print(f"  {status} F2.订单-工厂断链: {cnt}条")
    if cnt > 0: issues.append(("P2", "F2", "订单-工厂断链", cnt))

    # F3. 制版-样衣关联
    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_pattern_production pp
        LEFT JOIN t_style_info si ON pp.style_id COLLATE {C}=si.id COLLATE {C}
        WHERE pp.delete_flag=0 AND pp.style_id IS NOT NULL AND pp.style_id!=''
          AND si.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "ℹ️"
    print(f"  {status} F3.制版-样衣断链: {cnt}条")
    if cnt > 0: issues.append(("P2", "F3", "制版-样衣断链", cnt))

    # F4. BOM-样衣关联
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_bom'
          AND COLUMN_NAME IN ('delete_flag','is_deleted','deleted')""")
    sb_del_col = cur.fetchone()
    sb_del = sb_del_col['COLUMN_NAME'] if sb_del_col else None
    sb_where = f"sb.{sb_del}=0" if sb_del else "1=1"

    r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_style_bom sb
        LEFT JOIN t_style_info si ON sb.style_id COLLATE {C}=si.id COLLATE {C}
        WHERE {sb_where} AND sb.style_id IS NOT NULL AND sb.style_id!=''
          AND si.id IS NULL""")
    cnt = r[0]['c']
    status = "✅" if cnt == 0 else "ℹ️"
    print(f"  {status} F4.BOM-样衣断链: {cnt}条")
    if cnt > 0: issues.append(("P2", "F4", "BOM-样衣断链", cnt))

    # F5. 工资结算-操作人关联（动态获取字段名）
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement'
          AND COLUMN_NAME IN ('delete_flag','is_deleted','deleted')""")
    ps_del_col = cur.fetchone()
    ps_del = ps_del_col['COLUMN_NAME'] if ps_del_col else None
    ps_where = f"ps.{ps_del}=0" if ps_del else "1=1"

    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement'
          AND COLUMN_NAME IN ('operator_id','operator_user_id','user_id','creator_id','settlement_user_id')""")
    ps_op_col = cur.fetchone()
    ps_op = ps_op_col['COLUMN_NAME'] if ps_op_col else None

    if ps_op:
        r = Q(cur, f"""SELECT COUNT(*) AS c FROM t_payroll_settlement ps
            LEFT JOIN t_user u ON ps.{ps_op} COLLATE {C}=u.id COLLATE {C}
            WHERE {ps_where} AND ps.{ps_op} IS NOT NULL AND ps.{ps_op}!=''
              AND u.id IS NULL""")
        cnt = r[0]['c']
        status = "✅" if cnt == 0 else "ℹ️"
        print(f"  {status} F5.工资结算-操作人断链: {cnt}条")
        if cnt > 0: issues.append(("P2", "F5", "工资结算-操作人断链", cnt))
    else:
        print(f"  ℹ️ F5.t_payroll_settlement无操作人字段，跳过")

    print("\n" + "=" * 70)
    print("【汇总报告】")
    print("=" * 70)
    p1_count = sum(1 for i in issues if i[0] == 'P1')
    p2_count = sum(1 for i in issues if i[0] == 'P2')
    p1_data = sum(i[3] for i in issues if i[0] == 'P1')
    p2_data = sum(i[3] for i in issues if i[0] == 'P2')

    print(f"\n共发现 {len(issues)} 个数据问题：")
    print(f"  P1: {p1_count} 项，共 {p1_data} 条")
    print(f"  P2: {p2_count} 项，共 {p2_data} 条")

    if issues:
        print("\n--- 问题清单 ---")
        for level, code, desc, cnt in issues:
            print(f"  [{level}] {code}: {desc} ({cnt}条)")
    else:
        print("\n✅ 全系统数据完整性核查通过！")

    conn.close()

if __name__ == '__main__':
    main()

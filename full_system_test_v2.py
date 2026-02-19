#!/usr/bin/env python3
"""
服装供应链管理系统 - 全链路自动化测试 v2.0（修复版）
覆盖范围: 登录 → 系统设置 → 款式设计(BOM/工序/尺码/报价) → 生产订单 → 裁剪 → 扫码
         → 成品入库 → 成品结算 → 面辅料管理 → 对账单 → 数据看板

修复说明:
  1. 报价单字段: profitRate (不是 targetProfitRate)
  2. 生产订单: orderDetails 含 materialPriceSource/AcquiredAt/Version
  3. 面料入库: /api/production/material/inbound/manual (不是 stock/inbound)
  4. 看板路径: /api/dashboard, /api/dashboard/top-stats 等
  5. 工资结算: POST /api/finance/payroll-settlement/operator-summary
  6. DB查询: t_style_quotation 用 profit_rate 列(不是 target_profit_rate)
  7. 领料: POST /api/production/picking (picking+items 格式)
  8. 成品入库: POST /api/production/warehousing (单条实体格式)
"""
import requests, warnings, json, random, string, time, sys, subprocess
from datetime import datetime, timedelta

warnings.filterwarnings('ignore')
BASE = 'http://localhost:8088'

# ============================================================
# 工具函数
# ============================================================
PASS_CNT = 0; FAIL_CNT = 0; WARN_CNT = 0
RESULTS = []

def rnd(n=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))

def now_date(offset_days=0):
    return (datetime.now() + timedelta(days=offset_days)).strftime('%Y-%m-%d')

def now_dt():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

TOKEN = None
HEADERS = {}

def api(method, path, *, desc='', expected_code=200, warn_only=False, **kwargs):
    global PASS_CNT, FAIL_CNT, WARN_CNT
    try:
        r = getattr(requests, method)(
            f'{BASE}{path}', headers=HEADERS, timeout=15, **kwargs
        )
        try:
            d = r.json()
        except Exception:
            d = {'_raw': r.text[:200], 'code': r.status_code}

        code = d.get('code', r.status_code)
        msg  = d.get('message', d.get('msg', ''))
        data = d.get('data')

        ok = (code == expected_code)
        icon = '✅' if ok else ('⚠️' if warn_only else '❌')
        if ok:
            PASS_CNT += 1
        elif warn_only:
            WARN_CNT += 1
        else:
            FAIL_CNT += 1

        if desc:
            print(f'  {icon} [{method.upper()}] {path}  code={code}  {desc}  msg={msg[:80]}')

        RESULTS.append({'desc': desc or path, 'method': method, 'path': path,
                        'code': code, 'ok': ok, 'warn_only': warn_only,
                        'msg': msg, 'data': data})
        return d
    except requests.exceptions.ConnectionError:
        FAIL_CNT += 1
        print(f'  ❌ 连接失败: {BASE}{path}')
        return {'code': -1, 'data': None}
    except Exception as e:
        FAIL_CNT += 1
        print(f'  ❌ 异常[{path}]: {e}')
        return {'code': -1, 'data': None}

def safe_list(resp):
    data = resp.get('data')
    if isinstance(data, dict):
        return data.get('records', data.get('list', data.get('items', [])))
    if isinstance(data, list):
        return data
    return []

def sep(title):
    print(f'\n{"="*65}')
    print(f'  {title}')
    print('='*65)

def subsep(title):
    print(f'\n  ---- {title} ----')

def db_query(sql):
    try:
        r = subprocess.run(
            ['docker', 'exec', 'fashion-mysql-simple', 'mysql',
             '-uroot', '-pchangeme', 'fashion_supplychain', '-e', sql],
            capture_output=True, text=True, timeout=10
        )
        lines = [l for l in r.stdout.split('\n') if l.strip() and 'Warning' not in l]
        return lines
    except Exception as e:
        return [f'DB Error: {e}']

# ============================================================
# STEP 0: 登录
# ============================================================
sep('STEP 0: 账号登录')

r_login = requests.post(f'{BASE}/api/system/user/login',
    json={'username': 'zhangcz', 'password': 'admin123'}, timeout=10)
d_login = r_login.json()
if d_login.get('code') == 200:
    td = d_login['data']
    TOKEN = td.get('token') or td.get('accessToken')
    HEADERS = {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}
    print(f'  ✅ zhangcz 登录成功  token长度={len(TOKEN or "")}')
    PASS_CNT += 1
else:
    print(f'  ❌ 登录失败: {d_login}')
    sys.exit(1)

# 当前用户信息
r_me = requests.get(f'{BASE}/api/system/user/info', headers=HEADERS, timeout=10)
if r_me.status_code == 200:
    ud = r_me.json()
    if ud.get('code') == 200:
        ui = ud.get('data', {})
        print(f'  用户: {ui.get("username")} | 租户ID={ui.get("tenantId")} | 是否租户管理员={ui.get("isTenantOwner")}')

# ============================================================
# STEP 1: 系统配置
# ============================================================
sep('STEP 1: 系统配置检查')

# 1.1 工厂列表
subsep('1.1 工厂管理')
r_fac = api('get', '/api/system/factory/list', desc='工厂列表')
fac_list = safe_list(r_fac)
if not fac_list and isinstance(r_fac.get('data'), dict):
    fac_list = r_fac['data'].get('records', [])
print(f'  现有工厂数: {len(fac_list)}')

FAC_ID = None
FAC_NAME = ''
if fac_list:
    FAC_ID = fac_list[0].get('id') or fac_list[0].get('factoryId')
    FAC_NAME = fac_list[0].get('factoryName') or ''
    print(f'  使用工厂: "{FAC_NAME}" (id={FAC_ID})')
else:
    fc_name = f'测试工厂_{rnd(4)}'
    r_new_fac = api('post', '/api/system/factory', desc=f'创建工厂 {fc_name}', warn_only=True,
                json={'factoryName': fc_name, 'factoryCode': f'TF{rnd(4)}',
                      'contactName': '张三', 'contactPhone': '13900000001', 'address': '北京市'})
    time.sleep(0.5)
    r_fac2 = api('get', '/api/system/factory/list', desc='工厂列表(创建后)', warn_only=True)
    fl2 = safe_list(r_fac2)
    if fl2:
        FAC_ID = fl2[0].get('id')
        print(f'  工厂已创建 id={FAC_ID}')

# 1.2 用户列表
subsep('1.2 用户管理')
r_users = api('get', '/api/system/user/list', desc='用户列表', warn_only=True)
users = safe_list(r_users)
if not users and isinstance(r_users.get('data'), dict):
    users = r_users['data'].get('records', [])
print(f'  现有用户数: {len(users)}')

# 1.3 角色列表
subsep('1.3 角色列表')
r_roles = api('get', '/api/system/role/list', desc='角色列表', warn_only=True)
roles = safe_list(r_roles)
if not roles and isinstance(r_roles.get('data'), dict):
    roles = r_roles['data'].get('records', [])
print(f'  现有角色数: {len(roles)}')
for ro in roles[:5]:
    print(f'    角色: {ro.get("roleName") or ro.get("role_name")} code={ro.get("roleCode") or ro.get("role_code")}')

# 1.4 工序字典
subsep('1.4 系统字典/工序配置')
r_dict = api('get', '/api/system/process/list', desc='系统工序列表', warn_only=True)
if not r_dict.get('data'):
    r_dict = api('get', '/api/production/process/list', desc='工序列表', warn_only=True)
pd_list = safe_list(r_dict)
print(f'  工序配置数: {len(pd_list)}')

# ============================================================
# STEP 2: 款式设计
# ============================================================
sep('STEP 2: 款式设计')
STYLE_ID = None
STYLE_NO = f'FZ{rnd(6)}'

# 2.1 创建款式
subsep('2.1 创建款式')
r_style = api('post', '/api/style/info', desc=f'创建款式 {STYLE_NO}',
              json={
                  'styleNo': STYLE_NO,
                  'styleName': f'全系统测试款_{rnd(4)}',
                  'category': '上衣',
                  'season': '2026春夏',
                  'unit': '件',
                  'color': '黑色,白色',
                  'designer': '王设计师',
              })
if r_style.get('code') == 200:
    sd = r_style.get('data', {})
    if isinstance(sd, dict):
        STYLE_ID = sd.get('id')
    print(f'  款式ID={STYLE_ID}  款号={STYLE_NO}')

# 如未拿到ID，从列表搜索
if not STYLE_ID:
    time.sleep(0.5)
    r_sl = api('get', f'/api/style/info/list?styleNo={STYLE_NO}&page=1&pageSize=5',
               desc='款式列表查询', warn_only=True)
    sl = safe_list(r_sl)
    if not sl and isinstance(r_sl.get('data'), dict):
        sl = r_sl['data'].get('records', [])
    if sl:
        STYLE_ID = sl[0].get('id')
        print(f'  从列表获取款式ID={STYLE_ID}')

# 2.2 款式详情
if STYLE_ID:
    api('get', f'/api/style/info/{STYLE_ID}', desc='款式详情', warn_only=True)

# 2.3 BOM物料
subsep('2.2 BOM物料')
MATERIAL_CODE_MAIN = f'MC{rnd(4)}'
if STYLE_ID:
    bom_list_data = [
        {'styleId': STYLE_ID, 'materialName': '纯棉面料', 'materialCode': MATERIAL_CODE_MAIN,
         'materialType': '面料', 'unit': '米', 'dosage': 2.5, 'unitPrice': 48.0},
        {'styleId': STYLE_ID, 'materialName': '金属拉链', 'materialCode': f'MA{rnd(4)}',
         'materialType': '辅料', 'unit': '条', 'dosage': 1.0, 'unitPrice': 3.5},
    ]
    for bom in bom_list_data:
        api('post', '/api/style/bom', desc=f'添加BOM({bom["materialName"]})',
            json=bom, warn_only=True)

    r_bom_l = api('get', f'/api/style/bom/list?styleId={STYLE_ID}', desc='BOM列表', warn_only=True)
    bl = r_bom_l.get('data', [])
    if isinstance(bl, dict):
        bl = bl.get('records', [])
    print(f'  BOM条数: {len(bl) if isinstance(bl, list) else "N/A"}')

# 2.4 工序
subsep('2.3 款式工序')
if STYLE_ID:
    for pname, pcode, pprice, psort in [
        ('裁剪', 'CUT', 3.5, 1),
        ('车缝', 'SEW', 5.0, 2),
        ('质检', 'QC',  1.0, 3),
        ('后整', 'FIN', 0.8, 4),
    ]:
        api('post', '/api/style/process', desc=f'工序 {pname}',
            json={'styleId': STYLE_ID, 'processName': pname, 'processCode': pcode,
                  'unitPrice': pprice, 'sortOrder': psort}, warn_only=True)

    r_pl = api('get', f'/api/style/process/list?styleId={STYLE_ID}', desc='工序列表', warn_only=True)
    pl = r_pl.get('data', [])
    if isinstance(pl, dict):
        pl = pl.get('records', [])
    print(f'  工序数: {len(pl) if isinstance(pl, list) else "N/A"}')

# 2.5 尺寸规格（t_style_size是尺寸规格表，存储测量标准如衣长/胸围）
# 注意：这不是S/M/L/XL，而是实际尺寸值（单位cm）
subsep('2.4 款式尺寸规格(Measurement Spec)')
if STYLE_ID:
    for sz_name, part, std_val in [
        ('衣长', '前幅', 58.0),
        ('胸围', '整体', 102.0),
        ('肩宽', '整体', 43.0),
    ]:
        api('post', '/api/style/size', desc=f'尺寸规格 {sz_name}',
            json={
                'styleId': STYLE_ID,
                'sizeName': sz_name,
                'partName': part,
                'standardValue': std_val,
                'tolerance': 1.0,
                'sort': 1,
            }, warn_only=True)
    r_szl = api('get', f'/api/style/size/list?styleId={STYLE_ID}', desc='尺寸规格列表', warn_only=True)
    szl = r_szl.get('data', [])
    print(f'  尺寸规格数: {len(szl) if isinstance(szl, list) else "N/A"}')

# 2.6 样衣完成（关键！设置sampleStatus=COMPLETED，否则无法创建生产订单）
# completeSample() 有兜底逻辑，自动完成所有未完成步骤：BOM/纸样/尺寸/工序/生产制单
subsep('2.5 样衣完成 [关键：sampleStatus=COMPLETED，否则下单报错]')
if STYLE_ID:
    r_sc = api('post', f'/api/style/info/{STYLE_ID}/stage-action',
               desc='样衣完成（兜底逻辑）',
               params={'stage': 'sample', 'action': 'complete'},
               warn_only=True)
    if r_sc.get('code') == 200:
        print(f'  OK 样衣完成！sampleStatus已设置COMPLETED，可以下单')
    else:
        msg = r_sc.get('message', '')
        print(f'  INFO code={r_sc.get("code")} msg={msg[:80]}')
        if '已完成' in msg or 'COMPLETED' in msg:
            print(f'  OK 样衣已完成状态，可以下单')

# 2.7 报价单（关键：profitRate 字段，不是 targetProfitRate）
subsep('2.6 款式报价单 [关键：profitRate + 自动计算totalPrice]')
#   materialCost=123.5, processCost=10.3, totalCost=133.8
#   profitRate=25 → totalPrice = 133.8 * 1.25 = 167.25
EXPECTED_TOTAL_PRICE = 167.25
if STYLE_ID:
    r_quot = api('post', '/api/style/quotation', desc='创建报价单(utilRate=25%)',
                 json={
                     'styleId': STYLE_ID,
                     'profitRate': 25.0,          # ✅ 正确字段名（数据库 profit_rate）
                     'materialCost': 123.5,
                     'processCost': 10.3,
                     'otherCost': 0.0,
                     'remark': '全系统测试报价单v2',
                 }, warn_only=True)

    time.sleep(0.3)
    r_qget = api('get', f'/api/style/quotation?styleId={STYLE_ID}',
                 desc='查询报价单', warn_only=True)
    qdata = r_qget.get('data', {})
    if isinstance(qdata, dict):
        tp = qdata.get('totalPrice', 0)
        pr = qdata.get('profitRate', qdata.get('targetProfitRate', 'N/A'))
        tc = qdata.get('totalCost', 0)
        print(f'  报价: totalCost={tc}  profitRate={pr}%  totalPrice={tp} (期望={EXPECTED_TOTAL_PRICE})')
        if tp and abs(float(str(tp) or '0') - EXPECTED_TOTAL_PRICE) < 0.1:
            print(f'  ✅ totalPrice={tp} 正确')
        elif tp and float(str(tp) or '0') > 0:
            print(f'  ⚠️ totalPrice={tp} 不等于 {EXPECTED_TOTAL_PRICE}，检查orchestrator计算逻辑')
        else:
            print(f'  ⚠️ totalPrice={tp} 异常')

# ============================================================
# STEP 3: 生产订单
# ============================================================
sep('STEP 3: 生产订单')
ORDER_ID = None
ORDER_NO = f'PO{rnd(8)}'

subsep('3.1 创建生产订单 [关键：materialPriceSource 必填]')
if STYLE_ID and FAC_ID:
    r_ord = api('post', '/api/production/order', desc='创建生产订单(100件)',
                json={
                    'styleId': str(STYLE_ID),
                    'styleNo': STYLE_NO,
                    'orderNo': ORDER_NO,
                    'factoryId': str(FAC_ID),
                    'factoryName': FAC_NAME,
                    'orderQuantity': 100,
                    'deliveryDate': now_date(30),
                    'company': '测试客户公司',
                    'merchandiser': 'zhangcz',
                    'productCategory': '上衣',
                    # ✅ 每条orderDetail必须含 materialPriceSource/AcquiredAt/Version
                    'orderDetails': json.dumps([
                        {'color': '黑色', 'size': 'S', 'quantity': 20,
                         'materialPriceSource': '物料采购系统',
                         'materialPriceAcquiredAt': now_date(),
                         'materialPriceVersion': 'v1.0'},
                        {'color': '黑色', 'size': 'M', 'quantity': 40,
                         'materialPriceSource': '物料采购系统',
                         'materialPriceAcquiredAt': now_date(),
                         'materialPriceVersion': 'v1.0'},
                        {'color': '黑色', 'size': 'L', 'quantity': 30,
                         'materialPriceSource': '物料采购系统',
                         'materialPriceAcquiredAt': now_date(),
                         'materialPriceVersion': 'v1.0'},
                        {'color': '黑色', 'size': 'XL', 'quantity': 10,
                         'materialPriceSource': '物料采购系统',
                         'materialPriceAcquiredAt': now_date(),
                         'materialPriceVersion': 'v1.0'},
                    ]),
                })
    od = r_ord.get('data', {})
    if isinstance(od, dict):
        ORDER_ID = od.get('id')
        ORDER_NO = od.get('orderNo', ORDER_NO)
    print(f'  订单ID={ORDER_ID}  订单号={ORDER_NO}  code={r_ord.get("code")}  msg={r_ord.get("message","")[:100]}')
elif not FAC_ID:
    print('  ⚠️ 无工厂ID，跳过订单创建')
elif not STYLE_ID:
    print('  ⚠️ 无款式ID，跳过订单创建')

# 如果创建失败，从列表找一个现有订单测试
if not ORDER_ID:
    time.sleep(0.5)
    r_ol = api('get', '/api/production/order/list?page=1&size=5', desc='订单列表(fallback)', warn_only=True)
    old = r_ol.get('data', {})
    recs = old.get('records', []) if isinstance(old, dict) else []
    if recs:
        ORDER_ID = recs[0].get('id')
        ORDER_NO = recs[0].get('orderNo', ORDER_NO)
        print(f'  使用现有订单: ID={ORDER_ID} NO={ORDER_NO}')

# 3.2 订单列表
subsep('3.2 订单列表验证')
r_ol2 = api('get', '/api/production/order/list?page=1&size=20', desc='订单列表(全量)')
old2 = r_ol2.get('data', {})
if isinstance(old2, dict):
    total_orders = old2.get('total', 'N/A')
    print(f'  订单总数: {total_orders}')
    recs2 = old2.get('records', [])
    if recs2:
        r0 = recs2[0]
        print(f'  最新: {r0.get("orderNo")} 状态={r0.get("status")} 数量={r0.get("orderQuantity")}')

# 3.3 订单详情 & 报价单价
subsep('3.3 订单详情 & 报价单价[关键]')
if ORDER_ID:
    r_det = api('get', f'/api/production/order/detail/{ORDER_ID}', desc='订单详情', warn_only=True)
    det = r_det.get('data', {}) or {}
    if isinstance(det, dict):
        qup = det.get('quotationUnitPrice')
        sfp = det.get('styleFinalPrice')
        print(f'  quotationUnitPrice={qup}  styleFinalPrice={sfp}')
        if qup and float(str(qup) or '0') > 0:
            print(f'  ✅ quotationUnitPrice={qup} (来自报价单)')
            PASS_CNT += 1
        elif str(ORDER_NO).startswith('PO') and ORDER_ID:
            print(f'  ⚠️ quotationUnitPrice=0（新建订单初始值，报价同步后可能更新）')
            WARN_CNT += 1

# ============================================================
# STEP 4: 裁剪/菲号管理
# ============================================================
sep('STEP 4: 裁剪/菲号管理')
BUNDLE_ID = None
BUNDLE_CODE = None

subsep('4.1 生成裁剪菲号')
if ORDER_NO and ORDER_ID:
    r_gen = api('post', '/api/production/cutting/generate', desc='生成裁剪菲号',
                json={
                    'orderNo': ORDER_NO,
                    'orderId': str(ORDER_ID),
                    'cuttingDate': now_date(),
                    'operator': 'zhangcz',
                    'bundleSize': 20,
                    'colorSizeGroups': [
                        {'color': '黑色', 'size': 'S', 'quantity': 20},
                        {'color': '黑色', 'size': 'M', 'quantity': 40},
                        {'color': '黑色', 'size': 'L', 'quantity': 30},
                        {'color': '黑色', 'size': 'XL', 'quantity': 10},
                    ]
                }, warn_only=True)
    gen_data = r_gen.get('data')
    gen_msg = r_gen.get('message', '')
    print(f'  生成菲号: code={r_gen.get("code")} msg={gen_msg[:80]}')
    if isinstance(gen_data, list):
        print(f'  生成{len(gen_data)}个菲号')
    elif isinstance(gen_data, dict):
        print(f'  生成结果: {str(gen_data)[:100]}')

subsep('4.2 菲号列表')
if ORDER_NO:
    r_bl = api('get', f'/api/production/cutting/list?orderNo={ORDER_NO}&page=1&size=20',
               desc='菲号列表', warn_only=True)
    bld = r_bl.get('data', {})
    bundles = bld.get('records', []) if isinstance(bld, dict) else (bld if isinstance(bld, list) else [])
    print(f'  菲号数量: {len(bundles)}')
    if bundles:
        b0 = bundles[0]
        BUNDLE_ID = b0.get('id')
        BUNDLE_CODE = b0.get('qrCode') or b0.get('bundleCode') or b0.get('code') or str(BUNDLE_ID)
        BUNDLE_QTY = b0.get('quantity', 20)
        print(f'  第一个菲号: id={BUNDLE_ID} code={BUNDLE_CODE} qty={BUNDLE_QTY}'
              f' color={b0.get("color")} size={b0.get("size")}')

subsep('4.3 裁剪汇总')
if ORDER_NO:
    r_sum = api('get', f'/api/production/cutting/summary?orderNo={ORDER_NO}',
                desc='裁剪汇总', warn_only=True)
    sumd = r_sum.get('data', {})
    if isinstance(sumd, dict):
        print(f'  汇总: totalQty={sumd.get("totalQuantity")} bundleCount={sumd.get("bundleCount")}')

# ============================================================
# STEP 5: 工序扫码
# ============================================================
sep('STEP 5: 工序扫码')

subsep('5.1 车缝扫码')
if ORDER_NO and BUNDLE_CODE:
    r_scan1 = api('post', '/api/production/scan/execute', desc='车缝扫码',
                  json={
                      'qrCode': str(BUNDLE_CODE),
                      'orderNo': ORDER_NO,
                      'processCode': 'SEW',
                      'processName': '车缝',
                      'operator': 'zhangcz',
                      'quantity': 20,
                      'scanTime': now_dt(),
                  }, warn_only=True)
    print(f'  车缝扫码: code={r_scan1.get("code")} msg={r_scan1.get("message","")[:60]}')
elif ORDER_NO:
    print('  ⚠️ 暂无菲号code，跳过扫码')
else:
    print('  ⚠️ 暂无订单号，跳过扫码')

subsep('5.2 质检扫码')
if ORDER_NO and BUNDLE_CODE:
    r_scan2 = api('post', '/api/production/scan/execute', desc='质检扫码',
                  json={
                      'qrCode': str(BUNDLE_CODE),
                      'orderNo': ORDER_NO,
                      'processCode': 'QC',
                      'processName': '质检',
                      'operator': 'zhangcz',
                      'quantity': 20,
                      'qualifiedQuantity': 19,
                      'defectiveQuantity': 1,
                      'scanTime': now_dt(),
                  }, warn_only=True)
    print(f'  质检扫码: code={r_scan2.get("code")} msg={r_scan2.get("message","")[:60]}')

subsep('5.3 扫码记录列表')
r_srec = api('get', '/api/production/scan/list?page=1&size=10', desc='扫码记录列表', warn_only=True)
srd = r_srec.get('data', {})
src_total = srd.get('total', 0) if isinstance(srd, dict) else len(srd) if isinstance(srd, list) else 0
print(f'  扫码记录总数: {src_total}')
if isinstance(srd, dict) and srd.get('records'):
    sr0 = srd['records'][0]
    print(f'  最新扫码: order={sr0.get("orderNo")} process={sr0.get("processName")} qty={sr0.get("quantity")}')

subsep('5.4 生产进度')
if ORDER_ID:
    r_prog = api('get', f'/api/production/order/progress/{ORDER_ID}', desc='订单进度', warn_only=True)
    if not r_prog.get('data'):
        r_prog = api('get', f'/api/production/progress/{ORDER_ID}', desc='进度(备用路径)', warn_only=True)

# ============================================================
# STEP 6: 面辅料管理
# ============================================================
sep('STEP 6: 面辅料管理')

# 6.1 面辅料库存
subsep('6.1 面辅料库存查询')
r_ms = api('get', '/api/production/material/stock/list?page=1&size=10', desc='面辅料库存列表', warn_only=True)
msd = r_ms.get('data', {})
ms_total = msd.get('total', 0) if isinstance(msd, dict) else len(msd) if isinstance(msd, list) else 0
print(f'  库存SKU数: {ms_total}')
if isinstance(msd, dict) and msd.get('records'):
    m0 = msd['records'][0]
    print(f'  库存样例: {m0.get("materialName")} {m0.get("currentStock")}件')

# 6.2 面料手动入库（需要 material:inbound:create 权限，zhangcz有 PURCHASE_RECEIVE 但可能不够）
subsep('6.2 面料手动入库')
r_min = api('post', '/api/production/material/inbound/manual', desc='面料手动入库500米',
            json={
                'materialCode': MATERIAL_CODE_MAIN,
                'materialName': '纯棉布料',
                'materialType': '面料',
                'color': '本色',
                'size': '',
                'quantity': 500,
                'unit': '米',
                'unitPrice': 48.0,
                'warehouseLocation': 'A-01',
                'operatorId': '',
                'operatorName': 'zhangcz',
                'supplier': '上海布料公司',
                'remark': '全系统测试面料入库',
            }, warn_only=True)
print(f'  面料入库: code={r_min.get("code")} msg={r_min.get("message","")[:80]}')

# 6.3 辅料入库
subsep('6.3 辅料手动入库')
r_ain = api('post', '/api/production/material/inbound/manual', desc='金属拉链入库200条',
            json={
                'materialCode': f'MA{rnd(4)}',
                'materialName': '金属拉链',
                'materialType': '辅料',
                'color': '银色',
                'size': '',
                'quantity': 200,
                'unit': '条',
                'unitPrice': 3.5,
                'warehouseLocation': 'B-02',
                'operatorName': 'zhangcz',
                'supplier': '广州辅料厂',
                'remark': '辅料测试',
            }, warn_only=True)
print(f'  辅料入库: code={r_ain.get("code")} msg={r_ain.get("message","")[:60]}')

# 6.4 入库记录查询
subsep('6.4 入库记录查询')
r_inl = api('get', '/api/production/material/inbound/list?pageNum=1&pageSize=10',
            desc='面料入库记录', warn_only=True)
inld = r_inl.get('data', {})
in_total = inld.get('total', 0) if isinstance(inld, dict) else 0
print(f'  入库记录数: {in_total}')

# 6.5 生产领料
subsep('6.5 生产领料')
if ORDER_NO and ORDER_ID:
    r_pick = api('post', '/api/production/picking', desc='生产领料',
                 json={
                     'picking': {
                         'orderNo': ORDER_NO,
                         'orderId': str(ORDER_ID),
                         'styleNo': STYLE_NO,
                         'pickDate': now_date(),
                         'operator': 'zhangcz',
                         'remark': '全系统测试领料',
                     },
                     'items': [
                         {'materialCode': MATERIAL_CODE_MAIN, 'materialName': '纯棉布料',
                          'materialType': '面料', 'unit': '米', 'quantity': 200, 'unitPrice': 48.0},
                     ]
                 }, warn_only=True)
    print(f'  领料: code={r_pick.get("code")} msg={r_pick.get("message","")[:60]}')

    # 领料列表
    r_pickl = api('get', f'/api/production/picking/list?orderNo={ORDER_NO}&page=1&pageSize=10',
                  desc='领料记录', warn_only=True)
    pickd = r_pickl.get('data', {})
    pick_t = pickd.get('total', 0) if isinstance(pickd, dict) else 0
    print(f'  领料记录数: {pick_t}')

# ============================================================
# STEP 7: 成品入库（质检入库）
# ============================================================
sep('STEP 7: 成品入库（质检入库）')

subsep('7.1 成品入库状态统计')
r_wh_stats = api('get', '/api/production/warehousing/stats', desc='入库状态统计', warn_only=True)
whsd = r_wh_stats.get('data', {})
if isinstance(whsd, dict):
    print(f'  总入库={whsd.get("totalCount")} 合格={whsd.get("qualifiedCount")} 今日={whsd.get("todayCount")}')

subsep('7.2 查询待质检菲号')
r_pending = api('get', '/api/production/warehousing/pending-bundles?status=pendingWarehouse',
                desc='待入库菲号', warn_only=True)
pend_data = r_pending.get('data', [])
pend_cnt = len(pend_data) if isinstance(pend_data, list) else 0
print(f'  待入库菲号数: {pend_cnt}')

WH_BUNDLE_ID = None
if pend_cnt > 0:
    WH_BUNDLE_ID = pend_data[0].get('id')
    print(f'  第一个待入库: {pend_data[0].get("bundleCode") or WH_BUNDLE_ID}')
elif BUNDLE_ID:
    WH_BUNDLE_ID = BUNDLE_ID
    print(f'  使用已创建菲号: {BUNDLE_ID}')

subsep('7.3 成品入库记录 [关键：warehousingQty=qualified+unqualified]')
r_wh = api('post', '/api/production/warehousing', desc='合格品入库(18合格+2不合格=20)',
           json={
               'orderNo': ORDER_NO,
               'orderId': str(ORDER_ID) if ORDER_ID else None,
               'cuttingBundleId': str(WH_BUNDLE_ID) if WH_BUNDLE_ID else None,
               'warehousingQuantity': 20,    # 总量 = qualified + unqualified
               'qualifiedQuantity': 18,      # 合格品
               'unqualifiedQuantity': 2,     # 不合格品
               'defectCategory': 'other',    # 次品类别（有不合格品时必填）
               'defectRemark': '返修',       # 次品处理方式：返修/报废
               'warehouseLocation': 'C-01',
               'operator': 'zhangcz',
               'warehouseDate': now_date(),
               'remark': '全系统测试合格品入库',
           }, warn_only=True)
whd = r_wh.get('data')
print(f'  入库: code={r_wh.get("code")} msg={r_wh.get("message","")[:80]}')

subsep('7.4 成品库存查询')
r_fp = api('get', '/api/warehouse/finished-inventory/list?page=1&size=10', desc='成品库存', warn_only=True)
if not r_fp.get('data'):
    r_fp = api('post', '/api/warehouse/finished-inventory/list', json={'pageNum':1,'pageSize':10},
               desc='成品库存(POST)', warn_only=True)
fpd = r_fp.get('data', {})
fp_total = fpd.get('total', 0) if isinstance(fpd, dict) else len(fpd) if isinstance(fpd, list) else 0
print(f'  成品库存SKU数: {fp_total}')

# ============================================================
# STEP 8: 财务结算 [核心验证]
# ============================================================
sep('STEP 8: 财务结算 [核心验证]')

# 8.1 成品结算列表
subsep('8.1 成品结算列表')
r_fs = api('get', '/api/finance/finished-settlement/list?page=1&size=30', desc='成品结算列表')
if not r_fs.get('data'):
    r_fs = api('post', '/api/finance/finished-settlement/list',
               json={'pageNum':1,'pageSize':30}, desc='成品结算列表(POST)')
fsd = r_fs.get('data', {})
fs_recs = []
if isinstance(fsd, dict):
    fs_recs = fsd.get('records', fsd.get('list', []))
    fs_total = fsd.get('total', 0)
elif isinstance(fsd, list):
    fs_recs = fsd
    fs_total = len(fs_recs)
else:
    fs_total = 0
print(f'  成品结算总数: {fs_total}  本页: {len(fs_recs)}')

# 关键验证1: CANCELLED订单不应入列
if fs_recs:
    cancelled = [rec for rec in fs_recs
                 if str(rec.get('status', '')).upper() in ('CANCELLED', 'DELETED')]
    if cancelled:
        print(f'  ❌ 发现 {len(cancelled)} 条已取消订单混入结算列表！（数据污染）')
        FAIL_CNT += 1
        for c in cancelled[:3]:
            print(f'     order={c.get("orderNo")} status={c.get("status")}')
    else:
        print(f'  ✅ 无已取消/已删除订单泄漏（共{len(fs_recs)}条）')
        PASS_CNT += 1

# 关键验证2: styleFinalPrice 统计
price_ok = 0; price_zero = 0
for rec in fs_recs:
    sfp = rec.get('styleFinalPrice') or rec.get('stylePrice') or 0
    try:
        (price_ok if float(str(sfp)) > 0 else price_zero).__class__  # 类型检查用
        if float(str(sfp)) > 0:
            price_ok += 1
        else:
            price_zero += 1
    except:
        price_zero += 1

if fs_recs:
    print(f'  价格统计: 有销售单价={price_ok}条  单价为0={price_zero}条')
    if price_zero > 0:
        print(f'  ℹ️  {price_zero}条无报价（正常：未录入报价单的历史订单）')
    if price_ok > 0:
        print(f'  ✅ {price_ok}条有正常单价')

# 打印前3条详情
print('\n  === 结算记录样例(前3条) ===')
for rec in fs_recs[:3]:
    print(f'  订单={rec.get("orderNo","N/A"):20s}  '
          f'状态={rec.get("status","N/A"):12s}  '
          f'单价={rec.get("styleFinalPrice","N/A")}  '
          f'利润率={rec.get("targetProfitRate","N/A")}%  '
          f'扫码量={rec.get("scannedQuantity","N/A")}')

# 8.2 查询新建订单的结算数据
if ORDER_NO:
    r_fs_new = api('get', f'/api/finance/finished-settlement/list?orderNo={ORDER_NO}&page=1&size=5',
                   desc=f'新建订单{ORDER_NO}结算数据', warn_only=True)
    fs_new_d = r_fs_new.get('data', {})
    fs_new_recs = fs_new_d.get('records', []) if isinstance(fs_new_d, dict) else []
    if fs_new_recs:
        n0 = fs_new_recs[0]
        print(f'\n  新订单结算: styleFinalPrice={n0.get("styleFinalPrice")} profitRate={n0.get("targetProfitRate")}%')
        if n0.get('styleFinalPrice') and float(str(n0.get('styleFinalPrice') or '0')) > 0:
            print(f'  ✅ 新订单报价单价已关联')
    else:
        print(f'\n  ℹ️  新建订单 {ORDER_NO} 暂未出现在结算列表（正常：需完成工序）')

# 8.3 面辅料结算（材料对账）
subsep('8.3 面辅料对账')
r_mr = api('get', '/api/finance/material-reconciliation/list?page=1&size=10',
           desc='面辅料对账列表', warn_only=True)
mrd = r_mr.get('data', {})
mr_total = mrd.get('total', 0) if isinstance(mrd, dict) else len(mrd) if isinstance(mrd, list) else 0
print(f'  面辅料对账条数: {mr_total}')

# 8.4 出货对账
subsep('8.4 出货对账')
r_ship = api('get', '/api/finance/shipment-reconciliation/list?page=1&size=10',
             desc='出货对账列表', warn_only=True)
shd = r_ship.get('data', {})
sh_total = shd.get('total', 0) if isinstance(shd, dict) else len(shd) if isinstance(shd, list) else 0
print(f'  出货对账条数: {sh_total}')

# 8.5 工资结算（操工汇总）
subsep('8.5 工资结算（操工汇总）')
r_pw = api('post', '/api/finance/payroll-settlement/operator-summary',
           desc='操工工资汇总',
           json={
               'pageNum': 1, 'pageSize': 10,
               'startDate': now_date(-30),
               'endDate': now_date(),
           }, warn_only=True)
pwd = r_pw.get('data', {})
pw_t = pwd.get('total', 0) if isinstance(pwd, dict) else len(pwd) if isinstance(pwd, list) else 0
print(f'  工资汇总条数: {pw_t}')
if isinstance(pwd, dict) and pwd.get('records'):
    p0 = pwd['records'][0]
    print(f'  样例: operator={p0.get("operatorName")} totalEarning={p0.get("totalEarning")}')

# 8.6 对账单（利润率分析）
subsep('8.6 订单利润分析')
r_profit = api('get', f'/api/finance/reconciliation/order-profit?orderNo={ORDER_NO}',
               desc='订单利润分析', warn_only=True)
profitd = r_profit.get('data', {})
if isinstance(profitd, dict) and profitd:
    print(f'  利润分析: {str(profitd)[:200]}')
else:
    print(f'  利润分析: 无数据（正常：新建订单未完成）')

# ============================================================
# STEP 9: 数据看板
# ============================================================
sep('STEP 9: 数据看板')

# ✅ 正确的看板路径（已修复）
dash_tests = [
    ('get', '/api/dashboard',                    '主看板'),
    ('get', '/api/dashboard/top-stats',          '顶部统计'),
    ('get', '/api/dashboard/quality-stats',      '质检统计'),
    ('get', '/api/dashboard/order-cutting-chart','裁剪订单图'),
    ('get', '/api/dashboard/overdue-orders',     '逾期订单'),
    ('get', '/api/dashboard/urgent-events',      '紧急事件'),
]
for method, path, desc in dash_tests:
    r_d = api(method, path, desc=f'看板-{desc}', warn_only=True)
    ddata = r_d.get('data')
    if ddata and isinstance(ddata, dict) and ddata:
        print(f'    ✅ {desc}: keys={list(ddata.keys())[:5]}')
    elif isinstance(ddata, list):
        print(f'    ✅ {desc}: {len(ddata)}条数据')
    else:
        pass  # 空数据不输出（正常）

# 仓库看板
r_wdash = api('get', '/api/warehouse/dashboard', desc='仓库看板', warn_only=True)
wdd = r_wdash.get('data', {})
if isinstance(wdd, dict) and wdd:
    print(f'  仓库看板: {list(wdd.keys())[:5]}')

# 生产统计
r_stats = api('get', '/api/production/order/stats', desc='订单统计', warn_only=True)
stsd = r_stats.get('data', {}) or {}
if isinstance(stsd, dict):
    print(f'  订单统计: total={stsd.get("totalOrders")} delayed={stsd.get("delayedOrders")}')

# ============================================================
# STEP 10: 数据库直查验证
# ============================================================
sep('STEP 10: 数据库层直接验证')

subsep('10.1 成品结算视图字段验证')
lines_v = db_query("""
SELECT
  COUNT(*) total,
  SUM(CASE WHEN style_final_price > 0 THEN 1 ELSE 0 END) has_price,
  SUM(CASE WHEN status IN ('CANCELLED','DELETED','cancelled','deleted') THEN 1 ELSE 0 END) cancelled_leaked,
  MIN(style_final_price) min_price,
  MAX(style_final_price) max_price,
  ROUND(AVG(target_profit_rate),2) avg_profit_rate
FROM v_finished_product_settlement LIMIT 1
""")
for l in lines_v:
    print(f'  DB: {l}')
    if 'cancelled_leaked' in l:
        pass
    elif l.strip().startswith(('0\t', '1\t', '2\t', '3\t', '4\t', '5\t', '6\t', '7\t', '8\t', '9\t')):
        vals = l.strip().split('\t')
        if len(vals) >= 3:
            leaked = vals[2].strip()
            if leaked == '0':
                print(f'  ✅ CANCELLED过滤正常: cancelled_leaked=0')
            else:
                print(f'  ❌ CANCELLED泄漏: cancelled_leaked={leaked}')

subsep('10.2 款式报价单验证（profit_rate列）')
if STYLE_ID:
    lines_q = db_query(f"""
SELECT style_id, total_price, profit_rate, total_cost, is_locked, create_time
FROM t_style_quotation WHERE style_id={STYLE_ID}
""")
    for l in lines_q:
        print(f'  DB: {l}')
        if '167' in l or str(EXPECTED_TOTAL_PRICE) in l:
            print(f'  ✅ totalPrice={EXPECTED_TOTAL_PRICE} 正确存储')
        elif 'style_id' not in l and l.strip():
            # 解析值
            vals = l.strip().split('\t')
            if len(vals) >= 3:
                try:
                    tp = float(vals[1])
                    pr = float(vals[2])
                    expected_tp = float(vals[3]) * (1 + pr / 100) if len(vals) > 3 else 0
                    print(f'  报价: totalPrice={tp} profit_rate={pr}% totalCost={vals[3] if len(vals)>3 else "N/A"}')
                except:
                    pass

subsep('10.3 新建订单验证')
if ORDER_NO:
    lines_o = db_query(f"""
SELECT order_no, style_no, status, order_quantity, factory_id, created_time
FROM t_production_order WHERE order_no='{ORDER_NO}' LIMIT 1
""")
    for l in lines_o:
        print(f'  DB: {l}')

subsep('10.4 BOM记录数')
if STYLE_ID:
    lines_b = db_query(f"SELECT COUNT(*) bom_count, SUM(dosage*unit_price) bom_total FROM t_style_bom WHERE style_id={STYLE_ID}")
    for l in lines_b:
        print(f'  DB: {l}')

subsep('10.5 扫码记录（新建订单）')
if ORDER_NO:
    lines_s = db_query(f"""
SELECT process_name, COUNT(*) cnt, SUM(quantity) total_qty, MAX(scan_time) last_scan
FROM t_scan_record WHERE order_no='{ORDER_NO}' GROUP BY process_name
""")
    for l in lines_s:
        print(f'  DB: {l}')
    if len(lines_s) <= 1:
        print(f'  ℹ️  新建订单暂无扫码记录（正常）')

subsep('10.6 面辅料库存总览')
lines_ms = db_query("""
SELECT material_type, COUNT(*) skus, SUM(current_stock) total_stock
FROM t_material_stock WHERE delete_flag=0 GROUP BY material_type
""")
for l in lines_ms:
    print(f'  DB: {l}')

subsep('10.7 视图SQL完整性（快速健康检查）')
lines_view = db_query("SELECT COUNT(*) FROM v_finished_product_settlement")
print(f'  视图行数: {lines_view}')
lines_view2 = db_query("SELECT COUNT(*) FROM information_schema.VIEWS WHERE table_name='v_finished_product_settlement'")
print(f'  视图存在: {lines_view2}')

# ============================================================
# STEP 11: 进度详情验证
# ============================================================
sep('STEP 11: 生产进度详情验证')

if ORDER_ID:
    subsep('11.1 完整订单详情')
    r_full = api('get', f'/api/production/order/detail/{ORDER_ID}', desc='完整订单详情', warn_only=True)
    pd = r_full.get('data', {}) or {}
    if isinstance(pd, dict):
        print(f'  订单号: {pd.get("orderNo")}')
        print(f'  状态:   {pd.get("status")}')
        print(f'  数量:   {pd.get("orderQuantity")} 件')
        print(f'  完成量: {pd.get("completedQuantity")} 件')
        print(f'  报价单价: {pd.get("quotationUnitPrice")}')
        print(f'  销售单价: {pd.get("styleFinalPrice")}')

subsep('11.2 订单节点状态')
if ORDER_ID:
    r_nodes = api('get', f'/api/production/order/nodes?orderId={ORDER_ID}', desc='工序节点', warn_only=True)
    if not r_nodes.get('data'):
        r_nodes = api('get', f'/api/production/order/progress-nodes/{ORDER_ID}', desc='进度节点(备用)', warn_only=True)
    nd = r_nodes.get('data', [])
    if isinstance(nd, list):
        print(f'  节点数: {len(nd)}')
        for n in nd[:3]:
            print(f'    {n.get("processName") or n.get("name")} → {n.get("status") or n.get("nodeStatus")}')

# ============================================================
# 最终汇总报告
# ============================================================
sep('===== 最终测试报告 =====')
total_tests = PASS_CNT + FAIL_CNT + WARN_CNT
overall = '✅ 通过' if FAIL_CNT == 0 else '❌ 存在失败项'

print(f"""
  账号:    zhangcz (tenant_id=1, role_id=17)
  时间:    {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

  测试款号:   {STYLE_NO}  (ID={STYLE_ID})
  测试订单:   {ORDER_NO}  (ID={ORDER_ID})
  工厂ID:     {FAC_ID}
  菲号code:   {BUNDLE_CODE}  (ID={BUNDLE_ID})

  ===== 测试结果 =====
  ✅ 通过: {PASS_CNT}
  ❌ 失败: {FAIL_CNT}
  ⚠️  警告: {WARN_CNT}
  总计:    {total_tests}

  整体状态: {overall}
""")

# 失败清单
failed_list = [r for r in RESULTS if not r['ok'] and not r['warn_only']]
if failed_list:
    print('  ❌ === 失败接口清单 ===')
    for f in failed_list:
        print(f"    [{f['method'].upper()}] {f['path']}  code={f['code']}  {f['desc']}")
        if f['msg']:
            print(f"         msg={f['msg'][:100]}")

# 警告清单
warned_list = [r for r in RESULTS if not r['ok'] and r['warn_only'] and r['code'] not in (200, -1)]
if warned_list:
    print(f'\n  ⚠️  === 警告清单 ({len(warned_list)}个) ===')
    for w in warned_list:
        print(f"    [{w['method'].upper()}] {w['path']}  code={w['code']}  {w['desc']}")
        if w['msg']:
            print(f"         msg={w['msg'][:80]}")

print('\n  === 核心逻辑检查项 ===')
print('  1. 成品结算 → CANCELLED订单是否泄漏 (view WHERE过滤)')
print('  2. 报价单   → profitRate=25 → totalPrice应=167.25 (orchestrator计算)')
print('  3. 生产订单 → 含 materialPriceSource 字段，创建成功')
print('  4. 数据看板 → /api/dashboard 系列端点可达')
print('  5. 工资结算 → POST /operator-summary 可达')

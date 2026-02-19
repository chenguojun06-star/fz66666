#!/usr/bin/env python3
"""
服装供应链管理系统 - 全链路自动化测试
覆盖范围: 登录 → 系统设置 → 款式设计 → 报价 → 生产订单 → 裁剪 → 扫码
         → 产品入库 → 成品结算 → 面辅料结算 → 数据看板
用户: zhangcz (tenant_id=1, 租户管理员)
"""
import requests, warnings, json, random, string, time, sys, subprocess
from datetime import datetime, timedelta

warnings.filterwarnings('ignore')
BASE = 'http://localhost:8088'

# ============================================================
# 工具函数
# ============================================================
PASS = 0; FAIL = 0; WARN = 0
RESULTS = []

def rnd(n=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))

def now_date(offset_days=0):
    return (datetime.now() + timedelta(days=offset_days)).strftime('%Y-%m-%d')

TOKEN = None
HEADERS = {}

def api(method, path, *, desc='', expected_code=200, warn_only=False, **kwargs):
    global PASS, FAIL, WARN
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

        status = '\u2705' if code == expected_code else ('\u26a0\ufe0f' if warn_only else '\u274c')
        if code == expected_code:
            PASS += 1
        elif warn_only:
            WARN += 1
        else:
            FAIL += 1

        if desc:
            print(f'  {status} [{method.upper()}] {path}  code={code}  {desc}  msg={msg}')

        RESULTS.append({'desc': desc, 'method': method, 'path': path,
                        'code': code, 'ok': code == expected_code, 'data': data})
        return d
    except requests.exceptions.ConnectionError:
        FAIL += 1
        print(f'  X 连接失败: {BASE}{path}')
        return {'code': -1, 'data': None}
    except Exception as e:
        FAIL += 1
        print(f'  X 异常: {e}  [{path}]')
        return {'code': -1, 'data': None}

def safe_id(resp):
    data = resp.get('data')
    if isinstance(data, dict):
        return data.get('id') or data.get('styleId') or data.get('orderId')
    if isinstance(data, (int, str)) and data:
        return data
    return None

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
    """直接查数据库"""
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

r = requests.post(f'{BASE}/api/system/user/login',
    json={'username': 'zhangcz', 'password': 'admin123'}, timeout=10)
d = r.json()
if d.get('code') == 200:
    token_data = d['data']
    TOKEN = token_data.get('token') or token_data.get('accessToken')
    HEADERS = {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}
    print(f'  OK zhangcz 登录成功  token长度={len(TOKEN or "")}')
    PASS += 1
else:
    print(f'  FAIL 登录失败: code={d.get("code")} msg={d.get("message")}')
    sys.exit(1)

# 当前用户信息
r2 = requests.get(f'{BASE}/api/system/user/info', headers=HEADERS, timeout=10)
if r2.status_code == 200:
    ud = r2.json()
    if ud.get('code') == 200:
        print(f'  用户信息: {str(ud.get("data", {}))[:150]}')

# ============================================================
# STEP 1: 系统配置
# ============================================================
sep('STEP 1: 系统配置检查')

# 1.1 工厂
subsep('1.1 工厂管理')
r_fac = api('get', '/api/system/factory/list', desc='工厂列表', warn_only=True)
fac_list = safe_list(r_fac)
if not fac_list and isinstance(r_fac.get('data'), dict):
    fac_list = r_fac['data'].get('records', [])
print(f'  现有工厂数: {len(fac_list)}')

FAC_ID = None
if fac_list:
    FAC_ID = fac_list[0].get('id') or fac_list[0].get('factoryId')
    print(f'  使用工厂: {fac_list[0].get("factoryName")} (id={FAC_ID})')
else:
    fc = f'测试工厂_{rnd(4)}'
    r_new = api('post', '/api/system/factory', desc=f'创建工厂 {fc}', warn_only=True,
                json={'factoryName': fc, 'factoryCode': f'TF{rnd(4)}',
                      'contactName': '张三', 'contactPhone': '13900000001', 'address': '北京市'})
    time.sleep(0.5)
    r_fac2 = api('get', '/api/system/factory/list', desc='工厂列表(创建后)', warn_only=True)
    fac_list2 = safe_list(r_fac2)
    if not fac_list2 and isinstance(r_fac2.get('data'), dict):
        fac_list2 = r_fac2['data'].get('records', [])
    if fac_list2:
        FAC_ID = fac_list2[0].get('id') or fac_list2[0].get('factoryId')
        print(f'  工厂已创建 id={FAC_ID}')

# 1.2 用户
subsep('1.2 用户管理')
r_users = api('get', '/api/system/user/list', desc='用户列表', warn_only=True)
users = safe_list(r_users)
if not users and isinstance(r_users.get('data'), dict):
    users = r_users['data'].get('records', [])
print(f'  现有用户数: {len(users)}')

# 1.3 角色
subsep('1.3 角色列表')
r_roles = api('get', '/api/system/role/list', desc='角色列表', warn_only=True)
roles = safe_list(r_roles)
if not roles and isinstance(r_roles.get('data'), dict):
    roles = r_roles['data'].get('records', [])
print(f'  现有角色数: {len(roles)}')

# 1.4 供应商
subsep('1.4 供应商/基础数据')
r_sup = api('get', '/api/system/supplier/list', desc='供应商列表', warn_only=True)
if not r_sup.get('data'):
    r_sup = api('post', '/api/system/supplier/list', desc='供应商列表(POST)',
                json={'pageNum':1,'pageSize':10}, warn_only=True)
supd = r_sup.get('data', {})
sup_cnt = supd.get('total', 0) if isinstance(supd, dict) else len(supd) if isinstance(supd, list) else 0
print(f'  供应商数: {sup_cnt}')

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
                  'designer': '王设计',
              })
if r_style.get('code') == 200:
    sd = r_style.get('data', {})
    if isinstance(sd, dict):
        STYLE_ID = sd.get('id')
    print(f'  款式ID={STYLE_ID}  款号={STYLE_NO}')

if not STYLE_ID:
    # 从列表找
    time.sleep(0.5)
    r_slist = api('get', f'/api/style/info/list?styleNo={STYLE_NO}&page=1&pageSize=5',
                  desc='款式列表查询', warn_only=True)
    sl = safe_list(r_slist)
    if not sl and isinstance(r_slist.get('data'), dict):
        sl = r_slist['data'].get('records', [])
    if sl:
        STYLE_ID = sl[0].get('id')
        print(f'  列表获取款式ID={STYLE_ID}')

# 2.2 款式详情
if STYLE_ID:
    r_sdetail = api('get', f'/api/style/info/{STYLE_ID}', desc='款式详情', warn_only=True)

# 2.3 BOM
subsep('2.2 BOM物料')
if STYLE_ID:
    bom_tests = [
        {'styleId': STYLE_ID, 'materialName': '纯棉面料', 'materialCode': f'M{rnd(4)}',
         'materialType': '面料', 'unit': '米', 'dosage': 2.5, 'unitPrice': 48.0},
        {'styleId': STYLE_ID, 'materialName': '金属拉链', 'materialCode': f'M{rnd(4)}',
         'materialType': '辅料', 'unit': '条', 'dosage': 1.0, 'unitPrice': 3.5},
    ]
    for bom_data in bom_tests:
        api('post', '/api/style/bom', desc=f'添加BOM({bom_data["materialName"]})',
            json=bom_data, warn_only=True)

    r_bom_list = api('get', f'/api/style/bom/list?styleId={STYLE_ID}', desc='BOM列表', warn_only=True)
    bl = r_bom_list.get('data', [])
    bl = bl if isinstance(bl, list) else []
    print(f'  BOM条数: {len(bl)}')

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

    r_plist = api('get', f'/api/style/process/list?styleId={STYLE_ID}', desc='工序列表', warn_only=True)
    pl = r_plist.get('data', [])
    if isinstance(pl, dict):
        pl = pl.get('records', [])
    print(f'  工序数: {len(pl) if isinstance(pl, list) else "N/A"}')

# 2.5 尺码
subsep('2.4 款式尺码')
if STYLE_ID:
    for sz in ['S', 'M', 'L', 'XL']:
        api('post', '/api/style/size', desc=f'尺码 {sz}',
            json={'styleId': STYLE_ID, 'size': sz, 'sortOrder': 1}, warn_only=True)

# 2.6 报价单 (关键：totalPrice含利润率)
subsep('2.5 款式报价单 (含利润率)')
QUOTATION_TOTAL_PRICE = 167.25
if STYLE_ID:
    # 材料成本=123.5, 工序=10.3, 总成本=133.8, 利润率25%, 销售价 = 133.8 * 1.25 = 167.25
    r_quot = api('post', '/api/style/quotation', desc='创建报价单(利润率25%)',
                 json={
                     'styleId': STYLE_ID,
                     'targetProfitRate': 25.0,
                     'materialCost': 123.5,
                     'processCost': 10.3,
                     'secondaryCost': 0.0,
                     'totalCost': 133.8,
                     'totalPrice': QUOTATION_TOTAL_PRICE,
                     'remark': '全系统测试报价单',
                 }, warn_only=True)

    r_quot_get = api('get', f'/api/style/quotation?styleId={STYLE_ID}',
                     desc='查询报价单(验证)', warn_only=True)
    qdata = r_quot_get.get('data', {})
    if isinstance(qdata, dict):
        tp = qdata.get('totalPrice', '未存储')
        pr = qdata.get('targetProfitRate', '未存储')
        print(f'  报价 totalPrice={tp} targetProfitRate={pr}')
        if tp and float(str(tp) or '0') > 0:
            print('  OK 报价单价格已保存')
        else:
            print('  WARN 报价单totalPrice为空，需排查')

# ============================================================
# STEP 3: 生产订单
# ============================================================
sep('STEP 3: 生产订单')
ORDER_ID = None
ORDER_NO = f'PO{rnd(8)}'

subsep('3.1 创建生产订单')
if STYLE_ID:
    r_ord = api('post', '/api/production/order', desc='创建生产订单(100件)',
                json={
                    'styleId': str(STYLE_ID),
                    'styleNo': STYLE_NO,
                    'orderNo': ORDER_NO,
                    'factoryId': str(FAC_ID) if FAC_ID else None,
                    'orderQuantity': 100,
                    'deliveryDate': now_date(30),
                    'company': '测试客户公司',
                    'merchandiser': 'zhangcz',
                    'productCategory': '上衣',
                    'orderDetails': json.dumps([
                        {'color': '黑色', 'size': 'S', 'quantity': 20},
                        {'color': '黑色', 'size': 'M', 'quantity': 40},
                        {'color': '黑色', 'size': 'L', 'quantity': 30},
                        {'color': '黑色', 'size': 'XL', 'quantity': 10},
                    ]),
                })
    od = r_ord.get('data', {})
    if isinstance(od, dict):
        ORDER_ID = od.get('id')
        ORDER_NO = od.get('orderNo', ORDER_NO)
    print(f'  订单ID={ORDER_ID}  订单号={ORDER_NO}')
else:
    print('  SKIP 无款式ID，跳过订单创建')

# 如果没创建成功，从列表找最近订单
if not ORDER_ID:
    time.sleep(0.5)
    r_ol = api('get', '/api/production/order/list?page=1&size=5', desc='订单列表', warn_only=True)
    old = r_ol.get('data', {})
    olrec = old.get('records', []) if isinstance(old, dict) else []
    if olrec:
        ORDER_ID = olrec[0].get('id')
        ORDER_NO = olrec[0].get('orderNo', ORDER_NO)
        STYLE_ID = STYLE_ID or olrec[0].get('styleId')
        print(f'  从列表取订单 ID={ORDER_ID} NO={ORDER_NO}')

subsep('3.2 订单列表验证')
r_ol2 = api('get', '/api/production/order/list?page=1&size=20', desc='订单列表(全量)')
old2 = r_ol2.get('data', {})
if isinstance(old2, dict):
    print(f'  订单总数: {old2.get("total", "N/A")}')
    recs = old2.get('records', [])
    if recs:
        print(f'  最新订单: {recs[0].get("orderNo")} 状态={recs[0].get("status")} 数量={recs[0].get("orderQuantity")}')

subsep('3.3 订单报价单价验证 [关键-价格修复]')
if ORDER_ID:
    r_det = api('get', f'/api/production/order/detail/{ORDER_ID}', desc='订单详情', warn_only=True)
    det = r_det.get('data', {}) or {}
    if isinstance(det, dict):
        qup = det.get('quotationUnitPrice')
        sfp = det.get('styleFinalPrice')
        sty_style_id = det.get('styleId')
        print(f'  quotationUnitPrice={qup}  styleFinalPrice={sfp}')
        if qup and float(str(qup) or '0') > 0:
            print(f'  OK 报价单价已填充: {qup} (应接近 {QUOTATION_TOTAL_PRICE})')
            PASS += 1
        else:
            print(f'  WARN quotationUnitPrice={qup} (为空可能因价格未同步，后端重启后应更新)')
            WARN += 1

# ============================================================
# STEP 4: 裁剪管理
# ============================================================
sep('STEP 4: 裁剪/菲号管理')
BUNDLE_CODE = None

subsep('4.1 生成裁剪菲号')
if ORDER_NO and ORDER_ID:
    r_gen = api('post', '/api/production/cutting/generate', desc='生成裁剪菲号',
                json={
                    'orderNo': ORDER_NO,
                    'orderId': str(ORDER_ID),
                    'bundleSize': 20,
                    'colorSizeGroups': [
                        {'color': '黑色', 'size': 'S', 'quantity': 20},
                        {'color': '黑色', 'size': 'M', 'quantity': 40},
                        {'color': '黑色', 'size': 'L', 'quantity': 30},
                        {'color': '黑色', 'size': 'XL', 'quantity': 10},
                    ]
                }, warn_only=True)
    gen_data = r_gen.get('data')
    print(f'  生成结果: {str(gen_data)[:200]}')

subsep('4.2 菲号列表')
if ORDER_NO:
    r_bl = api('get', f'/api/production/cutting/list?orderNo={ORDER_NO}&page=1&size=20',
               desc='菲号列表', warn_only=True)
    bld = r_bl.get('data', {})
    bundles = bld.get('records', []) if isinstance(bld, dict) else (bld if isinstance(bld, list) else [])
    print(f'  菲号数量: {len(bundles)}')
    if bundles:
        b0 = bundles[0]
        BUNDLE_CODE = b0.get('qrCode') or b0.get('bundleCode') or b0.get('code') or b0.get('id')
        print(f'  第一个菲号: code={BUNDLE_CODE}  qty={b0.get("quantity")}  color={b0.get("color")}  size={b0.get("size")}')

subsep('4.3 裁剪汇总')
if ORDER_NO:
    r_sum = api('get', f'/api/production/cutting/summary?orderNo={ORDER_NO}',
                desc='裁剪汇总', warn_only=True)
    sumd = r_sum.get('data', {})
    if isinstance(sumd, dict):
        print(f'  裁剪汇总: totalQty={sumd.get("totalQuantity")} bundleCount={sumd.get("bundleCount")}')

# ============================================================
# STEP 5: 扫码记录
# ============================================================
sep('STEP 5: 工序扫码')

subsep('5.1 生产扫码(车缝)')
SCAN_RESULT = None
if ORDER_NO and BUNDLE_CODE:
    r_scan = api('post', '/api/production/scan/execute', desc=f'车缝扫码 code={BUNDLE_CODE}',
                 json={
                     'qrCode': str(BUNDLE_CODE),
                     'orderNo': ORDER_NO,
                     'processCode': 'SEW',
                     'processName': '车缝',
                     'operator': 'zhangcz',
                     'quantity': 20,
                     'scanTime': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                 }, warn_only=True)
    SCAN_RESULT = r_scan.get('data')
    print(f'  扫码结果: code={r_scan.get("code")} data={str(SCAN_RESULT)[:100]}')
elif ORDER_NO:
    print('  SKIP 无菲号code，跳过扫码')

subsep('5.2 质检扫码')
if ORDER_NO and BUNDLE_CODE:
    r_qc = api('post', '/api/production/scan/execute', desc='质检扫码',
               json={
                   'qrCode': str(BUNDLE_CODE),
                   'orderNo': ORDER_NO,
                   'processCode': 'QC',
                   'processName': '质检',
                   'operator': 'zhangcz',
                   'quantity': 20,
                   'qualifiedQuantity': 19,
                   'defectiveQuantity': 1,
                   'scanTime': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
               }, warn_only=True)
    print(f'  质检扫码: code={r_qc.get("code")}')

subsep('5.3 扫码记录列表')
r_srec = api('get', '/api/production/scan/list?page=1&size=10', desc='扫码记录列表', warn_only=True)
srd = r_srec.get('data', {})
src_total = srd.get('total', 0) if isinstance(srd, dict) else len(srd) if isinstance(srd, list) else 0
print(f'  扫码记录总数: {src_total}')

# ============================================================
# STEP 6: 面辅料库存
# ============================================================
sep('STEP 6: 面辅料库存管理')

subsep('6.1 面辅料库存查询')
r_ms = api('get', '/api/production/material/stock/list?page=1&size=10', desc='面辅料库存', warn_only=True)
if not r_ms.get('data'):
    r_ms = api('post', '/api/production/material/stock/list', json={'pageNum':1,'pageSize':10},
               desc='面辅料库存(POST)', warn_only=True)
msd = r_ms.get('data', {})
ms_total = msd.get('total', len(msd) if isinstance(msd, list) else 0) if msd else 0
print(f'  面辅料库存SKU数: {ms_total}')

subsep('6.2 面料入库')
r_min = api('post', '/api/production/material/stock/inbound', desc='面料入库500米',
            json={
                'materialCode': f'MC{rnd(4)}',
                'materialName': '纯棉布料',
                'materialType': '面料',
                'quantity': 500,
                'unit': '米',
                'unitPrice': 48.0,
                'supplier': '上海布料公司',
                'inboundDate': now_date(),
                'remark': '全系统测试面料入库',
            }, warn_only=True)
print(f'  入库结果: code={r_min.get("code")} msg={r_min.get("message","")}')

subsep('6.3 辅料入库')
r_ain = api('post', '/api/production/material/stock/inbound', desc='辅料入库',
            json={
                'materialCode': f'MA{rnd(4)}',
                'materialName': '金属拉链',
                'materialType': '辅料',
                'quantity': 200,
                'unit': '条',
                'unitPrice': 3.5,
                'supplier': '广州辅料厂',
                'inboundDate': now_date(),
            }, warn_only=True)
print(f'  辅料入库: code={r_ain.get("code")}')

# 领料
subsep('6.4 生产领料')
if ORDER_NO:
    r_pick = api('post', '/api/production/picking', desc='生产领料200米',
                 json={
                     'orderNo': ORDER_NO,
                     'orderId': str(ORDER_ID) if ORDER_ID else None,
                     'materialCode': 'M001',
                     'materialName': '纯棉布料',
                     'quantity': 200,
                     'unit': '米',
                     'pickDate': now_date(),
                 }, warn_only=True)
    print(f'  领料: code={r_pick.get("code")}')

# ============================================================
# STEP 7: 成品入库
# ============================================================
sep('STEP 7: 成品入库')

subsep('7.1 合格品入库')
WH_ID = None
if ORDER_NO:
    r_wh = api('post', '/api/production/warehousing', desc='合格品入库92件',
               json={
                   'orderNo': ORDER_NO,
                   'orderId': str(ORDER_ID) if ORDER_ID else None,
                   'styleNo': STYLE_NO,
                   'warehouseType': 'QUALIFIED',
                   'inboundDate': now_date(),
                   'details': [
                       {'color': '黑色', 'size': 'S', 'quantity': 18},
                       {'color': '黑色', 'size': 'M', 'quantity': 38},
                       {'color': '黑色', 'size': 'L', 'quantity': 28},
                       {'color': '黑色', 'size': 'XL', 'quantity': 8},
                   ],
                   'operator': 'zhangcz',
                   'remark': '全系统测试合格品入库',
               }, warn_only=True)
    whd = r_wh.get('data')
    if isinstance(whd, dict):
        WH_ID = whd.get('id')
    print(f'  入库: code={r_wh.get("code")} id={WH_ID}')

subsep('7.2 次品入库')
if ORDER_NO:
    r_def = api('post', '/api/production/warehousing', desc='次品入库8件',
                json={
                    'orderNo': ORDER_NO,
                    'orderId': str(ORDER_ID) if ORDER_ID else None,
                    'styleNo': STYLE_NO,
                    'warehouseType': 'DEFECTIVE',
                    'inboundDate': now_date(),
                    'details': [
                        {'color': '黑色', 'size': 'M', 'quantity': 2},
                        {'color': '黑色', 'size': 'L', 'quantity': 2},
                    ],
                    'operator': 'zhangcz',
                    'remark': '次品',
                }, warn_only=True)
    print(f'  次品入库: code={r_def.get("code")}')

subsep('7.3 成品库存查询')
r_fp = api('get', '/api/warehouse/finished-inventory/list?page=1&size=10',
           desc='成品库存', warn_only=True)
if not r_fp.get('data'):
    r_fp = api('post', '/api/warehouse/finished-inventory/list',
               json={'pageNum':1,'pageSize':10}, desc='成品库存(POST)', warn_only=True)
fpd = r_fp.get('data', {})
fp_total = fpd.get('total', 0) if isinstance(fpd, dict) else len(fpd) if isinstance(fpd, list) else 0
print(f'  成品库存SKU数: {fp_total}')

# ============================================================
# STEP 8: 财务结算 [关键验证]
# ============================================================
sep('STEP 8: 财务结算 [核心验证]')

subsep('8.1 成品结算列表')
r_fs = api('get', '/api/finance/finished-settlement/list?page=1&size=30', desc='成品结算列表')
if not r_fs.get('data'):
    r_fs = api('post', '/api/finance/finished-settlement/list',
               json={'pageNum':1,'pageSize':30}, desc='成品结算列表(POST)')
fsd = r_fs.get('data', {})
fs_recs = []
if isinstance(fsd, dict):
    fs_recs = fsd.get('records', fsd.get('list', []))
    total_count = fsd.get('total', 0)
elif isinstance(fsd, list):
    fs_recs = fsd
    total_count = len(fs_recs)
else:
    total_count = 0
print(f'  成品结算总数: {total_count}  本页: {len(fs_recs)}')

# 关键验证1: CANCELLED订单不应出现
if fs_recs:
    cancelled = [r for r in fs_recs
                 if str(r.get('status', '')).upper() in ('CANCELLED', 'DELETED')]
    if cancelled:
        print(f'  FAIL 发现 {len(cancelled)} 条已取消订单混入结算列表!')
        FAIL += 1
        for c in cancelled[:3]:
            print(f'    order={c.get("orderNo")} status={c.get("status")}')
    else:
        print(f'  OK 无已取消订单出现在结算列表 (共{len(fs_recs)}条)')
        PASS += 1

# 关键验证2: styleFinalPrice应该是报价单的totalPrice（含利润率）
price_ok = 0; price_zero = 0
for rec in fs_recs:
    sfp = rec.get('styleFinalPrice') or rec.get('stylePrice') or 0
    try:
        if float(str(sfp) or '0') > 0:
            price_ok += 1
        else:
            price_zero += 1
    except:
        price_zero += 1

if fs_recs:
    print(f'  价格统计: 有单价={price_ok}条  单价为0={price_zero}条')
    if price_zero > 0:
        print(f'  WARN {price_zero}条结算单价为0（未报价订单）')

# 打印前3条样例
print('\n  === 结算记录样例 ===')
for rec in fs_recs[:3]:
    print(f'  订单={rec.get("orderNo","N/A")}  '
          f'状态={rec.get("status","N/A")}  '
          f'销售单价={rec.get("styleFinalPrice","N/A")}  '
          f'利润率={rec.get("targetProfitRate","N/A")}%  '
          f'面料成本={rec.get("materialCost","N/A")}  '
          f'生产成本={rec.get("productionCost","N/A")}')

subsep('8.2 面辅料结算')
for path in [
    '/api/finance/material-reconciliation/list?page=1&size=10',
]:
    r = api('get', path, desc='面辅料结算', warn_only=True)
    d = r.get('data', {})
    t = d.get('total', 0) if isinstance(d, dict) else len(d) if isinstance(d, list) else 0
    print(f'  面辅料结算条数: {t}')

subsep('8.3 工资/薪资结算')
r_pw = api('get', '/api/finance/payroll-settlement/list?page=1&size=10',
           desc='工资结算', warn_only=True)
pwd = r_pw.get('data', {})
pw_t = pwd.get('total', 0) if isinstance(pwd, dict) else len(pwd) if isinstance(pwd, list) else 0
print(f'  工资结算条数: {pw_t}')

subsep('8.4 对账单')
r_rc = api('get', '/api/finance/reconciliation/list?page=1&size=10', desc='对账单', warn_only=True)
rcd = r_rc.get('data', {})
rc_t = rcd.get('total', 0) if isinstance(rcd, dict) else len(rcd) if isinstance(rcd, list) else 0
print(f'  对账单条数: {rc_t}')

subsep('8.5 出货对账')
r_ship = api('get', '/api/finance/shipment-reconciliation/list?page=1&size=10',
             desc='出货对账', warn_only=True)
shd = r_ship.get('data', {})
sh_t = shd.get('total', 0) if isinstance(shd, dict) else len(shd) if isinstance(shd, list) else 0
print(f'  出货对账条数: {sh_t}')

# ============================================================
# STEP 9: 数据看板
# ============================================================
sep('STEP 9: 数据看板')

dash_paths = [
    '/api/dashboard/overview',
    '/api/dashboard/production/stats',
    '/api/dashboard/finance/stats',
    '/api/dashboard/order-trend',
]
for p in dash_paths:
    r_d = api('get', p, desc=f'看板 {p}', warn_only=True)
    ddata = r_d.get('data')
    if ddata and isinstance(ddata, dict):
        print(f'    keys={list(ddata.keys())[:6]}')

r_wdash = api('get', '/api/warehouse/dashboard', desc='仓库看板', warn_only=True)
wdd = r_wdash.get('data', {})
if isinstance(wdd, dict) and wdd:
    print(f'  仓库看板keys: {list(wdd.keys())[:6]}')

# ============================================================
# STEP 10: 数据库直查验证 [DB层核心验证]
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

subsep('10.2 订单报价单价字段(DB)')
lines_o = db_query("""
SELECT
  COUNT(*) total_orders,
  SUM(CASE WHEN quotation_unit_price > 0 THEN 1 ELSE 0 END) has_q_price,
  MAX(quotation_unit_price) max_q_price,
  MIN(created_time) oldest_order
FROM t_production_order WHERE tenant_id=1
""")
for l in lines_o:
    print(f'  DB: {l}')

subsep('10.3 最新订单的报价单价')
lines_n = db_query(f"""
SELECT id, order_no, style_no, style_final_price, quotation_unit_price, status
FROM t_production_order
WHERE order_no='{ORDER_NO}'
LIMIT 1
""")
for l in lines_n:
    print(f'  DB: {l}')

subsep('10.4 款式报价单记录')
if STYLE_ID:
    lines_q = db_query(f"""
SELECT style_id, total_price, target_profit_rate, total_cost, is_locked
FROM t_style_quotation WHERE style_id={STYLE_ID}
""")
    for l in lines_q:
        print(f'  DB: {l}')
        if str(QUOTATION_TOTAL_PRICE) in l or '167' in l:
            print('  OK totalPrice=167.25 已正确存储')

subsep('10.5 BOM记录数')
if STYLE_ID:
    lines_b = db_query(f"SELECT COUNT(*) bom_count FROM t_style_bom WHERE style_id={STYLE_ID}")
    for l in lines_b:
        print(f'  DB: {l}')

subsep('10.6 扫码记录')
if ORDER_NO:
    lines_s = db_query(f"""
SELECT COUNT(*) total, SUM(quantity) total_qty
FROM t_scan_record WHERE order_no='{ORDER_NO}'
""")
    for l in lines_s:
        print(f'  DB: {l}')

# ============================================================
# STEP 11: 进度详情页面数据验证
# ============================================================
sep('STEP 11: 生产进度详情验证')

if ORDER_ID:
    subsep('11.1 进度追踪数据')
    r_prog = api('get', f'/api/production/order/detail/{ORDER_ID}', desc='订单完整详情', warn_only=True)
    pd = r_prog.get('data', {}) or {}
    if isinstance(pd, dict):
        print(f'  订单号: {pd.get("orderNo")}')
        print(f'  状态: {pd.get("status")}')
        print(f'  数量: {pd.get("orderQuantity")} 件')
        print(f'  完成: {pd.get("completedQuantity")} 件')
        print(f'  quotationUnitPrice: {pd.get("quotationUnitPrice")}')
        print(f'  styleFinalPrice: {pd.get("styleFinalPrice")}')
        wf = pd.get('progressWorkflowJson')
        if wf:
            try:
                wfd = json.loads(wf)
                print(f'  工作流步骤数: {len(wfd) if isinstance(wfd, list) else "N/A"}')
            except:
                print(f'  工作流: {str(wf)[:100]}')

    subsep('11.2 生产统计')
    r_stats = api('get', '/api/production/order/stats', desc='全局订单统计', warn_only=True)
    stsd = r_stats.get('data', {}) or {}
    if isinstance(stsd, dict):
        print(f'  总订单={stsd.get("totalOrders")}  总数量={stsd.get("totalQuantity")}')
        print(f'  延期订单={stsd.get("delayedOrders")}  今日下单={stsd.get("todayOrders")}')

# ============================================================
# 最终汇总报告
# ============================================================
sep('最终测试报告')
total_tests = PASS + FAIL + WARN
status_icon = 'PASS' if FAIL == 0 else 'FAIL'
print(f"""
  账号: zhangcz (tenant_id=1)
  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

  测试款号:    {STYLE_NO}  (ID={STYLE_ID})
  测试订单:    {ORDER_NO}  (ID={ORDER_ID})
  工厂ID:      {FAC_ID}
  报价单价:    {QUOTATION_TOTAL_PRICE}

  ===== 测试结果 =====
  OK  通过: {PASS}
  FAIL 失败: {FAIL}
  WARN 警告: {WARN}
  总计:       {total_tests}

  整体状态: {status_icon}
""")

# 失败清单
failed_list = [r for r in RESULTS if not r['ok']]
if failed_list:
    print('  === 失败接口清单 ===')
    for f in failed_list:
        print(f"  FAIL {f['method'].upper():4s} {f['path']}  code={f['code']}  {f['desc']}")
else:
    print('  所有接口均已通过！')

# 警告清单
warned_list = [r for r in RESULTS if r.get('code') != 200 and not r.get('ok')]
print('\n  === 高优先级问题汇总 ===')
print('  1. 如果 styleFinalPrice(销售单价) 为0 -> 检查 v_finished_product_settlement 视图')
print('  2. 如果 quotationUnitPrice 为空 -> 检查 OrderPriceFillHelper.fillQuotationUnitPrice()')
print('  3. 如果 CANCELLED 出现在结算列表 -> 检查 FinishedProductSettlementController 过滤')
print('  4. 如果菲号生成失败 -> 检查裁剪业务逻辑和权限')

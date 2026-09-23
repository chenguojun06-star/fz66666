#!/usr/bin/env node
/**
 * 仓库出入库页面逻辑测试（Node 跑，无需真机）
 *
 * 为什么需要它：
 *   静态检查（node --check / check-miniprogram-refs.py）查不出**运行时**问题。
 *   今晚实际踩到两个：① setData 回调不绑定 this；② showActionSheet itemList ≤6。
 *   这个 harness 用 mock 的 wx/api 把页面逻辑真跑一遍，能测出这类问题。
 *
 * ⚠️ 关键：mock 忠实还原小程序的行为差异
 *   - setData 的 callback **不绑定 this**（和小程序一致）
 *   - wx.showActionSheet 在 itemList > 6 时**直接失败**（和小程序一致）
 *
 * 用法：node scripts/test-warehouse-pages.mjs
 * 退出码：0 = 全通过；1 = 有失败
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// ⚠️ 必须用 fileURLToPath 解码，否则中文目录名会变成 %E6%9C%8D... 导致 ENOENT
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MP = path.join(ROOT, 'miniprogram');

// ────────────────────────── 断言 ──────────────────────────
let passed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

// ────────────────────────── Harness ──────────────────────────
/** 记录 wx 调用 */
function makeWx() {
  const calls = [];
  const wx = {
    calls,
    navigateTo: (o) => { calls.push(['navigateTo', o]); },
    navigateBack: () => calls.push(['navigateBack']),
    showToast: (o) => calls.push(['showToast', o]),
    showModal: (o) => { calls.push(['showModal', o]); o.success && o.success({ confirm: true }); },
    setNavigationBarTitle: (o) => calls.push(['setNavigationBarTitle', o]),
    scanCode: (o) => calls.push(['scanCode', o]),
    vibrateShort: () => {},
    // ⚠️ 忠实还原：itemList 最多 6 项
    showActionSheet: (o) => {
      calls.push(['showActionSheet', o]);
      if (Array.isArray(o.itemList) && o.itemList.length > 6) {
        o.fail && o.fail({ errMsg: 'showActionSheet:fail itemList 长度超过 6' });
        return;
      }
      o.success && o.success({ tapIndex: 0 });
    },
  };
  return wx;
}

/**
 * 加载一个页面，返回 { page, wx, api, lastPayload }
 * @param {string} jsPath 页面 index.js 相对 miniprogram 的路径
 * @param {object} apiStub 接口桩
 */
/**
 * 沙箱内的 require 桩
 *
 * 页面除了 api 之外还可能 require 纯工具模块（如 utils/urlParams）。
 * 这里**加载真实文件**（而不是在测试里复写一份实现），保证测的是线上同一份代码。
 */
function makeSandboxRequire() {
  return function (p) {
    if (/urlParams$/.test(p)) {
      const real = fs.readFileSync(path.join(MP, 'utils/urlParams.js'), 'utf8');
      const m = { exports: {} };
      vm.runInNewContext(real, { module: m, exports: m.exports, console });
      return m.exports;
    }
    throw new Error('测试未桩的 require: ' + p);
  };
}

function loadPage(jsPath, apiStub) {
  const src = fs.readFileSync(path.join(MP, jsPath), 'utf8');
  const wx = makeWx();
  let cfg = null;
  const sandbox = {
    Page: (c) => { cfg = c; },
    wx,
    getApp: () => ({}),
    console,
    setTimeout: (fn) => fn && fn(),   // 立即执行，避免测试挂起
    module: { exports: {} },
    exports: {},
    require: makeSandboxRequire(),
  };
  // 把 require 替换成桩（兼容 const / var / let 三种声明写法）
  const patched = src.replace(/(?:const|var|let)\s+api\s*=\s*require\([^)]*\);/, 'const api = __api__;');
  vm.createContext(sandbox);
  sandbox.__api__ = apiStub;
  vm.runInContext(patched, sandbox);

  if (!cfg) throw new Error('未捕获到 Page 配置: ' + jsPath);

  // 实例化（模拟小程序：data 深拷贝，方法绑定 this）
  const page = {
    data: JSON.parse(JSON.stringify(cfg.data || {})),
    setData(obj, cb) {
      Object.assign(this.data, obj);
      // ⚠️ 关键：不绑定 this，和小程序一致
      if (typeof cb === 'function') cb();
    },
  };
  for (const k of Object.keys(cfg)) {
    if (k === 'data') continue;
    // ⚠️ 关键：**不要** bind —— 真实小程序里方法也是未绑定的。
    // 这样 `this.setData(x, this._refreshSelection)` 传出去的就是裸函数，
    // 被 setData 以 cb() 调用时 this === undefined（与小程序一致）。
    // 而测试里写 `page.onToggleSku(...)` 调用时 this 自然是 page。
    page[k] = cfg[k];
  }
  return { page, wx, cfg };
}

/**
 * 加载一个**组件**（Component({...})），返回 { page, wx, cfg }
 *
 * D-514：入库/出库表单已抽成通用组件（物料中心 tab 内联复用同一份逻辑），
 * 所以测试要能直接驱动组件。这里做三件事，让测试写法与页面完全一致：
 *   ① properties 的默认值并入 data（组件里 this.data.xxx 才读得到）
 *   ② methods 提升为顶层方法（page.onSubmit() 直接可调）
 *   ③ 补 triggerEvent（收集到 page.events，用于断言 success 事件）
 */
function loadComponent(jsPath, apiStub) {
  const src = fs.readFileSync(path.join(MP, jsPath), 'utf8');
  const wx = makeWx();
  let cfg = null;
  const sandbox = {
    Component: (c) => { cfg = c; },
    wx,
    getApp: () => ({}),
    console,
    setTimeout: (fn) => fn && fn(),
    module: { exports: {} },
    exports: {},
    require: makeSandboxRequire(),
  };
  const patched = src.replace(/(?:const|var|let)\s+api\s*=\s*require\([^)]*\);/, 'const api = __api__;');
  vm.createContext(sandbox);
  sandbox.__api__ = apiStub;
  vm.runInContext(patched, sandbox);

  if (!cfg) throw new Error('未捕获到 Component 配置: ' + jsPath);

  const initData = {};
  for (const [k, def] of Object.entries(cfg.properties || {})) {
    initData[k] = def && typeof def === 'object' && 'value' in def ? def.value : undefined;
  }
  Object.assign(initData, cfg.data || {});

  const events = [];
  const page = {
    data: JSON.parse(JSON.stringify(initData)),
    properties: Object.assign({}, initData),
    events,
    setData(obj, cb) {
      Object.assign(this.data, obj);
      // 组件里 setData 到 property 上时，properties 也要跟着变
      for (const k of Object.keys(this.properties)) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) this.properties[k] = obj[k];
      }
      // ⚠️ 关键：不绑定 this，和小程序一致
      if (typeof cb === 'function') cb();
    },
    triggerEvent(name, detail) { events.push([name, detail]); },
    selectComponent() { return null; },
    /** 模拟小程序生命周期 attached */
    attached() {
      const f = cfg.lifetimes && cfg.lifetimes.attached;
      if (f) f.call(this);
    },
  };
  for (const [k, fn] of Object.entries(cfg.methods || {})) page[k] = fn;
  return { page, wx, cfg };
}

/** 取最后一次某类 wx 调用 */
function lastCall(wx, name) {
  for (let i = wx.calls.length - 1; i >= 0; i--) if (wx.calls[i][0] === name) return wx.calls[i][1];
  return null;
}

// ────────────────────────── 接口桩 ──────────────────────────
const SKUS = [
  { id: 's1', sku: 'SKU-A-S', color: '白色', size: 'S', availableQty: 10, warehouseLocation: 'A区', salesPrice: 0 },
  { id: 's2', sku: 'SKU-A-M', color: '白色', size: 'M', availableQty: 0,  warehouseLocation: 'A区', salesPrice: 0 },   // 无库存
  { id: 's3', sku: 'SKU-B-S', color: '黑色', size: 'S', availableQty: 5,  warehouseLocation: 'B区', salesPrice: 0 },
];

function makeApi(overrides = {}) {
  const calls = [];
  const api = {
    calls,
    warehouse: {
      listFinishedInventory: async () => SKUS.map(s => ({ ...s })),
      outbound: async (d) => { calls.push(['outbound', d]); return {}; },
      freeInbound: async (d) => { calls.push(['freeInbound', d]); return {}; },
      batchInbound: async (d) => { calls.push(['batchInbound', d]); return []; },
      listWarehouseAreas: async () => [
        { id: 'a1', areaName: '成品A区' }, { id: 'a2', areaName: '成品B区' },
      ],
      listLocations: async () => [],
    },
    crm: {
      listActiveCustomers: async () => [
        { id: 'c1', companyName: '客户甲' }, { id: 'c2', companyName: '客户乙' },
      ],
    },
    material: {
      scanQuery: async (code) => ({
        found: true, stockId: 'stk-1', materialCode: code, materialName: '棉布',
        // ⚠️ 库里存的是**英文代码** fabric/lining/accessory（不是中文"面料"）
        materialType: 'fabric', color: '白', size: '1.5m', quantity: 20, unit: '米',
      }),
      // 「物料资料」—— 幅宽/克重/成分 的真正来源
      listDatabase: async () => ({
        records: [
          { materialCode: 'MC-OTHER', fabricWidth: '999cm' },   // 干扰项：编码不匹配，不能被选中
          { materialCode: 'MC-1', fabricWidth: '150cm', fabricWeight: '200g/m²', fabricComposition: '100%棉' },
        ],
      }),
      freeInbound: async (d) => { calls.push(['materialFreeInbound', d]); return {}; },
      manualOutbound: async (d) => { calls.push(['manualOutbound', d]); return {}; },
    },
    production: {
      listOrders: async () => [
        { orderNo: 'PO-001', styleNo: 'ST-9' },
        { orderNo: 'PO-002', styleNo: 'ST-8' },
      ],
    },
    factory: { list: async () => [{ id: 'f1', factoryName: '本厂', factoryType: 'INTERNAL' }] },
    system: { listUsers: async () => [{ id: 'u1', realName: '张三' }, { id: 'u2', realName: '李四' }] },
  };
  return Object.assign(api, overrides);
}

// ────────────────────────── 测试用例 ──────────────────────────

async function testFinishedOutbound() {
  console.log('\n【成品出库页 finished-outbound】');
  const api = makeApi();
  const { page, wx } = loadPage('pages/warehouse/finished-outbound/index.js', api);
  await page.onLoad({ styleNo: 'ST-9', orderNo: 'PO-001' });
  await new Promise(r => setTimeout(r, 30));

  eq('加载后 SKU 列表', page.data.skuList.length, 3);
  eq('默认出库类型', page.data.outstockType, 'shipment');
  ok('销售出库需要客户', page.data.needsCustomer === true);
  ok('仓库区域已加载', page.data.areaNames.length === 2);
  ok('客户列表已加载', page.data.customerNames.length === 2);

  // ── 勾选（这里能测出 setData 回调 this 丢失的 bug）
  page.onToggleSku({ currentTarget: { dataset: { id: 's1' } } });
  eq('勾选后已选项数', page.data.selectedCount, 1);
  eq('勾选后合计件数', page.data.selectedQty, 1);

  // ── 数量加减
  page.onQtyPlus({ currentTarget: { dataset: { id: 's1' } } });
  eq('数量 +1', page.data.selectedQty, 2);
  page.onQtyMinus({ currentTarget: { dataset: { id: 's1' } } });
  eq('数量 -1', page.data.selectedQty, 1);

  // ── 超出库存应被拦截
  page.onQtyInput({ currentTarget: { dataset: { id: 's1' } }, detail: { value: '999' } });
  ok('超库存被限制为可用库存', page.data.selected.s1 === 10, `实际 ${page.data.selected.s1}`);

  // ── 无库存规格不允许勾选
  page.onToggleSku({ currentTarget: { dataset: { id: 's2' } } });
  ok('无库存规格不可勾选', page.data.selected.s2 == null);

  // ── 全选（只选有库存的）
  page.onToggleAll();
  eq('全选项数（排除无库存）', page.data.selectedCount, 2);
  ok('全选态标记', page.data.allSelected === true);

  // ── 类型切换
  page.onSelectType({ currentTarget: { dataset: { key: 'transfer_out' } } });
  ok('切到调拨后不需要客户', page.data.needsCustomer === false);
  eq('切类型后清空客户', page.data.customerName, '');

  // ── 切回销售，未选客户提交应被拦截
  page.onSelectType({ currentTarget: { dataset: { key: 'shipment' } } });
  await page.onSubmit();
  const toast = lastCall(wx, 'showToast');
  ok('未选客户时提交被拦截', toast && /客户/.test(toast.title || ''), toast && toast.title);
  eq('被拦截时未调用接口', api.calls.length, 0);

  // ── 选客户后提交
  page.onCustomerChange({ detail: { value: 0 } });
  eq('选中客户', page.data.customerName, '客户甲');
  await page.onSubmit();
  const payload = api.calls.find(c => c[0] === 'outbound');
  ok('提交调用了出库接口', !!payload);
  if (payload) {
    const d = payload[1];
    ok('payload 含 items', Array.isArray(d.items) && d.items.length === 2, JSON.stringify(d.items));
    ok('payload 含 outstockType', d.outstockType === 'shipment');
    ok('payload 含 customerName', d.customerName === '客户甲');
    ok('payload items 用 sku 键', d.items[0].sku && d.items[0].sku.startsWith('SKU-'));
  }
}

async function testFinishedInbound() {
  console.log('\n【成品入库页 finished-inbound】');
  const api = makeApi();
  const { page } = loadPage('pages/warehouse/finished-inbound/index.js', api);
  await page.onLoad({ styleNo: 'ST-9' });
  await new Promise(r => setTimeout(r, 30));

  eq('自动查询出 SKU', page.data.skuList.length, 3);
  eq('默认入库类型', page.data.sourceType, 'free_inbound');
  eq('默认库位', page.data.warehouseLocation, '默认仓');

  page.onToggleAll();
  eq('全选项数', page.data.selectedCount, 3);
  page.onQtyPlus({ currentTarget: { dataset: { id: 's1' } } });
  eq('数量 +1 后合计', page.data.selectedQty, 4);

  page.setData({ supplierName: '供应商A', remark: '测试备注' });
  await page.onSubmit();
  const payload = api.calls.find(c => c[0] === 'batchInbound');
  ok('调用了批量入库接口', !!payload);
  if (payload) {
    const d = payload[1];
    ok('items 含 skuCode', d.items[0].skuCode && d.items[0].skuCode.startsWith('SKU-'));
    ok('items 含 quantity', d.items[0].quantity > 0);
    // D-484 修的点：supplierName / remark 必须逐条携带，否则被丢弃
    ok('items 逐条含 supplierName', d.items[0].supplierName === '供应商A', JSON.stringify(d.items[0]));
    ok('items 逐条含 remark', d.items[0].remark === '测试备注');
    ok('顶层含 sourceType', d.sourceType === 'free_inbound');
  }
}

async function testMaterialInbound() {
  console.log('\n【物料入库表单 material-inbound-form（通用组件）】');
  const api = makeApi();
  const { page, wx } = loadComponent('components/material-inbound-form/index.js', api);
  page.attached();
  await new Promise(r => setTimeout(r, 30));

  page.setData({ materialCode: 'MC-1' });
  await page.onQuery();
  await new Promise(r => setTimeout(r, 30));
  ok('查出物料', !!page.data.materialInfo);
  eq('带出单位', page.data.unit, '米');

  // ── D-514：面料属性只读展示，来源是「物料资料」而不是库存表 ──
  await new Promise(r => setTimeout(r, 30));
  eq('识别为面料', page.data.isFabric, true);
  eq('类型显示中文标签', page.data.typeLabel, '面料');
  eq('读到幅宽', page.data.fabricWidth, '150cm');
  eq('读到克重', page.data.fabricWeight, '200g/m²');
  eq('读到成分', page.data.fabricComposition, '100%棉');

  // D-499：未查到库存记录时必须拦住（后端会抛「物料库存记录不存在」）
  page.setData({ materialInfo: null });
  await page.onSubmit();
  let t0 = lastCall(wx, 'showToast');
  ok('无库存记录时禁止入库', t0 && /库存记录|查询/.test(t0.title || ''), t0 && t0.title);
  eq('被拦截时未调用接口', api.calls.length, 0);
  // 恢复已查到的状态
  await page.queryMaterial();
  await new Promise(r => setTimeout(r, 30));

  // 数量校验
  await page.onSubmit();
  let t = lastCall(wx, 'showToast');
  ok('数量为0时被拦截', t && /数量/.test(t.title || ''), t && t.title);

  // ── D-514：库位必须是「依赖仓库区域的下拉」（对齐 PC 端 InboundDrawer）──
  api.warehouse.listLocations = async () => ([
    { locationCode: 'A-01', usedCapacity: 1, capacity: 10 },
    { locationCode: 'A-02', usedCapacity: 10, capacity: 10 },  // 满位
  ]);
  page.setData({ warehouseLocation: 'A-OLD' });
  page.onAreaChange({ detail: { value: 0 } });
  await new Promise(r => setTimeout(r, 30));
  eq('换仓库后清空旧库位', page.data.warehouseLocation, '');
  eq('库位下拉已按仓库加载', page.data.locationNames.length, 2);

  page.onLocationChange({ detail: { value: 0 } });
  eq('选中库位', page.data.warehouseLocation, 'A-01');

  page.setData({ warehouseLocation: '' });
  page.onLocationChange({ detail: { value: 1 } });
  let tl = lastCall(wx, 'showToast');
  ok('满库位被拦截', tl && /已满/.test(tl.title || ''), tl && tl.title);
  eq('满库位未被选中', page.data.warehouseLocation, '');

  // ── D-514：可搜索选择器（原生 picker 没有搜索，选项多时只能一路滚）──
  page.openPicker({ currentTarget: { dataset: { key: 'area' } } });
  eq('选择器已打开', page.data.pickerVisible, true);
  eq('选择器标题正确', page.data.pickerTitle, '选择仓库区域');
  ok('选择器带上了选项', page.data.pickerOptions.length > 0);
  // 选中 → 必须复用 onAreaChange（换仓库 + 清库位 + 重拉库位）
  page.setData({ warehouseLocation: 'X' });
  const firstArea = page.data.pickerOptions[0];
  page.onPickerSelect({ detail: { label: firstArea } });
  await new Promise(r => setTimeout(r, 30));
  eq('选中后回填仓库区域', page.data.warehouseAreaName, firstArea);
  eq('选中后清空旧库位', page.data.warehouseLocation, '');
  page.onPickerClose();
  eq('选择器已关闭', page.data.pickerVisible, false);

  // ── 入库来源（对齐 PC 端 InboundDrawer，key 必须在后端白名单内）──
  page.onSelectSourceType({ currentTarget: { dataset: { key: 'external_purchase' } } });
  eq('入库来源已切换', page.data.sourceType, 'external_purchase');
  eq('入库来源标签已更新', page.data.sourceTypeLabel, '采购到货');

  // 小数数量（D-414 的坑：不能 parseInt）
  page.setData({ quantity: '1.32', warehouseLocation: 'A-01' });
  await page.onSubmit();
  const payload = api.calls.find(c => c[0] === 'materialFreeInbound');
  ok('调用了物料入库接口', !!payload);
  if (payload) {
    ok('数量保留小数 1.32', payload[1].quantity === 1.32, `实际 ${payload[1].quantity}`);
    ok('含 materialCode', payload[1].materialCode === 'MC-1');
    ok('含 sourceType', payload[1].sourceType === 'external_purchase', payload[1].sourceType);
    ok('含 warehouseLocation', payload[1].warehouseLocation === 'A-01', payload[1].warehouseLocation);
  }
  // D-514：成功后必须抛 success 事件 —— 物料中心 tab 靠它刷新库存列表
  ok('成功后抛 success 事件', page.events.some(e => e[0] === 'success'));
}

async function testMaterialOutbound() {
  console.log('\n【物料出库表单 material-outbound-form（通用组件）】');
  const api = makeApi();
  const { page, wx } = loadComponent('components/material-outbound-form/index.js', api);
  page.attached();
  await new Promise(r => setTimeout(r, 30));

  // D-517：订单/工厂/领料人改为「打开选择器 → 远程关键字搜索」按需加载，
  // 不再预拉前 100 条（预拉只能搜到第一页）。这里走真实交互链路验证。
  const pickBySearch = async (key, idx) => {
    page.openPicker({ currentTarget: { dataset: { key } } });
    await page.onPickerSearch({ detail: { keyword: '' } });
    await new Promise(r => setTimeout(r, 10));
    const opt = (page.data.pickerOptions || [])[idx || 0];
    if (!opt) return null;
    page.onPickerSelect({ detail: { label: opt.label, value: opt.value, item: opt } });
    return opt;
  };

  eq('订单可远程搜索', (await pickBySearch('order', 0)) ? page.data.pickerOptions.length : 0, 2);
  eq('工厂可远程搜索', ((await pickBySearch('factory', 0)), page.data.pickerOptions.length), 1);
  eq('领料人可远程搜索', ((await pickBySearch('receiver', 0)), page.data.pickerOptions.length), 2);
  eq('选中领料人（按 ID 不按名称）', page.data.receiverName, '张三');
  eq('选中订单带出款号', page.data.styleNo, 'ST-9');
  eq('选中工厂', page.data.factoryName, '本厂');

  page.setData({ materialCode: 'MC-1' });
  await page.onQuery();
  await new Promise(r => setTimeout(r, 30));
  eq('取到 stockId', page.data.stockId, 'stk-1');

  // 未选必填项 → 逐项拦截
  await page.onSubmit();
  let t = lastCall(wx, 'showToast');
  ok('缺数量被拦截', t && /数量/.test(t.title || ''), t && t.title);

  page.setData({ quantity: '2' });
  // 上面已通过远程搜索选好人/订单/工厂，这里清空领料人验证拦截链路仍然有效
  page.setData({ receiverName: '', receiverId: '' });
  await page.onSubmit();
  t = lastCall(wx, 'showToast');
  ok('缺领料人被拦截', t && /领料人/.test(t.title || ''), t && t.title);
  await pickBySearch('receiver', 0);

  page.setData({ orderNo: '', styleNo: '' });
  await page.onSubmit();
  t = lastCall(wx, 'showToast');
  ok('缺关联订单被拦截', t && /订单/.test(t.title || ''), t && t.title);
  await pickBySearch('order', 0);

  page.setData({ factoryName: '', factoryId: '' });
  await page.onSubmit();
  t = lastCall(wx, 'showToast');
  ok('缺关联工厂被拦截', t && /工厂/.test(t.title || ''), t && t.title);
  await pickBySearch('factory', 0);

  await page.onSubmit();
  const payload = api.calls.find(c => c[0] === 'manualOutbound');
  ok('7 项齐全后提交成功', !!payload);
  // D-498：usageType 必须是后端存储约定值（STOCK/SAMPLE/BULK）
  if (payload) {
    ok('usageType 用后端约定值', ['BULK','SAMPLE','STOCK'].includes(payload[1].usageType),
       '实际=' + payload[1].usageType);
  }
  if (payload) {
    const d = payload[1];
    ok('含 stockId', d.stockId === 'stk-1');
    ok('含 receiverName', d.receiverName === '张三');
    ok('含 orderNo', d.orderNo === 'PO-001');
    ok('含 styleNo', d.styleNo === 'ST-9');
    ok('含 factoryName', d.factoryName === '本厂');
    ok('含 usageType', !!d.usageType);
  }
  // D-514：成功后必须抛 success 事件
  ok('成功后抛 success 事件', page.events.some(e => e[0] === 'success'));
}

/**
 * 结构测试：守住 D-488（长列表必须用 picker，不能用 showActionSheet）
 * showActionSheet 的 itemList 最多 6 项，订单/工厂/领料人上百条必然失败。
 */
/** 剥注释 —— 否则修复时写的说明文字会被误判为真实调用 */
function stripComments(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')   // WXML/HTML 注释
    .replace(/\/\*[\s\S]*?\*\//g, '')  // 块注释
    .replace(/(^|\s)\/\/[^\n]*/g, ''); // 行注释
}

function testPickerUsage() {
  console.log('\n【结构：选择器实现】');
  // ① D-517：成品出入库的仓库区域/客户**也**改成可搜索选择器（客户几十上百个，原生 picker 只能一路滚）
  //    原生 picker 现在只允许留在"固定枚举（<20 项）"场景，业务实体一律走 search-picker。
  // ② D-514：物料出入库表单的选项多（订单/工厂/领料人常有上百条），
  //    而微信原生 picker **没有搜索**，只能一路滚 → 必须换成可搜索的 search-picker。
  //    这条同时守住"别把可搜索选择器改回原生 picker"。
  const searchPages = [
    ['pages/warehouse/finished-outbound/index.wxml', 2],  // 仓库区域 + 客户
    ['pages/warehouse/finished-inbound/index.wxml', 1],   // 仓库区域
    ['pages/work/bundle-split/index.wxml', 2],            // 当前工序 + 接手工人
    ['components/material-inbound-form/index.wxml', 3],   // 物料 + 仓库区域 + 库位
    ['components/material-outbound-form/index.wxml', 5],  // 物料/订单/工厂/领料人/仓库区域
  ];
  for (const [rel, minRows] of searchPages) {
    const name = path.basename(path.dirname(rel));
    const s = stripComments(fs.readFileSync(path.join(MP, rel), 'utf8'));
    eq(`${name} 已不再用原生 picker`, (s.match(/<picker\s/g) || []).length, 0);
    const rows = (s.match(/bindtap="openPicker"/g) || []).length;
    ok(`${name} 至少 ${minRows} 个可搜索选择入口`, rows >= minRows, `实际 ${rows}`);
    ok(`${name} 已挂 search-picker`, /<search-picker/.test(s));
    ok(`${name} 未使用 showActionSheet`, !/showActionSheet/.test(s));
  }
  // 组件必须在各自 json 里注册 search-picker，否则真机白屏
  for (const rel of searchPages.map((p) => p[0].replace('.wxml', '.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(MP, rel), 'utf8'));
    ok(`${path.basename(path.dirname(rel))} 已注册 search-picker`, !!(j.usingComponents || {})['search-picker']);
  }
  // D-517：下单页的工厂/客户/纸样师/跟单员也必须可搜索（不再用原生 picker 选业务实体）
  const orderFormW = stripComments(fs.readFileSync(path.join(MP, 'pages/order/create/form/index.wxml'), 'utf8'));
  ok('下单页已挂 search-picker', /<search-picker/.test(orderFormW));
  ok('下单页至少 5 个可搜索选择入口',
    (orderFormW.match(/bindtap="openPicker"/g) || []).length >= 5,
    `实际 ${(orderFormW.match(/bindtap="openPicker"/g) || []).length}`);
  const orderFormJ = JSON.parse(fs.readFileSync(path.join(MP, 'pages/order/create/form/index.json'), 'utf8'));
  ok('下单页已注册 search-picker', !!(orderFormJ.usingComponents || {})['search-picker']);
  // D-517：通用组件必须支持远程搜索（否则大数据只能搜到第一页）
  const spW = stripComments(fs.readFileSync(path.join(MP, 'components/search-picker/index.wxml'), 'utf8'));
  ok('search-picker 支持远程搜索回调', /bind:search="onPickerSearch"/.test(fs.readFileSync(path.join(MP, 'components/material-outbound-form/index.wxml'), 'utf8')));
  ok('search-picker 支持分页加载更多', /onLoadMore/.test(fs.readFileSync(path.join(MP, 'components/search-picker/index.js'), 'utf8')));
  ok('search-picker 有加载态', /sp-loading/.test(spW));
  // search-picker 自身四件套要齐全
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    ok(`search-picker 有 .${ext}`, fs.existsSync(path.join(MP, `components/search-picker/index.${ext}`)));
  }
  // 相关 JS 里也不该再有 showActionSheet
  const allJs = searchPages.map((p) => p[0].replace('.wxml', '.js'));
  for (const rel of allJs) {
    const s = stripComments(fs.readFileSync(path.join(MP, rel), 'utf8'));
    ok(`${path.basename(path.dirname(rel))} JS 无 showActionSheet`, !/showActionSheet/.test(s));
  }
}

/**
 * 结构测试：入口按钮与跳转路径
 * 防止「改了页面路径 / 删了按钮」却没人发现（这类问题真机上表现为点了没反应）
 */
function testEntryPoints() {
  console.log('\n【结构：入口与跳转】');
  const read = (rel) => stripComments(fs.readFileSync(path.join(MP, rel), 'utf8'));

  // 成品详情页：入库按钮 + 出库跳 finished-outbound
  const dW = read('pages/warehouse/finished-inventory/detail/index.wxml');
  const dJ = read('pages/warehouse/finished-inventory/detail/index.js');
  ok('详情页有「入库」按钮', /onGoInbound/.test(dW));
  ok('详情页跳转成品入库页', /finished-inbound\/index/.test(dJ));
  ok('详情页跳转成品出库页', /finished-outbound\/index/.test(dJ));

  // 物料库页：入库 / 出库两个按钮
  const mW = read('pages/warehouse/material-database/index.wxml');
  const mJ = read('pages/warehouse/material-database/index.js');
  ok('物料库有「入库」按钮', /onGoInbound/.test(mW));
  ok('物料库有「出库」按钮', /onGoOutbound/.test(mW));
  ok('物料库跳转物料入库页', /material-inbound\/index/.test(mJ));
  ok('物料库跳转物料出库页', /material-outbound\/index/.test(mJ));

  // 回退刷新：上一页必须真有这个刷新方法，否则操作完列表不更新
  ok('物料库有 loadList 可刷新', /loadList\s*:\s*function/.test(mJ));
  ok('成品详情有 loadDetail 可刷新', /loadDetail\s*[:(]/.test(dJ));

  // D-514：物料中心的入库/出库/领料 tab 必须是**内联组件**，不能退回「跳转卡片」
  // （用户明确要求「一个页面切换标签处理对应的出入库数据」，退化成跳转就是回归）
  const mcW = read('pages/warehouse/material-center/index.wxml');
  const mcJ = read('pages/warehouse/material-center/index.js');
  const mcJson = JSON.parse(fs.readFileSync(path.join(MP, 'pages/warehouse/material-center/index.json'), 'utf8'));
  ok('物料中心「入库」tab 内联表单', /<material-inbound-form/.test(mcW));
  ok('物料中心「出库」tab 内联表单', /<material-outbound-form/.test(mcW));
  ok('物料中心「领料」tab 内联列表', /<material-picking-list/.test(mcW));
  ok('物料中心已无 gotoInbound 跳转卡片', !/gotoInbound/.test(mcW) && !/gotoInbound/.test(mcJ));
  ok('物料中心已无 gotoPicking 跳转卡片', !/gotoPicking/.test(mcW) && !/gotoPicking/.test(mcJ));
  for (const c of ['material-inbound-form', 'material-outbound-form', 'material-picking-list']) {
    ok(`物料中心已注册组件 ${c}`, !!mcJson.usingComponents[c]);
  }
  // 三个组件都要在 components 目录里真实存在（否则真机白屏）
  for (const c of ['material-inbound-form', 'material-outbound-form', 'material-picking-list']) {
    ok(`组件文件存在 ${c}`, fs.existsSync(path.join(MP, `components/${c}/index.wxml`))
      && fs.existsSync(path.join(MP, `components/${c}/index.js`)));
  }

  // D-514：点物料卡片必须进**详情页**
  // 用户反馈「点卡片不是详情页，里面还有搜索框，乱七八糟」——
  // 起因是我把卡片点击指向了「物料资料」列表页（自带搜索框）。
  // 对标成品库存 finished-inventory/detail：点卡片就该看这一个物料。
  // D-515：原「物料库存列表独立页」已并入物料中心「库存」tab 并删除（孤儿页），断言改以物料中心为准。
  const DETAIL = 'pages/warehouse/material-inventory/detail/index';
  ok('物料中心点卡片进详情页', /material-inventory\/detail\/index/.test(mcJ));
  ok('物料中心点卡片不再跳物料资料列表页', !/material-database\/index\?keyword/.test(mcJ));
  ok('物料库存孤儿页已删除', !fs.existsSync(path.join(MP, 'pages/warehouse/material-inventory/index.js')));
  ok('详情页四件套齐全', ['js', 'wxml', 'json', 'wxss']
    .every((ext) => fs.existsSync(path.join(MP, `${DETAIL}.${ext}`))));

  // D-515：一个页面同时只保留一组搜索/扫码控件
  ok('顶部搜索栏只在库存 tab 显示',
    /sticky-search-bar[\s\S]{0,400}wx:if="\{\{activeTab === 'inventory'\}\}"/.test(mcW));
  ok('领料 tab 默认「全部」而不是待出库',
    /<material-picking-list[\s\S]{0,200}status=""/.test(mcW));
  ok('领料列表使用自带搜索栏', /<material-picking-list[\s\S]{0,300}show-search="\{\{true\}\}"/.test(mcW));
  ok('库存 tab 有分页加载更多', /loadMoreInventory/.test(mcW) && /loadMoreInventory/.test(mcJ));
  const todoJ = read('pages/todo-detail/index.js');
  ok('待办领料深链不再锁死 pending', !/material-picking\/index\?status=pending/.test(todoJ));
  const appJsonW = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
  const spW = (appJsonW.subpackages || []).find((s) => s.root === 'pages/warehouse');
  ok('app.json 已注册物料详情页', !!spW && spW.pages.includes('material-inventory/detail/index'));

  // D-494：列表页「出库」应直接跳 finished-outbound，不再经详情页中转
  const lJ = read('pages/warehouse/finished-inventory/index.js');
  ok('列表页有出库按钮处理', /onOutboundTap/.test(lJ));
  ok('列表页直接跳出库页(不经详情)', /finished-outbound\/index/.test(lJ));
  ok('列表页出库不再用 autoOutbound 中转', !/autoOutbound=1/.test(lJ));
  // D-496：入库也应从列表直达（与出库对称，原先只能点进详情再入库）
  ok('列表页有入库直达', /onInboundTap/.test(lJ) && /finished-inbound\/index/.test(lJ));
  const lW = read('pages/warehouse/finished-inventory/index.wxml');
  ok('列表页有入库按钮', /onInboundTap/.test(lW));

  // 四个页面都已在 app.json 注册
  const appJson = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
  const sp = (appJson.subpackages || []).find(s => s.root === 'pages/warehouse');
  for (const pg of ['finished-outbound/index', 'finished-inbound/index',
                    'material-outbound/index', 'material-inbound/index']) {
    ok(`app.json 已注册 ${pg}`, !!sp && sp.pages.includes(pg));
  }
}

/**
 * 物料库存详情页 —— 重点回归「URL 参数解码」
 *
 * 真实事故（2026-09-22 用户截图）：详情页把 encodeURIComponent 后的编码
 * 原样拿去查询，界面上编码显示成 M%E6%A3%89%E5%B8%83-140CM-%E7%B2%89%E8%89%B2，
 * 并弹「物料不存在」，颜色/规格/库位/单价全空。
 * 根因：列表页 encodeURIComponent 传参，详情页忘了 decodeURIComponent
 *       （小程序 **不会**自动解码 —— finished-inventory/detail 也是自己解的）。
 */
async function testMaterialDetail() {
  console.log('\n【物料详情页 material-inventory/detail】');
  const api = makeApi();
  const queried = [];
  // 覆盖 scanQuery：既记录"用什么编码去查的"，也返回完整快照
  // ⚠️ materialName 故意留空 —— loadDetail 里 `info.materialName || this.data.materialName`
  //    会优先用接口值，留空才能验证"URL 带过来的名称被正确解码"这条路径
  api.material.scanQuery = async (code) => {
    queried.push(code);
    return {
      found: true, stockId: 'stk-1', materialCode: code, materialName: '',
      materialType: 'fabric', color: '白', size: '1.5m',
      quantity: 20, lockedQuantity: 5, unitPrice: 12.5, location: 'A-01', unit: '米',
    };
  };
  api.material.getTransactions = async () => ([
    { type: 'IN', typeLabel: '入库', operationTime: '2026-09-22 10:00:00', quantity: 20, unit: '米', operatorName: '张三', warehouseLocation: 'A-01', remark: '' },
  ]);

  const { page } = loadPage('pages/warehouse/material-inventory/detail/index.js', api);
  // 物料编码本身含中文 —— 这正是踩坑的场景
  const RAW = 'M棉布-140CM-粉色';
  await page.onLoad({
    materialCode: encodeURIComponent(RAW),
    materialName: encodeURIComponent('棉布-140CM-粉色'),
    materialType: 'fabric',
    unit: encodeURIComponent('米'),
    safetyStock: '100',
    supplierName: encodeURIComponent('库存面料'),
    image: encodeURIComponent('https://api.x/api/file/t.png?token=a&b=c'),
  });
  await new Promise(r => setTimeout(r, 30));

  eq('materialCode 已解码（不能是 %E6%A3%89…）', page.data.materialCode, RAW);
  eq('materialName 已解码', page.data.materialName, '棉布-140CM-粉色');
  eq('unit 已解码', page.data.unit, '米');
  eq('supplierName 已解码', page.data.supplierName, '库存面料');
  // 图片 URL 里带 & —— 编码/解码必须成对，否则会被 query 截断
  eq('image 已解码且 & 未被截断', page.data.image, 'https://api.x/api/file/t.png?token=a&b=c');
  ok('按解码后的编码去查（否则必然「物料不存在」）',
    queried.length === 1 && queried[0] === RAW, '实际=' + JSON.stringify(queried));
  eq('类型标签', page.data.typeLabel, '面料');
  eq('可用 = 数量 - 锁定', page.data.availableQty, 15);
  eq('单价取到了', page.data.unitPrice, '12.5');
  eq('库位取到了', page.data.location, 'A-01');
  eq('流水加载成功', page.data.transactions.length, 1);

  // 顺带验证工具本身的边界：裸 % 不能抛异常（否则整页崩）、null 不能炸
  const { decodeParam } = makeSandboxRequire()('utils/urlParams');
  eq('decodeParam 解中文编码', decodeParam('%E6%A3%89%E5%B8%83'), '棉布');
  eq('decodeParam 无转义值原样返回', decodeParam('PO-001'), 'PO-001');
  eq('decodeParam 裸 % 不抛异常', decodeParam('50%'), '50%');
  eq('decodeParam null 返回空串', decodeParam(null), '');
  eq('decodeParam undefined 返回空串', decodeParam(undefined), '');
}

/**
 * 物料出入库**独立页**（薄壳）—— 回归 URL 参数解码
 *
 * 真实事故（2026-09-22 用户截图）：从详情页点「出库」跳到物料出库页，
 * 输入框里显示 M%E6%A3%89%E5%B8%83-140CM-… 并提示「未查到该物料」。
 * 根因同上：跳转方 encodeURIComponent，薄壳页 onLoad 忘了 decode。
 */
async function testMaterialFormPagesDecode() {
  console.log('\n【物料出入库独立页：URL 参数解码】');
  const RAW = 'M棉布-140CM-粉色';
  const pages = [
    ['pages/warehouse/material-inbound/index.js', '物料入库'],
    ['pages/warehouse/material-outbound/index.js', '物料出库'],
  ];
  for (const [js, label] of pages) {
    const { page } = loadPage(js, makeApi());
    await page.onLoad({ materialCode: encodeURIComponent(RAW) });
    eq(`${label}页 materialCode 已解码（否则查不到物料）`, page.data.materialCode, RAW);
  }
  // 不带参数时不能炸、也不能塞进乱码
  const { page: empty } = loadPage('pages/warehouse/material-outbound/index.js', makeApi());
  await empty.onLoad({});
  eq('物料出库页无参数时为空串', empty.data.materialCode, '');
}

/**
 * 可搜索选择器 search-picker —— 通用组件
 *
 * 用户反馈：「这些选着 全部要支持搜索 固定的选着是最麻烦的 要找很久」。
 * 微信原生 <picker mode="selector"> 没有搜索，本组件是全仓 53 个固定列表选择器的替代方案。
 */
async function testSearchPicker() {
  console.log('\n【可搜索选择器 search-picker（通用组件）】');
  const { page } = loadComponent('components/search-picker/index.js', makeApi());

  page.setData({ options: ['北京仓', '广州仓', '上海仓'], keyword: '' });
  page._filter();
  eq('无关键字时全量展示', page.data.filtered.length, 3);

  page.setData({ keyword: '广州' });
  page._filter();
  eq('按关键字过滤', page.data.filtered.length, 1);
  eq('过滤结果正确', page.data.filtered[0].label, '广州仓');

  // {label,value} 写法：value 也要参与匹配
  page.setData({ options: [{ label: 'WH-Beijing', value: 'wh-1' }], keyword: 'wh-1' });
  page._filter();
  eq('按 value 也能搜到', page.data.filtered.length, 1);
  eq('value 被正确带出', page.data.filtered[0].value, 'wh-1');

  page.setData({ options: ['北京仓'], keyword: 'zzz' });
  page._filter();
  eq('无匹配时列表为空', page.data.filtered.length, 0);

  // 选中要抛事件（父组件据此回填）
  page.setData({ options: ['北京仓', '广州仓'], keyword: '' });
  page._filter();
  page.onSelect({ currentTarget: { dataset: { index: 1 } } });
  const sel = page.events.find((e) => e[0] === 'select');
  ok('选中抛 select 事件', !!sel && sel[1].label === '广州仓', sel && JSON.stringify(sel[1]));
  ok('选中后同时抛 close', page.events.some((e) => e[0] === 'close'));

  // 空选项不能炸
  page.setData({ options: [], keyword: '' });
  page._filter();
  eq('空选项不报错', page.data.filtered.length, 0);
}

// ────────────────────────── 执行 ──────────────────────────
console.log('仓库出入库页面逻辑测试');
console.log('==================================================');

try {
  testPickerUsage();
  testEntryPoints();
  await testFinishedOutbound();
  await testFinishedInbound();
  await testMaterialInbound();
  await testMaterialOutbound();
  await testMaterialDetail();
  await testMaterialFormPagesDecode();
  await testSearchPicker();
} catch (e) {
  failures.push('测试执行异常: ' + (e && e.stack || e));
  console.log('\n❌ 执行异常:', e && e.stack || e);
}

console.log('\n==================================================');
console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('✅ 全部通过');
process.exit(0);

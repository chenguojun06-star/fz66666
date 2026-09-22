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
  };
  // 把 require 替换成桩
  const patched = src.replace(/const\s+api\s*=\s*require\([^)]*\);/, 'const api = __api__;');
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
  };
  const patched = src.replace(/const\s+api\s*=\s*require\([^)]*\);/, 'const api = __api__;');
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
        materialType: '面料', color: '白', size: '1.5m', quantity: 20, unit: '米',
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

  // 小数数量（D-414 的坑：不能 parseInt）
  page.setData({ quantity: '1.32' });
  await page.onSubmit();
  const payload = api.calls.find(c => c[0] === 'materialFreeInbound');
  ok('调用了物料入库接口', !!payload);
  if (payload) {
    ok('数量保留小数 1.32', payload[1].quantity === 1.32, `实际 ${payload[1].quantity}`);
    ok('含 materialCode', payload[1].materialCode === 'MC-1');
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

  eq('订单列表已加载', page.data.orderNames.length, 2);
  eq('工厂列表已加载', page.data.factoryNames.length, 1);
  eq('领料人列表已加载', page.data.receiverNames.length, 2);

  page.setData({ materialCode: 'MC-1' });
  await page.onQuery();
  await new Promise(r => setTimeout(r, 30));
  eq('取到 stockId', page.data.stockId, 'stk-1');

  // 未选必填项 → 逐项拦截
  await page.onSubmit();
  let t = lastCall(wx, 'showToast');
  ok('缺数量被拦截', t && /数量/.test(t.title || ''), t && t.title);

  page.setData({ quantity: '2' });
  await page.onSubmit();
  t = lastCall(wx, 'showToast');
  ok('缺领料人被拦截', t && /领料人/.test(t.title || ''), t && t.title);

  page.onReceiverChange({ detail: { value: 0 } });
  eq('选中领料人', page.data.receiverName, '张三');
  await page.onSubmit();
  t = lastCall(wx, 'showToast');
  ok('缺关联订单被拦截', t && /订单/.test(t.title || ''), t && t.title);

  page.onOrderChange({ detail: { value: 0 } });
  eq('选中订单带出款号', page.data.styleNo, 'ST-9');
  await page.onSubmit();
  t = lastCall(wx, 'showToast');
  ok('缺关联工厂被拦截', t && /工厂/.test(t.title || ''), t && t.title);

  page.onFactoryChange({ detail: { value: 0 } });
  eq('选中工厂', page.data.factoryName, '本厂');

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
  const pages = [
    ['pages/warehouse/finished-outbound/index.wxml', 2],   // 仓库区域 + 客户
    ['pages/warehouse/finished-inbound/index.wxml', 1],    // 仓库区域
    // D-514：物料出入库表单已抽成通用组件，picker 随之搬进组件（页面只是壳）
    ['components/material-inbound-form/index.wxml', 1],    // 仓库区域
    ['components/material-outbound-form/index.wxml', 4],   // 订单/工厂/领料人/仓库区域
  ];
  for (const [rel, minPickers] of pages) {
    const s = stripComments(fs.readFileSync(path.join(MP, rel), 'utf8'));
    const n = (s.match(/<picker\s/g) || []).length;
    ok(`${path.basename(path.dirname(rel))} 至少 ${minPickers} 个 picker`, n >= minPickers, `实际 ${n}`);
    ok(`${path.basename(path.dirname(rel))} 未使用 showActionSheet`, !/showActionSheet/.test(s));
  }
  // 四个页面 JS 里也不该再有 showActionSheet
  for (const rel of pages.map(p => p[0].replace('.wxml', '.js'))) {
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
  const miJ = read('pages/warehouse/material-inventory/index.js');
  const DETAIL = 'pages/warehouse/material-inventory/detail/index';
  ok('物料中心点卡片进详情页', /material-inventory\/detail\/index/.test(mcJ));
  ok('物料库存页点卡片进详情页', /material-inventory\/detail\/index/.test(miJ));
  ok('物料中心点卡片不再跳物料资料列表页', !/material-database\/index\?keyword/.test(mcJ));
  ok('物料库存点卡片不再直接跳出库页', !/onRowTap[\s\S]{0,500}material-outbound\/index/.test(miJ));
  ok('详情页四件套齐全', ['js', 'wxml', 'json', 'wxss']
    .every((ext) => fs.existsSync(path.join(MP, `${DETAIL}.${ext}`))));
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

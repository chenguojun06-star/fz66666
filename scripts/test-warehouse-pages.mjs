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
  // 内存版 storage：i18n 的 getLanguage()/setLanguage() 依赖它，
  // 测试里靠 wx.setStorageSync('app.language', 'en-US') 切语言
  const store = {};
  const wx = {
    calls,
    store,
    getStorageSync: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = v; },
    removeStorageSync: (k) => { delete store[k]; },
    navigateTo: (o) => { calls.push(['navigateTo', o]); },
    navigateBack: () => calls.push(['navigateBack']),
    showToast: (o) => calls.push(['showToast', o]),
    // 首页打卡流程会调（onClockIn/onClockOut），缺失会直接抛 TypeError
    showLoading: (o) => calls.push(['showLoading', o]),
    hideLoading: () => calls.push(['hideLoading']),
    showModal: (o) => { calls.push(['showModal', o]); o.success && o.success({ confirm: true }); },
    setNavigationBarTitle: (o) => calls.push(['setNavigationBarTitle', o]),
    // 底栏四语言（i18n.applyTabBar），index 对齐 app.json tabBar.list
    setTabBarItem: (o) => calls.push(['setTabBarItem', o]),
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
 * 加载 miniprogram 下的**真实模块**（含递归 require 解析）
 *
 * 为什么要递归：页面除了 api 还会 require 工具模块，工具模块又 require 别的
 * （eventBus → config/debug）。逐个写桩会在每次新增依赖时炸掉，
 * 且**测的就不是线上那份代码了**。这里统一解析相对路径，一劳永逸。
 *
 * @param {string} relFromMP 相对 miniprogram 的路径，如 'utils/eventBus.js'
 * @param {object=} wx 与页面共用的 wx 桩
 */
/**
 * 把 require 参数解析成 miniprogram 下的**真实文件**路径，解析不到返回 null。
 *
 * ⚠️ 必须用 `isFile()` 而不是 `existsSync()` —— 目录也 existsSync 为真，
 * 会把 `utils/i18n` 这种**目录**当成模块去 readFileSync → EISDIR。
 */
function resolveModuleFile(spec, fromDir) {
  const norm = String(spec).replace(/\\/g, '/');
  // 项目里两种写法并存：相对路径（'../../utils/x'）与从 miniprogram 根写起（'utils/x'）。
  // 旧白名单用 `$` 结尾匹配，恰好把两种都吃下了，改成通用解析后必须显式兼容。
  const base = norm.startsWith('.')
    ? path.posix.normalize(path.posix.join(fromDir || '', norm))
    : path.posix.normalize(norm);
  for (const cand of [base, base + '.js', base + '/index.js']) {
    const abs = path.join(MP, cand);
    try {
      if (fs.statSync(abs).isFile()) return cand;
    } catch (_) { /* 不存在，试下一个候选 */ }
  }
  return null;
}

function loadRealModule(relFromMP, wx) {
  const key = relFromMP.replace(/\\/g, '/');
  const full = path.join(MP, key);
  const src = fs.readFileSync(full, 'utf8');
  const m = { exports: {} };
  const dir = path.posix.dirname(key);
  vm.runInNewContext(src, {
    module: m,
    exports: m.exports,
    console,
    wx: wx || makeWx(),
    require: (q) => {
      const hit = resolveModuleFile(q, dir);
      if (hit) return loadRealModule(hit, wx);
      throw new Error(`无法解析 require('${q}') from ${key}`);
    },
  });
  return m.exports;
}

/**
 * 沙箱内的 require 桩 —— **通用路径解析，不维护白名单**
 *
 * 页面 require 的工具模块一律**加载真实文件**，保证测的是线上同一份代码。
 *
 * ⚠️ 早期这里是「urlParams / i18n / eventBus」三条正则白名单，
 * 结果每给页面加一个新依赖就炸一次（`测试未桩的 require: utils/fileUrl`）。
 * 白名单**必然滞后**于业务代码，所以改成按发起目录解析。
 * @param {object=} wx 页面用的 wx 桩；i18n 的语言读写要与页面共用同一份 storage
 * @param {string=} fromDir 发起 require 的模块所在目录（相对 miniprogram），页面就是 dirname(jsPath)
 */
function makeSandboxRequire(wx, fromDir) {
  return function (p) {
    const hit = resolveModuleFile(p, fromDir);
    if (hit) return loadRealModule(hit, wx);
    throw new Error(`无法解析 require('${p}') from ${fromDir || '<root>'}`);
  };
}

/**
 * 忠实还原 setData 的**点路径**语义
 *
 * 真实小程序支持 `setData({ 'a.b.c': v })` 只改深层字段。
 * 如果桩里用 Object.assign，会写成字面量键 `data['a.b.c']` ——
 * 页面读 `data.a.b.c` 拿不到新值，而测试却「通过」→ **假绿**。
 * （D-548 引入 `setData({'t.itemCount': ...})` 时踩到）
 */
function applySetData(target, obj) {
  for (const key of Object.keys(obj)) {
    if (!key.includes('.')) {
      target[key] = obj[key];
      continue;
    }
    const parts = key.split('.');
    let node = target;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (node[p] == null || typeof node[p] !== 'object') node[p] = {};
      node = node[p];
    }
    node[parts[parts.length - 1]] = obj[key];
  }
}

function loadPage(jsPath, apiStub) {
  const src = fs.readFileSync(path.join(MP, jsPath), 'utf8');
  const wx = makeWx();
  let cfg = null;
  const sandbox = {
    Page: (c) => { cfg = c; },
    wx,
    // ⚠️ 必须带 globalData：真实 getApp() 返回 App 实例，`getApp().globalData.userInfo`
    //    是页面里常见的读法（如样衣借调取操作人）。给 {} 会在那里直接 TypeError。
    getApp: () => ({ globalData: {} }),
    console,
    setTimeout: (fn) => fn && fn(),   // 立即执行，避免测试挂起
    module: { exports: {} },
    exports: {},
    require: makeSandboxRequire(wx, path.posix.dirname(jsPath)),
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
      applySetData(this.data, obj);
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
    getApp: () => ({ globalData: {} }),
    console,
    setTimeout: (fn) => fn && fn(),
    module: { exports: {} },
    exports: {},
    require: makeSandboxRequire(wx, path.posix.dirname(jsPath)),
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
      applySetData(this.data, obj);
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

/**
 * 读页面同目录的 index.json（解析失败或不存在返回 null）
 *
 * 用途：json 里的 `navigationBarTitleText` 是**静态写死**的，
 * 抽取器扫不到、wxml 扫描也扫不到，必须单独守。
 */
function readSiblingJson(jsPath) {
  const p = path.join(MP, path.posix.dirname(jsPath), 'index.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
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

  // D-517 第二批：库位/借调对象（这些页面还有其他原生 picker，只校验「已接入可搜索选择器」）
  const loosePages = [
    // 扫码主入口的库位选择在 sections/scan-area.wxml（被 index.wxml include），组件挂在 index.wxml
    ['pages/scan/sections/scan-area.wxml', 1, 'pages/scan/index.wxml', 'pages/scan/index.json'],
    ['pages/quality-detail/index.wxml', 1],                     // 质检入库：库位
    ['pages/warehouse/sample/scan-action/index.wxml', 1],       // 样衣借调：员工/外发工厂
  ];
  for (const [rel, minRows, mountRel, jsonRel] of loosePages) {
    const name = path.basename(path.dirname(rel));
    const s = stripComments(fs.readFileSync(path.join(MP, rel), 'utf8'));
    const rows = (s.match(/bindtap="openPicker"/g) || []).length;
    ok(`${name} 至少 ${minRows} 个可搜索选择入口`, rows >= minRows, `实际 ${rows}`);
    ok(`${name} 已挂 search-picker`,
      /<search-picker/.test(stripComments(fs.readFileSync(path.join(MP, mountRel || rel), 'utf8'))));
    const j = JSON.parse(fs.readFileSync(path.join(MP, jsonRel || rel.replace('.wxml', '.json')), 'utf8'));
    ok(`${name} 已注册 search-picker`, !!(j.usingComponents || {})['search-picker']);
  }
  // 样衣借调的远程搜索必须接上（否则又变成"只搜前 200 条"）
  const loanJs = fs.readFileSync(path.join(MP, 'pages/warehouse/sample/scan-action/index.js'), 'utf8');
  ok('借调对象走远程搜索', /onPickerSearch/.test(loanJs) && /_fetchLoanOptions/.test(loanJs));

  // D-517 第三批：三类"截断式本地搜索"必须改成后端关键字 / 可搜索列表
  const attJs = fs.readFileSync(path.join(MP, 'pages/attendance/detail/index.js'), 'utf8');
  ok('考勤员工搜索走后端关键字', /onInputEmployeeSearch[\s\S]{0,900}listUsers\(\{[^}]*name: key/.test(attJs));
  const orderJs = fs.readFileSync(path.join(MP, 'pages/order/create/index.js'), 'utf8');
  ok('下单选款式走后端 keyword', /onStyleSearchInput[\s\S]{0,900}keyword: kw/.test(orderJs));
  ok('下单款式展示映射存在', /_decorateStyles/.test(orderJs));
  const qcJs = fs.readFileSync(path.join(MP, 'pages/quality-detail/index.js'), 'utf8');
  const qcW = fs.readFileSync(path.join(MP, 'pages/quality-detail/index.wxml'), 'utf8');
  ok('质检待检菲号可搜索', /onBundleSearchInput/.test(qcJs) && /filteredPendingBundles/.test(qcW));
  const cutJs = fs.readFileSync(path.join(MP, 'pages/cutting/bundle-detail/index.js'), 'utf8');
  const cutW = fs.readFileSync(path.join(MP, 'pages/cutting/bundle-detail/index.wxml'), 'utf8');
  ok('裁剪转单菲号可搜索', /onTfBundleSearchInput/.test(cutJs) && /_tfBundlesFiltered/.test(cutW));
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

/**
 * 可搜索选择器「全仓一致性」守护
 *
 * 背景（2026-09-24）：仓里一度出现两套 search-picker 用法 ——
 *   A. D-517 时期：bindtap="openPicker" data-key="X" + 页面自写 openPicker switch
 *   B. 通用式：bindtap="openPicker" data-handler="onXChange" data-names="xOptions"
 * 同一个文件里混用时，B 的行会调到 A 的实现（switch 不到）→ 点了没反应。
 * 现已统一为「一个入口 + 同一套 search-picker UI」，本测试守住这个结论。
 */
function testSearchPickerConvention() {
  console.log('\n【结构：可搜索选择器全仓一致性】');
  const allJs = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) allJs.push(full);
    }
  };
  walk(MP);

  // ① 每个文件 openPicker / onPickerSelect / onPickerClose 各只能有 1 个定义
  let dup = 0;
  for (const f of allJs) {
    if (f.includes('components/search-picker')) continue;
    const s = stripComments(fs.readFileSync(f, 'utf8'));
    for (const nm of ['openPicker', 'onPickerSelect', 'onPickerClose']) {
      const n = (s.match(new RegExp(`\\n\\s*${nm}\\s*[:(]`, 'g')) || []).length;
      if (n > 1) {
        ok(`${path.relative(MP, f)} ${nm} 只有 1 个定义`, false, `实际 ${n} 个`);
        dup++;
      }
    }
  }
  ok('无重复的 openPicker/onPickerSelect/onPickerClose 定义', dup === 0, `${dup} 处重复`);

  // ② 每个 data-handler 都要在对应 js 里真实存在
  let missing = 0;
  const allWxml = [];
  const walkW = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkW(full);
      else if (e.name.endsWith('.wxml')) allWxml.push(full);
    }
  };
  walkW(MP);
  for (const f of allWxml) {
    const s = stripComments(fs.readFileSync(f, 'utf8'));
    if (!s.includes('data-handler=')) continue;
    const js = f.replace(/\.wxml$/, '.js');
    const j = fs.existsSync(js) ? fs.readFileSync(js, 'utf8') : '';
    for (const h of new Set([...s.matchAll(/data-handler="([^"]+)"/g)].map((m) => m[1]))) {
      if (!j.includes(h)) {
        ok(`${path.relative(MP, f)} 的 data-handler=${h} 存在`, false);
        missing++;
      }
    }
  }
  ok('所有 data-handler 都能在对应 js 里找到', missing === 0, `${missing} 处缺失`);

  // ③ 用旧约定（data-key）的文件必须有 _openPickerByKey 兜底，否则点了没反应
  let noFallback = 0;
  for (const f of allWxml) {
    const s = fs.readFileSync(f, 'utf8');
    if (!/bindtap="openPicker"\s+data-key=/.test(s)) continue;
    const js = f.replace(/\.wxml$/, '.js');
    if (!fs.existsSync(js)) continue; // wxml 片段，handler 在父页
    if (!fs.readFileSync(js, 'utf8').includes('_openPickerByKey')) {
      ok(`${path.relative(MP, f)} 有 _openPickerByKey 兜底`, false);
      noFallback++;
    }
  }
  ok('data-key 行都有 _openPickerByKey 兜底', noFallback === 0, `${noFallback} 处缺失`);

  // ④ 不再有新的原生 selector picker（白名单：date-picker 本体 + 死代码页）
  const ALLOW = [
    'components/common/date-picker/index.wxml',   // 年月日选择器本体，换搜索反而更差
    'pages/order/no-data-create/index.wxml',      // 死代码页：onLoad 直接 redirect 走人
  ];
  const offenders = [];
  for (const f of allWxml) {
    const rel = path.relative(MP, f).replace(/\\/g, '/');
    if (ALLOW.includes(rel)) continue;
    const s = stripComments(fs.readFileSync(f, 'utf8'));
    for (const m of s.matchAll(/<picker([^>]*)>/g)) {
      const mode = (m[1].match(/mode\s*=\s*"([^"]+)"/) || [, 'selector'])[1];
      if (mode === 'selector') offenders.push(rel);
    }
  }
  ok('除白名单外不再有原生 selector picker', offenders.length === 0,
    offenders.length ? offenders.join(', ') : '');
}

// ────────────────────────── i18n 接入（D-548） ──────────────────────────
const LANGS = ['zh-CN', 'en-US', 'vi-VN', 'km-KH'];
const CJK_RE = /[\u4e00-\u9fff]/;
/** 长得像 i18n 键的值 —— 出现它说明 t() 没查到（回落成键名） */
const KEYLIKE_RE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/;

/**
 * 装饰性图片占位块：`<view class="...--placeholder"><text ...>衣</text></view>`
 *
 * 图片缺失时灰底方块里的那个汉字（「衣」/「料」）**不是文案，是图形占位** ——
 * 全项目 material-database / material-center / material-inventory/detail /
 * finished-inventory 等 5+ 个页面都这么硬编码，不参与 i18n。
 * 所以 wxml 的中文扫描要先把它摘掉，否则每个页面都会误报。
 *
 * ⚠️ 只放行「class 带 `--placeholder` 的元素里那个短文本」，且调用处有数量护栏，
 * 防止这条规则被误用成「整页中文都能藏进来」。
 */
const DECOR_PLACEHOLDER_RE =
  /<view[^>]*class="[^"]*--placeholder[^"]*"[^>]*>\s*(?:<!--[\s\S]*?-->\s*)?<text[^>]*>[^<]*<\/text>\s*<\/view>/g;

/**
 * 通用的「页面 i18n 接入」检查 —— 每个改造过的页面都套这个
 *
 * 关键断言是「非中文语言下不得出现中日韩字符」：
 * t() 缺键时会回落到 zh-CN，所以这条能**直接抓出「某语言漏了键」**，
 * 比「有值就算过」强得多。
 *
 * @param {string} jsPath 页面 js 相对 miniprogram 的路径
 * @param {string} wxmlPath 页面 wxml 相对 miniprogram 的路径（可为空则跳过结构守护）
 * @param {string} label 报告用的页面名
 */
function testPageI18n(jsPath, wxmlPath, label) {
  console.log(`\n【i18n：${label}】`);

  for (const lang of LANGS) {
    const { page } = loadPage(jsPath, makeApi());
    page.applyLanguage(lang);
    const vals = Object.entries(page.data.t || {});

    ok(`${lang} 文案表非空`, vals.length > 0, `keys=${vals.length}`);

    const empties = vals.filter(([, v]) => !v || !String(v).trim()).map(([k]) => k);
    ok(`${lang} 无空文案`, empties.length === 0, empties.join(','));

    const bare = vals.filter(([, v]) => KEYLIKE_RE.test(String(v))).map(([k, v]) => `${k}=${v}`);
    ok(`${lang} 无裸键名`, bare.length === 0, bare.join(', '));

    if (lang !== 'zh-CN') {
      const cjk = vals.filter(([, v]) => CJK_RE.test(String(v))).map(([k, v]) => `${k}=${v}`);
      ok(`${lang} 无中文残留（缺键回落的信号）`, cjk.length === 0, cjk.join(', '));
    }
  }

  // 占位符必须被替换（tf 传参正确）
  const { page: zhP } = loadPage(jsPath, makeApi());
  zhP.applyLanguage('zh-CN');
  const unresolved = Object.entries(zhP.data.t || {})
    .filter(([, v]) => /\{[a-zA-Z]+\}/.test(String(v)))
    .map(([k, v]) => `${k}=${v}`);
  ok('无未替换的 {占位符}', unresolved.length === 0, unresolved.join(', '));

  // 结构守护：wxml 里不许再留硬编码中文（防回退）
  if (wxmlPath) {
    const raw = stripComments(fs.readFileSync(path.join(MP, wxmlPath), 'utf8'));
    const decor = raw.match(DECOR_PLACEHOLDER_RE) || [];
    const wxml = raw.replace(DECOR_PLACEHOLDER_RE, '');
    // 护栏：装饰占位符只该有 0~2 个，多了说明规则被滥用
    ok(`${label} 装饰性占位字符数量正常`, decor.length <= 3, `stripped=${decor.length}`);
    const leftovers = (wxml.match(/[\u4e00-\u9fff]+/g) || []);
    ok(`${label} wxml 无硬编码中文`, leftovers.length === 0, leftovers.join(' / '));
  }

  // 导航栏标题 —— 通用检查最容易漏的一处
  testNavTitleI18n(jsPath, label);
}

/**
 * 导航栏标题随语言变化的**行为级**断言（单独抽出来给薄壳页复用）
 *
 * 页面 json 的 `navigationBarTitleText` **只能写死**（微信不支持在 json 里写 {{t.x}}），
 * 所以标题要跟着语言变，**唯一**办法是在 applyLanguage 里调 wx.setNavigationBarTitle。
 * 只看「标题有没有真的随语言变」，不看代码长什么样。
 * （D-550 补：此前 location-scan / finished-inventory 两个已「完成」的页面就漏了这处）
 *
 * ⚠️ json 里 `navigationBarTitleText` 为**空串**的页面（如 material/scan 自带大标题）
 *    故意不设标题 —— 那种页面调用方要显式跳过本函数，别在这里放宽判据。
 *
 * @param {string} jsPath 页面 js 相对 miniprogram 的路径
 * @param {string} label 报告用的页面名
 */
function testNavTitleI18n(jsPath, label) {
  const navJson = readSiblingJson(jsPath);
  if (!navJson || !navJson.navigationBarTitleText) return;

  const seen = [];
  for (const lang of LANGS) {
    const { page: np, wx: nwx } = loadPage(jsPath, makeApi());
    np.applyLanguage(lang);
    const call = lastCall(nwx, 'setNavigationBarTitle');
    const title = call && call.title;
    seen.push(`${lang}=${title || '<未设置>'}`);
    if (title && lang !== 'zh-CN' && CJK_RE.test(title)) {
      ok(`${lang} 导航栏标题无中文残留`, false, title);
    }
  }
  ok(`${label} 导航栏标题随语言设置（不能只靠 json 写死）`,
    !seen.some(s => s.includes('<未设置>')), seen.join(' | '));
  const vals = seen.map(s => s.slice(s.indexOf('=') + 1));
  ok(`${label} 导航栏标题确实随语言变化`, new Set(vals).size > 1, seen.join(' | '));
}

/**
 * 通用的「**组件** i18n 接入」检查 —— 与 testPageI18n 同判据，只换加载方式
 *
 * 为什么必须单独一份：组件用 Component({...})，方法在 cfg.methods 里，
 * testPageI18n 的 loadPage 拿不到（会报「未捕获到 Page 配置」）。
 *
 * ⚠️ 组件**没有** json 导航栏标题（标题在宿主页的 json 里），故这里不查标题。
 */
function testComponentI18n(jsPath, wxmlPath, label) {
  console.log(`\n【i18n：${label}（组件）】`);

  for (const lang of LANGS) {
    const { page } = loadComponent(jsPath, makeApi());
    page.applyLanguage(lang);
    const vals = Object.entries(page.data.t || {});

    ok(`${lang} 文案表非空`, vals.length > 0, `keys=${vals.length}`);

    const empties = vals.filter(([, v]) => !v || !String(v).trim()).map(([k]) => k);
    ok(`${lang} 无空文案`, empties.length === 0, empties.join(','));

    const bare = vals.filter(([, v]) => KEYLIKE_RE.test(String(v))).map(([k, v]) => `${k}=${v}`);
    ok(`${lang} 无裸键名`, bare.length === 0, bare.join(', '));

    if (lang !== 'zh-CN') {
      const cjk = vals.filter(([, v]) => CJK_RE.test(String(v))).map(([k, v]) => `${k}=${v}`);
      ok(`${lang} 无中文残留（缺键回落的信号）`, cjk.length === 0, cjk.join(', '));
    }
  }

  // 占位符必须被替换（tf 传参正确）
  const { page: zhP } = loadComponent(jsPath, makeApi());
  zhP.applyLanguage('zh-CN');
  const unresolved = Object.entries(zhP.data.t || {})
    .filter(([, v]) => /\{[a-zA-Z]+\}/.test(String(v)))
    .map(([k, v]) => `${k}=${v}`);
  ok('无未替换的 {占位符}', unresolved.length === 0, unresolved.join(', '));

  if (wxmlPath) {
    const raw = stripComments(fs.readFileSync(path.join(MP, wxmlPath), 'utf8'));
    const decor = raw.match(DECOR_PLACEHOLDER_RE) || [];
    const wxml = raw.replace(DECOR_PLACEHOLDER_RE, '');
    ok(`${label} 装饰性占位字符数量正常`, decor.length <= 3, `stripped=${decor.length}`);
    const leftovers = (wxml.match(/[\u4e00-\u9fff]+/g) || []);
    ok(`${label} wxml 无硬编码中文`, leftovers.length === 0, leftovers.join(' / '));
  }
}

function testI18nLocationScan() {
  testPageI18n('pages/warehouse/location-scan/index.js',
    'pages/warehouse/location-scan/index.wxml', '库位扫码页');

  // 该页专有的交互断言
  const js = 'pages/warehouse/location-scan/index.js';
  const { page: zhPage } = loadPage(js, makeApi());
  zhPage.applyLanguage('zh-CN');
  const { page: enPage } = loadPage(js, makeApi());
  enPage.applyLanguage('en-US');
  ok('zh-CN 的扫码标题是中文', CJK_RE.test(zhPage.data.t.scanTitle), zhPage.data.t.scanTitle);
  ok('en-US 的扫码标题是英文', /scan/i.test(enPage.data.t.scanTitle), enPage.data.t.scanTitle);
  ok('中英标题确实不同', zhPage.data.t.scanTitle !== enPage.data.t.scanTitle);

  const { page: viaStore, wx: wxStore } = loadPage(js, makeApi());
  wxStore.setStorageSync('app.language', 'vi-VN');
  viaStore.applyLanguage();
  ok('按 storage 语言生效（vi-VN）', !CJK_RE.test(viaStore.data.t.scanTitle), viaStore.data.t.scanTitle);

  const { page: countPage, wx: countWx } = loadPage(js, makeApi());
  countPage.data.items = [{}, {}, {}];
  countPage.applyLanguage('zh-CN');
  ok('中文条数文案插值正确', countPage.data.t.itemCount === '3 件', countPage.data.t.itemCount);
  countPage.applyLanguage('en-US');
  ok('英文条数文案插值正确', countPage.data.t.itemCount === '3 pcs', countPage.data.t.itemCount);

  countWx.setStorageSync('app.language', 'en-US');
  countPage.data.items = [{}, {}];
  countPage._refreshItemCount();
  ok('列表变化后条数重算', countPage.data.t.itemCount === '2 pcs', countPage.data.t.itemCount);
  ok('点路径 setData 未污染 data 顶层',
    !Object.prototype.hasOwnProperty.call(countPage.data, 't.itemCount'));

  const { page: sharePage } = loadPage(js, makeApi());
  sharePage.data.locationCode = 'A-01-02';
  const zhShare = sharePage.onShareAppMessage();
  ok('分享标题含库位号', zhShare.title.includes('A-01-02'), zhShare.title);
  ok('分享标题无未替换占位符', !/\{code\}/.test(zhShare.title), zhShare.title);
}

/**
 * 成品库存列表页的接口桩
 *
 * ⚠️ 默认桩返回的是**裸数组**，而本页读 `res.records` → 会拿到空列表，
 * 导致「列表项带参文案」这类断言静默失效。这里给回真实结构。
 * 两条记录故意是**同一个款的两个 SKU**，用来顺带验证按款聚合。
 */
function makeFinishedInventoryApi() {
  const api = makeApi();
  api.warehouse = Object.assign({}, api.warehouse, {
    listFinishedInventory: async () => ({
      records: [
        { id: 'r1', orderNo: 'PO-1', styleNo: 'ST-1', styleName: 'A款', factoryName: '甲厂',
          availableQty: 10, lockedQty: 1, defectQty: 0, totalInboundQty: 20,
          lastInboundDate: '2026-09-20T10:00:00' },
        { id: 'r2', orderNo: 'PO-1', styleNo: 'ST-1', styleName: 'A款', factoryName: '甲厂',
          availableQty: 5, lockedQty: 0, defectQty: 2, totalInboundQty: 8,
          lastInboundDate: '2026-09-21T09:00:00' },
      ],
    }),
  });
  return api;
}

function testI18nFinishedInventoryList() {
  const js = 'pages/warehouse/finished-inventory/index.js';
  testPageI18n(js, 'pages/warehouse/finished-inventory/index.wxml', '成品库存列表页');

  // 筛选器选项的 label 在 data 数组里（不是 wxml 字面量），通用检查覆盖不到 → 单独断言
  const { page: zhP } = loadPage(js, makeFinishedInventoryApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadPage(js, makeFinishedInventoryApi());
  enP.applyLanguage('en-US');
  ok('zh-CN 筛选项是中文', CJK_RE.test(zhP.data.statusOptions[1].label), zhP.data.statusOptions[1].label);
  ok('en-US 筛选项是英文', !CJK_RE.test(enP.data.statusOptions[1].label), enP.data.statusOptions[1].label);
  ok('中英筛选项确实不同', zhP.data.statusOptions[1].label !== enP.data.statusOptions[1].label);

  // 🔴 筛选项的 value 是**后端契约**，绝不能跟着语言变
  eq('statusOptions 的 value 未受翻译影响',
    zhP.data.statusOptions.map(o => o.value), ['', 'available', 'defect']);
  eq('factoryTypeOptions 的 value 未受翻译影响',
    zhP.data.factoryTypeOptions.map(o => o.value), ['', 'OWN', 'EXTERNAL']);

  // onStatusChange 仍要取到正确 value（把常量从 {label} 改成 {labelKey} 最容易在这里踩空）
  const { page: chgP } = loadPage(js, makeFinishedInventoryApi());
  chgP.applyLanguage('en-US');
  chgP.onStatusChange({ detail: { value: 1 } });
  eq('切换筛选后 value 正确', chgP.data.statusValue, 'available');
  chgP.onFactoryTypeChange({ detail: { value: 2 } });
  eq('切换工厂类型后 value 正确', chgP.data.factoryTypeValue, 'EXTERNAL');

  // 搜索框 placeholder 走 sticky-search-bar 的 property
  const { page: phP } = loadPage(js, makeFinishedInventoryApi());
  phP.applyLanguage('en-US');
  ok('搜索占位符已本地化', !CJK_RE.test(phP.data.t.searchPlaceholder), phP.data.t.searchPlaceholder);
}

async function testI18nFinishedInventoryListData() {
  const js = 'pages/warehouse/finished-inventory/index.js';

  // 列表项的带参文案（「最近入库：{date}」逐条不同 → 不能放在 t 里，必须逐项生成）
  const { page: p } = loadPage(js, makeFinishedInventoryApi());
  p.applyLanguage('en-US');
  await p.loadList(true);
  eq('同款两个 SKU 聚合成一张卡片', p.data.list.length, 1);
  const item = p.data.list[0];
  ok('列表项带参文案已生成', /Last inbound: /.test(item._lastInboundText), item._lastInboundText);
  ok('列表项文案无未替换 {date}', !/\{date\}/.test(item._lastInboundText), item._lastInboundText);
  ok('日期取该款最晚的入库时间',
    String(item._lastInboundText).includes('2026-09-21'), item._lastInboundText);

  // 切语言后列表项文案要跟着变（applyLanguage 里会重算 list）
  p.applyLanguage('zh-CN');
  ok('切回中文后列表项文案同步变化',
    CJK_RE.test(p.data.list[0]._lastInboundText), p.data.list[0]._lastInboundText);

  // 空列表时 applyLanguage 不能炸（onShow 会在数据到达前先跑一次）
  const { page: emptyP } = loadPage(js, makeFinishedInventoryApi());
  emptyP.applyLanguage('vi-VN');
  ok('空列表 applyLanguage 不报错', Array.isArray(emptyP.data.list) && emptyP.data.list.length === 0);
}

function testI18nFinishedInventoryDetail() {
  const js = 'pages/warehouse/finished-inventory/detail/index.js';
  testPageI18n(js, 'pages/warehouse/finished-inventory/detail/index.wxml', '成品库存详情页');

  // 导航栏标题要跟着语言走
  const { page: zhP } = loadPage(js, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadPage(js, makeApi());
  enP.applyLanguage('en-US');
  ok('zh-CN 标题是中文', CJK_RE.test(zhP.data.t.availableStock), zhP.data.t.availableStock);
  ok('en-US 标题是英文', !CJK_RE.test(enP.data.t.availableStock), enP.data.t.availableStock);

  // 订单号带参文案
  const { page: orderP } = loadPage(js, makeApi());
  orderP.data.orderNo = 'PO-2026-001';
  orderP.applyLanguage('en-US');
  ok('订单号文案插值正确', orderP.data.t.orderNoText === 'Order: PO-2026-001', orderP.data.t.orderNoText);

  // 条数跟着列表长度重算（点路径 setData）
  const { page: cntP, wx: cntWx } = loadPage(js, makeApi());
  cntWx.setStorageSync('app.language', 'en-US');
  cntP.data.skuList = [{}, {}];
  cntP.data.inboundHistory = [{}];
  cntP._refreshCounts();
  ok('SKU 条数重算', cntP.data.t.skuCountText === '2 items', cntP.data.t.skuCountText);
  ok('入库记录条数重算', cntP.data.t.recordCountText === '1 records', cntP.data.t.recordCountText);
}

/**
 * 成品入库页（D-550）
 *
 * 该页与列表页不同：文案分三处 —— ① `t.*`（wxml 静态文案）② 入库类型 chips 的 label
 * （在模块级常量 `SOURCE_TYPES` 里，wxml 只渲染 `{{typeOptions[i].label}}`）
 * ③ SKU 行的「现有库存 N 件」（逐条不同）。通用检查只能覆盖 ①，②③ 必须单独断言。
 */
function testI18nFinishedInbound() {
  const js = 'pages/warehouse/finished-inbound/index.js';
  testPageI18n(js, 'pages/warehouse/finished-inbound/index.wxml', '成品入库页');

  // ② 入库类型 chips 的 label 在 data 数组里 → 通用检查覆盖不到
  const { page: zhP } = loadPage(js, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadPage(js, makeApi());
  enP.applyLanguage('en-US');
  ok('zh-CN 入库类型是中文', CJK_RE.test(zhP.data.typeOptions[0].label), zhP.data.typeOptions[0].label);
  ok('en-US 入库类型是英文', !CJK_RE.test(enP.data.typeOptions[0].label), enP.data.typeOptions[0].label);
  ok('中英入库类型确实不同', zhP.data.typeOptions[0].label !== enP.data.typeOptions[0].label);

  // 🔴 key 是**后端契约**（FinishedWarehouseOperationOrchestrator.VALID_SOURCE_TYPES），
  //    把常量从 {label} 改成 {labelKey} 时最容易连 key 一起改错 → 单独锁死
  eq('入库类型的 key 未受翻译影响', zhP.data.typeOptions.map(o => o.key),
    ['free_inbound', 'external_purchase', 'transfer_in', 'return_in', 'other_in']);

  // 改成 {labelKey} 后 onSelectType 仍要取到正确 key（这里最容易踩空）
  const { page: selP } = loadPage(js, makeApi());
  selP.applyLanguage('en-US');
  selP.onSelectType({ currentTarget: { dataset: { key: 'transfer_in' } } });
  eq('切换入库类型后 key 正确', selP.data.sourceType, 'transfer_in');
  ok('切换后类型标签是英文', !CJK_RE.test(selP.data.sourceTypeLabel), selP.data.sourceTypeLabel);
  selP.onSelectType({ currentTarget: { dataset: { key: '不存在的类型' } } });
  eq('未知类型不改变当前选择', selP.data.sourceType, 'transfer_in');

  // ⚠️ '默认仓' 是**数据值**不是文案（后端 / DB 的 warehouse_location 默认值）——
  //    翻译了会写进数据库、导致按库位查不到数据，所以任何语言下都必须保持原样
  eq('zh-CN 库位默认值保持数据原值', zhP.data.warehouseLocation, '默认仓');
  eq('en-US 库位默认值也保持数据原值', enP.data.warehouseLocation, '默认仓');

  // 空列表时 applyLanguage 不能炸（onShow 会在数据到达前先跑一次）
  const { page: emptyP } = loadPage(js, makeApi());
  emptyP.applyLanguage('vi-VN');
  ok('空列表 applyLanguage 不报错', Array.isArray(emptyP.data.skuList) && emptyP.data.skuList.length === 0);

  // toast 文案也要跟着语言走（onQuery 里的 t() 没传 lang → 读 storage，必须一起设）
  const { page: toastP, wx: toastWx } = loadPage(js, makeApi());
  toastWx.setStorageSync('app.language', 'en-US');
  toastP.applyLanguage('en-US');
  toastP.onQuery();
  const toast = lastCall(toastWx, 'showToast');
  ok('缺款号提示已本地化', !!toast && !CJK_RE.test(toast.title), toast && toast.title);
}

async function testI18nFinishedInboundData() {
  const js = 'pages/warehouse/finished-inbound/index.js';

  // ③ SKU 行的「现有库存 N 件」逐条不同 → 不能放在 t 里，必须 _decorateSkus 逐项生成
  const { page: p } = loadPage(js, makeApi());
  p.applyLanguage('en-US');
  p.data.styleNo = 'ST-1';
  await p.querySkus();
  eq('查询后拿到 3 个 SKU', p.data.skuList.length, 3);
  const it = p.data.skuList[0];
  ok('SKU 现有库存文案已生成', /10/.test(it.existingStockText), it.existingStockText);
  ok('SKU 文案无未替换 {qty}', !/\{qty\}/.test(it.existingStockText), it.existingStockText);
  ok('SKU 文案是英文', !CJK_RE.test(it.existingStockText), it.existingStockText);

  // 底部提交栏的带参文案（已选 N 项 / 合计 N 件）
  p.onToggleAll();
  eq('全选后已选 3 项', p.data.selectedCount, 3);
  eq('底部已选文案插值正确', p.data.t.selectedItemsText, '3 selected');
  eq('底部合计文案插值正确', p.data.t.totalQtyText, 'Total 3 pcs');
  ok('点路径 setData 未污染 data 顶层',
    !Object.prototype.hasOwnProperty.call(p.data, 't.selectedItemsText'));

  // 切语言后 ① t ② 类型 chips ③ SKU 行文案 三处都要跟着变
  const enSkuText = p.data.skuList[0].existingStockText;
  const enTypeLabel = p.data.typeOptions[0].label;
  p.applyLanguage('zh-CN');
  ok('切回中文后底部文案同步变化', CJK_RE.test(p.data.t.selectedItemsText), p.data.t.selectedItemsText);
  // ⚠️ 必须用「文案确实变了」而不是只看「含中文」—— 见出库页同处的注释
  ok('切回中文后 SKU 行文案同步变化',
    p.data.skuList[0].existingStockText !== enSkuText &&
    CJK_RE.test(p.data.skuList[0].existingStockText),
    `en=${enSkuText} zh=${p.data.skuList[0].existingStockText}`);
  ok('切回中文后类型 chips 同步变化',
    p.data.typeOptions[0].label !== enTypeLabel && CJK_RE.test(p.data.typeOptions[0].label),
    `en=${enTypeLabel} zh=${p.data.typeOptions[0].label}`);

  // 选中数变化后带参文案要**重算**，不能停在上一次的值
  p.onToggleSku({ currentTarget: { dataset: { id: 's2' } } });
  eq('取消一个后已选 2 项', p.data.selectedCount, 2);
  ok('底部文案跟着重算', /2/.test(p.data.t.selectedItemsText), p.data.t.selectedItemsText);
}

/**
 * 成品出库页（D-550）
 *
 * 比入库页多两处：① 顶部「款号/订单/工厂」带参文案 ② needsCustomer 是**后端规则**
 * （FinishedOutstockHelper.REQUIRES_CUSTOMER_TYPES），本地化不能动到它。
 */
function testI18nFinishedOutbound() {
  const js = 'pages/warehouse/finished-outbound/index.js';
  testPageI18n(js, 'pages/warehouse/finished-outbound/index.wxml', '成品出库页');

  const { page: zhP } = loadPage(js, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadPage(js, makeApi());
  enP.applyLanguage('en-US');
  ok('zh-CN 出库类型是中文', CJK_RE.test(zhP.data.typeOptions[0].label), zhP.data.typeOptions[0].label);
  ok('en-US 出库类型是英文', !CJK_RE.test(enP.data.typeOptions[0].label), enP.data.typeOptions[0].label);
  ok('中英出库类型确实不同', zhP.data.typeOptions[0].label !== enP.data.typeOptions[0].label);

  // 🔴 key 是后端契约（FinishedOutstockHelper.VALID_OUTSTOCK_TYPES）
  eq('出库类型的 key 未受翻译影响', zhP.data.typeOptions.map(o => o.key),
    ['shipment', 'transfer_out', 'damage_out', 'sample_out', 'other_out']);

  // needsCustomer 是后端规则，本地化不能动到它；切到不需要客户的类型要清空已选客户
  const { page: selP } = loadPage(js, makeApi());
  selP.applyLanguage('en-US');
  selP.data.customerId = 'c1';
  selP.data.customerName = '客户甲';
  selP.onSelectType({ currentTarget: { dataset: { key: 'transfer_out' } } });
  eq('切换出库类型后 key 正确', selP.data.outstockType, 'transfer_out');
  eq('needsCustomer 跟着类型变', selP.data.needsCustomer, false);
  eq('不需要客户的类型会清空已选客户', selP.data.customerName, '');
  ok('切换后类型标签是英文', !CJK_RE.test(selP.data.outstockTypeLabel), selP.data.outstockTypeLabel);
  selP.onSelectType({ currentTarget: { dataset: { key: 'shipment' } } });
  eq('切回销售出库后又需要客户', selP.data.needsCustomer, true);

  // ① 顶部「款号 / 订单 / 工厂」是带参文案（值来自 URL 参数，不是文案）
  const { page: topP } = loadPage(js, makeApi());
  topP.data.styleNo = 'ST-2026-001';
  topP.data.orderNo = 'PO-1';
  topP.data.factoryName = 'FAC-1';
  topP.applyLanguage('en-US');
  eq('款号文案插值正确', topP.data.t.styleNoText, 'Style ST-2026-001');
  eq('订单号文案插值正确', topP.data.t.orderNoText, 'Order PO-1');
  eq('工厂文案插值正确', topP.data.t.factoryText, 'Factory FAC-1');
  ok('无未替换的 {no}/{name}', !/\{(no|name)\}/.test(
    [topP.data.t.styleNoText, topP.data.t.orderNoText, topP.data.t.factoryText].join('|')));

  // 空列表 applyLanguage 不能炸
  const { page: emptyP } = loadPage(js, makeApi());
  emptyP.applyLanguage('km-KH');
  ok('空列表 applyLanguage 不报错', Array.isArray(emptyP.data.skuList) && emptyP.data.skuList.length === 0);

  // toast 本地化（onSubmit 里的 t() 没传 lang → 读 storage，必须一起设）
  const { page: toastP, wx: toastWx } = loadPage(js, makeApi());
  toastWx.setStorageSync('app.language', 'en-US');
  toastP.applyLanguage('en-US');
  toastP.onSubmit();
  const toast = lastCall(toastWx, 'showToast');
  ok('未选 SKU 提示已本地化', !!toast && !CJK_RE.test(toast.title), toast && toast.title);
}

async function testI18nFinishedOutboundData() {
  const js = 'pages/warehouse/finished-outbound/index.js';

  // SKU 行的「可用 N 件 · 库位」逐条不同 → 必须 _decorateSkus 逐项生成
  // ⚠️ 库位（'A区'）是**业务数据**不是文案，所以这里不能断言「整串无中文」
  const { page: p } = loadPage(js, makeApi());
  p.applyLanguage('en-US');
  p.data.styleNo = 'ST-1';
  await p.loadSkus();
  eq('加载后拿到 3 个 SKU', p.data.skuList.length, 3);
  const it = p.data.skuList[0];
  ok('SKU 可用库存文案已生成', /10/.test(it.availableText), it.availableText);
  ok('SKU 文案带出库位', String(it.availableText).includes('A区'), it.availableText);
  ok('SKU 文案无未替换 {qty}/{loc}', !/\{(qty|loc)\}/.test(it.availableText), it.availableText);
  ok('SKU 文案前缀是英文', String(it.availableText).startsWith('Available'), it.availableText);

  // 底部提交栏带参文案（可用库存 10 / 0 / 5 → 只有 2 个可选）
  p.onToggleAll();
  eq('全选只选中有库存的 2 项', p.data.selectedCount, 2);
  eq('底部已选文案插值正确', p.data.t.selectedItemsText, '2 selected');
  eq('底部合计文案插值正确', p.data.t.totalQtyText, 'Total 2 pcs');
  ok('点路径 setData 未污染 data 顶层',
    !Object.prototype.hasOwnProperty.call(p.data, 't.selectedItemsText'));

  // 切语言后 ① t ② 类型 chips ③ SKU 行文案 三处都要跟着变
  //
  // ⚠️ 这里**不能**只断言「切中文后含中文字符」—— `{loc}` 填的是库位（桩里是 'A区'），
  //    本来就是中文**业务数据**，所以英文文案 `Available 10 pcs · A区` 也含中文 → 假绿。
  //    （变异验证 M4 实测漏检，故改成「文案确实变了」+「不再以英文前缀开头」。）
  const enSkuText = p.data.skuList[0].availableText;
  const enTypeLabel = p.data.typeOptions[0].label;
  p.applyLanguage('zh-CN');
  ok('切回中文后底部文案同步变化', CJK_RE.test(p.data.t.selectedItemsText), p.data.t.selectedItemsText);
  ok('切回中文后 SKU 行文案同步变化',
    p.data.skuList[0].availableText !== enSkuText &&
    !String(p.data.skuList[0].availableText).startsWith('Available'),
    `en=${enSkuText} zh=${p.data.skuList[0].availableText}`);
  ok('切回中文后类型 chips 同步变化',
    p.data.typeOptions[0].label !== enTypeLabel && CJK_RE.test(p.data.typeOptions[0].label),
    `en=${enTypeLabel} zh=${p.data.typeOptions[0].label}`);

  // D-513 一键填满：带两个参数的文案（{count} / {qty}），最容易漏替换
  const { page: fillP, wx: fillWx } = loadPage(js, makeApi());
  fillWx.setStorageSync('app.language', 'en-US');
  fillP.applyLanguage('en-US');
  fillP.data.styleNo = 'ST-1';
  await fillP.loadSkus();
  fillP.onFillAllQty();
  eq('一键填满后已选 2 项', fillP.data.selectedCount, 2);
  eq('一键填满后合计 15 件', fillP.data.selectedQty, 15);
  const fillToast = lastCall(fillWx, 'showToast');
  ok('一键填满提示已本地化', !!fillToast && !CJK_RE.test(fillToast.title), fillToast && fillToast.title);
  ok('一键填满提示两个占位符都已替换',
    !!fillToast && !/\{(count|qty)\}/.test(fillToast.title), fillToast && fillToast.title);
}

/**
 * 物料资料列表页的接口桩（D-551）
 *
 * ⚠️ 默认桩 `makeApi().material.listDatabase` 的 records 是给 search-picker 用的
 * （只有 materialCode / fabricWidth），缺 materialType / color / unitPrice / createTime →
 * 「类型徽标」「颜色：x」「¥x/y」这类断言会**静默失效**（拿到 undefined 也算「通过」）。
 * 这里给回真实结构，并刻意造出三种边界：
 *   m1 正常面料 / m2 辅料·已停用·单位与单价为空 / m3 materialType 为空（回落「未分类」）
 */
function makeMaterialDatabaseApi() {
  const api = makeApi();
  api.material = Object.assign({}, api.material, {
    listDatabase: async () => ({
      records: [
        { id: 'm1', materialCode: 'MC-1', materialName: '棉布', materialType: 'fabric',
          color: '白色', specifications: '150cm', unit: '米', unitPrice: 12.5,
          supplierName: '甲供应商', createTime: '2026-09-20T10:00:00', disabled: false },
        { id: 'm2', materialCode: 'MC-2', materialName: '衬布', materialType: 'accessory',
          color: '黑色', specifications: '90cm', unit: '', unitPrice: null,
          supplierName: '', createTime: '', disabled: true },
        { id: 'm3', materialCode: 'MC-3', materialName: '散料', materialType: '',
          color: '', specifications: '', unit: 'kg', unitPrice: 3,
          supplierName: '', createTime: '2026-09-01T00:00:00', disabled: false },
      ],
      total: 3,
    }),
  });
  return api;
}

/**
 * 物料资料列表页（D-551）
 *
 * 文案分三处：① t.*（wxml 静态）② 筛选器 chips 的 label（在模块级常量里）
 * ③ 列表项带参文案（「颜色：x」「¥x/y」逐条不同）→ _decorateList
 */
function testI18nMaterialDatabase() {
  const js = 'pages/warehouse/material-database/index.js';
  testPageI18n(js, 'pages/warehouse/material-database/index.wxml', '物料资料页');

  const { page: zhP } = loadPage(js, makeMaterialDatabaseApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadPage(js, makeMaterialDatabaseApi());
  enP.applyLanguage('en-US');

  // ② 筛选器 chips 的 label 在 data 数组里 → 通用检查覆盖不到
  ok('zh-CN 物料类型筛选项是中文', CJK_RE.test(zhP.data.typeOptions[1].label), zhP.data.typeOptions[1].label);
  ok('en-US 物料类型筛选项是英文', !CJK_RE.test(enP.data.typeOptions[1].label), enP.data.typeOptions[1].label);
  ok('中英物料类型筛选项确实不同', zhP.data.typeOptions[1].label !== enP.data.typeOptions[1].label);

  // 🔴 value 是**后端契约**（后端库里存 fabric/lining/accessory 英文），绝不能跟着语言变
  eq('typeOptions 的 value 未受翻译影响',
    zhP.data.typeOptions.map(o => o.value), ['', 'fabric', 'lining', 'accessory']);
  eq('statusOptions 的 value 未受翻译影响',
    zhP.data.statusOptions.map(o => o.value), ['', 'enabled', 'disabled']);

  // 把常量从 {label} 改成 {labelKey} 最容易在 onTypeChange / onStatusChange 里踩空
  const { page: chgP } = loadPage(js, makeMaterialDatabaseApi());
  chgP.applyLanguage('en-US');
  chgP.onTypeChange({ detail: { value: 1 } });
  eq('切换物料类型后 value 正确', chgP.data.typeValue, 'fabric');
  chgP.onStatusChange({ detail: { value: 2 } });
  eq('切换状态后 value 正确', chgP.data.statusValue, 'disabled');

  // 搜索框 placeholder 走 sticky-search-bar 的 property
  ok('搜索占位符已本地化', !CJK_RE.test(enP.data.t.searchPlaceholder), enP.data.t.searchPlaceholder);

  // 空列表时 applyLanguage 不能炸（onShow 会在数据到达前先跑一次）
  const { page: emptyP } = loadPage(js, makeMaterialDatabaseApi());
  emptyP.applyLanguage('vi-VN');
  ok('空列表 applyLanguage 不报错', Array.isArray(emptyP.data.list) && emptyP.data.list.length === 0);
}

async function testI18nMaterialDatabaseData() {
  const js = 'pages/warehouse/material-database/index.js';

  const { page: p } = loadPage(js, makeMaterialDatabaseApi());
  p.applyLanguage('en-US');
  await p.loadList(true);
  eq('加载后拿到 3 条物料', p.data.list.length, 3);

  // ③ 类型徽标（来自 materialType，后端存英文 code）
  eq('类型徽标已本地化（fabric）', p.data.list[0]._typeLabel, 'Fabric');
  eq('类型徽标已本地化（accessory）', p.data.list[1]._typeLabel, 'Accessory');
  // materialType 为空时才回落「未分类」
  eq('类型为空时回落未分类', p.data.list[2]._typeLabel, 'Uncategorized');

  const it0 = p.data.list[0];
  ok('颜色文案前缀已本地化', String(it0._colorText).startsWith('Color: '), it0._colorText);
  ok('规格文案前缀已本地化', String(it0._specText).startsWith('Spec: '), it0._specText);
  ok('供应商文案前缀已本地化', String(it0._supplierText).startsWith('Supplier: '), it0._supplierText);
  ok('创建时间文案前缀已本地化', String(it0._createTimeText).startsWith('Created: '), it0._createTimeText);
  ok('单价文案带出价格', String(it0._priceText).includes('12.5'), it0._priceText);
  ok('带参文案无未替换占位符', !/\{(value|price|unit|total)\}/.test(
    [it0._colorText, it0._specText, it0._supplierText, it0._createTimeText, it0._priceText].join('|')));

  // 单位为空时回落本地化的默认单位（en=pcs / zh=个）
  ok('单位为空时回落本地化默认单位', String(p.data.list[1]._priceText).includes('pcs'), p.data.list[1]._priceText);

  // 总条数文案（点路径 setData）
  eq('总条数文案插值正确', p.data.t.totalText, '3 materials');
  ok('点路径 setData 未污染 data 顶层',
    !Object.prototype.hasOwnProperty.call(p.data, 't.totalText'));

  // 切语言后 ① t ② 筛选器 ③ 类型徽标 ④ 带参文案 都要跟着变
  const enBadge = p.data.list[0]._typeLabel;
  const enPrice = p.data.list[1]._priceText;
  p.applyLanguage('zh-CN');
  ok('切回中文后类型徽标同步变化',
    p.data.list[0]._typeLabel !== enBadge && CJK_RE.test(p.data.list[0]._typeLabel),
    `en=${enBadge} zh=${p.data.list[0]._typeLabel}`);
  ok('切回中文后带参文案同步变化',
    p.data.list[1]._priceText !== enPrice && CJK_RE.test(p.data.list[1]._priceText),
    `en=${enPrice} zh=${p.data.list[1]._priceText}`);
  eq('切回中文后总条数文案同步变化', p.data.t.totalText, '共 3 条物料');
  ok('切回中文后筛选项同步变化', CJK_RE.test(p.data.typeOptions[1].label), p.data.typeOptions[1].label);

  // 详情弹窗：selectedItem 原先与 list 元素同一引用，重建 list 后必须按 id 重新指过去，
  // 否则弹窗会停在上一个语言的文案上
  const { page: selP } = loadPage(js, makeMaterialDatabaseApi());
  selP.applyLanguage('en-US');
  await selP.loadList(true);
  selP.onItemTap({ currentTarget: { dataset: { id: 'm1' } } });
  ok('点开后详情弹窗可见', selP.data.detailVisible === true);
  eq('详情用的是当前语言', selP.data.selectedItem._createTimeText, 'Created: 2026-09-20');
  selP.applyLanguage('zh-CN');
  ok('切语言后详情文案跟着变',
    !!selP.data.selectedItem &&
    selP.data.selectedItem._createTimeText !== 'Created: 2026-09-20' &&
    CJK_RE.test(selP.data.selectedItem._createTimeText),
    selP.data.selectedItem && selP.data.selectedItem._createTimeText);
}

/** 料卷扫码页的接口桩（D-551）：默认桩没有 materialRoll */
function makeMaterialScanApi() {
  const api = makeApi();
  api.materialRoll = {
    scan: async (rollCode, action) => ({
      materialName: '棉布',
      materialCode: 'MC-1',
      quantity: 20,
      unit: '米',
      warehouseLocation: 'A区',
      inboundNo: 'IN-001',
      currentStatus: action === 'issue' ? 'ISSUED' : 'IN_STOCK',
    }),
  };
  return api;
}

/**
 * 料卷扫码发料/退回页（D-551）
 *
 * ⚠️ 本页 json 的 navigationBarTitleText 是**空字符串**（页面自带大标题
 * 「面辅料料卷发料/退回」）→ testPageI18n 的导航栏断言会自动跳过。
 * 这是**有意为之**，不是漏了；下面用一条断言把这个决定锁住。
 */
function testI18nMaterialScan() {
  const js = 'pages/warehouse/material/scan/index.js';
  testPageI18n(js, 'pages/warehouse/material/scan/index.wxml', '料卷扫码页');

  const { page: zhP } = loadPage(js, makeMaterialScanApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadPage(js, makeMaterialScanApi());
  enP.applyLanguage('en-US');
  ok('zh-CN 页头标题是中文', CJK_RE.test(zhP.data.t.headerTitle), zhP.data.t.headerTitle);
  ok('en-US 页头标题是英文', !CJK_RE.test(enP.data.t.headerTitle), enP.data.t.headerTitle);
  ok('中英页头标题确实不同', zhP.data.t.headerTitle !== enP.data.t.headerTitle);

  // 状态标签：库里存英文 code（IN_STOCK / ISSUED），前端映射
  eq('在库状态已本地化', enP.data.t.statusInStock, 'In Stock');
  eq('已发料状态已本地化', enP.data.t.statusIssued, 'Issued');

  // 🔴 锁住「本页不设导航栏标题」这个决定（json 里是空串）
  const navJson = readSiblingJson(js);
  eq('导航栏标题仍为空串（页面自带大标题）', navJson && navJson.navigationBarTitleText, '');

  // toast 本地化（t() 没传 lang 时读 storage，所以两处都要设）
  //
  // ⚠️ 必须先给 rollCode：onIssueTap 的第一道守卫是 `if (submitting || !rollCode) return;`
  //    —— 连码都没扫时**直接返回、不弹任何提示**，只给 rollCode 不给 rollInfo
  //    才会走到「请先扫码」那一条。
  const { page: tP, wx: tWx } = loadPage(js, makeMaterialScanApi());
  tWx.setStorageSync('app.language', 'en-US');
  tP.applyLanguage('en-US');
  tP.data.rollCode = 'MR1';
  tP.onIssueTap();
  const toast = lastCall(tWx, 'showToast');
  ok('未扫码提示已本地化', !!toast && !CJK_RE.test(toast.title), toast && toast.title);
}

async function testI18nMaterialScanActions() {
  const js = 'pages/warehouse/material/scan/index.js';
  const { page: p, wx } = loadPage(js, makeMaterialScanApi());
  wx.setStorageSync('app.language', 'en-US');
  p.applyLanguage('en-US');

  p.data.rollCode = 'MR1234567890123';
  await p.queryRoll('MR1234567890123');
  ok('查到料卷信息', !!p.data.rollInfo && p.data.rollInfo.currentStatus === 'IN_STOCK',
    JSON.stringify(p.data.rollInfo));

  // 发料确认弹窗（带 4 个参数的文案，最容易漏替换）
  p.onIssueTap();
  const modal = lastCall(wx, 'showModal');
  ok('发料确认弹窗已弹出', !!modal);
  ok('发料弹窗标题已本地化', !!modal && !CJK_RE.test(modal.title), modal && modal.title);
  ok('发料弹窗正文已本地化', !!modal && String(modal.content).startsWith('Issue'), modal && modal.content);
  ok('发料弹窗无未替换占位符', !!modal && !/\{(name|qty|unit|loc)\}/.test(modal.content), modal && modal.content);
  ok('发料弹窗带出数量与单位',
    !!modal && String(modal.content).includes('20') && String(modal.content).includes('米'), modal && modal.content);

  // 等 issue 的异步回调落地（桩里的 showModal 会自动 confirm）
  await new Promise(r => setTimeout(r, 0));
  eq('发料后本地状态改为已发料', p.data.rollInfo.currentStatus, 'ISSUED');
  ok('发料成功提示已本地化', !!p.data.successMsg && !CJK_RE.test(p.data.successMsg), p.data.successMsg);

  // 退回确认弹窗
  p.onReturnTap();
  const ret = lastCall(wx, 'showModal');
  ok('退回弹窗标题已本地化', !!ret && !CJK_RE.test(ret.title), ret && ret.title);
  ok('退回弹窗正文已本地化', !!ret && String(ret.content).startsWith('Return'), ret && ret.content);
  ok('退回弹窗无未替换占位符', !!ret && !/\{(name|loc)\}/.test(ret.content), ret && ret.content);

  // 状态不匹配时的拦截提示
  const { page: badP, wx: badWx } = loadPage(js, makeMaterialScanApi());
  badWx.setStorageSync('app.language', 'en-US');
  badP.applyLanguage('en-US');
  badP.data.rollCode = 'MR1';
  badP.data.rollInfo = { currentStatus: 'ISSUED' };
  badP.onIssueTap();
  const badToast = lastCall(badWx, 'showToast');
  ok('不在库时发料被拦截且提示已本地化',
    !!badToast && !CJK_RE.test(badToast.title), badToast && badToast.title);
}

// ────────────────────────── 物料中心簇 i18n（D-552） ──────────────────────────
/**
 * 物料中心列表接口桩
 *
 * ⚠️ 默认桩 makeApi().material 里**没有** listStock / getTransactions ——
 * 缺了会让 `records` 变成 undefined，断言拿到 undefined 也算「通过」→ 假绿。
 * 这里给回真实结构，并刻意造出边界：
 *   r1 正常面料（锁定>0、安全库存>0、有库位）/ r2 零库存+低库存 / r3 类型为空
 */
function makeMaterialCenterApi() {
  const api = makeApi();
  api.material = Object.assign({}, api.material, {
    listStock: async () => ({
      records: [
        { id: 'r1', materialCode: 'MC-1', materialName: '棉布', materialType: 'fabric',
          unit: '米', quantity: 20, lockedQuantity: 3, safetyStock: 5, location: 'A区' },
        { id: 'r2', materialCode: 'MC-2', materialName: '衬布', materialType: 'accessory',
          unit: '', quantity: 0, lockedQuantity: 0, safetyStock: 2, location: 'B区' },
        { id: 'r3', materialCode: 'MC-3', materialName: '散料', materialType: '',
          unit: 'kg', quantity: 7, lockedQuantity: 0, safetyStock: 0, location: 'C区' },
      ],
      total: 3,
    }),
  });
  return api;
}

/**
 * 物料中心（D-552）
 *
 * 文案分四处：① t.*（wxml 静态）② 5 个 tab 的 label（模块级常量 TABS）
 * ③ 类型筛选器 label（模块级常量 TYPE_OPTIONS）④ 列表项带参文案（「锁定 N」「安全 N」「库位 X」）
 */
function testI18nMaterialCenter() {
  const js = 'pages/warehouse/material-center/index.js';
  testPageI18n(js, 'pages/warehouse/material-center/index.wxml', '物料中心');

  const { page: zhP } = loadPage(js, makeMaterialCenterApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadPage(js, makeMaterialCenterApi());
  enP.applyLanguage('en-US');

  // ② tab 的 label 在 data 数组里 → 通用检查覆盖不到
  ok('zh-CN 库存 tab 是中文', CJK_RE.test(zhP.data.tabs[0].label), zhP.data.tabs[0].label);
  ok('en-US 库存 tab 是英文', !CJK_RE.test(enP.data.tabs[0].label), enP.data.tabs[0].label);
  ok('中英 tab label 确实不同', zhP.data.tabs[0].label !== enP.data.tabs[0].label);

  // 🔴 key 是页面内部/深链契约（?tab=xxx），绝不能跟着语言变
  eq('tabs 的 key 未受翻译影响',
    zhP.data.tabs.map(o => o.key), ['inventory', 'inbound', 'outbound', 'picking', 'scan']);
  eq('typeOptions 的 value 未受翻译影响',
    zhP.data.typeOptions.map(o => o.value), ['', 'fabric', 'lining', 'accessory']);

  // ③ 类型筛选器（把常量从 {label} 改成 {labelKey} 最容易在 onTypeChange 里踩空）
  const { page: chgP } = loadPage(js, makeMaterialCenterApi());
  chgP.applyLanguage('en-US');
  chgP.onTypeChange({ detail: { value: 2 } });
  eq('切换类型后 value 正确', chgP.data.typeValue, 'lining');

  // tab 切换的 key 是后端/深链契约，不能被翻译带偏
  const { page: tabP } = loadPage(js, makeMaterialCenterApi());
  tabP.applyLanguage('en-US');
  tabP.onTabTap({ currentTarget: { dataset: { key: 'picking' } } });
  eq('切 tab 后 activeTab 仍是英文 key', tabP.data.activeTab, 'picking');

  // 深链 ?tab=xxx 用 TABS 做白名单，改成 labelKey 后不能失配
  const { page: deepP } = loadPage(js, makeMaterialCenterApi());
  deepP.onLoad({ tab: 'inbound' });
  eq('深链 ?tab=inbound 生效', deepP.data.activeTab, 'inbound');

  // 搜索框 placeholder 走 sticky-search-bar 的 property
  ok('搜索占位符已本地化', !CJK_RE.test(enP.data.t.searchPlaceholder), enP.data.t.searchPlaceholder);

  // 空列表时 applyLanguage 不能炸（onShow 会在数据到达前先跑一次）
  const { page: emptyP } = loadPage(js, makeMaterialCenterApi());
  emptyP.applyLanguage('vi-VN');
  ok('空列表 applyLanguage 不报错', Array.isArray(emptyP.data.inventoryList) && emptyP.data.inventoryList.length === 0);
}

async function testI18nMaterialCenterData() {
  const js = 'pages/warehouse/material-center/index.js';

  const { page: p } = loadPage(js, makeMaterialCenterApi());
  p.applyLanguage('en-US');
  await p.loadInventory(true);
  eq('加载后拿到 3 条库存', p.data.inventoryList.length, 3);

  // ④ 列表项带参文案（逐条不同）→ _decorateList 生成
  const it0 = p.data.inventoryList[0];
  ok('锁定文案前缀已本地化', String(it0._lockedText).startsWith('Locked '), it0._lockedText);
  ok('安全文案前缀已本地化', String(it0._safetyText).startsWith('Safety '), it0._safetyText);
  ok('库位文案前缀已本地化', String(it0._locationText).startsWith('Location '), it0._locationText);
  ok('带参文案带出真实数值',
    String(it0._lockedText).includes('3') && String(it0._safetyText).includes('5')
    && String(it0._locationText).includes('A区'), [it0._lockedText, it0._safetyText, it0._locationText].join('|'));
  ok('带参文案无未替换占位符',
    !/\{(qty|loc)\}/.test([it0._lockedText, it0._safetyText, it0._locationText].join('|')));

  // 类型标签由 materialType（后端英文码）派生
  eq('类型标签已本地化（fabric）', it0.typeLabel, 'Fabric');
  eq('类型标签已本地化（accessory）', p.data.inventoryList[1].typeLabel, 'Accessory');
  eq('类型为空时回落原值', p.data.inventoryList[2].typeLabel, '-');

  // 总条数文案（点路径 setData）
  ok('总条数文案插值正确', String(p.data.t.totalText).includes('3'), p.data.t.totalText);
  ok('点路径 setData 未污染 data 顶层',
    !Object.prototype.hasOwnProperty.call(p.data, 't.totalText'));

  // 切语言后 ①②③④ 都要跟着变（用「确实变了 + 不再以旧语言前缀开头」而不是「含中文」——
  // 库位 A区 是**业务数据**，任何语言下都含中文，用「含中文」会恒真 → 假绿）
  const enLocked = it0._lockedText;
  const enType = it0.typeLabel;
  const enTab = p.data.tabs[0].label;
  const enTotal = p.data.t.totalText;
  p.applyLanguage('zh-CN');
  ok('切回中文后带参文案同步变化',
    p.data.inventoryList[0]._lockedText !== enLocked
    && !String(p.data.inventoryList[0]._lockedText).startsWith('Locked'),
    `en=${enLocked} zh=${p.data.inventoryList[0]._lockedText}`);
  ok('切回中文后类型标签同步变化',
    p.data.inventoryList[0].typeLabel !== enType && CJK_RE.test(p.data.inventoryList[0].typeLabel),
    `en=${enType} zh=${p.data.inventoryList[0].typeLabel}`);
  ok('切回中文后 tab label 同步变化',
    p.data.tabs[0].label !== enTab && CJK_RE.test(p.data.tabs[0].label),
    `en=${enTab} zh=${p.data.tabs[0].label}`);
  ok('切回中文后总条数文案同步变化',
    p.data.t.totalText !== enTotal && CJK_RE.test(p.data.t.totalText),
    `en=${enTotal} zh=${p.data.t.totalText}`);

  // 翻页时不能把已渲染的带参文案丢掉
  const { page: moreP } = loadPage(js, makeMaterialCenterApi());
  moreP.applyLanguage('en-US');
  await moreP.loadInventory(true);
  const first = moreP.data.inventoryList[0]._lockedText;
  await moreP.loadInventory(false);
  ok('翻页后已有行仍保留带参文案',
    moreP.data.inventoryList[0]._lockedText === first && moreP.data.inventoryList.length === 3,
    `${first} → ${moreP.data.inventoryList[0]._lockedText}`);
}

/** 物料库存详情接口桩：scanQuery 快照 + getTransactions 流水 */
function makeMaterialDetailApi() {
  const api = makeApi();
  api.material = Object.assign({}, api.material, {
    scanQuery: async (code) => ({
      found: true, materialCode: code, materialName: '棉布', materialType: 'fabric',
      color: '白色', size: '150cm', location: 'A区', unit: '米',
      quantity: 20, lockedQuantity: 3, unitPrice: 12.5,
    }),
    getTransactions: async () => ([
      // ⚠️ 后端 typeLabel 是**写死的中文**（MaterialStockController），type 才是英文码。
      //    前端必须按 type 自行派生，不能直接用后端 typeLabel（否则永远中文）。
      { type: 'IN', typeLabel: '入库', quantity: 20, operationTime: '2026-09-20 10:00',
        operatorName: '张三', warehouseLocation: 'A区', remark: '首入库' },
      { type: 'OUT', typeLabel: '出库', quantity: 5, operationTime: '2026-09-21 11:00',
        operatorName: '李四', warehouseLocation: 'B区', remark: '' },
    ]),
  });
  return api;
}

/**
 * 物料库存详情（D-552）
 *
 * 🔴 本页最隐蔽的一处：`item.typeLabel` 是**后端返回的中文**，前端要用 item.type
 *    （IN/OUT 英文码）自己派生 —— 只看「有没有值」会漏掉这个 bug。
 */
function testI18nMaterialInventoryDetail() {
  const js = 'pages/warehouse/material-inventory/detail/index.js';
  testPageI18n(js, 'pages/warehouse/material-inventory/detail/index.wxml', '物料详情');

  const { page: p } = loadPage(js, makeMaterialDetailApi());
  p.onLoad({ materialCode: 'MC-1', materialType: 'fabric', unit: '米' });
  p.applyLanguage('en-US');
  eq('类型标签已本地化', p.data.typeLabel, 'Fabric');
  ok('类型标签不是中文', !CJK_RE.test(p.data.typeLabel), p.data.typeLabel);
}

async function testI18nMaterialInventoryDetailData() {
  const js = 'pages/warehouse/material-inventory/detail/index.js';

  const { page: p } = loadPage(js, makeMaterialDetailApi());
  p.applyLanguage('en-US');
  await p.loadTransactions();
  eq('加载后拿到 2 条流水', p.data.transactions.length, 2);

  // 🔴 核心：按 type 英文码派生，而不是沿用后端写死的中文 typeLabel
  eq('入库流水标签已本地化', p.data.transactions[0]._typeLabel, 'Inbound');
  eq('出库流水标签已本地化', p.data.transactions[1]._typeLabel, 'Outbound');

  const tx0 = p.data.transactions[0];
  ok('操作人文案前缀已本地化', String(tx0._operatorText).startsWith('Operator: '), tx0._operatorText);
  ok('库位文案前缀已本地化', String(tx0._locationText).startsWith('· Location: '), tx0._locationText);
  ok('带参文案带出真实值',
    String(tx0._operatorText).includes('张三') && String(tx0._locationText).includes('A区'),
    [tx0._operatorText, tx0._locationText].join('|'));
  ok('带参文案无未替换占位符', !/\{(name|loc)\}/.test([tx0._operatorText, tx0._locationText].join('|')));

  // 流水条数文案
  ok('流水条数文案插值正确', String(p.data.t.txCount).includes('2'), p.data.t.txCount);
  ok('点路径 setData 未污染 data 顶层',
    !Object.prototype.hasOwnProperty.call(p.data, 't.txCount'));

  // 切语言后流水文案与条数文案都要跟着变（业务数据 A区 恒含中文 → 用变化检测）
  const enOp = tx0._operatorText;
  const enType = tx0._typeLabel;
  const enCount = p.data.t.txCount;
  p.applyLanguage('zh-CN');
  ok('切回中文后流水标签同步变化',
    p.data.transactions[0]._typeLabel !== enType && CJK_RE.test(p.data.transactions[0]._typeLabel),
    `en=${enType} zh=${p.data.transactions[0]._typeLabel}`);
  ok('切回中文后操作人文案同步变化',
    p.data.transactions[0]._operatorText !== enOp
    && !String(p.data.transactions[0]._operatorText).startsWith('Operator'),
    `en=${enOp} zh=${p.data.transactions[0]._operatorText}`);
  ok('切回中文后流水条数文案同步变化',
    p.data.t.txCount !== enCount && CJK_RE.test(p.data.t.txCount),
    `en=${enCount} zh=${p.data.t.txCount}`);
}

/**
 * 物料入库表单组件（D-552）
 *
 * 🔴 「入库来源」的 key 是**后端白名单契约**（VALID_SOURCE_TYPES），
 *    传错直接抛「不支持的入库来源类型」→ 必须断言 key 没被翻译带偏。
 */
function testI18nMaterialInboundForm() {
  const js = 'components/material-inbound-form/index.js';
  testComponentI18n(js, 'components/material-inbound-form/index.wxml', '物料入库表单');

  const { page: zhP } = loadComponent(js, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadComponent(js, makeApi());
  enP.applyLanguage('en-US');

  ok('zh-CN 入库来源是中文', CJK_RE.test(zhP.data.sourceTypes[0].label), zhP.data.sourceTypes[0].label);
  ok('en-US 入库来源是英文', !CJK_RE.test(enP.data.sourceTypes[0].label), enP.data.sourceTypes[0].label);
  eq('入库来源的 key 未受翻译影响',
    zhP.data.sourceTypes.map(o => o.key),
    ['free_inbound', 'external_purchase', 'transfer_in', 'return_in', 'other_in']);

  // 选中来源后 label 要跟着语言（不是把 key 当 label）
  const { page: selP } = loadComponent(js, makeApi());
  selP.applyLanguage('en-US');
  selP.onSelectSourceType({ currentTarget: { dataset: { key: 'transfer_in' } } });
  eq('选中来源后 sourceType 正确', selP.data.sourceType, 'transfer_in');
  ok('选中来源后 label 已本地化', !CJK_RE.test(selP.data.sourceTypeLabel), selP.data.sourceTypeLabel);
  // 切语言后已选来源的 label 要重算（applyLanguage 里按 sourceType 反查）
  const enSel = selP.data.sourceTypeLabel;
  selP.applyLanguage('zh-CN');
  ok('切回中文后已选来源 label 同步变化',
    selP.data.sourceTypeLabel !== enSel && CJK_RE.test(selP.data.sourceTypeLabel),
    `en=${enSel} zh=${selP.data.sourceTypeLabel}`);

  // 类型标签由后端英文码派生
  //
  // ⚠️ 顺序要紧：attached() 内部会**按 storage 里的语言**再刷一次文案，
  //    先 applyLanguage('en-US') 再 attached() 会被打回 zh-CN（storage 为空 → 默认中文）。
  const { page: qP } = loadComponent(js, makeApi());
  qP.attached();
  qP.applyLanguage('en-US');
  qP.setData({ materialCode: 'MC-1' });
  qP.queryMaterial();
  return new Promise((resolve) => setTimeout(() => {
    eq('入库表单类型标签已本地化', qP.data.typeLabel, 'Fabric');
    ok('带参文案已随查询结果刷新',
      String(qP.data.t.existingStockText).includes('20'), qP.data.t.existingStockText);
    ok('带参文案无未替换占位符', !/\{(code|value|qty|unit|label)\}/.test(
      [qP.data.t.codeText, qP.data.t.typeText, qP.data.t.colorText,
        qP.data.t.fabricWidthText, qP.data.t.specText, qP.data.t.existingStockText].join('|')));
    resolve();
  }, 30));
}

/** 物料出库表单组件（D-552） */
function testI18nMaterialOutboundForm() {
  const js = 'components/material-outbound-form/index.js';
  testComponentI18n(js, 'components/material-outbound-form/index.wxml', '物料出库表单');

  const { page: zhP } = loadComponent(js, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadComponent(js, makeApi());
  enP.applyLanguage('en-US');

  // 🔴 key 是**后端存储约定值**（MaterialInboundOrchestrator.resolveUsageType → BULK/SAMPLE/STOCK）
  eq('用料场景的 key 未受翻译影响',
    zhP.data.typeOptions.map(o => o.key), ['BULK', 'SAMPLE', 'STOCK']);
  ok('zh-CN 用料场景是中文', CJK_RE.test(zhP.data.typeOptions[0].label), zhP.data.typeOptions[0].label);
  ok('en-US 用料场景是英文', !CJK_RE.test(enP.data.typeOptions[0].label), enP.data.typeOptions[0].label);

  const { page: selP } = loadComponent(js, makeApi());
  selP.applyLanguage('en-US');
  selP.onSelectUsage({ currentTarget: { dataset: { key: 'STOCK' } } });
  eq('选中用料场景后 usageType 正确', selP.data.usageType, 'STOCK');
  ok('选中用料场景后 label 已本地化', !CJK_RE.test(selP.data.usageTypeLabel), selP.data.usageTypeLabel);

  // 校验提示必须走 i18n（7 个必填逐项拦截）
  const { page: badP, wx: badWx } = loadComponent(js, makeApi());
  badP.applyLanguage('en-US');
  badP.data.stockId = '';
  badP.onSubmit();
  const toast = lastCall(badWx, 'showToast');
  ok('未查物料时提交被拦截且提示已本地化', !!toast && !CJK_RE.test(toast.title), toast && toast.title);
}

/**
 * 领料出库列表组件（D-552）
 *
 * 🔴 状态 key（pending/completed/cancelled）与用途 key（BULK/SAMPLE/STOCK）都是后端契约。
 */
function testI18nMaterialPickingList() {
  const js = 'components/material-picking-list/index.js';
  testComponentI18n(js, 'components/material-picking-list/index.wxml', '领料出库列表');

  const { page: zhP } = loadComponent(js, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP } = loadComponent(js, makeApi());
  enP.applyLanguage('en-US');

  eq('状态页签的 key 未受翻译影响',
    zhP.data.statusTabs.map(o => o.key), ['', 'pending', 'completed', 'cancelled']);
  ok('zh-CN 状态页签是中文', CJK_RE.test(zhP.data.statusTabs[1].label), zhP.data.statusTabs[1].label);
  ok('en-US 状态页签是英文', !CJK_RE.test(enP.data.statusTabs[1].label), enP.data.statusTabs[1].label);

  // _toRow 里状态/用途/领取方式三张映射表都要跟着语言
  const row = enP._toRow({
    id: 'k1', pickingNo: 'PK-1', orderNo: 'PO-1', styleNo: 'ST-1', pickerName: '张三',
    factoryName: '本厂', usageType: 'BULK', pickupType: 'DELIVERY', status: 'pending',
    createTime: '2026-09-20 10:00',
    items: [{ materialCode: 'MC-1', materialName: '棉布', quantity: 2, unit: '米', warehouseLocation: 'A区' }],
  }, 'en-US');
  eq('行状态标签已本地化', row.statusLabel, 'Pending Outbound');
  eq('行用途标签已本地化', row.usageLabel, 'Production Picking');
  eq('行领取方式已本地化', row.pickupLabel, 'Delivery');
  ok('行状态颜色/底色未受翻译影响',
    row.statusColor === '#f59e0b' && row.statusBg === '#fffbeb', JSON.stringify(row));

  // 未知枚举值要原样回落，不能变空
  const unk = enP._toRow({ id: 'k2', status: 'weird', usageType: 'weird', pickupType: 'weird' }, 'en-US');
  eq('未知状态原样回落', unk.statusLabel, 'weird');
  eq('未知用途原样回落', unk.usageLabel, 'weird');
  eq('未知领取方式原样回落', unk.pickupLabel, 'weird');

  // 列表项的带参文案（物料明细（N 项）/ 库位：X）
  const { page: decP } = loadComponent(js, makeApi());
  decP.applyLanguage('en-US');
  decP.setData({ list: [row], total: 1 });
  decP.applyLanguage('en-US');
  const it = decP.data.list[0];
  ok('明细标题已本地化', String(it._detailTitle).includes('1'), it._detailTitle);
  ok('明细标题无未替换占位符', !/\{count\}/.test(String(it._detailTitle)), it._detailTitle);
  ok('明细库位文案已本地化', String(it.items[0]._locationText).startsWith('Location: '), it.items[0]._locationText);
  ok('统计文案已本地化', String(decP.data.t.totalText).includes('1'), decP.data.t.totalText);
}

/**
 * 三个薄壳页（material-inbound / outbound / picking，D-552）
 *
 * 这三页**没有自己的文案**（表单/列表都在通用组件里），只有 json 写死的导航栏标题。
 * 所以不能套 testPageI18n（它要求 data.t 非空），只查标题。
 */
function testI18nShellPages() {
  console.log('\n【i18n：物料薄壳页导航栏标题】');
  testNavTitleI18n('pages/warehouse/material-inbound/index.js', '物料入库页');
  testNavTitleI18n('pages/warehouse/material-outbound/index.js', '物料出库页');
  testNavTitleI18n('pages/warehouse/material-picking/index.js', '领料出库页');

  // 薄壳页的标题必须与组件/列表的文案来自**同一个键**，否则同一功能两种说法
  const { page: ib, wx: ibWx } = loadPage('pages/warehouse/material-inbound/index.js', makeApi());
  ib.applyLanguage('en-US');
  eq('物料入库页标题取自 mp.warehouse.materialInbound.title',
    lastCall(ibWx, 'setNavigationBarTitle').title, 'Material Inbound');

  const { page: ob, wx: obWx } = loadPage('pages/warehouse/material-outbound/index.js', makeApi());
  ob.applyLanguage('en-US');
  eq('物料出库页标题取自 mp.warehouse.materialOutbound.title',
    lastCall(obWx, 'setNavigationBarTitle').title, 'Material Outbound');

  const { page: pk, wx: pkWx } = loadPage('pages/warehouse/material-picking/index.js', makeApi());
  pk.applyLanguage('en-US');
  eq('领料出库页标题取自 mp.warehouse.materialPicking.title',
    lastCall(pkWx, 'setNavigationBarTitle').title, 'Material Picking');

  // 三页都不该在 data.t 里堆无用键（文案全在组件里）
  ok('薄壳页 data.t 为空（文案都在组件里）', Object.keys(ib.data.t || {}).length === 0);
}

// ────────────────────────── 样衣扫码页 i18n（D-552 批 B） ──────────────────────────
/**
 * 样衣扫码页接口桩（默认桩里**没有** sampleStock）
 *
 * ⚠️ 刻意造出边界：
 *   ss1 在库（借出 2）/ ss2 全部借出（库存 0、借出 3）/ ss3 在库且未借出
 *   sampleType 同时覆盖**小写 key**（development）与**大写 key**（BODY_SAMPLE / SEAL_SAMPLE）
 *   两种历史写法 —— 少写一种就会漏翻一类真实数据。
 */
function makeSampleScanApi() {
  const api = makeApi();
  api.sampleStock = {
    list: async () => ({
      records: [
        { id: 'ss1', styleNo: 'ST-1', color: '白色', size: 'S', quantity: 10, loanedQuantity: 2,
          sampleType: 'development', imageUrl: '' },
        { id: 'ss2', styleNo: 'ST-2', color: '黑色', size: 'M', quantity: 0, loanedQuantity: 3,
          sampleType: 'BODY_SAMPLE', imageUrl: '' },
        { id: 'ss3', styleNo: 'ST-3', color: '红色', size: 'L', quantity: 5, loanedQuantity: 0,
          sampleType: 'SEAL_SAMPLE', imageUrl: '' },
      ],
      total: 3,
    }),
    scanQuery: async () => ({
      found: true,
      actions: ['inbound', 'loan', 'return'],
      availableQuantity: 8,
      stock: {
        id: 'stk-9', styleNo: 'ST-1', color: '白色', size: 'S', quantity: 10,
        loanedQuantity: 2, sampleType: 'development', warehouseAreaName: '样衣A区', location: 'A-01',
      },
      activeLoans: [{ id: 'ln1', borrower: '张三', quantity: 2, createTime: '2026-09-01 10:00' }],
    }),
    inbound: async () => ({}),
    loan: async () => ({}),
    returnSample: async () => ({}),
  };
  api.production.getPatternDetail = async () => ({ styleNo: 'ST-7', color: '红', size: 'L' });
  return api;
}

const SAMPLE_SCAN_JS = 'pages/warehouse/sample/scan-action/index.js';
const SAMPLE_SCAN_WXML = 'pages/warehouse/sample/scan-action/index.wxml';

function testI18nSampleScanAction() {
  testPageI18n(SAMPLE_SCAN_JS, SAMPLE_SCAN_WXML, '样衣扫码页');

  // json 的静态标题是首屏兜底，运行时由 applyLanguage 覆盖 —— 把这个既定做法锁住
  const navJson = readSiblingJson(SAMPLE_SCAN_JS);
  eq('json 导航标题仍是静态中文兜底', navJson && navJson.navigationBarTitleText, '样衣扫码');

  // 样衣类型：库里存英文 code，前端映射（小写 / 大写两套历史写法都要覆盖）
  const { page: enP } = loadPage(SAMPLE_SCAN_JS, makeSampleScanApi());
  enP.applyLanguage('en-US');
  const rows = enP._decorateStockList([
    { sampleType: 'development' }, { sampleType: 'BODY_SAMPLE' }, { sampleType: 'SEAL_SAMPLE' },
    { sampleType: 'weird' }, {},
  ], 'en-US');
  eq('样衣类型（小写 key）已本地化', rows[0]._sampleTypeLabel, 'Development Sample');
  eq('样衣类型（大写 key）已本地化', rows[1]._sampleTypeLabel, 'Bulk Sample');
  eq('样衣类型（封样）已本地化', rows[2]._sampleTypeLabel, 'Seal Sample');
  eq('未知样衣类型原样回落（不能变空）', rows[3]._sampleTypeLabel, 'weird');
  eq('空样衣类型回落为 -', rows[4]._sampleTypeLabel, '-');

  // 状态页签的 label 不能写死在 data 里
  const { page: zhP } = loadPage(SAMPLE_SCAN_JS, makeSampleScanApi());
  zhP.applyLanguage('zh-CN');
  eq('zh 状态页签是中文', zhP.data.statusTabs.map(t => t.label), ['全部', '在库', '已借出']);
  enP.applyLanguage('en-US');
  eq('en 状态页签是英文', enP.data.statusTabs.map(t => t.label), ['All', 'In Stock', 'Loaned Out']);
  ok('中英状态页签确实不同',
    JSON.stringify(zhP.data.statusTabs.map(t => t.label))
      !== JSON.stringify(enP.data.statusTabs.map(t => t.label)));
}

async function testI18nSampleScanActionData() {
  console.log('\n【i18n：样衣扫码页 · 数据与交互】');
  const { page: p, wx } = loadPage(SAMPLE_SCAN_JS, makeSampleScanApi());
  wx.setStorageSync('app.language', 'en-US');
  p.applyLanguage('en-US');

  // ── 列表 ──
  await p.loadStockList(true);
  eq('列表加载到 3 条', p.data.stockList.length, 3);
  eq('状态页签计数正确', p.data.statusTabs.map(t => t.count), [3, 2, 1]);
  eq('列表样衣类型已本地化', p.data.stockList[0]._sampleTypeLabel, 'Development Sample');
  eq('列表「借出 N」已本地化', p.data.stockList[0]._loanedText, 'Loaned 2');
  eq('未借出时不产生「借出 N」文案', p.data.stockList[2]._loanedText, '');

  // ── 详情：类型 + 各类「N 件」 ──
  // 模拟 onLoad / onStockItemTap 的既有行为：进详情前先把款号/颜色/尺码写进 data
  // （确认弹窗的文案要用它们，不写就是三个空串）
  p.setData({ viewMode: 'detail', styleNo: 'ST-1', color: '白色', size: 'S' });
  await p.querySample('ST-1', '白色', 'S');
  const st = p.data.stockInfo.stock;
  eq('详情样衣类型已本地化', st._sampleTypeLabel, 'Development Sample');
  eq('详情库存件数已本地化', st._qtyText, '10 pcs');
  eq('详情借出件数已本地化', st._loanedQtyText, '2 pcs');
  eq('详情可用件数已本地化', p.data.stockInfo._availableText, '8 pcs');
  eq('借调记录件数已本地化', p.data.stockInfo.activeLoans[0]._qtyText, '2 pcs');
  eq('借调弹窗可用量文案已本地化', p.data.t.loanAvailableText, 'Available 8 pcs');
  ok('详情装饰未破坏原有字段', p.data.stockInfo.availableQuantity === 8
    && p.data.stockInfo.stock.id === 'stk-9'
    && p.data.stockInfo.activeLoans[0].borrower === '张三',
    JSON.stringify({ a: p.data.stockInfo.availableQuantity, i: p.data.stockInfo.stock.id }));

  // ── 入库确认弹窗（5 个占位符，最容易漏替换）──
  p.data.warehouseAreaId = 'a1';
  p.data.warehouse = '样衣A区';
  p.data.warehouseLocationCode = 'A-01';
  p.onInbound();
  const inModal = lastCall(wx, 'showModal');
  ok('入库弹窗已弹出', !!inModal);
  ok('入库弹窗标题已本地化', !!inModal && !CJK_RE.test(inModal.title), inModal && inModal.title);
  ok('入库弹窗正文已本地化', !!inModal && String(inModal.content).startsWith('Inbound'), inModal && inModal.content);
  ok('入库弹窗无未替换占位符',
    !!inModal && !/\{(style|color|size|warehouse|location)\}/.test(inModal.content), inModal && inModal.content);
  ok('入库弹窗带出款号与库位',
    !!inModal && String(inModal.content).includes('ST-1') && String(inModal.content).includes('A-01'),
    inModal && inModal.content);

  await new Promise(r => setTimeout(r, 0));
  eq('入库成功 toast 已本地化', (lastCall(wx, 'showToast') || {}).title, 'Inbound successful');

  // ⚠️ _doAction 成功后会自动重查（setTimeout 在桩里立即执行），此处显式再查一次
  //    把详情拉回稳定态 —— 否则下一步读到的是「正在加载、stockInfo 已清空」的中间态。
  await p.querySample('ST-1', '白色', 'S');
  eq('重查后详情回到稳定态', p.data.stockInfo && p.data.stockInfo.availableQuantity, 8);

  // ── 借调确认弹窗 ──
  p.data.loanTargetId = 'u1';
  p.data.loanTargetName = '张三';
  p.data.loanQuantity = 2;
  p.onLoanConfirm();
  const loanModal = lastCall(wx, 'showModal');
  ok('借调弹窗标题已本地化', !!loanModal && !CJK_RE.test(loanModal.title), loanModal && loanModal.title);
  ok('借调弹窗正文已本地化', !!loanModal && String(loanModal.content).startsWith('Loan 2 pcs to'),
    loanModal && loanModal.content);
  ok('借调弹窗无未替换占位符', !!loanModal && !/\{(name|qty)\}/.test(loanModal.content),
    loanModal && loanModal.content);
  await new Promise(r => setTimeout(r, 0));
  eq('借调成功 toast 已本地化', (lastCall(wx, 'showToast') || {}).title, 'Loan successful');

  // ── 归还确认弹窗 ──
  await p.querySample('ST-1', '白色', 'S');
  p.onReturn();
  const retModal = lastCall(wx, 'showModal');
  ok('归还弹窗标题已本地化', !!retModal && !CJK_RE.test(retModal.title), retModal && retModal.title);
  ok('归还弹窗正文已本地化', !!retModal && String(retModal.content).startsWith('Return ST-1'),
    retModal && retModal.content);
  await new Promise(r => setTimeout(r, 0));
  eq('归还成功 toast 已本地化', (lastCall(wx, 'showToast') || {}).title, 'Return successful');

  // ── 守卫提示（未选仓库 / 未选库位 / 可用为 0 / 无借调记录）──
  const { page: gp, wx: gwx } = loadPage(SAMPLE_SCAN_JS, makeSampleScanApi());
  gwx.setStorageSync('app.language', 'en-US');
  gp.applyLanguage('en-US');
  gp.onInbound();
  const g1 = lastCall(gwx, 'showToast');
  eq('未选仓库区域提示已本地化', g1 && g1.title, 'Please select warehouse area first');
  gp.data.warehouseAreaId = 'a1';
  gp.onInbound();
  eq('未选库位提示已本地化', lastCall(gwx, 'showToast').title, 'Please select a location first');
  gp.onLoan();
  eq('可用为 0 时提示已本地化', lastCall(gwx, 'showToast').title, 'No available stock, cannot loan');
  gp.onReturn();
  eq('无借调记录提示已本地化', lastCall(gwx, 'showToast').title, 'No loan records');
  gp.onLoanConfirm();
  eq('未选借调对象提示已本地化', lastCall(gwx, 'showToast').title, 'Please select a loan target');

  // ── 满库位拦截（带 code/used/capacity 三个参数）──
  const { page: fp, wx: fwx } = loadPage(SAMPLE_SCAN_JS, makeSampleScanApi());
  fwx.setStorageSync('app.language', 'en-US');
  fp.applyLanguage('en-US');
  fp.data.locationItems = [{ code: 'A-01', label: 'A-01', used: 5, capacity: 5, isFull: true }];
  fp.onLocationChipTap({ currentTarget: { dataset: { value: 'A-01' } } });
  const fullToast = lastCall(fwx, 'showToast');
  ok('满库位提示已本地化', !!fullToast && String(fullToast.title).startsWith('Location A-01 is full'),
    fullToast && fullToast.title);
  ok('满库位提示无未替换占位符', !!fullToast && !/\{(code|used|capacity)\}/.test(fullToast.title),
    fullToast && fullToast.title);
  eq('满库位不写入选中值（拦截生效）', fp.data.warehouseLocationCode, '');

  // ── 扫码解析失败 + 借调选择器标题 ──
  const { page: qp, wx: qwx } = loadPage(SAMPLE_SCAN_JS, makeSampleScanApi());
  qwx.setStorageSync('app.language', 'en-US');
  qp.applyLanguage('en-US');
  qp.parseAndQuery('完全不是二维码');
  eq('无法识别二维码提示已本地化', lastCall(qwx, 'showToast').title, 'Unrecognized QR code');

  qp.data.loanTargetType = 'person';
  qp._openPickerByKey({ currentTarget: { dataset: { key: 'loanTarget' } } });
  eq('借调选择器标题（员工）已本地化', qp.data.pickerTitle, 'Select Loan Employee');
  qp.data.loanTargetType = 'factory';
  qp._openPickerByKey({ currentTarget: { dataset: { key: 'loanTarget' } } });
  eq('借调选择器标题（工厂）已本地化', qp.data.pickerTitle, 'Select Outsource Factory');
  // ⚠️ openPicker 在「行上只有 data-key」时会先委托给 _openPickerByKey；
  //    要测通用分支必须带上 data-handler，否则根本走不到兜底标题那一行。
  qp.openPicker({ currentTarget: { dataset: { names: 'locationItems', handler: 'noop' } } });
  eq('通用选择器兜底标题已本地化', qp.data.pickerTitle, 'Please select');

  // ── 切语言：已加载的列表/详情必须重算，不能只在加载时算一次 ──
  const { page: swP } = loadPage(SAMPLE_SCAN_JS, makeSampleScanApi());
  swP.applyLanguage('zh-CN');
  await swP.loadStockList(true);
  eq('zh 列表样衣类型是中文', swP.data.stockList[0]._sampleTypeLabel, '开发样');
  await swP.querySample('ST-1', '白色', 'S');
  eq('zh 详情件数文案是中文', swP.data.stockInfo.stock._qtyText, '10 件');
  swP.applyLanguage('en-US');
  eq('切语言后列表类型自动变英文', swP.data.stockList[0]._sampleTypeLabel, 'Development Sample');
  eq('切语言后状态页签自动变英文', swP.data.statusTabs[0].label, 'All');
  eq('切语言后详情件数文案自动变英文', swP.data.stockInfo.stock._qtyText, '10 pcs');
  eq('切语言后详情可用量文案自动变英文', swP.data.stockInfo._availableText, '8 pcs');
  eq('切语言后借调弹窗可用量文案自动变英文', swP.data.t.loanAvailableText, 'Available 8 pcs');
  eq('切语言后列表「借出 N」自动变英文', swP.data.stockList[0]._loanedText, 'Loaned 2');
  ok('切语言后详情仍保留原字段', swP.data.stockInfo.stock.id === 'stk-9');
}

// ────────────────────────── 首页菜单 + 更多应用 i18n（D-553） ──────────────────────────
/** 首页接口桩：默认桩没有 getFavoriteApps / attendance */
function makeHomeApi() {
  const api = makeApi();
  api.system.getFavoriteApps = async () => ({ favoriteData: '[]' });
  api.system.getMiniprogramMenuConfig = async () => ({});
  api.system.getMe = async () => ({ realName: '张三' });
  api.attendance = {
    todayStatus: async () => ({ hasClockedIn: true, hasClockedOut: false, clockInTime: '2026-09-25T09:12:34' }),
    monthlyStats: async () => ({ workHours: 168.5, workDays: 21 }),
    clockIn: async () => ({}),
    clockOut: async () => ({}),
  };
  return api;
}

const HOME_JS = 'pages/home/index.js';
const HOME_WXML = 'pages/home/index.wxml';
const MORE_APPS_JS = 'pages/more-apps/index.js';
const MORE_APPS_WXML = 'pages/more-apps/index.wxml';
const ADMIN_JS = 'pages/admin/index.js';
const ADMIN_WXML = 'pages/admin/index.wxml';
const DEFECT_JS = 'pages/defect/index.js';
const DEFECT_WXML = 'pages/defect/index.wxml';
const SCAN_QUALITY_JS = 'pages/scan/quality/index.js';
const SCAN_QUALITY_WXML = 'pages/scan/quality/index.wxml';

/** 把 menuRows / filteredApps 拍平成 [分组名, 应用名...] */
function flattenMenuNames(rows) {
  const out = [];
  (rows || []).forEach((r) => (r.groups || r.items ? (r.groups || [r]) : []).forEach((g) => {
    if (g.group) out.push(g.group);
    (g.items || []).forEach((a) => out.push(a.name));
  }));
  return out;
}

/**
 * 首页（D-553）
 *
 * 本页是工厂端第一屏，菜单名 / 日期 / 星期 / 问候语 / 打卡状态**全是派生文案**，
 * 不能只靠 testPageI18n（它只查 data.t）—— 每一项都要单独断言。
 */
function testI18nHome() {
  testPageI18n(HOME_JS, HOME_WXML, '首页');

  const { page: zhP, wx: zhWx } = loadPage(HOME_JS, makeHomeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP, wx: enWx } = loadPage(HOME_JS, makeHomeApi());
  enP.applyLanguage('en-US');

  // ── 菜单名（默认应用 = 每个分组取第一项，末尾固定「更多应用」）──
  const zhNames = flattenMenuNames(zhP.data.menuRows);
  const enNames = flattenMenuNames(enP.data.menuRows);
  eq('zh 菜单含中文应用名', zhNames.includes('样衣开发') && zhNames.includes('更多应用'), true);
  eq('en 菜单含英文应用名', enNames.includes('Sample Development') && enNames.includes('More Apps'), true);
  ok('菜单项数量一致（语言切换不改变结构）', zhNames.length === enNames.length,
    `zh=${zhNames.length} en=${enNames.length}`);
  ok('英文菜单无中文残留', !enNames.some(n => CJK_RE.test(String(n))),
    enNames.filter(n => CJK_RE.test(String(n))).join(','));
  eq('zh 分组标题是中文', zhNames[0], '开发');
  eq('en 分组标题是英文', enNames[0], 'Development');
  // 「更多应用」所在的「管理」分组
  ok('zh 含管理分组', zhNames.includes('管理'), zhNames.join('|'));
  ok('en 含管理分组', enNames.includes('Management'), enNames.join('|'));

  // ── 分组计数「N个」──
  const zhCount = zhP.data.menuRows[0].groups[0]._countText;
  const enCount = enP.data.menuRows[0].groups[0]._countText;
  eq('zh 分组计数带「个」', zhCount, '1个');
  eq('en 分组计数无「个」', enCount, '1');

  // ── 日期 / 星期（中英文结构完全不同）──
  ok('zh 日期是「年月日」格式', /^\d+年\d+月\d+日$/.test(zhP.data.dateInfo.date), zhP.data.dateInfo.date);
  ok('en 日期是数字斜杠格式', /^\d+\/\d+\/\d+$/.test(enP.data.dateInfo.date), enP.data.dateInfo.date);
  ok('zh 星期带「星期」前缀', /^星期[日一二三四五六]$/.test(zhP.data.dateInfo.day), zhP.data.dateInfo.day);
  ok('en 星期是英文整词', ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    .includes(enP.data.dateInfo.day), enP.data.dateInfo.day);
  ok('季节已本地化', !CJK_RE.test(enP.data.dateInfo.season), enP.data.dateInfo.season);

  // ── 今日小贴士 ──
  ok('zh 小贴士是中文', CJK_RE.test(zhP.data.dateInfo.dailyTip), zhP.data.dateInfo.dailyTip);
  ok('en 小贴士是英文', !CJK_RE.test(enP.data.dateInfo.dailyTip) && enP.data.dateInfo.dailyTip.length > 10,
    enP.data.dateInfo.dailyTip);

  // ── 问候语 ──
  ok('zh 问候语是中文', ['上午好', '下午好', '晚上好'].includes(zhP.data.greeting), zhP.data.greeting);
  ok('en 问候语是英文',
    ['Good morning', 'Good afternoon', 'Good evening'].includes(enP.data.greeting), enP.data.greeting);
  // 整句：中文用全角逗号，英文用半角
  ok('zh 问候整句用全角逗号', String(zhP.data.greetingText).includes('，'), zhP.data.greetingText);
  ok('en 问候整句用半角逗号', String(enP.data.greetingText).includes(', ') && !CJK_RE.test(enP.data.greetingText),
    enP.data.greetingText);

  // ── 打卡状态与统计 ──
  eq('zh 打卡状态是中文', zhP.data.attendanceStatusText, '今日未打卡');
  eq('en 打卡状态是英文', enP.data.attendanceStatusText, 'Not clocked in today');
  eq('zh 本月统计带「天」', zhP.data.t.monthlyStatsText, '0.0h/0天');
  eq('en 本月统计用 d', enP.data.t.monthlyStatsText, '0.0h / 0d');

  // ── 导航栏标题 ──
  eq('首页导航标题随语言变化', lastCall(enWx, 'setNavigationBarTitle').title, 'Yizhilian');
  eq('首页 zh 导航标题是品牌中文名', lastCall(zhWx, 'setNavigationBarTitle').title, '衣智链');

  // ── 底栏 tabBar 四语言（applyTabBar：index 2 是质检页，历史上错挂过「生产」）──
  const zhTabs = zhWx.calls.filter(c => c[0] === 'setTabBarItem').map(c => c[1]);
  const enTabs = enWx.calls.filter(c => c[0] === 'setTabBarItem').map(c => c[1]);
  ok('zh 底栏 4 项全部重设', zhTabs.length === 4, `实际 ${zhTabs.length} 项`);
  eq('zh 底栏第 3 项是质检（不是生产）', (zhTabs[2] || {}).text, '质检');
  eq('en 底栏第 3 项是 Quality', (enTabs[2] || {}).text, 'Quality');
  eq('en 底栏第 1 项是 Home', (enTabs[0] || {}).text, 'Home');
  eq('en 底栏第 4 项是 Me', (enTabs[3] || {}).text, 'Me');
}

async function testI18nHomeActions() {
  console.log('\n【i18n：首页 · 交互与切语言】');

  // ── 切语言：已渲染的菜单/日期必须重算，不能只在加载时算一次 ──
  const { page: p } = loadPage(HOME_JS, makeHomeApi());
  p.applyLanguage('zh-CN');
  const zhDate = p.data.dateInfo.date;
  const zhTip = p.data.dateInfo.dailyTip;
  eq('切语言前是中文菜单', flattenMenuNames(p.data.menuRows)[1], '样衣开发');
  p.applyLanguage('en-US');
  eq('切语言后菜单自动变英文', flattenMenuNames(p.data.menuRows)[1], 'Sample Development');
  ok('切语言后日期格式变英文', /^\d+\/\d+\/\d+$/.test(p.data.dateInfo.date), p.data.dateInfo.date);
  ok('中文日期与英文日期不同', zhDate !== p.data.dateInfo.date, `${zhDate} vs ${p.data.dateInfo.date}`);
  ok('切语言后小贴士变英文', zhTip !== p.data.dateInfo.dailyTip && !CJK_RE.test(p.data.dateInfo.dailyTip),
    p.data.dateInfo.dailyTip);
  eq('切语言后打卡状态变英文', p.data.attendanceStatusText, 'Not clocked in today');

  // ── 收藏里的 name 是「存进去那一刻的语言」，必须按 id 反查重新翻译 ──
  const { page: fvP } = loadPage(HOME_JS, makeHomeApi());
  fvP.applyLanguage('en-US');
  fvP._lastFavorites = [
    { id: 'materialCenter', name: '物料中心', iconClass: 'x', circleClass: 'y', route: '/pages/warehouse/material-center/index' },
    { id: 'unknownApp', name: '某个新应用', iconClass: 'x', circleClass: 'y', route: '/pages/x/index' },
  ];
  const names = flattenMenuNames(fvP._buildMenuGroups(fvP._lastFavorites, {}));
  ok('收藏项按 id 反查已翻译成英文', names.includes('Material Center'), names.join('|'));
  ok('收藏项不再残留中文', !names.includes('物料中心'), names.join('|'));
  ok('未知 id 原样回落（不显示空串/键名）', names.includes('某个新应用'), names.join('|'));
  ok('未知 id 未渲染成键名', !names.some(n => KEYLIKE_RE.test(String(n))), names.join('|'));

  // ── 打卡：加载真实考勤状态后状态文案要跟着语言 ──
  const { page: atP } = loadPage(HOME_JS, makeHomeApi());
  atP.applyLanguage('en-US');
  await atP._loadAttendance();
  eq('上班中状态已本地化', atP.data.attendanceStatusText, 'Working');
  eq('上班时间被格式化', atP.data.attendanceClockInText, '09:12');
  eq('本月统计已本地化', atP.data.t.monthlyStatsText, '168.5h / 21d');
  atP.applyLanguage('zh-CN');
  eq('切回中文后状态跟着变', atP.data.attendanceStatusText, '上班中');
  eq('切回中文后统计跟着变', atP.data.t.monthlyStatsText, '168.5h/21天');

  // ── 打卡 toast ──
  const { page: ckP, wx: ckWx } = loadPage(HOME_JS, makeHomeApi());
  ckWx.setStorageSync('app.language', 'en-US');
  ckP.applyLanguage('en-US');
  ckP.onClockIn();
  await new Promise(r => setTimeout(r, 0));
  const toast = lastCall(ckWx, 'showToast');
  eq('上班打卡成功 toast 已本地化', toast && toast.title, 'Clock-in successful');

  // ── 用户名兜底进问候整句 ──
  const { page: nmP } = loadPage(HOME_JS, makeHomeApi());
  nmP.applyLanguage('en-US');
  ok('无用户名时用 User 兜底', String(nmP.data.greetingText).includes('User'), nmP.data.greetingText);
  ok('兜底整句无中文', !CJK_RE.test(nmP.data.greetingText), nmP.data.greetingText);
}

/** 更多应用页（D-553）—— 与首页共用同一套菜单键 */
function testI18nMoreApps() {
  testPageI18n(MORE_APPS_JS, MORE_APPS_WXML, '更多应用页');

  const { page: zhP, wx: zhWx } = loadPage(MORE_APPS_JS, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP, wx: enWx } = loadPage(MORE_APPS_JS, makeApi());
  enP.applyLanguage('en-US');

  const zhNames = flattenMenuNames(enP.data.filteredApps.map(g => ({ group: g.group, items: g.items })));
  eq('zh 应用名是中文', zhP.data.filteredApps[0].items[0].name, '样衣开发');
  eq('en 应用名是英文', enP.data.filteredApps[0].items[0].name, 'Sample Development');
  eq('zh 分组标题是中文', zhP.data.filteredApps[0].group, '开发');
  eq('en 分组标题是英文', enP.data.filteredApps[0].group, 'Development');
  eq('en 分组计数无「个」', enP.data.filteredApps[0]._countText, '3');
  eq('zh 分组计数带「个」', zhP.data.filteredApps[0]._countText, '3个');
  ok('英文应用名无中文残留', !zhNames.some(n => CJK_RE.test(String(n))),
    zhNames.filter(n => CJK_RE.test(String(n))).join(','));

  // 导航标题复用首页的 appMoreApps
  eq('更多应用页导航标题随语言变化', lastCall(enWx, 'setNavigationBarTitle').title, 'More Apps');
  eq('更多应用页 zh 导航标题', lastCall(zhWx, 'setNavigationBarTitle').title, '更多应用');

  // 🔴 搜索必须能命中**任一语言**（否则用户切语言后搜原语言搜不到）
  enP.filterApps('material');
  ok('英文下用英文关键词能搜到', enP.data.filteredApps.some(g => g.items.some(i => i.id === 'materialCenter')),
    JSON.stringify(enP.data.filteredApps.map(g => g.items.map(i => i.id))));
  enP.filterApps('物料');
  ok('英文下用中文关键词也能搜到（四语言搜索源）',
    enP.data.filteredApps.some(g => g.items.some(i => i.id === 'materialCenter')),
    JSON.stringify(enP.data.filteredApps.map(g => g.items.map(i => i.id))));
  // 无结果提示：用**非中文关键词**搜不到时断言——关键词本身是用户输入，
  // 中文词搜出来的提示 `No apps found for "物料"` 含 CJK 是正常的，不能算没翻译
  enP.filterApps('zzzz-no-match');
  ok('无结果提示已本地化', !CJK_RE.test(String(enP.data.t.noResultText)), enP.data.t.noResultText);
  ok('无结果提示无未替换占位符', !/\{kw\}/.test(String(enP.data.t.noResultText)), enP.data.t.noResultText);

  // 清空收藏确认弹窗
  enP.onClearFavorites();
  const modal = lastCall(enWx, 'showModal');
  eq('清空弹窗标题已本地化', modal && modal.title, 'Confirm Clear');
  eq('清空弹窗正文已本地化', modal && modal.content, 'Clear all favorites?');

  // 收藏项的名字也要按 id 反查翻译
  zhP.data.favoriteApps = [{ id: 'materialCenter', name: '物料中心', iconClass: 'x', circleClass: 'y', route: '/r' }];
  zhP.applyLanguage('en-US');
  eq('收藏项名字随语言重算', zhP.data.favoriteApps[0].name, 'Material Center');
}

/** 「我的」页（D-553-B）—— 菜单/统计标签/在线人数/退出登录/底栏 */
function testI18nAdmin() {
  testPageI18n(ADMIN_JS, ADMIN_WXML, '我的页');

  const { page: zhP, wx: zhWx } = loadPage(ADMIN_JS, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP, wx: enWx } = loadPage(ADMIN_JS, makeApi());
  enP.applyLanguage('en-US');

  // 菜单项（默认权限：审批/邀请不显示 → 5 项）
  const zhLabels = zhP.data.menuItems.map(i => i.label);
  const enLabels = enP.data.menuItems.map(i => i.label);
  ok('zh 菜单含修改密码/意见反馈', zhLabels.includes('修改密码') && zhLabels.includes('意见反馈'), zhLabels.join('|'));
  ok('en 菜单无中文残留', !enLabels.some(n => CJK_RE.test(String(n))), enLabels.join('|'));
  ok('en 菜单含 Change Password / Privacy Policy',
    enLabels.includes('Change Password') && enLabels.includes('Privacy Policy'), enLabels.join('|'));
  ok('菜单项数量一致（语言切换不改变结构）', zhLabels.length === enLabels.length,
    `zh=${zhLabels.length} en=${enLabels.length}`);

  // 统计标签 / 退出登录 / 在线人数整句
  eq('zh 统计标签', [zhP.data.t.statHours, zhP.data.t.statWage, zhP.data.t.statScans].join('|'),
    '本月工时|本月工资|扫码次数');
  eq('en 统计标签', [enP.data.t.statHours, enP.data.t.statWage, enP.data.t.statScans].join('|'),
    'Monthly Hours|Monthly Pay|Scans');
  eq('en 退出登录', enP.data.t.logout, 'Log Out');
  eq('zh 在线人数整句', zhP.data.onlineText, '0人在线');
  eq('en 在线人数整句（无占位符残留）', enP.data.onlineText, '0 online');

  // 导航标题复用 tabbar.admin；底栏在语言切换时同步重设
  eq('我的页导航标题随语言变化', lastCall(enWx, 'setNavigationBarTitle').title, 'Me');
  eq('我的页 zh 导航标题', lastCall(zhWx, 'setNavigationBarTitle').title, '我的');
  const enTabs = enWx.calls.filter(c => c[0] === 'setTabBarItem').map(c => c[1]);
  ok('我的页切语言重设底栏 4 项', enTabs.length === 4, `实际 ${enTabs.length} 项`);
  eq('我的页底栏第 4 项是 Me', (enTabs[3] || {}).text, 'Me');

  // 开审批/邀请权限后菜单仍然键化（zhP 已切 en，正好验证全量形态）
  zhP._showInviteSection = true;
  zhP.data.showApprovalEntry = true;
  zhP.applyLanguage('en-US');
  const enAll = zhP.data.menuItems.map(i => i.label);
  ok('开审批/邀请入口后仍是英文', enAll.includes('User Approval') && enAll.includes('Invite Staff'), enAll.join('|'));
}

/** 质检 tab 页（D-554）—— 筛选chips/统计/卡片文案/交期倒计时/返修报废弹窗 */
async function testI18nDefect() {
  testPageI18n(DEFECT_JS, DEFECT_WXML, '质检页');

  const { page: zhP, wx: zhWx } = loadPage(DEFECT_JS, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP, wx: enWx } = loadPage(DEFECT_JS, makeApi());
  enP.applyLanguage('en-US');

  // 筛选 chips + 统计标签
  eq('zh 筛选chips', [zhP.data.t.all, zhP.data.t.statusPending, zhP.data.t.statusPass, zhP.data.t.statusFail, zhP.data.t.statusRepair].join('|'),
    '全部|待检|合格|不合格|返修');
  eq('en 筛选chips', [enP.data.t.all, enP.data.t.statusPending, enP.data.t.statusPass, enP.data.t.statusFail, enP.data.t.statusRepair].join('|'),
    'All|Pending|Pass|Fail|Repair');
  eq('en 合格率', enP.data.t.passRate, 'Pass Rate');
  ok('en 搜索占位无中文', !CJK_RE.test(String(enP.data.t.searchPlaceholder)), enP.data.t.searchPlaceholder);

  // 卡片数据处理文案：qualityCategory 会走 qualityHelper 静态映射（utils 批次收编），
  // 这里只测页面级兜底与生产方标签——factoryTypeText 渲染前提是 factoryText 非空
  const proc2 = enP._processQualityItem({ qualityCategory: '', factoryName: 'Factory A', factoryType: 'INTERNAL' });
  eq('en 生产方内部', proc2.factoryTypeText, 'In-house');
  const proc3 = enP._processQualityItem({ qualityCategory: '', factoryName: 'Factory A', factoryType: 'EXTERNAL' });
  eq('en 生产方外部', proc3.factoryTypeText, 'Outsourced');

  // 交期倒计时三态（相对今天构造日期，避开共享 displayHelper 的静态状态分支）
  const dstr = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const p2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  };
  eq('en 逾期', enP._calcDeliveryDisplay(dstr(-3), 'in_production').text, '3d overdue');
  eq('en 今天', enP._calcDeliveryDisplay(dstr(0), 'in_production').text, 'Today');
  eq('en 5天后', enP._calcDeliveryDisplay(dstr(5), 'in_production').text, '5d');
  eq('zh 逾期', zhP._calcDeliveryDisplay(dstr(-3), 'in_production').text, '逾3天');

  // 开始返修：弹窗正文带菲号 + 确认后 toast
  // （stub 掉刷新链路，否则 api 缺口把 catch 的 showModal 顶成 lastCall）
  const rpApi = makeApi();
  rpApi.production.startBundleRepair = async () => ({});
  const rp = loadPage(DEFECT_JS, rpApi);
  rp.page.applyLanguage('en-US');
  rp.page.loadQualityList = () => Promise.resolve();
  rp.page.loadStats = () => {};
  rp.page.data.list = [{ bundleId: 'B1', bundleNo: 'BJ26-1', repairStatus: 'pending' }];
  rp.page.onStartRepair({ currentTarget: { dataset: { index: 0 } } });
  await new Promise(r => setTimeout(r, 0));
  const modal = lastCall(rp.wx, 'showModal');
  eq('en 返修弹窗正文带菲号', modal && modal.content, 'Start repair for bundle BJ26-1?');
  const toast = lastCall(rp.wx, 'showToast');
  eq('en 返修成功 toast', toast && toast.title, 'Repair started');

  // 导航标题复用 tabbar.quality + 底栏
  eq('质检页导航标题随语言', lastCall(enWx, 'setNavigationBarTitle').title, 'Quality');
  eq('质检页 zh 导航标题', lastCall(zhWx, 'setNavigationBarTitle').title, '质检');
  const enTabs = enWx.calls.filter(c => c[0] === 'setTabBarItem').map(c => c[1]);
  eq('质检页底栏第 3 项 Quality', (enTabs[2] || {}).text, 'Quality');
}

/** 质检录入页（D-555）—— info卡/AI建议/不良品详情/picker选项数组/提交按钮 */
function testI18nScanQuality() {
  testPageI18n(SCAN_QUALITY_JS, SCAN_QUALITY_WXML, '质检录入页');

  const { page: zhP, wx: zhWx } = loadPage(SCAN_QUALITY_JS, makeApi());
  zhP.applyLanguage('zh-CN');
  const { page: enP, wx: enWx } = loadPage(SCAN_QUALITY_JS, makeApi());
  enP.applyLanguage('en-US');

  // t 表
  eq('zh 结果二选一', zhP.data.t.pass + '|' + zhP.data.t.fail, '合格|不合格');
  eq('en 结果二选一', enP.data.t.pass + '|' + enP.data.t.fail, 'Pass|Fail');
  eq('en 提交按钮', enP.data.t.submitQuality, 'Submit QC');
  ok('en 备注占位无中文', !CJK_RE.test(String(enP.data.t.remarkPh)), enP.data.t.remarkPh);

  // picker 选项数组按语言重建
  eq('zh 缺陷类别首位', zhP.data.defectCategories[0], '外观完整性问题');
  eq('en 缺陷类别首位', enP.data.defectCategories[0], 'Appearance integrity issue');
  eq('en 处理方式数组', enP.data.handleMethods.join('|'), 'Repair|Scrap');
  ok('数组长度与载荷常量一致', enP.data.handleMethods.length === 2 && enP.data.defectCategories.length === 5,
    `${enP.data.handleMethods.length}/${enP.data.defectCategories.length}`);

  // 导航标题
  eq('录入页导航标题随语言', lastCall(enWx, 'setNavigationBarTitle').title, 'QC Scan');
  eq('录入页 zh 导航标题', lastCall(zhWx, 'setNavigationBarTitle').title, '质检扫码');

  // 超五张 toast
  const up = loadPage(SCAN_QUALITY_JS, makeApi());
  up.page.applyLanguage('en-US');
  up.page.data.images = ['1', '2', '3', '4', '5'];
  up.page.onUploadImage();
  const toast = lastCall(up.wx, 'showToast');
  eq('en 超五张 toast', toast && toast.title, 'Up to 5 photos allowed');
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
  testSearchPickerConvention();
  testI18nLocationScan();
  testI18nFinishedInventoryList();
  await testI18nFinishedInventoryListData();
  testI18nFinishedInventoryDetail();
  testI18nFinishedInbound();
  await testI18nFinishedInboundData();
  testI18nFinishedOutbound();
  await testI18nFinishedOutboundData();
  testI18nMaterialDatabase();
  await testI18nMaterialDatabaseData();
  testI18nMaterialScan();
  await testI18nMaterialScanActions();
  testI18nMaterialCenter();
  await testI18nMaterialCenterData();
  testI18nMaterialInventoryDetail();
  await testI18nMaterialInventoryDetailData();
  await testI18nMaterialInboundForm();
  testI18nMaterialOutboundForm();
  testI18nMaterialPickingList();
  testI18nShellPages();
  testI18nSampleScanAction();
  await testI18nSampleScanActionData();
  testI18nHome();
  await testI18nHomeActions();
  testI18nMoreApps();
  testI18nAdmin();
  await testI18nDefect();
  testI18nScanQuality();
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

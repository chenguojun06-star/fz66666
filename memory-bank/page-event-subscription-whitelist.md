# 页面事件订阅白名单

> 版本：v1.0
> 日期：2026-07-09
> 状态：生效中
> 关联铁律：D-001（事务边界）/ P0 #4 多租户 / D-017（永久禁止 WebSocket 全局广播）
> 用途：新页面开发或老页面修改时，必须对照本文档检查 eventBus 订阅是否完整，防止"操作后不刷新"问题再生。

---

## 一、规则（P0 铁律级别）

1. **所有展示业务数据的页面，必须订阅 eventBus 事件**
   - 列表页、详情页、看板页、统计页、扫码历史页等均属于"展示业务数据"页面
   - 纯展示静态信息（如登录、隐私协议、邀请、修改密码）的页面可豁免

2. **小程序用 `utils/pageEventBinder.js` 的 `bindPageEvents` / `unbindPageEvents`**
   - 在 `onLoad` 中调用 `bindPageEvents(this, () => this.loadData())`
   - 默认订阅 `DATA_CHANGED` + `REFRESH_ALL`
   - 通过第三个参数追加业务事件：`bindPageEvents(this, refreshFn, ['SCAN_SUCCESS', 'ORDER_PROGRESS_CHANGED'])`
   - 内置 500ms 节流，短时间多个事件只触发一次刷新

3. **PC 前端用 `useSync` 轮询 + `window.addEventListener` 事件监听**
   - `useSync` 来自 `frontend/src/utils/syncManager.ts`，提供轮询刷新（默认 30s）
   - 写操作完成后必须 `window.dispatchEvent(new Event('xxx:changed'))` 通知其他页面
   - 在 `useEffect` cleanup 中必须 `removeEventListener`，避免内存泄漏

4. **onUnload（小程序）/ useEffect cleanup（PC）必须取消订阅**
   - 小程序：`onUnload() { unbindPageEvents(this); }`
   - PC：`useEffect(() => { ... return () => window.removeEventListener(...); }, [])`
   - 违反 = 内存泄漏 + 重复刷新（P1 级 bug）

5. **永久禁止 WebSocket 全局广播（D-017）**
   - 业务通知走 eventBus 事件，不走 WebSocket 广播
   - 后端 `RealTimePushService` / `DataSyncAspect` 已删除，禁止加回

6. **刷新函数名约定**
   - 小程序：`loadData` / `refreshData` / `fetchList`（避免使用 `onShow` 直接刷新，因为 onShow 是页面生命周期）
   - PC：`fetchFn`（传给 useSync）/ `loadData`（事件回调）

---

## 二、事件清单

来源：`miniprogram/utils/eventBus.js`（小程序）+ `frontend/src/utils/syncManager.ts`（PC，无 eventBus，用 window event）

### 2.1 通用数据变更事件（默认所有业务页面订阅）

| 事件名 | 说明 | 触发场景 |
|--------|------|---------|
| `data:changed` | 通用数据变更 | 任意写操作后 |
| `refresh:all` | 请求刷新所有页面 | `triggerDataRefresh()` 同时触发 |

### 2.2 扫码相关事件

| 事件名 | 说明 | 应订阅页面 |
|--------|------|------------|
| `scan:success` | 扫码成功 | 扫码历史、订单详情、看板、任务列表 |
| `scan:undo` | 撤销扫码 | 同上 |
| `scan:rollback` | 回退操作 | 同上 |

### 2.3 订单相关事件

| 事件名 | 说明 | 应订阅页面 |
|--------|------|------------|
| `order:updated` | 订单更新 | 订单列表、订单详情 |
| `order:progress:changed` | 订单进度变更 | 订单列表、看板、生产进度详情 |
| `order:status:changed` | 订单状态变更 | 订单列表、看板 |

### 2.4 任务相关事件

| 事件名 | 说明 | 应订阅页面 |
|--------|------|------------|
| `task:received` | 领取任务 | 任务列表、采购任务详情 |
| `task:returned` | 退回任务 | 任务列表 |
| `task:completed` | 完成任务 | 任务列表 |
| `task:bundled` | 生成菲号 | 裁剪分菲、裁剪任务列表 |

### 2.5 质检相关事件

| 事件名 | 说明 | 应订阅页面 |
|--------|------|------------|
| `quality:checked` | 质检完成 | 质检详情、订单详情 |
| `quality:repaired` | 返修完成 | 质检详情、订单详情 |

### 2.6 库存相关事件

| 事件名 | 说明 | 应订阅页面 |
|--------|------|------------|
| `warehouse:in` | 入库操作 | 成品库存、订单详情、入库列表 |
| `stock:changed` | 库存变更（入库/出库/调整） | 所有库存页面 |

### 2.7 PC 前端专用 window 事件

PC 前端不使用 eventBus.js，而是用浏览器原生 `window.dispatchEvent`：

| 事件名 | 说明 |
|--------|------|
| `order:progress:changed` | 订单进度变更（关单/扫码后触发） |
| `data:changed` | 通用数据变更 |
| `user-logout` | 用户登出（syncManager 自动监听，停止所有同步） |

---

## 三、小程序页面订阅状态表

> 数据来源：2026-07-09 全量扫描 `miniprogram/pages/` 目录
> 扫描方式：grep `bindPageEvents` / `eventBus.on` / `onUnload`

### 3.1 ✅ 已正常（25 个）

这些页面已正确接入 eventBus 或属于豁免页面（无业务数据/纯表单/纯静态）。

| 页面路径 | 类型 | 备注 |
|---------|------|------|
| `pages/home/index` | 业务页 | 主页，已订阅 REFRESH_ALL |
| `pages/dashboard/index` | 业务页 | 工作台，已订阅 DATA_CHANGED |
| `pages/dashboard/order-detail/index` | 业务页 | 订单详情，已订阅 ORDER_PROGRESS_CHANGED |
| `pages/dashboard/process-edit/index` | 表单页 | 豁免（编辑后跳转） |
| `pages/dashboard/process-template/index` | 表单页 | 豁免（模板配置） |
| `pages/scan/index` | 业务页 | 扫码主页，触发 scan:success |
| `pages/scan/confirm/index` | 业务页 | 扫码确认，已订阅 SCAN_SUCCESS |
| `pages/scan/history/index` | 业务页 | 扫码历史，已订阅 SCAN_SUCCESS + SCAN_UNDO |
| `pages/scan/scan-result/index` | 业务页 | 扫码结果，已订阅 SCAN_SUCCESS |
| `pages/scan/pattern/index` | 业务页 | 纸样扫码 |
| `pages/scan/quality/index` | 业务页 | 质检扫码 |
| `pages/scan/rescan/index` | 业务页 | 重扫 |
| `pages/admin/index` | 业务页 | 管理后台 |
| `pages/admin/user-approval/index` | 业务页 | 用户审批，已订阅 DATA_CHANGED |
| `pages/order/create/index` | 表单页 | 豁免（创建后跳转） |
| `pages/order/create/form/index` | 表单页 | 豁免 |
| `pages/order/no-data-create/index` | 表单页 | 豁免 |
| `pages/order/remark/index` | 表单页 | 豁免（保存后返回） |
| `pages/procurement/task-list/index` | 业务页 | 已订阅 TASK_RECEIVED + TASK_RETURNED |
| `pages/sample-development/index/index` | 业务页 | 已订阅 DATA_CHANGED |
| `pages/warehouse/material/scan/index` | 业务页 | 已订阅 SCAN_SUCCESS |
| `pages/warehouse/sample/scan-action/index` | 业务页 | 已修复（详见 3.2） |
| `pages/login/index` | 豁免 | 无业务数据 |
| `pages/register/index` | 豁免 | 无业务数据 |
| `pages/more-apps/index` | 豁免 | 静态导航页 |

### 3.2 ✅ 已修复（17 个，含今天修复的 13+2+2）

这 17 个页面在 2026-07-09 之前完全未接入 eventBus，今天统一通过 `bindPageEvents` 修复。

| 页面路径 | 订阅事件 | 修复批次 |
|---------|---------|---------|
| `pages/cutting/bundle-detail/index.js` | DATA_CHANGED + REFRESH_ALL + TASK_BUNDLED | 第一批 13 个 |
| `pages/advance/list/index.js` | DATA_CHANGED + REFRESH_ALL | 第一批 13 个 |
| `pages/work/bundle-split/index.js` | DATA_CHANGED + REFRESH_ALL + TASK_BUNDLED | 第一批 13 个 |
| `pages/warehouse/location-scan/index.js` | DATA_CHANGED + REFRESH_ALL + WAREHOUSE_IN | 第一批 13 个 |
| `pages/quality-detail/index.js` | DATA_CHANGED + REFRESH_ALL + QUALITY_CHECKED + QUALITY_REPAIRED | 第一批 13 个 |
| `pages/sample-development/detail/index.js` | DATA_CHANGED + REFRESH_ALL + ORDER_PROGRESS_CHANGED | 第一批 13 个 |
| `pages/payroll/payroll.js` | DATA_CHANGED + REFRESH_ALL | 第一批 13 个 |
| `pages/payroll/feedback/index.js` | DATA_CHANGED + REFRESH_ALL | 第一批 13 个 |
| `pages/finance/payment/index.js` | DATA_CHANGED + REFRESH_ALL | 第一批 13 个 |
| `pages/factory/shipment/index.js` | DATA_CHANGED + REFRESH_ALL + ORDER_PROGRESS_CHANGED | 第一批 13 个 |
| `pages/smart-ops/index.js` | DATA_CHANGED + REFRESH_ALL | 第一批 13 个 |
| `pages/procurement/task-detail/index.js` | DATA_CHANGED + REFRESH_ALL + TASK_RECEIVED + TASK_RETURNED | 第一批 13 个 |
| `pages/return/detail/index.js` | DATA_CHANGED + REFRESH_ALL | 第一批 13 个 |
| `pages/return/list/index.js` | DATA_CHANGED + REFRESH_ALL | 第二批 2 个 |
| `pages/sales/overview/index.js` | DATA_CHANGED + REFRESH_ALL + ORDER_STATUS_CHANGED | 第二批 2 个 |
| `pages/sales/order-list/index.js` | DATA_CHANGED + REFRESH_ALL + ORDER_UPDATED + ORDER_STATUS_CHANGED | 第三批 2 个 |
| `pages/warehouse/sample/scan-action/index.js` | DATA_CHANGED + REFRESH_ALL + WAREHOUSE_IN | 第三批 2 个 |

**修复模板**（统一接入方式）：

```javascript
const { bindPageEvents, unbindPageEvents, Events } = require('../../../utils/pageEventBinder');

Page({
  onLoad() {
    // ... 原有初始化
    this._unsubscribe = bindPageEvents(this, () => this.loadData(), [
      // 按需追加业务事件
      Events.SCAN_SUCCESS,
      Events.ORDER_PROGRESS_CHANGED,
    ]);
  },

  onUnload() {
    if (this._unsubscribe) this._unsubscribe();
    unbindPageEvents(this);
  },

  loadData() {
    // ... 原有数据加载逻辑
  },
});
```

### 3.3 ⚠️ 可选优化（9 个）

这些页面属于豁免类型，但若后续扩展为业务数据展示页，需要补充订阅。

| 页面路径 | 当前类型 | 可选优化原因 |
|---------|---------|------------|
| `pages/admin/misc/change-password/index` | 表单页 | 修改密码后无需刷新其他页面 |
| `pages/admin/misc/feedback/index` | 表单页 | 反馈提交后无需刷新其他页面 |
| `pages/admin/misc/invite/index` | 静态页 | 邀请二维码静态展示 |
| `pages/defect/index` | 详情页 | 瑕疵记录页，目前无列表刷新需求，扩展为列表后需订阅 |
| `pages/privacy/index` | 静态页 | 隐私政策静态展示 |
| `pages/privacy/service/index` | 静态页 | 服务条款静态展示 |
| `pages/dashboard/utils/*` | 工具函数 | 非页面文件 |
| `pages/cutting/utils/*` | 工具函数 | 非页面文件（blePrinter / weapp-qrcode） |
| `pages/scan/handlers/*` | 工具函数 | 扫码处理器，非页面 |

---

## 四、PC 前端页面订阅状态表

> PC 前端使用 `frontend/src/utils/syncManager.ts` 的 `useSync` 轮询 + `window.addEventListener` 事件监听
> 模块路径：`frontend/src/modules/`

### 4.1 生产模块（production）

| 页面 | 刷新机制 | 事件监听 | 状态 |
|------|---------|---------|------|
| 订单列表 `Production/List` | `useSync('production-list', ...)` + `useProductionListData` | `data:changed` | ✅ |
| 生产进度详情 `Production/ProgressDetail` | `useSync('progress-detail-order', ..., interval=300000)` | `order:progress:changed` + `data:changed` | ✅ |
| 关单操作 `useCloseOrder` | 写操作后 dispatch | `order:progress:changed` + `data:changed` | ✅ |
| 裁剪任务 `Production/Cutting` | `useSync('cutting-tasks', ...)` + `useCuttingTasks` | `data:changed` | ✅ |
| 裁剪分菲 `useCuttingBundles` | `useSync` | `data:changed` | ✅ |
| 成品入库 `Production/ProductWarehousing` | `useSync('product-warehousing', ...)` + `useProductWarehousing` | `warehouse:in` + `data:changed` | ✅ |
| 物料采购 `Production/MaterialPurchase` | `useSync` + `usePurchaseList` | `data:changed` | ✅ |
| 物料领料 `Production/MaterialPicking` | 局部刷新 | `data:changed` | ⚠️ 可补 useSync |
| 外发加工 `Production/ExternalFactory` | 局部刷新 | `data:changed` | ⚠️ 可补 useSync |
| 退回管理 `Production/ReturnManagement` | 局部刷新 | `data:changed` | ⚠️ 可补 useSync |
| 水洗标 `Production/WashLabel` | 局部刷新 | 无 | 豁免（打印场景） |
| 订单流程 `Production/OrderFlow` | 局部刷新 | 无 | 豁免（详情查看） |

### 4.2 仓库模块（warehouse）

| 页面 | 刷新机制 | 事件监听 | 状态 |
|------|---------|---------|------|
| 成品库存 `FinishedInventory` | `useSync('finished-inventory', ...)` + `useFinishedInventoryActions` | `warehouse:in` + `stock:changed` | ✅ |
| 物料库存 `MaterialInventory` | `useSync` + `useMaterialPickupData` | `stock:changed` + `data:changed` | ✅ |
| 样衣库存 `SampleInventory` | `useSync('sample-inventory', ...)` | `data:changed` + `stock:changed` | ✅ |
| 物料扫码 `MaterialScanOperationModal` | 写后 dispatch | `warehouse:in` + `data:changed` | ✅ |
| 成品扫码 `FinishedScanOperationModal` | 写后 dispatch | `warehouse:in` + `data:changed` | ✅ |
| 库存盘点 `InventoryCheck` | 局部刷新 | 无 | ⚠️ 可补 useSync |
| 物料数据库 `MaterialDatabase` | 局部刷新 | 无 | ⚠️ 可补 useSync |
| 仓位图 `WarehouseLocationMap` | 局部刷新 | 无 | 豁免（可视化） |
| 标签打印 `LabelPrint` | 局部刷新 | 无 | 豁免（打印） |
| 色卡 `ColorCard` / `MaterialColorCard` | 局部刷新 | 无 | 豁免（配置） |
| 出库接收 `OutstockReceive` | 局部刷新 | `stock:changed` | ⚠️ 可补 useSync |
| 电商订单 `EcommerceOrders` | 局部刷新 | 无 | ⚠️ 可补 useSync |
| 商品信息 `ProductInfo` | 局部刷新 + `useProductList` | 无 | ⚠️ 可补 useSync |

### 4.3 基础模块（basic）

| 页面 | 刷新机制 | 事件监听 | 状态 |
|------|---------|---------|------|
| 款式列表 `StyleInfoList` | 局部刷新 + `useStyleActions` | `data:changed` | ✅ |
| 款式详情 `StyleInfo` | `useStyleDetail` + `useStyleList` | `data:changed` | ✅ |
| 订单管理 `OrderManagement` | `useSync('order-management', ...)` + `useOrderDataFetch` | `order:updated` + `data:changed` | ✅ |
| 工序模板 `MaintenanceCenter` | 局部刷新 | 无 | 豁免（配置） |
| 模板中心 `TemplateCenter` | 局部刷新 | 无 | 豁免（配置） |
| 纸样修订 `PatternRevisionManagement` | 局部刷新 | `data:changed` | ⚠️ 可补 useSync |
| 数据中心 `DataCenter` | 局部刷新 | 无 | 豁免（报表） |

### 4.4 财务模块（finance）

| 页面 | 刷新机制 | 事件监听 | 状态 |
|------|---------|---------|------|
| 工资发放 `WagePayment` | `useSync` + `usePaymentData` | `data:changed` | ✅ |
| 物料对账 `MaterialReconciliation` | `useSync` + `useMaterialReconData` | `data:changed` | ✅ |
| 费用报销 `ExpenseReimbursement` | `useSync` + `useExpenseListData` | `data:changed` | ✅ |
| 应付列表 `PayableList` | 局部刷新 | `data:changed` | ⚠️ 可补 useSync |
| 收款列表 `ReceivableList` | 局部刷新 | `data:changed` | ⚠️ 可补 useSync |
| 财务中心 `FinanceCenter` | `useDashboardData` | `data:changed` | ✅ |
| 财务看板 `FinanceDashboard` | `useFinanceBIData` | `data:changed` | ✅ |
| 工资操作汇总 `PayrollOperatorSummary` | `usePayrollData` | `data:changed` | ✅ |
| 员工预支 `EmployeeAdvance` | 局部刷新 | 无 | ⚠️ 可补 useSync |
| 费用管理 `ExpenseManagement` | 局部刷新 | 无 | ⚠️ 可补 useSync |
| 订单损耗分析 `OrderWasteAnalysis` | 局部刷新 | 无 | 豁免（报表） |
| 付款计划 `PaymentSchedule` | 局部刷新 | 无 | ⚠️ 可补 useSync |
| 税务工具 `TaxTools` / `TaxExport` | 局部刷新 | 无 | 豁免（导出） |
| 电商销售收入 `EcSalesRevenue` | 局部刷新 | 无 | ⚠️ 可补 useSync |

### 4.5 看板模块（dashboard）

| 页面 | 刷新机制 | 事件监听 | 状态 |
|------|---------|---------|------|
| 运营看板 `Dashboard` | `useSync('dashboard-stats', ...)` + `useDashboardStats` | `data:changed` + `order:progress:changed` | ✅ |
| 每日简报 `DailyBriefingCard` | 父组件刷新 | 父级传递 | ✅ |
| 交期风险 `DeliveryRiskCard` | 父组件刷新 | 父级传递 | ✅ |
| 补货建议 `RestockSuggestionCard` | 父组件刷新 | 父级传递 | ✅ |
| 延期阶段拆解 `DelayedStageBreakdown` | `useDelayedStageBreakdown` | `order:progress:changed` | ✅ |
| 订单裁剪图 `OrderCuttingChart` | 父组件刷新 | 父级传递 | ✅ |
| 扫码统计图 `ScanCountChart` | 父组件刷新 | 父级传递 | ✅ |
| Top 统计 `TopStats` | 父组件刷新 | 父级传递 | ✅ |
| 逾期订单表 `OverdueOrderTable` | 父组件刷新 | 父级传递 | ✅ |

### 4.6 其他模块

| 模块 | 页面 | 刷新机制 | 状态 |
|------|------|---------|------|
| intelligence | 智能大屏 `IntelligenceScreen` | `useSync` | ✅ |
| intelligence | AI 执行面板 `AiExecutionPanel` | `useSync` | ✅ |
| intelligence | AI 质量看板 `AiQualityDashboard` | 局部刷新 | ⚠️ 可补 useSync |
| intelligence | Agent 追踪中心 `AiAgentTraceCenter` | 局部刷新 | ⚠️ 可补 useSync |
| intelligence | 驾驶舱 `Cockpit` | 局部刷新 | ⚠️ 可补 useSync |
| system | 用户列表 `UserList` | `useSync` + `useUserListData` | ✅ |
| crm | 客户仪表盘 `CrmDashboard` | 局部刷新 | ⚠️ 可补 useSync |
| crm | 应收列表 `ReceivableList` | 局部刷新 | ⚠️ 可补 useSync |
| ecommerce | 电商中心 `EcommerceCenter` | 局部刷新 | ⚠️ 可补 useSync |
| integration | 集成中心 `IntegrationCenter` | 局部刷新 | 豁免（配置） |

---

## 五、新增页面检查清单

新页面开发时**必须**逐项检查（Code Review 必查项）：

| # | 检查项 | 是/否 | 备注 |
|---|--------|------|------|
| 1 | 页面是否展示业务数据？ | 是→必须订阅事件；否→可豁免 | 列表/详情/看板/统计/扫码历史均属于业务数据 |
| 2 | 小程序：是否调用 `bindPageEvents`？ | 必查 | 在 `onLoad` 中调用 |
| 3 | 小程序：`onUnload` 是否调用 `unbindPageEvents`？ | 必查 | 防止内存泄漏 |
| 4 | 小程序：是否按业务场景追加额外事件？ | 必查 | 默认仅订阅 DATA_CHANGED + REFRESH_ALL，需追加 SCAN_SUCCESS 等 |
| 5 | PC 前端：是否使用 `useSync` 轮询？ | 必查 | 来自 `@/utils/syncManager` |
| 6 | PC 前端：是否监听 `window` 事件？ | 必查 | `window.addEventListener('data:changed', handler)` |
| 7 | PC 前端：`useEffect` cleanup 是否 `removeEventListener`？ | 必查 | 防止内存泄漏 |
| 8 | PC 前端：写操作后是否 `dispatchEvent`？ | 必查 | `window.dispatchEvent(new Event('xxx:changed'))` |
| 9 | 刷新函数名是否正确？ | 必查 | 小程序用 `loadData`；PC 用 `fetchFn` 传给 useSync |
| 10 | 是否误用 `onShow` 作为唯一刷新入口？ | 禁止 | onShow 是页面生命周期，但跨页面事件不会触发 onShow |

**Code Review 模板**（粘贴到 PR 描述）：

```
## 事件订阅检查
- [ ] 页面展示业务数据？是/否
- [ ] 小程序：bindPageEvents 已接入？是/否/NA
- [ ] 小程序：onUnload 已 unbind？是/否/NA
- [ ] 小程序：额外事件已追加？是/否/NA
- [ ] PC：useSync 已接入？是/否/NA
- [ ] PC：window.addEventListener 已接入？是/否/NA
- [ ] PC：cleanup removeEventListener？是/否/NA
- [ ] PC：写操作后 dispatchEvent？是/否/NA
```

---

## 六、操作-刷新对照表

每个写操作对应的刷新机制。**写操作完成后必须触发对应事件**，否则其他页面不会刷新。

| 操作 | 触发事件 | 订阅页面 | 实现方式 |
|------|---------|---------|---------|
| 扫码（工序/质检/入库） | `triggerDataRefresh('scan')` → DATA_CHANGED + REFRESH_ALL + SCAN_SUCCESS | 订单详情/看板/扫码历史/所有业务列表 | 小程序：`triggerDataRefresh('scan', { orderId })` |
| 撤回扫码 | `triggerDataRefresh('scan')` + SCAN_UNDO | 同上 | 小程序：`triggerDataRefresh('scan')` + `eventBus.emit(Events.SCAN_UNDO, { recordId })` |
| 关单 | `order:progress:changed` + `data:changed` | 订单列表/看板/生产进度详情 | PC：`window.dispatchEvent(new Event('order:progress:changed'))` + `window.dispatchEvent(new Event('data:changed'))` |
| 出入库 | `warehouse:in` + `data:changed` | 成品库存/物料库存/订单详情 | PC：`window.dispatchEvent(new Event('warehouse:in'))` + `data:changed` |
| 样衣操作（借出/归还/转出库） | `data:changed` | 款式列表/样衣库存 | PC：`window.dispatchEvent(new Event('data:changed'))` |
| 物料领料 | `data:changed` | 物料库存/领料列表 | PC：`window.dispatchEvent(new Event('data:changed'))` |
| 物料采购入库 | `warehouse:in` + `data:changed` | 物料库存/采购列表 | PC：`window.dispatchEvent(new Event('warehouse:in'))` |
| 裁剪分菲 | `task:bundled` + `data:changed` | 裁剪任务列表/裁剪分菲详情 | 小程序：`triggerDataRefresh('cutting')` + `eventBus.emit(Events.TASK_BUNDLED, { bundleNo })` |
| 领取/退回任务 | `task:received` / `task:returned` + `data:changed` | 任务列表/采购任务详情 | 小程序：`eventBus.emit(Events.TASK_RECEIVED, { taskId })` |
| 质检完成 | `quality:checked` + `data:changed` | 质检详情/订单详情 | 小程序：`eventBus.emit(Events.QUALITY_CHECKED, { orderId })` |
| 返修完成 | `quality:repaired` + `data:changed` | 同上 | 小程序：`eventBus.emit(Events.QUALITY_REPAIRED, { orderId })` |
| 订单状态变更 | `order:status:changed` + `data:changed` | 订单列表/看板 | 小程序：`eventBus.emit(Events.ORDER_STATUS_CHANGED, { orderId, status })` |
| 工资发放 | `data:changed` | 工资列表/工资发放页 | PC：`window.dispatchEvent(new Event('data:changed'))` |
| 费用报销提交 | `data:changed` | 报销列表/财务中心 | PC：`window.dispatchEvent(new Event('data:changed'))` |
| 物料对账确认 | `data:changed` | 对账列表/财务中心 | PC：`window.dispatchEvent(new Event('data:changed'))` |
| 用户审批 | `data:changed` | 用户列表 | PC：`window.dispatchEvent(new Event('data:changed'))` |

### 6.1 triggerDataRefresh 便捷方法

小程序 `utils/eventBus.js` 提供 `triggerDataRefresh(dataType, payload)`：
- 自动触发 `DATA_CHANGED` + `REFRESH_ALL` 两个事件
- 所有订阅了默认事件的页面都会刷新
- `dataType` 可选值：`scan` / `order` / `task` / `quality` / `warehouse` / `stock` / `cutting` / `style`

```javascript
const { triggerDataRefresh } = require('../../../utils/eventBus');

// 扫码后
triggerDataRefresh('scan', { orderId: 123, recordId: 456 });

// 关单后
triggerDataRefresh('order', { orderId: 123, action: 'close' });
```

### 6.2 PC 前端 dispatchEvent 模板

```typescript
// 写操作完成后（如关单、入库、领料）
const handleCloseOrder = async () => {
  await closeOrder(orderId);
  // 1. 通知订单进度变更
  window.dispatchEvent(new Event('order:progress:changed'));
  // 2. 通知通用数据变更（兜底）
  window.dispatchEvent(new Event('data:changed'));
  // 3. useSync 轮询会在下个周期自动拉取最新数据
};
```

---

## 七、维护与更新

### 7.1 何时更新本文档

| 触发场景 | 更新内容 |
|---------|---------|
| 新增页面 | 在第三节或第四节追加，标注状态 |
| 页面修改订阅事件 | 更新对应行的"订阅事件"列 |
| 新增事件类型 | 在第二节追加事件定义 |
| 修复"操作后不刷新"bug | 在第三节 3.2 追加修复记录 |
| Code Review 发现遗漏 | 补充到检查清单 |

### 7.2 扫描脚本（推荐）

定期运行以下命令扫描未接入 eventBus 的业务页面：

```bash
# 小程序：找出未调用 bindPageEvents 的业务页面
grep -rL "bindPageEvents" miniprogram/pages/*/index.js miniprogram/pages/*/*/index.js | grep -v utils

# PC 前端：找出未使用 useSync 的业务页面
grep -rL "useSync" frontend/src/modules/*/pages/*/index.tsx frontend/src/modules/*/pages/*/*/index.tsx
```

### 7.3 关联文档

- `miniprogram/utils/eventBus.js` — 小程序事件总线定义
- `miniprogram/utils/pageEventBinder.js` — 小程序页面事件绑定工具
- `frontend/src/utils/syncManager.ts` — PC 前端同步管理器（含 useSync）
- `.trae/rules/optimization-log-20260611.md` — D-017 永久移除 WebSocket 全局广播的决策记录
- `memory-bank/anti-patterns.md` — 反模式速查（含"操作后不刷新"）
- `memory-bank/change-impact-matrix.md` — 变更影响矩阵

---

## 八、历史背景

### 8.1 为什么有这份文档

2026-07-09 全量扫描发现 **17 个业务页面完全未接入 eventBus**，导致"扫码后订单详情不刷新""关单后看板不更新""入库后库存列表不刷新"等用户反复投诉的问题。

根因：早期开发时 eventBus 接入靠"开发者自觉"，无统一工具和检查清单。部分页面只写了 `onShow` 刷新（页面切换时触发），但跨页面事件不会触发 `onShow`，导致跨页面数据不同步。

### 8.2 修复方案

1. **统一工具**：`utils/pageEventBinder.js` 封装 `bindPageEvents` / `unbindPageEvents`，默认订阅 DATA_CHANGED + REFRESH_ALL
2. **批量修复**：17 个页面统一接入，按业务场景追加额外事件
3. **本文档**：建立白名单，新页面开发必须对照检查

### 8.3 与 D-017 的关系

D-017（2026-06-11）永久移除 WebSocket 全局广播，业务通知改为：
- 跨页面通知：eventBus（小程序）/ window event（PC）
- 本地提示：操作返回值直接展示

本文档是 D-017 的配套执行规范，确保 eventBus 接入完整，弥补 WebSocket 移除后的通知能力。

---

> 本文档由质量守门员维护。如发现遗漏或错误，请更新本文档并在 PR 中关联。

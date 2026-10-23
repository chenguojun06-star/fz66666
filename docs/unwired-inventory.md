# 「做了没接」未接线方法盘点与判定结论（D-851/D-852）

> 生成：2026-10-23｜当前存量 **157 处**（原始 164，已接线 8 处）
> 门禁：`python3 scripts/check-unwired.py --check`（baseline 只减不增，CI 已接入）
> 全量明细：`python3 scripts/check-unwired.py --classify --all`

## 判定口径

「未接线」= public 方法全后端零调用。已排除 Spring 端点/`@Scheduled`/`@EventListener`/`@PostConstruct` 等框架回调，排除 getter/setter。

**未接线 ≠ 缺陷**。逐个核实后分四类：**已接线（真缺陷）/ 预留能力 / 已被取代（废弃）/ 运维批量入口**。

## 一、已接线（真缺陷，8 处）——这些不是死代码，是漏接

| 位置 | 缺失的审计 | 为什么必须记 |
|---|---|---|
| `CuttingBomOrchestrator.delete` | 删整行面辅料 | 物料消失查不到谁删的 |
| `PayableOrchestrator.generateFromOrder` | 应付从订单生成 | **凭空多一笔应付**的资金动作 |
| `PayableOrchestrator.createFromBill` | 应付从账单派生 | 同上 |
| `PurchaseCartOrchestrator.updateItem` | 改数量/单价 | 同类的 deleteItem 早记了，这两个漏 |
| `PurchaseCartOrchestrator.clearCart` | 一键清空采购车 | 高破坏动作 |
| `SampleStockOrchestrator.loan` | 样衣借出 | 库存减少查不到借给谁 |
| `StyleBomOrchestrator.generatePurchase` | 一键生成采购单 | 生成了多少单无记录 |
| `InventoryCheckOrchestrator.applyStockAdjustments` | **盘点确认改库存** | 物料/成品/样衣三种库存直接改，此前零操作日志 |

**这解释了「操作日志内容全是 -」的另一半根因**：不只是 AOP 键名单缺键，而是这些细粒度日志方法压根没接线。

## 二、预留能力（保留，约 110 处）

| 类别 | 数量 | 核实结论 |
|---|---|---|
| AI 能力库 | 81 | prompt 变体持久化、向量清理、画像构建、工具库——供 `AiTool` 按需调用或尚未接入对话流程。已确认工具通过 `List<AiTool>` 注入（非反射），当前未用的是路线图能力 |
| 物料库日志 | 3 | `appendStockIn/appendStockOut/appendPriceChange`——`MaterialDatabaseOrchestrator` **没有库存/改价方法**（物料库存走 `MaterialStockMapper`），属未来物料库库存管理的预留 |
| 外部财务对接 | 12 | 金蝶/用友同步、对账批量同步——当前未接财务系统，预留 |
| 外部集成 | 11 | 飞书通知、EC 死信、租户应用列表——多平台抽象，当前只用了部分 |
| 脱敏列表版 | 3 | 单条版在 `ScanRecordController` 生效；列表接口目前手工遍历脱敏（冗余但有覆盖）。**待优化项**：其他返回手机号/价格的列表需逐个确认 |
| 款式域批量 | 13 | 重置审核状态、成本差异持久化、模板批量套用——批量/运维入口，给定时任务或后台用 |

## 三、已被取代（废弃，3 处）

| 位置 | 取代者 |
|---|---|
| `DataPermissionHelper.applyOperatorFilter` + `applyOwnFilter` | `DataScopeAspect`（`@DataScope` 注解）+ `DataPermissionInterceptor`（SQL 改写，`MybatisPlusConfig` 已注册）——链路完整，非权限缺失 |
| `MaterialPickupReceivableOrchestrator.syncAfterApproval` | **D-133 方案**：面料费用统一走「扣款抵扣」，不再推应收（代码注释明确） |

## 四、运维/批量入口（保留，约 20 处）

`DatabaseMigrationHelper.viewExists`、`ProductionCleanupOrchestrator.cleanupOrphanData/deleteFullLinkByOrderKey`、`DeliverySlaOrchestrator.batchRefreshSla`、`OrderCostSummaryHelper.summaryAllInternalOrders`、`TemplateStyleOrchestrator.batchApplyBomTemplate/batchApplyProcessTemplate`、`MaterialReconciliationSyncOrchestrator.syncFromPurchase/syncByDateRange` 等——均为「阶段性批量/修复」入口，由运维脚本或后台调用。

## 五、待业务确认（3 处，无入口但可能需要）

| 位置 | 情况 |
|---|---|
| `StyleInfoOrchestrator.deleteWithApproval` | 款式「审批删除」写了但无入口；当前删除走别的路径（无审批）。若需要删除审批流，需接 Controller |
| `ProductionProcessTrackingOrchestrator.createWarehousingTrackingOnScan` | 入库扫码自动建进程记录未接；现有 `repairWarehousingTracking`（事后修复）覆盖了补偿 |
| `IntegrationRecordService.savePaymentRecord` | 支付记录保存无调用；POS 支付落库走别的路径 |

## 六、防复发机制

1. `scripts/unwired-baseline.txt`：157 条存量锁死，**只允许减少**
2. CI `quality-gate` 新增门禁步骤，新增未接线即红（已双向验证：注入探针→拦下，恢复→绿）
3. baseline 键 = `文件::方法签名`（**不用行号**——D-840 已踩过行号做键导致集体误报；签名必须压平换行，否则一条拆成多条造成假新增）

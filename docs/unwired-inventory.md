# 「做了没接」未接线方法盘点与判定结论（D-851/D-852 → D-877 复核修订）

> 生成：2026-10-23｜更新：2026-10-24（D-858 口径订正）｜**2026-10-25 D-877 逐类复核修订 / D-878 首批缺口接线**｜当前存量 **149 处**
> （原始 164 − 已接线 8 处 − 删除语义重复方法 1 处 = 155；D-878 接线 6 处 → 149；实测 `baseline: 149 条 / 当前: 149 条`）
> 门禁：`python3 scripts/check-unwired.py --check`（baseline 只减不增，CI 已接入）
> 全量明细：`python3 scripts/check-unwired.py --classify --all`

## 判定口径

「未接线」= public 方法全后端零调用。已排除 Spring 端点/`@Scheduled`/`@EventListener`/`@PostConstruct` 等框架回调，排除 getter/setter。

**未接线 ≠ 缺陷，更 ≠ 该删**。D-877 按「同模块其他方法是否在用」逐类复核（字段名可能是 `logAppendHelper` 等而非类名驼峰，直接搜类名驼峰会漏判），把原「预留 123 处」一刀切重新分为四类：**真缺口（该补）/ 真死代码（可删）/ 外部对接预留（留）/ 待确认**。

⚠️ **复核纠错**：原文档称 AI 类「通过 List<AiTool> 注入」——实测**全后端 0 个类 implements AiTool**（工具实现在 `agent/tool/` 包、全部接线），该说法不成立；原「预留」把大量半接线缺口（审计日志族、风险/任务生命周期）误定性为路线图能力。

## 一、已接线（真缺陷，14 处）——历史修复 + D-878 首批

### 1.1 D-848/851 历史修复（8 处）

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

### 1.2 D-878 工资支付审计接线（6 处，2026-10-25）

D-877 复核出的首批真缺口，已全部接到 `WagePaymentOrchestrator` / `PayableAggregationHelper` 的对应写操作之后，并新增 8 个用例守护（行为 7 + 接线守护 1）。

| 方法 | 接入点 | 此前状态 |
|---|---|---|
| `appendCancelPayment` | `cancelPayment` | 取消支付零日志 |
| `appendRefundPayment` | `refundPayment` | 退回付款零日志（仅主管可操作，风险更高） |
| `appendRejectPayable` | `rejectByPaymentId` / `rejectByBizId` | 驳回应付零日志 |
| `appendConfirmOfflinePayment` | `confirmOfflinePayment` | 确认线下支付零日志 |
| `appendCreatePendingPayable` | `PayableAggregationHelper.createPendingPayable` | 创建待付工资单零日志 |
| `appendSaveAccount` | `saveAccount` | 新增/修改收款账户零日志 |

**顺带修正两个语义错误**（原方法虽零调用，但参数语义是错的，接线前必须先修，否则日志会挂错对象）：
- `appendSaveAccount` 原第一参是 `ownerId`（收款人）→ 改为 `accountId`（账户主键），并新增 `isUpdate` 区分「新增/修改收款账户」
- `appendCreatePendingPayable` / `appendRejectPayable` 原第一参名为 `payeeId` → 改为 `paymentId`（日志 targetId 必须指向被操作的单据）

## 二、真缺口：半接线子系统（约 20 处，**该补不该删**）——D-877 复核结论

共同形态：**核心动作接了，生命周期/收尾动作没接**。删掉它们不会让系统更健康，只会让「记录了却永远关不掉/清不掉/没日志」的状态永久化。

> 原 26 处中的资金审计 6 处已由 D-878 接线（见 1.2），余约 20 处待排期。

### 2.1 AI 子系统生命周期缺口（16 处）

| 类 | 在用的方法 | 未接的方法（后果） |
|---|---|---|
| `OrderRiskTrackingOrchestrator` | `createRisk` | `resolveRisk`/`clearRisk`/`escalateRisk`/`reopenRisk`——**风险只增不减，永远关不掉** |
| `TaskTrackerOrchestrator` | `recordTask` | `completeTask`/`expireStaleTasks`/`listPendingTasksByAgent`/`listPendingTasksBySession`——任务只记不销、查不了 |
| `MemoryNudgeOrchestrator` | `analyzeAndNudge` | `acceptNudge`/`dismissNudge`——用户对 AI 提醒无响应入口 |
| `QuickAnswerOrchestrator` | `saveSnapshotWithTransaction` | `cleanExpiredWithTransaction`（缓存只写不清）/ `savePrebuiltWithTransaction`（无预热） |
| `AgentMemoryService` | `purgeExpired`/`setCoreMemory` | `clearWorkingMemory`/`deleteCoreMemory` |
| `AdvisorSessionOrchestrator` | `saveConversationTurn`/`list*Messages` | `buildProfilePrompt`/`loadSessionContext` |

### 2.2 业务日志族零散缺口（4 处）

| 类 | 在用的兄弟方法 | 未接的方法 |
|---|---|---|
| `MaterialInboundLogAppendHelper` | `appendInbound`/`appendOperation` | `appendQualityCheck`（质检结果无日志） |
| `ProductWarehousingLogAppendHelper` | 7 个方法在用 | `appendBatchWarehousing`（批量入库无日志，单条有） |
| `ProductionOrderLogAppendHelper` | `appendOperation` | `appendCreateFromStyle` |
| `StockChangeLogOrchestrator` | `list`（读接口在用） | `logChange`（**写侧零调用**——需核实变更日志表是否空转，或写走 Mapper 直连） |

## 三、真死代码（可删，约 10 处）——有明确取代者或整体休眠

| 位置 | 判定依据 |
|---|---|
| `DataPermissionHelper.applyOperatorFilter` + `applyOwnFilter` | 被 `DataScopeAspect` + `DataPermissionInterceptor` 完全取代，链路完整 |
| `MaterialPickupReceivableOrchestrator.syncAfterApproval` | D-133 方案明确不再推应收（代码注释） |
| `PurchaseCartLogAppendHelper.appendUpdateQuantity` | 同 helper 内 `appendUpdateItem` 已在 `PurchaseCartOrchestrator` 使用，此为重复方法 |
| 整体休眠类（类名全文 0 外部引用） | `EcRefundOrchestrator`（电商退款编排器）、`CostVarianceOrchestrator`、`ProductionCleanupOrchestrator`、`ProductionStyleOrchestrator`、`SecondaryProcessServiceImpl`、`StyleProcessServiceImpl`——整条功能线未启用，删或留需业务拍板 |

## 四、外部对接预留（约 21 处，留）

| 类别 | 数量 | 结论 |
|---|---|---|
| 外部财务（金蝶/用友同步、对账批量） | ~10 | 未接财务系统，预留 |
| 外部集成（飞书通知、EC 死信、租户应用列表） | ~11 | 多平台抽象，当前只用部分 |

## 四补、尚未按 D-877 方法逐个复核的（约 98 处）

intelligence 包共 82 处，本节二.2 只核实了其中 16 处（OrderRisk/TaskTracker/MemoryNudge/QuickAnswer/AgentMemory/AdvisorSession）；**其余约 66 处**（`AiAgentMetricsService` 5、`MemoryBankService` 5、`ContextEngineeringService` 4、prompt 变体族 8、Qdrant/Onnx/知识图谱等）沿用原文档「AI 能力库路线图」定性，**未经验证，按同法下一批复核**。另有款式域批量、脱敏列表版、运维批量入口等约 32 处同样待复核。

> 复核方法见第六节第 4 条：按实际字段名搜调用 + 看兄弟方法是否在用。

## 五、待业务确认（3 处，无入口但可能需要）

| 位置 | 情况 |
|---|---|
| `StyleInfoOrchestrator.deleteWithApproval` | 款式「审批删除」写了但无入口；当前删除走别的路径（无审批）。若需要删除审批流，需接 Controller |
| `ProductionProcessTrackingOrchestrator.createWarehousingTrackingOnScan` | 入库扫码自动建进程记录未接；现有 `repairWarehousingTracking`（事后修复）覆盖了补偿 |
| `IntegrationRecordService.savePaymentRecord` | 支付记录保存无调用；POS 支付落库走别的路径 |

## 六、防复发机制

1. `scripts/unwired-baseline.txt`：155 条存量锁死，**只允许减少**
2. CI `quality-gate` 新增门禁步骤，新增未接线即红（已双向验证：注入探针→拦下，恢复→绿）
3. baseline 键 = `文件::方法签名`（**不用行号**——D-840 已踩过行号做键导致集体误报；签名必须压平换行，否则一条拆成多条造成假新增）
4. **D-877 复核方法留档**：判「未接线」时必须按**实际字段名**搜调用（Spring 注入字段常叫 `logAppendHelper`/`taskTracker` 等，不是类名驼峰），并看同模块兄弟方法是否在用——两者结合才能区分「半接线缺口」与「整体休眠」，避免把缺口当预留、把死代码当能力


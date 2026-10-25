# 「做了没接」未接线方法盘点与判定结论（D-851/D-852 → D-877 复核修订）

> 生成：2026-10-23｜更新：2026-10-24（D-858 口径订正）｜**2026-10-25 D-877 逐类复核 / D-878 工资审计 6 / D-879 风险闭环 4 / D-880 任务追踪 3**｜当前存量 **142 处**
> （原始 164 − 已接线 8 处 − 删除语义重复方法 1 处 = 155；D-878 →149；D-879 →145；D-880 →142；实测 `baseline: 142 条 / 当前: 142 条`）
> ⚠️ **本门禁是字面量统计**：方法名出现在注释里也会被当成「已接线」（D-875/D-880 两次踩到）。写注释时**不要写出未接线方法的完整方法名**，否则门禁假绿。
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

### 1.3 D-879 订单风险闭环（4 处，2026-10-25）

| 方法 | 接入方式 | 此前状态 |
|---|---|---|
| `resolveRisk` | 评估引擎自动解除（订单回到 safe/warning）+ 控制器人工处理 | 风险解除后记录永远 pending，处理率恒 0 |
| `reopenRisk` | 评估引擎检测到复现时重开原记录 | 复现只能插新记录，历史断裂 |
| `escalateRisk` | `POST /api/intelligence/risk-tracking/{id}/escalate` | 无任何出口 |
| `clearRisk` | `POST /api/intelligence/risk-tracking/{id}/clear` | 无任何出口 |

**同时修复的两个结构性问题**（比接线本身更重要）：
1. **风险表无限膨胀**：原实现每次交期评估都给同一订单插一条新 pending 记录（评估由行动中心/小云/接口随时触发）→ 改为「已有未闭环风险只刷新等级，不重复插入」
2. **没有出口**：风险写入后全系统无读取路径（`getRiskStats` 因 getter 命名被门禁排除，实际零调用）→ 补 `GET /list` + `GET /stats`

**安全边界**：自动解除只针对**本次评估结果里出现过的订单**——`assess` 支持按工厂/条件过滤，不在结果里 ≠ 风险已解除。

**未做（待产品决定）**：前端入口。当前可通过接口/小云处理；是否在行动中心加「风险处理」按钮需单独排期（避免重犯 D-853「端点有了但人看不到」）。

### 1.4 D-880 AI 任务追踪（3 处，2026-10-25）

| 方法 | 接入方式 | 此前状态 |
|---|---|---|
| `expireStaleTasks` | `@Scheduled(cron="0 23 * * * ?")` 每小时扫一次 | 只有方法没有调度，任务永不过期 |
| `completeTask` | `recordTask` 内收口同目标的旧 PENDING（「已被后续操作取代」） | 无任何调用方，同一订单被反复操作会堆几十条 PENDING |
| `listPendingTasksByAgent` | `GET /api/intelligence/task-center/ai-tasks?agentName=`（默认当前登录人） | 全系统无读取路径 |

**未接（1 处，需前置条件）**：会话维度待办列表——Agent 工具执行链路没有贯通 sessionId，任务与会话的绑定方法也无调用方；接了只会永远返回空。前置工作是把 sessionId 从 Agent 循环一路传到工具钩子。

## 二、真缺口：半接线子系统（约 13 处，**该补不该删**）——D-877 复核结论

共同形态：**核心动作接了，生命周期/收尾动作没接**。删掉它们不会让系统更健康，只会让「记录了却永远关不掉/清不掉/没日志」的状态永久化。

> 原 26 处中：资金审计 6（D-878）、订单风险 4（D-879）、任务追踪 3（D-880）已接线，余约 13 处待排期。

### 2.1 AI 子系统生命周期缺口（9 处）

| 类 | 在用的方法 | 未接的方法（后果） |
|---|---|---|
| `TaskTrackerOrchestrator` | `recordTask`（含 D-880 收口旧任务） | 会话维度待办列表——**需 sessionId 从 Agent 循环贯通到工具钩子**，当前无数据源，接了只会永远返回空 |
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


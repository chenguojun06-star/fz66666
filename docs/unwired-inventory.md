# 「做了没接」未接线方法盘点与判定结论（D-851/D-852 → D-877 复核修订）

> 生成：2026-10-23｜更新：2026-10-24（D-858 口径订正）｜**2026-10-25 D-877 逐类复核 / D-878 工资审计 6 / D-879 风险闭环 4 / D-880 任务追踪 3 / D-881 业务日志甄别 4 / D-882 秒答缓存清理 1 / D-883 剩余 4 组核实**｜当前存量 **140 处**
> （原始 164 − 已接线 8 处 − 删除语义重复方法 1 处 = 155；D-878 →149；D-879 →145；D-880 →142；D-881 →141；D-882 →140；实测 `baseline: 140 条 / 当前: 140 条`）
> ✅ **D-877 的 26 处「真缺口」已全部有结论**：接线 15 处 + 核实不接 10 处 + 前置条件 1 处（sessionId 贯通）。剩余 140 处存量 = 外部对接预留约 21 + 真死代码约 10 + 款式域批量/脱敏/运维入口约 32 + intelligence 待下批复核约 66 + 其他，均非 D-877 口径的「半接线缺口」。
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

### 1.5 D-882 秒答缓存过期清理（1 处，2026-10-25）

| 方法 | 接入方式 | 此前状态 |
|---|---|---|
| `cleanExpiredWithTransaction` | `@Scheduled(cron="0 47 * * * ?")` 每小时执行 | 清理逻辑写得很完整（软删过期行 + 硬删已软删 1 天以上的行）但零调用，**本地库实测 `t_quick_answer` 积了 387 行软删僵尸**（390 条 SNAPSHOT 里 387 条 `delete_flag=1`，硬删步骤从未跑过；快照每次刷新都软删旧行，僵尸只增不减） |

**同组甄别不接（1 处）**：`savePrebuiltWithTransaction`——预构建能力已由 `QuickAnswerInitializer` 覆盖（启动时导入 6 条公共 PREBUILT 模板），编排器方法零调用，归入「已被取代」。改造 Initializer 走编排器的收益低且动启动路径，不做。

## 二、真缺口：半接线子系统（约 8 处，**该补不该删**）——D-877 复核结论

共同形态：**核心动作接了，生命周期/收尾动作没接**。删掉它们不会让系统更健康，只会让「记录了却永远关不掉/清不掉/没日志」的状态永久化。

> 原 26 处中：资金审计 6（D-878）、订单风险 4（D-879）、任务追踪 3（D-880）、批量入库日志 1（D-881）、秒答缓存清理 1（D-882）已接线；其余经 D-881/D-883 逐个核实——业务日志 3 处、AI 生命周期 6 处、秒答预构建 1 处共 10 处判定「业务动作不存在/已被取代/整体休眠/需主链路改造」，**均不接**（依据见 2.2/2.3）。D-877 的「真缺口」清单到此全部有结论。

### 2.1 AI 子系统生命周期缺口（8 处）

| 类 | 在用的方法 | 未接的方法（后果） |
|---|---|---|
| `TaskTrackerOrchestrator` | `recordTask`（含 D-880 收口旧任务） | 会话维度待办列表——**需 sessionId 从 Agent 循环贯通到工具钩子**，当前无数据源，接了只会永远返回空 |
| `MemoryNudgeOrchestrator` | `analyzeAndNudge` | `acceptNudge`/`dismissNudge`——用户对 AI 提醒无响应入口 |
| `QuickAnswerOrchestrator` | `saveSnapshotWithTransaction` | `savePrebuiltWithTransaction`——**已被取代**：预构建能力由 `QuickAnswerInitializer` 启动导入公共模板（6 条 PREBUILT），此方法零调用 |
| `AgentMemoryService` | `purgeExpired`/`setCoreMemory` | `clearWorkingMemory`/`deleteCoreMemory` |
| `AdvisorSessionOrchestrator` | `saveConversationTurn`/`list*Messages` | `buildProfilePrompt`/`loadSessionContext` |

> QuickAnswer 的 `cleanExpiredWithTransaction` 已由 **D-882** 接线（见 1.5）。

### 2.3 D-883 剩余 4 组逐个核实（2026-10-25）——**全部不接，且原「缺口」定性全部不成立**

| 方法 | D-877 原判定 | D-883 核实结论 | 处置 |
|---|---|---|---|
| `clearWorkingMemory` | 缓存只写不清 | 工作记忆在 **Redis**，`setWorkingMemory` 写入即带 **24h TTL**（`WORKING_MEMORY_TTL_HOURS`），过期自动清，无堆积路径 | **不接**（TTL 自维护） |
| `deleteCoreMemory` | 记忆只进不出 | `t_agent_memory_core` **0 行**。核心记忆整套只有超管手动端点（`IntelligenceAdminController.setCoreMemory`），主对话链路用的是 `MemoryBankService` 那套。写路径从未被真实使用 | **不接**（整体休眠，删留待业务拍板） |
| `loadSessionContext` | 会话上下文未加载 | 零调用实锤，但暴露更大的事实：**主对话只写历史（`saveConversationTurn`）不注入 prompt**——读路径只有前端展示（`HyperAdvisorController.listRecent/SessionMessages`）。小云每轮对话对 AI 本身是无记忆的，D-871 修的是「前端看得到历史」不是「AI 有记忆」 | **暂不接**（接它 = 改主对话 prompt 组装，影响每轮 token 成本与回答稳定性，需专项评估 + 用户拍板） |
| `buildProfilePrompt` | 画像未注入 | 零调用。画像表 3 行历史数据（最近一条 2026-10-01）从未被注入；画像写入走的是另一条路径 `UserProfileEvolutionOrchestrator.evolveProfile`（挂在主对话 postTurnTasks），`appendBehavior` 才是零调用的那个 | **不接**（画像读链路整体未启用） |
| `acceptNudge`/`dismissNudge` | 用户无法响应提醒 | 零调用，但底层先崩：**`t_memory_nudge` 0 行**——`analyzeAndNudge` 挂在主对话每轮 postTurnTasks 上（还调一次 LLM 做记忆审查），本地库 182 条对话对应 0 条提醒。**提醒功能整体空转，接了也没有数据可操作** | **不接**（无响应对象）；「零产出根因」单列待查 |
| `listPendingTasksBySession` | 任务查不了 | D-880 结论仍成立：Agent 工具执行链路无 sessionId，绑定方法也无调用方 | **不接**（需前置改造） |

**本轮纠正的归属错误**：D-877 文档写的「`AgentMemoryService.purgeExpired` 在用」——实际 `purgeExpired` 属于 `SharedAgentMemoryService`，且已被 `SharedAgentMemoryCleanupJob`（每日 04:00，带分布式锁）调度。结论（清理在工作）碰巧正确，但归属是错的。

**本轮新发现的待查事项**（非 unwired 范畴，建议单独立项）：
1. **MemoryNudge 零产出**：每轮对话花一次 LLM 调用做记忆审查，本地库 182 条对话产出 0 条提醒。需查是 `chatSimple` 失败被 catch 吞了、还是 LLM 每次都判 NONE。若是前者 = 真 bug；若是后者 = 设计失效且**纯成本浪费**（呼应 AI 成本关注点）。生产库需 SSH 查。
2. **主对话无 prompt 记忆注入**（loadSessionContext 那条）：影响小云多轮对话体验，属主链路改造，需排期评估。

### 2.2 业务日志族零散缺口（4 处）——D-881 已逐个甄别：**仅 1 处真缺口，其余 3 处不接**

| 类 | 原判定 | D-881 核实结论 | 处置 |
|---|---|---|---|
| `MaterialInboundLogAppendHelper` | `appendQualityCheck` 质检无日志 | **物料入库质检功能在后端不存在**：`MaterialInbound` 实体无质检字段，`MaterialInboundOrchestrator` 无质检方法（只有到货/补录/手工入库） | **不接**（无调用场景），方法休眠留档 |
| `ProductWarehousingLogAppendHelper` | `appendBatchWarehousing` 批量入库无日志 | **真缺口实锤**：`batchSave` 批量入库 N 个裁捆，只走了财务/进度后动作，**没写操作日志**；而单条 `save` 调了 `appendSingleWarehousing`。同一订单混用两种入库方式时时间轴缺批量那几段 | **已接**（D-881）：`batchSave` 成功后按 `list.size()` 记「批量成品入库 / 共 N 个裁捆」 |
| `ProductionOrderLogAppendHelper` | `appendCreateFromStyle` | **「从款式创建订单」路径不存在**：创建只走 `saveOrUpdateOrder`（已记 `appendCreate`），前端无「从款式建单」入口，排产采纳也不建单 | **不接**，休眠留档 |
| `StockChangeLogOrchestrator` | `logChange` 写侧零调用 | **真实写路径已存在且在工作**：`WarehousingWriteHelper`（成品入库）与 `ProductSkuOrchestrator`（SKU 库存）直连 `StockChangeLogService` 构造实体写库，本地库 `t_stock_change_log` 已有 57 条数据。`logChange` 是没人用的备用写入口 | **不接**（接了会双写，同一变更记两条）。归入「已被取代」 |

> 教训：「兄弟方法在用 = 这个也该接」只对了一半——还必须确认**对应的业务动作真的存在**。
> 4 处里 3 处的业务动作在后端根本不存在（质检无字段无方法 / 建单无此路径 / 写库已走别的通道），
> 为凑数接线只会给不存在的功能写日志、或造成双写。

## 三、真死代码（可删，约 10 处）——有明确取代者或整体休眠

| 位置 | 判定依据 |
|---|---|
| `DataPermissionHelper.applyOperatorFilter` + `applyOwnFilter` | 被 `DataScopeAspect` + `DataPermissionInterceptor` 完全取代，链路完整 |
| `MaterialPickupReceivableOrchestrator.syncAfterApproval` | D-133 方案明确不再推应收（代码注释） |
| `PurchaseCartLogAppendHelper.appendUpdateQuantity` | 同 helper 内 `appendUpdateItem` 已在 `PurchaseCartOrchestrator` 使用，此为重复方法 |
| `StockChangeLogOrchestrator.logChange` | D-881 核实：真实写路径是 `WarehousingWriteHelper` / `ProductSkuOrchestrator` 直连 `StockChangeLogService` 写库（表已有数据），此方法是没人用的备用写入口，接了反而双写 |
| `MaterialInboundLogAppendHelper.appendQualityCheck` | D-881 核实：物料入库质检功能在后端不存在（实体无字段、编排器无方法），无调用场景。**功能若将来建设，此方法可直接启用，不建议删** |
| `ProductionOrderLogAppendHelper.appendCreateFromStyle` | D-881 核实：「从款式创建订单」路径不存在（创建走 `saveOrUpdateOrder` 已记 `appendCreate`）。**同上，休眠留档不删** |

> 注意区分三类：「已被取代」= 有替代实现，可删；「整体休眠」= 整条功能线未启用，删留需业务拍板；「功能未建设」= 业务动作不存在所以方法没接（质检/从款式建单），**方法先留着，功能上线时直接用**。
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


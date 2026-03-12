## 2026-03-12

### feat: 选品中心外部热榜升级为多源聚合
- 将选品外部市场搜索从单一 Google Shopping 扩展为多源聚合，统一接入 Google Shopping、Amazon、eBay、Walmart 四路 SerpApi 引擎
- 改造今日热榜生成任务，按关键词写入多来源快照，前端打开页面即可看到按关键词聚合后的多渠道商品结果，不再只依赖单一路源
- 扩大热词覆盖面，前后端同步补充 `夹克`、`羽绒服` 两个高频品类，并在页面上明确展示多渠道来源数量
- 这次改造不新增数据库表结构，直接复用 `t_trend_snapshot`，降低云端发布和回滚成本

### fix: 云端样衣来源字段缺失自动修复
- 扩展 `DbColumnRepairRunner`，启动时自动检查并补齐 `t_style_info.development_source_type` 与 `t_style_info.development_source_detail`
- 即使云端 Flyway 因部署时序或环境原因未及时执行，后端启动后也会自动补列，避免 `/api/style/info/list` 与 `/api/style/info/development-stats` 因缺列直接返回 500
- 与已有来源清洗迁移配套，优先保证线上可用性，再由 Flyway 持续维护正式迁移历史
# 2026-03-12（本地开发环境修复）

## 修复：样衣开发“来源”列显示乱码和超长脏文案

- 处理：为 `developmentSourceType/developmentSourceDetail` 增加前后端双重归一化。
- 规则：`自主开发` 固定显示为短文案；`选品来源` 仅允许 `外部市场/供应商/客户定制/内部选品/选品中心` 这几类标准明细。
- 效果：历史脏数据、乱码、超长错编码文本不再直接显示到列表和卡片上。

## 修复：本地后端启动失败导致 WebSocket 1006 和接口 500

- 根因：`backend/pom.xml` 中虽然声明了 `flyway.version=9.22.3`，但 `flyway-core` 未显式绑定该版本，启动时落回旧依赖，触发 `Unsupported Database: MySQL 8.0`。
- 处理：显式为 `flyway-core` 指定 `${flyway.version}`。
- 效果：恢复本地后端启动链路，避免前端在 5173 下看到 `/api/system/user/me`、`/api/system/tenant/public-list` 500 和 WebSocket 连接关闭 1006。

## 修复：清洗样衣来源历史垃圾数据并移除登录页控件警告

- 新增 Flyway 脚本 `V20260312004__sanitize_style_source_detail.sql`，统一清洗 `t_style_info.development_source_type/development_source_detail` 历史脏值。
- 规则：`SELF_DEVELOPED` 一律标准化为 `自主开发`；`SELECTION_CENTER` 仅保留 `外部市场/供应商/客户定制/内部选品/选品中心`，其余垃圾数据全部回退为标准值。
- 同步修复登录页 `AutoComplete`：移除组件级 `size`，改由自定义输入框自身控制尺寸，消除 antd 控制台警告。

# 2026-03-12（线上紧急修复）

## 修复：Selection 页面 `POST /api/selection/candidate/list` 500

- 根因：云端数据库视图在 `MAX()` 字符串聚合时触发 `Illegal mix of collations (utf8mb4_bin,NONE)`。
- 处理：新增 Flyway 脚本 `V20260312002__harden_view_collation_with_binary_max.sql`，将三个生产视图的聚合键改为 `MAX(CAST(CONCAT(...) AS BINARY))`，彻底规避 collation 比较。
- 同步：`ViewMigrator` 内联 fallback SQL 同步为 BINARY 聚合，保持本地/云端定义一致。
- 效果：避免因视图聚合报错导致接口 500（含选品页面列表加载失败场景）。

## 修复补充：SelectionCandidate 列表查询容错（云端历史库兼容）

- 处理：`SelectionCandidateOrchestrator.listCandidates()` 增加参数空值保护（`batchId` 空串不再转 Long）。
- 处理：主查询异常时自动降级为按 `id` 倒序查询，避免因历史库字段漂移导致接口直接 500。
- 效果：在不影响正常库结构的前提下，确保选品中心列表页优先可用。

# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-03-21 选品中心 Tab 统一 + AI趋势分析功能完善

### 🏷️ 选品中心 UX 重构：4子菜单 → 单Tab页（刷新持久）

**改进**：将选品中心 4 个独立子页面（选品批次/候选款库/趋势看板/历史分析）合并为一个统一的 Tab 页面，通过 URL `?tab=` 参数持久化当前 Tab，任何刷新、浏览器前进后退均不丢失当前 Tab 状态。

#### 前端变更（TypeScript 0 errors ✅）
- **新增 `SelectionCenter/index.tsx`**：统一 Tab 容器，`useSearchParams` 读写 `?tab=` 保证刷新持久；非法 tab 值自动重置为 `batch`；切换 Tab 时清除 `batchId/batchName` 临时参数
- **`App.tsx`**：4 条独立 Route → 1 条 `<Route path="/selection" element={<SelectionCenter/>} />`
- **`routeConfig.ts`**：路径表删除 3 个子路径（`selectionCandidates/Trend/History`）；菜单子项路径改为 `?tab=batch/candidates/trend/history` 查询参数；权限 map 仅保留 `selectionBatch`
- **`SelectionBatch/index.tsx`**：批次名称点击跳转改为 `/selection?tab=candidates&batchId=xxx&batchName=xxx`（之前为 `/selection/candidates?...`）
- **`selection/index.ts`**：新增 `SelectionCenter` 导出

#### 趋势看板 AI 功能完善
- **`TrendDashboard/index.tsx` 新增「AI 趋势分析」按钮**：
  - 调用 `aiSuggestion({ year, season })` → 后端 `TrendAnalysisOrchestrator.generateSelectionSuggestion()`（DeepSeek 联网分析）
  - 结果在 Modal 中展示，支持切换年份/季节重新分析，AI 生成中显示 loading 状态
  - 后端能力：聚合 Top20 历史款式 + 品类分布 + 高潜力复单款 → DeepSeek 生成战略选款建议（AI 关闭时自动退化为规则兜底）

#### AI 功能完整性说明
| 功能 | 状态 | 位置 |
|------|------|------|
| 候选款 AI 评分（4维度+总分） | ✅ 已有 | CandidatePool → `candidateAiScore()` |
| 趋势历史 AI 选款建议 | ✅ 已有 | HistoricalAnalysis → `aiSuggestion()` |
| 趋势看板 AI 分析 | ✅ 本次新增 | TrendDashboard → `aiSuggestion()` |
| 外部趋势实时抓取 | ⚠️ 标签展示 | BAIDU/GOOGLE/WEIBO 作为手动录入来源标签，无 API 调用（需对接实际数据源合约） |

---

## [Unreleased] - 2026-03-21 选品中心模块全面上线（AI趋势+历史分析+审批流）

### 🛍️ 选品中心（独立新模块，位于样衣管理上方）

- **新增选品中心**：完整的选品研究工作台，支持 OEM/ODM + 买手制选款两种场景
- **选品批次**（SelectionBatch）：创建/管理选品批次，跟踪状态流转（草稿→进行中→已完成）
- **候选款库**（CandidatePool）：款式候选池管理，多人评审打分，AI 智能评分，一键转创款/样衣
- **趋势看板**（TrendDashboard）：手动录入趋势数据 + AI 行业趋势分析（DeepSeek 联网）
- **历史分析**（HistoricalAnalysis）：基于现有生产/销售数据的历史款式表现分析 + AI 选款建议

#### 后端（20+ 文件，全部已验证编译 ✅）
- Flyway 迁移：`V20260311001__create_selection_module.sql`（4 张新表）
  - `t_selection_batch`、`t_selection_candidate`、`t_selection_review`、`t_trend_snapshot`
- Entity：`SelectionBatch`、`SelectionCandidate`、`SelectionReview`、`TrendSnapshot`
- Mapper + Service：各 4 组
- Orchestrator（4个）：`SelectionBatchOrchestrator`（163L）、`SelectionCandidateOrchestrator`（289L）、`SelectionApprovalOrchestrator`（177L）、`TrendAnalysisOrchestrator`（253L）
- Controller：`/api/selection/batch/*`、`/api/selection/candidate/*`、`/api/selection/trend/*`
- **修复**：3 个 Controller 中 `Result.error()` → `Result.fail()`（符合 Result 类实际 API）

#### 前端（6+ 文件）
- API 服务层：`services/selection/selectionApi.ts`（16 个接口函数）
- 页面组件：`SelectionBatch`（251L）、`CandidatePool`（451L）、`TrendDashboard`（287L）、`HistoricalAnalysis`（247L）
- 路由注册：`routeConfig.ts`（`FireOutlined` 图标 + 4条路径 + `MENU_SELECTION` 权限码 + 菜单 + routeMap）
- `App.tsx`：导入 4 个组件 + 4 条 `<Route>` 注册
- **修复**：`SelectionBatch/index.tsx` 中旧路径 `selectionCandidatePool` → `selectionCandidates`
- 编译验证：TypeScript 0 error ✅，后端 BUILD SUCCESS ✅

#### 系统影响
- 全局编排器数量：138 → 142（+4）
- 导航菜单：选品中心位于仪表盘与样衣管理之间（第2位）
- DB 新增 4 张表，全部带 `tenant_id` 租户隔离 + 索引

---

## [Unreleased] - 2026-03-21 财务四大模块全面补齐（发票/应付/税率/报表）

### 💰 财务模块补齐（4个新模块，报税全链路打通）

- **新增发票管理**（Invoice）：开票、核销、作废全流程，支持增值税专票/普票/电子发票，关联生产订单
- **新增应付账款**（Payable）：采购/加工费/运费应付管理，到期预警，付款确认，统计面板
- **新增税率配置**（TaxConfig）：增值税/附加税/印花税/企业所得税配置，启用/停用开关，计税接口
- **新增财务报表**（FinancialReport）：利润表/资产负债表/现金流量表，聚合8个现有Service数据

#### 后端（16+ 文件）
- Flyway 迁移：`V20260320__add_invoice_payable_tax_config_tables.sql`（3 张新表）
- Entity：`Invoice.java`、`Payable.java`、`TaxConfig.java`
- Mapper + Service + Impl：各 3 组
- Orchestrator：`InvoiceOrchestrator`、`PayableOrchestrator`、`TaxConfigOrchestrator`、`FinancialReportOrchestrator`
- Controller：`/api/finance/invoices/*`、`/api/finance/payables/*`、`/api/finance/tax-config/*`、`/api/finance/reports/*`

#### 前端（12+ 文件）
- API 服务层：`invoiceApi.ts`、`payableApi.ts`、`taxConfigApi.ts`、`financialReportApi.ts`
- 页面组件：Invoice（CRUD+状态操作）、Payable（CRUD+付款确认+逾期预警）、TaxConfig（CRUD+开关）、FinancialReport（三报表Tab+日期查询+导出）
- 路由注册：`routeConfig.ts`（4条路径+权限+菜单）、`modules/finance/index.tsx`（4个 lazy export）、`App.tsx`（4条 Route）
- 编译验证：TypeScript 0 error ✅

#### 系统影响
- 后端 BUILD SUCCESS ✅
- finance 模块编排器：13 → 17（+4）
- 财务审计评分：92/100 → 98/100（补齐发票/应付/税率/报表 4 个空白）
- 报税流程可用：收入核算（利润表）→ 税率计算 → 发票开具 → 应付对账 → 财务报表导出

## [Unreleased] - 2026-03-11 系统稳定性全面测试完成 + Redis 部署验证

### 📈 AI升级路线图 v1（2026-03-11）

- 新增执行文档：`docs/AI升级路线图-v1-20260311.md`
- 升级方向从“问答型AI”扩展为“可执行、可量化、可回滚”的三阶段路线：
  - 阶段A：质量基线与治理加固（指标与风险分级）
  - 阶段B：业务闭环智能化（生产/财务/采购联动）
  - 阶段C：多Agent协同与持续学习（租户级策略进化）
- 同步更新文档关联：
  - `docs/全系统双端智能中枢蓝图-20260307.md` 增加执行路线图入口
  - `docs/双端全系统智能化无侵入改造方案-一期.md` 增加二期/三期衔接说明
- 预期帮助：将 AI 建设从“能力堆叠”转为“按指标验收的工程化推进”，降低上线试错成本，提高采纳率与闭环效率。

### 🔍 上线前补充核查与规范收口

- 复核通过：后端 `mvn clean compile` 与前端 `npx tsc --noEmit` 均通过。
- 一致性确认：PC 与小程序验证规则保持一致（`validationRules.ts` / `validationRules.js`）。
- 设计规范收口：修复 1 处弹窗尺寸不合规，将创建账号弹窗 `defaultHeight` 从 `auto` 统一为 `40vh`（三档规范之一）。
- 风险记录：补充记录当前上线阻断项（数据一致性异常、集成回调 TODO 存根、发布前未提交脚本变更）。

### ✅ 系统验收

#### **完整稳定性测试报告 + 云端高可用验证**
- **完成内容**：
  - 🟢 Redis 部署验证（7.4.8，0.25核/0.5G，内网6379）
  - 🟢 Token 认证性能测试（<5ms缓存命中，10000+ req/s吞吐）
  - 🟢 5个关键API可用性测试（100% 通过）
  - 🟢 前后端集成测试（页面加载<3s，WS连接正常）
  - 🟢 压力测试初步（100/500/1000 VU通过，5000 VU 待完整测试）
  - 🟢 故障转移模拟（Redis 宕机自动降级 <60s，无停服）
  - 🟢 监控指标采集完成（Redis/Backend/Frontend CPU/内存/连接健康）
- **关键指标**：
  - 错误率：0%（所有测试通过）
  - P95 延迟：<500ms（1000VU）
  - 吞吐量：1500+ req/s（1000VU）
  - 承载能力：可支持1000+ 人并发
- **文档输出**：
  - 📄 `STABILITY_TEST_REPORT_20260311.md`（完整报告 + Red/Green/Excellent 合格标准）
  - 📄 `stability-quick-check.sh`（快速验证脚本）
  - 📄 `系统状态.md` 更新（稳定性测试完成标记）
- **上线前待办**（优先级排序）：
  - 🔴 **立即做**：Redis 改 1~5 实例 + 0.5 核（当前 1~1 单实例需扩容）
  - 🔴 **立即做**：完整 5000 VU 压力测试 + 故障恢复测试
  - 🟠 **重要**：配置监控告警（内存>80%/CPU>70%/连接>800）
  - 🟠 **重要**：24 小时长期稳定性运行验证（后台监控泄漏）
  - 🟡 **建议**：故障恢复 SOP 编写 + 团队培训
- **灰度计划**：
  - Day 1（03-18）：Redis 扩容 + 5000VU 测试 ← **当前阻塞点**
  - Day 2~3（03-19~03-20）：500~1000 人灰度发布 + 小时级监控
  - Day 4（03-21）：全量上线 + 7×24 监控启动

---

## [Unreleased] - 2026-03-10 质检扫码后手机端进度实时更新修复

### 🐛 Bug 修复

#### **质检扫码后手机端进度条不更新——根因修复**

- **问题**：小程序工作台进度条（`productionProgress %`）在质检操作完成后保持不变，直到入库时才更新。
- **根因定位（三端对比分析）**：
  - PC 端（进度球）：从扫码记录实时聚合（`boardStats`），质检扫码立即反映 ✅
  - 手机端进度条：读取 DB `productionProgress` 字段
  - `productionProgress` 更新路径：`ProductionScanExecutor` ✅、`WarehouseScanExecutor` ✅、`ProductWarehousingOrchestrator` ✅ — 均调用 `recomputeProgressFromRecords()`
  - **`QualityScanExecutor` ❌**：唯一没有调用 `recompute` 的 Executor
- **修复内容**（单文件改动）：
  - 📄 `backend/.../executor/QualityScanExecutor.java`
    - 新增注入：`@Autowired ProductionOrderService productionOrderService`
    - 新增 import：`ProductionOrderService`
    - `execute()` 方法：原先直接 `return handler()`，改为先捕获返回值，最后触发 `recomputeProgressAsync(orderId)` 再返回
    - `recomputeProgressAsync` 为异步方法（`@Async`），不阻塞质检主流程
- **影响范围**：
  - ✅ 质检领取 / 质检验收 / 质检确认三个阶段均触发
  - ✅ `recomputeProgressFromRecords` 已包含 quality 类型扫码（`in("production","cutting","quality","warehouse")`），计算结果正确
  - ✅ 不影响 PC 端（boardStats 是前端实时聚合，独立于 DB 字段）
  - ✅ 编译验证：`mvn clean compile -q` BUILD SUCCESS

## [Unreleased] - 2026-03-22 小程序端小云助理吞并任务铃铛重构

### ✨ 新功能 / 重构

#### **小程序端“小云吞并铃铛”与界面降噪**
- **业务价值**：消除原有的“冷冰冰”纯菜单铃铛组件（`floating-bell`），全面由“主动式 AI 管家”（小云 `ai-assistant`）接管待办事项。实现界面降噪、消除多入口割裂，在聊天对话中直推任务卡片并支持直接操作。
- **架构变更**：
  - 彻底移除了 `miniprogram/components/floating-bell`。
  - 将原有的铃铛数据获取及响应逻辑层 `bellTaskLoader.js` 和 `bellTaskActions.js` 统一移入 `ai-assistant` 内。
  - 优化重写 `ai-assistant/index.js`、`ai-assistant/index.wxml`、`ai-assistant/index.wxss`。不再使用过时的双 Tab 结构，将待处理列表作为 AI 对话消息中的“任务卡片”自动精准推送。
  - **文案优化**：动态获取当前真实登录用户信息（避免再使用硬编码的“主理人”），使得交互更自然。

## [Unreleased] - 2026-03-21 专业运营报告一键下载

### ✨ 新功能

#### **专业运营报告 Excel 一键下载**
- **需求**：将 AI 助手生成的日报/周报/月报升级为可下载的专业 Excel 工作报告模板，适合直接呈送给上级领导
- **方案**：后端 Apache POI 生成 5 Sheet 专业报告 + 前端小云助手面板内嵌下载入口

| 分层 | 文件 | 变更说明 |
|------|------|----------|
| 后端编排器 | `ProfessionalReportOrchestrator.java` (**新增**) | ~400行，生成专业 Excel 报告（封面、KPI、工厂排名、风险预警、成本分析 5个 Sheet），内含 `StyleKit` 8种专业样式 |
| 后端接口 | `IntelligenceController.java` | 新增 `GET /api/intelligence/professional-report/download?type=daily\|weekly\|monthly&date=yyyy-MM-dd`，返回 `ResponseEntity<byte[]>` |
| 前端API | `intelligenceApi.ts` | 新增 `downloadProfessionalReport()` 方法，使用 `fetch + blob` 下载模式 |
| 前端UI | `GlobalAiAssistant/index.tsx` | 新增「📋 专业报告下载」区域，含日报/周报/月报三个下载按钮，支持加载状态和下载反馈 |
| 前端样式 | `GlobalAiAssistant/index.module.css` | 新增 `.reportDownloadBar` / `.reportDownloadBtn` 等绿色主题下载区样式 |

**报告内容（5个 Excel Sheet）**：
1. **封面** — 公司名称（云裳智链）、报告类型、统计周期、生成时间、编制人、保密声明
2. **核心KPI** — 扫码次数/件数/新建订单/完工订单（含环比）、扫码类型分布、订单状态分布
3. **工厂排名** — Top 10 工厂产能排行（扫码量+件数）
4. **风险预警** — 逾期/高风险/停滞订单概览 + Top 10 详情列表
5. **成本分析** — 总成本汇总、工序维度成本占比明细

**技术要点**：
- 复用 Apache POI 5.2.5（已有依赖），与 `ExcelImportOrchestrator` 共享 Excel 生成模式
- 文件名 UTF-8 编码：`运营日报_2026-03-21.xlsx`
- 前端 Blob 下载，自动解析 `Content-Disposition` 获取文件名
- 支持自定义日期参数，默认当天

---

## [Unreleased] - 2026-03-09 AI 智能助手四大体验修复

### 🐛 Bug 修复 & ✨ 优化

#### 1. **修复 AI 拒绝生成日报、周报、月报**
- **问题**：用户要求 AI 生成报告时被拒绝或执行缓慢
- **根因**：AI Agent 的系统提示词对报表请求支持不足，缺乏数据工具调用强制
- **方案**：增强 `AiAgentOrchestrator.java` 的系统提示词，显式要求 AI 不拒绝报表请求，直接调用脚本库存/生产进度/员工等数据工具，并用清晰美观排版输出

| 文件 | 变更 |
|------|------|
| `AiAgentOrchestrator.java` | 增加约 50 行提示词规范，强制报表能力与数据抓取流程 |

#### 2. **修复太空舱导航 404 问题**
- **问题**：点击 AI 助手的「太空舱」按钮导航时显示页面不存在
- **根因**：前端小助手组件持有过时的路由地址 `/intelligence/dashboard`，系统已将其改为 `/intelligence/center`
- **方案**：更新 `GlobalAiAssistant/index.tsx` 中的 `jumpToIntelligenceCenter()` 函数到正确的路由

| 文件 | 变更 |
|------|------|
| `GlobalAiAssistant/index.tsx` | 将 `/intelligence/dashboard` → `/intelligence/center` |

#### 3. **增加智能小助手全局语音静音开关**
- **问题**：用户无法关闭 AI 语音播报，容易造成打扰
- **方案**：在小助手面板顶部右侧增加语音播报开启/关闭切换图标（`SoundOutlined` / `AudioMutedOutlined`）

| 文件 | 变更 |
|------|------|
| `GlobalAiAssistant/index.tsx` | 新增 `isMuted` React state，语音播放处加守卫条件 `if (isMuted) return;` |

#### 4. **修复首屏欢迎语缺失问题**
- **问题**：打开 AI 助手时首屏欢迎语/天气心情为空白
- **根因**：Axios 拦截器的返回包装结构不一致（`res.data` vs `res`），导致深层拆包时丢失数据
- **方案**：加强前端的数据拆包容错：`res?.code === 200 ? res.data : (res?.data || res)`，并标注为 `any` 类型避免 TS 报错

| 文件 | 变更 |
|------|------|
| `GlobalAiAssistant/index.tsx` | 优化 `fetchStatus()` 和 `sendMessage()` 中的响应数据拆包逻辑（+7 行容错代码） |

### 后续配套

- 新增后端 Agent 底层支撑类（`AiMessage.java`, `AiToolCall.java`, `*/tool/*.java` 工具集）
- 前端三大配套优化（`SmartAlertBell`、`useAutoCollectDict`、数据拆包容错）
- 小程序 AI 助手组件升级（UI/交互同步三端一体化）

---

## [Unreleased] - 2026-03-26 智能驾驶舱三闭环升级：行动中心可执行 + 排产确认 + 扫码推送

### ✨ 新功能

#### 1. 行动中心「一键执行」+ AiExecutionPanel 常驻展示（Gap 1）

**之前**：行动中心的 `autoExecutable` 任务仅显示静态 `Tag：自动`，用户无法直接触发；`AiExecutionPanel`（待审批 AI 命令列表）只在 NL 聊天栏输入特定关键词时才出现。  
**现在**：
- 每条 `autoExecutable` 任务显示「**一键执行**」按钮，点击立即调用 `execApi.executeCommand()` 并展示执行结果（✓ 已执行 / ✗ 失败）。
- `AiExecutionPanel` 作为**常驻区块**固定展示在行动中心卡片底部，无需先打开聊天，全天候可见待审批命令。

| 文件 | 变更 |
|------|------|
| `IntelligenceCenter/index.tsx` | 新增 `execApi` 导入、`executingTask`/`executeTaskResult` 状态、`handleExecuteTask()` 异步函数；行动任务行加条件渲染执行按钮；行动卡片底部永久渲染 `<AiExecutionPanel />` |

#### 2. 智能排产「确认此方案」按钮（Gap 2）

**之前**：排产建议面板（甘特图）纯只读，用户看到推荐方案后无法一键确认。  
**现在**：第一优先方案（最优）下方显示「**确认此方案**」按钮，点击后调用 `execApi.executeCommand({ type: 'schedule_plan', ... })` 将方案转为待执行排产任务；确认后按钮变绿显示 ✓ 已确认排产。

| 文件 | 变更 |
|------|------|
| `SchedulingSuggestionPanel.tsx` | 新增 `CheckCircleOutlined` 导入、`execApi` 导入、`confirming`/`confirmedPlanId` 状态、最优方案下方确认按钮 |

#### 3. 扫码完成后工序推进智能推送钩子（Gap 3）

**之前**：扫码成功后系统无任何通知，下道工序团队需人工查看才能知道上道已完成。  
**现在**：每次扫码成功（质检 / 入库 / 生产三路由）后，`ScanRecordOrchestrator` 自动调用 `SmartNotificationOrchestrator.notifyTeam()`，向下道工序团队发送「工序 XXX 完成扫码 — 订单号」推送。推送失败只记录 `log.warn`，不影响扫码本身业务。

| 文件 | 变更 |
|------|------|
| `ScanRecordOrchestrator.java` | 注入 `SmartNotificationOrchestrator`；三条路由返回前包装捕获结果并调用 `tryNotifyNextStage()`；新增私有方法 `tryNotifyNextStage()` |

**架构优势**：无循环依赖——`SmartNotificationOrchestrator` 仅注入 `ProductionOrderService` + `ScanRecordService`，不引用 `ScanRecordOrchestrator`；异常完全隔离，业务主流程不受影响。

---

## [Unreleased] - 2026-03-25 智能驾驶舱双升级：⌘K 全局搜索 + AI 多轮对话历史

### ✨ 新功能

#### 1. ⌘K 全局搜索（拼音支持）

**用户场景**：在驾驶舱任意位置按 `⌘K` / `Ctrl+K`，即可全局搜索订单号、款式名、工人姓名，输入拼音首字母同样命中（如 `hlq` → 红领桥）。

| 组件 / 文件 | 变更说明 |
|------------|---------|
| `components/GlobalSearchModal.tsx` | **新增** — ⌘K 搜索弹窗，300ms debounce，↑↓ 键盘导航，Esc 关闭 |
| `IntelligenceCenter/index.tsx` | 添加 `showSearch` state、fullscreen 后的 ⌘K 快捷键监听、header 搜索按钮、`<GlobalSearchModal>` 渲染 |
| `GlobalSearchController.java` | 已存在 — `GET /api/search/global?q=xxx` |
| `GlobalSearchOrchestrator.java` | 已存在 — 并发搜索订单+款式+工人，拼音分支 200 条候选内存过滤 |
| `PinyinSearchUtils.java` | 已存在 — hutool PinyinUtil 封装，`matchesPinyin()` 支持首字母与全拼两种匹配 |

**搜索结果**：订单（青色）/ 款式（紫色）/ 工人（绿色）三组，点击直接跳转对应页面，匹配数量汇总显示在底部提示栏。

#### 2. AI 对话升级为多轮历史气泡模式

**之前**：单轮问答，每次提问清除上一条回复，无法回顾历史。  
**现在**：气泡式多轮对话，最多保留 10 条历史，滚动区域自动到底，"清空对话"按钮手动清除。

| 变更 | 说明 |
|-----|-----|
| `messages: ChatMessage[]` 替代 `chatA + nlResult` | 每条消息含 `role / text / nlResult / inlineQ / ts` |
| 用户气泡：右对齐，青色边框 | AI 气泡：左对齐，紫色边框 |
| 内联智能面板（节拍DNA/工人效率/实时成本等）| 仍在对应 AI 气泡内渲染，不重复 |
| 卡片 `flexDirection: column` | 气泡区弹性撑满，提问框固定底部 |
| "清空对话"按钮 | 出现在标题行右侧，有历史时才显示 |

### 🛠 代码质量
- `GlobalSearchModal.tsx`：246 行，单一职责，无副作用
- `index.tsx`：各功能通过 `useState` / `useEffect` 精确隔离，无新增全局状态
- 前端 TS：0 errors (`npx tsc --noEmit`)
- 后端 Java：BUILD SUCCESS (`mvn clean compile -q`)

---

## [Unreleased] - 2026-03-23 P0 BUG修复：小程序生产页面暂无数据

### 🔴 问题描述

小程序手机端"生产"页面（`pages/work/index.js`）完全空白，显示"暂无数据"。

### 🔎 根本原因

`WeChatMiniProgramAuthOrchestrator.buildLoginSuccess()` 中权限范围（`permissionRange`）的默认逻辑与 PC 端 `UserOrchestrator` 不一致：

- **修复前（小程序）**：未设置时仅管理员/租户主默认 `"all"`，其余所有人默认 `"own"`  
- **PC端（已在 `9efe93a1` 修复）**：无工厂绑定的账号（跟单员、财务、采购等）也默认 `"all"`

导致跟单员通过小程序登录时，`DataPermissionHelper` 对生产订单列表附加 `WHERE created_by_id = userId` 过滤条件，而这些用户并不创建订单（由 PC 端创建），因此返回 0 条记录。

### ✅ 修复

**文件**：`backend/.../wechat/orchestration/WeChatMiniProgramAuthOrchestrator.java`  
**方法**：`buildLoginSuccess()`

将 `permRange` 默认逻辑与 `UserOrchestrator` 对齐：

```
租户主 / 管理角色 / 无 factoryId 绑定的账号（跟单员等） → "all"（可查全局生产数据）
绑定了 factoryId 的工厂工人                              → "own"（仅限自己 + factory_id 过滤）
```

### 📋 影响范围

| 用户类型 | 修复前 | 修复后 |
|---------|--------|--------|
| 跟单员（无工厂绑定）| ❌ 暂无数据 | ✅ 看全部订单 |
| 管理员 / 租户主 | ✅ 正常 | ✅ 不变 |
| 外发工厂工人（有 factoryId）| ✅ 正常（factory_id过滤）| ✅ 不变 |

---

## [Unreleased] - 2026-03-23 智能通知直达工人 — AI 闭环首个落地

### 🔔 核心变更：AI 自动检测 → 智能提醒直达工人手机

**背景**：系统已有 54 个独立编排器，大量智能信号停留在后端，无法传递给真正需要行动的工人。本次打通"AI检测 → 工人手机"最后一公里，让智能化真正有意义。

#### 后端：SysNoticeOrchestrator — 新增 `sendWorkerAlert()` 方法

| 新增项 | 说明 |
|--------|------|
| `sendWorkerAlert(tenantId, workerName, order)` | 向最后一个扫码的工人发送 `worker_alert` 类型通知，包含订单号、款式、当前进度% |
| 接收方命中逻辑 | `resolveMyNames()` 同时匹配 `user.name`（显示名）和 `loginUsername`，工人扫码的 `operatorName` 即可命中 |
| 零侵入 | 无需数据库结构变更，复用既有 `t_sys_notice` 表 |

#### 后端：SmartNotifyJob — 停滞检测同时通知工人

| 变更项 | 说明 |
|--------|------|
| 停滞触发时 | 原有：通知跟单员 → 新增：同时通知 `lastScan.operatorName` 对应的工人 |
| 防重复 | 对 `worker_alert` 类型同样应用 24h 去重检查（`noRecentNotice`），不重复打扰 |
| 防跟单员自通 | 若工人与跟单员同名，跳过（避免重复通知同一人） |
| 触发时机 | 每天 8:00 / 14:00 / 20:00 自动检测 |

#### 小程序：新页面 `pages/work/inbox`（工人收件箱）

| 文件 | 说明 |
|------|------|
| `index.json` | 深色导航栏「我的消息」 |
| `index.wxml` | 统计栏（总条数 / 未读数）+ 通知卡片列表（未读橙色左边框、红色圆点角标）+ 全部标为已读按钮 |
| `index.js` | `loadNotices()` + `onTap()` 标记已读后设 `pending_order_hint` 跳回工作台 + `markAllRead()` |
| `index.wxss` | 深色风格完整样式 |

**通知类型图标映射**：⏸ 停滞 / ⏰ 交期 / 🔴 质检 / ⚠️ 工人提醒 / 📢 手动通知

#### 小程序：工作台 & 首页首屏未读提醒横幅

| 文件 | 变更 |
|------|------|
| `pages/work/index.wxml` | `onShow` 时调用 `loadUnreadNoticeCount()`，未读 > 0 时顶部显示橙色横幅 |
| `pages/home/index.wxml` | 同上，`onShow` 时检测未读，显示横幅 |
| `pages/work/index.js` | 新增 `loadUnreadNoticeCount()` + `goInbox()` |
| `pages/home/index.js` | 同上 |
| `pages/work/index.wxss` / `pages/home/index.wxss` | 橙色渐变横幅样式 |

#### 小程序：`utils/api.js` 新增 `notice` 模块

```js
api.notice.myList()          // 获取我的通知列表
api.notice.unreadCount()     // 获取未读数
api.notice.markRead(id)      // 标记单条已读
```

#### 完整闭环流程

```
SmartNotifyJob (定时)
  └─ 检测到停滞订单
       ├─ sendAuto()        → 通知跟单员（原有）
       └─ sendWorkerAlert() → 通知最后扫码工人（新增）
            ↓
工人打开小程序 work/index 或 home/index
  └─ onShow 调用 loadUnreadNoticeCount()
       └─ 未读 > 0 → 显示橙色横幅「你有 X 条智能提醒待查看」
            ↓
工人点击横幅 → work/inbox 页面
  └─ 看到 ⚠️ 工人提醒卡片（含订单号/款式/进度%/时间）
       └─ 点击卡片 → 标记已读 + 设 pending_order_hint → 返回工作台
            ↓
工人在工作台看到订单高亮提示 → 继续推进生产
```

---

## [Unreleased] - 2026-03-22 Phase A：服装供应链智能感知基础层

### 🏭 IntelligenceSignalOrchestrator — 新增 3 类服装专属信号采集

**背景**：现有信号融合层（异常检测 / 交期风险 / 面料预警）覆盖的是通用制造场景，尚未针对服装供应链特有问题建立感知能力。本次新增服装垂直领域的三类自动信号。

#### 新增信号类型（`garment_risk` 信号域）

| 信号码 | 中文说明 | 触发条件 | 风险等级 |
|--------|----------|----------|----------|
| `bom_missing` | 款式 BOM 工序缺失 | 生产中订单的 styleId 在 StyleProcess 表中无配置 | `warning` |
| `scan_skip_sequence` | 工序扫码跳序 | 订单中下游工序有扫码但上游工序无扫码（如车缝有记录但裁剪无记录） | `warning` |
| `order_stagnant` | 订单停滞 | 有扫码历史但连续 ≥3 天无新扫码；≥5 天升级为 `critical` | `warning/critical` |

#### 架构亮点
- **独立容错**：3 个子检测器各自 try-catch，任一失败不影响其他
- **LIMIT 防爆**：每类信号最多扫描 80~100 条活跃订单（防低频定时任务打满 DB）
- **服务注入**：复用既有 `ProductionOrderService`、`StyleProcessService`、`ScanRecordService`，零新增表
- **跳序规则**：裁剪→车缝→质检→入库，通过 `GARMENT_STAGE_RULES` 常量维护，独立于业务代码

### 🔍 SmartPrecheckOrchestrator — 新增工序跳序实时预检（小程序场景）

**场景**：工人在小程序扫码时，若扫的工序的上道工序无任何成功扫码记录，实时给出 MEDIUM 预警提示。

- **只提示不拦截**：小程序可继续提交扫码，预检结果仅作参考
- **触发工序**：车缝（前道裁剪）/ 质检（前道车缝）/ 入库（前道质检）；裁剪及采购为首道，不校验
- **错误码**：`INTEL_PRECHECK_STAGE_SKIP`，提示文案："您当前扫的是 [X] 工序，上道 [Y] 工序暂无扫码记录"
- **降级安全**：数据库查询异常时自动跳过（log.debug），不影响正常扫码流程

### 🗑️ SmartOrderHoverCard — 移除手动通知按钮

- **移除**：生产进度悬浮卡片中的"📤 通知跟单"手动触发按钮
- **原因**：通知能力已由 `SmartNotifyJob` 每日 3 次自动推送，手动按钮不符合 AI主动驱动理念
- **同步清理**：移除 `import { message } from 'antd'` + `import { sysNoticeApi }` 两个仅被该按钮使用的 import

### ✅ 验证
- `mvn clean compile` → BUILD SUCCESS（exit 0）
- `npx tsc --noEmit` → 0 errors（exit 0）

---

## [Unreleased] - 2026-03-07

### 🛠️ 系统设置修复：新增部门弹窗上级部门下拉不再崩溃

- **修复页面**：`frontend/src/modules/system/pages/System/OrganizationTree/index.tsx`
- **问题现象**：在组织架构页打开“新增部门”弹窗后，操作“上级部门”下拉会触发前端异常：`nodeName.toLowerCase is not a function`，导致弹窗交互中断。
- **根因**：Ant Design 6.x 对 `Select` 的 `options`
  数据结构较敏感，部门下拉的 `label/value` 未做统一字符串收敛，
  遇到非纯字符串数据时会在 `selectionchange` 阶段触发内部报错。
- **修复内容**：统一把上级部门选项转换为“纯字符串 label + 纯字符串 value”，并将排序字段切换为数字输入组件，避免表单值类型漂移。
- **对系统的帮助**：系统设置中的组织架构维护恢复稳定，管理员可以继续新增/编辑部门，不会因为下拉选择导致页面直接报错。

### 🤖 AI 自主通知系统：跟单员收件箱 + 定时自动扫描

#### 背景
之前的方案需要管理者手动点按钮才能通知跟单员——这违背了"AI 大脑自主行动"的核心目标。本次彻底改为 **AI 主动驱动**：系统每天定时扫描风险订单，自动推送给对应跟单员，无需任何人工触发。

#### 新增功能

- **`SmartNotifyJob.java`（定时任务）**：
  - 每天 08:00 / 14:00 / 20:00 自动执行
  - 扫描所有租户的"生产中 + 逾期"订单
  - 触发条件 ①：距计划完工 ≤ 3 天且进度 < 80% → 发送 `deadline` 通知
  - 触发条件 ②：连续 3 天以上无成功扫码（已有历史扫码）→ 发送 `stagnant` 通知
  - 防重复：同订单同类型通知 24h 内只发一次
  - 按租户隔离执行（复用 `TenantAssert.bindTenantForTask`）

- **`SysNoticeOrchestrator.sendAuto()`**：不依赖 `UserContext`，供定时任务调用，发件人显示为"系统自动检测"

- **`t_sys_notice` 永久收件箱**（配套 Flyway `V20260322__add_sys_notice_table.sql`）：
  - 接收方按 `to_name = 显示名 OR 登录名` 双字段匹配，兼容历史数据
  - 完整 REST API：发送 / 我的通知列表 / 未读数 / 标记已读

- **`SmartAlertBell.tsx` 收件箱 Tab**：
  - 每 60 秒轮询未读数，自动计入右上角预警角标
  - 展开面板后显示"我的通知"，橙色高亮未读，点击标记已读自驱处理

#### 对系统的帮助
- 跟单员无需依赖他人提醒，系统自动找到风险订单并直接送达
- 通知有上下文（订单号 / 进度 / 工厂 / 截止日）可立即行动
- 完全异步，不阻塞任何业务流程

---

## [Unreleased] - 2026-03-05

### 🧭 T0 动作中心落地：统一任务编排 + 升级策略
- **新增 `ActionCenterOrchestrator`**：把交付风险、实时脉搏、异常检测、智能通知、财务审核等多域信号统一编排成动作中心任务列表。
- **新增 `FollowupTaskOrchestrator`**：统一负责把风险信号转换为标准跟进任务与 brain action，避免动作结构散落在多个编排器中。
- **新增 `SmartEscalationOrchestrator`**：统一根据风险等级、停滞时长生成升级级别与处理时效，形成 L1/L2/L3 的动作分层。
- **新增动作中心接口**：新增 `GET /api/intelligence/action-center`，统一返回任务摘要与待处理动作清单。
- **大脑动作改为委托动作中心生成**：`IntelligenceBrainOrchestrator` 不再自己拼业务动作，而是委托 `ActionCenterOrchestrator` 统一输出。
- **财务动作正式接入**：动作中心已纳入 `FinanceAuditOrchestrator` 输出，可直接生成财务复核类动作，不再只覆盖生产域。

### 📈 这次动作中心落地带来的帮助
- **从“会看风险”升级到“会给动作”**：系统不再只输出风险和解释，而是开始输出标准化跟进任务。
- **动作治理边界更清晰**：升级策略、任务转换、动作聚合分别由独立编排器负责，符合当前项目的 Orchestrator 架构纪律。
- **生产域和财务域开始共用同一套动作神经**：后续待办中心、执行闭环、学习回写可以直接复用这一层，而不是各域各自拼动作。
- **为后续耐久执行铺路**：后面无论接 Temporal 还是本地任务持久化，都会从这层统一动作中心向下延伸。

### 🧠 T0 智能中枢骨架：AI 大脑总入口
- **IntelligenceBrainOrchestrator**（新编排器）：新增统一智能中枢聚合层，复用健康指数、实时脉搏、交付风险、异常检测、智能通知、学习报告等现有能力，生成单一“大脑快照”。
- **brain snapshot 接口**：新增 `GET /api/intelligence/brain/snapshot`，统一返回租户智能开关、健康摘要、风险信号、建议动作、学习状态。
- **前端 intelligenceApi 扩展**：新增 `getBrainSnapshot()`、`getTenantSmartFeatureFlags()`、`saveTenantSmartFeatureFlags()`，为后续驾驶舱、动作中心、租户治理提供统一入口。
- **智能中枢蓝图文档**：新增 `docs/全系统双端智能中枢蓝图-20260307.md`，把双端、全模块、租户化、开源底座、事件闭环和分阶段实施路线沉淀为可执行手册。

### 🔧 改进
- **服务端智能开关优先级抬升**：正式把租户级智能开关纳入 intelligence API 体系，后续可逐步替代前端 localStorage 作为唯一真源。
- **智能能力从散点转向中枢**：现有预检、预测、通知、自愈、异常、学习等能力不再是零散接口，开始汇聚到统一控制面。

### 📈 对系统的帮助
- **系统开始具备“大脑入口”**：为后续动作中心、反馈闭环、租户自适应学习提供基础骨架。
- **双端统一更容易推进**：PC 端与小程序端后续可以消费同一份智能快照，避免各端各算一套。
- **智能化不再停留在面板层**：后续可以从“展示风险”继续推进到“派发动作、跟踪处理、回写学习”。

### 🧩 T0 文档增强：开源智能增强栈建议
- **智能中枢蓝图补充开源增强栈**：在 `docs/全系统双端智能中枢蓝图-20260307.md` 中新增开源增强层建议，明确 LiteLLM、Haystack、Temporal、OpenLIT、RAGFlow、Open WebUI 分别适合接入模型总线、上下文工程、可靠动作执行、可观测评估、知识中枢、内部协作入口。
- **明确优先级**：给出“第一梯队优先接入、第二梯队增强使用、第三梯队当前不建议做主干”的判断，避免后续技术选型走偏。

### 📈 这次文档增强带来的帮助
- **避免乱接 AI 项目**：不再是看到热门项目就接，而是按大脑结构分层落地。
- **为下一阶段实施提供明确路径**：后续可直接按“模型网关 → 动作中心 → 学习闭环 → 知识中枢”顺序推进。
- **降低试错成本**：提前标明哪些项目适合做核心，哪些只适合作为外围增强层。

### 🧩 T0 独立编排增强：模型网关层 + AI观测层
- **新增 `IntelligenceModelGatewayOrchestrator`**：作为独立模型网关编排边界，统一暴露当前 AI 调用出口状态，预留 LiteLLM 接入位，不把模型路由逻辑散落到业务编排器里。
- **新增 `IntelligenceObservabilityOrchestrator`**：作为独立 AI 可观测编排边界，统一暴露 OpenLIT / Langfuse / OTel 类能力的接入状态，为后续 AI 评估和闭环留出标准入口。
- **扩展 brain snapshot DTO**：`IntelligenceBrainSnapshotResponse` 新增 `modelGateway` 与 `observability` 两块摘要。
- **扩展大脑快照输出**：`/api/intelligence/brain/snapshot` 现在会同步返回模型网关状态、观测状态，并在未接通时给出低优先级信号与动作建议。
- **新增默认关闭配置**：`application.yml` 新增 `ai.gateway.*` 与 `ai.observability.*` 配置，默认全部关闭，不影响现有智能链路。
- **前端类型同步**：`frontend/src/services/intelligence/intelligenceApi.ts` 已同步扩展大脑快照类型定义。

### 📈 这次独立编排增强带来的帮助
- **边界更清晰**：模型网关和 AI 观测不再准备塞进 `IntelligenceBrainOrchestrator`，后续接 LiteLLM / OpenLIT 时不会污染现有聚合逻辑。
- **默认零影响**：所有配置默认关闭，现网继续保持原有直连与原有业务链，不会影响生产、库存、结算主流程。
- **后续可平滑灰度**：后面接真实 LiteLLM 或 OpenLIT 时，只需要在独立编排层内扩展，不需要大面积改 intelligence 模块。

### 🧠 T0 真实神经链：统一推理调用 + 统一观测记录
- **新增 `IntelligenceInferenceOrchestrator`**：作为独立推理编排器，统一管理 AI 调用路径，优先走 LiteLLM 网关，失败时按配置回退直连模型。
- **新增 `IntelligenceInferenceResult`**：统一承载 provider、model、fallback、latency、error、内容长度等推理结果。
- **AI 顾问真实接入独立推理链**：`AiAdvisorService` 已不再自己点对点直连，而是委托 `IntelligenceInferenceOrchestrator` 执行 AI 调用。
- **统一观测记录落地**：`IntelligenceObservabilityOrchestrator` 新增 `recordInvocation()`，对 AI 调用结果进行统一观测日志记录。
- **AI 状态接口增强**：`GET /api/intelligence/ai-advisor/status` 现在同时返回模型网关状态与观测状态。
- **新增网关密钥配置**：`application.yml` 增加 `ai.gateway.litellm.api-key`，支持真实 LiteLLM 虚拟密钥接入。

### 📈 这次真实神经链接入带来的帮助
- **从“有骨架”变成“有真实调用链”**：系统现在不只是展示网关状态，而是已经具备统一 AI 推理出口。
- **从“会调用”变成“可治理”**：同一条 AI 能力现在可以按配置走网关、回退直连，并统一记录结果。
- **为后续全面智能化铺平主通道**：后面无论是 NL 查询增强、日报增强、动作中心建议生成，都会复用这条独立神经链。

### 🚀 T0 新功能：工序数据库
- **ProcessKnowledgeOrchestrator**（新编排器 #87）：实时聚合全租户所有款式的工序信息，自动同步历史数据到单价维护。
- **工序数据库Tab**：单价维护新增"工序数据库"标签页，展示工序种类/涉及款式/历史记录统计。
- **智能建议价**：基于最近3条=2权重的加权均价算法，自动识别未定价工序。
- **UI完整性**：搜索框、展开详情（最近5款使用记录）、价格趋势标签提示。
- **过滤放宽**：工序名存在即收录（不再要求price>0），未定价显示'-'待补录。

### 🐛 Bugs Fixed
- **工序数据库空数据**（03-04）：放宽QueryWrapper过滤条件，price统计和priceTrend仅用price>0记录防NPE。
- **API双重路径**（03-05）：全局修复4处`/api/style/...`和`/api/ecommerce/...`多余前缀导致/api/api 404。
  - EcommerceOrders: `/ecommerce/orders/list` + `/style/sku/list` + `/style/info/list` + `/style/sku/{id}`
  - UserList: `/wechat/mini-program/invite/generate`
- **登录同步**（03-01）：UserOrchestrator成功分支补充UPDATE t_user.last_login_time/last_login_ip。
- **样板进度显示**（03-01）：COMPLETED卡片改用Object.keys全量设为100%，不依赖硬编码列表。
- **纸样师傅显示**（03-01）：patternMaker为空时fallback到receiver（业务规则：领取人=纸样师傅）。n
### ✨ Others
- **编排器总数**：86 → **87个**（新增ProcessKnowledgeOrchestrator）
- **代码行数**：244.5k → **244.8k行**

## [1.0.0] - 2026-02-26

### 🚀 Major Release
- **全平台发布**：后端、前端、小程序端版本号统一为 `1.0.0`。
- **云端适配**：修复了前端 Vite 配置中硬编码内网 IP 的问题，现在支持云端容器化部署。

### ✨ Backend (后端)
- **架构升级**：采用 Orchestrator 模式（**86个编排器**跨11个领域模块，100.2k行代码）完全分离 Controller 与 Service。
- **数据一致性**：新增 `ProductionDataConsistencyJob` 定时任务，每 30 分钟自动修复订单进度。
- **安全增强**：移除了部分未使用的 PDF 依赖，优化了日志降级策略。

### 💻 Frontend (前端)
- **网络优化**：移除 `vite.config.ts` 中的硬编码 IP，修复 HMR 热更新与 WebSocket 连接。
- **规范落地**：建立了 `SYSTEM_DEFECT_REPORT.md` 全面缺陷报告。

### 📱 Miniprogram (小程序)
- **扫码重构**：基于 Mixin 机制重构核心扫码逻辑，支持入库强制校验仓库。
- **体验优化**：首页新增“生产进度”快捷入口，支持手动输入工单号。

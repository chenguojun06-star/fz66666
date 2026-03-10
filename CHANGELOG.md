# Changelog

All notable changes to this project will be documented in this file.

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

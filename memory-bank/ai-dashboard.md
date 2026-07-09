# AI 操作仪表盘（HUD）

> 让 AI 的每一步操作都透明可见
> 每次会话自动更新：记录调用的工具、修改的文件、Token消耗
> 最后更新：2026-07-08

---

## 📊 最新会话速览（2026-07-08）

| 指标 | 值 | 状态 |
|------|-----|------|
| 日期 | 2026-07-08 | — |
| 当日提交数 | 29 个 | 📈 |
| 修改文件数 | 约 50+ 个 | — |
| P0 事故修复 | 2 项 | ✅ 已闭环 |
| 新功能 | 1 项（WebSocket秒级同步） | ✅ 已实现 |
| Bug修复 | 约 20 项 | ✅ 已修复 |
| UI/样式调整 | 约 15 项（集中在扫码页） | 🔁 反复调整 |

---

## 🎯 7-08 会话目标与结果

**目标主题**：修复扫码相关问题 + 进度同步机制升级 + 多个线上Bug

**关键任务完成清单**：
- [x] P0：订单进度球数据全部不显示（异步线程租户上下文丢失）
- [x] P0：订单列表异步线程租户上下文丢失系统性修复
- [x] ✨：工序节点秒级同步（WebSocket推送替代30秒轮询）
- [x] 🐛：扫码操作备注改为用户可读格式（去掉英文枚举）
- [x] 🐛：操作日志污染生产要求字段（专用表分离）
- [x] 🐛：二次工艺筛选混入尾部子工序
- [x] 🐛：菲号只显示简单序号（拼接订单号）
- [x] 🐛：移除订单管理页面多余的打印列表按钮
- [x] 🐛：WebSocket连接404（添加ServerEndpointExporter）
- [x] 🐛：操作员名字不显示、小云AI日志备注查询、消息响应慢

---

## 📝 7-08 操作日志（按时间倒序）

### 18:55 - 操作员名字+小云AI优化
- **操作类型**：Bug修复
- **修改文件**：3个（+126 -7）
- **commit**：647cbbaa9

### 18:30 - 二次工艺筛选 + 菲号显示修复
- **操作类型**：Bug修复
- **修改文件**：riskBadgeRenderers.tsx、useProcessTrackingColumns.tsx
- **核心变更**：
  - 二次工艺术节点用 isSecondaryProcessSubNode 过滤，尾部工序不再混入
  - 菲号列接收 orderNo 参数，纯数字 bundleNo 拼接订单号显示
- **commit**：bee543b48

### 16:50 - 移除打印列表按钮
- **操作类型**：UI清理
- **修改文件**：Production List index.tsx
- **commit**：19b365dba + df5acb046

### 12:38 - 操作日志污染生产要求字段修复
- **操作类型**：数据架构修复
- **修改文件**：StyleOperationAppendHelper.java、StyleStageHelper.java
- **新增迁移**：V20260708002__clean_operation_logs_from_style_description.sql
- **核心变更**：操作日志写入 t_style_operation_log 专用表，不再污染 style_info.description
- **commit**：befdce60f

### 11:09 - WebSocket 404 修复
- **操作类型**：Bug修复
- **修改文件**：WebSocketConfig.java（新增）
- **核心变更**：添加 ServerEndpointExporter Bean，Spring Boot 才能注册 @ServerEndpoint
- **commit**：280d3efff

### 11:01 - 扫码备注用户可读格式
- **操作类型**：用户体验优化
- **修改文件**：ScanRecordLogAppendHelper.java
- **核心变更**：备注从技术格式（"扫码类型：production，菲号：null"）改为自然语言（"李老板 完成 二次工艺·02印花 菲号2"）
- **commit**：41b5959f4

### 09:51 - WebSocket 秒级进度同步
- **操作类型**：新功能
- **修改文件**：4个（+1138 -1259）
- **核心变更**：
  - 后端：OrderProgressWebSocketServer + ScanExecutorSupport 推送
  - 前端：useWebSocket.ts 重写 + 生产列表/订单详情订阅
  - 保留5分钟长轮询兜底
- **commit**：338cd1192

### 02:04-02:36 - P0 事故修复（异步线程租户上下文）
- **操作类型**：P0 事故修复
- **修改文件**：ProductionOrderQueryService.java 等
- **核心变更**：异步线程用 UserContext.wrap() 包裹或从订单记录取 tenantId
- **commit**：585af8405 + 786310508

### 00:05-01:26 - 扫码页密集调整（15个提交）
- **操作类型**：UI/UX 反复优化
- **范围**：样衣扫码/大货扫码/扫码结果页，涉及布局、卡片样式、交期兜底、字段平铺
- **问题**：缺少统一设计规范，反复调整多轮
- **commit 范围**：65f8a97eb ~ d90f6a585

---

## 🔧 7-08 工具使用统计

| 工具类型 | 大致调用次数 | 说明 |
|---------|:-----------:|------|
| 文件读取（Read） | 30+ | 排查问题、确认代码 |
| 文件写入（Edit/tee） | 15+ | 修复代码、更新记忆 |
| 代码搜索（Grep/Glob） | 20+ | 定位相关文件和调用链 |
| 终端执行（RunCommand） | 25+ | git 操作、编译验证 |
| TodoWrite | 多次 | 任务进度跟踪 |

---

## 🎫 风险与教训

| 类型 | 发生次数 | 说明 |
|------|:--------:|------|
| 🔴 P0 事故 | 2 | 异步线程租户上下文丢失（数据隔离失效） |
| 🟡 反复调整 | 15次 | 扫码页布局反复改，缺少统一规范 |
| 🟡 记忆遗漏 | 2个文件 | decisionLog.md 和 ai-dashboard.md 漏更新 |
| 🟢 新功能 | 1项 | WebSocket 实时推送，架构升级 |

### 关键教训
1. **异步线程 = 租户上下文丢失高风险区**：必须用 UserContext.wrap() 或显式传 tenantId
2. **UI 反复调整的根因**：缺少设计稿和统一规范，想到啥改啥
3. **记忆同步规则**：不仅要更新 activeContext 和 progress，decisionLog 和 ai-dashboard 也要同步

---

## 📁 7-08 主要修改文件清单

| 模块 | 文件 | 变更类型 |
|------|------|:--------:|
| 后端-扫码 | ScanExecutorSupport.java | 修改 |
| 后端-扫码 | ScanRecordLogAppendHelper.java | 修改 |
| 后端-WebSocket | OrderProgressWebSocketServer.java | 新增 |
| 后端-WebSocket | WebSocketConfig.java | 新增 |
| 后端-样式 | StyleOperationAppendHelper.java | 修改 |
| 后端-样式 | StyleStageHelper.java | 修改 |
| 后端-Flyway | V20260708001__add_tail_combination_process_keywords.sql | 新增 |
| 后端-Flyway | V20260708002__clean_operation_logs_from_style_description.sql | 新增 |
| 前端-生产列表 | riskBadgeRenderers.tsx | 修改 |
| 前端-工序跟踪 | useProcessTrackingColumns.tsx | 修改 |
| 前端-生产列表 | Production/List/index.tsx | 修改 |
| 前端-WebSocket | useWebSocket.ts | 重写 |
| 前端-生产列表 | useProductionListData.ts | 修改 |
| 前端-订单同步 | useOrderSync.ts | 修改 |
| 记忆库 | activeContext.md | 更新 |
| 记忆库 | progress.md | 更新 |
| 记忆库 | decisionLog.md | 更新（本次补上） |
| 记忆库 | ai-dashboard.md | 更新（本次补上） |

---

## 📊 最新会话速览（2026-07-09）

| 指标 | 值 | 状态 |
|------|-----|------|
| 日期 | 2026-07-09 | — |
| 当日提交数 | 16 个 | 📈 |
| 修改文件数 | 42 个 | — |
| 出库优化 | 3个场景（样衣/物料/成品） | ✅ 已完成 |
| 工序阶段修复 | 二次工艺禁用动态跳过 | ✅ 已完成 |
| WebSocket修复 | 3项（token/握手500/StrictMode） | ✅ 已完成 |
| RESTful迁移 | 7个Controller + 15个前端文件 | ✅ 已完成 |
| Flyway修复 | 2项（MySQL 8.0兼容 + 表名错误） | ✅ 已完成 |
| CI优化 | 2项（job合并 + 变量名修复） | ✅ 已完成 |
| 前端编译验证 | npx tsc --noEmit 0 errors | ✅ 通过 |
| 后端编译验证 | mvn compile | ✅ 通过 |

---

## 🎯 7-09 会话目标与结果

**目标主题**：工序阶段误判修复 + 出库仓库/库位选择优化 + WebSocket修复 + RESTful迁移

**关键任务完成清单**：
- [x] 🔧：工序阶段误判修复 — 二次工艺禁用时动态跳过，不再误拦车缝
- [x] 🔧：出库仓库/库位选择优化 — 3个场景移除选择器，改为显示当前位置
- [x] 🐛：WebSocket token缺失导致控制台刷屏
- [x] 🐛：WebSocket握手500 — @ServerEndpoint注入失效
- [x] 🐛：WebSocket StrictMode双重挂载
- [x] 🔄：RESTful迁移第二批 — 7个Controller + 15个前端/小程序/H5文件
- [x] 🐛：Flyway V202606240001/002/003 MySQL 8.0不兼容语法修复
- [x] 🐛：Flyway V20260708002表名错误 style_info→t_style_info
- [x] 🔧：CI门禁job合并 + concurrency减少排队
- [x] 🐛：CI GITHUB_ENV变量名拼写错误

---

## 📝 7-09 操作日志（按时间倒序）

### 21:19 - 记忆文件补录
- **操作类型**：记忆同步
- **修改文件**：activeContext.md / progress.md / decisionLog.md（补D-036/D-037）/ ai-dashboard.md
- **commit**：03d856f4f

### 21:10 - 记忆文件更新
- **操作类型**：记忆同步
- **修改文件**：activeContext.md / ai-dashboard.md / progress.md
- **commit**：0494c7571

### 20:50 - 出库仓库/库位选择优化
- **操作类型**：UX优化（用户反馈）
- **修改文件**：10个（4后端 + 6前端）
- **核心变更**：
  - 样衣借出：移除仓库/库位选择，改为显示当前存储位置
  - 物料出库：移除仓库/库位选择，显示当前位置
  - 成品扫码出库：移除仓库/库位选择，表格增加"当前库位"列
  - 后端统一自动从库存记录获取仓库和库位
- **commit**：324ec2b06

### 20:30 - 工序阶段误判修复
- **操作类型**：Bug修复（反复出现的P1问题）
- **修改文件**：3个（ProductionScanStageSupport.java / ProcessStageDetector.java / ProductionScanStageSupportTest.java）
- **核心变更**：新增 findPrevEnabledStage 动态跳过被禁用的阶段
- **commit**：ec9b20fd0

### 20:00 - WebSocket StrictMode双重挂载修复
- **操作类型**：Bug修复
- **commit**：3c26e7bff

### 19:30 - Flyway表名错误修复
- **操作类型**：Bug修复
- **commit**：afa2d72c0

### 19:00 - CI优化
- **操作类型**：CI/CD
- **commit**：531d7adc1 + 0b4d3e3cd

### 18:00 - RESTful迁移第二批 + WebSocket优化
- **操作类型**：重构
- **commit**：324ec2b06

### 17:00 - WebSocket握手500修复
- **操作类型**：Bug修复
- **commit**：88a782352 + c356c8660 + f7fb21267

### 16:00 - Flyway MySQL 8.0兼容修复
- **操作类型**：Bug修复
- **commit**：ae98091a0

### 15:00 - 样衣开发列表统计 + 语音输入
- **操作类型**：功能优化
- **commit**：9a71f486b

### 14:00 - MaterialPurchase索引修复记录
- **操作类型**：记忆同步
- **commit**：0a648b240

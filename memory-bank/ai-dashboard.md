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
| 修改文件数 | 22 个 | — |
| RESTful迁移 | 7个后端Controller + 15个前端/小程序/H5文件 | ✅ 已完成 |
| 前端编译验证 | npx tsc --noEmit 0 errors | ✅ 通过 |

---

## 🎯 7-09 会话目标与结果

**目标主题**：RESTful迁移第二批完成

**关键任务完成清单**：
- [x] 后端7个Controller旧路径统一为/search规范
- [x] 前端5个API调用文件同步更新
- [x] 小程序3个API模块同步更新
- [x] H5端7个API文件同步更新
- [x] 编译验证通过
- [x] 记忆文件更新完成

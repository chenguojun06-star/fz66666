# 智能体驱动开发工作流

> 融合 DeerFlow / RooFlow / agency-agents / Ruflo / Hermes 五大AI Agent方法论
> 每次开发任务必须遵循本工作流
> 最后更新：2026-07-02（嵌入 P0 #23 MCP 强制调用规则）

---

## 一、工作流总览

```
任务输入
  ↓
[1] 上下文加载（RooFlow Memory Bank）← 读取项目记忆
  ↓
[2] 角色选择（agency-agents）← 根据任务类型切换角色
  ↓
[3] 深度调研（DeerFlow）← 分析根因/需求/影响
  ↓
[4] 任务编排（Ruflo）← 拆解子任务、排序依赖
  ↓
[5] 逐层执行 ← 按角色执行各子任务
  ↓
[6] 质量门控 ← 每个子任务完成后验证
  ↓
[7] 自进化记录（Hermes）← 记录学习点、更新记忆
  ↓
任务输出
```

---

## 二、每次开发必做的7步流程

### 第1步：上下文加载（RooFlow — Memory Bank）

**每次会话开始时必须执行：**

> ⚠️ **P0 #23 强制**：优先用 `memory-bank-mcp.read_all_core` 一次性加载核心记忆，再按需用 Read 补充细节。禁止跳过 MCP 直接逐个 Read。

1. 读取 `memory-bank/activeContext.md` — 当前状态 + 最近变更
2. 读取 `memory-bank/progress.md` — 进度跟踪 + 已完成任务
3. 读取 `memory-bank/decisionLog.md` — 历史决策 + 踩坑记录
4. 读取 `.trae/rules/project_rules.md` — P0铁律（安全底线，23条致命错误）
5. 读取 `.trae/rules/optimization-log-*.md` — 最近优化记录（最近 2 个即可）
6. 读取 `memory-bank/quick-start-5min.md` — 5分钟快速上手（每次必读，新人/新话题/长会话重置时必读）
7. 读取 `memory-bank/anti-patterns.md` — 常见反模式速查（改代码前必读，防止重复踩坑）
8. 读取 `memory-bank/change-impact-matrix.md` — 变更影响矩阵（P0/P1/P2变更识别，改代码前必读）
9. 读取 `memory-bank/context-rot-mgmt.md` — 上下文腐烂治理（长会话>15轮/Token>70%时触发压缩）

**目的**：不丢失上下文，不重复踩坑。

**条件加载**（按需加载，不每次都读）：
| 触发条件 | 额外加载 |
|---------|---------|
| 做代码相关任务 | `memory-bank/anti-patterns.md` + `change-impact-matrix.md` |
| 长会话（>15轮/Token>70%） | `memory-bank/context-rot-mgmt.md` + 生成会话摘要 |
| 新人/新话题/长会话重置 | `memory-bank/quick-start-5min.md` |
| 做 PR/Code Review | `memory-bank/ai-dashboard.md`（查看本次会话操作日志） |

**会话结束时**（每个任务完成后必须执行）：
- 更新 `memory-bank/activeContext.md`：在"最近变更"部分追加本次完成的工作
- 更新 `memory-bank/progress.md`：标记完成的任务
- 如有重要决策，更新 `memory-bank/decisionLog.md`
- 生成会话摘要（如本次会话轮次>10）：按 `context-rot-mgmt.md` 的摘要模板格式追加到 `activeContext.md` 底部

### 第2步：角色选择（agency-agents — 专业分工）

根据任务类型，自动切换到对应角色：

| 任务类型 | 角色 | Agent定义文件 |
|---------|------|-------------|
| 排查bug/线上问题 | Bug调查员 | `.github/agents/bug-investigator.agent.md` |
| 新增完整功能 | 全栈功能编排师 | `.github/agents/fullstack-feature.agent.md` |
| Flyway迁移/DB变更 | Flyway迁移助手 | `.github/agents/flyway-migration.agent.md` |
| 新增前端页面 | 前端功能页面脚手架 | `.github/agents/new-feature-page.agent.md` |
| AI智能体开发 | AI智能体工程师 | `.github/agents/ai-agent-engineer.agent.md` |
| 代码审查/推送前检查 | 质量守门员 | `.github/agents/quality-gatekeeper.agent.md` |
| Orchestrator编写 | Orchestrator构建师 | `.github/agents/orchestrator-builder.agent.md` |

**原则**：一个任务一个主角色，但可以按需切换。复杂任务用全栈功能编排师统筹。

### 第3步：深度调研（DeerFlow — Research → Analyze → Plan）

**在动手写代码之前，必须先调研：**

> ⚠️ **P0 #23 强制**：影响分析必须用 `change-impact-mcp.analyze_change_risk`；调用链/引用查找必须用 `serena`（find_referencing_symbols），禁止用 Grep 搜类名做调用链分析。

#### 3.1 信息收集
- [ ] 搜索相关代码（SearchCodebase / Grep 找片段；**调用链用 serena**）
- [ ] 检查现有实现（是否有类似功能可复用）
- [ ] 检查数据库结构（Entity字段、Flyway迁移）
- [ ] 检查历史案例（decisionLog.md、optimization-log）

#### 3.2 影响分析
- [ ] **★★ 必须执行：用 `change-impact-mcp.analyze_change_risk` 评估变更影响**，再用 Grep 补充搜索字段名所有引用点，一次性全部修改，不得遗漏
- [ ] 涉及哪些模块？（后端/前端/小程序/H5）
- [ ] 是否涉及P0铁律？（Flyway/事务/权限/全链路/多租户/扫码/工资）
- [ ] 是否有上下游依赖？
- [ ] 风险等级？P0/P1/P2/P3

#### 3.3 方案规划
- [ ] 最小改动方案（不做额外重构）
- [ ] 双路径防御（根源修复 + 代码防御）
- [ ] 全链路同步计划

### 第4步：任务编排（Ruflo — 分解 → 排序 → 分配）

**将任务拆解为可执行的子任务列表：**

```
任务：XXX
├── [DBA] Flyway迁移（如果涉及数据库变更）
├── [后端] Orchestrator编排
├── [后端] Service业务逻辑
├── [后端] Controller API端点
├── [前端] API函数 + TS类型
├── [前端] 页面 + 组件 + Hook
├── [小程序] API + 页面同步
└── [QA] 编译验证 + 全链路校验
```

**排序原则**：数据库→后端→前端→小程序→验证

### 第5步：逐层执行

**按编排顺序执行，每层遵循对应角色的规范：**

> ⚠️ **P0 #23 强制**：写代码前必须用 `anti-pattern-mcp.detect_anti_patterns` 检测目标文件是否命中已知反模式（Service 层 @Transactional / 裸 useEffect / 硬编码颜色等），命中后再动手修改。

#### 后端开发规范
- Orchestrator：事务边界，≤150行
- Service：纯业务逻辑，≤200行，无@Transactional
- Controller：≤100行，RESTful API
- Helper：从厚方法拆薄，无状态

#### 前端开发规范
- 页面 index：≤400行
- 组件：≤200行
- Hook：≤80行
- 强制组件：ResizableTable/ResizableModal/RowActions/ModalContentLayout
- 颜色：CSS变量

#### 小程序开发规范
- validationRules.js 与PC端同步
- 共享样式 `styles/.wxss`
- API端点与后端对齐

### 第6步：质量门控

**每个子任务完成后立即验证，不是最后才验证：**

> ⚠️ **P0 #23 强制**：禁止用裸 `mvn compile` / `npx tsc` / `python3 scripts/check-flyway-sql.py` / `python3 scripts/audit-tenant-id.py` 替代 MCP。必须用下列 MCP 工具，MCP 不可用时按 P0 #23 降级规则告知用户。

| 时机 | 检查项 | 强制 MCP 工具 |
|------|--------|--------------|
| Flyway写完 | 幂等性、无字符串字面量、版本号不重复 | `flyway-mcp.validate_migration_sql` + `check_column_deps` + `check_entity_sync` |
| 后端写完 | mvn compile通过、@Transactional位置正确、权限码真实 | `test-runner-mcp.compile_backend` + `anti-pattern-mcp.detect_anti_patterns` |
| 前端写完 | npx tsc --noEmit 0 errors、组件规范、CSS变量 | `test-runner-mcp.typecheck_frontend` + `test-runner-mcp.audit_frontend_colors` |
| 小程序写完 | API对齐、validationRules同步 | `anti-pattern-mcp.detect_anti_patterns`（扫小程序目录） |
| 全部完成 | 全链路数据流验证、多租户隔离 | `test-runner-mcp.audit_tenant_id` + 全链路验证 |
| 查业务数据验证修复 | 确认修复后数据正确 | `db-query-mcp.query_table`（带 tenantId） |

#### ★ 反思三问（D-055，2026-08-05 新增，每个子任务必做）

> **背景**：2026-08-05 一天内连续 5 个 bug（考勤 500/403/AI 跳转失败/AI 回答慢/缺列），根因不是规则不够多，而是缺乏反思机制。详见 `decisionLog.md` D-055。

每个子任务在编译验证通过后、推送代码前，必须回答以下三个问题：

**① 写之前 — 这个改动会影响哪些关联点？**
- [ ] 不只看当前文件，用 `change-impact-mcp.analyze_change_risk` 评估影响范围
- [ ] 涉及数据库变更？→ 加列前查 `INFORMATION_SCHEMA.COLUMNS` 确认列不存在（AP-WF-05）
- [ ] 涉及权限判断？→ 统一用 `UserContext.isSupervisorOrAbove()`（AP-WF-07）
- [ ] 涉及前端跳转？→ grep 接收方的 query 解析，确认参数名一致（AP-WF-08）

**② 写之时 — 这个调用是同步还是异步？是本地还是网络？是 LLM 还是普通函数？**
- [ ] 看到 `chatModel.call()` / `inferenceOrchestrator.chat()` / `evaluateWithLlm()` → **这是 LLM 调用，会阻塞 3-30 秒**（AP-AI-03）
- [ ] LLM 调用必须在用户请求关键路径之外（异步执行），主流程用占位值立即返回
- [ ] 网络调用必须设超时，不能裸调
- [ ] 看到 `INSERT INTO information_schema.*` → **这是只读系统视图，不生效**（AP-WF-06）

**③ 写之后 — 用一个真实场景端到端走一遍，不能只靠编译通过**
- [ ] 编译通过 ≠ 运行正确（今天 5 个 bug 中 4 个编译通过但运行报错）
- [ ] 涉及 API？→ 用 `db-query-mcp.query_table` 查真实数据验证返回值
- [ ] 涉及权限？→ 用一个非超级管理员账号测一遍
- [ ] 涉及跳转？→ 真的点一次看页面是否正常
- [ ] 涉及异步？→ 看日志确认异步任务真的执行了

> **反思不通过 = 不允许推送**。如果三问中任何一项答不出来，说明验证不充分，回到第3步深度调研。

### 第7步：自进化记录（Hermes — 学习 → 记录 → 改进）

**每次任务完成后必须更新记忆：**

1. **更新 `memory-bank/activeContext.md`**：
   - 最近变更
   - 当前进行中
   - 已知问题
   - 下一步

2. **更新 `memory-bank/progress.md`**：
   - 标记完成的任务
   - 添加新发现的待办

3. **更新 `memory-bank/decisionLog.md`**（如有重要决策）：
   - 决策编号 D-XXX
   - 上下文、决策、理由

4. **更新优化记录**（如有P0/P1修复）：
   - 记录到 `.trae/rules/optimization-log-*.md`

5. **记录学习点**：
   - 什么模式有效？→ 记录到 systemPatterns
   - 什么踩坑了？→ 记录到 decisionLog
   - 什么可以自动化？→ 记录到待办

### 区分：开发自进化 vs AI 自进化

本项目存在两个"自进化"概念，必须区分：

| 维度 | 开发自进化（本步骤） | AI 自进化（系统内置） |
|------|-------------------|---------------------|
| 主体 | 人类开发者（你） | AI 系统自身 |
| 目的 | 记录踩坑、沉淀经验 | AI 自动改进回答质量 |
| 存储 | `memory-bank/` + `optimization-log-*.md` | `SelfCriticService` + `EvolutionPipeline` + `RealTimeLearningLoop` |
| 触发 | 每次任务完成后手动执行 | 每轮对话后自动执行 |
| 产物 | 文档更新 | AI 记忆/画像/技能进化 |

**交叉引用**：AI 自进化系统详见 `xiaoyun-ai-inventory.md` 第八章"自我进化系统"。本步骤只负责**开发自进化**（人类记录）。

---

## 三、任务类型速查表

| 你要做什么 | 用哪个角色 | 关键检查点 |
|-----------|-----------|-----------|
| 修bug | Bug调查员 | 根因分析→最小修复→全链路验证 |
| 加新功能 | 全栈功能编排师 | 任务拆解→逐层执行→质量门控 |
| 改数据库 | Flyway迁移助手 | 幂等SQL→Entity同步→云端兼容 |
| 加前端页面 | 前端功能页面脚手架 | 标准组件→Hook抽离→路由注册 |
| 改AI系统 | AI智能体工程师 | 数据真实性→质量门→自进化 |
| 推送代码 | 质量守门员 | P0铁律→编译→Git检查 |
| 写Orchestrator | Orchestrator构建师 | 事务边界→Service编排→≤150行 |

---

## 四、紧急情况处理（P0事故）

当遇到P0事故（全站不可用、核心功能崩溃）时：

### 快速通道（跳过常规流程）

1. **立即止血**：最小改动恢复服务，不做重构
2. **双路径防御**：根源修复 + 代码防御
3. **记录事故**：更新 optimization-log + decisionLog
4. **事后复盘**：补充完整调研和长期修复方案

### P0事故检查清单

- [ ] 是否影响所有用户？
- [ ] 是否有数据丢失风险？
- [ ] 是否需要回滚？
- [ ] 修复后是否需要清缓存测试？
- [ ] 是否需要同步修复小程序/H5？

---

## 五、记忆更新命令

在任何时候，可以说"更新记忆"或"UMB"来强制同步当前会话信息到 Memory Bank。

---

## 六、方法论来源

| 方法论 | 来源项目 | 核心理念 | 我们如何使用 |
|--------|---------|---------|------------|
| RooFlow | github.com/GreatScottyMac/RooFlow | Memory Bank 持久化上下文 | `memory-bank/` 目录，跨会话记忆 |
| agency-agents | github.com/keeply-cn/agency-agents-zh | 80+专业角色分工 | `.github/agents/` 角色定义 |
| DeerFlow | github.com/bytedance/deer-flow | 深度调研→分析→报告 | Bug调查员的4阶段调研法 |
| Ruflo | github.com/ruvnet/ruflo | 多智能体编排+质量门控 | 全栈功能编排师的分层执行+门控 |
| Hermes | github.com/NousResearch/hermes-agent | 自进化学习闭环 | 每次任务后的7步自进化记录 |

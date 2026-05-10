# 小云系统 — 团队职责分配与协作规范

> 版本 v1.0 | 生成时间 2026-05-02 | 基于 INTELLIGENCE_UPGRADE_PLAN.md + 代码库审计 + 智能模块盘点报告

---

## 一、系统全景概览

### 1.1 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│  PC 端 (React 18 + TS + Ant Design 5.22)                     │
│  H5 端 (React + Vite)                                        │
│  小程序 (微信原生 + shared 共享模块)                          │
│  Flutter App                                                 │
├─────────────────────────────────────────────────────────────┤
│  Spring Boot 3.4.5 + MyBatis-Plus + MySQL 8.0               │
│  Redis (Lettuce) + WebSocket (STOMP)                         │
│  AI: Spring AI + DeepSeek/MaxKB + Qdrant + MCP Protocol     │
├─────────────────────────────────────────────────────────────┤
│  Docker 部署 + GitHub Actions CI/CD + 腾讯云 CloudBase       │
│  编排器总数: 235+ (105业务 + 130 AI智能体)                   │
│  Controller: 100+ | Tool: 75+ 业务工具                      │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心模块划分

| 模块 | 代码路径 | 业务领域 | 关联端 |
|------|---------|---------|--------|
| **production** | `backend/.../production/` | 生产订单、工序流转、扫码、裁剪、入库 | PC + H5 + 小程序 |
| **intelligence** | `backend/.../intelligence/` | AI Agent、推理、记忆、路由、工具生态、DAG编排 | PC + H5 |
| **finance** | `backend/.../finance/` | 工资、对账、发票、应付、成本、利润 | PC |
| **warehouse** | `backend/.../warehouse/` | 成品库存、物料库存、盘点、调拨 | PC + H5 + 小程序 |
| **style** | `backend/.../style/` | 款式信息、SKU、BOM、报价、模板 | PC |
| **system** | `backend/.../system/` | 租户、组织、用户、权限、字典、应用商店 | PC + H5 |
| **crm** | `backend/.../crm/` | 客户管理、应收款 | PC + H5 |
| **dashboard** | `backend/.../dashboard/` | 仪表盘、日报、统计 | PC + H5 |
| **selection** | `backend/.../selection/` | 选品 | PC |
| **stock** | `backend/.../stock/` | 样衣库存 | PC |
| **procurement** | `backend/.../procurement/` | 采购、供应商门户 | PC + H5 |
| **integration** | `backend/.../integration/` | 物流、支付对接、OpenAPI | PC |
| **miniprogram** | `miniprogram/` | 微信小程序端 | 小程序 |
| **h5-web** | `h5-web/` | H5 移动网页端 | H5 |
| **flutter_app** | `flutter_app/` | Flutter 移动端 | Flutter |
| **frontend** | `frontend/` | PC 管理后台 | PC |

---

## 二、团队角色架构

```
                    ┌──────────────────┐
                    │   项目负责人 (1)   │
                    │  - 全局决策/风控   │
                    └────────┬─────────┘
                             │
        ┌────────┬────────┬──┴──┬────────┬────────┐
        │        │        │     │        │        │
   ┌────┴───┐┌───┴───┐┌───┴──┐┌─┴──┐┌───┴───┐┌───┴───┐
   │后端组长││前端组长││AI组长││运维 ││测试/QA││小程序 │
   │ (1)   ││ (1)   ││ (1)  ││(1)  ││ (1)   ││ (1)   │
   └───┬───┘└───┬───┘└──┬───┘└────┘└───────┘└───────┘
       │        │       │
   ┌───┴───┐┌───┴───┐┌──┴────┐
   │后端开发││前端开发││AI开发  │
   │ (2-3) ││ (2-3) ││ (1-2)  │
   └───────┘└───────┘└───────┘
```

### 2.1 理想团队配置（6-10人）

| 角色 | 人数 | 核心职责 |
|------|:----:|---------|
| **项目负责人/架构师** | 1 | 全局技术决策、需求优先级、风险管控、跨组协调 |
| **后端开发组长** | 1 | 后端架构、核心业务模块（生产/财务）、Code Review |
| **后端开发工程师** | 2-3 | 业务模块开发、接口实现、单元测试 |
| **前端开发组长** | 1 | 前端架构、组件库治理、PC + H5 核心开发 |
| **前端开发工程师** | 2-3 | PC 端页面、H5 页面、性能优化 |
| **AI/智能化开发组长** | 1 | AI 架构决策、Agent 编排、向量检索、模型选型 |
| **AI/智能化开发工程师** | 1-2 | AI 工具开发、记忆系统、语义路由、MCP 协议 |
| **小程序工程师** | 1 | 微信小程序开发、跨端兼容、扫码链路 |
| **测试/QA** | 1 | 全链路测试、自动化测试、冒烟测试 |
| **DevOps/运维** | 1（可兼）| CI/CD、Docker、云托管、数据库运维 |
| **Flutter 工程师** | 1（按需）| Flutter 移动端开发 |

> **缩减配置（4-5人）**：后端组长兼运维 + 1后端、前端组长兼小程序 + 1前端、AI组长兼后端开发、项目负责人兼测

---

## 三、各岗位职责边界定义

### 3.1 项目负责人/架构师

**所属模块**：全局

| 维度 | 内容 |
|------|------|
| **核心职责** | 技术架构决策；需求优先级排序；跨组协调；风险管控与上线审批 |
| **具体工作** | 定版技术方案；审批 DB Schema 变更（Flyway）；裁决模块间接口争议；代码库健康度监控 |
| **协作输入** | 各组周报、技术难题、风险报告、重大需求 |
| **协作输出** | 技术决策纪要、需求优先级矩阵、架构变更通知、季度技术路线 |
| **不可下放** | P0 规则豁免审批；Flyway SQL 最终审核；生产环境配置变更审批 |
| **对接模块** | 全部 |

---

### 3.2 后端开发组长

**所属模块**：`production` + `finance` + `system` 核心

| 维度 | 内容 |
|------|------|
| **核心职责** | 后端架构治理；核心链路开发（生产下单/工序流转/财务结算）；Code Review；Flyway 迁移审核 |
| **具体工作** | 复杂 Orchestrator 编写；事务边界设计；多租户隔离实施；100+ Controller 契约维护 |
| **代码领地** | `production/orchestration/` (20+ 编排器)、`finance/orchestration/` (18+)、`system/orchestration/` (15+) |
| **P0 红线** | 不修改工序映射优先级规则；事务仅 Orchestrator 层；权限码必须对应 `t_permission` 真实记录 |
| **对接角色** | 前端组长 → API 契约；AI 组长 → 智能编排接口契约（已在 [智能编排接口清单](docs/智能编排接口清单-可开工版.md) 定义）；测试 → 全链路用例 |
| **对接模块** | `production` `finance` `system` `crm` `warehouse` `style` `procurement` |

---

### 3.3 后端开发工程师（分配覆盖全部模块）

| 工程师 | 负责模块 | 模块说明 |
|--------|---------|---------|
| **后端 #1** | `production` + `warehouse` | 生产订单、工序流转、扫码核心、裁剪分扎、入库出库、成品库存、物料库存 |
| **后端 #2** | `finance` + `style` + `crm` | 工资结算、对账、发票、款式信息、BOM、报价、客户管理 |
| **后端 #3** | `system` + `stock` + `selection` + `procurement` + `dashboard` | 租户/组织/用户/权限、样衣库存、选品、采购、仪表盘 |

| 维度 | 内容 |
|------|------|
| **通用职责** | Service/Mapper 层实现；单元测试；`validationRules` 同步；全链路联调 |
| **协作规范** | Service 层禁止互调（必须通过 Orchestrator）；所有 DB 变更必须 Flyway；多租户查询必须 `tenantId + factoryId` |
| **信息共享** | API 变更必须同步更新 [智能编排接口契约-字段级](docs/智能编排接口契约-字段级.md) |
| **质量门禁** | Orchestrator 100% 单测覆盖；Service 70%+；Controller ≤100 行；Orchestrator ≤200 行 |

---

### 3.4 前端开发组长

**所属模块**：PC 端 `frontend/` + H5 端 `h5-web/` 架构

| 维度 | 内容 |
|------|------|
| **核心职责** | 前端架构决策；组件库治理（ResizableTable/ResizableModal/RowActions 等强制组件）；PC + H5 核心页面开发 |
| **具体工作** | 维护 设计系统 v3.0 规范；PC 端模块架构（basic/crm/dashboard/finance/production/warehouse/system/selection）；H5 端核心页面（扫描/工作台/仪表盘） |
| **代码领地** | `frontend/src/modules/` (8大模块)、`frontend/src/components/` (强制组件)、`h5-web/src/pages/` (20+ 页面) |
| **P0 红线** | 禁止用 antd Table（必须 ResizableTable）；禁止自定义操作列（必须 RowActions）；弹窗仅 60/40/30vw 三档；颜色必须 CSS 变量 |
| **对接角色** | 后端组长 → API 契约确认；小程序工程师 → 共享校验规则同步 (`validationRules.ts` ↔ `validationRules.js`) |
| **对接模块** | `frontend/all` `h5-web/all` |

---

### 3.5 前端开发工程师

| 工程师 | 负责模块（PC端） | H5 端页面 |
|--------|-----------------|----------|
| **前端 #1** | `production`（生产订单/工序/扫码记录/入库）+ `dashboard`（仪表盘/日报）| ScanPage、WorkPage、DashboardPage |
| **前端 #2** | `finance`（工资/对账/发票）+ `style`（款式/SKU/BOM）+ `crm`（客户） | PayrollPage、HomePage、CrmLogin |
| **前端 #3** | `system`（租户/组织/权限/应用商店）+ `warehouse`（库存/盘点/调拨）+ `selection`（选品）| AdminPage、InboxPage、FeedbackPage |

| 维度 | 内容 |
|------|------|
| **通用职责** | React 组件 ≤200 行（页面 index ≤400 行）；自定义 Hook ≤80 行；表单用 `ModalContentLayout` + `ModalFieldRow` |
| **协作规范** | API 调用统一走 `services/` 封装；`validationRules.ts` 修改必须通知小程序工程师同步 `validationRules.js` |
| **质量门禁** | `npx tsc --noEmit` 0 errors；禁止硬编码颜色；禁止 `@Deprecated` API |

---

### 3.6 AI/智能化开发组长

**所属模块**：`intelligence/` 全量 + 全局 AI 架构

| 维度 | 内容 |
|------|------|
| **核心职责** | AI 架构决策；Agent Loop/DAG 编排引擎维护；AI 升级路线图执行（P0-P2 各项）；模型选型与成本控制 |
| **具体工作** | Agent Loop 引擎优化（多轮对话/Stuck检测）；DAG 多智能体编排深化；向量嵌入接入设计与实施；MCP 协议扩展；Critic 自审层增强 |
| **代码领地** | `intelligence/agent/loop/`（Agent Loop 引擎）、`intelligence/agent/dag/`（DAG 编排）、`intelligence/orchestration/`（63+智能编排器）、`intelligence/gateway/`（AI 推理网关） |
| **当前核心任务** | 向量数据库选型（Milvus vs PGVector）；`EmbeddingService` 设计；P0-2.1 向量嵌入接入 |
| **对接角色** | 后端组长 → 智能编排接口契约联动；前端组长 → AI 对话面板 (GlobalAiAssistant) 前后端联调；运维 → 向量数据库部署 |
| **对接模块** | `intelligence/*` 全部 + `integration/openapi`（AI 能力开放） |

---

### 3.7 AI/智能化开发工程师

| 维度 | 内容 |
|------|------|
| **核心职责** | AI 工具开发（75+ Tool 维护与扩展）；记忆系统（LongTermMemory 三层架构）；语义路由优化；知识图谱接入 |
| **具体工作** | 新增/维护 `agent/tool/*` 工具类；`LongTermMemoryOrchestrator` 记忆检索增强；`SemanticDomainRouter` 领域识别优化；KnowledgeSearchTool 知识库检索 |
| **代码领地** | `intelligence/agent/tool/` (75+工具类)、`intelligence/orchestration/LongTermMemoryOrchestrator.java`、`intelligence/agent/router/SemanticDomainRouter.java`、`intelligence/controller/McpProtocolController.java` |
| **协作规范** | 新增工具必须注册 `@McpToolAnnotation`；记忆写入必须同步向量库；工具返回规格对齐 [智能编排接口契约-字段级](docs/智能编排接口契约-字段级.md) |

---

### 3.8 小程序工程师

**所属模块**：`miniprogram/` 全量 + `h5-web/source-miniapp/` 共享模块

| 维度 | 内容 |
|------|------|
| **核心职责** | 微信小程序开发与维护；扫码核心链路（6个扫码页面）；跨端共享模块 (`miniprogram/shared/`) 维护 |
| **具体工作** | 首页/工作台/仪表盘/通知/管理/扫码 → 共 6 大页面群；`validationRules.js` 与 PC 端同步；WebSocket 事件订阅（6页面接入）；扫码离线队列 |
| **代码领地** | `miniprogram/pages/` (20+ 小程序页面)、`h5-web/source-miniapp/utils/`（共享工具）、`h5-web/source-miniapp/app.*`（入口） |
| **P0 红线** | 禁止修改防重复扫码 `minInterval` 逻辑；`validationRules.js` 必须与 PC `validationRules.ts` 同步 |
| **对接角色** | 前端组长 → validationRules 双向同步；后端组长 → 扫码接口全链路校验；测试 → 小程序冒烟测试 |
| **对接模块** | `miniprogram/*` `h5-web/source-miniapp/*` |

---

### 3.9 测试/QA

| 维度 | 内容 |
|------|------|
| **核心职责** | 全链路测试用例编写；自动化回归测试；冒烟测试执行；云端环境校验 |
| **具体工作** | Orchestrator 级别集成测试；扫码全链路测试（7条扫码路径）；财务对账测试（薪资/应付/应收）；三端（PC/H5/小程序）一致性校验 |
| **测试资产** | Playwright e2e 测试 (`frontend/e2e/`)；[智能化接口冒烟清单](docs/智能化接口冒烟清单-20260307.md)；[云端SQL发布检查清单](deployment/云端SQL发布检查清单.md) |
| **质量门禁** | 每次 PR 必须通过核心链路回归；上线前执行 [PreLaunchAudit](PRE_LAUNCH_AUDIT_REPORT.md) |
| **对接角色** | 全体开发 → Bug 提交与验证 |

---

### 3.10 DevOps/运维

| 维度 | 内容 |
|------|------|
| **核心职责** | CI/CD 流水线 (`ci.yml`/`deploy-*.yml`/`copilot-review.yml`)；Docker 容器管理；腾讯云 CloudBase 维护；数据库备份 |
| **具体工作** | MySQL 8.0 Docker (端口 3308) 维护；Redis 部署；Flyway 执行监控；性能压测 (STABILITY_TEST)；云端 DB Schema 一致性核对 |
| **运维资产** | `deployment/backup-database.sh`；`deployment/db-manager.sh`；[紧急响应手册](deployment/紧急响应手册.md)；[上线部署指南](deployment/上线部署指南.md) |
| **P0 红线** | 禁止手动 `docker exec mysql -e "ALTER TABLE..."`；禁止修改已执行 Flyway V*.sql；Flyway Silent Failure 必须双路径防御 |
| **对接角色** | AI 组长 → 向量数据库部署；后端组长 → Flyway 执行 |

---

### 3.11 Flutter 工程师（按需）

| 维度 | 内容 |
|------|------|
| **核心职责** | Flutter 移动端开发维护 |
| **代码领地** | `flutter_app/lib/`（components/config/pages/routes/theme/utils） |
| **对接角色** | 后端组长 → API 复用 Spring Boot 后端 |
| **对接模块** | `flutter_app/*` |

---

## 四、模块归属与接口对接规范

### 4.1 模块归属矩阵

| 业务模块 | 后端 Owner | 前端 Owner | AI 介入 | 小程序 | H5 |
|----------|-----------|-----------|:---:|:---:|:---:|
| **production** | 后端 #1 | 前端 #1 | ✅ 智能扫/预检 | ✅ | ✅ |
| **finance** | 后端 #2 | 前端 #2 | ✅ 审计/预测 | — | — |
| **warehouse** | 后端 #1 | 前端 #3 | ✅ 库存智能建议 | ✅ | ✅ |
| **style** | 后端 #2 | 前端 #2 | ✅ 款式画像/模板推荐 | — | — |
| **system** | 后端 #3 | 前端 #3 | ✅ 租户智能开关 | — | — |
| **crm** | 后端 #2 | 前端 #2 | — | — | ✅ |
| **dashboard** | 后端 #3 | 前端 #1 | ✅ 日报/健康指数 | ✅ | ✅ |
| **selection** | 后端 #3 | 前端 #3 | — | — | — |
| **stock** | 后端 #3 | 前端 #2 | — | — | — |
| **procurement** | 后端 #3 | 前端 #3 | ✅ 采购智能识别 | — | ✅ |
| **integration** | 后端组长 | 后端 #3 | — | — | — |
| **intelligence** | AI 组长 | 前端组长 | ✅ 全部 | ♻ 扫码场景 | ♻ 对话面板 |

> ♻ = 仅接收 AI 推送/提醒，不直接开发 AI 能力

### 4.2 接口对接规范

```
┌──────────────────────────────────────────────────────────────┐
│  接口契约文档：「docs/智能编排接口清单-可开工版.md」           │
│  字段级规范：「docs/智能编排接口契约-字段级.md」               │
├──────────────────────────────────────────────────────────────┤
│  变更流程：                                                    │
│  1. 提案人 → 在对应 Feat Issue 中声明 API 变更                 │
│  2. 接口双方 Owner → 同步 Review (至少前后端各一)              │
│  3. 契约文档同步更新 → 标注版本号                              │
│  4. 前端 API 封装 → `frontend/src/services/*Api.ts` 同步     │
│  5. 小程序 → 如有涉及同步校验 `validationRules.js`            │
└──────────────────────────────────────────────────────────────┘
```

**关键约定**：
- ❌ 旧 GET 查询：`GET /by-xxx/{id}` → ✅ 统一 `POST /list` + 过滤参数
- ❌ 旧状态流转：`POST /{id}/submit` → ✅ `POST /{id}/stage-action?action=xxx`
- 后端 JacksonConfig 已配置 `Long → String`（防前端精度丢失）
- 金额统一以「元」返回、前端组件统一用 `money.wxs`/`money.ts` 格式化

### 4.3 智能编排接口契约

所有 AI 智能编排器对外接口，必须遵循以下规范（详见 [智能编排接口契约-字段级](docs/智能编排接口契约-字段级.md)）：

| 规范项 | 规则 |
|--------|------|
| **请求体** | 统一 DTO，字段命名 camelCase，含必要校验注解 |
| **响应体** | 统一 `Result<T>` 包装，含 `code`/`data`/`message` 三要素 |
| **错误码** | 全局 `GlobalExceptionHandler` 统一处理，不自行 try-catch 返回 |
| **流式输出** | SSE 走 `SseEmitterHelper`，统一 `SseEvent` 格式 |
| **工具结果** | Agent Tool 返回 JSON Object，含 `success`/`data`/`evidence` |

---

## 五、信息共享机制

### 5.1 日常沟通渠道

| 渠道 | 频率 | 参与角色 | 内容 |
|------|:---:|---------|------|
| **晨会** | 每日 15min | 全团队 | 昨完成/今计划/阻塞项 |
| **后端-前端接口对齐** | 按需 | 后端组长 + 前端组长 | API 契约确认、字段变更、Mock 数据 |
| **AI 周会** | 每周 30min | AI 组长 + AI 工程师 + 后端组长 | AI 升级进度、模型成本、向量检索效果 |
| **Code Review** | 每个 PR | 模块 Owner | P0 规则校验、行数门禁、权限码核对 |
| **上线评审** | 每次上线 | 架构师 + 开发组长 + 运维 | Flyway 核对、Schema 一致性、压测报告 |

### 5.2 文档资产共享

| 文档 | 维护人 | 用途 |
|------|--------|------|
| [开发指南.md](开发指南.md) | 前端组长 + 后端组长 | 新人 onboarding、编码规范速查 |
| [系统状态.md](系统状态.md) | DevOps/运维 | 每次变更后即时更新进度 |
| [智能模块完整盘点报告.md](docs/智能模块完整盘点报告.md) | AI 组长 | 每次智能功能上线后更新（标注上线状态） |
| [智能化接口冒烟清单.md](docs/智能化接口冒烟清单-20260307.md) | 测试 | 每次全量测试后更新 check 结果 |
| [设计系统完整规范-2026.md](设计系统完整规范-2026.md) | 前端组长 | 设计和组件使用唯一源 |
| [INTELLIGENCE_UPGRADE_PLAN.md](INTELLIGENCE_UPGRADE_PLAN.md) | AI 组长 | AI 升级季度追踪 |
| `TEAM_ROLE_ASSIGNMENT_PLAN.md`（本文档） | 项目负责人 | 团队分工、跨组接口 |
| [上线部署指南.md](deployment/上线部署指南.md) | DevOps/运维 | 上线操作 SOP |

### 5.3 代码库共享协作

- **GitHub Issues**：Bug 归属 → 模块 Owner；新需求 → PM/架构师分配 → 对应模块链接
- **CODEOWNERS**（`.github/CODEOWNERS`）：代码文件 → 模块 Owner 自动分配 Reviewer
- **copilot-instructions.md**：全团队共享的 P0 铁律速查 → AI/代理强制维护上下文
- **Prompts 库**（`.github/prompts/`）：`ai-tool.prompt.md` / `bug-fix.prompt.md` / `db-migration.prompt.md` / `new-feature.prompt.md` → 各角色按场景加载

---

## 六、需求优先级排序体系

### 6.1 优先级判定矩阵

| 优先级 | 定义 | 判定条件 | 示例 |
|:------:|------|---------|------|
| **P0** | 紧急阻塞 | 线上 500/403/数据不一致 / 核心链路崩 | 云端缺表、权限码错误、扫码断链 |
| **P1** | 高价值 + 低风险 | 不影响现有核心链路的功能增强 / 体验优化 | AI 向量检索接入、缓存优化 |
| **P2** | 治理/运营长期见效 | 可观测/可解释/成本优化/培训 | AI 成本看板、决策解释链 |
| **P3** | 技术创新/储备 | 按需启动、有明确 ROI | 语音交互、视觉质检 |

### 6.2 当前需求优先级总览

| 项 | 来源 | 优先级 | 负责角色 | 依赖 |
|----|------|:------:|---------|------|
| 向量嵌入正式接入 | [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P0) 2.1 | **P1** | AI 组长 + AI 工程师 | 向量数据库选型 |
| 多智能体协作深化 | [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P0) 2.2 | **P1** | AI 组长 + 后端组长 | 消息总线 |
| 工具调用动态规划 | [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P0) 2.3 | **P1** | AI 工程师 | — |
| 响应缓存与热点查询 | [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P1) 2.4 | **P1** | 后端 #1 + AI 工程师 | Redis |
| 提示词外部化/A/B测试 | [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P1) 2.5 | **P1** | AI 工程师 + 后端 #3 | `AiPromptTemplate` 表 |
| 多模态能力（语音/视觉）| [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P1) 2.6 | **P2** | AI 组长 + 前端组长 | GPT-4o / 通义千问 VL |
| AI 决策可解释性 | [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P2) 2.7 | **P2** | AI 工程师 + 前端 #3 | Critic 增强 |
| 自助化 Agent 训练 | [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P2) 2.8 | **P2** | AI 工程师 + 后端 #3 | Feedback Loop |
| AI 成本精细化管理 | [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P2) 2.9 | **P2** | AI 工程师 + DevOps | AiCostTracking 实体已有 |
| Flutter 端功能补齐 | [flutter_app/](flutter_app/) | **P3** | Flutter 工程师 | — |
| 视觉 AI 质检集成 | [INTELLIGENCE_UPGRADE_PLAN](INTELLIGENCE_UPGRADE_PLAN.md#P1) 2.6 §4 | **P3** | AI 工程师 + 前端 #1 | 多模态 API |

### 6.3 季度执行规划（对齐 AI 升级路线图）

| 季度 | 里程碑 | 核心交付 | 负责角色 |
|------|--------|---------|---------|
| **Q2 2026** | 向量检索 + 提示词治理 | `EmbeddingService` 接入；`AiPromptTemplate` 配置化 | AI 组长、AI 工程师、后端 #3 |
| **Q3 2026** | 多智能体协作 | `MultiAgentOrchestrator`、角色分工、`AgentMessageBus` | AI 组长、AI 工程师、后端组长 |
| **Q4 2026** | 多模态 + 自助训练 | `MultimediaService`、`AgentTrainingCenter`、成本看板 | AI 全体、前端组长、DevOps |

---

## 七、协作流程

### 7.1 需求 → 上线 端到端流程

```
需求提出 → 优先级判定 → 分配 Owner
         ↓
技术方案 (需求方 + Owner + 架构师，复杂需求必须方案评审)
         ↓
开发实现 (按模块归属)
  ├─ 后端: Flyway + Entity + Mapper + Service + Orchestrator + Controller
  ├─ 前端: Service封装 + Hook + 组件 + 页面
  ├─ AI: 编排器 + 工具 + Prompt (同步更新盘点报告)
  └─ 小程序: 同步 PC 逻辑 + validationRules.js 同步
         ↓
自测 (单元测试 + 接口联调 + 跨端校验)
         ↓
Code Review (模块 Owner + P0 红线检查)
         ↓
合并 → CI 自动构建 → QA 冒烟测试
         ↓
上线评审 → 部署 (云端 CloudBase / Docker)
         ↓
监控 (日志 + 成本追踪) → 更新 系统状态.md
```

### 7.2 跨组协作触发规则

| 场景 | 触发动作 | 协作角色 |
|------|---------|---------|
| **新增 Entity 字段** | 同步 Check → Flyway V*.sql + `db/migration/` check | 后端开发 + DevOps |
| **API 变更** | 更新 [智能编排接口清单](docs/智能编排接口清单-可开工版.md) + 通知前端 | 后端 Owner + 前端 Owner |
| **新增 Tool** | 注册 `@McpToolAnnotation` + 同步 [智能模块盘点报告](docs/智能模块完整盘点报告.md) | AI 工程师 |
| **validationRules 变更** | `validationRules.ts` ↔ `validationRules.js` 双向同步 | 前端开发 + 小程序工程师 |
| **工序映射变更** | 全链路校验 + 三端 + 父节点门禁回归 | 后端 #1 + 小程序 + 测试 |
| **智能功能上线** | 更新 [智能模块盘点报告](docs/智能模块完整盘点报告.md) 中的状态标记 | AI 组长 |

### 7.3 问题升级路径

```
发现问题 → 所属模块 Owner → 2h 内确认是否为 P0
         ↓  (P0: 生产环境500/403/数据不一致)
P0    → 立即通知架构师 + DevOps → 启动 [紧急响应手册](deployment/紧急响应手册.md)
         ↓  (非 P0)
创建 Issue → 分配优先级 → 归属模块 Owner → 纳入下个迭代
```

---

## 八、P0 铁律团队执行清单

| # | 铁律 | 检查人 | 时机 |
|---|------|--------|------|
| 1 | DB 变更必须有 Flyway V*.sql | **后端开发** | 每次 commit |
| 2 | Flyway SQL 禁止动态 SQL 内含 `''` 字符串字面量 | **后端组长** | Code Review |
| 3 | 权限码必须是 `t_permission` 真实存在的 | **后端 #3** | 新增接口 |
| 4 | Service 不加 `@Transactional` | **后端组长** | Code Review |
| 5 | 全链路校验（扫码/工序/质检/入库/两端） | **小程序 + 后端 #1** | 改扫码链路 |
| 6 | 子工序→父节点：模板 > DB 动态 > 兜底（不硬编码）| **后端 #1** | 改工序逻辑 |
| 7 | 多租户查询必须 `tenantId + factoryId` | **全体后端** | Code Review |
| 8 | 上下文维护（每次对话更新进度快照） | **全体** | 每次会话 |
| 9 | 禁止 `git add .` → 必须逐文件 `git add` | **全体** | 每次 commit |
| 10 | 新增 Entity 字段 → 必须有 Flyway → `grep -r` 验证 | **后端开发 + 运维** | PR Review |

---

## 九、附录

### A. 模块文件数量统计

| 模块 | 控制器 | 编排器 | Service | Mapper | Entity |
|------|:--:|:--:|:--:|:--:|:--:|
| **intelligence** | 25 | 63+ | 10+ | 30+ | 55+ |
| **production** | 20+ | 24+ | 15+ | 30+ | 40+ |
| **finance** | 15+ | 18+ | 12+ | 15+ | 20+ |
| **system** | 12+ | 15+ | 10+ | 15+ | 15+ |
| **warehouse** | 8+ | 6+ | 6+ | 8+ | 10+ |
| **style** | 5+ | 5+ | 8+ | 8+ | 10+ |
| **其他** | 15+ | 15+ | 10+ | 15+ | 15+ |

### B. 智能编排器 63 个详细清单 → [智能模块完整盘点报告](docs/智能模块完整盘点报告.md)

### C. 联系人与文档快捷索引

| 文档 | 全路径 |
|------|---------|
| AI 升级路线图 | [INTELLIGENCE_UPGRADE_PLAN.md](INTELLIGENCE_UPGRADE_PLAN.md) |
| 智能模块盘点 | [docs/智能模块完整盘点报告.md](docs/智能模块完整盘点报告.md) |
| 开发指南 | [开发指南.md](开发指南.md) |
| 系统状态 | [系统状态.md](系统状态.md) |
| 设计规范 | [设计系统完整规范-2026.md](设计系统完整规范-2026.md) |
| 部署指南 | [deployment/上线部署指南.md](deployment/上线部署指南.md) |
| 紧急响应 | [deployment/紧急响应手册.md](deployment/紧急响应手册.md) |
| 小程序指南 | [docs/小程序开发完整指南.md](docs/小程序开发完整指南.md) |
| 冒烟清单 | [docs/智能化接口冒烟清单-20260307.md](docs/智能化接口冒烟清单-20260307.md) |
| 接口契约 | [docs/智能编排接口清单-可开工版.md](docs/智能编排接口清单-可开工版.md) |
| 字段契约 | [docs/智能编排接口契约-字段级.md](docs/智能编排接口契约-字段级.md) |

---

> 本文档基于 `INTELLIGENCE_UPGRADE_PLAN.md` + 代码库审计 + [智能模块完整盘点报告](docs/智能模块完整盘点报告.md) + [系统状态.md](系统状态.md) + [开发指南.md](开发指南.md) 综合生成。
> 文档更新频率：每次团队架构变动或季度规划迭代同步更新。

---

## 十、全系统性能基线 & 优化工程量估算

> 以下数据来自 `STABILITY_TEST_REPORT_20260311.md` + `PRESSURE_TEST_RESULTS_20260311.md` + `缓存全盘审计报告-20260316.md` + `PRE_LAUNCH_FINAL_REPORT_20260427.md` —— 均为系统实测。

### 10.1 当前性能基线

#### 10.1.1 后端核心指标

| 指标 | 当前值 | 评级 |
|------|--------|:--:|
| **单线程吞吐** (ab -n 1000 -c 1) | 2,292 req/s | 🟢 |
| **100 VU 吞吐** | 4,253 req/s | 🟢 EXCELLENT |
| **100 VU P95 延迟** | <30ms | 🟢 |
| **500 VU** | ❌ Connection reset（连接池 20 耗尽） | 🔴 |
| **1000 VU** | ❌ 同上，即时失败 | 🔴 |
| **关键 API 可用性** | 5/5 = 100% | 🟢 |
| **首屏加载** | <3s | 🟢 |
| **Token 认证（首次）** | 150~200ms | 🟢 |
| **Token 缓存命中** | <5ms | 🟢 |

#### 10.1.2 AI / 智能化模块规模

| 指标 | 当前值 | 来源 |
|------|--------|------|
| **智能编排器** | 139个 | `PRE_LAUNCH_FINAL_REPORT` |
| **Agent Tool** | 80个 | 同上，业务无死角 |
| **AI 数据实体** | 55+ | `intelligence/entity/` |
| **知识库** | 50条种子 | 含 Cohere 精排 |
| **系统总编排器** | 235+ | 105业务 + 130 AI智能体 |

#### 10.1.3 缓存规模

| 缓存层 | 数量 | 风险等级 |
|--------|:--:|:--:|
| 后端 `@Cacheable` | 12处 | 🟡 正常 |
| 后端 Caffeine 本地 | 3处 | 🟡 含10min TTL |
| 后端手写 Redis | 36处 | 🟡 已审查 |
| 前端 `localStorage` | 89处 | 🟢 UX偏好为主 |
| 前端 `sessionStorage` | 12处 | 🟢 临时态 |
| 前端模块级内存 Map | 64处 | 🟡 存在无TTL风险 |

#### 10.1.4 已知缺陷（已发现，待修复）

| # | 缺陷 | 严重度 | 影响 |
|---|------|:--:|------|
| Q1 | HikariCP maximum-pool-size=20 | 🔴 高 | 500+ VU 崩溃 |
| Q2 | leak-detection-threshold=5s 过激 | 🟡 中 | 慢操作产生误报WARN |
| Q3 | Redis 单实例 1~1 固定 | 🟡 中 | 500+ VU 时Redis成瓶颈 |
| Q4 | AI 主对话路径未流式化（仅 MCP 接口暴露 SSE） | 🟡 中 | 用户体验短板 |
| Q5 | AI 内存缓存无分层/TTL 治理 | 🟡 中 | 长期运行内存膨胀风险 |
| Q6 | Token 预算已实现但未对外暴露余量 | 🟢 低 | 用户看不到配额 |
| Q7 | 部分前端模块级缓存无 TTL | 🟡 中 | 前端内存增长 |

#### 10.1.5 测试资产

| 指标 | 当前值 |
|------|--------|
| 后端单元测试 | **898/898 GREEN**（2026-04-27 修复后） |
| Playwright e2e | `frontend/e2e/` 4个测试文件 |
| 冒烟清单 | `docs/智能化接口冒烟清单` 已完成核对 |
| CI 自动构建 | `ci.yml` + `deploy-*.yml` 4条流水线 |

---

### 10.2 优化任务完整拆解

> 按「需求分析→方案设计→实施开发→测试验证→部署上线」五阶段划分，每项标注负责角色、工时估算、前置依赖。

---

#### 📦 专题一：后端高并发韧性修复（P0 临界）

| 阶段 | 任务 | 负责 | 工时 | 依赖 |
|------|------|------|:--:|------|
| **需求分析** | 梳理生产/财务/扫码热点 API 的并发模型；确认云端实例数（当前1实例） | 后端组长 + DevOps | 0.5d | — |
| **方案设计** | 制定 HikariCP 调参方案；Redis 实例扩容方案；连接池监控接入 | 后端组长 | 0.5d | 需求分析 |
| **实施开发** | `application.yml` 调参：`max-pool-size` 20→50、`leak-detection` 5s→60s、`min-idle` 5→10 | DevOps | 0.5d | 方案设计 |
| | 微信云托管 Redis 扩容：实例数 1~1→1~3、CPU 0.25→0.5核 | DevOps | 0.5d | 方案设计 |
| | 新增 `HikariPoolMetricsExporter`（暴露 ACTIVE/IDLE/PENDING 到 `/actuator/metrics`） | 后端 #1 | 1d | — |
| **测试验证** | 复跑 ab 压测：100/500/1000 VU 三档 | 测试 | 1d | 实施完成 |
| **部署上线** | 灰度一台实例 → 观察 2h → 全量 | DevOps | 0.5d | 测试通过 |
| | **📅 里程碑**：1000 VU 吞吐 ≥ 1800 req/s，错误率 0% | | | |

> **总工时**：4.5人日 | **建议周期**：1 周（含灰度观察）

---

#### 📦 专题二：AI 查询缓存与热点加速（P1 - 对齐升级路线图 2.4）

| 阶段 | 任务 | 负责 | 工时 | 依赖 |
|------|------|------|:--:|------|
| **需求分析** | 统计 AI 对话 Top 20 热点查询（日志分析 `AiAgentTrace` 表） | AI 工程师 | 0.5d | — |
| **方案设计** | 设计 `IntelligenceQueryCache`：语义哈希key + 3级TTL（5min实时/1h汇总/24h静态）+ Redis 后端 | AI 工程师 + 后端 #1 | 1d | 需求分析 |
| **实施开发** | 实现 `IntelligenceQueryCache.java`（基于 Spring Cache + Redis） | 后端 #1 | 2d | 方案设计 |
| | 业务数据变更时自动失效（如订单状态变更 → 清空该订单相关缓存）| 后端 #1 + 后端 #2 | 1.5d | Cache实现 |
| | Agent Loop 引擎接入缓存判断（同轮重复工具调用走缓存） | AI 工程师 | 1d | — |
| **测试验证** | 热点查询对比：缓存前 vs 缓存后响应时间 | 测试 | 1d | 实施完成 |
| **部署上线** | 灰度 + 监控缓存命中率 → 全量 | DevOps | 0.5d | 测试通过 |
| | **📅 里程碑**：Top 20 热点查询 P95 延迟 < 50ms（当前 120ms），Token 成本降低 40% | | | |

> **总工时**：7.5人日 | **建议周期**：2 周

---

#### 📦 专题三：向量嵌入正式接入（P1 - 对齐升级路线图 2.1）

| 阶段 | 任务 | 负责 | 工时 | 依赖 |
|------|------|------|:--:|------|
| **需求分析** | 梳理记忆检索全链路：`LongTermMemoryOrchestrator.retrieveMultiSignal()` → 当前 BM25 近似 → 目标余弦相似度 | AI 工程师 | 1d | — |
| **方案设计** | 向量数据库选型评估（Milvus vs PGVector vs Qdrant（已部署））→ 推荐方案文档 | AI 组长 | 1d | 需求分析 |
| | DDL 设计：`t_long_memory_embedding` 表（关联 `ai_long_memory.id`）+ Qdrant collection schema | AI 工程师 | 1d | 选型确认 |
| | Flyway 迁移脚本 + Qdrant collection 初始化脚本 | AI 工程师 | 0.5d | DDL设计 |
| **实施开发** | 新增 `EmbeddingService`（封装 text-embedding-3-small / 通义千问 Embedding API） | AI 工程师 | 2d | 方案设计 |
| | 增强 `LongTermMemoryOrchestrator.retrieveMultiSignal()`：加入 Qdrant 向量相似度 → 与时间衰减/实体匹配融合排序 | AI 工程师 | 2d | EmbeddingService |
| | 记忆写入异步嵌入：`saveFact/saveEpisode` → `@Async` 调 EmbeddingService → 写入 Qdrant | AI 工程师 | 1.5d | EmbeddingService |
| **测试验证** | "帮我找上次那个红色款式" 类语义查询 AB 测试：BM25 vs 向量检索 | 测试 + AI组长 | 1.5d | 实施完成 |
| **部署上线** | DevOps 部署向量库 + AI 灰度开关 → 保留关键词 fallback → 全量 | DevOps + AI 组长 | 1d | 测试通过 |
| | **📅 里程碑**：记忆检索准确率 30%→80%，语义查询命中率 80%+ | | | |

> **总工时**：11.5人日 | **建议周期**：3 周（含 AB 测试期）

---

#### 📦 专题四：提示词外部化 + A/B 测试（P1 - 对齐升级路线图 2.5）

| 阶段 | 任务 | 负责 | 工时 | 依赖 |
|------|------|------|:--:|------|
| **需求分析** | 盘点当前代码中硬编码的 Prompt（约 12 处，分布 AgentLoop/语义路由/Critic） | AI 工程师 | 0.5d | — |
| **方案设计** | `AiPromptTemplate` 表设计：模板key + 版本号 + 内容 + 灰度比例 + 生效条件 | AI 工程师 + 后端 #3 | 0.5d | — |
| | Flyway V*.sql → 建表 + 迁移现有 Prompt 到初始化数据 | AI 工程师 | 0.5d | 表设计 |
| **实施开发** | `PromptTemplateLoader.java`：启动时加载 → Caffeine 本地缓存（10min刷新） | AI 工程师 | 1.5d | Flyway |
| | 改造 `AgentLoopEngine` + `SemanticDomainRouter` + `Critic` 走 `PromptTemplateLoader` 替代硬编码 | AI 工程师 | 2d | Loader完成 |
| | `PromptOptimizationService`：收集工具调用正确率/任务完成率 → 生成优化建议 | AI 工程师 | 1.5d | — |
| **测试验证** | A/B 测试框架联调：租户A用新版Prompt、租户B用旧版 → 对比指标 | AI 工程师 + 测试 | 1d | 实施完成 |
| **部署上线** | `AiPromptTemplate` 初始化数据 + 灰度开关 + UI 管理页（超管可编辑） | AI 工程师 + 前端 #3 | 1d | 测试通过 |
| | **📅 里程碑**：Prompt 变更不再需改代码、发布流程降为配表更新 | | | |

> **总工时**：8.5人日 | **建议周期**：2 周

---

#### 📦 专题五：多智能体协作深化（P1 - 对齐升级路线图 2.2）

| 阶段 | 任务 | 负责 | 工时 | 依赖 |
|------|------|------|:--:|------|
| **需求分析** | 梳理现有 DAG 编排 + `CrewGraphOrchestrator`/`SupervisorAgentOrchestrator` → 确认缺口（角色定义/消息总线/自动协作模式） | AI 组长 | 1d | — |
| **方案设计** | `MultiAgentOrchestrator` 架构：CrewAI 风格 + 5 角色定义 + 角色分配策略 | AI 组长 + 后端组长 | 1.5d | 需求分析 |
| | `AgentMessageBus` 设计（基于 WebSocket STOMP + Redis Pub/Sub） | AI 组长 + 后端 #3 | 1d | — |
| **实施开发** | 5 角色 System Prompt 定义（ProductionExpert/FinanceExpert/WarehouseExpert/StyleExpert/ReportWriter） | AI 工程师 | 1.5d | 方案设计 |
| | `MultiAgentOrchestrator.java`：语义路由 → 分配角色 → DAG 编排 → 结果合并 | AI 组长 | 3d | 角色Prompt |
| | `AgentMessageBus.java`：Agent 间点对点通信 + 任务委派/结果回传 | AI 工程师 + 后端 #3 | 2d | — |
| **测试验证** | "帮我做一个月度经营分析报告" 端到端联调 → 4 Agent 并行 → 报告合并 | 测试 + AI 组长 | 2d | 实施完成 |
| **部署上线** | 灰度开关 + 角色 Prompt 配置 + 并行度限制（防止 token 爆炸） | AI 组长 + DevOps | 1d | 测试通过 |
| | **📅 里程碑**：复杂任务完成率 50%→80%，深度报告可用性大幅提升 | | | |

> **总工时**：13人日 | **建议周期**：3.5 周（复杂度最高项，含多轮联调）

---

#### 📦 专题六：工具调用动态规划（P1 - 对齐升级路线图 2.3）

| 阶段 | 任务 | 负责 | 工时 | 依赖 |
|------|------|------|:--:|------|
| **需求分析** | 分析近 30 天 Agent Loop 工具调用失败/回退记录（`AgentExecutionLog` 表） | AI 工程师 | 0.5d | — |
| **方案设计** | `ToolPlan` JSON Schema（step/tool/reason/fallback/dependsOn）+ Validator | AI 工程师 | 0.5d | — |
| **实施开发** | `ToolPlanningOrchestrator.java`：首次推理 → LLM 生成计划 → 校验 → 依序执行 | AI 工程师 | 2.5d | Schema |
| | Schema Validation：调用前校验参数类型+必填 → 不通过则拒调（返回清晰错误） | AI 工程师 | 1d | — |
| | Fallback 链：工具失败 1 次 → 自动重试 → 仍失败 → 切换 fallback 工具 | AI 工程师 | 1d | — |
| | 前端展示"思考链"面板（计划步骤可视化） | 前端 #3 | 1.5d | — |
| **测试验证** | 构造 10 种错误工具调用场景 → 校验 Plan 生成/回退链路 | 测试 | 1.5d | 实施完成 |
| **部署上线** | 灰度 → 观察工具正确率变化 → 全量 | AI 工程师 + DevOps | 0.5d | 测试通过 |
| | **📅 里程碑**：工具调用正确率 ≥ 95%（出错时自动回退） | | | |

> **总工时**：9人日 | **建议周期**：2 周

---

#### 📦 专题七：前端性能治理（P1）

| 阶段 | 任务 | 负责 | 工时 | 依赖 |
|------|------|------|:--:|------|
| **需求分析** | Lighthouse 审计全站 8 模块 → 识别 LCP/FCP/CLS 劣化页面 | 前端组长 | 0.5d | — |
| **方案设计** | 代码分割方案（`React.lazy` + `Suspense` for 8 modules）+ 图片懒加载 + 虚拟列表 | 前端组长 | 0.5d | 需求分析 |
| **实施开发** | 路由级 code splitting（`routeConfig.ts` 改 `lazy()` 导入 8 模块） | 前端 #1 | 1d | — |
| | 大列表虚拟化（生产订单列表/款式列表/成品库存等 >200 行页面 使用 `react-window`） | 前端 #2 | 1.5d | — |
| | 63 处前端模块级无 TTL 缓存治理 → 加 maxAge + LRU 淘汰 | 前端 #3 | 1.5d | — |
| **测试验证** | Lighthouse 复测：LCP <2.5s / FCP <1.8s / TBT <200ms | 测试 | 0.5d | 实施完成 |
| **部署上线** | 全量（纯前端改动，无后端依赖） | DevOps | 0.5d | 测试通过 |
| | **📅 里程碑**：Lighthouse Performance Score ≥90（当前预估 70+） | | | |

> **总工时**：6人日 | **建议周期**：1.5 周

---

#### 📦 专题八：AI 成本精细化管理（P2 - 对齐升级路线图 2.9）

| 阶段 | 任务 | 负责 | 工时 | 依赖 |
|------|------|------|:--:|------|
| **需求分析** | `AiCostTracking` 实体已有 → 梳理当前埋点覆盖范围 → 识别缺口 | AI 工程师 | 0.5d | — |
| **方案设计** | `CostDashboard` 设计：总体趋势/按功能占比/按用户排名/优化建议 | AI 工程师 + 前端 #3 | 0.5d | — |
| **实施开发** | 模型路由策略：`ComplexityRouter`（简单问题→GPT-4o-mini，复杂→DeepSeek-V3） | AI 工程师 | 1d | — |
| | Token 压缩：上下文 > 4K token → `ContextCompressor` 自动压缩历史 | AI 工程师 | 1d | — |
| | 成本看板 API（`AiCostTrackingOrchestrator.getDashboard`） | AI 工程师 | 1d | — |
| | 前端成本看板页面（`frontend/src/modules/system/CostDashboard`） | 前端 #3 | 1.5d | API |
| | 成本告警：月预算 > 80% → Webhook 通知超管 | AI 工程师 | 0.5d | — |
| **测试验证** | 模拟不同复杂度查询 → 验证路由正确 → 验证告警触发 | 测试 | 1d | 实施完成 |
| **部署上线** | 灰度模型路由（观察 3 天成本变化）→ 全量 | AI 工程师 + DevOps | 0.5d | 测试通过 |
| | **📅 里程碑**：AI 月成本降低 30-50%，成本可视化面板上线 | | | |

> **总工时**：7.5人日 | **建议周期**：2 周（含 3 天灰度观察）

---

#### 📦 专题九：AI 决策可解释性（P2 - 对齐升级路线图 2.7）

| 阶段 | 任务 | 负责 | 工时 | 依赖 |
|------|------|------|:--:|------|
| **需求分析** | 收集用户 "为什么给我这个结论" 类反馈 → 定义解释卡片最低信息标准 | AI 工程师 | 0.5d | — |
| **方案设计** | `ReasoningChain` 数据结构（step/action/tool/content）+ 前端展开面板 UI | AI 工程师 + 前端 #3 | 0.5d | — |
| **实施开发** | `CriticOrchestrator.reviewAndRevise()` 增强 → 返回 `ReasoningChain` | AI 工程师 | 1.5d | — |
| | Agent Loop 引擎收集解释链 → 注入 SSE 事件 | AI 工程师 | 1d | — |
| | 前端 "思考链" 可展开面板（`ReasoningChainPanel` 组件）| 前端 #3 | 1.5d | — |
| **测试验证** | 10 个典型问题 → 人工核对解释链逻辑是否完整 | 测试 | 0.5d | 实施完成 |
| **部署上线** | 灰度（首批租户）| DevOps | 0.5d | 测试通过 |
| | **📅 里程碑**：用户可查看完整决策逻辑链，AI 信任度提升 | | | |

> **总工时**：6人日 | **建议周期**：1.5 周

---

### 10.3 全量优化工期总览

| 专题 | 内容 | 优先级 | 工时 | 周期 | 负责核心角色 |
|------|------|:--:|:--:|:--:|-------------|
| **专题一** | 后端高并发韧性修复 | 🔴 P0 | 4.5d | 1 周 | DevOps + 后端组长 |
| **专题二** | AI 查询缓存与热点加速 | 🟡 P1 | 7.5d | 2 周 | 后端 #1 + AI 工程师 |
| **专题三** | 向量嵌入正式接入 | 🟡 P1 | 11.5d | 3 周 | AI 组长 + AI 工程师 |
| **专题四** | 提示词外部化 + A/B 测试 | 🟡 P1 | 8.5d | 2 周 | AI 工程师 + 后端 #3 |
| **专题五** | 多智能体协作深化 | 🟡 P1 | 13d | 3.5 周 | AI 组长 + 后端组长 |
| **专题六** | 工具调用动态规划 | 🟡 P1 | 9d | 2 周 | AI 工程师 |
| **专题七** | 前端性能治理 | 🟡 P1 | 6d | 1.5 周 | 前端组长 + 前端 #3 |
| **专题八** | AI 成本精细化管理 | 🔵 P2 | 7.5d | 2 周 | AI 工程师 + 前端 #3 |
| **专题九** | AI 决策可解释性 | 🔵 P2 | 6d | 1.5 周 | AI 工程师 + 前端 #3 |

| 汇总 | 数值 |
|------|------|
| **专题总数** | 9个 |
| **累计工时** | 73.5 人日 |
| **可并行度** | 专题一/七（独立于AI链）可与专题二/四/六 并行 |
| **关键路径** | 专题一 → 专题三（向量嵌入，工时最重）→ 专题五（多智能体，最复杂） |

---

### 10.4 分期执行建议（匹配 4-5 人缩减团队）

```
第 1 阶段（1-2 周）：P0 修复 + 低风险 P1
  并行：专题一 (DevOps) ‖ 专题二 (后端#1+AI) ‖ 专题七 (前端组长)
  交付：1000 VU 不崩 + 热点查询加速 + 前端性能达标

第 2 阶段（3-5 周）：P1 核心能力
  串行：专题四 (提示词) → 专题三 (向量嵌入，工作量最大)
  并行：专题六 (工具规划)
  交付：向量检索上线 + Prompt 配置化 + 工具自动回退

第 3 阶段（6-8 周）：P1 重型 + P2
  串行：专题五 (多智能体协作，最复杂)
  并行：专题八 (成本看板) ‖ 专题九 (解释链)
  交付：多智能体协作报告可用 + 成本可视化 + 思考链面板

═══════════════════════════════════════════
  🎯 全量交付里程碑：8 周内完成全部 9 项
  （4-5 人团队，关键路径无阻塞前提下）
═══════════════════════════════════════════
```

### 10.5 各角色工时负载预估

| 角色 | 涉及专题 | 累计工时 | 备注 |
|------|---------|:--:|------|
| AI 组长 | 专题三/五 | ~15d | 向量嵌入+多智能体，关键路径核心 |
| AI 工程师 | 全部 AI 专题 | ~28d | 负载最重，需后端/前端配合分担 |
| 后端 #1 | 专题一/二 | ~5.5d | 高并发修复+缓存 |
| 后端 #3 | 专题四/五 | ~5d | Prompt配置+消息总线 |
| 前端 #3 | 专题六/七/八/九 | ~7d | 思考链+性能+成本+解释面板 |
| DevOps/运维 | 专题一/三/八 | ~4d | 连接池+向量库+灰度发布 |
| 测试 | 全9专题 | ~10d | 全链路测试覆盖 |

> ⚠️ **AI 工程师是瓶颈**（负载 28d，占总量 38%），建议由 AI 组长分流部分实现任务，或专题四/六可交由后端 #3 承接（纯 Java 开发，AI 领域知识门槛低）。

---

### 10.6 不可压缩项 & 风险缓冲

| 风险 | 缓解 |
|------|------|
| **向量嵌入效果不及预期** | 专题三含 AB 测试期（1 周），保留 BM25 fallback，不合格可回退 |
| **多智能体 TTFT（首 Token 延迟）过高** | 专题五设计含并行度限制 + 超时熔断（30s），不阻塞主链路 |
| **AI 工程师单点瓶颈** | 专题四/六/八可由后端 #3 承接（均为标准 Spring Boot 开发） |
| **云端环境差异** | 每个专题上线含灰度 1 台 → 观察 2h → 全量 |

---

### 10.7 需求→上线 完整阶段划分（通用模板）

每个专题均遵循以下 5 阶段流程，此处给出通用时间占比参考：

| 阶段 | 工时占比 | 典型产出 | 门禁 |
|------|:--:|------|------|
| **① 需求分析** | 5-10% | 需求文档 / API盘点 / 数据分析 | 架构师确认范围 |
| **② 方案设计** | 10-15% | 技术方案 / DDL / API契约 / 原型 | 架构师 + 模块Owner双审 |
| **③ 实施开发** | 55-65% | 代码 + Flyway + 单元测试 | Code Review + P0红线检查 |
| **④ 测试验证** | 10-15% | 测试报告 / AB对比 / 压测结果 | QA签字 |
| **⑤ 部署上线** | 5-10% | 灰度→全量 / 监控 / 回滚预案 | 上线评审会通过 |

---

> 本文档基于 `INTELLIGENCE_UPGRADE_PLAN.md` + 代码库审计 + [智能模块完整盘点报告](docs/智能模块完整盘点报告.md) + [系统状态.md](系统状态.md) + [开发指南.md](开发指南.md) + `STABILITY_TEST_REPORT_20260311.md` + `PRESSURE_TEST_RESULTS_20260311.md` + `缓存全盘审计报告-20260316.md` + `PRE_LAUNCH_FINAL_REPORT_20260427.md` 综合生成。
> 文档更新频率：每次团队架构变动或季度规划迭代同步更新。

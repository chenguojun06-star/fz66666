# 服装供应链系统 Code Wiki

> 版本：v1.0
> 生成日期：2026-07-09
> 维护：开发团队
> 用途：项目整体架构 / 模块职责 / 关键类与函数 / 依赖关系 / 运行方式

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [后端模块职责](#3-后端模块职责)
4. [前端工程职责](#4-前端工程职责)
5. [关键类与函数说明](#5-关键类与函数说明)
6. [AI 系统（小云 AI）](#6-ai-系统小云-ai)
7. [数据库与多租户架构](#7-数据库与多租户架构)
8. [MCP 服务器](#8-mcp-服务器)
9. [依赖关系](#9-依赖关系)
10. [项目运行方式](#10-项目运行方式)
11. [代码规范与铁律](#11-代码规范与铁律)
12. [2026-07-09 修复核实记录](#12-2026-07-09-修复核实记录)

---

## 1. 项目概述

### 1.1 业务定位

企业级服装供应链管理系统，覆盖「款式设计 → 采购面料 → 生产订单 → 裁剪分菲 → 工序扫码 → 质检入库 → 财务结算」全流程。支持多租户隔离、多工厂协同、AI 智能助手（小云 AI）。

### 1.2 系统规模

| 维度 | 数据 |
|------|------|
| 代码行数 | 后端 212k + 前端 173k + 小程序 44k = **429k 行** |
| 业务编排器 | 235 个（业务 + AI 智能体） |
| AI Agent 工具 | 100+ 个 |
| AI 数据表 | 80+ 张 |
| Flyway 迁移脚本 | 200+ 个 |
| 测试脚本 | Shell 24 个 + Python 冒烟 + Playwright E2E |
| 并发能力 | 200 VU 并发，0% 错误率，P95 < 1s |

### 1.3 仓库结构

```
服装66666/
├── backend/          # Spring Boot 后端（Java 21）
├── frontend/         # PC 端管理后台（React 18 + TS + Vite + AntD 6）
├── miniprogram/      # 微信小程序原生工程（25+ 分包）
├── h5-web/           # H5 网页（React 18 + Vite，外部用户/供应商）
├── flutter_app/      # Flutter App（GetX + Dio）
├── deployment/       # 部署文档与脚本
├── docs/             # 技术文档（42 份）
├── memory-bank/      # 开发记忆库（上下文/决策/进度）
├── scripts/          # 35+ 运维脚本
├── monitoring/       # Prometheus + Alertmanager
├── rag/              # RAG 索引构建与查询脚本
├── .trae/            # Trae IDE 配置（MCP 服务器 / Rules / Skills）
├── .github/          # CI/CD workflows + Agent 定义
├── cloudbaserc.json  # 微信云托管部署配置
└── dev-public.sh     # 一键启动脚本
```

---

## 2. 整体架构

### 2.1 分层架构

后端遵循严格的四层架构：

```
Controller (REST API, ≤100 行)
    ↓
Orchestrator (事务边界, @Transactional, ≤150 行)
    ↓
Service (纯业务逻辑, ≤200 行, 禁止 @Transactional)
    ↓
Mapper (MyBatis-Plus 数据访问)
```

**铁律**：
- `@Transactional` 仅在 Orchestrator 层
- Service 禁止互相调用
- Controller 禁止直接调用多个 Service
- 复杂业务编排必须在 Orchestrator 层

### 2.2 多端架构

| 端 | 技术 | 端口 | 用户场景 |
|----|------|------|---------|
| PC 后台 | React 18 + TS + Vite + AntD 6 | 5173 | 内部运营管理 |
| 后端 API | Spring Boot 3.4.5 + Java 21 | 8088 | 业务服务 |
| 小程序 | 微信原生（JS） | - | 工厂扫码 |
| H5 | React 18 + Vite | 5174 | 外部客户/供应商 |
| Flutter | Flutter 3.11 + GetX | - | 移动 App |

### 2.3 部署架构

```
GitHub Push
    ↓
微信云托管自动构建（CloudBase）
    ↓
┌─────────────────────────────────┐
│  backend (8088)  1~5 副本       │
│  frontend (80)   1~3 副本       │
│  h5 (80)         1~3 副本       │
│  my-redis        1~5 副本       │
│  MySQL（内网）                   │
└─────────────────────────────────┘
```

---

## 3. 后端模块职责

根包：`com.fashion.supplychain`
主启动类：`com.fashion.supplychain.FashionSupplychainApplication`

### 3.1 业务模块清单

| 顶层包 | 业务域 | 核心类示例 |
|--------|--------|-----------|
| `auth` | 认证 | AuthTokenService / TokenAuthFilter / TokenSubject |
| `common` | 公共基础 | UserContext / TenantAssert / DistributedLockService / GlobalExceptionHandler / BusinessException |
| `config` | 全局配置 | SecurityConfig / RedisConfig / WebSocketConfig / FlywayRepairConfig |
| `system` | 系统管理 | User / Role / Permission / Tenant / Factory / OrganizationUnit / Dict |
| `production` | 生产管理 | ProductionOrder / ScanRecord / MaterialPurchase / CuttingTask / PatternProduction |
| `style` | 款式管理 | StyleInfo / ProductSku / StyleBom / StyleProcess / StyleQuotation |
| `crm` | 客户管理 | Customer / Receivable / SalesReturn |
| `finance` | 财务管理 | Invoice / Payable / PayrollSettlement / WagePayment / EcSalesRevenue |
| `warehouse` | 仓库管理 | WarehouseArea / WarehouseLocation / InventoryCheck / StockTransfer |
| `procurement` | 采购管理 | ProcurementOrchestrator / SupplierPortal |
| `stock` | 样衣库存 | SampleStock / SampleLoan |
| `selection` | 选款管理 | SelectionBatch / TrendAnalysis |
| `template` | 模板管理 | TemplateLibrary |
| `integration` | 第三方对接 | 物流（7 快递适配器）/ 支付（微信+支付宝）/ 电商同步 |
| `intelligence` | 小云 AI | 见 [§6](#6-ai-系统小云-ai) |
| `dashboard` | 仪表盘 | DashboardController / DailyBriefingController |
| `search` | 全局搜索 | GlobalSearchController（含拼音/以图搜款） |
| `wechat` | 微信对接 | WeChatMiniProgramAuthController / WeChatH5AuthController |

### 3.2 生产管理（`production`）— 最大模块

包含 36 个 Controller、40+ Orchestrator、40+ Entity、60+ Helper、40+ Mapper。

**核心子域**：
- **订单管理**：ProductionOrder / OrderManagement / OrderShare / OrderTransfer / OrderWasteAnalysis
- **扫码体系**：ScanRecord + 4 个 Executor（ProductionScanExecutor / QualityScanExecutor / WarehouseScanExecutor / UCodeWarehouseScanExecutor）
- **物料采购**：MaterialPurchase / PurchaseCart / PurchaseOrderDoc / PurchaseReturn / MaterialInbound / MaterialPicking / MaterialRoll / MaterialStock
- **裁剪**：CuttingTask / CuttingBundle / CuttingBom / CuttingBundleSplitTransfer
- **入库出库**：ProductWarehousing / ProductOutstock / FactoryShipment
- **纸样生产**：PatternProduction / PatternRevision / PatternScanRecord
- **色卡物料**：ColorCard / MaterialColorCard / MaterialDatabase / MaterialQualityIssue
- **工序跟踪**：ProductionProcessTracking / ProcessParentMapping / ProcessPriceAdjustment

### 3.3 系统管理（`system`）

涵盖用户/角色/权限/租户/工厂/组织/字典/审批的完整 RBAC 体系：

- **认证授权**：AuthController（JWT 4h TTL，刷新 72h）
- **用户管理**：User / UserRole / UserPermissionOverride
- **角色管理**：Role / RolePermission / RoleTemplate
- **权限引擎**：PermissionCalculationEngine / DataPermissionHelper / DataScope（all/team/own）
- **租户体系**：Tenant / TenantSubscription / TenantIntelligenceProfile / TenantSmartFeature
- **工厂组织**：Factory / FactoryWorker / OrganizationUnit
- **审批流**：ChangeApproval
- **Excel 导入**：EmployeeExcelImporter / FactoryExcelImporter / ProcessExcelImporter / StyleExcelImporter

---

## 4. 前端工程职责

### 4.1 PC 端（frontend/）

**技术栈**：React 18 + TypeScript 5.7 + Vite 7.3 + AntD 6.1 + Zustand 5 + axios 1.13

**核心目录**：
```
frontend/src/
├── App.tsx                  # BrowserRouter + PurchaseCartProvider
├── routeConfig.ts           # 100+ 路由 + 权限码映射 + 菜单配置
├── pages/                   # 业务页面
├── components/common/       # 150+ 通用组件
├── components/Layout/       # 主布局
├── utils/                   # 工具与 API 封装
├── stores/                  # Zustand 状态
├── styles/design-system.css # 设计系统 CSS 变量
├── hooks/                   # 自定义 Hooks
└── types/                   # TS 类型定义
```

**关键页面**：dashboard / style-info / production-order / material-purchase / cutting-task / scan / quality-inspection / warehouse / supplier / customer / finance / system / smart-ops / ecommerce / crm

### 4.2 微信小程序（miniprogram/）

**技术栈**：微信原生框架 + JS + WeUI v2.6.25 设计规范

**结构**：5 主页面（login/home/defect/scan/admin）+ 25+ 分包（pkg-scan-* / pkg-cutting / pkg-procurement / pkg-warehouse / pkg-payroll / pkg-dashboard / pkg-smart-ops 等）

**关键文件**：
- `app.json` - 分包配置 + preloadRule
- `config.js` - 域名白名单 + getBaseUrl 安全策略
- `utils/request.js` - 全局登录跳转锁 + refreshToken 队列
- `utils/api.js` - 聚合 10 个领域模块
- `utils/validationRules.js` - 与 PC 端同步的校验规则
- `shared/stageDetection.js` - 跨端工序检测纯函数
- `styles/design-tokens.wxss` - v8.0 设计 Token

### 4.3 H5（h5-web/）

**技术栈**：React 18 + Vite 7.1 + Zustand 5 + axios 1.11 + html5-qrcode

**关键特性**：
- `services/http.js` - 微信 H5 适配器（X-Client-Type 头）+ 401 全局刷新锁
- `stores/authStore.js` - Zustand + persist 中间件
- 特殊路由：`/crm-client/*`（外部客户）+ `/supplier-portal/*`（供应商门户）
- 通过 `scripts/sync-miniprogram.mjs` 与小程序保持一致

### 4.4 Flutter App（flutter_app/）

**技术栈**：Flutter 3.11 + GetX 4.6.6 + Dio 5.4 + mobile_scanner

**关键页面**：home / work / scan / admin / scan_pattern / scan_quality / bundle_split / cutting / procurement / warehouse / payroll / dashboard / admin_approval

---

## 5. 关键类与函数说明

### 5.1 后端基础设施

路径前缀：`backend/src/main/java/com/fashion/supplychain/`

#### UserContext（`common/UserContext.java`）

ThreadLocal 存储当前登录用户上下文。

**核心字段**：userId / username / role / permissionRange / teamId / **tenantId** / tenantOwner / superAdmin / factoryId / orgUnitId / position

**核心方法**：
- `tenantId()` - 获取当前租户 ID
- `isSuperAdmin()` / `isTopAdmin()` / `isSupervisorOrAbove()` - 角色判断
- `canViewAll()` / `canViewTeam()` / `getDataScope()` - 数据范围
- `wrap(Runnable)` / `wrapSupplier()` - 异步线程传递上下文（深拷贝）

#### TenantAssert（`common/tenant/TenantAssert.java`）

多租户数据一致性防护工具，**六条口诀**：
1. 无 tenant_id 不执行 SQL/MQ/事务
2. 联表先匹配 tenant_id
3. 一个事务只允许一个租户
4. 异步定时全按租户跑

**核心方法**：`assertTenantContext()` / `requireTenantId()` / `assertBelongsToCurrentTenant()` / `assertSameTenant()` / `bindTenantForTask()` / `getAndValidate()` / `getAndValidateStrict()`

#### DistributedLockService（`common/lock/DistributedLockService.java`）

基于 Redis 的分布式锁，Lua 脚本实现"仅持有者可释放"。

**核心方法**：
- `tryLock(key, ttl)` - 尝试获取锁
- `unlock(key)` - 释放锁
- `executeWithLock(key, ttl, supplier)` - 自动加锁释放
- `executeWithLockOrFallback(key, ttl, waitMs, supplier, fallback)` - 等待重试
- `executeWithStrictLock(...)` - 严格模式

**关键设计**：BusinessException 和 RuntimeException **直接透传不包装**（保留原始业务错误），含 Redis 连接工厂自愈机制（STOPPED 时自动 restart，30s 冷却）。

#### BusinessException（`common/BusinessException.java`）

业务异常统一类。`data` 字段携带订单/扎号上下文供前端展示。

**工厂方法**：`paramError()` / `notFound()` / `alreadyExists()` / `noPermission()` / `operationNotAllowed()`

#### GlobalExceptionHandler（`common/GlobalExceptionHandler.java`）

`@RestControllerAdvice` 全局异常处理器，统一返回 `Result<?>`。

### 5.2 认证与安全

| 类 | 路径 | 职责 |
|----|------|------|
| AuthTokenService | `auth/AuthTokenService.java` | JWT 生成与验证 |
| TokenAuthFilter | `auth/TokenAuthFilter.java` | Token 认证过滤器（Redis 宕机时 60s 自动降级） |
| SecurityConfig | `config/SecurityConfig.java` | Spring Security 6 + JWT 无状态 + CORS |
| UserInfoEnrichmentService | `config/UserInfoEnrichmentService.java` | 旧 JWT 不含 tenantId 时从 DB 补全 |
| XssFilter | `common/filter/XssFilter.java` | XSS 过滤 |
| GlobalRateLimitFilter | `common/filter/GlobalRateLimitFilter.java` | 全局限流 |

### 5.3 数据权限与审计

| 类 | 职责 |
|----|------|
| DataPermissionHelper | 数据权限辅助 |
| DataScope / DataScopeAspect / DataScopeContext | 数据范围切面（all/team/own） |
| AuditInterceptor | 审计拦截器 |
| OperationLogAppendUtil | 操作日志追加工具（核心方法 `appendOperation`） |
| SystemOperationLogAspect | 系统操作日志切面 |

### 5.4 缓存与监控

| 类 | 职责 |
|----|------|
| UnifiedCacheManager | 统一缓存管理（Redis + Caffeine 双层） |
| CacheAspect / Cacheable（注解） | 缓存切面 |
| PerformanceMonitor | 性能监控 |
| DataConsistencyChecker | 数据一致性检查 |
| RedisService | Redis 服务封装 |

### 5.5 前端关键组件

| 组件 | 路径 | 说明 |
|------|------|------|
| ResizableTable | `components/common/ResizableTable/` | 可拖拽表格（@dnd-kit），showIndex 默认 true |
| ResizableModal | `components/common/ResizableModal.tsx` | 光感弹窗（default/urgent/success/warning/info） |
| RowActions | `components/common/RowActions.tsx` | 行操作（主按钮 + 次按钮 + 更多菜单） |
| ModalContentLayout | `components/common/ModalContentLayout.tsx` | 弹窗内容布局 |
| CommandPalette | `components/common/CommandPalette.tsx` | ⌘K 全局搜索（含以图搜款） |
| GlobalAiAssistant | `components/common/GlobalAiAssistant/` | 唯一 AI 助手入口（含语音输入） |
| GlobalCartFloatButton | `components/common/GlobalCartFloatButton.tsx` | 采购车浮动按钮（仅采购相关页 + cart>0 显示） |
| Layout | `components/Layout/index.tsx` | 主布局（SideMenu + SmartAlertBell + DailyTodoModal） |
| AuthContext | `utils/AuthContext.tsx` | 双 Context 架构（AuthStateContext + UserContext） |

### 5.6 前端 API 封装

**PC 端**（`utils/api/core.ts`）：
- 超时配置：通用 15s / 扫码 10s / AI 视觉 60s / 文件上传 60s
- `createApiClient` 工厂函数按 URL 匹配超时
- 请求拦截器：JWT 过期检测 + refreshToken 自动刷新 + 请求 ID + 响应缓存（30s TTL）+ 请求去重
- 响应拦截器：GET 自动重试 2 次（指数退避）+ 401 处理 + 友好错误消息

---

## 6. AI 系统（小云 AI）

路径：`backend/src/main/java/com/fashion/supplychain/intelligence/`

最复杂的子系统：180+ Orchestrator、90+ Service、100+ Agent 工具、80+ AI 表。

### 6.1 五层记忆模型

| 层级 | 名称 | 存储 | TTL | 用途 |
|------|------|------|-----|------|
| L1 | Working Memory | Caffeine | 2h | 上下文窗口，最近 15 轮对话 |
| L2 | Session Memory | Redis | 72h | 会话内状态，跨请求持久 |
| L3 | Episodic + Semantic | PostgreSQL | 永久（热） | 过去事件 + 事实知识 |
| L4 | Procedural Memory | PostgreSQL（t_procedural_memory） | 永久 | SOP / 流程 / 技能 |
| L5 | Archival Memory | Qdrant（archival_memory_{tenantId}） | 永久 | 6 个月+ 旧会话归档 |

### 6.2 核心组件

#### AiAgentMemoryHelper（`helper/AiAgentMemoryHelper.java`）

三层记忆核心：
- L1 Caffeine（maximumSize=500，expireAfterAccess=2h，MAX_MEMORY_TURNS=15）
- L2 Redis（key `fashion:chat:memory:{tenantId}:{userId}`，TTL 72h）
- 程序记忆 ProceduralPattern（ConcurrentHashMap，30 条上限，记录成功工具调用模式作为 few-shot）
- 租户+用户维度内存键防跨租户泄漏
- 异步写入（memoryExecutor 单线程守护）

#### AiAgentPromptHelper（`helper/AiAgentPromptHelper.java`）

Prompt 组装核心，注入 17+ 上下文块：
- 系统提示 / 工具访问 / 模板加载 / 意图优先级路由 / L4 程序性记忆 SOP / L5 归档记忆 / GEPA 遗传优化器 / 结构化输出强制
- 最大 12000 字符
- 分级超时（high 2000ms / medium 1200ms / low 600ms）
- promptBuildExecutor 线程池（core 12 / max 24 / queue 128）

#### EvolutionOrchestrator

自我进化统一编排器（借鉴 CL4R1T4S"统一可观测"），轻量统一层，聚合 metrics，不接管 EvolutionPipeline 核心流程。通过 ObjectProvider 注入避免启动顺序问题。

#### SkillCrystallizationService

技能结晶服务：
- 检测高频问题（≥3 次）结晶化为 SkillTemplate
- 升级路径：success_count≥10 且 avgRating≥4.0 时 `promoteToProcedural()` 升级为 t_procedural_memory

#### DataTruthGuard

数据真实性守卫，L1 工具验证级别，AI 回答业务数据走工具不靠记忆。

### 6.3 Agent 引擎

| 子包 | 核心类 | 职责 |
|------|--------|------|
| `agent/loop` | AgentLoopEngine / StreamingAgentLoopCallback | Agent 循环（流式/同步） |
| `agent/planning` | AgentPlanningEngine | Agent 规划 |
| `agent/dag` | DagExecutionEngine / SwarmExecutionEngine | DAG 执行引擎 |
| `agent/handoff` | HandoffEngine / SubAgentRegistry | Agent 交接 |
| `agent/skill` | AgentSkillRegistry / SkillDisclosureLoader | 技能注册与三层渐进披露 |
| `agent/command` | CommandRiskLevel / CompensableTool | 命令执行与补偿 |
| `agent/checkpoint` | AgentCheckpointManager | 检查点管理 |
| `agent/resource` | McpResourceProvider / FactoryProfileResourceProvider | MCP 资源提供 |

### 6.4 Agent 工具（100+）

按 `@AgentToolDef` 注解定义，通过 `McpToolScanner` 扫描注册。分类：
- 订单类 / 扫码类 / 物料类 / 裁剪类 / 款式类 / 采购类
- 财务类 / 仓库类 / 质检类（含视觉：VisionDefectDetectTool / VisionColorCheckTool / VisionStyleIdentifyTool）
- 预测类（DeliveryPredictionTool / WhatIfSimulationTool）
- 分析类（DeepAnalysisTool / RcaAnalysisTool / NlQueryTool）
- 知识类（KnowledgeSearchTool / CodeGraphQueryTool）
- Agent 类（MultiAgentDebateTool / HyperAdvisorTool / ThinkTool）

### 6.5 AI 模型路由

- **主力模型**：DeepSeek（`deepseek-v4-flash`）+ Agnes 视觉（`agnes-2.0-flash`）
- **路由策略**：failover / round-robin / concurrent
- **per-call 模型选择**：economy（glm-4-flash）/ standard（glm-4）/ premium（glm-4-plus）
- **Token 预算**：30000，超时 180s
- **语义缓存**：相似度 0.82，TTL 120min
- **秒答缓存**：每 15 分钟预取
- **成本爆炸防御**：上下文 12000 阈值，熔断 5 次/5 分钟

---

## 7. 数据库与多租户架构

### 7.1 数据库连接

- URL：`jdbc:mysql://127.0.0.1:3308/fashion_supplychain`（端口 **3308**）
- 连接池：HikariCP（max 50 / min-idle 10 / leak-detection 30s / READ_COMMITTED）
- MCP 只读账号：`mcp_readonly`（仅 SELECT 权限）

### 7.2 多租户字段规范

- 所有核心业务表必须包含 `tenant_id`（BIGINT）
- 所有表包含 `delete_flag`（TINYINT，0=未删除，1=已删除）
- MyBatis-Plus 全局配置：`logic-delete-field: deleteFlag`
- `TenantMetaObjectHandler` 自动填充 tenantId
- `TenantInterceptor` 拦截器层强制隔离

### 7.3 主要业务表

| 业务域 | 表名 | Entity |
|--------|------|--------|
| 生产订单 | t_production_order | ProductionOrder |
| 扫码记录 | t_scan_record | ScanRecord |
| 物料采购 | t_material_purchase | MaterialPurchase |
| 裁剪任务 | t_cutting_task | CuttingTask |
| 裁剪扎 | t_cutting_bundle | CuttingBundle |
| 物料入库 | t_material_inbound | MaterialInbound |
| 物料库存 | t_material_stock | MaterialStock |
| 成品入库 | t_product_warehousing | ProductWarehousing |
| 成品出库 | t_product_outstock | ProductOutstock |
| 纸样生产 | t_pattern_production | PatternProduction |
| 款式信息 | t_style_info | StyleInfo |
| 产品 SKU | t_product_sku | ProductSku |
| 款式 BOM | t_style_bom | StyleBom |
| 客户 | t_customer | Customer |
| 应收 | t_receivable | Receivable |
| 发票 | t_invoice | Invoice |
| 应付 | t_payable | Payable |
| 工资结算 | t_payroll_settlement | PayrollSettlement |
| 库区 | t_warehouse_area | WarehouseArea |
| 库位 | t_warehouse_location | WarehouseLocation |
| 用户 | t_user | User |
| 角色 | t_role | Role |
| 租户 | t_tenant | Tenant |
| 工厂 | t_factory | Factory |
| 操作日志 | t_operation_log | OperationLog |

### 7.4 Flyway 迁移

- 位置：`backend/src/main/resources/db/migration/`
- 配置：`baseline-on-migrate=true` / `out-of-order=true` / `validate-on-migrate=true`
- 版本号格式：`V{YYYYMMDDNNN}__{description}.sql`
- 数量：200+
- **铁律**：
  - 禁止修改已执行过的 V*.sql 文件
  - 已执行脚本有问题 → 创建新版本号脚本补偿
  - 禁止 `IF NOT EXISTS`（MySQL 8.0 不支持，仅 MariaDB）
  - 禁止 `DELIMITER`（Flyway 不支持）
  - 必须用 `INFORMATION_SCHEMA` + 存储过程实现幂等

---

## 8. MCP 服务器

路径：`/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/.trae/mcp-servers/`

### 8.1 自研 MCP（6 个）

| MCP | 路径 | 工具数 | 用途 |
|-----|------|--------|------|
| db-query-mcp | `db-query-mcp/index.js` | 5 | 多租户只读 DB 查询（强制 tenantId） |
| flyway-mcp | `flyway-mcp/index.js` | 8 | Flyway 迁移管理与校验 |
| test-runner-mcp | `test-runner-mcp/index.js` | 8 | 编译/测试/冒烟/审计 |
| anti-pattern-mcp | `anti-pattern-mcp/index.js` | 5 | 反模式检测 |
| change-impact-mcp | `change-impact-mcp/index.js` | 4 | 变更影响分析 |
| memory-bank-mcp | `memory-bank-mcp/index.js` | 6 | Memory Bank 读写 |

### 8.2 外部 MCP

- **Serena**（`uvx serena-mcp`）：LSP 语义级代码搜索，`find_referencing_symbols` 调用链分析

### 8.3 安全设计

- 所有数据查询工具必填 `tenantId`
- 自动注入 `WHERE tenant_id = ?`
- SQL 白名单（仅 SELECT）
- 行数限制 ≤500
- 审计日志记录到 `t_operation_log`
- 独立 MySQL 只读账号 `mcp_readonly`

---

## 9. 依赖关系

### 9.1 后端核心依赖

| 类别 | 依赖 | 版本 |
|------|------|------|
| 框架 | spring-boot-starter-parent | 3.4.5 |
| 语言 | Java | 21（虚拟线程启用） |
| ORM | mybatis-plus-spring-boot3-starter | 3.5.12 |
| 数据库驱动 | mysql-connector-j | 8.4.0 |
| 迁移 | flyway-core + flyway-mysql | 10.x |
| 缓存 | spring-boot-starter-cache + data-redis + caffeine | BOM |
| 向量库 | Qdrant（默认禁用） | 1024 维 |
| WebSocket | spring-boot-starter-websocket | BOM |
| 安全 | spring-boot-starter-security | BOM |
| AI | spring-ai BOM | 1.0.0 |
| 韧性 | resilience4j-spring-boot3 | 2.2.0 |
| 监控 | micrometer-registry-prometheus | BOM |
| API 文档 | springdoc-openapi-starter-webmvc-ui | 2.6.0 |
| 工具 | hutool-all / lombok / pinyin4j | 5.8.27 / 1.18.40 / 2.5.1 |
| Excel | poi / poi-ooxml | 5.3.0 |
| 文件 | 腾讯云 cos_api | 5.6.89 |
| 支付 | wechatpay-java | 0.2.14 |
| 短信 | tencentcloud-sdk-java-sms | 3.1.1422 |
| 测试 | spring-boot-starter-test + h2 + archunit-junit5 | 1.3.0 |

### 9.2 前端依赖（PC 端）

| 类别 | 依赖 | 版本 |
|------|------|------|
| 框架 | react / react-dom | ^18.2.0 |
| 类型 | typescript | ~5.7.3 |
| UI | antd / @ant-design/icons | ^6.1.3 / ^6.0.0 |
| 路由 | react-router-dom | ^6.22.0 |
| 状态 | zustand | ^5.0.10 |
| HTTP | axios | ^1.13.2 |
| 图表 | echarts | ^6.0.0 |
| Excel | exceljs | ^4.4.0 |
| 拖拽 | @dnd-kit/core | ^6.3.1 |
| 二维码 | qrcode.react | ^4.2.0 |
| 虚拟列表 | react-virtuoso | ^4.18.6 |
| 构建 | vite | ^7.3.1 |
| 测试 | vitest / @playwright/test | ^3.2.4 / ^1.59.1 |

### 9.3 模块间依赖

```
Controller → Orchestrator → Service → Mapper → MySQL
                ↓
        DistributedLockService → Redis
                ↓
        AiAgentMemoryHelper → Caffeine + Redis + PostgreSQL + Qdrant
                ↓
        MCP 服务器（db-query / flyway / test-runner / anti-pattern / change-impact / memory-bank）
```

---

## 10. 项目运行方式

### 10.1 一键启动（推荐）

```bash
./dev-public.sh
```

自动完成：启动 MySQL（3308）→ 加载环境变量 → 启动后端（8088）→ 启动前端（5173）

**访问地址**：
- PC 后台：http://localhost:5173
- 后端 API：http://localhost:8088
- 小程序：微信开发者工具打开 `miniprogram/`
- H5：http://localhost:5173/h5

### 10.2 环境变量配置

首次启动需创建 `.run/backend.env`：

```env
SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3308/fashion_supplychain
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=changeme
APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
```

### 10.3 数据库管理

```bash
./deployment/db-manager.sh start                              # 启动 MySQL 容器
docker exec fashion-mysql-simple mysqldump -uroot -pchangeme fashion_supplychain > backup.sql
docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < backup.sql
```

### 10.4 测试命令

```bash
./check-system-status.sh                  # 健康检查
cd backend && mvn clean test               # 后端单元测试
cd frontend && npx tsc --noEmit            # 前端类型检查
cd frontend && npm run test:e2e            # Playwright E2E
python3 scripts/postdeploy-smoke-test.py   # 冒烟测试
python3 scripts/audit-tenant-id.py         # 多租户审计
python3 scripts/check-flyway-sql.py        # Flyway 校验
```

### 10.5 云端部署

**当前部署方式**：GitHub 推送 → 微信云托管自动构建

```bash
git add -A && git commit -m "描述" && git push
```

推送后云托管自动触发构建，5~10 分钟生效。

**控制台**：https://cloud.weixin.qq.com/cloudrun/service/backend

**容器服务**（`cloudbaserc.json`）：

| 服务 | 端口 | 副本 | CPU/内存 |
|------|------|------|---------|
| backend | 8088 | 1~5 | 1核/2G |
| frontend | 80 | 1~3 | 0.5核/1G |
| h5 | 80 | 1~3 | 0.25核/0.5G |

### 10.6 关键配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| server.port | 8088 | 后端端口 |
| spring.datasource.url | jdbc:mysql://127.0.0.1:3308/fashion_supplychain | MySQL（端口 3308） |
| spring.redis.host | 127.0.0.1:6379 | Redis |
| app.auth.jwt-secret | 环境变量 | JWT 密钥 |
| app.auth.jwt-ttl | 4h | JWT 有效期 |
| app.auth.refresh-ttl | 72h | 刷新 token 有效期 |
| flyway.enabled | true | Flyway 自动迁移 |
| spring.threads.virtual.enabled | true | Java 21 虚拟线程 |
| QDRANT_ENABLED | false | Qdrant 默认禁用 |

---

## 11. 代码规范与铁律

### 11.1 P0 铁律（违反即 P0 事故）

1. **Flyway 强制**：禁止修改已执行脚本；禁止 `IF NOT EXISTS` / `DELIMITER`
2. **事务边界**：`@Transactional` 仅在 Orchestrator 层
3. **多租户隔离**：所有 SQL 带 `tenant_id` WHERE
4. **AI 工具验证**：AI 回答业务数据走工具（db-query-mcp），不靠记忆
5. **MCP 多租户隔离**：所有 MCP 工具必填 tenantId
6. **AI Hard Limits**：单次工具调用 ≤5 并行

### 11.2 行数限制

| 层 | 限制 |
|----|------|
| Controller | ≤100 行 |
| Orchestrator | ≤150 行 |
| Service | ≤200 行 |
| 前端页面 index | ≤400 行 |
| 前端组件 | ≤200 行 |
| Hook | ≤80 行 |

### 11.3 强制组件（PC 端）

- ResizableTable / ResizableModal / RowActions / ModalContentLayout
- GlobalAiAssistant 是唯一 AI 助手入口
- CommandPalette（⌘K）是唯一全局搜索入口

### 11.4 三端同步

修改 API 接口、字段、校验规则时必须同步：
- PC 端（frontend/）
- 小程序（miniprogram/）
- H5（h5-web/）

共享文件：
- `miniprogram/utils/validationRules.js`（与 PC 端 formValidationRules.ts 一致）
- `miniprogram/shared/stageDetection.js`（跨端工序检测纯函数）

### 11.5 开发工作流（7 步）

1. **上下文加载**（RooFlow Memory Bank）— 读取 memory-bank 核心记忆
2. **角色选择**（agency-agents）— 按任务类型切换角色
3. **深度调研**（DeerFlow）— 用 change-impact-mcp + Serena 分析影响
4. **任务编排**（Ruflo）— 拆解子任务、排序依赖
5. **逐层执行** — DBA → 后端 → 前端 → 小程序 → 验证
6. **质量门控** — 用 MCP 工具验证（flyway-mcp / test-runner-mcp / anti-pattern-mcp）
7. **自进化记录**（Hermes）— 更新 memory-bank

---

## 12. 2026-07-09 修复核实记录

> 本节记录 2026-07-09 全天 25 个 commit 的修复核实结果

### 12.1 修复清单与状态

#### WebSocket 握手 500（8 个 commit）— ✅ 最终修复（前 7 个 commit 未解决根因）

| Commit | 修复点 | 状态 |
|--------|--------|------|
| 01a91f4f3 | @ServerEndpoint 注入失效 → 改用 SpringContextHolder.getBean() | ⚠️ 未解决根因 |
| 88a782352 | token 无 tenantId 空指针 → URL 路径 tenantId 兜底 | ✅ |
| c356c8660 | 前端降级重连 → 指数退避（5s→30s 上限，max 10 次） | ✅ |
| f7fb21267 | 增强握手日志 → `[WS]` 前缀 warn/info/error | ✅ |
| 3c26e7bff / 4258668bc | React StrictMode 双重挂载 → manualCloseRef 标志位 | ✅ |
| d4e380363 | token 读取 key 错误 → 多级兜底链 | ✅ |
| **6e1d90c41** | **SpringContextHolder 静态字段为 null → volatile + WebSocketConfig 双重保险** | ✅ **最终修复** |

**根因复盘**：

前 7 个 commit 修复了各种表层问题，但生产环境日志持续显示 `[WS] Spring上下文未就绪，拒绝连接: ApplicationContext 未初始化，SpringContextHolder 尚未就绪`。

**真正根因**：`SpringContextHolder.applicationContext` 静态字段在生产环境为 null。`SpringContextHolder` 虽标了 `@Component` + `ApplicationContextAware`，但静态字段可能因以下原因未被填充：
1. 缺少 `volatile` 修饰，多线程可见性问题（Spring 初始化线程写入，Tomcat handler 线程读不到）
2. 单一 `@Component` 注入路径不可靠（如果 Bean 因扫描/类加载器问题未实例化，静态字段永远为 null）

**最终修复**（commit 6e1d90c41）：
1. `applicationContext` 加 `volatile` 修饰
2. `WebSocketConfig`（`@Configuration` 一定会被扫描）实现 `ApplicationContextAware`，双重保险设置静态字段
3. `SpringContextHolder` 新增 `setApplicationContextStatic` 静态方法
4. `WebSocketHandshakeInterceptor` 增加 `isReady()` 预检，给出更清晰的错误日志

#### Flyway 迁移失败（3 个 commit）— ⚠️ 基本修复，1 处遗留风险

| Commit | 修复点 | 状态 |
|--------|--------|------|
| c3f6da6d0 | V20260708002 DELIMITER 语法错误 → 单条 UPDATE + REGEXP_REPLACE | ✅ |
| afa2d72c0 | V20260708002 表名错误 style_info→t_style_info | ✅ |
| ae98091a0 | V202606240001/002/003 MySQL 8.0 不兼容 → INFORMATION_SCHEMA + PREPARE | ⚠️ 部分修复 |

**遗留风险详情** ⚠️：

`V202606240001/002/003` 三个脚本中，当表存在时执行的 SQL 仍含 `ADD COLUMN IF NOT EXISTS` / `ADD INDEX IF NOT EXISTS`（MariaDB 特性，MySQL 8.0 不支持）。

**当前未爆发原因**：注释标注"表不存在时跳过"，当 `@table_exists = 0` 走 `SELECT 'skip'` 分支，不执行 ALTER TABLE。

**风险场景**：若 `t_integration_callback_log` / `t_logistics_provider` / `t_logistics_track` 三张表未来被创建，且在新环境部署时，`PREPARE stmt FROM @sql` 会因 `IF NOT EXISTS` 报错导致迁移失败。

**建议**：将 `ADD COLUMN IF NOT EXISTS` 改为 `INFORMATION_SCHEMA.COLUMNS` 检查 + 动态 SQL（参考 V20260709001 的写法）。

#### 业务逻辑修复（4 个 commit）— ✅ 已完整修复

| Commit | 修复点 | 状态 |
|--------|--------|------|
| ec9b20fd0 | 无二次工艺款式扫车缝误拦截 → `findPrevEnabledStage` 动态查找上一个启用阶段 | ✅ |
| 291d42b55 | MaterialPurchase 日期查询索引失效 + 当天数据丢失 → 范围查询 + V20260709001 索引 | ✅ |
| 608ec3d08 | LoanModal 全角空格 ESLint 报错 → 移除 | ✅ |
| 324ec2b06 | 成品出库/工序检测增强 → `resolveWarehouseFromLatestInbound` 自动获取位置 | ✅ |

**核实详情**：

1. **ProductionScanStageSupport.findPrevEnabledStage**（第 524-533 行）：从 `currentIdx - 1` 向前遍历，调用 `isStageExplicitlyDisabled` 跳过禁用阶段，返回第一个未禁用阶段；全部禁用时返回 `null`（上层跳过门禁）。逻辑覆盖所有禁用阶段场景（二次工艺/裁剪/车缝/尾部/入库均可通过 subProcessRemap 禁用并跳过）。

2. **MaterialPurchase 日期查询**：
   - `selectYearInboundByMonthAndType` 改为 `>= #{yearStart} AND < #{yearNextStart}` 范围查询（走索引）
   - `selectLast7DaysInboundByType` / `selectLast30DaysInboundByType` 改为 `< DATE_ADD(#{endDate}, INTERVAL 1 DAY)`
   - `V20260709001` 用 PREPARE/EXECUTE + INFORMATION_SCHEMA.STATISTICS 幂等模式，语法合规

#### CI 修复（2 个 commit）— ✅ 已完整修复

| Commit | 修复点 | 状态 |
|--------|--------|------|
| 531d7adc1 | 合并 3 个门禁 job 为 1 个 quality-gate | ✅ |
| 0b4d3e3cd | GITHUB_ENV 变量名拼写错误 → `BUILD_DATE` | ✅ |

#### 出库优化（commit 324ec2b06 + 0494c7571）— ✅ 已完整修复

| 场景 | 后端自动获取位置 | 前端移除选择器 | 状态 |
|------|----------------|--------------|------|
| 样衣借出 | SampleStockOrchestrator.loan() 从 stock 自动补全 | LoanModal.tsx 改为只读展示 | ✅ |
| 物料出库 | MaterialWarehouseOperationOrchestrator.freeOutbound() 从 stock 获取 | OutboundModal.tsx 改为只读提示 | ✅ |
| 成品扫码出库 | FinishedOutstockHelper.outbound() 调用 resolveWarehouseFromLatestInbound | QrcodeOutboundModal.tsx 增加"当前库位"只读列 | ✅ |

### 12.2 工作区未提交修改

**git status 显示 6 个前端文件未提交**：

```
modified:   frontend/src/App.tsx
modified:   frontend/src/components/common/GlobalAiAssistant/useAiChat.ts
modified:   frontend/src/components/common/GlobalAiAssistant/useAiChatStream.ts
modified:   frontend/src/components/common/KeyboardShortcuts.tsx
modified:   frontend/src/components/common/MaterialColorCardRecognizer.tsx
modified:   frontend/src/components/common/NodeDetailModal/InlinePurchasePanel.tsx
```

这些是今天后续的前端修改，尚未 commit。建议执行 `git diff` 确认内容后决定是否提交。

### 12.3 历史债务（不紧急）

| # | 风险 | 等级 | 说明 |
|---|------|------|------|
| 1 | V20260623005 含 DELIMITER | 低 | 已执行过不重跑，V20260709001 已补救。无法删除已执行脚本 |
| 2 | V202606240001/002/003 含 IF NOT EXISTS | 中 | 当前因表不存在走 SELECT 分支未爆发，表创建后新环境部署会失败 |

### 12.4 核实总结

今天 25 个 commit 涉及的 5 大类修复中，**绝大多数已完整落地**。唯一需要关注的是 `V202606240001/002/003` 三个 Flyway 脚本中残留的 `IF NOT EXISTS` 语法——虽然当前因表不存在而未爆发，但违反 P0 #1 铁律，建议择机修复为 `INFORMATION_SCHEMA` 检查模式（参考 V20260709001 的写法）。其余修复点均经代码级核实，确认完整无遗漏。

---

## 附录：关键文件路径索引

### 后端

| 文件 | 完整路径 |
|------|---------|
| 主启动类 | `backend/src/main/java/com/fashion/supplychain/FashionSupplychainApplication.java` |
| UserContext | `backend/src/main/java/com/fashion/supplychain/common/UserContext.java` |
| TenantAssert | `backend/src/main/java/com/fashion/supplychain/common/tenant/TenantAssert.java` |
| DistributedLockService | `backend/src/main/java/com/fashion/supplychain/common/lock/DistributedLockService.java` |
| BusinessException | `backend/src/main/java/com/fashion/supplychain/common/BusinessException.java` |
| GlobalExceptionHandler | `backend/src/main/java/com/fashion/supplychain/common/GlobalExceptionHandler.java` |
| SecurityConfig | `backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java` |
| WebSocketConfig | `backend/src/main/java/com/fashion/supplychain/config/WebSocketConfig.java` |
| AiAgentMemoryHelper | `backend/src/main/java/com/fashion/supplychain/intelligence/helper/AiAgentMemoryHelper.java` |
| AiAgentPromptHelper | `backend/src/main/java/com/fashion/supplychain/intelligence/helper/AiAgentPromptHelper.java` |
| EvolutionOrchestrator | `backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/EvolutionOrchestrator.java` |
| pom.xml | `backend/pom.xml` |
| application.yml | `backend/src/main/resources/application.yml` |

### 前端

| 文件 | 完整路径 |
|------|---------|
| App 入口 | `frontend/src/App.tsx` |
| 路由配置 | `frontend/src/routeConfig.ts` |
| AuthContext | `frontend/src/utils/AuthContext.tsx` |
| API 核心 | `frontend/src/utils/api/core.ts` |
| 权限工具 | `frontend/src/utils/permission.ts` |
| 设计系统 | `frontend/src/styles/design-system.css` |
| Vite 配置 | `frontend/vite.config.ts` |
| Dockerfile | `frontend/Dockerfile` |
| nginx 模板 | `frontend/nginx.conf.template` |
| ResizableTable | `frontend/src/components/common/ResizableTable/index.tsx` |
| ResizableModal | `frontend/src/components/common/ResizableModal.tsx` |
| CommandPalette | `frontend/src/components/common/CommandPalette.tsx` |
| GlobalAiAssistant | `frontend/src/components/common/GlobalAiAssistant/index.tsx` |

### 小程序

| 文件 | 完整路径 |
|------|---------|
| app.json | `miniprogram/app.json` |
| config.js | `miniprogram/config.js` |
| request.js | `miniprogram/utils/request.js` |
| api.js | `miniprogram/utils/api.js` |
| validationRules.js | `miniprogram/utils/validationRules.js` |
| stageDetection.js | `miniprogram/shared/stageDetection.js` |
| design-tokens | `miniprogram/styles/design-tokens.wxss` |

### H5

| 文件 | 完整路径 |
|------|---------|
| App 入口 | `h5-web/src/App.jsx` |
| authStore | `h5-web/src/stores/authStore.js` |
| http 服务 | `h5-web/src/services/http.js` |
| 设计 Token | `h5-web/src/styles/xiaoyun-tokens.css` |
| Dockerfile | `h5-web/Dockerfile` |

### 部署

| 文件 | 完整路径 |
|------|---------|
| 云托管配置 | `cloudbaserc.json` |
| 一键启动 | `dev-public.sh` |
| 部署指南 | `deployment/上线部署指南.md` |
| 数据库管理 | `deployment/db-manager.sh` |

### MCP 服务器

| MCP | 完整路径 |
|-----|---------|
| db-query-mcp | `.trae/mcp-servers/db-query-mcp/index.js` |
| flyway-mcp | `.trae/mcp-servers/flyway-mcp/index.js` |
| test-runner-mcp | `.trae/mcp-servers/test-runner-mcp/index.js` |
| anti-pattern-mcp | `.trae/mcp-servers/anti-pattern-mcp/index.js` |
| change-impact-mcp | `.trae/mcp-servers/change-impact-mcp/index.js` |
| memory-bank-mcp | `.trae/mcp-servers/memory-bank-mcp/index.js` |

### Memory Bank

| 文件 | 完整路径 |
|------|---------|
| 当前上下文 | `memory-bank/activeContext.md` |
| 进度跟踪 | `memory-bank/progress.md` |
| 决策日志 | `memory-bank/decisionLog.md` |
| 反模式 | `memory-bank/anti-patterns.md` |
| 变更影响矩阵 | `memory-bank/change-impact-matrix.md` |
| 快速上手 | `memory-bank/quick-start-5min.md` |
| AI 操作日志 | `memory-bank/ai-dashboard.md` |
| 上下文腐烂治理 | `memory-bank/context-rot-mgmt.md` |

---

> 本文档基于 2026-07-09 项目实际状态生成，后续重大架构变更需同步更新。

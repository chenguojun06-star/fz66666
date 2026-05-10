# 服装供应链MES系统 — Code Wiki

> 生成时间：2026-05-10 | 版本：1.0.0
> 项目定位：服装加工行业生产执行系统，三端协同（PC管理后台 + 微信小程序扫码 + H5移动端）

---

## 一、项目总览

### 1.1 系统简介

服装供应链MES（Manufacturing Execution System）是面向服装加工行业的全链路生产执行系统，覆盖从款式开发、订单管理、物料采购、裁剪、车缝、质检、入库到财务结算的完整业务流程。系统采用多租户架构，支持多工厂数据隔离，内置小云AI智能体提供智能化辅助。

### 1.2 技术栈全景

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **后端框架** | Spring Boot | 3.4.5 | 核心后端框架 |
| **语言** | Java | 21 | 后端开发语言（虚拟线程支持） |
| **ORM** | MyBatis-Plus | 3.5.12 | 数据库ORM增强 |
| **数据库** | MySQL | 8.0 | 主数据库（Docker 3308端口） |
| **缓存** | Redis + Caffeine | Lettuce + Spring Cache | 分布式缓存 + 本地缓存 |
| **数据库迁移** | Flyway | 10.x（BOM管理） | Schema版本管理 |
| **AI框架** | Spring AI | 1.0.0 | Azure OpenAI集成 |
| **API文档** | SpringDoc OpenAPI | 2.6.0 | Swagger API文档 |
| **工具库** | Hutool | 5.8.27 | Java工具集 |
| **Excel** | Apache POI | 5.3.0 | Excel导入导出 |
| **前端框架** | React | 18.2 | UI框架 |
| **构建工具** | Vite | 7.3.1 | 前端构建 |
| **UI组件库** | Ant Design | 6.1.3 | 企业级UI组件 |
| **状态管理** | Zustand | 5.0.10 | 轻量状态管理 |
| **图表** | ECharts 6 + @ant-design/charts | 6.0.0 / 2.6.7 | 数据可视化 |
| **类型系统** | TypeScript | 5.3.3 | 类型安全 |
| **小程序** | 微信原生 | — | 扫码端 |
| **H5端** | React 18 + Vite 7 | 18.3.1 / 7.1.5 | 移动H5 |
| **Flutter** | Flutter SDK | ^3.11.5 | 独立App（GetX + Dio） |
| **部署** | 腾讯云 CloudBase + Docker + nginx | — | 云托管部署 |
| **CI/CD** | GitHub Actions | — | 自动化构建部署 |

### 1.3 代码规模统计

| 指标 | 数量 |
|------|------|
| 后端 Controller | 100 |
| 后端 Orchestrator | 100+ |
| 后端 ServiceImpl | 90+ |
| 后端 Mapper | 100+ |
| Flyway 迁移脚本 | 200+ |
| 前端业务模块 | 10 |
| 前端公共组件 | 50+ |
| 前端自定义 Hook | 20+ |
| 小程序页面 | 30+ |
| 小程序组件 | 15+ |
| H5页面 | 30+ |
| AI Agent 工具 | 25+ |
| AI 编排器 | 40+ |

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        客户端层                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ PC管理端  │  │微信小程序 │  │  H5移动端 │  │Flutter App│   │
│  │React+antd│  │ 原生开发  │  │React+Vite│  │ GetX+Dio │   │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘   │
│        └──────────────┴─────────────┴─────────────┘        │
│                          HTTPS / WSS                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                       nginx 反向代理                         │
│           (gzip / SPA fallback / no-cache / CORS)           │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                    Spring Boot 后端                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Controller → Orchestrator → Service → Mapper        │   │
│  │       ↓            ↓                                │   │
│  │  @PreAuthorize  @Transactional                      │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────────┐    │
│  │Redis │ │MySQL │ │Flyway│ │WebSocket│ │ Spring AI   │    │
│  │Cache │ │ 8.0  │ │迁移  │ │ STOMP  │ │ Azure OpenAI│    │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 后端分层架构

```
Controller（HTTP入口，权限校验）
    ↓
Orchestrator（跨Service编排，@Transactional事务边界）
    ↓
Service（单表/单领域逻辑，禁止互调，禁止加事务）
    ↓
Mapper（MyBatis-Plus数据访问）
```

**铁律**：
- `@Transactional` 只在 Orchestrator 层
- Service 禁止互调，跨域逻辑必须通过 Orchestrator
- Controller 禁止调用多个 Service

### 2.3 多租户架构

```
请求 → TenantInterceptor（注入tenantId）
     → MyBatisPlusMetaObjectHandler（自动填充tenantId）
     → DataScopeAspect（数据权限过滤）
     → SafeQueryHelper（安全查询辅助）
```

所有查询自动附加 `tenant_id` 条件，确保租户数据隔离。

---

## 三、后端模块详解

### 3.1 模块清单

| 模块 | 包路径 | 编排器数 | 职责 |
|------|--------|---------|------|
| **production** | `production` | 31 | 生产订单、扫码、裁剪、质检、进度跟踪 |
| **intelligence** | `intelligence` | 130+ | 小云AI对话、知识库、异常检测、自我进化 |
| **finance** | `finance` | 21 | 工资结算、对账、报销、付款、成本核算 |
| **system** | `system` | 15 | 租户、用户、角色、工厂、配置管理 |
| **style** | `style` | 9 | 款式信息、BOM、工艺、报价 |
| **warehouse** | `warehouse` | 8 | 物料库存、入库、出库、调拨、盘点 |
| **selection** | `selection` | 4 | 选款审核、批次、候选 |
| **integration** | `integration` | 3+ | 开放API、电商订单、支付/物流 |
| **dashboard** | `dashboard` | 3 | 数据看板、趋势分析 |
| **crm** | `crm` | 3 | 客户管理、应收账款 |
| **template** | `template` | 2 | 生产模板、款式模板 |
| **procurement** | `procurement` | 2 | 采购订单、供应商评分 |
| **wechat** | `wechat` | 2 | H5/小程序授权 |
| **datacenter** | `datacenter` | 1 | 数据同步、质量管理 |
| **search** | `search` | 1 | 全局搜索 |
| **stock** | `stock` | 1 | 样衣库存 |

### 3.2 核心业务模块

#### production — 生产管理

| 关键类 | 职责 |
|--------|------|
| `ProductionOrderOrchestrator` | 生产订单全生命周期（创建、流转、关闭、报废） |
| `ScanRecordOrchestrator` | 扫码记录核心入口（扫码、撤回、质检） |
| `CuttingTaskOrchestrator` | 裁剪任务管理 |
| `CuttingBundleOrchestrator` | 扎捆管理 |
| `MaterialPurchaseOrchestrator` | 物料采购全流程 |
| `MaterialInboundOrchestrator` | 物料入库确认 |
| `MaterialStockOrchestrator` | 物料库存管理 |
| `ProductWarehousingOrchestrator` | 成品入库 |
| `FactoryShipmentOrchestrator` | 工厂发货 |
| `PatternRevisionOrchestrator` | 纸样修订 |

**6大固定父进度节点**：采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库

**子工序→父节点映射优先级**：模板 `progressStage` > `t_process_parent_mapping` DB动态表 > 硬编码兜底

#### finance — 财务管理

| 关键类 | 职责 |
|--------|------|
| `WagePaymentOrchestrator` | 工资支付全流程 |
| `ShipmentReconciliationOrchestrator` | 发货对账 |
| `MaterialReconciliationOrchestrator` | 物料对账 |
| `PayrollSettlementOrchestrator` | 工资结算 |
| `FinancialReportOrchestrator` | 财务报表 |
| `OrderProfitOrchestrator` | 订单利润计算 |

#### intelligence — AI智能模块

| 子模块 | 关键类 | 职责 |
|--------|--------|------|
| **AI对话** | `AiAgentOrchestrator` | 小云AI对话核心（快速通道+Agent循环） |
| **MCP工具** | `McpSseController` | MCP SSE协议端点 |
| **多Agent图** | `MultiAgentGraphOrchestrator` | DAG编排多Agent协作 |
| **自我进化** | `SelfCriticService` | 5维度自动评分 |
| **质量门** | `QuickPathQualityGate` | 快速通道质量审查 |
| **数据真值** | `DataTruthGuard` | 5级数据验证体系 |
| **动态FollowUp** | `DynamicFollowUpEngine` | AI动态生成后续建议 |
| **实时学习** | `RealTimeLearningLoop` | 实时学习闭环 |
| **超顾问** | `HyperAdvisorController` | 超级顾问服务 |
| **自主Agent** | `AutonomousAgentController` | 自主执行Agent |
| **知识图谱** | `KnowledgeGraphOrchestrator` | 领域知识图谱 |
| **交付预测** | `DeliveryPredictionOrchestrator` | 交付期预测 |
| **风险追踪** | `OrderRiskTrackingOrchestrator` | 订单风险追踪 |

**AI Agent工具清单**（25+）：

| 工具 | 用途 |
|------|------|
| `OrderEditTool` | 订单编辑 |
| `OrderRemarkTool` | 订单备注 |
| `StyleInfoTool` | 款式查询 |
| `CuttingTaskTool` | 裁剪任务查询 |
| `MaterialAuditTool` | 物料审计 |
| `MaterialRollTool` | 卷料管理 |
| `ScanUndoTool` | 扫码撤回 |
| `DictTool` | 字典查询 |
| `InvoiceTool` | 发票查询 |
| `TaxConfigTool` | 税务配置 |
| `CrmCustomerTool` | 客户查询 |
| `SupplierTool` | 供应商查询 |
| `SampleStockTool` | 样衣库存 |
| `SampleLoanTool` | 样衣借出 |
| `SmartReportTool` | 智能报表 |
| `DeepAnalysisTool` | 深度分析 |
| `RcaAnalysisTool` | 根因分析 |
| `DelayTrendTool` | 延期趋势 |
| `TeamDispatchTool` | 团队调度 |
| `OrgQueryTool` | 组织查询 |
| `SystemUserTool` | 用户查询 |
| `ProcurementTool` | 采购查询 |
| `ThinkTool` | 思考工具 |
| `HyperAdvisorTool` | 超级顾问 |
| `ToolDiscoveryRag` | 工具发现RAG |

### 3.3 基础设施模块

| 模块 | 关键类 | 职责 |
|------|--------|------|
| **安全** | `SecurityConfig`, `TokenAuthFilter`, `AuthTokenService` | JWT认证+权限控制 |
| **多租户** | `TenantInterceptor`, `TenantMetaObjectHandler`, `DataScopeAspect` | 租户隔离+数据权限 |
| **分布式锁** | `DistributedLockService` | Redis Lua脚本分布式锁 |
| **缓存** | `RedisConfig`, `CacheAspect` | Redis+Caffeine二级缓存 |
| **WebSocket** | `WebSocketConfig` | STOMP协议实时推送 |
| **数据库修复** | `DbColumnRepairRunner`, `DbViewRepairHelper`, `DbTableDefinitions` | Schema漂移自动修复 |
| **Flyway** | `FlywayRepairConfig`, `ViewMigrator` | 数据库迁移+VIEW管理 |
| **异步** | `AsyncConfig` | 线程池配置（含AI专用线程池） |
| **监控** | `MonitoringConfig`, `PerformanceMonitor` | Micrometer+Prometheus |
| **Jackson** | `JacksonConfig` | Long→String防精度丢失 |

---

## 四、前端模块详解

### 4.1 模块结构

```
frontend/src/
├── modules/                    # 业务模块
│   ├── basic/                  # 基础模块（款式、订单、模板、纸样）
│   │   ├── StyleInfo/          # 款式详情（BOM/工艺/尺码/报价/二次工艺）
│   │   ├── StyleInfoList/      # 款式列表
│   │   ├── OrderManagement/    # 订单管理（创建/编辑/分析/智能洞察）
│   │   ├── TemplateCenter/     # 模板中心
│   │   ├── MaintenanceCenter/  # 维护中心（BOM/纸样/尺码/单价）
│   │   ├── PatternRevisionManagement/ # 纸样修订
│   │   └── DataCenter/         # 数据中心
│   ├── production/             # 生产模块
│   │   ├── ProcessDetailModal/ # 工序详情弹窗
│   │   └── ProcessTrackingTable/ # 工序跟踪表
│   ├── finance/                # 财务模块
│   │   ├── Finance/            # 工资/对账/报销/发票/税务
│   │   └── EcSalesRevenue/     # 电商销售收入
│   ├── warehouse/              # 仓库模块
│   ├── dashboard/              # 仪表盘
│   ├── crm/                    # 客户管理
│   ├── system/                 # 系统管理
│   ├── selection/              # 选款
│   └── intelligence/           # AI智能
├── components/                 # 公共组件
│   ├── common/                 # 通用组件
│   │   ├── GlobalAiAssistant/  # 小云AI助手（全局浮动）
│   │   ├── ResizableTable/     # 可拖拽列宽表格
│   │   ├── ResizableModal/     # 可调整弹窗
│   │   ├── ModalContentLayout/ # 弹窗内容布局
│   │   ├── StandardSearchBar/  # 标准搜索栏
│   │   ├── StandardToolbar/    # 标准工具栏
│   │   ├── RowActions/         # 行操作按钮
│   │   └── ...                 # 50+ 公共组件
│   ├── Layout/                 # 布局组件
│   └── production/             # 生产专用组件
├── hooks/                      # 自定义Hooks
├── stores/                     # Zustand状态管理
├── services/                   # API服务层
├── styles/                     # 设计系统
├── utils/                      # 工具函数
└── types/                      # TypeScript类型定义
```

### 4.2 关键公共组件

| 组件 | 用途 | 强制使用场景 |
|------|------|-------------|
| `ResizableTable` | 可拖拽列宽表格 | 替代 antd Table |
| `RowActions` | 行操作按钮（最多1主按钮） | 替代自定义操作列 |
| `ResizableModal` | 可调整弹窗（60/40/30vw） | 替代自定义弹窗 |
| `ModalContentLayout` + `ModalFieldRow` | 弹窗表单布局 | 替代自定义表单布局 |
| `ModalHeaderCard` | 弹窗头部卡片 | 替代自定义头部样式 |
| `StandardSearchBar` | 标准搜索栏 | 列表页搜索 |
| `StandardToolbar` | 标准工具栏 | 列表页操作栏 |
| `GlobalAiAssistant` | 小云AI助手 | 全局浮动AI |

### 4.3 设计系统

设计系统定义在 [design-system.css](frontend/src/styles/design-system.css)，包含：

- **颜色变量**：`--color-primary`、`--color-text-primary/secondary/tertiary`、`--color-bg-base/container/elevated` 等
- **深色模式**：`@media (prefers-color-scheme: dark)` 自动切换
- **间距变量**：`--spacing-xs/sm/md/lg/xl`
- **阴影变量**：`--shadow-sm/md/lg`
- **响应式断点**：`--breakpoint-sm/md/lg/xl`

### 4.4 状态管理

使用 Zustand 5.x，定义在 [stores/index.ts](frontend/src/stores/index.ts)。

### 4.5 API层架构

```
utils/api/core.ts          → Axios实例（拦截器、错误处理、Token注入）
utils/api/index.ts         → 统一导出
utils/api/production.ts    → 生产模块API
utils/api/size.ts          → 尺码API
services/                  → 各业务模块API服务
```

### 4.6 构建配置

Vite 7 构建配置要点：
- ESBuild 压缩
- Chunk 分包策略（vendor-react / vendor-antd / vendor-antv-charts / vendor-dayjs 等）
- 路径别名 `@/` → `src/`
- Husky + lint-staged 提交检查
- Playwright E2E 测试

---

## 五、小程序与H5架构

### 5.1 微信小程序

```
miniprogram/
├── pages/
│   ├── home/              # 首页
│   ├── scan/              # 扫码核心（含7个子页面）
│   │   ├── confirm/       # 扫码确认
│   │   ├── quality/       # 质检扫码
│   │   ├── pattern/       # 纸样扫码
│   │   ├── rescan/        # 重新扫码
│   │   ├── history/       # 扫码历史
│   │   └── handlers/      # 扫码处理器（10+处理器）
│   ├── dashboard/         # 仪表盘
│   ├── admin/             # 管理页
│   ├── payroll/           # 工资
│   ├── cutting/           # 裁剪
│   ├── warehouse/         # 仓库
│   ├── order/             # 下单
│   └── ...
├── components/
│   ├── ai-assistant/      # AI助手组件
│   ├── scan/              # 扫码组件（QR扫描器+质检表单）
│   ├── sku-matrix/        # SKU矩阵
│   └── ...
├── shared/                # 跨端共享
│   └── stageDetection.js  # 工序检测共享逻辑
├── utils/
│   ├── api-modules/       # API模块化
│   ├── validationRules.js # 校验规则（与PC端同步）
│   └── i18n/              # 国际化
└── styles/                # 共享样式
    ├── design-tokens.wxss # 设计令牌
    ├── modal-form.wxss    # 弹窗表单
    └── xiaoyun-tokens.wxss # 小云AI样式
```

**扫码核心架构**：
```
ScanHandler → ScanModeResolver → ScanStageProcessor → ScanSubmitter
                                    ↓
                              QRCodeParser（5种码解析器）
                                    ↓
                              ScanOfflineQueue（离线队列）
```

### 5.2 H5移动端

```
h5-web/
├── src/
│   ├── pages/             # 30+页面（扫码/AI助手/工资/订单等）
│   ├── components/        # 共享组件
│   ├── hooks/             # 自定义Hooks（AI流式/摄像头/语音）
│   ├── services/          # HTTP/WebSocket/微信SDK
│   ├── stores/            # Zustand状态管理
│   └── utils/             # 工具函数
└── source-miniapp/        # 小程序源码同步
```

H5端通过 `sync-miniprogram.mjs` 从小程序同步代码，保持逻辑一致性。

### 5.3 Flutter App

```
flutter_app/
├── lib/
│   ├── components/        # 组件（mp_modal等）
│   ├── config/            # 配置
│   ├── pages/             # 页面
│   ├── routes/            # 路由
│   ├── theme/             # 主题
│   └── utils/             # 工具（API/HTTP/EventBus）
└── pubspec.yaml           # 依赖：GetX + Dio + mobile_scanner + sqflite
```

---

## 六、数据库架构

### 6.1 Flyway迁移管理

- 迁移脚本目录：`backend/src/main/resources/db/migration/`
- 迁移脚本数量：200+
- 命名规范：`V{timestamp}__{description}.sql`
- 修复机制：`FlywayRepairConfig` + `DbColumnRepairRunner` 双路径防御

### 6.2 核心数据表

| 领域 | 核心表 | 说明 |
|------|--------|------|
| **生产** | `t_production_order` | 生产订单 |
| | `t_scan_record` | 扫码记录 |
| | `t_cutting_task` / `t_cutting_bundle` | 裁剪任务/扎捆 |
| | `t_production_process_tracking` | 工序跟踪 |
| | `t_process_parent_mapping` | 子工序→父节点动态映射 |
| **物料** | `t_material_purchase` | 物料采购 |
| | `t_material_stock` | 物料库存 |
| | `t_material_inbound` | 物料入库 |
| **成品** | `t_product_warehousing` | 成品入库 |
| | `t_factory_shipment` / `t_factory_shipment_detail` | 工厂发货 |
| **款式** | `t_style_info` | 款式信息 |
| | `t_style_bom` | BOM清单 |
| | `t_product_sku` | SKU管理 |
| **财务** | `t_wage_payment` | 工资支付 |
| | `t_shipment_reconciliation` | 发货对账 |
| | `t_material_reconciliation` | 物料对账 |
| | `t_payroll_settlement` | 工资结算 |
| **系统** | `t_tenant` | 租户 |
| | `t_user` / `t_role` / `t_permission` | 用户/角色/权限 |
| | `t_factory` / `t_factory_worker` | 工厂/工人 |
| **AI** | `t_agent_session` / `t_agent_checkpoint` / `t_agent_event` | Agent会话 |
| | `t_intelligence_memory` | AI记忆 |
| | `t_knowledge_base` | 知识库 |
| | `t_agent_memory_core` / `t_agent_memory_archival` | 记忆核心/归档 |

### 6.3 关键VIEW

| VIEW | 用途 |
|------|------|
| `v_production_order_flow_stage_snapshot` | 订单流程阶段快照（动态二次工艺映射） |
| `v_settlement_report` | 结算报表 |

---

## 七、部署架构

### 7.1 部署拓扑

```
腾讯云 CloudBase
├── 后端容器（Spring Boot Docker）
│   ├── Dockerfile（多阶段构建）
│   └── docker-entrypoint.sh
├── 前端容器（nginx + React静态资源）
│   ├── Dockerfile
│   └── nginx.conf.template
├── H5容器（nginx + React静态资源）
│   ├── Dockerfile
│   └── nginx.conf
├── MySQL 8.0（Docker 3308端口）
└── Redis（Lettuce连接）
```

### 7.2 CI/CD流程

```
GitHub Push → GitHub Actions
├── ci.yml              → 编译+测试+安全扫描
├── deploy-backend.yml  → 后端部署
├── deploy-frontend.yml → 前端部署
└── deploy-h5.yml       → H5部署
```

### 7.3 nginx关键配置

- **SPA Fallback**：所有静态资源类型（含JS/CSS）404直接返回404，不返回index.html
- **no-cache**：`index.html` 全路径 `Cache-Control: no-store`
- **gzip**：启用gzip压缩
- **反向代理**：`/api/` → 后端服务

---

## 八、项目运行方式

### 8.1 一键启动

```bash
./dev-public.sh    # MySQL + 后端 + 前端
```

### 8.2 分别启动

```bash
# 后端（端口8088）
cd backend && mvn spring-boot:run

# 前端（端口5173）
cd frontend && npm run dev

# H5端
cd h5-web && npm run dev
```

### 8.3 常用命令

```bash
# 后端编译
cd backend && mvn clean compile -q

# 前端全量检查
cd frontend && npm run check:all

# 前端TypeScript类型检查
cd frontend && npx tsc --noEmit

# 前端ESLint
cd frontend && npm run lint

# 前端单元测试
cd frontend && npm run test

# 前端E2E测试
cd frontend && npm run test:e2e

# 后端单元测试
cd backend && mvn clean test

# Shell集成测试
./scripts/test/test-complete-business-flow.sh
```

---

## 九、技能需求分析

### 9.1 当前技术栈所需技能清单

| 技能领域 | 具体技能 | 重要程度 | 当前掌握难度 |
|----------|---------|---------|-------------|
| **后端核心** | Spring Boot 3.4 + Java 21（虚拟线程、Record、Sealed Class） | ★★★★★ | 中 |
| **后端核心** | MyBatis-Plus 3.5（多租户插件、乐观锁、逻辑删除） | ★★★★★ | 中 |
| **后端核心** | Flyway数据库迁移（SET @s陷阱、PREPARE陷阱） | ★★★★★ | 高（项目特有坑） |
| **后端核心** | Spring Security + JWT + @PreAuthorize权限体系 | ★★★★★ | 中 |
| **后端核心** | Redis分布式锁（Lua脚本）+ Caffeine二级缓存 | ★★★★ | 中 |
| **后端核心** | WebSocket + STOMP实时推送 | ★★★ | 中 |
| **AI/智能** | Spring AI 1.0 + Azure OpenAI集成 | ★★★★★ | 高 |
| **AI/智能** | MCP协议（Model Context Protocol） | ★★★★★ | 高 |
| **AI/智能** | Agent DAG编排（多Agent协作） | ★★★★ | 高 |
| **AI/智能** | SSE（Server-Sent Events）流式响应 | ★★★★ | 中 |
| **AI/智能** | Prompt Engineering + RAG | ★★★★ | 高 |
| **前端核心** | React 18（Concurrent Mode、Suspense） | ★★★★★ | 中 |
| **前端核心** | TypeScript 5.x（类型体操、泛型） | ★★★★★ | 中 |
| **前端核心** | Ant Design 6（新API、迁移） | ★★★★ | 中 |
| **前端核心** | Zustand 5状态管理 | ★★★★ | 低 |
| **前端核心** | Vite 7构建优化（分包、Tree-shaking） | ★★★ | 中 |
| **前端核心** | ECharts 6数据可视化 | ★★★ | 中 |
| **前端核心** | CSS变量设计系统 + 深色模式 | ★★★★ | 低 |
| **小程序** | 微信原生小程序开发 | ★★★★★ | 中 |
| **小程序** | 微信云托管 + CloudBase | ★★★★ | 中 |
| **小程序** | 扫码核心链路（QR解析+离线队列+防重复） | ★★★★★ | 高（项目特有） |
| **H5/Flutter** | React H5移动端开发 | ★★★ | 中 |
| **H5/Flutter** | Flutter + GetX + Dio | ★★ | 中 |
| **DevOps** | Docker多阶段构建 + nginx配置 | ★★★★ | 中 |
| **DevOps** | GitHub Actions CI/CD | ★★★★ | 中 |
| **DevOps** | 腾讯云 CloudBase部署 | ★★★ | 中 |
| **业务** | 服装行业MES业务知识 | ★★★★★ | 高（领域特有） |
| **业务** | 多租户SaaS架构设计 | ★★★★ | 高 |
| **业务** | 工序映射+6大父进度节点体系 | ★★★★★ | 高（项目特有） |

### 9.2 技术栈版本与最新版对比

| 技术 | 项目版本 | 最新稳定版 | 差距 | 升级建议 |
|------|---------|-----------|------|---------|
| Spring Boot | 3.4.5 | **4.0**（2025.11 GA） | 大版本落后 | ⚠️ 暂不升级（4.0基于Spring 7+Java 25，破坏性变更多） |
| Java | 21 | 25 | 2个LTS版本 | ✅ 保持21（当前LTS，4.0前主流） |
| MyBatis-Plus | 3.5.12 | 3.5.x最新 | 小版本 | ✅ 定期更新小版本 |
| MySQL Connector | 8.4.0 | 9.x | 大版本 | ⚠️ 暂不升级（8.4 LTS足够） |
| React | 18.2 | **19.x** | 大版本落后 | ⚠️ 可评估升级（需确认antd 6兼容性） |
| Ant Design | 6.1.3 | 6.x最新 | 小版本 | ✅ 定期更新 |
| Vite | 7.3.1 | 7.x最新 | 已最新 | ✅ 保持更新 |
| Zustand | 5.0.10 | 5.x最新 | 已最新 | ✅ 保持更新 |
| TypeScript | 5.3.3 | **5.8+** | 小版本落后 | ⚠️ 建议升级（5.4+有装饰器元数据等新特性） |
| Spring AI | 1.0.0 | **1.1.0-M3** | 里程碑版 | ⚠️ 关注MCP模块重大更新 |
| Flutter SDK | ^3.11.5 | 3.x最新 | 已最新 | ✅ 保持更新 |

### 9.3 需要额外学习的技能

| 技能 | 原因 | 优先级 |
|------|------|--------|
| **Spring Boot 4.0 新特性** | 下一个LTS版本，模块化+Java 25+JSpecify空安全 | P2（长期规划） |
| **React 19 新特性** | Server Components、Actions、use() Hook | P2（评估兼容性） |
| **Spring AI MCP 1.1** | MCP模块重大更新，更好的Agent工具集成 | P1（AI核心） |
| **Flyway 10.x 高级特性** | 项目已有200+迁移脚本，需掌握批量修复和基线管理 | P1 |
| **JSpecify 空安全** | Spring Boot 4.0方向，提前学习 | P3 |
| **GraalVM Native Image** | Spring Boot 3.x原生支持，可大幅提升启动速度 | P3 |
| **Observability（OpenTelemetry）** | 项目已有Micrometer，可升级到OTel统一可观测性 | P2 |
| **前端微前端/Module Federation** | 项目已10个模块，可考虑微前端拆分 | P3 |

---

## 十、项目不合理之处与改进建议

### 10.1 P0级 — 严重问题

#### 1. 生产配置硬编码敏感信息

**位置**：`application-prod.yml` 多处

**问题**：数据库密码、JWT密钥、微信AppID等敏感信息直接硬编码在配置文件中，存在泄露风险。

**修复建议**：所有敏感配置通过环境变量注入：
```yaml
password: ${DB_PASSWORD}
jwt.secret: ${JWT_SECRET}
```

#### 2. CORS配置过于宽松

**位置**：`application-prod.yml` L223-226

**问题**：生产环境CORS允许HTTP源和localhost，增加XSS攻击风险。

**修复建议**：仅允许HTTPS生产域名，禁用localhost。

### 10.2 P1级 — 重要问题

#### 3. 测试覆盖率最低阈值设为0%

**位置**：`pom.xml` L343-356

**问题**：JaCoCo最小覆盖率配置为0%，无法保证代码质量。

**修复建议**：逐步提升至80%+，优先覆盖Orchestrator层（项目铁律要求100%）。

#### 4. 缺乏自动化依赖安全扫描

**问题**：虽有Dependabot配置，但CI中未强制执行安全扫描。

**修复建议**：CI中增加 `mvn dependency-check:check` 和 `npm audit --audit-level=high`。

#### 5. Dockerfile未采用最佳多阶段构建

**位置**：`backend/Dockerfile`

**问题**：镜像层数过多，运行时镜像未最小化。

**修复建议**：采用多阶段构建，使用 `eclipse-temurin:21-jre-alpine` 作为运行时基础镜像。

#### 6. 前端硬编码颜色值（1575处）

**问题**：1180个hex + 395个rgba硬编码颜色，分布在100+文件中。

**修复建议**：分批替换中性色为CSS变量（已启动治理，完成WagePayment模块）。

### 10.3 P2级 — 中等问题

#### 7. Service层@Transactional违规（62处剩余）

**问题**：项目铁律要求事务仅在Orchestrator层，但仍有62处Service层违规。

**修复建议**：逐个分析调用链，安全移除冗余事务注解（已治理8处）。

#### 8. Flyway动态SQL字符串字面量陷阱（21个文件）

**问题**：`SET @s` 动态SQL内使用 `COMMENT ''xxx''` 或 `DEFAULT ''字符串''`，可能导致Flyway静默失败。

**修复建议**：已有 `DbColumnRepairRunner` 双路径防御，但新迁移脚本需严格遵守规范。

#### 9. TODO/FIXME标记未清理

**问题**：存在未处理的TODO标记，可能被遗漏。

**修复建议**：版本发布前清理所有TODO/FIXME。

#### 10. @Deprecated端点未设移除时间表

**问题**：10处旧式API端点已标记@Deprecated，但无移除计划。

**修复建议**：设定3个月过渡期后移除旧端点。

### 10.4 P3级 — 一般问题

#### 11. 前端TypeScript版本偏旧（5.3.3）

**问题**：最新5.8+有装饰器元数据、`using`声明等新特性。

**修复建议**：升级到5.7+，需验证antd 6兼容性。

#### 12. 项目根目录文档碎片化

**问题**：根目录有30+个MD文件（报告/清单/指南），缺乏组织。

**修复建议**：归档到 `docs/archive/` 目录，保持根目录整洁。

#### 13. 缺乏API版本管理

**问题**：RESTful API无版本号（如 `/api/v1/`），未来升级困难。

**修复建议**：新端点统一加 `/api/v1/` 前缀。

---

## 十一、关键设计模式与约定

### 11.1 编排器模式（Orchestrator Pattern）

```
Controller（薄层，仅参数校验+权限+调用编排器）
    ↓
Orchestrator（厚层，跨Service编排+事务边界+业务规则）
    ↓
Service（纯逻辑，单领域操作，可被多个编排器复用）
    ↓
Mapper（数据访问，MyBatis-Plus通用CRUD）
```

### 11.2 双路径防御模式（Schema漂移）

```
路径1：Flyway V*.sql → 云端+本地都执行
路径2：DbColumnRepairRunner → 本地启动时自动修复（JDBC，不受Flyway解析器影响）
```

### 11.3 快速通道+Agent循环模式（AI对话）

```
用户消息 → isQuickPathEligible()?
  ├── YES → tryQuickPath()（直接调用模型，≤25字简短问题）
  │         → QuickPathQualityGate审查
  │         → 不合格 → 降级到Agent循环
  └── NO  → AgentLoopEngine（DAG编排多工具调用）
```

### 11.4 防御式消息创建模式（前端SSE）

```typescript
setMessages(prev => {
  const existing = prev.find(m => m.id === aiMsgId);
  if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text } : m);
  return [...prev, { id: aiMsgId, role: 'ai', text }];
});
```

### 11.5 内联错误恢复模式（部署白屏防护）

```html
<!-- index.html <head> 内联脚本，不依赖外部文件 -->
<script>
document.addEventListener('error', function(e) {
  var t = e.target;
  if ((t.tagName==='SCRIPT'||t.tagName==='LINK') && 
      (t.src||t.href).indexOf('/assets/')!==-1) {
    if (!sessionStorage.getItem('__crit_reload__')) {
      sessionStorage.setItem('__crit_reload__','1');
      location.reload();
    }
  }
}, true);
</script>
```

---

## 十二、依赖关系图

### 12.1 后端核心依赖

```
spring-boot-starter-web
├── spring-boot-starter-security
├── spring-boot-starter-aop
├── spring-boot-starter-validation
├── spring-boot-starter-cache
├── spring-boot-starter-data-redis
├── spring-boot-starter-websocket
├── spring-boot-starter-actuator
├── spring-ai-openai (1.0.0 BOM)
├── spring-ai-client-chat
├── mybatis-plus-spring-boot3-starter (3.5.12)
├── mysql-connector-j (8.4.0)
├── flyway-core + flyway-mysql
├── springdoc-openapi (2.6.0)
├── hutool-all (5.8.27)
├── poi + poi-ooxml (5.3.0)
├── lombok (1.18.38)
├── caffeine
├── micrometer-core + micrometer-registry-prometheus
└── commons-pool2
```

### 12.2 前端核心依赖

```
react 18.2 + react-dom 18.2
├── antd 6.1.3 + @ant-design/icons 6.1 + @ant-design/charts 2.6.7
├── zustand 5.0.10
├── react-router-dom 6.22
├── axios 1.13.2
├── echarts 6.0 + echarts-for-react 3.0.6
├── @dnd-kit/core 6.3 + @dnd-kit/sortable 10.0
├── dayjs 1.11.19
├── exceljs 4.4 + xlsx 0.18.5
├── dompurify 3.4
├── qrcode 1.5.4 + qrcode.react 4.2
└── react-virtuoso 4.18.6
```

---

## 十三、测试体系

| 类型 | 数量 | 位置 | 语言 |
|------|------|------|------|
| Shell集成测试 | 24脚本 / 7.7k行 | `scripts/test/` | Bash |
| Playwright E2E | 3 specs / 393行 | `frontend/e2e/` | TypeScript |
| Vitest单元测试 | — | `frontend/` | TypeScript |
| Python冒烟测试 | 1脚本 / 198行 | `scripts/smoke_test.py` | Python |
| 小程序测试 | 6测试文件 | `miniprogram/test/` | JavaScript |
| Java单元测试 | Gitignored（P0策略） | `backend/src/test/` | Java |

**注意**：Java单元测试源码按项目P0铁律从未提交到git仓库。

---

## 十四、关键文件索引

| 文件 | 用途 |
|------|------|
| [pom.xml](backend/pom.xml) | 后端依赖管理 |
| [application.yml](backend/src/main/resources/application.yml) | 后端主配置 |
| [application-prod.yml](backend/src/main/resources/application-prod.yml) | 生产环境配置 |
| [SecurityConfig.java](backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java) | 安全配置 |
| [AsyncConfig.java](backend/src/main/java/com/fashion/supplychain/config/AsyncConfig.java) | 异步线程池 |
| [DistributedLockService.java](backend/src/main/java/com/fashion/supplychain/common/lock/DistributedLockService.java) | 分布式锁 |
| [package.json](frontend/package.json) | 前端依赖管理 |
| [vite.config.ts](frontend/vite.config.ts) | Vite构建配置 |
| [design-system.css](frontend/src/styles/design-system.css) | 设计系统 |
| [nginx.conf.template](frontend/nginx.conf.template) | nginx部署配置 |
| [index.html](frontend/index.html) | SPA入口（含内联错误恢复） |
| [app.json](miniprogram/app.json) | 小程序页面配置 |
| [Dockerfile](backend/Dockerfile) | 后端Docker构建 |
| [ci.yml](.github/workflows/ci.yml) | CI/CD配置 |
| [copilot-instructions.md](.github/copilot-instructions.md) | 完整开发规范（3261行） |

---

> 本文档基于项目源码自动分析生成，最后更新：2026-05-10

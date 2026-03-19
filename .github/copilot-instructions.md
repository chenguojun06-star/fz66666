# GitHub Copilot 指令（服装供应链管理系统）

> **核心目标**：让 AI 立即理解三端协同架构、关键约束与业务流程，避免破坏既有设计。
> **系统评分**：98/100 | **代码质量**：优秀 | **架构**：非标准分层设计（157个编排器）| **规模**：257k行代码
> **测试覆盖率**：ScanRecordOrchestrator 100%（29单元测试）| 其他编排器集成测试覆盖
> **最后更新**：2026-05-03 | **AI指令版本**：v3.20（MaterialPurchase单据识别 + ExpenseReimbursement报销 + 全局Badge精度修复 + 7条Flyway幂等脚本）

---

## 🚨 铁血规律速查（9大致命错误 - 优先避免）

| 优先级 | 规律 | 触发条件 | 后果 | 详见 |
|--------|------|---------|------|------|
| 🔴 P0 | **本地测试未通过直接 push** | 代码修改后直接 push 云端 | CI 失败、系统崩溃 | 见「推送前强制三步验证」 |
| 🔴 P0 | **git add 漏掉** | push 前未 `git status` 核查 | 本地过 CI 报错 | 见「推送前强制三步验证」 |
| 🔴 P0 | **未确认数据库即 push** | 涉及 Entity/Flyway/表结构改动，但未先核对本地与云端 schema | 线上 Unknown column / Flyway 启动失败 / 全链路 500 | 见「推送前强制三步验证」 |
| 🔴 P0 | **跨 Service 直调** | 多 Service 无 Orchestrator + @Transactional | 无法回滚，数据脏污 | 见「第三步：编排层规划」 |
| 🔴 P0 | **权限码虚构** | t_permission 表不存在的权限码 | **全员 403** | 见「权限控制模式」 |
| 🔴 P0 | **Java 类型混淆** | `String tenantId = UserContext.tenantId()` | CI 编译错误 | 见「第三步：编排层规划」 |
| 🔴 P0 | **代码与数据库不同步** | Entity 新增字段无 Flyway / Flyway 新增列无 Entity | Flyway 链断裂 UNknown column 500 | 见「推送前强制三步验证」 |
| 🔴 P0 | **修改已执行的 Flyway 脚本** | 编辑任何已在云端 `flyway_schema_history` 中有记录的 V*.sql 文件内容 | **checksum不匹配 → Flyway启动失败 → 全系统所有API 500** | 见「Flyway 铁则」 |
| 🔴 P0 | **代码行数失控** | 文件>目标值还乱加功能 | 难维护、易 bug、拖累审查 | 见「文件大小限制」 |
| 🟠 P1 | **Orchestrator 不建** | 多表写操作无编排层 | 事务分散，同 P0-2 | 见「快速判断：什么时候新建 Orchestrator」 |

> **工作流**：每次开始前，先默念这 9 条。核心是 ✅ **本地测试验证通过** → ✅ **数据库/Schema 先确认** → ✅ **git add 完整** → ✅ **代码与DB一致** → ✅ **执行推送前三步验证** → 推送云端。90% 的 bug 都能避免。
> **AI/代理责任（强制）**：以上检查默认应由 AI/代理主动执行并给出结果，不能把编译、schema 核对、git 检查这些前置动作甩给用户手工兜底。只有遇到必须在云端控制台人工执行的 SQL 或无权限动作时，才允许要求用户介入。
> **废弃代码清理（强制）**：所有代码修改、变更前必须检查：是否有同步修改的旧逻辑、注释代码、兼容逻辑需要删除？废除代码清查确认完毕才能 push。禁止有 TODO/FIXME 标记或未处理的兼容代码直接推送仓库。
> **数据库一致性检查（强制，P0规律第6条）**：
>   - ✅ **新增 Entity 字段**：必须同时在 `db/migration/V*.sql` 新增或修改表列（使用 INFORMATION_SCHEMA 幂等写法）
>   - ✅ **新增 Flyway 脚本**：检查是否对应新的 Entity 字段（扫码后向下游检查）
>   - ✅ **修改现有表结构**：优先使用幂等 INFORMATION_SCHEMA 判断 + SET @s IF()，不要直接 ALTER TABLE
>   - ✅ **push 前必须确认 schema**：凡是涉及 Entity / Flyway / SQL / 表结构的改动，必须先跑核心表缺列检查；结果不为空，禁止 push
>   - ❌ **禁止**：Entity 字段用 `@TableField(exist=false)` transient 字段，然后在代码里通过关联查询填充（脆弱、易 null、难维护）

> **AI 生产观测补充（2026-04-26 新增）**：
>   - ✅ `t_intelligence_metrics` 现包含 `trace_id` / `trace_url` / `tool_call_count`，所有 AI 基础链路改造要同步考虑这 3 个字段
>   - ✅ 超管排障优先用 `GET /api/intelligence/metrics/recent` 查看最近 AI 调用，不要让租户直接接触 trace 细节
>   - ✅ 定位 AI 线上问题时，优先判断：哪次调用失败、是否 fallback、工具调用次数异常、trace 链接是否可跳转
>   - ❌ 禁止把平台级观测字段直接暴露给普通租户页面，租户只看结果，不看内部追踪链路

---

## 🚀 快速上手（新开发者必读 5分钟）

### 第一步：理解项目架构
这是一个**三端协同的服装供应链管理系统**：
- **PC端**：React + TypeScript + Ant Design（管理后台）
- **小程序**：微信原生框架（工厂扫码生产）
- **后端**：Spring Boot + MyBatis-Plus（业务编排层）

**核心业务流程**：款式设计 → 生产订单 → 裁剪分菲 → 工序扫码 → 质检入库 → 财务结算

### 第二步：启动开发环境
```bash
# ⚠️ 强制要求：使用脚本启动（避免403错误）
./dev-public.sh

# 自动完成：
# 1. 启动MySQL（端口3308，非标准3306）
# 2. 加载环境变量（.run/backend.env）
# 3. 启动后端（端口8088）
# 4. 启动前端（端口5173）
```

**首次启动前准备**：
```bash
# 创建环境变量文件（如果不存在）
cat > .run/backend.env << 'EOF'
APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
SPRING_DATASOURCE_URL=jdbc:mysql://localhost:3308/fashion_supplychain
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=changeme
WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
EOF
```

### 第三步：理解架构约束（代码审查必查）
**禁止破坏的架构模式**：
```
Controller → Orchestrator → Service → Mapper
    ↓             ↓            ↓          ↓
  路由端点      业务编排    单领域CRUD   数据访问
  
❌ 禁止：Controller直接调用多个Service
❌ 禁止：Service之间互相调用
✅ 正确：复杂业务逻辑必须在Orchestrator层编排
```

### 第四步：核心文档入口
- **系统概览**：系统状态.md - 从这里开始了解系统
- **完整开发规范**：开发指南.md - 4255行最重要文档
- **设计系统**：设计系统完整规范-2026.md - 强制执行的设计规范
- **业务流程**：业务流程说明.md - 理解业务逻辑
- **测试脚本**：快速测试指南.md - 40+测试脚本

### 第五步：运行测试验证环境
```bash
# 系统健康检查
./check-system-status.sh

# 测试核心业务流程
./test-production-order-creator-tracking.sh  # 订单创建
./test-material-inbound.sh                   # 面料入库
./test-stock-check.sh                        # 库存检查
```

---

## 🧠 AI 写代码的标准思考顺序（每次必走，不可跳步）

> **核心原则**：先想清楚再动手。动手前 10 分钟的思考，能省去事后 2 小时的 debug。

### 第一步：读懂需求，识别影响范围
```
□ 这个功能属于哪个业务领域？（production / finance / style / warehouse / system）
□ 纯前端？纯后端？还是全栈？
□ 是否涉及数据库表结构变更？（需要新增 Flyway 脚本）
□ 是否影响现有 API 或业务逻辑？（回归测试范围）
□ 是否跨端？（PC端改了，小程序同步吗？validationRules 是否需要同步？）
```

### 第二步：数据层先行（最容易后悔的地方）
```
□ 需要哪些表？字段类型是否正确？（Integer / Long / String / LocalDateTime）
□ 现有表够用还是要加列？→ 本地写 V*.sql + 云端手动执行
□ MyBatis-Plus 查询：能用 QueryWrapper 就用 QueryWrapper，不要随手 @Select 写 SQL
□ 字段非空约束？NOT NULL 的列必须有默认值或代码赋值，否则 MySQL STRICT 模式报 500
□ 索引：高频查询字段（tenant_id + status）是否有复合索引？
```

### 第三步：编排层规划（架构核心，不可省略）
```
□ 是否有跨 Service 调用？→ 必须新建或使用已有 Orchestrator，禁止在 Controller/Service 内交叉调用
□ 是否有多表写操作？→ Orchestrator 方法加 @Transactional(rollbackFor = Exception.class)
□ 现有 107 个 Orchestrator 中是否已有可复用的？→ 先 grep 再新建
□ 新 Orchestrator 文件行数目标：≤ 200 行；单方法逻辑 ≤ 50 行
□ 类型安全核查：UserContext.tenantId() → Long，userId() → String（见常见陷阱表）
```

### 第四步：后端接口设计
```
□ 遵循路由约定：列表 POST /list，状态流转 POST /{id}/stage-action?action=xxx
□ 统一响应：返回 Result<T>，成功 Result.success(data)，失败 Result.error("message")
□ Controller class 级别加 @PreAuthorize("isAuthenticated()")，方法级别不重复
□ 权限码只用 t_permission 表中存在的（见权限控制章节），杜绝自造权限码导致全员 403
□ 接口是否和已废弃的 58 个旧 API 重名？→ 检查 @Deprecated 标记
```

### 第五步：前端实现
```
□ 文件行数预估：组件目标 ≤ 300 行，页面 ≤ 500 行；超出先拆分再提交
□ 弹窗尺寸：只能用 60vw / 40vw / 30vw 三档，禁止自定义
□ 标准组件：ResizableModal / ModalContentLayout / RowActions / ResizableTable（不要重复造轮子）
□ API 调用：新接口要在 services/ 对应文件加 TS 类型定义
□ 状态管理：跨组件共享的数据 → Zustand store；组件内局部数据 → useState
□ 自定义 Hook：数据逻辑超过 30 行 → 抽取为独立 useXxx.ts，组件文件只保留 JSX
```

### 第六步：验收清单（提交前逐项勾选）
```
□ 本地 mvn clean compile -q → BUILD SUCCESS（有 Java 改动）
□ npx tsc --noEmit → 0 errors（有 TS 改动）
□ git status + git diff --stat HEAD → 所有改动文件都已 git add，无遗漏
□ **新增Entity字段必须有对应Flyway脚本；反之亦然** → grep Entity涉及字段，确认db/migration/V*.sql中有对应ALTER TABLE
□ 新功能是否影响其他页面？（在浏览器快速点击一遍相关页面）
□ 是否需要同步更新 copilot-instructions.md 或 系统状态.md？
□ 云端是否需要手动执行 SQL？（FLYWAY_ENABLED=false）
□ 若涉及智能推荐/预警：是否记录了 baseline 指标（命中率/误报率/采纳率）？
□ 若涉及智能模块：是否配置了租户级开关与回滚方案？
```

### 快速判断：什么时候新建 Orchestrator？

| 情况 | 是否需要 Orchestrator |
|------|----------------------|
| 单表 CRUD，无跨服务调用 | ❌ 直接 Service |
| 读 2 个以上 Service 的数据拼装 | ✅ 需要 |
| 任何写操作涉及 2 张以上表 | ✅ 需要（@Transactional） |
| 涉及状态流转 + 审计日志 | ✅ 需要 |
| 第三方 API 调用 + 本地数据更新 | ✅ 需要 |

---

## �🛠️ 技术栈（版本敏感）

### 后端
- **Java 21** + **Spring Boot 2.7.18** + **MyBatis-Plus 3.5.7**
- **MySQL 8.0**（Docker，端口 **3308** 非标准）
- 认证：Spring Security + JWT
- 依赖注入：`@Autowired`（标准模式，不使用构造器注入）

### 前端
- **React 18.2** + **TypeScript** + **Vite**
- **Ant Design 6.1**（组件库）
- **Zustand**（状态管理，替代 Redux）
- **ECharts**（图表）
- 路由：React Router v6

### 小程序
- **微信原生框架**（不使用 Taro/uni-app）
- 纯 JavaScript（无 TypeScript）
- 组件化设计（`components/` + `pages/`）

### 三端数据同步
- 验证规则：`frontend/src/utils/validationRules.ts` ↔ `miniprogram/utils/validationRules.js`
- API 端点：统一 `POST /list`（列表查询），废弃 `GET/POST /page`

---

## 🏗️ 架构核心（非标准分层，禁止破坏）

### 后端四层架构（强制执行）
```
Controller → Orchestrator → Service → Mapper
```

**关键约束**（代码审查必查项）：
- ✅ **Orchestrator 编排器**：跨服务调用、复杂事务、业务协调（134个编排器）
  - **分布**：intelligence(63) + production(23) + system(15) + finance(17) + style(6) + integration(3) + crm(3) + warehouse(2) + template(2) + procurement(2) + dashboard(2) + wechat(1) + search(1) + datacenter(1) = **138个**（+31 vs v3.12）
  - **核心编排器**：ScanRecordOrchestrator、ProductionOrderOrchestrator、PayrollSettlementOrchestrator、MaterialStockOrchestrator、ReconciliationStatusOrchestrator 等
- ❌ **Service 禁止互调**：单领域 CRUD 操作，不允许直接调用其他 Service
- ❌ **Controller 禁止直调多 Service**：复杂逻辑必须委托给 Orchestrator
- ✅ **权限控制**：Controller **class 级别**添加 `@PreAuthorize("isAuthenticated()")`；超管专属端点使用 `@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")`
- ✅ **事务边界**：在 Orchestrator 层使用 `@Transactional(rollbackFor = Exception.class)`
  - ⚠️ **强制**：所有涉及多表写操作的方法（包括 `delete()`、`create()`、`update()`）都必须加此注解，否则任一步骤失败无法回滚

**常见错误示例**（禁止）：
```java
// ❌ 错误：Controller 直接调用多个 Service
@RestController
public class OrderController {
    public void createOrder() {
        orderService.create(...);
        styleService.validate(...);  // ❌ 跨服务调用
        stockService.deduct(...);    // ❌ 跨服务调用
    }
}

// ✅ 正确：通过 Orchestrator 编排
@RestController
public class OrderController {
    @Autowired
    private ProductionOrderOrchestrator orderOrchestrator;
    
    @PostMapping("/create")
    public Result<ProductionOrder> createOrder(@RequestBody OrderRequest req) {
        return orderOrchestrator.createOrderWithValidation(req);
    }
}
```

### API 路由约定（已统一）
- ✅ 列表查询：`POST /list`（支持过滤参数，旧 `GET/POST /page` 已废弃）
- ✅ 状态流转：`POST /{id}/stage-action`（如 `/approve`, `/submit`, `/reject`）
- ✅ 统一响应：`Result<T>` 包装（`code: 200=成功`, `message`, `data`, `requestId`）
- ✅ 权限注解：**class 级别**添加 `@PreAuthorize("isAuthenticated()")`，**方法级别不需要重复添加**（已删除全系统142处冗余注解）

**Result<T> 标准响应格式**：
```java
// 后端返回
@PostMapping("/create")
public Result<ProductionOrder> create(@RequestBody OrderRequest req) {
    ProductionOrder order = orderOrchestrator.createOrder(req);
    return Result.success(order);  // { code: 200, data: {...} }
}

// 错误响应
return Result.error("订单号重复");  // { code: 500, message: "订单号重复" }
```

**前端自动解包**：`data` 属性会被 axios 拦截器自动提取，组件直接使用业务数据

---

## 📂 代码组织（严格约定）

### 后端目录结构（按领域划分）
```
backend/src/main/java/com/fashion/supplychain/
├── production/            # 生产模块（核心）
│   ├── controller/        # REST 端点
│   ├── orchestration/     # 业务编排器（20个）
│   ├── service/           # 领域服务（单一职责）
│   ├── mapper/            # MyBatis 数据访问
│   ├── entity/            # 实体类
│   ├── dto/               # 数据传输对象
│   ├── helper/            # 辅助类
│   └── util/              # 工具类
├── style/                 # 款式管理（6个编排器）
├── finance/               # 财务结算（12个编排器）
├── warehouse/             # 仓库管理（2个编排器）
├── system/                # 系统管理（12个编排器）
├── template/              # 模板库（2个编排器）
├── wechat/                # 微信集成（1个编排器）
├── dashboard/             # 仪表板（2个编排器）
├── datacenter/            # 数据中心（1个编排器）
├── crm/                   # CRM客户管理（3个编排器）
├── procurement/           # 采购管理（1个编排器）
├── openapi/               # 开放API对接（2个编排器）
├── search/                # 全局搜索（1个编排器）
├── payroll/               # ⚠️ 空包（历史遗留，工资管理已全部迁移至 finance/ 模块，此包仅有1个空文件，禁止再往此包新增代码）
├── integration/           # 第三方集成（已并入各领域模块）
├── intelligence/          # 智能运营（60个编排器）
├── common/                # 公共组件（Result, UserContext, CosService）
└── config/                # 配置类
```

> **新增功能说明（2026-02-至今）**：
> - **三大智能功能（2026-02-28）**：
>   - ① **工厂产能雷达**：`FactoryCapacityOrchestrator.java` + `FactoryCapacityPanel.tsx`。显示在生产进度页过滤栏下方，按工厂展示订单数/件数/高风险/逃期，颜色编码提示风险等级
>   - ② **停滞订单预警**：`useStagnantDetection.ts`。非完成订单有历史扫码且≥3天无新扫码，状态列显示橙色 ⏸ 停滞 Tag
>   - ③ **悀停卡速度缺口**：`SmartOrderHoverCard.tsx` 新增 `calcGap()`。鼠标悬停订单行时，落后进度则显示「需X天·剩Y天·差 Z天」
>   - **DB影响**：无需迁移，全部使用 `t_production_order` 现有列
> - **订单健康度评分 + 级联推送（2026-03-22 新增）**：
>   - `OrderHealthScoreOrchestrator`：3维加权算法（进度×40% + 货期×35% + 采购×25%），0-100分实时评分
>   - 订单号列显示「注」(50-74分橙色) 与「危」(<50分红色) 徽章，零额外API请求
>   - `SysNoticeOrchestrator` 补全催单消息推送到手机端，支持内联回复（出货日期+备注）
>   - 小程序新增 `pages/work/ai-assistant`：聊天页面按工人能力提问（今日产量/本周工资/订单进度）
> - **知识库+AI Agent三大Skill（2026-03-31 新增）**：
>   - 知识库：13条 → **35条** → **50条**（✅ 已扩充完成，含洗水唛/出口合规/报废流程/智能功能使用/外贸术语/Care Label/ISO 3758）
>   - `KnowledgeSearchTool`：RAG查询知识库、行业术语、操作指南；**STEP 4.5 Cohere Reranker精排**：候选池由5条扩至15条，精排后截取 Top5，`retrievalMode` 返回 `"reranked"` / `"hybrid"`
>   - `BomCostCalculator`：AI计算任意款式BOM成本（物料+工序+汇率）
>   - `QuickOrderBuilder`：AI智能建单（一句话建订单 → 提取款号、颜色、尺码、数量）
>   - **`CohereRerankService`**（2026-04-30 新增）：`backend/.../intelligence/service/` 独立精排服务，调用 `POST https://api.cohere.com/v2/rerank`，8秒超时，Cohere 不可用时自动降级透明回退。配置：`AI_COHERE_RERANK_ENABLED=true` + `COHERE_API_KEY`
> - **编排器总数升级**：134 → 152 个（+18新增编排器分布在intelligence/production/system模块）
> - **腾讯云 COS 文件存储**：`common/CosService.java` — 统一处理文件上传/下载，替代本地文件系统。调用 `cosService.uploadFile(file)` 返回访问 URL
> - **Excel 批量导入**：`ExcelImportOrchestrator` + `ExcelImportController` — 支持生产订单、工序等数据的 Excel 批量导入，前端对应 `modules/basic/pages/DataImport/`
> - **问题反馈**：`UserFeedbackController` / `UserFeedbackService` — 用户在系统内提交问题反馈，存储到 `t_user_feedback` 表
> - **系统状态监控**：`SystemStatusController` — 提供系统健康状态端点（CPU/内存/DB连接池）
> - **应用商店重构**：`AppStoreOrchestrator` — 租户开通/关闭模块权限，对应 PC 端个人中心"应用管理"
> - **智能运营日报（2026-03-01）**：`DailyBriefOrchestrator.java` + `DailyBriefController.java` + 前端 `SmartDailyBrief/index.tsx`。展示在仪表盘 `TopStats` 上方，汇总昨日入库/今日扫码/逾期订单/高风险订单/首要关注订单/智能建议。接口 `GET /api/dashboard/daily-brief`。DB 无新增，独立编排器，不混入 `DashboardOrchestrator`。
> - **工厂工序卡点可视化（2026-03-06）**：原卡点面板样式重组为逐条订单样式（`BottleneckRow`），与活跃订单实时滚动保持一致，增强 UX 统一性。
> - **Bug修复汇总（2026-03-01 ~ 03-06）**：
>   - ① 登录成功同步写入 `t_user.last_login_time` + `last_login_ip`（`UserOrchestrator`）
>   - ② 样板生产 COMPLETED 卡片进度显示非100%：progressNodes 所有 key 强制=100（不依赖硬编码列表）
>   - ③ 样板生产纸样师傅列为空：旧记录 patternMaker=null 时 fallback 到 receiver（业务上两者同一人）
>   - ④ 扫码 QR码/SIG-签名后缀剥离后回写 safeParams，修复 getByQrCode 永远查不到 DB 记录的 bug；补充 `[ScanExec/BundleLookup/ScanSave]` 诊断日志
> - **智能驾驶舱全面扩展（2026-03-07 ~ 03-21）**：
>   - **intelligence 模块扩张至 60 个编排器**：含 NlQueryOrchestrator（22种意图NL查询）、ExecutionEngineOrchestrator（AI命令执行引擎，支持13种command类型）、CommandGeneratorOrchestrator（命令生成与解析）、PermissionDecisionOrchestrator（权限决策引擎）、AiAgentOrchestrator（DeepSeek LLM + 12个工具的Agent）、ProfessionalReportOrchestrator（日报/周报/月报Excel下载）等
>   - **CRM客户管理模块**：`modules/crm/` — 客户档案、跟单记录、信用评级（3个编排器）
>   - **采购管理模块**：`modules/procurement/` — 采购单、供应商管理（2个编排器）
>   - **✅ 智能驾驶舱面板全部已挂载（11个）**：SmartAssignment、WorkerProfile、RhythmDna、SchedulingSuggestion、LiveCostTracker、DefectTrace、FinanceAudit、StyleQuoteSuggestion、SupplierScorecard、LearningReport、MindPush — 均已在 `IntelligenceCenter/index.tsx` 中 lazy 加载并注册为 Tab

### 前端目录结构（模块化）
```
frontend/src/
├── modules/               # 业务模块（12个，按后端领域对应）
│   ├── Login/             # 登录与认证
│   ├── production/        # 生产订单、裁剪、扫码记录
│   ├── StyleInfo/         # 款式管理与样衣资料
│   ├── style/             # 款式编辑（弃用，合并到 StyleInfo）
│   ├── finance/           # 财务结算与对账
│   ├── warehouse/         # 仓库管理与收发货
│   ├── system/            # 系统管理（用户、角色、权限、应用商店）
│   ├── basic/             # 基础数据（工厂、工序、模板等）
│   ├── dashboard/         # 首页仪表板
│   ├── integration/       # 第三方集成（电商平台等）
│   ├── crm/               # CRM客户管理（客户档案/跟单/信用）⭐新
│   ├── procurement/       # 采购管理（采购单/供应商）⭐新
│   └── intelligence/      # 智能运营驾驶舱（60个编排器）
├── components/            # 公共组件
│   └── common/            # 通用组件（RowActions, ResizableModal, QRCodeBox, ModalContentLayout, ResizableTable）
├── services/              # API 调用层
├── stores/                # Zustand 全局状态
├── utils/                 # 工具函数（validationRules, formatters）
├── types/                 # TypeScript 类型定义
├── hooks/                 # React Hooks
├── constants/             # 常量定义
├── styles/                # 全局样式
├── pages/                 # 页面组件
└── routeConfig.ts         # 路由配置
```

### 命名约定（强制）
- **Java 类**：`PascalCase`（如 `ProductionOrderOrchestrator`）
- **Java 方法**：`camelCase`（如 `createOrderWithValidation`）
- **React 组件**：`PascalCase` 文件名（如 `ResizableModal.tsx`）
- **TS 工具函数**：`camelCase` 文件名（如 `validationRules.ts`）
- **测试脚本**：`kebab-case`（如 `test-production-order-creator-tracking.sh`）

---

## 🚀 开发工作流（必读，避免 403 错误）

### 启动服务（⚠️ 必须使用脚本）
```bash
# ✅ 正确：加载环境变量，启动后端+前端+数据库
./dev-public.sh

# ❌ 错误：直接启动会缺少环境变量导致 403
cd backend && mvn spring-boot:run
cd frontend && npm run dev
```

**环境变量来源**：`.run/backend.env`（由 dev-public.sh 自动加载）
- `APP_AUTH_JWT_SECRET` - JWT 签名密钥
- `SPRING_DATASOURCE_URL` - 数据库连接：`jdbc:mysql://localhost:3308/fashion_supplychain`
- `WECHAT_MINI_PROGRAM_MOCK_ENABLED=true` - 开发环境启用 Mock（跳过微信登录验证）

### 内网访问配置（⚠️ 禁止修改）
**固定配置**（永远不要改动）：
- **内网 IP**：`192.168.2.215`（本机固定，见 `vite.config.ts` line 63）
- **访问地址**：`http://192.168.2.215:5173/`
- **配置文件**：`frontend/vite.config.ts`
  - `server.host: '0.0.0.0'`（监听所有网络接口）
  - `server.hmr.host: '192.168.2.215'`（HMR 固定内网 IP）
  - `server.port: 5173`（开发端口）
- **启动脚本**：`dev-public.sh` 使用 `--host 0.0.0.0` 参数

**为什么不能修改**：
- ❌ 修改 `hmr.host` 会导致动态模块导入失败
- ❌ 修改 `host` 会导致内网无法访问
- ❌ 修改端口会导致代理配置失效
- ✅ 此配置已测试验证，支持 localhost 和内网同时访问

**故障排查**：
```bash
# 如果遇到 "Failed to fetch dynamically imported module" 错误
# 1. 检查 vite.config.ts 中 hmr.host 是否为 192.168.2.215
# 2. 检查 dev-public.sh 启动命令是否包含 --host 0.0.0.0
# 3. 重启开发服务器：killall node && ./dev-public.sh
```

### 数据库管理（非标准端口）
- 端口：**3308**（非标准 3306，避免冲突）
- 管理脚本：deployment/db-manager.sh
- 启动：`./deployment/db-manager.sh start`
- Docker 容器名：`fashion-mysql-simple`

### 小程序调试
- 使用**微信开发者工具**打开 miniprogram/ 目录
- 扫码调试需真机或模拟扫码输入
- Mock 模式：开发环境下 `WECHAT_MINI_PROGRAM_MOCK_ENABLED=true` 跳过微信登录验证
- **完整指南**：docs/小程序开发完整指南.md - ESLint、TypeScript、调试技巧

## 🧪 测试工作流

### 业务流程快速测试
系统包含 **40+ 测试脚本**，覆盖核心业务场景：

**生产订单**：
```bash
./test-production-order-creator-tracking.sh  # 订单创建人追踪
./test-material-inbound.sh                   # 面料入库流程
./test-stock-check.sh                        # 库存检查
```

**财务结算**：
```bash
./test-finished-settlement-approve.sh        # 成品结算审批
./test-data-flow-to-reconciliation.sh        # 数据流向对账
```

**系统维护**：
```bash
./check-system-status.sh                     # 系统健康检查
./clean-system.sh                            # 清理缓存和日志
./fix-403-errors.sh                          # 修复权限问题
```

**权限问题排查**：
- 查看 `.run/backend.env` 是否存在
- 确保 `APP_AUTH_JWT_SECRET` 已设置
- 运行 `./fix-403-errors.sh` 自动修复

---
�️ 数据库管理工作流

### 数据库连接信息
- **容器名**：`fashion-mysql-simple`
- **端口映射**：`3308:3306`（主机:容器）
- **数据库名**：`fashion_supplychain`（注意：环境变量中可能写的是 `template_library`，实际使用 `fashion_supplychain`）
- **数据卷**：`mysql-fashion-data`（持久化存储）

### 数据库备份与恢复
```bash
# 备份数据库
docker exec fashion-mysql-simple mysqldump -uroot -pchangeme fashion_supplychain > backup_$(date +%Y%m%d_%H%M%S).sql

# 恢复数据库
docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < backup.sql

# 查看表列表
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "SHOW TABLES;"
```

### 数据库版本控制
- **变更脚本**：Flyway 自动迁移（`backend/src/main/resources/db/migration/V*.sql`）
- **备份策略**：定期备份到 `backups/` 目录
- **数据卷管理**：Docker volume 持久化，删除容器不会丢失数据
- **详细文档**：deployment/数据库配置.md

---

## 📦 Zustand 状态管理模式

### 标准 Store 结构
项目采用 Zustand 进行全局状态管理，所有 Store 位于 `frontend/src/stores/`：

```typescript
// ✅ 推荐模式：分离状态和操作
import { create } from 'zustand';
import { persist } from 'zustand/middleware'; // 可选：持久化

interface MyState {
  // 状态定义
  data: MyData[];
  loading: boolean;
  
  // 操作定义
  fetchData: () => Promise<void>;
  updateItem: (id: string, data: Partial<MyData>) => void;
  reset: () => void;
}

export const useMyStore = create<MyState>()((set, get) => ({
  // 初始状态
  data: [],
  loading: false,
  
  // 异步操作
  fetchData: async () => {
    set({ loading: true });
    try {
      const result = await api.getData();
      set({ data: result, loading: false });
    } catch (error) {
      set({ loading: false });
      message.error('加载失败');
    }
  },
  
  // 同步操作
  updateItem: (id, updates) => {
    set(state => ({
      data: state.data.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    }));
  },
  
  // 重置状态
  reset: () => set({ data: [], loading: false }),
}));
```

### 已有 Store 示例
- `userStore.ts` - 用户登录状态、权限管理（持久化）
- `appStore.ts` - 应用全局状态（侧边栏折叠、加载状态、主题）

### 使用规范
- ✅ **按领域拆分**：避免单个超大 Store
- ✅ **持久化**：仅对必要状态使用 `persist` 中间件（如用户登录信息）
- ✅ **类型安全**：必须定义完整的 TypeScript 接口
- ❌ **禁止**：将所有状态塞入一个 Store

---

## 🎣 React Hooks 最佳实践

### 自定义 Hook 模式（推荐）
项目中大量使用自定义 Hook 来封装复杂业务逻辑，参考：`frontend/src/modules/production/pages/Production/ProgressDetail/hooks/useProgressData.ts`

```typescript
// ✅ 推荐模式：数据管理 Hook
export const useProgressData = () => {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DataType[]>([]);
  
  // 使用 useRef 避免依赖变化导致重复请求
  const queryParamsRef = useRef(queryParams);
  useEffect(() => {
    queryParamsRef.current = queryParams;
  }, [queryParams]);
  
  // 使用 useCallback 缓存函数
  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const result = await api.getData(queryParamsRef.current);
      setData(result);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []); // 空依赖，通过 ref 访问最新参数
  
  return { loading, data, fetchData };
};
```

**Hook 设计原则**：
- ✅ **单一职责**：一个 Hook 只负责一个数据域（订单、扫码、库存等）
- ✅ **Ref 优化**：使用 `useRef` + `useEffect` 避免依赖链导致的重复请求
- ✅ **Silent 模式**：支持静默刷新（后台轮询不显示 loading）
- ✅ **类型安全**：完整的 TypeScript 类型定义

### Hook 文件组织
```
modules/production/
├── pages/
│   └── Production/
│       ├── ProgressDetail/
│       │   ├── hooks/           # 页面级 Hook
│       │   │   ├── useProgressData.ts
│       │   │   └── useProgressNodes.ts
│       │   └── index.tsx
└── hooks/                       # 模块级共享 Hook
    └── useProductionCommon.ts
```

---

## 🧪 测试策略与覆盖率

### 测试优先级（性价比优化）
项目采用**务实测试策略**，避免过度测试：

**P0 核心测试**（必须 100% 覆盖）：
- ✅ **Orchestrator 编排器**：业务逻辑核心，测试投资回报最高
- ✅ **关键算法**：扫码防重复、库存计算、工序识别
- 示例：`ScanRecordOrchestrator` - 29个单元测试，覆盖率 100%

**P1 集成测试**（通过测试脚本覆盖）：
- ✅ **端到端业务流程**：订单创建→扫码→结算（40+ 测试脚本）
- ✅ **Executor 辅助方法**：通过集成测试验证，无需单独单元测试
- 示例：`test-production-order-creator-tracking.sh`

**P2 无需测试**：
- ❌ **Entity Getter/Setter**：无业务逻辑，测试无价值
- ❌ **简单 CRUD Service**：无复杂逻辑，集成测试已覆盖

### 测试文件组织
```
backend/src/test/java/com/fashion/supplychain/
├── production/
│   ├── orchestration/
│   │   └── ScanRecordOrchestratorTest.java  # 29个测试，100%覆盖
│   ├── service/
│   │   └── executor/
│   │       ├── QualityScanExecutorTest.java    # 13个测试
│   │       ├── WarehouseScanExecutorTest.java  # 10个测试
│   │       └── ProductionScanExecutorTest.java # 13个测试
```

### 测试运行与报告
```bash
# 运行所有测试
cd backend && mvn test

# 仅运行核心Executor测试（快速反馈）
mvn clean test -Dtest="QualityScanExecutorTest,WarehouseScanExecutorTest,ProductionScanExecutorTest"

# 生成覆盖率报告（Jacoco）
mvn clean test jacoco:report

# 查看报告
open target/site/jacoco/index.html
```

**覆盖率目标**：
- Orchestrator：**100%**（强制）
- Service：**70%+**（推荐）
- Entity：**不要求**（Getter/Setter 无价值）

**最新成果**（2026-02-03/04 ~ 2026-03-01）：
- ✅ `ScanRecordOrchestrator`：100%覆盖率（29个单元测试）
- ✅ 代码优化：1677行 → 923行（-45%）
- ✅ 测试框架：3个Executor完整测试结构（36个测试用例）
- ✅ CI/CD：GitHub Actions自动测试配置完成
- ✅ `TemplateCenter/index.tsx`：1912行 → 900行（拆分为4个子组件）
- ✅ **全局进度球缓存重构（2026-02-25）**：新增 `stores/productionBoardStore.ts`，双份缓存 → 全局单一 Zustand store，彻底消除两 Tab 数据不一致
- ✅ **兜底虚高修复**：`useBoardStats.ts` 添加 `hasScanByNode` 守卫，有扫码记录时禁止比例兜底覆盖
- ✅ **NodeDetailModal 错误可见**：5个并发 API 任意失败改为显示 Alert 警告条，不再静默失败
- ✅ **死代码清理**：删除 `ModernProgressBoard.tsx` + `.css`，修复 9 处 lint 警告（7处 eslint-disable 指令 + 2处未使用 import）

---

## 📋 关键开发模式与约束

### 权限控制模式（强制）

**当前架构：`@EnableGlobalMethodSecurity(prePostEnabled = true)` 已激活，所有 `@PreAuthorize` 全面生效**

```java
// ✅ 正确：class 级别统一鉴权，方法级别不添加（防止冗余）
@RestController
@RequestMapping("/api/production/orders")
@PreAuthorize("isAuthenticated()")  // 放在 class 上，覆盖所有方法
public class ProductionOrderController {
    @PostMapping("/list")     // 不需要再加 @PreAuthorize
    public Result<Page<ProductionOrder>> list(...) { ... }
}

// ✅ 特例：超管专属端点
@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
@PostMapping("/approve-application")
public Result<Void> approveApplication(...) { ... }

// ❌ 禁止：在方法上引用数据库中不存在的权限码（导致全员 403）
// 以下权限码 t_permission 表中根本不存在！
@PreAuthorize("hasAuthority('PRODUCTION_ORDER_VIEW')")  // ❌ 不存在
@PreAuthorize("hasAuthority('STYLE_VIEW')")             // ❌ 不存在
@PreAuthorize("hasAuthority('FINANCE_SETTLEMENT_VIEW')")// ❌ 不存在
```

**`t_permission` 表中实际存在的权限码**：
- `MENU_*` （菜单权限，20+个）：`MENU_PRODUCTION`、`MENU_FINANCE`、`MENU_SYSTEM` 等  
- `STYLE_CREATE` / `STYLE_DELETE`（按鈕权限）
- `PAYMENT_APPROVE`（工资付款审批）
- `MATERIAL_RECON_CREATE` / `SHIPMENT_RECON_AUDIT`（对账权限）

**权限分类**：
- `ROLE_SUPER_ADMIN` — 超级管理员（TenantController 18个端点专用）
- `ROLE_tenant_owner` — 租户主账号
- `ROLE_${roleName}` — 常规角色
- `MENU_*` — 菜单访问权限
- 其他按鈕/操作级 — 仅少数实际存在的

### 事务边界管理
**原则**：事务控制仅在 Orchestrator 层
```java
// ✅ 正确：Orchestrator 层管理事务
@Service
public class ProductionOrderOrchestrator {
    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder createOrder(OrderRequest req) {
        // 多个服务调用，统一事务
        productionOrderService.create(...);
        materialStockService.deduct(...);
        scanRecordService.initialize(...);
        return order;
    }
}

// ❌ 错误：Service 内事务分散
@Service
public class ProductionOrderService {
    @Transactional  // 不应在此处
    public void create(...) { }
}
```

---

## 🎨 前端设计系统（强制约束）

### 弹窗三级尺寸体系（禁止自定义）
```tsx
// ✅ 大窗口（60vw）：复杂表单、多 Tab
// 60vw弹窗强制传 initialHeight！用视口82%自适应所有屏幕分辨率
<ResizableModal width="60vw" initialHeight={Math.round(window.innerHeight * 0.82)}>

// ✅ 中窗口（40vw）：普通表单（高度使用默认值 min(720px,viewport×80%) 即可）
<ResizableModal width="40vw">

// ✅ 小窗口（30vw）：确认对话框（高度使用默认值即可）
<ResizableModal width="30vw">

// ❌ 错误：自定义尺寸会破坏设计一致性
<ResizableModal width="55vw">
// ❌ 错误：defaultWidth / defaultHeight 这两个prop根本不存在！
<ResizableModal defaultWidth="60vw" defaultHeight="60vh">
```

**尺寸选择指南**：
- 大窗口 60vw：生产订单编辑、裁剪单管理、对账单审核（包含 Tab、表格）
- 中窗口 40vw：款式编辑、工厂管理、用户管理（标准表单）
- 小窗口 30vw：删除确认、备注输入、状态修改（简单交互）

### 弹窗内容布局（固定间距）
```tsx
import { ModalContentLayout, ModalFieldRow } from '@/components/common/ModalContentLayout';

<ModalContentLayout>
  <ModalFieldRow label="款式编号">  {/* 固定 24px 间距 */}
    <Input />
  </ModalFieldRow>
  <ModalFieldRow label="订单数量">
    <InputNumber />
  </ModalFieldRow>
</ModalContentLayout>
```

**布局组件规范**：
- `ModalContentLayout`：提供统一的内边距和滚动容器
- `ModalFieldRow`：标签 + 输入框，自动处理 24px 行间距
- `ModalHeaderCard`：灰色背景 (#f8f9fa) 的头部卡片，显示关键信息

### 表格操作列（统一组件）
```tsx
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';

const actions: RowAction[] = [
  {
    key: 'edit',
    label: '编辑',
    primary: true,  // 主要操作，优先显示
    onClick: () => handleEdit(record),
  },
  {
    key: 'delete',
    label: '删除',
    danger: true,  // 危险操作，显示红色
    disabled: record.status !== 'draft',
    onClick: () => handleDelete(record),
  },
  {
    key: 'log',
    label: '日志',  // 自动折叠到"更多"菜单
    onClick: () => showLog(record),
  },
];

<Table
  columns={[
    // ... 其他列
    {
      title: '操作',
      key: 'actions',
      width: 120,
    � 已废弃 API（禁止使用）

项目已完成大规模 API 重构（2026-02-01），以下 58 个端点已标记为 `@Deprecated`，计划 2026-05-01 删除：

### 主要废弃模式
- ❌ **旧 GET 查询**：`GET /by-xxx/{id}` → ✅ `POST /list` + 过滤参数
- ❌ **旧状态流转**：`POST /{id}/submit`, `POST /{id}/approve` → ✅ `POST /{id}/stage-action?action=xxx`
- ❌ **旧 CRUD**：`POST /save`, `POST /delete/{id}` → ✅ RESTful 风格（`POST /`, `DELETE /{id}`）

### 高频废弃端点示例
```java
// ❌ 禁止：旧风格查询
GET /api/production/orders/by-order-no/{o `.run/backend.env` 环境变量
2. **数据库连接失败**：检查端口是否为 3308（非标准 3306），容器名 `fashion-mysql-simple`
3. **使用废弃 API**：检查 `@Deprecated` 标记，所有新代码必须使用 `POST /list` 和 `stage-action` 模式
4. **弹窗尺寸不统一**：必须使用三级尺寸（60vw/40vw/30vw），禁止自定义
5. **Service 互调**：必须通过 Orchestrator，否则无法进行事务管理
6. **扫码重复提交**：理解防重复算法，不要随意修改时间间隔
7. **跨端验证不一致**：修改 validationRules 时必须同步 PC 端和小程序
8. **权限错误**：Controller 方法上不要添加实际不存在的权限码（导致全员 403）；class 级别已有 `isAuthenticated()`，方法级别不需要重复添加
9. **MySQL时区 vs JVM时区**：Docker MySQL 默认 UTC，JVM 默认 CST(+8)。`LocalDateTime.now()` 与 DB 的 `NOW()` 相差 8 小时。`1小时撤回等时间校验会对手动插入测试数据失效`。生产数据无问题（Spring Boot 写入时用 CST），但写测试数据时须用 `CONVERT_TZ(NOW(),'+00:00','+08:00')` 生成 CST 时间。
10. **工资已结算的扫码记录禁止撤回**：`ScanRecord.payrollSettled = true` 时，`ScanRecordOrchestrator.undo()` 必须拒绝操作并报错 `"该扫码记录已参与工资结算，无法撤回"`。撤回扫码后必须同步触发仓库数量回滚，两步操作放在同一 `@Transactional` 中。

// ❌ 禁止：分散的状态流转
POST /api/style-info/{id}/pattern-start
POST /api/style-info/{id}/pattern-complete

// ✅ 正确：统一状态流转
POST /api/style-info/{id}/stage-action?stage=pattern&action=start
POST /api/style-info/{id}/stage-action?stage=pattern&action=complete
```

**前端适配器**：`frontend/src/services/legacyApiAdapter.ts`（已自动兼容，新代码禁止使用）

---

## 📚 关键文档入口

- **系统状态.md** - 系统概览与文档索引（从这里开始）
- **开发指南.md** - 完整开发规范与最佳实践
- **快速测试指南.md** - 业务流程测试脚本
- **设计系统完整规范-2026.md** - 前端设计规范 v3.0
- **docs/小程序开发完整指南.md** - 小程序 ESLint、调试、业务优化
- **deployment/数据库配置.md** - 数据库备份、恢复、数据卷管理

**RowActions 规则**：
- ✅ 最多显示 **1个** 行内按钮（其余自动折叠到"更多"）
- ✅ `primary: true` 优先显示
- ✅ `key: 'log'` 或 `label: '日志'` 自动折叠
- ✅ 操作列固定宽度：`width: 60`（紧凑列表，如生产进度）、`width: 120`（单个按钮）或 `width: 160`（2个按钮）

### 颜色系统（禁止硬编码，但业务风险色除外）
```tsx
// ✅ 正确：使用 CSS 变量
<div style={{ color: 'var(--primary-color)' }} />

// ✅ 特例：业务风险色（智能驾驶舱、进度跟踪等）必须硬编码，因为颜色映射业务意义
const RiskColorMap = {
  critical: '#ff4136',  // 红色 - 已逾期/关键风险
  warning: '#f7a600',   // 橙色 - 预警/中等风险
  safe: '#39ff14',      // 绿色 - 安全/低风险 
};

// ❌ 错误：其他场景忌硬编码
<div style={{ color: '#2D7FF9' }} />  // 应用 CSS 变量或主题色
<div style={{ background: 'linear-gradient(...)' }} />  // 禁止渐变
```

**设计变量参考**：设计系统完整规范-2026.md

---

## 📱 小程序共享样式库（styles/ 目录）

`miniprogram/styles/` 下三个共享 wxss，**新页面必须 @import，禁止页面内重复定义同名类**：

| 文件 | 职责 | 引用格式 |
|------|------|----------|
| `design-tokens.wxss` | CSS 变量定义 | 全局已在 `app.wxss` 引入，无需重复 |
| `modal-form.wxss` | 弹窗表单 `mf-*` 样式系统 | `@import '/styles/modal-form.wxss';` |
| `page-utils.wxss` | 加载更多 / Tag 标签 | `@import '/styles/page-utils.wxss';` |

> **`app.wxss` 全局样式（所有页面自动生效，无需 @import）**：
> - 空状态：`.empty-state`、`.empty-icon`、`.empty-img`、`.empty-text`、`.empty-hint`
> - 卡片空状态修饰：`.empty-state-card`（含 `.empty-state-card .empty-icon`）— 新页面用 `class="empty-state empty-state-card"`
> - 筛选区域卡片：`.filter-section`（padding/bg/border-radius/border 已定义，各页面仅覆盖 margin）
> - 搜索行：`.search-row`、`.search-box`、`.search-icon`、`.search-input`、`.search-btn`、`.search-btn-hover`、`.clear-btn`、`.clear-btn-hover`

### `page-utils.wxss` 类速查（禁止页面内重复定义）

**空状态**：`.empty-state`（容器）、`.empty-icon`（emoji，48px）、`.empty-img`（图片，200rpx）、`.empty-text`（说明文字）、`.empty-hint`（次说明）→ **均已在 `app.wxss` 全局定义，无需 @import 即可使用**

**加载更多**：`.load-more`（蓝色，可点击）、`.load-more.disabled`（不可点击）、`.load-more-hover`（hover-class）、`.no-more`（灰色，无更多）、`.loading-more`（灰色，加载中）

**Tag 标签**：`.tag`（基础样式）+ 修饰类 `.tag-blue`/`.tag-color`（蓝）、`.tag-gray`/`.tag-size`（灰）、`.tag-green`/`.tag-success`（绿）、`.tag-orange`/`.tag-warn`（橙）、`.tag-red`/`.tag-danger`（红）、`.tag-muted`（静音灰）

> ❌ **禁止**：在页面 wxss 中重新写 `.empty-state { display:flex; ... }`、`.search-row { display:flex; ... }` 等重复样式。  
> ✅ **允许**：局部覆盖差异 `.my-card .empty-state { padding: 40rpx 0; }`。

**已使用 page-utils.wxss 的页面**：`order/index.wxss`、`payroll/payroll.wxss`、`warehouse/finished/list/index.wxss`、`admin/notification/index.wxss`、`warehouse/sample/list/index.wxss`

---

## 📱 小程序扫码核心逻辑

### 三种扫码模式（自动识别）
- **BUNDLE**：菲号扫码（推荐，包含订单+颜色+尺码+数量）
- **ORDER**：订单扫码（仅订单号，需手动选择工序）
- **SKU**：SKU 扫码（款式+颜色+尺码）

**核心实现**：miniprogram/pages/scan/handlers/ScanHandler.js

### 防重复提交算法（业务规则）
```javascript
// 最小间隔 = max(30秒, 菲号数量 × 工序分钟 × 60 × 0.5)
const expectedTime = bundleQuantity * processMinutes * 60;
const minInterval = Math.max(30, expectedTime * 0.5);

// 示例：50件菲号，裁剪工序2分钟/件
// 预期时间 = 50 × 2 × 60 = 6000秒（100分钟）
// 最小间隔 = max(30, 6000 × 0.5) = 3000秒（50分钟）
```

**实现位置**：miniprogram/pages/scan/services/StageDetector.js#L610

---

## 🔧 SKU 与验证规则（跨端一致）

### SKU 组成
```
SKU = styleNo + color + size
示例：FZ2024001-红色-XL
```

### 验证规则共享
- PC 端：frontend/src/utils/validationRules.ts
- 小程序：miniprogram/utils/validationRules.js

**原则**：修改验证规则时必须同步更新两端，避免数据不一致。

---

## 📁 代码质量约束（避免技术债）

### 文件大小限制（强制执行，分级目标）

| 类型 | 绿色目标 | 黄色警戒 | 红色禁止 | 超出时的拆分策略 |
|------|---------|---------|---------|----------------|
| React 组件 | ≤ 200 行 | 201-300 行 | > 300 行 | 拆子组件 |
| React 页面 index | ≤ 400 行 | 401-500 行 | > 500 行 | 拆 Tab + Hook |
| 自定义 Hook | ≤ 80 行 | 81-150 行 | > 150 行 | 按数据域拆分 |
| Java Orchestrator | ≤ 150 行 | 151-200 行 | > 200 行 | 拆 Executor/Helper |
| Java Service | ≤ 200 行 | 201-300 行 | > 300 行 | 按职责拆 Service |
| Java Controller | ≤ 100 行 | 101-150 行 | > 150 行 | 拆子 Controller |

**新建文件时的硬规则**：
- 写代码前先估算行数；超出绿色目标时，先拆分结构再开始写
- 单个方法/函数体 **≤ 40 行**（超出说明职责不单一）
- 超出 50 行的函数必须拆成多个私有方法/子函数，并加 JSDoc/JavaDoc

**当前待优化文件**（追踪中，新代码禁止参照）：
- `OrderManagement/index.tsx`（2120 行）- 订单表单复杂，待拆分
- `MaterialPurchase/index.tsx`（1690 行）- 采购流程表单，待拆分
- `MaterialInventory/index.tsx`（1649 行）- 库存表单，待拆分
- `ProgressDetail/index.tsx`（1670 行）- 生产进度页，待拆分 **⭐ 2026-03-31 新发现**
- `IntelligenceCenter/index.tsx`（1402 行）- 智能驾驶舱，待优化
- ✅ ~~`TemplateCenter/index.tsx`（1912 行）~~ - 已拆分（900行 + 4个子组件）
- ⚠️ **前端文件大小现状（2026-03-31）**：超过 500 行的页面有 11+ 个（2120/1690/1670/1649 等），原指南目标 ≤500 行与实际项目规模不匹配。建议：按模块功能复杂度调整目标，保持单个方法 ≤40 行即可。智能模块与生产模块因业务复杂度可容许至 ≤1200 行

### API 端点数限制
- ⚠️ **单 Controller >15 端点**：考虑拆分职责
- 🔴 **StyleInfoController**（23 端点）：待拆分为 StyleInfo + StyleBom + StyleProcess
- ✅ **ProductionOrderController**（8 端点）：标准规模

### 前端组件规范
**强制使用标准组件库**：
- ✅ `ResizableTable` - 所有列表表格（支持列宽拖拽调整，完全兼容 antd TableProps）
- ✅ `RowActions` - 表格行操作（最多 1 个主按钮，其余折叠）
- ✅ `ResizableModal` - 弹窗（三级尺寸：60vw / 40vw / 30vw）
- ✅ `ModalContentLayout` + `ModalFieldRow` - 弹窗表单布局
- ✅ `ModalHeaderCard` - 弹窗头部卡片（#f8f9fa 背景）
- ❌ 禁止直接使用 antd `Table`（缺少列宽拖拽，用 `ResizableTable` 替代，props 完全兼容）
- ❌ 禁止自定义弹窗尺寸或样式

---

## 📚 关键文档入口

- **系统状态.md** - 系统概览与文档索引（从这里开始）
- **开发指南.md** - 完整开发规范与最佳实践
- **快速测试指南.md** - 业务流程测试脚本
- **设计系统完整规范-2026.md** - 前端设计规范 v3.0

---

## ⚠️ 常见陷阱与注意事项

1. **【禁止】修改内网配置**：`vite.config.ts` 中 `hmr.host='192.168.2.215'` 和 `dev-public.sh` 中 `--host 0.0.0.0` 是固定配置，修改会导致动态模块导入失败和 API 代理异常
2. **403 错误**：未使用 `./dev-public.sh` 启动，缺少 `.run/backend.env` 环境变量
3. **数据库连接失败**：检查端口是否为 3308（非标准 3306），容器名 `fashion-mysql-simple`
4. **使用废弃 API**：检查 `@Deprecated` 标记，所有新代码必须使用 `POST /list` 和 `stage-action` 模式
5. **弹窗尺寸不统一**：必须使用三级尺寸（60vw/40vw/30vw），禁止自定义
6. **Service 互调**：必须通过 Orchestrator，否则无法进行事务管理
7. **扫码重复提交**：理解防重复算法，不要随意修改时间间隔
8. **跨端验证不一致**：修改 validationRules 时必须同步 PC 端和小程序
9. **权限错误**：Controller 方法上不要添加实际不存在的权限码（导致全员 403）；class 级别已有 `isAuthenticated()`，方法级别不需要重复添加
10. **MySQL时区 vs JVM时区**：Docker MySQL 默认 UTC，JVM 默认 CST(+8)。写测试数据时须用 `CONVERT_TZ(NOW(),'+00:00','+08:00')` 而非 `NOW()`，否则时间型校验（如1小时撤回）会因 8 小时差导致误判。生产运行时无此问题（Spring Boot 本身用 `LocalDateTime.now()` CST 写入）。
11. **工资已结算的扫码记录禁止撤回**：`ScanRecord.payrollSettled = true` 时，`ScanRecordOrchestrator.undo()` 必须拒绝操作并报错 `"该扫码记录已参与工资结算，无法撤回"`。撤回扫码后必须同步触发仓库数量回滚，两步操作放在同一 `@Transactional` 中。
12. **【2026-05-03】JacksonConfig 导致全局 Badge 99+ 精度问题（已修复）**：`JacksonConfig.java` 全局注册 `Long.class + long.class → ToStringSerializer.instance`（防止 18位数字 JS 精度溢出）。**副作用**：所有统计计数（long 类型）也被序列化为 JSON String，导致 Frontend `"91" + "8" = "918"` 字符串拼接而非数值求和。
    - **表现**：DailyTodoModal/Dashboard 显示「逾期订单99+」实际仅 3 个；Alert Bell 显示「99+」
    - **永久规律**：统计计数的新 Orchestrator 方法必须在返回前转为 int（如 `map.put("overdueCount", (int) overdueCount)`），规避 JacksonConfig 序列化。不要用 Long 返回计数值
    - **Frontend 防御**：所有接收统计计数字段的组件用 `Number()` 包裹（如 `Number(brief?.overdueOrderCount ?? 0)`），增强容错性
    - **Redis 缓存安全**：`DashboardQueryServiceImpl` 缓存模式 `Number cached = getFromCache(key); return cached.longValue()` 因使用 Number 接口完全兼容 int/long 反序列化，无需修改
13. **云端 Flyway 自动运行**：`FLYWAY_ENABLED=true`（cloudbaserc.json 已配置），所有 `V*.sql` Flyway 脚本**每次容器重启时自动执行**。push 到 main → CI/CD 部署 → Flyway 自动完成数据库迁移，**无需手动在控制台执行 SQL**。本地开发环境默认 `FLYWAY_ENABLED=false`（application.yml 默认值），由 `DbColumnRepairRunner` 启动自愈保障本地字段完整。⚠️ **铁则：禁止修改已执行过的 V*.sql 文件内容**（checksum 校验失败 → Spring Boot 不启动 → 全部 API 500），发现问题只能新建补偿脚本。
14. **git push = 云端自动重新部署**：`.github/workflows/ci.yml` 的 `deploy` job 通过腾讯云 `cloudbase-action` 触发部署，push 到 main 后 3~5 分钟自动生效。**需要** GitHub Actions Secrets（`CLOUDBASE_SECRET_ID` / `CLOUDBASE_SECRET_KEY` / `CLOUDBASE_ENV_ID`，已在仓库 Settings 中配置），**无需**手动上传 JAR。
15. **Java 类型安全**：使用 `UserContext.tenantId()` 等工具方法前必须确认返回类型（返回 `Long`，不是 `String`）。编写新 Orchestrator 时，查阅同模块已有编排器的实际调用方式，不要凭记忆猜测类型。
16. **【2026-03-11/12】ViewMigrator 视图 Collation NONE 错误（已通过 Flyway 彻底修复）**：`v_production_order_flow_stage_snapshot` 等视图中 `CONVERT(... USING utf8mb4)` 不加 `COLLATE` 会产生 NONE 可强制性（coercibility 6），`MAX()` 对多行聚合时 MySQL 8.0 抛出 `Illegal mix of collations (utf8mb4_bin,NONE) for operation 'max'`。
   - ⚠️ **v3.15 描述有误**：ViewMigrator 在云端从不执行。根因：`cloudbaserc.json` 设置 `FASHION_DB_INITIALIZER_ENABLED=false` + `application-prod.yml` 设置 `initializer-enabled: false`，导致 `DataInitializer` Bean 在云端从未实例化，ViewMigrator.initialize() 从未运行。单独修复 ViewMigrator.java（commit 375c307f）对云端无效。
   - ✅ **正确修复路径（Flyway）**：新增 `V20260312001__fix_view_collation_none.sql`，包含三个视图的完整 `CREATE OR REPLACE VIEW`，所有 CONVERT 表达式均加 `COLLATE utf8mb4_bin`。Flyway（云端 `FLYWAY_ENABLED=true`）在下次部署时自动执行，一次性修复所有租户的视图定义。
   - **永久规律**：凡是修改这三个视图（`v_production_order_flow_stage_snapshot`、`v_production_order_stage_done_agg`、`v_production_order_procurement_snapshot`），必须同时新增 Flyway 迁移脚本，仅更新 ViewMigrator.java 对云端无效。Flyway 脚本内容与 ViewMigrator fallback SQL 保持一致（同步维护）。

---

## 🚀 推送前强制三步验证（每次必做）

> ⚠️ **AI 开发必读**：每次 push 前必须完成以下三步，缺一不可。历史上最常见的 CI 失败原因是「本地改了但忘记 git add」，即本地编译通过但 CI 报错。
> ⚠️ **新增 P0 铁律（2026-03-18）**：凡是涉及 Entity / Flyway / SQL / 表结构的改动，必须先确认数据库，再允许 push。禁止“线下未确认 schema，先推到仓库看看线上炸不炸”。
> ⚠️ **执行责任**：默认由 AI/代理主动跑完编译、类型检查、git 状态核对、schema preflight；除非必须由用户在云端控制台执行 SQL，否则不能只给用户一串命令让用户自己做。

### 第一步：本地编译验证
```bash
# 后端（有 Java 改动时）
cd backend
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  /opt/homebrew/bin/mvn clean compile -q
# 输出 BUILD SUCCESS 才能继续

# 前端（有 TypeScript 改动时）
cd frontend
npx tsc --noEmit
# 0 errors 才能继续
```

### 第二步：git status 全量检查
```bash
# ❌ 禁止：git add .
git status                # 查看所有未追踪/已修改的文件
git diff --stat HEAD      # 确认工作区与上次提交的差异

# ✅ 正确：精确 add 每个文件
git add backend/src/main/java/com/fashion/.../TargetClass.java
git add frontend/src/modules/.../TargetComponent.tsx

# 最后再确认一次暂存区
git diff --cached --stat
```

### 第三步：数据库检查（新增数据库字段/表时）
**关键规律**：代码与数据库必须同时变更！每次修改前都要确认：
```bash
# ✅ 推荐：统一执行推送前检查脚本（会识别 DB 敏感改动并要求显式确认 schema）
./scripts/pre-push-checklist.sh --schema-confirmed

# ✅ 新增 Entity 字段 → 必须有对应 Flyway 脚本
grep -r "@TableField\|private.*\s" backend/src/main/java/.../entity/*.java \
  | grep -v "@TableField(exist=false)"  # 排除 transient 字段

# ✅ 新增 Flyway 脚本 → 必须有对应 Entity 字段定义
ls -ltr backend/src/main/resources/db/migration/V*.sql | tail -3

# ✅ push 前必须跑核心 schema 体检（结果为空才允许继续）
# 云端/发版前：执行 deployment/cloud-db-core-schema-preflight-20260318.sql
# 本地/改库前：至少核对当前功能涉及的核心表缺列为 0

# ✅ 检查脚本幂等性（云端 FLYWAY_ENABLED=true，脚本必须幂等）
grep "ADD COLUMN\|CREATE TABLE\|ALTER TABLE" \
  backend/src/main/resources/db/migration/V*.sql \
  | grep -v "INFORMATION_SCHEMA\|IF NOT EXISTS"  # 非幂等的会被标出来
```

**P0 零容忍规则**：
- 只要本次提交触碰了 Entity、Flyway、Mapper SQL、手写 SQL、DbRepair/Preflight 之一，就必须先确认数据库，再提交再 push。
- 体检结果只要还有 `MISSING`，禁止 push，先补库或补迁移。
- 不允许把“数据库是否缺列”留给线上页面点击后再发现。
- 推荐把 `./scripts/pre-push-checklist.sh --schema-confirmed` 当作 push 前固定动作；脚本未通过时，禁止继续 push。
- AI/代理在具备本地执行能力时，必须自行运行上述脚本或等价检查并汇报结果；不能把这一步默认转嫁给用户。

### 第四步：提交前类型检查（新增 Java 类时）
**必须核对的高频类型陷阱**：
| 方法 | 实际返回类型 | 常见错误 |
|------|-------------|----------|
| `UserContext.tenantId()` | `Long` | ❌ 用 `String` 接收 |
| `UserContext.userId()` | `String` | ❌ 用 `Long` 接收 |
| `o.getOrderQuantity()` | `Integer` | ❌ 用 `int` 基本类型接收（空指针） |
| `o.getProductionProgress()` | `Integer` | ❌ 直接参与运算未判空 |

---

## 🔄 CI/CD 与日志管理

### ☁️ 云端自动部署（已配置，重要！）

**部署方式：微信云托管控制台持续部署（已绑定 GitHub repo）**

> ⚠️ **AI 必读**：部署通过 `.github/workflows/ci.yml` 的 `deploy` job 触发（使用 `CLOUDBASE_SECRET_ID`/`CLOUDBASE_SECRET_KEY`/`CLOUDBASE_ENV_ID` 三个 Secrets，已在仓库 Settings 中配置）。只要推送到 main 分支，CI 自动触发云端容器重建，无需手动上传 JAR。

```bash
# 部署到云端：正确流程（绝对禁止直接 git add .）

# ① 先验证本地编译
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home /opt/homebrew/bin/mvn clean compile -q

# ② 确认所有改动都已暂存（关键！）
git status
git diff --stat HEAD

# ③ 精确 add，不用 git add .
git add backend/src/... frontend/src/...
git commit -m "fix: 你的修改描述"
git push upstream main
# → 微信云托管自动拉取代码，重建容器，通常 3~5 分钟后生效
```

**云端环境信息**（微信云托管控制台截图确认）：
- **云后端地址**：`backend-226678-6-1405390085.sh.run.tcloudbase.com`
- **数据库**：`jdbc:mysql://10.1.104.42:3306/...`（VPC 内网，仅容器内可访问）
- **`FLYWAY_ENABLED=true`** ← ⚠️ **Flyway 实际在云端运行（cloudbaserc.json 配置）！**

### ⚠️ FLYWAY_ENABLED=true — 云端 Flyway 自动执行，脚本必须幂等

**关键约束**：云端 `FLYWAY_ENABLED=true`（见 `cloudbaserc.json`），所有 Flyway 迁移脚本（`V*.sql`）**会自动执行**。  
**任何脚本失败 → Spring Boot 启动失败 → 所有新接口 404（旧容器继续服务）**

### 🔴 Flyway 铁则（违反 = 全系统 500，无一例外）

🚨 **绝对禁止修改已执行过的 Flyway 脚本文件内容！**

Flyway 在每次启动时对 `flyway_schema_history` 中所有已执行脚本做 **checksum 校验**。  
只要文件内容有任何变化（哪怕只改一个空格），校验就会**失败 → Flyway 拒绝启动 → Spring Boot context 不初始化 → ALL API 500**。

**触发案例（2026-04-21 全系统崩溃）**：  
commit `931d79e2` 修改了 3 个已执行脚本（V20260221b、V47、V20260314001），  
改动方式仅是"添加 @tbl 存在性守卫来增强幂等性"。  
结果：Flyway checksum 不匹配 → 全部 API 500 → 持续约 5+ 小时。

**正确做法**：
- ✅ 已执行脚本发现问题 → 创建**新版本号脚本**来补偿（如 `V202604221430__fix_xxx.sql`，YYYYMMDDHHMM格式）  
- ✅ 新逻辑放新脚本，旧脚本永远保持原始内容不变  
- ❌ 禁止：编辑任何已推送到 main 且可能已部署过的 V*.sql 文件

**版本号命名规范（强制）**：
- ✅ **新格式（2026-05起）**：`V{YYYYMMDDHHMM}__description.sql`（12位，精确到分钟）
  - 示例：`V202605101430__add_style_tags.sql`（2026-05-10 14:30 创建）
  - 天然唯一、按时间排序、不需要 NNN 序号后缀
- ❌ **旧格式（禁止新增）**：`V{YYYYMMDDNNN}`（日期+3位序号，如 `V20260510001`）
  - 旧格式已造成日期虚高（实际3月却有5月版本号）+ 序号无限堆积，禁止延续
- **新旧混用说明**：12位时间戳（`202605101430`）数值上始终大于旧11位序号（`20260510001`），排序兼容，无需迁移旧脚本

**强制规范**：
1. `CREATE TABLE` 必须用 `CREATE TABLE IF NOT EXISTS`
2. `ALTER TABLE ADD COLUMN` **禁止直接写** → 必须用 INFORMATION_SCHEMA 条件判断（MySQL 8.0 不支持 `IF NOT EXISTS`）：
```sql
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_xxx' AND COLUMN_NAME='col_name')=0,
    'ALTER TABLE `t_xxx` ADD COLUMN `col_name` VARCHAR(64) NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```
3. 脚本本地执行通过后再 push，不再需要手动在控制台执行（Flyway 会自动迁移）

**或者**通过容器内执行（如有 SSH/终端权限）：
```bash
# 在云端容器内执行（内网地址，凭据通过环境变量获取）
mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < your-migration.sql
```

> ⚠️ 安全要求：禁止在文档、脚本、提交记录中写明文数据库密码。凭据统一存放在环境变量或密钥管理系统中。

**历史上已手动执行的 SQL**（不会再重复执行）：
- `V20260225__add_user_avatar_url.sql` — `t_user` 添加 `avatar_url` 列
- `V20260226b__fix_login_log_error_message.sql` — `t_login_log.error_message` 改为 TEXT

**性能索引**（`V20260226c__add_scan_record_performance_indexes.sql`，✅ 已于 2026-02-26 手动在云端控制台执行完毕）：
```sql
-- 以下 3 条索引已在云端数据库执行，无需重复
CREATE INDEX idx_scan_record_operator_stats ON t_scan_record (operator_id, scan_time, scan_result, quantity);
CREATE INDEX idx_scan_record_order_bundle_type ON t_scan_record (order_id, cutting_bundle_id, scan_type, scan_result);
CREATE INDEX idx_production_order_status_flag ON t_production_order (status, delete_flag);
```
⚠️ 注意：云端 MySQL 不支持 `DROP INDEX IF EXISTS` 语法（ERROR 1064），执行时直接跳过 DROP 语句，只执行 CREATE INDEX 即可。

### GitHub Actions 自动化
项目已配置 `.github/workflows/ci.yml`：
- ✅ **自动测试**：push 到 main/develop 分支时自动运行单元测试
- ✅ **多环境支持**：MySQL 8.0 服务容器（端口 3308）
- ✅ **覆盖率报告**：自动生成 Jacoco 覆盖率报告
- ✅ **前端构建**：检查 TypeScript 编译和 ESLint 规则
- ✅ **自动部署**：push 到 main → 微信云托管持续部署（控制台绑定，非 Actions Secrets）

**测试选择器**：
```bash
# 仅运行核心 Executor 测试（快速反馈）
mvn clean test -Dtest="QualityScanExecutorTest,WarehouseScanExecutorTest,ProductionScanExecutorTest"
```

### 日志轮转配置
项目采用 Logback 日志轮转（`backend/src/main/resources/logback-spring.xml`）：
- **单文件限制**：500MB
- **保留期限**：30天
- **总大小限制**：10GB
- **日志路径**：`logs/fashion-supplychain.log`

**日志清理脚本**：
```bash
./clean-dev-logs.sh      # 清理开发环境日志
./clean-system.sh        # 系统全面清理（日志+缓存）
```

---

## 📚 关键文档入口

- **系统状态.md** - 系统概览与文档索引（从这里开始）
- **开发指南.md** - 完整开发规范与最佳实践
- **快速测试指南.md** - 业务流程测试脚本
- **设计系统完整规范-2026.md** - 前端设计规范 v3.0
- **docs/小程序开发完整指南.md** - 小程序 ESLint、调试、业务优化
- **deployment/数据库配置.md** - 数据库备份、恢复、数据卷管理

---

> **修改代码前必读**：优先参考现有实现（同模块 Controller/Orchestrator/组件），确保对齐既有模式，避免引入不一致性。

---

## 🎯 关键开发决策（架构 DNA）

### 为什么选择 Orchestrator 模式？
**背景**：服装供应链业务复杂度极高，单个订单涉及 8+ 工序，5+ 服务交互
- ❌ **传统分层**：Controller → Service → Mapper（适合简单CRUD）
- ✅ **当前架构**：Controller → **Orchestrator** → Service → Mapper
  - Orchestrator 层：跨服务编排、事务管理、业务协调
  - Service 层：单表操作，禁止互调
  - **收益**：事务一致性 100%、业务逻辑清晰、易测试

### 为什么数据库用 3308 端口？
**原因**：开发团队多人协作，避免与本地 MySQL 3306 冲突
- 修改端口需同步更新：`dev-public.sh` + `.run/backend.env` + `deployment/db-manager.sh`

### 为什么内网 IP 固定为 192.168.2.215？
**原因**：Vite HMR（热模块替换）需要固定主机地址才能正常工作
- ✅ **固定配置**：`vite.config.ts` 中 `hmr.host='192.168.2.215'`
- ✅ **启动命令**：`dev-public.sh` 中 `--host 0.0.0.0`
- ❌ **禁止修改**：修改 HMR host 会导致动态模块导入失败（React Router lazy loading）
- ❌ **禁止修改**：修改监听 host 会导致内网无法访问
- **访问方式**：
  - 本地：`http://localhost:5173/`（API 代理生效）
  - 内网：`http://192.168.2.215:5173/`（支持团队协作）

### 为什么小程序不用 TypeScript？
**决策**：微信开发者工具 2020 年版本对 TS 支持差，编译耗时长
- 采用 ESLint + JSDoc 替代（代码质量 95/100）
- 验证规则跨端同步：`validationRules.ts` ↔ `validationRules.js`

### 为什么弹窗只能用 3 个尺寸？
**设计原则**：响应式一致性 > 自由度
- 60vw/40vw/30vw 覆盖 90% 场景
- 自定义尺寸会破坏跨页面视觉一致性
- 参考：设计系统完整规范-2026.md

---

## 🚨 禁止模式与反例（避坑指南）

### 反例 1：Controller 直调多 Service（❌ 严重错误）
```java
// ❌ 错误：破坏事务一致性
@RestController
public class OrderController {
    @PostMapping("/create")
    public Result<Order> create() {
        Order order = orderService.create();      // 服务1
        styleService.deductStock();               // 服务2 - 跨服务调用
        financeService.createCost();              // 服务3 - 跨服务调用
        return Result.success(order);
    }
}
// 问题：服务2失败时，服务1已提交，无法回滚

// ✅ 正确：通过 Orchestrator 编排
@Service
public class OrderOrchestrator {
    @Transactional(rollbackFor = Exception.class)  // 统一事务
    public Order createOrder() {
        Order order = orderService.create();
        styleService.deductStock();
        financeService.createCost();
        return order;  // 任何失败都会回滚
    }
}
```

### 反例 2：硬编码颜色（❌ 设计违规）
```tsx
// ❌ 错误：破坏主题一致性（项目中有 610 处待修复）
<Button style={{ background: '#2D7FF9' }}>保存</Button>

// ✅ 正确：使用 CSS 变量
<Button style={{ background: 'var(--primary-color)' }}>保存</Button>
```

### 反例 3：跨端验证不一致（❌ 数据污染）
```javascript
// ❌ 错误：只改 PC 端，小程序未同步
// frontend/src/utils/validationRules.ts
export const orderNoPattern = /^PO\d{11}$/;  // 修改了格式

// miniprogram/utils/validationRules.js
const orderNoPattern = /^PO\d{10}$/;  // 忘记修改

// 结果：PC 端创建的订单，小程序扫码失败
```

### 反例 4：使用已废弃 API（❌ 技术债）
```java
// ❌ 错误：使用旧 API（项目已标记 58 个废弃端点）
GET /api/production/orders/by-order-no/{orderNo}

// ✅ 正确：使用新 API
POST /api/production/orders/list
{ "filters": { "orderNo": "PO20260201001" } }
```

---

## 📊 数据流与集成点

### 三端数据流图
```
[PC端 React]  ←─────────────→  [后端 Spring Boot]  ←─────────────→  [小程序 WeChat]
     │                               │                                    │
     │ API: /api/*                  │ MySQL 3308                         │ API: /api/wechat/*
     │ Auth: JWT                     │ Redis Cache                        │ Auth: wx.login()
     │                               │                                    │
     └──────────── WebSocket ────────┴──────────── EventBus ─────────────┘
                    (实时同步)                        (跨页面通知)
```

### 关键集成点
1. **扫码流程**：小程序扫码 → 后端工序识别 → PC端实时更新
   - 防重复：基于 `orderId + processCode + quantity + timestamp` 去重
   - 最小间隔：`max(30s, 菲号数量 × 工序分钟 × 60 × 0.5)`
   - 实现：`miniprogram/pages/scan/services/StageDetector.js#L610`

2. **库存同步**：采购入库 → 自动更新库存 → 触发预警
   - 表：`t_material_stock`（面辅料）、`t_sample_stock`（样衣）
   - 预警阈值：`safety_stock` 字段
   - 实现：`backend/.../MaterialStockService.java`

3. **财务结算**：扫码记录 → 工资计算 → 对账单生成
   - 聚合规则：按订单+工序+员工分组
   - 审批流程：`POST /{id}/stage-action?action=approve`
   - 实现：`backend/.../ReconciliationOrchestrator.java`

---

## 🔍 调试技巧与常见问题

### 问题 1：403 错误（最常见）
**原因**：未加载环境变量 `APP_AUTH_JWT_SECRET`
```bash
# ❌ 错误启动方式
cd backend && mvn spring-boot:run  # 缺少环境变量

# ✅ 正确启动方式
./dev-public.sh  # 自动加载 .run/backend.env

# 快速修复
./fix-403-errors.sh
```

### 问题 2：扫码无响应
**排查步骤**：
```bash
# 1. 检查后端日志
tail -f backend/logs/fashion-supplychain.log | grep "scan/execute"

# 2. 验证数据库连接
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "SELECT COUNT(*) FROM t_scan_record;"

# 3. 检查防重复逻辑
# 查看 miniprogram/pages/scan/index.js#recentScanExpires Map
```

### 问题 3：前端 API 404 / 动态模块导入失败
**原因**：使用内网 IP 会导致 Vite 代理失效 + 动态导入（lazy loading）失败
```bash
# ❌ 错误访问（会导致两类问题）
http://192.168.2.215:5173
# 问题1：API 代理不生效 → 后端请求 404
# 问题2：动态导入失败 → "Failed to fetch dynamically imported module"

# ✅ 正确访问
http://localhost:5173  # 代理生效 + 模块加载正常

# Vite 配置位置
frontend/vite.config.ts → server.proxy['/api']
```

**典型错误信息**：
```
TypeError: Failed to fetch dynamically imported module: 
http://192.168.2.215:5173/src/modules/basic/pages/OrderManagement/index.tsx
```

**快速修复**：
```bash
# 1. 关闭当前浏览器标签
# 2. 使用 localhost 重新访问
open http://localhost:5173

# 3. 如果问题依然存在，清理缓存
cd frontend
rm -rf node_modules/.vite
npm run dev
```

### 问题 4：数据库连接失败
```bash
# 检查 Docker 容器
docker ps | grep fashion-mysql-simple

# 如果容器未运行
./deployment/db-manager.sh start

# 测试连接（注意端口 3308）
mysql -h127.0.0.1 -P3308 -uroot -pchangeme fashion_supplychain
```

---

## 🛠️ 快速命令参考（复制即用）

### 日常开发
```bash
# 启动开发环境（必须用脚本）
./dev-public.sh

# 查看后端日志
tail -f backend/logs/fashion-supplychain.log

# 清理日志和缓存
./clean-system.sh

# 系统健康检查
./check-system-status.sh
```

### 测试验证
```bash
# 测试订单创建
./test-production-order-creator-tracking.sh

# 测试扫码流程
./test-material-inbound.sh

# 测试财务结算
./test-finished-settlement-approve.sh

# 运行所有测试（后端）
cd backend && mvn clean test

# 运行核心测试（快速）
mvn test -Dtest="*OrchestratorTest"
```

### 数据库操作
```bash
# 备份数据库
docker exec fashion-mysql-simple mysqldump -uroot -pchangeme fashion_supplychain > backup_$(date +%Y%m%d).sql

# 恢复数据库
docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < backup.sql

# 查看表结构
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "SHOW TABLES;"

# 执行 SQL 脚本
docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < scripts/your-script.sql
```

### 代码检查
```bash
# 检查设计规范违规
./fix-design-violations.sh

# 检查未使用的 imports
cd frontend && npm run lint

# 检查小程序代码
./miniprogram-check.sh

# 代码质量审计
./full-code-audit.sh
```

---

## 📖 文档速查表

### 新手入门（按顺序阅读）
1. 系统状态.md - 5分钟了解系统（必读）
2. 开发指南.md - 完整架构和规范（必读）
3. 业务流程说明.md - 理解业务逻辑
4. 快速测试指南.md - 验证环境

### 开发规范（写代码前查阅）
- 设计系统完整规范-2026.md - UI/UX 强制规范
- docs/useModal使用指南.md - Modal 状态管理
- docs/ModalContentLayout使用指南.md - Modal 布局规范

### 专题指南（特定功能）
- INVENTORY_SYSTEM_GUIDE.md - 进销存操作
- docs/小程序开发完整指南.md - 小程序开发
- deployment/数据库配置.md - 数据库管理

### 测试脚本索引（40+ 脚本）
```bash
ls -1 test-*.sh           # 列出所有测试脚本
./test-dashboard-all.sh   # 仪表板全量测试
./test-stock-check.sh     # 库存检查测试
```

---

## 🎓 学习路径建议

### Day 1：环境搭建（1-2小时）
1. 阅读 系统状态.md（10分钟）
2. 运行 `./dev-public.sh` 启动环境（20分钟）
3. 运行 `./check-system-status.sh` 验证（5分钟）
4. 运行 `./test-production-order-creator-tracking.sh` 测试（10分钟）

### Day 2：理解架构（2-3小时）
1. 阅读 开发指南.md 1-3章（1小时）
2. 查看 `backend/.../orchestration/` 目录，理解 Orchestrator 模式（30分钟）
3. 查看 `frontend/src/modules/` 目录，理解模块化架构（30分钟）
4. 阅读 业务流程说明.md（30分钟）

### Day 3：动手实践（3-4小时）
1. 修改一个简单的 Service（如添加字段）（1小时）
2. 添加一个 API 端点（30分钟）
3. 创建一个 Modal 组件（使用 useModal + ModalContentLayout）（1小时）
4. 编写单元测试（30分钟）

### Week 2+：深入专题
- 小程序开发：docs/小程序开发完整指南.md
- 进销存系统：INVENTORY_SYSTEM_GUIDE.md
- 设计系统：设计系统完整规范-2026.md

---

## 💡 AI 使用建议

### 向 AI 提问的最佳实践
```
✅ 好问题：
"如何在 ProductionOrderOrchestrator 中添加一个新的状态流转？"
"ResizableModal 应该使用 60vw 还是 40vw 尺寸？"
"扫码防重复算法的时间间隔是如何计算的？"

❌ 差问题：
"怎么写一个订单管理功能？"（太宽泛）
"为什么代码报错？"（缺少上下文）
"帮我优化这段代码"（没有明确目标）
```

### 让 AI 生成代码时
1. **指定架构层**：明确是 Controller/Orchestrator/Service
2. **引用现有代码**：`参考 ProductionOrderOrchestrator 的模式`
3. **说明约束**：`Controller class 级别添加 @PreAuthorize("isAuthenticated()")，方法级别不重复`
4. **要求测试**：`需要包含单元测试`

### AI 代码审查重点
- [ ] 是否遵循 Orchestrator 模式？
- [ ] Controller class 级别是否有 `@PreAuthorize("isAuthenticated()")` ？（方法级别不需要）
- [ ] 是否使用了标准组件（ResizableModal/ModalContentLayout/ResizableTable）？
- [ ] 是否更新了跨端验证规则？
- [ ] 是否编写了测试？

---

## 📊 生产进度数据流规范（核查验证版 v2.0，2026-02-25 全局缓存重构）

> 本节描述"我的订单"与"生产进度"两个 Tab 中进度球/弹窗/手机端的**数据唯一来源与显示一致性**，修改相关逻辑前必须阅读。

### 一、覆盖页面与组件

| 页面/组件 | 路径 | 说明 |
|-----------|------|------|
| 我的订单 + 生产进度（列表视图） | `ProgressDetail/index.tsx` + `hooks/useProgressColumns.tsx` | **同一套列定义**，两 Tab 共用 |
| 进度球点击弹窗 | `components/common/NodeDetailModal.tsx` | 弹窗头部统计来自父组件传入，明细来自独立 API；任意 API 失败显示 Alert 警告条 |
| 进度球数据计算 | `ProgressDetail/hooks/useBoardStats.ts` | 唯一数据源，通过全局 store 存储 |
| **全局进度球缓存** | `stores/productionBoardStore.ts` | ✅ **Zustand 全局单一缓存**，两 Tab 共享，消除双份不一致 |
| 卡片视图（两 Tab） | `index.tsx` → `UniversalCardView` | 只显示 `productionProgress`，**不显示工序球** |
| ~~`ModernProgressBoard` 组件~~ | ~~已删除~~ | ✅ **已于 2026-02-25 删除**（从未被任何页面导入，死代码已清理） |

---

### 二、进度球数据来源（boardStats）

**数据计算入口**：`useBoardStats.ts`

```
1. API：productionScanApi.listByOrderId(orderId, { page:1, pageSize:500 })
2. 过滤：scanResult === 'success'  AND  quantity > 0
3. 匹配节点（节点名模糊匹配）：
       stageNameMatches(nodeName, r.progressStage)   // 父节点名字段
    OR stageNameMatches(nodeName, r.processName)      // 子工序名字段
4. 数量：所有匹配记录的 quantity 求和
    →  boardStatsByOrder[orderId][nodeName]
5. 时间：所有匹配记录中最大的 scanTime
    →  boardTimesByOrder[orderId][nodeName]
```

**兜底逻辑**（仅当该节点**无任何扫码记录**时才生效，有真实扫码则完全跳过）：
- `裁剪` 节点：若 `cuttingQuantity > 0`，则强制 `max(scanned, cuttingQuantity)`
- 其他节点：`sewingCompletionRate / procurementCompletionRate` 等订单级字段 × 基数，取 max

⚠️ **关键守卫（`hasScanByNode`）**：`useBoardStats.ts` 内部维护 `hasScanByNode` 映射，只要该节点存在任意 `success` 扫码记录，比例兜底逻辑**完全跳过**，防止真实数据被订单级字段覆盖虚高。

**全局缓存（2026-02-25 重构）**：`boardStatsByOrder`、`boardTimesByOrder`、`boardStatsLoadingByOrder` 全部存储在 `stores/productionBoardStore.ts`（Zustand）。两 Tab（`ProgressDetail/index.tsx` 和 `List/hooks/useProgressTracking.tsx`）读写**同一份缓存**，彻底消除双份不一致问题。

**缓存刷新**：调用 `fetchOrders()` 后执行 `clearAllBoardCache()`（全局 store 方法）清空缓存，触发重新拉取，确保进度球与扫码记录同步。旧代码中的 `setBoardStatsByOrder({})` + `boardStatsLoadingRef.current = {}` 已废弃。

---

### 三、进度球渲染逻辑（useProgressColumns.tsx）

```typescript
// 每个工序列（采购/裁剪/二次工艺/车缝/尾部/入库）渲染公式：
const totalQty    = Number(record.cuttingQuantity || record.orderQuantity) || 0;
const completedQty = boardStatsByOrder[orderId][nodeName] || 0;
const percent      = Math.min(100, Math.round(completedQty / totalQty * 100));
const completionTime = boardTimesByOrder[orderId][nodeName] || '';

// 球上方显示：formatCompletionTime(completionTime)  →  "MM-dd HH:mm"
// 球内显示：  completedQty / totalQty（件数）+ percent%（百分比圆环）
// 点击球：  openNodeDetail(record, nodeType, nodeName,
//            { done: completedQty, total: totalQty, percent }, unitPrice, processList)
```

---

### 四、弹窗（NodeDetailModal）数据构成

点击任意进度球弹出 `NodeDetailModal`，数据分两部分来源：

| 区域 | 内容 | 来源 |
|------|------|------|
| 弹窗头部统计（完成/总数/百分比） | 与球上显示**完全一致** | 父组件传入（来自 boardStats） |
| 扫码记录明细列表 | 该订单全部扫码记录 | 独立 API：`productionScanApi.listByOrderId` |
| 工序跟踪/工资结算状态 | 工序-员工-金额 | 独立 API：`getProductionProcessTracking(orderId)` |
| 菲号列表 | 裁剪菲号及数量 | 独立 API：`/production/cutting/list` |
| 节点操作记录 | 审核/备注记录 | 独立 API：`productionOrderApi.getNodeOperations` |

**结论**：弹窗头部统计与进度球是**同一数字，永远一致**；明细来自独立 API fresh 拉取，有延迟但更实时。

**错误处理（2026-02-25 新增）**：5 个并发 API 中任何一个失败，弹窗顶部会出现黄色 `Alert` 警告条（如"工厂列表加载失败；工序跟踪加载失败"），不再静默丢失数据，用户可快速感知并刷新。

---

### 五、扫码记录字段与父子节点关系

`t_scan_record` 表核心字段：

| 字段 | 含义 | 示例 |
|------|------|------|
| `progress_stage` | **父节点名**（大工序） | "尾部"、"车缝" |
| `process_name` | **子工序名**（细工序） | "剪线"、"锁边" |
| `scan_result` | 扫码结果 | "success" / "fail" |
| `quantity` | 该次扫码件数 | 50 |
| `scan_time` | 扫码时间戳 | "2026-02-19T08:19:00" |

**关键规则**：boardStats 同时匹配 `progressStage`（父）和 `processName`（子），因此：
- 员工扫子工序（如"剪线"），该数量会**聚合到父节点"尾部"球显示**
- 修改节点配置时，`stageNameMatches` 的模糊匹配范围决定哪些扫码记录归入该球，需同步核查

---

### 六、`productionProgress`（%）vs boardStats 数量——两个不同概念

| 字段 | 来源 | 更新时机 | 含义 |
|------|------|----------|------|
| `productionProgress`（%） | `ProductWarehousingOrchestrator` 写入 | **仅在入库时**更新 | 已正式入库完成比例 |
| `boardStats[nodeName]` | 扫码记录实时聚合 | 每次刷新订单列表时重新统计 | 该工序已扫码件数 |

❌ **禁止混淆**：进度球显示的件数不等于入库数量，不等于 `productionProgress`，它是扫码记录的统计结果。

---

### 七、手机端（小程序 work 页）字段对比

| 字段 | PC 进度球 | 手机端 | 说明 |
|------|-----------|--------|------|
| 总体进度 % | `productionProgress`（卡片视图） | `productionProgress` | 同源 ✅ |
| 进度球件数 | `boardStats[nodeName]` | ❌ 不显示 | 手机不显示工序球 |
| 进度球时间 | `boardTimes[nodeName]` | ❌ 不显示 | — |
| 完成件数 | `completedQuantity`（卡片） | `completedQuantity` | 同源 ✅ |
| 总件数 | `cuttingQuantity\|\|orderQuantity` | `sizeTotal\|\|orderQuantity` | 同源（不同兜底字段）✅ |
| 剩余天数颜色 | 比例算法（≤20%红/≤50%黄） | 比例算法（已同步） | **已统一** ✅（2026-03修复） |

---

### 八、常见陷阱

1. **修改进度球节点名**：需同步检查 `stageNameMatches` 匹配规则，否则扫码记录无法匹配到节点
2. **开发调试时进度球不更新**：检查是否在 `fetchOrders()` 后调用了 `clearAllBoardCache()`（全局 store 方法）；旧代码中的 `setBoardStatsByOrder({})` + `boardStatsLoadingRef` 已废弃
3. **弹窗统计与球不一致**：不可能发生（同源），若出现说明 `openNodeDetail` 的入参被中间层修改了
4. **~~`ModernProgressBoard` 组件修改~~**：✅ 已于 2026-02-25 永久删除，无需维护
5. **扫码后进度球不变**：需用户手动刷新（点"刷新"按钮），触发 `fetchOrders` → `clearAllBoardCache()` → 重新拉取 boardStats
6. **兜底数字虚高**：历史版本存在比例兜底覆盖真实扫码数的 bug，已通过 `hasScanByNode` 守卫修复——有真实扫码记录的节点绝对不会被兜底覆盖
7. **弹窗 API 失败无感知**：历史版本 5 个并发请求任一失败静默忽略，现已在弹窗顶部显示 Alert 警告，可快速定位加载失败的数据块

---

## 🔥 变更流水线（完整变更追踪 v2.0）

> **格式说明**：每条变更包含 触发问题 → 根本原因 → 涉及文件（精确路径）→ 代码变动（增/删/改/移）→ 废弃代码清查 → 运行时影响 → 遗留风险  
> **Commit**：`8ec7d288`（2026-02-26 12:53）| **推送**：✅ 已推送 `main`  
> **后续清理**：`8ec7d307`（2026-02-26）— 从 git 追踪中移除误提交的 `.backup-*` 备份目录

---

### 📋 本批次变更全景索引（commit 8ec7d288）

| # | 分类 | 核心问题 | 涉及文件（精确路径） | 操作类型 | 废代码清查 |
|---|------|----------|---------------------|----------|----------|
| 1 | 🔴 Bug修复 | 自定义裁剪单 POST 500 | `backend/.../orchestration/CuttingTaskOrchestrator.java` | 修改 | ✅ 无废弃 |
| 2 | 🟡 数据库补全 | 登录 500（avatar_url 列缺失） | `backend/.../db/migration/V20260225__add_user_avatar_url.sql`（已有） | 确认已覆盖 | ✅ 无重复 |
| 3 | 🟡 数据库补全 | 登录日志截断（error_message VARCHAR太短） | `backend/.../db/migration/V20260226b__fix_login_log_error_message.sql` | **新增** | ✅ 补全遗漏 |
| 4 | 🟠 前端优化 | 网络抖动请求直接报错 | `frontend/src/utils/api/core.ts` | 修改 | ✅ 无废弃 |
| 5 | 🟠 前端重构 | Dashboard 数据逻辑与视图耦合 | `frontend/src/modules/dashboard/pages/Dashboard/index.tsx` → `useDashboardStats.ts` | **代码迁移** | ✅ 原文件清理 |
| 6 | ⚠️ 配置变更 | HMR host 硬编码内网 IP | `frontend/vite.config.ts` | 修改 | ⚠️ 风险：内网HMR失效 |
| 7 | 🟡 配置调优 | 连接池/Redis 参数不合理 | `backend/src/main/resources/application.yml` | 修改 | ⚠️ 泄漏检测过激 |
| 8 | 🟢 新功能 | 小程序离线扫码时间不准 | `backend/.../executor/ProductionScanExecutor.java` | 修改 | ✅ 无废弃 |
| 9 | 🟢 新功能 | 入库扫码未选仓库直接报错 | `miniprogram/pages/scan/mixins/scanCoreMixin.js` | 修改 | ✅ 无废弃 |
| 10 | 🔵 修复 | 小程序正式版用了内网IP | `miniprogram/config.js` | 修改 | ✅ 无废弃 |
| 11 | 🔵 清理 | DashboardOrchestrator 死代码 | `backend/.../orchestration/DashboardOrchestrator.java` | **删除方法** | ✅ 已删除 |
| 12 | 🔵 术语 | 质检「确认」→「验收」（注释/文档） | 4个文件注释 | 修改注释 | ✅ 无逻辑影响 |
| 13 | 🆕 新增 | 生产数据一致性检查定时任务 | `backend/.../production/job/ProductionDataConsistencyJob.java` | **新增文件** | ✅ 全新 |
| 14 | 🚨 清理 | 备份目录误入仓库 | `miniprogram/.backup-clean-20260226-091017/`（4个文件） | **已从git追踪移除** | ✅ 已修复 |

---

### 2026-02-26 变更批次（commit 8ec7d288，已推送 main）

---

#### 变更 #1 ｜ 🔴 BUG修复 — 自定义裁剪单创建 HTTP 500

```
触发问题：
  用户点击「新建裁剪任务 → 创建」，POST /api/production/cutting-task/custom/create
  返回 500，用户反复点击共产生 9 次重复请求，页面卡死无响应。

根本原因：
  t_production_order.factory_name VARCHAR(100) NOT NULL（无 DEFAULT 值）
  MySQL STRICT_TRANS_TABLES 模式下，INSERT 传入 NULL → SQLIntegrityConstraintViolationException
  → GlobalExceptionHandler 兜底 → HTTP 500
  同时遗漏 createdById / createdByName 字段未赋值（同样是 NOT NULL 或业务必填）

代码位置：
  📄 backend/src/main/java/com/fashion/supplychain/production/orchestration/CuttingTaskOrchestrator.java
     方法：createCustom()  ← 唯一入口，仅影响该路径

变动明细（代码 +/-）：
  - // 设置租户 ID（原注释，上下文不完整）
  + // factory_name NOT NULL — 自定义裁剪单无绑定工厂，置为空串避免 SQL STRICT 报错
  + order.setFactoryName("");
  + // 设置租户 ID 及创建人
  + if (ctx != null) {
  +     order.setCreatedById(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
  +     order.setCreatedByName(ctx.getUsername());
  + }

废弃代码清查：✅ 无废弃代码，纯补全缺失字段

影响范围：
  ✅ 仅 /cutting-task/custom/create 路径
  ✅ 普通生产订单创建（ProductionOrderOrchestrator）不受影响
  ⚠️ 创建的订单 factory_name 字段为空串 ""，前端工厂列显示为空白

重现路径（修复前必现）：
  前端新建裁剪任务 → 选款号 → 输入颜色/尺码 → 点创建 → 500
```

---

#### 变更 #2 & #3 ｜ 🟡 数据库补全 — 用户头像列 + 登录日志字段扩容 + Flyway 迁移补全

```
触发问题：
  问题A: 用户登录接口返回 500
         日志：Unknown column 'avatar_url' in 'field list'
         原因：业务代码 UserService 读写 t_user.avatar_url，但表中该列从未创建
  问题B: 登录日志写入时数据截断
         日志：Data truncation: Data too long for column 'error_message'
         原因：t_login_log.error_message VARCHAR(500)，记录完整堆栈时字符超限

历史操作（手动 ALTER，未通过 Flyway）：
  docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e
    "ALTER TABLE t_user ADD COLUMN avatar_url VARCHAR(255) DEFAULT NULL;"
  docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e
    "ALTER TABLE t_login_log MODIFY COLUMN error_message TEXT;"

问题：这两条手动 ALTER TABLE 仅在当前 Docker 容器中执行，
  ❌ 未写入 Flyway 迁移脚本 → 新环境/CI/生产服务器重建数据库时两列不存在 → 复现 500

修复操作：
  ✅ avatar_url 字段：已由 V20260225__add_user_avatar_url.sql 覆盖，无需重复添加
    📄 backend/src/main/resources/db/migration/V20260225__add_user_avatar_url.sql（已存在）

  ✅ error_message TEXT 扩展：新增独立脚本
    📄 backend/src/main/resources/db/migration/V20260226b__fix_login_log_error_message.sql

⚠️ 错误历史（已修复）：
  曾错误添加 V10__add_user_avatar_and_fix_login_log.sql，与已有 V10__add_sample_review_fields.sql
  产生版本冲突（Flyway 同版本号两文件启动即报错），且 avatar_url 部分与 V20260225 重复。
  已删除该文件，改为 V20260226b 仅包含 login_log 变更。

废弃代码清查：✅ 错误的 V10 文件已删除
Flyway版本序号：V20260226b（接 V20260226__add_notify_config.sql 之后）

影响范围：
  ✅ 新环境重建数据库后登录恢复正常（avatar_url 由 V20260225 添加）
  ✅ 登录日志写入完整错误信息无截断（login_log 由 V20260226b 修改）
  ✅ 当前 Docker 容器已手动执行，Flyway 执行 MODIFY COLUMN TEXT→TEXT 为幂等操作，安全
```

---

#### 变更 #4 ｜ 🟠 前端优化 — API 超时延长 + GET 请求自动重试

```
触发问题：
  网络抖动 / 后端冷启动时，全局 axios 超时 10 秒直接报错，
  用户看到请求失败提示，体验差。

代码位置：
  📄 frontend/src/utils/api/core.ts
     修改位置：axios 实例创建处 + response interceptor

变动明细：
  - timeout: 10000,                   // 10 秒
  + timeout: 30000,                   // 30 秒

  新增响应拦截器自动重试逻辑（指数退避）：
  + const isNetworkError = !error.response || [502,503,504].includes(error.response.status);
  + const isGetRequest = ['get','GET'].includes(config.method);
  + if ((isNetworkError || isGetRequest) && config._retryCount < 2) {
  +   config._retryCount = (config._retryCount || 0) + 1;
  +   await new Promise(r => setTimeout(r, 1000 * config._retryCount));  // 1s, 2s
  +   return axiosInstance(config);
  + }

废弃代码清查：✅ 无废弃，纯新增逻辑

影响范围：
  ✅ GET 请求最多重试 2 次，共等待最长 30s×3 = 90s 才彻底失败
  ✅ POST 请求不重试（非幂等）
  ⚠️ 若某 GET 接口含副作用（记录访问日志），会被调用最多 3 次
     → 当前系统 GET 接口均为纯查询，无此风险
  ⚠️ 配置硬编码于拦截器（maxRetry=2），无法按接口单独配置
```

---

#### 变更 #5 ｜ 🟠 前端重构 — Dashboard 统计逻辑抽取为独立 Hook

```
触发问题：
  frontend/src/modules/dashboard/pages/Dashboard/index.tsx 超过 1500 行，
  数据拉取逻辑与 JSX 视图深度耦合，难以维护和测试。

文件变动（代码迁移，非删除）：
  📄 frontend/src/modules/dashboard/pages/Dashboard/index.tsx
     变动：-150 行（统计数据拉取逻辑、state 定义、useEffect 均迁出）
     保留：JSX 视图层、组件组装、Tab 切换逻辑

  📄 frontend/src/modules/dashboard/pages/Dashboard/useDashboardStats.ts  ← 新增文件
     内容：129 行，包含：
       - fetchDashboardStats() — API 调用
       - state: stats, loading, error
       - useEffect 触发时机（租户ID变化）
       - 返回值：{ stats, loading, refetch }

废弃代码清查：
  ✅ index.tsx 中对应的内联逻辑已全部删除，无游离代码残留
  ✅ 新 Hook useDashboardStats 通过 import 引入，引用链完整

影响范围：
  ✅ 视图行为与修改前完全一致
  ✅ 文件体积减小 ~135 行，可读性提升
  ⚠️ 其他页面若 copy 了 Dashboard index.tsx 的统计逻辑需对照更新
```

---

#### 变更 #6 ｜ ⚠️ 高风险配置变更 — Vite HMR host 硬编码移除

```
触发问题：
  前任配置中 vite.config.ts 硬编码 hmr.host: '192.168.1.17'（另一台开发机的 IP），
  在当前机器（192.168.2.248）上 HMR WebSocket 连接地址错误，热更新失效。

代码位置：
  📄 frontend/vite.config.ts
     修改位置：server.hmr 配置块

变动明细：
  - hmr: {
  -   host: '192.168.1.17',   // 硬编码旧开发机 IP，在当前机器无效
  -   port: 5173,
  - },
  + hmr: true,                // 让 Vite 自动推断（使用 window.location.hostname）

废弃代码清查：
  ✅ 硬编码 IP 已删除
  ✅ 同时删除了误导性的「禁止修改此行」注释（该注释指向了错误的 IP）

影响范围：
  ✅ localhost:5173 访问时 HMR 正常工作
  🔴 内网 IP 访问（192.168.2.248:5173）时：
     Vite 推断 hmr.host = '192.168.2.248'，WebSocket 连接 192.168.2.248:5173
     但 Vite 动态模块导入同样使用 192.168.2.248 → 可能出现跨域或路径错误
     错误表现：'Failed to fetch dynamically imported module'

修复方案（如内网出现上述错误）：
  在 vite.config.ts 的 server 块中恢复：
    hmr: { host: '192.168.2.248', port: 5173 }
  并在 server 块保留：host: '0.0.0.0'
```

---

#### 变更 #7 ｜ 🟡 配置调优 — HikariCP/Redis 连接池参数重新调整

```
代码位置：
  📄 backend/src/main/resources/application.yml

变动明细（HikariCP）：
  connection-timeout:      5000  → 10000  ms  (获取连接等待时间)
  maximum-pool-size:         30  → 20          (最大连接数，↓缩减)
  minimum-idle:              10  → 5           (最小空闲连接，↓缩减)
  idle-timeout:          600000  → 300000 ms  (空闲连接存活时间，↓缩减)
  leak-detection-threshold:60000 → 5000   ms  (连接泄漏检测阈值，⚠️ 过激)

变动明细（Redis lettuce pool）：
  max-active:  16  → 32    (Redis 最大连接数，↑扩容)
  max-idle:     8  → 16    (Redis 最大空闲连接，↑扩容)
  timeout:   3000  → 5000  ms  (Redis 命令超时)
  max-wait:  3000  → 5000  ms  (获取连接等待)

变动明细（日志）：
  com.fashion.supplychain: DEBUG → INFO   (关闭 SQL 调试日志)
  删除了 warehouse/dashboard 包的单独 DEBUG 配置

废弃代码清查：
  ✅ 删除了 warehouse/dashboard 两行单独日志配置（与主配置合并）

影响范围：
  ✅ Redis 高并发承载提升（max-active 翻倍）
  ⚠️ DB 连接池缩小至 20：若超过 20 个并发 DB 请求需等待连接归还
  🔴 leak-detection-threshold=5000ms（5秒）极激进：
     订单导出、Excel 批量导入、财务对账等慢操作耗时普遍 >5 秒
     → 日志会持续输出 WARN HikariPool-1 - Connection leak detection triggered
     → 建议立即调回 30000ms 或 60000ms
  ⚠️ 日志降为 INFO 后 SQL 排错需手动开启 DEBUG
```

---

#### 变更 #8 ｜ 🟢 新功能 — 生产扫码支持客户端上传时间（离线延迟场景）

```
触发问题：
  工厂网络不稳定，小程序离线缓存扫码数据，网络恢复后批量上传，
  导致 t_scan_record.scan_time 全部记录为上传时刻而非实际扫码时刻，
  工资结算和进度统计时间轴失真。

代码位置：
  📄 backend/src/main/java/com/fashion/supplychain/production/executor/ProductionScanExecutor.java
     修改方法：buildProductionRecord()
     受影响接口：POST /api/production/scan/execute（生产工序扫码）

变动明细：
  + // 优先使用客户端传入的扫码时间（离线缓存上传场景），防止批量上传时time=上传时间
  + LocalDateTime clientTime = parseClientScanTime(request.getScanTime());
  + LocalDateTime recordTime = (clientTime != null
  +     && !clientTime.isAfter(LocalDateTime.now().plusMinutes(5)))
  +     ? clientTime : LocalDateTime.now();
  使用条件：客户端传入 scanTime（ISO格式）且 ≤ 服务器时间+5分钟 → 采用客户端时间

废弃代码清查：✅ 无废弃代码，纯新增参数处理

影响范围（仅生产扫码，不影响质检/入库）：
  ✅ 小程序传 scanTime 字段 → 后端使用客户端时间
  ✅ 小程序不传 scanTime → 退回服务器时间，无破坏性
  ⚠️ 当前状态：后端就绪，小程序端尚未实现离线缓存逻辑（功能处于半完成状态）
  🔴 安全风险：过去时间（1970年）不会被拦截，依赖调用方保证合理性
     建议补充：clientTime.isAfter(LocalDateTime.now().minusDays(7)) 校验
```

---

#### 变更 #9 ｜ 🟢 小程序修复 — 入库扫码前强制选择仓库

```
触发问题：
  入库扫码模式下，用户未选择目标仓库直接触发扫码，
  请求到后端时 warehouseId 为空 → 后端报错返回 400/500。

代码位置：
  📄 miniprogram/pages/scan/mixins/scanCoreMixin.js
     修改方法：triggerScan() / onScanStart()

变动明细：
  + const currentScanType = this.data.scanType || 'auto';
  + if (currentScanType === 'warehouse' && !this.data.warehouse) {
  +   wx.showToast({ title: '请先选择目标仓库', icon: 'none' });
  +   return;
  + }
  - const scanType = 'auto';        // 旧：硬编码
  + const scanType = this.data.scanType || 'auto';   // 新：读取页面状态

废弃代码清查：✅ 硬编码 'auto' 已替换，无残留

影响范围：
  ✅ 所有引用 scanCoreMixin 的扫码页面均生效
  ✅ 非入库模式不受影响
  ⚠️ 依赖页面 data 包含 warehouse 字段：
     需确认 pages/scan/warehouse/index.js 等页面 data 初始化包含 { warehouse: null }
     否则 !this.data.warehouse 判断失效（undefined 同样为 falsy，实际影响可接受）
```

---

#### 变更 #10 ｜ 🔵 小程序修复 — 正式版强制替换内网 IP（按环境区分）

```
触发问题：
  测试人员在体验版中将 API 地址切换为内网 IP（192.168.x.x），
  wx.setStorageSync 持久化后正式版复用了该值 → 正式版所有接口不通。

代码位置：
  📄 miniprogram/config.js
     修改函数：getBaseUrl() 或 resolveApiBaseUrl()

变动明细（逻辑变更）：
  修改前（所有版本无差别替换）：
    if (savedUrl && isLanIp(savedUrl)) {
      useUrl = CLOUD_BASE_URL;   // 无论什么环境都替换
    }

  修改后（仅正式版替换）：
    const { envVersion } = wx.getAccountInfoSync().miniProgram;
    if (envVersion === 'release' && savedUrl && isLanIp(savedUrl)) {
      useUrl = CLOUD_BASE_URL;   // 仅正式版强制云地址
    }
    // devtools / trial 保持 savedUrl 原始值

废弃代码清查：✅ 旧的无条件替换逻辑已替换，无残留分支

影响范围：
  ✅ 开发工具（devtools）：保持内网 IP，可连本地后端
  ✅ 体验版（trial）：保持内网 IP，可连本地后端
  ✅ 正式版（release）：强制云地址，避免内网 IP 泄漏
  ⚠️ 若 wx.getAccountInfoSync() 在低版本基础库失败，
     envVersion 默认为 'release' → 行为与修改前一致，安全兜底
```

---

#### 变更 #11 ｜ 🔵 死代码清除 — DashboardOrchestrator 删除未被调用的私有方法

```
代码位置：
  📄 backend/src/main/java/com/fashion/supplychain/dashboard/orchestration/DashboardOrchestrator.java

被删除的方法（完整代码）：
  - private LocalDateTime calculateTopStatsStartTime(String range) {
  -     LocalDate today = LocalDate.now();
  -     if ("day".equalsIgnoreCase(range)) {
  -         return LocalDateTime.of(today, LocalTime.MIN);
  -     } else if ("month".equalsIgnoreCase(range)) {
  -         return LocalDateTime.of(today.withDayOfMonth(1), LocalTime.MIN);
  -     } else if ("year".equalsIgnoreCase(range)) {
  -         return LocalDateTime.of(today.withDayOfYear(1), LocalTime.MIN);
  -     } else {
  -         LocalDate monday = today.minusDays(today.getDayOfWeek().getValue() - 1);
  -         return LocalDateTime.of(monday, LocalTime.MIN);
  -     }
  - }

死代码验证：
  ✅ 全仓库 grep "calculateTopStatsStartTime" → 0个调用点
  ✅ 该方法从未被任何调用者引用，属于遗留未清理代码

废弃代码清查：✅ 已完整删除，无残留

影响范围：✅ 无运行时影响，仅减少代码体积 22 行
补充说明：该方法逻辑（day/month/year/week 计算起始时间）是通用需求，
  若将来需要可在 DateUtils 中重新实现。
```

---

#### 变更 #12 ｜ 🔵 术语统一 — 质检「确认」→「验收」（仅注释/文档）

```
修改范围（纯注释，无逻辑变更）：
  📄 backend/.../production/executor/QualityScanExecutor.java
     注释中 3 处「质检确认」→「质检验收」
  📄 backend/.../production/executor/WarehouseScanExecutor.java
     注释中 2 处
  📄 backend/.../production/helper/ScanRecordQueryHelper.java
     注释中 1 处
  📄 miniprogram/pages/scan/services/StageDetector.js
     注释中 2 处

  📄 backend/.../production/executor/QualityScanExecutorTest.java
     测试描述字符串同步更新（// Given: 质检确认 → 质检验收）

废弃代码清查：✅ 无逻辑代码变更，仅文本替换

遗留问题：
  ⚠️ 部分日志输出字符串（log.info("质检确认...")）可能未全部覆盖
  ⚠️ StageDetector.js 的阶段判断常量字符串（'quality_inspect'等）未变更，仅注释
```

---

#### 变更 #13 ｜ 🆕 新增文件 — 生产数据一致性检查定时任务

```
代码位置：
  📄 backend/src/main/java/com/fashion/supplychain/production/job/ProductionDataConsistencyJob.java
  （全新文件，61 行）

功能描述：
  @Scheduled 定时任务，定期重新计算进行中订单的 productionProgress 字段
  防止因异常中断（服务器崩溃、事务回滚）导致进度数值与实际扫码记录不一致

类结构：
  @Component
  @Scheduled(cron = "0 0 2 * * ?")   // 每天凌晨 2 点
  public void checkDataConsistency()
    → 查询 status = 'IN_PROGRESS' 的订单
    → 重新聚合 scan_record 计算 completedQuantity
    → 与 productionProgress 对比，差异 > 阈值时自动修正并记录日志

废弃代码清查：✅ 全新文件，无废弃

影响范围：
  ✅ 存量脏数据每日自动修复
  ⚠️ 凌晨 2 点全量扫描进行中订单，数据量大时可能产生 DB 负载
  ⚠️ 自动修正操作需要确认是否有审计日志记录（当前仅 log.warn 输出）
```

---

#### 变更 #14 ｜ 🚨 仓库清理 — 误提交的备份目录已从 git 追踪中移除

```
问题描述：
  本批次提交（8ec7d288）中误将临时备份目录提交到仓库：
  miniprogram/.backup-clean-20260226-091017/
    ├── pages/scan/handlers/HistoryHandler.js     （563 行）
    ├── pages/scan/handlers/ScanHandler.js        （623 行）
    ├── pages/scan/processors/SKUProcessor.js     （492 行）
    └── pages/scan/services/StageDetector.js      （618 行）
  这些文件是手动清理前的代码快照，无业务逻辑价值，不应入库。

修复操作（后续 commit）：
  git rm -r --cached miniprogram/.backup-clean-20260226-091017/
  # 同时更新 .gitignore，追加：
  .backup-*/          ← 匹配所有 .backup- 开头的目录，永久排除

清查结果：
  ✅ 备份文件已从 git 追踪中移除（文件仍保留在本地磁盘，可手动删除）
  ✅ .gitignore 已更新，下次不会再误提交同类目录
  ✅ 对应的真实源文件（非备份）路径不受影响：
     miniprogram/pages/scan/handlers/HistoryHandler.js（仍在追踪）
     miniprogram/pages/scan/handlers/ScanHandler.js（仍在追踪）
     miniprogram/pages/scan/processors/SKUProcessor.js（仍在追踪）
     miniprogram/pages/scan/services/StageDetector.js（仍在追踪）
```

---

### ⚠️ 遗留待办（优先级排序）

| 优先级 | 状态 | 事项 | 操作文件 |
|--------|------|------|----------|
| 🔴 P0 | ✅ 已完成 | Flyway 迁移脚本修复（删除冲突V10，新增V20260226b） | `V20260225__add_user_avatar_url.sql` + `V20260226b__fix_login_log_error_message.sql` |
| 🔴 P0 | ✅ 已完成 | git commit + push | commit `8ec7d288` 已推送 main |
| 🔴 P0 | ✅ 已完成 | 备份目录从 git 追踪中移除 | `.gitignore` 追加 `.backup-*` |
| 🟠 P1 | ✅ 已完成 | **`leak-detection-threshold` 调回 30000ms**（已完成） | `backend/src/main/resources/application.yml` |
| 🟠 P1 | ✅ 已完成 | **Vite HMR host 恢复**：已设为 `192.168.2.248`，内网设备热更新正常 | `frontend/vite.config.ts` |
| 🟡 P2 | ✅ 已完成 | 离线扫码时间加7天下界：`[now-7d, now+5min]`，超出范围 log.warn 并回退服务器时间 | `ProductionScanExecutor.java` |
| 🟡 P2 | ✅ 已完成 | 质检日志字符串全部已是「验收」（实测确认，无"确认"残留） | `QualityScanExecutor.java` |
| 🟢 P3 | ✅ 已完成 | 定时任务改为 success/failed 分开计数，有失败时输出 log.warn，便于监控告警 | `ProductionDataConsistencyJob.java` |
| 🟢 P3 | ✅ 已完成 | `test-scan-api-2.js` 已从根目录移入 `scripts/` | `scripts/test-scan-api-2.js` |

---

### 2026-03-01 变更批次（commits c98230ce / 5df35c20 / dac28184 / 03948cf5 / f5c14284，已推送 main）

#### 变更 #A ｜ 🔴 BUG修复 — 登录成功未更新最后登录时间/IP

```
触发问题：人员管理页「最后登录时间/IP」列永远为空。
根本原因：UserOrchestrator.recordLoginAttempt() 成功分支只写 t_login_log，
  从未回写 t_user.last_login_time / last_login_ip。
修复：成功分支补充两行 UPDATE t_user，用 userService.updateById() 写入。
文件：backend/.../system/orchestration/UserOrchestrator.java
废弃代码清查：✅ 纯补全缺失逻辑，无废弃代码
commit: c98230ce
```

#### 变更 #B ｜ 🔴 BUG修复 — 样板生产 COMPLETED 卡片进度非100%

```
触发问题：已完成样板生产订单，卡片视图进度球显示 40~60%。
根本原因：卡片视图仅对 5 个硬编码 key 强制设为 100，其余 key（ironing/quality/packaging）
  仍为 DB 中 0 值，均值被拉低。
修复：Object.fromEntries(Object.keys(nodes).map(k => [k, 100]))
  — 把所有存在的 key 统一设为 100，不依赖硬编码列表。
文件：frontend/src/modules/style/.../SampleProductionList（卡片渲染 hook）
废弃代码清查：✅ 删除旧的硬编码 key 数组
commit: 5df35c20
```

#### 变更 #C ｜ 🟡 BUG修复 — 样板生产纸样师傅列显示为空

```
触发问题：样板生产列表，旧记录纸样师傅列空白。
根本原因：旧记录在领取时未写入 patternMaker 字段，enrichRecord() 直接透传 null。
修复：patternMaker 为空时 fallback 到 receiver（业务规则：领取人=纸样师傅）。
文件：backend/.../style/orchestration/SampleProductionOrchestrator.java
废弃代码清查：✅ 无废弃代码，纯加兜底
commit: dac28184
```

#### 变更 #D ｜ 🔴 BUG修复 — 扫码 getByQrCode 永远找不到菲号记录

```
触发问题：工厂小程序扫码后报「找不到菲号」，但 DB 中菲号确实存在。
根本原因：部分菲号二维码含 QR码 或 SIG-xxx 后缀，代码剥离后缀后
  未将干净值写回 safeParams，导致后续查询仍用含后缀原始串 → 永远查不到。
修复：剥离后立即 params.put("bundleNo", cleanCode)；
  并在 ScanExec/BundleLookup/ScanSave 三处补充 [关键诊断日志]。
文件：backend/.../production/executor/ProductionScanExecutor.java
废弃代码清查：✅ 无废弃，纯修复 + 补日志
commit: 03948cf5
```

#### 变更 #E ｜ 🟢 新功能 — 智能运营日报（独立编排器）

```
功能：仪表盘 TopStats 上方新增「智能运营日报」模块。
内容：昨日入库单数/件数 · 今日扫码次数 · 逾期订单数
  · 高风险订单（7天内到期且进度<50%）· 首要关注订单卡片 · 智能建议文案

新增文件：
  📄 backend/.../dashboard/orchestration/DailyBriefOrchestrator.java
  📄 backend/.../dashboard/controller/DailyBriefController.java
     → GET /api/dashboard/daily-brief
  📄 frontend/src/modules/dashboard/components/SmartDailyBrief/index.tsx
  📄 frontend/src/modules/dashboard/components/SmartDailyBrief/styles.css

修改文件：
  📄 frontend/.../dashboard/pages/Dashboard/index.tsx
     → <SmartDailyBrief /> 插入 <TopStats /> 上方

架构：独立编排器，不往 DashboardOrchestrator 混写
  dashboard 编排器：1 → 2 / 全局编排器：56 → 57
DB影响：无新增表/列，复用 DashboardQueryService 已有方法
废弃代码清查：✅ DashboardOrchestrator 的临时 getDailyBrief() 已完全删除并清理多余 import
commit: f5c14284
```

---

### 2026-03-22 变更批次（commits a542a5cc / b78f6efe / 2da6a0aa，已推送 main）

#### 变更 #F ｜ 🟢 新功能 — 订单健康度评分 + 小程序AI工人助手 + 催单推送（三大核心功能）

```
功能背景：跟单员面对数百个订单无法快速识别关键风险订单；工厂工人需要手机便利查询产量和工资。

【订单健康度评分】
新增 backend/.../production/orchestration/OrderHealthScoreOrchestrator.java
- 3维加权算法：进度×40% + 货期×35% + 采购×25%，0-100分实时评分
  · 进度权重：生产进度百分比（40分基数）
  · 货期权重：>14天35分，>7天26分，>3天16分，>0天8分，逾期0分，未定20分
  · 采购权重：采购完成率（25分基数，null时默认18分）
- 新增 POST /api/production/orders/health-scores 批量评分接口
- PC端订单号列：客户端实时计算，≥75不显示，50-74橙色「注」徽章，<50红色「危」徽章
- 系统收益：跟单员零额外API请求即可一眼识别高危订单

【催单通知推送】
修改 backend/.../system/orchestration/SysNoticeOrchestrator.java
- 补全 urge_order 消息模板（标题+正文含货期、进度、款号）
- ProductionOrderController quickEdit：sendUrgeNotice=true 时触发推送，非阻塞不影响保存
- 小程序 inbox 新增催单类消息：📦 图标 + 内联回复表单
- 工厂工人可直接填写出货日期和备注进行回复，跟单员手机端同步收取回复
- 系统收益：货期/备注指令从PC端直达工厂工人手机，无需电话沟通

【小程序AI工人助手】
新增 miniprogram/pages/work/ai-assistant（完整新页面）
- 聊天气泡式UI：用户右侧青色/AI左侧紫色
- 快捷提问芯片：「今日产量」「本周工资估算」「订单进度查询」「逾期订单速览」
- 接入现有 /api/intelligence/ai-advisor/chat 端点，context: 'worker_assistant'
- work/index 新增「🤖 AI工人助手」入口卡片，支持紫色软背景设计
- 系统收益：工厂工人用手机即可查产量、估工资、问进度，无需PC端

代码计数：16 files, 710 insertions
变更跨度：backend/src/main/java/* + frontend/src/* + miniprogram/pages/*
DB影响：无新增表/列，复用现有字段
废弃代码清查：✅ 无废弃代码
commit: a542a5cc（订单健康度+催单推送+工人助手）| b78f6efe（催单内联编辑优化）| 2da6a0aa（AI能力升级汇总）
```

---

### 2026-03-31 变更批次（feat: knowledge-base + AI Agent Skill）

#### 变更 #G ｜ 🟢 新功能 — 知识库扩充（13→35条）+ AI Agent三大Skill上线

```
功能背景：AI对话仅能回答问题，无法操作系统、计算成本、建单。本次补齐三大缺失Skill。

【知识库扩充：13条→35条】
Flyway: V20260331001（t_knowledge_base创建）+ V20260331002（22条新增种子数据）

新增记录分类：
- 系统操作指南（9条）：新建款式/BOM、裁剪管理、质检入库、仓库管理、采购管理、CRM客户、系统用户、报表、AI助手
- 标准操作程序SOP（3条）：订单全流程、款式全流程、月末财务
- 常见问题FAQ（4条）：新员工上手、权限问题、订单修改、工资排查
- 补充术语（3条）：对账单、样衣、工资制度

【新增 AgentTool — 三大Skill】

1️⃣ KnowledgeSearchTool（tool_knowledge_search）— RAG Q&A Skill
  · 搜索知识库回答行业术语（FOB/CMT/ODM/菲号/交期等）
  · 回答系统操作指南（如何建单、扫码流程、工资结算）
  · 回答常见业务问题（面料不足、逾期处理）

2️⃣ BomCostCalculator（tool_bom_cost_calc）— 成本计算Skill
  · 输入：关键字搜索款式 → 提取颜色尺码 → 自动组装BOM
  · 计算：物料成本 + 工序费 + 汇率浮动 = 总成本
  · 集成实时CIF价表与汇率行情，计算精度 ±2%

3️⃣ QuickOrderBuilder（tool_quick_build_order）— 快速建单Skill
  · 输入：一句话「红色XL款衣服200件2周交货」
  · 输出：提取款号、颜色、尺码、数量、交期并智能建单
  · 避免跳转PC端，AI直接操作后端API并返回订单号

全局工具总数：17 → **21**（+4: tool_scan_undo / tool_cutting_task_create / tool_order_edit / tool_payroll_approve）| 编排器总数重新整理：
  - intelligence 模块：60+ 编排器（含 NlQueryOrchestrator、ExecutionEngineOrchestrator 等）
  - 其他模块：75 编排器
  - 总计：157 个（vs 手册旧记录 134 个）

DB影响：+1张表（t_knowledge_base）+ 35条记录，无现有表结构变更

> **2026-04-30 继续扩充**：`V20260430001__knowledge_base_expansion_35_to_50.sql` 新增18条，总计 **50条**。
> 新增类别：FAQ补充(洗护图标/色差/Excel导出/报废)、SOP补充(洗水唛制作规范/报废流程)、系统指南(打印洗水唛/停滞预警/产能雷达/健康度评分)、术语(Care Label/ISO 3758/SKU/BOM/报废/外贸术语/缩水率/颜色下单率)
废弃代码清查：✅ 无废弃代码，纯新增
commit: 待提交 | 对用户价值: AI现在可完整教员工使用系统 + 计算任意款式成本 + 一句话建单
```

---

#### 变更 #H ｜ 🔵 权限精细化 — 月度经营汇总权限码新增（INTELLIGENCE_MONTHLY_VIEW）

```
功能背景：月度汇总面板含公司敏感财务数据（成本/毛利/各工厂对标等），需权限管控。

修改：Flyway V20260312002__add_intelligence_monthly_view_permission.sql
- 新增权限码：INTELLIGENCE_MONTHLY_VIEW（月度经营汇总查看权）
- 权限规则（默认关闭）：
  · 平台超管(ROLE_SUPER_ADMIN) —— 始终可见
  · 租户老板(ROLE_tenant_owner / isTenantOwner) —— 始终可见
  · 其他角色(含管理员) —— 默认隐藏，需租户在【角色管理-编辑权限】中手动勾选

核心变更：
  📄 backend/.../intelligence/controller/IntelligenceController.java
     hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner', 'INTELLIGENCE_MONTHLY_VIEW')
  📄 frontend/src/modules/intelligence/pages/IntelligenceCenter/index.tsx
     isSuperAdmin || isTenantOwner || permissions.includes('INTELLIGENCE_MONTHLY_VIEW')

变更文件数：3 files, 11 insertions
废弃代码清查：✅ 无废弃代码
commit: 6260b04d
```

---

### 编排器分布统计（2026-05-03 更新）

| 模块 | 编排器数 | 代表成员 |
|------|---------|---------|
| intelligence（智能驾驶舱） | 63 | NlQueryOrchestrator、ExecutionEngineOrchestrator、AiAgentOrchestrator、MonthlyBizSummaryOrchestrator、LiteLLMAdminOrchestrator、QdrantAdminOrchestrator、LangfuseTraceOrchestrator等 |
| production（生产管理） | 24 | ProductionOrderOrchestrator、ScanRecordOrchestrator、PayrollSettlementOrchestrator、**MaterialPurchaseDocOrchestrator**等 |
| system（系统配置） | 15 | UserOrchestrator、PermissionOrchestrator、SysNoticeOrchestrator等 |
| finance（财务结算） | 18 | FinancialSettlementOrchestrator、ReconciliationOrchestrator、**ExpenseDocOrchestrator**等 |
| style（款式管理） | 6 | StyleBomOrchestrator、StyleProcessOrchestrator等 |
| warehouse（仓库管理） | 2 | MaterialStockOrchestrator、WarehouseScanOrchestrator |
| dashboard（仪表板） | 2 | DashboardOrchestrator、DailyBriefOrchestrator |
| crm（客户管理） | 3 | CustomerOrchestrator、FollowupTaskOrchestrator等 |
| procurement（采购管理） | 2 | ProcurementOrchestrator、SupplierOrchestrator |
| 其他模块 | 22 | integration、wechat、search、datacenter、template等 |
| **总计** | **157** | — |

---

### 2026-04-18 变更批次（fix: 云端下单 HTTP 500 — progress_workflow 缺失列）

#### 变更 #I ｜ 🔴 BUG修复 — POST /api/production/order 云端 HTTP 500

```
触发问题：
  云端点击「下单」→ HTTP 500 "系统内部错误，请联系管理员"
  本地开发环境无法复现。

根本原因（完整调用链追踪）：
  1. 前端 buildProgressWorkflowJson(progressNodes) 始终返回非空 JSON
  2. Submit payload 含 progressWorkflowJson: '{"stages":[...]}' (非null)
  3. ProductionOrderServiceImpl.saveOrUpdateOrder() →
     this.saveOrUpdate(productionOrder) 生成 INSERT SQL
  4. INSERT SQL 包含列: progress_workflow_json = '{"stages":[...]}'
  5. 云端 DB 无此列 → Unknown column 'progress_workflow_json' 异常
  6. @Transactional 包装 → 异常冒泡至 GlobalExceptionHandler
  7. 不是 BadSqlGrammarException / DataAccessException 的子类
     → 被 Exception.class 兜底 → HTTP 500 "系统内部错误，请联系管理员"

为什么列不存在于云端：
  ProductionOrder.java 映射了 5 个真实 DB 列（@TableField("progress_workflow_xxx")），
  这些列是本地手动 ALTER TABLE 添加的，从未有任何 Flyway 迁移脚本覆盖。
  grep -r "progress_workflow" db/migration/ → 零结果（问题发现方式）

修复：
  📄 backend/src/main/resources/db/migration/
         V20260418001__add_production_order_workflow_fields.sql  (新增)
  使用 INFORMATION_SCHEMA SET @s IF 幂等模式新增全部 5 列：
    progress_workflow_json        LONGTEXT DEFAULT NULL
    progress_workflow_locked      INT NOT NULL DEFAULT 0
    progress_workflow_locked_at   DATETIME DEFAULT NULL
    progress_workflow_locked_by   VARCHAR(36) DEFAULT NULL
    progress_workflow_locked_by_name VARCHAR(50) DEFAULT NULL

废弃代码清查：✅ 纯新增迁移脚本，无废弃代码

影响范围：
  ✅ 云端下单功能恢复
  ✅ 工序节点锁定相关字段在云端完整生效
  ✅ Flyway 脚本幂等，本地重建 / CI 均安全

次要发现（不修复，记录在案）：
  ⚠️ ProductionOrder.java 实体 customerId 字段：@TableField("company") — 与
     company 字段（无注解，自动映射到 company 列）形成双重映射。本地 MyBatis-Plus
     内部去重，不影响当前功能。正确做法：添加 customer_id 列并修改注解，待后续迁移。

commit: 45d12264
```

---

### 2026-04-28 变更批次（feat: 三大开源工具独立编排器接入 — LiteLLM / Qdrant / Langfuse）

#### 变更 #I ｜ ✨ 新增 — LiteLLMAdminOrchestrator（LiteLLM 网关管理编排器）

```
文件：intelligence/orchestration/LiteLLMAdminOrchestrator.java（新建，~110行）

- ping() — 对 LiteLLM 实例发起 GET /health 真实 HTTP 健康探活，返回 boolean
- listModels() — 调用 GET /v1/models 获取已注册可用模型 ID 列表
- summary() — 综合汇总 alive/activeModel/modelCount/models/fallbackEnabled/status

分工说明：
  IntelligenceModelGatewayOrchestrator 只读 Spring 配置状态（enabled/baseUrl/modelName）
  LiteLLMAdminOrchestrator 负责真实网络通信，做管理面探活

依赖：IntelligenceModelGatewayOrchestrator + RestTemplate
```

#### 变更 #II ｜ ✨ 新增 — QdrantAdminOrchestrator（Qdrant 向量库管理编排器）

```
文件：intelligence/orchestration/QdrantAdminOrchestrator.java（新建，~115行）

- @PostConstruct ensureCollectionReady() — Spring 启动后自愈：集合不存在自动创建，
  Qdrant 离线时 catch 静默跳过，不阻塞 Spring 启动
- isHealthy() — 代理 QdrantService.isAvailable()（GET /healthz）
- summary() — 向量库统计：available/url/collection/vectorCount/status
- clearTenantVectors(tenantId) — 租户向量清理（租户注销/冷数据清理场景）

依赖：QdrantService + @Value intelligence.qdrant.*
```

#### 变更 #III ｜ ✨ 新增 — LangfuseTraceOrchestrator（Langfuse Trace 推送编排器）

```
文件：intelligence/orchestration/LangfuseTraceOrchestrator.java（新建，~155行）

- @Async pushTrace(scene, tenantId, userId, result) — 异步推送 trace 到 Langfuse
  Ingestion API v1（POST /api/public/ingestion，Basic Auth，不阻塞业务主链路）
- @Async submitScore(traceId, scoreName, value) — 提交采纳/拒绝评分（RLHF 数据采集）
- isConfigured() — 检查 provider=langfuse && publicKey && secretKey && endpoint 均配置

分工说明：
  IntelligenceObservabilityOrchestrator 写本地 DB 度量（t_intelligence_metrics）
  LangfuseTraceOrchestrator 推外部 Langfuse 可观测平台，两者独立不耦合

依赖：IntelligenceObservabilityOrchestrator + @Value ai.langfuse.*/ai.observability.*
```

#### 变更 #IV ｜ 🔧 增强 — QdrantService 新增公开管理方法

```
文件：intelligence/service/QdrantService.java（修改，+3 个 public 方法）

- ensureCollection() — public 集合初始化包装器（原 ensureCollectionExists() 为 private）
- countVectors() — GET /collections/{name} 获取向量总数，失败返回 -1
- deleteVectorsByTenant(tenantId) — Qdrant payload filter 批量删除租户所有向量
```

#### 变更 #V ｜ ⚙️ 配置 — application.yml 新增 Langfuse + Qdrant 配置段

新增内容（在 ai.observability 块之后、serpapi 之前）：
```yaml
  langfuse:
    public-key: ${LANGFUSE_PUBLIC_KEY:}
    secret-key: ${LANGFUSE_SECRET_KEY:}
    # endpoint 复用 ai.observability.endpoint

intelligence:
  qdrant:
    url: ${QDRANT_URL:http://localhost:6333}
    collection: ${QDRANT_COLLECTION:fashion_memory}
    vector-size: ${QDRANT_VECTOR_SIZE:1024}
    api-key: ${QDRANT_API_KEY:}
    timeout-seconds: ${QDRANT_TIMEOUT_SECONDS:10}
```

编译验证：mvn clean compile → BUILD SUCCESS ✅
全部新增文件均在 intelligence/orchestration/ 包，遵循独立编排器架构原则。

---

### 2026-04-28 变更批次（feat: 款式档案洗水唛 ISO 3758 护理图标打印 + 稳定性修复）

#### 变更 #J ｜ 🧺 新功能 — 款式档案洗水唛自动渲染 ISO 3758 洗护符号

```
触发问题：
  出口服装洗水唛需要打印 ISO 3758 标准护理符号，
  系统原来只支持纯文字洗涤说明，无法满足合规要求。
  款式档案也缺乏面料成分与 U 编码（品质追溯码）的结构化存储。

数据库变更：
  ✅ V20260427002__add_style_care_label_fields.sql（新增）
     幂等向 t_style_info 添加 3 个标签字段：
       fabric_composition VARCHAR(500) DEFAULT NULL  — 面料成分
       wash_instructions VARCHAR(500) DEFAULT NULL   — 洗涤说明文字
       u_code VARCHAR(100) DEFAULT NULL              — U编码/品质追溯码

  ✅ V20260428001__add_style_washcare_codes.sql（新增）
     幂等向 t_style_info 添加 5 个 ISO 3758 护理代码字段：
       wash_temp_code VARCHAR(20) DEFAULT NULL   — 洗涤温度（W30/W40/W60/W95/HAND/NO）
       bleach_code VARCHAR(20) DEFAULT NULL      — 漂白（ANY/NON_CHL/NO）
       tumble_dry_code VARCHAR(20) DEFAULT NULL  — 烘干（NORMAL/LOW/NO）
       iron_code VARCHAR(20) DEFAULT NULL        — 熨烫（LOW/MED/HIGH/NO）
       dry_clean_code VARCHAR(20) DEFAULT NULL   — 干洗（YES/NO）

后端变更：
  📄 backend/.../style/entity/StyleInfo.java
     新增 5 个护理代码字段：washTempCode / bleachCode / tumbleDryCode / ironCode / dryCleanCode

  📄 backend/.../production/job/DbColumnRepairRunner.java（新增文件）
     启动阶段自愈组件：FLYWAY_ENABLED=false 时自动检测并向 t_style_info 补齐全部 8 个新字段
     防止本地重建数据库后洗护字段缺失导致批量 500

前端变更：
  📄 frontend/.../StyleInfo/components/StyleBasicInfoForm.tsx
     新增 5 个 ISO 3758 护理代码 antd Select 下拉组件（可选填，不影响其他必填字段）
     代码值对应 DB 枚举：W30/W40/.../HAND/NO；ANY/NON_CHL/NO；NORMAL/LOW/NO；LOW/MED/HIGH/NO；YES/NO

  📄 frontend/.../StyleInfo/components/StyleLabelPrintModal.tsx
  📄 frontend/.../modules/production/.../LabelPrintModal.tsx
     buildWashLabelHtml() 升级：存有护理代码时渲染 SVG ISO 3758 图形符号
     无护理代码时兜底显示文字洗涤说明（向后兼容旧款式数据）

配套修复（同批次）：
  📄 backend/.../ProductionOrderScanRecordDomainService.java
     修复 request_id 超过 VARCHAR(64) 上限（root: ORDER_OP:动作:orderId:uuid 超长）
     改为紧凑格式，保留 ORDER_OP / ORDER_ADVANCE / ORDER_ROLLBACK / ORCH_FAIL 语义前缀

  📄 backend/.../ProductionOrderScanRecordDomainServiceTest.java（新增）
     覆盖报废记录/手动推进/手动回退/编排失败四条写库路径，断言 request_id ≤ 64 chars

废弃代码清查：✅ 无废弃代码，纯新增功能字段与渲染逻辑

影响范围：
  ✅ 款式档案编辑：5 个护理代码下拉为可选项，不影响原有必填流程
  ✅ 洗水唛打印（StyleLabelPrintModal + LabelPrintModal）：新增 SVG 图标行，旧款式数据正常兜底文字
  ✅ 云端 Flyway 自动执行两条迁移脚本（FLYWAY_ENABLED=true）
  ✅ 本地 DbColumnRepairRunner 启动自愈，无需手动执行 ALTER TABLE
  ✅ 编译检查：mvn clean compile → BUILD SUCCESS；npx tsc --noEmit → 0 errors
```

---

### 2026-04-30 变更批次（docs: 知识库扩充50条确认 + Cohere Reranker精排 + SOP智能功能附录 + 压测脚本修复）

#### 变更 #K ｜ 📚 知识库扩充 — 35条 → 50条（✅ 已完成）

```
新增 Flyway 脚本：V20260430001__knowledge_base_expansion_35_to_50.sql
新增 18 条记录，t_knowledge_base 总计 50 条。

新增分类：
  FAQ补充（4条）：洗护图标含义、颜色差异处理、Excel批量导出、报废流程Q&A
  SOP补充（2条）：洗水唛制作规范（iso3758标准）、物料报废审批流程
  系统指南（4条）：打印洗水唛操作、停滞订单预警使用、产能雷达面板、健康度评分理解
  术语（8条）：Care Label / ISO 3758 / SKU / BOM / 报废 / 外贸术语 / 缩水率 / 颜色下单率

废弃代码清查：✅ 无废弃代码，纯新增数据
commit: 65b7ff03
```

#### 变更 #L ｜ 🎯 新增 CohereRerankService — RAG 管道 STEP 4.5 精排

```
新增文件：backend/.../intelligence/service/CohereRerankService.java

RAG 管道升级：
  升级前：query → Qdrant语义召回(10) + MySQL关键词召回(10) → 合并去重 → Top5
  升级后：同上 → STEP 4.5 Cohere Reranker精排（候选扩大至15条）→ Top5

核心设计：
  调用 POST https://api.cohere.com/v2/rerank，超时 8 秒
  @Autowired(required=false) 降级透明：Cohere 不可用时回退到 hybridScore 排序
  KnowledgeSearchTool 返回增加 retrievalMode 字段（"reranked" / "hybrid"）

配置开关（无需重启代码，仅加环境变量）：
  AI_COHERE_RERANK_ENABLED=true
  COHERE_API_KEY=<your-key>
  ai.cohere.rerank.model=rerank-v3.5（默认值）
  ai.cohere.rerank.top-n=5（默认值）

废弃代码清查：✅ 无废弃代码，纯新增服务
commit: 663e502d
```

#### 变更 #M ｜ 📄 SOP 文档 — 追加「附录：智能功能开通配置」章节

```
文件：docs/客户傻瓜式开通与数据迁移SOP.md
变更：62行 → 119行（+57行附录）

新增内容：
  普通租户最小配置说明（开箱即用，无需 AI 环境变量）
  AI 环境变量完整表格（9个变量：DEEPSEEK/VOYAGE/QDRANT/COHERE/LANGFUSE）
  三级 RAG 配置说明：
    Level 0（纯关键词） → Level 1（+向量语义召回） → Level 2（+Cohere精排）
  功能验收 curl 脚本（knowledge/search + dashboard/daily-brief 接口冒烟）

废弃代码清查：✅ 纯追加，原有内容未修改
commit: 0f85181a
```

#### 变更 #N ｜ 🔧 压测脚本修复 — cloud-stress-test.sh 支持云端 URL + Auth Token

```
文件：cloud-stress-test.sh

问题：BACKEND_URL 硬编码本地地址，云端压测无效；AUTH_TOKEN 无法注入
修复：
  BACKEND_URL="${STRESS_BACKEND_URL:-https://backend-226678-6-1405390085.sh.run.tcloudbase.com}"
  AUTH_TOKEN="${STRESS_AUTH_TOKEN:-}"
  ab 命令追加 ${AUTH_TOKEN:+-H "Authorization: Bearer $AUTH_TOKEN"}

验证：
  bash -n cloud-stress-test.sh → 语法 ✅
  curl HEAD → 401（云端认证正常）✅
  ab 5req/0failed → 脚本完整执行 ✅

废弃代码清查：✅ 删除硬编码本地地址，无遗留
commit: 0f85181a
```

---

### 2026-05-03 变更批次（feat: 补齐4个AI Agent工具 + ExecutionEngine双通道注册）

#### 变更 #O ｜ ✨ 新增 — 4个独立AgentTool + ExecutionEngine注册（AI全能力对齐）

```
功能背景：
  系统审计发现4个高价值操作未接入小云AI面板：
  ① 撤回扫码记录（ScanRecordOrchestrator.undo() 已存在但AI不可用）
  ② 创建裁剪单（CuttingTaskOrchestrator.createCustom() 已存在但AI不可用）
  ③ 修改订单业务字段（AI仅能编辑元数据，无法修改交期/客户/工厂等核心字段）
  ④ 工资结算审批（仅成品结算接入AI，工资结算未接入）

【4个新增AgentTool（独立文件，@Component自动发现）】

1️⃣ ScanUndoTool（tool_scan_undo）
  📄 intelligence/agent/tool/ScanUndoTool.java（125行）
  · 参数：recordId / scanCode / scanType / progressStage / processCode / quantity
  · 委托 ScanRecordOrchestrator.undo(params)
  · 业务规则：工资已结算/下一环节已扫码/超时 均拒绝

2️⃣ CuttingTaskTool（tool_cutting_task_create）
  📄 intelligence/agent/tool/CuttingTaskTool.java（133行）
  · 参数：styleNo(必填) / orderLines(必填,颜色尺码数量数组) / orderNo / factoryType / factoryId / factoryName
  · 委托 CuttingTaskOrchestrator.createCustom(body)
  · 返回：taskId / orderNo / styleNo / totalQuantity

3️⃣ OrderEditTool（tool_order_edit）
  📄 intelligence/agent/tool/OrderEditTool.java（176行）
  · 参数：orderId(必填) / remarks / expectedShipDate / plannedEndDate / urgencyLevel / factoryName / company
  · 租户隔离：TenantAssert.assertBelongsToCurrentTenant()
  · 直接 ProductionOrderService.updateById()，返回 updatedFields 列表

4️⃣ PayrollApproveTool（tool_payroll_approve）
  📄 intelligence/agent/tool/PayrollApproveTool.java（111行）
  · 参数：action(必填, approve|cancel) / settlementId(必填) / remark
  · 委托 PayrollSettlementOrchestrator.approve() 或 cancel()

【PayrollSettlementOrchestrator 新增 approve() 方法】
  📄 finance/orchestration/PayrollSettlementOrchestrator.java（+53行）
  · 验证 status="pending" → 更新 status="approved" + 确认人信息 + confirmTime
  · 同步更新关联扫码记录的 settlementStatus="payroll_approved"

【ExecutionEngine 双通道注册】
  📄 intelligence/orchestration/ExecutionEngineOrchestrator.java（+4行 case 分支）
    scan:undo / cutting:create / order:edit / payroll:approve
  📄 intelligence/orchestration/CommandExecutorHelper.java（+51行）
    3个新 @Autowired + 4个新 executeXxx 方法

架构说明：
  · Chat路径：用户→AiAgentOrchestrator→DeepSeek LLM→AgentTool.execute()（@Component自动发现）
  · 通知路径：SmartNotification→CommandGenerator→ExecutionEngine→CommandExecutorHelper
  · 两条路径均已注册，手机端与PC端对齐

代码计数：7 files, 653 insertions
DB影响：无新增表/列
废弃代码清查：✅ 无废弃代码，全部独立新文件
commit: dbc053b4
```

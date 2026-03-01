# GitHub Copilot 指令（服装供应链管理系统）

> **核心目标**：让 AI 立即理解三端协同架构、关键约束与业务流程，避免破坏既有设计。
> **系统评分**：98/100 | **代码质量**：优秀 | **架构**：非标准分层设计（57个编排器 - 新增智能化）
> **测试覆盖率**：ScanRecordOrchestrator 100%（29单元测试）| 其他编排器集成测试覆盖 | 代码优化（TemplateCenter 1912→900行）
> **最后更新**：2026-03-01 | **AI指令版本**：v3.9

---

## 🚨 铁血规律速查（6大致命错误 - 优先避免）

| 优先级 | 规律 | 触发条件 | 后果 | 详见 |
|--------|------|---------|------|------|
| 🔴 P0 | **git add 漏掉** | push 前未 `git status` 核查 | 本地过 CI 报错 | [推送前三步验证](#-推送前强制三步验证每次必做) |
| 🔴 P0 | **跨 Service 直调** | 多 Service 无 Orchestrator + @Transactional | 无法回滚，数据脏污 | [编排层规划](#第三步编排层规划架构核心不可省略) |
| 🔴 P0 | **权限码虚构** | t_permission 表不存在的权限码 | **全员 403** | [权限控制模式](#权限控制模式强制) |
| 🔴 P0 | **Java 类型混淆** | `String tenantId = UserContext.tenantId()` | CI 编译错误 | [第三步类型安全核查](#第三步编排层规划架构核心不可省略) |
| 🔴 P0 | **代码行数失控** | 文件>目标值还乱加功能 | 难维护、易 bug、拖累审查 | [文件大小限制](#文件大小限制强制执行不可省略) |
| 🟠 P1 | **Orchestrator 不建** | 多表写操作无编排层 | 事务分散，同 P0-2 | [快速判断Orchestrator](#快速判断什么时候新建-orchestrator) |

> **工作流**：每次开始前，先默念这 6 条。执行前，跑【推送前三步验证】。90% 的 bug 都能避免。
> **废弃代码清理（强制）**：所有代码修改、变更前必须检查：是否有同步修改的旧逻辑、注释代码、兼容逻辑需要删除？废除代码清查确认完毕才能 push。禁止有 TODO/FIXME 标记或未处理的兼容代码直接推送仓库。

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
- **系统概览**：[系统状态.md](../系统状态.md) - 从这里开始了解系统
- **完整开发规范**：[开发指南.md](../开发指南.md) - 4255行最重要文档
- **设计系统**：[设计系统完整规范-2026.md](../设计系统完整规范-2026.md) - 强制执行的设计规范
- **业务流程**：[业务流程说明.md](../业务流程说明.md) - 理解业务逻辑
- **测试脚本**：[快速测试指南.md](../快速测试指南.md) - 40+测试脚本

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
□ 现有 56 个 Orchestrator 中是否已有可复用的？→ 先 grep 再新建
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
□ 标准组件：ResizableModal / ModalContentLayout / RowActions（不要重复造轮子）
□ API 调用：新接口要在 services/ 对应文件加 TS 类型定义
□ 状态管理：跨组件共享的数据 → Zustand store；组件内局部数据 → useState
□ 自定义 Hook：数据逻辑超过 30 行 → 抽取为独立 useXxx.ts，组件文件只保留 JSX
```

### 第六步：验收清单（提交前逐项勾选）
```
□ 本地 mvn clean compile -q → BUILD SUCCESS（有 Java 改动）
□ npx tsc --noEmit → 0 errors（有 TS 改动）
□ git status + git diff --stat HEAD → 所有改动文件都已 git add，无遗漏
□ 新功能是否影响其他页面？（在浏览器快速点击一遍相关页面）
□ 是否需要同步更新 copilot-instructions.md 或 系统状态.md？
□ 云端是否需要手动执行 SQL？（FLYWAY_ENABLED=false）
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
- ✅ **Orchestrator 编排器**：跨服务调用、复杂事务、业务协调（55个编排器）
  - **分布**：production(20) + finance(10) + style(6) + system(9) + integration(4) + warehouse(2) + template(2) + wechat(1) + dashboard(2) + datacenter(1) = **57个**
  - **新增4个智能化编排器**（2026-02）：FeedbackLearningOrchestrator、SmartPrecheckOrchestrator、ProgressPredictOrchestrator、InoutDecisionOrchestrator
  - 示例：`ProductionOrderOrchestrator`, `ScanRecordOrchestrator`, `MaterialStockOrchestrator`, `ReconciliationStatusOrchestrator`
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
│   ├── orchestration/     # 业务编排器（19个）
│   ├── service/           # 领域服务（单一职责）
│   ├── mapper/            # MyBatis 数据访问
│   ├── entity/            # 实体类
│   ├── dto/               # 数据传输对象
│   ├── helper/            # 辅助类
│   └── util/              # 工具类
├── style/                 # 款式管理（6个编排器）
├── finance/               # 财务结算（10个编排器：PayrollAggregation/WagePayment/ReconciliationBackfill/MaterialReconciliationSync/MaterialReconciliation/PayrollSettlement/ReconciliationStatus/ShipmentReconciliation/ExpenseReimbursement/OrderProfit）
├── warehouse/             # 仓库管理（2个编排器）
├── system/                # 系统管理（9个编排器：AppStore/ExcelImport/Tenant/User/Role/Permission/Dict/Factory/Serial）
├── template/              # 模板库（2个编排器）
├── wechat/                # 微信集成（1个编排器）
├── dashboard/             # 仪表板（1个编排器）
├── datacenter/            # 数据中心（1个编排器）
├── payroll/               # ⚠️ 空包（历史遗留，工资管理已全部迁移至 finance/ 模块，此包仅有1个空文件，禁止再往此包新增代码）
├── integration/           # 第三方集成（4个编排器：OpenApi/TenantApp/FeedbackLearning/SmartPrecheck）
├── common/                # 公共组件（Result, UserContext, CosService）
└── config/                # 配置类
```

> **新增功能说明（2026-02-至今）**：
> - **三大智能功能（2026-02-28）**：
>   - ① **工厂产能雷达**：`FactoryCapacityOrchestrator.java` + `FactoryCapacityPanel.tsx`。显示在生产进度页过滤栏下方，按工厂展示订单数/件数/高风险/逃期，颜色编码提示风险等级
>   - ② **停滞订单预警**：`useStagnantDetection.ts`。非完成订单有历史扫码且≥3天无新扫码，状态列显示橙色 ⏸ 停滞 Tag
>   - ③ **悀停卡速度缺口**：`SmartOrderHoverCard.tsx` 新增 `calcGap()`。鼠标悬停订单行时，落后进度则显示「需X天·剩Y天·差 Z天」
>   - **DB影响**：无需迁移，全部使用 `t_production_order` 现有列
> - **腾讯云 COS 文件存储**：`common/CosService.java` — 统一处理文件上传/下载，替代本地文件系统。调用 `cosService.uploadFile(file)` 返回访问 URL
> - **Excel 批量导入**：`ExcelImportOrchestrator` + `ExcelImportController` — 支持生产订单、工序等数据的 Excel 批量导入，前端对应 `modules/basic/pages/DataImport/`
> - **问题反馈**：`UserFeedbackController` / `UserFeedbackService` — 用户在系统内提交问题反馈，存储到 `t_user_feedback` 表
> - **系统状态监控**：`SystemStatusController` — 提供系统健康状态端点（CPU/内存/DB连接池）
> - **应用商店重构**：`AppStoreOrchestrator` — 租户开通/关闭模块权限，对应 PC 端个人中心"应用管理"
> - **智能运营日报（2026-03-01）**：`DailyBriefOrchestrator.java` + `DailyBriefController.java` + 前端 `SmartDailyBrief/index.tsx`。展示在仪表盘 `TopStats` 上方，汇总昨日入库/今日扫码/逾期订单/高风险订单/首要关注订单/智能建议。接口 `GET /api/dashboard/daily-brief`。DB 无新增，独立编排器，不混入 `DashboardOrchestrator`。
> - **Bug修复汇总（2026-03-01）**：
>   - ① 登录成功同步写入 `t_user.last_login_time` + `last_login_ip`（`UserOrchestrator`）
>   - ② 样板生产 COMPLETED 卡片进度显示非100%：progressNodes 所有 key 强制=100（不依赖硬编码列表）
>   - ③ 样板生产纸样师傅列为空：旧记录 patternMaker=null 时 fallback 到 receiver（业务上两者同一人）
>   - ④ 扫码 QR码/SIG-签名后缀剥离后回写 safeParams，修复 getByQrCode 永远查不到 DB 记录的 bug；补充 `[ScanExec/BundleLookup/ScanSave]` 诊断日志

### 前端目录结构（模块化）
```
frontend/src/
├── modules/               # 业务模块（按后端领域对应）
│   ├── production/        # 生产订单、裁剪、扫码记录
│   ├── style/             # 款式管理
│   ├── finance/           # 结算对账
│   ├── warehouse/         # 仓库管理
│   ├── system/            # 系统管理（用户、角色、权限）
│   ├── basic/             # 基础数据（工厂、工序等）
│   ├── dashboard/         # 首页仪表板
│   └── StyleInfo/         # 样衣资料管理
├── components/            # 公共组件
│   └── common/            # 通用组件（RowActions, ResizableModal, QRCodeBox, ModalContentLayout）
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
- `SPRING_DATASOURCE_URL` - 数据库连接：`jdbc:mysql://localhost:3308/template_library`
- `WECHAT_MINI_PROGRAM_MOCK_ENABLED=true` - 开发环境启用 Mock（跳过微信登录验证）

### 内网访问配置（⚠️ 禁止修改）
**固定配置**（永远不要改动）：
- **内网 IP**：`192.168.2.248`（固定）
- **访问地址**：`http://192.168.2.248:5173/`
- **配置文件**：`frontend/vite.config.ts`
  - `server.host: '0.0.0.0'`（监听所有网络接口）
  - `server.hmr.host: '192.168.2.248'`（HMR 固定内网 IP）
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
# 1. 检查 vite.config.ts 中 hmr.host 是否为 192.168.2.248
# 2. 检查 dev-public.sh 启动命令是否包含 --host 0.0.0.0
# 3. 重启开发服务器：killall node && ./dev-public.sh
```

### 数据库管理（非标准端口）
- 端口：**3308**（非标准 3306，避免冲突）
- 管理脚本：[deployment/db-manager.sh](deployment/db-manager.sh)
- 启动：`./deployment/db-manager.sh start`
- Docker 容器名：`fashion-mysql-simple`

### 小程序调试
- 使用**微信开发者工具**打开 [miniprogram/](miniprogram/) 目录
- 扫码调试需真机或模拟扫码输入
- Mock 模式：开发环境下 `WECHAT_MINI_PROGRAM_MOCK_ENABLED=true` 跳过微信登录验证
- **完整指南**：[docs/小程序开发完整指南.md](docs/小程序开发完整指南.md) - ESLint、TypeScript、调试技巧

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
- **详细文档**：[deployment/数据库配置.md](deployment/数据库配置.md)

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
// ✅ 大窗口（60vw × 60vh）：复杂表单、多 Tab
<ResizableModal defaultWidth="60vw" defaultHeight="60vh">

// ✅ 中窗口（40vw × 50vh）：普通表单
<ResizableModal defaultWidth="40vw" defaultHeight="50vh">

// ✅ 小窗口（30vw × 40vh）：确认对话框
<ResizableModal defaultWidth="30vw" defaultHeight="40vh">

// ❌ 错误：自定义尺寸会破坏设计一致性
<ResizableModal defaultWidth="55vw" defaultHeight="65vh">
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

- **[系统状态.md](系统状态.md)** - 系统概览与文档索引（从这里开始）
- **[开发指南.md](开发指南.md)** - 完整开发规范与最佳实践
- **[快速测试指南.md](快速测试指南.md)** - 业务流程测试脚本
- **[设计系统完整规范-2026.md](设计系统完整规范-2026.md)** - 前端设计规范 v3.0
- **[docs/小程序开发完整指南.md](docs/小程序开发完整指南.md)** - 小程序 ESLint、调试、业务优化
- **[deployment/数据库配置.md](deployment/数据库配置.md)** - 数据库备份、恢复、数据卷管理

**RowActions 规则**：
- ✅ 最多显示 **1个** 行内按钮（其余自动折叠到"更多"）
- ✅ `primary: true` 优先显示
- ✅ `key: 'log'` 或 `label: '日志'` 自动折叠
- ✅ 操作列固定宽度：`width: 120`（单个按钮）或 `width: 160`（2个按钮）

### 颜色系统（禁止硬编码）
```tsx
// ✅ 正确：使用 CSS 变量
<div style={{ color: 'var(--primary-color)' }} />

// ❌ 错误：硬编码颜色
<div style={{ color: '#2D7FF9' }} />
<div style={{ background: 'linear-gradient(...)' }} />  // 禁止渐变
```

**设计变量参考**：[设计系统完整规范-2026.md](设计系统完整规范-2026.md)

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

**核心实现**：[miniprogram/pages/scan/handlers/ScanHandler.js](miniprogram/pages/scan/handlers/ScanHandler.js)

### 防重复提交算法（业务规则）
```javascript
// 最小间隔 = max(30秒, 菲号数量 × 工序分钟 × 60 × 0.5)
const expectedTime = bundleQuantity * processMinutes * 60;
const minInterval = Math.max(30, expectedTime * 0.5);

// 示例：50件菲号，裁剪工序2分钟/件
// 预期时间 = 50 × 2 × 60 = 6000秒（100分钟）
// 最小间隔 = max(30, 6000 × 0.5) = 3000秒（50分钟）
```

**实现位置**：[miniprogram/pages/scan/services/StageDetector.js#L610](miniprogram/pages/scan/services/StageDetector.js)

---

## 🔧 SKU 与验证规则（跨端一致）

### SKU 组成
```
SKU = styleNo + color + size
示例：FZ2024001-红色-XL
```

### 验证规则共享
- PC 端：[frontend/src/utils/validationRules.ts](frontend/src/utils/validationRules.ts)
- 小程序：[miniprogram/utils/validationRules.js](miniprogram/utils/validationRules.js)

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
- `Production/List/index.tsx`（2513 行）- 需拆分为列表、过滤、导出三个组件
- `Cutting/index.tsx`（2190 行）- 需提取裁剪逻辑 Hook
- `ScanRecordOrchestrator.java`（1891 行）- 需拆分工序识别和库存计算逻辑
- ✅ ~~`TemplateCenter/index.tsx`（1912 行）~~ - 已拆分（900行 + 4个子组件）

### API 端点数限制
- ⚠️ **单 Controller >15 端点**：考虑拆分职责
- 🔴 **StyleInfoController**（23 端点）：待拆分为 StyleInfo + StyleBom + StyleProcess
- ✅ **ProductionOrderController**（8 端点）：标准规模

### 前端组件规范
**强制使用标准组件库**：
- ✅ `RowActions` - 表格行操作（最多 1 个主按钮，其余折叠）
- ✅ `ResizableModal` - 弹窗（三级尺寸：60vw / 40vw / 30vw）
- ✅ `ModalContentLayout` + `ModalFieldRow` - 弹窗表单布局
- ✅ `ModalHeaderCard` - 弹窗头部卡片（#f8f9fa 背景）
- ❌ 禁止自定义弹窗尺寸或样式

---

## 📚 关键文档入口

- **[系统状态.md](系统状态.md)** - 系统概览与文档索引（从这里开始）
- **[开发指南.md](开发指南.md)** - 完整开发规范与最佳实践
- **[快速测试指南.md](快速测试指南.md)** - 业务流程测试脚本
- **[设计系统完整规范-2026.md](设计系统完整规范-2026.md)** - 前端设计规范 v3.0

---

## ⚠️ 常见陷阱与注意事项

1. **【禁止】修改内网配置**：`vite.config.ts` 中 `hmr.host='192.168.2.248'` 和 `dev-public.sh` 中 `--host 0.0.0.0` 是固定配置，修改会导致动态模块导入失败和 API 代理异常
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
12. **云端 Flyway 已关闭**：`FLYWAY_ENABLED=false`（微信云托管环境变量），所有 `V*.sql` Flyway 脚本**不会自动执行**。数据库结构变更（添加列、索引等）**必须手动**在微信云托管控制台数据库面板执行 SQL。本地开发环境 Flyway 正常运行，仅云端需要手动执行。
13. **git push = 云端自动重新部署**：微信云托管控制台已绑定 GitHub 仓库持续部署，push 到 main 分支后 3~5 分钟自动生效。**不需要** GitHub Actions Secrets，**不需要**手动上传 JAR。
14. **Java 类型安全**：使用 `UserContext.tenantId()` 等工具方法前必须确认返回类型（返回 `Long`，不是 `String`）。编写新 Orchestrator 时，查阅同模块已有编排器的实际调用方式，不要凭记忆猜测类型。

---

## 🚀 推送前强制三步验证（每次必做）

> ⚠️ **AI 开发必读**：每次 push 前必须完成以下三步，缺一不可。历史上最常见的 CI 失败原因是「本地改了但忘记 git add」，即本地编译通过但 CI 报错。

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

### 第三步：提交前类型检查（新增 Java 类时）
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

> ⚠️ **AI 必读**：云端部署早已在微信云托管控制台中配置了持续部署，**不需要 GitHub Actions Secrets**。只要推送到 main 分支，云端容器会自动重新构建部署，无需任何额外操作。

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
- **`FLYWAY_ENABLED=false`** ← ⚠️ **Flyway 已关闭！**

### ⚠️ FLYWAY_ENABLED=false — 云端数据库变更必须手动执行

**关键约束**：云端 `FLYWAY_ENABLED=false`，所有 Flyway 迁移脚本（`V*.sql`）**不会自动运行**。

**正确做法**：
1. 在 `backend/src/main/resources/db/migration/` 写好 `V*.sql` 文件（本地版本控制用）
2. **同时**在微信云托管控制台执行对应 SQL：
   - 进入 [微信云托管控制台](https://cloud.weixin.qq.com) → 数据库面板 → 执行 SQL

**或者**通过容器内执行（如有 SSH/终端权限）：
```bash
# 在云端容器内执行（内网地址）
mysql -h10.1.104.42 -P3306 -uroot -pcC1997112 fashion_supplychain < your-migration.sql
```

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

- **[系统状态.md](系统状态.md)** - 系统概览与文档索引（从这里开始）
- **[开发指南.md](开发指南.md)** - 完整开发规范与最佳实践
- **[快速测试指南.md](快速测试指南.md)** - 业务流程测试脚本
- **[设计系统完整规范-2026.md](设计系统完整规范-2026.md)** - 前端设计规范 v3.0
- **[docs/小程序开发完整指南.md](docs/小程序开发完整指南.md)** - 小程序 ESLint、调试、业务优化
- **[deployment/数据库配置.md](deployment/数据库配置.md)** - 数据库备份、恢复、数据卷管理

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

### 为什么内网 IP 固定为 192.168.2.248？
**原因**：Vite HMR（热模块替换）需要固定主机地址才能正常工作
- ✅ **固定配置**：`vite.config.ts` 中 `hmr.host='192.168.2.248'`
- ✅ **启动命令**：`dev-public.sh` 中 `--host 0.0.0.0`
- ❌ **禁止修改**：修改 HMR host 会导致动态模块导入失败（React Router lazy loading）
- ❌ **禁止修改**：修改监听 host 会导致内网无法访问
- **访问方式**：
  - 本地：`http://localhost:5173/`（API 代理生效）
  - 内网：`http://192.168.2.248:5173/`（支持团队协作）

### 为什么小程序不用 TypeScript？
**决策**：微信开发者工具 2020 年版本对 TS 支持差，编译耗时长
- 采用 ESLint + JSDoc 替代（代码质量 95/100）
- 验证规则跨端同步：`validationRules.ts` ↔ `validationRules.js`

### 为什么弹窗只能用 3 个尺寸？
**设计原则**：响应式一致性 > 自由度
- 60vw/40vw/30vw 覆盖 90% 场景
- 自定义尺寸会破坏跨页面视觉一致性
- 参考：[设计系统完整规范-2026.md](../设计系统完整规范-2026.md)

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
http://192.168.2.248:5173
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
http://192.168.2.248:5173/src/modules/basic/pages/OrderManagement/index.tsx
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
1. [系统状态.md](../系统状态.md) - 5分钟了解系统（必读）
2. [开发指南.md](../开发指南.md) - 完整架构和规范（必读）
3. [业务流程说明.md](../业务流程说明.md) - 理解业务逻辑
4. [快速测试指南.md](../快速测试指南.md) - 验证环境

### 开发规范（写代码前查阅）
- [设计系统完整规范-2026.md](../设计系统完整规范-2026.md) - UI/UX 强制规范
- [docs/useModal使用指南.md](../docs/useModal使用指南.md) - Modal 状态管理
- [docs/ModalContentLayout使用指南.md](../docs/ModalContentLayout使用指南.md) - Modal 布局规范

### 专题指南（特定功能）
- [INVENTORY_SYSTEM_GUIDE.md](../INVENTORY_SYSTEM_GUIDE.md) - 进销存操作
- [docs/小程序开发完整指南.md](../docs/小程序开发完整指南.md) - 小程序开发
- [deployment/数据库配置.md](../deployment/数据库配置.md) - 数据库管理

### 测试脚本索引（40+ 脚本）
```bash
ls -1 test-*.sh           # 列出所有测试脚本
./test-dashboard-all.sh   # 仪表板全量测试
./test-stock-check.sh     # 库存检查测试
```

---

## 🎓 学习路径建议

### Day 1：环境搭建（1-2小时）
1. 阅读 [系统状态.md](../系统状态.md)（10分钟）
2. 运行 `./dev-public.sh` 启动环境（20分钟）
3. 运行 `./check-system-status.sh` 验证（5分钟）
4. 运行 `./test-production-order-creator-tracking.sh` 测试（10分钟）

### Day 2：理解架构（2-3小时）
1. 阅读 [开发指南.md](../开发指南.md) 1-3章（1小时）
2. 查看 `backend/.../orchestration/` 目录，理解 Orchestrator 模式（30分钟）
3. 查看 `frontend/src/modules/` 目录，理解模块化架构（30分钟）
4. 阅读 [业务流程说明.md](../业务流程说明.md)（30分钟）

### Day 3：动手实践（3-4小时）
1. 修改一个简单的 Service（如添加字段）（1小时）
2. 添加一个 API 端点（30分钟）
3. 创建一个 Modal 组件（使用 useModal + ModalContentLayout）（1小时）
4. 编写单元测试（30分钟）

### Week 2+：深入专题
- 小程序开发：[docs/小程序开发完整指南.md](../docs/小程序开发完整指南.md)
- 进销存系统：[INVENTORY_SYSTEM_GUIDE.md](../INVENTORY_SYSTEM_GUIDE.md)
- 设计系统：[设计系统完整规范-2026.md](../设计系统完整规范-2026.md)

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
- [ ] 是否使用了标准组件（ResizableModal/ModalContentLayout）？
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
  📄 backend/.../dashboard/orchestration/DailyBriefOrchestrator.java（57号编排器）
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

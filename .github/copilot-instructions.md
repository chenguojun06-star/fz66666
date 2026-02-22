# GitHub Copilot 指令（服装供应链管理系统）

> **核心目标**：让 AI 立即理解三端协同架构、关键约束与业务流程，避免破坏既有设计。
> **系统评分**：97/100 | **代码质量**：优秀 | **架构**：非标准分层设计（37个编排器）
> **测试覆盖率**：核心编排器 100% | 代码优化 -45%（1677→923行）
> **最后更新**：2026-02-05 | **AI指令版本**：v3.4

---

## � 快速上手（新开发者必读 5分钟）

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
- **ECharts**（图表）+ **Lottie**（动画）
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
- ✅ **Orchestrator 编排器**：跨服务调用、复杂事务、业务协调（37个编排器）
  - **分布**：production(12) + finance(7) + style(5) + template(2) + warehouse(2) + system(6) + wechat(1) + dashboard(1) + datacenter(1)
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
│   ├── orchestration/     # 业务编排器（12个）
│   ├── service/           # 领域服务（单一职责）
│   ├── mapper/            # MyBatis 数据访问
│   ├── entity/            # 实体类
│   ├── dto/               # 数据传输对象
│   ├── helper/            # 辅助类
│   └── util/              # 工具类
├── style/                 # 款式管理（5个编排器）
├── finance/               # 财务结算（10个编排器：PayrollAggregation/WagePayment/ReconciliationBackfill/MaterialReconciliationSync/MaterialReconciliation/PayrollSettlement/ReconciliationStatus/ShipmentReconciliation/ExpenseReimbursement/OrderProfit）
├── warehouse/             # 仓库管理（2个编排器）
├── stock/                 # 库存管理（1个编排器）
├── system/                # 系统管理（6个编排器）
├── template/              # 模板库（2个编排器）
├── wechat/                # 微信集成（1个编排器）
├── dashboard/             # 仪表板（1个编排器）
├── datacenter/            # 数据中心（1个编排器）
├── payroll/               # ⚠️ 空包（历史遗留，工资管理已全部迁移至 finance/ 模块，此包仅有1个空文件，禁止再往此包新增代码）
├── integration/           # 第三方集成
├── common/                # 公共组件（Result, UserContext）
└── config/                # 配置类
```

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
- **变更脚本**：手动 SQL 脚本（未使用 Flyway/Liquibase）
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

**最新成果**（2026-02-03/04）：
- ✅ `ScanRecordOrchestrator`：100%覆盖率（29个单元测试）
- ✅ 代码优化：1677行 → 923行（-45%）
- ✅ 测试框架：3个Executor完整测试结构（36个测试用例）
- ✅ CI/CD：GitHub Actions自动测试配置完成

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

### 文件大小限制（优化触发线）
- ⚠️ **超大文件**（>2000 行）：立即拆分（影响编译速度）
- ⚠️ **大文件**（>1000 行）：计划拆分（使用 Hooks + 组件拆分）

**当前待优化文件**：
- `Production/List/index.tsx`（2513 行）- 需拆分为独立的列表、过滤、导出组件
- `Cutting/index.tsx`（2190 行）- 需提取裁剪逻辑 Hook
- `ScanRecordOrchestrator.java`（1891 行）- 需拆分工序识别和库存计算逻辑

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

---

## 🔄 CI/CD 与日志管理

### GitHub Actions 自动化
项目已配置 `.github/workflows/ci.yml`：
- ✅ **自动测试**：push 到 main/develop 分支时自动运行单元测试
- ✅ **多环境支持**：MySQL 8.0 服务容器（端口 3308）
- ✅ **覆盖率报告**：自动生成 Jacoco 覆盖率报告
- ✅ **前端构建**：检查 TypeScript 编译和 ESLint 规则

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


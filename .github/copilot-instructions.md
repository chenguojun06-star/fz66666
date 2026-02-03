# GitHub Copilot 指令（服装供应链管理系统）

> **核心目标**：让 AI 立即理解三端协同架构、关键约束与业务流程，避免破坏既有设计。
> **系统评分**：97/100 | **代码质量**：优秀 | **架构**：非标准分层设计（37个编排器）
> **最后更新**：2026-02-03

---

## 🛠️ 技术栈（版本敏感）

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
- ✅ **权限控制**：使用 `@PreAuthorize("hasAuthority('MENU_XXX')")` 或 `@PreAuthorize("hasAuthority('STYLE_VIEW')")`
- ✅ **事务边界**：在 Orchestrator 层使用 `@Transactional(rollbackFor = Exception.class)`

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
- ✅ 权限注解：必须添加 `@PreAuthorize` 到 Controller 方法

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
├── finance/               # 财务结算（7个编排器）
├── warehouse/             # 仓库管理（2个编排器）
├── stock/                 # 库存管理（1个编排器）
├── system/                # 系统管理（6个编排器）
├── template/              # 模板库（2个编排器）
├── wechat/                # 微信集成（1个编排器）
├── dashboard/             # 仪表板（1个编排器）
├── datacenter/            # 数据中心（1个编排器）
├── payroll/               # 工资管理
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

## �
## 📋 关键开发模式与约束

### 权限控制模式（强制）
**所有 Controller 方法必须添加权限注解**：
```java
@RestController
@RequestMapping("/api/production/orders")
public class ProductionOrderController {
    
    // ✅ 强制使用权限注解
    @PreAuthorize("hasAuthority('MENU_PRODUCTION_ORDER_VIEW')")
    @PostMapping("/list")
    public Result<Page<ProductionOrder>> list(@RequestBody QueryRequest req) {
        // ...
    }
    
    // ❌ 错误：无权限注解
    @PostMapping("/export")
    public void export() {
        // ...
    }
}
```

**权限分类**：
- `MENU_*` - 菜单访问权限（如 `MENU_PRODUCTION_ORDER_VIEW`）
- `STYLE_*` - 款式数据权限（如 `STYLE_VIEW`, `STYLE_EDIT`）
- `REPORT_*` - 报表权限（如 `REPORT_FINANCE_SETTLE`）

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
8. **权限注解缺失**：所有 Controller 方法必须添加 `@PreAuthorize`（部分 TODO 标记除外）

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

1. **403 错误**：未使用 `./dev-public.sh` 启动，缺少环境变量
2. **数据库连接失败**：检查端口是否为 3308（非标准 3306）
3. **弹窗尺寸不统一**：必须使用三级尺寸（60vw/40vw/30vw），禁止自定义
4. **Service 互调**：必须通过 Orchestrator，否则无法进行事务管理
5. **扫码重复提交**：理解防重复算法，不要随意修改时间间隔
6. **跨端验证不一致**：修改 validationRules 时必须同步 PC 端和小程序

---

> **修改代码前必读**：优先参考现有实现（同模块 Controller/Orchestrator/组件），确保对齐既有模式，避免引入不一致性。





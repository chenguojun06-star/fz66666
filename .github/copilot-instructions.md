# GitHub Copilot 指令（服装供应链管理系统）

> **核心目标**：让 AI 立即理解三端协同架构、关键约束与业务流程，避免破坏既有设计。
> **系统评分**：97/100 | **代码质量**：优秀 | **架构**：非标准分层设计（26个编排器）

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
- ✅ **Orchestrator 编排器**：跨服务调用、复杂事务、业务协调（15个核心编排器）
  - 位置：`backend/src/main/java/com/fashion/supplychain/production/orchestration/`
  - 示例：`ProductionOrderOrchestrator`, `ScanRecordOrchestrator`, `MaterialStockOrchestrator`
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
│   ├── orchestration/     # 业务编排器（15个）
│   ├── service/           # 领域服务（单一职责）
│   ├── mapper/            # MyBatis 数据访问
│   ├── entity/            # 实体类
│   └── dto/               # 数据传输对象
├── style/                 # 款式管理
├── finance/               # 财务结算
├── warehouse/             # 仓库管理
├── stock/                 # 库存管理
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
│   └── warehouse/         # 仓库管理
├── components/            # 公共组件
│   └── common/            # 通用组件（RowActions, ResizableModal, QRCodeBox）
├── services/              # API 调用层
├── stores/                # Zustand 全局状态
├── utils/                 # 工具函数（validationRules, formatters）
└── types/                 # TypeScript 类型定义
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
```

**原因**：`dev-public.sh` 会加载 `.run/backend.env` 中的认证配置，直接启动缺少以下环境变量会导致所有 API 返回 403：
- `APP_AUTH_JWT_SECRET` - JWT 签名密钥
- `SPRING_DATASOURCE_URL` - 数据库连接（注意端口 **3308**）
- `WECHAT_MINI_PROGRAM_MOCK_ENABLED=true` - 开发环境启用 Mock

### 数据库管理（非标准端口）
- 端口：**3308**（非标准 3306，避免冲突）
- 管理脚本：[deployment/db-manager.sh](deployment/db-manager.sh)
- 启动：`./deployment/db-manager.sh start`
- Docker 容器名：`fashion-mysql-simple`

### 小程序调试
- 使用**微信开发者工具**打开 [miniprogram/](miniprogram/) 目录
- 扫码调试需真机或模拟扫码输入
- Mock 模式：开发环境下 `WECHAT_MINI_PROGRAM_MOCK_ENABLED=true` 跳过微信登录验证

### 测试脚本（根目录下 40+ 脚本）
```bash
# 业务流程测试
./test-production-order-creator-tracking.sh  # 订单创建人追踪
./test-finished-settlement-approve.sh        # 成品结算审批
./test-material-inbound.sh                   # 面料入库流程

# 系统维护
./clean-system.sh                            # 清理缓存和日志
./fix-403-errors.sh                          # 修复权限问题
./check-system-status.sh                     # 系统健康检查
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
      fixed: 'right',
      render: (_, record) => <RowActions actions={actions} />,
    },
  ]}
/>
```

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

**当前待优化文件**（见 [系统全面核对报告](系统全面核对报告-2026-02-02.md)）：
- `Production/List/index.tsx`（2513 行）
- `Cutting/index.tsx`（2190 行）
- `ScanRecordOrchestrator.java`（1891 行）

### API 端点数限制
- ⚠️ **单 Controller >15 端点**：考虑拆分职责
- 🔴 **StyleInfoController**（23 端点）：待拆分为 StyleInfo + StyleBom + StyleProcess

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





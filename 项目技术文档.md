# 服装供应链管理系统 - 项目文档

## 1. 项目概述

### 1.1 项目简介

服装供应链管理系统是一个基于Spring Boot和React的全栈应用，用于管理服装生产的整个供应链流程，包括订单管理、生产进度跟踪、财务管理等功能。

### 1.2 技术栈

- **后端**：Spring Boot 2.7.18 + MyBatis Plus 3.5.7 + MySQL 8.0
- **前端**：React 18.3.1 + Ant Design 6.1.3 + TypeScript 5.3.3
- **部署**：Docker容器化部署
- **API文档**：SpringDoc OpenAPI 1.7.0

### 1.3 主要功能模块

- **基础资料**：款号资料、下单管理、资料中心、单价流程
- **生产管理**：我的订单、物料采购、裁剪管理、生产进度、质检入库
- **财务管理**：工厂对账、物料对账、发货对账、付款审批
- **系统管理**：用户管理、角色管理、工厂管理、登录日志

## 2. 架构设计

### 2.1 系统架构

```text
┌─────────────────────────────────────────────────────────────────┐
│                         前端应用层                              │
│  React + Ant Design + TypeScript + Axios                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                         API网关层                              │
│  Spring Boot Security + JWT + CORS + Request Filter            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                         业务逻辑层                              │
│  Spring Boot + MyBatis Plus + Service Orchestration           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                         数据访问层                              │
│  MySQL 8.0 + Docker Container + Connection Pool               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心实体关系

- **StyleInfo**：款号资料，包含基本款号信息
- **ProductionOrder**：生产订单，关联款号资料
- **ScanRecord**：扫码记录，用于跟踪生产进度
- **StyleQuotation**：款号报价，包含成本和价格信息
- **StyleBom**：款号BOM，包含物料信息

## 3. 安装与部署

### 3.1 环境要求

- **Java**：JDK 17+
- **Node.js**：v18+
- **MySQL**：8.0+
- **Docker**：20.10+
- **Maven**：3.8+

### 3.2 本地开发环境搭建

#### 3.2.1 后端服务

```bash
# 1. 克隆代码仓库
git clone <repository-url>
cd 服装66666

# 2. 配置数据库环境变量
cp .run/backend.env.example .run/backend.env
# 修改.env文件中的数据库配置

# 3. 启动MySQL容器
docker run -d --name fashion-mysql -p 3307:3306 -e MYSQL_ROOT_PASSWORD=123456 -e MYSQL_DATABASE=fashion_supplychain mysql:8.0

# 4. 启动后端服务
bash dev-public.sh
```

#### 3.2.2 前端服务

```bash
# 1. 进入前端目录
cd frontend

# 2. 安装依赖
npm install

# 3. 启动前端开发服务器
npm run dev
```

### 3.3 访问地址

- **前端本地访问**：[http://localhost:5173](http://localhost:5173)
- **后端API访问**：[http://localhost:8088](http://localhost:8088)
- **API文档**：[http://localhost:8088/swagger-ui.html](http://localhost:8088/swagger-ui.html)

## 4. 常见问题与解决方案

### 4.1 数据库连接问题

**问题**：系统无法连接到数据库
**解决方案**：

1. 检查MySQL容器是否正常运行：`docker ps`
2. 确认数据库端口映射正确（容器内3306映射到宿主机3307）
3. 检查.env文件中的数据库配置，确保URL、用户名和密码正确
4. 重启后端服务：`bash dev-public.sh`

### 4.2 登录失败问题

**问题**：使用正确用户名密码登录失败
**解决方案**：

1. 确认默认用户名密码：admin/admin123
2. 检查后端日志，查看是否有认证错误
3. 确认JWT密钥配置正确
4. 清除浏览器缓存，重新尝试登录

### 4.3 外网访问问题

**问题**：使用外网地址访问返回403错误
**解决方案**：

1. 检查CORS配置，确保包含trycloudflare.com域名
2. 确认SecurityConfig.java中的权限配置正确
3. 检查请求头是否包含正确的Authorization令牌

### 4.4 订单信息显示问题

**问题**：裁剪时间、人员信息显示异常
**解决方案**：

1. 检查CuttingTaskServiceImpl.java，确认ScanRecord创建时包含progressStage
2. 验证数据库中ScanRecord表是否包含正确的裁剪记录
3. 检查前端组件是否正确获取和显示订单信息

## 5. API文档

### 5.1 认证API

| 方法 | 路径                         | 功能             | 权限     |
| ---- | ---------------------------- | ---------------- | -------- |
| POST | /api/system/user/login       | 用户登录         | 公开     |
| GET  | /api/system/user/me          | 获取当前用户信息 | 认证用户 |
| GET  | /api/system/user/permissions | 获取用户权限     | 认证用户 |
| POST | /api/system/user/logout      | 用户登出         | 认证用户 |

### 5.2 款号资料API

| 方法   | 路径                            | 功能             | 权限     |
| ------ | ------------------------------- | ---------------- | -------- |
| GET    | /api/style/info/list            | 分页查询款号列表 | 认证用户 |
| GET    | /api/style/info/{id}            | 查询款号详情     | 认证用户 |
| POST   | /api/style/info                 | 新增款号资料     | 认证用户 |
| PUT    | /api/style/info                 | 更新款号资料     | 认证用户 |
| DELETE | /api/style/info/{id}            | 删除款号资料     | 认证用户 |
| POST   | /api/style/info/batch-import    | 批量导入款号资料 | 认证用户 |
| GET    | /api/style/info/export-template | 导出款号资料模板 | 认证用户 |

### 5.3 款号BOM API

| 方法   | 路径                           | 功能                | 权限     |
| ------ | ------------------------------ | ------------------- | -------- |
| GET    | /api/style/bom/list            | 分页查询款号BOM列表 | 认证用户 |
| GET    | /api/style/bom/{id}            | 查询款号BOM详情     | 认证用户 |
| GET    | /api/style/bom/style/{styleId} | 查询指定款号的BOM   | 认证用户 |
| POST   | /api/style/bom                 | 新增款号BOM         | 认证用户 |
| PUT    | /api/style/bom                 | 更新款号BOM         | 认证用户 |
| DELETE | /api/style/bom/{id}            | 删除款号BOM         | 认证用户 |

### 5.4 生产订单API

| 方法   | 路径                                 | 功能             | 权限     |
| ------ | ------------------------------------ | ---------------- | -------- |
| GET    | /api/production/order/list           | 分页查询订单列表 | 认证用户 |
| GET    | /api/production/order/detail/{id}    | 查询订单详情     | 认证用户 |
| POST   | /api/production/order                | 新增生产订单     | 认证用户 |
| PUT    | /api/production/order                | 更新生产订单     | 认证用户 |
| DELETE | /api/production/order/{id}           | 删除生产订单     | 认证用户 |
| POST   | /api/production/order/scan           | 订单扫码         | 认证用户 |
| GET    | /api/production/order/flow/{orderId} | 查询订单流程     | 认证用户 |

### 5.5 裁剪管理API

| 方法 | 路径                                  | 功能                 | 权限     |
| ---- | ------------------------------------- | -------------------- | -------- |
| GET  | /api/production/cutting/task/list     | 分页查询裁剪任务列表 | 认证用户 |
| GET  | /api/production/cutting/task/{id}     | 查询裁剪任务详情     | 认证用户 |
| POST | /api/production/cutting/task/receive  | 领取裁剪任务         | 认证用户 |
| POST | /api/production/cutting/task/complete | 完成裁剪任务         | 认证用户 |
| POST | /api/production/cutting/bundle/create | 创建裁剪捆包         | 认证用户 |

### 5.6 财务管理API

| 方法 | 路径                               | 功能                 | 权限     |
| ---- | ---------------------------------- | -------------------- | -------- |
| GET  | /api/finance/material-recon/list   | 分页查询物料对账列表 | 认证用户 |
| GET  | /api/finance/material-recon/{id}   | 查询物料对账详情     | 认证用户 |
| POST | /api/finance/material-recon        | 新增物料对账         | 认证用户 |
| PUT  | /api/finance/material-recon        | 更新物料对账         | 认证用户 |
| PUT  | /api/finance/material-recon/status | 更新物料对账状态     | 认证用户 |
| GET  | /api/finance/factory-recon/list    | 分页查询工厂对账列表 | 认证用户 |
| GET  | /api/finance/shipment-recon/list   | 分页查询发货对账列表 | 认证用户 |
| GET  | /api/finance/payment-approval/list | 分页查询付款审批列表 | 认证用户 |

### 5.7 系统管理API

| 方法   | 路径                       | 功能             | 权限   |
| ------ | -------------------------- | ---------------- | ------ |
| GET    | /api/system/user/list      | 分页查询用户列表 | 管理员 |
| POST   | /api/system/user           | 新增用户         | 管理员 |
| PUT    | /api/system/user           | 更新用户         | 管理员 |
| DELETE | /api/system/user/{id}      | 删除用户         | 管理员 |
| GET    | /api/system/role/list      | 分页查询角色列表 | 管理员 |
| POST   | /api/system/role           | 新增角色         | 管理员 |
| PUT    | /api/system/role           | 更新角色         | 管理员 |
| DELETE | /api/system/role/{id}      | 删除角色         | 管理员 |
| GET    | /api/system/factory/list   | 分页查询工厂列表 | 管理员 |
| GET    | /api/system/login-log/list | 分页查询登录日志 | 管理员 |

## 6. 前端组件文档

### 6.1 公共组件

#### 6.1.1 ResizableModal

**功能**：可调整大小的模态框组件，支持拖拽调整大小、自动调整字体大小等特性。

**使用示例**：

```typescript
import ResizableModal from './components/common/ResizableModal';

const MyComponent = () => {
  const [open, setOpen] = React.useState(false);

  return (
    <ResizableModal
      open={open}
      title="示例模态框"
      onCancel={() => setOpen(false)}
      width={modalWidth}
      initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
      tableDensity="auto"
    >
      {/* 模态框内容 */}
      <div>模态框内容</div>
    </ResizableModal>
  );
};
```

**主要属性**：

- `width`：初始宽度，使用 `modalWidth` 响应式值（移动端 96vw，平板/PC 80vw）
- `minWidth`：最小宽度，默认520px
- `minHeight`：最小高度，默认320px
- `initialHeight`：初始高度，推荐使用 `window.innerHeight * 0.85` 实现响应式自适应
- `autoFontSize`：是否自动调整字体大小，默认true
- `tableDensity`：表格密度

**全站弹窗尺寸规范（2026-01-23更新）**：

```typescript
// 从 useViewport hook 获取响应式配置
const { isMobile, modalWidth } = useViewport();

// modalWidth 配置：
// - 移动端（< 768px）：96vw
// - 平板/PC（≥ 768px）：80vw

// 弹窗高度推荐配置：
initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
// - 默认为视口高度的 85%
// - SSR 环境回退到 800px
```

**约定**：

- ✅ **弹窗宽度**：全站统一使用 `modalWidth`（响应式 80vw/96vw）
- ✅ **弹窗高度**：推荐使用 `window.innerHeight * 0.85`（视口高度的 85%）
- ✅ **表格滚动高度**：
  - 面辅料采购明细表：移动端 180px，PC端 200px
  - 裁剪单明细表：使用 `ResizableModalFlexFill` 自动占据剩余空间
- 🖼️ 全站图片预览弹窗默认尺寸：600×600

#### 6.1.2 ResizableTable

**功能**：可调整列宽的表格组件，支持拖拽调整列宽、列重新排序、本地存储列配置等特性。

**使用示例**：

```typescript
import ResizableTable from './components/common/ResizableTable';

const MyComponent = () => {
  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '年龄', dataIndex: 'age', key: 'age' },
    { title: '操作', dataIndex: 'action', key: 'action' }
  ];

  const dataSource = [
    { key: '1', name: '张三', age: 28 },
    { key: '2', name: '李四', age: 32 }
  ];

  return (
    <ResizableTable
      columns={columns}
      dataSource={dataSource}
      storageKey="my-table"
      resizableColumns={true}
      reorderableColumns={true}
      minColumnWidth={80}
    />
  );
};
```

**主要属性**：

- `storageKey`：本地存储键名，用于保存列宽和列顺序
- `resizableColumns`：是否启用列宽调整，默认true
- `reorderableColumns`：是否允许列重新排序，默认true
- `minColumnWidth`：最小列宽，默认60px
- `maxColumnWidth`：最大列宽，默认800px

#### 6.1.3 RowActions

**功能**：行操作组件，用于展示表格行的操作按钮，支持自动折叠溢出的操作到下拉菜单。

**使用示例**：

```typescript
import RowActions from './components/common/RowActions';

const MyComponent = () => {
  const actions = [
    {
      key: 'edit',
      label: '编辑',
      onClick: () => console.log('编辑'),
      primary: true
    },
    {
      key: 'delete',
      label: '删除',
      danger: true,
      onClick: () => console.log('删除')
    }
  ];

  return <RowActions actions={actions} maxInline={2} size="small" />;
};
```

**主要属性**：

- `actions`：操作项列表
- `maxInline`：最大显示的行内按钮数量，默认2个
- `size`：按钮尺寸，默认small

#### 6.1.4 StyleAssets

**功能**：款号资源组件，包括款号封面缩略图和附件列表功能。

**使用示例**：

```typescript
import { StyleCoverThumb, StyleAttachmentsButton } from './components/StyleAssets';

const MyComponent = () => {
  return (
    <div>
      {/* 款号封面 */}
      <StyleCoverThumb styleId={123} styleNo="ST2024001" src="https://example.com/cover.jpg" />

      {/* 附件列表按钮 */}
      <StyleAttachmentsButton styleId={123} buttonText="查看附件" />
    </div>
  );
};
```

### 6.2 页面组件

#### 6.2.1 登录页面 (Login)

**功能**：系统登录页面，支持用户名密码登录。

**主要功能**：

- 用户名密码验证
- 记住密码功能
- 登录状态管理

#### 6.2.2 仪表盘页面 (Dashboard)

**功能**：系统首页，展示关键指标和数据概览。

**主要功能**：

- 订单数量统计
- 生产进度概览
- 财务管理概览

#### 6.2.3 款号资料页面 (StyleInfo)

**功能**：款号资料管理页面，支持款号的增删改查。

**主要功能**：

- 款号列表展示
- 款号详情编辑
- BOM管理
- 工艺管理
- 报价管理

#### 6.2.4 生产管理页面 (Production)

**功能**：生产流程管理页面，包括订单管理、裁剪管理、生产进度跟踪等。

**主要功能**：

- 订单列表展示
- 裁剪任务管理
- 生产进度跟踪
- 质检入库管理

**页面样式约定**：

- 页面容器统一使用 `Layout` + `page-card`（必要时叠加 `filter-card`），避免新增无意义的页面级 wrapper class。
- 生产相关样式以业务语义类（如 `purchase-detail-*`）为主，避免使用旧的范围选择器做“页面隔离”。

#### 6.2.5 财务管理页面 (Finance)

**功能**：财务管理页面，包括工厂对账、物料对账、发货对账、付款审批等。

**主要功能**：

- 物料对账管理
- 工厂对账管理
- 发货对账管理
- 付款审批管理

## 7. 代码优化建议

### 7.1 前端优化

1. **组件复用**：进一步抽取公共组件，减少代码重复
2. **状态管理**：引入Redux或Zustand管理复杂状态
3. **性能优化**：实现组件懒加载和虚拟滚动，优化大数据列表
4. **类型安全**：完善TypeScript类型定义，提高代码安全性
5. **组件测试**：添加组件测试，提高组件质量

### 7.4 前端复用规范（避免重复实现）

1. **订单明细解析**：涉及 `orderDetails` / 颜色尺码数量的解析，统一使用 `frontend/src/utils/api.ts` 内的 `parseProductionOrderLines(order, opts?)`，避免页面内自行 `JSON.parse` + 字段兜底。
2. **数值转换**：统一使用 `toNumberSafe(v)` 处理数量/金额等字段，避免各处 `Number(v) || 0`、`toNumber` 的散落实现。
3. **尺码排序**：
   - 单个尺码比较排序使用 `compareSizeAsc(a, b)`。
   - 尺码集合排序使用 `sortSizeNames(sizes)`。
4. **职责边界**：通用工具只做“解析与标准化”（兼容后端字段/历史数据），页面只保留业务差异（排序、合并、兜底展示、权限控制）。
5. **字段变更处理**：后端字段/结构调整时，优先扩展通用工具的字段映射与兜底，不在多个页面做临时修补。

### 7.2 后端优化

1. **性能优化**：添加缓存机制，优化数据库查询
2. **代码结构**：进一步优化代码结构，分离业务逻辑和数据访问
3. **安全增强**：添加更细粒度的权限控制，加强API安全
4. **测试覆盖**：增加单元测试和集成测试，提高代码质量
5. **监控系统**：添加系统监控，便于及时发现问题

### 7.3 架构优化

1. **微服务拆分**：考虑将系统拆分为多个微服务，提高系统扩展性
2. **消息队列**：引入消息队列处理异步任务，提高系统可靠性
3. **配置中心**：使用Nacos或Consul管理配置，提高配置管理效率
4. **服务注册与发现**：引入Eureka或Consul，实现服务自动发现
5. **CI/CD**：完善CI/CD流程，实现自动化构建和部署

## 8. 修复日志

### 版本 1.0.2 - 2026-01-23

#### 8.1 警告说明

1. **Ant Design Table 组件警告**：
   - 警告1：`expandedRowRender` should not use with nested Table
   - 警告2：`expandIconColumnIndex` is deprecated
   
   **原因分析**：
   - 这些是Ant Design 6.x的非阻塞性警告，不影响功能使用
   - 当前代码中没有使用嵌套Table，也没有使用`expandIconColumnIndex`属性
   - 警告可能由Ant Design内部实现触发
   
   **影响评估**：
   - ✅ 功能正常运行
   - ⚠️ 控制台有警告信息
   - ❌ 不影响用户体验
   
   **解决方案**：
   - 如需完全消除警告，可以在expandable配置中明确指定展开列位置
   - 或等待Ant Design后续版本更新

2. **建议的最佳实践**（可选优化）：
   ```tsx
   // 在使用expandable时，可以添加展开列配置
   expandable={{
     expandedRowRender: (record) => <div>...</div>,
     columnWidth: 48, // 指定展开列宽度
     // 不使用 expandIconColumnIndex（已废弃）
   }}
   ```

### 版本 1.0.1 - 2026-01-17

#### 8.1 修复的问题

1. **订单信息显示问题**：
   - 修复了CuttingTaskServiceImpl.java中缺少progressStage的问题
   - 确保ScanRecord包含正确的进度阶段

2. **入库信息显示问题**：
   - 确认了ScanRecordOrchestrator.java的逻辑正确性
   - 验证了仓库ScanRecord创建流程

3. **数据库连接问题**：
   - 修改了.run/backend.env文件，将数据库端口从3306改为3307
   - 确保与Docker容器端口匹配

4. **前端样式与结构清理**：
   - 移除无意义的页面 wrapper class（如质检入库、仪表盘、款号资料），统一使用通用布局类
   - 清理生产模块旧样式范围选择器，删除无引用样式（如 `.warehousing-page`、`.material-purchase-page`）
   - 修复 ResizableModal 组件引用路径，避免 Vite 解析失败
   - 修复款号资料页面 JSX 结构问题，确保可正常构建与校验

5. **基础资料子模块异常**：
   - 在StyleQuotationServiceImpl.java中添加了异常处理
   - 确保单个异常数据不会导致整个方法失败

6. **外网地址访问问题**：
   - 更新了CORS配置，添加了\*.trycloudflare.com域名
   - 确保外网请求能够正常访问

#### 8.2 代码优化

1. **组件优化**：
   - 将ResizableModal.tsx、ResizableTable.tsx和RowActions.tsx移动到common目录
   - 删除了空的BaseWideDialog目录
   - 更新了组件引用路径

2. **后端优化**：
   - 创建了GlobalExceptionHandler.java，统一处理异常
   - 定义了BusinessException.java，用于业务逻辑异常
   - 抽取了DateTimeUtils.java和StringUtils.java公共工具类

3. **配置优化**：
   - 优化了日志配置，添加了文件日志记录
   - 完善了API文档配置，添加了详细信息

4. **安全优化**：
   - 更新了CORS配置，允许更多域名访问
   - 优化了Security配置，确保API安全

## 9. 开发规范

### 9.1 代码命名规范

- **类名**：使用大驼峰命名，如StyleInfoController
- **方法名**：使用小驼峰命名，如listStyleInfo
- **变量名**：使用小驼峰命名，如styleNo
- **常量名**：使用全大写加下划线，如DEFAULT_PAGE_SIZE

### 9.2 代码注释规范

- 为所有类添加类注释，说明类的功能
- 为所有方法添加方法注释，说明方法的功能、参数和返回值
- 为复杂逻辑添加行注释，说明代码的实现思路

### 9.3 前端UI/UX规范（2026-01-23更新）

#### 9.3.1 表格样式规范

**字体规范（舒适易读的层级结构）**：

- **一级标题（表头）**：14px / 粗体700（font-weight-bold）
- **表格内容**：13px / 常规400（font-weight-normal）
- **二级标题（卡片标题）**：16px / 粗体700
- **三级标题（标签页）**：14px / 中等500（font-weight-medium）

**颜色规范（清晰舒服的淡色线条）**：

- **主边框**：`rgba(0,0,0,0.06)` - 淡淡的灰色，不刺眼（`--table-border-color`）
- **次边框**：`rgba(0,0,0,0.04)` - 更淡的灰色，柔和分隔（`--table-border-light`）
- **表头背景**：`var(--table-header-bg)` - 浅色突出
- **斑马纹**：`var(--table-row-stripe-bg)` - 交替行便于阅读
- **悬停效果**：`var(--table-row-hover-bg)` - 蓝色高亮

**操作列规范**：

- **按钮尺寸**：32×32px（width + height）
- **图标大小**：16px（font-size）
- **按钮间距**：4px（column-gap）
- **对齐方式**：居中对齐（justify-content: center）
- **悬停效果**：
  - 缩放1.05倍（transform: scale(1.05)）
  - 背景色加深（border + background 颜色加深）
  - 过渡动画：0.2s ease
- **危险操作**：红色主题（error-color），保持一致风格
- **禁用状态**：透明度0.45，灰色背景

**表格尺寸规范**：

- **表头高度**：48px（含padding 12px上下）
- **单元格内边距**：10px 8px（上下10px，左右8px）
- **行高**：1.5（line-height）
- **圆角**：10px（border-radius）
- **表格布局**：table-layout: fixed（固定布局）

**CSS变量系统**：

```css
/* 字体大小 */
--font-size-xs: 12px;
--font-size-sm: 13px;
--font-size-base: 14px;
--font-size-md: 15px;
--font-size-lg: 16px;
--font-size-xl: 18px;
--font-size-xxl: 20px;

/* 字体粗细 */
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

/* 表格边框 */
--table-border-color: rgba(0, 0, 0, 0.06);
--table-border-light: rgba(0, 0, 0, 0.04);
```

**全站统一要求**：

- ✅ 所有 `ResizableTable` 自动应用统一样式
- ✅ 操作列使用 `.row-actions` class
- ✅ 操作按钮使用 `.row-actions__btn--icon` class
- ✅ 全站表格边框统一使用淡灰色
- ✅ 字体大小分层清晰（12-20px体系）
- ✅ 悬停效果统一（缩放 + 颜色加深）

#### 9.3.2 首页搜索规范（2026-01-23新增）

**搜索框规范**：

- **尺寸**：size="large"，最大宽度600px
- **位置**：首页顶部居中显示
- **图标**：左侧前缀 `<SearchOutlined />`
- **功能**：
  - 支持回车键快速搜索
  - 支持一键清空（allowClear）
  - Loading状态反馈
  - 友好的空结果提示

**搜索范围（智能识别）**：

- **款号**：自动跳转到款号资料页面（`/style-info?styleNo=xxx`）
- **订单号**：自动跳转到生产进度页面（`/production?orderNo=xxx`）
- **扎号**：自动跳转到生产进度页面（`/production?bundleQr=xxx`）
- **供应商名称**：自动跳转到供应商管理页面（`/system/factory?keyword=xxx`）

**后端API要求**：

```
GET /search/universal?keyword={keyword}
Response: {
  code: 200,
  data: {
    orderNo?: string,      // 订单号（优先级最高）
    styleNo?: string,      // 款号
    bundleQr?: string,     // 扎号
    supplierName?: string  // 供应商名称
  }
}
```

**实现要求**：

- ✅ 后端需提供 `/search/universal` 全局搜索接口
- ✅ 智能识别关键词类型并返回最匹配的结果
- ✅ 前端根据返回结果自动跳转到相应页面
- ✅ 404错误友好提示"未找到相关结果"
- ❌ 不再需要品牌筛选、加工厂筛选、时间范围筛选

### 9.4 Git提交规范

- **提交信息格式**：`[模块名] 提交内容`，如`[StyleInfo] 修复款号资料显示问题`
- **提交频率**：每个功能或修复单独提交，避免大的提交
- **分支管理**：使用feature分支开发新功能，bugfix分支修复问题

## 10. 联系方式

### 10.1 技术支持

- 邮箱：[support@example.com](mailto:support@example.com)
- 电话：138-0013-8000

### 10.2 贡献指南

欢迎对项目进行贡献，贡献前请阅读以下指南：

1. Fork仓库到自己的GitHub
2. 创建新的分支
3. 提交代码
4. 创建Pull Request
5. 等待代码审查

## 11. 许可证

本项目采用MIT许可证，详见LICENSE文件。

---

**文档更新时间**：2026-01-23
**文档版本**：1.1.0

**最近更新内容**：
- 2026-01-23：新增全站表格样式规范（9.3.1节）
- 2026-01-23：新增首页全能搜索规范（9.3.2节）
- 2026-01-23：更新弹窗尺寸规范（6.1.1节）
- 2026-01-17：初始版本发布


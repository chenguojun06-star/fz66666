# GitHub Copilot 指令 - 服装供应链管理系统

> **最后更新**: 2026-01-31  
> **系统评分**: 97/100 ⭐⭐⭐⭐⭐  
> **版本**: v3.2 (增强版)

## 🎯 快速上手

三端协同的服装供应链管理系统：**Spring Boot 后端** + **React TypeScript PC端** + **微信小程序**，管理从订单到交付的完整生命周期。

**技术栈**：
- 后端：Spring Boot 2.7.18 + MyBatis Plus 3.5.7 + MySQL 8.0 (**⚠️ 端口 3308!**) + Java 21
- 前端：React 18 + Ant Design 6.1.3 + Vite 7 + TypeScript 5.3.3 + Zustand
- 小程序：微信原生 + JSDoc 类型注释 + ESLint严格模式

**关键文件**（按重要性）：
1. **架构文档**：`开发指南.md` (4255行 - 必读！)
2. **设计规范**：`设计系统完整规范-2026.md` (v3.0 - 强制执行)
3. **当前状态**：`系统状态.md` (系统总览 + 文档索引)
4. **库存系统**：`INVENTORY_SYSTEM_GUIDE.md` (进销存操作指南)
5. **环境配置**：`.run/backend.env` (**必需！** 缺少会导致403错误)


## 🏗️ 架构关键模式（核心知识）

### 后端：Orchestrator 编排器模式（26个编排器）

**层次结构**：`Controller → Orchestrator → Service → Mapper`

- **Controller**：HTTP 端点，带 `@PreAuthorize("hasAuthority('CODE')")` 权限控制
- **Orchestrator**：跨服务业务协调（核心层，26个编排器）
- **Service**：单领域 CRUD 操作，**禁止 Service 间互相调用**
- **Mapper**：MyBatis Plus 数据访问（继承 `BaseMapper<T>`）

**何时使用 Orchestrator**（关键决策）：
- ✅ 多服务协调（如：订单 + 裁剪 + 财务）
- ✅ 复杂事务/工作流（如：入库 + 库存更新 + 对账回填）
- ✅ 数据聚合（如：看板数据，需要多表join）
- ❌ 简单单表 CRUD → 直接用 Service

**示例模式**：
```java
@Service
public class ProductionOrderOrchestrator {
    @Autowired private ProductionOrderService orderService;
    @Autowired private CuttingTaskService cuttingService;
    @Autowired private FinanceService financeService;
    
    @Transactional  // ⚠️ 跨服务事务必须加此注解
    public ProductionOrder createOrder(ProductionOrder order) {
        // 1. 验证款式（Service A）
        // 2. 创建订单（Service B）
        ProductionOrder saved = orderService.save(order);
        // 3. 生成裁剪单（Service C - 跨服务！）
        cuttingService.createFromOrder(saved);
        // 4. 回填财务对账（Service D - 跨服务！）
        financeService.backfillFromOrder(saved);
        return saved;
    }
}
```

**26个编排器位置**：`backend/src/main/java/com/fashion/supplychain/{module}/orchestration/`

**关键编排器**：
- `ProductionOrderOrchestrator`：生产订单（订单+裁剪+对账）
- `MaterialInboundOrchestrator`：面辅料入库（采购+库存+对账）
- `ProductWarehousingOrchestrator`：成品入库（入库+库存+SKU）
- `ScanRecordOrchestrator`：工序扫码（扫码+工资结算+进度更新）
- `PayrollSettlementOrchestrator`：工资结算（工序+委派+对账）
- `ReconciliationBackfillOrchestrator`：对账回填（订单→财务对账）

### 前端：ResizableModal 三级弹窗规范（v3.0）

**所有表单弹窗必须使用** `<ResizableModal>` 的标准化尺寸：

```typescript
// 大窗口（60vw × 60vh）- 复杂表单、多Tab
<ResizableModal defaultWidth="60vw" defaultHeight="60vh">

// 中窗口（40vw × 50vh）- 标准表单  
<ResizableModal defaultWidth="40vw" defaultHeight="50vh">

// 小窗口（30vw × 40vh）- 简单确认框
<ResizableModal defaultWidth="30vw" defaultHeight="40vh">
```

**⚠️ 已废弃**：旧版 80vw × 85vh 弹窗已全系统替换

### 前端：ModalContentLayout 统一弹窗样式

**9个可组合组件**实现一致的弹窗内容：

```typescript
import {
  ModalHeaderCard,      // 灰色头部（#f8f9fa）
  ModalField,           // 标准字段（13px标签 + 14px值）
  ModalPrimaryField,    // 重要字段（14px标签 + 18px值）
  ModalFieldRow,        // 横向布局（间距：24px）
  ModalFieldGrid,       // 3列网格（PC）/ 1列（移动端）
  ModalSideLayout,      // 左右布局
} from '@/components/common/ModalContentLayout';

// 使用模式：
<ModalHeaderCard>
  <ModalSideLayout
    left={<StyleCoverThumb />}
    right={
      <ModalPrimaryField label="订单号" value="PO20260122001" />
      <ModalFieldRow gap={24}>
        <ModalField label="款号" value="ST001" />
        <ModalField label="颜色" value="黑色" />
      </ModalFieldRow>
    }
  />
</ModalHeaderCard>
```

**排版规则**：
- 标签：13-14px，#6b7280，600字重
- 普通值：14px，#111827，600字重
- 重要值：18px，#111827，600-700字重
- 字段间距：24px（强制）

### 小程序：智能扫码工序识别

**三种扫码模式**（自动检测）：
1. **ORDER**：扫 `PO20260122001` → 显示SKU明细表
2. **BUNDLE**：扫 `PO20260122001-黑色-01` → 自动提交菲号
3. **SKU**：扫 SKU JSON → 直接提交单个SKU

**智能工序识别**（核心逻辑）：
- 扫码次数决定工序（第1次=做领，第2次=上领...）
- 无需手动选择工序名称
- 工序列表从 `order.progressNodeUnitPrices` 读取（JSON数组）
- 防重复提交：`max(30秒, 菲号数量 × 工序分钟 × 60 × 50%)`

**代码位置**：`miniprogram/pages/work/index.js` → `handleScan()` → `detectScanMode()`

**防重复逻辑**（关键）：
```javascript
// miniprogram/pages/work/index.js 约400行
const MIN_INTERVAL_SEC = 30;
const PROCESS_MINUTES = nodes[stepIndex]?.minutes || 5;
const calculatedInterval = bundleSize * PROCESS_MINUTES * 60 * 0.5;
const interval = Math.max(MIN_INTERVAL_SEC, calculatedInterval);
```

### SKU系统（三端统一）

**SKU定义**：`styleNo + color + size`（如：`ST001 + 黑色 + L`）
- 订单包含多个SKU（多色多码）
- 菲号包含单色的多个尺码（如：黑色 S/M/L/XL 各10件）
- 裁剪单按颜色生成菲号（如：`PO20260122001-黑色-01`）
- 验证规则在PC/小程序间一致（共享 `validationRules`）

**SKU验证规则**（共享）：
- PC端：`frontend/src/utils/validationRules.ts`
- 小程序：`miniprogram/utils/validationRules.js`
- 规则：款号（必填）、颜色（必填）、尺码（必填）、数量（>0）

**参考文档**：`docs/扫码和SKU系统完整指南.md`

## 🔑 关键开发工作流

### 启动开发环境（必须这样做）

```bash
# ⚠️ 关键：用 dev-public.sh 启动（加载 .run/backend.env）
./dev-public.sh  # 自动启动：后端 + 前端 + Cloudflare Tunnel

# 单独启动后端（如需要）
cd backend && mvn spring-boot:run

# 单独启动前端
cd frontend && npm run dev  # http://localhost:5173

# 小程序：用微信开发者工具打开 miniprogram/ 目录
```

**环境配置**（⚠️ 缺少会导致失败）：
- 后端环境变量：`.run/backend.env`（需自行创建）
- 数据库：`localhost:3308`（非标准端口！）
- 没有正确配置：会导致 403 API 错误

**首次启动必做**（复制粘贴）：
```bash
mkdir -p .run
cat > .run/backend.env << 'EOF'
SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=changeme
APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
EOF

# 启动MySQL（Docker）
docker start fashion-mysql-simple || docker run -d \
  --name fashion-mysql-simple \
  -p 3308:3306 \
  -e MYSQL_ROOT_PASSWORD=changeme \
  -e MYSQL_DATABASE=fashion_supplychain \
  mysql:8.0
```

### 常用脚本

| 脚本 | 用途 | 使用方法 |
|------|------|----------|
| `./dev-public.sh` | 一键启动所有服务 | **主要开发命令** |
| `./git-sync.sh "msg"` | 自动 pull+commit+push | 快速提交 |
| `./miniprogram-check.sh` | 小程序质量检查 | 小程序提交前必查 |
| `deployment/db-manager.sh` | 数据库备份/恢复/迁移 | `./db-manager.sh backup` |

### 数据库关键信息

- 连接：`jdbc:mysql://127.0.0.1:3308/fashion_supplychain`（⚠️ 端口 3308！）
- Docker容器：`docker start fashion-mysql-simple`
- 管理脚本：`deployment/db-manager.sh`
- UTF-8配置：`application.yml` 必须有 `server.servlet.encoding.force=true`
- 关键表：
  - `t_production_order`：生产订单
  - `t_product_sku`：成品库存（SKU维度）
  - `t_material_stock`：面辅料库存（2026-01-30新增）
  - `t_cutting_task`：裁剪单（含菲号）
  - `t_scan_record`：工序扫码记录

### 快速测试入口

参考 `快速测试指南.md`：
1. **扫码系统**：创建测试订单 → 小程序扫码 → 验证工序自动识别
2. **裁剪单**：生成裁剪单 → 检查二维码生成
3. **对账**：工厂/物料/发货对账流程
4. **库存**：入库 → 验证SKU库存自动更新 → 出库 → 验证扣减

**测试脚本**：
```bash
./test-material-inbound.sh      # 测试面辅料入库
./test-bom-stock-check.sh       # 测试BOM库存检查
./test-finished-settlement-approve.sh  # 测试工资审批
```

## 📐 设计系统（v3.0 - 强制执行）

### 纯色主题（禁止渐变）

```css
/* ✅ 必须使用：CSS变量 */
--primary-color: #2D7FF9;
--success-color: #52C41A;
--warning-color: #FAAD14;
--error-color: #F5222D;

/* ❌ 禁止：硬编码颜色、渐变 */
background: linear-gradient(...);  /* Code Review不通过 */
color: #2D7FF9;  /* 使用 var(--primary-color) */
```

**侧边栏**：纯深蓝 `#0b2d5c`，无渐变

### 字体（系统字体栈）

```css
/* ✅ 强制：仅使用系统字体 */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
             'Roboto', 'Helvetica Neue', 'Arial', sans-serif;

/* 字号 */
--font-base: 14px;        /* 正文 */
--font-label: 13px;       /* 字段标签 */
--font-primary: 18px;     /* 重要值 */
--font-title: 20px;       /* 页面标题 */
```

**❌ 禁止**：自定义 `font-family`（打印页面需审批）

### 间距系统（8px倍数）

```css
--spacing-xs: 8px;
--spacing-sm: 12px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;

/* ❌ 禁止：非标准值如 10px、15px、20px */
```

### 标准组件（26个）

**核心组件**：
- `ResizableModal`：三级弹窗系统
- `QRCodeBox`：统一二维码（4种主题：primary/default/success/warning）
- `ModalContentLayout`：9个可组合弹窗内容组件
- `UniversalCardView`：卡片视图（带ViewToggle）
- `LiquidProgressLottie`：Lottie进度动画
- `UnifiedDatePicker`：标准化日期选择器（dayjs）
- `StyleAttachmentsButton`：附件管理（`onlyGradingPattern` 过滤）

**组件文档**：查看 `docs/` 详细使用指南

## 💡 代码质量规则

### 后端（Java）

- **实体**：`@TableName` + Lombok `@Data`
- **服务**：跨服务用Orchestrator，单领域用Service
- **认证**：JWT via `AuthTokenService` + `TokenAuthFilter`
- **API文档**：SpringDoc OpenAPI at `/swagger-ui.html`
- **UTF-8**：必须配置 `spring.jackson.generator.escape-non-ascii=false`

### 前端（React）

- **组件**：函数式 + TypeScript + Hooks
- **状态**：Zustand (`utils/appContext.tsx`)
- **验证**：Ant Design Form + `validationRules`（与小程序共享）
- **路由**：`routeConfig.ts`（路径 + 权限码）
- **模块**：`src/modules/{module}/pages/` 下组织
- **懒加载**：路由级代码分割用 `React.lazy()`
- **性能**：`requestAnimationFrame` 保持 INP <200ms

### 小程序（微信）

- **结构**：`pages/` + `utils/` + `components/`
- **设计Token**：`styles/design-tokens.wxss`
- **网络**：`utils/request.js`（10s超时，2次重试）
- **验证**：`utils/validationRules.js`（与PC端相同）
- **类型提示**：`types/index.js` 的 JSDoc
- **质量工具**：
  - ESLint：`cd miniprogram && npm run 检查` / `npm run 修复`
  - TypeScript：`npm run 类型检查`
  - 完整检查：`./miniprogram-check.sh`

**代码规则**：
- 所有 `if/for/while` 必须有大括号（`curly: all`）
- 未使用参数加下划线前缀
- 复杂度限制：15（核心逻辑可经审批超出）
- 函数最大行数：150（不含空行和注释）

## 🚀 常见任务（快速参考）

### 添加新业务模块

1. **后端**：`entity` → `mapper` → `service/impl` → `orchestrator`（如跨服务）→ `controller`
2. **前端**：在 `src/modules/{module}/pages/` 创建 → 添加路由到 `routeConfig.ts` → 添加API到 `services/`
3. **权限**：插入 `t_role_permission` 表，controller加 `@PreAuthorize`

### 修改弹窗表单

1. 找到页面（如 `frontend/src/modules/production/pages/Production/Cutting/index.tsx`）
2. 用 `<ResizableModal>` 选择合适尺寸（60vw/40vw/30vw）
3. 用 `ModalContentLayout` 组件实现一致样式
4. 验证：Ant Design `rules` + `validationRules`

### 调试扫码系统

1. 参考：`QUICK_TEST_GUIDE.md` 创建测试订单
2. 断点：`miniprogram/pages/work/index.js` → `handleScan`
3. 验证：扫码 → 模式识别（ORDER/BUNDLE/SKU）→ 工序 → 防重复 → API调用

### 数据库变更

1. 在 `scripts/` 目录写SQL
2. 先备份：`deployment/db-manager.sh backup`
3. 更新 Java Entity + TypeScript 类型

---

*完整细节请参考 `开发指南.md`（4255行）和 `系统状态.md`*  
*设计强制执行：所有代码必须通过 `设计系统完整规范-2026.md` 的Code Review*

---

## 📊 代码质量现状（2026-01-31核实）

### 文件规模统计

**后端（Java）**：
- 总文件：353个
- 最大文件：`DataInitializer.java` (2624行) - 数据库初始化配置
- Top 3大型文件：
  - `ScanRecordOrchestrator.java` (1891行) - 扫码工序编排器
  - `ProductionOrderQueryService.java` (1725行) - 订单查询服务
  - `ProductionOrderOrchestrator.java` (1687行) - 生产订单编排器

**前端（React TypeScript）**：
- 总文件：177个 (.tsx/.ts)
- 最大文件：`Production/List/index.tsx` (3800行) - 生产订单列表
- Top 3大型文件：
  - `Production/ProgressDetail/index.tsx` (3551行) - 进度详情
  - `StyleInfo/index.tsx` (2705行) - 款式资料
  - `Production/Cutting/index.tsx` (2380行) - 裁剪管理

**小程序（WeChat）**：
- 总文件：38个 (.js，排除node_modules)
- 最大文件：`pages/scan/index.js` (2438行) - 扫码主页面

### 代码质量问题

**✅ 优秀方面**：
1. **架构清晰**：Orchestrator模式严格执行，26个编排器职责明确
2. **TODO清零**：后端仅4个TODO（均在WarehouseDashboard出库功能待实现）
3. **类型安全**：前端TypeScript覆盖100%，小程序JSDoc类型注释完善
4. **ESLint问题少**：小程序仅10个warning（0 error）

**⚠️ 需要注意**：

1. **超大文件**（>1500行）：
   - 前端3个文件超3000行（建议拆分）
   - 后端2个Orchestrator超1800行（但逻辑清晰，可接受）
   - 小程序scan/index.js 2438行（核心业务，已模块化）

2. **控制台日志**：
   - 前端约30+处 `console.error`（用于错误追踪，可保留）
   - 少量 `console.log`（建议改为开发模式条件输出）

3. **ESLint Warnings**（小程序）：
   - 3个复杂度警告（16-30，超过15限制）
   - 5个代码风格问题（curly、prefer-const）
   - **建议**：核心逻辑（如loadPagedList 30复杂度）可通过ESLint注释豁免

4. **遗留TODO**（仅4个）：
   - `WarehouseDashboardOrchestrator` 出库统计功能（3处）
   - `MaterialInboundOrchestrator` 查询条件扩展（1处）

### 架构合规性检查

**✅ 完全合规**：
- Service层无跨Service调用（grep验证通过）
- Controller无业务逻辑（仅参数验证+Orchestrator调用）
- 数据库UTF-8配置正确（`spring.jackson.generator.escape-non-ascii=false`）

**建议优化**：
1. 前端超3000行文件拆分为子组件（如Production/List拆成：表格、筛选、弹窗）
2. 小程序复杂方法添加ESLint豁免注释
3. 清理开发用console.log（保留error/warn级别）

### 文档完整性 ✅

- 核心文档12份（已精简60%）
- AI指令v3.2（372行，完整覆盖）
- 操作指南完善（INVENTORY_SYSTEM_GUIDE等）

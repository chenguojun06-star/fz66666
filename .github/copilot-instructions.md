# GitHub Copilot 指令 - 服装供应链管理系统

> **最后更新**: 2026-01-31  
> **系统评分**: 96/100 ⭐⭐⭐⭐⭐  
> **版本**: v3.1 (精简版)

## 🎯 快速上手

三端协同的服装供应链管理系统：**Spring Boot 后端** + **React TypeScript PC端** + **微信小程序**，管理从订单到交付的完整生命周期。

**技术栈**：
- 后端：Spring Boot 2.7.18 + MyBatis Plus 3.5.7 + MySQL 8.0 (端口 3308!) + Java 21
- 前端：React 18 + Ant Design 6.1.3 + Vite 7 + TypeScript 5.3.3 + Zustand
- 小程序：微信原生 + JSDoc 类型注释

**关键文件**：
- 架构文档：`开发指南.md` (4255行 - 必读！)
- 设计规范：`设计系统完整规范-2026.md`
- 当前状态：`系统状态.md`
- 环境配置：`.run/backend.env` (需自行创建)


## 🏗️ 架构关键模式（核心知识）

### 后端：Orchestrator 编排器模式（26个编排器）

**层次结构**：`Controller → Orchestrator → Service → Mapper`

- **Controller**：HTTP 端点，带 `@PreAuthorize("hasAuthority('CODE')")` 权限控制
- **Orchestrator**：跨服务业务协调（核心层）
- **Service**：单领域 CRUD 操作，禁止 Service 间互相调用
- **Mapper**：MyBatis Plus 数据访问

**何时使用 Orchestrator**（关键决策）：
- ✅ 多服务协调（如：订单 + 裁剪 + 财务）
- ✅ 复杂事务/工作流
- ❌ 简单单表 CRUD → 直接用 Service

**示例模式**：
```java
@Service
public class ProductionOrderOrchestrator {
    @Autowired private ProductionOrderService orderService;
    @Autowired private CuttingTaskService cuttingService;
    
    @Transactional
    public ProductionOrder createOrder(ProductionOrder order) {
        // 1. 验证款式
        // 2. 创建订单（Service A）
        // 3. 生成裁剪单（Service B - 跨服务！）
        return order;
    }
}
```

**26个编排器位置**：`backend/src/main/java/com/fashion/supplychain/*/orchestration/`

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
- 无需手动选择
- 工序列表从 `order.progressNodeUnitPrices` 读取
- 防重复：`max(30秒, 菲号数量 × 工序分钟 × 60 × 50%)`

**代码位置**：`miniprogram/pages/work/index.js` → `handleScan()`

### SKU系统（三端统一）

**SKU定义**：`styleNo + color + size`（如：`ST001 + 黑色 + L`）
- 订单包含多个SKU
- 菲号包含单色的多个尺码
- 验证规则在PC/小程序间一致

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

### 常用脚本

| 脚本 | 用途 | 使用方法 |
|------|------|----------|
| `./dev-public.sh` | 一键启动所有服务 | **主要开发命令** |
| `./git-sync.sh "msg"` | 自动 pull+commit+push | 快速提交 |
| `./miniprogram-check.sh` | 小程序质量检查 | 小程序提交前必查 |
| `deployment/db-manager.sh` | 数据库备份/恢复/迁移 | `./db-manager.sh backup` |

### 数据库关键信息

- 连接：`jdbc:mysql://127.0.0.1:3308/fashion_supplychain`（⚠️ 端口 3308！）
- Docker：`docker start fashion-mysql-simple`
- 管理：`deployment/db-manager.sh`
- UTF-8配置：`application.yml` 必须有 `server.servlet.encoding.force=true`

### 快速测试入口

参考 `QUICK_TEST_GUIDE.md`：
1. **扫码系统**：创建测试订单 → 小程序扫码 → 验证工序自动识别
2. **裁剪单**：生成裁剪单 → 检查二维码生成
3. **对账**：工厂/物料/发货对账流程

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

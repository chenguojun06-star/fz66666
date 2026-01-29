# GitHub Copilot 指令 - 服装供应链管理系统

> **最后更新**: 2026-01-30  
> **系统评分**: 96/100 ⭐⭐⭐⭐⭐  
> **文档版本**: v3.0

## 🎯 系统概览

三端协同的服装供应链管理系统：**Java Spring Boot 后端** + **React TypeScript PC端** + **微信小程序手机端**，管理从订单到生产、质检、对账的完整流程。

**核心技术栈**：
- 后端：Spring Boot 2.7.18 + MyBatis Plus 3.5.7 + MySQL 8.0 + Java 21
- PC端：React 18 + Ant Design 6.1.3 + Vite 7 + TypeScript 5.3.3 + Zustand
- 小程序：微信原生框架 + JSDoc 类型注释 + Design Token

**项目特点**：
- 📊 **高代码质量**：TODO清零、调试代码已清理、Mock数据标注完整
- 🏗️ **成熟架构**：26个Orchestrator编排器 + 26个通用组件
- 📚 **完善文档**：17份核心文档（含设计规范v3.0）
- 🔄 **三端统一**：SKU系统（款号+颜色+尺码）和验证规则跨平台一致
- 🎨 **设计系统v3.0**：纯色主题 + Design Token驱动 + 三级弹窗规范

## 🏗️ 架构关键设计

### 后端：Orchestrator 模式（核心架构）

**层次结构**：`Controller → Orchestrator → Service → Mapper`

- **Controller**: 接收HTTP请求，参数验证，使用 `@PreAuthorize("hasAuthority('CODE')")` 控制权限
- **Orchestrator**: 业务编排层，处理跨服务的复杂业务逻辑（26个编排器）
- **Service/ServiceImpl**: 单一领域的CRUD操作，不允许Service之间互相调用
- **Mapper**: MyBatis Plus数据访问层

**何时使用 Orchestrator**：
- ✅ 跨多个Service协调操作（如订单创建涉及Order + Cutting + Finance）
- ✅ 复杂事务管理和多步骤业务流程
- ❌ 简单单表CRUD直接用Service

**现有26个编排器按模块分布**：
```
backend/src/main/java/com/fashion/supplychain/*/orchestration/
├── production/        # 生产管理（8个）：ProductionOrder, CuttingTask, Scan, Quality...
├── finance/           # 财务（3个）：Finance, Payroll, CostAnalysis
├── reconciliation/    # 对账（3个）：Shipment, Factory, Material
├── warehouse/         # 仓储（2个）：Warehousing, Inventory
├── purchase/          # 采购（2个）：MaterialPurchase, Supplier
├── factory/           # 工厂（2个）：Factory, Performance
└── system/            # 系统（6个）：User, Role, Dashboard, Report, Notification, AuditLog
```

**编排器示例**：
```java
@Service
@Slf4j
public class ProductionOrderOrchestrator {
    @Autowired private ProductionOrderService orderService;
    @Autowired private CuttingTaskService cuttingService;
    @Autowired private StyleInfoService styleService;
    
    @Transactional
    public ProductionOrder createOrder(ProductionOrder order) {
        // 1. 验证款式信息
        StyleInfo style = styleService.getById(order.getStyleId());
        // 2. 创建订单
        orderService.save(order);
        // 3. 生成裁剪单（跨Service协调）
        cuttingService.createFromOrder(order);
        return order;
    }
}
```

### 前端：ResizableModal 三级弹窗规范（v3.0）

所有表单弹窗使用 `<ResizableModal>` 组件，**三级尺寸体系**：

```typescript
// ✅ 大窗口（60vw × 60vh）- 复杂表单、多Tab内容
<ResizableModal
  title="编辑生产订单"
  visible={visible}
  defaultWidth="60vw"
  defaultHeight="60vh"
>
  {/* 复杂表单内容 */}
</ResizableModal>

// ✅ 中窗口（40vw × 50vh）- 普通表单
<ResizableModal
  title="添加款式"
  visible={visible}
  defaultWidth="40vw"
  defaultHeight="50vh"
>
  {/* 普通表单 */}
</ResizableModal>

// ✅ 小窗口（30vw × 40vh）- 简单表单
<ResizableModal
  title="确认操作"
  visible={visible}
  defaultWidth="30vw"
  defaultHeight="40vh"
>
  {/* 简单确认框 */}
</ResizableModal>
```

**尺寸选择原则**：
- **大窗口60vw**：订单编辑、生产任务、对账单（字段多、有Tab切换）
- **中窗口40vw**：款式管理、菲号生成、物料采购（普通表单）
- **小窗口30vw**：确认对话框、简单输入（少于5个字段）

**⚠️ 已废弃尺寸**：旧版80vw × 85vh已全面替换为三级规范，禁止继续使用。

### 前端：QRCodeBox 统一二维码组件
所有二维码展示使用 `<QRCodeBox>` 组件，提供 4 种主题样式：
```typescript
// frontend/src/components/common/QRCodeBox.tsx
<QRCodeBox
  value={{ type: 'order', orderNo: 'PO20260122001' }}
  label="📱 订单扫码"
  variant="primary"  // primary(蓝)/default(灰)/success(绿)/warning(橙)
  size={120}
/>
```
- **variant='primary'**: 蓝色主题，用于重要扫码（订单扫码）
- **variant='default'**: 灰色主题，用于普通扫码（裁剪单、采购单）
- **variant='success'**: 绿色主题，用于成功状态（质检通过）
- **variant='warning'**: 橙色主题，用于警告状态（待处理）

已在 4+ 页面统一应用。参考 `QRCodeBox.examples.md` 查看完整用法。

### 前端：ModalContentLayout 通用弹窗布局（最新规范）

所有 ResizableModal 内的内容使用 `ModalContentLayout` 组件统一样式：

```typescript
// frontend/src/components/common/ModalContentLayout.tsx
import {
  ModalHeaderCard,
  ModalField,
  ModalPrimaryField,
  ModalFieldRow,
  ModalFieldGrid,
  ModalInfoCard,
  ModalSideLayout,
  ModalVerticalStack,
  ModalSectionTitle,
} from '@/components/common/ModalContentLayout';

// 头部灰色卡片
<ModalHeaderCard isMobile={false}>
  <ModalSideLayout
    left={<StyleCoverThumb />}
    right={
      <>
        {/* 重要字段（18px大字号） */}
        <ModalPrimaryField label="订单号" value="PO20260122001" />
        
        {/* 普通字段横向排列 */}
        <ModalFieldRow gap={24}>
          <ModalField label="款号" value="ST001" />
          <ModalField label="颜色" value="黑色" />
        </ModalFieldRow>
        
        {/* 网格字段（3列布局） */}
        <ModalFieldGrid columns={3}>
          <ModalField label="订单数量" value="500" />
          <ModalField label="完成数量" value="450" />
          <ModalField label="进度" value="85%" valueColor="#059669" />
        </ModalFieldGrid>
      </>
    }
  />
</ModalHeaderCard>
```

**9 个可组合组件**：
- `ModalHeaderCard`: 灰色背景头部卡片（#f8f9fa）
- `ModalField`: 普通字段（标签 13px + 值 14px）
- `ModalPrimaryField`: 重点字段（标签 14px + 值 18px）
- `ModalFieldRow`: 横向排列容器（gap 24px）
- `ModalFieldGrid`: 网格布局容器（PC端3列，移动端1列）
- `ModalInfoCard`: 白色信息卡片（带边框阴影）
- `ModalSideLayout`: 左右布局容器
- `ModalVerticalStack`: 垂直堆叠容器
- `ModalSectionTitle`: 段落标题（15px, 700字重）

**统一设计规范**：
- 标签字体：13-14px, #6b7280, 600字重
- 普通值：14px, #111827, 600字重
- 重点值：18px, #1f2937, 700字重
- 字段间距：24px
- 卡片内边距：PC 12px, 移动端 10px

### 前端：UniversalCardView 通用卡片视图组件
通用列表卡片视图组件，支持响应式布局和丰富配置：
```typescript
// frontend/src/components/common/UniversalCardView/index.tsx
import UniversalCardView from '@/components/common/UniversalCardView';

<UniversalCardView
  dataSource={records}
  columns={4}                    // PC端4列，移动端自适应
  coverField="coverImage"        // 封面图字段（1:1正方形）
  titleField="styleNo"
  subtitleField="color"
  fields={[
    { label: '数量', key: 'quantity', suffix: ' 件' },
    { label: '交板', key: 'deliveryTime' },
  ]}
  progressConfig={{              // 可选进度条
    calculate: (record) => calculateProgress(record),
    getStatus: (record) => getDeliveryStatus(record),
    show: true,
  }}
  actions={(record) => [...]}    // 操作菜单
  onCardClick={(record) => {}}   // 点击事件
/>
```
- 已在样板生产、裁剪单等页面应用
- 支持 ViewToggle 切换表格/卡片视图

### 前端：LiquidProgressLottie 进度球动画组件
基于 Lottie 的流体进度球动画组件：
```typescript
// frontend/src/components/common/LiquidProgressLottie.tsx
<LiquidProgressLottie
  percent={85}
  size={120}
  colorPreset="primary"  // primary/success/warning/danger
/>
```

### 前端：StyleAttachmentsButton 附件管理组件
款式附件管理组件，支持过滤显示特定类型附件：
```typescript
// frontend/src/components/common/StyleAttachmentsButton.tsx
<StyleAttachmentsButton
  styleId={record.styleId}
  onlyGradingPattern={true}  // 仅显示放码纸样（bizType='pattern_grading'）
/>
```
- **onlyGradingPattern=true**: 订单相关页面仅显示放码纸样，避免混淆
- **onlyGradingPattern=false**: 显示所有附件（默认）
- 已在 9+ 页面统一应用（生产订单、裁剪单、数据中心、物料采购等）
- 纸样完成验证：必须同时上传纸样文件(.dxf/.plt/.ets)和放码纸样才能标记完成

### 小程序：智能扫码工序识别（核心业务逻辑）
三种扫码模式（参考 `SKU_QUICK_REFERENCE.md` 和 `SCAN_SYSTEM_LOGIC.md`）：
1. **订单扫码(ORDER)**：扫 `PO20260122001`，显示SKU明细表单，用户选择数量
2. **菲号扫码(BUNDLE)**：扫 `PO20260122001-黑色-01`，自动识别菲号，直接确认提交
3. **SKU扫码(SKU)**：扫 SKU JSON，单个SKU直接提交

**智能工序识别**（核心功能）：
- 扫码次数决定工序（第1次=做领，第2次=上领...），无需手动选择
- 防重复保护：动态计算最小间隔 = `max(30秒, 菲号数量 × 工序分钟 × 60 × 50%)`
- 动态工序列表：从订单的 `progressNodeUnitPrices` 读取，支持任意配置

代码位置：`miniprogram/pages/work/index.js` 的 `handleScan` 函数

### SKU系统（三端统一）
**SKU定义**：`styleNo(款号) + color(颜色) + size(尺码)`
- 例如：`ST001 + 黑色 + L`
- 订单包含多个SKU，菲号包含单个颜色的多个尺码
- 三种扫码模式支持不同粒度的数据提交

参考 `SKU_QUICK_REFERENCE.md` 获取完整数据结构和流程说明。

## 🔑 开发工作流

### 启动开发环境
```bash
# 1. 启动 MySQL（Docker，注意端口3308非标准端口）
docker start fashion-mysql-simple

# 2. 后端（推荐用 dev-public.sh，自动加载 .run/backend.env）
./dev-public.sh  # 自动启动后端+前端+内网穿透（Cloudflare Tunnel）
# 或单独启动后端
cd backend && mvn spring-boot:run

# 3. 前端
cd frontend && npm run dev  # http://localhost:5173

# 4. 微信小程序
# 使用微信开发者工具打开 miniprogram/ 目录
```

**环境变量配置**（关键！）：
- 后端环境变量在 `.run/backend.env`（需自行创建，不入版本库，参考 `ENV_CONFIG_GUIDE.md`）
- 数据库连接默认 `localhost:3308`（⚠️ 非标准端口，Docker映射配置）
- JWT密钥、微信配置等敏感信息通过环境变量注入
- **必须使用 `dev-public.sh` 启动**，否则会因缺少环境变量导致 API 403 错误

### 实用脚本工具
| 脚本 | 用途 | 示例 |
|------|------|------|
| `./dev-public.sh` | 一键启动所有服务+内网穿透 | 推荐开发使用 |
| `./git-sync.sh` | 自动 pull + add + commit + push | `./git-sync.sh "提交信息"` |
| `./miniprogram-check.sh` | 小程序代码质量检查（ESLint + TypeScript） | 提交前必查 |
| `deployment/db-manager.sh` | 数据库备份/恢复/迁移 | `./db-manager.sh backup` |
| `check-system-status.sh` | 系统状态检查 | 快速诊断问题 |

### 数据库管理
- **配置**：`deployment/DATABASE_CONFIG.md`
- **管理脚本**：`deployment/db-manager.sh`（备份/恢复/迁移）
- **SQL 脚本**：`scripts/` 目录下的 `.sql` 文件
- **连接串**：`jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8`

### 快速测试
参考 `QUICK_TEST_GUIDE.md`，重点测试：
1. 扫码系统（菲号识别、防重复、工序自动切换）
2. 裁剪单生成（二维码生成）
3. 对账流程（工厂/物料/发货）

### Git 同步
```bash
./git-sync.sh "你的提交信息"  # 自动 pull + add + commit + push
```

## 📐 编码规范

### Java 后端
- **实体层**：`@TableName` 标记表名，使用 Lombok `@Data`
- **服务层**：优先编写 Orchestrator 处理跨服务逻辑，Service 只做本域 CRUD
- **权限控制**：`@PreAuthorize("hasAuthority('CODE')")` 配合 `permissionCodes` 常量
- **认证**：JWT Token，通过 `AuthTokenService` 和 `TokenAuthFilter` 实现
- **API 文档**：SpringDoc OpenAPI，访问 `/swagger-ui.html`
- **⚠️ UTF-8编码**：application.yml 必须配置 `server.servlet.encoding.force=true` 和 `spring.jackson.generator.escape-non-ascii=false`，否则中文乱码

### React 前端
- **组件规范**：功能组件 + TypeScript + Hooks
- **状态管理**：Zustand (`frontend/src/utils/appContext.tsx`)
- **表单验证**：Ant Design Form + `validationRules`（与小程序一致）
- **弹窗尺寸**：三级规范（大60vw/中40vw/小30vw），使用 `ResizableModal`
- **API 调用**：`services/api.ts` 统一封装，自动处理错误和 token
- **路由配置**：`routeConfig.ts` 定义路径和权限码
- **模块化结构**：按业务模块组织（`src/modules/` 下 basic/production/finance/system/dashboard）
- **页面目录**：新页面放入 `src/modules/{模块名}/pages/` 目录
- **路由懒加载**：模块入口使用 `React.lazy()` 实现代码分割
- **性能优化**：使用 `requestAnimationFrame` 优化 INP 到 <200ms，构建限制 chunk 大小（800KB main, 300KB vendor）
- **设计系统v3.0**：纯色主题（禁止渐变）+ Design Token驱动
- **通用组件**（26个标准组件）：
  - `ResizableModal`: 三级弹窗（大60vw/中40vw/小30vw）
  - `QRCodeBox`: 统一二维码组件（4种主题）
  - `ModalContentLayout`: 弹窗内容布局（9个可组合组件）
  - `UniversalCardView`: 通用卡片视图（支持ViewToggle切换）
  - `LiquidProgressLottie`: 流体进度球动画
  - `UnifiedDatePicker`: 统一日期选择器（dayjs）
  - `SortableColumn`: 通用排序列组件
  - `StyleAttachmentsButton`: 款式附件按钮（支持 `onlyGradingPattern` 过滤放码纸样）

### 微信小程序
- **目录结构**：`pages/` 页面，`utils/` 工具，`components/` 组件
- **设计规范**：使用 Design Token 统一样式（`styles/design-tokens.wxss`），浅蓝渐变主题
- **快捷入口**：首页5个快捷入口一行布局（生产、入库、异常、扫码、个人）
- **网络请求**：使用 `utils/request.js`（10s 超时，2次重试）
- **数据验证**：`utils/dataValidator.js` + `utils/validationRules.js`（与 PC 端规则一致）
- **错误处理**：`utils/errorHandler.js` 统一 7 种错误分类
- **实时同步**：`utils/syncManager.js` 提供 30s 轮询机制
- **类型定义**：`types/index.js` 使用 JSDoc 注释实现 IDE 提示
- **代码质量工具**：
  - ESLint: `cd miniprogram && npm run 检查`（检查）、`npm run 修复`（自动修复）
  - TypeScript: `npm run 类型检查`（JSDoc 类型检查）
  - 完整检查: `./miniprogram-check.sh`（一键检查所有问题）
  - 详见：`docs/小程序开发工具指南.md`
- **代码规范**：
  - 所有 if/for/while 必须使用大括号（`curly: all`）
  - 未使用参数以下划线前缀（`argsIgnorePattern: "^_"`）
  - 复杂度上限15（核心业务逻辑允许适当超出）
  - 函数最大行数150（不含空行和注释）

## 🔍 关键文件速查

### 必读文档（优先级排序）
1. `开发指南.md` - **开发指南**（⭐ 最重要，包含完整架构和最佳实践）
2. `系统状态.md` - 系统状态和文档索引（从这里开始）
3. `设计系统完整规范-2026.md` - **设计系统v3.0**（纯色主题+Design Token+三级弹窗）
4. `P0-P1任务完成总结-2026-01-29.md` - 最新任务完成总结（TODO清零+代码质量提升）
5. `docs/扫码和SKU系统完整指南.md` - **SKU系统完整说明**（款号+颜色+尺码统一）
6. `架构评估报告.md` - 架构评估报告（96分细节）
7. `项目技术文档.md` - 完整技术文档
8. `业务流程说明.md` - 业务流程说明
9. `docs/代码质量工具完整指南.md` - 代码质量与业务优化工具（30+工具，PC端+后端）
10. `docs/小程序开发完整指南.md` - **小程序专用工具**（ESLint, TypeScript, 性能分析）
11. `docs/功能实现指南.md` - 排序、工序、权限等功能实现指南

### 核心配置
- `backend/pom.xml` - Spring Boot 2.7.18, MyBatis Plus 3.5.7, Java 21
- `frontend/package.json` - React 18, Ant Design 6.1.3, Vite 7
- `deployment/docker-compose.yml` - 生产环境部署配置
- `.run/backend.env` - 后端环境变量（需自行创建）

### 关键业务文件
- 订单实体：`backend/src/main/java/com/fashion/supplychain/production/entity/ProductionOrder.java`
- PC端路由：`frontend/src/routeConfig.ts`
- 小程序扫码：`miniprogram/pages/work/index.js`（含SKUProcessor扫码逻辑）
- 前端弹窗：`frontend/src/components/common/ResizableModal.tsx`
- 卡片视图：`frontend/src/components/common/UniversalCardView/index.tsx`
- 后端编排器示例：`backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionOrderOrchestrator.java`

## 💡 技术亮点与注意事项

### 数据同步
- 小程序和 PC 端使用相同的验证规则库（`validationRules`），确保数据一致性
- 小程序有实时同步机制（30s 轮询），PC 端暂无，需手动刷新

### 性能优化
- PC 端采用 `requestAnimationFrame` 优化 INP 到 <200ms
- 构建配置限制 chunk 大小（800KB main, 300KB vendor）
- 代码分割：路由级懒加载

### 安全与权限
- 后端使用 Spring Security + JWT
- 支持微信用户手动输入账户登录（`app.auth.header-auth-enabled`）
- 数据权限：角色绑定 `dataScope`（ALL/FACTORY_ONLY）

### 扫码系统特殊逻辑
- 菲号（Bundle）格式：`orderNo + color + seq`，例如 `PO20260122001-黑色-01`
- 工序自动识别基于扫码次数，配置在订单的 `progressNodeUnitPrices` 中
- 防重复时间计算：`max(30秒, 菲号数量 × 工序分钟 × 60 × 50%)`
- 详细逻辑参考 `SCAN_SYSTEM_LOGIC.md`

### 文档优化历史
- 2026-01-29：**P0/P1任务完成**（TODO清零、Mock数据标注、调试代码清理、成品结算审批API）
- 2026-01-27：代码质量大提升（小程序ESLint↓93.7%，后端清理未使用导入）+ 附件系统优化（放码纸样过滤）
- 2026-01-26：文档大整合，从34份精简到15份核心文档（↓ 56%）
- 2026-01-24：从60+份文档优化到34份（首次）
- 删除了28份过时/重复/已完成的报告文档
- 集成了工资结算模块到人员工序结算
- SKU系统整合完成，三端统一
- **设计系统v3.0**：三级弹窗规范（60vw/40vw/30vw）+ 纯色主题 + ModalContentLayout统一布局

## 🚀 常见任务指南

### 添加新业务模块
1. 后端：创建 `entity` → `mapper` → `service/serviceImpl` → `orchestrator`（如需跨服务） → `controller`
2. 前端：在 `src/modules/{模块}/pages/` 创建目录 → 添加路由到 `routeConfig.ts` → 编写 API 到 `services/`
3. 权限：在数据库 `t_role_permission` 添加权限码，后端 controller 添加 `@PreAuthorize`

### 修改弹窗表单
1. 找到对应页面（如 `frontend/src/modules/production/pages/Production/Cutting/index.tsx`）
2. 使用 `<ResizableModal>` 包裹表单，按复杂度选择尺寸：
   - 大窗口60vw：复杂表单、多Tab内容
   - 中窗口40vw：普通表单
   - 小窗口30vw：简单确认框
3. 表单校验使用 Ant Design 的 `rules` 配合 `validationRules`
4. 弹窗内容使用 `ModalContentLayout` 组件统一样式

### 扫码系统调试
1. 参考 `QUICK_TEST_GUIDE.md` 创建测试订单
2. 在小程序 `pages/work/index.js` 的 `handleScan` 打断点
3. 验证流程：扫码 → 模式识别(ORDER/BUNDLE/SKU) → 工序判断 → 防重复检查 → API 调用

### 数据库变更
1. 编写 SQL 脚本放到 `scripts/` 目录
2. 使用 `deployment/db-manager.sh` 执行备份后再执行
3. 更新对应的 Java Entity 和 TypeScript 类型定义

---

*最后更新：2026-01-30*  
*维护者：如需更多细节，查阅根目录的 MD 文档*

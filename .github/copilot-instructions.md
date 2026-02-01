# GitHub Copilot 指令 - 服装供应链管理系统

> **最后更新**: 2026-02-02  
> **系统评分**: 97/100 ⭐⭐⭐⭐⭐  
> **版本**: v3.4 (文档验证版)

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
5. **API优化**：`API优化项目总结报告-2026-02-01.md` (-55端点，5种新模式)
6. **环境配置**：`.run/backend.env` (**必需！** 缺少会导致403错误)


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

**关键编排器**（35个）：
- `ProductionOrderOrchestrator`：生产订单（订单+裁剪+对账）
- `MaterialInboundOrchestrator`：面辅料入库（采购+库存+对账）
- `ProductWarehousingOrchestrator`：成品入库（入库+库存+SKU）
- `ScanRecordOrchestrator`：工序扫码（扫码+工资结算+进度更新）
- `PayrollSettlementOrchestrator`：工资结算（工序+委派+对账）
- `ReconciliationBackfillOrchestrator`：对账回填（订单→财务对账）

### 后端：智能路由与参数化查询模式（2026-02最新）

**核心创新**：20个Controller完成API优化，减少55个端点（-16.4%）

**5种API设计模式**（必须遵循）：

#### 1. 智能路由模式（10个Controller已应用）
单一端点 + 参数路由替代多个独立端点：

```java
// ❌ 旧方式：10个独立端点
@GetMapping("/by-order/{orderId}")
@GetMapping("/by-style/{styleNo}")
@GetMapping("/current-user")

// ✅ 新方式：1个智能端点（支持参数组合）
@GetMapping("/list")
public R<List<T>> list(
    @RequestParam(required = false) Long orderId,
    @RequestParam(required = false) String styleNo,
    @RequestParam(required = false) Boolean currentUser
) {
    // 根据参数路由到不同查询逻辑
}
```

**已应用Controller**：ProductionOrder, ScanRecord, MaterialPurchase, CuttingTask, CuttingBundle, OrderTransfer, TemplateLibrary, MaterialPicking, FinishedSettlement, MaterialStock

**实际代码示例**（ProductionOrderController）：
```java
@GetMapping("/list")
@PreAuthorize("hasAuthority('PRODUCTION_ORDER_VIEW')")
public Result<?> list(@RequestParam Map<String, Object> params) {
    // 参数路由：id参数→单条详情
    if (params.containsKey("id") && params.get("id") != null) {
        ProductionOrder detail = productionOrderOrchestrator.getDetailById(params.get("id").toString());
        return Result.success(detail);
    }
    
    // 参数路由：orderNo精确查询
    if (params.containsKey("orderNo") && params.size() <= 3) {
        String orderNo = params.get("orderNo").toString();
        if (orderNo.startsWith("PO") && orderNo.length() >= 10) {
            ProductionOrder detail = productionOrderOrchestrator.getDetailByOrderNo(orderNo);
            if (detail != null) return Result.success(detail);
        }
    }
    
    // 默认：分页查询（支持多条件组合）
    IPage<ProductionOrder> page = productionOrderOrchestrator.queryPage(params);
    return Result.success(page);
}
```

#### 2. 状态机统一端点（3个Controller已应用）
stage × action 矩阵替代多个状态转换端点：

```java
// ❌ 旧方式：14个状态转换端点
@PostMapping("/{id}/pattern/start")
@PostMapping("/{id}/pattern/complete")
@PostMapping("/{id}/sample/start")
...（11个更多）

// ✅ 新方式：1个状态机端点
@PostMapping("/{id}/stage-action")
public R<Void> stageAction(
    @PathVariable Long id,
    @RequestParam String stage,  // pattern/sample/bom/process
    @RequestParam String action  // start/complete/reset
) {
    // 状态转换矩阵
}
```

**已应用Controller**：StyleInfo（-13端点）, PatternRevision（-3端点）, User（-2端点）

#### 3. GET/POST双模式（4个Controller）
支持GET查询参数 + POST JSON Body：

```java
@PostMapping("/list")
public R<Page<T>> list(@RequestBody QueryDTO query) {
    // 复杂查询用JSON Body
}

@GetMapping("/list")
public R<Page<T>> list(QueryDTO query) {
    // 简单查询用Query参数（向后兼容）
}
```

#### 4. RESTful规范化（3个Controller）
`/page` → `/list`（遵循RESTful命名）

#### 5. 参数化查询（降低复杂度）
多条件查询用单一端点 + 可选参数

### 前端：ResizableModal 三级弹窗规范（v3.0）

**所有表单弹窗必须使用** `ResizableModal`（`frontend/src/components/common/ResizableModal.tsx`）的标准化尺寸：

```typescript
// 大窗口（60vw × 60vh）- 复杂表单、多Tab
<ResizableModal defaultWidth="60vw" defaultHeight="60vh">

// 中窗口（40vw × 50vh）- 标准表单  
<ResizableModal defaultWidth="40vw" defaultHeight="50vh">

// 小窗口（30vw × 40vh）- 简单确认框
<ResizableModal defaultWidth="30vw" defaultHeight="40vh">
```

**⚠️ 已废弃**：旧版 80vw × 85vh 弹窗已全系统替换

**使用位置**：20+ pages使用（MaterialDatabase, ProductWarehousing, PaymentApproval等）

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

**防重复提交算法**（核心逻辑详解）：
```javascript
// 算法公式：max(30秒, 菲号数量 × 工序分钟 × 60 × 50%)
// 示例：10件菲号，5分钟工序 → max(30, 10×5×60×0.5) = 150秒

const MIN_INTERVAL_SEC = 30;  // 最小间隔：30秒兜底
const PROCESS_MINUTES = nodes[stepIndex]?.minutes || 5;  // 工序标准工时
const calculatedInterval = bundleSize * PROCESS_MINUTES * 60 * 0.5;  // 50%缓冲
const interval = Math.max(MIN_INTERVAL_SEC, calculatedInterval);

// 实际应用：miniprogram/pages/work/index.js
const lastSubmitKey = `${orderId}_${stepIndex}`;
const lastSubmitTime = this.data.lastSubmitTimes[lastSubmitKey] || 0;
const now = Date.now();
if (now - lastSubmitTime < interval * 1000) {
  const remaining = Math.ceil((interval * 1000 - (now - lastSubmitTime)) / 1000);
  toast.warning(`请等待 ${remaining} 秒后再提交`);
  return;
}
```

**为什么这样设计**：
- 30秒最小间隔：防止误触
- 50%缓冲系数：考虑熟练工人比标准工时快
- 菲号数量 × 工时：大批量需要更多时间

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
# 1. 创建环境变量文件（⚠️ 必需，否则403错误）
mkdir -p .run
cat > .run/backend.env << 'EOF'
SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:3308/fashion_supplychain?useUnicode=true&characterEncoding=utf-8
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=changeme
APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
EOF

# 2. 启动MySQL（Docker）
docker start fashion-mysql-simple || docker run -d \
  --name fashion-mysql-simple \
  -p 3308:3306 \
  -e MYSQL_ROOT_PASSWORD=changeme \
  -e MYSQL_DATABASE=fashion_supplychain \
  mysql:8.0

# 3. 验证服务启动
echo "等待MySQL启动..."
sleep 10
mysql -h 127.0.0.1 -P 3308 -u root -pchangeme -e "SELECT 1" && echo "✅ MySQL正常"
curl -s http://localhost:8080/actuator/health | grep UP && echo "✅ 后端正常"
curl -s http://localhost:5173 > /dev/null && echo "✅ 前端正常"

# 4. 获取测试Token（用于API调试）
curl -X POST http://localhost:8080/api/system/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}' \
  | jq -r '.data.token'
```

**启动失败排查**：
```bash
# MySQL未启动
lsof -iTCP:3308 -sTCP:LISTEN  # 应该显示mysqld进程

# 后端编译失败
cd backend && mvn clean compile  # 查看具体错误

# 前端依赖缺失
cd frontend && npm install  # 重新安装依赖

# 端口被占用
lsof -iTCP:8080 -sTCP:LISTEN  # 查找占用8080的进程
kill -9 <PID>  # 杀掉占用进程
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

## � 错误处理与调试

### 统一响应格式（Result类）

**所有API返回**必须使用 `Result<T>` 包装：

```java
// backend/src/main/java/com/fashion/supplychain/common/Result.java
public class Result<T> {
    private Integer code;      // 200=成功, 500=失败
    private String message;    // 提示信息
    private T data;            // 业务数据
    private String requestId;  // 请求追踪ID（自动注入）
    
    public static <T> Result<T> success(T data) {
        Result<T> result = new Result<>();
        result.setCode(200);
        result.setMessage("操作成功");
        result.setData(data);
        result.setRequestId(MDC.get("requestId"));  // 从MDC获取
        return result;
    }
    
    public static <T> Result<T> error(String message) {
        Result<T> result = new Result<>();
        result.setCode(500);
        result.setMessage(message);
        result.setRequestId(MDC.get("requestId"));
        return result;
    }
}
```

**前端API调用**（`frontend/src/services/request.ts`）：
```typescript
// 自动解包Result，仅返回data字段
const response = await request.get('/api/production/order/list');
if (response.code === 200) {
  return response.data;  // 直接使用业务数据
} else {
  message.error(response.message);  // 显示错误提示
  throw new Error(response.message);
}
```

### 常见错误排查（5分钟快速定位）

#### 1. 403 Forbidden错误
**症状**：API调用返回403，前端无法访问后端

**原因**：
- ❌ 缺少 `.run/backend.env` 环境变量文件
- ❌ JWT Token过期或无效
- ❌ 权限码不匹配（`@PreAuthorize` 检查失败）

**快速修复**：
```bash
# 1. 检查环境变量
cat .run/backend.env  # 应包含 SPRING_DATASOURCE_URL 等

# 2. 重新登录获取Token
curl -X POST http://localhost:8080/api/system/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'

# 3. 检查权限配置
# backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java
```

#### 2. 404 Not Found错误
**症状**：API调用返回404，但后端服务正常运行

**常见原因**：
- ❌ 前端Vite代理配置缺失或错误
- ❌ 端点路径错误（如使用了已废弃的旧端点）
- ❌ 后端Controller未正确映射

**快速诊断**：
```bash
# 1. 检查后端是否运行且端点存在
curl http://localhost:8080/api/production/order/list?page=1&pageSize=10

# 2. 检查Vite代理配置
cat frontend/vite.config.ts | grep -A 30 "server"

# 3. 检查前端请求的URL
# Chrome DevTools → Network → 查看Request URL
# 应该是：http://localhost:5173/api/... (会被代理到8080)
```

**修复Vite代理配置**（`frontend/vite.config.ts`）：
```typescript
export default defineConfig({
  // ... 其他配置
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',  // 后端地址
        changeOrigin: true,
        secure: false
      }
    }
  }
})
```

**API迁移问题**（2026-02优化后）：
```javascript
// 旧端点（已废弃）
GET /api/production/order/detail/:orderNo  // ❌ 404

// 新端点（统一查询）
GET /api/production/order/list?orderNo=PO20260131001  // ✅ 正确

// 前端适配层会自动转换，但如果看到404，检查：
// frontend/src/services/legacyApiAdapter.ts
```

#### 3. 数据丢失/不显示问题
**症状**：单价维护/某个模块的数据突然消失

**案例：单价维护空白（2026-02-02已修复）**
- **问题**：工序模板缺少 `unitPrice` 字段，前端无法显示数据
- **诊断**：检查数据库 `t_template_library` 表的 `template_content` 字段
- **修复**：执行 `./fix-template-unit-prices-phase2.sh` 自动补全单价
- **详细文档**：`docs/单价维护修复总结.md`

**排查步骤**：
```bash
# 1. 检查数据库数据是否存在
mysql -h 127.0.0.1 -P 3308 -u root -pchangeme fashion_supplychain
SELECT COUNT(*) FROM t_style_size_price;  # 检查单价表
SELECT * FROM t_style_size_price WHERE deleted = 0 LIMIT 10;  # 查看数据

# 2. 检查API返回
curl "http://localhost:8080/api/style/size-price/list?page=1&pageSize=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. 检查前端控制台错误
# Chrome DevTools → Console → 查看是否有API错误
```

**常见原因**：
- ❌ **逻辑删除字段被误改**：`deleted = 1`（数据未真删除，但被标记为删除）
- ❌ **数据权限过滤**：当前用户只能看到部分数据（工厂/部门权限）
- ❌ **API查询条件问题**：前端传递了错误的筛选条件
- ❌ **缓存问题**：浏览器/后端缓存了旧数据

**修复数据**：
```sql
-- 恢复误删除的数据（逻辑删除）
UPDATE t_style_size_price SET deleted = 0 WHERE deleted = 1;

-- 检查数据权限字段
SELECT id, style_no, price, factory_id, department_id 
FROM t_style_size_price 
WHERE deleted = 0;
```

**清除缓存**：
```bash
# 清除浏览器缓存：Ctrl+Shift+Delete
# 或强制刷新：Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)

# 清除后端缓存（如果使用了Caffeine）
# 重启后端服务即可
./dev-public.sh
```

#### 4. 中文乱码问题
**症状**：数据库存储/API返回的中文显示为乱码

**必须配置**（`application.yml`）：
```yaml
spring:
  jackson:
    generator:
      escape-non-ascii: false  # ⚠️ 关键：禁用ASCII转义
  servlet:
    encoding:
      force: true
      charset: UTF-8
```

#### 3. MySQL连接失败
**症状**：启动时报错 "Communications link failure"

**检查清单**：
```bash
# 1. MySQL是否在运行（注意端口3308）
lsof -iTCP:3308 -sTCP:LISTEN

# 2. 启动Docker容器
docker start fashion-mysql-simple

# 3. 测试连接
mysql -h 127.0.0.1 -P 3308 -u root -p
```

#### 4. 前端API调用超时
**症状**：请求等待很久后失败，控制台显示timeout

**排查步骤**：
```javascript
// 1. 检查后端是否正常运行
curl http://localhost:8080/actuator/health

// 2. 检查网络请求配置（frontend/src/services/request.ts）
timeout: 10000,  // 默认10秒，复杂查询可调大

// 3. 后端日志查看慢SQL（超过2秒的查询）
tail -f backend/logs/application.log | grep "slow query"
```

### 调试技巧

#### 后端调试（IntelliJ IDEA）
1. **断点位置**：
   - Controller入口：查看请求参数
   - Orchestrator方法：检查跨服务调用
   - Service保存前：验证数据正确性

2. **日志追踪**（使用requestId）：
```java
log.info("[{}] 创建订单开始, orderNo={}", 
    MDC.get("requestId"), order.getOrderNo());
```

#### 前端调试（Chrome DevTools）
```javascript
// 1. API请求追踪（Network面板）
// 筛选：XHR → 查看Request/Response → 复制cURL重放

// 2. 状态管理调试（Zustand）
// frontend/src/utils/appContext.tsx
console.log('[Zustand State]', useAppStore.getState());

// 3. 表单验证调试
// Ant Design Form → 查看validateFields()返回值
form.validateFields().then(values => {
  console.log('[Form Values]', values);
}).catch(errors => {
  console.error('[Validation Errors]', errors);
});
```

#### 小程序调试
```bash
# 1. 运行质量检查
./miniprogram-check.sh

# 2. 查看控制台日志
# 微信开发者工具 → 调试器 → Console

# 3. 网络请求抓包
# 调试器 → Network → 筛选API调用

# 4. 存储数据查看
# 调试器 → Storage → 查看本地缓存
wx.getStorageSync('orderCache')
```

## �💡 代码质量规则

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

## 🔄 数据流动与事务管理

### 典型数据流（以面辅料入库为例）

```
用户操作（PC端）
    ↓
[Controller] MaterialInboundController.create()
    ↓ 参数验证 + 权限检查
[Orchestrator] MaterialInboundOrchestrator.createInbound()
    ↓ @Transactional 开启事务
    ├─ [Service] MaterialInboundService.save()          // 保存入库单
    ├─ [Service] MaterialStockService.increaseStock()   // 增加库存
    └─ [Service] ReconciliationService.backfill()       // 回填对账单
    ↓ 事务提交（全部成功或全部回滚）
[Response] Result.success(inbound)
    ↓
前端更新UI
```

**关键规则**：
1. **事务边界**：仅在 Orchestrator 层使用 `@Transactional`
2. **Service隔离**：Service 不能直接调用其他 Service（通过 Orchestrator 协调）
3. **异常处理**：Service 抛出异常 → Orchestrator 捕获 → 返回友好错误信息

### 跨服务调用示例

```java
@Service
public class ProductionOrderOrchestrator {
    @Autowired private ProductionOrderService orderService;
    @Autowired private CuttingTaskService cuttingService;  // ⚠️ 跨服务
    @Autowired private FinanceService financeService;      // ⚠️ 跨服务
    
    @Transactional(rollbackFor = Exception.class)  // ⚠️ 必须加事务注解
    public ProductionOrder createOrderWithWorkflow(ProductionOrder order) {
        try {
            // 1. 保存订单（本服务）
            ProductionOrder saved = orderService.save(order);
            
            // 2. 生成裁剪单（跨服务 - 生产模块）
            cuttingService.createFromOrder(saved);
            
            // 3. 回填财务对账（跨服务 - 财务模块）
            financeService.backfillFromOrder(saved);
            
            return saved;
        } catch (Exception e) {
            log.error("[{}] 订单创建失败", MDC.get("requestId"), e);
            throw new BusinessException("订单创建失败: " + e.getMessage());
        }
    }
}
```

**为什么这样设计**：
- ✅ 单一职责：每个Service只管自己的领域
- ✅ 可测试：Orchestrator可以mock Service进行单元测试
- ✅ 事务一致性：一个事务管理多个Service操作
- ✅ 易维护：业务流程在Orchestrator集中管理

### 库存系统数据流（2026-01-30新增）

```
采购入库流程：
  MaterialPurchaseController
    → MaterialInboundOrchestrator.createInbound()
      → MaterialInboundService.save()           // 入库单
      → MaterialStockService.increaseStock()    // +库存
      → ReconciliationService.backfillPurchase() // 对账回填

成品入库流程：
  ProductWarehousingController
    → ProductWarehousingOrchestrator.warehousing()
      → ProductWarehousingService.save()        // 入库单
      → ProductSkuService.increaseStock()       // +SKU库存
      → ReconciliationService.backfillFactory() // 工厂对账回填

成品出库流程：
  ProductOutstockController
    → ProductOutstockOrchestrator.createOutstock()
      → ProductOutstockService.save()           // 出库单
      → ProductSkuService.decreaseStock()       // -SKU库存（带校验）
      → ReconciliationService.backfillShipment() // 发货对账回填
```

**库存一致性保证**：
- 所有库存操作必须在事务中执行
- 出库前检查库存是否充足（`checkStock()`）
- 使用乐观锁防止超卖（MyBatis Plus `@Version`）

### API测试与验证

**推荐工具**（按使用频率）：

1. **Swagger UI**（首选 - 零配置）
   - 访问：`http://localhost:8080/swagger-ui.html`
   - 优势：API更新自动同步，无需手动维护
   - 使用：选择接口 → Try it out → 填参数 → Execute

2. **Apifox**（团队协作）
   - 导入：Settings → 导入 `/v3/api-docs`
   - 优势：Mock数据 + 自动化测试 + 前后端共享
   - 适用：API频繁更新时的回归测试

3. **cURL命令**（快速验证）
```bash
# 登录获取Token
curl -X POST http://localhost:8080/api/system/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'

# 使用Token调用API
curl -X GET "http://localhost:8080/api/production/order/list?status=IN_PRODUCTION" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

4. **Postman Collection**（可选）
   - 导入：File → Import → OpenAPI → `/v3/api-docs`
   - 环境变量：`{{baseUrl}}` = `http://localhost:8080`

**UI自动化测试工具**：

- **Playwright**（Web端首选）
  ```javascript
  // 测试订单创建流程
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: '新建订单' }).click();
  await page.locator('#orderNo').fill('PO20260201001');
  await page.locator('#styleNo').fill('ST001');
  await page.getByRole('button', { name: '提交' }).click();
  await expect(page.getByText('创建成功')).toBeVisible();
  ```

- **Appium**（小程序/移动端）
  - 适用场景：小程序扫码、工序提交等移动端功能
  - 配置：需要微信开发者工具支持

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
- AI指令v3.3（900+行，完整覆盖）
- 操作指南完善（INVENTORY_SYSTEM_GUIDE等）

## ⚡ 性能优化实践

### 慢SQL检测与优化

**自动慢SQL日志**（MyBatis Plus配置）：

```yaml
# backend/src/main/resources/application.yml
mybatis-plus:
  configuration:
    log-impl: org.apache.ibatis.logging.slf4j.Slf4jImpl  # 启用SQL日志
  global-config:
    db-config:
      logic-delete-field: deleted
      logic-delete-value: 1
      logic-not-delete-value: 0

# application-prod.yml（生产环境）
logging:
  level:
    com.fashion.supplychain.*.mapper: WARN  # 生产关闭详细日志
    
# 慢SQL阈值配置
spring:
  datasource:
    hikari:
      leak-detection-threshold: 60000  # 连接泄漏检测：60秒
```

**手动监控慢SQL**：
```bash
# 1. 开启MySQL慢查询日志（Docker容器）
docker exec fashion-mysql-simple mysql -u root -pchangeme -e "
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;  -- 超过2秒的查询
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';"

# 2. 查看慢查询日志
docker exec fashion-mysql-simple tail -f /var/log/mysql/slow.log

# 3. 分析慢查询（mysqldumpslow）
docker exec fashion-mysql-simple mysqldumpslow -s t -t 10 /var/log/mysql/slow.log
```

**常见慢SQL优化模式**：

#### 1. 避免 SELECT *（只查需要的字段）
```java
// ❌ 错误：查询所有字段
List<ProductionOrder> orders = productionOrderMapper.selectList(null);

// ✅ 正确：只查必需字段
LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
wrapper.select(ProductionOrder::getId, ProductionOrder::getOrderNo, 
               ProductionOrder::getStyleNo, ProductionOrder::getStatus);
List<ProductionOrder> orders = productionOrderMapper.selectList(wrapper);
```

#### 2. 添加索引（针对频繁查询的字段）
```sql
-- 查看慢查询涉及的表
EXPLAIN SELECT * FROM t_production_order WHERE style_no = 'ST001';

-- 如果type=ALL（全表扫描），添加索引
CREATE INDEX idx_style_no ON t_production_order(style_no);

-- 复合索引（多字段查询）
CREATE INDEX idx_status_factory ON t_production_order(status, factory_id);

-- 验证索引生效
EXPLAIN SELECT * FROM t_production_order WHERE style_no = 'ST001';
-- type应变为ref或range
```

#### 3. 分页查询优化（大数据量）
```java
// ❌ 错误：深分页性能差（OFFSET 10000, 100）
Page<ProductionOrder> page = new Page<>(100, 100);  // 第100页
IPage<ProductionOrder> result = productionOrderMapper.selectPage(page, null);

// ✅ 正确：使用游标分页（记录上次最大ID）
LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
wrapper.gt(ProductionOrder::getId, lastMaxId)  // 大于上次最大ID
       .orderByAsc(ProductionOrder::getId)
       .last("LIMIT 100");
List<ProductionOrder> orders = productionOrderMapper.selectList(wrapper);
```

### N+1查询避免

**问题示例**（1次查询订单 + N次查询款式）：
```java
// ❌ 错误：导致N+1查询
List<ProductionOrder> orders = productionOrderMapper.selectList(null);  // 1次查询
for (ProductionOrder order : orders) {
    StyleInfo style = styleInfoMapper.selectById(order.getStyleId());  // N次查询！
    order.setStyleInfo(style);
}
```

**解决方案1：一次性批量查询**：
```java
// ✅ 正确：2次查询代替N+1次
List<ProductionOrder> orders = productionOrderMapper.selectList(null);  // 1次
Set<Long> styleIds = orders.stream()
    .map(ProductionOrder::getStyleId)
    .filter(Objects::nonNull)
    .collect(Collectors.toSet());

if (!styleIds.isEmpty()) {
    List<StyleInfo> styles = styleInfoMapper.selectBatchIds(styleIds);  // 1次批量查询
    Map<Long, StyleInfo> styleMap = styles.stream()
        .collect(Collectors.toMap(StyleInfo::getId, s -> s));
    
    orders.forEach(order -> 
        order.setStyleInfo(styleMap.get(order.getStyleId()))
    );
}
```

**解决方案2：使用JOIN查询**：
```java
// ✅ 最优：1次JOIN查询
@Select("SELECT o.*, s.style_no, s.style_name " +
        "FROM t_production_order o " +
        "LEFT JOIN t_style_info s ON o.style_id = s.id " +
        "WHERE o.deleted = 0")
List<ProductionOrderWithStyle> selectOrdersWithStyle();
```

**解决方案3：使用MyBatis Plus的关联查询**：
```java
// 在Orchestrator中使用批量查询
public IPage<ProductionOrder> queryPageWithDetails(Map<String, Object> params) {
    // 1. 分页查询订单
    IPage<ProductionOrder> page = productionOrderMapper.selectPage(buildPage(params), buildWrapper(params));
    
    if (page.getRecords().isEmpty()) {
        return page;
    }
    
    // 2. 批量查询关联数据（避免N+1）
    Set<Long> styleIds = page.getRecords().stream()
        .map(ProductionOrder::getStyleId)
        .filter(Objects::nonNull)
        .collect(Collectors.toSet());
    
    Map<Long, StyleInfo> styleMap = styleInfoService.listByIds(styleIds).stream()
        .collect(Collectors.toMap(StyleInfo::getId, s -> s));
    
    // 3. 填充关联数据
    page.getRecords().forEach(order -> {
        if (order.getStyleId() != null) {
            order.setStyleInfo(styleMap.get(order.getStyleId()));
        }
    });
    
    return page;
}
```

### 缓存策略

**Spring Cache + Caffeine（本地缓存）**：
```java
// 1. 添加依赖：pom.xml
<dependency>
    <groupId>com.github.ben-manes.caffeine</groupId>
    <artifactId>caffeine</artifactId>
</dependency>

// 2. 配置缓存
@Configuration
@EnableCaching
public class CacheConfig {
    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        cacheManager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(1000)  // 最多1000个条目
            .expireAfterWrite(10, TimeUnit.MINUTES)  // 10分钟过期
            .recordStats());
        return cacheManager;
    }
}

// 3. 使用缓存
@Service
public class StyleInfoService {
    
    @Cacheable(value = "styleInfo", key = "#id")
    public StyleInfo getById(Long id) {
        return styleInfoMapper.selectById(id);
    }
    
    @CacheEvict(value = "styleInfo", key = "#styleInfo.id")
    public boolean updateById(StyleInfo styleInfo) {
        return styleInfoMapper.updateById(styleInfo) > 0;
    }
}
```

**性能监控指标**：
```java
// 在Orchestrator中记录查询耗时
@Slf4j
@Service
public class ProductionOrderOrchestrator {
    
    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        long startTime = System.currentTimeMillis();
        
        try {
            IPage<ProductionOrder> result = productionOrderQueryService.queryPage(params);
            
            long duration = System.currentTimeMillis() - startTime;
            if (duration > 2000) {  // 超过2秒记录警告
                log.warn("[慢查询] 订单查询耗时{}ms, params={}", duration, params);
            }
            
            return result;
        } finally {
            long duration = System.currentTimeMillis() - startTime;
            MDC.put("queryDuration", String.valueOf(duration));
        }
    }
}
```

---

## 🔒 安全最佳实践

### JWT Token管理

**Token生成与验证**（`AuthTokenService.java`）：

```java
@Service
public class AuthTokenService {
    
    private final byte[] secret;  // JWT密钥（从环境变量加载）
    
    // 1. 生成Token（登录时调用）
    public String issueToken(TokenSubject subject, Duration ttl) {
        Duration safeTtl = ttl == null ? Duration.ofHours(12) : ttl;  // 默认12小时
        long nowMillis = System.currentTimeMillis();
        
        Map<String, Object> payload = new HashMap<>();
        payload.put("uid", subject.getUserId());
        payload.put("uname", subject.getUsername());
        payload.put("roleId", subject.getRoleId());
        payload.put("roleName", subject.getRoleName());
        payload.put("permRange", subject.getPermissionRange());  // 数据权限范围
        payload.put("iat", new Date(nowMillis));  // 签发时间
        payload.put("exp", new Date(nowMillis + safeTtl.toMillis()));  // 过期时间
        
        return JWT.create().addPayloads(payload).setKey(secret).sign();
    }
    
    // 2. 验证Token（每次请求自动调用）
    public TokenSubject verifyAndParse(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        
        JWT jwt;
        try {
            jwt = JWT.of(token).setKey(secret);
        } catch (Exception e) {
            return null;  // Token格式错误
        }
        
        // 验证签名和过期时间
        boolean ok;
        try {
            ok = jwt.verify() && jwt.validate(0);
        } catch (Exception e) {
            return null;  // 签名无效或已过期
        }
        
        if (!ok) {
            return null;
        }
        
        // 解析Token内容
        return TokenSubject.builder()
            .userId(jwt.getPayload("uid").toString())
            .username(jwt.getPayload("uname").toString())
            .roleId(jwt.getPayload("roleId").toString())
            .roleName(jwt.getPayload("roleName").toString())
            .permissionRange(jwt.getPayload("permRange").toString())
            .build();
    }
}
```

**Token刷新机制**（推荐实现）：

```java
// 1. 在Controller添加Token刷新端点
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    
    @Autowired
    private AuthTokenService authTokenService;
    
    /**
     * 刷新Token（在Token即将过期时调用）
     * 前端应在Token过期前5分钟自动调用此接口
     */
    @PostMapping("/refresh")
    public Result<String> refreshToken() {
        // 从当前请求获取Token信息
        TokenSubject subject = authTokenService.getCurrentTokenSubject();
        if (subject == null) {
            return Result.error("Token无效");
        }
        
        // 重新签发Token（延长12小时）
        String newToken = authTokenService.issueToken(subject, Duration.ofHours(12));
        return Result.success(newToken);
    }
}

// 2. 前端自动刷新Token（frontend/src/services/request.ts）
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

request.interceptors.response.use(
  (response) => {
    // Token即将过期时自动刷新（通过响应头判断）
    const tokenExpiringSoon = response.headers['x-token-expiring'];
    if (tokenExpiringSoon === 'true' && !isRefreshing) {
      isRefreshing = true;
      
      axios.post('/api/auth/refresh').then((res) => {
        const newToken = res.data.data;
        localStorage.setItem('token', newToken);
        
        // 通知所有等待的请求使用新Token
        refreshSubscribers.forEach(cb => cb(newToken));
        refreshSubscribers = [];
      }).finally(() => {
        isRefreshing = false;
      });
    }
    
    return response;
  },
  (error) => {
    // Token过期返回401时，重定向到登录页
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

### 权限检查机制

**三层权限控制**：

```java
// 1. Controller层：接口权限（@PreAuthorize）
@RestController
@RequestMapping("/api/production/order")
public class ProductionOrderController {
    
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PRODUCTION_ORDER_VIEW')")  // ⚠️ 必须添加
    public Result<?> list(@RequestParam Map<String, Object> params) {
        // 只有拥有PRODUCTION_ORDER_VIEW权限的用户才能访问
    }
    
    @PostMapping("/create")
    @PreAuthorize("hasAuthority('PRODUCTION_ORDER_CREATE')")  // 创建权限
    public Result<?> create(@RequestBody ProductionOrder order) {
        return Result.success(productionOrderOrchestrator.create(order));
    }
    
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('PRODUCTION_ORDER_DELETE')")  // 删除权限
    public Result<?> delete(@PathVariable Long id) {
        return Result.success(productionOrderService.removeById(id));
    }
}

// 2. Service层：数据权限（过滤用户只能看到的数据）
@Service
public class ProductionOrderService {
    
    @Autowired
    private AuthTokenService authTokenService;
    
    public List<ProductionOrder> listByCurrentUser() {
        TokenSubject subject = authTokenService.getCurrentTokenSubject();
        String permRange = subject.getPermissionRange();
        
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        
        // 根据权限范围过滤数据
        if ("FACTORY".equals(permRange)) {
            // 工厂用户：只能看到本工厂的订单
            wrapper.eq(ProductionOrder::getFactoryId, subject.getFactoryId());
        } else if ("DEPARTMENT".equals(permRange)) {
            // 部门用户：只能看到本部门的订单
            wrapper.eq(ProductionOrder::getDepartmentId, subject.getDepartmentId());
        }
        // ADMIN权限：不添加过滤条件，可以看到所有数据
        
        return productionOrderMapper.selectList(wrapper);
    }
}

// 3. 前端路由守卫：页面权限
// frontend/src/router/index.tsx
const routeConfig = [
  {
    path: '/production/order',
    component: ProductionOrderList,
    meta: {
      requiresAuth: true,
      permission: 'PRODUCTION_ORDER_VIEW',  // 必需权限码
      title: '生产订单'
    }
  }
];

// 路由守卫检查
router.beforeEach((to, from, next) => {
  const userPermissions = store.getState().permissions;
  const requiredPermission = to.meta?.permission;
  
  if (requiredPermission && !userPermissions.includes(requiredPermission)) {
    message.error('无权限访问此页面');
    next('/403');
  } else {
    next();
  }
});
```

**权限码管理**（数据库）：

```sql
-- 权限表
CREATE TABLE t_role_permission (
  role_id BIGINT NOT NULL COMMENT '角色ID',
  permission_code VARCHAR(100) NOT NULL COMMENT '权限码',
  PRIMARY KEY (role_id, permission_code)
) COMMENT='角色权限关联表';

-- 常用权限码
INSERT INTO t_role_permission (role_id, permission_code) VALUES
-- 生产订单权限
(1, 'PRODUCTION_ORDER_VIEW'),    -- 查看
(1, 'PRODUCTION_ORDER_CREATE'),  -- 创建
(1, 'PRODUCTION_ORDER_UPDATE'),  -- 更新
(1, 'PRODUCTION_ORDER_DELETE'),  -- 删除
-- 财务权限
(2, 'FINANCE_SETTLEMENT_VIEW'),
(2, 'FINANCE_SETTLEMENT_APPROVE');
```

### 安全配置清单

**环境变量（`.run/backend.env`）**：
```bash
# JWT密钥（生产环境必须修改！）
APP_AUTH_JWT_SECRET=YOUR_PRODUCTION_SECRET_AT_LEAST_32_CHARACTERS_LONG

# 数据库密码（生产环境必须修改！）
SPRING_DATASOURCE_PASSWORD=YOUR_PRODUCTION_DB_PASSWORD

# 跨域配置（生产环境限制域名）
CORS_ALLOWED_ORIGINS=https://your-domain.com
```

**安全HTTP头配置**（`SecurityConfig.java`）：
```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .headers()
            .contentSecurityPolicy("default-src 'self'")  // CSP防止XSS
            .and()
            .xssProtection()  // XSS保护
            .and()
            .frameOptions().deny()  // 防止点击劫持
            .and()
        .csrf().disable()  // 使用JWT不需要CSRF保护
        .cors();  // 启用CORS
    
    return http.build();
}
```

**生产环境检查清单**：
- ✅ JWT密钥至少32字符，不使用默认值
- ✅ 数据库密码强度足够（字母+数字+符号）
- ✅ HTTPS部署（不使用HTTP）
- ✅ CORS限制为具体域名（不使用 `*`）
- ✅ 日志不输出敏感信息（密码、Token）
- ✅ 定期备份数据库（`deployment/db-manager.sh backup`）
- ✅ Token过期时间合理（不超过24小时）
- ✅ 所有API端点都有 `@PreAuthorize` 权限检查

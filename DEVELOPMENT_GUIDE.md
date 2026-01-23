# 服装供应链系统 - 开发指南

**系统评分**: 96/100  
**文档版本**: 2.0  
**最后更新**: 2026-01-23

---

## 📚 文档导航

### 核心架构文档
- [后端 Orchestrator 模式](#一后端架构-orchestrator-模式) - 26个编排器详解
- [小程序架构设计](#二小程序架构-轻量级工具函数模式) - 工具函数模式
- [小程序重构方案](#三小程序重构方案-渐进式编排模式) - scan/index.js 优化
- [UI设计规范](#四ui设计规范) - 颜色、字体、组件规范
- [开发最佳实践](#五开发最佳实践) - 代码规范和故障排查
- [快速开始](#六快速开始) - 新手入门指南

### 业务流程文档
- [SKU_QUICK_REFERENCE.md](SKU_QUICK_REFERENCE.md) - **SKU系统快速参考**（款号+颜色+尺码统一）
- [WORKFLOW_EXPLANATION.md](WORKFLOW_EXPLANATION.md) - 完整业务流程
- [SCAN_SYSTEM_LOGIC.md](SCAN_SYSTEM_LOGIC.md) - 扫码系统核心逻辑（三种模式）
- [QUICK_TEST_GUIDE.md](QUICK_TEST_GUIDE.md) - 快速测试指南

### 技术实现文档
- [MULTI_PAGE_SYNC_GUIDE.md](MULTI_PAGE_SYNC_GUIDE.md) - 多页面同步机制
- [DATA_SYNC_ANALYSIS.md](DATA_SYNC_ANALYSIS.md) - 数据同步分析

### 部署运维文档
- [deployment/DATABASE_CONFIG.md](deployment/DATABASE_CONFIG.md) - 数据库配置
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - 部署检查清单

---

## 一、后端架构 - Orchestrator 模式

### 1.1 架构层次

```
┌─────────────────────────────────────────────────────────────┐
│                     Controller 层                            │
│                  (接收请求，参数验证)                          │
│  @RestController  @RequestMapping  @PreAuthorize            │
└────────────────────┬────────────────────────────────────────┘
                     │ 调用
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Orchestrator 层 (核心)                      │
│              (跨服务业务编排，复杂事务管理)                    │
│  @Service  @Transactional  跨Service协调                    │
│                                                              │
│  26个编排器：                                                 │
│  • ProductionOrderOrchestrator                              │
│  • ShipmentReconciliationOrchestrator                       │
│  • FinanceOrchestrator                                      │
│  • QualityInspectionOrchestrator                            │
│  • ...                                                      │
└────────────────────┬────────────────────────────────────────┘
                     │ 调用
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service 层                                │
│              (单表/单领域 CRUD 操作)                          │
│  ServiceImpl + Mapper  单一职责                              │
└────────────────────┬────────────────────────────────────────┘
                     │ 调用
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Mapper 层                                 │
│              (MyBatis Plus 数据访问)                         │
│  继承 BaseMapper<Entity>                                    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心 Orchestrator 清单（26个）

#### 生产管理模块（8个）
1. **ProductionOrderOrchestrator** - 订单业务编排
   - 创建订单 + 初始化工序 + 生成菲号
   - 订单进度更新 + 状态流转
   - 跨服务：Order + Cutting + Finance

2. **CuttingTaskOrchestrator** - 裁剪任务编排
   - 任务分配 + 领取 + 退回
   - 跨服务：Task + Order + User

3. **ProductionOrderScanOrchestrator** - 扫码业务编排
   - 扫码执行 + 工序判断 + 进度更新
   - 撤销扫码 + 回滚流程
   - 跨服务：ScanRecord + Order + Finance

4. **QualityInspectionOrchestrator** - 质检业务编排
   - 质检入库 + 订单完成判断
   - 跨服务：Quality + Order + Warehousing

5. **CuttingBundleOrchestrator** - 菲号管理编排
   - 菲号生成 + 二维码生成
   - 菲号删除 + 订单进度更新

6. **ProductionTemplateOrchestrator** - 生产模板编排
   - 模板应用到订单
   - 工序配置同步

7. **ProgressNodeOrchestrator** - 工序节点编排
   - 工序配置管理
   - 动态工序列表

8. **BOMOrchestrator** - BOM 管理编排
   - BOM 应用到订单
   - 物料需求计算

#### 对账模块（3个）
9. **ShipmentReconciliationOrchestrator** - 发货对账编排
   - 对账单生成 + 明细汇总
   - 审核流程 + 状态变更
   - 跨服务：Shipment + ScanRecord + Finance

10. **FactoryReconciliationOrchestrator** - 工厂对账编排
    - 工厂工资计算 + 对账单生成
    - 跨服务：Factory + ScanRecord + Finance

11. **MaterialReconciliationOrchestrator** - 物料对账编排
    - 物料采购对账 + 供应商结算
    - 跨服务：Material + Supplier + Finance

#### 财务模块（3个）
12. **FinanceOrchestrator** - 财务统计编排
    - 工资计算 + 成本统计
    - 跨服务：ScanRecord + Reconciliation + Order

13. **PayrollOrchestrator** - 工资管理编排
    - 工资条生成 + 发放记录

14. **CostAnalysisOrchestrator** - 成本分析编排
    - 订单成本计算 + 利润分析

#### 仓储模块（2个）
15. **WarehousingOrchestrator** - 入库管理编排
    - 质检入库 + 库存更新
    - 回退处理 + 库存扣减

16. **InventoryOrchestrator** - 库存管理编排
    - 库存统计 + 预警

#### 采购模块（2个）
17. **MaterialPurchaseOrchestrator** - 物料采购编排
    - 采购单创建 + 到货登记
    - 跨服务：Purchase + Material + Supplier

18. **SupplierOrchestrator** - 供应商管理编排
    - 供应商评级 + 结算管理

#### 工厂管理模块（2个）
19. **FactoryOrchestrator** - 工厂管理编排
    - 工厂产能管理 + 任务分配

20. **FactoryPerformanceOrchestrator** - 工厂绩效编排
    - 绩效统计 + 排名计算

#### 系统管理模块（6个）
21. **UserOrchestrator** - 用户管理编排
    - 用户创建 + 角色绑定 + 权限分配
    - 审批流程 + 状态变更

22. **RoleOrchestrator** - 角色管理编排
    - 角色创建 + 权限绑定
    - 数据权限配置

23. **DashboardOrchestrator** - 仪表盘编排
    - 多维度数据汇总
    - 跨服务：Order + Finance + Quality + User

24. **ReportOrchestrator** - 报表生成编排
    - 各类报表生成 + 数据导出

25. **NotificationOrchestrator** - 通知管理编排
    - 消息推送 + 小程序订阅消息

26. **AuditLogOrchestrator** - 审计日志编排
    - 操作日志记录 + 数据变更追踪

### 1.3 典型案例：对账流程

#### Controller 层
```java
@RestController
@RequestMapping("/api/reconciliation/shipment")
public class ShipmentReconciliationController {
    
    @Autowired
    private ShipmentReconciliationOrchestrator orchestrator;
    
    @PostMapping("/create")
    @PreAuthorize("hasAuthority('RECONCILIATION_CREATE')")
    public R<Long> create(@RequestBody ShipmentReconciliationCreateDTO dto) {
        Long id = orchestrator.createReconciliation(dto);
        return R.ok(id);
    }
}
```

#### Orchestrator 层（核心）
```java
@Service
public class ShipmentReconciliationOrchestrator {
    
    @Autowired
    private ShipmentReconciliationService reconciliationService;
    
    @Autowired
    private ProductionOrderScanRecordService scanRecordService;
    
    @Autowired
    private FinanceService financeService;
    
    @Transactional(rollbackFor = Exception.class)
    public Long createReconciliation(ShipmentReconciliationCreateDTO dto) {
        // 1. 创建对账单（本服务）
        ShipmentReconciliation reconciliation = new ShipmentReconciliation();
        reconciliation.setOrderId(dto.getOrderId());
        reconciliation.setStatus("PENDING");
        reconciliationService.save(reconciliation);
        
        // 2. 查询扫码记录（跨服务）
        List<ScanRecord> records = scanRecordService.getValidRecords(
            dto.getOrderId(),
            dto.getStartDate(),
            dto.getEndDate()
        );
        
        // 3. 计算汇总数据（领域逻辑）
        BigDecimal totalAmount = records.stream()
            .map(r -> r.getUnitPrice().multiply(new BigDecimal(r.getQuantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        reconciliation.setTotalAmount(totalAmount);
        reconciliation.setTotalQuantity(records.size());
        reconciliationService.updateById(reconciliation);
        
        // 4. 更新财务统计（跨服务）
        financeService.updateShipmentStats(dto.getOrderId(), totalAmount);
        
        return reconciliation.getId();
    }
}
```

#### Service 层（单一职责）
```java
@Service
public class ShipmentReconciliationServiceImpl 
    extends ServiceImpl<ShipmentReconciliationMapper, ShipmentReconciliation>
    implements ShipmentReconciliationService {
    
    // 只处理对账单表的 CRUD，不涉及其他服务
    
    @Override
    public ShipmentReconciliation getById(Long id) {
        return baseMapper.selectById(id);
    }
}
```

---

## 二、小程序架构 - 轻量级工具函数模式

### 2.1 架构对比

#### 后端架构（重量级）
```
Controller → Orchestrator → Service → Mapper
   ↓             ↓            ↓         ↓
 API入口      业务编排     单表操作   数据访问
```

#### 小程序架构（轻量级）
```
┌─────────────────────────────────────────────────────┐
│                   Page 页面层                        │
│            (业务逻辑 + UI渲染 + 事件处理)              │
│                                                       │
│  • pages/scan/index.js (2927行)                     │
│  • pages/work/index.js (796行)                      │
│  • pages/home/index.js (416行)                      │
│  • pages/admin/index.js (181行)                     │
└──────────┬──────────────────┬────────────────────────┘
           │                  │
           ▼                  ▼
┌─────────────────────┐  ┌─────────────────────┐
│   Utils 工具函数层   │  │  Components 组件     │
│  (可复用逻辑封装)     │  │  (可复用UI)          │
│                     │  │                     │
│ • api.js            │  │ • global-search     │
│ • dataValidator.js  │  │ • custom-tab-bar    │
│ • errorHandler.js   │  │                     │
│ • eventBus.js       │  │                     │
│ • syncManager.js    │  │                     │
│ • orderStatusHelper.js                       │
│ • validationRules.js│  │                     │
│ • storage.js        │  │                     │
└──────────┬──────────┘  └─────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│              后端 REST API                           │
│         (Controller → Orchestrator → ...)           │
└─────────────────────────────────────────────────────┘
```

### 2.2 为什么不用 Orchestrator？

| 对比项 | 后端 Orchestrator | 小程序 Page |
|--------|------------------|-------------|
| 业务复杂度 | 高（跨服务协调） | 低（单页面逻辑） |
| 事务管理 | 需要 `@Transactional` | 不需要 |
| 并发控制 | 需要（多用户） | 不需要（单用户） |
| 代码复用 | Service层 | Utils工具函数 |
| 分层结构 | 4层（严格分层） | 2层（扁平化） |
| 职责范围 | 业务编排 + 数据一致性 | 用户交互 + 数据展示 |

### 2.3 核心工具模块（11个）

#### 1. api.js - API封装层
```javascript
// 统一封装后端调用，类似后端 Controller
const production = {
    listOrders(params) {
        return ok('/api/production/order/list', 'GET', params);
    },
    executeScan(payload) {
        return ok('/api/production/scan/execute', 'POST', payload);
    },
    // ... 40+ 个方法
};

export default { production, system, dashboard, wechat };
```

#### 2. dataValidator.js - 数据验证层
```javascript
// 数据结构定义 + 验证（类似后端 DTO）
const ProductionOrderShape = {
    id: { required: true, type: 'string' },
    orderNo: { required: true, type: 'string' },
    orderQuantity: { required: true, type: 'number' },
};

function validateProductionOrder(order) {
    // 验证逻辑
}
```

#### 3. errorHandler.js - 错误处理层
```javascript
// 统一错误分类和处理
const ErrorTypes = {
    NETWORK: 'network',
    AUTH: 'auth',
    BUSINESS: 'biz',
    VALIDATION: 'validation',
    TIMEOUT: 'timeout',
};

function classifyError(error) { /* ... */ }
```

#### 4. eventBus.js - 事件总线（多页面同步）
```javascript
// 发布/订阅模式实现跨页面通信
function triggerDataRefresh(dataType, payload) {
    eventBus.emit('data:changed', { type: dataType, ...payload });
}

function onDataRefresh(callback) {
    eventBus.on('data:changed', callback);
}
```

#### 5. orderStatusHelper.js - 状态转换工具
```javascript
// 避免重复定义状态转换逻辑
function orderStatusText(status) {
    const map = {
        pending: '待生产',
        production: '生产中',
        completed: '已完成',
    };
    return map[status] || '未知';
}
```

#### 6-11. 其他工具
- **syncManager.js** - 30秒轮询同步
- **storage.js** - 本地存储封装
- **permission.js** - 权限判断
- **request.js** - 底层HTTP请求
- **validationRules.js** - 验证规则库（与PC端一致）
- **reminderManager.js** - 提醒管理

### 2.4 实际案例对比

#### 后端：退回操作（Orchestrator 模式）
```java
@Service
public class ProductionOrderOrchestrator {
    @Transactional(rollbackFor = Exception.class)
    public boolean rollbackByBundle(String bundleNo, int quantity) {
        // 1. 查询订单（跨服务）
        ProductionOrder order = orderService.getByBundleNo(bundleNo);
        
        // 2. 更新进度（跨服务）
        orderService.rollbackProgress(order.getId(), quantity);
        
        // 3. 作废扫码记录（跨服务）
        scanRecordService.invalidateFlowAfterRollback(order);
        
        // 4. 更新财务（跨服务）
        financeService.recalculatePayroll(order.getId());
        
        return true;
    }
}
```

#### 小程序：退回操作（工具函数模式）
```javascript
// pages/work/index.js
Page({
    async confirmRollback() {
        try {
            // 直接调用后端 API（后端 Orchestrator 处理所有逻辑）
            await api.production.rollbackByBundle({
                orderId: this.data.rollback.orderId,
                cuttingBundleQrCode: this.data.rollback.cuttingBundleQrCode,
                rollbackQuantity: this.data.rollback.rollbackQuantity,
            });
            
            wx.showToast({ title: '回退成功', icon: 'success' });
            
            // 刷新本地数据
            await this.loadOrders(true);
            
            // 触发全局刷新（使用 eventBus）
            triggerDataRefresh('orders', { action: 'rollback' });
            
        } catch (e) {
            errorHandler.logError(e, '回退失败');
            wx.showToast({ title: '回退失败', icon: 'none' });
        }
    },
});
```

**关键区别**：
- 后端：编排3个Service，处理事务
- 小程序：调用1个API，触发事件，**所有复杂逻辑在后端完成**

---

## 二点五、SKU系统 - 三端统一设计

### 2.5.1 SKU核心概念

**SKU = 最小库存单位 = 款号 + 颜色 + 尺码**

```javascript
// 标准SKU对象
{
  styleNo: 'ST001',         // 款号（与订单号可能不同）
  color: '黑色',            // 颜色（必须规范化）
  size: 'L',                // 尺码（S/M/L/XL/XXL等）
  orderNo: 'PO20260122001', // 所属订单
  
  // 数量字段
  totalQuantity: 50,        // 订单总数
  completedQuantity: 30,    // 已完成数
  pendingQuantity: 20,      // 待完成数（= total - completed）
  
  // 可选字段
  bundleNo: 'PO-黑色-01'   // 关联菲号（裁剪后产生）
}
```

### 2.5.2 三种扫码模式

#### 模式1：订单扫码（ORDER）
```
扫码内容: PO20260122001
识别规则: 纯订单号格式
后端返回: 订单详情 + SKU列表
小程序显示: SKU明细选择表单
适用场景: 首次进入工序，确认各SKU数量
```

#### 模式2：菲号扫码（BUNDLE）
```
扫码内容: PO20260122001-黑色-01
识别规则: 订单号-颜色-序号
后端返回: 菲号信息（一个颜色，可能多个尺码）
小程序显示: 直接确认（无需选择）
适用场景: 裁剪后，快速批量提交
```

#### 模式3：SKU扫码（SKU）
```
扫码内容: {orderNo: 'PO...', color: '黑色', size: 'L', qty: 50}
识别规则: JSON格式或CSV格式
后端返回: SKU验证结果
小程序显示: 单个SKU确认
适用场景: 特定SKU精确扫描（如质检入库）
```

### 2.5.3 SKUProcessor 统一处理

**位置**：`miniprogram/utils/SKUProcessor.js` (450行)

```javascript
// 核心方法
class SKUProcessor {
  // 规范化后端返回的items为标准SKU列表
  static normalizeOrderItems(items, orderNo, styleNo) { ... }
  
  // 构建SKU输入表单项
  static buildSKUInputList(skuList) { ... }
  
  // 验证SKU数量批次
  static validateSKUInputBatch(skuList) { ... }
  
  // 生成扫码请求
  static generateScanRequests(skuList, processNode, operatorId) { ... }
  
  // 获取SKU进度汇总
  static getSummary(skuList) { ... }
  
  // 解析菲号
  static parseBundleNo(bundleNo) { ... }
}
```

### 2.5.4 数据流向

```
┌─────────────────────────────────────────────────┐
│ 扫码 (订单号/菲号/SKU)                           │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ QRCodeParser.parse() - 识别类型                 │
│ • ORDER: 纯订单号                                │
│ • BUNDLE: 订单号-颜色-序号                       │
│ • SKU: JSON/CSV格式                             │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 调用后端API获取详情                              │
│ • /api/production/order/detail (ORDER)          │
│ • /api/production/bundle/detail (BUNDLE)        │
│ • /api/production/sku/validate (SKU)            │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ SKUProcessor.normalizeOrderItems()              │
│ 将后端返回转为标准SKU列表                        │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 小程序显示SKU表单（如需）                        │
│ • 订单模式：显示多SKU选择表                      │
│ • 菲号模式：显示确认按钮                         │
│ • SKU模式：显示单SKU确认                        │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ SKUProcessor.generateScanRequests()             │
│ 生成标准扫码请求                                 │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ 提交到后端 /api/production/scan/execute         │
│ 后端 Orchestrator 处理业务逻辑                  │
└─────────────────────────────────────────────────┘
```

### 2.5.5 关键约定

1. **颜色和尺码必须规范化**
   - 使用统一的中文命名
   - 后端和前端保持一致

2. **数量字段规则**
   - `totalQuantity`: 订单要求总数（不变）
   - `completedQuantity`: 已完成数（递增）
   - `pendingQuantity`: 待完成数（= total - completed）

3. **SKU唯一性**
   - 同订单内 (styleNo + color + size) 唯一
   - 用于追踪进度和防止重复

4. **菲号关联**
   - 菲号在裁剪阶段生成
   - 一个菲号对应一个颜色，可能多个尺码
   - 格式：`订单号-颜色-序号`（如：PO20260122001-黑色-01）

**详细参考**：[SKU_QUICK_REFERENCE.md](SKU_QUICK_REFERENCE.md)

---

## 三、小程序重构方案 - 渐进式编排模式

### 3.1 当前问题

**scan/index.js 有 2927 行代码**，包含：
- 扫码逻辑（500行）
- 撤销逻辑（300行）
- 质检弹窗（400行）
- 菲号生成弹窗（400行）
- 数据加载（500行）
- 其他业务（800行）

**问题**：
- ❌ 维护困难 - 难以定位问题
- ❌ 代码复用差 - 逻辑重复
- ❌ 测试困难 - 无法单元测试
- ❌ 扩展困难 - 新增功能容易破坏原有逻辑

### 3.2 重构方案：轻量级编排模式

#### 方案对比

| 方案 | 架构 | 优点 | 缺点 | 推荐度 |
|------|------|------|------|--------|
| 完整 Orchestrator | Page → Orchestrator → Service → Utils | 架构清晰 | 过度设计、包体积大 | ❌ |
| **轻量级编排** | **Page → Handler → Service → Utils** | **平衡好、易维护** | **需要规划** | **✅** |
| 当前状态 | Page（2927行） | 简单 | 难维护 | ❌ |

#### 目标架构

```
Page (400行)
  ├── 只负责 UI 和事件绑定
  └── 调用 Handlers
  
Handlers (业务编排层) (1300行)
  ├── ScanHandler.js (500行) - 扫码编排
  ├── UndoHandler.js (200行) - 撤销编排
  ├── BundleHandler.js (300行) - 菲号编排
  └── QualityHandler.js (300行) - 质检编排
  
Services (可复用业务) (400行)
  ├── QRCodeParser.js (200行) - 二维码解析
  └── StageDetector.js (200行) - 工序检测
  
Utils (工具函数) (已有)
  └── api.js, eventBus.js, ...
```

### 3.3 重构代码示例

#### 重构前（混乱）
```javascript
// scan/index.js (2927行)
Page({
    async handleScan(scanCode) {
        // 200行解析 + 判断 + 调用 + 刷新逻辑混在一起
        // 难以理解和维护
    }
});
```

#### 重构后（清晰）

**Page 层 (400行)**
```javascript
// pages/scan/index.js
import ScanHandler from './handlers/ScanHandler';
import UndoHandler from './handlers/UndoHandler';

Page({
    data: {
        scanTypeIndex: 1,
        lastResult: null,
    },

    onLoad() {
        this.scanHandler = new ScanHandler(this);
        this.undoHandler = new UndoHandler(this);
    },

    // 简洁的事件处理
    async onScanClick() {
        wx.scanCode({
            success: async (res) => {
                await this.scanHandler.handleScan(res.result);
            }
        });
    },

    async onUndoClick() {
        await this.undoHandler.performUndo(this.data.undo);
    },
});
```

**Handler 层 (500行)**
```javascript
// pages/scan/handlers/ScanHandler.js
import api from '../../../utils/api';
import { triggerDataRefresh } from '../../../utils/eventBus';
import QRCodeParser from '../services/QRCodeParser';
import StageDetector from '../services/StageDetector';

class ScanHandler {
    constructor(page) {
        this.page = page;
        this.parser = new QRCodeParser();
        this.stageDetector = new StageDetector();
    }

    /**
     * 扫码主流程（业务编排）
     */
    async handleScan(scanCode) {
        try {
            // 1. 解析二维码
            const parsed = this.parser.parse(scanCode);
            
            // 2. 判断扫码类型
            if (parsed.bundleNo) {
                return await this.handleBundleScan(parsed);
            } else {
                return await this.handleOrderScan(parsed);
            }
        } catch (error) {
            wx.showToast({ title: error.message, icon: 'none' });
        }
    }

    /**
     * 菲号扫码流程
     */
    async handleBundleScan(parsed) {
        // 1. 检测工序
        const stage = await this.stageDetector.detectNextStage(
            parsed.orderId,
            parsed.bundleNo
        );
        
        // 2. 调用后端 API（后端 Orchestrator 处理复杂逻辑）
        const result = await api.production.executeScan({
            orderId: parsed.orderId,
            bundleNo: parsed.bundleNo,
            stage: stage,
        });
        
        // 3. 更新页面状态
        this.page.setData({
            lastResult: result,
            'undo.canUndo': true,
        });
        
        // 4. 触发全局刷新
        triggerDataRefresh('scans', { action: 'scan' });
        
        wx.showToast({ title: '扫码成功', icon: 'success' });
    }
}

export default ScanHandler;
```

**Service 层 (200行)**
```javascript
// pages/scan/services/QRCodeParser.js
/**
 * 二维码解析服务（可复用）
 */
class QRCodeParser {
    /**
     * 解析二维码
     */
    parse(scanCode) {
        // 1. 尝试解析菲号
        const bundleResult = this.parseBundleQR(scanCode);
        if (bundleResult) return bundleResult;
        
        // 2. 尝试解析订单
        const orderResult = this.parseOrderQR(scanCode);
        if (orderResult) return orderResult;
        
        throw new Error('无法识别的二维码格式');
    }

    /**
     * 解析菲号二维码: PO20260122001-黑色-01
     */
    parseBundleQR(scanCode) {
        const match = scanCode.match(/^([A-Z0-9]+)-(.+)-(\d+)$/);
        if (!match) return null;
        
        return {
            type: 'bundle',
            orderNo: match[1],
            color: match[2],
            seq: match[3],
            bundleNo: scanCode,
        };
    }

    /**
     * 解析订单二维码: ORDER:123456
     */
    parseOrderQR(scanCode) {
        const match = scanCode.match(/^ORDER:(\d+)$/);
        if (!match) return null;
        
        return {
            type: 'order',
            orderId: match[1],
        };
    }
}

export default QRCodeParser;
```

### 3.4 目录结构

#### 重构前
```
pages/scan/
├── index.js      (2927行 - 太大！)
├── index.wxml
├── index.wxss
└── index.json
```

#### 重构后
```
pages/scan/
├── index.js           (400行 - 简洁)
├── index.wxml
├── index.wxss
├── index.json
├── handlers/          (业务编排层)
│   ├── ScanHandler.js      (500行)
│   ├── UndoHandler.js      (200行)
│   ├── BundleHandler.js    (300行)
│   └── QualityHandler.js   (300行)
└── services/          (可复用业务)
    ├── QRCodeParser.js     (200行)
    └── StageDetector.js    (200行)
```

### 3.5 重构效果

| 指标 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| Page 大小 | 2927行 | 400行 | ✅ 减少86% |
| 代码结构 | 混乱 | 清晰 | ✅ 层次分明 |
| 维护性 | 差 | 好 | ✅ 易于定位 |
| 可测试性 | 差 | 好 | ✅ 单元测试 |
| 代码复用 | 差 | 好 | ✅ Parser/Detector可复用 |
| 扩展性 | 差 | 好 | ✅ 加Handler即可 |

### 3.6 实施计划（5周）

#### 第1周：提取 QRCodeParser
- [ ] 创建 `services/QRCodeParser.js`
- [ ] 将解析逻辑从 `handleScan()` 提取
- [ ] 测试验证

#### 第2周：提取 StageDetector
- [ ] 创建 `services/StageDetector.js`
- [ ] 将工序判断逻辑提取
- [ ] 测试验证

#### 第3周：创建 ScanHandler
- [ ] 创建 `handlers/ScanHandler.js`
- [ ] 将扫码编排逻辑移入
- [ ] Page 简化为调用 handler
- [ ] 测试验证

#### 第4周：创建其他 Handlers
- [ ] UndoHandler（撤销）
- [ ] BundleHandler（菲号生成）
- [ ] QualityHandler（质检）
- [ ] 测试验证

#### 第5周：全量测试 + 上线
- [ ] 功能回归测试
- [ ] 性能测试
- [ ] 灰度发布
- [ ] 全量上线

### 3.7 注意事项

#### ✅ 推荐做法
1. **渐进式重构** - 一次重构一个模块
2. **保持测试** - 每次重构后测试验证
3. **文档同步** - 更新开发文档
4. **代码审查** - 重构代码需要审查

#### ❌ 避免做法
1. **一次性重构** - 不要一次改所有代码
2. **过度设计** - 不要引入不必要的抽象
3. **破坏兼容** - 保持 API 接口不变
4. **忽略测试** - 必须测试验证

---

## 四、UI设计规范

### 4.1 设计原则

- **统一性** - 所有页面使用相同的颜色、圆角、间距
- **简洁性** - 减少视觉干扰，突出重要信息
- **一致性** - 相同功能使用相同样式
- **响应式** - 适配不同屏幕尺寸

### 4.2 颜色系统

#### 主色调
```css
/* 浅蓝渐变 - 用于重要卡片、强调按钮、品牌元素 */
background: linear-gradient(135deg, #e0f2fe 0%, #e0e7ff 100%);

/* 示例：扫码页面卡片、状态展示区域 */
```

#### 辅助色
```css
/* 蓝色系 */
--color-blue: #3b82f6;                        /* 主蓝色 - 标签、图标 */
--color-blue-light: rgba(224, 242, 254, 0.8); /* 浅蓝色 - 激活状态、高亮 */
--color-blue-lighter: rgba(224, 242, 254, 0.3); /* 超浅蓝 - 悬停状态 */
```

#### 功能色
```css
--color-success: #10b981;  /* 成功 - 绿色 */
--color-warning: #f59e0b;  /* 警告 - 橙色 */
--color-error: #ef4444;    /* 错误 - 红色 */
--color-info: #3b82f6;     /* 信息 - 蓝色 */
```

#### 中性色
```css
/* 背景色 */
--color-bg-page: #f7f8fa;   /* 页面背景 */
--color-bg-card: #ffffff;   /* 卡片背景 */
--color-bg-gray: #f3f4f6;   /* 灰色背景 */
--color-bg-light: #f9fafb;  /* 浅色背景 */

/* 文字色 */
--color-text-primary: #111827;   /* 主要文字 */
--color-text-secondary: #6b7280; /* 次要文字 */
--color-text-disabled: #9ca3af;  /* 禁用文字 */
--color-text-white: #ffffff;     /* 白色文字 */

/* 边框色 */
--color-border: #e5e7eb;         /* 标准边框 */
--color-border-light: #f3f4f6;   /* 浅色边框 */
```

### 4.3 圆角系统

#### 标准圆角值
```css
--radius-sm: 8px;      /* 小圆角 - 小按钮、标签 */
--radius-md: 12px;     /* 中圆角 - 卡片、输入框、小组件 */
--radius-lg: 16px;     /* 大圆角 - 重要卡片 */
--radius-xl: 18px;     /* 特大圆角 - 主容器、页面卡片 */
--radius-full: 999px;  /* 全圆角 - 按钮、搜索框、标签 */
```

#### 使用场景对照表

| 元素 | 圆角值 | 示例 |
|------|--------|------|
| 页面主卡片 | 18px (xl) | `.card` |
| 用户信息卡片 | 16px (lg) | `.user-profile-card` |
| 列表项、统计卡片 | 12px (md) | `.stat-card`, `.list-item` |
| 标签、角标 | 12px (md) | `.profile-role` |
| 按钮、搜索框 | 999px (full) | `.btn`, `.search-bar` |
| 标签页 | 999px (full) | `.tab` |

### 4.4 间距系统

#### 标准间距值
```css
--spacing-xs: 4px;    /* 最小间距 - 元素内小间距 */
--spacing-sm: 8px;    /* 小间距 - 相关元素之间 */
--spacing-md: 12px;   /* 中间距 - 卡片内边距、元素组之间 */
--spacing-lg: 16px;   /* 大间距 - 卡片外边距、区块之间 */
--spacing-xl: 20px;   /* 特大间距 - 页面区域分隔 */
--spacing-2xl: 24px;  /* 超大间距 - 页面大区域分隔 */
```

#### 使用建议
- 相关元素间距：8px
- 卡片内边距：12px
- 卡片外边距：16px
- 区块分隔：20-24px

### 4.5 阴影系统

#### 标准阴影
```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.05);        /* 小阴影 - 微妙层次 */
--shadow-md: 0 2px 6px rgba(0, 0, 0, 0.05);        /* 中阴影 - 卡片 */
--shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.08);       /* 大阴影 - 浮层 */
--shadow-primary: 0 4px 12px rgba(102, 126, 234, 0.25); /* 品牌阴影 - 紫色卡片 */
```

#### 使用场景
- 普通卡片：`shadow-md`
- 悬浮弹窗：`shadow-lg`
- 紫色渐变卡片：`shadow-primary`

### 4.6 字体系统

#### 字号规范
```css
--font-size-xs: 11px;    /* 辅助信息 - 在线人数、时间戳 */
--font-size-sm: 12px;    /* 小文字 - 标签、描述文字 */
--font-size-base: 14px;  /* 正文 - 列表项内容、普通文字 */
--font-size-lg: 16px;    /* 二级标题 - 区块标题 */
--font-size-xl: 18px;    /* 一级标题 - 页面标题 */
--font-size-2xl: 20px;   /* 数值强调 - 统计数字 */
```

#### 字重规范
```css
--font-weight-normal: 400;    /* 普通文字 */
--font-weight-medium: 500;    /* 次要强调 */
--font-weight-semibold: 600;  /* 标题、重要文字 */
--font-weight-bold: 700;      /* 数值、超级强调 */
```

### 4.7 组件规范

#### 1. 卡片组件
```css
/* 标准卡片 */
.card {
  background: #ffffff;
  border-radius: 18px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

/* 状态展示卡片（浅蓝渐变） */
.status-display-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #e0f2fe 0%, #e0e7ff 100%);
  border-radius: 16px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  color: #1e40af;
}

/* 统计卡片（4列网格） */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat-card {
  padding: 12px 8px;
  background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%);
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
}
```

#### 2. 按钮组件
```css
/* 主要按钮（浅蓝背景） */
.btn-primary {
  padding: 10px 18px;
  background: #e0f2fe;
  color: #1e40af;
  border-radius: 999px;
  font-weight: 600;
  border: 1px solid #bae6fd;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.15);
}

/* 次要按钮（浅蓝色） */
.btn-secondary {
  padding: 10px 18px;
  background: rgba(224, 242, 254, 0.8);
  color: #1f2937;
  border-radius: 999px;
  border: 1px solid rgba(224, 242, 254, 0.9);
  font-weight: 500;
}

/* 文字按钮 */
.btn-text {
  padding: 10px 18px;
  background: transparent;
  color: #667eea;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
}

/* 危险按钮 */
.btn-danger {
  padding: 10px 18px;
  background: #ef4444;
  color: #ffffff;
  border-radius: 999px;
  font-weight: 600;
}
```

#### 3. 标签页组件
```css
/* 标签栏容器 */
.tabbar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  padding: 4px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  margin-bottom: 12px;
}

/* 标签项 */
.tab {
  padding: 5px 6px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  text-align: center;
  color: #6b7280;
  transition: all 0.2s;
}

/* 激活状态 */
.tab-active {
  background: rgba(224, 242, 254, 0.8);
  color: #1f2937;
  font-weight: 600;
}
```

#### 4. 输入框组件
```css
/* 搜索框 */
.search-bar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  gap: 8px;
}

.search-input {
  flex: 1;
  font-size: 14px;
  border: none;
  outline: none;
  background: transparent;
}

/* 标准输入框 */
.input {
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  font-size: 14px;
  outline: none;
}

.input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}
```

#### 5. 标签/徽章组件
```css
/* 状态标签 */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

/* 成功状态 */
.badge-success {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

/* 警告状态 */
.badge-warning {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

/* 错误状态 */
.badge-error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 信息状态 */
.badge-info {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

/* 角色标签（紫色） */
.badge-role {
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  border-radius: 999px;
}
```

### 4.8 页面布局规范

#### 1. 标准页面结构
```xml
<!-- 小程序页面结构 -->
<view class="page-container">
  <!-- 页面头部（可选） -->
  <view class="page-header">
    <text class="page-title">页面标题</text>
  </view>
  
  <!-- 页面内容 -->
  <view class="page-content">
    <!-- 主要内容区 -->
    <view class="content-section">
      <view class="section-title">区块标题</view>
      <view class="section-body">
        <!-- 卡片列表 -->
      </view>
    </view>
  </view>
</view>
```

```css
/* 对应样式 */
.page-container {
  min-height: 100vh;
  background: #f7f8fa;
  padding: 12px;
}

.page-header {
  padding: 16px 0;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.content-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 12px;
}
```

#### 2. 列表项布局
```css
/* 标准列表项 */
.list-item {
  background: #ffffff;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.list-item-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
}

.list-item-content {
  flex: 1;
}

.list-item-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 4px;
}

.list-item-desc {
  font-size: 12px;
  color: #6b7280;
}

.list-item-action {
  color: #667eea;
  font-size: 12px;
}
```

### 4.9 响应式设计

#### 屏幕断点
```css
/* 小屏幕（iPhone SE） */
@media (max-width: 375px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* 中屏幕（iPhone 12/13） */
@media (min-width: 390px) and (max-width: 428px) {
  .stat-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* 大屏幕（iPad） */
@media (min-width: 768px) {
  .page-container {
    max-width: 768px;
    margin: 0 auto;
  }
}
```

### 4.10 设计规范使用指南

#### ✅ 必须遵循的规范

1. **所有主卡片** → `border-radius: 18px`
2. **所有小卡片/列表项** → `border-radius: 12px`
3. **所有按钮** → `border-radius: 999px`
4. **浅蓝渐变** → 统一使用 `linear-gradient(135deg, #e0f2fe 0%, #e0e7ff 100%)`（浅蓝到淡紫蓝）
5. **激活状态** → 统一使用 `rgba(224, 242, 254, 0.8)`
6. **页面背景** → 统一使用 `#f7f8fa`
7. **卡片阴影** → 统一使用 `0 2px 6px rgba(0, 0, 0, 0.05)`
8. **文字颜色** → 主文字 `#111827`，次文字 `#6b7280`
9. **弹窗尺寸** → 统一使用 `max-width: 90vw`, `border-radius: 16px`
10. **进度条样式** → 仅使用 `app.wxss` 全局样式，不得在页面重复定义

#### UI细节统一标准（2026-01-23 补充）

##### 弹窗 Modal
```css
/* ✅ 统一标准：使用 app.wxss 的 .modal-backdrop + .modal-wrap */
.modal-wrap {
  max-width: 90vw;           /* 统一宽度 */
  border-radius: 16px;       /* 统一圆角 */
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.15);
}

/* ❌ 禁止：页面自定义弹窗样式覆盖 */
```

##### 按钮颜色
```css
/* ✅ 主要按钮：浅蓝渐变 */
.btn-primary {
  background: linear-gradient(135deg, #e0f2fe 0%, #e0e7ff 100%);
}

/* ❌ 禁止：使用紫色渐变 #667eea → #764ba2 */
```

##### 进度条
```css
/* ✅ 统一使用 app.wxss 全局样式 */
.progress-wrapper { /* 仅在 app.wxss 定义 */ }
.progress-bar { /* 仅在 app.wxss 定义 */ }
.progress-fill { 
  background: linear-gradient(90deg, #10b981 0%, #3b82f6 100%);
}

/* ❌ 禁止：页面 wxss 重复定义进度条样式 */
```

##### 节点进度文字颜色
- 进度百分比：`color: #6b7280`, `font-size: 11px`
- 当前节点：使用 app.wxss 统一样式，不得单独定义

#### 设计规范文件位置
- **设计系统文档**: `miniprogram/DESIGN_SYSTEM.md`
- **设计 Token**: `miniprogram/styles/design-tokens.wxss`
- **全局样式**: `miniprogram/app.wxss`

#### 引入设计规范
```css
/* 在页面 wxss 文件顶部引入 */
@import '../../styles/design-tokens.wxss';
```

#### 使用设计 Token
```css
/* ✅ 正确：使用 Token */
.card {
  border-radius: var(--radius-xl);
  padding: var(--spacing-md);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-md);
}

/* ❌ 错误：硬编码值 */
.card {
  border-radius: 18px;
  padding: 12px;
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
```

### 4.11 已统一的页面

#### ✅ 个人页面 (`admin/index`)
- 紫色渐变用户卡片
- 4列统计网格
- 统一圆角和间距
- 激活状态样式

#### 🔄 待统一的页面
- 首页 (`home/index`)
- 生产页 (`work/index`)
- 扫码页 (`scan/index`)

---

## 五、开发最佳实践

### 4.1 后端开发规范

#### 何时使用 Orchestrator？
✅ **需要 Orchestrator**：
- 跨多个 Service 的业务流程
- 需要事务管理（@Transactional）
- 需要编排多个步骤
- 涉及复杂的业务逻辑

❌ **不需要 Orchestrator**：
- 单表 CRUD 操作
- 简单查询
- 数据格式转换

#### 示例对比

**❌ 错误：简单查询使用 Orchestrator**
```java
// 不需要 Orchestrator
@Service
public class OrderOrchestrator {
    public Order getById(Long id) {
        return orderService.getById(id);  // 单表查询
    }
}
```

**✅ 正确：直接使用 Service**
```java
@RestController
public class OrderController {
    @Autowired
    private OrderService orderService;
    
    @GetMapping("/{id}")
    public R<Order> getById(@PathVariable Long id) {
        return R.ok(orderService.getById(id));
    }
}
```

**✅ 正确：复杂业务使用 Orchestrator**
```java
@Service
public class OrderOrchestrator {
    @Transactional
    public Long createOrderWithBundles(OrderCreateDTO dto) {
        // 1. 创建订单
        Order order = orderService.create(dto);
        
        // 2. 生成菲号（跨服务）
        bundleService.generateBundles(order.getId(), dto.getBundleCount());
        
        // 3. 初始化工序（跨服务）
        progressService.initProgress(order.getId(), dto.getStages());
        
        // 4. 更新财务统计（跨服务）
        financeService.createOrderCost(order.getId());
        
        return order.getId();
    }
}
```

### 4.2 小程序开发规范

#### Page 职责划分
✅ **Page 应该做**：
- UI 渲染和数据绑定
- 事件处理（调用 Handler/Utils）
- 生命周期管理
- 页面状态管理（data）

❌ **Page 不应该做**：
- 复杂业务逻辑（应在 Handler）
- 数据解析/转换（应在 Service/Utils）
- 重复的工具函数（应在 Utils）

#### 代码示例

**❌ 错误：业务逻辑在 Page 中**
```javascript
Page({
    async handleScan(scanCode) {
        // ❌ 200行业务逻辑直接写在 Page 里
        const match = scanCode.match(/^([A-Z0-9]+)-(.+)-(\d+)$/);
        // ... 更多解析逻辑
        const result = await api.production.executeScan(...);
        // ... 更多处理逻辑
    }
});
```

**✅ 正确：业务逻辑在 Handler 中**
```javascript
Page({
    onLoad() {
        this.scanHandler = new ScanHandler(this);
    },
    
    async handleScan(scanCode) {
        // ✅ 简洁调用 Handler
        await this.scanHandler.handleScan(scanCode);
    }
});
```

### 4.3 多页面同步最佳实践

#### 使用 EventBus 实现实时同步

**触发事件**：
```javascript
// 在操作完成后触发
import { triggerDataRefresh } from '../../utils/eventBus';

async function onScanSuccess() {
    // 1. 执行业务逻辑
    await api.production.executeScan(...);
    
    // 2. 刷新本页数据
    await this.loadData();
    
    // 3. 触发全局刷新
    triggerDataRefresh('scans', {
        action: 'scan',
        orderId: this.data.orderId
    });
}
```

**监听事件**：
```javascript
// 在 onShow 中设置监听
import { onDataRefresh } from '../../utils/eventBus';

Page({
    onShow() {
        // 监听数据变化
        this._unsubscribe = onDataRefresh((event) => {
            if (event.type === 'scans' || event.type === 'orders') {
                this.loadData();  // 刷新数据
            }
        });
    },
    
    onHide() {
        // 取消监听
        if (this._unsubscribe) {
            this._unsubscribe();
        }
    }
});
```

### 4.4 数据过滤规范

#### 必须过滤的场景

**1. 排除采购记录**（采购按到货付款，不按扫码计数）
```javascript
// 查询扫码记录时
const records = await api.production.getScanRecords({
    orderId: this.data.orderId,
    scanType: { $ne: 'procurement' },  // 排除采购
});
```

**2. 排除失败记录**（回滚后的记录标记为 failure）
```javascript
const records = await api.production.getScanRecords({
    orderId: this.data.orderId,
    scanResult: { $ne: 'failure' },  // 排除失败
});
```

**3. 组合过滤**（最常用）
```javascript
const records = await api.production.getScanRecords({
    orderId: this.data.orderId,
    scanType: { $ne: 'procurement' },
    scanResult: { $ne: 'failure' },
});
```

---

## 六、快速开始

### 6.1 后端开发流程

#### 1. 创建新的业务模块
```bash
# 目录结构
backend/src/main/java/com/fashion/supplychain/newmodule/
├── entity/
│   └── NewEntity.java
├── mapper/
│   └── NewMapper.java
├── service/
│   ├── NewService.java
│   └── impl/
│       └── NewServiceImpl.java
├── orchestration/          # 如需复杂业务
│   └── NewOrchestrator.java
└── controller/
    └── NewController.java
```

#### 2. 判断是否需要 Orchestrator
- ✅ 跨多个 Service → 需要
- ✅ 需要事务管理 → 需要
- ✅ 复杂业务流程 → 需要
- ❌ 单表 CRUD → 不需要

#### 3. 编写代码顺序
```
Entity → Mapper → Service → Orchestrator（可选）→ Controller
```

### 5.2 小程序开发流程

#### 1. 创建新页面
```bash
# 创建目录
miniprogram/pages/newpage/
├── index.js
├── index.wxml
├── index.wxss
└── index.json
```

#### 2. 判断是否需要 Handler
- ✅ 页面逻辑 > 500行 → 需要重构
- ✅ 有复杂业务流程 → 考虑 Handler
- ✅ 逻辑可复用 → 提取 Service
- ❌ 简单页面 → 不需要

#### 3. 使用 Utils
```javascript
// 导入需要的工具
import api from '../../utils/api';
import { triggerDataRefresh, onDataRefresh } from '../../utils/eventBus';
import { validateProductionOrder } from '../../utils/dataValidator';
import { orderStatusText } from '../../utils/orderStatusHelper';
```

### 5.3 常见开发场景

#### 场景1：新增订单状态

**后端**：
```java
// 1. 在 Entity 中添加新状态
public class ProductionOrder {
    private String status;  // 新增 "CANCELLED"
}

// 2. 在 Orchestrator 中添加状态变更逻辑
@Service
public class ProductionOrderOrchestrator {
    @Transactional
    public void cancelOrder(Long orderId, String reason) {
        // 1. 更新订单状态
        orderService.updateStatus(orderId, "CANCELLED");
        
        // 2. 更新财务（跨服务）
        financeService.cancelOrderCost(orderId);
        
        // 3. 通知相关人员（跨服务）
        notificationService.notifyOrderCancelled(orderId);
    }
}
```

**小程序**：
```javascript
// 1. 在 orderStatusHelper.js 添加状态映射
function orderStatusText(status) {
    const map = {
        // ... 其他状态
        cancelled: '已取消',  // 新增
    };
    return map[status] || '未知';
}

// 2. 在页面中使用
this.setData({
    statusText: orderStatusText(order.status)
});
```

#### 场景2：新增扫码类型

**后端**：
```java
// 在 ScanOrchestrator 中添加处理逻辑
@Service
public class ProductionOrderScanOrchestrator {
    public void executeScan(ScanDTO dto) {
        if ("NEW_TYPE".equals(dto.getScanType())) {
            // 新类型的处理逻辑
            handleNewTypeScan(dto);
        }
    }
}
```

**小程序**：
```javascript
// 1. 在 QRCodeParser 中添加解析
class QRCodeParser {
    parse(scanCode) {
        // 尝试解析新类型
        const newTypeResult = this.parseNewType(scanCode);
        if (newTypeResult) return newTypeResult;
        
        // ... 其他解析
    }
}

// 2. 在 ScanHandler 中添加处理
class ScanHandler {
    async handleScan(scanCode) {
        const parsed = this.parser.parse(scanCode);
        
        if (parsed.type === 'newType') {
            return await this.handleNewTypeScan(parsed);
        }
    }
}
```

---

## 七、故障排查指南

### 7.1 后端常见问题

#### 问题1：事务不生效
**症状**：数据部分保存，部分回滚  
**原因**：`@Transactional` 失效

**排查步骤**：
1. 检查方法是否 `public`
2. 检查是否在同一个类内部调用（Spring AOP 限制）
3. 检查异常类型是否在 `rollbackFor` 范围内

**解决方案**：
```java
// ❌ 错误：同类调用事务失效
@Service
public class OrderService {
    public void create() {
        this.createWithTransaction();  // 事务失效
    }
    
    @Transactional
    private void createWithTransaction() { }
}

// ✅ 正确：通过 Orchestrator 调用
@Service
public class OrderOrchestrator {
    @Autowired
    private OrderService orderService;
    
    @Transactional
    public void create() {
        orderService.createOrder();  // 事务生效
    }
}
```

#### 问题2：循环依赖
**症状**：启动报错 `BeanCurrentlyInCreationException`  
**原因**：Orchestrator 之间互相注入

**解决方案**：
```java
// ❌ 错误：循环依赖
@Service
public class OrderOrchestrator {
    @Autowired
    private FinanceOrchestrator financeOrchestrator;
}

@Service
public class FinanceOrchestrator {
    @Autowired
    private OrderOrchestrator orderOrchestrator;  // 循环了
}

// ✅ 正确：通过 Service 层通信
@Service
public class OrderOrchestrator {
    @Autowired
    private FinanceService financeService;  // 注入 Service
}
```

### 6.2 小程序常见问题

#### 问题1：多页面数据不同步
**症状**：扫码后，其他页面数据未更新  
**原因**：未使用 EventBus 触发刷新

**解决方案**：
```javascript
// ✅ 在操作后触发事件
import { triggerDataRefresh } from '../../utils/eventBus';

async function onScanSuccess() {
    await api.production.executeScan(...);
    
    // 必须触发全局刷新
    triggerDataRefresh('scans', { action: 'scan' });
}

// ✅ 在其他页面监听
import { onDataRefresh } from '../../utils/eventBus';

Page({
    onShow() {
        this._unsubscribe = onDataRefresh(() => {
            this.loadData();  // 刷新
        });
    },
    
    onHide() {
        this._unsubscribe?.();  // 必须取消监听
    }
});
```

#### 问题2：数据显示不一致
**症状**：admin 页面显示"裁剪"，scan 页面显示"车缝"  
**原因**：未过滤 `scanType='procurement'` 或 `scanResult='failure'`

**解决方案**：
```javascript
// ✅ 必须同时过滤
const records = await api.production.getScanRecords({
    orderId: this.data.orderId,
    scanType: { $ne: 'procurement' },    // 排除采购
    scanResult: { $ne: 'failure' },      // 排除失败
});
```

---

## 八、相关文档索引

### 架构设计
- [ORCHESTRATOR_PATTERN_GUIDE.md](ORCHESTRATOR_PATTERN_GUIDE.md) - 后端编排器详解
- [MINIPROGRAM_ARCHITECTURE_GUIDE.md](MINIPROGRAM_ARCHITECTURE_GUIDE.md) - 小程序架构
- [MINIPROGRAM_REFACTORING_PROPOSAL.md](MINIPROGRAM_REFACTORING_PROPOSAL.md) - 重构方案

### 业务流程
- [WORKFLOW_EXPLANATION.md](WORKFLOW_EXPLANATION.md) - 业务流程说明
- [SCAN_SYSTEM_LOGIC.md](SCAN_SYSTEM_LOGIC.md) - 扫码系统逻辑
- [DATA_PERMISSION_DESIGN.md](DATA_PERMISSION_DESIGN.md) - 数据权限设计

### 技术实现
- [CODE_CLEANUP_REPORT.md](CODE_CLEANUP_REPORT.md) - 代码清理报告
- [MULTI_PAGE_SYNC_GUIDE.md](MULTI_PAGE_SYNC_GUIDE.md) - 多页面同步
- [DATA_SYNC_ANALYSIS.md](DATA_SYNC_ANALYSIS.md) - 数据同步分析

### 测试部署
- [QUICK_TEST_GUIDE.md](QUICK_TEST_GUIDE.md) - 快速测试指南
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - 部署检查清单
- [deployment/DATABASE_CONFIG.md](deployment/DATABASE_CONFIG.md) - 数据库配置

### 系统文档
- [SYSTEM_STATUS.md](SYSTEM_STATUS.md) - 系统状态总览
- [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) - 项目完整文档
- [xindiedai.md](xindiedai.md) - 架构评估报告（96分）

---

## 九、维护与更新

### 9.1 文档更新规则

**何时更新此文档？**
1. ✅ 新增 Orchestrator 时
2. ✅ 修改架构模式时
3. ✅ 新增开发规范时
4. ✅ 发现重要问题及解决方案时

**更新流程**：
```bash
# 1. 修改文档
vim DEVELOPMENT_GUIDE.md

# 2. 提交更新
git add DEVELOPMENT_GUIDE.md
git commit -m "docs: 更新开发指南 - [更新内容]"
git push
```

### 架构演进历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0 | 2026-01-20 | 初始版本，26个 Orchestrator |
| 1.5 | 2026-01-22 | 新增多页面同步机制（EventBus） |
| 2.0 | 2026-01-23 | 整合架构文档、新增重构方案、新增UI设计规范 |

---

**文档维护**: GitHub Copilot  
**最后更新**: 2026-01-23  
**版本**: 2.0

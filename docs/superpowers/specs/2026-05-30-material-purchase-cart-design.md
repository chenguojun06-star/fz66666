# 物料采购购物车功能设计文档

> 版本：v1.0
> 日期：2026-05-30
> 状态：草稿

---

## 一、需求概述

### 1.1 业务背景

当前物料采购系统存在以下问题：
- 每个采购单只能包含一个物料，批量采购需要多次操作
- 多订单/多款号使用相同面料时，无法快速合并采购
- 采购流程与订单/样衣关联不够紧密

### 1.2 核心需求

| 需求点 | 说明 |
|--------|------|
| 购物车功能 | 可添加多款面料一起下采购单 |
| 侧滑弹窗 | 从多个入口打开（采购页顶部、订单详情、BOM页、物料库） |
| 智能合并 | 物料编码+规格相同建议合并（可调整/拆分） |
| 服务端持久化 | 多端同步，关闭后保留 |
| 灵活编辑 | 供应商/数量/拆分都可自由调整，不限制 |
| 通用组件 | 样衣开发和大货采购都能用 |

### 1.3 来源追踪

- 同一个物料可能来自多个订单/样衣
- 系统追踪各来源数量，但可合并下单
- 采购单创建后，与原订单/样衣数据保持同步

### 1.4 下单流程

```
草稿 → 预览 → 确认下单 → 锁定
  ↓
支持撤回采购，撤回后可继续编辑
```

---

## 二、系统架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端交互层                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   │
│  │ 采购页面 │   │ 订单详情 │   │BOM页面  │   │物料库   │   │
│  │  顶部   │   │         │   │         │   │         │   │
│  └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘   │
│       │             │             │             │           │
│       └─────────────┴─────────────┴─────────────┘           │
│                         │                                   │
│                         ▼                                   │
│              ┌──────────────────────┐                      │
│              │  PurchaseCartDrawer  │  ◀── 通用购物车组件   │
│              │    (侧滑弹窗组件)    │                      │
│              └────────────┬─────────┘                      │
│                           │                                 │
│                           ▼                                 │
│              ┌──────────────────────┐                      │
│              │   usePurchaseCart   │  ◀── 购物车状态管理   │
│              │      (Hook)         │                      │
│              └────────────┬─────────┘                      │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      后端服务层                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ PurchaseCart     │  │ MaterialPurchase │               │
│  │ Controller       │  │ Orchestrator     │               │
│  │ (购物车API)      │  │ (采购单编排)     │               │
│  └────────┬─────────┘  └────────┬─────────┘               │
│           │                    │                          │
│           ▼                    ▼                          │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ PurchaseCart      │  │ MaterialPurchase  │               │
│  │ Service           │  │ Service          │               │
│  └────────┬─────────┘  └────────┬─────────┘               │
│           │                    │                          │
│           ▼                    ▼                          │
│  ┌──────────────────────────────────────────┐             │
│  │           MySQL (t_purchase_cart)         │             │
│  └──────────────────────────────────────────┘             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 组件层级

```
frontend/src/components/
├── common/
│   └── PurchaseCartDrawer/
│       ├── index.tsx              # 主组件（侧滑弹窗）
│       ├── CartHeader.tsx         # 头部（标题+操作按钮）
│       ├── CartSearch.tsx         # 搜索添加区域
│       ├── CartList.tsx           # 购物车列表
│       ├── CartItem.tsx           # 单个物料项
│       ├── MergeSuggestion.tsx    # 合并推荐卡片
│       ├── CartPreview.tsx        # 预览确认弹窗
│       └── CartSummary.tsx        # 底部汇总栏
│
└── hooks/
    └── usePurchaseCart.ts          # 购物车状态管理Hook

backend/src/main/java/
├── production/
│   ├── controller/
│   │   └── PurchaseCartController.java  # 购物车API
│   ├── service/
│   │   ├── PurchaseCartService.java
│   │   └── impl/
│   │       └── PurchaseCartServiceImpl.java
│   ├── entity/
│   │   ├── PurchaseCart.java            # 购物车主表
│   │   └── PurchaseCartItem.java         # 购物车明细
│   └── orchestration/
│       └── PurchaseCartOrchestrator.java  # 购物车编排器
```

---

## 三、数据模型设计

### 3.1 数据库表设计

#### t_purchase_cart（购物车主表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | VARCHAR(36) | 主键 |
| tenant_id | BIGINT | 租户ID |
| user_id | VARCHAR(36) | 用户ID |
| status | VARCHAR(20) | 状态：DRAFT/CONFIRMED/CANCELLED |
| total_items | INT | 物料总数 |
| total_amount | DECIMAL(12,2) | 预计总金额 |
| remark | TEXT | 备注 |
| created_time | DATETIME | 创建时间 |
| updated_time | DATETIME | 更新时间 |

#### t_purchase_cart_item（购物车明细表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | VARCHAR(36) | 主键 |
| cart_id | VARCHAR(36) | 购物车ID |
| tenant_id | BIGINT | 租户ID |
| material_code | VARCHAR(50) | 物料编码 |
| material_name | VARCHAR(100) | 物料名称 |
| material_type | VARCHAR(20) | 物料类型：FABRIC/LINING/ACCESSORY |
| specifications | VARCHAR(100) | 规格 |
| unit | VARCHAR(10) | 单位 |
| quantity | DECIMAL(10,2) | 采购数量 |
| supplier_id | VARCHAR(36) | 供应商ID |
| supplier_name | VARCHAR(100) | 供应商名称 |
| unit_price | DECIMAL(10,2) | 单价 |
| total_amount | DECIMAL(12,2) | 金额 |
| source_type | VARCHAR(20) | 来源类型：ORDER/SAMPLE/BATCH |
| source_id | VARCHAR(36) | 来源ID（订单ID或样衣ID） |
| source_no | VARCHAR(50) | 来源编号（订单号或样衣号） |
| source_quantity | DECIMAL(10,2) | 来源数量 |
| color | VARCHAR(50) | 颜色 |
| fabric_composition | VARCHAR(100) | 面料成分 |
| fabric_width | VARCHAR(50) | 幅宽 |
| fabric_weight | VARCHAR(50) | 克重 |
| merge_group_id | VARCHAR(36) | 合并组ID（相同物料归为一组） |
| remark | TEXT | 备注 |
| sort_order | INT | 排序 |
| created_time | DATETIME | 创建时间 |
| updated_time | DATETIME | 更新时间 |

### 3.2 前端类型定义

```typescript
// 购物车主表
interface PurchaseCart {
  id: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  totalItems: number;
  totalAmount: number;
  remark?: string;
  items: PurchaseCartItem[];
  createdTime: string;
  updatedTime: string;
}

// 购物车明细
interface PurchaseCartItem {
  id: string;
  materialCode: string;
  materialName: string;
  materialType: 'FABRIC' | 'LINING' | 'ACCESSORY';
  specifications?: string;
  unit: string;
  quantity: number;
  supplierId?: string;
  supplierName?: string;
  unitPrice?: number;
  totalAmount?: number;
  sourceType: 'ORDER' | 'SAMPLE' | 'BATCH';
  sourceId?: string;
  sourceNo?: string;
  sourceQuantity?: number;
  color?: string;
  fabricComposition?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  mergeGroupId?: string;
  remark?: string;
}

// 合并推荐
interface MergeSuggestion {
  materialCode: string;
  materialName: string;
  specifications: string;
  items: PurchaseCartItem[];
  totalQuantity: number;
  suggestedSupplierId?: string;
  suggestedSupplierName?: string;
}

// 预览数据
interface CartPreview {
  cart: PurchaseCart;
  willGeneratePurchases: MaterialPurchase[];
  validationErrors: ValidationError[];
}
```

---

## 四、API 接口设计

### 4.1 购物车 API

#### GET /api/purchase-cart
获取当前用户的购物车

```json
Response:
{
  "code": 200,
  "data": {
    "id": "cart-uuid",
    "status": "DRAFT",
    "totalItems": 5,
    "totalAmount": 12500.00,
    "items": [...]
  }
}
```

#### POST /api/purchase-cart/items
添加物料到购物车

```json
Request:
{
  "materialCode": "FAB001",
  "materialName": "纯棉面料",
  "materialType": "FABRIC",
  "specifications": "150cm",
  "unit": "米",
  "quantity": 100,
  "supplierId": "supplier-uuid",
  "supplierName": "恒达纺织",
  "unitPrice": 12.50,
  "sourceType": "ORDER",
  "sourceId": "order-uuid",
  "sourceNo": "PO20260530001",
  "sourceQuantity": 100,
  "color": "红色",
  "fabricComposition": "100%棉",
  "fabricWidth": "150cm",
  "fabricWeight": "200g/m²"
}

Response:
{
  "code": 200,
  "data": {
    "itemId": "item-uuid",
    "mergeSuggestion": {
      "hasMergeable": true,
      "items": [...]
    }
  }
}
```

#### PUT /api/purchase-cart/items/{itemId}
更新购物车物料

```json
Request:
{
  "quantity": 150,
  "supplierId": "supplier-uuid-2",
  "supplierName": "深圳纺织",
  "unitPrice": 13.00,
  "remark": "调整数量"
}
```

#### DELETE /api/purchase-cart/items/{itemId}
删除购物车物料

#### POST /api/purchase-cart/items/merge
合并物料

```json
Request:
{
  "itemIds": ["item-1", "item-2"],
  "targetQuantity": 250,
  "targetSupplierId": "supplier-uuid",
  "targetSupplierName": "恒达纺织"
}
```

#### POST /api/purchase-cart/items/split
拆分物料

```json
Request:
{
  "itemId": "item-1",
  "splitQuantity": 100
}
```

#### POST /api/purchase-cart/preview
预览购物车（生成采购单预览）

```json
Response:
{
  "code": 200,
  "data": {
    "purchaseGroups": [
      {
        "groupKey": "FAB001-150cm-supplier1",
        "materialCode": "FAB001",
        "materialName": "纯棉面料",
        "specifications": "150cm",
        "supplierId": "supplier-uuid",
        "supplierName": "恒达纺织",
        "totalQuantity": 250,
        "unitPrice": 12.50,
        "totalAmount": 3125.00,
        "sourceItems": [
          {
            "sourceType": "ORDER",
            "sourceNo": "PO20260530001",
            "quantity": 100
          },
          {
            "sourceType": "ORDER",
            "sourceNo": "PO20260530002",
            "quantity": 150
          }
        ]
      }
    ],
    "summary": {
      "totalGroups": 3,
      "totalItems": 5,
      "totalAmount": 12500.00
    }
  }
}
```

#### POST /api/purchase-cart/confirm
确认下单

```json
Request:
{
  "confirmedItems": ["item-1", "item-2", "item-3"]
}

Response:
{
  "code": 200,
  "data": {
    "purchaseIds": ["purchase-1", "purchase-2"],
    "purchaseNos": ["CG20260530001", "CG20260530002"]
  }
}
```

#### DELETE /api/purchase-cart
清空购物车

#### POST /api/purchase-cart/save-draft
保存草稿

#### GET /api/purchase-cart/merge-suggestions
获取合并建议

```json
Response:
{
  "code": 200,
  "data": [
    {
      "materialCode": "FAB001",
      "materialName": "纯棉面料",
      "specifications": "150cm",
      "items": [
        {
          "id": "item-1",
          "supplierName": "恒达纺织",
          "quantity": 100
        },
        {
          "id": "item-2",
          "supplierName": "深圳纺织",
          "quantity": 50
        }
      ],
      "suggestion": "可合并到恒达纺织，共150米"
    }
  ]
}
```

---

## 五、前端组件设计

### 5.1 PurchaseCartDrawer 组件

```tsx
// 组件 Props
interface PurchaseCartDrawerProps {
  open: boolean;
  onClose: () => void;
  onConfirmSuccess?: (purchaseIds: string[]) => void;
}

// 组件状态
interface PurchaseCartDrawerState {
  cart: PurchaseCart | null;
  loading: boolean;
  previewVisible: boolean;
  previewData: CartPreview | null;
  selectedItems: Set<string>;
  mergeSuggestions: MergeSuggestion[];
}
```

### 5.2 组件结构

```
PurchaseCartDrawer
├── Header（头部）
│   ├── 标题 + 购物车数量
│   ├── [清空] 按钮
│   └── [关闭] 按钮
│
├── SearchArea（搜索添加区域）
│   ├── 搜索框（搜索物料）
│   ├── 扫码添加按钮
│   └── [从BOM添加] 按钮
│
├── CartList（购物车列表）
│   ├── 分组标题（面料类/里料类/辅料类）
│   │
│   └── CartItem（单个物料项）
│       ├── 复选框
│       ├── 物料信息（编码/名称/规格）
│       ├── 数量输入框
│       ├── 供应商选择
│       ├── 来源追踪（订单号+数量）
│       ├── 金额显示
│       ├── [编辑] [拆分] [删除] 按钮
│       └── 合并指示器（如果有可合并的物料）
│
├── MergeSuggestionCard（合并推荐卡片）
│   ├── 推荐信息
│   ├── [合并] 按钮
│   └── [保持独立] 按钮
│
└── Footer（底部汇总栏）
    ├── 预计生成：X 张采购单
    ├── 合计金额：¥XX,XXX
    ├── [保存草稿] 按钮
    └── [确认下单] 按钮
```

### 5.3 交互流程

#### 流程1：添加物料

```
用户输入物料编码/名称搜索
    ↓
系统返回物料列表（从物料资料库）
    ↓
用户点击 "+" 添加到购物车
    ↓
系统检查：
  是否有相同物料（物料编码+规格）？
    ↓
  是 → 显示合并建议卡片
  否 → 直接添加，显示成功提示
```

#### 流程2：合并操作

```
用户添加物料时，系统检测到可合并项
    ↓
显示合并推荐卡片：
┌────────────────────────────────────┐
│ 🔔 推荐合并                          │
│                                     │
│ 面料A（面料编码ABC001）              │
│ ├─ 供应商1: 100米                   │
│ └─ 供应商2: 50米                    │
│                                     │
│ 来源：订单A(100米) + 订单B(50米)     │
│                                     │
│ [合并到供应商1] [合并到供应商2]      │
│ [保持独立]                           │
└────────────────────────────────────┘
    ↓
用户选择合并方式
    ↓
系统更新购物车
```

#### 流程3：下单确认

```
用户点击 [确认下单]
    ↓
系统显示预览弹窗：
┌─────────────────────────────────────────────────┐
│                   采购预览                          │
├─────────────────────────────────────────────────┤
│                                                  │
│  将生成 2 张采购单：                               │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │ 采购单 1                                   │ │
│  │ 面料A（ABC001）| 恒达纺织 | 150米 | ¥1,875 │ │
│  │ 来源：订单A(100米) + 订单B(50米)           │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │ 采购单 2                                   │ │
│  │ 里料B（DEF002）| 深圳辅料 | 200米 | ¥2,000 │ │
│  │ 来源：订单C(200米)                          │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  合计：2张采购单 | 物料5件 | ¥12,500             │
│                                                  │
├─────────────────────────────────────────────────┤
│              [取消]           [确认下单]          │
└─────────────────────────────────────────────────┘
    ↓
用户点击 [确认下单]
    ↓
系统调用 API，创建采购单
    ↓
清空购物车，显示成功提示
    ↓
回调 onConfirmSuccess，刷新采购列表
```

---

## 六、后端服务设计

### 6.1 PurchaseCartOrchestrator

```java
@Service
public class PurchaseCartOrchestrator {

    /**
     * 添加物料到购物车
     * 职责：
     * 1. 获取或创建用户购物车
     * 2. 检查是否可合并
     * 3. 添加物料
     * 4. 返回合并建议
     */
    public AddItemResult addItem(String userId, AddItemRequest request);

    /**
     * 更新购物车物料
     * 职责：
     * 1. 更新数量/供应商/价格等
     * 2. 重新计算金额
     * 3. 检查合并建议
     */
    public void updateItem(String userId, String itemId, UpdateItemRequest request);

    /**
     * 合并物料
     * 职责：
     * 1. 将多个物料合并为一个
     * 2. 累加数量
     * 3. 使用目标供应商
     * 4. 保留所有来源追踪
     */
    public void mergeItems(String userId, List<String> itemIds, MergeRequest request);

    /**
     * 拆分物料
     * 职责：
     * 1. 将一个物料拆分为两个
     * 2. 拆分数量
     * 3. 保留来源追踪
     */
    public void splitItem(String userId, String itemId, SplitRequest request);

    /**
     * 预览购物车
     * 职责：
     * 1. 按物料+供应商分组
     * 2. 生成采购单预览
     * 3. 校验数据完整性
     */
    public CartPreview preview(String userId);

    /**
     * 确认下单
     * 职责：
     * 1. 调用 MaterialPurchaseOrchestrator 创建采购单
     * 2. 关联来源（订单/样衣）
     * 3. 清空已下单的购物车项
     * 4. 返回采购单ID列表
     */
    public ConfirmResult confirm(String userId, List<String> itemIds);

    /**
     * 获取合并建议
     * 职责：
     * 1. 扫描购物车
     * 2. 找出可合并的物料组
     * 3. 生成合并建议
     */
    public List<MergeSuggestion> getMergeSuggestions(String userId);
}
```

### 6.2 与采购单服务的集成

```java
/**
 * 确认下单时，创建采购单的映射关系
 */
public ConfirmResult confirm(String userId, List<String> itemIds) {
    // 1. 按物料+供应商分组
    Map<String, List<PurchaseCartItem>> groups = groupByMaterialAndSupplier(items);

    // 2. 为每个分组创建采购单
    List<String> purchaseIds = new ArrayList<>();
    for (Map.Entry<String, List<PurchaseCartItem>> entry : groups.entrySet()) {
        List<PurchaseCartItem> groupItems = entry.getValue();

        // 汇总数量
        BigDecimal totalQty = groupItems.stream()
            .map(PurchaseCartItem::getQuantity)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 创建采购单
        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setMaterialCode(groupItems.get(0).getMaterialCode());
        purchase.setMaterialName(groupItems.get(0).getMaterialName());
        purchase.setSpecifications(groupItems.get(0).getSpecifications());
        purchase.setQuantity(totalQty);
        purchase.setSupplierId(groupItems.get(0).getSupplierId());
        purchase.setSupplierName(groupItems.get(0).getSupplierName());
        purchase.setSourceType(groupItems.get(0).getSourceType());
        purchase.setOrderId(groupItems.get(0).getSourceId());  // 第一个来源
        purchase.setOrderNo(groupItems.get(0).getSourceNo());

        // 来源追踪 JSON（多个来源）
        purchase.setRemark(buildSourcesJson(groupItems));

        String purchaseId = materialPurchaseOrchestrator.save(purchase);
        purchaseIds.add(purchaseId);
    }

    // 3. 清空已下单的购物车项
    purchaseCartService.deleteItems(itemIds);

    // 4. 返回结果
    return new ConfirmResult(purchaseIds);
}
```

---

## 七、通用性设计

### 7.1 样衣开发与生产订单的兼容

购物车不区分业务场景，所有物料统一管理。

来源类型（sourceType）：
- `ORDER`：生产订单
- `SAMPLE`：样衣开发
- `BATCH`：批量采购

每个物料记录其来源信息，下单时：
- `ORDER` 来源 → 创建的采购单关联 `orderId`
- `SAMPLE` 来源 → 创建的采购单关联 `patternProductionId`
- `BATCH` 来源 → 创建的采购单 `sourceType = 'BATCH'`

### 7.2 多端同步

服务端持久化，确保：
- PC 端添加的物料，小程序/H5 可以看到
- 关闭弹窗再打开，数据仍然保留
- 草稿自动保存

---

## 八、UI/UX 设计要点

### 8.1 侧滑弹窗规格

| 属性 | 值 |
|------|-----|
| 宽度 | 420px（PC）/ 100%（移动端） |
| 高度 | 100vh |
| 从 | 右侧滑入 |
| 背景遮罩 | rgba(0,0,0,0.45) |
| 关闭方式 | 点击遮罩 / 拖拽 / 关闭按钮 |

### 8.2 颜色规范

```css
/* 使用 CSS 变量 */
--cart-primary: var(--primary-color);
--cart-success: var(--color-success);
--cart-warning: var(--color-warning);
--cart-text-primary: var(--neutral-text);
--cart-text-secondary: var(--neutral-text-disabled);
--cart-border: var(--color-border);
--cart-bg: var(--color-bg-container);
--cart-highlight: var(--color-bg-highlight);
```

### 8.3 来源追踪显示

```
来源：订单A(100米) + 订单B(50米) + 样衣001(30米)
   ↓
可展开查看详情
```

---

## 九、风险与注意事项

### 9.1 数据一致性

- 购物车数据与物料资料库同步
- 下单后，采购单与订单/样衣的关联关系必须准确
- 撤回采购时，需要更新相关状态

### 9.2 并发处理

- 同一用户不能同时在多个设备操作购物车（建议加锁）
- 下单时需要校验物料库存（如果涉及）

### 9.3 性能考虑

- 购物车列表需要支持分页（如果物料很多）
- 搜索物料使用防抖
- 合并建议实时计算，使用缓存

---

## 十、后续扩展

### 10.1 可选功能

1. **历史采购记录**：显示该物料的历史采购价和供应商
2. **库存预警**：添加时检查库存，低于安全库存提示
3. **采购建议**：根据 BOM 自动推荐需要采购的物料
4. **比价功能**：同一物料显示多个供应商的价格对比

### 10.2 后续迭代

1. Phase 1：基础购物车功能
2. Phase 2：智能合并推荐
3. Phase 3：采购建议与库存联动
4. Phase 4：多端同步优化

---

## 十一、实现计划

### Phase 1：基础购物车（建议 2-3 天）

- [ ] 数据库表设计
- [ ] 后端 API 开发
- [ ] 前端基础组件
- [ ] 添加/编辑/删除功能
- [ ] 草稿保存功能

### Phase 2：高级功能（建议 2-3 天）

- [ ] 合并/拆分功能
- [ ] 预览确认流程
- [ ] 与采购单服务集成
- [ ] 来源追踪显示

### Phase 3：优化体验（建议 1-2 天）

- [ ] 多入口集成
- [ ] 智能合并推荐
- [ ] 样式优化
- [ ] 移动端适配

---

**文档版本历史**

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2026-05-30 | 初始版本 |

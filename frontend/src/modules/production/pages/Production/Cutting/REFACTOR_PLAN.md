# Production/Cutting 重构计划

> **文件**: `frontend/src/modules/production/pages/Production/Cutting/index.tsx`  
> **当前行数**: 2380行  
> **目标行数**: ~600行（主文件）  
> **优化率**: ↓75%

---

## 📊 文件分析

### 当前状态
- **总行数**: 2380行
- **useState数量**: 30+个
- **主要功能**:
  1. 裁剪任务列表（筛选、分页、排序）
  2. 菲号生成（从订单SKU自动生成）
  3. 菲号编辑（批量导入、手动编辑）
  4. 二维码打印（A4/A5、横竖、网格/单张）
  5. 任务详情（订单信息、BOM、物料）

### 复杂度来源
1. **双模式**: 列表页 + 任务详情页（类似StyleInfo）
2. **状态过多**: 30+个useState（打印配置、表单状态、列表状态）
3. **打印逻辑**: 复杂的二维码打印配置和预览
4. **导入逻辑**: SKU解析、菲号生成、批量编辑

---

## 🎯 重构策略

### Phase 1: 任务列表页分离

**创建独立列表页**: `CuttingList/` (类似 StyleInfoList)

#### 1.1 Hooks提取（3个）
```
CuttingList/hooks/
├── useCuttingList.ts (200行)        - 列表数据、分页、排序
├── useCuttingFilters.ts (120行)     - 筛选条件、搜索
└── useCuttingActions.ts (100行)     - 删除、查看详情
```

#### 1.2 组件提取（4个）
```
CuttingList/components/
├── CuttingFilterPanel.tsx (150行)   - 筛选面板（订单号/款号/状态）
├── CuttingStatsCards.tsx (120行)    - 统计卡片（待裁剪/进行中/已完成）
├── CuttingTableView.tsx (350行)     - 表格视图（可排序列）
└── CuttingCardView.tsx (180行)      - 卡片视图（液体进度条）
```

#### 1.3 主文件
```typescript
CuttingList/index.tsx (200行)
- 使用3个Hooks
- 渲染4个组件
- 路由: /production/cutting
```

**预计**: 1220行（3 Hooks + 4组件 + 主文件）

---

### Phase 2: 任务详情页重构

**重构详情页**: `Cutting/index.tsx`（纯详情功能）

#### 2.1 Hooks提取（3个）
```
Cutting/hooks/
├── useCuttingDetail.ts (180行)      - 任务详情加载、订单信息
├── useBundleGeneration.ts (250行)   - 菲号生成、SKU解析、批量编辑
└── usePrintConfig.ts (150行)        - 打印配置、预览、执行
```

#### 2.2 组件提取（5个）
```
Cutting/components/
├── CuttingTaskHeader.tsx (200行)    - 任务头部（订单信息、状态）
├── BundleGenerationPanel.tsx (300行) - 菲号生成面板（导入/编辑）
├── BundleTable.tsx (250行)          - 菲号列表表格
├── PrintConfigPanel.tsx (200行)     - 打印配置面板
└── PrintPreviewModal.tsx (150行)    - 打印预览弹窗
```

#### 2.3 主文件
```typescript
Cutting/index.tsx (500行)
- 使用3个Hooks
- 渲染5个组件
- Tab切换（基础信息、菲号列表、物料BOM、打印）
- 路由: /production/cutting/task/:orderNo
```

**预计**: 1580行（3 Hooks + 5组件 + 主文件）

---

## 📂 重构后文件结构

```
frontend/src/modules/production/pages/Production/
├── CuttingList/                      [新建独立列表页]
│   ├── index.tsx (200行)             - 列表主文件
│   ├── hooks/
│   │   ├── useCuttingList.ts (200行)
│   │   ├── useCuttingFilters.ts (120行)
│   │   ├── useCuttingActions.ts (100行)
│   │   └── index.ts
│   └── components/
│       ├── CuttingFilterPanel.tsx (150行)
│       ├── CuttingStatsCards.tsx (120行)
│       ├── CuttingTableView.tsx (350行)
│       └── CuttingCardView.tsx (180行)
│
└── Cutting/                          [重构详情页]
    ├── index.tsx (500行)             - 详情主文件 [优化 ↓79%]
    ├── index-backup-20260131.tsx     - 原始备份（2380行）
    ├── hooks/
    │   ├── useCuttingDetail.ts (180行)
    │   ├── useBundleGeneration.ts (250行)
    │   ├── usePrintConfig.ts (150行)
    │   └── index.ts
    └── components/
        ├── CuttingTaskHeader.tsx (200行)
        ├── BundleGenerationPanel.tsx (300行)
        ├── BundleTable.tsx (250行)
        ├── PrintConfigPanel.tsx (200行)
        └── PrintPreviewModal.tsx (150行)
```

**累计**: 2800行新代码（比原始2380多，但模块化清晰）

---

## 🔧 具体模块功能

### useCuttingList Hook（200行）

**职责**: 任务列表数据管理

```typescript
interface UseCuttingListReturn {
  loading: boolean;
  dataSource: CuttingTask[];
  total: number;
  queryParams: CuttingQueryParams;
  setQueryParams: (params: CuttingQueryParams) => void;
  fetchList: () => Promise<void>;
  refreshList: () => void;
}

export const useCuttingList = (): UseCuttingListReturn => {
  // 列表加载、分页、排序逻辑
};
```

---

### useBundleGeneration Hook（250行）

**职责**: 菲号生成和编辑逻辑

```typescript
interface UseBundleGenerationReturn {
  bundlesInput: CuttingBundleRow[];
  setBundlesInput: (bundles: CuttingBundleRow[]) => void;
  importLocked: boolean;
  generateLoading: boolean;
  handleImportFromOrder: (orderNo: string) => Promise<void>;
  handleGenerateBundles: () => Promise<void>;
  addEmptyRow: () => void;
  updateRow: (index: number, field: string, value: any) => void;
  deleteRow: (index: number) => void;
}
```

**核心功能**:
1. 从订单导入SKU（解析颜色码数）
2. 自动生成菲号（按颜色分组）
3. 批量编辑（表格内联编辑）
4. 验证（数量>0、颜色码数必填）

---

### usePrintConfig Hook（150行）

**职责**: 打印配置和执行

```typescript
interface UsePrintConfigReturn {
  printConfig: {
    pageSize: 'A4' | 'A5';
    orientation: 'portrait' | 'landscape';
    mode: 'grid' | 'single';
    showOrderInfo: boolean;
    qrCodeSize: number;
    columns: number;
  };
  setPrintConfig: (config: Partial<PrintConfig>) => void;
  printPreviewOpen: boolean;
  printBundles: CuttingBundleRow[];
  openPrintPreview: (bundles: CuttingBundleRow[]) => void;
  closePrintPreview: () => void;
  executePrint: () => void;
}
```

**打印模式**:
- **网格模式**: A4纸4×3排列，A5纸2×2排列
- **单张模式**: 每张纸一个二维码（大尺寸）
- 配置: 显示订单信息、二维码大小、列数

---

### BundleGenerationPanel 组件（300行）

**布局**:
```
┌─────────────────────────────────────────┐
│ [从订单导入] [自动生成菲号] [清空]      │
├─────────────────────────────────────────┤
│ 表格（内联编辑）                         │
│ ┌───┬────┬────┬────┬────┬────┐        │
│ │ # │款号│颜色│码数│数量│操作│        │
│ ├───┼────┼────┼────┼────┼────┤        │
│ │ 1 │ST01│黑色│ M  │ 10 │ 删 │        │
│ │ 2 │ST01│黑色│ L  │ 15 │ 删 │        │
│ │...│    │    │    │    │    │        │
│ └───┴────┴────┴────┴────┴────┘        │
│ [+ 添加行]                               │
└─────────────────────────────────────────┘
```

**功能**:
- 从订单导入（弹窗选择订单号）
- 自动生成菲号（按颜色分组，递增编号）
- 内联编辑（DictAutoComplete for 颜色/码数）
- 批量操作（全选、删除、清空）

---

### PrintPreviewModal 组件（150行）

**布局**:
```
┌──────────────────────────────────────────┐
│ 打印预览                        [关闭] │
├──────────────────────────────────────────┤
│ 配置面板                                 │
│ 纸张: [A4▼] 方向: [竖向▼] 模式: [网格▼]│
│ 二维码大小: [●──────] 120px            │
│ 列数: [4]  显示订单信息: [✓]           │
├──────────────────────────────────────────┤
│ 预览区域（模拟纸张）                     │
│ ┌─────┬─────┬─────┬─────┐             │
│ │ QR  │ QR  │ QR  │ QR  │             │
│ │ Info│ Info│ Info│ Info│             │
│ ├─────┼─────┼─────┼─────┤             │
│ │ QR  │ QR  │ QR  │ QR  │             │
│ └─────┴─────┴─────┴─────┘             │
├──────────────────────────────────────────┤
│              [打印] [取消]               │
└──────────────────────────────────────────┘
```

---

## 🎯 路由配置更新

```typescript
// routeConfig.ts 添加
export const paths = {
  // ... 现有路径
  cuttingList: '/production/cutting',        // 新增列表页
  cuttingTask: '/production/cutting/task/:orderNo',  // 详情页
};

// App.tsx 路由
<Route path="/production/cutting" element={<CuttingList />} />
<Route path="/production/cutting/task/:orderNo" element={<Cutting />} />
```

---

## 📋 实施步骤

### Step 1: 创建CuttingList列表页（4-6小时）
1. ✅ 创建目录结构
2. ✅ 提取 useCuttingList Hook（200行）
3. ✅ 提取 useCuttingFilters Hook（120行）
4. ✅ 提取 useCuttingActions Hook（100行）
5. ✅ 创建 CuttingFilterPanel 组件（150行）
6. ✅ 创建 CuttingStatsCards 组件（120行）
7. ✅ 创建 CuttingTableView 组件（350行）
8. ✅ 创建 CuttingCardView 组件（180行）
9. ✅ 创建主文件 index.tsx（200行）

### Step 2: 重构Cutting详情页（6-8小时）
1. ✅ 备份原文件（index-backup-20260131.tsx）
2. ✅ 提取 useCuttingDetail Hook（180行）
3. ✅ 提取 useBundleGeneration Hook（250行）
4. ✅ 提取 usePrintConfig Hook（150行）
5. ✅ 创建 CuttingTaskHeader 组件（200行）
6. ✅ 创建 BundleGenerationPanel 组件（300行）
7. ✅ 创建 BundleTable 组件（250行）
8. ✅ 创建 PrintConfigPanel 组件（200行）
9. ✅ 创建 PrintPreviewModal 组件（150行）
10. ✅ 简化主文件（2380 → 500行）

### Step 3: 路由和测试（2-3小时）
1. ✅ 更新路由配置
2. ✅ 更新模块导出
3. ✅ 集成测试（列表→详情→打印）
4. ✅ 修复TypeScript错误

---

## 📊 预期成果

| 指标 | 原值 | 新值 | 优化 |
|------|------|------|------|
| **主文件行数** | 2380 | 500 | ↓79% |
| **useState数量** | 30+ | ~15 | ↓50% |
| **函数数量** | 40+ | ~10 | ↓75% |
| **模块数量** | 1 | 10 | +900% |

**新建模块**: 10个（3 Hooks + 4组件 + 列表主文件 + 2个详情页配置组件）  
**总代码量**: 2800行（比原始多420行，但模块化清晰）

---

## ✅ 验收标准

### 功能完整性
- [ ] 列表页：筛选、分页、排序正常
- [ ] 详情页：订单信息加载正常
- [ ] 菲号生成：从订单导入、自动生成、编辑正常
- [ ] 二维码打印：配置、预览、打印正常
- [ ] 路由跳转：列表↔详情无死循环

### 代码质量
- [ ] TypeScript错误：0个
- [ ] 主文件 <600行
- [ ] 所有Hook <350行
- [ ] 所有组件 <400行

---

**开始时间**: _______  
**预计完成**: 12-17小时（分2-3天完成）  
**实际完成**: _______

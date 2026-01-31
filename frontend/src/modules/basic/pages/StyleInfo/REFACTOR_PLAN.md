# StyleInfo 拆分计划 (2706行)

## 📊 当前状态分析

**文件**: `frontend/src/modules/basic/pages/StyleInfo/index.tsx`  
**行数**: 2706 行  
**类型**: 列表页 + 详情页二合一  

### 核心问题
1. **双模式混合**: 列表视图 + 详情视图在同一个文件
2. **40+ useState**: 包括列表状态、详情状态、各Tab状态、各种弹窗状态
3. **已有12个Tab子组件**: StyleBomTab, StyleQuotationTab, StyleAttachmentTab 等
4. **复杂生命周期**: 多个 useEffect 处理路由跳转、Tab切换、表单同步

### 已有组件（components/）
```
StyleBomTab.tsx              - BOM清单Tab
StyleQuotationTab.tsx        - 报价单Tab
StyleAttachmentTab.tsx       - 附件Tab
StylePatternTab.tsx          - 纸样Tab
StyleProcessTab.tsx          - 工序Tab
StyleProductionTab.tsx       - 生产Tab
StyleSampleTab.tsx           - 样衣Tab
StyleSecondaryProcessTab.tsx - 二次工艺Tab
StyleSizePriceTab.tsx        - 尺码价格Tab
StyleSizeTab.tsx             - 尺码Tab
CoverImageUpload.tsx         - 封面图上传
AttachmentThumb.tsx          - 附件缩略图
```

### 已有Hooks（hooks/）
```
useStyleList.ts   - 列表数据管理
useStyleStats.ts  - 统计数据
```

---

## 🎯 重构策略：列表与详情分离

### 方案：拆分为2个独立页面

**核心思路**: StyleInfo 已经有 `isDetailPage || isNewPage` 判断，说明列表和详情是完全独立的UI树。

#### 1. **StyleInfoList/index.tsx** (列表页，新文件)
- **路由**: `/style-info`
- **行数预估**: ~800 行
- **职责**:
  - 列表筛选（款号、季节、品类、状态）
  - 卡片/列表视图切换
  - 开发费用统计看板
  - 行操作：编辑、删除、置顶、打印
  - 跳转到详情页

**复用现有Hooks**:
- ✅ `useStyleList` (数据获取、分页)
- ✅ `useStyleStats` (统计数据)

**新增Hooks**:
- `useStyleActions.ts` (~120 行) - 删除、置顶、打印等操作

**新增组件**:
- `StyleFilterPanel.tsx` (~150 行) - 筛选面板（款号、季节、品类、状态、日期）
- `StyleStatsCard.tsx` (~100 行) - 开发费用统计卡片
- `StyleCardView.tsx` (~180 行) - 卡片视图展示
- `StyleTableView.tsx` (~200 行) - 表格视图展示

---

#### 2. **StyleInfoDetail/index.tsx** (详情页，重构原文件)
- **路由**: `/style-info/:id` 和 `/style-info/new`
- **行数预估**: ~600 行
- **职责**:
  - 基础信息表单（款号、颜色、尺码、交期等）
  - 样衣图片上传（4张）
  - Tabs 切换（BOM、报价、附件、纸样等12个Tab）
  - 样衣完成、推送到订单等操作

**已有子组件**（12个Tab组件直接复用）:
- ✅ `CoverImageUpload` - 封面图上传
- ✅ `StyleBomTab` - BOM清单
- ✅ `StyleQuotationTab` - 报价单
- ✅ `StyleAttachmentTab` - 附件
- ✅ `StylePatternTab` - 纸样
- ✅ 其他7个Tab...

**新增Hooks**:
- `useStyleDetail.ts` (~200 行) - 详情数据加载、表单管理
- `useStyleFormActions.ts` (~150 行) - 保存、完成、推送等操作

**新增组件**:
- `StyleBasicInfoForm.tsx` (~350 行) - 基础信息表单区域
- `StyleColorSizeTable.tsx` (~150 行) - 颜色码数配置表
- `StyleActionButtons.tsx` (~80 行) - 样衣完成、推送到订单按钮组

---

## 📝 详细拆分步骤

### Phase 1: 创建列表页独立文件（先拆列表）

#### 1.1 创建 StyleInfoList/hooks/useStyleActions.ts
```typescript
// 行操作：删除、置顶、打印
export const useStyleActions = (refreshCallback?: () => void) => {
  const { message } = App.useApp();
  
  const handleDelete = async (id: string) => { ... };
  const handleToggleTop = async (record: StyleInfoType) => { ... };
  const handlePrint = (record: StyleInfoType) => { ... };
  
  return { handleDelete, handleToggleTop, handlePrint };
};
```

#### 1.2 创建 StyleInfoList/components/StyleFilterPanel.tsx
```tsx
// 筛选面板：款号、季节、品类、状态、日期范围
interface StyleFilterPanelProps {
  onSearch: (filters: Partial<StyleQueryParams>) => void;
  categoryOptions: { label: string; value: string }[];
  seasonOptions: { label: string; value: string }[];
}
```

#### 1.3 创建 StyleInfoList/components/StyleStatsCard.tsx
```tsx
// 开发费用统计迷你看板
// 4个指标：面辅料、工序单价、二次工艺、合计
// Segmented切换：今日、本周、本月
```

#### 1.4 创建 StyleInfoList/components/StyleCardView.tsx
```tsx
// UniversalCardView 包装
// 每个卡片显示：封面图、款号、品类、季节、交期、状态
// 操作按钮：查看详情、编辑、删除、打印
```

#### 1.5 创建 StyleInfoList/components/StyleTableView.tsx
```tsx
// ResizableTable
// 列：款号、品类、季节、交期、样衣状态、纸样状态、创建时间
// 行操作：查看详情、编辑、删除、置顶、打印
```

#### 1.6 创建 StyleInfoList/index.tsx (主文件)
```tsx
const StyleInfoListPage = () => {
  const navigate = useNavigate();
  
  // 使用现有Hooks
  const { loading, data, total, queryParams, setQueryParams, fetchList, ... } = useStyleList();
  const { statsRangeType, developmentStats, ... } = useStyleStats();
  const { handleDelete, handleToggleTop, handlePrint } = useStyleActions(fetchList);
  
  // 视图模式
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  
  // 导航到详情
  const handleViewDetail = (id: string) => navigate(`/style-info/${id}`);
  const handleCreate = () => navigate('/style-info/new');
  
  return (
    <Layout>
      <Card className="page-card">
        <div className="page-header">
          <h2>样衣开发</h2>
          <Space>
            <Button onClick={() => setViewMode(...)}>切换视图</Button>
            <Button type="primary" onClick={handleCreate}>新建</Button>
          </Space>
        </div>
        
        <StyleStatsCard />
        <StyleFilterPanel onSearch={setQueryParams} />
        
        {viewMode === 'list' ? (
          <StyleTableView data={data} onEdit={handleViewDetail} onDelete={handleDelete} />
        ) : (
          <StyleCardView data={data} onViewDetail={handleViewDetail} />
        )}
      </Card>
    </Layout>
  );
};
```

---

### Phase 2: 重构详情页（简化原文件）

#### 2.1 创建 StyleInfoDetail/hooks/useStyleDetail.ts
```typescript
// 详情数据加载、表单同步、Tab切换
export const useStyleDetail = (styleId?: string) => {
  const [currentStyle, setCurrentStyle] = useState<StyleInfoType | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState('1');
  const [form] = Form.useForm();
  
  const fetchDetail = async (id: string) => { ... };
  
  useEffect(() => {
    if (styleId && styleId !== 'new') {
      fetchDetail(styleId);
    }
  }, [styleId]);
  
  return { currentStyle, loading, activeTabKey, setActiveTabKey, form, fetchDetail };
};
```

#### 2.2 创建 StyleInfoDetail/hooks/useStyleFormActions.ts
```typescript
// 保存、完成样衣、推送到订单等操作
export const useStyleFormActions = (styleId?: string, refreshCallback?: () => void) => {
  const { message } = App.useApp();
  
  const handleSave = async (values: any) => { ... };
  const handleCompleteSample = async () => { ... };
  const handlePushToOrder = async () => { ... };
  
  return { handleSave, handleCompleteSample, handlePushToOrder, saving };
};
```

#### 2.3 创建 StyleInfoDetail/components/StyleBasicInfoForm.tsx
```tsx
// 基础信息表单区域（300+行）
// 包括：款号、品类、季节、颜色、尺码、交期、客户、状态等
// 左侧：CoverImageUpload（4张图）
// 右侧：表单字段（3列布局）
```

#### 2.4 创建 StyleInfoDetail/components/StyleColorSizeTable.tsx
```tsx
// 颜色码数配置表（5行表格）
// 字段：颜色、尺码1-5、数量1-5
// 快捷选择：常用颜色、常用尺码
```

#### 2.5 创建 StyleInfoDetail/components/StyleActionButtons.tsx
```tsx
// 操作按钮组
// - 保存基础信息
// - 样衣完成（绿色按钮）
// - 推送到下单管理
// - 返回列表
```

#### 2.6 重构 StyleInfoDetail/index.tsx (原文件简化)
```tsx
const StyleInfoDetailPage = () => {
  const { id: styleId } = useParams();
  const isNewPage = styleId === 'new';
  
  // Hooks
  const { currentStyle, loading, activeTabKey, setActiveTabKey, form, fetchDetail } = useStyleDetail(styleId);
  const { handleSave, handleCompleteSample, handlePushToOrder } = useStyleFormActions(styleId, fetchDetail);
  
  // 颜色码数表状态（保留在主文件）
  const [commonColors, setCommonColors] = useState<string[]>(['黑色', '白色', ...]);
  const [commonSizes, setCommonSizes] = useState<string[]>(['XS', 'S', ...]);
  // ... 其他颜色码数相关状态
  
  return (
    <Layout>
      <Card className="page-card">
        <Card title="样衣详情" extra={<StyleActionButtons />}>
          <StyleBasicInfoForm form={form} currentStyle={currentStyle} />
          <StyleColorSizeTable 
            colors={[color1, color2, ...]} 
            sizes={[size1, size2, ...]} 
            commonColors={commonColors}
            commonSizes={commonSizes}
          />
        </Card>
        
        <Card style={{ marginTop: 24 }}>
          <Tabs activeKey={activeTabKey} onChange={setActiveTabKey}>
            <TabPane key="1" tab="BOM清单">
              <StyleBomTab styleId={currentStyle?.id} />
            </TabPane>
            <TabPane key="2" tab="报价单">
              <StyleQuotationTab styleId={currentStyle?.id} />
            </TabPane>
            {/* 其他10个Tab... */}
          </Tabs>
        </Card>
      </Card>
    </Layout>
  );
};
```

---

## 🎯 预期成果

### 文件结构变化

**重构前**:
```
StyleInfo/
├── index.tsx                  (2706行 - 列表+详情混合)
├── hooks/
│   ├── useStyleList.ts        (已有)
│   └── useStyleStats.ts       (已有)
└── components/                (12个Tab组件)
```

**重构后**:
```
StyleInfoList/                 (新建 - 列表页独立)
├── index.tsx                  (~350行)
├── hooks/
│   └── useStyleActions.ts     (~120行)
└── components/
    ├── StyleFilterPanel.tsx   (~150行)
    ├── StyleStatsCard.tsx     (~100行)
    ├── StyleCardView.tsx      (~180行)
    └── StyleTableView.tsx     (~200行)

StyleInfo/                     (原目录 - 改为详情页专用)
├── index.tsx                  (~600行 - 仅保留详情视图)
├── hooks/
│   ├── useStyleList.ts        (移至shared或删除)
│   ├── useStyleStats.ts       (移至shared或删除)
│   ├── useStyleDetail.ts      (~200行 - 新增)
│   └── useStyleFormActions.ts (~150行 - 新增)
└── components/
    ├── StyleBasicInfoForm.tsx (~350行 - 新增)
    ├── StyleColorSizeTable.tsx(~150行 - 新增)
    ├── StyleActionButtons.tsx (~80行 - 新增)
    ├── CoverImageUpload.tsx   (已有)
    ├── StyleBomTab.tsx        (已有 - 12个Tab组件保持不变)
    └── ...
```

### 路由配置调整

```typescript
// frontend/src/utils/routeConfig.ts
{
  path: '/style-info',
  component: React.lazy(() => import('@/modules/basic/pages/StyleInfoList')),
  authority: 'style:list',
},
{
  path: '/style-info/new',
  component: React.lazy(() => import('@/modules/basic/pages/StyleInfo')),
  authority: 'style:add',
},
{
  path: '/style-info/:id',
  component: React.lazy(() => import('@/modules/basic/pages/StyleInfo')),
  authority: 'style:detail',
},
```

### 统计数据

| 指标 | 重构前 | 重构后 | 优化 |
|------|--------|--------|------|
| **主文件行数** | 2706行 | 350行(列表) + 600行(详情) | 分离职责 |
| **最大文件行数** | 2706行 | 600行 | ↓77.8% |
| **新增模块** | 0 | 10个 (4组件+2Hooks列表, 3组件+2Hooks详情) | +10 |
| **职责分离** | 列表+详情混合 | 列表与详情完全独立 | ✅ |
| **代码复用** | 12个Tab组件 | 保持12个Tab + 新增10个可复用模块 | ✅ |

---

## ✅ 实施顺序

### 优先级：先拆列表（影响小）

1. ✅ **Phase 1**: 创建 StyleInfoList（新建列表页）
   - 新建目录，不影响原文件
   - 复用 useStyleList、useStyleStats
   - 4个新组件 + 1个新Hook
   - 更新路由配置

2. ✅ **Phase 2**: 简化 StyleInfo（详情页专用）
   - 删除列表相关逻辑（500+行）
   - 提取基础信息表单到组件
   - 创建2个新Hooks
   - 保持12个Tab组件不变

3. ✅ **Phase 3**: 测试验证
   - 列表页：筛选、分页、视图切换、统计数据
   - 详情页：新建、编辑、Tab切换、保存、样衣完成
   - 路由跳转：列表→详情→列表

---

## 🚀 开始实施

**下一步**: 创建 `StyleInfoList/` 目录，先拆分列表页（影响范围小，可先验证）

**预计时间**: 
- Phase 1 (列表页): 2小时
- Phase 2 (详情页): 1.5小时
- Phase 3 (测试): 1小时
- **总计**: ~4.5小时

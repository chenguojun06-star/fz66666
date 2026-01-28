# UniversalCardView 通用卡片视图 - 应用总结

## ✅ 已完成工作

### 1. 创建通用组件
- **组件路径**：`frontend/src/components/common/UniversalCardView/index.tsx`
- **样式文件**：`frontend/src/components/common/UniversalCardView/style.css`
- **文档文件**：`frontend/src/components/common/UniversalCardView/README.md`

### 2. 核心功能
✅ 响应式布局（2/3/4/6列可配置）  
✅ 1:1正方形封面图  
✅ 可配置字段显示（自动2列分组）  
✅ 可选进度条（带success/warning/danger状态）  
✅ 统一操作菜单（Dropdown）  
✅ 悬浮动效  
✅ 加载状态  
✅ 卡片点击事件

### 3. 已应用页面

#### ✅ 样板生产（PatternProduction）
- **路径**：`frontend/src/modules/production/pages/Production/PatternProduction/index.tsx`
- **配置**：4列布局，显示进度条
- **字段**：数量、下板时间、领取人、交板时间
- **操作**：领取样板、更新进度、查看详情、附件管理、删除
- **特性**：带交期状态（成功/警告/危险）

#### ✅ 样衣管理（StyleInfo）
- **路径**：`frontend/src/modules/basic/pages/StyleInfo/index.tsx`
- **配置**：6列布局，不显示进度条
- **字段**：类别、季节、颜色、交期
- **操作**：查看详情、删除
- **特性**：卡片点击直接跳转详情页

#### ✅ 我的订单（ProductionList）
- **路径**：`frontend/src/modules/production/pages/Production/List/index.tsx`
- **配置**：4列布局，不显示进度条
- **字段**：工厂、颜色、数量、交期
- **操作**：查看详情、快速编辑、删除
- **特性**：支持批量导出、卡片点击查看详情

## 📊 对比

| 页面 | 列数 | 进度条 | 操作数量 | 特殊功能 |
|------|------|--------|----------|----------|
| 样板生产 | 4 | ✅ | 5 | 动态进度、状态颜色 |
| 样衣管理 | 6 | ❌ | 2 | 卡片点击跳转 |
| 我的订单 | 4 | ❌ | 3 | 批量导出 |

## 🎯 设计原则

1. **不包含单价流程**：进度条为可选配置，可通过 `progressConfig.show = false` 关闭
2. **统一操作入口**：所有操作使用 Dropdown "更多"按钮
3. **响应式适配**：移动端1列，平板2列，PC端按配置显示
4. **图片优先**：1:1封面图突出视觉效果
5. **简洁字段**：每行2个字段，保持信息密度

## 💡 使用指南

### 基础集成步骤

1. **导入组件**
```tsx
import UniversalCardView from '@/components/common/UniversalCardView';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
```

2. **添加状态**
```tsx
const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
```

3. **添加切换按钮**
```tsx
<Button
  icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
  onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
>
  {viewMode === 'list' ? '卡片视图' : '列表视图'}
</Button>
```

4. **条件渲染**
```tsx
{viewMode === 'list' ? (
  <ResizableTable ... />
) : (
  <UniversalCardView
    dataSource={data}
    titleField="主字段"
    fields={[...]}
    progressConfig={{ show: false }}  // 不需要进度条
  />
)}
```

## 📝 待集成页面（建议）

### 高优先级
- [ ] **物料采购**（MaterialPurchase）- 4列，无进度条（页面较复杂，有多个tab）
- [ ] **裁剪管理**（Cutting）- 4列，无进度条
- [ ] **质检入库**（ProductWarehousing）- 4列，无进度条
- [ ] **生产进度**（ProgressDetail）- 4列，无进度条

### 中优先级
- [ ] **数据中心**（DataCenter）- 6列，无进度条
- [ ] **订单流程**（OrderFlow）- 4列，无进度条

### 低优先级
- [ ] **工厂管理**（Factory）- 6列，无进度条
- [ ] **员工管理**（Employee）- 6列，无进度条

## 🔧 自定义配置示例

### 不显示进度条
```tsx
progressConfig={{ show: false }}
```

### 自定义字段渲染
```tsx
fields={[
  {
    label: '状态',
    key: 'status',
    render: (val) => val === 'COMPLETED' ? '已完成' : '进行中'
  },
  {
    label: '金额',
    key: 'amount',
    prefix: '¥',
    render: (val) => val.toFixed(2)
  },
]}
```

### 条件性操作按钮
```tsx
actions={(record) => [
  record.canEdit && {
    key: 'edit',
    label: '编辑',
    onClick: () => handleEdit(record),
  },
  {
    key: 'delete',
    label: '删除',
    danger: true,
    onClick: () => handleDelete(record),
  },
].filter(Boolean)}  // 过滤掉 false 值
```

## 🚀 性能优化

- ✅ 图片懒加载（CSS animation）
- ✅ 悬浮动效使用 transform（GPU加速）
- ✅ 响应式布局使用 Ant Design Grid
- ✅ 操作菜单按需渲染

## 📅 开发日志

- **2026-01-28 14:00**：创建通用组件
- **2026-01-28 14:30**：应用到样板生产页面（4列布局）
- **2026-01-28 15:00**：应用到样衣管理页面（6列布局）
- **2026-01-28 15:30**：应用到我的订单页面（4列布局）

## 🎨 设计规范

- **卡片间距**：16px
- **封面比例**：1:1正方形
- **字段标签**：13px, #8c8c8c, 600字重
- **字段值**：13px, #1f1f1f, 500字重
- **标题**：15px, #1f1f1f, 600字重
- **副标题**：13px, #8c8c8c
- **悬浮效果**：Y轴-2px + 阴影
- **进度条高度**：3px
- **进度条颜色**：
  - 成功：#52c41a
  - 警告：#faad14
  - 危险：#ff4d4f

---

**维护者**：GitHub Copilot  
**最后更新**：2026年1月28日

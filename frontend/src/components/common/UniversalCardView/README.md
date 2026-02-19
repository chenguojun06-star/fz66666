# UniversalCardView 通用卡片视图组件

## 📦 组件说明

通用卡片视图组件，从样板生产页面提取，可应用于全站各类列表页面。

## ✨ 特性

- ✅ 响应式布局（支持2/3/4/6列配置）
- ✅ 统一封面图展示（1:1正方形比例）
- ✅ 可配置字段显示
- ✅ 可选进度条（带状态颜色）
- ✅ 统一操作菜单
- ✅ 悬浮动效
- ✅ 加载状态
- ✅ 点击事件

## 📖 使用示例

### 基础用法

```tsx
import UniversalCardView from '@/components/common/UniversalCardView';

<UniversalCardView
  dataSource={records}
  titleField="styleNo"
  fields={[
    { label: '颜色', key: 'color' },
    { label: '数量', key: 'quantity', suffix: ' 件' },
  ]}
/>
```

### 完整配置（样板生产）

```tsx
<UniversalCardView
  dataSource={dataSource}
  loading={loading}
  columns={4}  // PC端显示4列
  coverField="coverImage"
  titleField="styleNo"
  subtitleField="color"
  fields={[
    { label: '数量', key: 'quantity', suffix: ' 件' },
    { label: '下板', key: 'releaseTime' },
    { label: '领取人', key: 'receiver' },
    { label: '交板', key: 'deliveryTime' },
  ]}
  progressConfig={{
    calculate: (record) => calculateProgress(record.progressNodes),
    getStatus: (record) => getDeliveryStatus(record.deliveryTime),
    show: true,
  }}
  actions={(record) => [
    {
      key: 'view',
      icon: <EyeOutlined />,
      label: '查看详情',
      onClick: () => handleView(record),
    },
    {
      key: 'divider1',
      type: 'divider',
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      onClick: () => handleDelete(record),
      danger: true,
    },
  ].filter(Boolean)}
  onCardClick={(record) => console.log('卡片点击', record)}
/>
```

### 样衣管理示例

```tsx
<UniversalCardView
  dataSource={styleList}
  columns={6}  // 6列显示
  coverField="cover"
  titleField="styleNo"
  subtitleField="styleName"
  fields={[
    { label: '类别', key: 'category' },
    { label: '季节', key: 'season' },
    { label: '颜色', key: 'color' },
    { label: '交期', key: 'deliveryDate' },
  ]}
  actions={(record) => [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '编辑',
      onClick: () => handleEdit(record),
    },
    {
      key: 'view',
      icon: <EyeOutlined />,
      label: '查看详情',
      onClick: () => handleView(record),
    },
  ]}
/>
```

### 不显示进度条

```tsx
<UniversalCardView
  dataSource={records}
  titleField="orderNo"
  fields={[
    { label: '工厂', key: 'factoryName' },
    { label: '数量', key: 'quantity', suffix: ' 件' },
  ]}
  progressConfig={{ show: false }}  // 隐藏进度条
/>
```

## 🔧 API

### Props

| 参数 | 说明 | 类型 | 默认值 | 必填 |
|------|------|------|--------|------|
| dataSource | 数据源 | `any[]` | - | ✅ |
| titleField | 标题字段名 | `string` | - | ✅ |
| fields | 显示字段配置 | `CardField[]` | - | ✅ |
| loading | 加载状态 | `boolean` | `false` | - |
| columns | PC端列数 | `2 \| 3 \| 4 \| 6` | `4` | - |
| coverField | 封面图字段名 | `string` | `'coverImage'` | - |
| subtitleField | 副标题字段名 | `string` | - | - |
| progressConfig | 进度条配置 | `CardProgressConfig` | - | - |
| actions | 操作按钮配置 | `(record) => CardAction[]` | - | - |
| coverPlaceholder | 封面占位文字 | `string` | `'暂无图片'` | - |
| onCardClick | 卡片点击事件 | `(record) => void` | - | - |

### CardField

| 参数 | 说明 | 类型 | 必填 |
|------|------|------|------|
| label | 字段标签 | `string` | ✅ |
| key | 字段键名 | `string` | ✅ |
| suffix | 后缀 | `string` | - |
| prefix | 前缀 | `string` | - |
| render | 自定义渲染 | `(value, record) => ReactNode` | - |

### CardProgressConfig

| 参数 | 说明 | 类型 | 默认值 |
|------|------|------|--------|
| calculate | 计算进度 | `(record) => number` | - |
| getStatus | 获取状态 | `(record) => 'success' \| 'warning' \| 'danger'` | - |
| show | 是否显示 | `boolean` | `true` |

### CardAction

| 参数 | 说明 | 类型 |
|------|------|------|
| key | 唯一标识 | `string` |
| icon | 图标 | `ReactNode` |
| label | 标签 | `ReactNode \| string` |
| onClick | 点击事件 | `(record) => void` |
| danger | 危险样式 | `boolean` |
| type | 类型（分隔线用 `'divider'`） | `'divider'` |

## 🎨 响应式布局

| columns | xs (手机) | sm (平板) | md (小屏) | lg (大屏) |
|---------|-----------|-----------|-----------|-----------|
| 6 | 1列 | 2列 | 3列 | 6列 |
| 4 | 1列 | 2列 | 4列 | 4列 |
| 3 | 1列 | 2列 | 3列 | 3列 |
| 2 | 1列 | 2列 | 2列 | 2列 |

## 💡 最佳实践

1. **字段分组**：每行自动显示2个字段，保持简洁
2. **进度条**：仅在需要展示完成度时使用
3. **操作按钮**：使用 Dropdown 统一操作入口
4. **封面图**：建议使用1:1正方形图片
5. **响应式**：根据数据密度选择合适的列数

## 🚀 已应用页面

- [x] 样板生产（PatternProduction）- 4列布局
- [ ] 样衣管理（StyleInfo）- 待集成
- [ ] 裁剪单（Cutting）- 待集成
- [ ] 成品入库（ProductWarehousing）- 待集成

## 📝 注意事项

1. 数据源中每条记录必须有唯一的 `id` 字段
2. `actions` 返回数组时使用 `.filter(Boolean)` 过滤条件性操作
3. 进度条宽度最小10%，确保文字可见
4. 封面图加载有渐显动画效果

## 🔗 相关组件

- `ResizableModal` - 配套使用的弹窗组件
- `StyleAttachmentsButton` - 附件管理按钮
- `StyleCoverThumb` - 款式封面缩略图

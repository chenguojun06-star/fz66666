# 小程序设计规范

## 📐 设计原则
- **统一性**：所有页面使用相同的颜色、圆角、间距
- **简洁性**：减少视觉干扰，突出重要信息
- **一致性**：相同功能使用相同样式

---

## 🎨 颜色系统

### 主色调
- **紫色渐变**：`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
  - 用于：重要卡片、强调按钮、品牌元素
  - 示例：用户信息卡片、主要操作按钮

### 辅助色
- **蓝色系**
  - 主蓝色：`#3b82f6` - 标签、图标
  - 浅蓝色：`rgba(224, 242, 254, 0.8)` - 激活状态、高亮
  - 超浅蓝：`rgba(224, 242, 254, 0.3)` - 悬停状态

### 功能色
- **成功**：`#10b981` - 绿色
- **警告**：`#f59e0b` - 橙色
- **错误**：`#ef4444` - 红色
- **信息**：`#3b82f6` - 蓝色

### 中性色
- **背景色**
  - 页面背景：`#f7f8fa`
  - 卡片背景：`#ffffff`
  - 灰色背景：`#f3f4f6`
  
- **文字色**
  - 主要文字：`#111827`
  - 次要文字：`#6b7280`
  - 禁用文字：`#9ca3af`

- **边框色**
  - 标准边框：`#e5e7eb`

---

## 🔲 圆角系统

### 标准圆角值
- **8px** - 小标签、小按钮
- **12px** - 普通卡片、输入框、小组件
- **16px** - 大卡片、重要容器
- **18px** - 主容器、页面卡片
- **999px** - 按钮、搜索框、标签（全圆角）

### 使用场景
| 元素 | 圆角值 | 示例 |
|------|--------|------|
| 页面主卡片 | 18px | `.card` |
| 用户信息卡片 | 16px | `.user-profile-card` |
| 列表项、统计卡片 | 12px | `.stat-card`, `.list-item` |
| 标签、角标 | 12px | `.profile-role` |
| 按钮、搜索框 | 999px | `.btn`, `.search-bar` |
| 标签页 | 999px | `.tab` |

---

## 📏 间距系统

### 标准间距值
- **4px** - 最小间距（元素内小间距）
- **8px** - 小间距（相关元素之间）
- **12px** - 中间距（卡片内边距、元素组之间）
- **16px** - 大间距（卡片外边距、区块之间）
- **20px-24px** - 特大间距（页面区域分隔）

---

## ✨ 阴影系统

### 标准阴影
- **小阴影**：`0 1px 3px rgba(0, 0, 0, 0.05)` - 微妙层次
- **中阴影**：`0 2px 6px rgba(0, 0, 0, 0.05)` - 卡片
- **大阴影**：`0 4px 12px rgba(0, 0, 0, 0.08)` - 浮层
- **品牌阴影**：`0 4px 12px rgba(102, 126, 234, 0.25)` - 紫色卡片

---

## 📝 字体系统

### 字号规范
- **11px** - 辅助信息（在线人数、时间戳）
- **12px** - 小文字（标签、描述文字）
- **14px** - 正文（列表项内容、普通文字）
- **16px** - 二级标题（区块标题）
- **18px** - 一级标题（页面标题）
- **20px** - 数值强调（统计数字）

### 字重规范
- **400 (normal)** - 普通文字
- **500 (medium)** - 次要强调
- **600 (semibold)** - 标题、重要文字
- **700 (bold)** - 数值、超级强调

---

## 🎯 组件规范

### 1. 卡片组件
```css
.card {
  background: #ffffff;
  border-radius: 18px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
```

### 2. 用户信息卡片（紫色渐变）
```css
.user-profile-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.25);
}
```

### 3. 统计卡片（4列网格）
```css
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
```

### 4. 按钮
```css
.btn-primary {
  padding: 10px 18px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #ffffff;
  border-radius: 999px;
  font-weight: 600;
}

.btn-secondary {
  padding: 10px 18px;
  background: rgba(224, 242, 254, 0.8);
  color: #1f2937;
  border-radius: 999px;
  border: 1px solid rgba(224, 242, 254, 0.9);
}
```

### 5. 标签页
```css
.tabbar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  padding: 4px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
}

.tab {
  padding: 5px 6px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  text-align: center;
}

.tab-active {
  background: rgba(224, 242, 254, 0.8);
  color: #1f2937;
  font-weight: 600;
}
```

---

## ✅ 统一修改清单

### 需要统一的地方：

1. **所有主卡片** → `border-radius: 18px`
2. **所有小卡片/列表项** → `border-radius: 12px`
3. **所有按钮** → `border-radius: 999px`
4. **所有标签** → `border-radius: 12px` 或 `999px`
5. **紫色渐变** → 统一使用 `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
6. **激活状态** → 统一使用 `rgba(224, 242, 254, 0.8)`
7. **页面背景** → 统一使用 `#f7f8fa`
8. **卡片阴影** → 统一使用 `0 2px 6px rgba(0, 0, 0, 0.05)`

---

## 🎨 当前状态

### ✅ 已统一的页面
- **个人页面** (`admin/index`)
  - ✅ 紫色渐变用户卡片
  - ✅ 4列统计网格
  - ✅ 统一圆角和间距

### 🔄 待统一的页面
- **首页** (`home/index`)
- **生产页** (`work/index`)
- **扫码页** (`scan/index`)

---

## 💡 实施建议

1. **优先级1**：统一所有卡片圆角（18px主卡片、12px小卡片）
2. **优先级2**：统一紫色渐变的使用（重要卡片）
3. **优先级3**：统一按钮和标签的圆角（999px）
4. **优先级4**：统一颜色值（替换零散的颜色）

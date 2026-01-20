# 字体规范文档

## 统一字体标准

本项目采用分级字体系统，确保全站UI一致性和可读性。

### 字体层级规范

| 层级 | 字号 | 用途 | 类名示例 |
|-----|------|-----|---------|
| **一级标题** | 18px | 页面主标题、重要图标 | `.title`, `.tip-icon` |
| **二级标题** | 16px | 区块标题、卡片标题 | `.section-title`, `.reminder-panel-title` |
| **三级标题** | 14px | 小标题、列表项标题 | `.sub-title`, `.home-section-title` |
| **正文** | 14px | 普通正文、表单输入、按钮 | `.input`, `.btn-primary`, `.result` |
| **辅助文字** | 12px | 标签、次要信息 | `.label`, `.tab`, `.my-stat-label` |
| **备注** | 11px | 提示、说明文字 | `.hint`, `.tag` |
| **极小** | 10px | 徽章、状态标记 | `.reminder-badge` |

### 菜单系统

- **菜单文字**: 13px (介于辅助和正文之间)
  - 用于导航、开关标签等
  - 示例：`.switch-label`, `.tip-text`

### 全局基础设置

```css
/* app.wxss */
page {
  font-size: 14px;       /* 全局基础字体 */
  line-height: 1.5;      /* 行高 */
}
```

## 已统一页面清单

### ✅ 全局样式 (app.wxss)
- [x] page 基础字体: 12px → 14px
- [x] .title: 16px (二级标题)
- [x] .section-title: 14px (三级标题)
- [x] .sub-title: 14px (新增)
- [x] .label: 12px (辅助)
- [x] .input: 14px (正文)
- [x] .btn-primary: 14px (按钮)
- [x] .btn-secondary: 14px (按钮)
- [x] .hint: 11px (备注)
- [x] .result: 14px (正文)
- [x] .tag: 11px (标签)

### ✅ 扫码页面 (scan/index.wxss)
- [x] .switch-label: 13px (菜单)
- [x] .tip-icon: 18px (图标)
- [x] .tip-text: 13px (菜单)
- [x] .tab: 12px (辅助)
- [x] .df-add: 18px (图标)
- [x] .st-num: 16px (二级标题/数值强调)
- [x] .qm-picker-arrow: 18px (图标)

### ✅ 主页 (home/index.wxss)
- [x] .reminder-badge: 10px (极小)
- [x] .reminder-panel-title: 16px (二级标题)
- [x] .reminder-panel-close: 18px (图标)
- [x] .reminder-empty: 14px (正文)
- [x] .title: 16px (二级标题)

### ✅ 工作台 (work/index.wxss)
- [x] .btn-primary: 14px (按钮)
- [x] .tab: 12px (辅助)
- [x] .home-section-title: 14px (三级标题)
- [x] .home-stat-value: 14px (正文)
- [x] .home-stat-label: 12px (辅助)

### ✅ 管理页面 (admin/index.wxss)
- [x] .btn-primary: 14px (按钮)
- [x] .btn-secondary: 14px (按钮)
- [x] .section-title: 14px (三级标题)
- [x] .my-stat-value: 14px (正文)
- [x] .my-stat-label: 12px (辅助)
- [x] .item-title: 14px (正文)
- [x] .item-sub: 12px (辅助)
- [x] .salary-label: 12px (辅助)
- [x] .salary-value: 14px (正文)
- [x] .hint: 11px (备注)

### ✅ 登录页面 (login/index.wxss)
- [x] .btn-primary: 14px (按钮)

## 字体使用原则

### 1. 标题层级
- **18px**: 页面最重要的信息，通常每屏只有1-2处
- **16px**: 区块级标题，划分主要内容区
- **14px**: 小节标题，列表项标题

### 2. 正文内容
- **14px**: 所有可读正文、表单输入、按钮文字
- 确保足够的可读性和点击舒适度

### 3. 辅助信息
- **12px**: 标签、说明文字、次要信息
- **11px**: 补充说明、系统提示
- **10px**: 徽章、状态标记（最小字号）

### 4. 交互元素
- **按钮**: 统一 14px
- **菜单/导航**: 统一 13px
- **标签页**: 统一 12px

## 字重规范

```css
font-weight: 400;  /* 普通 - 辅助文字 */
font-weight: 500;  /* 中等 - 菜单、标签 */
font-weight: 600;  /* 加粗 - 标题、数值 */
```

## 行高规范

```css
line-height: 1.4;  /* 紧凑场景 */
line-height: 1.5;  /* 常规场景（推荐） */
line-height: 1.6;  /* 段落正文 */
```

## 维护指南

### 添加新样式时
1. 优先使用已定义的字体大小
2. 确认使用场景符合层级定义
3. 添加注释说明字体用途

### 修改现有样式时
1. 检查是否影响全局一致性
2. 同步更新相关文档
3. 测试不同设备和分辨率

### 禁止事项
❌ 不要随意使用非标准字号  
❌ 不要在行内样式中硬编码字体大小  
❌ 不要使用小于10px的字体（可访问性）  

## 验证清单

在提交代码前，确认：
- [ ] 所有新增字体大小都符合规范
- [ ] 没有使用非标准字号（除10/11/12/13/14/16/18px外）
- [ ] 添加了必要的注释说明
- [ ] 在真机上测试了可读性

---

**最后更新**: 2026-01-20  
**版本**: v1.0  
**维护者**: 开发团队

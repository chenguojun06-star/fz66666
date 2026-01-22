# 手机端主题字体显示问题修复

## 问题描述
蓝色主题与默认主题在手机端（特别是在导航菜单区域）出现字体不显示或显示不清的问题。

## 根本原因
1. **重复颜色定义**：CSS中存在多个相同选择器的颜色定义，后面的定义会覆盖前面的定义
   ```css
   color: var(--sidebar-text);
   color: var(--sidebar-text, #333333);  // 这个会覆盖前面的
   ```

2. **不恰当的 `-webkit-text-fill-color` 使用**：在主题样式中使用了 `-webkit-text-fill-color` 强制覆盖字体颜色，导致CSS变量无法正确继承和应用
   ```css
   color: var(--sidebar-text);
   -webkit-text-fill-color: var(--primary-color);  // 会覆盖color属性
   ```

3. **移动端样式继承问题**：移动端的导航Drawer组件没有正确继承主题颜色变量

## 修复方案

### 1. 删除 `-webkit-text-fill-color: inherit`（Layout/styles.css）
**前**：
```css
.layout-sidebar,
.layout-sidebar * {
  -webkit-text-fill-color: inherit;
}
```

**后**：
```css
.layout-sidebar,
.layout-sidebar * {
  -webkit-text-fill-color: unset;
}
```

### 2. 移除重复的颜色定义和强制覆盖
修改了以下样式规则，删除了重复定义和 `-webkit-text-fill-color` 强制覆盖：

#### Layout/styles.css 中的修改
- `.sidebar-tools .ant-btn`
- `.nav-section-title`
- `.nav-icon`
- `.nav-section-arrow`
- `.nav-link`

#### global.css 中的修改
- `:root[data-theme="white"]` 下的导航相关样式
  - 删除了 `-webkit-text-fill-color` 强制覆盖
  - 保留单一的 `color` 定义

### 3. 添加移动端样式修复（Layout/styles.css）
在 `@media (max-width: 768px)` 中添加了移动端导航菜单的颜色定义：
```css
/* 移动端导航菜单文本颜色修复 */
.mobile-nav-drawer .nav-section-title,
.mobile-nav-drawer .nav-link {
  color: var(--sidebar-text);
}

.mobile-nav-drawer .nav-link:hover,
.mobile-nav-drawer .nav-link:hover .nav-icon {
  color: var(--sidebar-text-strong);
}

.mobile-nav-drawer .nav-item.active .nav-link,
.mobile-nav-drawer .nav-item.active .nav-icon {
  color: var(--sidebar-text-strong);
}
```

## 修改文件清单
1. `/frontend/src/components/Layout/styles.css`
2. `/frontend/src/styles/global.css`

## 测试建议
1. **清除浏览器缓存**：确保加载最新的CSS文件
2. **测试所有主题**：在蓝色主题和白色主题下测试导航菜单的字体显示
3. **移动设备测试**：在实际手机设备上测试（iOS Safari、Android Chrome）
4. **响应式测试**：测试不同的屏幕尺寸（iPhone、iPad等）

## 预期效果
- ✅ 导航菜单文字在所有主题下清晰可见
- ✅ 鼠标hover和active状态下的颜色正确应用
- ✅ 移动端导航Drawer中的文字显示正常
- ✅ 主题切换时，所有文字颜色平顺过渡

## 相关主题变量
```css
/* 蓝色主题 */
--sidebar-text: rgba(255, 255, 255, 0.92);
--sidebar-text-strong: #ffffff;
--sidebar-text-muted: rgba(255, 255, 255, 0.75);

/* 白色主题 */
--sidebar-text: #1f1f1f;
--sidebar-text-strong: #000000;
--sidebar-text-muted: rgba(31, 31, 31, 0.65);
```

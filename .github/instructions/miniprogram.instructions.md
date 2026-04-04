---
applyTo: "miniprogram/**"
---

# 小程序开发域指令（miniprogram/**）

> 微信原生框架，纯 JavaScript（无 TypeScript），本文件仅在编辑 `miniprogram/` 下文件时激活。

---

## 三种扫码模式（自动识别）

| 模式 | 触发条件 | 包含信息 |
|------|---------|---------|
| **BUNDLE** | 菲号扫码（推荐） | 订单 + 颜色 + 尺码 + 数量 |
| **ORDER** | 订单扫码 | 仅订单号，需手动选工序 |
| **SKU** | SKU 扫码 | 款式 + 颜色 + 尺码 |

核心实现：`pages/scan/handlers/ScanHandler.js`

---

## 防重复提交算法（禁止随意修改时间间隔）

```javascript
// 最小间隔 = max(30s, 菲号数量 × 工序分钟 × 60 × 0.5)
const expectedTime = bundleQuantity * processMinutes * 60;
const minInterval = Math.max(30, expectedTime * 0.5);
```

实现位置：`pages/scan/services/StageDetector.js#L610`

---

## 共享样式库（styles/ 目录）

| 文件 | 职责 | 引用方式 |
|------|------|----------|
| `design-tokens.wxss` | CSS 变量定义 | 全局已在 `app.wxss` 引入，无需重复 |
| `modal-form.wxss` | 弹窗表单 `mf-*` | `@import '/styles/modal-form.wxss';` |
| `page-utils.wxss` | 加载更多 / Tag 标签 | `@import '/styles/page-utils.wxss';` |

### app.wxss 全局样式（自动生效，无需 @import）

- 空状态：`.empty-state`、`.empty-icon`、`.empty-img`、`.empty-text`、`.empty-hint`
- 卡片空状态：`.empty-state-card`
- 筛选区域：`.filter-section`
- 搜索行：`.search-row`、`.search-box`、`.search-icon`、`.search-input`、`.search-btn`

**❌ 禁止**：在页面 wxss 中重复定义 `.empty-state`、`.search-row` 等全局已有类。
**✅ 允许**：局部覆盖差异，如 `.my-card .empty-state { padding: 40rpx 0; }`。

---

## page-utils.wxss 类速查

- **加载更多**：`.load-more` / `.load-more.disabled` / `.no-more` / `.loading-more`
- **Tag 标签**：`.tag` + `.tag-blue` / `.tag-gray` / `.tag-green` / `.tag-orange` / `.tag-red` / `.tag-muted`

---

## 入库扫码强制选仓库

```javascript
if (currentScanType === 'warehouse' && !this.data.warehouse) {
    wx.showToast({ title: '请先选择目标仓库', icon: 'none' });
    return;
}
```

---

## 跨端验证规则同步

修改 `miniprogram/utils/validationRules.js` 时，**必须同步更新** `frontend/src/utils/validationRules.ts`。

---

## 正式版 API 地址安全

- 正式版（`envVersion === 'release'`）强制使用云端地址。
- 开发/体验版保持内网 IP，方便本地调试。
- 实现位置：`config.js` — `getBaseUrl()`。

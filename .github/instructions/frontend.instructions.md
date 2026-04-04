---
applyTo: "frontend/**"
---

# 前端开发域指令（frontend/**）

> 本文件仅在编辑 `frontend/` 目录下文件时自动激活。

---

## 强制使用标准组件库

| 组件 | 用途 | 禁止替代 |
|------|------|----------|
| `ResizableTable` | 所有列表表格（支持列宽拖拽，兼容 antd `TableProps`） | ❌ antd `Table` |
| `ResizableModal` | 弹窗 | ❌ antd `Modal` |
| `RowActions` | 表格行操作 | ❌ 手写按钮组 |
| `ModalContentLayout` + `ModalFieldRow` | 弹窗表单布局 | ❌ 手写布局 |
| `ModalHeaderCard` | 弹窗头部卡片（#f8f9fa） | — |

---

## 弹窗三级尺寸（禁止自定义）

```tsx
// 大：复杂表单 / 多 Tab（必须传 initialHeight）
<ResizableModal width="60vw" initialHeight={Math.round(window.innerHeight * 0.82)}>

// 中：普通表单（默认高度即可）
<ResizableModal width="40vw">

// 小：确认对话框
<ResizableModal width="30vw">
```

- ❌ `width="55vw"` — 不存在此档位
- ❌ `defaultWidth` / `defaultHeight` — 这两个 prop 不存在

---

## RowActions 规则

- 最多 **1 个**行内按钮（`primary: true`），其余自动折叠到"更多"。
- `key: 'log'` 或 `label: '日志'` 自动折叠。
- 操作列宽度：`60`（紧凑）/ `120`（单按钮）/ `160`（双按钮）。

---

## 颜色系统

```tsx
// ✅ 使用 CSS 变量
<div style={{ color: 'var(--primary-color)' }} />

// ✅ 特例：业务风险色可硬编码
const RiskColorMap = {
  critical: '#ff4136',   // 红 — 逾期/关键风险
  warning:  '#f7a600',   // 橙 — 预警/中等风险
  safe:     '#39ff14',   // 绿 — 安全/低风险
};

// ❌ 其他场景禁止硬编码
<div style={{ color: '#2D7FF9' }} />
```

---

## 文件大小限制

| 类型 | 绿色 | 黄色 | 红色禁止 | 拆分策略 |
|------|------|------|----------|----------|
| React 组件 | ≤ 200 | 201-300 | > 300 | 拆子组件 |
| React 页面 | ≤ 400 | 401-500 | > 500 | 拆 Tab + Hook |
| 自定义 Hook | ≤ 80 | 81-150 | > 150 | 按数据域拆分 |

单函数/方法体 **≤ 40 行**，超出先拆分。

---

## 状态管理（Zustand）

- 全局跨组件共享状态 → `stores/` 下的 Zustand store。
- 组件内局部状态 → `useState`。
- **按领域拆分** store，禁止单 store 塞所有状态。
- 仅对必要状态使用 `persist` 中间件（如登录信息）。
- 必须附带完整 TypeScript 接口定义。

---

## Hooks 最佳实践

- 数据逻辑超 30 行 → 抽取 `useXxx.ts`，组件文件只保留 JSX。
- 用 `useRef` + `useEffect` 避免依赖链导致重复请求。
- 用 `useCallback`（空依赖 + ref）缓存异步函数。
- 支持 `silent` 模式（后台轮询不显示 loading）。

---

## API 调用约定

- 新接口必须在 `services/` 对应文件添加 TS 类型定义。
- 统一使用 `POST /list`（列表查询），**禁止**使用旧 `GET/POST /page` 端点。
- 58 个废弃 API 已标记 `@Deprecated`（计划 2026-05-01 删除），新代码禁止引用。

---

## 跨端验证规则同步

修改 `frontend/src/utils/validationRules.ts` 时，**必须同步更新** `miniprogram/utils/validationRules.js`。

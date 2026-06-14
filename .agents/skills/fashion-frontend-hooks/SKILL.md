---
name: fashion-frontend-hooks
description: 服装供应链系统前端 React Hook 与组件开发铁律。当编写或修改自定义 Hook、React 组件、useEffect/useMemo/useCallback、状态管理时必须遵循。违反会导致无限循环或渲染异常。
version: 1.0.0
---

# 前端 Hook 与组件规范

> 本 skill 浓缩自 OPT-20260524（Hook 返回值不稳定性无限循环系统性修复）+ 前端强制规范。改任何前端代码前必须遵守。

## 1. Hook 返回值必须稳定（P0#9）

> **OPT-20260524：Hook 返回裸对象/裸函数导致无限循环**

```typescript
// ❌ 禁止：每次渲染返回新对象/函数 → 依赖方 useEffect 无限重渲染
function useOrderData(orderId: string) {
  const [data, setData] = useState(null);
  return {
    data,
    refresh: () => fetchData(orderId),  // 每次渲染新函数
    isLoading: !data,                   // 每次渲染新对象
  };
}

// ✅ 正确：返回对象用 useMemo 包裹，返回函数用 useCallback 包裹
function useOrderData(orderId: string) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchData(orderId).then(setData).finally(() => setLoading(false));
  }, [orderId]);

  const isLoading = !data;

  return useMemo(() => ({
    data,
    refresh,
    isLoading,
  }), [data, refresh, isLoading]);
}
```

**铁律**：
- ✅ Hook 返回对象必须用 `useMemo` 包裹
- ✅ Hook 返回函数必须用 `useCallback` 包裹
- ❌ 禁止 useEffect 依赖裸函数/裸对象

## 2. mount-only useEffect 必须加 ref 守卫

```typescript
// ❌ 禁止：React StrictMode 下 useEffect 执行两次
useEffect(() => {
  fetchData();
}, []);  // StrictMode 下会执行两次

// ✅ 正确：ref 守卫确保只执行一次
const mountedRef = useRef(false);
useEffect(() => {
  if (mountedRef.current) return;
  mountedRef.current = true;
  fetchData();
}, []);
```

## 3. 代码薄原则（强制上限）

| 类型 | 上限 | 红线 | 超出后 |
|------|------|------|--------|
| React 页面 index.tsx | ≤300行 | >400行 | 必须拆组件/Hook |
| React 组件 | ≤150行 | >200行 | 必须拆子组件 |
| 自定义 Hook | ≤60行 | >80行 | 必须拆分逻辑 |
| 单函数体 | ≤25行 | >40行 | 必须提取子函数 |

**拆分策略**：
- 页面 → 拆出 `useXxxActions`（事件处理 Hook）+ `useXxxColumns`（列定义 Hook）+ 子组件
- 组件 → 拆出 `XxxPanel` / `XxxForm` / `XxxSummary` 子组件
- Hook → 拆出 `useXxxData`（数据获取）+ `useXxxActions`（操作逻辑）

## 4. 强制组件

### 必须用

| 组件 | 用途 | 说明 |
|------|------|------|
| `ResizableTable` | 表格展示 | **禁用 antd `Table`** |
| `RowActions` | 操作列 | 最多 1 个主按钮 |
| `ResizableModal` | 弹窗 | 60/40/30vw 三种尺寸 |
| `ModalContentLayout` + `ModalFieldRow` | 表单布局 | **禁用自定义表单布局** |
| `ModalHeaderCard` | 弹窗头部 | **禁用自定义头部样式** |

### 弹窗尺寸

| 尺寸 | 宽度 | 场景 | 高度规则 |
|------|------|------|---------|
| sm | 30vw | 确认对话框 | 默认 |
| md | 40vw | 普通表单 | 默认 |
| lg | 60vw | 复杂表单/多Tab | **必须传 `initialHeight={Math.round(window.innerHeight * 0.82)}`** |

## 5. 确认弹窗带输入框必须用 RejectReasonModal

```typescript
// ❌ 禁止：modal.confirm + TextArea 会导致按钮被遮挡
Modal.confirm({
  content: <TextArea />,
});

// ✅ 正确：使用 RejectReasonModal
<RejectReasonModal
  open={open}
  onConfirm={handleConfirm}
  onCancel={handleCancel}
/>
```

## 6. CSS 变量颜色

```css
/* ❌ 禁止：硬编码颜色值 */
.card { background: #1890ff; color: #ffffff; }

/* ✅ 正确：使用 CSS 变量 */
.card {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}
```

**例外**：业务风险色（红色警告、绿色通过）可硬编码，但推荐使用语义化变量。

## 7. 间距 8 的倍数

```css
/* ✅ 正确：间距为 8 的倍数 */
.margin { margin: 8px 16px 24px; }
.padding { padding: 8px; }

/* ❌ 禁止：非 8 倍数间距 */
.margin { margin: 5px 13px; }
```

## 8. 全局表格样式禁止擅自修改

- ❌ 禁止未经用户明确要求修改 `global.css` / `design-system.css` 中的表格 CSS 变量
- ✅ 仅在用户明确说"表格行高太高/太低"等指令时才可修改

## 9. WebSocket 仅页面级（P0）

> **D-017：永久禁止加回 WebSocket 全局广播**

```typescript
// ❌ 禁止：全局/根级 WebSocket 通知组件
// App.tsx 或全局 Provider 中使用 WebSocket
function App() {
  useWebSocket('ws://...');  // 禁止
}

// ✅ 正确：仅页面级 WebSocket
function ProductionPage() {
  const ws = usePageWebSocket('ws://...');
  // 页面卸载时自动断开
}
```

**铁律**：
- 全局广播对业务无实际价值，干扰用户
- 业务通知走操作结果返回本地提示，不走广播
- 禁止在任何新代码中引入 WebSocket 全局广播

## 10. 改前端代码前自检清单

- [ ] Hook 返回值是否用 `useMemo`/`useCallback` 包裹？（裸对象/裸函数 → 无限循环）
- [ ] mount-only useEffect 是否加了 ref 守卫？
- [ ] 文件行数是否超限？（页面 300/组件 150/Hook 60）
- [ ] 是否用了强制组件？（ResizableTable/RowActions/ResizableModal/ModalContentLayout）
- [ ] 弹窗带输入框是否用了 RejectReasonModal？（modal.confirm + TextArea 会遮挡按钮）
- [ ] 颜色是否用 CSS 变量？（禁止硬编码）
- [ ] 间距是否为 8 的倍数？
- [ ] 是否引入了全局 WebSocket？（禁止，仅页面级）
- [ ] 是否修改了全局表格样式？（禁止，除非用户明确要求）
- [ ] 改完后是否跑 `npx tsc --noEmit`？（0 errors）

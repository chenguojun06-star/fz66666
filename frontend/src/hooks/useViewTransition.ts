/**
 * useViewTransition.ts
 * ─────────────────────────────────────────────────────────────────────────
 * 封装 View Transitions API（Chrome 111+ 原生页面过渡动效）。
 * 在不支持的环境中优雅降级，直接执行 callback，无副作用。
 *
 * 使用场景：
 *   - Tab 切换、路由跳转前包裹 setState/navigate 调用
 *   - 列表刷新、搜索提交等"状态切换"动作
 *
 * 示例：
 *   const { withViewTransition } = useViewTransition();
 *   const handleTabChange = (key: string) => {
 *     withViewTransition(() => setActiveTab(key));
 *   };
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * 用 View Transition 包裹任意状态更新函数。
 * 支持浏览器：原生执行动画过渡；不支持：直接执行 fn，无任何 overhead。
 */
export const withViewTransition = (fn: () => void): void => {
  if (typeof document !== 'undefined' && 'startViewTransition' in document) {
    (document as Document & { startViewTransition(cb: () => void): void })
      .startViewTransition(fn);
  } else {
    fn();
  }
};

/**
 * React Hook：返回 withViewTransition 包装函数。
 * 适合在函数组件内使用，保持 API 风格一致。
 */
export const useViewTransition = () => {
  return { withViewTransition } as const;
};

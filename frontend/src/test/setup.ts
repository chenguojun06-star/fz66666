/**
 * 全局测试清理（D-702）
 *
 * <p><b>为什么需要</b>：本仓库 vitest 未开 `globals: true`，而
 * `@testing-library/react` 的自动清理依赖全局 `afterEach` 可用 —— 结果是
 * **不会自动注册清理**。当前 35 个测试文件里：
 * <ul>
 *   <li>2 个文件（BrandLoader / RowActions）已显式写 `afterEach(cleanup)`；</li>
 *   <li>其余用 render 的文件靠「每个用例都 unmount」或「不依赖 DOM 查询」侥幸没出问题。</li>
 * </ul>
 * 也就是说：一旦有人写 `screen.getByRole(...)`，DOM 跨用例累积会直接报
 * 「found multiple elements」——是个**随时会炸的雷**，而不是已爆的雷。
 *
 * <p><b>本文件做两件事</b>：
 * <ol>
 *   <li>显式注册全局 `afterEach(cleanup)`，从根上消除累积；</li>
 *   <li>加 <code>console.error</code> 断言守卫 —— React 的
 *       「not wrapped in act(...)」「key 重复」「 uncontrolled → controlled」
 *       等警告目前只是打印、不让测试失败，容易被无视。这里让它变成红灯。</li>
 * </ol>
 *
 * <p>两者都可按需关闭（见文件末尾的说明），不必为个别用例特殊处理。
 */
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom 不实现 ResizeObserver，而 antd 的 Table / Scrollbar / AutoSize 都会
 * `new ResizeObserver(...)`，缺失时直接抛 `ResizeObserver is not defined`，
 * 让用例在渲染阶段就崩掉（看不到任何断言失败信息）。
 *
 * 这里补一个最小空实现：只做「构造得出来、observe 得进去」，
 * 不模拟尺寸变化 —— 布局尺寸相关的断言仍应交给浏览器 E2E，而不是在这里假装能测。
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

/**
 * 同理：jsdom 不实现 `window.matchMedia`，而 antd 的响应式栅格 / Tooltip /
 * 折叠面板都会调用它。补一个恒定「不匹配」的最小实现，
 * 固定按窄屏渲染 —— 需要验证宽屏布局时请走浏览器 E2E。
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
});

/**
 * 是否把 React 警告升级为测试失败。
 *
 * 默认 false —— 先只记录，避免一次性把存量警告全部引爆。
 * 想开启时把下面改为 true，或用环境变量：
 *   STRICT_REACT_WARNINGS=1 npx vitest run
 */
const STRICT = process.env.STRICT_REACT_WARNINGS === '1';

beforeEach(() => {
  if (!STRICT) return;
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (/not wrapped in act|Warning:.*key|uncontrolled|validateDOMNesting/.test(msg)) {
      throw new Error(`[strict] React 警告被升级为错误：${msg}`);
    }
    // 其余 console.error 保持原样输出，不吞
    console.info('[console.error]', ...args);
  });
  afterEach(() => spy.mockRestore());
});

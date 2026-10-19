import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: ['e2e/**', '**/e2e/**', 'playwright.config.ts', 'node_modules/**', 'dist/**'],
      environment: 'jsdom',
      // D-702：未开 globals:true 时 @testing-library/react 不会自动注册清理，
      // DOM 会跨用例累积。此处显式注册，见 src/test/setup.ts。
      setupFiles: ['./src/test/setup.ts'],
      // 默认 5s 对"整页渲染 + 多接口 mock"的重组件用例太紧：
      // 单跑每个都过，并行跑就随机 3~5s 超时，失败用例还会在不同模块间漂移。
      // 15s 只影响超时上限，不会掩盖断言失败（逻辑错仍然立刻红）。
      testTimeout: 15000,
      hookTimeout: 15000,
    },
  }),
);

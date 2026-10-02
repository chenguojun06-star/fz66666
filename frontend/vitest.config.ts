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
    },
  }),
);

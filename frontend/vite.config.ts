import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const resolveGitCommit = () => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env || {}
const buildCommit = env.VITE_BUILD_COMMIT || resolveGitCommit()
const buildTime = env.VITE_BUILD_TIME || new Date().toISOString()

export default defineConfig({
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log'],
  },
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    dedupe: ['react', 'react-dom']
  },
  build: {
    chunkSizeWarningLimit: 800,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        // 保持默认 hoistTransitiveImports=true，让 Rollup 自动分析传递依赖
        // 关键修复：
        // 1) 所有 React/antd/路由作为单一「基础库」chunk 放在最前面
        // 2) 不强行将 AI 相关模块拆分为独立 chunk（避免循环依赖）
        // 3) 保持依赖图线性化：基础库 → UI 组件 → 业务模块
        manualChunks(id) {
          if (id.includes('node_modules/')) {
            // 基础框架（必须最先加载，含 React/ReactDOM/antd/rc-*/@ant-design/icons）
            if (id.includes('react/') || id.includes('react-dom/') || id.includes('scheduler/')
                || id.includes('react-router') || id.includes('@remix-run/')
                || id.includes('antd/') || id.includes('@ant-design/')
                || id.includes('rc-') || id.includes('@rc-component/')
                || id.includes('clsx/') || id.includes('zustand/')) {
              return 'vendor-react-antd';
            }
            // 大型第三方库
            if (id.includes('echarts/') || id.includes('zrender/') || id.includes('echarts-for-react/')) return 'vendor-echarts';
            if (id.includes('exceljs/')) return 'vendor-exceljs';
            if (id.includes('@antv/') || id.includes('@ant-design/charts')) return 'vendor-antv';
            if (id.includes('dayjs/')) return 'vendor-dayjs';
            if (id.includes('axios/')) return 'vendor-axios';
            if (id.includes('@dnd-kit/')) return 'vendor-dndkit';
            if (id.includes('dompurify/')) return 'vendor-dompurify';
            if (id.includes('qrcode')) return 'vendor-qrcode';
            if (id.includes('react-virtuoso/')) return 'vendor-virtuoso';
            if (id.includes('jsbarcode/')) return 'vendor-jsbarcode';
          }
          // AI 智能模块单独打包（但仅 src 代码，不会与基础框架形成循环）
          // 不再将 zustand 放入 AI 模块，保持 AI 模块作为纯业务代码
        },
      },
    },
  },
  server: {
    // ================================================
    // 网络配置 (Cloud-Ready)
    // 自动适配本地开发与云端容器环境
    // ================================================
    host: '0.0.0.0',  // 监听所有网络接口
    port: 5173,       // 开发端口
    strictPort: false,
    headers: {
      // CSP: unsafe-eval 供 ECharts v6 / Three.js (new Function) 使用
      // unsafe-inline 供 Ant Design 内联样式使用
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; connect-src 'self' ws: wss: http: https:; font-src 'self' data:; worker-src blob: 'self'; media-src 'self' blob: http: https:;",
    },
    // HMR 配置：自动跟随客户端请求的 Host，同时支持 localhost 和内网 IP 访问
    // 注意：不要设置 host 字段，否则 Vite 会把 WebSocket 地址硬编码为固定 IP，
    // 导致内网 IP 访问时动态模块 import() 收到 text/html 而非 JS 文件
    hmr: {
      port: 5173,
    },

    proxy: {
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        rewrite: (path) => path
      },
      '/ws': {
        target: 'http://localhost:8088',
        changeOrigin: true,
        ws: true,
      }
    }
  },
  preview: {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    }
  }
})

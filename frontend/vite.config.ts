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
    chunkSizeWarningLimit: 600,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/')) {
            if (id.includes('echarts/') || id.includes('zrender/') || id.includes('echarts-for-react/')) return 'vendor-echarts';
            if (id.includes('exceljs/')) return 'vendor-exceljs';
            if (id.includes('xlsx/')) return 'vendor-xlsx';
            if (id.includes('antd/es/date-picker') || id.includes('rc-picker')) return 'vendor-antd-datepicker';
            if (id.includes('antd/es/table') || id.includes('rc-table')) return 'vendor-antd-table';
            if (id.includes('antd/es/vc-image') || id.includes('rc-image')) return 'vendor-antd-image';
            if (id.includes('antd/es/form') || id.includes('rc-field-form') || id.includes('rc-input')) return 'vendor-antd-form';
            if (id.includes('antd/es/upload') || id.includes('rc-upload')) return 'vendor-antd-upload';
            if (id.includes('antd/es/modal') || id.includes('rc-dialog')) return 'vendor-antd-modal';
            if (id.includes('antd/es/select') || id.includes('rc-select')) return 'vendor-antd-select';
            if (id.includes('antd/es/drawer') || id.includes('rc-drawer')) return 'vendor-antd-drawer';
            if (id.includes('antd/es/tabs') || id.includes('rc-tabs')) return 'vendor-antd-tabs';
            if (id.includes('antd/es/descriptions') || id.includes('rc-descriptions')) return 'vendor-antd-desc';
            if (id.includes('antd/es/statistic') || id.includes('rc-statistic')) return 'vendor-antd-statistic';
            if (id.includes('antd/es/steps') || id.includes('rc-steps')) return 'vendor-antd-steps';
            if (id.includes('antd/es/progress') || id.includes('rc-progress')) return 'vendor-antd-progress';
            if (id.includes('antd/es/notification') || id.includes('rc-notification')) return 'vendor-antd-notification';
            if (id.includes('antd/es/popover') || id.includes('rc-tooltip')) return 'vendor-antd-popover';
            if (id.includes('antd/es/config-provider') || id.includes('@ant-design/cssinjs') || id.includes('@ant-design/static-function')) return 'vendor-antd-core';
            if (id.includes('@ant-design/icons')) return 'vendor-antd-icons';
            if (id.includes('antd/') || id.includes('@ant-design/') || id.includes('rc-') || id.includes('@rc-component/')) return 'vendor-antd';
            if (id.includes('react/') || id.includes('react-dom/') || id.includes('scheduler/')) return 'vendor-react';
            if (id.includes('react-router') || id.includes('@remix-run/')) return 'vendor-router';
            if (id.includes('dayjs/')) return 'vendor-dayjs';
            if (id.includes('axios/')) return 'vendor-axios';
            if (id.includes('@dnd-kit/')) return 'vendor-dndkit';
            if (id.includes('dompurify/')) return 'vendor-dompurify';
            if (id.includes('qrcode')) return 'vendor-qrcode';
            if (id.includes('zustand/')) return 'vendor-zustand';
          }
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
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: http: https:; connect-src 'self' ws: wss: http: https:; font-src 'self' data: https://fonts.gstatic.com; worker-src blob: 'self'; media-src 'self' blob: http: https:;",
    },
    // HMR 配置：自动跟随客户端请求的 Host，同时支持 localhost 和内网 IP 访问
    // 注意：不要设置 host 字段，否则 Vite 会把 WebSocket 地址硬编码为固定 IP，
    // 导致内网 IP 访问时动态模块 import() 收到 text/html 而非 JS 文件
    hmr: {
      protocol: 'ws',
      port: 5173,
      clientPort: 5173
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

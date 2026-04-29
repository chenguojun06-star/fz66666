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
    chunkSizeWarningLimit: 2000,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts/') || id.includes('node_modules/zrender/')) return 'vendor-echarts';
          if (id.includes('node_modules/xlsx/')) return 'vendor-xlsx';
          if (id.includes('node_modules/exceljs/')) return 'vendor-exceljs';
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

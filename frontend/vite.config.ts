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
    // esbuild: 内置、速度是 terser 的 10x、内存占用极低
    // terser 在云端内存受限环境（1-2GB）压缩 ECharts 等大 chunk 时 OOM 被杀，
    // 导致 dist/assets/ 只生成了一部分，引用这些文件的 index.html 上线后 404
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // 手动拆分大依赖，防止单 chunk 超过 1MB
        // ⚠️ React 生态（react / react-dom / scheduler / react-router…）必须在同一个 chunk，
        //    否则两份 React 实例共存会导致 useLayoutEffect/useContext 等 hook 失效崩溃
        manualChunks: (id) => {
          // ECharts 单独拆（压缩后约 375KB）
          if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts';
          // exceljs 单独拆（大且只在导入页用到）
          if (id.includes('exceljs')) return 'vendor-exceljs';
          // React 全家桶：react / react-dom / scheduler / react-router / react-is 等
          // 必须全部在同一 chunk，不可拆散
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/react-is') ||
            id.includes('node_modules/scheduler')
          ) return 'vendor-react';
          // antd + 图标单独拆
          if (id.includes('node_modules/antd') || id.includes('node_modules/@ant-design')) return 'vendor-antd';
          // 其余 node_modules 合并
          if (id.includes('node_modules')) return 'vendor-misc';
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
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss: http: https:; font-src 'self' data:; worker-src blob: 'self'; media-src 'self' blob:;",
    },
    // HMR 配置：固定内网 IP，确保内网设备通过 192.168.2.248:5173 访问时热更新正常
    // ⚠️ 禁止修改 host 值：动态模块加载（React Router lazy）依赖此地址，修改会导致
    //    'Failed to fetch dynamically imported module' 错误
    hmr: {
      protocol: 'ws',
      host: '192.168.2.248', // 固定本机内网 IP，支持 localhost 和内网设备同时访问
      port: 5173,
      clientPort: 5173
    },
    watch: {
      // 【重要】项目在外部磁盘 /Volumes/macoo2/ 上，macOS FSEvents 无法正常触发
      // 必须使用轮询模式才能检测文件变化，实现 HMR 热更新
      usePolling: true,
      interval: 1000,  // 每秒检测一次文件变化
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8088',  // 后端地址 (Docker 容器间通信请使用服务名)
        changeOrigin: true,
        rewrite: (path) => path
      },
      '/ws': {
        target: 'http://localhost:8088',  // WebSocket 代理
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

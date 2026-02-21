import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    dedupe: ['react', 'react-dom']
  },
  build: {
    chunkSizeWarningLimit: 500,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf('node_modules') < 0) return

          // ⚠️ React 核心 + 所有直接依赖 React 的基础包必须在同一个 chunk
          // 以确保 rc-util 初始化时 React 已经就绪
          if (
            id.indexOf('/node_modules/react/') >= 0 ||
            id.indexOf('/node_modules/react-dom/') >= 0 ||
            id.indexOf('/node_modules/scheduler/') >= 0 ||
            id.indexOf('/node_modules/react-router') >= 0 ||
            id.indexOf('/node_modules/@remix-run/router/') >= 0 ||
            id.indexOf('/node_modules/rc-util/') >= 0 ||
            id.indexOf('/node_modules/rc-motion/') >= 0 ||
            id.indexOf('/node_modules/rc-resize-observer/') >= 0 ||
            id.indexOf('/node_modules/@rc-component/') >= 0
          ) {
            return 'vendor-react'
          }

          // 独立的大体积库：与 React 无强耦合
          if (id.indexOf('/node_modules/echarts/') >= 0 || id.indexOf('/node_modules/zrender/') >= 0 || id.indexOf('/node_modules/echarts-for-react/') >= 0) {
            return 'vendor-echarts'
          }
          if (id.indexOf('/node_modules/@ant-design/charts/') >= 0 || id.indexOf('/node_modules/@antv/') >= 0) {
            return 'vendor-antv'
          }
          if (id.indexOf('/node_modules/three/') >= 0 || id.indexOf('/node_modules/@react-three/') >= 0) {
            return 'vendor-three'
          }
          if (id.indexOf('/node_modules/xlsx/') >= 0) {
            return 'vendor-xlsx'
          }

          // antd 组件库（依赖 vendor-react，但 Rollup 会自动处理加载顺序）
          if (id.indexOf('/node_modules/antd/') >= 0 ||
              id.indexOf('/node_modules/@ant-design/') >= 0 ||
              id.indexOf('/node_modules/rc-') >= 0) {
            return 'vendor-antd'
          }

          if (id.indexOf('/node_modules/axios/') >= 0) return 'vendor-axios'
          if (id.indexOf('/node_modules/dayjs/') >= 0) return 'vendor-dayjs'

          return 'vendor'
        }
      }
    }
  },
  server: {
    // ⚠️⚠️⚠️ 【禁止修改】内网访问固定配置 ⚠️⚠️⚠️
    // 内网 IP: 192.168.1.17
    // 访问地址: http://192.168.1.17:5173/
    // 修改此配置会导致动态模块导入失败和 API 代理异常
    // ================================================
    host: '0.0.0.0',  // 【固定】监听所有网络接口
    port: 5173,       // 【固定】开发端口
    strictPort: false,
    hmr: {
      protocol: 'ws',
      host: '192.168.1.17',  // 【固定】HMR 必须使用此内网 IP（已更新为当前机器IP）
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
        target: 'http://localhost:8088',  // 【固定】后端地址
        changeOrigin: true,
        rewrite: (path) => path
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

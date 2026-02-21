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

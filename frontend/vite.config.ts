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
    }
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

          if (id.indexOf('/node_modules/react-dom/') >= 0 || id.indexOf('/node_modules/react/') >= 0) {
            return 'vendor-react'
          }

          if (id.indexOf('/node_modules/react-router/') >= 0 || id.indexOf('/node_modules/react-router-dom/') >= 0) {
            return 'vendor-router'
          }
          if (id.indexOf('/node_modules/@remix-run/router/') >= 0) {
            return 'vendor-router'
          }

          if (id.indexOf('/node_modules/echarts/') >= 0 || id.indexOf('/node_modules/zrender/') >= 0 || id.indexOf('/node_modules/echarts-for-react/') >= 0) {
            return 'vendor-echarts'
          }
          if (id.indexOf('/node_modules/xlsx/') >= 0) {
            return 'vendor-xlsx'
          }
          if (id.indexOf('/node_modules/@ant-design/charts/') >= 0 || id.indexOf('/node_modules/@antv/') >= 0) {
            return 'vendor-antv'
          }
          if (id.indexOf('/node_modules/three/') >= 0 || id.indexOf('/node_modules/@react-three/') >= 0) {
            return 'vendor-three'
          }

          if (id.indexOf('/node_modules/antd/') >= 0) {
            const m = id.match(/\/node_modules\/antd\/(?:es|lib)\/([^/]+)/)
            if (m && m[1]) {
              return `antd-${m[1]}`
            }
            return 'vendor-antd'
          }
          if (id.indexOf('/node_modules/@ant-design/icons-svg/') >= 0) return 'vendor-antd-icons'
          if (id.indexOf('/node_modules/@ant-design/icons/') >= 0) return 'vendor-antd-icons'
          if (id.indexOf('/node_modules/dayjs/') >= 0) return 'vendor-dayjs'
          if (id.indexOf('/node_modules/@ant-design/cssinjs/') >= 0) return 'vendor-antd-style'
          if (id.indexOf('/node_modules/@ant-design/cssinjs-utils/') >= 0) return 'vendor-antd-style'
          if (id.indexOf('/node_modules/@ant-design/fast-color/') >= 0) return 'vendor-antd-style'
          if (id.indexOf('/node_modules/@ant-design/colors/') >= 0) return 'vendor-antd-colors'
          if (id.indexOf('/node_modules/@ant-design/react-slick/') >= 0) return 'vendor-antd-slick'
          if (id.indexOf('/node_modules/@ctrl/tinycolor/') >= 0) return 'vendor-tinycolor'
          if (id.indexOf('/node_modules/@floating-ui/') >= 0) return 'vendor-floating-ui'

          if (id.indexOf('/node_modules/rc-util/') >= 0) return 'vendor-rc-util'
          if (id.indexOf('/node_modules/rc-motion/') >= 0) return 'vendor-rc-motion'
          if (id.indexOf('/node_modules/rc-field-form/') >= 0) return 'vendor-rc-field-form'
          if (id.indexOf('/node_modules/rc-trigger/') >= 0) return 'vendor-rc-trigger'
          if (id.indexOf('/node_modules/rc-dialog/') >= 0) return 'vendor-rc-dialog'
          if (id.indexOf('/node_modules/rc-dropdown/') >= 0) return 'vendor-rc-dropdown'
          if (id.indexOf('/node_modules/rc-menu/') >= 0) return 'vendor-rc-menu'
          if (id.indexOf('/node_modules/rc-picker/') >= 0) return 'vendor-rc-picker'
          if (id.indexOf('/node_modules/rc-table/') >= 0) return 'vendor-rc-table'
          if (id.indexOf('/node_modules/rc-resize-observer/') >= 0) return 'vendor-rc-resize'
          if (id.indexOf('/node_modules/rc-overflow/') >= 0) return 'vendor-rc-overflow'

          if (id.indexOf('/node_modules/@rc-component/') >= 0) {
            const m = id.match(/\/node_modules\/@rc-component\/([^/]+)/)
            if (m && m[1]) {
              return `rc-${m[1]}`
            }
            return 'vendor-rc-component'
          }
          if (id.indexOf('/node_modules/@ant-design/') >= 0) return 'vendor-antd'
          if (id.indexOf('/node_modules/rc-') >= 0) return 'vendor-antd'

          if (id.indexOf('/node_modules/axios/') >= 0) return 'vendor-axios'
          if (id.indexOf('/node_modules/qrcode.react/') >= 0) return 'vendor-qrcode'

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

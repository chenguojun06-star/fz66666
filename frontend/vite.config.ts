import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 500,
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
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8088',
        changeOrigin: true
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

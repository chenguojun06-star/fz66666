import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf('node_modules') < 0) return

          const pickFirstSegmentAfter = (prefix: string) => {
            const i = id.indexOf(prefix)
            if (i < 0) return null
            const rest = id.slice(i + prefix.length)
            const seg = rest.split('/')[0]
            return seg ? seg : null
          }

          if (id.indexOf('/node_modules/react/') >= 0 || id.indexOf('/node_modules/react-dom/') >= 0) return 'react'
          if (id.indexOf('/node_modules/react-router-dom/') >= 0) return 'router'
          if (id.indexOf('/node_modules/dayjs/') >= 0) return 'dayjs'
          if (id.indexOf('/node_modules/moment/') >= 0) return 'moment'
          if (id.indexOf('/node_modules/lodash-es/') >= 0 || id.indexOf('/node_modules/lodash/') >= 0) return 'lodash'
          if (id.indexOf('/node_modules/@ant-design/icons/') >= 0 || id.indexOf('/node_modules/@ant-design/icons-svg/') >= 0) return 'antd-icons'
          if (id.indexOf('/node_modules/@ant-design/cssinjs/') >= 0) return 'antd-cssinjs'
          if (id.indexOf('/node_modules/@ant-design/colors/') >= 0) return 'antd-colors'
          if (id.indexOf('/node_modules/@rc-component/') >= 0) {
            const seg = pickFirstSegmentAfter('/node_modules/@rc-component/')
            return seg ? `rc-${seg}` : 'rc'
          }
          const mod = pickFirstSegmentAfter('/node_modules/')
          if (mod && mod.indexOf('rc-') === 0) return `rc-${mod}`

          if (id.indexOf('/node_modules/antd/es/') >= 0) {
            const seg = pickFirstSegmentAfter('/node_modules/antd/es/')
            return seg ? `antd-${seg}` : 'antd'
          }
          if (id.indexOf('/node_modules/antd/lib/') >= 0) {
            const seg = pickFirstSegmentAfter('/node_modules/antd/lib/')
            return seg ? `antd-${seg}` : 'antd'
          }
          if (id.indexOf('/node_modules/antd/') >= 0) return 'antd'
          if (id.indexOf('/node_modules/axios/') >= 0) return 'axios'
          if (id.indexOf('/node_modules/qrcode.react/') >= 0) return 'qrcode'

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

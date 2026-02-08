# 内网访问配置说明

## ⚠️ 固定配置 - 禁止修改

本项目的内网访问配置是**经过测试验证的固定配置**，修改会导致系统异常。

---

## 📌 配置清单

### 1. Vite 配置文件
**文件**：`vite.config.ts`

```typescript
server: {
  host: '0.0.0.0',           // 【固定】监听所有网络接口
  port: 5173,                // 【固定】开发端口
  hmr: {
    protocol: 'ws',
    host: '192.168.2.248',   // 【固定】HMR 必须使用此内网 IP
    port: 5173,
    clientPort: 5173
  },
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8088',  // 【固定】后端端口 8088
      changeOrigin: true
    }
  }
}
```

### 2. 启动脚本
**文件**：`../dev-public.sh` (第 123 行)

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

---

## 🌐 访问地址

- **本地访问**：`http://localhost:5173/`
- **内网访问**：`http://192.168.2.248:5173/`

---

## ⚠️ 禁止修改的原因

### 1. HMR (Hot Module Replacement) 依赖固定 Host
- Vite 的 HMR 使用 WebSocket 连接
- WebSocket 地址在构建时写入客户端代码
- 修改 `hmr.host` 会导致客户端连接错误的地址

### 2. 动态模块导入依赖 HMR 配置
- React Router 使用 `lazy()` 进行代码分割
- 动态导入的模块路径基于 HMR 配置
- 配置错误会导致 `Failed to fetch dynamically imported module` 错误

### 3. API 代理依赖 Host 配置
- Vite 的 `proxy` 配置仅在正确的 host 下生效
- 修改会导致 API 请求 404 错误

---

## 🔧 故障排查

### 错误 1：动态模块导入失败
```
Failed to fetch dynamically imported module: 
http://192.168.2.248:5173/src/modules/xxx/index.tsx
```

**原因**：HMR host 配置错误

**解决**：
```bash
# 1. 检查 vite.config.ts
grep "hmr.host" vite.config.ts
# 应该输出：host: '192.168.2.248',

# 2. 清理缓存并重启
rm -rf node_modules/.vite
npm run dev
```

### 错误 2：API 请求 404
```
GET http://192.168.2.248:5173/api/xxx 404
```

**原因**：使用内网 IP 访问，代理未生效

**解决**：改用 `http://localhost:5173/` 访问

---

## 📝 修改记录

| 日期 | 修改原因 | 配置值 |
|------|----------|--------|
| 2026-02-05 | 支持内网访问 + 修复动态导入 | `hmr.host='192.168.2.248'` |

---

## ✅ 配置验证清单

启动开发服务器后，检查：

- [ ] 终端显示 `Network: http://192.168.2.248:5173/`
- [ ] 浏览器访问 `http://192.168.2.248:5173/` 可正常打开
- [ ] 页面路由跳转正常（无动态导入错误）
- [ ] API 请求代理正常（使用 `localhost` 访问时）

---

**最后更新**：2026-02-05  
**维护者**：请勿修改此配置，如有问题联系架构负责人

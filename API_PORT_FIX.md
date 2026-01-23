# 前端 API 配置修复 (500 错误)

## 🔴 问题
浏览器显示大量 `GET http://localhost:5173/api/dashboard 500 (Internal Server Error)`

## 🔍 根本原因
`.env.development` 中的后端地址指向**错误的端口**：
- ❌ 旧配置：`VITE_API_BASE_URL=http://localhost:8080`
- ✅ 新配置：`VITE_API_BASE_URL=http://localhost:8088`

后端实际运行在 **8088**，但前端指向 **8080**。

## ✅ 已修复
- [x] frontend/.env.development - 已更新为正确的 8088 端口
- [x] 配置文件已保存

## 🔧 需要手动操作（前端刷新）

### 方案1：完全重启前端（推荐）
```bash
# 1. 停止当前前端进程
#    在终端或任务管理器中 kill npm dev 进程

# 2. 清除 Vite 缓存
cd frontend
rm -rf .vite

# 3. 重新启动前端
npm run dev
# 前端会重新读取 .env.development 的新配置
```

### 方案2：清除浏览器缓存（快速）
1. 打开浏览器开发者工具 (F12)
2. 清除所有缓存和 Cookie
3. 刷新页面 (Ctrl+F5 强制刷新)
4. 如果仍不行，重启前端 dev 服务器

## 🎯 验证修复
修复后，浏览器 DevTools 的 Network 标签应该显示：
- ✅ GET http://localhost:8088/api/dashboard 200 (正常)
- ✅ GET http://localhost:8088/api/production/... 200 (正常)

## 📝 详细说明

### 为什么 API 被发送到 5173?

**api.ts 中的逻辑：**
```typescript
const resolveApiBaseUrl = (): string => {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (!raw) return '/api';  // ← 相对路径
  
  if (/^https?:\/\//.test(raw)) {
    return `${raw}/api`;    // ← 绝对路径 (正确)
  }
};
```

当 `VITE_API_BASE_URL=http://localhost:8080` 时：
1. 它是绝对路径，所以返回 `http://localhost:8080/api`
2. axios 直接请求 8080
3. 但后端运行在 8088，所以返回 500

### 为什么不用代理?

虽然 `vite.config.ts` 中配置了代理：
```typescript
proxy: {
  '/api': {
    target: 'http://127.0.0.1:8088'
  }
}
```

但是**当设置了绝对的 `VITE_API_BASE_URL` 时，代理会被跳过**。axios 会直接请求那个地址。

## 🔐 安全检查

确保现在：
1. ✅ 后端运行在 http://localhost:8088
2. ✅ 前端运行在 http://localhost:5173
3. ✅ .env.development 指向 http://localhost:8088
4. ✅ vite.config.ts 代理配置正确（备用方案）

---

**修复提交**：已更新 frontend/.env.development
**需要操作**：重启前端 dev 服务器

# 前端环境配置指南

## 环境变量配置

### 本地开发环境

1. **复制环境模板**
   ```bash
   cp frontend/.env.example frontend/.env.development
   ```

2. **配置API后端地址**
   
   **本地开发** (连接本地后端):
   ```
   VITE_API_BASE_URL=http://localhost:8080
   ```
   
   **远程开发** (连接远程后端):
   ```
   VITE_API_BASE_URL=http://192.168.2.248:8088
   ```

3. **启动前端开发服务器**
   ```bash
   cd frontend
   npm run dev
   ```
   
   访问: http://localhost:5173

### 前端启动流程

1. **检查后端是否已启动**
   ```bash
   curl http://localhost:8080/swagger-ui.html
   ```
   如果能访问则表示后端已启动

2. **启动前端**
   ```bash
   cd frontend
   npm install  # 首次需要
   npm run dev
   ```

3. **刷新浏览器并检查**
   - 打开: http://localhost:5173
   - 打开开发者工具 (F12)
   - 查看Network标签，检查API请求是否成功 (200 OK而不是404)

### 常见问题

#### Q: 前端显示404错误或"暂无数据"
**A:** 
- 检查后端是否已启动 (localhost:8080)
- 检查.env.development中的VITE_API_BASE_URL是否正确
- 检查浏览器开发工具的Network标签，看API请求地址是否正确
- 可以手动访问 http://localhost:8080/api/health 测试

#### Q: 跨域问题
**A:** 后端已配置CORS，允许来自localhost:5173的请求

#### Q: 页面显示空白
**A:** 查看浏览器控制台是否有错误，通常是因为：
- 后端API地址错误
- 后端未启动
- 网络连接问题

### 文件说明

- `.env.example` - 环境配置模板（提交到Git）
- `.env.development` - 本地开发配置（不提交到Git，本地修改）
- `.env.production` - 生产环境配置（不提交到Git，服务器部署）

## 快速诊断

```bash
# 1. 检查后端是否运行
curl -i http://localhost:8080/api/health

# 2. 检查前端是否在正确的地址
# 打开浏览器访问: http://localhost:5173
# 按F12打开开发者工具，查看Network标签的API请求

# 3. 查看前端进程
ps aux | grep "vite"

# 4. 查看后端进程  
ps aux | grep "fashion-supplychain"
```

---

更新时间: 2026-01-23

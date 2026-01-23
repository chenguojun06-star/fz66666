# API 调用最佳实践指南

## 核心原则

### ✅ 正确的方式

```typescript
import api from '../../utils/api';

// baseURL 已经包含 /api，所以路径不需要再加 /api
const res = await api.get('/payroll/settlement-data/pending', {
  params: { page, pageSize }
});
```

### ❌ 错误的方式

```typescript
// 错误！路径中不应该包含 /api
const res = await api.get('/api/payroll/settlement-data/pending', {
  params: { page, pageSize }
});
// 这样会导致: /api/api/payroll/... → 404错误
```

## API 配置详解

### axios 配置

文件: `frontend/src/utils/api.ts`

```typescript
const api = axios.create({
  baseURL: resolveApiBaseUrl(),  // 根据环境变量设置，默认 /api
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});
```

### resolveApiBaseUrl 函数

- **开发环境** (.env.development):
  ```
  VITE_API_BASE_URL=http://localhost:8080
  → baseURL = http://localhost:8080/api
  ```

- **生产环境** (.env.production):
  ```
  VITE_API_BASE_URL=http://192.168.2.248:8088
  → baseURL = http://192.168.2.248:8088/api
  ```

- **默认值** (未设置环境变量):
  ```
  → baseURL = /api (相对路径)
  ```

## API 路径规范

### Finance 模块（已采用的规范）

```typescript
// ✅ 成品结算 - 正确格式
await api.get('/finance/shipment-reconciliation/list', { params: {...} });
await api.get(`/finance/shipment-reconciliation/${rid}`);
await api.post(`/finance/shipment-reconciliation/${rid}/approve`, {...});

// ✅ 物料对账 - 正确格式
await api.get('/finance/material-reconciliation/list', { params: {...} });

// ✅ 审批付款 - 正确格式
await api.get('/finance/payment-approval/pending', { params: {...} });
```

### Payroll 模块（需要遵循的规范）

```typescript
// ✅ 工资结算 - 正确格式（已修复）
await api.get('/payroll/settlement-data/pending', { params: {...} });
await api.get('/payroll/settlement', { params: {...} });
await api.post(`/payroll/settlement-data/${id}/approve`, {...});
await api.post('/payroll/payment/execute', {...});

// ❌ 工资结算 - 错误格式（已修复）
// await api.get('/api/payroll/settlement-data/pending', ...); // 不要这样！
```

## 最佳实践总结

| 规则 | 说明 | 例子 |
|------|------|------|
| **不要重复 /api** | baseURL 已包含 | `/payroll/...` ✅ |
| **使用模块前缀** | 清晰的路径结构 | `/finance/...`, `/payroll/...` |
| **RESTful 路由** | 遵循REST规范 | GET 查询, POST 创建, PUT 更新, DELETE 删除 |
| **参数对象化** | 清晰的参数结构 | `params: { page, pageSize }` |
| **错误处理** | 始终catch | `try {...} catch {...}` |

## 调试技巧

### 1. 检查实际请求的URL

打开浏览器 F12 → Network 标签

```
✅ 正确: http://localhost:8080/api/payroll/settlement-data/pending
❌ 错误: http://localhost:5173/api/api/payroll/settlement-data/pending
❌ 错误: http://localhost:5173/api/api/api/... (可能重复加载)
```

### 2. 快速检查所有API调用

```bash
# 搜索可能的双重/api问题
grep -r "api\.get('/api\|api\.post('/api" frontend/src/pages/
```

### 3. 验证baseURL

在浏览器控制台执行：
```javascript
// 查看 axios 实例的配置
import api from './utils/api';
console.log(api.defaults.baseURL);  // 应该输出 /api 或完整URL
```

## 常见问题

### Q: 为什么我的API返回404？
**A:** 很可能是路径中有重复的 `/api`。检查：
1. 打开浏览器DevTools的Network标签
2. 查看实际请求的URL
3. 确保不是 `/api/api/...` 的格式

### Q: 我需要调用非api前缀的路由怎么办？
**A:** 使用完整URL或修改baseURL：
```typescript
// 方法1: 使用 axios 直接调用
import axios from 'axios';
await axios.get('http://localhost:8080/other-path');

// 方法2: 使用绝对路径重写baseURL
const customApi = axios.create({ baseURL: 'http://localhost:8080' });
await customApi.get('/other-path');
```

### Q: 如何在开发和生产环境之间切换？
**A:** 使用 `.env.development` 和 `.env.production`：
```
开发: npm run dev   → 读取 .env.development
生产: npm run build → 读取 .env.production
```

---

**更新时间**: 2026-01-23
**相关文件**: 
- `frontend/src/utils/api.ts` - API配置文件
- `ENV_SETUP_GUIDE.md` - 环境配置指南
- `frontend/src/pages/Finance/*.tsx` - Finance模块示例

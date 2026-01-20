# 📊 网页端与小程序端数据同步分析报告

**报告日期**: 2026-01-20  
**分析范围**: 订单管理、扫码操作、生产进度、仓库管理

---

## 一、系统架构对比

### 后端 API（统一）
```
服务器: http://localhost:8088
格式: RESTful JSON API
响应结构: { code: 200, data: {...}, message: "" }
超时设置: 
  - 小程序: 15s (wx.request timeout)
  - 网页端: 10s (axios timeout)
```

### 网页端（React + TypeScript）
- 基础请求: `frontend/src/utils/api.ts` (axios)
- 服务层: `frontend/src/services/*/`
- 类型定义: `frontend/src/types/*.ts`
- 超时: 10s，带重试机制（500/502/503）

### 小程序端（WeChat Mini Program）
- 基础请求: `miniprogram/utils/request.js` (wx.request)
- API 封装: `miniprogram/utils/api.js`
- 页面实现: `miniprogram/pages/*/`
- 超时: 15s，无自动重试

---

## 二、数据同步现状分析

### ✅ 一致的部分

#### 1. API 端点规范
| 功能 | 网页端 | 小程序端 | 后端 |
|------|------|--------|------|
| 订单列表 | `/api/production/order/list` | `/api/production/order/list` | ✅ 同步 |
| 订单详情 | `/api/production/order/detail/{id}` | `/api/production/order/detail/{id}` | ✅ 同步 |
| 执行扫码 | `/api/production/scan/execute` | `/api/production/scan/execute` | ✅ 同步 |
| 更新进度 | `/api/production/order/update-progress` | `/api/production/order/update-progress` | ✅ 同步 |
| 仓库列表 | `/api/production/warehousing/list` | `/api/production/warehousing/list` | ✅ 同步 |

#### 2. 认证机制
```typescript
// 网页端 (frontend/src/utils/api.ts)
Authorization: `Bearer ${token}`

// 小程序端 (miniprogram/utils/request.js)
Authorization: `Bearer ${token}`
```

#### 3. 响应格式
```json
{
  "code": 200,
  "data": { /* 数据对象 */ },
  "message": "操作成功"
}
```

---

### ⚠️ 存在的问题

#### 问题 1️⃣: 请求超时不一致 🔴
**严重性**: **高** (可能导致请求无限等待)

**现象**:
- 网页端: 10s 超时 ✅
- 小程序端: 15s 超时 ⚠️
- 小程序无自动重试机制 ❌

**位置**:
- `frontend/src/utils/api.ts` (Line 401): `timeout: 10000`
- `miniprogram/utils/request.js` (Line 58): `timeout: 15000`

**场景示例**:
```javascript
// 小程序可能在网络差时卡住 15s
// 网页端自动重试后返回（总耗时可能 30s+）
```

**修复建议**:
```javascript
// miniprogram/utils/request.js - 将超时改为 10s
wx.request({
    timeout: 10000,  // 改为 10s 与网页端保持一致
    // ...
});

// 添加重试机制
async function requestWithRetry(options, maxRetries = 2) {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await request(options);
        } catch (e) {
            lastError = e;
            if (i < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    throw lastError;
}
```

---

#### 问题 2️⃣: 数据结构字段缺失 🔴
**严重性**: **高** (可能导致显示错误或数据丢失)

**网页端数据类型** (`frontend/src/types/production.ts`):
```typescript
export interface ProductionOrder {
  id: string;
  orderNo: string;
  styleNo: string;
  factoryName: string;
  orderQuantity: number;
  completedQuantity: number;
  productionProgress: number;
  // ✅ 完整的进度节点数据
  progressWorkflowJson: string;
  progressWorkflowLocked: number;
  progressWorkflowLockedAt: string;
  progressWorkflowLockedBy: string;
  progressWorkflowLockedByName: string;
  // ✅ 各环节时间和操作者
  cuttingStartTime: string;
  cuttingEndTime: string;
  cuttingOperatorName: string;
  cuttingCompletionRate: number;
  // ... (sewingStartTime, qualityStartTime, 等等)
}
```

**小程序使用情况** (`miniprogram/pages/work/index.js`):
```javascript
// 小程序在显示时需要处理这些字段
function resolveNodesFromOrder(order) {
  const raw = order && order.progressWorkflowJson;
  const parsed = parseProgressNodes(raw);
  return parsed.length ? parsed : defaultNodes;
}
```

**问题**: 
- ❌ 小程序端没有数据类型定义，容易出错
- ❌ 字段缺失时使用默认值，可能与实际进度不符
- ❌ 小程序端没有验证返回的数据结构

**示例错误场景**:
```javascript
// API 返回数据中没有 progressWorkflowJson
// 小程序会使用默认的 defaultNodes
const defaultNodes = [
  { id: 'cutting', name: '裁剪' },
  { id: 'production', name: '生产' },
  { id: 'quality', name: '质检' },
  { id: 'packaging', name: '包装' },
];
// 结果: 显示的进度与后端设置不符！
```

**修复建议**:
```javascript
// miniprogram/types/production.js - 新建数据类型定义
const ProductionOrderShape = {
  id: { required: true, type: 'string' },
  orderNo: { required: true, type: 'string' },
  styleNo: { required: true, type: 'string' },
  orderQuantity: { required: true, type: 'number' },
  completedQuantity: { required: true, type: 'number', default: 0 },
  productionProgress: { required: true, type: 'number', default: 0 },
  progressWorkflowJson: { type: 'string', default: '' },
  // 添加数据验证
};

function validateOrderData(order) {
  if (!order.progressWorkflowJson) {
    console.warn('[Data Sync] Missing progressWorkflowJson in order:', order.id);
    return false;
  }
  return true;
}
```

---

#### 问题 3️⃣: 错误处理差异 🟡
**严重性**: **中** (影响用户体验和调试)

**网页端** (`frontend/src/utils/errorHandling.ts`):
```typescript
class ErrorHandler {
  handleApiError(error: any): string {
    if (status === 400) {
      errorMsg = '请求参数错误';
    } else if (status === 401) {
      errorMsg = '请登录后继续';
    } else if (status === 403) {
      errorMsg = '您没有权限执行此操作';
    } else if (status === 404) {
      errorMsg = '资源不存在';
    } else if (status === 500) {
      errorMsg = '服务器内部错误，请稍后重试';
    }
    return errorMsg;
  }
}
// 有 Trace ID，可追踪错误
```

**小程序端** (`miniprogram/utils/request.js`):
```javascript
wx.request({
  success(res) {
    const code = res.statusCode;
    if (code === 200) {
      resolve(res.data);
    } else if (code === 401) {
      getApp().redirectToLogin();
      reject(res.data);
    } else {
      reject(res.data);  // ❌ 无统一错误处理
    }
  },
  fail(err) {
    reject(err);  // ❌ 错误信息未加工
  }
});
```

**问题**:
- ❌ 小程序没有统一的错误分类
- ❌ 没有友好的错误提示给用户
- ❌ 没有错误日志追踪能力
- ❌ 用户看到的可能是原生错误信息

**对比示例**:
| 错误情况 | 网页端提示 | 小程序提示 |
|---------|----------|---------|
| 服务器 500 错误 | ✅ "服务器内部错误，请稍后重试" | ❌ 原始 API 错误 |
| 网络超时 | ✅ "服务器无响应，请检查网络" | ❌ 原始网络错误 |
| 无权限 | ✅ "您没有权限执行此操作" | ❓ 后端返回什么就显示什么 |

**修复建议**:
```javascript
// miniprogram/utils/errorHandler.js - 新建统一错误处理
function createErrorHandler() {
  return {
    formatError(error, defaultMsg = '操作失败') {
      if (!error) return defaultMsg;
      
      const statusCode = error.statusCode || error.code;
      const message = error.message || error.errMsg || '';
      
      // 统一的错误映射表
      const errorMap = {
        400: '请求参数错误',
        401: '请登录后继续',
        403: '您没有权限执行此操作',
        404: '资源不存在',
        500: '服务器内部错误，请稍后重试',
        'ECONNABORTED': '请求超时，请检查网络并重试',
        'ERR_NETWORK': '网络连接失败，请检查网络设置',
      };
      
      return errorMap[statusCode] || errorMap[message] || defaultMsg;
    }
  };
}
```

---

#### 问题 4️⃣: 数据验证差异 🟡
**严重性**: **中** (可能导致数据不一致)

**网页端**:
- ✅ 有集中的验证规则库: `frontend/src/utils/formValidationRules.ts`
- ✅ 有安全的数据转换: `frontend/src/utils/dataTransform.ts`
- ✅ 提交前验证所有字段

**小程序端**:
- ⚠️ 部分页面有验证（login, scan）
- ❌ 没有统一的验证规则库
- ❌ 数据转换函数分散

**示例**:
```javascript
// 网页端 - 统一管理
import { getValidationRule } from '@/utils/formValidationRules';
const rule = getValidationRule('quantity');
// { required: true, pattern: /^[1-9]\d*$/, min: 1, max: 999999 }

// 小程序端 - 分散实现
function validateQuantity(qty) {
  const v = Number(qty);
  if (!Number.isInteger(v) || v <= 0) return '数量必须是正整数';
  if (v > 999999) return '数量不能超过 999999';
  return '';
}
```

---

#### 问题 5️⃣: 实时同步缺失 🔴
**严重性**: **高** (两端显示可能不一致)

**问题描述**:
- 网页端完成订单 → 小程序可能还显示旧数据
- 小程序扫码 → 网页端需要手动刷新才能看到
- 没有 WebSocket 或消息推送机制

**实现方案**:
```javascript
// 建议: 使用定时轮询 (poll) + 变化通知 (push)
// 1. 关键操作后主动刷新
// 2. 后台每 30s 检查一次数据变化
// 3. 如有 WebSocket，可使用 real-time push
```

---

## 三、同步检查清单

### 📋 API 端点同步检查
- [x] 订单列表端点
- [x] 订单详情端点
- [x] 扫码执行端点
- [x] 进度更新端点
- [x] 仓库查询端点
- [x] 认证端点
- [ ] 数据验证规则 ⚠️

### 📋 数据结构同步检查
- [ ] ProductionOrder 完整字段 ⚠️
- [ ] ScanRecord 完整字段 ⚠️
- [ ] 小程序数据类型定义缺失 ❌
- [ ] 字段默认值设置不一致 ⚠️

### 📋 错误处理同步检查
- [x] 网页端有完整的错误处理 ✅
- [ ] 小程序端缺少统一的错误处理 ❌
- [ ] 错误提示文案不一致 ⚠️

### 📋 超时和重试同步检查
- [x] 网页端: 10s 超时 + 自动重试 ✅
- [ ] 小程序端: 15s 超时 + 无重试 ❌
- [ ] 需要统一超时时间 ⚠️

### 📋 实时同步机制检查
- [ ] 无 WebSocket 连接
- [ ] 无消息推送
- [ ] 需要定时轮询机制 ⚠️

---

## 四、优先级修复方案

### 🔴 P1（立即处理）

#### 1. 统一小程序超时和添加重试
```javascript
// 文件: miniprogram/utils/request.js
// 改动: timeout 15000 → 10000，添加重试机制
```

#### 2. 数据类型验证
```javascript
// 文件: miniprogram/pages/work/index.js
// 改动: 添加数据结构验证，确保关键字段存在
```

#### 3. 统一错误处理
```javascript
// 文件: miniprogram/utils/errorHandler.js (新建)
// 内容: 错误分类和统一提示文案
```

### 🟡 P2（本周内）

#### 4. 小程序数据类型定义
```javascript
// 文件: miniprogram/types/production.js (新建)
// 内容: 数据结构定义和验证函数
```

#### 5. 数据验证规则统一
```javascript
// 文件: miniprogram/utils/validationRules.js (新建)
// 内容: 使用与网页端相同的验证规则
```

#### 6. 实时同步机制
```javascript
// 文件: miniprogram/utils/syncManager.js (新建)
// 内容: 定时轮询和变化检测
```

### 🟢 P3（计划中）

#### 7. WebSocket 实时推送
```javascript
// 后端: 添加 WebSocket 端点
// 前端: 连接 WebSocket 接收实时更新
```

---

## 五、数据同步测试用例

### 测试场景 1: 订单状态更新
```javascript
// 步骤:
// 1. 网页端将订单更新为 "production"
// 2. 等待 2 秒
// 3. 小程序刷新列表
// 预期: 订单状态在小程序端也变为 "production"

// 当前结果: ✅ 可以正确同步（但需要手动刷新）
// 改进: 应该自动刷新或实时推送
```

### 测试场景 2: 扫码数据验证
```javascript
// 步骤:
// 1. 小程序扫码 (QR: "ORD20260120-001-001", 数量: 100)
// 2. 检查网页端的扫码记录
// 预期: 记录中显示相同的订单号和数量

// 当前问题:
// - 小程序没有验证 progressWorkflowJson
// - 可能导致进度计算错误
```

### 测试场景 3: 错误提示一致性
```javascript
// 步骤:
// 1. 网页端: 清空 API Base URL，尝试操作
// 2. 小程序: 清空 API Base URL，尝试操作
// 预期: 两端显示相同的错误提示

// 当前问题: ❌ 不一致
// 网页: "服务器无响应，请检查网络连接"
// 小程序: 原始网络错误信息
```

---

## 六、实施建议

### 📌 短期（本周）
1. 统一超时时间为 10s
2. 小程序添加重试机制
3. 添加数据结构验证
4. 统一错误处理和提示

### 📌 中期（两周内）
5. 创建小程序数据类型定义
6. 统一验证规则库
7. 添加实时同步机制

### 📌 长期（一个月内）
8. 实现 WebSocket 实时推送
9. 建立数据同步监控和告警
10. 定期同步测试和文档更新

---

## 七、代码示例

### 示例 1: 修复小程序超时和重试
```javascript
// miniprogram/utils/request.js
function request(options) {
    return new Promise((resolve, reject) => {
        const url = (options && options.url) || '';
        const method = (options && options.method) || 'GET';
        const data = (options && options.data) || undefined;
        const header = (options && options.header) || {};
        const skipAuthRedirect = !!(options && options.skipAuthRedirect);
        const retryCount = (options && options._retryCount) || 0;

        const token = getToken();
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const baseUrl = getBaseUrl();

        wx.request({
            url: `${baseUrl}${url}`,
            method,
            data,
            timeout: 10000,  // ✅ 改为 10s 与网页端保持一致
            header: {
                'content-type': 'application/json',
                ...authHeader,
                ...header,
            },
            success(res) {
                if (res && res.data) {
                    resolve(res.data);
                } else {
                    reject(new Error('响应数据异常'));
                }
            },
            fail(err) {
                // ✅ 添加重试机制
                if (retryCount < 2) {
                    const nextOptions = { ...options, _retryCount: retryCount + 1 };
                    setTimeout(() => {
                        request(nextOptions).then(resolve).catch(reject);
                    }, 1000 * (retryCount + 1));
                } else {
                    reject(err);
                }
            },
        });
    });
}
```

### 示例 2: 数据结构验证
```javascript
// miniprogram/utils/validateOrderData.js
function validateOrderData(order) {
  const issues = [];
  
  // 检查必需字段
  if (!order.id) issues.push('缺少 id 字段');
  if (!order.orderNo) issues.push('缺少 orderNo 字段');
  if (!order.styleNo) issues.push('缺少 styleNo 字段');
  
  // 检查进度数据
  if (!order.progressWorkflowJson) {
    issues.push('缺少 progressWorkflowJson 字段');
  } else {
    try {
      JSON.parse(order.progressWorkflowJson);
    } catch (e) {
      issues.push('progressWorkflowJson 格式不正确');
    }
  }
  
  // 检查数值类型
  if (order.orderQuantity && !Number.isInteger(order.orderQuantity)) {
    issues.push('orderQuantity 必须是整数');
  }
  
  if (issues.length > 0) {
    console.error('[Data Validation] Order data issues:', {
      orderId: order.id,
      issues
    });
    return false;
  }
  
  return true;
}
```

### 示例 3: 统一错误处理
```javascript
// miniprogram/utils/errorHandler.js
const errorHandler = {
  // 格式化错误信息
  formatError(error, defaultMsg = '操作失败') {
    if (!error) return defaultMsg;
    
    // API 业务错误
    if (error.type === 'biz') {
      const code = error.code;
      if (code === 400) return '请求参数错误';
      if (code === 401) return '请登录后继续';
      if (code === 403) return '您没有权限执行此操作';
      if (code === 404) return '资源不存在';
      if (code === 500) return '服务器内部错误，请稍后重试';
      if (code >= 500) return '服务暂时不可用，请稍后重试';
      return error.errMsg || defaultMsg;
    }
    
    // 网络错误
    if (error.errMsg) {
      if (error.errMsg.includes('timeout')) {
        return '请求超时，请检查网络连接并重试';
      }
      if (error.errMsg.includes('ERR_NETWORK')) {
        return '网络连接失败，请检查网络设置';
      }
    }
    
    return error.message || defaultMsg;
  },
  
  // 显示错误提示
  showError(error, defaultMsg = '操作失败') {
    const msg = this.formatError(error, defaultMsg);
    wx.showToast({
      title: msg,
      icon: 'error',
      duration: 2000
    });
  }
};

module.exports = errorHandler;
```

---

## 八、总结

| 维度 | 网页端 | 小程序端 | 同步状态 |
|-----|------|--------|--------|
| **API 端点** | ✅ 标准 RESTful | ✅ 统一 | ✅ 同步 |
| **超时设置** | 10s | 15s | ❌ 不同步 |
| **重试机制** | ✅ 有 | ❌ 无 | ❌ 不同步 |
| **数据类型** | ✅ 完整定义 | ❌ 缺失 | ❌ 不同步 |
| **错误处理** | ✅ 统一分类 | ❌ 无统一 | ❌ 不同步 |
| **数据验证** | ✅ 规则库 | ⚠️ 分散 | ⚠️ 部分同步 |
| **实时同步** | ⚠️ 手动刷新 | ⚠️ 手动刷新 | ⚠️ 缺失 |

**关键风险**:
1. 🔴 小程序可能长时间等待请求（超时不一致）
2. 🔴 数据结构验证不足，可能显示错误的进度信息
3. 🟡 用户体验不一致（错误提示不同）
4. 🟡 缺少实时同步，两端数据可能有延迟

**建议**: 按照 P1/P2/P3 优先级逐步完善，确保两端数据一致性和用户体验。

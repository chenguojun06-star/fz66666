# 📋 表单验证和数据操作检查报告

**生成时间**：2026-01-20  
**检查范围**：小程序和网页表单验证、API 调用、异常处理

---

## 🔴 发现的问题

### 一、小程序问题

#### 1.1 登录表单验证不完整 ⚠️
**文件**：`miniprogram/pages/login/index.js`

**问题**：
- ❌ 账号 (username) 缺少长度验证（建议 3-20 字符）
- ❌ 密码 (password) 缺少长度验证（建议 6-20 字符）
- ❌ 开发 API 地址 (apiBaseUrl) 缺少 URL 格式验证

**当前代码**：
```js
async onDevLogin() {
    const username = (this.data.username || '').trim();
    const password = (this.data.password || '').trim();
    if (!username || !password) {  // ❌ 只检查非空
        wx.showToast({ title: '请输入账号和密码', icon: 'none' });
        return;
    }
    // ...
}
```

**建议修复**：
```js
// 添加验证函数
function validateUsername(username) {
    const v = String(username || '').trim();
    if (!v) return '请输入账号';
    if (v.length < 3) return '账号长度不能少于 3 个字符';
    if (v.length > 20) return '账号长度不能超过 20 个字符';
    return '';
}

function validatePassword(password) {
    const v = String(password || '').trim();
    if (!v) return '请输入密码';
    if (v.length < 6) return '密码长度不能少于 6 个字符';
    if (v.length > 20) return '密码长度不能超过 20 个字符';
    return '';
}

function validateApiBaseUrl(url) {
    const v = String(url || '').trim();
    if (!v) return '';  // 可选字段
    if (!(/^https?:\/\//.test(v))) return 'API 地址必须以 http:// 或 https:// 开头';
    return '';
}

// 在 onDevLogin 中使用
async onDevLogin() {
    if (this.data.loading) return;
    
    const username = (this.data.username || '').trim();
    const password = (this.data.password || '').trim();
    const apiBaseUrl = (this.data.apiBaseUrl || '').trim();
    
    // 验证字段
    let err = validateUsername(username);
    if (err) {
        wx.showToast({ title: err, icon: 'none' });
        return;
    }
    
    err = validatePassword(password);
    if (err) {
        wx.showToast({ title: err, icon: 'none' });
        return;
    }
    
    if (apiBaseUrl) {
        err = validateApiBaseUrl(apiBaseUrl);
        if (err) {
            wx.showToast({ title: err, icon: 'none' });
            return;
        }
        setBaseUrl(apiBaseUrl);
    }
    
    // ... 继续登录逻辑
}
```

---

#### 1.2 网络请求异常处理不足 ⚠️
**文件**：`miniprogram/utils/request.js`

**问题**：
- ❌ 请求超时时间为 15s，对于大数据操作可能过短
- ❌ 缺少网络状态检查
- ❌ 缺少重试机制
- ❌ 错误消息过于简洁，难以调试

**当前代码**：
```js
wx.request({
    timeout: 15000,  // ❌ 所有请求都用同一个超时
    header: { ... },
    success(res) { ... },
    fail(err) {
        reject(createError((err && err.errMsg) || '网络异常', { ... }));
    }
});
```

**建议修复**：
```js
// 添加网络状态检查
function checkNetworkStatus() {
    return new Promise((resolve) => {
        wx.getNetworkType({
            success: (res) => {
                resolve(res.networkType);
            },
            fail: () => {
                resolve('unknown');
            }
        });
    });
}

// 改进 request 函数
function request(options) {
    return new Promise((resolve, reject) => {
        // ... 其他代码
        const timeout = (options && options.timeout) || 30000;  // 默认 30s
        const retryCount = (options && options.retryCount) || 0;
        const retryDelay = (options && options.retryDelay) || 1000;
        
        const attemptRequest = (attemptNum = 0) => {
            wx.request({
                url: `${baseUrl}${url}`,
                method,
                data,
                timeout,  // ✅ 使用可配置的超时
                header: { ... },
                success(res) {
                    // ... 处理响应
                },
                fail(err) {
                    if (attemptNum < retryCount) {
                        // 重试
                        setTimeout(() => attemptRequest(attemptNum + 1), retryDelay);
                    } else {
                        reject(createError((err && err.errMsg) || '网络异常', { type: 'network', raw: err }));
                    }
                }
            });
        };
        
        attemptRequest();
    });
}
```

---

#### 1.3 扫码数据验证缺失 ⚠️
**文件**：`miniprogram/pages/scan/index.js`

**问题**：
- ❌ 二维码格式缺少验证
- ❌ 数量输入缺少正整数检查
- ❌ 缺少重复扫码防护
- ❌ 错误提示信息不具体

**建议修复**：
```js
// 添加二维码验证函数
function validateQrCode(qrCode) {
    const v = String(qrCode || '').trim();
    if (!v) return '二维码不能为空';
    if (v.length < 5) return '二维码长度不符合';
    if (!/^[a-zA-Z0-9\-_]+$/.test(v)) return '二维码包含非法字符';
    return '';
}

// 添加数量验证
function validateQuantity(qty) {
    const v = Number(qty);
    if (!Number.isInteger(v) || v <= 0) return '数量必须是正整数';
    if (v > 9999) return '数量不能超过 9999';
    return '';
}

// 防重复扫码
const lastScanTime = {};
function isRecentScan(qrCode, ttl = 2000) {
    const now = Date.now();
    const last = lastScanTime[qrCode];
    if (last && (now - last) < ttl) {
        return true;
    }
    lastScanTime[qrCode] = now;
    return false;
}
```

---

### 二、网页问题

#### 2.1 表单验证规则不统一 ⚠️
**文件**：`frontend/src/pages/**/*.tsx`

**问题**：
- ❌ 不同页面的表单验证规则不一致
- ❌ 部分必填字段缺少长度限制
- ❌ 缺少统一的验证工具类

**示例问题**：

**UserList.tsx**：
```tsx
const formRules = {
    username: [
        { required: true, message: '请输入用户名', trigger: ['change', 'blur'] },
        { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: ['change', 'blur'] }
    ],
    // ❌ password 规则定义在别处或缺失
};
```

**Profile.tsx**：
```tsx
<Form.Item name="phone"
    rules={[
        {
            validator: async (_, value) => {
                const v = String(value || '').trim();
                if (!v) return;
                if (!/^1\d{10}$/.test(v)) {
                    throw new Error('手机号格式不正确');
                }
            },
        },
    ]}
>
```

**建议修复**：创建统一的验证规则文件
```tsx
// frontend/src/utils/formRules.ts
export const formRules = {
  // 用户相关
  username: [
    { required: true, message: '请输入用户名' },
    { min: 3, max: 20, message: '用户名长度在 3-20 个字符' },
    { pattern: /^[a-zA-Z0-9_\-]+$/, message: '用户名只能包含字母、数字、下划线和中划线' }
  ],
  password: [
    { required: true, message: '请输入密码' },
    { min: 6, max: 20, message: '密码长度在 6-20 个字符' },
    { pattern: /^(?=.*[a-zA-Z])(?=.*\d)/, message: '密码必须包含字母和数字' }
  ],
  phone: [
    { required: true, message: '请输入手机号' },
    { pattern: /^1\d{10}$/, message: '请输入有效的手机号' }
  ],
  email: [
    { required: true, message: '请输入邮箱' },
    { type: 'email', message: '请输入有效的邮箱地址' }
  ],
  name: [
    { required: true, message: '请输入名称' },
    { min: 2, max: 50, message: '名称长度在 2-50 个字符' }
  ],
  
  // 订单相关
  orderNo: [
    { required: true, message: '请输入订单号' },
    { min: 5, max: 50, message: '订单号长度在 5-50 个字符' }
  ],
  quantity: [
    { required: true, message: '请输入数量' },
    { pattern: /^[1-9]\d*$/, message: '数量必须是正整数' }
  ],
  
  // 通用
  remark: [
    { max: 500, message: '备注不能超过 500 个字符' }
  ],
};
```

---

#### 2.2 表单错误显示不完整 ⚠️
**文件**：`frontend/src/pages/**/*.tsx` - 所有表单提交处理

**问题**：
- ❌ 只显示第一个错误
- ❌ 没有字段级别的错误提示
- ❌ 缺少表单字段高亮

**当前代码**：
```tsx
const handleSubmit = async () => {
    try {
        setSubmitLoading(true);
        const values = await form.validateFields();
        // ... 提交逻辑
    } catch (error) {
        // ❌ 只处理第一个错误
        if ((error as any).errorFields) {
            const firstError = (error as any).errorFields[0];
            message.error(firstError.errors[0] || '表单验证失败');
        } else {
            message.error((error as Error).message || '保存失败');
        }
    }
};
```

**建议修复**：
```tsx
const handleSubmit = async () => {
    try {
        setSubmitLoading(true);
        const values = await form.validateFields();
        // ... 提交逻辑
    } catch (error) {
        const errorFields = (error as any).errorFields;
        if (errorFields && errorFields.length > 0) {
            // ✅ 显示所有错误
            const messages = errorFields.map(f => f.errors[0]).filter(Boolean);
            if (messages.length === 1) {
                message.error(messages[0]);
            } else {
                message.error(`表单验证失败，请修正以下错误：\n${messages.join('\n')}`);
            }
        } else {
            message.error((error as Error).message || '保存失败');
        }
    } finally {
        setSubmitLoading(false);
    }
};
```

---

#### 2.3 类型强制转换缺少容错 ⚠️
**文件**：`frontend/src/pages/**/*.tsx`

**问题**：
- ❌ Number() 转换可能导致 NaN
- ❌ 缺少类型检查

**示例**：
```tsx
// ❌ 危险的转换
const qty = Number(values.quantity);  // 可能为 NaN
const maxQty = Math.max(0, Math.min(maxQty, Number(batchQtyByQr[qr] || 0) || 0));
```

**建议修复**：
```tsx
// ✅ 安全的转换
function toNumber(v: any, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function toInteger(v: any, fallback = 0): number {
    const n = toNumber(v, fallback);
    return Number.isInteger(n) ? n : Math.floor(n);
}

// 使用
const qty = toInteger(values.quantity, 1);
const maxQty = Math.max(0, Math.min(maxQty, toInteger(batchQtyByQr[qr], 0)));
```

---

#### 2.4 API 请求缺少超时控制 ⚠️
**文件**：`frontend/src/utils/api.ts`

**问题**：
- ❌ axios 默认超时为 0（无限制）
- ❌ 缺少请求重试机制
- ❌ 缺少并发控制

**建议修复**：
```tsx
// frontend/src/utils/api.ts
import axios from 'axios';

const api = axios.create({
    timeout: 30000,  // ✅ 设置 30s 超时
    baseURL: process.env.REACT_APP_API_URL || '/api',
});

// ✅ 添加响应拦截器处理超时
api.interceptors.response.use(
    response => response,
    error => {
        if (error.code === 'ECONNABORTED') {
            return Promise.reject(new Error('请求超时，请检查网络或重试'));
        }
        return Promise.reject(error);
    }
);

// ✅ 添加重试机制
export async function requestWithRetry(config, maxRetries = 2) {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await api(config);
        } catch (error) {
            lastError = error;
            if (i < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    throw lastError;
}
```

---

### 三、系统级别问题

#### 3.1 缺少业务日志记录 ⚠️
**问题**：
- ❌ 关键操作缺少日志
- ❌ 错误缺少追踪 ID
- ❌ 无法回溯问题

**建议修复**：
```tsx
// 添加业务日志工具
export const logger = {
    debug: (msg: string, data?: any) => console.log(`[DEBUG] ${msg}`, data),
    info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data),
    warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data),
    error: (msg: string, error?: any) => {
        const traceId = `TRC-${Date.now()}`;
        console.error(`[ERROR ${traceId}] ${msg}`, error);
        return traceId;
    }
};

// 在关键操作中使用
const handleSubmit = async () => {
    try {
        logger.info('表单提交开始');
        // ... 操作
        logger.info('表单提交成功');
    } catch (error) {
        const traceId = logger.error('表单提交失败', error);
        message.error(`操作失败，错误代码：${traceId}`);
    }
};
```

---

## ✅ 修复清单

- [ ] 小程序登录表单添加字段长度和格式验证
- [ ] 小程序网络请求添加超时和重试机制
- [ ] 小程序扫码添加数据验证和防重复
- [ ] 网页创建统一的表单验证规则文件
- [ ] 网页改进表单错误提示显示
- [ ] 网页添加类型安全的数字转换函数
- [ ] 网页 API 请求添加超时和重试控制
- [ ] 系统添加业务日志记录机制

---

## 📊 优先级排序

| 优先级 | 问题 | 影响 | 修复时间 |
|------|------|------|--------|
| 🔴 P0 | 小程序账号密码缺少验证 | 高 | 30min |
| 🔴 P0 | 网页表单错误显示不完整 | 中 | 45min |
| 🟡 P1 | 小程序网络请求缺少超时控制 | 中 | 1h |
| 🟡 P1 | 网页缺少统一验证规则 | 中 | 2h |
| 🟡 P1 | 小程序扫码缺少数据验证 | 中 | 1h |
| 🟢 P2 | 缺少业务日志记录 | 低 | 1.5h |

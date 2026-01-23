# 多端数据同步机制说明

**创建时间**: 2026-01-23  
**版本**: 1.0

---

## 概述

为了解决"撤回操作后其他页面数据不同步"的问题，实现了基于事件总线（EventBus）的多端实时数据同步机制。

## 问题背景

**用户反馈**:
> "要是有新的记录、撤回，这些全部要多端同步走的，要是有新的数据更新，全部都要抓取的，任务怎么会扭转"

**原有问题**:
1. ✅ 扫码页面完成扫码后，个人页面不会自动刷新
2. ✅ 生产页面执行退回操作后，扫码页面仍显示旧数据
3. ✅ 个人页面撤销记录后，生产页面不知道数据已变更
4. ✅ 缺乏统一的数据变更通知机制

## 解决方案架构

### 1. 事件总线 (EventBus)

**新文件**: `miniprogram/utils/eventBus.js`

#### 核心功能

```javascript
// 1. 发布事件
triggerDataRefresh('orders', {
    action: 'rollback',
    orderId: 'xxx',
});

// 2. 订阅事件
const unsubscribe = onDataRefresh((payload) => {
    console.log('数据变更:', payload);
    this.refreshData(); // 刷新当前页面数据
});

// 3. 取消订阅（页面卸载时）
unsubscribe();
```

#### 标准事件定义

```javascript
const Events = {
    // 扫码相关
    SCAN_SUCCESS: 'scan:success',          // 扫码成功
    SCAN_UNDO: 'scan:undo',                // 撤销扫码
    SCAN_ROLLBACK: 'scan:rollback',        // 回退操作
    
    // 订单相关
    ORDER_UPDATED: 'order:updated',        // 订单更新
    ORDER_PROGRESS_CHANGED: 'order:progress:changed',
    ORDER_STATUS_CHANGED: 'order:status:changed',
    
    // 任务相关
    TASK_RECEIVED: 'task:received',        // 领取任务
    TASK_RETURNED: 'task:returned',        // 退回任务
    TASK_COMPLETED: 'task:completed',      // 完成任务
    
    // 通用
    DATA_CHANGED: 'data:changed',          // 数据变更
    REFRESH_ALL: 'refresh:all',            // 刷新所有
};
```

---

### 2. 页面集成

#### 2.1 生产页面 (work/index.js)

**功能**: 监听数据变更事件，自动刷新订单列表

```javascript
// 引入事件总线
const { onDataRefresh, triggerDataRefresh } = require('../../utils/eventBus');

// 数据字段
data: {
    _unsubscribeRefresh: null, // 保存取消订阅函数
},

// onShow - 设置监听
setupDataRefreshListener() {
    if (this._unsubscribeRefresh) {
        this._unsubscribeRefresh();
    }
    
    this._unsubscribeRefresh = onDataRefresh((payload) => {
        console.log('[生产页面] 收到数据变更通知:', payload);
        this.loadOrders(true); // 刷新订单列表
    });
},

// onHide/onUnload - 取消监听
onHide() {
    if (this._unsubscribeRefresh) {
        this._unsubscribeRefresh();
        this._unsubscribeRefresh = null;
    }
},

// 退回操作后 - 触发事件
async confirmRollback() {
    await api.production.rollbackByBundle(...);
    await this.loadOrders(true);
    
    // 触发全局数据刷新事件
    triggerDataRefresh('orders', {
        action: 'rollback',
        orderId: orderId,
        bundleNo: bundleNo,
    });
}
```

#### 2.2 扫码页面 (scan/index.js)

**功能**: 扫码成功/撤销后触发全局刷新事件

```javascript
// 扫码成功后
async handleScanSuccess() {
    // ... 扫码逻辑 ...
    this.loadMyPanel(true);
    
    // 触发全局数据刷新事件
    const { triggerDataRefresh } = require('../../utils/eventBus');
    triggerDataRefresh('scans', {
        action: 'scan',
        scanType: '采购',
    });
}

// 撤销操作后
async performUndo() {
    await api.production.undoScan(undo.payload);
    this.loadMyPanel(true);
    
    // 触发全局数据刷新事件
    const { triggerDataRefresh } = require('../../utils/eventBus');
    triggerDataRefresh('scans', {
        action: 'undo',
        orderNo: undo.payload.orderNo,
        scanCode: undo.payload.scanCode,
    });
}
```

#### 2.3 个人页面 (admin/index.js)

**功能**: 监听数据变更事件，自动刷新统计和历史记录

```javascript
import { onDataRefresh } from '../../utils/eventBus';

data: {
    _unsubscribeRefresh: null,
},

onShow() {
    this.refreshAll(true);
    this.setupDataRefreshListener();
},

setupDataRefreshListener() {
    if (this._unsubscribeRefresh) {
        this._unsubscribeRefresh();
    }
    
    this._unsubscribeRefresh = onDataRefresh((payload) => {
        console.log('[个人页面] 收到数据变更通知:', payload);
        this.refreshAll(true); // 刷新统计和历史
    });
},

onHide() {
    if (this._unsubscribeRefresh) {
        this._unsubscribeRefresh();
        this._unsubscribeRefresh = null;
    }
},
```

---

## 数据流图

```
┌─────────────┐
│  扫码页面    │
│  (Scan)     │
│             │
│ 1. 扫码成功  │
│ 2. 触发事件  │──┐
└─────────────┘  │
                 │
                 ▼
          ┌──────────────┐
          │  事件总线     │
          │  (EventBus)  │
          └──────────────┘
                 │
        ┌────────┼────────┐
        │        │        │
        ▼        ▼        ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│生产页面  │ │个人页面  │ │首页      │
│(Work)    │ │(Admin)   │ │(Home)    │
│          │ │          │ │          │
│3.收到通知│ │4.收到通知│ │5.收到通知│
│6.刷新数据│ │7.刷新数据│ │8.刷新数据│
└──────────┘ └──────────┘ └──────────┘
```

---

## 事件触发时机

### 1. 扫码操作

| 操作 | 触发位置 | 事件类型 | 影响范围 |
|------|---------|---------|---------|
| 扫码成功 | scan/index.js | `triggerDataRefresh('scans')` | 所有页面 |
| 撤销扫码 | scan/index.js:performUndo | `triggerDataRefresh('scans')` | 所有页面 |

### 2. 订单操作

| 操作 | 触发位置 | 事件类型 | 影响范围 |
|------|---------|---------|---------|
| 退回操作 | work/index.js:confirmRollback | `triggerDataRefresh('orders')` | 所有页面 |
| 更新进度 | work/index.js:batchUpdateProgress | `triggerDataRefresh('orders')` | 所有页面 |
| 生成菲号 | work/index.js:confirmGenerateBundle | `triggerDataRefresh('orders')` | 所有页面 |

### 3. 任务操作

| 操作 | 触发位置 | 事件类型 | 影响范围 |
|------|---------|---------|---------|
| 领取任务 | scan/index.js:receiveCuttingTask | `triggerDataRefresh('tasks')` | 所有页面 |
| 退回任务 | scan/index.js:withdrawTask | `triggerDataRefresh('tasks')` | 所有页面 |

---

## 性能优化

### 1. 防抖机制

事件触发后，页面刷新可能需要防抖，避免短时间内多次刷新：

```javascript
let refreshTimer = null;

setupDataRefreshListener() {
    this._unsubscribeRefresh = onDataRefresh((payload) => {
        // 清除之前的定时器
        if (refreshTimer) clearTimeout(refreshTimer);
        
        // 300ms 后刷新（防抖）
        refreshTimer = setTimeout(() => {
            console.log('[页面] 刷新数据:', payload);
            this.loadOrders(true);
            refreshTimer = null;
        }, 300);
    });
}
```

### 2. 条件刷新

根据事件类型判断是否需要刷新：

```javascript
setupDataRefreshListener() {
    this._unsubscribeRefresh = onDataRefresh((payload) => {
        // 只响应订单相关的变更
        if (payload.type === 'orders' || payload.action === 'rollback') {
            this.loadOrders(true);
        }
        // 扫码操作只刷新统计，不刷新列表
        else if (payload.type === 'scans') {
            this.loadStats();
        }
    });
}
```

### 3. 页面可见性检测

只有当前可见的页面才刷新数据：

```javascript
setupDataRefreshListener() {
    this._unsubscribeRefresh = onDataRefresh((payload) => {
        // 检查页面是否可见（通过路由栈判断）
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        const isVisible = currentPage.route === 'pages/work/index';
        
        if (isVisible) {
            console.log('[页面可见] 刷新数据');
            this.loadOrders(true);
        } else {
            console.log('[页面不可见] 跳过刷新');
        }
    });
}
```

---

## 调试方法

### 1. 控制台日志

所有页面都会打印数据变更通知：

```
[生产页面] 收到数据变更通知: {type: 'scans', action: 'undo', ...}
[个人页面] 收到数据变更通知: {type: 'scans', action: 'undo', ...}
```

### 2. 事件监听统计

查看当前有多少页面在监听事件：

```javascript
const { eventBus } = require('../../utils/eventBus');

// 在控制台执行
console.log('监听器数量:', eventBus.getEventCount('data:changed'));
console.log('总事件数:', eventBus.getEventCount());
```

### 3. 手动触发事件

测试多端同步是否正常：

```javascript
const { triggerDataRefresh } = require('../../utils/eventBus');

// 手动触发刷新事件
triggerDataRefresh('test', {
    action: 'manual',
    timestamp: Date.now(),
});
```

---

## 已知限制

### 1. 跨小程序实例

事件总线只能在同一个小程序实例内工作，不能跨设备或跨用户同步。

**解决方案**: 需要配合轮询机制（30秒）或 WebSocket 实现真正的多端同步。

### 2. 页面销毁

如果页面被销毁（不是隐藏），监听器会失效，下次进入时需要重新设置。

**解决方案**: 在 `onShow` 中总是调用 `setupDataRefreshListener()`。

### 3. 内存泄漏风险

如果忘记在 `onHide/onUnload` 中取消订阅，会导致内存泄漏。

**解决方案**: 统一使用 `_unsubscribeRefresh` 变量管理取消订阅函数。

---

## 测试检查清单

### 基础功能

- [ ] 扫码成功后，个人页面统计自动更新
- [ ] 撤销扫码后，生产页面订单进度回退
- [ ] 退回操作后，所有页面数据同步
- [ ] 生成菲号后，扫码页面能识别新菲号

### 边界情况

- [ ] 快速连续操作（如连续扫码3次），数据是否正确
- [ ] 切换标签页后，事件监听是否正常
- [ ] 页面长时间停留后返回，数据是否更新
- [ ] 多人同时操作（通过轮询机制验证）

### 性能测试

- [ ] 事件触发频率（不超过每秒10次）
- [ ] 页面刷新耗时（<500ms）
- [ ] 内存占用（长时间使用不增长）

---

## 后续优化方向

### 1. WebSocket 实时推送

取代轮询机制，实现真正的实时多端同步：

```javascript
// 伪代码
const ws = wx.connectSocket({ url: 'wss://xxx' });

ws.onMessage((msg) => {
    const { type, action, data } = JSON.parse(msg.data);
    triggerDataRefresh(type, { action, ...data });
});
```

### 2. 本地缓存策略

事件触发后先更新本地缓存，再请求服务器：

```javascript
onDataRefresh((payload) => {
    // 1. 立即更新本地缓存（乐观更新）
    this.updateLocalCache(payload);
    
    // 2. 后台请求服务器（最终一致性）
    this.loadFromServer().then(data => {
        this.updateLocalCache(data);
    });
});
```

### 3. 事件优先级

区分高优先级事件（立即刷新）和低优先级事件（延迟刷新）：

```javascript
triggerDataRefresh('orders', {
    action: 'rollback',
    priority: 'high', // 高优先级，立即刷新
});

triggerDataRefresh('stats', {
    action: 'update',
    priority: 'low', // 低优先级，延迟刷新
});
```

---

*文档维护: GitHub Copilot*  
*最后更新: 2026-01-23*

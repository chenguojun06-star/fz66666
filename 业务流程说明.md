# 服装生产扫码系统 - 工作流程详解

## 📋 目录
1. [系统架构](#系统架构)
2. [核心工作流程](#核心工作流程)
3. [关键功能实现](#关键功能实现)
4. [数据流转](#数据流转)

---

## 🏗️ 系统架构

### 技术栈
```
前端: 微信小程序 (WXML/WXSS/JS)
后端: Spring Boot (Java)
数据库: MySQL
```

### 核心模块
```
miniprogram/pages/scan/     # 扫码页面
miniprogram/utils/           # 工具类
  ├── api.js                 # API接口封装
  ├── reminderManager.js     # 提醒管理器
  ├── errorHandler.js        # 错误处理
  └── dataValidator.js       # 数据验证
backend/src/main/java/       # 后端代码
```

---

## 🔄 核心工作流程

### 1️⃣ **扫码主流程**

```javascript
用户点击扫码按钮
    ↓
调用 onScan()
    ↓
[启用自动识别?]
    ├── YES → 查询订单详情 → detectNextStage() → 自动选择进度节点
    └── NO  → 使用手动选择的节点
    ↓
调用微信扫码 API (wx.scanCode)
    ↓
解析二维码内容 parseScanContent()
    ├── 提取订单号 (orderNo)
    ├── 提取款号 (styleNo)
    ├── 提取颜色 (color)
    ├── 提取尺寸 (size)
    ├── 提取数量 (quantity)
    └── 提取扎号 (bundleNo)
    ↓
构建扫码数据 payload
    ↓
打开确认弹窗 openScanConfirm()
    ├── 显示订单信息
    ├── 15秒倒计时
    └── 等待用户确认
    ↓
用户点击确认
    ↓
执行扫码 executeScanConfirm()
    ├── [是否采购类型?]
    │   ├── YES → 处理物料采购 receivePurchases()
    │   │         └── 添加提醒 reminderManager.addReminder()
    │   └── NO  → 继续生产流程
    ├── 调用后端API api.production.executeScan()
    ├── [是否质检?]
    │   └── YES → 添加提醒 reminderManager.addReminder()
    └── 显示结果 & 刷新记录
```

---

### 2️⃣ **自动识别进度逻辑**

```javascript
detectNextStage(orderDetail) {
    // 生产流程顺序
    const stages = ['采购', '裁剪', '缝制', '车缝', '大烫', '质检', '包装', '入库'];
    
    // 获取当前进度
    currentProgress = orderDetail.currentProgress;
    
    // 特殊情况处理
    if (未开始) {
        if (有未完成的物料采购) {
            return '采购';
        }
        return '裁剪'; // 默认从裁剪开始
    }
    
    // 根据当前进度返回下一个节点
    currentIndex = stages.indexOf(currentProgress);
    nextStage = stages[currentIndex + 1];
    
    return nextStage;
}
```

**示例场景：**
- 订单当前进度：`缝制` → 自动识别为：`车缝`
- 订单当前进度：`车缝` → 自动识别为：`大烫`
- 订单当前进度：`质检` → 自动识别为：`包装`

---

### 3️⃣ **质检处理流程**

#### 领取质检任务
```javascript
扫码时 (scanType === 'quality')
    ↓
设置 qualityResult = 'pending' (待质检)
    ↓
调用 executeScan() 提交到后端
    ↓
添加提醒 reminderManager.addReminder({
    orderId: orderNo,
    type: '质检',
    timestamp: Date.now()
})
    ↓
扫码记录显示 "质检 - 待处理" (橙色标签)
```

#### 处理质检结果
```javascript
用户在扫码记录中点击"处理"按钮
    ↓
调用 onHandleQuality(item)
    ↓
打开质检结果弹窗 qualityModal
    ├── 显示订单信息
    ├── 选择合格/次品
    └── [次品] → 填写次品详情
        ├── 次品数量
        ├── 问题类型 (多选)
        ├── 处理方式 (返修/报废)
        └── 备注
    ↓
用户点击提交
    ↓
调用 submitQualityResult()
    ├── 验证表单数据
    ├── 调用 API api.production.submitQualityResult()
    ├── 移除提醒 reminderManager.removeRemindersByOrder()
    └── 刷新扫码记录
```

---

### 4️⃣ **物料采购处理流程**

#### 领取采购任务
```javascript
扫码时 (progressStage === '采购')
    ↓
查询物料采购信息 getMaterialPurchases({
    scanCode: scanCode,
    orderNo: orderNo
})
    ↓
弹窗显示所有面辅料
    ├── 物料名称
    ├── 需求数量 (自动填充)
    ├── 采购数量 (可修改)
    └── 备注
    ↓
用户确认后调用 receivePurchases()
    ├── 领取采购任务
    └── 添加提醒
```

#### 处理采购结果
```javascript
用户在扫码记录中点击"处理"按钮
    ↓
调用 onHandleProcurement(item)
    ↓
查询订单详情获取物料列表
api.production.orderDetail(orderNo)
    ↓
打开采购处理弹窗 procurementModal
    ├── 显示订单所有物料
    └── 每个物料可填写
        ├── 采购数量
        └── 备注
    ↓
用户点击提交
    ↓
调用 submitProcurementResult()
    ├── 验证至少填写一个物料
    ├── 调用 API updateArrivedQuantity() (循环更新每个物料)
    ├── 移除提醒 reminderManager.removeRemindersByOrder()
    └── 刷新扫码记录
```

---

### 5️⃣ **提醒系统流程**

```javascript
// 添加提醒
reminderManager.addReminder({
    orderId: '订单号',
    type: '质检' | '采购',
    timestamp: Date.now()
})
    ↓
保存到本地存储 wx.setStorageSync('reminders', list)

// 检查提醒 (10小时间隔)
reminderManager.checkAndShowReminders()
    ↓
获取所有提醒 getReminders()
    ↓
过滤出超过10小时未处理的提醒
    ↓
显示弹窗提示用户

// 主页显示提醒
loadReminders()
    ↓
获取超过10小时的提醒
    ↓
设置红点数量 reminderCount
    ↓
用户点击提醒
    ↓
handleReminderClick(reminder)
    ├── [质检] → 跳转到工作台
    └── [采购] → 跳转到扫码页面
```

---

## 🔑 关键功能实现

### 1. 二维码解析

```javascript
parseScanContent(scanCode) {
    // 支持多种格式
    // 格式1: PO123-ST456-红色-M-100-1
    // 格式2: orderNo?styleNo=xxx&color=xxx&size=xxx&quantity=100
    
    // 解析逻辑
    1. 尝试解析为查询参数格式
    2. 尝试解析为飞码格式 (PO-ST-颜色-尺寸-数量-扎号)
    3. 回退到基础解析
    
    return {
        scanCode: '原始码',
        orderNo: '订单号',
        styleNo: '款号',
        color: '颜色',
        size: '尺寸',
        quantity: 数量,
        bundleNo: '扎号'
    }
}
```

### 2. 防重复扫码

```javascript
// 使用 Map 存储最近扫码记录
recentScanExpires.set(dedupKey, expireTime);

// 构建去重键
dedupKey = [
    scanCode,
    scanType,
    progressStage,
    processCode,
    warehouse,
    remark,
    quantity
].join('|');

// 2.5秒内重复扫码会被拦截
if (isRecentDuplicate(dedupKey)) {
    wx.showToast({ title: '已处理', icon: 'none' });
    return;
}
```

### 3. 15秒倒计时自动关闭

```javascript
openScanConfirm(payload, detail, materialPurchases) {
    const expireAt = Date.now() + 15000; // 15秒后过期
    
    // 启动倒计时
    confirmTimer = setTimeout(() => {
        this.closeScanConfirm(true);
    }, 15000);
    
    // 每秒更新显示
    confirmTickTimer = setInterval(() => {
        const remain = Math.max(0, Math.ceil((expireAt - Date.now()) / 1000));
        this.setData({ 'scanConfirm.remain': remain });
    }, 1000);
}
```

### 4. 扫码记录管理

```javascript
loadHistoryRecords() {
    // 获取个人扫码历史
    const data = await api.production.myScanHistory({
        page: 1,
        pageSize: 10
    });
    
    // 标记待处理记录
    list.forEach(item => {
        // 质检待处理
        if (item.scanType === 'quality' && item.qualityResult === 'pending') {
            item.needHandle = true;
        }
        // 采购待处理
        if (item.isProcurement && !item.procurementCompleted) {
            item.needHandle = true;
        }
    });
}
```

---

## 📊 数据流转

### 前端 → 后端

```javascript
// 扫码提交
POST /api/production/scan/execute
{
    requestId: '请求ID',
    scanCode: '二维码内容',
    scanType: 'quality' | 'cutting' | 'production' | ...,
    quantity: 100,
    orderNo: 'PO123',
    styleNo: 'ST456',
    color: '红色',
    size: 'M',
    progressStage: '质检',
    processName: '质检',
    qualityResult: 'pending' // 质检领取时
}

// 质检结果提交
POST /api/production/scan/submit-quality-result
{
    scanId: '扫码记录ID',
    orderNo: 'PO123',
    qualityResult: 'qualified' | 'defective',
    defectiveQuantity: 10, // 次品数量
    defectTypes: '外观完整性问题、尺寸精度问题',
    handleMethod: '返修' | '报废',
    remark: '备注信息'
}

// 采购数量更新
POST /api/production/purchase/update-arrived-quantity
{
    id: '物料ID',
    arrivedQuantity: 100,
    remark: '备注'
}
```

### 后端 → 前端

```javascript
// 扫码结果
{
    code: 200,
    message: '成功',
    data: {
        scanRecord: {
            id: 'xxx',
            orderNo: 'PO123',
            styleNo: 'ST456',
            processName: '质检',
            quantity: 100,
            qualityResult: 'pending'
        },
        orderInfo: {
            orderNo: 'PO123',
            currentProgress: '车缝',
            materialPurchases: [...]
        }
    }
}

// 扫码历史
{
    code: 200,
    data: {
        list: [
            {
                id: 'xxx',
                orderNo: 'PO123',
                scanType: 'quality',
                qualityResult: 'pending',
                isProcurement: false,
                procurementCompleted: false,
                ...
            }
        ],
        total: 100
    }
}
```

---

## 🎯 完整场景示例

### 场景1: 质检流程
```
1. 用户打开扫码页面，启用自动识别
2. 扫描订单二维码 "PO123-ST456-红色-M-100"
3. 系统查询订单进度：当前为"车缝"
4. 自动识别下一节点：质检
5. 弹窗显示订单信息，倒计时15秒
6. 用户点击"领取"
7. 系统提交 qualityResult='pending'
8. 添加10小时提醒
9. 扫码记录显示 "质检 - 待处理"
10. 用户稍后在记录中点击"处理"
11. 打开质检结果弹窗
12. 选择"次品"，填写详情：
    - 次品数量: 5
    - 问题类型: 外观完整性问题
    - 处理方式: 返修
13. 点击提交
14. 系统移除提醒，更新记录状态
```

### 场景2: 物料采购流程
```
1. 用户扫描采购订单二维码
2. 系统识别为"采购"节点
3. 查询订单的物料列表：
   - 面料A: 需求100米
   - 辅料B: 需求50个
4. 弹窗显示物料信息
5. 用户确认领取
6. 系统添加采购提醒
7. 扫码记录显示 "物料采购 - 待处理"
8. 用户稍后点击"处理"
9. 打开采购处理弹窗
10. 填写实际采购数量：
    - 面料A: 105米
    - 辅料B: 52个
11. 点击提交
12. 系统调用API更新每个物料
13. 移除提醒，完成采购
```

---

## 🔧 核心代码片段

### API 封装
```javascript
// miniprogram/utils/api.js
const production = {
    executeScan(payload) {
        return ok('/api/production/scan/execute', 'POST', payload);
    },
    
    submitQualityResult(payload) {
        return ok('/api/production/scan/submit-quality-result', 'POST', payload);
    },
    
    updateArrivedQuantity(payload) {
        return ok('/api/production/purchase/update-arrived-quantity', 'POST', payload);
    }
};
```

### 提醒管理
```javascript
// miniprogram/utils/reminderManager.js
function addReminder({ orderId, type, timestamp }) {
    const reminders = getReminders();
    reminders.push({
        id: Date.now() + '_' + Math.random(),
        orderId,
        type,
        timestamp,
        createdAt: Date.now()
    });
    wx.setStorageSync('reminders', reminders);
}

function checkAndShowReminders() {
    const reminders = getReminders();
    const now = Date.now();
    const pending = reminders.filter(r => {
        const elapsed = now - r.timestamp;
        return elapsed >= 10 * 60 * 60 * 1000; // 10小时
    });
    
    if (pending.length > 0) {
        wx.showModal({
            title: '待处理提醒',
            content: `您有${pending.length}个任务待处理`
        });
    }
}
```

---

## 📱 用户界面

### 扫码页面布局
```
┌─────────────────────────────┐
│  [自动识别] ON  🤖 扫码自动识别 │
├─────────────────────────────┤
│  [数量: 100]  [扫码按钮]      │
├─────────────────────────────┤
│  扫码记录                     │
│  ┌───────────────────────┐  │
│  │ PO123 · ST456 · 红色   │  │
│  │ 质检 ×100  [处理]      │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ PO124 · ST457 · 蓝色   │  │
│  │ 物料采购 ×50  [处理]   │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

---

## 🎓 总结

整个系统的核心设计理念：

1. **智能化**: 自动识别进度，减少人工选择
2. **提醒机制**: 10小时提醒确保任务不遗漏
3. **分步处理**: 领取和处理分离，灵活安排时间
4. **防错设计**: 防重复扫码、15秒倒计时、表单验证
5. **用户友好**: 清晰的状态提示、便捷的操作流程

系统实现了从"扫码领取 → 记录显示 → 提醒通知 → 处理结果"的完整闭环。

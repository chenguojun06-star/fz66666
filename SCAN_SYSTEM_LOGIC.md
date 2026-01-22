# 扫码系统逻辑详解

> 最后更新：2026年1月22日

## 📋 目录
- [核心优化总结](#核心优化总结)
- [扫码流程图](#扫码流程图)
- [菲号识别逻辑](#菲号识别逻辑)
- [防重复机制](#防重复机制)
- [配置系统](#配置系统)
- [技术架构](#技术架构)

---

## 🎯 核心优化总结

### 1. **智能工序识别（核心功能）**
**问题**：原来工人需手动切换工序，容易选错，效率低

**方案**：扫码次数决定工序
- 菲号01第1次扫 → 自动识别为"做领"
- 菲号01第2次扫 → 自动识别为"上领"  
- 菲号01第3次扫 → 自动识别为"埋夹"
- ...以此类推

**效果**：
- ✅ 工人无需手动选工序，扫码即可
- ✅ 避免选错工序导致计件错误
- ✅ 提升扫码效率 50%+

---

### 2. **防重复扫码保护**
**问题**：工人误扫、连续扫码导致重复计件

**方案**：动态计算最小间隔
```javascript
最小间隔时间 = max(30秒, 菲号数量 × 工序预计分钟 × 60 × 50%)
```

**示例**：
- 菲号：10件
- 工序：做领（预计5分钟/件）
- 预期完成时间：10 × 5 = 50分钟
- 最小间隔：50 × 60 × 50% = 25分钟

在25分钟内重复扫码会被拦截，显示：
> ⚠️ 10件预计需50分钟，3分钟前已扫过

**效果**：
- ✅ 防止误操作导致重复计件
- ✅ 允许快手工人提前完成（50%缓冲）
- ✅ 保护工厂利益，避免虚假计件

---

### 3. **动态工序配置**
**问题**：不同款式工序不同，硬编码无法适应

**方案**：从订单工艺模板动态读取
```javascript
// 旧代码（硬编码）
const sewingProcessList = ['做领', '上领', '埋夹', '冚脚边', '钉扣'];

// 新代码（动态读取）
let sewingProcessList = orderDetail.progressNodeUnitPrices
    .filter(node => node.progressStage === '车缝')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(node => node.name);
```

**效果**：
- ✅ 支持任意数量工序配置
- ✅ 不同订单可配置不同工序流程
- ✅ PC端模板中心统一管理

---

### 4. **工序时间配置界面**
**位置**：PC端 → 模板中心 → 工艺模板 → 工序单价配置

**新增字段**：`estimatedMinutes`（预计时间，分钟）

**示例配置**：
| 工序名称 | 单价(元) | 预计时间(分/件) |
|---------|---------|----------------|
| 做领    | 2.5     | 5              |
| 上领    | 1.8     | 3              |
| 埋夹    | 2.0     | 4              |
| 冚脚边  | 1.5     | 3              |
| 钉扣    | 1.0     | 2              |

**效果**：
- ✅ 防重复时间根据实际工序灵活调整
- ✅ 可选字段，不填则使用默认1分钟/件
- ✅ 管理端统一配置，扫码端自动生效

---

### 5. **菲号数据验证**
**问题**：二维码中的数量可能不准确

**方案**：从裁剪表获取准确数量
```javascript
// 调用裁剪表API验证
const bundleInfo = await api.production.getCuttingBundle(orderNo, bundleNo);
const accurateQuantity = bundleInfo.quantity;  // 使用官方数量
```

**效果**：
- ✅ 数量来自裁剪表，数据准确
- ✅ 验证菲号存在性，防止扫描无效菲号
- ✅ 失败时降级使用二维码数量，不影响业务

---

### 6. **界面优化**
**变更**：
1. ❌ 删除 "🤖 自动识别当前进度节点" 提示
2. ✅ 添加 生产节点选择器（采购/裁剪/车缝/大烫/质检/包装/入库）
3. ❌ 删除 "缝制(计件)" 过时选项

**布局**：
```
┌─────────────────────────────────────┐
│ [车缝 ▼]  [数量输入]  [扫码按钮]   │
└─────────────────────────────────────┘
```

**交互**：
- 默认自动识别，跳转到对应节点
- 识别错误时，点击选择器手动修正
- 可在扫码前预选节点

---

## 🔄 扫码流程图

```
用户扫码
   ↓
解析二维码（订单号、菲号、数量等）
   ↓
判断：是否启用自动识别？
   ├─ 是 → 查询订单详情
   │       ↓
   │   判断：是否在车缝阶段？
   │       ├─ 是（有菲号）→ 【菲号识别逻辑】
   │       │                   ↓
   │       │               验证菲号（调用裁剪表API）
   │       │                   ↓
   │       │               查询扫码历史（统计次数）
   │       │                   ↓
   │       │               防重复检查
   │       │                   ├─ 重复 → ⚠️ 拦截，提示等待时间
   │       │                   └─ 通过 → 继续
   │       │                           ↓
   │       │                       根据次数确定工序
   │       │                           ↓
   │       │                       自动切换到对应节点
   │       │
   │       └─ 否（裁剪及之前）→ 【订单识别逻辑】
   │                               ↓
   │                           根据订单进度判断
   │                               ↓
   │                           自动切换到对应节点
   │
   └─ 否 → 使用手动选择的节点
           ↓
弹出确认弹窗
   ├─ 显示：订单号、款号、数量、工序
   ├─ 用户可修正节点选择
   └─ 确认 → 提交扫码记录
              ↓
          保存到数据库
              ↓
          更新今日统计
              ↓
          显示扫码结果
```

---

## 🎯 菲号识别逻辑

### 核心算法

```javascript
/**
 * 菲号识别 - 根据扫码次数确定工序
 * @param {string} orderNo - 订单号
 * @param {string} bundleNo - 菲号
 * @param {number} bundleQuantity - 菲号数量
 * @param {object} orderDetail - 订单详情
 */
async detectNextStageByBundle(orderNo, bundleNo, bundleQuantity, orderDetail) {
    // 1. 验证菲号，获取准确数量
    const bundleInfo = await api.production.getCuttingBundle(orderNo, bundleNo);
    const accurateQuantity = bundleInfo.quantity;  // 从裁剪表获取
    
    // 2. 查询扫码历史
    const historyRes = await api.production.myScanHistory({
        orderNo: orderNo,
        bundleNo: bundleNo
    });
    const scanCount = historyRes.records.length;  // 统计次数
    
    // 3. 获取工序列表（动态）
    let sewingProcessList = orderDetail.progressNodeUnitPrices
        .filter(node => node.progressStage === '车缝')
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(node => node.name);
    // 例如：['做领', '上领', '埋夹', '冚脚边', '钉扣']
    
    // 4. 获取工序时间配置
    let processTimeConfig = {};  // { '做领': 5, '上领': 3, ... }
    orderDetail.progressNodeUnitPrices.forEach(node => {
        if (node.name && node.estimatedMinutes > 0) {
            processTimeConfig[node.name] = node.estimatedMinutes;
        }
    });
    
    // 5. 防重复检查
    if (scanCount > 0) {
        const lastRecord = historyRes.records[0];
        const lastScanTime = new Date(lastRecord.scanTime).getTime();
        const currentTime = Date.now();
        const timeDiff = (currentTime - lastScanTime) / 1000;  // 秒
        
        // 计算最小间隔
        const configMinutes = processTimeConfig[lastRecord.processName] || 1;
        const expectedTime = accurateQuantity * configMinutes * 60;  // 秒
        const minInterval = Math.max(30, expectedTime * 0.5);  // 50%缓冲
        
        if (timeDiff < minInterval) {
            // 🚫 重复扫码，拦截
            return {
                isDuplicate: true,
                hint: `⚠️ ${accurateQuantity}件预计需${Math.floor(expectedTime/60)}分钟，${Math.floor(timeDiff/60)}分钟前已扫过`
            };
        }
    }
    
    // 6. 根据扫码次数确定工序
    if (scanCount < sewingProcessList.length) {
        // 还在车缝工序内
        const nextProcessName = sewingProcessList[scanCount];
        return {
            processName: nextProcessName,  // 例如：第0次 → '做领'
            progressStage: '车缝',
            hint: `${nextProcessName} (第${scanCount + 1}/${sewingProcessList.length}次)`,
            quantity: accurateQuantity
        };
    } else {
        // 车缝工序都完成，进入下一阶段
        return {
            processName: '大烫',
            progressStage: '大烫',
            hint: '车缝已完成'
        };
    }
}
```

---

## 🛡️ 防重复机制

### 时间计算公式

```
预期完成时间(秒) = 菲号数量 × 工序预计时间(分) × 60
最小间隔时间(秒) = max(30, 预期完成时间 × 50%)
```

### 实例演算

**场景1：正常速度**
```
菲号：20件
工序：上领（配置3分钟/件）
预期时间：20 × 3 = 60分钟
最小间隔：60 × 60 × 50% = 30分钟

第1次扫码 → 9:00 ✅ 记录
第2次扫码 → 9:15 ❌ 拦截（仅过15分钟）
第2次扫码 → 9:35 ✅ 记录（过了35分钟）
```

**场景2：快手工人**
```
菲号：10件
工序：钉扣（配置2分钟/件）
预期时间：10 × 2 = 20分钟
最小间隔：20 × 60 × 50% = 10分钟

实际用时：12分钟 ✅ 通过（大于10分钟）
```

**场景3：小批量**
```
菲号：3件
工序：做领（配置5分钟/件）
预期时间：3 × 5 = 15分钟
最小间隔：max(30, 15×60×50%) = 30秒（使用最小值）

实际用时：40秒 ✅ 通过
```

### 拦截提示样式

```
┌─────────────────────────────────┐
│  ⚠️ 20件预计需60分钟，15分钟前   │
│     已扫过                       │
└─────────────────────────────────┘
```

---

## ⚙️ 配置系统

### PC端配置路径
```
登录PC管理端
 → 模板中心
   → 工艺模板
     → 选择模板
       → 工序单价配置
         → 添加/编辑工序
           ├─ 工序名称：做领
           ├─ 单价：2.5元
           └─ 预计时间：5分钟 ⬅️ 新增字段
```

### 配置示例

**衬衫工艺模板**
```json
{
  "templateName": "衬衫标准工艺",
  "steps": [
    {
      "progressStage": "车缝",
      "processName": "做领",
      "unitPrice": 2.5,
      "estimatedMinutes": 5,
      "sortOrder": 1
    },
    {
      "progressStage": "车缝",
      "processName": "上领",
      "unitPrice": 1.8,
      "estimatedMinutes": 3,
      "sortOrder": 2
    },
    {
      "progressStage": "车缝",
      "processName": "埋夹",
      "unitPrice": 2.0,
      "estimatedMinutes": 4,
      "sortOrder": 3
    },
    {
      "progressStage": "车缝",
      "processName": "钉扣",
      "unitPrice": 1.0,
      "estimatedMinutes": 2,
      "sortOrder": 4
    }
  ]
}
```

**T恤工艺模板**（简化版）
```json
{
  "templateName": "T恤简易工艺",
  "steps": [
    {
      "progressStage": "车缝",
      "processName": "车领",
      "unitPrice": 1.5,
      "estimatedMinutes": 2,
      "sortOrder": 1
    },
    {
      "progressStage": "车缝",
      "processName": "车袖",
      "unitPrice": 1.2,
      "estimatedMinutes": 2,
      "sortOrder": 2
    },
    {
      "progressStage": "车缝",
      "processName": "车边",
      "unitPrice": 1.0,
      "estimatedMinutes": 1,
      "sortOrder": 3
    }
  ]
}
```

### 数据流转

```
PC端配置
    ↓
保存到 t_template_library 表
    ↓
订单引用模板
    ↓
存储到 t_production_order.progressNodeUnitPrices (JSON)
    ↓
小程序查询订单详情
    ↓
orderDetail.progressNodeUnitPrices 数组
    ↓
动态生成工序列表和时间配置
    ↓
用于扫码识别和防重复计算
```

---

## 🏗️ 技术架构

### 前端（小程序）
**文件**：`miniprogram/pages/scan/index.js`

**核心方法**：
- `detectNextStageByBundle()` - 菲号识别逻辑
- `onScan()` - 扫码入口，协调各模块
- `onConfirmScan()` - 提交扫码记录

**关键数据结构**：
```javascript
{
  scanTypeOptions: [
    { label: '采购', value: 'procurement', progressStage: '采购' },
    { label: '裁剪', value: 'cutting', progressStage: '裁剪' },
    { label: '车缝', value: 'production', progressStage: '车缝' },
    { label: '大烫', value: 'production', progressStage: '大烫' },
    { label: '质检', value: 'quality', progressStage: '质检' },
    { label: '包装', value: 'production', progressStage: '包装' },
    { label: '入库', value: 'warehouse' }
  ]
}
```

### 后端 API

**订单详情**：
```
GET /api/production/order/detail/{id}

返回：
{
  "orderNo": "PO20260122001",
  "currentProgressName": "车缝",
  "progressNodeUnitPrices": [
    {
      "progressStage": "车缝",
      "name": "做领",
      "unitPrice": 2.5,
      "estimatedMinutes": 5,
      "sortOrder": 1
    },
    ...
  ]
}
```

**扫码历史**：
```
GET /api/production/scan/my-history
参数：{ orderNo, bundleNo }

返回：
{
  "records": [
    {
      "scanTime": "2026-01-22 09:00:00",
      "processName": "做领",
      "quantity": 20
    }
  ]
}
```

**裁剪菲号查询**：
```
GET /api/production/cutting/by-no
参数：{ orderNo, bundleNo }

返回：
{
  "bundleNo": "01",
  "quantity": 20,
  "qrCode": "PO20260122001-01-20",
  "status": "completed"
}
```

### 数据库表

**扫码记录**：`t_scan_record`
```sql
CREATE TABLE t_scan_record (
  id BIGINT PRIMARY KEY,
  production_order_no VARCHAR(50),
  bundle_no VARCHAR(20),          -- 菲号
  scan_code VARCHAR(200),
  scan_type VARCHAR(20),
  progress_stage VARCHAR(50),
  process_name VARCHAR(100),      -- 工序名称
  quantity INT,
  scan_time DATETIME,
  user_id BIGINT,
  INDEX idx_order_bundle (production_order_no, bundle_no),
  INDEX idx_scan_time (scan_time)
);
```

**裁剪菲号**：`t_cutting_bundle`
```sql
CREATE TABLE t_cutting_bundle (
  id BIGINT PRIMARY KEY,
  production_order_no VARCHAR(50),
  bundle_no VARCHAR(20),          -- 菲号
  quantity INT,                   -- 准确数量
  qr_code VARCHAR(200),
  status VARCHAR(20),
  create_time DATETIME,
  UNIQUE KEY uk_order_bundle (production_order_no, bundle_no)
);
```

---

## 📊 效果对比

### 优化前
```
工人操作流程：
1. 手动选择工序（做领）
2. 扫码
3. 输入数量
4. 提交
   ↓
下一个菲号：
1. 手动切换工序（上领）← 容易忘记/选错
2. 扫码
3. 输入数量
4. 提交

问题：
❌ 每次都要手动切换工序
❌ 容易选错导致计件错误
❌ 可以连续扫码刷单
❌ 工序列表写死，不灵活
```

### 优化后
```
工人操作流程：
1. 扫码 → 自动识别"做领"
2. 自动填充数量
3. 确认提交
   ↓
下一个菲号（同订单）：
1. 扫码 → 自动识别"上领" ← 自动切换！
2. 自动填充数量
3. 确认提交

优势：
✅ 完全自动化，无需手动选择
✅ 根据扫码次数精准识别工序
✅ 动态防重复，避免刷单
✅ 工序配置化，支持任意流程
✅ 数据准确性提升（从裁剪表获取）
```

---

## 🎓 使用建议

### 管理员配置指南
1. **创建工艺模板**（PC端 → 模板中心）
   - 按实际工序顺序添加
   - 配置合理的单价
   - 填写预计时间（可选，建议填写）

2. **订单绑定模板**
   - 下单时选择对应工艺模板
   - 系统自动继承工序配置

3. **监控防重复效果**
   - 观察扫码记录，是否有异常密集扫码
   - 根据实际情况调整工序预计时间

### 工人使用指南
1. **首次扫码**
   - 确保选择器在"车缝"节点
   - 扫描菲号二维码
   - 确认工序和数量，提交

2. **后续扫码（同菲号）**
   - 直接扫码即可
   - 系统自动切换到下一个工序
   - 如提示"重复扫码"，说明时间未到，等待后再扫

3. **手动修正**
   - 如自动识别错误，点击节点选择器修改
   - 适用于跳过某个工序等特殊情况

---

## 🔧 故障排查

### Q1：扫码后没有自动切换工序
**排查**：
1. 检查订单是否绑定了工艺模板
2. 检查工序配置中 `progressStage` 是否为"车缝"
3. 检查菲号是否存在于裁剪表

### Q2：防重复一直拦截
**排查**：
1. 检查工序预计时间配置是否过大
2. 检查菲号数量是否正确
3. 可临时通过手动选择器切换到下一工序

### Q3：工序顺序错乱
**排查**：
1. 检查模板配置中的 `sortOrder` 字段
2. 确保 `sortOrder` 按 1,2,3... 递增
3. 重新保存模板生效

---

## 📝 版本历史

**v2.0** - 2026年1月22日
- ✅ 实现菲号基于扫码次数的工序识别
- ✅ 动态防重复机制
- ✅ 工序时间配置系统
- ✅ 菲号数据验证
- ✅ 界面优化：生产节点选择器
- ✅ 移除过时的"缝制(计件)"选项

**v1.0** - 之前版本
- 基础扫码功能
- 手动选择工序
- 固定防重复时间（30秒）

---

## 🚀 未来规划

### 短期（1-2周）
- [ ] 扫码记录支持批量撤销
- [ ] 防重复时间学习算法（根据历史数据优化）
- [ ] 工序完成度实时看板

### 中期（1个月）
- [ ] 工人计件报表自动生成
- [ ] 异常扫码预警（速度过快/过慢）
- [ ] 工序时间自动优化建议

### 长期（3个月）
- [ ] AI预测工序完成时间
- [ ] 生产进度可视化大屏
- [ ] 多工序并行支持

---

## 📞 技术支持

如有问题，请联系技术团队或查阅：
- 代码文件：`miniprogram/pages/scan/index.js`
- API文档：`backend/README.md`
- 配置界面：PC端 → 模板中心

---

**文档维护者**：系统开发团队  
**最后更新**：2026年1月22日

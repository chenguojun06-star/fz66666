# 采购状态显示修复 (2026-01-24)

## 🐛 问题描述

### 问题1：PC端显示异常
在PC端"我的订单"列表中，采购还没有开始，系统就自动填写了采购完成时间（2026-01-24 04:08），导致显示采购已完成。

### 问题2：手机端显示不一致
手机端生产页面显示订单处于"裁剪"环节，与PC端不一致，实际上订单还没有开始采购。

### 根本原因
1. **后端SQL查询问题**：采购开始时间的判断条件过于宽松，只要采购单状态不是'pending'或'cancelled'就会显示时间
2. **currentProcessName判断逻辑不完善**：没有充分考虑物料到货率，导致在物料未到齐时就显示为裁剪环节
3. **小程序工序识别逻辑错误**：StageDetector在新订单判断时，即使物料未到齐也可能返回裁剪工序

## 🔧 修复方案

### 1. 修复采购开始时间的SQL查询

**文件**: `backend/src/main/java/com/fashion/supplychain/production/mapper/MaterialPurchaseMapper.java`

**修复前**:
```sql
MIN(CASE WHEN p.status <> 'pending' AND p.status <> 'cancelled' 
    THEN COALESCE(p.received_time, p.update_time, p.create_time) END) AS procurementStartTime
```

**问题**: 只要状态不是pending或cancelled，就显示时间，即使采购还没真正开始。

**修复后**:
```sql
MIN(CASE WHEN p.status = 'completed' OR p.received_time IS NOT NULL 
    THEN COALESCE(p.received_time, p.update_time, p.create_time) END) AS procurementStartTime
```

**效果**: 只有当采购单状态为'completed'或已经有received_time（实际收货时间）时，才显示采购开始时间。

### 2. 修复后端currentProcessName判断逻辑

**文件**: `backend/src/main/java/com/fashion/supplychain/production/service/ProductionOrderQueryService.java`

**增加逻辑**:
```java
// 获取物料到货率
Integer materialArrivalRate = order.getMaterialArrivalRate();
boolean materialNotReady = (materialArrivalRate == null || materialArrivalRate < 100);

// 重要：如果物料到货率小于100%，必须停留在采购阶段
// 这样可以防止采购未完成就显示为裁剪或其他工序
if (materialNotReady && !realStarted) {
    inProcurement = true;
}
```

**效果**: 即使没有扫码记录，只要物料到货率小于100%，就会显示为"采购"阶段。

### 3. 修复小程序工序识别逻辑

**文件**: `miniprogram/pages/scan/services/StageDetector.js`

**修复前**:
```javascript
// 情况3：有生产进度但物料未到齐 → 裁剪（可能是回流任务）
if (productionProgress > 0) {
  return {
    processName: '裁剪',
    progressStage: '裁剪',
    scanType: 'cutting',
    hint: '继续裁剪任务'
  };
}
```

**问题**: 只要有生产进度就返回裁剪，没有考虑物料到货率。

**修复后**:
```javascript
// 情况3：物料未到齐 → 必须停留在采购阶段
// 注意：即使有生产进度（productionProgress > 0），如果物料未到齐，也不能进入裁剪
return {
  processName: '采购',
  progressStage: '采购',
  scanType: 'procurement',
  hint: materialArrivalRate > 0 ? `物料到货率 ${materialArrivalRate}%，继续采购` : '订单开始，进行采购'
};
```

**效果**: 物料到货率未达到100%时，强制停留在采购阶段。

## ✅ 修复效果

### PC端
- ✅ 采购未开始时，不再显示采购开始时间
- ✅ 采购未完成时，不再显示采购完成时间
- ✅ currentProcessName正确显示为"采购"

### 手机端
- ✅ 生产页面订单列表正确显示"采购"标签
- ✅ 不再错误显示"裁剪"标签
- ✅ 扫码页面自动识别时，正确识别为采购阶段

### 双端一致性
- ✅ PC端和手机端显示的工序阶段完全一致
- ✅ 都基于物料到货率来判断是否可以进入裁剪

## 📊 判断逻辑流程图

```
订单创建
    ↓
物料到货率 < 100%?
    ↓ 是
显示"采购"阶段
    ↓ 否（物料到货率 = 100%）
有裁剪菲号?
    ↓ 否
显示"裁剪"阶段
    ↓ 是
显示"车缝"阶段
```

## 🧪 测试建议

1. **创建新订单**
   - 确认PC端不显示采购开始/完成时间
   - 确认手机端显示为"采购"阶段

2. **填写采购单但不确认收货**
   - 确认PC端不显示采购开始时间
   - 确认物料到货率仍为0%
   - 确认手机端仍显示"采购"阶段

3. **确认收货达到100%**
   - 确认PC端显示采购开始和完成时间
   - 确认手机端显示为"裁剪"阶段

4. **生成裁剪菲号**
   - 确认PC端显示为"车缝"阶段
   - 确认手机端显示为"车缝"阶段

## 📝 相关文件

### 后端
- `backend/src/main/java/com/fashion/supplychain/production/mapper/MaterialPurchaseMapper.java` - SQL查询修复
- `backend/src/main/java/com/fashion/supplychain/production/service/ProductionOrderQueryService.java` - currentProcessName判断逻辑

### 小程序
- `miniprogram/pages/scan/services/StageDetector.js` - 工序识别逻辑
- `miniprogram/pages/work/index.wxml` - 订单列表显示

## 🔗 相关文档

- [SCAN_SYSTEM_LOGIC.md](../SCAN_SYSTEM_LOGIC.md) - 扫码系统逻辑说明
- [DEVELOPMENT_GUIDE.md](../DEVELOPMENT_GUIDE.md) - 开发指南
- [WORKFLOW_EXPLANATION.md](../WORKFLOW_EXPLANATION.md) - 业务流程说明

---

**修复人**: GitHub Copilot  
**修复时间**: 2026-01-24  
**影响范围**: PC端订单列表、手机端生产页面、扫码工序识别  
**兼容性**: 向下兼容，无需数据迁移  
**重要性**: ⭐⭐⭐⭐⭐ 核心业务逻辑修复

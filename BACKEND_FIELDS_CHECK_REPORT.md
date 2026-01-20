# 🔍 后端字段支持情况检查报告

*检查时间：2026-01-20*

---

## ✅ 执行摘要

### 检查范围
本次检查验证了**前端新增的30+个字段**，后端API是否已提供相应支持。

### 检查结果概览

| 模块 | 新增字段数 | ✅已支持 | ⚠️部分支持 | ❌缺失 | 状态 |
|------|-----------|---------|------------|--------|------|
| 生产订单列表 | 14 | 0 | 0 | 14 | ❌需要补充 |
| 质检入库 | 6 | 3 | 2 | 1 | ⚠️部分支持 |
| 物料采购 | 3 | 0 | 0 | 3 | ❌需要补充 |
| 物料对账 | 6 | 0 | 0 | 6 | ❌需要补充 |
| 人员工序统计 | 1 | 1 | 0 | 0 | ✅完全支持 |
| **合计** | **30** | **4** | **2** | **24** | **⚠️需要大量补充** |

---

## 📋 详细字段检查清单

### 1️⃣ 生产订单列表 (ProductionOrder.java)

#### ❌ 车缝环节字段（4个字段全部缺失）

**前端需要的字段：**
```typescript
carSewingStartTime: string           // 车缝开始时间
carSewingEndTime: string             // 车缝完成时间
carSewingOperatorName: string        // 车缝员姓名
carSewingCompletionRate: number      // 车缝完成率
```

**后端实体类现状：**
```java
// ProductionOrder.java - 未找到对应字段
// ❌ 缺失：carSewingStartTime
// ❌ 缺失：carSewingEndTime  
// ❌ 缺失：carSewingOperatorName
// ❌ 缺失：carSewingCompletionRate

// 现有类似字段参考：
@TableField(exist = false)
private LocalDateTime sewingStartTime;      // 缝制开始时间

@TableField(exist = false)
private LocalDateTime sewingEndTime;        // 缝制完成时间

@TableField(exist = false)
private String sewingOperatorName;          // 缝制员姓名

@TableField(exist = false)
private Integer sewingCompletionRate;       // 缝制完成率
```

**需要添加：**
```java
@TableField(exist = false)
private LocalDateTime carSewingStartTime;

@TableField(exist = false)
private LocalDateTime carSewingEndTime;

@TableField(exist = false)
private String carSewingOperatorName;

@TableField(exist = false)
private Integer carSewingCompletionRate;
```

---

#### ❌ 大烫环节字段（4个字段全部缺失）

**前端需要的字段：**
```typescript
ironingStartTime: string             // 大烫开始时间
ironingEndTime: string               // 大烫完成时间
ironingOperatorName: string          // 大烫员姓名
ironingCompletionRate: number        // 大烫完成率
```

**需要添加：**
```java
@TableField(exist = false)
private LocalDateTime ironingStartTime;

@TableField(exist = false)
private LocalDateTime ironingEndTime;

@TableField(exist = false)
private String ironingOperatorName;

@TableField(exist = false)
private Integer ironingCompletionRate;
```

---

#### ❌ 包装环节字段（4个字段全部缺失）

**前端需要的字段：**
```typescript
packagingStartTime: string           // 包装开始时间
packagingEndTime: string             // 包装完成时间
packagingOperatorName: string        // 包装员姓名
packagingCompletionRate: number      // 包装完成率
```

**需要添加：**
```java
@TableField(exist = false)
private LocalDateTime packagingStartTime;

@TableField(exist = false)
private LocalDateTime packagingEndTime;

@TableField(exist = false)
private String packagingOperatorName;

@TableField(exist = false)
private Integer packagingCompletionRate;
```

---

#### ❌ 质量统计字段（2个字段全部缺失）

**前端需要的字段：**
```typescript
unqualifiedQuantity: number          // 次品数量
repairQuantity: number               // 返修数量
```

**需要添加：**
```java
@TableField(exist = false)
private Integer unqualifiedQuantity;

@TableField(exist = false)
private Integer repairQuantity;
```

**说明：** 这些统计数据需要从`t_product_warehousing`表聚合计算

---

### 2️⃣ 质检入库 (ProductWarehousing.java)

#### ✅ 颜色和尺码字段（已支持，需从ScanRecord获取）

**前端需要的字段：**
```typescript
color: string                        // 颜色
size: string                         // 尺码
```

**后端实体类现状：**
```java
// ProductWarehousing.java - 未直接包含
// ⚠️ 但可以通过 cuttingBundleQrCode 关联到 ScanRecord 获取

// ScanRecord.java - 已包含
private String color;                // ✅ 已有
private String size;                 // ✅ 已有
```

**解决方案：** 
1. 在ProductWarehousing添加字段：
```java
@TableField(exist = false)
private String color;

@TableField(exist = false)
private String size;
```

2. 在查询时关联ScanRecord填充这两个字段

---

#### ✅ 菲号字段（已有，使用cuttingBundleQrCode）

**前端需要的字段：**
```typescript
scanCode: string                     // 菲号
```

**后端实体类现状：**
```java
// ProductWarehousing.java
private String cuttingBundleQrCode;  // ✅ 已有，即菲号
```

**说明：** 前端应使用`cuttingBundleQrCode`字段，格式：PO-ST-颜色-尺码-数量-序号

---

#### ✅ 次品处理字段（部分支持）

**前端需要的字段：**
```typescript
defectCategory: string               // 次品类型
repairRemark: string                 // 处理方式
```

**后端实体类现状：**
```java
// ProductWarehousing.java
private String defectCategory;       // ✅ 已有
private String repairRemark;         // ✅ 已有
```

**说明：** 字段已存在，前端可直接使用

---

#### ❌ 质检人员字段（缺失）

**前端需要的字段：**
```typescript
qualityOperatorName: string          // 质检人员姓名
```

**后端实体类现状：**
```java
// ProductWarehousing.java
private String receiverId;           // ⚠️ 只有ID
private String receiverName;         // ⚠️ 这是入库人，不是质检人

// ❌ 缺失：qualityOperatorName
```

**需要添加：**
```java
private String qualityOperatorId;

private String qualityOperatorName;
```

**说明：** 需要区分入库人和质检人，因为可能是不同的人

---

### 3️⃣ 物料采购 (MaterialPurchase.java)

#### ❌ 到货数量跟踪字段（3个字段全部缺失）

**前端需要的字段：**
```typescript
// 待到数量（前端计算）
remainingQuantity: number            // = purchaseQuantity - arrivedQuantity

// 日期跟踪
expectedArrivalDate: string          // 预计到货日期
actualArrivalDate: string            // 实际到货日期
```

**后端实体类现状：**
```java
// MaterialPurchase.java
private Integer purchaseQuantity;    // ✅ 已有
private Integer arrivedQuantity;     // ✅ 已有

// ❌ 缺失：expectedArrivalDate
// ❌ 缺失：actualArrivalDate
```

**需要添加：**
```java
private LocalDateTime expectedArrivalDate;

private LocalDateTime actualArrivalDate;
```

**说明：** `remainingQuantity`不需要存储，前端计算即可

---

### 4️⃣ 物料对账 (MaterialReconciliation.java)

#### ❌ 付款进度字段（6个字段全部缺失）

**前端需要的字段：**
```typescript
// 付款金额
paidAmount: number                   // 已付金额
// unpaidAmount 前端计算：totalAmount - paidAmount
// paymentProgress 前端计算：(paidAmount / totalAmount) * 100

// 对账周期
periodStartDate: string              // 对账周期开始
periodEndDate: string                // 对账周期结束

// 责任人
reconciliationOperatorName: string   // 对账人
auditOperatorName: string            // 审核人
```

**后端实体类现状：**
```java
// MaterialReconciliation.java
private BigDecimal totalAmount;      // ✅ 已有
private BigDecimal finalAmount;      // ✅ 已有

// ❌ 缺失：paidAmount
// ❌ 缺失：periodStartDate
// ❌ 缺失：periodEndDate
// ❌ 缺失：reconciliationOperatorName
// ❌ 缺失：auditOperatorName

// 现有相关字段：
private String createBy;             // ⚠️ 创建人，不是对账人
private String updateBy;             // ⚠️ 更新人，不是审核人
```

**需要添加：**
```java
private BigDecimal paidAmount;

private LocalDateTime periodStartDate;

private LocalDateTime periodEndDate;

private String reconciliationOperatorId;

private String reconciliationOperatorName;

private String auditOperatorId;

private String auditOperatorName;
```

---

### 5️⃣ 人员工序统计 (ScanRecord.java)

#### ✅ 人员工号字段（已支持）

**前端需要的字段：**
```typescript
operatorId: string                   // 人员工号
```

**后端实体类现状：**
```java
// ScanRecord.java
private String operatorId;           // ✅ 已有
private String operatorName;         // ✅ 已有
```

**说明：** 字段已存在，API已返回，前端可直接使用

---

## 🎯 后端修复优先级

### P0 - 高优先级（必须修复）

#### 1. ProductionOrder.java - 添加环节字段
```java
// 在 ProductionOrder.java 的最后添加：

// 车缝环节
@TableField(exist = false)
private LocalDateTime carSewingStartTime;

@TableField(exist = false)
private LocalDateTime carSewingEndTime;

@TableField(exist = false)
private String carSewingOperatorName;

@TableField(exist = false)
private Integer carSewingCompletionRate;

// 大烫环节
@TableField(exist = false)
private LocalDateTime ironingStartTime;

@TableField(exist = false)
private LocalDateTime ironingEndTime;

@TableField(exist = false)
private String ironingOperatorName;

@TableField(exist = false)
private Integer ironingCompletionRate;

// 包装环节
@TableField(exist = false)
private LocalDateTime packagingStartTime;

@TableField(exist = false)
private LocalDateTime packagingEndTime;

@TableField(exist = false)
private String packagingOperatorName;

@TableField(exist = false)
private Integer packagingCompletionRate;

// 质量统计
@TableField(exist = false)
private Integer unqualifiedQuantity;

@TableField(exist = false)
private Integer repairQuantity;
```

**数据来源：** 
- 环节数据：从`t_scan_record`表聚合，按`progressStage`分组
  - `progressStage = 'carSewing'` → 车缝
  - `progressStage = 'ironing'` → 大烫
  - `progressStage = 'packaging'` → 包装
- 质量统计：从`t_product_warehousing`表聚合

---

#### 2. MaterialPurchase.java - 添加到货日期字段
```java
// 在 MaterialPurchase.java 添加：

private LocalDateTime expectedArrivalDate;

private LocalDateTime actualArrivalDate;
```

**数据库表修改：**
```sql
ALTER TABLE t_material_purchase 
ADD COLUMN expected_arrival_date DATETIME COMMENT '预计到货日期',
ADD COLUMN actual_arrival_date DATETIME COMMENT '实际到货日期';
```

---

#### 3. MaterialReconciliation.java - 添加付款和责任人字段
```java
// 在 MaterialReconciliation.java 添加：

private BigDecimal paidAmount;

private LocalDateTime periodStartDate;

private LocalDateTime periodEndDate;

private String reconciliationOperatorId;

private String reconciliationOperatorName;

private String auditOperatorId;

private String auditOperatorName;
```

**数据库表修改：**
```sql
ALTER TABLE t_material_reconciliation 
ADD COLUMN paid_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '已付金额',
ADD COLUMN period_start_date DATETIME COMMENT '对账周期开始日期',
ADD COLUMN period_end_date DATETIME COMMENT '对账周期结束日期',
ADD COLUMN reconciliation_operator_id VARCHAR(50) COMMENT '对账人ID',
ADD COLUMN reconciliation_operator_name VARCHAR(50) COMMENT '对账人姓名',
ADD COLUMN audit_operator_id VARCHAR(50) COMMENT '审核人ID',
ADD COLUMN audit_operator_name VARCHAR(50) COMMENT '审核人姓名';
```

---

### P1 - 中优先级（建议修复）

#### 4. ProductWarehousing.java - 添加颜色尺码和质检人员
```java
// 在 ProductWarehousing.java 添加：

@TableField(exist = false)
private String color;

@TableField(exist = false)
private String size;

private String qualityOperatorId;

private String qualityOperatorName;
```

**数据库表修改：**
```sql
ALTER TABLE t_product_warehousing 
ADD COLUMN quality_operator_id VARCHAR(50) COMMENT '质检人员ID',
ADD COLUMN quality_operator_name VARCHAR(50) COMMENT '质检人员姓名';
```

**说明：** 
- `color`和`size`作为临时字段，查询时从ScanRecord填充
- `qualityOperatorId/Name`需要存储到数据库

---

## 📊 Service层修改清单

### 1. ProductionOrderService - 聚合环节和质量数据

**需要修改的方法：**
```java
// ProductionOrderServiceImpl.java

@Override
public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
    IPage<ProductionOrder> page = super.queryPage(params);
    
    // 填充环节数据
    fillStageData(page.getRecords());
    
    // 填充质量统计
    fillQualityStats(page.getRecords());
    
    return page;
}

private void fillStageData(List<ProductionOrder> orders) {
    if (orders == null || orders.isEmpty()) return;
    
    for (ProductionOrder order : orders) {
        String orderId = order.getId();
        
        // 聚合车缝环节数据
        fillSingleStageData(order, orderId, "carSewing");
        
        // 聚合大烫环节数据
        fillSingleStageData(order, orderId, "ironing");
        
        // 聚合包装环节数据
        fillSingleStageData(order, orderId, "packaging");
    }
}

private void fillSingleStageData(ProductionOrder order, String orderId, String stage) {
    // 从 t_scan_record 查询该环节的记录
    LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(ScanRecord::getOrderId, orderId)
           .eq(ScanRecord::getProgressStage, stage)
           .orderByAsc(ScanRecord::getScanTime);
    
    List<ScanRecord> records = scanRecordService.list(wrapper);
    
    if (records != null && !records.isEmpty()) {
        // 开始时间：第一条记录
        LocalDateTime startTime = records.get(0).getScanTime();
        
        // 完成时间：最后一条记录
        LocalDateTime endTime = records.get(records.size() - 1).getScanTime();
        
        // 操作员：最后一条记录的操作员
        String operatorName = records.get(records.size() - 1).getOperatorName();
        
        // 完成率：扫码数量 / 订单数量 * 100
        int scannedQty = records.stream()
            .mapToInt(r -> r.getQuantity() != null ? r.getQuantity() : 0)
            .sum();
        int orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 1;
        int completionRate = orderQty > 0 ? (scannedQty * 100 / orderQty) : 0;
        
        // 根据stage设置对应字段
        if ("carSewing".equals(stage)) {
            order.setCarSewingStartTime(startTime);
            order.setCarSewingEndTime(endTime);
            order.setCarSewingOperatorName(operatorName);
            order.setCarSewingCompletionRate(completionRate);
        } else if ("ironing".equals(stage)) {
            order.setIroningStartTime(startTime);
            order.setIroningEndTime(endTime);
            order.setIroningOperatorName(operatorName);
            order.setIroningCompletionRate(completionRate);
        } else if ("packaging".equals(stage)) {
            order.setPackagingStartTime(startTime);
            order.setPackagingEndTime(endTime);
            order.setPackagingOperatorName(operatorName);
            order.setPackagingCompletionRate(completionRate);
        }
    }
}

private void fillQualityStats(List<ProductionOrder> orders) {
    if (orders == null || orders.isEmpty()) return;
    
    for (ProductionOrder order : orders) {
        String orderId = order.getId();
        
        // 聚合次品数量
        LambdaQueryWrapper<ProductWarehousing> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProductWarehousing::getOrderId, orderId)
               .eq(ProductWarehousing::getDeleteFlag, 0);
        
        List<ProductWarehousing> warehousingList = productWarehousingService.list(wrapper);
        
        int unqualifiedQty = warehousingList.stream()
            .mapToInt(w -> w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0)
            .sum();
        
        // 返修数量（暂时设为0，需要根据业务逻辑确定来源）
        int repairQty = 0;
        
        order.setUnqualifiedQuantity(unqualifiedQty);
        order.setRepairQuantity(repairQty);
    }
}
```

---

### 2. ProductWarehousingService - 填充颜色尺码

**需要修改的方法：**
```java
// ProductWarehousingServiceImpl.java

@Override
public IPage<ProductWarehousing> queryPage(Map<String, Object> params) {
    IPage<ProductWarehousing> page = super.queryPage(params);
    
    // 填充颜色和尺码
    fillColorAndSize(page.getRecords());
    
    return page;
}

private void fillColorAndSize(List<ProductWarehousing> records) {
    if (records == null || records.isEmpty()) return;
    
    for (ProductWarehousing record : records) {
        String qrCode = record.getCuttingBundleQrCode();
        if (qrCode != null && !qrCode.isEmpty()) {
            // 从 t_scan_record 查询对应的扫码记录
            LambdaQueryWrapper<ScanRecord> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(ScanRecord::getScanCode, qrCode)
                   .or()
                   .eq(ScanRecord::getCuttingBundleQrCode, qrCode)
                   .last("LIMIT 1");
            
            ScanRecord scanRecord = scanRecordService.getOne(wrapper);
            if (scanRecord != null) {
                record.setColor(scanRecord.getColor());
                record.setSize(scanRecord.getSize());
            }
        }
    }
}
```

---

## 🗄️ 数据库修改SQL脚本

### 完整SQL脚本

```sql
-- ============================================
-- 后端字段补充 - 数据库修改脚本
-- 创建时间：2026-01-20
-- ============================================

-- 1. 物料采购表 - 添加到货日期字段
ALTER TABLE t_material_purchase 
ADD COLUMN expected_arrival_date DATETIME COMMENT '预计到货日期' AFTER status,
ADD COLUMN actual_arrival_date DATETIME COMMENT '实际到货日期' AFTER expected_arrival_date;

-- 2. 物料对账表 - 添加付款进度和责任人字段
ALTER TABLE t_material_reconciliation 
ADD COLUMN paid_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '已付金额' AFTER final_amount,
ADD COLUMN period_start_date DATETIME COMMENT '对账周期开始日期' AFTER reconciliation_date,
ADD COLUMN period_end_date DATETIME COMMENT '对账周期结束日期' AFTER period_start_date,
ADD COLUMN reconciliation_operator_id VARCHAR(50) COMMENT '对账人ID' AFTER period_end_date,
ADD COLUMN reconciliation_operator_name VARCHAR(50) COMMENT '对账人姓名' AFTER reconciliation_operator_id,
ADD COLUMN audit_operator_id VARCHAR(50) COMMENT '审核人ID' AFTER reconciliation_operator_name,
ADD COLUMN audit_operator_name VARCHAR(50) COMMENT '审核人姓名' AFTER audit_operator_id;

-- 3. 质检入库表 - 添加质检人员字段
ALTER TABLE t_product_warehousing 
ADD COLUMN quality_operator_id VARCHAR(50) COMMENT '质检人员ID' AFTER receiver_name,
ADD COLUMN quality_operator_name VARCHAR(50) COMMENT '质检人员姓名' AFTER quality_operator_id;

-- 4. 成品对账表 - 添加类似字段（如果需要）
ALTER TABLE t_shipment_reconciliation 
ADD COLUMN paid_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '已付金额' AFTER total_amount,
ADD COLUMN period_start_date DATETIME COMMENT '对账周期开始日期' AFTER reconciliation_date,
ADD COLUMN period_end_date DATETIME COMMENT '对账周期结束日期' AFTER period_start_date,
ADD COLUMN reconciliation_operator_id VARCHAR(50) COMMENT '对账人ID' AFTER period_end_date,
ADD COLUMN reconciliation_operator_name VARCHAR(50) COMMENT '对账人姓名' AFTER reconciliation_operator_id,
ADD COLUMN audit_operator_id VARCHAR(50) COMMENT '审核人ID' AFTER reconciliation_operator_name,
ADD COLUMN audit_operator_name VARCHAR(50) COMMENT '审核人姓名' AFTER audit_operator_id;

-- 验证修改
SHOW COLUMNS FROM t_material_purchase LIKE '%arrival%';
SHOW COLUMNS FROM t_material_reconciliation LIKE '%paid%';
SHOW COLUMNS FROM t_material_reconciliation LIKE '%period%';
SHOW COLUMNS FROM t_material_reconciliation LIKE '%operator%';
SHOW COLUMNS FROM t_product_warehousing LIKE '%quality%';
```

---

## ⚠️ 注意事项

### 1. 数据迁移
对于已有数据，需要考虑：
- **paidAmount**: 默认值0.00，需要手动补充历史付款记录
- **periodStartDate/EndDate**: 可以从reconciliationDate推算（如：前15天）
- **reconciliationOperatorName**: 可以从createBy映射
- **auditOperatorName**: 可以从updateBy映射
- **expectedArrivalDate**: 可以从createTime + 7天推算

### 2. API兼容性
前端字段名和后端字段名映射：
- 前端：`scanCode` → 后端：`cuttingBundleQrCode`
- 前端：`remainingQuantity` → 后端计算：`purchaseQuantity - arrivedQuantity`
- 前端：`unpaidAmount` → 后端计算：`totalAmount - paidAmount`

### 3. 性能优化
聚合查询可能影响性能，建议：
- 为`t_scan_record`的`order_id`和`progress_stage`建立复合索引
- 为`t_product_warehousing`的`order_id`建立索引
- 考虑使用缓存存储聚合结果

```sql
-- 性能优化索引
CREATE INDEX idx_scan_record_order_stage ON t_scan_record(order_id, progress_stage);
CREATE INDEX idx_warehousing_order ON t_product_warehousing(order_id, delete_flag);
```

---

## 📝 修复步骤建议

### 第1步：数据库修改（5分钟）
1. 备份相关表
2. 执行SQL脚本
3. 验证字段添加成功

### 第2步：实体类修改（10分钟）
1. 修改ProductionOrder.java
2. 修改MaterialPurchase.java
3. 修改MaterialReconciliation.java
4. 修改ProductWarehousing.java

### 第3步：Service层修改（30分钟）
1. 修改ProductionOrderServiceImpl.java
2. 修改ProductWarehousingServiceImpl.java
3. 添加聚合查询方法

### 第4步：测试验证（20分钟）
1. 启动后端服务
2. 测试各个API接口
3. 验证字段返回正确

### 第5步：前后端联调（30分钟）
1. 前端刷新页面
2. 验证所有表格显示正确
3. 检查数据一致性

**预计总时间：约1.5小时**

---

## 🎯 下一步行动

### 立即执行
1. **执行数据库SQL脚本** - 添加缺失的数据库字段
2. **修改后端实体类** - 添加Java字段定义
3. **实现聚合查询** - 填充环节和统计数据

### 后续优化
4. **添加索引** - 提升查询性能
5. **数据迁移** - 补充历史数据
6. **缓存优化** - 减少数据库查询

---

## ✅ 检查清单

使用此清单验证后端修复是否完整：

- [ ] `t_material_purchase`表添加了`expected_arrival_date`和`actual_arrival_date`
- [ ] `t_material_reconciliation`表添加了6个新字段
- [ ] `t_product_warehousing`表添加了`quality_operator_id`和`quality_operator_name`
- [ ] `ProductionOrder.java`添加了14个环节和统计字段
- [ ] `MaterialPurchase.java`添加了2个日期字段
- [ ] `MaterialReconciliation.java`添加了6个付款和责任人字段
- [ ] `ProductWarehousing.java`添加了4个字段
- [ ] `ProductionOrderServiceImpl`实现了环节数据聚合
- [ ] `ProductWarehousingServiceImpl`实现了颜色尺码填充
- [ ] API返回数据包含所有新字段
- [ ] 前端表格能正确显示新字段

---

*本报告为技术规划文档，实际实施时请根据具体情况调整*


# 财务链条完善 - 实施方案

## 🎯 核心改进：将工序成本流入成品结算

### 问题描述
- Phase 5已实现：`ScanRecord.processUnitPrice` 和 `ScanRecord.scanCost`
- 工资结算已实现：按工序汇总工资
- **缺失**：工序成本（scanCost）没有反映到成品结算中

### 解决方案
在 `ShipmentReconciliation` (成品结算)中添加成本字段，计算公式：
```
产品成本 = 物料成本 + 工序成本(从Phase 5扫码)
利润 = 销售价格 - 产品成本
```

---

## 📝 实施步骤

### Step 1: 数据库表修改

#### 在 t_shipment_reconciliation 表中添加成本相关字段

```sql
-- 添加工序成本字段（如果不存在）
ALTER TABLE t_shipment_reconciliation 
ADD COLUMN IF NOT EXISTS scan_cost DECIMAL(15,2) COMMENT '工序成本（从Phase 5扫码汇总）',
ADD COLUMN IF NOT EXISTS material_cost DECIMAL(15,2) COMMENT '物料成本',
ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) COMMENT '总成本 = 工序成本 + 物料成本',
ADD COLUMN IF NOT EXISTS profit_amount DECIMAL(15,2) COMMENT '利润 = 最终金额 - 总成本',
ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(5,2) COMMENT '利润率(%)';
```

### Step 2: Entity 修改

#### 修改 ShipmentReconciliation.java 添加成本字段

```java
@Data
@TableName("t_shipment_reconciliation")
public class ShipmentReconciliation {
    // ... 现有字段 ...
    
    /**
     * 工序成本（从Phase 5 ScanRecord.scanCost汇总）
     */
    private BigDecimal scanCost;

    /**
     * 物料成本（可选，从物料对账获取）
     */
    private BigDecimal materialCost;

    /**
     * 总成本 = 工序成本 + 物料成本
     */
    private BigDecimal totalCost;

    /**
     * 利润 = finalAmount - totalCost
     */
    private BigDecimal profitAmount;

    /**
     * 利润率(%) = profitAmount / finalAmount * 100
     */
    private BigDecimal profitMargin;
}
```

### Step 3: Orchestrator 添加成本计算

#### 在 ShipmentReconciliationOrchestrator 中添加方法

```java
@Service
@Slf4j
public class ShipmentReconciliationOrchestrator {
    
    @Autowired
    private ScanRecordMapper scanRecordMapper;

    /**
     * 计算工序成本（从Phase 5 ScanRecord汇总）
     * 
     * 数据来源：该订单下所有ScanRecord的scanCost求和
     * 用途：填充ShipmentReconciliation.scanCost
     */
    public BigDecimal calculateScanCost(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return BigDecimal.ZERO;
        }

        // 查询该订单所有扫码记录的扫码成本
        List<ScanRecord> records = scanRecordMapper.selectList(
            new LambdaQueryWrapper<ScanRecord>()
                .eq(ScanRecord::getOrderId, orderId)
                .isNotNull(ScanRecord::getScanCost)
        );

        // 求和所有扫码成本
        return records.stream()
            .map(ScanRecord::getScanCost)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * 计算利润和利润率
     */
    public void fillProfitInfo(ShipmentReconciliation shipment) {
        if (shipment == null) {
            return;
        }

        // 获取工序成本
        BigDecimal scanCost = calculateScanCost(shipment.getOrderId());
        shipment.setScanCost(scanCost);

        // 获取物料成本（如有）
        BigDecimal materialCost = shipment.getMaterialCost();
        if (materialCost == null) {
            materialCost = BigDecimal.ZERO;
        }

        // 总成本 = 工序成本 + 物料成本
        BigDecimal totalCost = scanCost.add(materialCost);
        shipment.setTotalCost(totalCost);

        // 利润 = 最终金额 - 总成本
        BigDecimal finalAmount = shipment.getFinalAmount();
        if (finalAmount == null) {
            finalAmount = BigDecimal.ZERO;
        }

        BigDecimal profit = finalAmount.subtract(totalCost);
        if (profit.compareTo(BigDecimal.ZERO) < 0) {
            profit = BigDecimal.ZERO;  // 亏损时置为0（可选，根据业务规则）
        }
        shipment.setProfitAmount(profit);

        // 利润率(%) = 利润 / 最终金额 * 100
        if (finalAmount.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal margin = profit
                .divide(finalAmount, 4, RoundingMode.HALF_UP)
                .multiply(new BigDecimal("100"))
                .setScale(2, RoundingMode.HALF_UP);
            shipment.setProfitMargin(margin);
        } else {
            shipment.setProfitMargin(BigDecimal.ZERO);
        }
    }

    /**
     * 修改 list 方法，在返回前填充利润信息
     */
    public IPage<ShipmentReconciliation> list(Map<String, Object> params) {
        IPage<ShipmentReconciliation> page = shipmentReconciliationService.queryPage(params);
        if (page != null && page.getRecords() != null) {
            // 填充生产完成数量
            fillProductionCompletedQuantity(page.getRecords());
            
            // 填充利润信息
            for (ShipmentReconciliation record : page.getRecords()) {
                fillProfitInfo(record);
            }
        }
        return page;
    }

    /**
     * 修改 getById 方法，返回前填充利润信息
     */
    public ShipmentReconciliation getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        ShipmentReconciliation r = shipmentReconciliationService.getById(key);
        if (r == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        fillProductionCompletedQuantity(List.of(r));
        fillProfitInfo(r);  // ← 添加这一行
        return r;
    }

    /**
     * 修改 save 方法，保存前计算利润
     */
    public boolean save(ShipmentReconciliation shipmentReconciliation) {
        if (shipmentReconciliation == null) {
            throw new IllegalArgumentException("参数错误");
        }
        
        // 计算利润信息
        fillProfitInfo(shipmentReconciliation);  // ← 添加这一行
        
        LocalDateTime now = LocalDateTime.now();
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();

        shipmentReconciliation.setStatus("pending");
        shipmentReconciliation.setCreateTime(now);
        shipmentReconciliation.setUpdateTime(now);
        if (StringUtils.hasText(uid)) {
            BaseReconciliationServiceImpl.ReconciliationEntity audit = shipmentReconciliation;
            audit.setCreateBy(uid);
            audit.setUpdateBy(uid);
        }
        boolean ok = shipmentReconciliationService.save(shipmentReconciliation);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    /**
     * 修改 update 方法，更新前重新计算利润
     */
    public boolean update(ShipmentReconciliation shipmentReconciliation) {
        if (shipmentReconciliation == null || !StringUtils.hasText(shipmentReconciliation.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        
        // 重新计算利润信息
        fillProfitInfo(shipmentReconciliation);  // ← 添加这一行
        
        String id = shipmentReconciliation.getId().trim();
        shipmentReconciliation.setId(id);
        ShipmentReconciliation current = shipmentReconciliationService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("对账单不存在");
        }
        // ... 其他逻辑保持不变 ...
    }
}
```

### Step 4: 需要的导入语句

```java
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;
```

### Step 5: PC端展示（无需修改，自动显示）

成品结算页面（ShipmentReconciliationList.tsx）中添加列：
```typescript
{
  title: '工序成本',
  dataIndex: 'scanCost',
  render: (val: number) => `¥${(val || 0).toFixed(2)}`,
  width: 120,
},
{
  title: '物料成本',
  dataIndex: 'materialCost',
  render: (val: number) => `¥${(val || 0).toFixed(2)}`,
  width: 120,
},
{
  title: '总成本',
  dataIndex: 'totalCost',
  render: (val: number) => `¥${(val || 0).toFixed(2)}`,
  width: 120,
},
{
  title: '利润',
  dataIndex: 'profitAmount',
  render: (val: number) => `¥${(val || 0).toFixed(2)}`,
  width: 120,
},
{
  title: '利润率',
  dataIndex: 'profitMargin',
  render: (val: number) => `${(val || 0).toFixed(2)}%`,
  width: 100,
},
```

---

## 🔄 效果说明

### 改进前
```
订单 PO20260122001
├─ 销售价格：1000元
├─ 成本价格：300元（固定）
└─ 利润：700元
```

### 改进后
```
订单 PO20260122001
├─ 销售价格：1000元
├─ 工序成本：250元（从Phase 5自动汇总）
├─ 物料成本：180元（可从物料对账）
├─ 总成本：430元
└─ 利润：570元（更精准）
```

---

## ✅ 检查清单

- [ ] 执行SQL添加新字段
- [ ] 修改ShipmentReconciliation Entity添加新字段
- [ ] 修改ShipmentReconciliationOrchestrator添加方法
- [ ] 测试：新建成品结算单，检查工序成本是否自动计算
- [ ] 测试：修改成品结算单，利润是否实时更新
- [ ] 前端页面添加新列展示（可选）

---

## 📌 重点说明

1. **数据自动流向**：
   - 生产扫码 (Phase 5) → ScanRecord.scanCost ✓
   - 成品结算 → 自动从ScanRecord汇总工序成本 ✓
   - 财务清晰看到成本和利润 ✓

2. **不影响现有流程**：
   - 已有的成品结算继续正常工作
   - 只是多出几个计算字段
   - 向后兼容

3. **可扩展**：
   - 未来可加入物料对账的物料成本
   - 可加入其他成本维度（运费、包装等）

# 工资结算中的单价（UnitPrice）说明

## 📊 数据库配置确认

**开发环境数据库配置**（来自 `application.yml` 和 `application-dev.yml`）：
```
- 数据库主机: 127.0.0.1
- 端口: 3308 (非标准3306)
- 用户名: root
- 密码: changeme
- 数据库: fashion_supplychain
```

## 💰 工资结算中的两种单价

### 1. `unitPrice` - 订单单价
来源：ProductionOrder 表的订单价格
- 用途：成品结算时的销售价格
- 数据类型：BigDecimal
- 位置：ScanRecord.unitPrice

### 2. `processUnitPrice` - **工序单价** ⭐
来源：ProductionOrder.progressNodeUnitPrices（按工序配置的单价）
- 用途：**工资结算**（按工序支付员工）
- 数据类型：BigDecimal
- 位置：ScanRecord.processUnitPrice
- 说明：Phase 5 实现的关键字段，自动识别工序时同时记录对应单价

## 🔄 单价在工资聚合中的流转

### 数据流向

```
ProductionOrder
    ↓ (progressNodeUnitPrices)
ScanRecord.processUnitPrice (每次扫码记录工序单价)
    ↓
PayrollAggregationOrchestrator
    ↓ (按 operator_id + process_name 分组)
PayrollOperatorProcessSummaryDTO
    ├─ operatorId: 操作员ID
    ├─ operatorName: 操作员名
    ├─ processName: 工序名
    ├─ quantity: 总数量 (SUM of ScanRecord.quantity)
    ├─ unitPrice: 工序单价 (ScanRecord.processUnitPrice)
    └─ totalAmount: 小计 (SUM of ScanRecord.scanCost)
```

### 代码实现

**PayrollAggregationOrchestrator.convertToDTO()**
```java
// 从第一条扫码记录获取工序单价
BigDecimal unitPrice = first.getProcessUnitPrice() != null
        ? first.getProcessUnitPrice()
        : BigDecimal.ZERO;

dto.setUnitPrice(unitPrice);         // ← 工序单价
dto.setTotalAmount(totalAmount);     // ← 数量 × 单价的聚合
```

## 📋 前端表格列定义

文件：`frontend/src/pages/Finance/PayrollOperatorSummary.tsx`

**表格包含的单价和金额列：**

```typescript
{
    title: '单价(元)',
    dataIndex: 'unitPrice',           // ← 来自后端的 unitPrice
    width: 110,
    render: (v: any) => toMoneyText(v),
},
{
    title: '金额(元)',
    dataIndex: 'totalAmount',         // ← 来自后端的 totalAmount
    width: 120,
    render: (v: any) => toMoneyText(v),
}
```

## ✅ 系统完整性检查

| 组件 | 状态 | 说明 |
|------|------|------|
| **数据库字段** | ✅ | `t_scan_record.process_unit_price` 存在 |
| **后端实体** | ✅ | `ScanRecord.processUnitPrice` 已定义 |
| **聚合逻辑** | ✅ | `PayrollAggregationOrchestrator` 正确提取单价 |
| **DTO映射** | ✅ | `PayrollOperatorProcessSummaryDTO.unitPrice` 已定义 |
| **前端列定义** | ✅ | 表格包含"单价(元)"和"金额(元)"列 |
| **API端点** | ✅ | `/finance/payroll-settlement/operator-summary` 已实现 |

## 🧪 数据示例

当点击前端"查询"按钮后，应该返回如下结构的数据：

```json
{
    "code": 200,
    "message": "success",
    "data": [
        {
            "operatorId": "OP001",
            "operatorName": "张三",
            "processName": "做领",
            "quantity": 100,
            "unitPrice": 5.00,          // ← 工序单价
            "totalAmount": 500.00,      // ← 100 × 5.00
            "scanType": "production",
            "recordCount": 5
        },
        {
            "operatorId": "OP001",
            "operatorName": "张三",
            "processName": "上领",
            "quantity": 100,
            "unitPrice": 3.50,          // ← 不同工序，不同单价
            "totalAmount": 350.00,      // ← 100 × 3.50
            "scanType": "production",
            "recordCount": 5
        }
    ]
}
```

## 🔧 本地测试命令

```bash
# MySQL 连接测试
mysql -h 127.0.0.1 -P 3308 -u root -pchangeme fashion_supplychain \
  -e "SELECT COUNT(*) FROM t_scan_record;"

# 查看具体数据
mysql -h 127.0.0.1 -P 3308 -u root -pchangeme fashion_supplychain \
  -e "SELECT 
        order_no, operator_name, process_name, 
        quantity, process_unit_price, scan_cost 
      FROM t_scan_record LIMIT 5;"

# 后端 API 测试（需先启动后端）
curl -X POST http://localhost:8088/finance/payroll-settlement/operator-summary \
  -H "Content-Type: application/json" \
  -d '{"includeSettled":true}'
```

---

**结论**：单价（unitPrice）字段已经完整集成到工资结算系统中。前端页面"暂无数据"是因为后端没有查询到 ScanRecord 数据，不是因为单价字段缺失。

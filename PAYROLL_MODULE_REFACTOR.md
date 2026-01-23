# 工资结算模块重构文档

## 📋 概述

将独立的"工资结算"模块完全重构，集成到**"人员工序结算"模块**中。

新设计改为：
- **以人员为中心**：按 operator（操作员/工人）分组
- **以工序为维度**：每个人做的每道工序的工资统计
- **自动聚合**：基于 Phase 5 的 ScanRecord 扫码数据

---

## 🔄 核心变化

### 前端改动

#### 删除
- ❌ `/frontend/src/pages/Finance/PayrollSettlement.tsx` - 完全删除

#### 更新
- `routeConfig.ts`
  - 删除 `payrollSettlement` 路由
  - 删除 `MENU_PAYROLL_SETTLEMENT` 权限码
  - 菜单项重命名："工资结算" → "人员工序结算"

- `App.tsx`
  - 删除 `PayrollSettlement` lazy import
  - 删除对应的路由配置

- `PayrollOperatorSummary.tsx`
  - 页面标题："人员工序统计" → "人员工序结算"

### 后端改动

#### 新建文件

**`PayrollAggregationOrchestrator.java`**
```java
// 工资聚合编排器
// 功能：基于 ScanRecord 按 operator_id + process_name 分组
// 生成人员工序工资聚合数据

public List<PayrollOperatorProcessSummaryDTO> aggregatePayrollByOperatorAndProcess(
    String orderNo,                // 订单号 (可选)
    String operatorName,           // 人员名 (可选)
    String processName,            // 工序名 (可选)
    LocalDateTime startTime,       // 开始时间 (可选)
    LocalDateTime endTime,         // 结束时间 (可选)
    boolean includeSettled         // 包含已结算
)
```

#### 更新文件

**`PayrollSettlementController.java`**
- 从空白文件变成完整实现
- 只有一个 API 端点：`POST /finance/payroll-settlement/operator-summary`
- 支持灵活的查询过滤和时间范围筛选

---

## 📊 工资数据聚合逻辑

### 数据来源

从 **t_scan_record** 表中查询扫码记录，每条记录包含：
- `operator_id` - 操作员 ID
- `operator_name` - 操员名称
- `process_name` - 工序名（做领、上领、钉纽等）
- `quantity` - 该工序处理的数量
- `process_unit_price` - 该工序单价
- `scan_cost` - `quantity × process_unit_price` 的成本

### 聚合方式

按 `operator_id + process_name` 分组：
```sql
SELECT 
    operator_id,
    operator_name,
    process_name,
    SUM(quantity) as total_quantity,
    process_unit_price as unit_price,
    SUM(scan_cost) as total_amount
FROM t_scan_record
GROUP BY operator_id, operator_name, process_name
```

### 返回数据结构

```typescript
interface PayrollOperatorProcessSummaryDTO {
    operatorId: string;        // 人员工号
    operatorName: string;      // 人员名称
    processName: string;       // 工序名
    quantity: number;          // 该工序处理总数量
    unitPrice: BigDecimal;     // 单价（元/件）
    totalAmount: BigDecimal;   // 小计金额（量 × 单价）
    scanType: string;          // 扫码类型 (production/cutting)
    recordCount: number;       // 扫码次数
}
```

---

## 🔌 API 端点

### POST /finance/payroll-settlement/operator-summary

**请求体参数：**
```json
{
    "orderNo": "PO20260122001",      // 可选：订单号过滤
    "operatorName": "张三",           // 可选：人员名过滤
    "processName": "做领",            // 可选：工序名过滤
    "startTime": "2026-01-20 00:00:00", // 可选：开始时间
    "endTime": "2026-01-23 23:59:59",   // 可选：结束时间
    "includeSettled": true            // 可选：是否包含已结算
}
```

**响应示例：**
```json
{
    "code": 200,
    "message": "success",
    "data": [
        {
            "operatorId": "OP001",
            "operatorName": "李四",
            "processName": "做领",
            "quantity": 150,
            "unitPrice": 5.00,
            "totalAmount": 750.00,
            "scanType": "production",
            "recordCount": 5
        },
        {
            "operatorId": "OP001",
            "operatorName": "李四",
            "processName": "上领",
            "quantity": 150,
            "unitPrice": 3.50,
            "totalAmount": 525.00,
            "scanType": "production",
            "recordCount": 5
        }
    ]
}
```

---

## 📐 支持的生产模式

### 1️⃣ 整件模式（一人做所有工序）

订单 `PO20260122001` 由工人 `张三(OP001)` 完成：

| 操员ID | 操员名 | 工序 | 数量 | 单价 | 小计 |
|--------|--------|------|------|------|------|
| OP001 | 张三 | 做领 | 100 | 5.00 | 500 |
| OP001 | 张三 | 上领 | 100 | 3.50 | 350 |
| OP001 | 张三 | 钉纽 | 100 | 2.00 | 200 |
| **合计** | | | **300** | | **1,050** |

### 2️⃣ 流水线模式（多人流水线生产）

同一订单由多个工人分工完成：

| 操员ID | 操员名 | 工序 | 数量 | 单价 | 小计 |
|--------|--------|------|------|------|------|
| OP001 | 张三 | 做领 | 100 | 5.00 | 500 |
| OP002 | 李四 | 上领 | 100 | 3.50 | 350 |
| OP003 | 王五 | 钉纽 | 100 | 2.00 | 200 |
| **合计** | | | **300** | | **1,050** |

**自动识别机制：** 不需要手动配置，系统根据 ScanRecord 的 `operator_id` 字段自动识别每个工人，聚合对应的工序和工资。

---

## 🧪 前端调用示例

在 PayrollOperatorSummary.tsx 中：

```typescript
// 已有的 API 调用
const res = await api.post<any>(
    '/finance/payroll-settlement/operator-summary', 
    buildPayload()
);

// buildPayload() 返回的结构
{
    orderNo: 'PO20260122001',
    operatorName: '',
    processName: '',
    startTime: '2026-01-20 00:00:00',
    endTime: '2026-01-23 23:59:59',
    includeSettled: true
}
```

---

## ✅ 编译状态

```
[INFO] BUILD SUCCESS
[INFO] Total time: 5.106 s
```

后端编译通过，没有错误。

---

## 📝 菜单导航变化

### 旧菜单
```
财务管理
├── 物料对账
├── 成品结算
├── 审批付款
├── 工资结算          ❌ 已删除
└── 人员工序统计      ← 旧标题
```

### 新菜单
```
财务管理
├── 物料对账
├── 成品结算
├── 审批付款
└── 人员工序结算      ← 新标题（包含工资聚合）
```

---

## 🎯 下一步工作

1. **前端表格功能增强**（可选）
   - [ ] 添加按人员汇总的二级表头
   - [ ] 添加人员维度的合计行
   - [ ] 支持按人员折叠/展开显示详细工序

2. **审批/支付功能**（可选）
   - [ ] 添加"生成结算单"功能
   - [ ] 添加"审批工资"功能
   - [ ] 添加"标记已支付"状态

3. **数据库优化**（可选）
   - [ ] 创建 t_payroll_settlement 表存储历史记录
   - [ ] 创建 t_payroll_settlement_detail 表存储细节

---

## 📚 相关文档

- [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) - 开发指南
- [SCAN_SYSTEM_LOGIC.md](SCAN_SYSTEM_LOGIC.md) - 扫码系统逻辑
- [PAYROLL_REDESIGN.md](PAYROLL_REDESIGN.md) - 旧的设计文档（已过期）

---

*最后更新：2026-01-23*
*提交：fd0784f7 + 2b0536c3*

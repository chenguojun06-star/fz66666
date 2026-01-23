# 工资结算模块 - 业务需求重新设计

## 核心修改

### 问题识别
- ❌ 当前按 **工厂** 分组 → 应改为按 **员工** 分组
- ❌ 有 "销售价格" 字段 → 应删除，只有 **成本价格**
- ❌ 没有正确利用Phase 5的 `operator_id/operator_name` 和 `process_unit_price`

---

## 新的工资结算设计

### 业务流程

```
Phase 5 扫码数据:
├─ 工人: 张三 (operator_name)
├─ 工序: 做领 (process_name)
├─ 数量: 50件 (quantity)
├─ 工序单价: 2.50元 (process_unit_price)
└─ 扫码成本: 125元 (scan_cost = 50 × 2.50)
    ↓
    按 operator_id + process_name 分组求和
    ↓
工资统计数据:
├─ 员工: 张三 (operator_name)
├─ 工序: 做领 (process_name)
├─ 扫码数量: 50件 (SUM(quantity))
├─ 单价: 2.50元 (process_unit_price)
├─ 合计工资: 125.00元 (SUM(scan_cost))
└─ 周期: 2026-01-20 ~ 2026-01-26
    ↓
    员工工资结算单
    ├─ 员工: 张三
    ├─ 周期: 2026-01-20 ~ 2026-01-26
    ├─ 工序明细:
    │  ├─ 做领: 50件 × 2.50元 = 125.00元
    │  ├─ 上领: 40件 × 1.50元 = 60.00元
    │  └─ 做袖: 30件 × 1.50元 = 45.00元
    ├─ 合计工资: 230.00元
    └─ 审批状态: 待审批
```

---

## 数据库设计

### t_scan_record (已有)
已包含所有必要数据，无需改动

### t_payroll_settlement (新)
工资结算单主表

```sql
CREATE TABLE t_payroll_settlement (
  id VARCHAR(36) PRIMARY KEY,
  settlement_no VARCHAR(50) UNIQUE,        -- 结算单号
  operator_id VARCHAR(36),                 -- 员工ID
  operator_name VARCHAR(50),               -- 员工名称
  settlement_period VARCHAR(50),           -- 结算周期 (2026-01-20 ~ 01-26)
  period_start_date DATE,                  -- 周期开始
  period_end_date DATE,                    -- 周期结束
  total_quantity INT DEFAULT 0,            -- 总扫码数量
  total_work_hours DECIMAL(10,2),          -- 总工时 (可选)
  total_salary DECIMAL(15,2),              -- 总工资 (= SUM(scan_cost))
  approved_salary DECIMAL(15,2),           -- 审批后工资 (可能有调整)
  deduction_amount DECIMAL(15,2),          -- 扣款 (缺勤等)
  actual_paid_amount DECIMAL(15,2),        -- 实际支付
  status VARCHAR(20) DEFAULT 'pending',    -- pending/approved/rejected/paid
  submitted_at DATETIME,
  approved_by VARCHAR(36),
  approved_at DATETIME,
  paid_at DATETIME,
  remark VARCHAR(255),
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 注意: 没有销售价格、没有工厂字段
```

### t_payroll_settlement_detail (新)
工资结算详情表（每个工序一行）

```sql
CREATE TABLE t_payroll_settlement_detail (
  id VARCHAR(36) PRIMARY KEY,
  settlement_id VARCHAR(36),               -- 关联结算单
  process_code VARCHAR(50),                -- 工序代码
  process_name VARCHAR(100),               -- 工序名称
  quantity INT,                            -- 该工序扫码数量
  unit_price DECIMAL(10,2),                -- 该工序单价
  subtotal_salary DECIMAL(15,2),           -- 该工序工资 (quantity × unit_price)
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 示例数据:
-- | id | settlement_id | process_name | quantity | unit_price | subtotal_salary |
-- | 01 | xxx           | 做领        | 50       | 2.50       | 125.00          |
-- | 02 | xxx           | 上领        | 40       | 1.50       | 60.00           |
-- | 03 | xxx           | 做袖        | 30       | 1.50       | 45.00           |
```

---

## 前端页面设计

### Tab 1: 工资统计（待审批的结算数据）
显示每个员工 + 工序的待审批记录

| 员工名称 | 工序 | 扫码数量 | 单价 | 小计工资 | 周期 | 状态 | 操作 |
|---------|------|---------|------|---------|------|------|------|
| 张三 | 做领 | 50 | 2.50 | 125.00 | 2026-01-20~26 | 待审批 | 审批 |
| 张三 | 上领 | 40 | 1.50 | 60.00 | 2026-01-20~26 | 待审批 | 审批 |
| 李四 | 做领 | 60 | 2.50 | 150.00 | 2026-01-20~26 | 待审批 | 审批 |

### Tab 2: 结算单管理（已生成的结算单）
显示每个员工的结算单总合

| 员工名称 | 周期 | 工序数 | 总数量 | 总工资 | 审批工资 | 实际支付 | 状态 | 操作 |
|---------|------|-------|-------|--------|---------|---------|------|------|
| 张三 | 2026-01-20~26 | 3 | 120 | 230.00 | 230.00 | 230.00 | 已支付 | 详情/查看 |
| 李四 | 2026-01-20~26 | 2 | 110 | 185.00 | 185.00 | - | 已审批 | 详情/支付 |

---

## 后端API设计

### 查询工资统计数据 (待审批)
```
GET /api/payroll/settlement-data/pending
Query Params:
  - settlementPeriod: 2026-01-20~26
  - page, pageSize
  
Response:
{
  "records": [
    {
      "id": "uuid1",
      "operatorId": "op1",
      "operatorName": "张三",
      "processCode": "PC001",
      "processName": "做领",
      "quantity": 50,
      "unitPrice": 2.50,
      "subtotalSalary": 125.00,
      "settlementPeriod": "2026-01-20~26",
      "status": "pending"
    }
  ],
  "total": 10
}
```

### 审批单条工资数据
```
POST /api/payroll/settlement-data/{dataId}/approve
Body:
{
  "approved": true,
  "approvedAmount": 125.00,  // 可能有调整
  "remark": "已审核"
}
```

### 生成工资结算单
```
POST /api/payroll/settlement/generate
Body:
{
  "settlementPeriod": "2026-01-20~26",
  "operatorIds": ["op1", "op2"]  // 要结算的员工
}

Response:
{
  "settlementId": "uuid",
  "operatorName": "张三",
  "totalSalary": 230.00,
  "details": [
    { "processName": "做领", "quantity": 50, "unitPrice": 2.50, "subtotal": 125.00 },
    { "processName": "上领", "quantity": 40, "unitPrice": 1.50, "subtotal": 60.00 }
  ]
}
```

### 审批工资结算单
```
POST /api/payroll/settlement/{settlementId}/approve
Body:
{
  "approved": true,
  "approvedAmount": 230.00,
  "remark": "已审批"
}
```

### 执行支付
```
POST /api/payroll/settlement/{settlementId}/pay
Body:
{
  "paymentMethod": "transfer",  // transfer/cash
  "bankAccount": "...",
  "remark": "已支付"
}
```

---

## 核心修改清单

### 前端修改
- [ ] 移除 "工厂" 相关字段，改为 "员工"
- [ ] 移除 "销售价格" 字段
- [ ] 添加 "工序" 列显示
- [ ] 添加 "单价" 列显示
- [ ] 显示 "扫码数量" 而不是其他
- [ ] 调整Tab1和Tab2的表格结构

### 后端修改
- [ ] 创建 PayrollSettlementDetail Entity
- [ ] 修改 PayrollSettlement Entity (移除工厂、销售价格)
- [ ] 重写 PayrollSettlementOrchestrator:
  - 从 ScanRecord 查询数据
  - 按 operator_id + process_name 分组
  - 生成工资统计数据
  - 生成结算单
- [ ] 创建 PayrollSettlementDetailMapper

### 数据库修改
- [ ] 创建 t_payroll_settlement 表（新)
- [ ] 创建 t_payroll_settlement_detail 表（新）
- [ ] 删除错误的字段（工厂、销售价格等）

---

**注意**: 这个重新设计会改变当前的数据结构和API，但逻辑更清晰、更符合业务需求

确认这个设计是否符合您的要求？还是需要继续调整？

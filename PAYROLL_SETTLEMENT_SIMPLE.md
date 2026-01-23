# 工资结算模块 - 简化实现指南

## 📋 概述

在Phase 5工序单价识别系统的基础上，添加简单的财务审批和支付功能。

**核心理念**：
- ✅ 复用Phase 5的 `ScanRecord.processUnitPrice` 和 `ScanRecord.scanCost`
- ✅ 按现有PC端模式添加（不创建新的复杂系统）
- ✅ 最小化代码（只添加必要部分）

---

## 🏗️ 已创建的文件

### 前端
```
frontend/src/pages/Finance/PayrollSettlement.tsx (新增)
  └─ 结算数据和结算单的审批页面
     - 两个Tab：结算数据 / 结算单
     - 简单的审批表单
     - 支付按钮
```

### 后端
```
backend/src/main/java/com/fashion/supplychain/payroll/
  └─ controller/PayrollSettlementController.java (新增)
     - 5个简单的API端点
     - 权限控制：FINANCE_VIEW / FINANCE_APPROVAL / PAYMENT_EXECUTE
```

### 数据库
```
scripts/create_payroll_simple.sql (新增)
  ├─ t_payroll_settlement_data（结算数据）
  ├─ t_payroll_settlement（结算单）
  └─ t_payment_record（支付记录）
```

### 路由配置
```
frontend/src/routeConfig.ts (已修改)
  ├─ paths.payrollSettlement = '/finance/payroll-settlement'
  ├─ permissionCodes.payrollSettlement = 'MENU_PAYROLL_SETTLEMENT'
  └─ 财务管理菜单增加"工资结算"
```

---

## 🚀 快速启动

### 1️⃣ 创建数据库表（5分钟）

```bash
# 登录MySQL并执行SQL
mysql -u root -p fashion_supplychain < scripts/create_payroll_simple.sql
```

### 2️⃣ 添加权限码到数据库（已自动执行）

SQL脚本已包含权限配置，自动添加：
- `FINANCE_VIEW` - 财务查看
- `FINANCE_APPROVAL` - 财务审批
- `PAYMENT_EXECUTE` - 支付执行

### 3️⃣ 分配权限给角色（根据需要）

```bash
# 给FINANCE角色分配权限
INSERT INTO t_role_permission (role_code, permission_code, permission_name)
VALUES 
  ('FINANCE', 'FINANCE_VIEW', '财务查看'),
  ('FINANCE', 'FINANCE_APPROVAL', '财务审批'),
  ('FINANCE', 'PAYMENT_EXECUTE', '支付执行');
```

### 4️⃣ 实现后端API（一天）

在 `PayrollSettlementController.java` 中，按照现有模式实现5个TODO方法：

```java
// 1. getPendingSettlementData - 查询待审批的结算数据
// 从ScanRecord按factory_id + process_name分组

// 2. approveSettlementData - 审批结算数据
// 更新t_payroll_settlement_data的status和approved_by

// 3. getPayrollSettlements - 查询结算单列表
// 从t_payroll_settlement查询

// 4. approvePayrollSettlement - 审批结算单
// 更新status和approved_amount

// 5. executePayment - 执行支付
// 记录到t_payment_record
```

### 5️⃣ 启动应用

```bash
cd backend && mvn clean spring-boot:run &
cd frontend && npm run dev
```

访问：http://localhost:5173/finance/payroll-settlement

---

## 🔄 数据流程

```
┌─────────────────────────────────────────────────────┐
│ Phase 5: ScanRecord                                 │
│ ├─ processUnitPrice (工序单价)                      │
│ └─ scanCost (扫码成本)                              │
└─────────────────────────────────────────────────────┘
              ↓ (按周期汇总)
┌─────────────────────────────────────────────────────┐
│ 结算数据表 (t_payroll_settlement_data)              │
│ ├─ 工厂 + 工序分组                                  │
│ ├─ 合计数量、单价、金额                             │
│ └─ status: pending → approved                       │
└─────────────────────────────────────────────────────┘
              ↓ (汇总)
┌─────────────────────────────────────────────────────┐
│ 结算单表 (t_payroll_settlement)                     │
│ ├─ 按工厂生成一份结算单                             │
│ ├─ 应付金额 = SUM(结算数据)                         │
│ └─ status: submitted → approved → completed        │
└─────────────────────────────────────────────────────┘
              ↓ (支付)
┌─────────────────────────────────────────────────────┐
│ 支付记录表 (t_payment_record)                       │
│ ├─ 记录支付信息                                     │
│ └─ 用于对账和审计                                   │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 功能说明

### PC端页面：工资结算管理

**Tab 1: 结算数据**
- 显示待审批的结算数据（从ScanRecord汇总）
- 可选择性审批（一条条批准）
- 列表字段：工厂、工序、数量、单价、合计、周期、状态

**Tab 2: 结算单**
- 显示汇总后的结算单
- 可审批（调整金额）
- 可支付（执行转账）
- 列表字段：结算单号、工厂、周期、应付、实付、状态

### API端点

```
GET  /api/payroll/settlement-data/pending
     └─ 获取待审批的结算数据

POST /api/payroll/settlement-data/{dataId}/approve
     └─ 审批结算数据

GET  /api/payroll/settlement
     └─ 获取结算单列表

POST /api/payroll/settlement/{settlementId}/approve
     └─ 审批结算单

POST /api/payroll/payment/execute
     └─ 执行支付
```

---

## 📝 实现建议

### 后端Service实现思路

```java
// 从ScanRecord查询并分组
List<ScanRecord> records = scanRecordService.selectByPeriod(period);

// 按factory_id + process_name分组
Map<String, List<ScanRecord>> grouped = records.stream()
  .collect(groupingBy(r -> r.getFactoryId() + "|" + r.getProcessName()));

// 为每个分组生成结算数据
for (String key : grouped.keySet()) {
  SettlementData data = new SettlementData();
  data.setFactory(grouped.get(key).get(0).getFactoryName());
  data.setProcessName(grouped.get(key).get(0).getProcessName());
  data.setQuantity(grouped.get(key).stream()
    .mapToInt(ScanRecord::getQuantity).sum());
  data.setUnitPrice(grouped.get(key).get(0).getProcessUnitPrice());
  data.setTotalCost(grouped.get(key).stream()
    .map(ScanRecord::getScanCost)
    .reduce(BigDecimal.ZERO, BigDecimal::add));
  settlementDataService.save(data);
}
```

### 权限控制

```java
@GetMapping("/settlement-data/pending")
@PreAuthorize("hasAuthority('FINANCE_VIEW')")  // ← 查看权限

@PostMapping("/settlement-data/{dataId}/approve")
@PreAuthorize("hasAuthority('FINANCE_APPROVAL')")  // ← 审批权限

@PostMapping("/payment/execute")
@PreAuthorize("hasAuthority('PAYMENT_EXECUTE')")  // ← 支付权限
```

---

## ✅ 验证清单

- [ ] 数据库表创建成功
- [ ] 权限码已添加到系统
- [ ] 财务菜单显示"工资结算"菜单项
- [ ] 点击菜单可访问结算页面
- [ ] 结算数据Tab可加载数据
- [ ] 结算单Tab可加载数据
- [ ] 可以点击"审批"按钮
- [ ] 可以点击"支付"按钮
- [ ] API返回正确的数据

---

## 📌 注意事项

1. **扫码数据必需**：ScanRecord中必须有`processUnitPrice`和`scanCost`字段（Phase 5已实现）

2. **权限分配**：需要在系统中给对应角色分配权限，用户才能访问

3. **定期汇总**：建议定时任务周期性地将ScanRecord汇总到结算数据（可选）

4. **支付方式**：目前简化版只支持转账，可扩展支持现金、支票等

5. **对账**：支付记录保存供财务对账使用

---

*这是一个简化版实现，仅包含核心功能。如需扩展（如按工人结算、多币种等），可基于此基础增添。*

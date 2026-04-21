# P0 - 打印中文不显示问题

## 问题描述
所有打印组件（标签打印、洗水唛打印、裁剪单打印、生产制单打印等）在打印预览和打印输出中，中文字符全部不显示，只显示数字、字母和符号。

## 根因
**`font-family` 最终回退使用 `sans-serif` 导致中文无法渲染。**

在 macOS 系统上（特别是未安装 PingFang SC 和 Microsoft YaHei 字体的环境）：
- `sans-serif` 回退到 **Helvetica** → Helvetica 没有中文字符 → 中文显示为空白
- `serif` 回退到 **Songti SC（宋体）** → 有中文字符 → 中文正常显示

## 规则（以后必须遵守）
**打印相关的 `font-family` 必须以 `serif` 结尾，不能用 `sans-serif`。**

```css
/* ❌ 错误 */
font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;

/* ✅ 正确 */
font-family: 'Heiti SC', 'Songti SC', 'Hiragino Sans GB', 'STSong', 'Arial Unicode MS', serif;
```

---

# P0 - 数据库操作必看规则

## 规则1：Flyway 迁移脚本禁止使用 `COMMENT ''` 语法

### 根因
Flyway SQL 解析器将 `''` 视为字符串结束符，导致 `ALTER TABLE` 语句被截断。脚本标记为"已成功执行"但列实际从未创建，导致 `SELECT *` 报 `Unknown column` 错误（HTTP 500）。

```sql
-- ❌ 错误 - COMMENT '' 导致 Flyway 截断
SET @s = CONCAT('ALTER TABLE t_xxx ADD COLUMN yyy VARCHAR(64) COMMENT ''备注''');

-- ✅ 正确 - 使用 COMMENT 不带单引号嵌套，或直接写 DDL
ALTER TABLE t_xxx ADD COLUMN yyy VARCHAR(64) COMMENT '备注';
```

## 规则2：所有新增实体字段必须同步到 DbColumnRepairRunner

### 原因
Flyway 迁移可能因各种原因（语法bug、执行顺序、数据库权限）静默失败。`DbColumnRepairRunner` 是最后一道防线，应用启动时自动检测并补列。

### 操作流程
1. 新增实体字段时，先写 Flyway 迁移脚本
2. **同时**在 `DbColumnRepairRunner.java` 中添加对应的 `ensureColumn` 调用
3. 确保 `ensureColumn` 的列定义与 Flyway 脚本一致

```java
// ✅ 必须添加
repaired += ensureColumn(conn, schema, "t_production_order", "new_field",
        "VARCHAR(64) DEFAULT NULL");
```

## 规则3：实体有 deleteFlag 字段的，所有查询必须加过滤

### 原因
已软删除的数据不应出现在业务查询结果中，否则导致统计不准、数据混乱。

```java
// ❌ 错误 - 缺少 deleteFlag 过滤
productionOrderService.lambdaQuery().eq(ProductionOrder::getStatus, "ACTIVE").list();

// ✅ 正确
productionOrderService.lambdaQuery()
    .eq(ProductionOrder::getDeleteFlag, 0)
    .eq(ProductionOrder::getStatus, "ACTIVE").list();
```

### 已知缺少 deleteFlag 的实体（需注意）
- `ScanRecord` — 无 deleteFlag，扫码撤销使用物理删除
- `ShipmentReconciliation` — 无 deleteFlag，查询时需注意
- `CuttingTask` / `CuttingBundle` — 无 deleteFlag
- `StyleInfo` — 无 deleteFlag

## 规则4：导出端点必须添加行数限制

### 原因
全量查询 `service.list(wrapper)` 在数据量大时导致 OOM。

```java
// ❌ 错误 - 无限制
List<XxxEntity> data = xxxService.list(wrapper);

// ✅ 正确 - 限制最大行数
wrapper.last("LIMIT 5000");
List<XxxEntity> data = xxxService.list(wrapper);
```

## 规则5：ScanRecord 查询必须排除 orchestration 类型

### 原因
`scan_type = 'orchestration'` 是系统自动生成的编排记录，不是真实扫码，统计时必须排除。

```java
// ✅ 必须添加
.ne(ScanRecord::getScanType, "orchestration")
// 或原生SQL
.ne("scan_type", "orchestration")
```

---

# P0 - 租户隔离与外发工厂规则

## 系统架构

```
平台超级管理员 (superAdmin=true, tenantId=null)
    └── 租户 (Tenant) — tenantType: SELF_FACTORY / HYBRID / BRAND
        ├── 租户用户 (factoryId=null) — 可看租户全部数据
        └── 工厂 (Factory) — factoryType: INTERNAL / EXTERNAL
            └── 工厂用户 (factoryId=工厂ID) — 只能看本工厂数据
```

## 数据隔离四层机制

| 层级 | 机制 | 作用范围 |
|------|------|---------|
| L1 | TenantInterceptor 自动追加 `WHERE tenant_id = ?` | 所有业务表的全局SQL拦截 |
| L2 | UserContext.factoryId() + 业务代码手动过滤 | 生产订单、扫码记录、仪表板 |
| L3 | DataPermissionHelper 按 permissionRange 过滤 | 操作人相关数据 |
| L4 | TenantAssert / ScanRecordPermissionHelper | 写操作前的显式校验 |

## 规则6：读操作必须强制校验租户上下文

### 原因
`tenantId != null` 条件过滤在 tenantId 为 null 时跳过，导致跨租户数据泄露。

```java
// ❌ 错误 - tenantId 为 null 时不加过滤，返回所有租户数据
.eq(tenantId != null, Payable::getTenantId, tenantId)

// ✅ 正确 - 先断言，再无条件过滤
TenantAssert.assertTenantContext();
Long tenantId = UserContext.tenantId();
.eq(Payable::getTenantId, tenantId)
```

## 规则7：写操作必须校验实体归属租户

### 原因
仅校验上下文存在不够，还需确认操作的实体属于当前租户，防止通过ID直接操作其他租户数据。

```java
// ❌ 错误 - 只检查上下文，不检查实体归属
TenantAssert.assertTenantContext();
XxxEntity entity = service.getById(id);
entity.setStatus("approved");
service.updateById(entity);

// ✅ 正确 - 检查实体归属
TenantAssert.assertTenantContext();
XxxEntity entity = service.getById(id);
TenantAssert.assertBelongsToCurrentTenant(entity.getTenantId(), "实体名称");
entity.setStatus("approved");
service.updateById(entity);
```

## 规则8：getById 必须加租户过滤

### 原因
`service.getById(id)` 无租户过滤，任何用户只要知道ID就能查到其他租户数据。

```java
// ❌ 错误 - 无租户过滤
public Payable getById(String id) {
    return payableService.getById(id);
}

// ✅ 正确 - 加租户过滤
public Payable getById(String id) {
    Long tenantId = UserContext.tenantId();
    return payableService.lambdaQuery()
            .eq(Payable::getId, id)
            .eq(Payable::getTenantId, tenantId)
            .one();
}
```

## 规则9：工厂账号数据隔离

### 工厂用户特征
- `UserContext.factoryId()` 非空 = 外发工厂账号
- `UserContext.factoryId()` 为空 = 租户普通账号

### 工厂账号可见范围
- ✅ 本工厂关联的生产订单（通过 `factory_id` 过滤）
- ✅ 本工厂订单的扫码记录
- ❌ 其他工厂的订单和扫码
- ❌ 样衣开发、财务审批、出入库等敏感数据（仪表板置零）
- ❌ 出货对账、物料对账数据

### 工厂账号扫码归属校验
- 内部用户 + 内部订单 → ✅ 通过
- 内部用户 + 外发订单 → ❌ 拒绝
- 外发工厂用户 + 本工厂外发订单 → ✅ 通过
- 外发工厂用户 + 其他工厂外发订单 → ❌ 拒绝
- 外发工厂用户 + 内部订单 → ❌ 拒绝
- 质检扫码不做工厂归属校验（任何工人都可质检）

## 规则10：裁剪管理业务规则

### 裁剪撤回规则
- 裁剪已完成（bundled状态）→ 普通人员**不能撤回**，仅管理员可撤回
- 裁剪未完成 → 按普通撤回规则（30分钟/管理员5小时）
- 裁剪退回重扫 → 整批删除该订单所有菲号（非按单个菲号）

---

# P0 - 财务权限规则

## 规则11：财务Controller必须使用细粒度权限码

### 原因
仅 `@PreAuthorize("isAuthenticated()")` 允许任何登录用户执行财务操作，存在严重安全风险。

### 权限码命名规范
- 查看权限：`MENU_FINANCE_{DOMAIN}_VIEW`
- 管理权限：`FINANCE_{DOMAIN}_MANAGE`

```java
// ✅ 正确
@PreAuthorize("hasAuthority('MENU_FINANCE_INVOICE_VIEW')")
@GetMapping("/list")
public Result<...> list(...) { ... }

@PreAuthorize("hasAuthority('FINANCE_INVOICE_MANAGE')")
@PostMapping("/create")
public Result<...> create(...) { ... }
```

### 已配置权限的Controller
InvoiceController, PayableController, FinancialReportController, TaxConfigController,
BillAggregationController, EcSalesRevenueController, FinanceTaxExportController,
ExpenseReimbursementController, ShipmentReconciliationController, MaterialReconciliationController,
ReconciliationCompatController, FinishedProductSettlementController, PayrollSettlementController

---

# P0 - 多端兼容规则

## 规则12：打印 font-family 必须以 serif 结尾

（同上方 P0 打印规则）

## 规则13：Flutter 端 API 参数必须与后端一致

### 已知参数映射
| Flutter 字段 | 后端期望字段 | 说明 |
|-------------|------------|------|
| `recordId` | `recordId` | 撤销/退回重扫 |
| `question` | `question` | AI对话（非message） |
| `/ws/realtime` | `/ws/realtime` | WebSocket路径（非/ws） |
| `ping`（小写） | `ping`（小写） | 心跳类型（非PING） |

## 规则14：小程序 SSE 必须支持全部参数

小程序端 AI 对话 SSE 请求必须包含：question, pageContext, conversationId, imageUrl, orderNo, processName, stage

---

# P0 - 异常处理规则

## 规则15：禁止空 catch 块

### 原因
空 catch 块导致异常被静默吞没，操作失败时前端收到成功响应但数据未变更。

```java
// ❌ 错误
} catch (Exception e) {
}

// ✅ 正确 - 至少记录日志
} catch (Exception e) {
    log.warn("[模块] 操作失败: {}", e.getMessage());
}
```

## 规则16：Flyway 迁移异常不能静默跳过

```java
// ❌ 错误 - 迁移异常被吞没，Flyway标记为成功但实际未执行
} catch (Exception e) {
    return false;
}

// ✅ 正确 - 记录日志，让Flyway感知到问题
} catch (Exception e) {
    log.warn("[V47] 检查异常: {}", e.getMessage());
    return false;
}
```

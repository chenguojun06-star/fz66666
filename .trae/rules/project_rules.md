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

### 扫码API参数映射（POST /api/production/scan/execute）

| 后端期望字段 | 小程序 | H5 | Flutter | 说明 |
|-------------|--------|-----|---------|------|
| `scanCode` | ✅ scanCode | ✅ scanCode | **必须用scanCode** | 扫码内容（禁止用qrCode） |
| `scanType` | ✅ scanType | ✅ scanType | ✅ scanType | 扫码类型（禁止用type） |
| `processName` | ✅ processName | ✅ processName | ✅ processName | 工序名 |
| `quantity` | ✅ quantity | ✅ quantity | ✅ quantity | 数量 |
| `qualityStage` | ✅ receive/confirm | ✅ receive/confirm | ✅ receive/confirm | 质检阶段（禁止用quality_confirm） |
| `qualityResult` | ✅ qualified/unqualified | ✅ qualified/unqualified | ✅ qualified/unqualified | 质检结果（禁止用qualified/defective） |
| `source` | ✅ miniprogram | ✅ h5 | ✅ flutter | 来源标识 |
| `requestId` | 后端生成 | h5_xxx | flutter_xxx | 幂等ID |

### 已知参数映射
| Flutter 字段 | 后端期望字段 | 说明 |
|-------------|------------|------|
| `recordId` | `recordId` | 撤销/退回重扫 |
| `question` | `question` | AI对话（非message） |
| `/ws/realtime` | `/ws/realtime` | WebSocket路径（非/ws） |
| `ping`（小写） | `ping`（小写） | 心跳类型（非PING） |

### 质检两步提交协议
后端质检必须分两步提交（receive + confirm），禁止一步提交：
```javascript
// 第1步：receive（接收质检）
{ scanType: 'quality', qualityStage: 'receive', scanCode, orderNo, quantity, ... }

// 第2步：confirm（确认质检结果）
{ scanType: 'quality', qualityStage: 'confirm', qualityResult: 'qualified'/'unqualified',
  defectQuantity: 0, scanCode, orderNo, ... }
```

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

---

# P0 - 大货扫码流程规则

## 规则17：6大固定父进度节点

大货生产流程有6个固定父进度节点，所有子工序必须映射到这6个节点之一：

```
采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库
```

定义位置：`ProductionScanExecutor.FIXED_PRODUCTION_NODES`、`ProcessStageDetector.FIXED_PRODUCTION_NODES`、`ProductionScanStageSupport.FIXED_PRODUCTION_NODES`

### 父节点与子工序映射表

| 父节点 | 标准名 | 常见子工序/同义词 | scanType |
|--------|--------|-----------------|----------|
| 采购 | 采购 | 物料采购/面辅料采购/备料/到料/进料 | orchestration（系统编排） |
| 裁剪 | 裁剪 | 裁床/剪裁/开裁/裁片/裁切 | cutting |
| 二次工艺 | 二次工艺 | 绣花/印花/水洗/压花/烫钻/烫画/贴标/钉珠/数码印/激光/特殊工艺 | production |
| 车缝 | 车缝 | 缝制/缝纫/车工/整件/车位/上领/上袖/埋夹/做领/拼缝/合缝 | production |
| 尾部 | 尾部 | 大烫/整烫/剪线/包装/打包/后整/质检/品检/验货 | production/quality |
| 入库 | 入库 | 仓储/上架/进仓/入仓/成品入库 | warehouse |

### 子工序→父节点映射优先级（5级）

1. 模板 `progressStage` 直接指向6个固定父节点 → 直接使用
2. 模板 `progressStage` 为别名 → `normalizeFixedProductionNodeName` 归一化
3. 别名无法归一化 → 动态映射表 `t_process_parent_mapping` 查找
4. 模板中找不到 → 动态映射表按 `processName` 查找
5. 以上均无结果 → 返回 null（调用方决定是否使用 processName 本身）

## 规则18：扫码类型链路

扫码类型（scanType）有4大阶段，必须按顺序流转：

```
cutting → production → quality → warehouse
```

- `orchestration` — 系统自动编排记录（下单/采购），不参与工资统计，查询时必须排除
- `sewing` — 前端传入时自动转为 `production`（ScanRecordOrchestrator 第244-247行）
- `pattern` — 样衣扫码专用，同步写入 `t_scan_record` 参与工资统计

### scanType 值域标准

| scanType | 说明 | 允许的来源 |
|----------|------|-----------|
| `cutting` | 裁剪扫码 | 小程序/H5/Flutter |
| `production` | 生产扫码（含车缝/二次工艺/尾部） | 小程序/H5/Flutter |
| `quality` | 质检扫码 | 小程序/H5/Flutter |
| `warehouse` | 入库扫码 | 小程序/H5/Flutter |
| `pattern` | 样衣扫码 | 小程序/H5（PatternProductionOrchestrator写入） |
| `orchestration` | 系统编排（禁止前端传入） | 后端自动生成 |

**禁止前端传入的值**：`procurement`、`material_roll`、`quality_confirm`、`sewing`

## 规则19：阶段门控校验

进入当前父节点前，上一个父节点的全部子工序必须完成：

```
进入裁剪 → 采购子工序必须全部完成
进入二次工艺 → 裁剪子工序必须全部完成
进入车缝 → 二次工艺子工序必须全部完成（如有该阶段）
进入尾部 → 车缝子工序必须全部完成
进入入库 → 尾部子工序必须全部完成
```

### 豁免条件
- 历史订单（创建时间早于2026-04-01）跳过门禁
- 管理员（admin/manager/supervisor/主管/管理员）跳过门禁

## 规则20：ScanRecord 字段赋值规则

```java
sr.setProgressStage(progressStage);    // 父进度节点（如"车缝"），用于进度聚合
sr.setProcessName(processCode);        // 子工序名（如"上领"），用于显示和识别
sr.setProcessCode(processCode);        // 子工序名或自定义编码，用于去重
```

**关键规则**：`progressStage` 存储的是**父节点名**（经过映射后的），`processName` 存储的是**子工序名**（原始的）。

---

# P0 - 样衣扫码同步PC规则

## 规则21：样衣扫码双向同步机制

样衣扫码系统采用双表写入 + 双向同步机制：

### 小程序扫码 → PC同步
```
小程序扫码 → PatternProductionOrchestrator.submitScan()
  → 写入 t_pattern_scan_record（样衣专用扫码记录）
  → 同步写入 t_scan_record（scanType="pattern"，使工资统计能覆盖样衣扫码）
  → 更新 t_pattern_production 状态
  → 同步 t_style_info（sampleStatus/sampleProgress/sampleCompletedTime）
  → 同步库存（t_sample_stock / t_sample_loan）
```

### PC端操作 → 小程序同步
```
PC端入库 → SampleStockServiceImpl.inbound()
  → 创建 SampleStock + PatternScanRecord(WAREHOUSE_IN) + PatternProduction状态更新
PC端借出 → SampleStockServiceImpl.loan()
  → 创建 SampleLoan + PatternScanRecord(WAREHOUSE_OUT) + PatternProduction状态更新
PC端归还 → SampleStockServiceImpl.returnSample()
  → 更新 SampleLoan + PatternScanRecord(WAREHOUSE_RETURN) + PatternProduction状态更新
```

### 关键同步方法
- `PatternStatusHelper.syncStyleInfoOnReceive/OnScan/OnComplete/SampleStage/ReviewFields` — StyleInfo同步
- `PatternStockHelper.syncStockByOperation` — 库存同步
- `SampleStockServiceImpl.findPatternForStock` — 根据 styleId/styleNo + color 匹配 PatternProduction

## 规则22：样衣扫码状态流转

```
PENDING → IN_PROGRESS → PRODUCTION_COMPLETED → COMPLETED → WAREHOUSE_OUT → COMPLETED
```

| 操作类型 | 状态变更 | 进度节点 |
|---------|---------|---------|
| RECEIVE | → IN_PROGRESS | - |
| PLATE | → IN_PROGRESS | 裁剪=100 |
| FOLLOW_UP | → IN_PROGRESS | 车缝=100 |
| COMPLETE | → PRODUCTION_COMPLETED | 所有节点=100 |
| WAREHOUSE_IN | → COMPLETED | 入库=100 |
| WAREHOUSE_OUT | → WAREHOUSE_OUT | 出库=100 |
| WAREHOUSE_RETURN | → COMPLETED | 归还=100 |

## 规则23：样衣扫码与大货扫码的区别

| 维度 | 样衣扫码 | 大货扫码 |
|------|---------|---------|
| 主表 | t_pattern_scan_record | t_scan_record |
| 关联生产表 | t_pattern_production | t_production_order |
| scanType | pattern | production/cutting/quality/warehouse |
| 操作类型 | RECEIVE/PLATE/FOLLOW_UP/COMPLETE/WAREHOUSE_IN/OUT/RETURN | 裁剪/车缝/尾部/质检/入库 |
| 角色 | PLATE_WORKER/MERCHANDISER/WAREHOUSE | 操作工/质检员 |
| 库存 | t_sample_stock + t_sample_loan（支持借还） | t_product_stock（无借还） |
| 审核 | reviewStatus: PENDING/APPROVED/REJECTED | 无独立审核 |
| 菲号体系 | 无菲号 | 有菲号（cuttingBundleNo） |
| 工厂隔离 | 工厂账号不可见 | 工厂账号按factoryId过滤 |
| 进度模型 | progressNodes JSON | 基于ScanRecord的工序进度 |

## 规则24：样衣扫码工资统计

样衣扫码通过同步写入 `t_scan_record`（scanType="pattern"）参与工资统计。**修改样衣扫码逻辑时，必须确保同步写入的 ScanRecord 字段完整**，特别是：
- `operatorId` / `operatorName` — 操作员信息
- `processName` — 工序名称
- `quantity` — 数量
- `processUnitPrice` / `scanCost` — 工序单价和成本

---

# P0 - 数据库与实体一致性规则

## 规则25：新增字段必须三层同步

新增字段时必须同步以下三层，缺一不可：

1. **Java实体**（ScanRecord.java 等）— MyBatis-Plus 映射依赖
2. **Flyway迁移脚本** — 生产环境建列
3. **DbColumnRepairRunner** — 本地/异常环境的兜底补列
4. **前端TS类型**（production.ts 等）— TypeScript 类型安全

```java
// ❌ 错误 - 只写了Flyway，Java实体没有对应字段
// Flyway: ALTER TABLE t_scan_record ADD COLUMN current_progress_stage VARCHAR(100);
// 结果: SELECT * 时MyBatis-Plus不映射该列，前端拿到null

// ✅ 正确 - 三层全部同步
// 1. ScanRecord.java: private String currentProgressStage;
// 2. Flyway: ALTER TABLE t_scan_record ADD COLUMN current_progress_stage VARCHAR(100);
// 3. DbColumnRepairRunner: ensureColumn(conn, schema, "t_scan_record", "current_progress_stage", "VARCHAR(100) DEFAULT NULL");
// 4. production.ts: currentProgressStage?: string;
```

## 规则26：DbColumnRepairRunner 列定义必须与 Flyway 一致

### 已知精度不一致修复

| 列名 | Flyway定义 | DbColumnRepairRunner定义（已修复） |
|------|-----------|-------------------------------|
| process_unit_price | DECIMAL(15,2) | DECIMAL(15,2) ✅ |
| scan_cost | DECIMAL(15,2) | DECIMAL(15,2) ✅ |
| progress_stage | VARCHAR(100) | VARCHAR(100) ✅ |
| factory_id | VARCHAR(36) | VARCHAR(64)（兼容更长ID） |

## 规则27：ScanRecord 完整字段清单

ScanRecord 实体必须包含以下所有数据库字段（含V26/V38/V20260424002新增）：

### 基础字段
id, scanCode, requestId, orderId, orderNo, styleId, styleNo, color, size, quantity, unitPrice, totalAmount, processCode, progressStage, processName, operatorId, operatorName, scanTime, scanType, scanResult, remark, scanIp, cuttingBundleId, cuttingBundleNo, cuttingBundleQrCode, settlementStatus, payrollSettlementId, createTime, updateTime, tenantId, factoryId

### Phase 3/5/6 扩展字段
receiveTime, confirmTime, scanMode, skuCompletedCount, skuTotalCount, processUnitPrice, scanCost, delegateTargetType, delegateTargetId, delegateTargetName, actualOperatorId, actualOperatorName

### V26 进度追踪字段
currentProgressStage, progressNodeUnitPrices, cumulativeScanCount, totalScanCount, progressPercentage, totalPieceCost, averagePieceCost, assignmentId, assignedOperatorName

### 非数据库字段（@TableField(exist = false)）
cuttingDetails, bedNo, hasNextStageScan

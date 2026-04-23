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

### 事故记录（2026-04-24）
线上 `StyleQuotationMapper` 和 `ProductWarehousingMapper` 持续报 `setting parameters` 错误，根因是实体新增了22+个字段但 DbColumnRepairRunner 没有同步，导致数据库缺列，MyBatis-Plus SELECT * 映射失败。**用户看到的功能全部报错。**

### 操作流程
1. 新增实体字段时，先写 Flyway 迁移脚本
2. **同时**在 `DbColumnRepairRunner.java` 中添加对应的 `add()` 调用
3. 确保 `add()` 的列定义与 Flyway 脚本一致
4. **上线前必须验证**：对比实体字段和 DbColumnRepairRunner 的覆盖范围

```java
// ✅ 必须添加（在 COLUMN_FIXES static 块中）
add("t_production_order", "new_field", "VARCHAR(64) DEFAULT NULL");
```

### 验证方法（上线前必做）
对比实体 private 字段与 DbColumnRepairRunner 的 add/ensureColumn 调用，确保没有遗漏：
```bash
# 提取实体字段名（转snake_case）
grep "private" Entity.java | grep -v "TableField(exist=false)" | ...

# 提取 DbColumnRepairRunner 中已覆盖的列名
grep "add(\"t_xxx\"" DbColumnRepairRunner.java | ...

# 对比差异
diff <(实体字段) <(已覆盖列)
```

### 2026-04-24 已补全的缺失列
- t_product_warehousing: +22列（warehousing_no, factory_name, factory_type, order_biz_type, org_unit_id, parent_org_unit_id, parent_org_unit_name, org_path, scan_code, cutting_quantity, repair_remark, inspection_type, sample_size, accept_number, reject_number, control_chart_type, control_chart_data, inspector_cert_no, warehousing_start_time, warehousing_end_time, warehousing_operator_id, warehousing_operator_name）
- t_style_quotation: +4列（currency, version, is_locked, standard_other_cost）
- t_factory_shipment: +1列（received_quantity）

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

# P0 - API权限规则（重要！不要乱加权限码）

## 规则11：禁止给业务API加 hasAuthority 细粒度权限码

### 根因
系统已有完整的页面菜单 + 职位权限控制机制，用户分配职位时已决定能看哪些页面。在 API 层再加 `hasAuthority('MENU_FINANCE_XXX_VIEW')` 权限码，但数据库里没有给用户分配这些权限码，导致所有已登录用户访问接口返回 403 Forbidden。

**页面菜单已经控制了权限，API 层不需要重复限制！**

```java
// ❌ 错误 - 加了权限码但用户没有这个权限，全部403
@PreAuthorize("hasAuthority('MENU_FINANCE_INVOICE_VIEW')")
@GetMapping("/list")
public Result<...> list(...) { ... }

// ✅ 正确 - 只要登录就能访问，页面菜单控制谁能看到
@PreAuthorize("isAuthenticated()")
@GetMapping("/list")
public Result<...> list(...) { ... }
```

### 唯一例外：ROLE_SUPER_ADMIN
仅超级管理员专用接口（如租户管理、系统维护）可以保留 `hasAuthority('ROLE_SUPER_ADMIN')`，因为这类接口本来就不对普通用户开放。

### 以后做任何改动前必须考虑
1. **不要加没有用的东西** — 现有机制已经能控制的，不要重复加
2. **考虑影响范围** — 加了权限码，用户有没有这个权限？没有就会403
3. **先想清楚再动手** — 不要为了"安全"加一堆限制，结果把正常功能搞炸了

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

### 子工序→父节点映射机制（动态，非硬编码）

**子工序是动态的，取决于模板配置和动态映射表，禁止硬编码子工序同义词。**

映射优先级（5级，由 `resolveParentProgressStage` 执行）：

1. 模板 `progressStage` 直接指向6个固定父节点 → 直接使用
2. 模板 `progressStage` 为别名 → `normalizeFixedProductionNodeName` 归一化
3. 别名无法归一化 → 动态映射表 `t_process_parent_mapping` 查找
4. 模板中找不到 → 动态映射表按 `processName` 查找
5. 以上均无结果 → 返回 null（调用方决定是否使用 processName 本身）

### `normalizeFixedProductionNodeName` 的职责

该方法**只做6大父节点自身的归一化**（精确匹配 + `progressStageNameMatches` 模糊匹配），**不做子工序→父节点的映射**。子工序→父节点的映射由 `resolveParentProgressStage` 通过模板和动态映射表完成。

### 动态映射表 `t_process_parent_mapping`

| 字段 | 说明 |
|------|------|
| processKeyword | 子工序关键词（用于 contains 匹配） |
| parentNode | 父进度节点（6个之一） |
| tenantId | 租户ID，NULL 表示全局通用 |

新增子工序时，只需在 `t_process_parent_mapping` 表中添加映射记录即可，无需修改代码。

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

---

# P0 - 样衣入库PC端同步规则

## 规则28：样衣入库后PC端必须同步显示"已入库"

### 根因
`latestPatternStatus` 是虚拟字段，依赖 `PatternProduction.color` 与 `StyleInfo.color` 的精确匹配。颜色不匹配时查不到 PatternProduction，导致 PC 端一直显示"待入库"。

### 三层兜底机制（已修复）
1. **颜色精确匹配** → `buildStyleColorKey(styleId, color)` 精确查找
2. **styleId前缀匹配** → 颜色不一致时按 `styleId|` 前缀兜底查找
3. **sampleStatus 兜底** → 以上均失败时，直接读取 `StyleInfo.sampleStatus`，如果为 "COMPLETED" 则 `latestPatternStatus = "COMPLETED"`

### 前端兜底（已修复）
`buildConfirmStage` 中 `inboundCompleted` 判断增加 `sampleStatus === 'COMPLETED'` 兜底：
```typescript
const inboundCompleted = latestPatternStatus === 'COMPLETED' || sampleStatus === 'COMPLETED';
```

### 修改样衣入库逻辑时必须验证
1. `PatternProduction.status` 是否更新为 "COMPLETED"
2. `StyleInfo.sampleStatus` 是否同步更新为 "COMPLETED"
3. `StyleInfo.sampleCompletedTime` 是否设置
4. `SampleStock` 记录是否创建
5. PC端 `GET /api/style/info/list` 返回的 `latestPatternStatus` 是否为 "COMPLETED"

## 规则29：normalizeFixedProductionNodeName 只做父节点归一化

### 核心原则
`normalizeFixedProductionNodeName` **只做6大父节点自身的归一化**，不做子工序→父节点的映射。子工序→父节点的映射由 `resolveParentProgressStage` 通过模板配置和 `t_process_parent_mapping` 动态映射表完成。

### 禁止事项
- 禁止在 `CHILD_TO_PARENT` 中添加子工序同义词（如 "上领"→"车缝"）
- 禁止在代码中硬编码子工序名到父节点的映射
- 新增子工序只需在 `t_process_parent_mapping` 表中添加映射记录

### `CHILD_TO_PARENT` 只保留6大父节点自身映射
```java
CHILD_TO_PARENT.put("采购", "采购");
CHILD_TO_PARENT.put("裁剪", "裁剪");
CHILD_TO_PARENT.put("二次工艺", "二次工艺");
CHILD_TO_PARENT.put("车缝", "车缝");
CHILD_TO_PARENT.put("尾部", "尾部");
CHILD_TO_PARENT.put("入库", "入库");
```

## 规则30：阶段门控管理员豁免角色必须一致

所有管理员判断必须包含以下角色：`admin`、`ADMIN`、`manager`、`supervisor`、`主管`、`管理员`

```java
// ✅ 正确 - 完整角色列表
role.contains("admin") || role.contains("ADMIN") || role.contains("manager") 
    || role.contains("supervisor") || role.contains("主管") || role.contains("管理员")
```

涉及位置：
- `ProductionScanStageSupport.validateParentStagePrerequisite()` — 阶段门控
- `ScanRecordOrchestrator` — 裁剪撤回、普通撤回

## 规则31：扫码响应必须包含下一工序信息

后端扫码成功响应必须包含 `nextScanType` 和 `nextStageHint` 字段，减少前端二次请求：

```java
result.put("nextScanType", nextStage);     // "production" / "quality" / "warehouse"
result.put("nextStageHint", "下一环节: " + nextStage);
```

扫码类型链路：`cutting → production → quality → warehouse`

## 规则32：工序编号+工序名称必须同时显示

### 核心规则
所有显示工序信息的地方，必须同时显示**工序编号**和**工序名称**，格式为 `{编号} {名称}`（如 "01 裁剪"、"03 上领"）。

### 工序编号来源
工序编号来自模板 `progressWorkflowJson` 中的 `id` 字段，后端 `/process-config` API 返回的 `id` 字段。

### PC端已实现的格式化函数
```typescript
// frontend/src/utils/productionStage.ts
export const formatProcessDisplayName = (processCode?: string, processName?: string): string => {
  const code = String(processCode || '').trim();
  const name = String(processName || '').trim();
  if (!code && !name) return '-';
  if (!code) return name || '-';
  if (!name) return code;
  return `${code} ${name}`;  // 如 "01 裁剪"
};
```

### 各端实现方式

| 端 | 实现方式 | 示例 |
|---|---------|------|
| PC端 | `formatProcessDisplayName(record.id, v)` | "01 裁剪" |
| 小程序 | `` `${p.id} ${p.processName}` `` | "01 裁剪" |
| H5 | `` `${p.id} ${p.processName}` `` | "01 裁剪" |
| Flutter | `` '${processCode} ${processName}' `` | "01 裁剪" |

### 必须显示工序编号的位置
1. 订单管理 - 父子工序聚合弹窗（ProcessDetailModal）
2. 工序跟进弹窗（ProcessTrackingTable / NodeDetailModal）
3. 扫码确认页 - 工序选择器选项
4. 扫码结果页 - 工序信息栏
5. 进度详情页 - 子工序列表
6. 订单全流程页（OrderFlow）

---

# P0 - 扫码核心代码修改必看规则

## 规则33：normalizeFixedProductionNodeName 返回 null 时禁止覆盖原始值

### 根因
`normalizeFixedProductionNodeName` 的职责是**只做6大父节点自身的归一化**（如 "sewing"→"车缝"），当传入子工序名（如 "上领"、"上袖"）时返回 null。如果直接用返回值覆盖原始变量，会导致后续所有逻辑丢失工序信息，触发 NPE。

### 事故记录（2026-04-24）
在 `ProductionScanExecutor.execute()` 中，有人加了 `progressStage = normalizeFixedProductionNodeName(progressStage);`，导致扫码全部500：
```
用户扫码传入 processName="上领"（子工序名）
→ normalizeFixedProductionNodeName("上领") 返回 null
→ progressStage = null
→ childProcessName = null
→ resolveParentProgressStage(styleNo, null) 返回 null
→ "裁剪".equals(progressStage.trim()) → NPE！
→ 扫码接口全部 500 Internal Server Error
```

### 规则（以后必须遵守）

**1. `normalizeFixedProductionNodeName` 返回值必须做 null 判断，不能直接覆盖：**

```java
// ❌ 错误 - 子工序名会返回 null，覆盖原始值导致后续 NPE
progressStage = normalizeFixedProductionNodeName(progressStage);

// ✅ 正确 - null 时保留原始值
String normalizedStage = normalizeFixedProductionNodeName(progressStage);
if (normalizedStage != null) {
    progressStage = normalizedStage;
}
```

**2. `progressStage` 变量的 null 安全规则：**

在 `ProductionScanExecutor.execute()` 中，`progressStage` 经过 `hasText` 校验后保证非空，但经过 `resolveParentProgressStage` 映射后可能变为父节点名。所有对 `progressStage` 的 `.trim()` 调用必须做 null 防护：

```java
// ❌ 错误 - progressStage 理论上非空但缺乏防御
"裁剪".equals(progressStage.trim())
"采购".equals(progressStage.trim())

// ✅ 正确 - 防御性 null 检查
"裁剪".equals(progressStage != null ? progressStage.trim() : null)
"采购".equals(progressStage)  // 常量在左，null 在右时 equals 返回 false
```

**3. 禁止在扫码核心链路中随意添加归一化/映射调用：**

扫码 execute 方法是核心业务入口，任何修改必须：
- 理解 `progressStage` 和 `childProcessName` 的赋值链路
- 理解 `normalizeFixedProductionNodeName` 对子工序名返回 null 的行为
- 理解 `resolveParentProgressStage` 的5级映射优先级
- 修改后必须测试：采购扫码、裁剪扫码、车缝子工序扫码、质检扫码、入库扫码

### 涉及文件
- `ProductionScanExecutor.java` — 扫码执行器（NPE 发生位置）
- `ProcessStageDetector.java` — `normalizeFixedProductionNodeName` 实现（对子工序名返回 null）
- `ProductionScanStageSupport.java` — 阶段门控（progressStage 为 null 时静默跳过校验）
- `ScanRecordOrchestrator.java` — 扫码编排器

## 规则34：扫码核心代码修改必须全链路测试

### 规则
修改 `ProductionScanExecutor`、`ScanRecordOrchestrator`、`ProcessStageDetector`、`ProductionScanStageSupport` 中的任何代码后，必须验证以下场景不报错：

| 场景 | 扫码类型 | processName | 预期行为 |
|------|---------|-------------|---------|
| 采购扫码 | production | 采购 | 正常 |
| 裁剪扫码 | cutting | 裁剪 | 正常 |
| 车缝子工序扫码 | production | 上领/上袖/合缝等 | 映射到"车缝"父节点 |
| 二次工艺扫码 | production | 绣花/印花等 | 映射到"二次工艺"父节点 |
| 尾部扫码 | production | 剪线/整烫等 | 映射到"尾部"父节点 |
| 质检扫码 | quality | - | 正常 |
| 入库扫码 | warehouse | - | 正常 |
| ORDER码采购 | production | 采购 | 正常（无菲号） |
| ORDER码裁剪 | cutting | 裁剪 | 正常（无菲号） |

### 禁止事项
- 禁止在未测试子工序扫码的情况下上线任何扫码相关改动
- 禁止删除 `childProcessName` 变量（它是子工序→父节点映射的关键中间变量）
- 禁止删除 `ProcessSynonymMapping.isEquivalent` 同义词匹配（ORDER码守卫依赖它）
- 禁止删除 `resolveProcessCodeFromTemplate` 方法（工序编号解析依赖它）

## 规则35：tracking 表 processCode 禁止被扫码端覆盖

### 根因
`ProductionProcessTrackingOrchestrator.updateScanRecord()` 在回退匹配成功后，用扫码端传入的 `processCode`（子工序名，如 "打揽"）覆盖了 tracking 表初始化时的 `processCode`（模板编号，如 "02"），导致前端显示 `打揽 打揽` 而不是 `02 打揽`。

### 事故记录（2026-04-24）
```
1. TrackingRecordInitHelper 初始化 tracking:
   processCode = "02" (模板id), processName = "打揽" (模板name)
   → 前端显示 "02 打揽" ✅

2. 扫码时 updateScanRecord(bundleId, "打揽", ...):
   - 按 processCode="打揽" 精确匹配 → 找不到（tracking 中是 "02"）
   - 按 processName="打揽" 回退匹配 → 找到了！
   - tracking.setProcessCode("打揽") → 把 "02" 覆盖成 "打揽" ❌

3. 前端显示: processCode="打揽" + processName="打揽" → "打揽 打揽" ❌
```

### 规则（以后必须遵守）

**1. tracking 表的 processCode 一旦初始化就不允许被覆盖：**

```java
// ❌ 错误 - 扫码端传入的 processCode 是子工序名，覆盖会导致编号丢失
tracking.setProcessCode(processCode);

// ✅ 正确 - 回退匹配成功时不覆盖 processCode，保留初始化时的模板编号
if (tracking == null) {
    tracking = trackingService.getByBundleAndProcessName(cuttingBundleId, processCode);
    // 匹配成功但不覆盖 processCode
}
```

**2. tracking 表和 scan_record 表的 processCode 含义不同：**

| 表 | processCode 含义 | 来源 | 示例 |
|----|-----------------|------|------|
| t_production_process_tracking | 模板工序编号 | TrackingRecordInitHelper 初始化 | "02" |
| t_scan_record | 子工序名或编号 | 前端传入或 resolveProcessCodeFromTemplate | "02" 或 "打揽" |

**3. 前端显示格式为 `{processCode} {processName}`（规则32），两个表的 processCode 必须各自正确。**

### 涉及文件
- `ProductionProcessTrackingOrchestrator.java` — updateScanRecord 方法
- `TrackingRecordInitHelper.java` — tracking 表初始化
- `ProductionScanExecutor.java` — 扫码端 processCode 赋值

---

# P0 - 代码厚度控制规则

## 规则36：新增代码必须保持方法/类"薄"，禁止堆代码后期再拆

### 核心原则
**写代码时就拆好，不要先堆后拆。** 每次加功能时，直接把逻辑拆到独立方法/类里，而不是往已有方法里追加代码块。

### 事故教训
`ProductionScanExecutor.execute()` 方法已膨胀到 385 行，远超 checkstyle 的 80 行限制。每次加功能都往 execute() 里塞 if-else，导致：
- 方法越长越难理解，改一处牵动全局
- NPE 频发（变量赋值链路太长，中间任何一环 null 都炸）
- 不敢重构（怕改错），越堆越厚，恶性循环

### 规则（以后必须遵守）

**1. 单个方法不超过 80 行（含空行和注释）：**

```java
// ❌ 错误 - 往已有方法里继续堆代码
public Result execute(Map<String, Object> params) {
    // 原有100行...
    // 新加的20行校验逻辑
    // 新加的30行业务逻辑
    // 新加的15行数据库操作
    // 方法变成165行，后期又要拆
}

// ✅ 正确 - 新逻辑直接写成独立方法，原方法只做调用
public Result execute(Map<String, Object> params) {
    // 原有逻辑...
    validateScanParams(params);           // 新校验 → 独立方法
    ScanContext ctx = resolveScanContext(params);  // 新解析 → 独立方法
    return processScan(ctx);              // 新业务 → 独立方法
}
```

**2. 新增功能优先创建新方法/新类，而不是往旧方法里追加：**

| 场景 | ❌ 错误做法 | ✅ 正确做法 |
|------|-----------|-----------|
| 加校验 | 在方法中间加 if-else 块 | 抽成 `validateXxx()` 方法 |
| 加业务分支 | 在 switch/if 里加 case | 抽成 `handleXxxCase()` 方法 |
| 加数据组装 | 在 return 前加 20 行 put | 抽成 `buildXxxResult()` 方法 |
| 加异步操作 | 在方法末尾加 CompletableFuture | 抽成 `asyncXxx()` 方法 |
| 加新业务流程 | 在已有 Orchestrator 里加方法 | 创建新 Orchestrator 类 |

**3. 判断标准：一个方法做了超过2件事就该拆：**

```java
// ❌ 一个方法做了4件事：校验、查询、计算、写库
public void processOrder(Order order) {
    if (order.getStatus() == null) throw ...;  // 1. 校验
    Order db = orderDao.selectById(order.getId());  // 2. 查询
    db.setTotal(db.getPrice() * db.getQty());  // 3. 计算
    orderDao.updateById(db);  // 4. 写库
}

// ✅ 拆成4个方法，每个只做1件事
public void processOrder(Order order) {
    validateOrder(order);
    Order db = queryOrder(order.getId());
    calculateTotal(db);
    persistOrder(db);
}
```

**4. 类也一样，超过300行就该考虑拆分：**
- Controller 只做参数接收和结果返回，业务逻辑放 Service/Orchestrator
- Orchestrator 只做流程编排，具体操作放 Helper/Executor
- Service 只做数据操作，复杂计算放 Calculator/Resolver

### 已知超厚方法（需逐步瘦身，禁止继续加厚）

| 文件 | 方法 | 当前行数 | 目标 |
|------|------|---------|------|
| ProductionScanExecutor.java | execute() | ~385行 | ≤80行 |
| ScanRecordOrchestrator.java | 多个方法 | 偏厚 | 逐步拆分 |

### 检查清单（每次加代码前必须过一遍）
1. 我要加的代码是往已有方法里塞，还是创建新方法？
2. 如果往已有方法塞，该方法会超过80行吗？
3. 如果超过，能不能把新逻辑抽成独立方法？
4. 新逻辑和已有逻辑是同一层次吗？（校验和业务混在一起就是不同层次）

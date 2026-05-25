# 样衣工序体系统一到大货 — 设计文档

> 日期：2026-05-25
> 状态：待审核
> 核心目标：砍掉样衣独立的工序流程，全部统一用大货的 `t_production_order` + 工序跟进体系

---

## 一、背景与问题

当前系统有两套完全独立的工序体系：

| 维度 | 样衣开发 | 大货生产 |
|------|---------|---------|
| 数据表 | `t_pattern_production` | `t_production_order` |
| 工序数据 | `progressNodes`（简单JSON） | `progressWorkflowJson`（完整节点+单价+阶段） |
| 交期 | `deliveryTime`（交板时间，无预算分配） | `expectedShipDate` + 各工序预算天数可调 |
| 进度跟踪 | 无进度条、无预算、无时间线 | LiquidProgressLottie + BudgetDaysEditor + 时间线 |
| 扫码 | PatternProductionOrchestrator（独立） | ProductionOrderOrchestrator（标准） |
| 工序配置 | PatternProcessConfig（独立体系） | 模板中心 + progressWorkflowJson |

**问题**：
1. 样衣没有预算天数，无法调整各工序时间
2. 样衣没有进度跟踪，看不到各工序完成情况
3. 两套代码维护成本翻倍，每次新增功能要同步两处
4. 样衣推大货时需要复制数据，容易出错

---

## 二、方案：样衣直接复用大货订单表

### 核心思路

样衣创建时，直接写入 `t_production_order`，标记 `sourceBizType = 'SAMPLE'`。
样衣开发工作台嵌入大货的工序跟进组件，实现一套流程走到底。

### 关键设计决策

1. **`sourceBizType = 'SAMPLE'`** 区分样衣订单和大货订单
2. **样衣订单自动填充 `progressWorkflowJson`**：从模板中心加载工序模板，与大货一致
3. **每个阶段都可以调整预算天数**：复用 `BudgetDaysEditor`，点击即可修改
4. **样衣扫码走大货流程**：复用 `ProductionOrderOrchestrator` 的扫码逻辑
5. **样衣入库走大货流程**：复用成品入库逻辑

---

## 三、后端改动

### 3.1 样衣创建 → 直接创建生产订单

**修改文件**：`ProductionOrderCreationHelper.java` 或新建 `SampleOrderCreationHelper.java`

**逻辑**：
- 样衣开发工作台点击"开始生产"时，创建一条 `t_production_order` 记录
- `sourceBizType = 'SAMPLE'`
- `orderQuantity` = 样衣数量（通常1-3件）
- `expectedShipDate` = 样衣交期（从 StyleInfo.deliveryTime 带入）
- `progressWorkflowJson` = 从模板中心自动加载（`CuttingWorkflowBuilderHelper.buildProgressWorkflowJson`）
- `status = 'pending'`

### 3.2 样衣开发工作台 API 调整

**修改文件**：`PatternProductionController.java`

- 新增 `POST /pattern-production/create-sample-order`：创建样衣生产订单
- 修改 `GET /pattern-production/{id}/process-config`：返回大货的 `progressWorkflowJson` 格式
- 样衣扫码相关端点统一走 `ProductionOrderController` 的扫码流程

### 3.3 样衣推大货简化

**修改文件**：`ProductionOrderCreationHelper.createOrderFromStyle()`

- 当前逻辑：样衣推大货时创建新订单 + 复制数据
- 新逻辑：样衣推大货时，将样衣订单的 `sourceBizType` 从 `SAMPLE` 改为 `ORDER`（或新建一条大货订单，复制 progressWorkflowJson）
- 保留 `createOrderFromStyle` 入口，但数据源从 `t_pattern_production` 改为 `t_production_order`

### 3.4 数据库迁移

**新建 Flyway 迁移**：`V20260525001__unify_sample_to_production_order.sql`

```sql
-- 1. 为已有样衣订单补全 progressWorkflowJson
-- 从模板中心加载工序模板，写入 progressWorkflowJson
-- （通过 Java 代码在 Flyway 迁移后执行，因为需要调用 TemplateLibraryService）

-- 2. 标记旧表数据已迁移
-- ALTER TABLE t_pattern_production ADD COLUMN migrated_order_id VARCHAR(64) DEFAULT NULL;
```

**数据迁移策略**：
- 现有 `t_pattern_production` 记录 → 创建对应的 `t_production_order` 记录
- 迁移后 `t_pattern_production.migrated_order_id` 指向新订单ID
- 旧表不删除，保留历史数据可查

---

## 四、前端改动

### 4.1 样衣开发工作台 — 嵌入大货工序跟进组件

**修改文件**：`StyleDevelopmentWorkbench.tsx`

**当前结构**：
```
样衣开发工作台
├── BOM清单 Tab
├── 纸样 Tab
├── 工序单价 Tab（StyleProcessTab）
├── 二次工艺 Tab
├── 生产制单 Tab（StyleProductionTab）
├── 报价 Tab
└── 文件管理 Tab
```

**新结构**：
```
样衣开发工作台
├── BOM清单 Tab（不变）
├── 纸样 Tab（不变）
├── 工序单价 Tab（不变，这是配置工序单价，不是跟踪进度）
├── 二次工艺 Tab（不变）
├── 生产进度 Tab（★ 新增，复用大货的工序跟进组件）
├── 生产制单 Tab（不变）
├── 报价 Tab（不变）
└── 文件管理 Tab（不变）
```

### 4.2 新增"生产进度"Tab

**新建组件**：`StyleProgressTab.tsx`

**功能**：
- 展示样衣订单的工序进度（复用 `cellRenderers.tsx` 中的 `createProgressNodesRender`）
- 每个工序节点都有 `BudgetDaysEditor`，可调整预算天数
- 每个工序节点可点击查看详情、扫码
- 有交期、预计交期、逾期天数显示
- 有进度条（LiquidProgressLottie）

**数据来源**：
- 从 `t_production_order` 获取订单数据
- 从 `progressWorkflowJson` 获取工序节点
- 从 boardStats 获取各工序完成数量

### 4.3 样衣创建生产订单的触发

**修改文件**：`StyleDevelopmentWorkbench.tsx` 或 `StyleStageControlBar.tsx`

**逻辑**：
- 样衣开发工作台中，当用户点击"开始生产"时：
  1. 调用 `POST /pattern-production/create-sample-order` 创建样衣生产订单
  2. 返回订单ID
  3. "生产进度"Tab 加载该订单的工序跟进数据

### 4.4 样衣列表页调整

**修改文件**：`StyleInfoList/index.tsx`、`StyleCardView.tsx` 等

- 样衣卡片上的进度显示改为从 `t_production_order` 读取
- 样衣状态（待生产/生产中/已完成）从订单状态映射

---

## 五、每个阶段可调整的具体实现

### BudgetDaysEditor 复用

`BudgetDaysEditor` 组件已经支持：
- 点击预算天数 → 弹出调整弹窗
- 输入新天数 → 自动重新计算预计交期
- 调用 `POST /production/order/quick-edit` 更新 `expectedShipDate`

**样衣订单同样适用**，因为：
- 样衣订单有 `createTime`（订单创建时间）
- 样衣订单有 `expectedShipDate`（预计交期）
- 样衣订单有各工序的 `startTime` / `endTime`
- `computeStageBudgetHint` 会根据总天数和工序比例自动计算预算

### 预算比例

当前 `progressTimeBudget.ts` 的比例分配：

| 工序 | 比例 |
|------|------|
| 采购 | 30% |
| 裁剪 | 15% |
| 车缝 | 25% |
| 大烫 | 10% |
| 二次工艺 | 8% |
| 包装 | 7% |
| 质检 | 5% |

样衣订单复用同样的比例，用户可以手动调整每个工序的预算天数。

---

## 六、影响范围

### 不受影响的功能

| 功能 | 原因 |
|------|------|
| BOM清单 | 仍挂在 StyleInfo 上，与订单无关 |
| 工序单价配置 | StyleProcessTab 配置的是工序单价模板，不是进度跟踪 |
| 二次工艺配置 | 同上，是配置不是跟踪 |
| 报价 | 仍挂在 StyleInfo 上 |
| 文件管理 | 同上 |
| 样衣审核 | 保留在 StyleInfo 上（sampleReviewStatus 等字段） |
| 样衣入库/出库/借出 | 复用大货的成品入库流程 |

### 需要调整的功能

| 功能 | 调整内容 |
|------|---------|
| 样衣扫码 | 从 PatternProductionOrchestrator 切换到 ProductionOrderOrchestrator |
| 样衣进度显示 | 从 PatternProduction.progressNodes 切换到 ProductionOrder.progressWorkflowJson |
| 样衣推大货 | 简化，不再需要复制数据 |
| 小程序样衣扫码 | API 端点对齐大货 |

---

## 七、数据迁移方案

### 迁移步骤

1. **Flyway 迁移**：为 `t_pattern_production` 添加 `migrated_order_id` 列
2. **Java 迁移代码**（启动时执行）：
   - 遍历 `t_pattern_production` 所有未迁移记录
   - 为每条记录创建一条 `t_production_order`（`sourceBizType='SAMPLE'`）
   - 从模板中心加载 `progressWorkflowJson`
   - 回写 `migrated_order_id`
3. **前端兼容**：迁移期间，样衣开发工作台同时支持从旧表和新表读取数据

### 回滚方案

- 旧表 `t_pattern_production` 不删除
- `migrated_order_id` 可反向映射
- 前端保留旧代码路径，通过 feature flag 切换

---

## 八、验证标准

| 验证项 | 预期结果 |
|--------|---------|
| 样衣创建生产订单 | 成功创建 `t_production_order`，`sourceBizType='SAMPLE'` |
| 工序进度展示 | 显示与大货一致的工序节点 + 进度条 |
| 预算天数调整 | 每个工序可点击调整，自动更新预计交期 |
| 样衣扫码 | 走大货扫码流程，进度正常更新 |
| 样衣入库 | 走大货成品入库流程 |
| 样衣推大货 | 简化流程，无需复制数据 |
| 旧数据迁移 | 所有 `t_pattern_production` 记录成功迁移 |
| 后端编译 | `mvn compile` 通过 |
| 前端类型检查 | `npx tsc --noEmit` 0 errors |

# 服装供应链系统开发规范

## 一、系统架构设计（成熟服装 ERP 版）

### 1.1 核心设计理念

1. **弹窗式交互（Modal-First）**：
   - 核心列表页（如款号、订单）保持常驻。
   - 详情/编辑操作通过**宽屏弹窗（桌面端 Width: 60%~70%）**完成。
   - 弹窗内支持多 Tab 切换（例如：款号弹窗包含「基础信息 | BOM 表 | 尺寸表 | 工序表 | 报价单 | 附件」）。
   - 优势：用户聚焦当前任务，视觉干扰更少，符合传统软件操作习惯。

2. **主子模块架构**：
   - 系统严格遵循「主模块 -> 子模块 -> 功能点」三级架构。
   - 导航栏采用左侧双层折叠菜单，支持高频菜单收藏。

### 1.2 生产/采购类页面展示规范

#### 1.2.1 列表页（Table）基础信息列

- 涉及“订单/单据”类业务列表页（生产订单、物料采购、质检入库、对账单等）：列表必须展示以下基础列，保证可一眼识别来源。
  - 图片（款式图片）：48×48，object-fit: cover
  - 订单号（orderNo）
  - 款号（styleNo）
  - 款名（styleName）

#### 1.2.1.1 列表页（Table）操作列规范

- 操作列统一为「最多 3 个入口」：2 个行内按钮 + 1 个“更多”下拉。
- 行内按钮优先放高频动作（例如：查看/编辑/关键流转），其它动作进入“更多”。
- 操作列固定在表格最右侧，不允许拖拽调整位置。
- 前端实现统一使用 RowActions 组件渲染行操作区。

#### 1.2.1.2 列表页（Table）分页规范

- 全站分页统一采用「列表底部行内」样式：分页属于页面内容的一部分，禁止悬浮/吸底。
- 默认使用简洁分页（simple），避免占用底部整行空间；同时保证移动端可操作。
- ResizableTable：默认已统一分页样式与位置，页面侧只需按需传入 current/pageSize/total/onChange。
- 直接使用 antd Table 的场景：pagination 建议写法如下（保持一致样式）。

```ts
pagination={{
  pageSize: 10,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  position: ['bottomRight'],
  simple: true,
}}
```

- 例外：极少数需要展示完整页码器（非 simple）时，允许设置 simple=false。

#### 1.2.2 弹窗（Modal）基础布局

- 统一使用 ResizableModal。
- 默认宽度以 60vw 为基准（桌面端建议 60%~70%，平板端建议 66%~69%，移动端 96%~98%）。
- 弹窗必须居中显示（centered）。
- 弹窗不得超出视口：内容超过时自动出现滚动条（上下/左右），保证不遮挡页面。
- 弹窗内容优先两列布局：左侧放“款式/单据摘要信息 + 图片”，右侧放“数量/金额/状态/时间”等业务字段。

#### 1.2.4 前端构建分包（Vite/Rollup）

- 目标：所有构建产物 chunk（minify 后）必须 ≤ 500KB。
- 已启用 manualChunks（不要改回“所有 node_modules 打成一个 vendor”）：
  - react/react-dom 拆分为独立 vendor。
  - react-router 拆分为独立 vendor。
  - antd 尽量按二级目录拆分为多个 chunk（降低单包体积与提升缓存命中）。
  - 其它 node_modules 默认落到 vendor。
- 已设置 `chunkSizeWarningLimit=500`，并以此作为“不得超过”的硬性口径。
- 配置位置：`frontend/vite.config.ts`。

#### 1.2.5 前端包管理器版本（npm）

- 本项目前端已锁定 npm 版本：`frontend/package.json` 的 `packageManager` 字段为 `npm@11.7.0`。
- 这不会改变任何前端/后端启动命令与端口配置：
  - 后端仍使用 Maven（`mvn spring-boot:run`）。
  - 前端仍使用 Vite（`npm run dev` / `npm run dev:host` / `npm run build`）。
- 影响范围主要在“依赖安装与 lockfile 行为”：建议团队与 CI 使用同一 npm 大版本，避免 `package-lock.json` 与安装结果出现差异。

#### 1.2.3 业务快照字段（Snapshot）规则

- 所有单据保存 orderNo/styleNo/styleName/styleCover 等快照字段。
- 列表/详情弹窗展示优先使用单据快照字段，避免款式信息变化导致历史单据显示错乱。

### 1.3 服装生产业务闭环流转规范（含退回机制）

#### 1.3.1 核心流转主线（按款号 / 订单号全程关联）

- 基础信息录入 → 下单管理 → 物料采购 → 生产执行 → 质检入库 → 账单生成 → 结算提交 → 核对确认 → 打款完成
- 全程以「款号」「订单号」为核心关联字段，同步绑定「生产工厂」「领取人」信息，确保各环节数据互通，满足简化操作与财务对账。

#### 1.3.2 各环节输入/操作/输出（摘要）

| 环节 | 名称           | 关键关联     | 关键输入                                                   | 核心输出                       |
| ---- | -------------- | ------------ | ---------------------------------------------------------- | ------------------------------ |
| 1    | 基础信息录入   | 款号         | 款式基础信息、面辅料资料、工厂/领取人基础信息              | 款号档案（可二次编辑）         |
| 2    | 按款号下单管理 | 款号、订单号 | 订单数量、交期、工厂/领取人、面辅料需求（自动带入）        | 生产订单（锁定关联面辅料资料） |
| 3    | 物料采购       | 订单号、款号 | 采购需求（自动带入）、供应商、单价/批次、入库数量/报废数量 | 采购单、采购入库数据（含成本） |
| 4    | 生产执行       | 订单号、款号 | 领料记录、生产进度、完工合格/不合格数量                    | 生产完工单                     |
| 5    | 质检入库       | 订单号、款号 | 入库库位、入库数量                                         | 质检入库（触发账单生成）       |
| 6    | 账单生成       | 订单号、款号 | 采购成本、合格数量、损耗数据（自动抓取）                   | 账单（可按工厂/领取人拆分）    |
| 7    | 结算单提交     | 账单编号     | 结算金额确认、收款信息                                     | 结算单（进入核对）             |
| 8    | 核对确认       | 结算单、账单 | 金额/数量/主体信息一致性核对                               | 核对通过（进入打款）           |
| 9    | 确认打款       | 结算单编号   | 打款金额、打款时间、凭证号/附件                            | 打款完成（闭环留痕）           |

#### 1.3.2.1 质检入库入库数量规则（按裁剪数量计算）

- 每次入库数量必须在裁剪数量的 5%~15% 之间。
- 末次补齐：本次数量等于剩余数量时，允许小于 5%。
- 禁止累计入库数量超过裁剪数量上限。
- 规则统一入口：后端通过 `ProductWarehousingService.warehousingQuantityRuleViolationMessage(...)` 校验并返回提示文案。

#### 1.3.3 退回机制（权限 + 路径）

- 退回仅允许退回至「直接上一环节」，禁止跨环节退回。
- 允许在同一环节内对“子步骤”回退修正（例如：采购入库数量录入错误，仅回退至采购入库录入）。
- 退回操作仅允许「主管级别及以上」角色执行。
- 每次退回必须填写退回原因，系统留存操作日志（含发起人、时间、原因、来源/目标环节）。
- 退回后允许修正并重新提交，流程继续向前流转。

#### 1.3.3.1 退回后的数据作废口径（后端实现）

- 退回触发点：生产订单进度被退回（仅允许退回上一环节）。
- 作废范围：
  - 生产扫码记录：退回环节之后的“生产扫码成功记录”（quantity>0）会被标记为 failure。
  - 质检/入库扫码记录：该订单下所有 success 的 quality/warehouse 扫码记录会被标记为 failure。
  - 成品出库：该订单下所有未删除的出库单会被逻辑删除（deleteFlag=1）。
  - 出货对账：该订单下 pending 状态的出货对账会被删除；非 pending 状态会追加提示备注，需人工核查。

#### 1.3.4 不合理点与改进建议（落地规则）

- 采购建议拆分为两张单据/两阶段：采购单（下单）与采购入库/质检（到货验收），支持分批到货与部分入库，并记录每批次差异原因。
- 生产执行的“领料记录”应与采购入库数据形成可追溯关联：至少做到“从哪些到货批次领用了多少”，避免后续损耗与成本无法核对。
- 当出现问题但不适合退回上一环节时，增加“挂起/异常”处理：单据可标记为阻塞状态，流程暂停，处理后继续向前。
- 全链路建议统一提供“作废”能力（主管级别及以上）：作废后不可再向前流转，且需留痕原因。

#### 1.3.5 状态机与权限（建议）

- 各环节单据状态需实现“允许的前进/退回”校验，禁止直接跳转到任意状态。
- 主管级别及以上：允许退回、作废、强制解除阻塞。
- 普通角色：仅允许在当前环节录入/提交，不允许执行退回。

#### 1.3.6 生产进度口径（后端实现）

- 进度节点来源：优先使用款号对应的进度模板（progress），无则使用 default。
- 进度权重：下单 5%，采购 15%，其余生产节点均分剩余 80%。
- 进度计算：按各节点已完成数量 / 订单数量的比例加权累计，四舍五入得到百分比。
- 手动推进：若存在“手动推进”记录且计算进度小于推进节点，则进度会抬升到该节点对应百分比，用于对齐状态机口径。

## 二、模块功能清单（新版）

### 2.1 仪表盘 (Dashboard)

- **统计概览**：待办事项、今日数据、核心指标。
- **快捷入口**：常用功能直达。

### 2.2 款号资料 (Style Info) - [核心主模块]

> 采用「列表+宽屏弹窗」模式

- **款式列表**：核心字段检索，图片预览。
- **款式详情弹窗**：
  1. **款式信息**：基础字段（款号、品类、年份、季节、图片）。
  2. **BOM 表**：物料清单，支持多配色/多尺码差异管理。
  3. **尺寸表**：部位尺寸矩阵，支持多码差自动计算。
  4. **工序表**：生产工序流，工价核算。
  5. **报价单**：成本核算表（料+工+费），利润分析。
  6. **附件管理**：设计稿、工艺单上传/下载。

### 2.3 大货生产 (Mass Production) - [核心主模块]

- **物料采购**：根据 BOM 自动生成采购需求，采购单管理。
- **生产进度**：订单生产全流程节点跟踪（裁剪->车缝->后整）。
- **车间扫码**：移动端适配，菲票/工序扫码录入。
- **质检入库**：入库管理，扫码入库，库存流水。

### 2.4 财务结算 (Financial) - [核心主模块]

- **加工厂对账**：加工费自动核算，扣款项管理，对账单生成。
- **物料采购对账**：供应商对账，入库单关联，发票管理。
- **成品出货对账**：客户对账，发货单关联，回款管理。

### 2.5 系统功能 (System) - [支撑主模块]

- **系统架构**：数据字典、参数配置、流水号规则。
- **人员管理**：组织架构，员工档案，账号绑定。
- **登录日志**：全系统操作留痕，异常登录报警。

### 2.6 权限管理 (Permission) - [安全主模块]

- **角色管理**：功能权限（菜单/按钮）、数据权限（品牌/部门）配置。
- **权限列表**：细粒度权限资源定义。

### 2.7 数据中心 (Data Center) - [经营看板]

- **经营指标汇总**：核心指标汇总（款号/订单/对账等口径统一）。
- **生产单页聚合**：围绕款号/订单的一页式聚合查询。

### 2.8 模板中心 (Template Library) - [基础能力]

- **模板管理**：BOM/尺寸/工序/进度等模板维护。
- **模板导入/应用**：从款号生成模板、模板应用到款号。

### 2.9 小程序 (WeChat Mini Program) - [入口]

- **小程序登录**：小程序授权码登录与账号绑定。

### 2.10 通用能力 (Common)

- **文件上传/下载**：附件上传与下载。

## 三、API 接口规范（RESTful）

### 3.1 路径规划

| 模块     | 路径前缀                | 说明                       |
| -------- | ----------------------- | -------------------------- |
| 仪表盘   | `/api/dashboard`        | 统计数据                   |
| 数据中心 | `/api/data-center`      | 经营指标与聚合查询         |
| 款号资料 | `/api/style`            | 包含 BOM/尺寸/工序等子资源 |
| 大货生产 | `/api/production`       | 采购/生产/库存             |
| 财务结算 | `/api/finance`          | 各类对账                   |
| 系统功能 | `/api/system`           | 用户/配置/日志/权限        |
| 模板中心 | `/api/template-library` | 模板管理与应用             |
| 通用能力 | `/api/common`           | 上传/下载等通用接口        |
| 小程序   | `/api/wechat`           | 小程序相关接口             |

### 3.2 核心实体关系

- **StyleInfo (1) <-> (N) StyleBom**
- **StyleInfo (1) <-> (N) StyleSize**
- **StyleInfo (1) <-> (N) StyleProcess**
- **StyleInfo (1) <-> (1) StyleQuotation**

### 3.3 后端分层规范（可维护性重点）

#### 3.3.1 分层职责边界

- **Controller**：仅做 HTTP 参数接收/校验（轻量），调用编排层并返回 `Result`。
- **Orchestrator（编排层 / 中间层）**：承载跨多个 Service 的业务编排、状态流转、聚合返回、权限校验等。
- **QueryService（查询层，可选）**：对“统计/列表/聚合查询”做统一封装，隔离数据源与查询实现细节。
- **Service（领域/数据服务）**：单实体/单领域的写入逻辑、数据库操作封装、事务边界。

#### 3.3.2 何时必须引入 Orchestrator/QueryService

- Controller 出现多依赖（通常 ≥3 个 Service）且在方法中做拼装、循环、跨表/跨域判断。
- Controller/Service 中出现“统计 + 近期动态 + 多处数据源拼装”这类聚合逻辑。
- 未来容易变化的组合规则（例如：待办定义、看板口径、数据中心口径）。

#### 3.3.3 已落地的中间层示例（本项目）

- **Dashboard**：
  - Controller → Orchestrator → QueryService
  - 目的：把首页聚合口径从 Controller 中抽离，便于后续扩展指标/替换查询实现。
  - 参考：
    - [DashboardController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/dashboard/controller/DashboardController.java)
    - [DashboardOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/dashboard/orchestration/DashboardOrchestrator.java)
    - [DashboardQueryService.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/dashboard/service/DashboardQueryService.java)

- **DataCenter**：
  - Controller → Orchestrator → QueryService
  - 目的：统一经营指标口径与“生产单页”聚合返回，Controller 保持极薄。
  - 参考：
    - [DataCenterController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/datacenter/controller/DataCenterController.java)
    - [DataCenterOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/datacenter/orchestration/DataCenterOrchestrator.java)
    - [DataCenterQueryService.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/datacenter/service/DataCenterQueryService.java)

- **StyleInfo**：
  - Controller → Orchestrator
  - 目的：把“纸样/样衣状态流转 + 日志记录 + 附件校验”等规则从 Controller 中抽离，便于迭代。
  - 参考：
    - [StyleInfoController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/style/controller/StyleInfoController.java)
    - [StyleInfoOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/style/orchestration/StyleInfoOrchestrator.java)

#### 3.3.4 错误处理与返回规范

- Controller 原则上只返回 `Result.success(...)` / `Result.successMessage(...)`。
- 业务错误统一通过抛异常交给全局异常处理器转换为 `Result.fail(code, message)`，避免在各 Controller/Orchestrator 内分散拼装失败返回。

#### 3.3.5 跨域编排与数据口径（强约束）

- 任何同时涉及“生产/库存/财务”等两个及以上领域的联动，必须在 Orchestrator 完成；Service 不允许直接调用其它领域 Service 来驱动状态流转/生成单据。
- 生产完工/关单：仅保证生成加工厂对账（FactoryReconciliation）。
- 出货对账（ShipmentReconciliation）：仅在存在出库数量时生成/更新，数量口径以出库合计为准。
- 补数据（Backfill）：所有补数据入口统一走编排层，保证权限/事务/跨域一致性。
- 少量历史/兼容接口允许直接 `return Result.fail(message)`（需逐步收敛）：
  - [FactoryReconciliationController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/finance/controller/FactoryReconciliationController.java)
  - [WeChatMiniProgramAuthController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/wechat/controller/WeChatMiniProgramAuthController.java)
  - [CommonController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/common/CommonController.java)
- 对“编程错误/不可能状态”优先抛 `IllegalArgumentException` / `IllegalStateException`。
- 不要把底层异常堆栈/SQL 信息透传给前端（避免泄漏）。
- 全局异常映射参考：
  - [GlobalExceptionHandler.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/common/GlobalExceptionHandler.java)

#### 3.3.5 可测试性要求

- Orchestrator 保持无状态、仅依赖接口（QueryService / Service），方便单测 Mock。
- QueryService 只做查询，避免混入写入与复杂事务。

#### 3.3.6 分层进展与结构分数（持续优化）

- **当前结构分数（估算）**：97/100（目标 95+）
- **本轮已下沉的中间层**：
  - StyleSize/StyleProcess：把纸样锁定校验、时间字段归一、模板触发从 Controller 下沉到 Orchestrator
    - [StyleSizeController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/style/controller/StyleSizeController.java)
    - [StyleSizeOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/style/orchestration/StyleSizeOrchestrator.java)
    - [StyleProcessController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/style/controller/StyleProcessController.java)
    - [StyleProcessOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/style/orchestration/StyleProcessOrchestrator.java)
  - ScanRecord：把 operator 覆盖、参数校验、cleanup/delete-full-link 的权限与异常收敛下沉到 Orchestrator
    - [ScanRecordController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/production/controller/ScanRecordController.java)
    - [ScanRecordOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ScanRecordOrchestrator.java)
  - FactoryReconciliation：把新增/更新/兼容保存的入参解析、关联字段补全、扣款项解析、流水号生成下沉到 Orchestrator
    - [FactoryReconciliationController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/finance/controller/FactoryReconciliationController.java)
    - [FactoryReconciliationOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/finance/orchestration/FactoryReconciliationOrchestrator.java)
- **剩余主要扣分点**：
  - [SerialController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/system/controller/SerialController.java)：仍在 Controller 内实现序列生成与并发兜底（建议下沉到 Orchestrator/Service，并强化一致性策略）
  - Permission/User/Role 等系统控制器仍存在 Service 直连（结构扣分较小，后续统一薄化即可）

#### 3.3.7 静默失败与反馈提示（新增）

- Controller/Orchestrator 对外方法禁止用 `return false/null` 表达“失败但不报错”（静默失败）。
- 写操作（save/update/delete/rollback/submit 等）若底层返回 `false/0/null`，必须抛出异常并给出中文提示。
- 对外入参解析（如把 String 转 Long/Integer、把 Object 转 JSON）失败时，禁止静默忽略或“自动兜底到空值”，必须抛出 `IllegalArgumentException` 并提示具体字段。
- 资源不存在统一抛 `NoSuchElementException`（由全局异常处理映射为 404）。
- 无权限统一抛 `AccessDeniedException`（映射为 403）。
- 参数错误统一抛 `IllegalArgumentException`（映射为 400）。
- 业务不允许/操作失败统一抛 `IllegalStateException`（映射为 400）。
- 全局异常映射参考：
  - [GlobalExceptionHandler.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/common/GlobalExceptionHandler.java)

#### 3.3.8 软删除规范（新增）

- 对“订单/单据”类业务：
  - 若实体包含 `deleteFlag` 字段，删除必须采用软删除：设置 `deleteFlag=1` 并更新 `updateTime`，禁止物理删除。
  - 列表/详情查询必须过滤 `deleteFlag=0`；查询到已删除数据视为“资源不存在”。
- 若实体暂未包含 `deleteFlag` 字段：
  - 可临时保留物理删除（`removeById`），但应将其视为技术债，后续补齐 `deleteFlag` 后统一迁移为软删除。
- 当前仍以物理删除/无软删字段为主的典型实体（技术债）：
  - [FactoryReconciliation.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/finance/entity/FactoryReconciliation.java)
  - [ShipmentReconciliation.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/finance/entity/ShipmentReconciliation.java)
- 已落地示例：
  - [ProductOutstockOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductOutstockOrchestrator.java)
  - [ProductWarehousingOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductWarehousingOrchestrator.java)
  - [MaterialReconciliationOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/finance/orchestration/MaterialReconciliationOrchestrator.java)
  - [ProductionCleanupOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionCleanupOrchestrator.java)

### 3.4 安全与运维（后端强约束）

#### 3.4.1 密钥与敏感配置（启动校验）

- JWT 密钥配置项：`app.auth.jwt-secret`，推荐通过环境变量 `APP_AUTH_JWT_SECRET` 注入（已在 `application.yml` 对接）。
- 启动强校验：不得为空、不得为默认占位值、长度至少 32；否则应用启动失败。
- 数据库账号密码建议仅通过环境变量配置：`SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD`（已在 `application.yml` 对接）。
- 参考：
  - [SecurityConfig.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/config/SecurityConfig.java)
  - [application.yml](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/resources/application.yml)

#### 3.4.2 密码存储（BCrypt + 明文兼容升级）

- 新增/修改用户：若入参 `password` 不是 BCrypt 格式则自动加密后入库。
- 登录校验：优先按 BCrypt 校验；若历史数据仍为明文，校验成功后会尝试升级为 BCrypt（升级失败不影响本次登录）。
- 参考：[UserServiceImpl.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/system/service/impl/UserServiceImpl.java)

#### 3.4.3 登录防爆破（限流 + 留痕）

- 维度：`username + ip`。
- 规则：10 分钟窗口内失败次数 ≥ 10，则锁定 15 分钟。
- 行为：每次登录尝试写入登录日志；成功会清理计数，失败会累计。
- 参考：
  - [UserController.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/system/controller/UserController.java)
  - [UserOrchestrator.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/system/orchestration/UserOrchestrator.java)

#### 3.4.4 Actuator 暴露与权限

- 暴露面：仅暴露 `health/info/metrics`（见 `application.yml`）。
- 访问控制：`/actuator/**` 仅管理员角色可访问（见 `SecurityConfig`）。

#### 3.4.5 只读接口与查询安全（强约束）

- 所有 GET/查询接口必须只读：禁止在查询链路触发补数据、进度重算、插入“兜底记录”等写入动作。
- 补数据/重算/修复：必须走显式的写接口（POST/PUT），并在编排层完成权限、事务与审计。
- 避免 N+1：列表/聚合查询必须做批量查询与内存聚合，禁止按订单/按行循环查库。
- MyBatis Plus `.last(...)` 仅允许写死常量片段（如 `limit 1`）；禁止拼接任何用户输入。
- 参考：
  - [ProductionOrderQueryService.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/production/service/ProductionOrderQueryService.java)
  - [ProductionOrderFlowOrchestrationService.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionOrderFlowOrchestrationService.java)
  - [DashboardQueryServiceImpl.java](file:///Users/guojunmini4/Documents/%E6%9C%8D%E8%A3%8566666/backend/src/main/java/com/fashion/supplychain/dashboard/service/impl/DashboardQueryServiceImpl.java)

## 四、开发环境与命令

### 4.1 技术栈

- **Frontend**: React 18, TypeScript, Vite, **Ant Design** (新增), Axios.
- **Backend**: Spring Boot 2.7, MyBatis Plus, MySQL 8.0, Lombok.

### 4.1.1 工具链统一（必读）

- 目标：保证本机/CI 的依赖安装结果、构建产物与运行行为一致，减少“我这能跑你那不能跑”。
- Node.js：建议固定 `20.17.x`（LTS）。
- npm：锁定 `11.7.0`（来源：`frontend/package.json` 的 `packageManager`）。
- Java：必须使用 `JDK 17`（来源：`backend/pom.xml` 的 `java.version=17`；Spring Boot 2.7 兼容性基线）。
- Maven：建议固定 `3.9.x`（本项目未引入 Maven Wrapper，需要本机与 CI 自行安装统一版本）。
- MySQL：建议使用 `8.0.x`（后端依赖 `mysql-connector-j 8.0.33`，避免版本差导致时区/认证插件行为不一致）。

```bash
node -v
npm -v
java -version
mvn -v
```

- 版本升级影响范围：仅影响依赖安装、编译/打包与 lockfile 行为，不会改变前后端启动命令与端口。

### 4.2 启动

```bash
# Frontend
cd frontend && npm run dev

# Backend
cd backend && mvn spring-boot:run
```

### 4.3 一键启动（dev-public.sh + 本机 + 临时外网）

推荐本机开发统一使用根目录的 `dev-public.sh`，同时配合 `.run/backend.env` 管理本地敏感配置。

1）首次配置本地环境变量（仅需一次）

```bash
mkdir -p .run
cat > .run/backend.env << 'EOF'
SPRING_DATASOURCE_URL=jdbc:mysql://localhost:3306/fashion_supplychain?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true
SPRING_DATASOURCE_USERNAME=你的数据库用户名
SPRING_DATASOURCE_PASSWORD=你的数据库密码
APP_AUTH_JWT_SECRET=至少32位的随机字符串_仅用于本机开发
EOF
```

- `backend.env` 不纳入版本管理，仅用于本机开发；可根据个人环境修改。
- 数据库账号密码必须是真实可用的 MySQL 账号。
- `APP_AUTH_JWT_SECRET` 必须长度 ≥ 32，用于 JWT 签名。

2）一键启动前后端 + 临时外网

```bash
# 从项目根目录执行
bash dev-public.sh
```

脚本行为：

- 检查并尝试启动本机 MySQL（端口 3306）。
- 如果 8088 未被占用，则读取 `.run/backend.env` 并启动后端（Spring Boot）。
- 如果 5173 未被占用，则启动前端（Vite Dev Server）。
- 如果本机安装了 `cloudflared`，自动为前端（以及后端就绪时）创建临时外网访问地址。

终端会输出：

- 本机/LAN 访问地址，例如：
  - 前端：<http://127.0.0.1:5173> 或 <http://局域网> IP:5173
  - 后端：<http://127.0.0.1:8088> 或 <http://局域网> IP:8088
- 外网访问地址（如 `https://xxx.trycloudflare.com`），仅当前会话有效。

3）日志与中间产物目录

- 运行产物目录：`.run/`
  - `backend.out.log` / `frontend.out.log` / `tunnel.log`
  - `public-url.txt`（最近一次解析到的 trycloudflare 地址）
  - `backend.env`（本机环境变量，需自行创建）

### 4.4 旧版一键脚本（兼容保留）

仍保留历史的 `scripts/dev-up.sh` 脚本，主要用于需要手工控制 up/down/url 的场景：

```bash
# 启动：后端 + 前端 + cloudflared 临时外网
bash scripts/dev-up.sh up

# 关闭：按 PID 清理（并尝试清理残留 cloudflared）
bash scripts/dev-up.sh down

# 随时获取最新地址（外网地址会变化）
bash scripts/dev-up.sh url
```

### 4.5 开机自启（macOS LaunchAgent）

```bash
# 安装并启用（登录后自动启动）
bash scripts/install-launchagent.sh
```

- LaunchAgent 日志目录：`~/Library/Logs/fashion-supplychain-dev/`
- 如果日志出现 `Operation not permitted`：
  - 系统设置 -> 隐私与安全性 -> 完全磁盘访问权限，把 `/bin/bash` 加进去，然后重新执行安装脚本
  - 或把项目从 `~/Documents` 移到不受保护目录（如 `~/Projects`）再安装

## 五、开发注意事项

1. **统一交互**：所有新增/编辑优先考虑在**宽屏弹窗(Modal)**中完成，避免页面跳转。
2. **数据一致性**：BOM 修改后需联动更新报价单成本。
3. **性能优化**：BOM 表和尺寸表数据量大时，需使用虚拟滚动或分页加载。

4. **弹窗可调整大小**：所有弹窗统一使用可拖拽缩放方案（ResizableModal）。
   - 默认宽度建议 80vw（或 700~900px），高度随视口自适应。
   - 弹窗内容区（body）必须可滚动，避免内容溢出导致页面滚动混乱。
   - 弹窗内避免再出现“固定高度 + 内外双滚动”的组合，优先让 body 承担滚动。

5. **弹窗内表格布局**：弹窗里出现的 Table 统一按“可读优先 + 不挤压”策略。
   - 表格开启横向滚动：scroll.x = 'max-content'，让列按内容自然撑开。
   - 列宽策略：关键列显式设置 width；长文本列开启 ellipsis。
   - 弹窗内表格优先 pagination={false}（由弹窗滚动承载），数据很大再考虑分页/虚拟滚动。

6. **列表页操作列（改小）统一规范**：所有列表页“操作”列统一使用 RowActions，优先紧凑展示。
   - 列定义：默认 `width: 110`，`fixed: 'right' as const`，`key: 'action'`。
   - 推荐模式（最紧凑）：只保留“更多”（`maxInline={0}`），把所有动作收拢到下拉。
   - 常规模式：保留 1 个 inline（通常是“详情”icon-only），其它动作都在“更多”里（`maxInline={1}`）。
   - 例外：确实需要露出 2~3 个 inline 才可把宽度放到 `160`，同时 `maxInline={2|3}`。

```tsx
{
  title: '操作',
  key: 'action',
  width: 110,
  fixed: 'right' as const,
  render: (_: any, record: any) => (
    <RowActions
      maxInline={1}
      actions={[
        {
          key: 'detail',
          label: '详情',
          title: '详情',
          icon: <EyeOutlined />,
          primary: true,
          onClick: () => openDetail(record),
        },
        {
          key: 'more',
          label: '更多',
          children: (
            [
              { key: 'edit', label: '编辑', onClick: () => openEdit(record) },
              { key: 'scan', label: '扫码', onClick: () => openScan(record) },
              { type: 'divider' },
              { key: 'delete', danger: true, label: '删除', onClick: () => onDelete(record) },
            ] as MenuProps['items']
          ) as any,
        },
      ]}
    />
  ),
}
```

1. **列表页“上中下”布局全站统一**：所有子模块列表页统一采用“上（标题/主操作）+ 中（筛选）+ 下（表格+分页）”。
   - 上：使用 `.page-header` + `.page-title` 承载「页面标题 + 主按钮（新增/导出等）」。
   - 中：筛选区使用 `Card size="small" className="filter-card"`，表单优先 `Form layout="inline" size="small"`。
   - 下：表格优先使用 Ant Design Table 自带 pagination；分页仅出现在列表底部，禁止把分页拆到上方。
   - 详情入口：列表页点击“详情/款号/单号”等必须打开 `ResizableModal`，禁止通过路由跳转展示详情造成“跳页感”。
   - 表格对齐：表头与表格内容全站强制居中，禁止在页面内用 CSS/列配置把对齐改回左对齐。

## 六、全站 UI 样式规范（按钮 / 图标 / 表格）

### 6.1 统一目标

- 视觉极简、干净、现代；全站统一一套“圆角 + 细边缘线条”的语言。
- 按钮/图标内部不使用渐变填充，只保留边缘线条（描边）与轻微纯色背景（可透明）。
- 优先用 CSS 全局覆盖统一 Ant Design 组件风格，避免页面内各写一套。

### 6.2 按钮（Ant Design Button）

- 统一由全局样式覆盖：`frontend/src/styles/global.css`。
- 禁止使用原生 `<button>`、以及 `.btn/.btn-primary/.btn-default/.action-btn` 等遗留按钮样式；统一使用 Ant Design Button / RowActions。
- 非 link/text/ghost 类型按钮：
  - 圆角：`border-radius: var(--glass-radius)`
  - 仅描边：`border: 1px solid var(--glass-border | --glass-border-strong | --glass-border-danger)`
  - 背景仅用纯色透明度（`background-color`），禁止渐变填充
  - 阴影：仅使用轻量阴影（`--glass-shadow` / `--glass-shadow-hover`）
- 交互态（hover/active）只调透明度与阴影强度，不引入渐变。

### 6.3 图标（侧边栏导航图标）

- 统一由布局样式控制：`frontend/src/components/Layout/styles.css`。
- `.nav-icon`：34×34，`border-radius: 999px`，仅描边 + 轻微透明背景。
- active/hover：仅改变 `border-color`、`background-color`、`color`，不使用渐变。

### 6.4 表格在小屏不挤压（可读优先）

- 统一全局处理：`frontend/src/styles/global.css`
  - 表格容器 `overflow-x: auto`
  - table `width: max-content; min-width: 100%; table-layout: auto;`
- 原则：宁可横向滚动，也不要把列挤到看不清。

### 6.5 开发流程（每次开始前必读）

- 任何“视觉统一 / 样式改动”先对照本节再动手：优先改全局样式文件，而不是在页面里堆叠局部样式。
- 新增样式如果会影响全站，必须落在 `global.css`（或布局组件的 `styles.css`）并复用变量。

## 七、代码规范与分层约定（全站要求）

### 7.1 注释语言规范（全中文注释）

- 后端（Java）与前端（TS/TSX）代码中的注释，统一使用中文表达。
- 允许保留必要的英文专有名词/缩写（如 MyBatis Plus、JWT、DTO、VO、HTTP 码），但注释主体必须是中文句子。
- 禁止出现“整句纯英文注释”（包含 TODO/FIXME/NOTE 等），需要用中文写清楚原因、影响范围与处理方式。
- 对外返回的错误信息/提示语统一中文；日志内容以中文为主，必要时可夹带英文关键字（便于检索）。

### 7.2 分层约定（是否需要“中间层”）

- 现有分层保持：Controller（入参/权限/编排）→ Service（业务能力边界）→ Mapper（数据访问）→ Entity。
- 本项目约定：只要出现“流程编排”，必须引入“业务编排层”（建议命名 Facade/Manager/Orchestrator 之一），Controller 保持薄。
  - 一个接口需要跨多个 Service 组合调用，且需要统一事务边界、幂等、重试或补偿。
  - 同一套流程被多个 Controller/定时任务/消息消费复用，导致编排逻辑重复。
  - 需要对复杂流程做单元测试/集成测试隔离，期望用更清晰的边界拆分。
- 依赖边界（硬性规则）：
  - Controller 不允许直接依赖 Mapper；必须通过 Service/编排层完成。
  - 编排层原则上只组合 Service 能力，保证边界可测试、可替换。
  - 编排层如需做“只读聚合查询”，允许在过渡期直接依赖 Mapper（技术债），但新增逻辑优先放到 QueryService/Service 侧；写入逻辑禁止绕过 Service。
  - Mapper 仅允许出现在 Service 实现层（或等价的数据访问层）内部。
- 判断口径（落地标准）：
  - Controller 内出现 2 个及以上 Service 调用，或出现事务/补偿/批处理/状态机校验，即视为“流程编排”，必须下沉到编排层。
  - CRUD（单实体、单 Service）可保持 Controller → Service，Service 内仅做单一能力边界。
- 目录与命名约定：
  - 统一放在 `xxx/orchestration/`（或 `xxx/facade/`、`xxx/manager/`）目录。
  - 类名以 `*Orchestrator`（或 `*Facade` / `*Manager`）结尾，体现“编排职责”。
  - 编排层负责事务边界；Service 不相互调用或尽量避免链式调用。
- 现状盘点（当前项目已存在的编排层示例）：
  - `finance/orchestration/ReconciliationBackfillOrchestrator`
  - `finance/orchestration/ReconciliationStatusOrchestrator`
  - `production/orchestration/CuttingTaskOrchestrator`
  - `production/orchestration/ProductionOrderOrchestrator`
  - `production/orchestration/ProductionCleanupOrchestrator`
  - `style/orchestration/StyleInfoOrchestrator`
  - `wechat/orchestration/WeChatMiniProgramAuthOrchestrator`
- 落地示例（对账状态流转）：

```java
// Controller：只做入参读取，把流程下沉到编排层
@PostMapping("/update-status")
public Result<?> updateStatus(@RequestBody Map<String, Object> params) {
    String id = (String) params.get("id");
    String status = (String) params.get("status");
    String message = reconciliationStatusOrchestrator.updateFactoryStatus(id, status);
    return Result.successMessage(message);
}

// Orchestrator：统一做状态机校验 + 权限校验 + 多服务更新
public String updateFactoryStatus(String id, String status) {
    return updateStatus(Scope.FACTORY, id, status);
}
```

- 补充说明：
  - 部分“统一入口”Controller（例如对多类单据统一处理的兼容接口）本质是编排职责；后续新增/扩展时，优先把编排逻辑抽到编排层，再由 Controller 转发。
  - 前端对关键流程（如财务状态流转）应集中封装 API 调用，页面只做 UI/交互编排，避免散落的接口字符串与重复错误处理。
- 影响说明：
  - 引入中间层会增加类数量与目录层级，短期改动成本更高。
  - 对复杂流程能显著提升可维护性与复用性，降低 Controller/Service 膨胀风险。
  - 小规模业务优先保持当前层级，避免过度设计；复杂编排出现时再渐进式引入。

### 7.3 编排层测试落地（单元测试优先）

- 测试目标：把“流程编排/状态机/权限”这类高风险逻辑固定下来，避免回归。
- 测试方式：编排层做单元测试（Mock 掉各 Service），不依赖数据库与 Spring 容器启动。
- 测试位置：`backend/src/test/java/.../*OrchestratorTest.java`
- 权限上下文：使用 `UserContext.set(...)` 构造角色；每个用例结束必须 `UserContext.clear()`。
- 断言重点：
  - 抛出的异常类型与 message 是否符合预期（推荐用 `assertThrows`）。
  - Service 调用次数与入参（需要时用 `ArgumentCaptor` 校验实体被正确改写）。
  - 状态机：前进允许、回退禁止（提示“请使用退回操作”）、退回仅允许上一状态。

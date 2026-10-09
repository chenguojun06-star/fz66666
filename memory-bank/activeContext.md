# 活跃上下文 — 当前开发状态

> 本文件由 AI 助手在每次会话开始/结束时更新
> ⚠️ **本文件只保留近 30 天**：2026-08-31 及以前的内容已归档到 `archive/activeContext-202608.md`（首次归档 2026-10-01）
> 最后更新：2026-10-09（✅ D-776 外部账号与内部账号体系隔离核实+收口：供应商账号物理隔离确认、user/list 等默认排除外发工厂账号、组织架构 2 接口补过滤、写入侧防御；tsc/mvn/eslint 全绿，未提交）
> 上一版：2026-10-09（✅ D-775 日产能 500 哨兵根治：NULL=未配置（V202710090005）+ 3 处哨兵移除 + clearDailyCapacity 标志 + 本厂回填 115；tsc/mvn 全绿，未提交；D-774 已推送 184fe5d62）
> 上一版：2026-10-09（✅ D-774 D-772 三个遗留数据问题核实+最优解：自愈巡检防清零进度 / t_factory 不插行定案 / 品质分改真实扫码合格率；mvn compile 0 错误，已推送 184fe5d62）
> 上一版：2026-10-07（✅ D-771 商品上架管理专用页：改图（主图+每色一图）/ 改售价库存 / 上下架；已上线 1b3d8d6）
> 上一版：2026-10-07（✅ D-766/D-767 店铺界面返工：桌面端巨幅修复 + 上架入口可懂 + 1×1 封面兜底；均已上线）
> 再上一版：2026-10-07（✅ D-765 店铺界面按淘宝风格重做（门面 H5 + 管理页）；D-764 修线上 500/404）
> 更早：2026-10-06（✅ D-755 小云直查被上下文劫持 + D-756 物料仓库「面料属性」补齐落地）

## ✅ D-776 外部账号不混入内部账号体系——全量核实+收口（2026-10-09，代码完成未提交）

**用户指令**：核实「给供应商/外部工厂创建的账号不会归纳到内部账号体系」，"全部核实清楚，不要混淆内部外部人员"。

**核实结论（云端数据库 + 代码双线核实）**：
1. **面辅料供应商账号 = 物理隔离**：独立表 `t_supplier_user`（16 条），与 `t_user`（22+3 条）零交集；登录走独立端点 `/api/supplier-portal/login`（`SupplierPortalOrchestrator`），token 的 factoryId 塞 supplierId → **绝无可能混入内部体系**
2. **外发工厂账号 = 同表存储、查询过滤隔离**：`FactoryAccountHelper.createAccount`（截图页「创建账号」）写 `t_user`，打标 `factory_id` + `is_factory_owner=1` + 角色 factory_owner，共 3 条（junjun/199711/1997111）
3. **`t_user.user_type`（INTERNAL/EXTERNAL_FACTORY/SUPPLIER）是休眠字段**：V20270628005 已建、云端数据正确且与 factory_id 100% 等价，但 Java 后端零读取 → 沿用 factory_id 口径
4. **登录后权限隔离完整**：`DataPermissionHelper.isFactoryAccount()` 在财务/发票/对账/库存预警等 20+ 处拦截 + UserContext.factoryId 强制过滤

**发现的混淆缺口（漏传即混）**：
- 前端 8 处调用 `/system/user/list` 漏传 `excludeFactoryUsers`（领料收料人、裁剪任务、订单跟单员、工资配置、财务扣款×2、节点详情、工序配置）
- 后端 2 个组织接口完全无过滤：`getAssignableUsers`（可指派人员）、`membersByOrgUnit`（部门成员）

**修复（5 文件，用户选定「后端默认排除」方案）**：
1. `UserController /system/user/list`：`excludeFactoryUsers` 默认值 `false → true`（过滤带 `!hasText(factoryId)` 守卫，传 factoryId 查工厂成员/工厂账号查本厂均不受影响）
2. `TenantController` 子账号列表：默认值同步改 true
3. `OrganizationUnitOrchestrator`：`getAssignableUsers` + `membersByOrgUnit` 补 `applyInternalFactoryUserScope`（工厂账号登录只看本厂，内部登录只看 factory_id 为空的内部人）；新增 `isExternalFactoryUser`/`isInternalUnit`；`assignMember` 写入侧拒绝外发工厂账号挂内部部门（抛异常），`batchAssignMembers` 跳过
4. `useRoleListData` 角色人数统计显式传 `excludeFactoryUsers: false`（全量口径，否则「外发工厂」岗位人数恒 0）
5. 反向核实不误伤：工厂账号经 FactoryPersonalCenterModal 传 factoryId 不受影响；云端 1997111 所挂节点是其自己的 EXTERNAL 工厂节点（非内部）不拦截；小程序借调/考勤搜索走同一接口自动属内部场景

**验证**：mvn compile 0 错误、tsc --noEmit 0 错误、eslint 0 告警（test-runner-mcp 不可用，P0 #23 降级原生命令并告知用户）。**未提交**，待用户确认。
**遗留**：user_type 仍为休眠字段；组织架构页工厂节点成员展示随过滤变空（工厂成员管理走「供应商管理→工厂成员」入口，属既有设计）。

## ✅ D-775 日产能 500 哨兵根治——NULL=未配置（2026-10-09，代码完成未提交）

**问题**：外部 8 家工厂 daily_capacity 全是列默认 500，代码用 `!=500` 判"已配置"→ 配置产能功能形同虚设；8 家近 30 天零扫码 → capacitySource 全部 "none"，产能卡片/排产建议全部无产能数据。

**改动（6 文件 + 1 迁移 + 云端数据）**：
- Flyway `V202710090005__factory_daily_capacity_null_unconfigured.sql`：列默认 500→NULL（幂等 MODIFY）+ 存量 500→NULL（UPDATE 带 WHERE 幂等，与原判定语义全局等价）
- 3 处 `!=500` 哨兵移除：FactoryCapacityOrchestrator L231/L401、SchedulingSuggestionOrchestrator L313
- 「清空=取消配置」：Factory 实体加 `@TableField(exist=false) clearDailyCapacity`，FactoryOrchestrator.update 见标志才显式 set NULL（带 tenant_id）；前端编辑弹窗 dailyCapacity 为空时传标志。**坑**：QuickManageModal 走同一 update 接口只改名/联系人不带产能字段，绝不能按"null=清空"推断
- 云端回填：本厂=115（用户拍板，扫码 2079÷18 天推算）；其余 7 家留空，待用户在 系统管理→工厂管理「日产能」填写（表单 extra 已加"留空表示未配置"）

**验证**：mvn compile 0 错误、tsc 0 错误、check-flyway-sql.py 通过、云端 UPDATE 已验证。**未提交**，待用户确认。

## ✅ D-774 D-772 三个遗留数据问题的数据库核实与最优解（2026-10-09，已推送 184fe5d62）

**数据库核实**（SSH 云端 MySQL，密码已变更为 `Fz666MySQL@2026`，查询需 `--default-character-set=utf8mb4`）：
- ① 全库 32 单在产仅 7 单 completed=0&progress>0；租户 2 两单 80% 进度的订单 `t_product_warehousing` **0 行入库**，工序扫码 300/840 件 → completed=0 是真实的，**禁止回填数据**
- ② 生产部/生产部1 是 `t_organization_unit` DEPARTMENT 节点（非 t_factory 行），近 14 天活跃扫码（2000/1200、840/1140 件）→ capacitySource="real" 真实扫码优于配置值
- ③ `fillHistoricalEvaluation` 已算出真实扫码合格率存入 qualityScore 且先于 calculateMatchScore 执行，但 calcQualityScore 未使用

**三项最优解**：
1. **修代码不修数据**：`SelfHealingOrchestrator.repairProgressConsistency` 由「双向改写（completed=0 会把 80% 进度清零，6 小时巡检一次）」改为 **completed=0 跳过 + 仅 expected>currentProgress 上调**（入库数只作进度下界）
2. **不插 t_factory 行**：插行会污染外发管理/供应商清单/排产建议（listFactories 只查 t_factory）；真实扫码数据已是最优数据源
3. **品质分用真实数据**：`FactoryCapacityOrchestrator.calcQualityScore` 改为 quality≥0 时 `round(min(100,quality)/10)`（95%→10 分），-1 才回退活跃度启发式（共用账号恒 5 分问题消除）

**验证**：mvn compile 0 错误（test-runner-mcp 不可用，P0 #23 降级）。**未提交**，待用户确认。

## ✅ D-773 采购批量按钮禁用原因全入口动态化（2026-10-09，代码完成未提交）

**用户报告**：采购已全部到货+已回料确认，「回料确认/确认完成」批量按钮置灰却显示「需先登记到货（到货数量＞0）」，文案张冠李戴误导用户；要求全部动态化、"全部完成"场景不得误导。

**根因**：四个采购入口的禁用 `title` 全是静态字符串，不区分真实原因；且 PurchaseDetailView / SelectedRowsBar / usePurchaseConfirmCompleteActions 仍用状态白名单（AWAITING_CONFIRM / RECEIVED·PARTIAL·COMPLETED），与 D-368 业务事实口径不一致。

**修复（9 文件）**：
- `PurchaseActionBar.tsx` 新增共享工具（D-664b）：`getBatchActionDisabledReason(rows, action, isReceiveRowComplete?)` + `isBatchReceiveableRow` / `isBatchReturnableRow` / `isConfirmCompleteRow`；判定顺序=先取消→再已全部完成/已全部回料→最后才是未到货，保证「已全部到货完成，无需重复确认」「已全部回料确认，无需重复」「需先登记到货」「采购任务已取消」「待领取物料信息不全」按真实状态输出
- 四入口接入动态 reason（disabled 直接由 reason 派生）：MaterialPurchaseDetail / InlinePurchasePanel / PurchaseDetailView / SelectedRowsBar
- 口径统一 D-368：usePurchaseConfirmCompleteActions（confirmCompleteTargets/confirmCompleteFrom）、usePurchaseReturnConfirmActions.handleBatchReturn、usePurchaseReturnActions.handleBatchReturn 的状态白名单全部改业务事实判定
- 点击时 message 提示同步动态化（MaterialPurchase/index、usePurchaseDetailActions、两 hooks），删除硬编码「（需先登记到货）」

**验证**：`npx tsc --noEmit` 0 错误；改动 10 文件 ESLint 无告警（test-runner-mcp / anti-pattern-mcp 本会话不可用，按 P0 #23 降级用原生命令并告知用户）。

## ✅ D-772 下单页工厂预测/推荐数据口径五项修复（2026-10-09，代码完成未提交）

**用户报告**：选中「生产部1」（4单在产）但抽屉显示「在产订单明细 1 单」400件、日产1600、推荐63分，全部对不上。
**数据库核实**（SSH 云端 MySQL 只读查询）：截图所有数字实为「生产部」的数据——前端工厂名双向子串模糊匹配 `find(c => deptName.includes(c.factoryName) || c.factoryName.includes(deptName))` 让「生产部1」先命中「生产部」。引入于 2026-04-26 提交 `1abe9bf84`（产能统计卡），`dbbbda837`（7-22 大拆分）原样搬运。

**五项修复（A~E）**：
- **A 错配**：新建 `frontend/src/utils/factoryMatch.ts` `matchFactoryByName`（精确优先→最长子串命中），替换 useOrderPageComputed / useCuttingCreateTask / useAnomalyDetection 三处
- **D 在手量口径**：新建 `intelligence/helper/OrderWorkloadHelper`（isCompletedPendingClosure=progress≥100；remainingQuantity 按 progress 排算）。FactoryVelocityCalculator.computeFactoryPendingQuantity 改 TERMINAL_STATUSES + 排除已完成待关单 + Σ剩余量（原 Σorder_quantity 把 progress=100% 未关单算进在手，导致"逾期27天建议转单"误报）；CapacityGapOrchestrator 同步；FactoryActiveOrderDTO 加 completedPendingClosure，前端抽屉显示「已完成待关单」而非逾期高危
- **B 产能口径统一**：废弃 EWMA×趋势×季节（1737.1），三处统一为 总扫码÷活跃天数：FactoryVelocityCalculator 新增 `computeVelocitySample` record(velocity, activeDays, windowDays)；CapacityGapOrchestrator 原 ÷30自然日（106.7）也改 ÷活跃天数
- **C 置信度**：原 `min(90,40+velocity)` 恒90% → 按活跃天数封顶（≥10天90 / ≥5天75 / 否则55）；PreOrderDeliveryPredictionResponse 加 velocityActiveDays，前端抽屉 <60 时显示「近14天仅X天有生产记录，样本不足」
- **E 人数展示**：activeWorkers 实为 distinct operator_id（共用扫码账号恒1），3处「生产人数 X 人」改「活跃扫码账号 X 个」+ 说明（OrderFactorySelector / FactoryCapacityCard / OverdueFactoryCardWidget）

**已知遗留（未改，需拍板）**：① completed_quantity 与 production_progress 不同步（progress=80% 但 completed=0）属数据问题 ② t_factory 无生产部/生产部1 配置产能行（capacitySource 走 scan 兜底）③ matchScore 中 qualityScore 按 activeWorkers≥5 给分，共用账号时恒 5 分无区分度 ④ FactoryCapacityOrchestrator 的日均产量口径（总扫码÷活跃天数）与 B 一致但窗口是"近30天有订单的扫码"，边界差异保留

**验证**：tsc 0 错误；mvn compile 通过（test-runner-mcp 本会话不可用，按 P0 #23 降级用原生命令）。相关类无既有测试引用。

## ✅ D-771 商品上架管理（店铺商品运营专用页）（2026-10-07，已上线 1b3d8d6）

**用户需求**：「需要有专门来做这些商品上架的、调整这些图片、以及商品上架数据」。
D-765 的「店铺管理 → 商品上架」只是开关列表：看不到也改不了售价库存，更没有任何入口换商品图。

**新建页面**：电商运营 →「商品上架管理」（`/ecommerce/shop-listing`），
前端 `frontend/src/modules/ecommerce/pages/ShopListing/`（12 文件：index/columns/types/css/unwrap + 2 hooks + 4 components）。
- 列表：主图 / 款号 / 款名 / 店铺售价区间 / 可售库存 / 颜色数 / 店铺状态 / 上架时间 / 操作；全部-已上架-未上架筛选 + 搜索
- 抽屉（SideDrawer width=85%）三段：①图片区 主图 + 每个颜色一张图（可「设为主图」一键）
  ②SKU 区 售价/库存可编辑，只提交用户改过的行 ③上架信息区 上下架开关（即时生效）+ 商品说明
- 主图未设置或为 1×1 占位图时高亮告警；改库存处给「不走台账」警示

**后端**（无 Flyway 变更）：
- `ShopOrderOrchestrator.productDetail` 增量返回 `colorImages`（+`skus[].image`，null 会被 Jackson 省略）
- `ShopAdminOrchestrator.batchSaveSku`（@Transactional）：售价走 updateSku；库存按「目标值−当前值」换算 delta 走 updateStockById；每次改库存写 `t_operation_log`；返回真实库存
- `skuSummary` + `POST /sku/summary`：款式维度售价区间/可售量/颜色数（一次 in 查询，避免 N+1）
- `ShopAdminController` 新增 `/sku/batch-save`、`/sku/summary`

**⚠️ 两个坑（已核实，决定实现方式，后续改这块必看）**：
1. `ProductSkuOrchestrator.updateSku` L649 **强制用旧值覆盖库存**，注释明写「库存改动只能走 updateStock」
   → 改库存必须另走一条路；两条独立事务会产生「价改了库存没改」的脏状态 → 故编排进同一事务
2. `updateStockById(id, delta)` 是 **delta 语义** 且 SQL 为 `GREATEST(0, stock+delta)` **会钳到 0**
   → 「目标值→delta」换算必须在服务端；**保存后必须回读真实库存**（前端已回显）
3. 手工改库存**不走出入库台账**（产品决策已接受），以操作日志留痕兜底；正规调整仍应走仓库入库/出库

**H5**：详情页选颜色切换主图（`colorImages`，无图回退主图）；购物车/立即购买的**封面与价格改为跟随所选 SKU**
（原来用全局最低价 `minPrice`，多色不同价时购物车会显示错价）。

**验证**：后端 mvn compile 通过；ArchitectureRulesTest + ShopOrderOrchestratorTest **12/12 全绿**；
租户审计 0 违规；tsc 0 错误；前端生产构建成功；safe-push 11 项全绿；门面内联 JS 语法校验通过；
线上实测：`/api/shop/public/t2/products/49` 已返回 `colorImages`；门面选色/加购/购物车价格正常，0 页面报错。
前端质量基线 any-lines 2661→**2660**（净减 1，新增代码以 `unwrap<T>(unknown)` 替代 `any`）。

**⚠️ 未验证**：管理页「商品上架管理」只验证了编译/构建/测试与接口上线，**未做浏览器实测**
（需要能登录生产的账号）。要复核请给账号，或本地起 Docker + MySQL。

**📌 编号**：并行会话已占用 D-768/769/770，本批用 **D-771**。

## ✅ D-766 / D-767 店铺界面返工（2026-10-07，已上线 3e8fbdf / 7aff7a2）

**用户反馈**（电脑浏览器打开分享链接）：「图片这些为什么这么大，做的都不像一个东西」「上架这些都不知道怎么上架」。
拆开是两个独立问题，都已修。

**① 门面桌面端被拉成巨幅（D-766，布局问题）**
`/shop/index.html` 是手机优先写法且无宽度约束 → 电脑 1298px 下每张商品图被拉成 **635×635**、底部 Tab 横跨整屏。
新增 `@media(min-width:600px)`：整页收成 **460px 居中手机列**，固定底栏（`.tabbar/.d-bar/.cbar`）同步 `left:50%+translateX(-50%)` 限宽。
实测桌面 1298px：卡片 635→**216**、底栏 1298→**460**；手机 390px 不受影响（181）。
另：「打开店铺」按钮改为固定 `430×900` 手机窗口打开（`window.open` 带尺寸），避免用户又被全屏巨幅糊一脸。

**② 封面是 1×1 占位图 → 糊成一大块纯色（D-767，数据问题）**
`t_style_info.cover`（款式 49「连衣裙」）指向的 PNG **只有 70 字节、1×1 像素**，
浏览器解码成功后按 `object-fit:cover` 拉伸 → 整张卡片就是一整块纯色，看着像页面坏了。
- 门面 `thumbHtml`：`onload` 后 `naturalWidth/Height ≤1` 一律换成「暂无图片」占位（与 `onerror` 同一兜底）
- 管理页上架引导补一句：列表「封面」是灰块 = 该款没传封面图

**③ 上架入口看不懂 + 搜索参数真 bug（D-766）**
- 上架引导：新增 Alert「找到款式 → 点右侧『上架到店铺』」，讲清 店铺展示价=SKU售价、可售量=SKU库存、封面来源
- 操作列裸 `Switch` → 明确的「上架到店铺」/「下架」按钮；新增 全部/已上架/未上架 筛选 + 已上架计数 + 刷新；空态给下一步指引
- **搜索参数用错**：原传 `styleName`+`styleNo` 同时等于关键词，后端是 **AND** → 永远搜不到；
  改为 `keyword`（后端对 款号/款名/品类 做 OR 模糊匹配，见 `StyleInfoServiceImpl.buildQueryWrapper`），pageSize 20→50

**验证**：`npx tsc --noEmit` 0 错误；门面内联 JS 语法校验通过；`safe-push` 全绿；
本地静态服务 + mock 接口实测桌面 1298px / 手机 390px 双宽度；线上实测 1×1 兜底在 6 个时间点 × 冷热缓存均稳定生效。

**⚠️ 待用户处理（数据，不是代码）**：款式 49 的封面是 1×1 占位图，需去「款式资料」重新上传封面；
否则店铺里只会显示「暂无图片」占位。同理 SKU 售价/库存为空会显示 ¥— / 已售罄。

**📌 备注**：D-767 编号与另一并行会话的 `aad529301 fix(db): D-767 清理 t_agent_checkpoint 遗留列` 撞号（非本次改动，留档备查）。

## ✅ D-765 店铺界面按淘宝风格重做（2026-10-07，已上线 8757b17）

**用户反馈**：今天新做的店铺功能「界面好差好烂」，要求按淘宝风格重做。

**C 端门面**（`backend/src/main/resources/static/shop/index.html`，无构建静态 SPA，后端直服 `/shop/`）：
- 淘宝式店铺头：橙色渐变头图（首款封面虚化兜底）+ 圆形头像 + 关注按钮（localStorage）+ 公告条
- 商品双列卡：¥ 红色价格（整数大/小数小）、包邮·现货·N色标签、售罄圆形遮罩、库存
- 底部 Tab（首页/购物车/我的，含角标）+ 「加载更多」分页（原来只取首屏 12 条）
- 详情页：橙色价格区 + 颜色/尺码（带库存、售罄划线置灰）+ 数量步进 + 加入购物车/立即购买双按钮
- 购物车：勾选/全选/删除/改数量 + 底部合计结算栏；下单前端校验手机号；下单成功页

**内部「店铺管理」页**（`frontend/src/modules/ecommerce/pages/ShopManage/`，新增 `index.css`）：
- 顶部概览条（店名 + 营业状态 + 复制店铺链接 / 打开店铺）
- 配置页左右分栏，右侧 375 宽**手机实时预览**（iframe 真页面，保存/上下架后自动刷新）
- 商品上架：封面缩略 + 状态标签 + 上架开关 + 已上架计数
- 店铺订单：状态筛选 + 订单号/收货人/电话搜索 + 订单号可复制
- 配色全部改用设计系统 CSS 变量（不再硬编码颜色）

**验证**：`npx tsc --noEmit` 0 错误；`safe-push` 4 项全绿；Playwright 真机（Chrome 手机视口）端到端走通线上 http://www.webyszl.cn/shop/index.html?s=t2 ：首页/详情/选规格/加购/购物车/结算/我的订单全部正常，**0 JS 报错**，线上登录页确认部署版本 8757b17。

**⚠️ 未验证**：管理页仅编译通过，未做浏览器实测 —— 生产测试账号 `lilb/123456` 登录返回 400（密码已改？），需要账号才能复核。

**⚠️ 设计取舍**：店铺暂无 banner/logo 字段，头图用首款封面虚化 + 店名首字头像兜底；若要真实店铺头图/头像上传，需给 `t_shop_config` 加列（Flyway）+ 管理端上传，属下一批。

## ✅ D-755 小云直查被上下文劫持（2026-10-06，已上线 37af931）

**现象**：PC 端停在「生产管理模块」页时，任意问题（订单号、`什么情况`、快捷按钮）全部返回同一条异常检测卡片。

**根因**：`question` 同时承载了两件事 —— 用户原话，以及给 LLM 的提示。前端 `buildContextualText()` 把「页面快捷操作建议（前 3 条）」与「历史对话摘要（最近 5 条用户消息）」拼进同一个 question，而 `DirectQueryRouter` 的直查判定是「包含关键词」的松散正则，在这整段上匹配。生产管理页前 3 条建议含「检测生产异常」→「停在哪个页面」直接决定「问什么都被劫持」；订单号也被吃掉（无参直查先于订单进度分支判定）。

**被污染页面恰好 3 个**（词表是窄固定词，不是裸「异常」）：生产管理模块「检测生产异常」/ 成品入库「入库异常检测」/ 财务管理「对账异常检测」。

**修法（两道防线）**：① 前端新增 `rawQuestion` 单独传原话，后端直查判定只看它；② `DirectQueryRouter.extractUserQuestion()` 按机器生成标记做**前缀截断**兜底（**不按方括号配对** —— 历史摘要是用户原话，可能含 `]`）。顺带修：订单号取用户原话而非 URL 里的；财务问法不再被生产异常抢先命中。

**测试教训（重要）**：`NoArgDirectQueryTest` 全是**源码字符串断言**、`DirectQueryRouterTest` 只喂干净短句 —— 断言的是「代码里有没有这行」，不是「给定这个输入会不会命中」，**结构上测不出这类回归**。新增 `DirectQueryContextIsolationTest` 用**真实 blob** 做行为断言。

**⚠️ 已知未修**：GENERAL 建议「🔍 检测今日异常」不匹配现有词表 → 点该按钮走不到快路径（仍可用，只是要等 Agent 循环）。

## ✅ D-756 物料仓库「面料属性 -」修复 + 单位默认米 + 料卷逐卷米数（2026-10-06）

> ⚠️ **本条此前被记为「已推 CI 绿」但实际未提交**，代码一直躺在工作区。本次补齐提交与推送。

**用户反馈**：物料资料（规格/幅宽 110、克重 80、成分 100%桑蚕丝、单位 米）齐全，但物料仓库详情面板「面料属性」显示 `-`。

**根因（前端 gate 过窄）**：`getMaterialTypeCategory()` 把「里料」归为 `lining`，而 PC 详情列/信息卡/入库抽屉都写成 `!== 'fabric'` 才展示面料属性 → 里料被挡掉。
**修法**：改为 `!== 'accessory'`（里料同属面料类：有幅宽/克重/成分，只有辅料没有）。同步改：
- PC：`useMaterialInventoryColumns.tsx`（面料属性 gate + 料卷标签默认单位）、`MaterialInfoCard.tsx`、`InboundDrawer.tsx`
- 小程序/H5 三副本：`components/material-inbound-form/index.js`（`isFabric: !isAccessory` + `loadFabricInfo` 门槛）、`pages/warehouse/material-inventory/detail/index.js`（2 处 `isFabric`）

**单位默认米**：`useMaterialInventoryList` 已有 `item.unit || '米'`；料卷标签单位默认由固定 `件` 改为「物料自身单位 → 面料/里料兜底 米，辅料兜底 件」。

**后端补数据源（第二层防御）**：
- `MaterialWarehouseOperationOrchestrator.autoCreateMaterialStock` 新增 `enrichFromMaterialDatabase()`：自动建库存行时按编码从「物料资料」回填 类型/名称/规格/幅宽/克重/成分/单位/单价/供应商（只填空值），并按类型兜底单位（面料/里料=米、辅料=件）。
- `MaterialStockServiceImpl.enrichConversionRate` 增加 物料名称/类型/规格/单位 的空值回填（列表查询即可用，修所有存量行）。

**验证**：`mvn -o compile` 通过、`npx tsc --noEmit` 0 错误、三副本 md5 一致、未触碰打印样式。

## ⚠️ 待处理（本次盘点发现，未擅自改）

1. **`t_agent_checkpoint` 生产表残留 `iteration INT NOT NULL`（无默认值）** → 每次 Agent 图 checkpoint 插入都 `DataIntegrityViolationException`（WARN，非致命，但断点续跑完全失效 + 日志噪音）。实体侧 `@TableField(exist=false)` 已不写该列；`V20260513001` / `V202705031800` 两次迁移都写了 DROP 却未生效。同表还残留 `idx_ac_session_iter` 索引与 `messages_json` / `tool_calls_json` / `total_tokens` 三列。
   - **已澄清（2026-10-07 抽检）**：迁移**台账本身是干净的** —— 625 个仓库迁移**全部**已在生产执行、无一条 `success=0`；且近期迁移目标对象实测均存在（`t_delivery_calibration_stat` / `t_intelligence_signal` / `t_ai_cost_tracking` 缓存列）。**漂移只集中在这一张表**，更像历史 DB 重建/同步把旧列带了回来，**不是系统性迁移失效**。
   - ✅ **已修复（D-767，2026-10-07）**：新增 `V202710070002` 逐列独立守卫迁移，生产已执行并验证（表结构 = 实体期望的 10 列 / 插入成功 / 重跑幂等 / Flyway 记录 `success=1` / 后端 healthy）。**真实根因**：`V20260513001` 用「单列 `session_id` 守卫」去控制**五列一起 DROP** → 守卫恒假整条跳过（**不是** Flyway 静默失效）；全仓扫描 626 个迁移**仅此 1 处**。执行顺序刻意设计为「先手工执行迁移原文验证 → 再提交」，使上线时对生产是 no-op，不可能因它起不来。
2. **小云「一直思考」**：一次提问触发 ToolAdvisor 预选 12 工具（含 `tool_think` / `tool_deep_analysis` / `tool_root_cause_analysis`）+ GoT 高级推理 + 5-Why RCA + 多Agent图 reflection/re_route，单次 LLM 5~11s 叠加 → 用户等 1~3 分钟；前端每收到事件就重置无活动计时器，一直停在「小云正在整理思路，准备给你结论…」。另 `systemPrompt过长(26300 字符 > 8000 上限)`，每次调用要裁掉 18300 字符。
   - **2026-10-07 补充核实**：前端**已有**进度 UI（`ChatMessageList` 渲染 mood/step/toolExecuting/elapsedMs），不只是那句文字；后端 `xiaoyun.agent.sse-heartbeat-interval-s=15` → **心跳每 15s 重置前端的 30s 无活动计时器**，所以那句「思考时间较长」兜底**实际永远不会触发**（`useAiChatStream.ts:15/133-141/188/323`）。
   - ✅ **已优化（D-770，2026-10-07）**：① 前端按后端**早已在发但被忽略**的 `stage` 显示真实阶段（`helpers.describeThinkingStage` → 「正在理解你的问题」/「正在查数据、核对结果」），不再永远同一句；② `timeout-ms` 180000 → **90000**、`max-iterations-hard-limit` 10 → **5**（最坏等待 150~180s → 约 75~90s）；③ 逐条工具注册日志降 debug（INFO 留一条汇总）。
   - **仍未动（有风险，需产品决策）**：改推理链 / 预选工具数会动回答质量；「心跳不重置计时器」会让 30s 兜底在长 LLM 调用中提前 `finishTyping()` 打断回答。
   - 补充澄清：103 行「已注册工具」是**一次性**的（`@Lazy` Bean 首个 AI 请求时创建），不是每请求开销。
3. ✅ **已完成（D-759 / D-760 / D-768）**：103 个工具端到端验收（真实缺陷 2 处已修：`QualityStatisticsTool` / `ComplianceExpertTool` + `BusinessSnapshotPrefetcher` 静默失效指标）；SelfCritic 低分追查（**是口径问题**——只存失败样本，已补分母）。
4. ✅ **「方大丝绸」主档重复已去重（2026-10-07，生产数据）**：租户2 两条同名主档（创建时间只差 30 秒 = 重复提交）。21 张有 `factory_id` 的表里两条**几乎零引用**（只有各自的 `t_organization_unit`），`FactoryOrchestrator.list` 有 `.eq(Factory::getDeleteFlag, 0)` → 软删即隐藏。执行：给先创建的 `80786e14…` 补手机号 + 软删后创建的 `9bb36652…` 及其 org unit（备份 `.workbuddy-ai/memory/patches/factory-dup-before-dedup-20261007.txt`）。
   - 🔴 **新发现、待决策**：租户 **117** 把组织架构建了**两次** —— `2acfec6f…`「车间」+ 子节点「车间1」（04-29 17:44）vs `ca92b4ac…`「车间」+ 子节点「财务部门/生产部门/行政部门」（04-29 18:20，完整架构）。后建的才是正式架构，但 **`t_production_order` 有 3 张订单引用旧节点** → 不能简单删，需「订单重指 + 决定『车间1』归属」，属结构性决策。
   - 仍待决定：最美布行 / 001 供应商主档是否新建。


## ✅ 物料仓库「面料属性 -」修复 + 单位默认米（2026-10-06）

**用户反馈**：物料资料（规格/幅宽 110、克重 80、成分 100%桑蚕丝、单位 米）齐全，但物料仓库详情面板「面料属性」显示 `-`。

**根因（前端 gate 过窄）**：`getMaterialTypeCategory()` 把「里料」归为 `lining`，而 PC 详情列/信息卡/入库抽屉都写成 `!== 'fabric'` 才展示面料属性 → 里料被挡掉。
**修法**：改为 `!== 'accessory'`（里料同属面料类：有幅宽/克重/成分，只有辅料没有）。同步改：
- PC：`useMaterialInventoryColumns.tsx`（面料属性 gate + 料卷标签默认单位）、`MaterialInfoCard.tsx`、`InboundDrawer.tsx`
- 小程序/H5 三副本：`components/material-inbound-form/index.js`（`isFabric: !isAccessory` + `loadFabricInfo` 门槛）、`pages/warehouse/material-inventory/detail/index.js`（2 处 `isFabric`）

**单位默认米**：`useMaterialInventoryList` 已有 `item.unit || '米'`；料卷标签单位默认由固定 `件` 改为「物料自身单位 → 面料/里料兜底 米，辅料兜底 件」。

**后端补数据源（第二层防御）**：
- `MaterialWarehouseOperationOrchestrator.autoCreateMaterialStock` 新增 `enrichFromMaterialDatabase()`：自动建库存行时按编码从「物料资料」回填 类型/名称/规格/幅宽/克重/成分/单位/单价/供应商（只填空值），并按类型兜底单位（面料/里料=米、辅料=件）。
- `MaterialStockServiceImpl.enrichConversionRate` 增加 物料名称/类型/规格/单位 的空值回填（列表查询即可用，修所有存量行）。

**验证**：`mvn -o compile` 通过、`npx tsc --noEmit` 0 错误。

## ✅ D-754 智能化落地 5 批（2026-10-06，已推 CI 全绿）

**这条线解决了什么**：把「看着像智能、实际喂假数据 / 只有建议没有闭环」的模块逐批改成真数据 + 真闭环。

- **P0 清淤**（6b64b740d，删 962 行假代码）：下线三处假数据（含零前端消费的假工厂推荐器）+ 两个空壳 Job；`SupplierScorecardOrchestrator` 改按真实 `factoryId` 分组并持久化；新增 4 个真数据 Job 常态化刷新。
- **P1 巡检→根因串联**（422425ba9）：工单自带证据包（纯 SQL、订单级），HIGH 级自动触发 5-Why 根因（异步 + 每日上限），挂进 `PatrolClosedLoopOrchestrator.createAction`。踩坑：状态值是 `scanned` 不是 `DONE`。
- **P2 环节瓶颈热力看板**（185286571）：`StageBottleneckHeatmapOrchestrator` 工厂×环节积压量 + 人力折算消化天数（真实扫码 + 工序配置）。
- **P3 交期偏差回扫自校准**（5b111aeb4，+712）：新表 `t_delivery_calibration_stat`（迁移 V202610060001）；`DeliveryCalibrationOrchestrator` 回扫近 180 天完工订单算 工厂/品类/工厂×品类 准交率 + 偏差倍数；反哺 `DeliveryDateSuggestionOrchestrator`（倍数拉伸 + 准交率<70% 再 ×1.15，样本<2 不生效）；每日 03:20 Job；单测 10 例。
- **P4 排产建议一键采纳**（ba651b450，+431）：`SchedulingSuggestionOrchestrator.adopt(@Transactional)` 写回工厂 + 计划起止并经 `ProductionOrderLogAppendHelper` 留「采纳排产建议」痕迹；`POST /intelligence/scheduling-suggestion/adopt`；前端排产建议卡新增「采纳」按钮（创建场景=一键回填工厂+计划起止）。单测 7 例。

**关键纪律**：不新建同用途编排器（只做串联/闭环/反哺）；口径（偏差方向、起止时刻）写进测试断言；场景缺口如实暴露（P4 前端创建弹窗无 orderId，写库端口留给既有订单/AI 工具）。

## ✅ D-702 小云工具调用链路 P0 大修 + Spring AI 2.0 GA 迁移（2026-10-04 ~ 10-05，已推 CI 全绿）

**这条线解决了什么**：生产实测发现小云 86 个工具**一次都没被真实流量调用过**——成本表 `scene='agent-loop'` 记录数为 0（对照 ai-advisor 1345 次），工具「注册了、从没执行过」，用户问业务数据时模型在**编造答案**（违反铁律 7）。逐层挖出并修复：①流式 QuickPath 调 `chatStream(..., List.of())` 传**空工具列表**吞掉业务问；②100 个工具里 63% 因未进 TOOL_RULES / 不被意图引用而**静默不可达**；③四个防幻觉守卫因 `supplyAsync` 跑在 commonPool 缺租户上下文而**集体静默失效**（接口照样 200）；④配额检查未收口在 `invoke()` 出口 → 限 50 实调 209，且 `t_intelligence_signal` 15.5 万行中真实信号仅 129 条；⑤成本 scene 被随机 UUID 污染、同步/流式入口能力不对称、NLQuery 兜底编数据。修法核心：QuickPath 加「数据可信性闸门」、`advise` 加「同域补齐」（不改 MAX_TOOLS_PER_CALL=12，成本不变）、守卫走 `supplyAsyncWithUserContext`、配额下沉 `invoke()`、信号表幂等 upsert + 生成列唯一约束（迁移 V202610050001 首版两处致命错误已修：DELETE-JOIN 会删空整表 / 动态 SQL 单引号未转义）。

**Spring AI 2.0 GA 迁移 + 流式链路（D-743 / 743b / 745 / 746 / 747）**：`spring-ai-bom` 1.0.0 → 2.0.0，底层换 OpenAI 官方 Java SDK，官方引擎切回主路径（legacy 熔断兜底）；随后连续三次生产实证依次修：流式请求不带工具 + Handoff 专家答案顶替工具核实（743b）、PREMIUM 分级路径拍平 prompt 丢工具（745）、坏答案被语义缓存回放（746）、DeepSeek thinking 400 因思考链/工具调用/结果消息丢失（747）。D-744 另修巡检交期风险卡按单堆叠（3 天 29 张）：两个 Job 补租户上下文使去重生效 + 24h 内复用旧卡刷新文案。

**关键成果与纪律**：测试规模 366 → **404 全绿**，新增 ToolReachabilityTest / DataTruthGuardUserContextTest / QuickPathToolGateTest / AiQuotaAndSignalDedupTest / AgentLoopCostAndEntryPointTest / PromptCacheObservabilityTest / StreamingUsageCollectionTest / AiToolMetadataConsistencyTest 等 8 个测试类；Prompt 缓存命中率可观测上线（`/ai-cost/cache-hit`，判读口径 good≥60%/fair≥25%/poor<25%）。教训入档：**代码质量断言必须用反射/实际调用，不能靠 grep 源码**（本次 grep 连续两次假阳性）；**AI 链路改动必须真机验证**（单测全绿拦不住 provider/SDK 两颗雷）；异步任务必须恢复 UserContext。**所有提交已推送 CI 全绿；本条为事后补记，落点为 decisionLog 的 D-702 / D-743~747。**

## ✅ D-719 / D-720 / D-472 数据治理：用户四项拍板执行（2026-10-03，已推 CI 绿）

**D-719 巡检审批通知空租户**：RiskSentinel/DataAnalyst 两个巡检 Job 裸调 createAction（内部从 UserContext 取租户）→ 定时线程拿到 null → 工单挂空租户 + 审批通知 insert 报 tenant_id 无默认值（生产日志实证，降级兜底未阻断）。修=两处包 withTenantContext（与另三个 Job 同款）+ notifyRelevantMerchandiser 空租户兜底防线。用户确认可见性口径：未领取任务同岗位可见、领取后仅领取人可见，只影响小云个人任务计数。
**D-720 402 余额熔断（用户拍板「直接提示账户余额不足」）**：三处识别 402（chat 非200 / chatStream 非200 / 视觉调用）→ 熔断 30 分钟停止外呼；chat/chatStream 入口短路直接返回提示文案（刻意绕过关键词兜底——用户要显式提示而非静默降级），流式先 emit 提示 chunk；冷却期满自动半开放行探测，充值自然恢复。形态照 401 熔断器（authFailCount）先例。
**D-472 遗留数据治理（生产库直改，备份表 bak_d719_bill_aggregation / bak_d719_bill_subject_mapping）**：①「EXPENSE 科目映射未配」**是陈旧遗留**——生产库 9 类映射早已全齐（EXPENSE=6602/2202），真问题是每行重复 44 份（616 行），已软删 602 行重复（解析带 LIMIT 1 无功能风险，纯卫生）。②往来 ID 回填 22 行：最美服装工厂 21 行 UNKNOWN_SUPPLIER → 真实 t_factory id 743bfa12…、测试工厂_7C6RMQ 1 行 → 其已删主档 id（两个此前被占位 ID 错误合并的对象就此分开）。代码侧 D-474 已实现「真 ID 按 ID 分组 / 占位空 ID 按名字分组」= 用户要的 id/名字双匹配。③最美布行（3 行）、001（4 行，租户112）**无供应商主档**，名字分组已正常工作，是否建主档待用户决定。顺带发现：租户2 主档「方大丝绸」存在两条记录（80786e14 / 9bb36652），属主档重复未处理。
**D-333 关案（2026-10-03）**：取证脚本 v2 首次回传 badGroups=0（距初报三周、历两百多批 UI 改版），用户确认原弹窗已无问题 → 判定被主题根修/D-516 字体/加载体系重构顺带治愈，不再追查；脚本留档备用。

## ✅ D-718：resilience4j 死依赖删除（2026-10-02）

Boot 4.1 升级评估（D-698）遗留的「resilience4j spring-boot4 变体」待办，实查后**问题不存在**：pom 4 个 artifact（spring-boot3/circuitbreaker/ratelimiter/timelimiter 2.2.0）+ application.yml 一整段 circuitbreaker/timelimiter 实例配置，但**全仓 main/test 零 import**——真实的断路器是 IntelligenceModelGatewayOrchestrator 自实现的 GatewayCircuitBreaker（连续失败计数+冷却+恢复日志），与 resilience4j 无关。已删除 pom 依赖 + yml 配置块，留 D-718 注释指向真实断路器；勘误 CODE_WIKI.md 技术栈表与 SpringBoot升级评估文档（评估时的「需换 spring-boot4 版」结论作废）。mvn compile 绿、全量测试零失败。**教训：升级评估先 grep import 核实真实使用面，别为没在用的依赖规划迁移。**

## ✅ D-716：service→service 架构违规 A/B 类收尾清零（2026-10-02，19 → 15）

治理方案（docs/架构违规治理方案.md）A 类 3 + B 类 3 共 6 项，D-693 已清 A1/B1，本批清掉剩余 4 项 → 只剩 C 类 15 项（方案明确「降到 15 即停、C 类不要碰」）。四项均沿用「更名移包、接口保留、调用方零改动」模式：
- **A2** SmartSourcingServiceImpl → `SmartSourcingHelper`（production.helper）；依赖 PurchaseCartService 带 @Lazy，调用图零改动。
- **A3** ShipmentReconciliationServiceImpl → `ShipmentReconciliationHelper`（finance.helper）；对订单仅 getById/lambdaQuery 取数；⚠️ 基类 BaseReconciliationServiceImpl 留在 service.impl，移包后补 import（同包隐式可见 → 显式 import）。
- **B2** EcUniversalStockService → `EcUniversalStockOrchestrator`（ecommerce.orchestration）。**实为具体类直接继承 MP ServiceImpl**（docs 里按接口理解有偏差），无接口；10 个调用方 import+字段类型全量更新（含测试）。⚠️ 两个同包陷阱：①原与 EcommerceOrderService 同包免 import，移包后要补；②漏网调用方 SmartWarehouseAllocator 在 ecommerce/service 包内，首轮按目录排除过滤漏掉，终查 grep 抓回——**排除式 grep 会漏同包调用方，收尾必须全仓 grep 类名**。顺带删除只有 4 行注释的空壳 EcUniversalStockServiceImpl.java。
- **B3** OrderTransferServiceImpl → `OrderTransferHelper`（production.helper）；不能叫 *Orchestrator——production/orchestration 已有同名 OrderTransferOrchestrator（715 行）会撞名。Controller 同时依赖接口+Orchestrator，接口保留后仍只依赖 1 个 Service（规则6 按「字段数>1」计，合法）。
基线 arch-baseline.properties 19 → 15 附完整记录。ArchUnit 7 规则全绿。

## ✅ D-717：教程内容回补 D-514~D-715 大改版（2026-10-02）

D-655 定的同步纪律首次专项执行（此前内容停在 D-513）。更新 6 篇现有教程 + 新增 3 篇 + README 备忘更新：
- **重写**「首页使用指南」（原「首页数据分析」）：流程引导面板（可配置/恢复默认，D-526/530/665）+ 经营数据折叠区 + 右侧服务栏。
- **更新** AI 巡检（补顶部铃铛预警简报面板：侧滑/整卡×当日关闭/目标显示单号款号/24h 冷却，D-626/654）；组合商品（创建入口=成品管理→组合商品、套装出库=商品仓储工具条、新增「电商平台卖套装」步骤，D-529/532/533）；供应商管理（编码自动生成，D-657）；物料采购（需求速览条+整单需求一览+灰项原因，D-660/664）；样衣开发（置顶图钉+字段治理 FAQ，D-625）。
- **新增**「统一待办中心」（入口=小云面板待办任务/铃铛、岗位池领取、已完成维度，D-612/613/617/618/694）、「批量打印生产单/工艺单」（逐单连打 vs 合并一份，D-611/611b）、「电商平台店铺授权」（四步向导+手把手引导+三档能力，D-587/589）。
- 验证：tsc 0 错、前端 493/493 绿。教程步骤文案均对照现行 UI 核实（首页区块读 Dashboard/index.tsx、电商授权读 EcommerceCenter、待办入口读 TaskListView 位置）。

## ✅ D-698：Spring Boot 3.4.5 → 4.1.1 升级上线（2026-10-01，已推 PR #27 已上线）

**状态**：编译✅ 单测✅ 真实库启动✅ 已合并上线；回滚路径干净——本次一条 Flyway 迁移都没执行，flyway_schema_history 未被改写，回退 3.4.5 时 Flyway 10.20.1 看到的仍是原样。
**改动**：parent 4.1.1；starter-aop → starter-aspectj（Boot4 BOM 已移除）；MyBatis-Plus 3.5.12 → 3.5.16（**刻意不选 3.5.17**：其迁包 IService/ServiceImpl 到 spring.*，会改 278 个文件 import）；新增 spring-boot-flyway（Boot4 把 Flyway 自动配置拆出）+ spring-boot-starter-json；9 个源文件适配新包名（Health→health.contributor / ErrorController→webmvc.error / MeterRegistryCustomizer / Lettuce 7 泛型 / JacksonConfig 显式 new）；application.yml 的 WRITE_DATES_AS_TIMESTAMPS → spring.jackson.datetime.*（Jackson3 把常量移到 cfg.DateTimeFeature，旧键位在 Boot4 下绑定失败 → 上下文启动失败，已实测复现）。
**阻断点**：Spring AI 1.0.0 与 Spring Framework 7 **二进制不兼容** —— `NoSuchMethodError: HttpHeaders.addAll(MultiValueMap)`（javap 验证 Spring 7.0.9 的 HttpHeaders 只有 addAll(String,List) 与 addAll(HttpHeaders)）。327 项单测全绿是因为 Mockito 把该 bean mock 掉了，非真实可用。
**处置**：SpringAiAdapterConfig 默认值 true → false，AI 由 LegacyInferenceAdapter（IntelligenceInferenceOrchestrator 1117 行，零 Spring AI 依赖，自实现 tool_calls）承担，AiInferenceRouter(@Primary) 路由与熔断。基线 vs 升级对照：启动 21.577s / 21.272s、工具注册数均 103、**运行期工具执行痕迹均为 0** → 工具调用未触发是既有实现特性，非本次回归。
**关键发现**：AI 真实迁移面只有 3 个文件（`grep 'ChatClient|Advisor'` 命中的 57 个里 54 个是自研类）——**已自研的 AiInferenceGateway 抽象层是迁移代价可控的关键**。已补 AI 模块测试安全网（327 → 340）：SpringContextSmokeTest 必须用 `BeanFactory.getBean(name)` 逐个触发，否则 lazy-init 下测试假绿。
**顺带**：修 D-701 遗留的多余 eslint-disable —— 只在 CI 的 `--report-unused-disable-directives` 下暴露，本地跑不带该 flag 复现不出。
**未做**：Spring AI 2.0.0 迁移（实测是范式重写：OpenAiApi 类完全移除、工具改由 ToolCallingAdvisor 在 Advisor 链注入，需重写 2 个文件）；resilience4j spring-boot4 变体。

---

## 🔴 D-699：SSE 流被截断 + DSML 协议残渣泄漏（2026-10-01，P0 已修）

**现象**：AI 顾问面板 `net::ERR_INCOMPLETE_CHUNKED_ENCODING`（HTTP 却是 200）；气泡出现 `<calls>` / `<invoke name="">` 内部协议。
**根因1（Boot 4.1 回归）**：Spring Security 7.1.1 的 AuthorizationFilter 对「每个 dispatch」都授权（官方 "All Dispatches Are Authorized"），Boot 3.4 的 Security 6.4 不会。SseEmitter 启动异步处理后容器会再做一次 ASYNC 分发，本项目 `sessionManagement=STATELESS` 无 HttpSession → SecurityContext 无处恢复 → 视为匿名 → 命中 `/api/**.authenticated()`。此时响应已提交，错误页也渲染不出 → 连接被硬关闭。
**修法1**：SecurityConfigHelper 首行 `dispatcherTypeMatchers(ASYNC, ERROR).permitAll()` —— 只放行 ASYNC/ERROR 二次分发，真正调 controller、校验 token 的 REQUEST 分发仍走原全部规则（鉴权强度不变）。
**根因2**：旧实现逐 delta 判断 `content.contains("DSML")`，而模型会把一段协议拆到多个 SSE delta → 判断所需的开标记恰好在上一片里，续行逃过清洗。
**修法2**：DsmlToolCallParser.stripLines() 跨 delta 缓冲、攒够一个完整换行才成行、成行后整行判断；strip() 复用同一逻辑保证「流式看到的」与「落库重读的」同貌；新增 flushDsmlTail()（模型最后一句通常不带换行，不 flush 会整句丢失）。
**测试**：349 全绿（新增 9）——DsmlStreamingLeakTest(6) 逐字复刻线上拆行场景；SseAsyncDispatchAuthorizationTest(3) 含「匿名 REQUEST 仍被拒」反向断言，防有人图省事改成 `anyRequest().permitAll()`。

---

## 🔴 D-700：AI 成本无法归因 + 预算护栏对后台任务失效（2026-10-01，P0 已修）

**现象**：DeepSeek 账单累计 ¥317、单日 ¥7.27 / 1243 次 / 199 万 tokens，而 `t_ai_cost_tracking` 自建表起 **0 行** → 数据库口径 9.1 万 vs 账单口径 199 万，**22 倍盲区**，系统完全无法回答「钱花在哪」。
**根因1**：AiCostTracking 实体无任何 @TableField，依赖驼峰→下划线默认推导出 model_name / estimated_cost_usd，实际列是 model / estimated_cost；INSERT 因未知列必然失败，而失败被 catch 里的 `log.debug` 静默吞掉（debug 不进生产日志）→ 编译过、单测过、启动正常，只有真 INSERT 才炸。
**根因2**：成本只挂在 AiInferenceRouter，而后台 agent/定时任务大量走 IntelligenceInferenceOrchestrator.chat()/chatStream() 直连，**绕过 Router** → 这批调用全部不记账。
**根因3（P0）**：canInvoke / tryDeduct / recordUsage 都有 `if (tenantId == null) return true;`，而后台定时任务与系统级 agent 恰恰没有租户上下文 → **花得最多的那一批调用完整绕过 50 万/租户/日上限**。
**修法**：补 @TableField 映射真实列名；在 finalizeResult / finalizeStreamResult（所有推理结果的唯一收口点）补记账；无租户上下文归入「系统桶」tenant 0 统一计量与限流（**不直接拒绝**——拒绝会让所有后台巡检/日报整体停摆，改为可观测 + 可总量限制）；失败日志 debug → warn。
**降本**：ProactivePatrolAgent 每小时 → 每 6 小时（`AI_PROACTIVE_PATROL_CRON` 可覆盖）。实测该任务对每个活跃租户拉起 4 个部门 agent（pmc/finance/qc/ceo）= 24×4=96 次/天/租户，且 avg response 仅 15 字符、avg latency 约 130ms → 全部命中关键词兜底，**绝大多数是空转**。取舍：异常发现时效从最迟 1 小时变 6 小时，属刻意决策。
**止损**：XiaoyunModelWarmup 补 @ConditionalOnProperty（原只有方法内 `if (!enabled) return`，「已关闭」仍每 90 秒被调度一次，实测每天空跑 662 次，每次留一条 t_ai_job_run_log，该表已 73.9 万行）。
**部署陷阱入档**：`.env.backend` 被 .gitignore 排除不入库，且 env_file 优先级高于 yml —— 只要它含 `SPRING_AI_ADAPTER_ENABLED=true` 就会无声覆盖 yml 的 false → NoSuchMethodError → 容器起不来 → **全站 502**，且每次从控制台「整份复制」都会把旧值带回来。已写进 deploy/lighthouse/README.md。
**测试**：356 全绿（新增 7）：AiCostTrackingEntityMappingTest(4) 把「实体↔表列名一致」变成可断言事实；AiAgentTokenBudgetServiceTest(3) 反向断言应急开关仍全量放行。
**实测结论**：81% 成本来自定时任务而非真人提问；核对开销必须查生产库（MCP 连的是本地开发库，flyway 624 条 vs 生产 1941 条）。

---

## ✅ D-618 / D-694：待办中心「已完成」维度 + 任务状态契约补齐 escalated（2026-10-01）

**D-618**：PendingTaskOrchestrator 新增 15 个已完成任务收集器（裁剪/质检/返修/物料/逾期订单/异常/款式开发/工资/物料对账/报销/发货/样品借还/领料），与「待处理」维度并列；新增 26 处查询全部带 tenantId（audit-tenant-id.py 0 违规）；同步 TaskListView / useTaskManager + 小程序与 h5-web 共 6 个 wxml。
**D-694 根因**：前端 TaskStatus 只声明 5 个值，后端 CollaborationTask.TaskStatus 有 6 个（多 ESCALATED），而后端把 ESCALATED 当活跃任务（计入 inProgressRaw、findActiveByTenant 会返回）→ 升级中的任务「待处理/进行中/已完成」哪个页签都不计入（幽灵项），且操作区只判 in_progress/accepted → 领取不了也完成不了（死路）。
**D-694 改法**：types.ts 补 'escalated'；statusBucket 由 `as` 断言改为**穷举 Record<TaskStatus, StatusTab>**（原 `as` 对未知值静默透传，正是 escalated 漏归桶无人察觉的根因；改穷举后后端新增枚举未同步时 TS 直接报错 TS2741，已实测）；操作按钮条件补 escalated。测试 480 → 485。
**勘误**：此前「后端 taskStatus 大小写不统一、DTO 未定死契约」结论有误——系统待办与个人任务出参均为小写、契约一致，真实问题是枚举不全。

---

## 🔴 D-693：领料出库旁路缺事务 + AI 工具绕过编排层（2026-10-01，P0 已修）

**缺陷**：MaterialPickingOrchestrator.createPicking 下游连做 4 个写操作（save 领料单 → insert 明细 → decreaseStock 扣库存 → recordOutboundLog），而 decreaseStockWithCheckDecimal 返回 0 时抛 IllegalStateException。该链路此前**全程 0 个 @Transactional** → 多明细第 N 条库存不足时，前 N-1 条已提交且无回滚 → 「领料单 status=completed + 明细缺失 + 库存已扣 + 出库日志缺失」的脏数据。
**真实库佐证**：t_material_picking 共 22 条，MPK 前缀 7 条（走本旁路）最后使用 2026-05-29，PICK- 主流程 13 条最后使用 2026-09-12 —— 旁路仍在产生真实数据，非死代码。
**修法**：createPicking 补 `@Transactional(rollbackFor=Exception)`（跨 Bean 调用非同类自调用，AOP 代理生效）；MaterialPickingTool 的 create 动作改走 Orchestrator（原直接注入 MaterialPickingService 做多表写入，同时违反「跨服务编排必须上移 Orchestrator」+「事务只在 Orchestrator 层」两条）。
**守护**：MaterialPickingTransactionTest(3) 用反射读注解；实测临时移除事务注解立即 FAIL（非假守护）。
**同批架构收敛**（service→service 21 → 19）：LoginLogServiceImpl 改注入 OperationLogMapper；DataCenterQueryServiceImpl 上移编排层——🔴 其 7 个方法全带 @Cacheable，**不能并入调用方**，否则同类自调用 → Spring AOP 代理失效 → 缓存静默失效（不报错，只每次查库）。新增 D693InjectionVerificationTest(5)；mvn test 315 → 323。
**文档勘误**：架构违规治理方案 3 处内部矛盾修正 + 领料事务核实报告；A4「三项均是 @Transactional 内业务写链」经核实不成立（三个文件 @Transactional 出现次数均为 0）。

---

## ✅ 依赖 EOL ratchet 门禁 + 云端健康诊断脚本（2026-10-01）

`scripts/check-dependency-eol.py` + `dependency-eol-baseline.properties`，CI「质量门禁」新增阻断步骤 + pre-push-checklist.sh 接入。**为什么用基线而非直接阻断**：Boot 3.4.5 与 Spring AI 1.0.0 建基线时已 EOL，直接阻断会让 CI 从第一天就常红 → 必然出现「加 --strict 绕过」或「临时关 job」，结果比假绿灯更糟（同 arch-baseline.properties 记录过的教训）。基线 2 → 1（D-698 上线后 3.x 不再是当前版本），剩余唯一 EOL 项 Spring AI 1.0.0（运行时已显式关闭）。门禁有效性已实测：基线临时调到 0 → 退出码 1。
`check-cloud-health.sh`（只读诊断）：一次看清容器状态 / MySQL 连接数 / 向量回灌进度 / Qdrant 集合 / 后端日志。修正原稿连接参数错误（IP 106.53.5.62 + root → 实际生产机 106.55.12.216 + ubuntu；root 登录不可用会卡在交互提示，诊断脚本反成故障第一道障碍）；已实测 Threads_connected=11 / max_connections=151。

---

## ✅ D-674~D-711：前端 as any 治理大批次（2026-10-01，any-lines 3204 → 2661）

**规模**：38 个批次，any-lines 3204 → 2661（净减 543 行）。代表：D-677 StyleInfoTabs 49 处；D-686 款式开发工作台 89 处 detail as any；D-684 useBoardStats 28 处；D-685 resizableTableHelpers 29 处；D-709 NodeDetailModal 簇整批 34 行。D-695 固化 `scripts/find-any-clusters.py`，order 家族四批（D-695/696/697/698）共清 92 处。
**方法/发现**：连续 9+ 个「字段全齐」案例——断言纯属历史遗留，机械删除即可；tsc 在首轮常拦下真实类型缺口后收口。
**⚠️ D-701 遗留**：清理该文件去 any 后，useEffect 的依赖数组已完整，原本压制告警的 eslint-disable 反成多余 → CI（带 `--report-unused-disable-directives`）当场报 Unused eslint-disable directive。**本地直接跑 `npx eslint <file>` 不带该 flag 复现不出**，已在 PR 中修掉。
**遗留**：基线 2661 仍未清零。

---

## ✅ D-672~D-676：前端质量基线与循环依赖治理（2026-10-01）

**D-673 循环依赖清零（madge 10 → 0）**：形态 A 9 处把类型定义抽到同目录独立 `<业务名>Types.ts` + 主文件 `export type ... from` 兼容旧引用路径；形态 B 1 处 Cutting barrel 再导出成环，改直连。
**D-676 上锁**：新增 `scripts/check-frontend-circular.py`（ratchet，madge 加 300s 超时保护）+ 接 pre-push + CI madge 从 continue-on-error 升为阻断。**为什么必须挂 pre-push**：服务器 autodeploy 是独立 cron（每 2 分钟拉 main 重建），不看 CI 结果，CI 门禁只能事后报警。
**D-674**：消除 8 处 exhaustive-deps 禁用（126 → 118）。先做全量探测（把 126 处逐行「失效化」后 eslint --stdin 复检）→ 确认没有一处是历史遗留的多余注释，126 处全部真需要；剩余 109 处「缺依赖」多是有意省略（补入会改变 effect 时序）。
**D-672**：消除 9 处 no-unused-vars 禁用（135 → 126）。
**D-675**：生产订单列表修复重复重绑与 stale closure（118 → 115）——fetchProductionList 原为**普通 async 函数**（每次渲染新建）却被 3 个 useEffect 直接列进依赖 → 每次渲染都重新 removeEventListener + addEventListener（含 WS 退订重订）；顺带修 visibilitychange 的 stale closure（依赖 [] 只绑定一次，onVisibility 永久捕获首次渲染的函数 → 切走再切回会用过期的查询条件拉数据）。

---

## ✅ D-667 / D-668：维护弹窗与 Select 下拉冲突（2026-10-01）

**D-667 根因**：antd Select/AutoComplete 用**原生 mousedown** 切换下拉，React 委托层的 onMouseDown 阻断为时已晚（原生事件已冒泡过选择器）→ 齿轮改 `onMouseDownCapture` 在事件到达选择器前拦死；修复 BasicInfoSection MaintainGear + DictAutoComplete + SupplierSelect + CustomerSelect 四处。QuickManageModal 的 ➕/➖ 圆形图标按钮改文字按钮「新增」「删除」。
**D-668 续报**：点新增后选项列表又弹出盖住弹窗——rc-select 焦点链路在弹窗焦点流转时**自行置 open=true**（无选择器 mousedown，纯内部状态怪癖，onMouseDownCapture + preventDefault 均拦不住）→ MaintainGear 加 onOpenChange，各 Select 加 `open={gearModalOpen ? false : undefined}` 强制压制。浏览器实测：齿轮→弹窗→新增全程无下拉遮挡，正常点击选择框本体下拉照常弹出。

---

## ✅ 记忆文件同步：Boot 4.1.1 现状 + 今日全部踩坑（2026-10-01）

**修正一条与现行政策完全相反的 P0 铁律**：copilot-instructions.md 原写「Java 单元测试永不提交仓库」并要求 `git ls-files backend/src/test/ | wc -l` 必须为 0；实际政策自 2026-09-15 起是**全部入库**——历史上正是该策略导致 **CI checkout 后测试目录为空、ArchUnit 架构门控空转（假绿灯）**。留着这条会让后续 AI 按它办事，持续破坏 CI 门禁。
版本号同步（CLAUDE.md 3.4.5 → 4.1.1；copilot-instructions.md 从 **2.7.18** 落后两个大版本 → 4.1.1）。新增「Boot 4.1 + Spring Security 7 陷阱」「AI 成本归因与止损」两节。补测试文件数 Java 33 → 44、前端 33 → 34；填「当前进度快照」；明确记下 MCP 连的是本地开发库（flyway 624）不是生产库（1941）。

---

## ✅ D-654 / D-654b：巡检工单刷量根治（2026-09-30）

**现象**：1181 条待审批实为 71 个真问题；同一停滞订单一天被自动执行 40 次重复催单。
**根因**：createAction 去重条件「PENDING 超 24h 即失效」→ 老工单不断被重复建。
**改法**：去重拆两条（PENDING 不限时长即拦截；APPROVED/AUTO_RUNNING 在途保留 24h 窗口）；新增 existsAutoExecutedSince（同租户 + 同问题类型 + 同目标 24h 内已自动执行则冷却），建单侧（AutoRemediationExecutor）与执行侧（AiPatrolJob）双冷却，执行侧命中则撤销重复工单（不执行不通知，留痕可追溯）。
**面板**：SmartAlertBell AI 巡检简报**整卡加 ×**（今日持久）；误导提示只在有行时显示（原行级 × 全关后标题卡永远关不掉）。**D-654b**：点 × 后巡检工单当日不再计入铃铛红点。

---

## ✅ D-655：教程中心死按钮接真（2026-09-30）

**「下载用户手册」**原为无 onClick 死按钮且全仓无手册文件 → 新增 userManual.ts 实时把教程数据编译为打印 HTML（封面=生成日期 + `__BUILD_COMMIT__` 版本戳 + 收录篇数，目录按分类分组，含步骤/温馨提示/FAQ/截图），safePrint 打开打印窗口另存为 PDF → **教程更新手册自动跟新**。**「意见反馈」**也是死按钮 → 复用个人中心 ProfileFeedbackModal + feedbackService（与 D-527 同源）。
**同步纪律**：Tutorial/README.md 定规矩——界面改动的 D 号须同批更新教程 + 清理旧描述 + 截图随改版换。**遗留**：教程内容停在 D-513，D-514 后大改版未回补，待专项。

---

## ✅ D-657 / D-660：供应商编码自动生成 + 物料需求一览铺进采购链路（2026-09-30）

**D-657**：后端空编码自动生成沿用存量 F+时间戳风格，factory_code 全局唯一索引下先查重重试 5 次防同毫秒撞码；前端新建模式编码框禁用 + 占位「保存后自动生成」+ 去必填，编辑态保留可改（存量手输乱码如 Table/0006 可修正）；SupplierSelect 失焦建供应商 / QuickManage 快捷建卡均不传编码，统一落此生成器。
**D-660**：共享组件 MaterialDemandSummary（components/common）——每物料卡 = 需求(含损耗)/可用库存/在途/缺口（净需求=需求-库存-在途），compact 速览条与整卡组两形态。后端 `/demand/preview` 加 orderNo 入参（手工采购表单只持有订单号，内部解析成订单后走原预览链路，orderId 优先保持兼容）。接入点①采购单创建表单实时速览条（useOrderDemandPreview 防抖 + 按物料+颜色聚合）；②采购单详情页整单物料需求一览（样衣模式不显示）。

---

## ✅ D-663 / 663b / 663c / 663d：顶栏用户名升级「工厂-岗位 姓名」（2026-09-30）

后端 /system/user/me 补 position；前端登录/启动两处映射。显示规则：设了岗位=「东方制衣厂-总裁CEO 李老板」；没设=「东方制衣厂-李老板」；工厂账号保留原橙色工厂标签不重复前缀。663b 平台名后加欢迎语「云裳智链 欢迎您」（小一号浅色后缀）；663c 移除顶栏左侧工厂名标签（工厂名已在右上角带出）。
**663d 真凶**：me() 返回的 position **永远为 null** —— resolveCurrentUser 走的 getCoreById/getCoreByUsername 是「防迁移报错的显式列名查询」，**白名单漏了 position 列**。两处白名单补上（t_user.position 生产库已存在已核实）。

---

## ✅ D-665 / D-666：首页更名 + 小程序 i18n 绑定缺口清零（2026-09-30 ~ 10-01）

**D-665**：menuConfig title/shortTitle + i18n menu.sections.dashboard 同步；routeConfig 深链标签 `/dashboard`=首页、`/dashboard/main` 主仪表盘→经营概览（独立深链保留区分）；页面标题、路由错误边界页名、数据加载失败提示、延期催单备注、教程中心三处文案全量同步。
**D-666（第 4 类 i18n 盲区）**：wxml 用了 `{{t.x}}` 但同目录 js 的 applyLanguage 从不给 t.x 赋值 → t.x 恒 undefined → 文案静默丢失（不报错、构建也过）。全项目 18 个页面 / 33 处 → **收敛到 0**。
**守卫扩容**：check-i18n-keys.py 4 项 → 8 项，新增 [5] `NS + 'x'` 无点引用校验（小程序 83 个文件用这种写法，原正则要求含点才匹配 → 按 NS 解析后实为 2634 个键）、[6]「值是翻译表片段」检测、[7] 死键报告（非阻塞 + 基线 68）、[8] 绑定缺口（非阻塞 + 基线 33）。
**P0 修复**：5 处线上裸键名 + 1 处语言包结构损坏（mp.attendanceDetail.accumHoursW 被写成整块翻译表片段，`String(对象)` 渲染成 `[object Object]`）；四语言键数 3915 → 3917 → 3918。
**修 23 处绑定的两个坑**：①一个页面可能有多个 `t: {` 块，模块级初始 data 里那个是空的、作用域无 lang，第一版插进去直接 ReferenceError（被 test-warehouse-pages.mjs 当场抓到）→ 改为选 applyLanguage 里那个块并加作用域校验；②插入格式 `rstrip('\n')` 会留下只含空格的空行。
**顺带**：修 4 处语言包值写错（wxml 把数字放在键外但键值含占位符 → 渲染出字面 `{count}`）、新增 5 键、修 1 处**不是漏绑定而是 wxml 路径错**（smart-ops 的 scanSubText js 设在 setData 顶层而 wxml 读 `{{t.scanSubText}}`）——守卫 [8] 因此增加「缺绑定 / 路径错」分类输出。
**其余 D-666 子项**：手机端样衣审核独立页（可写评语 + 传现场照片）；阶段详情审核改跳统一审核页；样衣详情补 5 个从未赋值的 t.* 绑定；右缘控件两处缺陷（清空 × 压住齿轮 + TextArea 顶部 22px 死区）。
**验证**：test-warehouse-pages.mjs 2423 项 0 失败（真实 eval 各页面模块，能抓 ReferenceError）；三副本内容完全一致。

---

## ✅ D-664：批量菜单灰项加原因反馈（2026-09-30）

**核实结论**：五处采购入口的禁用条件本身符合业务规则（到货数量=0 时回料确认/确认完成确实不可用），真正缺陷是 **antd 禁用菜单项悬停 tooltip 不渲染**，调用方传的原因用户永远看不到。改法：PurchaseActionBar 禁用项标签内联渲染原因（title → 灰字小字后缀，打开菜单即见为什么）；订单详情采购 Tab 原因改为「需先登记到货（到货数量＞0）」；InlinePurchasePanel / PurchaseDetailView 补传原因。

---

## ✅ D-632~D-671：架构违规收敛（2026-09-29 ~ 09-30）

**Controller → 多 Service 33 → 0**：D-632 CrmClientController（7 个 Service 下沉 CrmClientOrchestrator，545 → 158 行）+ 新增 SupplierPortalOrchestrator（534 → 183 行）；D-634 ~ D-652 逐批下沉（33→29→23→20→17→15→13→11→10→9→8→7→6→5→4→3→2→1→0）。
**Controller → Mapper 47 → 0**（D-654）：先把判据从 `haveSimpleNameEndingWith("Mapper")` 收紧为 `resideInAPackage("..mapper..")`，消除 Jackson ObjectMapper 造成的 3 个假阳性（18 → 7），再三处下沉到 0。
**service → service 56 → 48 → … → 21**：D-653 先修规则7 四处判据缺陷（`ExecutorService`/`ScheduledExecutorService` 的 simpleName 也以 Service 结尾被误当业务 Service；顶层 `com.fashion.supplychain.service` 包未按 javadoc 豁免；`.common.` 按段匹配漏掉包本身 `com.fashion.supplychain.common`；宿主类未双向豁免）→ 56 → 48；D-655~D-669 按「更名移包」模式逐批（ProductionOrderQueryService → ProductionOrderQueryOrchestrator 等，含 QdrantService 移入 common 一次归零 5 个依赖），D-670/D-671 基础设施 AuthTokenService + TokenSubject 移入 common。
**错误语义保持**：域内失败统一抛 IllegalArgumentException → 全局处理器 400 + 原样中文 message。**刻意不用 404** —— 前端 http.js 对 HTTP 404 会用固定文案「请求的资源不存在」覆盖后端 message。两个 Web 层守卫（「请先登录」/供应商门户 403）刻意留在 Controller，下沉会丢失专属文案。
**教训**：规则7 按「类」计数，ProductionOrderQueryService 依赖 8 个 Service 也只产生 1 条违规——「依赖数」衡量的是重构成本而非收益，选起点应优先「依赖数少 + 调用方少」的类。
**遗留**：剩余 21 项按治理方案批次推进（A 类 3 + B 类 3 + C 类 15，「降到 15 即停」）；C 类排除理由是调用方规模 + 库存核心写路径敏感度。

---

## ✅ D-656 / D-658 / D-659 / D-661 / D-662：文案与排版细节（2026-09-30）

D-661 顶栏整排字调小 2 号（用户反馈顶栏文字比正文大太多，D-516 全站字体加大把顶栏一起抬高）：页签/今日预警/用户名 15→13px、品牌 17→15、厂名 13→12，只动字号不动高度布局。D-662 打板基础码按实填码数联动（原把矩阵全部码数列带进打板尺码，与「基础码」语义不符；一码未填不覆盖手工值）+ 商品规格区统一 3×3 网格。D-659 无资料下单顶部信息区排版对齐有资料下单。D-656 CUTTING_BACKLOG 正名「裁剪积压」→「裁剪后积压」（原词与描述自相矛盾）。D-658 注释钉板：物料出库领料去向**刻意不过滤供应商类型**（发二次工艺厂/外发厂/退回布行均为真实场景，用户拍板保持全量）。

---

## ✅ D-626 / D-627：AI 巡检可读化（2026-09-29）

**用户反馈**：AI 巡检通知关不掉、面板要侧滑、巡检页满屏代码/编码看不懂。
**改法**：SmartAlertBell 下滑悬浮面板 → antd Drawer 右侧侧滑（宽 min(460px,94vw)，遮罩/Esc 由 Drawer 自带，移除手写的点外关闭 + Escape 监听）；简报行补 × 关闭（当日不再提醒，dismissedIds 按日 localStorage 持久化，key=patrol_<工单id>，老数据用类型+文案稳定键兜底）；类型原始英文码 DELAY/STAGNANT/SAMPLE_OVERDUE → 交期延误/进度停滞/样衣逾期。
**权威映射**：新建 `services/intelligence/patrolLabels.ts`（合并 useAiPatrol 4 键小表与 PatrolActionCenter D-513 大表，补 SAMPLE_OVERDUE/SAMPLE_STAGNANT/DELIVERY_RISK/MATERIAL_LOW/PURCHASE_OVERDUE/OVERDUE 等落库值），两处同源不再漂移。
**后端目标富化**：PatrolTargetLabelEnricher —— t_ai_patrol_action.target_id 对订单存 32 位 UUID、对样衣存 pattern 雪花 ID，列表接口批量翻译为订单号/款号；by-status/by-target/recent/pending/summary 全接线，失败静默降级为原始 ID。
**D-627 关闭键恒显**：决策卡 × 原位置被「规则判断/高置信」标签压住（找不到也点不到）→ 移到卡片右上角外沿 -7px + 白底阴影；dismissKey 改用卡片标题（面板每 10 分钟重拉后卡片顺序会变，序号键会导致「点了 × 又复活」）；`.sap-event-dismiss-btn` / `.sap-notice-dismiss-btn` opacity 0 → 1 恒显（触摸屏无 hover 时该键永远不出现），依据 D-287「行操作按钮常显」定论。
**验证**：本机 vite dev + Playwright 真机命中测试 + 真实点击；点 × 3 次 dismissed 计数恰好 +1，且不误触发跳转。

---

## ✅ D-628：选款编号去除随机后缀（2026-09-29）

**根因**：`Math.random()*9000+1000` 只有 9000 个取值，生日悖论下同一日期段约 112 条记录即有 50% 撞号概率（按月分段月产 100 款约 55%），且不可重放、不利于排查。
**风险分级**：批次号/候选号有 `uk_*_no_tenant` 唯一索引兜底（撞号=插入失败，可恢复）；**款号 t_style_info.style_no 无唯一索引**（V20260131 建索引语句被注释掉）→ 撞号静默产生重复款号。
**修法**：新增 SelectionNoGenerator，按「日期段 + 类型」分段进程内原子自增，分段起点由数据库水位（该日期段最大编号 +1）推导，避免服务重启后序号归零与历史编号重复；与 B2BOrderOrchestrator.generateOrderNo / PaymentNoGenerator 既有思路一致。**刻意不用分布式锁**——锁只防并发写，防不住不同时刻的随机碰撞，此处要解决的是编号唯一性不是并发问题。
**顺带**：修正 CLAUDE.md 两处与事实相反的过时描述（Java/前端单测自 2026-09-15、09-19 起已入库）。

---

## ✅ D-629：移除价格变更死链路 + 供应链风险监控默认关闭（2026-09-29）

**死链路**：PriceChangeEvent 有 2 个监听器但主代码**无任何发布方**（仅测试构造），功能已被 EcSyncJob（定时 PRICE_SYNC）与 EcSyncController → ProductSyncOrchestrator.pushPriceToPlatform 覆盖 → 整体删除（含 4 个测试用例）。
**顺带消除隐患**：SyncEventListener.onPriceChange 缺 onStockChange 那样的 BackendActionKey 开关守卫——若将来有人补上发布方接线，价格会被静默推送到电商平台，绕过「智能化不自动执行」原则。
**风险监控**：SupplyChainRiskMonitorJob 依赖 ExternalDataService 桩实现（Math.random 模拟面料价格指数/汇率/天气/风险评分），开启后每天 7:00 产生十几条「⚠️ 价格波动超过10%」假预警；更大隐患是 logRiskAdvice 已列出【待集成】真实推送通道（SmartAdvice / 企业微信机器人 / App 消息中心）→ 加 `fashion.risk-monitor.enabled` 默认 false；ExternalDataService 类头加使用约束警告：禁止把返回值用作对用户展示的决策依据。

---

## ✅ D-630 / D-631：质量门禁补位（2026-09-29）

**D-630**：CLAUDE.md 的 P0 铁律已写明「Controllers must NOT call multiple services」与「Services must NOT call each other」，但 ArchUnit **没有对应规则** —— 属「有规范、无门禁」。新增规则6/规则7 并纳入 ratchet 冻结基线（违规数只许减少不许增加）。**口径关键**：两条规则都只统计**字段注入**（@Autowired / @RequiredArgsConstructor 的 final 字段），不用 `getDirectDependenciesFromSelf()` —— 后者会把方法参数/返回值/泛型里的 Service 也算进来，实测会把违规数从 56 放大到 370。首次实测基线（字节码口径，非 grep 估算）：controller.depends.on.multiple.services=35、service.depends.on.service=56。
**D-631**：`frontend/.eslintrc.json` 里 no-explicit-any 与 no-console 均为 off（实测 3204 行含 any、135 处 eslint-disable、6 处 console.log）→ 新增 `scripts/check-frontend-quality.py` + `frontend/code-quality-baseline.json`，三项指标冻结进基线、超基线退出码 1、低于基线提示可 --update 下调（保证单调收敛），接入 safe-push.sh 前端段。**口径一律用「行数」而非出现次数**（同一份代码两种口径相差近一倍，混用会让基线失去可比性）。

---

## ✅ D-625：样衣字段治理 + 列表/页签双置顶（2026-09-29）

样衣详情删「商品属性」(productNature，与基础信息「商品类型」语义重复，全系统零消费方) + 删「标签」(styleTags，自由文本零消费方)；「打扮尺码」错别字更正为「打板尺码」（商品资料表单/详情抽屉同源修正）；打板尺码/数量与颜色码数矩阵联动；分区更名「商品规格」。
列表置顶：共享 usePinnedRows —— localStorage(按用户隔离) + t_user_preference 双写，跨登录跟随账号；生产订单 + 样衣开发三种视图（表格/智能/卡片）接入；场外钉住单按 id 补拉详情插队最前。顶部页签栏每页签加图钉（PushpinFilled/Outlined），关闭页签自动解钉。
后端：`/api/system/user-preference` 从租户主账号门槛放开到所有登录用户（数据严格按 tenantId+userId 隔离，普通主管此前存任何偏好都 403）。i18n layout.pinTab/unpinTab 四语言。

---

## ✅ D-624：ai-assistant 工具名 i18n 机制（2026-09-29）

`describeTool`（「正在使用「xxx」...」streaming 提示里工具名的来源）背后的 TOOL_NAMES 有 **80 项中文工具名**，接入 i18n：键 `common.toolName.<驼峰>`，缺键回落中文表（与 D-619 状态表同款「缺键回落，翻译分批补」）。键名自动转换规则：去 `tool_` 前缀 + 下划线转驼峰（`tool_query_production_progress` → `queryProductionProgress`）。**本批零建键**（机制先上线，补之前其他语言回落中文，不报错不空白）。勘误：D-623 提交信息写的「TOOL_LABELS 70 项」实为 TOOL_NAMES 80 项。

---

## ✅ D-615~D-623：i18n 收官批次 + 岗位池任务面板内领取（2026-09-28 晚）

displayHelper 状态 i18n 机制：D-619 salesOrder 域试点 → D-620 扩至 payment/return/advance/split/quality 6 个域 → D-621 补完剩余 4 域，**10/10 域全部接入**。ai-assistant 模块：D-622 三个 loader 文件接入四语言（33 键）→ D-623 主体接入（75 键，Component 生命周期适配）。D-615 样衣开发簇残留修补（25 键）+ cutting 簇定性豁免；D-616 待办详情页 + 退货列表页接入四语言；D-618 登录页收尾 + warehouse/work 簇定性豁免。D-613/617 岗位池任务面板内直接领取（卡片领取按钮直达业务接口；编号与 i18n 批次撞号，commit message 不重写、以 D-617 为准）。

---

## ✅ D-611b：批量打印返修（2026-09-28，已推 f9096b9c4）

**用户反馈两点**：①页码不要整批混编，要每一单自己的 第X页/共Y页；②抽屉里要看到第一单内容，据此定哪些信息显示/不显示。
**实测结论**：Chromium 页脚边距页码无法按单重置（counter-reset 只影响文档内 counter，不影响 @bottom-center）→ 每单独立页码必须每单独立打印任务。
**改法**：双按钮——主「逐单连打」（safePrint 加 onAfterPrint 串行链条：上一打印窗口关闭自动弹下一单，页码=本单；关抽屉即中断）+ 次「合并为一份」（整批连续页码）；新增 StyleBatchPrintPreview 第一单实时预览（与正式打印同源组件，勾选联动）。
**坑**：拆 prepareBatchDocs 时 runBatchStylePrint 忘了解构 opts——测试当场抓出。

---

## ✅ D-611：大货生产单/样衣工艺单批量打印（2026-09-28，已推待部署）

**形态**：列表勾选多单 → 一次统一勾选（与单一打印同一套 PrintOptionsSelector）→ 所有单按勾选生成、与单打完全同款 → 合并一份、打印对话框只弹一次、整批页码连续。
**关键件**：共享正文 StylePrintDocBody（预览与批量静态渲染同源）+ fetchStylePrintData 数据服务 + buildBatchPrintHtml 合并模板 + runBatchStylePrint（并发3/失败跳过/图片等待6s/上限30单）；safePrint 加 imageWaitMs 参数。
**入口**：大货订单列表批量条「批量打印生产单」（复用现成 rowSelection，此前勾选框无消费者）；样衣开发列表表格视图「批量打印工艺单」（新增 rowSelection）；智能/卡片视图不涉及。
**注意**：批量单据每单自带工厂大标题+打印人页脚（与单一打印逐字一致）；单批 >30 单会提示分批。

---

## ✅ D-590：工人提示根治（2026-09-27，已推待部署）

**根因**：备注贴工艺单后，`数字+号?针` 宽松正则把行号"5"和"针织面料"首字抓成"5 针"（PC 预览+工人扫码两份同源正则都中）。
**修法**：针号只认"X号针/针号：X"明确形态；新增针距提取；针号/针具/注意点按实际面料成分>AI 视觉>品类兜底（薄9号细针/弹力11号球头针/中等12号/厚14号/皮革16号，每类 3 条大白话注意点）；PC 预览改用后端 profile.workerHints 同源产出；小程序加针距/注意点行+工艺说明截断 5 行；三副本+i18n 四语言同步；回归测试 8 例绿。
**注意**：小程序端需手动发版；FabricRule 显示名与类别标识匹配用 startsWith 不能 equals。

---

## ✅ D-538：磁盘 85% 治理（2026-09-24，已清理 + 已加自动回收）

**根因**（前面几轮只记"遗留：磁盘 84%"，没人查过）：
`du -sh /var/lib/docker` 只有 1.8G，**别停在这一层**——继续下钻发现
**`/var/lib/containerd` = 28G**。本机存储驱动是 overlayfs，镜像层与构建缓存落在
containerd 目录（overlay 快照 21G + 内容 blob 7.1G），就是 `docker system df` 报的
Build Cache 25.32GB。每次部署都新增依赖层缓存、只增不减，约两个月堆到 25G。

**处置**：
- `docker builder prune -af` → **回收 25.32GB，磁盘 85% → 36%（可用 31G）**；
- 复验：6 容器全在、backend healthy、www 200、api health 200、0 ERROR；
- `autodeploy.sh` 加「每日 Docker 回收」：常态清 30 天前缓存 + dangling 镜像，
  磁盘 ≥85% 兜底全清，磁盘水位写进 `/opt/backups/disk-snapshot.log`；
- **没执行 `docker image prune -a`** —— 会把 maven/node/temurin 基础镜像删掉，
  下次构建要重拉，代价从"磁盘"换成"构建时间"，不划算。

**排查姿势（记住）**：磁盘排查必须下钻两层以上；`docker system df` 的
"Images 22.84GB" 含与构建缓存共享的层，别直接当"镜像占这么多"读。

---

## ✅ D-533：套装定价口径定版（2026-09-24，用户拍板，本地验证通过）

出库行单价直接记**套装单价**（设定的多少就是多少），子SKU原价落 original_sales_price 留痕（出库明细新增「子SKU原价」列划线显示）；
行金额按件数占比平账（合计=套装价×套数，收款总额不错账）。D-529/D-532 的"按子SKU售价比例分摊价"（19.97/20.06）已推翻。
本地实测：出 2 套价 60 → 两行单价 60.00、原价 36.86/37.03 留痕、80.00+40.00=120.00。详见 decisionLog D-533。

---

## ✅ D-532：组合商品接入电商（2026-09-24，本地全链路验证通过）

平台把套装作为独立商品上架（编码=comboCode）→ webhook/聚水潭接单识别套装订单 → 直发走套装出库（子SKU扣减+溯源+分摊精确到分）。
改动：t_ecommerce_order 加 combo 两列（V202709240002）、receiveOrder 组合识别、directOutbound 组合分支、
GET /api/ec/stock/combo-list、pushStockToPlatform 推组合套数、前端订单列表/详情/直发弹窗套装展示 + 智能库存「组合商品库存」面板。
顺手修两个既有 P0：UserContextInterceptor 给匿名请求注入空上下文（webhook 恒 401 not configured）；webhook 无租户上下文致接单回滚。
验证：推单→识别→直发（79.88+40.12=120 精确）→ /ec/stock/combo-list 27套。详见 decisionLog D-532。

---

## ✅ D-529：组合商品（套装）——组合SKU销售、实际按子SKU出库（2026-09-24，代码完成+本地验证，待推送）

用户要把两个不同款式 SKU 搭成套装销售（聚水潭式），销售记录挂组合SKU、库存扣子SKU。
已完成：两张新表（V202709240001）+ `/api/combo-product` CRUD + 套装出库 `POST /warehouse/finished-inventory/combo-outbound`
（复用 outbound 主链路：原子扣减/共单号/审批/账单全继承，行挂 combo_id/code/name 溯源，套装价最大余数法分摊精确到分）+
前端「组合商品」页（成品管理组，SideDrawer 三态：新建/编辑/详情）+ 商品仓储工具条「套装出库」+ 出库记录「套装」标记。

本地实测：建组合（自动编码/自动算价/可用库存=min 子SKU）→ 出 2 套价 60（子SKU 各-2、分摊 59.86+60.14=120 精确、
超卖拦截、事务回滚）→ 更新数量重算。决策细节见 decisionLog D-529。
待办：推送后线上验收（云端 Flyway 自动跑 V202709240001）；聚水潭式「组合商品上架电商店铺」属于电商模块，本期未接。

---
## ✅ D-525：商品仓储（旧称"成品库存"）与入库/收货各处补款式图列（2026-09-23，已改代码待推送）

**命名先纠正**：菜单一级「成品管理」下的页面正式名是**「商品仓储」**，
「成品库存」只是代码目录名（`FinishedInventory`）的旧叫法。
已把 `routeConfig.ts` 智能场景 label、`App.tsx` 错误边界 pageName 统一为「商品仓储」。

**核实后补齐的 8 处缺图列表**（原来只有编码/款号文字）：
出库弹窗「商品编码明细」、入库记录抽屉明细、扫码出库弹窗、自由入库弹窗、
商品编码详情抽屉（加 96px 大图）、出库记录主表、出库单明细、出库接收。

**本来就有图（别重复改）**：商品仓储主表、商品资料、物料库存、样衣库存、库存盘点、
库位详情、标签打印、生产入库列表/质检详情各处。

**有意不加**：同一款的颜色尺码明细表（表头已有大图，加列是噪声）。

**最容易踩的坑**：`t_product_sku.sku_code` 是"款号直接拼颜色尺码、**无分隔符**"；
扫码/打印二维码是"`款号-颜色-尺码-序号`、**有分隔符**"——两者不是一个东西，
二维码清单要用 `fetchByStyleNos` 按款号取款级封面，不能拿拆出来的串当 sku_code 查。

**验证**：`tsc --noEmit` 0 错；改动文件 ESLint 0 错。纯前端，后端无改动。

**遗留**：小程序端入库/仓储页面未做（工作区有 D-517 在改，避免三副本一致性门禁冲突）。

---

## ✅ D-524：电商所有列表补「款式图 + 款号」列（2026-09-23，已推送 `9679c6b10` + 线上验证通过）

**用户原话**：「还有所有的电商的这些 必须都要有图片列这些 不然看都不好看 还不知道是什么订单这些」。

**根因两层**：① 前端 `skuCode.split('-')[0]` 猜款号恒不命中（真实编码无分隔符）→ 款式图列永远是灰块；
② 电商中心 6 组列 + 退款/定价/库存差异 + 分销 2 组 + PlatformDetail 等**压根没有这一列**
（`stockCols` 甚至标题写「商品编码」却绑的是数字 `skuId`）。

**统一方案（照抄，不要各写各的）**
| 场景 | 后端 | 前端列工厂 |
|------|------|-----------|
| 行里有 `skuCode` | `POST /api/style/sku/brief` | `styleImageColumn` / `styleNoColumn` |
| 行里只有订单号 | `POST /api/ecommerce/orders/brief` | `orderImageColumn` / `orderStyleNoColumn` |

- 数据源统一 `useStyleCoverImages()`（`imageMap`/`briefBySku` + `orderImageMap`/`briefByOrderNo`），
  接口自带摘要时用 `seedBriefs()`。
- 都以 `t_product_sku` 为权威口径，单次上限 500，**查不到就不返回该键（不编造默认图/假款号）**；
  颜色图优先，缺则退回 `t_style_info.cover`。
- 列工厂集中在 `frontend/src/components/common/styleImageColumns.tsx`（列宽 68 / 占位灰块 / 点击预览全站一致）。
- **新增铁律 15**：电商/仓库每张商品相关列表都必须带「款式图 + 款号」列，款号只能来自后端解析。

**验证**：`mvn -DskipTests compile` 过；新增 `SmartEcommerceControllerBriefTest` 9 例全绿（+3 个既有测试类无回归）；
`tsc --noEmit` 0 错；改动文件 ESLint 0 错；`grep "split('-')[0]" frontend/src` 已无商品相关命中。

**线上已实测通过**（backend 容器 healthy、启动 40.3s、ERROR 0、Flyway `Migrate complete.`；
前端产物新增 chunk `assets/styleImageColumns-*.js` 且含 `/ecommerce/orders/brief`；
容器 jar 内确认 `SmartEcommerceController` 有 `/orders/brief`、`ProductSkuController` 有 `/brief`）。

---

## ✅ D-523：电商库存"点不到"与启动刷 ERROR（2026-09-23，已推送待上线）

- **库存全量重算补入口**：`POST /api/ec/stock/sync` 原本无任何前端调用方（孤儿接口）→
  后端返回 `{skuCount}`，前端「电商中心 → 库存明细」tab 加「重算库存」按钮。
- **Flyway 幂等化**：`V202709200001__add_salary_work_start_time.sql` 改 `information_schema` 判存在再 ALTER，
  消除每次启动的 `Duplicate column name` ERROR。
- **`PlatformWebhookController` 假成功修复**：异常 500 / 未配置 401（与 D-522 的 `EcommerceOrderController` 对齐）。
- ⚠️ **`t_ec_platform_config.callback_url` 是出站物流回传地址**，不是我们的入站 webhook；
  线上 3 行凭证是占位值（app_key=`admin`/`zhangwan`）→ 平台真实推单需商家提供真实凭证。
- 服务器遗留（未处理）：磁盘 `/` 84%、`autodeploy.log` 29MB 无轮转。

---

## ✅ D-515 物料中心：重复搜索栏治理 + 领料「无数据」误判（2026-09-23，已改代码未提交）

**用户反馈**：① 手机端物料中心「领料」tab 空，怀疑与 PC 不同步；② 顶部一个搜索栏，切到各 tab 下面又一套搜索/扫码，重复太多。

**核实结论（重要，别再误判为"不同步"）**：
- 两端同接口 `GET /api/production/picking/list`、同表 `t_material_picking`、同枚举（pending/completed/cancelled），**数据是同步的**。
- 空的原因是小程序「领料」tab 硬编码 `status="pending"`（wxml + 组件默认值都是 pending），
  而 **D-099 之后内部领料是「领取即出库」**（`MaterialPurchaseOrchestrator.createPickingAndOutbound`
  建单后同事务 `confirmPickingOutbound` 直接落 completed），**只有 EXTERNAL 外发领用才产生 pending** → 待出库天然为空。
  PC 默认筛选是 `''`（全部）所以看得到记录 → 造成"两端不一致"的错觉。
- 次因（若切「已完成」仍空再查）：后端 `DataPermissionHelper.getFactoryOrderIds` 对带 factoryId 的工厂账号做订单归属过滤。

**已改（4 个文件，纯小程序）**：
1. `material-center/index.wxml`：顶部 `sticky-search-bar` 加 `wx:if="{{activeTab === 'inventory'}}"`——只在库存 tab 显示（入库/出库表单自带"编码+扫码+查询"，领料列表自带"搜索+状态筛选"，料卷 tab 自身即扫码入口）。
2. `material-center/index.wxml`：领料 tab `status=""` + `show-search="{{true}}"`（顶部栏不再常驻，组件用自己的搜索栏）。
3. `material-picking-list/index.js`：properties/data 的 status 默认值 `pending` → `''`（全部），与 PC 对齐；独立页 `?status=pending` 深链不受影响。
4. `material-center/index.js`：`onTabTap` 切到入库/出库时把库存搜索词当 `formCode` 预填（搜 M001→切入库直接带 M001，不重复输入）；删掉料卷 tab 里"顶部搜索栏旁的📷也能直接跳到这"这句失效提示。

**遗留已处理（2026-09-23 同批完成）**：
- `pages/warehouse/material-inventory/index`（物料库存列表独立页）确认是孤儿页（全仓无 navigateTo 指向）→ 已删 4 个文件 + 从 `app.json` 分包移除。
  ⚠️ 删之前先补平能力：该页有「加载更多」分页，而物料中心库存 tab 原先写死 `pageSize:30` 只能看 30 条 →
  已给 tab 补分页（`inventoryPage/hasMore/loadMoreInventory` + 底部「加载更多」+ `onReachBottom` 仅库存 tab 生效）。
- 待办通知深链 `pages/todo-detail/index.js` 的 `MATERIAL_PICKING` 去掉 `?status=pending`（内部领料不产生 pending，跳过去必空）。
- ⚠️ `scripts/test-warehouse-pages.mjs` 里读了该孤儿页做断言 → 已改为以物料中心为准，并补 5 条 D-515 回归断言；
  跑 `node scripts/test-warehouse-pages.mjs` 全绿（172 项）。
- `h5-web/source-miniapp` 是 `h5-web/scripts/sync-miniprogram.mjs` 的生成物（先清空再全量拷），下次跑同步自动跟上，不用手改。

---

## ✅ D-453 P0 事故已闭环（2026-09-17 17:05）

- 修复提交 `69d8c10` 已上线：autodeploy 内存守卫+串行构建、Maven 限堆 1280m、Node 限堆 1G、backend -Xmx1536m
- **手动串行部署实战数据**：后端构建 3m08s（峰值 avail 335M/swap 649M），前端构建 62s（峰值 swap 767M），全程无 OOM
- 教训验证：串行 + 构建堆封顶后 2核4G 可安全发版；cron 已恢复运行新脚本
- 上线后内存：总用 1.3G / available 2.3G（事故前 2.1G/1.5G，backend RSS 1.18G→813M）
- 事故前前端实际是 5eb765d（d6fd94b 前端当时没构建完）→ 本次已补建，水印 69d8c10
- **遗留建议**：升级 4核8G（630元/年）；繁忙时段 autodeploy 守卫可能跳过构建属有意设计，走低峰期

---

## ✅ D-464 采购金额口径统一（2026-09-18，已推送 CI success 并上线）

- **新口径（取代 D-076/D-129）**：`total_amount = 实际到货数量 × 单价`，未到货记 0（没到货不产生应付）
- **唯一入口**：`MaterialPurchaseHelper.calcTotalAmountByArrived(...)`——任何写入点禁止再写
  `unitPrice × purchaseQuantity`，否则又是一次口径分裂
- 改写点：MaterialPurchaseServiceImpl(3) / StyleBomPurchaseHelper(2) / ProductionOrderServiceImpl /
  MaterialPurchasePickingHelper(补采单) / MaterialPurchaseReturnHelper(回料) / 前端 3 处保存 payload
- **易漏点**：`MaterialInboundOrchestrator` 走 `atomicAddArrivedQuantity` 绕开 service，金额不会自动
  重算，已单独补上；对账 `resolvePrices` 无单价时反推单价的分母也必须同步改用「到货量」
- 迁移 `V202709180100__recalc_material_purchase_total_amount.sql`：订正存量（幂等，按目标值不等式过滤）
- **核实结论（更正早前误判）**：
  - 采购单打印 `PurchasePrintModal` **早已是到货口径**（明细行 `arrived * price`，页脚文案
    「合计金额（按实际到货）」），无需改动
  - 对账单 `t_material_reconciliation.quantity` 存的是**对账数量**（封顶到货量），本就是到货口径，
    存量**不需要**订正（pending 单据后续 upsert 会自然重算）

## 🚚 生产环境已迁移至轻量服务器（2026-09-17 完成，本节为当前最高优先级上下文）

- **新生产环境**：腾讯云轻量 2核4G（IP 106.55.12.216，广州），`deploy/lighthouse/docker-compose.yml`
  跑全家桶：caddy(HTTPS自动签) + frontend + backend + mysql8 + redis7 + qdrant + cloudbeaver(D-435 替换 phpMyAdmin，db.webyszl.cn 管理台)
- **⚠️ db 管理台长期 502 的机制性原因（2026-09-17 查清）**：autodeploy **只** `up -d backend frontend`，
  **从不拉起新加入 compose 的服务** → CloudBeaver 自 D-435 起容器从未被创建（实测 `up -d` 时输出
  `Volume ... Created` + `Image Pulled`），`restart: unless-stopped` 对"从未创建过"的容器无能为力。
  修复方案见 `deploy/lighthouse/autodeploy.sh` 的 D-455 补丁（全服务在场巡检）。
- **自动部署**：服务器 cron 每 2 分钟 `autodeploy.sh` 检查 main 分支，backend/frontend 变动自动重建
  - **判断是否上线**：登录页「部署版本：<7位短 commit>」；纯 docs/`memory-bank/` 提交**不触发重建**，版本号不变属正常
  - **⚠️ 本机无法登服务器**：SSH 是密码登录（非密钥），且仓库 secrets 里没有
    `LIGHTHOUSE_HOST`/`LIGHTHOUSE_USER`/`LIGHTHOUSE_SSH_KEY`（`deploy-lighthouse.yml` 因此是死的，触发必失败）
    → 一切服务器侧动作只能靠「改脚本 + push」让 autodeploy 自执行
- **数据已迁移**：438MB 整库（t_user=25 / t_production_order=114 / t_style_info=110 核对一致）
- **自动部署**：服务器 cron 每 2 分钟 `autodeploy.sh` 检查 main 分支，backend/frontend 变动自动重建
- **DNS 已切**：api / www.webyszl.cn → 106.55.12.216（DNSPod，A 记录）；Caddy 自动签 Let's Encrypt
- **云开发体验版 2026-10-16 到期自然退役（不续费）**——期间老云托管 MySQL 保留作回滚保险
- **⚠️ 切换后只在新系统录数据**（老库新库已分家；若老系统有增量→重跑 migrate-db.sh 覆盖式同步）
- **✅ MySQL 定时备份已完成（2026-09-18 核实，此前本条待办状态滞后）**：
  - 服务器侧 `deploy/lighthouse/backup-db.sh`（D-455）：每天 03:00 后首次 autodeploy 轮次执行，
    产出 `/opt/backups/fz66666-YYYY-MM-DD.sql.gz`，保留 14 份，失败 30 分钟冷却
  - 本机侧 launchd `com.fz66666.db-backup`（每天 10:07）跑 `~/fz66666-backups/pull.sh` rsync 拉取异地副本
  - 实测已工作：2026-09-17 23:30 成功拉取 `fz66666-2026-09-17.sql.gz`（45M），日志见 `~/fz66666-backups/pull.log`
- **⏳ 待办**：密钥轮换（微信MP Secret/DeepSeek/COS）；删 DNS 的 h5 两条记录；稳定一周后清理云托管；
  升配 4核8G（2核4G 发版仍偏紧）
- **Embedding 已切智谱**：ai.embedding.* 配置（embedding-3，1024 维），硅基流动已弃（余额402）；
  Qdrant 向量库本地持久化（服务器磁盘，不再随发版清零）

---

## 物料色卡体验优化（2026-09-17，未提交）

**用户诉求**：拍照识别改用统一上传组件+一键生成（供应商/色号/颜色命名）、弹窗加大、色卡 hover 出预览、批量传图、卡片缺翻页器。

- [x] **后端** `POST /api/material-color-card/{cardId}/recognize-entries`（Orchestrator.recognizeEntriesFromImages）：
      多图多色号识别，只识别不写库；编号=`M/L/F-色号`（卡内唯一冲突加 -2/-3，缺色号用顺序号），
      名称=`供应商-面料名-色号-颜色`（如 经典时尚-真丝双绉-A01-红色）；按"色号+颜色"与存量+本批去重；
      租户隔离沿用 getCardById + selectByCardId(cardId, tenantId)
- [x] **前端 hook**：`recognizeEntriesAndSave`（显式 timeout 180s，拦截器 recognize 60s 规则仅在未显式传值时生效）
      → 合并后 items/batch 全量落库 → 重拉明细 → 刷卡片数量；`replaceItemsAndAutosave` 供批量传图/删除后立即保存
- [x] **物料管理抽屉重写**（MaterialColorCardItemsModal）：宽 960 → 85%；去旧"拍照识别"裸 input，
      改 MultiImageUploadBox（统一 /common/upload，本地服务器存储无微信云残留）+「一键识别生成」；
      行复选框（WeakMap 稳定 key）+ 批量传图（1 张全部/多张按序对应）+ 批量删除（均自动保存）；
      每行图片改 ImageUploadBox；未命名行拦截自动保存动作
- [x] **翻页器根因修复**：UniversalCardView 收了 pagination 却从不渲染 → 补 antd Pagination；
      MaterialDatabase/index fetchList 未回填 total → setTotal(data.total)（列表表格+物料卡片同受益）
- [x] 色卡母卡弹窗 760 / 颜色详情 720 → SideDrawer 85%
- [x] 新增 ColorCardHoverPreview：hover 卡片标题懒加载该卡前 8 条色块（图/色名色块+色号），模块级缓存
- [x] 顺手补编译缺口：MaterialColorCardOrchestrator 缺 `import entity.MaterialPurchase`（比价存量代码）
- [x] 验证：`mvn compile` BUILD SUCCESS；`npx tsc --noEmit` 0 errors
- [ ] 待真机验证：多色色卡照片识别效果、hover 预览、翻页（编译通过≠运行正确，D-055 反思三问）

---

## D-417 手机端「只能看不能办」待办补齐独立处理页（未提交）

**用户诉求**：异常报告/样衣开发、工资结算、物料对账/费用报销、协作任务在手机端只能查看，
要求各自建独立页面、各自有入口按钮、沿用现有手机卡片风格，并注意内外部账号差异。

**已完成（财务三类，小程序分包 `pages/finance`）**：
- [x] `pages/finance/reconciliation/index` 物料对账：列表 + 状态推进（核实→审批→付款）+ 退回
- [x] `pages/finance/reimbursement/index` 费用报销：列表 + 批准/驳回 + 确认付款
- [x] `pages/finance/payroll-approval/index` 工资结算：operator-summary 列表 + 单条/批量审核明细
- [x] 接口封装 `utils/api-modules/finance.js`：新增 `materialReconciliation`、`expenseReimbursement`，
      `payrollSettlement` 增 `approveDetail`；`utils/api.js` require/exports 同步
- [x] 路由连通：`bellTaskActions.handleBusinessTask` 3 个 case 改指新页；`pages/todo-detail` 的
      `HANDLE_ROUTE`/`HANDLE_LABEL` 同步
- [x] 样衣开发：解析待办 `id`(`STY_{styleId}_{stage}`)/`deepLinkPath`(`/style-info/{styleId}`) → 直达
      `sample-development/detail?styleId=`（原仅落列表）
- [x] 内外部区分：财务三页对 `isFactoryAccount()` 直接拦截（工厂账号不参与租户财务）；
      工资审批复刻 PC 端规则「外部工厂订单须进入终态才可审核」
- [x] 验证：`node --check` 全通过、`app.json` JSON 合法、3 页 × 4 文件齐全
- [x] 协作任务独立页：`pages/collab-task/detail/index`（挂新分包 `pages/collab-task`）+
      `utils/api-modules/collaboration.js`；状态流 `PENDING→ACCEPTED→IN_PROGRESS→COMPLETED`（+CANCELLED）
- [x] 异常报告：**后端补齐处理能力** —— 迁移 `V202709150400`（加 handler_id/handler_name/handle_note/
      handle_time + idx_exception_status）、实体加字段、`ExceptionReportOrchestrator.list/handleException`、
      Controller `GET /list` + `POST /{id}/handle?action=resolve|reopen&note=`
- [x] 手机端异常处理页 `pages/smart-ops/exception-detail/index` +
      `api.production.listExceptions/handleException`
- [x] 验证：后端 `mvn -o compile` BUILD SUCCESS；11 个 JS 文件 `node --check` 全 OK；
      `app.json` JSON 合法（分包 29→30）；5 个新页面 × 4 文件齐全
- [x] **端到端同步核实（用户要求"手机端与 PC 端审核必须完全同步"）**：逐类比对两端调用路径 ↔ 状态落库表，
      结论**五类全部天然同步**（同一套后端接口、单一数据源）；**修复唯一一处不对称** ——
      `EXCEPTION_REPORT` 深链原指向 PC `/production/order-flow`（该页无异常处理入口），
      已新建 PC 页 `Production/ExceptionReport` + `services/production/exceptionReportApi.ts` + 路由
      `/production/exception-report`，并改后端深链为 `?keyword={orderNo}`
- [x] 顺手修复 `pages/collab-task/detail` 只有 `onLoad` 无 `onShow` 的陈旧状态隐患
- [ ] 全部改动仍在工作区未提交（D-408 图片上传回退 / D-410 到货小数化 / D-417 手机端页面 + PC 异常页）

**同步性硬保障（已逐条验证，后续改动勿破坏）**：
1. 工资审批 `approvalId` = `buildDetailApprovalId` 的**确定性 MD5**（`"PAY_" + md5(tenant|orderId|orderNo|styleNo|color|size|operatorId|processName|bundleNo)`），
   不含时间戳/随机数 —— 两端算出的 key 必然一致，**切勿改成含时间/随机的 key**。
2. `approvalStatus` 由 `PayrollSettlementController.getOperatorSummary` **每次从库注入**
   （`approvalStatusService.getApprovalStatus`），**不是前端缓存**。
3. 手机端 5 个新页均有 `onShow` 重新拉取；PC 端待办面板有轮询；`MaterialReconciliation` 用 `useSync` 跨端刷新。

**★ 手机端「应用 / 职务 / 权限」三层体系（新增应用时的完整 checklist）**：
1. **应用清单**：`pages/home/index.js` 与 `pages/more-apps/index.js` **两处 `ALL_APPS`**（7 分组，必须同步）。
2. **菜单可见性（按职务）**：两文件各加 `APP_ID_TO_MENU_KEY` 映射；后端
   `TenantSmartFeatureOrchestrator.MINIPROGRAM_MENU_KEYS` + `MENU_KEY_LABELS` 加 key；
   角色 = `admin/supervisor/worker`（key 形如 `miniprogram.menu.xxx.role.worker`），**默认全员可见**，
   租户在 PC 端按职务关闭；过滤规则 `flags[menuKey] !== false`。
3. **功能权限（按钮级）**：`utils/permission.js` 的 `featurePermissions`（`hasFeaturePermission`）。
- [x] D-417 补齐上述三层：后端加 5 个菜单 key；home + more-apps 各加 5 应用项与映射；
      `permission.js` 加 `approve_reconciliation`/`approve_expense`/`approve_payroll`/`handle_exception`，
      4 个页面改用 `hasFeaturePermission('...')`（与借支页 `approve_advance` 规范统一）
- [x] 新增 `pages/collab-task/list/index`（协作任务列表）作为应用入口落地页（详情页需 taskId，不能直接作入口）
- [x] 验证：8 个 JS `node --check` 全 OK；app.json 合法（分包 30）；后端 BUILD SUCCESS

**后端能力约束（重要）**：
- 异常报告（已解决）：原只有 `POST /report`、status 永远停在 PENDING；D-417 已补 `list` + `handle`
- 统一待办：`IntelligenceController` 仅 `GET /pending-tasks/my|summary`，**仍无"标记完成"接口**
- 协作任务：`IntelligenceTaskCenterController`（claim/status/my-tasks）接口齐全 —— 已用
- 协作任务状态用 `CollaborationTask.TaskStatus.valueOf(toUpperCase())` 解析，**前端必须传大写**

---

---

## 最近变更（Latest Changes）

### 2026-10-06 面料料卷「多卷 · 逐卷米数」录入修复（未提交）

- [x] **现象/根因**：`t_material_roll` 数据模型本已支持「一卷一行、各卷 `quantity` 独立」，但录入/生成层只支持"每卷数量相同"——`RollLabelModal` 只有 `rollCount + quantityPerRoll` 两个框，`MaterialRollOrchestrator.generateRolls` 循环里每卷塞同一个值。现实中一批面料必然多卷且各卷米数不同（如 50/48.5/52 米），平均值摊派 → 账面与实际必然对不上
- [x] **后端**：`MaterialRollOrchestrator` 新增 `generateRollsDetailed(inboundId, List<BigDecimal> rollQuantities, unit)`（逐卷明细，校验每卷 >0）；原 `generateRolls` 降级为快捷模式（内部展开为 N 条相同明细后委托）→ 向后兼容
- [x] **后端**：`MaterialRollController.generateRolls` 解析 `rolls:[{quantity}]` 数组，有则走明细模式、无则回退旧的平均模式
- [x] **前端**：`RollLabelModal` 改为 `Form.List` 逐卷可编辑表格（第 N 卷 → 该卷真实数量），含「卷数×每卷」一键填充、逐行删除、添加一卷、合计 N 卷/合计数量展示，以及与入库总量不一致的 warning 提示（只提示不拦截）
- [x] **前端**：`RollGenerateRequest` 增加 `rolls?`；`useInboundFlow` 提交 `rolls` 数组并把 `expectedQuantity` 传入弹窗；打印标签按每卷真实 `quantity` 输出（原有逻辑天然兼容）
- [x] 校验：`mvn -o compile` 通过；`npx tsc --noEmit` 0 错误（本会话未挂载 test-runner-mcp，按 P0 #23 降级用原生命令）
- [ ] 未提交；待用户真机走一遍「入库 → 生成料卷标签 → 打印 → 小程序扫码发料」确认

### 2026-09-14 D-408 图片上传控件「选择文件 未选择任何文件」暴露修复（未提交）
> ⚠️ 原拟编号 D-407 已被并行会话的 /actuator/health 修复（`5208a7db2`）占用，故改用 D-408。

- [x] **现象**：样衣详情「基础信息」Tab 图片区出现裸的原生 `<input type="file">`（浏览器默认「选择文件 未选择任何文件」），用户投诉"图片上传方式被改了"
- [x] **元凶**：D-399（09-14 09:44，`b67229934`）把 25 处 `style={{ display: 'none' }}` 批量迁成 `className="u-d-none"`。
      内联样式特异性不可覆盖，换成单类原子类后，一旦 CSS 未及时加载 / 被同或更高特异性规则压过就会暴露
- [x] **修复**：25 处全部改回内联 `style={{ display: 'none' }}`，涉及 22 个文件（App.tsx / StyleAssets / common 上传盒 /
      StyleInfo 各 Tab / DataImport / 财务报销 / 物料退货 等）；`grep u-d-none --include=*.tsx` 归零
- [x] 校验：`npx tsc --noEmit` 0 错误；`npx eslint <22 文件>` 0 报错
- [ ] 待用户硬刷新 dev（5173）确认「选择文件」消失；如需上线需提交+推送
- ⚠️ 内联基线 6637 → +25（CI `check-inline-style.mjs` 带 `|| true` 不阻断，但日志会显示 ↑25 ❌）
- ⚠️ 并发：`StyleSkuColorImages.tsx` 的那处回退已被 D-406（`f7f00b8f0`，22:54）随"56→80 尺寸对齐"一并提交；
      其余 21 个文件仍在工作区未提交

### 2026-09-14 D-387 生产环节可配置系统（未推送）

- [x] 新表 `t_stage_config`（Flyway `V202609140001`，information_schema 存储过程幂等，tenant_id=NULL 系统层+租户覆盖）：6 环节（采购/裁剪/二次工艺/车缝/尾部/入库）可配置可操作人 / 预计时长(天) / 监控开关；采购/入库 default_stage=1
- [x] 后端：StageConfig Entity/Mapper/Service（按租户 Caffeine 缓存+合并）/Orchestrator（事务在编排层，仅顶级管理员，写租户覆盖层）/Controller（GET 全端读、PUT 管理员存）；StageGatekeeper 门禁接入生产(大货+样衣共用)/质检/入库三条扫码路径
- [x] 撤回权限补管理员例外：ScanRescanHelper 管理员可退任意扫码
- [x] PC 端：StageConfigModal（85vw ResizableModal，操作人下拉复用 /system/user/list）+ 订单管理页「环节配置」入口（主管且非工厂）
- [x] 三端扫码拦截：后端 AccessDenied→GlobalExceptionHandler→小程序/H5 扫码页 toast 统一兜底
- [x] PC 看板环节超期预警：预算天数取 t_stage_config.expectedDays（progressTimeBudget.ts），单环节独立计时、只展示不参与交期
- [x] 小程序/H5 扫码结果面板显示当前环节「预计 N 天」（stageBudget.js 映射父环节+60s缓存 + handleScanSuccess 附加 + res-budget 标签）
- [x] 质量门控：mvn compile✅ 前端 tsc 0 error✅ 小程序 node --check✅ Flyway/实体/多租户审计✅

### 2026-09-12 D-384 指派明细表 + 按人卡额度 + 工资按人计（未推送）

- [x] 新表 `t_pattern_process_assignment`（Flyway `V202709120500`，存储过程幂等模式）：一道工序可指派多人（张三 2 件 / 李四 1 件），各自件数额度 + 单价快照
- [x] 指派接口扩为带工序名/编码，指派时落明细；`GET /{patternId}/assignments` 查询
- [x] **报工按人卡额度**：有指派时 `taskQty = 本人额度`、累计只算本人已报（可一次报完 / 分次报完）；无指派回退矩阵与样板数量（兼容）
- [x] PC「领取人」列改「指派安排」列：显示"张三 2 件、李四 1 件"
- [x] 工资逻辑未改（本就按报工镜像的操作人+件数+单价计），天然支持多人各自计件
- [x] 校验：mvn compile SUCCESS / PC tsc 0 错 / eslint 0 错 / vite build ✓
- [ ] 待回归：指派多人 → 各自报工额度独立 → 超额拦截
- [ ] 手机端报工页显示"我的额度 X 件 / 已报 Y 件"（后端超限提示已有，界面提示后续可加）

### 2026-09-12 D-383 完成数量改为人为输入 + 手机端阶段数按配置（未推送）

- [x] **数量不预设默认值**（用户拍板：一个版多人生产，各人实际件数不同）：
      PC 弹窗每行加数量输入框（默认空、必填才提交）；手机端报工 SKU 数量由 1 → 空，placeholder 改「本次件数」
- [x] **PC 删掉「手动完成」**（不让人填数量）→ 统一为「完成」弹窗（勾选色码 + 手填数量），两端交互一致
- [x] **手机端「进度分母恒为 4」根治**：`buildStages` 算出了 `stageDefs`（实际配置的阶段）却从未使用
      → 改为遍历 `stageDefs`，**PC 配几个阶段手机端就是几个**，与 PC `effectiveStages` 口径一致
- [x] 顺带清掉 `detail/index.js` 3 个历史 unused-vars error
- [x] 校验：PC tsc/eslint/build 全过；小程序 node --check×4 / eslint 0 错 / 四副本 md5 唯一值 1
- [ ] 待回归：PC 完成弹窗填数量；手机端报工数量为空需手填；两端阶段数一致
- [x] 领取（CLAIM）的数量保留预填（只是认领动作，不影响完成数与工资）

### 2026-09-12 D-382 PC 端对齐手机端多色多码（未推送）

- [x] **PC 新增「批量完成」**：一次列出该款式全部色码任务，勾选后并发提交（原需逐个切换色码任务再点完成，20 色码 = 20 次切换 + 20 次点按）
- [x] 弹窗打开时并行拉各色码 scan-records，**已完成色码默认不勾选**（防重复报工 → 防工资重复计件）
- [x] 按钮不受行 `status==='completed'` 限制（整行完成只代表"至少一色完成"，否则其余颜色没入口）
- [x] **PC 能看到颜色维度**：`useSampleProcessProgress` 保留 scan-records 的 color，按「工序+颜色」聚合；状态列多色显示「x/y 色」
- [x] **撤回不再跨颜色误删**：后端 `undo-process` 支持可选 color（重载向后兼容），前端撤回带当前色码
- [x] **修掉坏页面**：`StyleProgressTab` 把 `by-style`（数组）当单对象 → 请求 `undefined` 导致整页空
- [x] 校验：mvn compile SUCCESS / tsc 0 错 / ESLint 0 错 / vite build ✓
- [ ] 待回归：PC 多色批量完成、状态显示 x/y 色、撤回只撤当前色码、款式详情-进度页签有数据
- [ ] **待业务口径确认**：①手动完成数量 PC 取样板数量 vs 手机端 1 件/色码 ②进度分母 PC 动态 vs 手机端固定 4 阶段

### 2026-09-12 D-381 样衣批量扫码接口（外单大单性能，未推送）

- [x] 问题：多色多码报工按「颜色×码数」逐条请求 + `Promise.all`（20 色 × 8 码 = 160 条）→ 慢 +
      每条独立事务会"报了一半"
- [x] 后端新增 `submitScanBatch`（同一事务内循环复用 `submitScan`，行为一致、任一条失败整批回滚）
      + `POST /api/production/pattern/scan-batch`（单条 `/scan` 保留）
- [x] 小程序 `submitPatternScanBatch`；报工（hasSkuList）与多色领取两处都改为 1 条批量请求
- [x] 核实 PC 端不调这两个接口 → 问题仅手机端
- [x] 校验：mvn compile SUCCESS / node --check×4 / ESLint 无新增错误 / 四副本 md5 唯一值 1
- [ ] 待真机回归：多色多码报工一次提交；只填部分行时跳过空行
- [ ] 遗留：批量内部仍是逐条 `submitScan`（每条各查一次该样板扫码记录），组合数再上量级可把校验查询提到循环外

### 2026-09-12 D-380 样衣工序进度「3/1」根因 + 状态按件数判定（手机端，未推送）

- [x] 根因①：分母口径不一致——详情页用 `snapshot.quantity`(=1)，而列表页 D-177 早就用「色码矩阵合计」(=3)
- [x] 根因②：状态判定过宽（`workScans.length > 0` 即 completed）→ 只做 1/3 也显示"已完成"，**阻塞后续报工**
- [x] 新增共享 `parseColorSizeMatrix()` + `resolveSampleTotalQty()`（矩阵合计优先），详情页与列表页同源
- [x] 状态改为按件数：`completedQty >= total` 才 completed；未做满显示「已完成 1/3」/「生产中」
- [x] 四副本同步 + node --check ×4 + md5 唯一值 1 + ESLint 无新增错误
- [ ] 待真机回归：3 色各报工 1 次 → 显示 3/3；只报 1 色 → 显示 1/3 且状态"生产中"
- [ ] **待用户确认（联动）**：列表页显示 3 项工序全 0/3 且卡片"待领取"，详情页 4 项已完成 —— 两页工序数据源不同
      （列表页=款式工序 `listProcesses`，详情页=样板工序 `getPatternProcessConfig`），需确认是否为同一条样板记录

### 2026-09-12 D-379 样衣扫码「多颜色勾选领取」（手机端小程序，未推送）

- [x] 领取表单由「单选颜色 + 单数量」改为**颜色勾选列表**：有几个颜色显示几行，每行勾选框 + 数量输入，可单色也可多色一起领
- [x] 提交按颜色**逐条** CLAIM（每色带自己的数量）；后端幂等钥匙是「工序+颜色」，逐色不短路，**后端零改动**
- [x] 核实 CLAIM 不写工资镜像、不同步库存（`if (!isClaimOperation)`）→ 多色多条不会让工资翻倍
- [x] **修掉阻断性 bug**：工序行「领取」按钮原条件 `status==='PENDING'`，领完第 1 个颜色后按钮消失 → 领不了第 2 个颜色；
      改为 `PENDING || (CLAIMED && 多色)`，文案 `PENDING?'领取':'加领'`；`onClaimProcess` 多色时不再 return
- [x] 四副本同步（js/wxml 整文件覆盖，wxss 只追加）；node --check ×4 / md5 唯一值 1 / WXML 标签栈 / 表达式调方法 0 / eslint 0 error
- [ ] 待真机回归：多色样衣点领取 → 勾选 2 个以上颜色填数量 → 只领勾选的颜色；再点「加领」能继续领剩下的颜色
- [ ] 遗留优化：领取表单未按颜色屏蔽"已被他人领取"的颜色（勾了会被后端拦截并提示，不影响正确性）

### 2026-09-12 ⚠️ 教训：歧义需求必须先确认页面（已进 MEMORY.md）

- 上一轮把「多色多码勾选领取」误解为 **PC 采购按行勾选领取**，在已存在的「批量领取（全部）」上重复造轮子
- 用户原话："批量本来就是默认领取这个款式的所有的面辅料啊 这个本来就是这样的啊" → 全量回退
- **规则**：任务简称有歧义时（本案例"多色多码"在采购域指"多行颜色"，在样衣域指"一件样衣有多个颜色"），
  先报出候选页面/入口请用户点认，再动手；不要只凭简称开工

### 2026-09-11 决策：物料数量小数化 = 暂缓不做（用户拍板）

- 用户答复「不需要（0.01 精度），可能有时候会用到」→ 不做 A（34 文件/89 处 BigDecimal 适配）也不做 C（单位细化）
- 现状已不阻塞：D-368 后「有到货量即可确认完成」，采购 1.32 米、到货 1 米即可结束该单
- 将来若要启用：单位白名单（可细分 vs 计数，未知单位兜底不换算）+ 按单位分别迁移存量 + 显示层换算（详见 decisionLog D-370 补充）
- 绿色改动已按用户要求完整回退（`--color-success` 恢复 #52c41a，3 处硬编码绿字同回退）

### 2026-09-11 D-368 采购按钮全灰根治 + 数量默认预填（已推送）

- [x] 「批量领取▾」三个动作永久灰：判定用状态枚举白名单，状态没推进到白名单就全灰 → 改按业务事实（`arrivedQuantity>0` + 终态排除）
- [x] 大货/节点弹窗同一问题：新增 `isConfirmCompleteAvailable()`，替换 InlinePurchasePanel(2) + usePurchaseReturnActions(2) 的枚举匹配
- [x] 登记到货默认带出「待到货量」并按整数归一（原来回填 0.32 会低于 min=1 直接校验失败）
- [x] 物料出库单批次时自动预填可用量并勾选；多批次保持 0（FIFO 一键分配）
- [x] tsc 0 错误 + vite build 通过
- [ ] 待用户回归：到货后工具栏动作可点；登记到货数量已预填；出库数量已预填

### 2026-09-11 D-367 领取/到货拆两步 + 到货必选去向 + 库位照抄样衣入库（已推送）

- [x] **领取与到货拆开**：领取只认领（去掉数量表单）；大货侧旧实现提交 `arrivedQuantity` 后端根本不读，已统一
- [x] **到货必选去向**：入库到物料仓库（confirm-arrival，写库位/增库存/回流对账）/ 直采使用（confirm-complete direct_use，只记直用流水）
- [x] **仓库+库位选择照抄「样衣入库」范式**：Select + options + 空态提示（上一轮 AutoComplete 点击无反馈是错的）
- [x] 到货数量整数约束如实提示；后端 `parseQuantity` 防 ClassCastException
- [x] tsc 0 错误 + vite build 通过 + mvn compile BUILD SUCCESS
- [ ] 待用户回归：①领取只认领 ②登记到货能选仓库与库位 ③选"直采使用"不进库存 ④大货/样衣一致
- [ ] **下一轮 P0**：`arrived_quantity`/`inbound_quantity` INT→DECIMAL(18,4)（Flyway + 实体 + 全链路），开放小数到货，解决"采购 1.32 米永远差 0.32"

### 2026-09-11 D-366 到货入库弹窗字段/库位修正（已推送）

- [x] 物料信息里的订单码数：弹窗误用 `record.size` 当规格 → 三处改 `record.specifications`
- [x] "已入库/待入库" 标签误导（arrivedQuantity 实为已到货）→ 统一改「已到货/待到货」
- [x] 到货入库库位改真实物料库位：物料仓库下拉（MATERIAL）+ `WarehouseLocationAutoComplete`，样衣与大货节点弹窗同步
- [x] 大货节点弹窗到货数量改支持小数（原 precision=0 只收整数）
- [ ] **D-366b 待实施**：领取与到货拆两个按钮；到货时选去向（入库到物料仓库选库位 / 直采使用）；大货样衣一致（约 8 文件，需本地启动验证）
- [ ] 待用户回归：弹窗无码数、标签正确、库位可选

### 2026-09-11 D-365 采购单款式图兜底 + 标题主次（已推送）

- [x] **仍无图的真根因**：弹窗有图是 `StyleCoverThumb` 组件自己按「颜色图→附件第一张」兜底拉的，数据层 `styleCover` 本就为空；打印新窗口无组件 → 必然空白。修复：打印弹窗内置同一条兜底链 + token 包装
- [x] 兜底异步 → 加载中打印/下载按钮 loading；一键下载等图就绪再执行
- [x] `usePurchaseDetailData` 封面字段三兜底（cover / styleCover / coverImage）
- [x] **标题主次**：第一行公司名（18px 加粗）+ 第二行单据名（14px），按来源区分「样衣开发采购单 / 大货采购单 / 物料采购单」，两套模板统一
- [x] tsc 0 错误 + lint 0
- [ ] 待用户回归：打印/预览有款式图；标题两行主次正确
- [ ] 遗留：大货模板图片来源未加款号兜底（后端 fillStyleCover 已回填）

### 2026-09-11 D-364 样衣采购弹窗款式信息头 + 打印单来源/款式图修复（已推送）

- [x] **样衣采购弹窗缺款式信息**：样衣无生产订单 → 走 `!order` 分支只有简陋横条；改为与大货同样渲染 `ProductionOrderHeader`（图160+款号款名+颜色+码数矩阵）+ 来源/采购单数/到货率/BOM状态四列
- [x] **样衣打印无款式图（两因）**：①无 styleId 的入口从不查款式 → 新增按 styleNo 查 `/style/info/list` 兜底回填；②打印窗口图片 URL 无 token → 统一 `getFullAuthedFileUrl`
- [x] **打印"工厂：-"**：无工厂时标签改「来源」，值=样衣(开发)/大货/批量（打印模板+页内预览两处）
- [x] 废弃 worktree 分支 `agents/miniapp-homepage-click-issue`（28 文件冲突、落后 1344 提交、仅本地）
- [x] tsc 0 错误 + lint 0
- [ ] 待用户回归：样衣采购弹窗顶部有款式图与信息；打印单显示款式图 + 来源为「样衣(开发)」

### 2026-09-11 D-363 每日流水 + 财务总览数据链路四项修复（已推送，CI 待验证）

**用户反馈**：每日流水出现一批"生产扫码-采购"（18:45 同一时刻 12 条、金额全"—"）；采购流水进不了财务总览；数据链路没打通。

- [x] **P0 编排记录混入流水**：`DailyFlowOrchestrator.queryScan` 排除 scanType=orchestration + 系统阶段名（下单/采购/物料采购等），NULL 阶段视为真实记录保留
- [x] **P0 采购记录时间漂移**：`upsertStageScanRecord` UPDATE 不再覆盖 scanTime；`ensureProcurementRecord` 时间锚点改订单 createTime；新增 `correctStageRecordTimeIfDrifted()` 幂等自愈存量
- [x] **P1 财务总览口径**：新增 `materialPending`（pending/verified 对账金额）；前端新增「待审批物料」卡 + 明细口径说明 + 跳物料对账页
- [x] 核实无需改动：一次出库 5 单（D-360n 已修增量）/ 232,800=单价×本行数量非虚增 / 入库 3 条 22.00=3 个菲号正常
- [x] mvn compile BUILD SUCCESS + tsc 0 错误 + safe-push 全过
- [ ] 待用户回归：①每日流水不再出现"生产扫码-采购" ②总览出现「待审批物料」卡 ③订单时间轴采购节点时间恢复为下单时间

### 2026-09-11 D-360n 一次出库一个出库单（明细多行）+ 调拨出库回入库

- [x] `ProductOutstock` 加 `transferInboundStatus` 字段 + 迁移 `V202709110100`（INBOUND=已回入，调入方确认收货）
- [x] `FinishedOutstockHelper` 一次出库生成一个出库单、明细多行；`FinishedInventoryOrchestrator` 同步
- [x] PC 出库记录 Tab 支持展示回入库状态（index/columns/types 三文件）
- [x] CI success（34587910760）；[ ] 待用户回归：调拨出库→调入方确认→回入库闭环

### 2026-09-11 D-360m 入库记录按款号精确匹配（H001 混入 HH001/HH0013 根治）

- [x] `ProductWarehousingServiceImpl` 查询由 `.like` 改 `.eq`（orderNo / styleNo）——模糊匹配把包含 H001 的款号全部捞进来
- [x] 影响面：入库记录弹窗 / 质检入库列表按款号筛选，标题与明细口径一致
- [ ] 待用户回归：H001 入库记录不再出现 HH001/HH0013

### 2026-09-11 D-360l 成品资料 405 修复 + 误标直发记录退回

- [x] `ProductWarehousingController` 补缺失端点（405 根因）；`ProductWarehousingOrchestrator` 加误标直发记录的退回能力
- [x] `useProductInfoData` / `FinishedInventory/index.tsx` 前端同步
- [ ] 待用户回归：成品资料页不再 405；误标直发记录可退回

### 2026-09-11 D-360k 质检直发接入完整销售出库流程 + 物料入库库位必填

- [x] `FinishedOutstockHelper` 直发走完整销售出库；入库记录补款式图/订单号/生产方三列
- [x] 物料入库库位改必填（`useInboundModal` + `WarehousingActionPanel`）
- [ ] 待用户回归：质检直发后出库单/库存扣减正确

### 2026-09-11 D-360j 入库记录弹窗款式图兜底

- [x] `InspectionDetail/StyleInfoCard` 改用 `StyleCoverThumb` 按款号拉图（原无图时空白）

### 2026-09-11 D-360i（仓库组）质检直发客户 + 入库记录工厂列

- [x] `ProductWarehousingOrchestrator` 补直发客户字段与工厂列（+68 行），PC `WarehousingList` 显示

### 2026-09-11 D-360h（采购闭环组）到货后入库/出库闭环补齐

- [x] 「确认完成」统一接物料去向选择；`MaterialInboundOrchestrator` +72 行；存量补录
- [x] `useInboundModal` / `MaterialPurchaseDetail` / `usePurchaseReturnActions` 前端同步
- [ ] 待用户回归：到货→确认完成→入库/出库分流，存量数据可补录

### 2026-09-11 D-360g（采购矩阵组）节点弹窗双矩阵修复 + 码数合并脏数据防御

- [x] `InlinePurchasePanel.helpers` + `OrderColorSizeMatrix` 防御码数合并串脏数据

### 2026-09-11 D-360i 样衣开发节点弹窗统一加款式信息头

- [x] `StyleStageDrawer`（纸样开发/二次工艺/物料采购/样衣生产/审核入库 全部节点）顶部新增款式信息卡：款式图(140px) + 款号/款名/颜色/下单数量 + 码数矩阵（含总下单数），复用 `ProductionOrderHeader`（showOrderNo=false），与采购详情弹窗完全同款布局
- [x] 数据源：selectedStage.record（styleNo/styleName/color/size/sampleQuantity/cover/id），无码数时自动隐藏矩阵
- [x] tsc 0 errors
- [ ] 待用户回归：各节点抽屉顶部均见款式图与信息卡

### 2026-09-11 D-360h 所有"选用物料编码"弹窗统一为 50% 侧滑抽屉

- [x] `StyleBomMaterialModal`（样衣开发详情页 BOM 选用）：裸 Drawer → 统一 SideDrawer 50%，并移除无用 modalWidth 传参（StyleBomTab 同步清理）
- [x] `MaterialPurchaseDetail/components/MaterialSelectModal`（样衣采购编辑）：ResizableModal 60vw → SideDrawer 50%
- [x] `MaterialPurchase/components/PurchaseModal/components/MaterialSelectModal`（大货采购编辑）：ResizableModal 85vw → SideDrawer 50%
- [x] `NodeDetailModal/MaterialPickerModal`（节点物料选用）：ResizableModal 60vw → SideDrawer 50%
- [x] `Cutting/components/CuttingBomMaterialModal`（裁剪节点物料选用）：ResizableModal 85vw → SideDrawer 50%
- [x] 全库仅 6 处「面辅料选择」渲染，5 组件全部统一用公共 SideDrawer（width="50%"），与采购单据抽屉同款；tsc 0 errors
- [x] 已排除非选用弹窗：MaterialPickupModal（领料数量确认）、InstructionModal（下发采购指令表单）、MaterialFormDrawer（物料档案编辑）、InboundDrawer（入库）等保持原样
- [ ] 待用户回归：各入口点"选用物料"弹窗均为右侧 50% 侧滑

### 2026-09-11 D-360g 大货采购弹窗按样衣统一

- [x] **A1** `PurchaseModal/index.tsx`：移除 Drawer 顶部散落按钮（getViewHeader 残留引用一并删除），view 模式 footer 只留「关闭」；透传打印 props 给 `PurchaseDetailView`
- [x] **A2** `PurchaseDetailView.tsx`：Card 操作区改用统一 `PurchaseActionBar`（批量领取▾/编辑面辅料/打印下载采购单/采购单据/采购退货全在一行，完成回料收进主按钮下拉）；「上传采购单」弹窗 + 历史卡片合并为「采购单据」50% 侧滑抽屉（`PurchaseDocDrawer`）；编辑态改 `PurchaseEditActions`
- [x] **B1** `buildPurchaseSheetHtml` 款式图回退 `currentPurchase?.styleCover`（后端 fillStyleCover 填充），修复大货打印无款式图
- [x] **B2** `usePurchaseDetail.loadDetailByOrderNo`：orderDetails 为空时按款号查 StyleInfo.sizeColorConfig 解析颜色×码数矩阵兜底 + cover 兜底，修复"有颜色、数量码数都没有"
- [x] **B3** `PurchasePrintModal` 支持 `orderLines` prop，矩阵优先 orderLines
- [x] **B4/B5** 样衣采购页生成 `sampleOrderLines`（款式 sizeColorConfig → 样衣生产 sizeColorMatrix 兜底）传给打印弹窗
- [x] 验证：`npx tsc --noEmit` 0 errors
- [ ] 待用户回归：大货弹窗按钮一行布局；打印采购单款式图+码数矩阵；样衣采购单矩阵显示

---

### 2026-09-10 D-333 主题"黑白块"+弹出层文字不可见根修

- [x] **根因**：design-system.css 暗色令牌挂 OS 媒体查询（prefers-color-scheme）而非 data-theme → OS 深色+应用浅色=浅底白字（弹出层文字不可见），OS 浅色+应用暗色=暗页白块
- [x] **修复**：媒体查询收紧 `:root:not([data-theme])` + 新增 `:root[data-theme="dark"]` 令牌块（不碰 global.css 已掌管的4个变量）；dark-theme-global.css 45处/AppProviders 18处"底色令牌反当文字色"地雷同扫；global.css 暗色 --neutral-text 改直值
- [x] **验证**：Playwright colorScheme×主题 4 组合全 PASS（令牌翻转/弹出层对比度/预警面板）；1280/1920/2560 三档分辨率零溢出
- [ ] 待用户回归：任意 OS 外观下切四主题不再出现黑白块；折叠侧边栏悬停弹出层文字可见

---

### 2026-09-10 D-331 委派人员空列表根修 + 卡片工整化

- [x] **修复**：`useNodeDetailData.loadUsers` 传 `status:'enabled'` 而库内是 `'active'`（恒空）+ `/system/user/list` 仅主管及以上可拉 → 照 StaffSelect 双路径（超管全量接口 / 非超管租户子账号接口）
- [x] **UI**：BundleDelegatePanel/QcTabContent 菲号卡片统一放大一档（160→180px、标题14、正文12），委派面板底部操作收进浅底操作条、选择器定宽 130/260
- [ ] 待用户回归：委派人员下拉能出人；卡片字号/操作条布局验收

---

### 2026-09-09 工序质检看板菲号改卡片网格（与外发委派同尺寸，Playwright 实测）

- [x] **需求**：工序质检看板的菲号列表从「一行一条」改成与外发委派面板同尺寸的卡片网格；单条质检 + 全选/全选此工序的选择逻辑不变
- [x] 改造 `QcTabContent`：记录容器 `flex column` → `grid repeat(auto-fill, minmax(160px,1fr))` + gap 8 + padding 8；卡片改为 `#N / 颜色 / 尺码 / 件数×单价 | 操作人` + 勾选框 + 全宽操作按钮（质检/复检/锁定/返修完成/手动解锁）
- [x] 保留：分组头（阶段 Tag + 工序名 + N 条菲号 + 全选此工序）、顶部筛选/搜索/全选/批量合格/批量不合格
- [x] 实测（Playwright）：`PO20260401002` 看板 → 网格 8 列、卡片宽 164px、26 张卡；首卡文案 `#1 白色 / M 30件 × ¥0.8 | 最美服装工厂管理员 质检`
- 验证：tsc 0 error、eslint 0 error
- 说明：为截图验证临时把 PO20260401002 改 production（已还原 completed）；工序跟进列表默认只显示生产中订单

### 2026-09-09 菲号委派支持多子工序 + 按工序精细隔离（Flyway + 双向守卫，Playwright 实测）

- [x] **需求**：父节点下有多个子工序时，一次勾选多个子工序委派给外发工厂；委派后**按工序精细隔离**（内部只能扫未委派工序、外发只能扫委派工序）；逐工序列出单价
- [x] **迁移**：`V202709090300__add_delegate_processes_to_cutting_bundle.sql`（INFORMATION_SCHEMA 幂等写法）新增 `delegate_processes VARCHAR(500)`，逗号分隔工序名；为空 = 整扎外发（兼容历史数据）
- [x] **后端**：
  - Entity + `getByQrCode`/`getByBundleNo`/`queryPage` 的 select 补 `delegateProcesses`
  - `bundle-delegate` 接收 `processNames[]`，归一化（去空/去重/保序、截断 500）后写入每个菲号；委派历史带「（工序：X,Y）」
  - 守卫改为**双向按工序判断**：`ScanRecordOrchestrator.validateBundleBelonging(bundle,ctx,process)` + `ScanExecutorSupport.validateBundleFactoryAccess(bundle,stage,process)`
    - 内部扫已委派工序 → 403；扫未委派工序 → 放行
    - 外发扫已委派且本厂承做 → 放行；扫未委派工序 → 403
  - 工序名取 `processName` 优先、`progressStage` 兜底；无法识别时按「已委派」保守处理（优先防重复计件）
- [x] **前端**：委派面板新增「外发工序」多选（选项 label 带单价，如 `04 整烫剪线包装 · ¥1.00/件`），选中后逐工序列出单价；菲号卡片显示「工序：X、Y」
- [x] **实测（Playwright + 真实接口）**：
  - 委派 `processNames=['整件']` → DB `delegate_processes='整件'` ✅
  - 内部扫「整件」→ 403「该菲号「整件」工序已委派外发工厂，内部不可扫码」；内部扫「绣花」→ 200 ✅
  - 外发扫「整件」→ 200；外发扫「绣花」→ 403「该菲号「绣花」工序未委派给本厂」✅
  - UI：多选下拉选项带单价；卡片显示「工序：上袖埋夹、下脚卷边」✅
- 验证：mvn compile / tsc / eslint 全绿；测试数据全部还原（订单状态、node_operations 委派历史、菲号字段、扫码记录）
- 坑：委派 API 的 `nodeName` 若命中该菲号已有扫码记录的 `progressStage/processName`，会被「已完成当前工序，不可委派」拦截；E2E 需用不冲突的节点名

### 2026-09-09 工序跟进页「看板（工序质检）」404 + 同步任务误停 双修复（Playwright 实测）

- [x] **404 根因**：`OrderOperationLogSection` 调用 `api.get('/api/order/operation-log/list')`，而 axios 客户端 `baseURL` 已经是 `/api`（`core.ts:37/39`）→ 实际请求 `/api/api/order/operation-log/list` → 404。其余同类调用（`/system/operation-log/list`）都没带 `/api` 前缀
- [x] 修复：改为 `/order/operation-log/list`；顺手把该组件硬编码颜色（`#fff`/`#f0f0f0`/`#8c8c8c`）换成 Design Token
- [x] **同步任务误停根因**：`useOrderSync` 的 `fetchFn` 是副作用型（内部各自 setState），却 `return null`；`syncManager` 把 `null` 视为「本次拉取无效」（`syncManager.ts:187-195`），连续 3 次 → `progress-detail-order` 任务被自动停止
- [x] 修复：正常/跳过路径返回 `{ ok: true }` / `{ skipped: true }`，只有真异常才返回 `null` 交给失败闸门
- [x] 实测（Playwright）：点「看板」打开工序质检看板 → 失败请求 0 条（修复前 `404 GET /api/api/order/operation-log/list` ×2）；控制台不再出现「返回空数据」告警
- 验证：tsc 0 error、eslint 0 error

### 2026-09-09 工序委派面板可读性优化：裁剪数量配色（Playwright 实测）

- [x] **问题**：裁剪数量条用绿色底 + 绿色字，且底色是硬编码 `rgba(34, 197, 94, 0.15)`（违反 Design Token 规范），在弹窗里辨识度低
- [x] **修复**：容器改中性底 `var(--color-bg-container)` + `var(--color-border)` 边框；尺码与总计改蓝色 `var(--color-primary)`；「裁剪数量：」用正文色 `var(--color-text-primary)`；订单信息条数值同样改正文色
- [x] 间距对齐规范：`8px 10px` → `8px 12px`、`marginBottom 6` → `8`（8 的倍数）
- [x] 实测：Playwright 打开 PO20260401002 车缝节点详情截图确认（中性底 + 蓝色数值，清晰可读）
- 说明：为截图验证临时把 PO20260401002 改 production（已还原 completed）

### 2026-09-09 补全菲号级守卫：阻止扫码 + 拆菲范围（Playwright 实测）

- [x] **根因（与上一条同类）**：`getByQrCode`/`getByBundleNo` 的 select 白名单还漏 `scanBlocked`、`splitProcessOrder` → `ScanExecutorSupport.validateBundleNotBlocked`（生产/质检/入库三个执行器都调用）与 `ProductionScanExecutor.validateSplitGuard` 恒提前 return，形同虚设
- [x] 补选字段后守卫立即生效，实测三项：
  - **阻止扫码**：`scan_blocked=1` → 400「该菲号已被阻止扫码，无法继续生产。请在工序看板中解除阻止后重试」
  - **拆菲当次工序**：`split_parent` + 当前工序 tracking 置 `split_archived` → 扫该工序 400「该菲号在「整件」工序已拆分，请扫描子菲号」
  - **拆菲后续工序**：同一父菲号扫「烫画」→ 200 操作成功（父菲号在后续工序仍活跃）
- [x] **语义确认**（与用户口径一致）：`persistTrackingAndScans` 只归档 `processOrder <= 当前工序` 的跟踪（`order > currentOrder` 直接 continue），`archiveSourceBundle` 不改 `status` → **只拆解这次工序，后续工序继续扫主菲号**
- [x] **边界确认**：拆菲入口 H5 `BundleSplitPage` 的 `HIDDEN_STAGES = ['裁剪','采购','质检入库','质检','入库']` 已排除质检/入库，拆菲只会发生在生产工序 → 守卫只需在生产执行器，无遗漏
- [x] **手机端链路确认**：发起 `/split-transfer/request` → 待我确认 `/split-transfer/pending-for-me` → 对方接受 `/split-transfer/confirm`（另有 `/split-transfer` 直接拆、`/split-rollback` 撤回）
- 注意：真实客户端发送的 `processName` 是**裸工序名**（如 `整件`），`02 整件` 只是 label；守卫按裸名比对才有效
- 验证：mvn compile 通过；测试数据全部还原（订单状态/菲号字段/tracking 状态/扫码记录）

### 2026-09-09 工序委派「两处入口」合并为一个卡片（Playwright 实测）

- [x] **问题**：节点详情弹窗「工序委派」页签里，顶部网格表格（生产节点/当前状态/工序编号/工序名称/数量/委派类型/执行工厂/委派人员/委派单价/委派时间/操作 + 保存）与下方「菲号委派」面板是**同一套委派逻辑的两个入口**；有菲号时顶部整行全是禁用态，纯重复
- [x] **改造**：有菲号 → 顶部网格整体收起，节点只读信息（节点/状态/工序/单价/上次委派）作为 `nodeInfo` 并入「菲号委派」卡片头部；委派操作只保留一处（勾菲号 → 选工厂/人员 → 保存委派）
- [x] 无菲号订单 → 保留原节点级委派网格（委派类型/执行工厂/委派人员 + 保存），逻辑不变
- [x] Alert 文案随场景切换：有菲号「勾选菲号 → 选择执行工厂 → 保存委派（内部不再重复计件）」；无菲号「可以为不同的生产节点指定执行工厂」
- [x] **实机验证**（Playwright + 本地 Docker 栈）：`PO20260401002`（40 菲号）→ 卡片头显示「车缝 · 当前 完成 · 工序 01 上袖埋夹 · 委派单价 ¥0.80/件」，顶部表格消失；`PO20260502001`（无菲号）→ 原网格 11 列 + 保存按钮正常
- 验证：tsc 0 error、eslint 0 error
- 备注：`BundleDelegatePanel` 新增可选 `nodeInfo?: ReactNode`，不影响其他调用方；本地调试临时把 PO20260401002 改 production（已还原 completed）

### 2026-09-09 委派闭环根治：菲号级工厂守卫失效（getByQrCode 漏选 factoryId）+ 顶部手工补录关闭（Playwright 双账号实测）

- [x] **根因（既有 bug，非本次引入）**：`CuttingBundleServiceImpl.getByQrCode/getByBundleNo` 的 `.select(...)` 白名单**不含 factoryId/factoryName** → `ctx.bundle.getFactoryId()` 恒为 null → 执行器 `ScanExecutorSupport.validateBundleFactoryAccess` 与 Orchestrator `validateBundleBelonging` 全部提前 return → **菲号委派外发后内部仍可扫码，导致与外发工厂重复计件**
- [x] 修复1：`getByQrCode`（主查询 + `|SIG-` 兜底）、`getByBundleNo` 补选 `factoryId/factoryName`
- [x] 修复2：`ScanRecordOrchestrator.validateBundleBelonging` 对内部账号（factoryId 为空）也拦截；`executeProductionScan` 新增菲号级校验（此前只有质检/入库有）
- [x] 修复3：`validateOrderBelonging` 增加 `CuttingBundle` 参数，支持「部分转单」——订单仍是内部单，但该菲号已委派给当前外发账号 → 放行（否则外发工厂扫不了自己承做的菲号）
- [x] 修复4（前端）：`NodeSettingsTab` 有菲号时禁用顶部「数量 + 保存」并加 Tooltip，堵住手工补录旁路
- [x] **端到端实测**（Playwright + 真实 Docker 栈）：外发账号 `factory_meimei` 扫委派给自己的菲号 → 200 操作成功；内部账号 `lilb` 扫同一菲号 → 403「该菲号已委派外发工厂，内部不可扫码，请由外发工厂操作」✅
- 验证：后端 mvn compile 通过、前端 tsc 0 error、eslint 0 error
- 数据还原：PO20260401001 status→completed、菲号 12 factory_id/factory_name→NULL、E2E 扫码记录已删
- 备注：`isAdminRole` 用中文角色名匹配（ADMIN/manager/supervisor/主管/管理员），`lilb`「全能管理」不命中故走守卫；「生产主管」会旁路
- **遗留（本次未改，待评估）**：同一 select 白名单还漏 `scanBlocked`、`splitProcessOrder` → `validateBundleNotBlocked` / `validateSplitGuard` 同样恒提前返回

### 2026-09-09 打印菲号/裁剪单抽屉化 + 打印人修复 + 工序委派菲号卡片化（Playwright 实测）

- [x] **两个打印弹窗统一改侧滑抽屉**：CuttingPrintPreviewModal（打印菲号）、CuttingSheetPrintModal（打印裁剪单）由 ResizableModal → SideDrawer；实测 drawerCount=1、modalCount=0
- [x] **裁剪单打印人一直为「-」根治**：`CuttingSheetPrintModal` 组件**没有把 `printerName` 传给 `useCuttingSheetPrint`**（hook 里解构了但组件漏传）→ 永远走 `|| '-'`。已补传；CuttingModals 取值加 `username` 兜底。实测打印 HTML footer = `打印人：李老板  2026-09-09 22:31:08`（打印人与时间同行）
- [x] **工序委派菲号改卡片网格**：BundleDelegatePanel 由「一行一个」改为 `repeat(auto-fill, minmax(160px,1fr))` 多列卡片（每行 7 个），卡片含 菲号/颜色/尺码/数量·状态/委派，点卡片即勾选；顶部实时显示「已选 N 扎 · M 件 / 可选 X 扎」
- 验证：tsc 0 error、eslint 0 error、vite build 成功；本地实测截图确认三处
- 备注：本地调试时临时把 PO20260401002 状态改为 production 以打开节点详情（已还原 completed）

### 2026-09-09 裁剪明细页「退回」后白屏修复（Playwright 实测）

- [x] 根因：CuttingEntryView 的「退回」→ `handleRollbackActive` 回调里调 `resetActiveTask()`（**未传 clearRoute**）→ activeTask 清空但 URL 仍停在 `/production/cutting/task/:orderNo`，`isEntryPage` 仍为 true → 两个渲染分支都不命中 → 白屏
- [x] 修复：回调改 `resetActiveTask(true)`，退回后同步回到列表路由
- [x] 兜底：新增 `taskResolving` 状态 + `isEntryPage && !activeTask` 分支——解析中显示 Spin，解析完仍无任务显示「未找到裁剪任务」+ 返回按钮，杜绝白屏
- [x] 实测：明细页点返回 → URL 变 `/production/cutting`、列表 24 条正常渲染；不存在订单的明细页显示空状态而非白屏
- 说明：本地该订单已有扫码记录，「退回」按钮被禁用，故用同一函数 `resetActiveTask(true)` 的「返回」按钮验证跳转路径

### 2026-09-09 P0 裁剪扎号列表按字符串排序（1,10,11,…,2,3）修复

- [x] 根因：`t_cutting_bundle.bundle_no` 在库中是 **varchar(100)**，`ORDER BY bundle_no` 按字符串排 → 列表出现 1,10,11,12,13,14,15,2,3；`resolveNextBundleIndex` 取字符串最大值也会拿到 "9" → 追加生成时扎号与既有号段冲突
- [x] 修复（查询层，不动表结构/数据）：5 处 `bundle_no` 排序统一改为 `ORDER BY CAST(bundle_no AS UNSIGNED)`——列表、下一扎号、颜色尺码汇总、订单流转裁剪明细、Orchestrator 查询
- [x] 端到端实测：追加生成 6 个菲号后 `GET /api/production/cutting/list` 返回 `bundleNo=[1..11]` 数值序 ✅，且新一批乱序输入仍排成 XS→S→M→L→XL ✅
- 说明：选查询层 CAST 而非改列类型，避免云端非数字脏数据导致 ALTER 失败引发启动事故

### 2026-09-09 P0 裁剪菲号乱序根治：后端 compareSizeAsc 不认复合码（jshell 实测）

- [x] 根因：`ProductionOrderUtils.parseSizeKey` 只认纯字母码（`switch(s)` 精确匹配 XS/S/M/L/XL + `^X{0,4}S$` 正则），而实际尺码是 `XS(155/80A)` / `L(165/92)` 这类**复合码** → 全部落 `default -> 0` → `compareSizeAsc` 恒返回 0 → `buildBundleList` 的排序形同未执行（稳定排序保留入参顺序），菲号按来源顺序乱排（L,M,S,S,S,XL,XS,XS,XS）
- [x] 修复：`parseSizeKey` 先剥离括号（半角/全角）取括号前字母码再排序
- [x] jshell 实测：`[L(165/92),M(165/88A),S×3,XL(170/96),XS×3]` 排序后 = `XS×3 → S×3 → M → L → XL` ✅
- [x] **端到端实测**（本地后端重启后调真实接口）：`POST /api/production/cutting/receive` 传入乱序 `L,M,S,XL,XS` → 落库 `bundle_no` 1=XS / 2=S / 3=M / 4=L / 5=XL ✅
- [x] 已推送并部署（CI run 34354812623 success）；用户 21:09 复测失败是因为当时部署还在跑（云端仍是旧比较器，旧逻辑退化为字母序 L,M,S,XL,XS）
- 影响面：`buildBundleList`（PC/小程序/样衣所有生成路径最终都走后端排序）+ `OrderShareHelper`
- 说明：已生成的历史菲号不会自动重排（扎号被扫码记录引用），需删除后重新分菲；新生成即刻生效

### 2026-09-09 工序弹窗残留「字段配置」改造为通用「显示字段」抽屉（Playwright 实测）

- [x] 根因：ProcessTrackingTable（节点详情弹窗→工序跟踪 tab）仍留着旧的 `<a>` 跳转 `paths.fieldConfig?bizType=scan`，未跟随 D-322/D-323 全站统一
- [x] 改造：接入 `useColumnSettings` + `ColumnSettingsDrawer`（pageKey=process-tracking-list），11 列分 3 组（基本信息/扫码信息/单价结算）+ 精简/标准预设，用户只挑显隐；删除旧跳转链接
- [x] 实机验证（Playwright 登录 lilb）：弹窗内 `字段配置` 已消失、`显示字段` 抽屉正常打开（已选 11/11、分组+预设渲染正常）
- 说明：节点详情弹窗实际是 Drawer（不是 Modal），验证时按 `.ant-drawer` 定位
- 验证：tsc 0 error + eslint 0 error + vite build 成功

### 2026-09-09 订单详情页全 Tab 实机回归 + 收尾（Playwright 实测，待推送）

- [x] **实机验证**：本地 Docker(MySQL 3308/Redis) + 后端 8088 + 前端，Playwright 登录 lilb/东方制衣厂 实测 8 个 Tab
- [x] 资料详情子页签内容可见（innerPaneH=118，非 0）；8 个 Tab 全部有内容
- [x] 横向滚动：概览/下单明细/裁剪/工序 sw==cw；二次工艺表 sw 1600→1277 已消除
- [x] 二次工艺消除横滚：新增 `fitWidth` prop → `tableLayout="auto"` + `scroll={{}}`（fixed 布局下列宽和 > 容器仍会撑开，必须用 auto 让浏览器压缩列宽；序号列硬编码 fixed:left 会让 ResizableTable 自动补 x:'max-content'）
- [x] 码数矩阵 S→M→L→XL 升序（实测）
- [x] 图片再缩：180→150；分区内边距 16/20→12/16，标题下间距 12→8（信息卡 565→529，表格区 203→239）
- 坑：Vite 对外置盘（/Volumes/macoo2）文件监听失效，改完不生效，需重启 dev server 才能验证

### 2026-09-09 紧急修复：订单详情页「资料详情」整块空白（CSS 选择器事故）

- [x] 根因：上一版 Tab 填充用了**后代选择器** `.order-flow-tabs-card .ant-tabs-content-holder{flex:1 1 0}`，连带命中「资料详情」内嵌的子 Tabs（大货纸样/尺寸表/工艺说明/二次工艺），flex-basis:0 在非定高父容器中把子页签高度塌成 0 → 整块空白
- [x] 修复：全部改为**直接子选择器** `> .ant-card-body > .ant-tabs > ...`，并删除 `.ant-tabs-content/.ant-tabs-tabpane{height:100%}` 连带规则
- [x] 教训：全局/局部 flex 填充样式必须用子选择器限定层级，禁止用后代选择器命中可嵌套组件（Tabs/Collapse/Dropdown）
- 验证：vite build 成功；本地后端未启动，需前端硬刷新回归「资料详情」四个子页签

### 2026-09-09 订单详情页：图片缩小 + 码数全系统升序 + Tab 表格铺满/去横滚（已推送 96917a325）

- [x] **码数排序全系统统一**：OrderColorSizeMatrix.createSizeOrder 改用权威 `sortSizeNames`（此前用后端插入顺序，矩阵出现 XS/M/L/XL/S 乱序）；OrderFlow 下单明细(computeOrderLines)、裁剪明细(computeCuttingSizeItems)、面辅料"尺码用量"map、NodeDetailModal.computeCuttingSizeItems 全部按颜色+码数升序
- [x] **图片缩小**：OrderImageManager 新增 `imageHeight` prop（默认 280），订单详情传 180；头部图片列宽 260→200px
- [x] **Tab 表格铺满、页面不再整体滚动**：`.page-layout-body > .order-flow-tabs-card` 及 card-body/tabs/content-holder 全链路 flex 撑满剩余高度，表格 fillScrollY 正常测算，底部留白由表格区域铺满
- [x] **去掉强制横向滚动**：OrderFlow 各 Tab 表格移除 `scroll={{ x: ... }}`（概览/下单明细/裁剪/面辅料/工序），改由 tableLayout fixed 自适应容器宽度
- 验证：npx tsc --noEmit 0 error + eslint 0 error + vite build 成功
- 注意：本地后端/MySQL 未启动，未做实时页面渲染验证，需前端硬刷新回归

### 2026-09-09 订单详情页（OrderFlow）布局重排 + 去重（已推送 63334e2a6）

- [x] 信息卡片由"四列挤一行"改为**上/中/下三段式**（段间分隔线 + 主色竖条小标题）：① 图片+基本信息 ② 颜色/尺码/商品编码 ③ 生产统计+计划与时间
- [x] 基本信息/生产统计/计划与时间改双列 Descriptions，卡片内边距 var(--spacing-md/lg)，992px 断点单列回退
- [x] 删除 FlowStepRenderer 卡片右上角与页面标题栏完全重复的"编辑/完成编辑/取消"按钮组，并清理连带未使用的 props（onStartEdit/onFinishEdit/onCancelEdit）与 import
- [x] 删除 index.tsx 标题栏与"基本信息"表格重复的"订单号/款号"Tag（数据仍完整保留在基本信息区，款号仍可编辑）
- [x] OrderImageManager 图片标题长文案"共 N 张（含封面）（含款式图 M 张）"精简为"N 张"，明细收进 Tooltip
- 核实结论：基本信息/颜色尺码/生产统计/计划与时间四个分区标题互不重复；概览(stage 表)与操作记录(时间线)内容不同，无需合并
- 验证：npx tsc --noEmit 0 error + eslint 0 error + vite build 成功；pre-push safe-push 3/3 通过

### 2026-09-09 D-324 商品下单"数据分析全0"修复（已推送，待部署回归）

- [x] 根因：工厂账号(factoryId非空)被整体返回空VO + SQL异常被try-catch吞成假0 + 前端无catch静默渲染
- [x] 修复：工厂账号改factory_id隔离看本厂分析；移除静默吞错让异常显式上报；前端错误态+重试按钮
- [x] 延期口径对齐：useSmartFilter 排除已完成款（此前卡片0/智能提示16打架）
- [x] getAnalytics 加口径日志(tenantId/factoryScope/orderCount)便于远程排查

### 2026-09-09 D-323 全站字段配置统一（已推送，待部署回归）

- [x] 通用 useColumnSettings 加 applyValues（一键预设整套套用，只发一次持久化）
- [x] 款式管理：三组字段+精简/标准/完整预设，"列设置+字段配置"双按钮合一"显示字段"，customFields 按 ext_ 显隐过滤下发三视图
- [x] 客户订单管理：新增显示字段抽屉（pageKey=customer-order-list），"字段配置"跳转改开抽屉，ext 纳入管控
- [x] 供应商 FactoryList/客户管理 Tab：摘除"字段配置"跳转（SchemaTable 内置显隐够用），SchemaTable 按钮"列设置"→"显示字段"文案全站统一
- [x] 外发扫码：新增显示字段抽屉（pageKey=external-scan-list），基础列+ext 统一 visibleColumns 过滤
- 生产订单页 D-322 已统一；系统设置→字段配置 引擎页保留给管理员

### 2026-09-09 D-322 字段配置预设化（已推送，待部署回归）

- [x] 订单管理"字段配置"+"列设置"双按钮合并为"显示字段"单一入口，打开升级版 ColumnSettingsDrawer
- [x] 抽屉升级（通用组件向后兼容）：四组字段分组+精简/标准/完整一键预设（命中高亮/自定义Tag）+自定义字段带标记
- [x] 偏好上云：useColumnSettings 接 t_user_preference（接口早就有前端没接），防抖PUT+localStorage缓存，换设备生效
- [x] 自定义字段（ext_）纳入显隐管控，不再无条件追加表格尾；抽屉footer保留管理员"管理自定义字段"入口
- 后端零改动

### 2026-09-09 D-321 卡片码数表头重叠修复 + 采购完成物料去向闭环（已推送，待部署回归）

- [x] 码数卡片：OrderColorSizeMatrix 重构单网格+表头短码（XS(155/80A)→XS+tooltip）+列不压穿（minmax(min-content,cap)）+极端多码横滑；生产/外发/分享/订单头全生效，不加高卡片
- [x] 采购闭环：confirmComplete 加 movementAction（inbound/direct_use，不传走原行为向后兼容小程序）+@Transactional；inboundOnComplete 按剩余可入库量封顶防重复累加；direct_use 记 OUTBOUND 采购直用流水（PURCHASE_DIRECT_USE）库存不动台账留痕
- [x] 前端：ConfirmCompleteModal 三选一（入库/直接使用/暂不登记）内嵌确认完成流程，操作列零新增按钮；流水统一进物料仓储页 MaterialPickupRecord 列表
- 注意：并行会话 DagExecutionEngine/SwarmExecutionEngine WIP 仍未提交，继续排除

### 2026-09-09 D-320 小云逾期问答"待查"根治四连（已推送，待部署回归）

- [x] P0 摘要改造：ContextEngineeringService 阈值 2000→6000 字 + JSON 按记录保留摘要（"单号|款号|进度|交期"一行一条，数组≤20条/总80行）；AgentLoopEngine.processToolResults 阈值内原文直喂不再经 evidence 截断
- [x] P1 收工守卫：AgentLoopEngine 新增 shouldNudgeDetailAnswer——回答含"待查/请提供订单号"且有工具返回记录数据时强制再推一轮（每请求一次）；堵住 D-312"调了一个汇总工具就收工"盲区
- [x] P1 当前环节：resolveBulkCurrentStage 开放 public；系统概要逾期/高风险清单、NL逾期明细、逾期卡片数据全加 currentStage；OverdueFactoryCardWidget 订单行渲染环节标签
- [x] 砍白烧：HyperAdvisorOrchestrator 移除 LLM 推理（前端只消费结构化字段），analysis 改确定性风险摘要
- 注意：并行会话有 DagExecutionEngine/SwarmExecutionEngine 未提交 WIP（120s超时改常量），本批未收编，提交时已排除

### 2026-09-08 D-315 PC端小云统一待办面板 + D-316 手机端待办九区梳理（已推送，待部署回归）

- [x] D-315 PC端：两套面板合并——删 TaskAggregationPanel（639行），TaskListView 升级统一面板（13业务分类chips+分组渲染+紧急筛选+状态/归属筛选+卡片去重）；铃铛/浮标角标/智能气泡入口统一走 openTaskPanel=setIsOpen+switchToTasks
- [x] D-315 后端：resolveAssigneeIdsByName 在 filterByResponsiblePerson 前按名字批量回填 assigneeId（name→username 两级，`.and(q->q.in(name).or().in(username))` 括号写法），免跨表迁移根治人名匹配
- [x] D-315 去 emoji：前端 CATEGORY_META 改纯 label、chips/组头/meta 行全文字（"订单 ORD123/款号 A001/截止 09-20"），SmartBubble/PendingItemsSection 同步；后端 icons 保留
- [x] D-316 手机端：九区排序（生产作业→订单外发→行政审批→提醒）+ 占位首字 coverText/sourceLabel/overdueText/到货合并去重 + 超时提醒统一头部与×位 + 聊天顶部提醒区合并
- [x] 验证：mvn compile EXIT=0 + tsc 0 错误
- [ ] 待部署回归：PC统一面板分类分组与入口、手机端九区

### 2026-09-07 D-314 小云个人创建任务可追踪（待推送）
- [x] PendingTaskOrchestrator 新增 collectCollaborationTasks：我创建/我领取+未完成并入全域待办，深链 xiaoyun://tasks（前端 TaskAggregationPanel 识别协议打开任务面板）
- [x] TaskListView 新增「全部/我创建的/我领取的」筛选 + 卡片创建人徽标；TaskItem 补 creatorName/creatorId
- [x] 验证：mvn compile EXIT=0 + tsc 0 错误

### 2026-09-07 D-313 小云待办覆盖领取类任务全量（待推送）

- [x] 采集上限每类 10→100：个人领取超过 10 条时后面的任务在待办列表「消失」的假阴性根治
- [x] 样衣开发按 7 环节展开（pattern/bom/size/process/production/secondary/sizePrice）：口径=领取人非空 && 未完成才显示，新增 addStyleStageTask helper + STY_{id}_{stage} 任务ID + 深链 /style-info/{id}?tab=xxx
- [x] 真实 bug 修复：样衣详情 ?tab= 深链断链——URL 参数只被 useStyleDetail 解析成数字 key 未消费，StyleInfoTabs 实际用 bomAreaTabKey 字符串 key；加 useSearchParams + effect 映射（尺寸表→pattern、码数单价→process）
- [x] 新增三类 collector：SHIPMENT 外发收货（receiveStatus=pending）/ SAMPLE_LOAN 样衣借还（borrowed 且剩余>0，assigneeId=borrowerId 精确匹配，逾期升high）/ MATERIAL_PICKING 领料出库（pending，assigneeId=pickerId 精确匹配）
- [x] 验证：mvn -o compile EXIT=0 + tsc --noEmit 0 错误
- [ ] 遗留待拍板：ProductionOrder.merchandiser 与 StyleInfo.xxxAssignee 只存姓名无用户ID → 名字字符串匹配兜底；根治需补 xxxAssigneeId 落库（跨表迁移）

### 2026-09-07 备注保存超长失败修复 + 自由编菲批量删除 ✅已推送 3a7b68a9c

- [x] 根因（用户报"好几页面备注输入框不能正常备注"）：QuickEditModal 保存时把 20+ 行 AI 巡检记录随人工备注一起提交 remarks → 超长 → 后端保存失败；QuickEditModal 是订单/裁剪/采购/进度多页面共用组件，全部受影响
- [x] 修复：QuickEditModal 系统日志与 AI 巡检行仅只读展示（操作记录/AI巡检区），保存只提交人工备注；cleanRemark 统一只保留人工备注；splitRemarkAndLogs 非字符串入参兜底防崩溃
- [x] 数据库核实：t_remark_cleanup_backup 备份确认此前清洗仅删系统日志行、无人工备注丢失
- [x] 自由编菲：新增复选框列（表头全选/单选）+「删除选中 (N)」批量删除，避免点错逐行删
- [x] 验证：tsc 0 错误 + ESLint 0 error + safe-push 10 项全过

### 2026-09-07 备注输入框剥离系统日志 + 存量清洗 ✅已推送 e26eb4f6e

- [x] 根因：QuickEditModal（编辑备注和预计出货）把 orders remarks 里的 [时间戳] 系统日志行全部回填进备注输入框；物料资料库编辑（useMaterialDatabaseActions.openDialog）直接 setFieldsValue({...record}) 也回填日志
- [x] 前端防御：新增 utils/remarkLogs.ts（splitRemarkAndLogs/cleanRemark）；QuickEditModal 系统日志行剥离到只读「操作记录」区、不进输入框、保存不写回 remarks；物料编辑回填 cleanRemark 过滤
- [x] 存量清洗：执行 cleanup-remark-logs.py，迁移 t_production_order 10 条 + t_pattern_production 1 条共 24 条日志行到 t_operation_log（备份表可回滚），再次预览 0 残留
- [x] 脚本修复：operator/action 截断防「Data too long for column 'operator_name'」
- [x] 验证：tsc 0 错误 + ESLint 0 error + safe-push 10 项全过

### 2026-09-07 侧滑弹窗统一 85% + 采购单详情批量动作去重 ✅已推送 1e388b339

- [x] 物料采购单详情 Drawer：底部 footer「采购全部/回料确认」与顶部「批量操作」下拉重复 → 删除底部重复按钮，批量动作统一保留在顶部；footer 仅留 确认完成/采购单生成/关闭
- [x] 全部业务侧滑弹窗宽度 80% 统一为 85%（48 处字符串 + 3 处 `window.innerWidth * 0.8` 计算式 + 2 处三元表达式）；列设置小抽屉 480px 与移动端 96vw 保持不变
- [x] 验证：前端 tsc 0 错误 + ESLint 0 error；safe-push 10 项全过

### 2026-09-07 弹窗内部信息重复核查与去重 ✅代码完成待推送

- [x] 全量核查四大模块（样衣/款式、生产、仓库、订单/财务/通用）弹窗内部信息重复，修复 3 处：
- [x] StyleCostDetailDrawer（款式成本明细）：顶部汇总卡片与底部汇总完全重复 → 删除底部汇总卡，"共 N 款/N 件"合并进 Divider 标题
- [x] OutboundModal/BatchTable（物料出库批次明细）：表头统计行（可用/出库合计）与表尾 summary 重复 → 删除表尾 summary
- [x] AiExecutionPanel/DetailDrawer（AI 命令详情）：标题已含命令类型，命令信息区"命令类型"行重复 → 删除该行
- [x] 核查确认无重复（信息分区用途不同，设计合理）：StyleStageDrawer 样衣生产/审核入库、SampleProcessList 色码上下文、MaterialInfoCard+批次颜色列（批次隔离）、MaterialScanOperationModal、PurchaseDetailView、OrderCreateModal、StylePrintModal 打印区块、PurchaseCartDrawer/CartPreview、SmartReceiveModal、AI 执行轨迹、成品出库抽屉、智能领取
- [x] 验证：前端 npx tsc --noEmit 0 错误

### 2026-09-07 侧滑弹窗统一 80% + 布局梳理 ✅代码完成待推送

- [x] 全项目 50 处 Drawer/SideDrawer 侧滑弹窗宽度统一为 80%（styles.wrapper.width 或 width 属性），排除 ColumnSettingsDrawer（列设置 480px 小抽屉）
- [x] 覆盖：成品/物料/库位/电商订单详情、扫码出入库、购物车/采购预览、采购单、领料/质检入库/转单、工序编辑、无资料下单/下单、样衣生产/开发/采购/成本明细、打印预览、AI 执行轨迹、工序单价配置、维护面板、工厂发货、报销单详情等
- [x] SideDrawer 公共组件默认宽度 640 → '80%'（防新调用方漏传）；JSDoc 同步
- [x] 移动端例外保留：下单/采购单 isMobile 仍 96vw（小屏全宽合理）
- [x] 修复 StyleCostDetailDrawer 误加重复 styles（原本已是 80%）
- [x] 抽查样衣生产/样衣开发/成本明细抽屉：布局干净、无重复信息（上轮已去重色码任务/精简信息）
- [x] 验证：前端 npx tsc --noEmit 0 错误

### 2026-09-07 批量问题优化六阶段（备注日志分离/手工编菲/采购全链路/订单管理/尺码排序/打印表高度）✅代码完成待推送

- [x] **Phase1 操作日志与备注分离（P0）**：OperationLogAppendUtil 改造为直写 t_operation_log（不再拼 remark）；清理 12+ 调用点（ActionExecutorTool/MaterialPurchasePickingHelper/PatternProductionOrchestrator/OrderFactoryTransferOrchestrator/ProcessPriceAdjustmentOrchestrator/ProductionOrderOrchestrator 等）；新增 scripts/cleanup-remark-logs.py 幂等历史清洗（表级正则/备份/干跑模式）
- [x] **Phase2 手工编菲优化**：面料层数=数量单输入（删独立 layerCount 输入）；码数汇总匹配（下单/已填/剩余实时提示+超下单提醒）；Ctrl/⌘+Enter 加1行、Ctrl/⌘+Shift+Enter 加5行快捷键；快速分扎工具；提交自动按 颜色顺序→尺码升序 排序
- [x] **Phase3 采购全链路**：新增 PurchasePrintModal 专业采购单打印（订单号/款式图/颜色尺码矩阵/物料明细表/合计）；状态中文化（getStatusConfig 映射）；样衣采购无订单降级（"样衣采购"标题+来源说明，不再报"订单不存在"）；样衣出库领取链路；全采购页面动作统一（入库/领取/直接使用）
- [x] **Phase4 订单管理**：恢复打印生产单入口（useOrderColumns 打印下拉三分支：订单/生产/标签，StylePrintModal 支持 initialLabelMode）；排行榜窗口收敛（OrderRankingDashboard.css 减 padding/字号/高度）；数据分析 tab 升级为智能数据分析（OrderAnalyticsController+Orchestrator+VO：总览/30天趋势/工厂时效排行/次品率排行/毛利估算，ECharts）；无资料下单颜色/码数加快捷齿轮（AttributeGroupLibraryModal 成组选择）
- [x] **Phase5 菲号尺码排序（全系统）**：compareSizeAsc（前端 utils/api/size + 后端 ProductionOrderUtils）统一排序；覆盖自由编菲提交/一键生成/后端 CuttingBundleServiceImpl 生成路径；颜色按下单出现顺序、尺码 XS→S→M→L→XL 升序
- [x] **Phase6 打印表高度+界面收尾**：裁剪菲号明细表 disableFillScrollY 自然平铺（不再限高内部滚动）；验证前端 tsc 0 错误 + 后端 mvn compile BUILD SUCCESS
- [x] 验收（部署后）：手工编菲只填数量即出菲号且小码在前；采购单可打印专业表单；样衣采购不再报订单不存在；备注列无系统日志；订单管理可打印生产单；排行榜窗口正常大小

- [x] 口径bug根因：列表 status=production 后端 eq 精确匹配单值，而 /stats activeOrders=全部非终态十余种状态 → "统计6列表2"。修 queryPage：production/in_production/active 一律 notIn 终态集合（与统计同口径）；其余状态仍精确匹配。PC/手机两端数字与列表同时对齐
- [x] 尺寸表抽成共享组件 components/size-table（property styleId，observer 懒加载+实例级缓存，D-185/D-252 同款透视算法），接入三处：生产管理订单卡展开区、外发管理列表卡展开区、发货详情页订单信息卡下
- [x] 外发管理详情此前无尺寸表（dashboard/order-detail 有但外发厂日常走 shipment-detail）；无款式资料/无尺寸数据整块不渲染
- [x] H5 镜像同步；后端编译过
- [x] 验收（后端部署后）：生产管理点"生产中"应显示6个订单卡；生产管理/外发管理订单卡展开见尺寸表；外发发货详情见尺寸表

### 2026-09-05 D-301 费用与借支合并一页 ✅已推送19f8303ae

- [x] 外发扫码空根因：①生产扫码 factory_id 取登录账号，外发厂工人账号多未绑 factory → 写 NULL，externalOnly(isNotNull) 永远查不到；②delegate_target_* 三字段全后端无写入点（委托工厂列恒'-'）
- [x] 写入端兜底：ProductionScanExecutor 上下文无工厂时回填订单承做工厂 + delegate三件套；查询端 externalOnly 改 inSql factory_type='OUTSOURCE'（防内部厂混入）
- [x] 存量自愈：ScanRecordFactoryBackfillRunner（幂等随启动）按订单承做工厂刷历史扫码记录
- [x] 费用报销+员工借支菜单找回（财税工具统一入口未承接就裁了独立入口）；权限矩阵"费用管理"行label改"费用报销"
- [x] 权限补配：财务总览/每日流水(MENU_FINISHED_SETTLEMENT)、付款计划(MENU_PAYMENT_APPROVAL)、财税工具/EC(MENU_FINANCE_EXPORT)——此前无码=对所有人永久可见不可控；矩阵行label对齐（付款计划归收付款中心行）
- [x] 验收（后端部署+重启后）：外发订单工人扫码→外部工厂扫码tab出记录且委托工厂列有值；财务菜单见费用报销/员工借支；岗位权限矩阵可勾财务总览/付款计划/财税工具控制可见

### 2026-09-05 D-299 财务钱流页续梳理（付款计划+应收管理）✅已推送587c83931

- [x] 付款计划：统计卡原只算当前页20条（假数字）→单拉全量统计；死按钮"查看详情"（弹"待实现"）→"去付款"跳收付款中心?tab=pending；补页头说明（打款去收付款中心）；统计卡标题改"7/14/30天内到期应付"
- [x] 应收管理：逾期提示 Alert 用 title 属性（antd无此属性，提示从不显示）→message（D-264教训复发）；裸Select补placeholder（收款状态/来源类型）；补页头说明
- [x] 收付款中心 activeTab 支持 ?tab= URL直达；删无引用死组件 PaymentDashboardTab
- [x] 财税工具四页签结构清晰核查无需改
- [x] 验收：付款计划待付总额=全量口径；逾期提示能看到；付款计划→去付款直达收付款中心待付款页签

### 2026-09-05 D-298 收付款中心四页签梳理（清晰化）✅已推送f0bbf77eb

- [x] StatsCards 假数字清除：旧"已完成=总数-勾选数""待付款tab已处理金额恒0"删除；重做为按tab显示真实统计（待付笔数/金额/工资分布/已勾选；付款笔数/处理中/已成功金额/失败），应收应付tab隐藏顶层卡（账单tab自带统计）
- [x] 待付款tab：业务类型筛选补回"全部"按钮（原先选了类型回不去）；筛选按钮升32px标准；空态写明来源；导出改名"待付款明细"
- [x] "收支记录"改名"付款记录"（实际只有支出，收款在应收账单）；删与状态页签重复的状态下拉；空态写明与待付款的关系
- [x] 应收/应付账单tab：空态"暂无工资数据"→"暂无账单"；裸Select补placeholder（账单分类/状态）；锁定类型时隐藏冗余"类型"列
- [x] 页头副标题改为流程说明：待付款打款→付款记录留痕→账单确认后进待付款；应收/应付tab名加"（别人欠我的）/（我欠别人的）"
- [x] 验收：四页签一眼看懂数据从哪来到哪去；统计卡无假数字

### 2026-09-05 D-297 购物车僵尸计数修复（"2件/¥440"列表却空）✅已推送7788f1d85

- [x] 根因：跨节点同步钩子/部分结算删除购物车条目后不重算 t_purchase_cart 汇总行，抽屉标题件数与合计金额读汇总行→僵尸数字；列表读条目表→空
- [x] 后端三处：PurchaseCartSyncHelper 删完重算受影响购物车汇总；confirm 部分结算分支补重算；getCartWithItems 读取自愈（汇总≠实际条目即修正，存量脏数据打开抽屉即愈）
- [x] 前端防御：CartHeader 件数/CartSummary 合计改按实际条目推导，空车显示 0件/¥0.00
- [x] 验收：已采购完的购物车打开应显示"采购购物车"无件数、合计¥0.00、预览按钮禁用

### 2026-09-05 D-296 购物车合并按颜色隔离 + 来源构成标注（用户拍板）✅已推送

- [x] 用户拍板：同面料不同颜色绝不合并；只有编码+规格+颜色+供应商全相同才可合并；合并后要能区分来源（样衣/大货各自多少）
- [x] 后端：previewOfItems/getMergeSuggestions 分组键加 color；confirm 落库 purchase.color=组颜色；addItem 幂等匹配加同色校验（空色与NULL互匹配）；mergeItems 手动合并加 mergeIdentityKey 守卫（异色抛错）
- [x] PC：预览抽屉物料列显示颜色、来源列每行加[样衣/大货/批量]标签+编号+数量；购物车列表物料行显示颜色
- [x] 验收：加购同面料两色→预览应出现两张采购单且各带颜色；混合来源合并单来源列分列显示样衣/大货

### 2026-09-05 D-295 采购跨节点同步购物车 + 五连修 ✅已推送（后端需云端部署）

- [x] 物料出入库→物料仓储改名（PC 6 文件，小程序无此文案）
- [x] 下发采购指令弹窗：打开即默认列出物料资料库前50条，可搜索筛选；清空搜索词恢复全量
- [x] 合格证标签字号缩放放开 0.5~2.0（原 0.8~1.6，两处：LabelPrintModal/CertificateTab + HangtagCertPanel）
- [x] 小云助手 `<tool_think>/<tool_call>` 协议原文泄漏：PC adapter+流式、小程序组件、H5 镜像三端剥离
- [x] 购物车跨节点同步：`PurchaseCartSyncHelper.reconcileCartOnPurchase` 挂 `savePurchaseAndUpdateOrder`，任一节点采购落库即清购物车同需求（同物料+同款+同色）；confirm 部分结算越界 bug 一并修复（原会为未勾选物料也生成采购单）
- [x] 采购任务"未知款号"卡：标题兜底物料名+编码；详情入口补 materialCode 模式；数量浮点噪声舍入+单位'-'不显示
- 验收要点：样衣节点下一单采购→购物车同款条目应消失；采购指令生成的任务卡显示物料名且可点进详情；小云再问逾期订单不应出现英文协议

### 2026-09-05 D-294 尺寸表智能导入"静默丢光"修复 ✅代码完成（mvn compile 过，待推送部署）

- [x] 反馈：纸样开发页尺寸表显示 S/S/M/M/L/L/XL/XL 列但"暂无数据"；导入尺寸模板提示成功但数据仍空白；与实际样衣码数对不上
- [x] 根因1：尺寸列来自款式基础码数 sizeColorConfig.sizes（8 个带型体码如 S(155/80A)），列头 shortSizeLabel 简称显示 → 观感"被简化/重复"（D-252 设计，悬浮可见完整名）；小程序样衣详情页用完整码名 → 两端口径不同造成"不匹配"观感
- [x] 根因2：表格行来自 t_style_size，该款式无任何部位数据行 → 空白
- [x] 根因3（真bug）：`TemplateStyleOrchestrator#applySizeTemplate` merge 分支，目标款无尺寸行时用 canonicalSizeKeys 过滤，模板码与款式配置码语义不一致（S vs S(155/80A)）则全部行静默丢弃
- [x] 修复：merge 分支加 hasExistingData 判定——目标款完全无尺寸行时跳过过滤、整表按模板写入；已有尺寸结构才保留 D-264 过滤。改 1 文件
- [ ] 待用户：线上先用「覆盖导入」绕过（覆盖分支不做码数过滤）；修复随后端部署生效
- [ ] 注意：若模板为简单码而款式配置为带型体 8 码，导入后 PC 会并列多出简单码列，建议把款式基础码数配置改成与实际样衣一致的码

### 2026-09-04 D-292 无资料下单 serial 400 根治 + 款式图上传链路加固 ✅代码完成，待真机验收

- [x] 现象：小程序无资料下单进表单页即报 `GET /api/system/serial/generate?ruleCode=CUTTING_TASK_NO 400`；用户反馈"点击图片还是不能上传"
- [x] 根因1（400）：后端 `SerialOrchestrator.generate` 只支持 STYLE_NO/ORDER_NO，小程序无资料下单传 CUTTING_TASK_NO 直接 400，一直靠前端 catch 兜底出 CUT+时间戳
- [x] 修复1：`form/index.js _genOrderNo` 无资料下单改为本地生成 `CUT+yyyyMMddHHmmssSSS`（与后端 CuttingOrderFactory 兜底格式一致），不再调 serial 接口；有资料下单仍走 ORDER_NO
- [x] 根因2（图片丢失风险）：建单成功后固定 1.5s navigateBack，网络稍慢时页面销毁会中断 wx.uploadFile → 款式图实际没传上
- [x] 修复2：提交成功后 `Promise.race([持久化图片, 8s超时])` 完成再返回；`_persistCoverImage` 增加成功日志便于验收
- [x] 四副本（miniprogram + h5-web ×3）js/wxml/wxss MD5 一致，node --check 全过（同步了此前未同步的 ➕ 上传大按钮改版）
- [ ] 待用户：devtools 清缓存重新编译（热重载可能残留旧绑定）→ 无资料下单 → 点 ➕ 选图 → 提交 → 订单列表/详情看图；console 应出现「[无资料下单] 点击款式图上传」「款式图已保存到订单」
### 2026-09-03 D-263 工艺单AI识别结果夹带HTML标签/行号痕迹 → 识别前后统一清洗 ✅代码完成，待推送部署

- [x] 根因：工艺单常以 HTML 源码形态截图上传，视觉模型把 `<div>/<span style=...>/<h3>` 标签和源码行号（"2 供应链..."）当正文识别出来；后端 recognizeRequirementDoc 原样透传 rawText，前端 OCR 弹窗纯文本预览直接暴露
- [x] 后端 `StyleDocOcrOrchestrator.cleanRecognizedText`：块级标签/<br>→换行 → 其余标签剥除 → HTML实体解码 → 行首行号剥除（纯数字行丢弃；"15 整件..."→"整件..."；3位以上数字如"300 件"保留）→ 空行压缩
- [x] 前端 `useStyleProductionTabData.cleanOcrRawText`：同口径清洗后 setOcrText（防御老后端/异常结果），追加/替换进工艺说明的也是干净文本
- [x] 验证：用用户样例（大货工艺制造单 2/2）实测清洗后无标签残留、行号正确剥离，可读纯文本；后端 mvn compile EXIT=0、前端 tsc --noEmit EXIT=0（P0#23 降级：test-runner-mcp 本会话不可用，已用裸命令验证）
- [ ] 注意：已保存的历史脏数据不会自动清洗，重新走一次 AI 识别（追加/替换）即可得到干净文本
- [ ] 待用户：推送部署后重新识别验证

### 2026-09-03 D-283 工序单价租户级总开关（通用设置）✅待推送

- [x] 需求：管理要一个通用开关控制单价在公共页面（生产管理/外发管理工序进度）显示/隐藏；时间显示不动
- [x] 复用既有租户级智能开关机制（t_tenant_smart_feature，无表结构变更、无 Flyway）：新增 key `display.process.unitPrice.visible`，**默认开**（DEFAULT_TRUE_FEATURE_KEYS 特例，其余 smart.* 默认关）
- [x] PC：系统→个人资料→智能开关面板新增「工序单价显示」行（featureFlags.ts / smartFeatureStore.ts / ProfileSmartSettingsPanel.tsx）
- [x] 小程序：生产管理/外发管理页「时间/单价」旁新增管理员专属 chips「单价:全员可见/已隐藏」；非管理员自动跟随；切换走 GET 全量→合并→PUT（后端保存是全量覆盖语义，直接单 key PUT 会把其他开关冲回默认值）
- [x] procTimeline.js：`getTenantPriceVisible/cacheTenantPriceVisible/applyTenantPriceVisibility`（隐藏时清 priceText，_priceTextRaw 保留可恢复）；时间显示逻辑零改动
- [x] 四副本同步 md5 一致；node --check / tsc / mvn compile 全过
- [ ] 待推送+CI 部署（后端开关接口生效）后用户回归

### 2026-09-03 D-289 拖动不改写进度节点 ✅已推送，待回归

- [x] 去掉"进度节点跟随落点"：拖动只调顺序，行的父进度保持不变（用户实测反馈）
- [ ] 待用户回归拖动调序

### 2026-09-03 D-287/288 行操作常显+工序单价排序拖动 ✅已推送，待回归

- [x] 六处悬停显现改常显：全站表格 RowActions/样衣开发行/SideCardPanel/岗位卡/组织架构树/合作方树
- [x] 工序单价导入按父进度规范序重排+重编码；编辑态拖动行排序（进度节点跟随落点、编码自动重排）
- [ ] 待用户回归：各页操作按钮直接可见；导入模板后按 裁剪→二次→车缝→尾部 分组；拖行调序

### 2026-09-03 D-283~286 工序时间线四连 ✅已推送，待回归

- [x] D-283 租户级单价开关（权限配置页入口，关=全租户看不到单价）
- [x] D-284 阶段耗时/停留/等待（≥3天红/≥1天橙）；D-285 时间恒显开关只管单价
- [x] D-286 前沿呼吸：第一个未完成工序蓝色脉冲，其后灰，全完成全绿
- [x] "只有裁剪显示单价"=数据只有裁剪配了工价，非 bug
- [ ] 待用户回归：呼吸点/单价开关/耗时文本

### 2026-09-03 D-282 吸底回归修复+卡片视图翻页器 ✅已推送，待回归

- [x] 裁剪管理表格压成一条：填充公式扣了自身造成的"剩余空间"自锁 80px → 改底边锚定（容器底-表格顶-chrome）
- [x] 质检入库等裸 Card 旧页：填充容器兜底 .layout-content（统计/搜索固定+仅表体滚动）
- [x] 样衣开发/工序跟进卡片视图：StandardPagination 加 sticky 钉底
- [ ] 待用户回归四页

### 2026-09-03 D-281 报废单状态一致性+分页吸底全站 ✅已推送，待回归

- [x] 四端报废显示映射核实齐全，根因=数据被翻成 completed：关单复活漏洞已堵（scrapped/cancelled/archived 拒绝关单）+ 存量自愈（completed 且完成数=0 → scrapped，Runner 第10步）
- [x] 分页吸底全站铺开：填充模式从"直接子元素"放宽为容器内任意深度（排除 Modal/Drawer/折叠面板），动态扣减上下占位，MutationObserver 重算
- [ ] 待用户回归：报废单四端显示已报废；各列表页底部分页固定

### 2026-09-03 D-280 部门树联动/岗位关联人员/手机端进度时间线 ✅已推送，待回归

- [x] 人员管理部门树按 parentId 组树与组织架构一致；后端 /system/user/list 加 roleId 过滤（兼容 t_user_role）修岗位关联人员/人员管理角色筛选
- [x] 生产管理+外发管理 工序进度换样衣同款时间线（圆点/脉冲/过渡动画），展开懒加载 flow stages 得每阶段开始/完成时间，子工序单价进 meta；"时间/单价"开关仅管理层可见（storage 持久化）
- [x] 四副本同步（h5 保留 quickScan 等适配差异）；node --check/tsc/mvn 全过
- [ ] 待用户回归：人员管理部门层级=组织架构；岗位查看全部=该岗位人员；手机端两页时间线+开关

### 2026-09-03 D-279 岗位权限页"堆积/名字对不上"根治 ✅已推送，待 CI 部署+用户回归

- [x] 迁移 V2027090301：18 子菜单+3 按钮名对齐侧边栏（按 code 定位免疫 id 漂移）；员工借支/查看财务数据/财税工具挂靠修正
- [x] 权限矩阵分层渲染：子模块名行+按钮缩进行，menu 类型 children 不再混入按钮堆；单子模块同名不重复渲染
- [x] MODULE_SECTIONS 对齐权威名+补 工资结算/员工借支 两个原本配不到的项（routeConfig 加 payrollSummary 别名）
- [x] tsc 0 错 / eslint 0 错 / check-flyway 过 / 迁移已在本地库实测生效
- [ ] 待用户回归：系统→角色页重新打开外发工厂岗位，各主模块下子模块与权限分层清晰、名字与侧边栏一致

### 2026-09-03 D-278 工资页缺图/扫码历史缺单价（两页数据一致性）✅已推送，待 CI 部署+用户回归

- [x] 工资页样衣记录缺图根因：enrichStyleInfo 只有 styleId→orderId 两级键，样衣链路扫码记录两者皆空 → 加第三级 styleNo 批量兜底（后端）
- [x] 扫码历史样衣记录缺单价根因：后端早已返回 unitPrice/scanCost，前端 _formatPatternRecord 硬编码 '-' → 接上（同时「仅看计薪」对样衣记录生效）
- [x] 工作区遗留同步：h5 两副本补齐到小程序已提交版本（图片/搜索框/组件注册/数量汇总），四副本字节一致已验证；另带 quality-detail/sample-development 两条防出界 wxss
- [x] node --check/组件存在/wxss 括号/mvn compile 全过
- [ ] 待用户回归：工资页样衣入库/剪线/包装记录有图；扫码历史样衣记录显示"N件 × ¥单价"；两页工序/单价/图片/金额一致

### 2026-09-03 D-277 样衣仓库入库"selectOne found: 2"根治 ✅已推送，待 CI 部署+用户回归

- [x] 根因：手机端入库不传 sampleType，`inbound()` 防重键含 sampleType 被 eq(null) 架空 → 同 SKU 重复插行 → `scanQuery` 的 `.one()` 直接 TooManyResultsException 500
- [x] 修复三处：inbound 防重键收敛为款号+颜色+尺码；scanQuery 改 list 取最早一条兜底；PatternStockHelper 出库/归还补尺码维度+getOne(throwEx=false)
- [x] 存量自愈：StyleSnapshotBackfillRunner 第 9 步四连（数量合并→空缺字段回填→借调单重指向→软删），幂等
- [x] mvn compile 过；**需 CI 部署后端生效**
- [ ] 待用户回归：扫码 BR26Q1Q0929A 棕色 XS 详情页正常显示；若已在库再点入库应提示"该颜色尺码已入库"而非重复插行

### 2026-09-03 D-276 订单管理页尾部进度球父子映射口径根治 ✅已推送（5f476c245），CI 核对中

- [x] 根因：主路径 applyFlowStagesToOrder 尾部球调 resolveTrackingMinRate 时把尾部自己的子工序（剪线/整烫/大烫/尾工）放进 parentKeywords 排除、只认「包装」→ 子工序配置为 03剪线/04整烫/05质检（无包装）的订单尾部球恒 0%（用户实测 PO20260828152504：36 条跟踪 3 条已扫，球仍 0%）
- [x] 修复：ProcessParentNodeResolver 新增 resolveParentStageRate（映射服务归属子工序，min=串行链最慢一道）；无归属时回退映射聚合量 max（与轻量路径 fillCompletionRates 同口径）→ 视图包装量；删除废弃的 resolveTrackingMinRate
- [x] 注意：轻量路径 fillCompletionRates（tailQty=max）与主路径口径不完全一致（min vs max），本次未动轻量路径
- [ ] 待 CI 部署后用户刷新订单管理页验收尾部球 >0%

### 2026-09-03 D-275 裁剪弹窗快捷跳转恢复 ✅已部署（60f05eefe，CI 全绿含冒烟）

- [x] 根因：D-137「工序弹窗抽屉化」把 NodeDetailModal 默认 mode 改为 'drawer'，而 NodeDetailBody 里「前往裁剪管理 →」按钮条件是 `nodeTypeKey === 'cutting' && mode !== 'drawer'` → 抽屉化后按钮在任何情况下都不渲染
- [x] 修复：去掉 `mode !== 'drawer'` 条件（抽屉 body 顶部放按钮无布局冲突），清理未用的 mode 形参；跳转目标 /production/cutting/task/:orderNo 路由仍在
- [x] tsc 0 错、ESLint 0 错
- [ ] 待用户：刷新 PC 验收——打开裁剪节点弹窗顶部应有「前往裁剪管理 →」

### 2026-09-02 D-274 已完成老采购到货量自愈 ✅已推送（157112010），CI 核对中

- [x] 写路径断点确认：D-273c 只管"以后"，7 条已完成老采购在 resolveEffectiveQuantity 处 aq=0 被跳过，且 confirmComplete 幂等分支永不补写
- [x] 修复：upsertWithReason 加 healArrivedQuantityIfCompleted——completed && aq≤0 时按 purchaseQuantity 回写（乐观锁防并发，幂等，不阻断）
- [x] 部署后动作：用户点一次「补生成对账」，7 条应全部进账（页面会显示各自原因，不再有"有效到货量为0"）

### 2026-09-02 D-268 补生成误删10条对账事故修复（只补不删+自愈恢复）/ D-269 恢复采购类型筛选 ✅已推送

- [x] P0事故：backfill 删除外发订单 pending 对账 → 已改为只补不删 + 恢复逻辑删除数据
- [x] 用户再点一次「补生成对账」即可还原被误删的 10 条
- [ ] 待用户拍板：外发订单采购要不要进物料对账（实时链路仍会清理外发 pending）
- [x] 采购类型筛选恢复（曾在财务精简重构中误删）


### 2026-09-02 D-267 面辅料采购→结算全链路梳理 + 补生成对账 P0 修复 ✅已部署（后端测试/部署/冒烟全绿）

- [x] 数据流澄清：内部订单(INTERNAL)采购到货 100% 生成对账，链路是通的；EXTERNAL 走加工费扣款不进对账（设计）
- [x] 补生成对账两处硬伤：跨租户扫描(P0#7)+LIMIT 5000 老数据补不到 → 已修（租户过滤+分页全量）
- [ ] 待用户确认：他看到的"内部订单"实际 factory_type（INTERNAL / NULL / EXTERNAL）


### 2026-09-02 D-265 五连修（前端+后端）✅已推送待验收

- [x] BOM第二条物料不计算：hasPatternData 改为 map 至少一个值>0 才算纸样口径（calcTotalPrice + bomUsageColumns 同口径），否则回落 devUsageAmount（原保存链路写全0 map → 误判纸样口径 → 用量/小计归0）
- [x] 导入尺寸模板不再拖入目标款没有的码数列：后端 merge 新增部位仅落规范码数（sizeColorConfig.sizes ∪ 已有行码数），模板独有码丢弃（applySizeTemplate）
- [x] 基础信息标签在上：CSS 补 `.ant-form-item-row{display:block}`（原 flex-direction 加错层不生效）
- [x] 删图片旁闪电识别+以图搜款按钮（识别走档案卡回填款式特征）
- [x] 图片自动识别改 lastParsedUrlRef 按 URL 各解析一次（原 attempted 一次性开关吞掉新图）
- [x] 续修（ec6866484）：识别跟随"当前选中图"，上传后列表按主图重排导致新图不被识别（"只有设为主图才识别"）——上传完成后自动选中刚上传的图（编辑模式定位新图；新建模式选中第一张新加本地图）
- [x] 验证：tsc 0 错、mvn compile 过、vite build 过
- [ ] 待用户：刷新验收五项；后端导入码数限制需云端部署

### 2026-09-02 D-264 用户九连修（纯前端）✅已推送待验收

- [x] 全局：api/core.ts 写操作成功后清空 GET 响应缓存——根修"资料维护退回提示成功却编辑不了"（退回后 fetchList 命中 30s 旧缓存拿回 locked=1）
- [x] DictAutoComplete 补传 disabled（原解构后丢弃，商品类型/商品品牌锁定态仍可改）
- [x] MaintenanceCenter 五个维护面板 ResizableModal → 通用 SideDrawer（85vw）
- [x] 样衣入库 InboundModal 样衣类型 Select 去掉 disabled（原写死开发样选不了）
- [x] 新建款式草稿弹窗堆叠：useStyleDraft 加 draftPromptShownRef 同步守卫（原每渲染叠一个 confirm）
- [x] 款式编码"重新同步"→"查重"：失焦自动查 + 手动点查，内联显示 可用/已被使用
- [x] 颜色/码数输入框 96→160 等宽；齿轮新增条目 via onCreated 立即加入本款
- [x] 颜色图片同步完成后 bump skuRefreshTrigger，商品编码表图片列即时刷新
- [x] 验证：tsc 0 错、vite build 过
- [ ] 待用户：刷新页面验收九项

### 2026-09-02 D-263 样衣详情四连修（PC前端+后端）✅已推送待验收

- [x] 设置主图假动作修复：徽标原按"列表第一张"位置判定→按 coverUrl 真值判定（新增 `isSameFileUrl` 剥 token 归一比较）；设为主图成功后本地重排+回写裸 URL（不再把带 token URL 写进 cover）
- [x] 款式特征 AI 填充打通：档案卡 `difficulty.visionRaw` → `onVisionAnalysis` 回调 → 表单 `extJson.styleFeature` 为空时回填（人工已写不覆盖，幂等）；手动"图像分析"同样回填
- [x] 尺寸表免分组加行：工具条新增"添加行"，groupName 留空按部位名自动归组（原"添加行"藏在分组列内，空表必须先建分组）
- [x] 尺寸模板导入 merge 改智能回填（后端 `TemplateStyleOrchestrator.applySizeTemplate`）：按部位名匹配+码数语义键定位，只填空缺（null/0），不再重复添加整份；部位列 160/度量方式 120 加宽
- [x] 验证：tsc 0 错、mvn compile 过、vite build 过
- [ ] 待用户：刷新 PC 页面验收四项；后端 merge 回填需等云端部署

### 2026-09-02 质检详情页二维码号/样衣详情页长码数出界修复 ✅代码完成，待用户重编译验证

- [x] 质检详情页：待检菲号列表 `tag-info`（二维码号）无 word-break/nowrap 导致长码出界 → 补 `max-width:100%; word-break:break-all; white-space:normal;`（`qc-form-info-value` 已有 break-all 无需改）
- [x] 样衣详情页：头部 `tag-chip`（`_sizeText` 长码数/`_colorText` 长颜色）`white-space:nowrap` + 固定 height:20px 必出界 → 改 `height:auto; min-height:20px; white-space:normal; word-break:break-all; max-width:100%`，支持多行裹形
- [x] 三端同步：miniprogram + h5-web/source-miniapp + h5-web/public/source-miniapp 各 2 个 wxss 共 6 处
- [x] 未改 dist（构建产物，历史惯例不同步）
- [ ] 待用户：微信开发者工具重新编译预览验证两个页面

### 2026-09-01 工资页+扫码历史双页款式图/卡片布局/搜索功能 ✅已推送 f75b624d1，云端接口已验证
- [x] 「我的工资」页按款号/订单号/款式名/菲号搜索：`sticky-search-bar` + 本地过滤（payroll.js `_matchSearchKeyword`）
- [x] 双页款式全景图：后端 `PayrollAggregationOrchestrator` 注入 `coverImage/styleName`（`ScanRecordEnrichHelper.enrichStyleInfo`，已部署云端，实测接口 181 条中 180 条带 coverImage、图片带 token 访问 200）
- [x] 图片容器：128rpx 宽对齐扫码页，高度再压缩至 56rpx，aspectFit 显示全景图左右留白
- [x] 顶部汇总卡片改左右双栏（左：月份+总额+环比；右：计件工资|奖金），解决右侧空白
- [x] 卡片高度压缩：padding 10px→8px、间距收紧（commit 43f04db6e + f75b624d1）
- [ ] 待用户：微信开发者工具重新编译预览；顶部卡片布局修复 CI 部署完成后刷新

### 2026-09-01 D-262 小程序生产管理/外发管理页扫码——页内直达工序领取页 ✅代码完成，待用户重新编译验证

- [x] 用户原话："我要的是直接扫码可以调领取工序的页面 不是还跳转到扫码主页再扫一次"
- [x] 根因：旧链路 quickScan → switchTab 到 `/pages/scan/index`（tabBar）丢 ?code= 参数 → 必须二次扫码
- [x] 新建 `miniprogram/pages/scan/handlers/InlineScanDispatcher.js`：`scanInPage`（原地扫码+本地解析，不导航）+ `dispatchInlineScanCode`（复用 ScanHandler 完整链路，直达 scan-result 领取/报工页 / ConfirmModal / QualityModal / scan-action）
- [x] 生产管理 `dashboard/index.js#onScanTap`、外发管理 `factory/shipment/index.js#onScan` 均改接页内直达
- [x] 链路验证：ScanHandler 无 navigateTo 不会二次跳转；`showScanResultConfirm` → `safeNavigate('/pages/scan/scan-result/index')`，全程不经过扫码主页
- [x] ESLint：新文件零错误（已补 eol-last）；dashboard 3 个 unused 变量（dash/topStats/stats L127-129）为历史遗留，非本次引入
- [ ] 待用户：开发者工具重新编译预览验证两种码型（菲号 bundle 码、订单 order 码）+ 异常分支

### 2026-09-01 D-261 用户暴走七连修（款式特征/尺寸表/公差/排产/退回/视觉AI/样衣采购）✅本地验证通过，待推送部署

- [x] **款式特征 6 栏合 1 个整段文本框**（用户明确要求）：新建共享模块 `styleFeature.ts`（读旧 6 字段自动合并迁移，存 extJson.styleFeature 无需 Flyway）；改 4 处消费点（表单/AI 识别回填/详情回填/打印弹窗 BasicInfoSection 收编重复解析）
- [x] **尺寸表 AI 识别改覆盖语义**：码数列以识别结果为准不再"追加一波"；行 key 加批次自增修复同毫秒重复 key 导致的部位"乱跳"；覆盖优先取 AI 值（含 0），未识别格保留原值
- [x] **公差列改名"正负公差"** + 输入框 addonBefore ± + 输入规范化剥 ±；部位列 50→100、度量方式 80→100、BOM 颜色列 90→180
- [x] **排产建议排除布行**：`SchedulingSuggestionOrchestrator.listFactories` 补 `supplier_type != MATERIAL`（isNull OR ne，与 D-200 转单同口径保留存量）
- [x] **资料单价退回"没反应"**：3 处 handleRollbackConfirm 只有 try/finally 无 catch，后端异常被吞 → 补 catch 透出错误（UnitPricePanel/SizeTablePanel/TemplateCenter）；!row.id 静默 return 补提示
- [x] **视觉 AI 失败原因透传**（洗水唛/图形分析/尺寸表/BOM OCR 全链路）：新增 `lastVisionError` 追踪（401 熔断/超时/配置缺失具体原因）；LegacyInferenceAdapter 不再无条件 success=true 谎报；StyleDocOcrOrchestrator 空结果由静默/泛化报错改为带真实原因抛出
- [x] **样衣采购创建带色/成分**：`StyleBomPurchaseHelper.buildPurchaseFromBom` 与大货路径（D-252）对齐，补 fabricComposition/fabricWeight/lossRate 直带 + BOM 颜色兜底（原首个样衣采购颜色恒空）
- [x] 验证：mvn compile EXIT=0 / tsc EXIT=0 / eslint 11 文件 0 错误；无新 Bean/Flyway/配置（启动风险极低，推送前建议快速本地启动冒烟）
- [ ] 待用户验收：7 项功能端到端 + 推送部署

### 2026-09-01 D-260 采购列表白名单丢回填字段（成分/克重/颜色空显真正断点）✅已部署上线

- [x] 根因：MaterialPurchaseOrchestratorHelper.enrichRecord 实体→Map 白名单不含 color/size/成分/克重/幅宽 → D-256 回填全白修（值填进实体后在响应组装层被丢弃）
- [x] 定位：本地起后端 curl /production/purchase/list 打印响应 JSON key——fabricComposition 这个 key 根本不存在（NON_NULL 序列化省略 null）→ 反推白名单丢字段
- [x] 修复：白名单补 5 个 map.put；本地实测 RIB002 成分/克重从 BOM 兜底成功返回
- [x] CI 全绿，部署+冒烟 job 均 success，已真正上线
- [x] 铁律：改回填逻辑必须同步查响应组装层白名单；验证接口要看原始 JSON key 不能只看前端显示


### 2026-09-01 D-258 采购状态"已采购"→"已领取"两端统一 ✅已推送

- [x] 口径：状态 received=已领取；数量列「已采购量」不动（曾误改被用户抓回，已还原）
- [x] PC 4 文件 + 小程序 3 文件；三副本同步校验通过；tsc/node --check 通过


### 2026-09-01 D-257 样衣列表/详情子工序进度不一致根治（共享模块单点收敛）✅已推送

- [x] 根因：两页各写一份构建逻辑且数据源不同（列表=pattern process-config 按父阶段聚合；详情=style 工序列表按子工序）
- [x] 抽 miniprogram/utils/sampleProcessTimeline.js，两页共用；列表展开改为子工序时间线（含领取人/时间/单价）
- [x] 三副本同步 md5 校验通过；node --check / WXML 标签栈扫描通过


### 2026-09-01 D-259 CI失败→部署静默skip，线上跑旧代码（P0流程事故）✅已修复并真正部署

- [x] 根因：FactoryShipmentOrchestratorTest 断言文案过时（D-242改了文案没同步测试）→ CI 连续8次失败 → 部署job静默skip → **D-250~D-256 全部没上线**，用户以为线上最新实际停在一周前
- [x] 修复：更新断言 → 140/140 测试绿 → 推送 e783cf920 → CI 全绿 → 「部署到微信云托管」+「冒烟测试」首次真正执行成功
- [x] 铁律：推送≠部署，每次 push 后必须 gh run watch 确认 deploy job conclusion=success
- [ ] D-256 生产库可选跑一次 scripts/backfill_material_database_from_bom.sql（查询时兜底已自愈，SQL是补充）

## 2026-09-03 D-284 工序「开始/完成」时间口径修正 + 小程序显示耗时/等待

**用户诉求**：开始 = 第一个人扫码的时间；结束 = 最后扫码完成的那个人的时间；
小程序要像 PC 一样显示「多久完成」「等待了多久」。

**核实到的问题**：小程序原 `endTime` 取 flow 接口的 `completeTime`，而它是
「累计扫码量首次达到订单量」的时刻，**未达量恒为 null** → 大量进行中工序显示不出完成时间。

**改动**：
- 后端 `ProductionOrderFlowOrchestrationService.fillStageProgress()`：lastTime 提到 completed 判断之前，全量输出
- 小程序 `utils/procTimeline.js`：endTime = lastTime || completeTime；新增 normalizeTimeText / parseTimeMs（iOS 日期坑）/
  formatDuration / applyTimelineDurations / refreshWaitDurations；endLabel 区分「完成」与「末扫」
- `pages/dashboard`、`pages/factory/shipment`：WXML 加耗时/停留/等待三行 + WXSS 配色 + 60s 等待计时器（onHide 清理）

**当前进行中**：三副本已同步，等待真机验收。
**已知问题**：等待时长按分钟级刷新（不实时秒级），跨天耗时按 PC 口径只显示到「天+时」（不显示分钟）。
**下一步**：真机展开订单核对文案与 PC 是否一致；确认末尾节点「等待」不会误报（后续有进展的节点不显示等待）。

## 2026-09-03 D-285 撤销页内时间/单价开关（用户强烈反馈）

- 生产管理/外发管理页：删除「时间/单价」「单价」两个页内 chips；时间（含 D-284 的耗时/停留/等待）恢复恒显示
- 单价全局开关唯一入口：更多应用 → 权限配置（menu-role-config）新增「全局显示开关→工序单价显示」
- procTimeline.js 时间开关机制整体下线；两页只读消费租户级单价开关
- 三副本 8 文件同步完成，旧开关逻辑全项目扫描零残留

**下一步**：真机验收（页面无按钮、时间恒显、权限配置页切单价全端生效）。

## 2026-09-04 D-290 样衣详情页（小程序）多模块数据对接不上 PC —— 根因修复

**用户诉求**：手机端样衣详情页很多模块对接不上 PC，附件完全看不到。

**根因 1（P0，三个模块恒空）**：`ok()` 包装的 API 已把 `Result.data` 解包返回，
但页面写成 `res?.data?.records || res?.data || res?.records || []`（缺 `|| res`）。
List 型接口（`/api/style/attachment/list`、`/api/system/order-remark/list` 返回 `Result<List<T>>`）
解包后 res 就是数组 → 兜底链全落空 → **永远 []**。命中反模式 AP-MP-03。
影响：附件 tab / 纸样 tab / 底部附件文件区 / 款式备注 / 备注日志 共 5 处。

**根因 2（P0，上传必失败）**：`onUploadAttachment` 先 POST 到 `/api/file/upload`
（**后端根本不存在该接口**，TenantFileController 只有 tenant-download/storage-status），
再拿 url 调 `/api/style/attachment/upload` 传 JSON——而该接口是
`@RequestParam("file") MultipartFile`，只收 multipart。两步都必然失败。

**根因 3（P1，尺寸表口径不一致）**：`_pivotSizeTable` 把合并尺码 "S/M" 当一整列，
PC 端 `useStyleSizeData` 用 `splitStyleOptions` 拆成 S、M 两列 → 列数/列名对不上；
且排序用页面私有固定 sizeOrder，未复用 `utils/sizeUtils.js sortSizeNames`。

**根因 4（P1）**：附件下载 `wx.downloadFile` 直传裸 fileUrl，无 token → tenant-download 401。

**改动清单**
- `miniprogram/pages/sample-development/detail/index.js`
  - 新增 `toArray(res)`（与 `sampleProcessTimeline.toList` 同实现），替换全部错误兜底链
  - 附件：加 `_bizTypeText`/`_uploadTimeText`/`_isImage`/`_previewUrl`/`_downloadUrl`/
    `_isPattern`；新增 `patternFileList`（挂 `_srcIndex` 指回 attachmentList，避免点击错位）
  - 上传：改为 `wx.uploadFile` 直传 multipart 到 `/api/style/attachment/upload`；
    入口改 actionSheet（从聊天选文件 / chooseMedia 选图，chooseImage 已废弃）
  - 打开：`onAttachmentTap`（图片 previewImage，其它 downloadFile+openDocument，showMenu 可转发）
  - 尺寸表：复用 `splitStyleOptions` 展开合并码 + `sortSizeNames` 排序；0 值不再被 `||` 吃掉
  - `_loadBomAndSizes` 无 styleId 时显式结束 loading（此前三个 tab 永久"加载中"）
- `index.wxml`：纸样 tab 用 `patternFileList`（原写法 wx:if 逐项过滤 → 有数据但整片空白）；
  附件/纸样加缩略图、bizType 中文、下载按钮
- `index.wxss`（三副本片段插入）：`.file-item__thumb/--pressed/__action`、`.attachment-item__thumb`
- 后端 `StyleAttachmentController#upload` + `StyleAttachmentOrchestrator`：
  新增可选 `fileName` 参数（wx.uploadFile 只能传 temp basename，否则存库名是 tmp_xxx.png）；
  配套 `sanitizeFileName()` 取 basename 防路径穿越。4 参/5 参重载全部保留，PC 端调用不受影响

**验证**：mvn compile ✅ + mvn test-compile ✅；四副本 js/wxml md5 唯一值=1；
node --check 四副本全过；WXML 标签栈扫描四副本 OK；WXML 表达式方法调用扫描 0。

**当前进行中**：等待真机验收。
**已知问题**：PC 端 StyleInfo 还有「工艺说明/报价单/洗水唛/SKU」等 tab 小程序未覆盖（本次未做，属新增功能）。
**下一步**：真机打开样衣详情，逐 tab 核对附件/纸样/备注/尺寸表是否与 PC 一致；试传一个附件确认文件名正确。

## 2026-09-04 D-291 样衣详情页去重 + 无资料下单直达表单（用户真机反馈）

**反馈 1｜附件显示两份**：tab「附件」与页面底部「附件文件」区块数据同源重复展示。
→ 删底部整个 section-card，上传按钮移入附件 tab 头部（tab-card__header-right 内 outline-btn--sm）。

**反馈 2｜备注显示两份**：tab「备注日志」（targetType=pattern）与底部「款式备注」（targetType=style）重复。
→ 用户拍板删 tab：tabs 数组去 'remark'，WXML 删备注日志块，JS 删 _loadPatternRemarks/_formatPatternRemarkTime 及调用；底部款式备注保留。

**反馈 3｜无资料下单无法传图**：列表页"方式一上传图"真机点击无反应，且强制传图才能下一步。
→ 按用户拍板改为「点击直达内部下单页」：
- `no-data-create/index.js`：redirectTo 直接进 `form?noData=true`（原跳 create 列表页）
- create 页：下线方式一上传区块 + chooseNoDataImage/deleteNoDataImage/goToNoDataOrderForm；noData tab 保留"从已有款式下单"列表
- form 页（isNoData）：款式区新增"款式图（可选）"上传——chooseMedia 优先/chooseImage 降级/权限引导/取消静默；
  选完写 coverImage（缩略图即时显示），不传图可直接下单；提交成功后复用既有 _persistCoverImage
  （本地临时图 uploadImage → addOrderImage → t_order_image），图片保存失败不影响订单

**验证**：4 个 JS node --check 全过；四副本 8 文件 md5 唯一值=1；12 份 WXML 标签栈全 OK；
WXML 表达式方法调用扫描 0；残留引用扫描仅剩注释。

**下一步**：真机验收——①附件/备注只显示一份 ②无资料下单入口直达表单、选图可选、下单成功后订单详情能看到款式图。

## 2026-09-04 D-293 质检详情页缺陷类别显示英文 + 次品拍照无反应（用户真机反馈）✅代码完成

**反馈**：质检选缺陷类别"看着是中文，选择后就全变英文"；次品拍照"点了没反应，拍照/传图都不行"。

**根因 1（英文）**：`pages/quality-detail/index`（质检详情页内联质检表单 + 批量不合格表单）——picker 下拉用 `defectCategoryOptions` 的 `range-key="label"` 显示中文，但选中后 WXML 直接渲染 `qcSheetData.defectCategory`（英文枚举值 appearance_integrity 等），导致选完变英文。PC 端 ScanQualityPage.jsx 的 select 显示 `<option>` 文本（中文），无此问题。

**修复 1**：change handler 同时存 `defectCategoryLabel`（中文），WXML 改为渲染 label；单选框 + 批量框 + `_syncQcSheetFromSelection` + batchUnqualData 重置全部补 label 字段。

**根因 2（拍照无反应）**：质检详情页此前未挂 `privacy-dialog` 组件/监听（`wx.onNeedPrivacyAuthorization` 触发后无人消费 resolve，选图被隐私授权卡死静默无响应），且 `onQcImageAdd` 无 fail 分支、还把本地 tempFilePath 直接当图片 URL 存。

**修复 2**：index.json 注册 privacy-dialog 组件；wxml 末尾挂 `<privacy-dialog id="privacyDialog" />`；onLoad/onUnload 注册/注销 `showPrivacyDialog` 监听（与 scan/quality 一致）；`onQcImageAdd` 按全站选图入口标准重写——调用前清残留 toast/loading、chooseMedia 失败弹权限引导（含 openSetting）、成功走 `api.common.uploadImage` + `getAuthedImageUrl`（不再存本地临时路径）。

**验证**：`npm run sync:miniapp` 三副本（miniprogram + h5-web/source-miniapp + h5-web/public/source-miniapp）一致；node --check 通过。
**已知**：同步时把先前未同步的小程序提交一并带到了 h5-web 镜像（order/create/form 等），属正常镜像跟踪。
**下一步**：真机验收——①质检详情页选缺陷类别显示中文 ②拍照/相册可正常拉起并上传 ③提交质检后照片正常展示。

## ✅ D-516 小云逾期提醒跳错页 + 物料详情面料规格误显（2026-09-23，代码完成待上传）
- 小云帮助中心「N个逾期」chip：path 由 /pages/sales/order-list/index（销售订单，跳错域）改为
  /pages/dashboard/index?filter=overdue；非 isAdminOrSupervisor 不带 path，走小云作答兜底
- dashboard/index.js onLoad 支持 ?filter= 深链（校验合法 key）
- material-inventory/detail：面料（/^^fabric/i）隐藏「规格」行，对齐 D-514 入库表单口径
- 已 sync h5-web 镜像；refs/一致性/172 项页面自检全绿。**未推送**，等用户确认一起推
- 用户领料 tab 旧包问题：提醒其重新上传小程序（D-515 的"默认全部"在旧包里看不到）

## ✅ D-517 手机端选择器全面搜索化（2026-09-24，已推送）
- search-picker 升级双模式（本地 + 远程关键字搜索 + 分页 + loading + 稳定 ID 回传 item）
- 接入：下单页(部门/工厂/客户/纸样师/跟单员)、物料出入库(物料/订单/工厂/领料人，取消预加载)、
  成品出入库(仓区/客户)、拆菲(工序/工人)
- 面料/物料：新增「选择」入口，走 listStock keyword 远程搜索（此前只能手输编码/扫码）
- 190 项自检全绿。**第二批待办**：扫码/质检的仓库库位、待质检菲号、裁剪转单菲号、样衣借调与考勤的人员(截断200)、下单款式(截断500)

**D-517 第二批（同日已推送）**：扫码主入口库位、质检入库库位改可搜索；样衣借调员工/外发工厂改远程搜索+分页（去掉 200 条预加载）。
自检 200 项全通过。**第三批剩余**：考勤管理员选员工(截断200)、下单选款式(截断500)、裁剪转单菲号、质检待质检菲号、扫码/样衣的仓库 chip(超N项才有搜索)。

**D-517 第三批（同日已推送）**：考勤选员工、下单选款式改后端关键字搜索；质检待检菲号、裁剪转单菲号加搜索过滤。
自检 205 项全通过。**剩余低优先**：扫码/样衣/质检的仓库 chip（仓区通常 <10 个，chip 直观，可不动）、
sample/scan-action 与 scan-result 的仓库 chip 超 N 项才有搜索。

> 更早内容（2026-08-31 及以前）已归档：memory-bank/archive/activeContext-202608.md

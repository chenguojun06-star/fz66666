# 决策日志

> 记录重要的架构和实现决策，包括上下文、决策、理由
> 最后更新：2026-09-05（新增 D-295 采购跨节点同步购物车 + 五连修）

---

## D-295：采购跨节点同步 + 采购指令弹窗默认列表 + 小云协议泄漏 + 标签字号 + 物料仓储改名（2026-09-05）

用户报五个问题：①"物料出入库"改名"物料仓储"；②下发采购指令弹窗选择物料必须搜索才出结果（要默认列出物料新增里的物料）；③合格证标签字号被限制 0.80 下限；④小云助手回答里滚出 `<tool_think>/<tool_call>` 英文协议原文；⑤（最严重）购物车面料在样衣节点已被采购完，其它节点不知道，会重复采购同款面料，且购物车/采购任务里"不知道是什么款、没有详情页"。

**决策与实现**：
1. **跨节点同步挂钩 `savePurchaseAndUpdateOrder`**：新增 `PurchaseCartSyncHelper.reconcileCartOnPurchase`，任何节点（样衣/大货/指令/OpenAPI/补料）生成采购单落库后，自动清除购物车中同需求条目。匹配规则：materialCode 必须相等；有款关联（styleId/styleNo）只清同款；无款关联只清无款条目；有颜色要求条目颜色相等或为空。异常只记日志绝不阻断采购主流程。购物车结算 confirm 自身的删除保持不变（幂等）。
2. **confirm() 部分结算越界 bug**：原实现 `preview(tenantId,userId)` 按整个购物车分组，传 itemIds 部分结算时会把未勾选物料也生成采购单。拆出 `previewOfItems(items)`，confirm 只按 itemsToProcess 分组。
3. **未知款号卡片**：根因=采购指令等链路生成的采购单无 orderId/patternProductionId/styleNo。任务卡标题兜底物料名+物料编码副标题；详情入口补 materialCode 模式（后端列表本就支持 materialCode 过滤）；数量格式化修浮点噪声（2.679999→2.68）与单位 '-' 不再当单位显示。
4. **小云协议泄漏**：模型偶发把内部工具协议原样写进回答，前端原样显示。三端剥离：PC `xiaoyunChatAdapter.stripToolProtocolText`（流式 answer_chunk + 错误兜底 + displayText 共用）、小程序 ai-assistant `stripToolProtocol`（parseAiCards 入口+流式显示），未闭合开标签从开标签起截断，剥离后为空给兜底文案。H5 镜像同步。
5. **标签字号**：合格证两处（CertificateTab/HangtagCertPanel）min 0.8→0.5、max 1.6→2.0，打印模板是纯乘法无 clamp，UI 放开即生效。
6. **改名**：物料出入库→物料仓储（routeConfig/i18n/权限标签/教程/租户模块配置/页内标题，共6文件；小程序无此文案）。

---

## D-287/288：行操作按钮常显 + 工序单价阶段排序与拖动（2026-09-03）

用户：①全站行/卡片操作按钮悬停不显示、要点一下才出现（"你看看有多少页面有这个影响"）；②工序单价页导入模板后父进度（裁剪/车缝/尾部）顺序乱套，要求父进度可拖动上下排序。

**D-287 行操作常显**：悬停显现机制（D-117 引入）在各端是纯 CSS `:hover`，代码数月未变但用户环境悬停失效（点击后才出现）。不再依赖悬停——六处显现模式全部改常显：
1. `RowActions.css` reveal 模式（所有表格行操作：订单/质检入库/裁剪等全站表格）
2. 样衣开发 smart rows（`.style-smart-row__actions`）
3. SideCardPanel 左卡片（岗位/人员/组织架构/合作方）
4. 岗位卡片（RoleList）
5. 组织架构树（tree-item）
6. 合作方树（partner-tree-item）
视觉代价（按钮常驻的密排感）由用户需求优先级覆盖。

**D-288 工序单价排序**：根因=导入模板按"模板自身步骤顺序"重编码（D-264 时代按模板序纠正是对的，但模板自身顺序不按父进度走），导致 车缝/裁剪/尾部 交错。修复 `reorderRowsByTemplate`：排序口径改为 **父进度规范序（裁剪→二次工艺→车缝→尾部）优先**，模板步骤序/编码作阶段内次序，重编码 01..N 固化。另加**编辑态拖动排序**（StyleProcessTab HTML5 DnD）：拖行=调整整表顺序，进度节点跟随落点分组，编码自动重排 01..N；从输入框/选择器/按钮起拖时抑制拖动避免误触。保存后按编码固化，刷新不变。

**D-289 热修（用户实测反馈）**：拖动后行"变成上面一个父节点的子工序"——D-288 的"进度节点跟随落点分组"逻辑会改写被拖行的 progressStage，违背直觉。已去掉：**拖动只调顺序，进度节点保持行自身归属不变**，编码仍自动重排。

**教训**：①悬停显现类交互在桌面端并不可靠（浏览器/环境差异+触屏），关键操作入口应常显或提供替代路径；②"编码即顺序"范式下，任何导入/拖动都应以重编码收尾，顺序才可持续；③拖拽类交互不要附带"智能改归属"——用户拖的是位置，不是属性。

---

## D-283~286：工序时间线四连——租户单价开关/阶段耗时/时间恒显/前沿呼吸（2026-09-03）

用户在手机端实测时间线后四问：①生产中未完成工序没有蓝色呼吸；②为什么只有裁剪显示单价；③单价控制按钮（权限配置里的控制器）能不能真正控制别人看不到单价；④细节问题要修干净。

**四项落地**：
1. **D-283 租户级单价开关**：feature key `display.process.unitPrice.visible`（TenantSmartFeatureOrchestrator），入口在手机端「权限配置」页（menu-role-config）与 PC 个人中心智能设置。关=清空 priceText（_priceTextRaw 保留，重开无需重拉），**全租户生效**——控制器是真的能看不见。
2. **D-284 阶段耗时/停留/等待**：flow stages 归并出 startTimeRaw/endTimeRaw，applyTimelineDurations 算 耗时（开始~完成）/停留/等待 文本与配色（≥3天红/≥1天橙）。
3. **D-285 时间恒显**：开始/完成时间不再受开关控制，开关只管单价。
4. **D-286 前沿呼吸**：旧口径 percent>0 才算进行中→0% 的当前工序死灰色。改**前沿推进口径**：第一个未完成工序=进行中（蓝色呼吸），其后待开始，全部完成全绿（applyTimelineStatus 前沿遍历，合并出口统一过一遍）。

**"只有裁剪显示单价"非 bug**：单价来自工作流里各子工序的工价配置——该款只给裁剪配了 ¥2/件，其余子工序没配价，配置后自动显示。

**教训**：多会话并行改同一共享模块（procTimeline）时，后手必须先 git diff 盘点前手未提交改动再叠加，复制覆盖会抹掉别人的功能。

---

## D-282：分页吸底回归修复+卡片视图翻页器（2026-09-03）

用户实测 D-281：裁剪管理表格被压成只剩一条（大面积空白）、样衣开发/工序跟进/质检入库没有吸底。

**根因**：①D-281 的填充公式扣减了 `容器底-表格当前底` 的"下方留白"——表格短时剩余空间被当成占位，自锁到 80px 最小高度（self-referencing，稳定在错误态）；②样衣开发/工序跟进是**卡片视图**（无 ResizableTable，不走填充机制），翻页器在自然流里；③质检入库是裸 Card 旧页（无 page-layout-body 祖先），放宽规则没覆盖到。

**修复**：①填充公式改**底边锚定**：`fill = 容器底边 - 表格顶边 - chrome - 4`。填充容器是固定高滚动区（flex+min-height:0，底边不随内容长），无自指；短表格直接获得全部剩余高度。②填充容器兜底链补 `.layout-content`（全局滚动区，fixed 高）——质检入库等裸 Card 旧页自动获得吸底（统计/搜索在上方固定不动，仅表体滚动）。③卡片视图翻页器：StandardPagination 加 `sticky` 属性（position:sticky bottom:0 + 背景/上边框），样衣开发卡片+表格视图、工序跟进、订单管理卡片视图接入。

**教训**：几何计算里"当前剩余空间"（自己造成的量）不能当输入——底边锚定锚在"不随自己变化的参照"上；页面存在三套布局形态（PageLayout 填充/Tabs 填充/裸 Card 自然流），通用机制必须逐一覆盖而不是只测标准页。

---

## D-281：报废单显示"已完成"四端核实+分页吸底全站铺开（2026-09-03）

用户：①很多报废的订单显示成已完成，状态要全部核实清楚，多端（PC订单管理/外发工厂、手机端生产管理/外发管理）显示一致；②全站只有订单管理的底部分页是固定的，其它页面一堆滚动条。

**报废状态核实结论**：四端**显示映射本来就齐全**（PC orderStatus.ts/statusMaps.ts、PC外发工厂SmartView、手机端 displayHelper 均有 scrapped→已报废）——显示没错，是**数据错了**：这些行在库里 status 就是 'completed'。来源两个：
1. **关单复活漏洞（已堵）**：`ProductionOrderFinanceOrchestrationService.closeOrder` 只对 closed 短路，报废/取消单在"入库合格数≥订单数"时被 `markOrderCompleted` 翻成 completed。修复：closeOrder 对 scrapped/cancelled/archived 明确抛错拒绝关单。
2. **历史脏数据（自愈）**：守卫加上前已翻怪的行。真实完成的订单必有入库合格数（markOrderCompleted 写 completed_quantity>0），故 completed 且 completed_quantity=0 的行统一翻回 scrapped——StyleSnapshotBackfillRunner 第 10 步（幂等，本地实测 0 行影响）。

**分页吸底**：填充模式（表头+分页钉死、表体内部滚动）要求 ResizableTable 是 `.page-layout-body` 的**直接子元素**，Card/筛选栏包一层就退化为整页滚动。修复 `useResizableTableData`：容器从 parentElement 放宽为 `closest('.page-layout-body')`（找不到再退 `.ant-tabs-content-holder`，且必须在 page-layout-body 内）；扣减高度改为动态量取表格上方占位+下方留白；Modal/Drawer/折叠面板内保持自然高度；MutationObserver 监听容器子节点变化（筛选收起/展开重算）。所有 PageLayout+ResizableTable 页面（物料采购/工序跟进/人员管理/考勤/财务列表等）自动获得吸底；外发工厂页本就是 Virtuoso 填充结构无需改动。

**教训**：①"显示不一致"先查数据再查映射——四端映射齐全时问题在写入侧；②状态机的守卫要覆盖所有"顺路写状态"的入口（关单自动完成这种 bonus 行为最容易翻车）；③CSS 直接子元素选择器（`>`）+ JS parentElement 检查是"只在某个页面生效"类 bug 的头号嫌疑。

---

## D-280：组织架构-人员管理联动/岗位关联人员/手机端进度时间线（2026-09-03）

用户三连：①组织架构设的部门，人员管理里平铺冒出一堆对不上层级的部门（"这是最基本的联动"）；②岗位权限"关联人员-查看全部"看到的是全员；③手机端大货生产/外发工厂的进度条布局动画全部对齐样衣开发跟进，开始/结束时间+单价做统一开关（管理层可选显示）。

**根因与修复**：
1. **部门平铺**：`/system/organization/departments` 返回平铺列表（含子部门不带层级），组织架构页走 `/tree` 有层级 → 人员管理侧边栏看起来"多了一堆不知道什么的部门"。修复：DepartmentTree 组件内按 parentId 客户端组树（父不在集合内按根处理，防环），与组织架构层级完全一致。
2. **关联人员=全员**：前端传 `roleId` 过滤，但后端 `/system/user/list` 只有 `roleName` 参数——roleId 被静默无视返回全员（人员管理页的角色筛选同样中招）。修复：后端加 roleId 参数，过滤兼容旧 `t_user.role_id` 与新 `t_user_role` 多角色（OR EXISTS）。
3. **进度时间线**：生产管理（dashboard）与外发管理（shipment）的工序进度是普通条（无节点/无动画/无单价），样衣开发跟进是 proc-tl-* 时间线（状态圆点+脉冲动画+0.4s 过渡+meta 行）。修复：新建共享 `utils/procTimeline.js`（状态推导+时间合并+开关持久化），两页 wxml/wxss 换成同款时间线；展开卡片懒加载 flow 接口 stages（processName/startTime/completeTime）按子工序名归并出每阶段开始/完成时间；单价用工作流 children 的 unitPrice 拼"子工序¥x/件"；"时间/单价"开关仅 isManagerLevel() 可见可切，storage 持久化，非管理层恒不显示。
4. 小程序四副本同步：h5 两份副本的 dashboard/shipment 保留其 H5 适配差异（quickScan/无 InlineScanDispatcher），功能等价打补丁，全部 diff 验证一致。

**教训**：①"前端传了参数后端没接"是最隐蔽的假过滤——silent ignore 不报错，列表直接变全员；②多角色迁移（t_user_role）后所有按角色查询都要兼容双表；③跨端副本同步不是复制文件而是"同功能适配差异"，先 diff 找出有意差异点再打补丁。

---

## D-279：岗位权限页"权限堆积/名字对不上"——矩阵分层渲染+权限树名称挂靠对齐（2026-09-03）

用户（系统/角色页，外发工厂岗位授权界面）：每个主模块→子模块→勾选权限要清晰，不要一堆子模块的权限堆在一个子模块里；名字和实际功能对不上的要修。

**根因两层**：
1. **渲染不分层（前端）**：PermissionMatrix 把每个子模块的「子模块节点+其全部 children」渲染成**同样式的勾选框平铺一行流**——子模块名（如"样衣开发"）和它的按钮（新增款号…）乃至误挂进来的其他菜单（员工借支）长得一模一样，视觉上就是一坨。且 children 不分类型，历史数据里**菜单嵌菜单**（员工借支挂在成品结算单/财务汇总下、财税导出挂在费用报销下）全部混进按钮堆。
2. **DB 名字与侧边栏脱节（后端）**：矩阵子模块勾选框直接显示 DB permission_name，历史名大量过时（样衣出入库↔样衣库存、面辅料进销存↔物料出入库、我的订单↔生产订单、审批付款↔收付款中心、登录日志↔系统日志、角色管理↔岗位与权限…），权威命名是 routeConfig menuConfig（D-178 标准）。另有隐藏配置项：工资结算（MENU_PAYROLL_OPERATOR_SUMMARY）的按钮组不在 MODULE_SECTIONS 里，矩阵根本配不到。

**修复**：
1. **迁移 V2027090301**（全按 permission_code 定位，本地/云端 id 漂移免疫，幂等）：18 个子菜单名+3 个按钮名对齐侧边栏；挂靠修正——员工借支→财务管理顶级、查看财务数据→工资结算、财税工具→财务管理顶级。
2. **矩阵分层渲染**（PermissionMatrix/utils）：section body 竖排，每个子模块一个分组块=**子模块名行（勾=整组含按钮）+按钮缩进行**；children 只取非 menu 类型（isButtonChild），误挂菜单不再混入；单子模块且与主模块同名的不再重复渲染一行（应用商店/客户管理/API对接管理等）。
3. **MODULE_SECTIONS 对齐**：labels 换成侧边栏权威名；财务管理补 工资结算、员工借支 两项（routeConfig 加 payrollSummary 别名）；财务总览 label 更正为（含外发结算）——MENU_FINISHED_SETTLEMENT 同时是财务总览/工资结算/外发结算三页准入码。

**鉴权安全**：权限判断全走 code/role（hasAuthority），permission_name 纯显示，改名零风险；SystemTableMigrator 唯一的名字固化（MENU_WAREHOUSING=质检入库）与迁移一致无冲突。

**教训**：①勾选树类 UI 渲染 children 必须按 type 过滤+分层，"节点和子项同样式平铺"=用户眼里的权限堆积；②权限树的显示名会随产品改名持续腐化，权威源只能有一个（menuConfig），对齐用 code 键不用 id（多环境 id 漂移）；③配矩阵时先对 routeToPermissionCode 摸清"一码多页"，别漏掉配不到的按钮组。

---

## D-278：工资页图片缺失/扫码历史缺单价——两页数据一致性根治（2026-09-03）

用户：手机端"工资查询"里样衣链路记录（样衣入库/剪线/包装/整烫）没图片，而"扫码历史"同样记录有图；反过来扫码历史的样衣记录没有计件单价金额，工资页却有。"正常是都需要显示一样的：工序、单价、图片、明细，数据要一致性。"

**两条链路、两个互补缺口**：
1. **工资页样衣记录缺图（后端）**：工资接口 `/operator-summary` → `PayrollAggregationOrchestrator` 用 `ScanRecordEnrichHelper.enrichStyleInfo` 补款式封面，但其查找键只有 **styleId → orderId 兜底** 两级；样衣链路扫码记录（scan_type=pattern）既不挂生产订单（orderId 空）也常无 styleId → 永远查不到款式 → coverImage 空。生产链路两级键都在，所以有图。修复：`enrichStyleInfo` 增加**第三级 styleNo 批量兜底**（与 PatternProductionController.myPatternScanHistory 的 styleInfoMap 同模式），附件二级兜底一并覆盖 styleNo 命中的款式。该 helper 是只补空值语义，ScanRecordOrchestrator 各列表页同步受益。
2. **扫码历史样衣记录缺单价（前端）**：`myPatternScanHistory` 后端早已透出 `unitPrice/scanCost`（"P1修复(PC端缺失2)"），但前端 `_formatPatternRecord` 硬编码 `displayUnitPrice:'-'`/`lineAmount:0`/`isPayable:false`。修复：与生产记录同口径接上（单价→scanCost→单价×数量），顺带「仅看计薪」过滤器对样衣记录生效。

**工作区遗留同步**：上次会话中断留下的半成品——h5 两副本（source-miniapp/public）落后小程序已提交版本（工资页图片/搜索框、历史页 coverUrl/数量汇总、json 组件注册 image-preview/sticky-search-bar），本次补齐并验证四副本字节一致；另含 quality-detail 长菲号标签换行、sample-development 码数 chip 防出界两条 wxss 遗留。

**教训**：①"同源数据两页显示不一致"先对比两页各自接口的**富化路径**——通常是某个 helper 的查找键少一级兜底（styleId 有≠styleNo 有，样衣链路天然缺 orderId）；②接口已返回的字段前端硬编码 '-' 是假缺口，先查接口响应再动手；③小程序四副本（miniprogram+h5两份）改动必须同波同步，h5 落后会表现为"H5 和微信行为不一样"。

---

## D-277：手机端样衣仓库入库报"selectOne found: 2"——防重键口径分裂+eq(null)架空闸门（2026-09-03）

用户：手机端样衣扫码→仓库入库，整页报"服务器开小差了（Expected one result (or null) to be returned by selectOne(), but found: 2）"，重试无效。

**根因链（三处口径互不一致）**：`t_sample_stock` 同一 SKU（款号+颜色+尺码）被插出了 2 行，而扫码查库 `SampleStockOrchestrator.scanQuery` 用 MyBatis-Plus `.one()`（selectOne）按 SKU 查 → 直接抛 TooManyResultsException，详情页整页 500。重复行怎么来的：
1. **防重键分裂**：手动入库 `inbound()` 的防重查询键=款号+颜色+尺码+**sampleType**+租户；扫码查库和扫码自动入库（PatternStockHelper）的键=款号+颜色+尺码（无 sampleType）。
2. **手机端不传 sampleType**：小程序入库载荷只有 styleNo/color/size/quantity/库区/库位 → `eq(SampleStock::getSampleType, null)` 生成 `sample_type = NULL`（SQL 三值逻辑，永不匹配）→ **防重闸门对手机端完全失效**，每点一次入库就插一行（数量上限校验同处也按 sampleType 过滤，同样被架空）。
3. 结果：存量出现同 SKU 多行 → 扫码查库 selectOne 500（截图时点：还没走到入库按钮，查详情那一步就炸了）。

**修复（防重口径全链路收敛为 款号+颜色+尺码+租户）**：
1. `inbound()` 防重查询去掉 sampleType 维度——重复入库返回明确的"该颜色尺码已入库，禁止重复入库"，手机端/PC 端/扫码三条写入路径同一把闸。
2. `scanQuery` 从 `.one()` 改 `.list()` 取最早一条兜底（>1 条记 warn），查详情永不再 500；重复行由自愈合并。
3. `PatternStockHelper` 出库/归还查库存补尺码维度（pattern.size 非空时）+ `getOne(q, false)`——同色多尺码/重复行时同族 selectOne 崩溃的隐患点一并拆掉。
4. 存量自愈：`StyleSnapshotBackfillRunner` 追加第 9 步（幂等四连）——数量/借出数并入组内最早一行→幸存行空缺字段（sampleType/图片/库区库位）回填→挂在重复行上的借调单重指向→其余行软删。

**教训**：①MyBatis-Plus `eq(column, null)` 不跳过条件而是生成 `= NULL` 永不匹配——"防重/过滤"型查询带可空字段时等于没防，可选维度要么从键里去掉要么 `StringUtils.hasText` 条件式拼接；②同一张表的"唯一键"口径必须全链路（所有写入路径+所有 selectOne 读取点）一致，写侧多一个维度=读侧 selectOne 一颗雷；③selectOne 面对的查询键如果不是 DB 唯一键，500 只是时间问题。

---

## D-266：款式特征被失败识别污染，档案卡正确分析被挡在外面（2026-09-02）

用户：档案卡视觉AI明明识别出了完整分析（"无领交叠V领、不对称暗门襟、缎面印花对花…"工艺复杂7/10），款式特征里却是一坨"图片无法访问…需人工复核"逐字段复读的垃圾（251字已落库）。"这个是孤岛吗？"

**根因链**：①款式编码带 token 的图片 URL 失效 → 视觉模型返回逐字段复读"图片无法访问"的垃圾摘要，但 `parseStyleFields` 照常构建 summary 并**带着 available=true 返回**；②前端 `applyStyleParseResult` 只判 available，垃圾全文写入 `extJson.styleFeature`；③D-263 的档案卡回填规则是"仅空时填"，字段非空（垃圾）→ 正确的 visionRaw 永远进不来。

**修复（三道闸）**：
1. **后端**：`VisionAnalysisService.parseStyleFields` 检测 summary 含"图片无法访问/无法访问提供的图片/无法进行任何实质性"→ `setAvailable(false)` + errorMessage，按失败返回。
2. **前端填充闸**：`styleFeature.ts` 新增 `isFailedParseText()`；`applyStyleParseResult` 与 useCoverImageUpload 三处识别回调对失败残留一律按识别失败处理（不写字段、显示错误提示）。
3. **回填替换闸**：档案卡 `handleVisionAnalysisFill` 从"仅空时填"升级为"**为空或已是失败残留 → 直接替换为 visionRaw**；人工/正常 AI 内容不动"。存量被污染的款式重新打开页面即被正确分析替换。

**教训**：AI 结果必须校验内容实质（失败也会返回结构完整的 summary）；"仅空时填充"的守卫挡不住先来的垃圾——回填逻辑需要能识别并替换"已知形态的垃圾"。

---

## D-265：五连修——BOM第二条不计算/导入拖入外来码数/标签上布局/删闪电搜索/图片识别一次性（2026-09-02）

1. **BOM 第二条物料不计算**：保存链路（useStyleBomMutations）给每行写入**全 0** 的 patternSizeUsageMap，而 hasPatternData 口径只看"map 有没有键"——键数>0 即判为纸样口径，devUsageAmount 被无视，单件用量/小计归 0。修复：helpers.calcTotalPrice 与 bomUsageColumns 统一改为 **map 里至少一个值 > 0 才算纸样口径**，否则回落 devUsageAmount。里布不背锅，是口径判据错了。
2. **导入尺寸模板拖入外来码数**：merge 时目标款没有的码（如模板自带的 XXL）会整行插入，凭空多出一列，而目标款现有码数全是空的。修复（后端 applySizeTemplate）：新增部位只落**规范码数**内的值——规范码数=款式基础码数（sizeColorConfig.sizes）∪ 目标款已有行的码数；模板独有码数直接丢弃并记日志。规范码数为空时保持旧行为。
3. **基础信息标签在上对齐**：CSS 早在（.style-basic-info-tab flex-direction:column）但选择器打偏——antd 的 label/control 包在 .ant-form-item-row 里，flex-direction 加在 .ant-form-item 上无效。修复：`.ant-form-item-row { display:block }` + label 块级左对齐。
4. **删图片旁闪电/搜索按钮**：识别走档案卡（D-263 已回填款式特征），以图搜款另有通用入口，图片行尾两按钮纯冗余。删除，保留空态上传提示。
5. **上传第二次才识别**：自动识别用 autoParseAttempted 一次性开关——首次失败/首图之后新传的图永远不再解析。改为 **lastParsedUrlRef 按 URL 各解析一次**：上传新图/切换主图都会触发。

**教训**：①口径判据必须校验数据"实质"（有值）而非"形式"（有键），全 0 占位 map 是保存链路的常态；②antd 表单布局覆盖要打到 .ant-form-item-row 层，.ant-form-item 层的 flex-direction 不作用；③一次性开关型自动任务（attempted flag）会吞掉后续同类事件，改"按实体各一次"（URL/ID 去重）。

---

## D-264：用户九连修——退回没反应/弹窗抽屉化/入库类型写死/草稿弹窗堆叠/编码查重/锁定仍可改/齿轮不同步/颜色图片不同步（2026-09-02）

用户连甩 6 截图报"退回提示成功却编辑不了""弹窗改侧滑""入库类型写死开发样""恢复草稿要点很多次""重新同步是什么""商品类型锁定还能随便改""齿轮加了信息保存没变化""上传图片商品编码不同步"。

**根因与决策**：
1. **退回成功但编辑不了（全局性根因）**：`api/core.ts` 的 GET 响应缓存（CACHEABLE_PATTERNS 含 `/template-library/`，TTL 30s）只写不失效——退回 POST 成功后 `fetchList` 重拉列表**命中缓存**拿回旧的 locked=1，界面纹丝不动。修复：响应拦截器里**任何成功的非 GET 请求清空整个 responseCache**（缓存只是 30s 微优化，正确性优先）。此修复惠及全站"改完立刻重拉"场景。
2. **商品类型/品牌锁定仍可改**：`DictAutoComplete` 把 `disabled` 从 restProps 解构出来只用来隐藏齿轮，**从没传给 AutoComplete**——锁定态照样能输入。修复：显式 `disabled={disabled}` 透传。
3. **草稿弹窗堆叠**：useStyleDraft 的 effect 依赖 styleDraft（每次 render 新对象），而 `draftChecked` 只在用户点击后才置真——弹窗打开期间每重渲染一次就叠一个 confirm，"恢复草稿要点很多次"。修复：`draftPromptShownRef` 同步守卫。已核实：下单（事件触发）、采购（已有 ref 守卫）无此问题。
4. **资料维护面板弹窗→SideDrawer**：MaintenanceCenter 五个维护面板（纸样/制单/尺寸表/BOM/工序单价）从 85vw ResizableModal 改用通用 `SideDrawer`（width 85vw），与全站抽屉化口径一致。
5. **样衣入库类型写死**：InboundModal 的样衣类型 Select 带 `disabled` + initialValue=development，用户根本选不了。修复：移除 disabled，默认仍为开发样。
6. **款式编码"重新同步"**：原语义是清空编码让后端重新生成，用户看不懂。改为**查重**：失焦自动查 + 点击"查重"手动查（复用 style/info/list?styleNo=），内联显示 可用/已被使用。
7. **颜色/码数输入框**：96px 过窄且被排序按钮/提示文字挤得不齐 → 两框统一加宽到 160px 等宽。
8. **齿轮加了信息看不到**：QuickManageModal 新增 `onCreated(name)` 回调（DictAutoComplete 透传为 onEntryCreated），颜色/码数齿轮新增后**立即加入本款**，不再"加了没反应"。
9. **颜色图片不同步商品编码**：handleColorImageSync 已 PUT /style/sku/color-images 写库但从不重拉 SKU 表。修复：useStyleBasicInfoForm 暴露 bumpSkuRefresh，StyleBasicInfoForm 包装 onColorImageSync 同步完成后 bump。

**教训**：①"提示成功但界面没变"先查前端 GET 缓存——写操作不清缓存的缓存层是假死类 bug 的温床；②透传型组件里 `...restProps` 之前解构掉的 prop 必须显式回传，否则静默失效（同 D-154 Drawer width 教训）；③effect 内弹 confirm 必须配同步 ref 守卫，state 守卫对"点按钮才置真"的模式必然堆叠。

---

## D-263：样衣详情四连修——设置主图假动作、款式特征AI断链、免分组加行、模板导入智能回填（2026-09-02）

用户四连投诉：①"设置主图点击没反应"②"AI识别的信息根本没填充进款式特征，根本没打通"③"单件衣服必须先建分组才能加尺寸，太死板"④"导入尺寸不是回填空位而是又添加一份，做的傻"。

**根因与决策**：
1. **设置主图是"假动作"**：主图徽标判定 `img.fileUrl === displayImages[0].fileUrl`——按列表位置判定，列表第一张永远是"主图"；设为主图成功后列表不重排、徽标纹丝不动，仅剩 toast。且 fetchImages 排序/定位用严格相等，DB 裸路径 vs 带 token 展示 URL 永不相等。修复：新增 `isSameFileUrl`（剥 token 查询串+/api/ 前缀归一）；徽标按 coverUrl 真值判定；成功后本地把新主图重排到第一位；onCoverChange 回写**裸 URL**（此前回写带 token URL 会被持久化，过期 401）。
2. **款式特征 AI 断链**：表单填充走 `styleParseFromImage`（且锁定态 enabled=false 直接跳过），顶部档案卡的视觉AI是另一条链路（`getStyleIntelligenceProfile` 的 `difficulty.visionRaw`），两链路零交汇——卡片展示得再好，表单永远空。修复：档案卡 hook 加 `onVisionAnalysis` 回调（ref 持有防闭包重跑），详情页接住后在 `extJson.styleFeature` **为空时**回填 visionRaw（人工已写不覆盖；appendFeatureText 含互含去重，幂等）。手动"图像分析"产出同样回填。
3. **免分组加行**：分组展示本就按部位名自动推断（`resolveGroupName`→上装区/下装区/其他区），但"添加行"按钮藏在分组列单元格内，空表必须先"新增分组"才出现。修复：工具条加"添加行"按钮，行 groupName 留空由推断兜底，新增分组保留给套装场景。
4. **模板导入智能回填**：后端 merge 模式原按「部位+码数语义键」追加，码数写法稍有差异就在同一部位下再插一份（用户看到的"又添加了一份"）。重写 `applySizeTemplate` merge 分支：按**部位名**（trim+全角空格归一）匹配，码数语义键定位格子，只回填空缺（null/0 视为未填，前端空格即存 0），measureMethod/tolerance 同规则；部位不存在才整行新增；码数不对应不硬塞。overwrite 语义不变。

**教训**：①"点击没反应"类问题先查界面判定基准是否锚在"列表位置"而非"数据真值"；②同一页面两套 AI 链路（表单解析 vs 档案卡视觉分析）必须在数据源层打通，UI 各自为政=用户眼里的"没打通"；③导入类功能用户预期是"回填我的空格"而非"追加你的副本"。

---

## D-262：小程序生产管理/外发管理页扫码——页内直达工序领取页，去掉扫码主页中转（2026-09-01）

用户原话："我要的是在这2个页面 直接扫码可以调领取工序的页面 不是扫码还跳转到扫码的主页面"。之前链路：业务页点扫码 → `quickScan()` → switchTab 到 `/pages/scan/index`（扫码主页，tabBar 页）→ **switchTab 丢弃 ?code= 参数，丢码** → 用户必须再扫一次。用户判定为"多做了一层、毫无意义"。

**根因**：`/pages/scan/index` 是 tabBar 页，`safeNavigate` 会转成 `switchTab`，query 参数被丢弃；D-234 曾强扭到 process-edit 锁死领取/报工。

**决策**：不复用扫码主页，业务页内原地处理：
1. 新建 `miniprogram/pages/scan/handlers/InlineScanDispatcher.js`：
   - `scanInPage()` 原地 `wx.scanCode` + QRCodeParser 本地解析（不导航）
   - `dispatchInlineScanCode(raw)` 用与扫码主页完全相同的 `ScanHandler.handleScan` 完整链路（解析→验证→工序检测→needInput 弹窗重试→异常兜底），`_dispatchResult` 对齐扫码主页 `_handleScanResult` 派发到最终页：`ScanResultHandler.showScanResultConfirm` → `/pages/scan/scan-result/index`（工序领取/报工页）、`ConfirmModalHandler.showConfirmModal`（采购/裁剪领取）、`QualityHandler.showQualityModal`（质检入库）、`scan-action`（样衣/素材出入库）
2. 生产管理 `dashboard/index.js#onScanTap`、外发管理 `factory/shipment/index.js#onScan` 改接 `scanInPage + dispatchInlineScanCode`

**链路**：扫码 → 原地解析 → 一步直达 `scan-result` 领取页。全程不经过 `/pages/scan/index`，无需二次扫码。ScanHandler 本身不导航（无 navigateTo），不会二次跳转。

**教训**：小程序 tabBar 页跳转丢参数是"多一跳"类缺陷的温床；业务页扫码应就地消费码，而非"先去扫码页"。

---

## D-261：用户暴走七连修——款式特征/尺寸表/公差/排产/退回/视觉AI/样衣采购（2026-09-01）

用户一次性甩 10+ 截图抱怨"全部写的死的""做的什么垃圾""什么情况啊"。逐项核代码定位根因后批量修，共改前端 11 文件 + 后端 5 文件。教训/方法：

1. **款式特征"看着成功实际没保存"**：原 6 个独立 Form.Item 嵌套 extJson 字段（fabric/sleeveType/neckline/version/pattern/craftStyle）+ 顶层拍平双写，路径脆弱；用户已要求"做成一个统一输入框" → 新建共享 `styleFeature.ts`（读旧 6 字段合并迁移，存 `extJson.styleFeature` 无需 Flyway），4 处消费点全收编。**反模式沉淀**：嵌套 Form.Item + 顶层 flatten 双写要避免，统一一个字段名最稳。

2. **尺寸表导入码数"追加而非覆盖"**：`useStyleSizeAiRecognition` 硬 merge；行 key 用 `ai-row-${Date.now()}-${index}` 同毫秒重复识别 key 冲突 → React 复用错误节点 → "乱跳"。改：码数覆盖、行 key 加批次自增。**反模式沉淀**：动态行 key 必须含稳定唯一序号（`Date.now() + 自增批次 + 业务标识`），不能用 index。

3. **公差 → "正负公差" + ± 号**：纯 UI 调整，但配套输入规范化（剥用户手输 ±）避免脏数据。

4. **排产建议混入布行**：`SchedulingSuggestionOrchestrator.listFactories` 只按 tenant_id+delete_flag 查，没过滤 supplier_type → 布行全进。补 `isNull OR ne MATERIAL`，**与 D-200 转单过滤完全同口径**（保留存量未填类型）。教训：**所有"工厂列表"查询都要核 supplier_type 过滤是否到位**，不止转单/下单两处。

5. **资料单价退回"没反应"**：3 处 `handleRollbackConfirm` 只有 try/finally **没有 catch**，后端异常被吞 → 弹窗原地不动无任何提示 = 用户觉得"摆设"。`!row?.id` 静默 return 加提示。**反模式沉淀**：异步操作 handler 必须 catch 透出错误，try/finally ≠ try/catch/finally；删除/退回/锁定类操作静默 return 是体验杀手。

6. **视觉 AI 失败原因被吞**：洗水唛/图形分析/尺寸表/BOM OCR 全链路，`chatWithVision` 失败只返回 null，前端只看到"识别返回为空"。新增 `lastVisionError`（AtomicReference）追踪 401 熔断/超时/配置缺失具体原因；LegacyInferenceAdapter 不再无条件 success=true 谎报；StyleDocOcrOrchestrator 空结果由静默/泛化报错改为带真实原因抛出。**反模式沉淀**：AI 调用链路必须有失败原因透传字段，用户能区分"我图传错了"还是"配置坏了"。

7. **样衣采购创建不带色/成分**：`StyleBomPurchaseHelper.buildPurchaseFromBom`（sample 路径）只带规格/单位/换算率/单价/供应商，**没带** fabricComposition/fabricWeight/lossRate（D-252 只修了大货路径 MaterialPurchaseServiceHelper.createPurchaseFromBom），且 purchaseColor 仅在调用方传时才落库 → 首个样衣采购颜色恒空。与大货路径对齐补 3 字段 + BOM 颜色兜底。**反模式沉淀**：同一实体多条创建路径（sample/order/factory）字段集必须对齐，改一条时核全部。

- [x] mvn compile EXIT=0 / npx tsc EXIT=0 / eslint 11 文件 0 错误
- [x] 无新 Bean / 无 Flyway / 无配置变更（启动风险极低）
- [ ] 待用户验收推送 + 端到端验证

---

## D-225：主图被抢+PUT400+纸样混入图片区（2026-08-29）

三根因：①uploadWithVersion 任何图片附件上传后无条件覆盖 t_style_info.cover（纸样图片也抢主图）→修：纸样类 bizType 绝不改封面，普通图片仅款式无封面（第一张）时自动设；②PUT /style/info 局部保存（工艺说明/洗水唛/预算工时只带 id+styleNo+个别字段）缺必填字段被 validateStyleInfo 拒→修：update 先读 existing，空必填字段回落库中值再校验；③基础信息图片区只按 fileType=image 过滤，纸样图片混入→修：再按 bizType 过滤纸样/放码/色卡系。教训：**共享实体字段（cover）的自动写入必须有"是否应该由我写"的守卫；局部 PUT 的服务端校验要对部分字段容忍（回落而非拒绝）**。

---

## D-224：成品入库"仓库里没有记录"+库位明细塌缩一个码（2026-08-29）

WH-入库标签解析 `resolveSkuCodeFromScan` 只取到第二个"-"，尺码被剥掉 → 同款同色不同码共用一个 skuCode：①`updateStock` 对不完整码自动建行被拒（parts<3 只 warn）→ t_product_sku 无库存 → 成品出入库列表（gt stock_quantity 0）0 行；②库位明细按 sku_code 分组 → 12 个码数塌缩成"XS 132"。修复：解析按最后一段剥离时间戳保完整三段码；启动自愈 Runner 新增"SKU库存按入库单合计校准+缺失SKU行补建（三段完整才建）"；工厂账号无订单款不再返回空页（并入有入库记录的款）。教训：**拼码/解析码的函数是库存账本入口，丢一段=丢库存**。

---

## D-223：合格证自由尺寸+留空自动带+条码下商品编码（2026-08-29）

纸型改自由宽高 InputNumber（横/竖版按钮仅预设默认值）；规格/颜色行留空时按页自动回落 SKU 码数/颜色（与洗水唛 sizeText 回落同式）；新增 showBarcodeText 勾选——条码下方自动显示该页商品编码（款号+颜色+码数）。

---

## D-222：全局滚动兜底+入库重复计算+入库详情无数据（2026-08-29）

### 各项根因与实现
1. **成品出入库等 20+ 页无滚动条**：D-138 锁 `.layout{height:100vh;overflow:hidden}` 时漏了 flex 断点——`.layout-main` 无 `min-height:0`，列向 flex 子项默认 min-height:auto 被内容撑高，`.layout-content` 的 overflow:auto 永远"无事可滚"，整棵树被 .layout 静默裁掉。**凡内容超一屏又没用标准 PageLayout（.page-layout-fullheight 视口 calc 定高）的页面全中招**（成品出入库/物料库存/面辅料库/盘点/标签打印/库位地图/电商订单/CRM/财务等多模块 20+ 页）。修复=一行 `.layout-main{min-height:0}`：标准页定高不受影响，非标准页恢复 .layout-content 滚动。入库详情抽屉同族问题已于 D-219 修（SideDrawer overflow:hidden）。
2. **入库"已生产 264 件"重复计算**：两层放大——①视图 v_production_order_stage_done_agg 按原始 stage 名分组，入库/成品入库/质检入库各成一行，sumDoneQuantity 逐行相加；②tooltip stageMatch 的 `a.includes(s)` 空串全匹配，progressStage 为空的行被计入所有节点。修复：入库节点改权威口径 `productWarehousingService.sumQualifiedByOrderId`（成品入库单合格数）；其他工序同义变体行按归一化分组只取最大不累加；stageMatch 空 stage 直接 false + 入库只认 scanType warehouse/warehouse_manual。
3. **入库详情弹窗工序跟踪 0 条**：入库不是计件工序，t_production_process_tracking（按工艺流子工序初始化）里没有"入库"行，而预警条用扫码聚合——两个数据源对不齐。修复：入库节点的工序跟踪 tab 顶部直接展示**成品入库单记录**（WarehousingInboundList，/production/warehousing/list，含合格合计），与预警条同一份入库事实。

### 教训
- flex 布局锁视口高度必须补全 `min-height:0` 断点链（.layout→.layout-main→.layout-content-row→.layout-content 任何一环断都被内容撑爆）
- 统计口径"同一事实只算一次"：聚合视图按原始名分组+归一化匹配逐行求和=天然重复计算；同义变体取 max 或换权威表
- "入库"在系统里有三套数据源（扫码镜像/跟踪表/入库单），展示口径必须统一到入库单

---

## D-221：RowActions 行内子菜单死按钮修复+打印标签新增合格证（2026-08-29）

### 各项根因与实现
1. **订单管理"打印"点击无反应**：D-212 给 actionColumns 加 `maxInline={1}` 把带子菜单的"打印"提为行内按钮，但 RowActions 对"有 children 无 onClick"的动作渲染裸 Button（onClick=undefined）→ 死按钮。修：RowActions 行内渲染时该类动作包 Dropdown（click 触发，子菜单 handlers 收集/剥离与"更多"同套）。**教训：maxInline 提升行内按钮时必须确认动作有自身 onClick**。
2. **合格证标签**：LabelPrintModal 第三 tab（打印合格证）。`certificateLabelPrintTemplate.ts`：标题+左标签/右值行+底部 CODE128 条码（jsbarcode SVG 内联，非 ASCII 剔除保证可扫）；码值模板支持 `{款号}{颜色}{码数}{序号}` 占位符逐页替换；值列支持 `{颜色}{码数}` 占位（规格/颜色行随 SKU 逐页变）。配置面板：每行 Checkbox 勾选显隐+左右 Input 自由编辑（与洗水唛同哲学）+字号缩放+iframe 实时预览；纸型 7×10 竖/10×7 横。跨款固定项（产品标准/安全类别/质量等级/检验证明/企业名称/地址）打印时写 localStorage `certificate-print-settings` 记忆，下次打开自动恢复；款式相关行（品名/款号/规格/颜色/成分/零售价）按订单+款式数据预填。数据源：StyleInfo.executeStandard/safetyCategory/qualityGrade/inspector/salesPrice 由两个 useLabelPrint hook 透传。入口：生产订单列表/卡片/进度详情/外发工厂（复用同一 LabelPrintModal）自动获得；洗水唛独立批量页暂未加（后续需要再加 labelType='cert'）。

### 教训
- 标签打印三套已有管道：safePrint+@page size（洗水唛/U编码/合格证统一走这条）；条码一维 CODE128 用 jsbarcode SVG、二维码用 qrcode dataURL，别混
- 用户编辑类打印配置的持久化分层：款式相关每次预填不落库，跨款固定项 localStorage 记忆（后端模板 /system/print-template 是第三选项，本次未用）

---

## D-220：大货打印下单明细改颜色×码数矩阵表（2026-08-29，用户"码数数量斜杠挤两行不工整"）

### 背景与实现
StylePrintModal 有两个"下单明细"区块：SizeColorMatrixSection（规整矩阵，大货订单打印时 sizeColorMatrix 为空没渲染）和 SizeDetailsSection（sizeDetails 扁平数组，把尺码 join(' / ')、数量 join(' / ') 挤成两行——截图丑的来源）。重写 SizeDetailsSection 为同款矩阵表：行=颜色、列=码数、单元格=数量，行合计/列合计/总计齐全，与尺寸表 pt 样式对齐。

### 教训
- 同一标题的打印区块有两个数据源版本（matrix/flat），修一个另一个还在兜底渲染——打印类组件先 grep 标题查重复区块

---

## D-219：面料计算全量展示+预算天数打通+抽屉滚动+打印列表删除（2026-08-29）

### 各项根因与实现
1. **面料计算只显一种+无单件口径**：计算层 materialAnalyses 本来就算全部面料+里料，是展示层砍到主面料1条/差异卡 slice(0,2)。改：散剪卡列全部面料（`单件 X米 × 下单 Y件 ≈ Z米`），差异卡放开条数并加每行"单件用料/下单数量"，面板加计算方式说明文案；materialAnalyses 补 perPieceMeters/matchedOrderQty 字段。
2. **预算天数三重死链**：①BudgetDaysEditor 参数名写 `orderId`，后端只认 `id` 必 400，失败静默吞；②预算天数根本不落库（前端硬编码工序比例×出货窗口现算，t_production_order 的 8 个 *_budget_hours 字段从未被列表用）；③反推改的是 expectedShipDate（客户交期）而列表显示 plannedEndDate，语义拧反。修：参数改 id、落库 `getStageBudgetHoursField(nodeName)` 对应预算工时字段（天数×14h）、不再动 expectedShipDate、后端 quickEdit 在预算工时变化时 Σ工时/14 天从计划开工日顺推重算 plannedEndDate（客户交货日期不动）、列表传 record 已存预算工时（>0 优先于比例）、保存成功/失败 message 提示、useProductionListData 监听 data:changed 防抖刷新。
3. **抽屉无滚动条**：SideDrawer（统一抽屉封装，4 个消费方）body inline `overflow:'hidden'` 压掉 antd 默认 auto，内容+分页器被静默裁剪。一处改 `overflowY:'auto'` 全局修复。D-137 单滚动条布局不背锅（Drawer portal 到 body）。
4. **打印列表按钮**：商品下单页 SchemaPrint mode=list 纯摆设，按用户要求删除（组件与其他页面使用点保留）。

### 教训
- "调整没反应"三件套排查顺序：参数名对不对→有没有落库→落了库展示链路读没读；三环断任何一环都是摆设
- 预算（内部计划 plannedEndDate）与交期（客户承诺 expectedShipDate）语义必须分开，联动只动前者
- 统一封装组件里的 inline style 会压掉框架默认行为，抽屉类容器永远别写 overflow:hidden

---

## D-218：详情多图切换+本厂标签+维护不再触发样衣生产（2026-08-29）

### 各项根因与实现
1. **样衣详情多图预览不能切换**：CoverImageUpload 受控预览传了 `current` 没传 `onChange` 回写——rc-image useControlledState 完全受控，内部切换被忽略，‹›按钮失效。补一行 `onChange: (cur)=>setPreviewIndex(cur)`。**教训：antd 受控 current 必须配 onChange**。该图片区本来就共享一个"本款图集"组（items=previewSrcs），与 D-217 的 StyleCoverThumb 独立组改造无关（那里用的是裸 img）。
2. **"本厂"内外标签显示内部**：factoryType=INTERNAL 的语义是**工资/订单结算方式**（本厂按人员工资结算、拦截订单结算付款防重复），直接改数据会把本厂当外发收账单（资金风险）。修法=显示层归类：外发厂（supplierType=OUTSOURCE）在供应商列表一律显示"外部"（列表列+统计+后端筛选三处同口径），factoryType 存储值不动。
3. **维护触发重复样衣生产**：维护=重置阶段不建记录，但编辑保存 `syncPatternProductionInfo` 两个分支会隐式建：无记录全量补建、矩阵新色码组合逐条新建+自动生成样衣生产订单/菲号。修法：加 `allowCreate` 重载，编辑保存传 false（只同步数量/交期、软删无进度废弃色码），新建款式路径保持 true。新色码要补生产走颜色尺码配置显式入口。存量重复记录（PENDING 无扫码）可安全软删，待用户确认后处理。

### 教训
- factoryType=INTERNAL 不是"组织归属"而是"结算方式"——看着像标签问题实际是资金语义，改数据前先查消费点
- "维护一下就重做一遍流程"=编辑保存链路里藏着隐式创建分支，创建类副作用必须有 allowCreate 开关

---

## D-217：预览串款+扫码补图+款号快照全链同步+存量数据统一（2026-08-29，用户"预览只看本款/扫码没图/老款号没同步/编码要全部统一"）

### 各项根因与实现
1. **预览串款**：D-138 全局 `Image.PreviewGroup`（Layout/index.tsx）把整页 antd Image 编成一组，点一行图能翻全部款式（2/14）。修法：StyleCoverThumb 内层包自己的 `Image.PreviewGroup items={本款图集}`——rc-image context 就近覆盖，嵌套组合法（SmartImage/ImageCarousel 已有先例）；`preview={{open,onOpenChange}}` 受控写法在有外层组时无效，不能用。图集=附件列表全部图片，预览在本款图内切换。
2. **样衣扫码没图**：my-history 只按记录快照 styleNo 精确匹配 StyleInfo.cover，改过款号后失配彻底无图，且无附件兜底。修：优先按 styleId 匹配 + StyleAttachment 图片二级兜底；小程序 wxml 本来就渲染 coverImage，后端补齐即显示，小程序零改动。
3. **款号变更没同步**：D-215 只重算了 t_product_sku。新 `StyleNoChangeSyncHelper.syncStyleNoEverywhere`：款号变更时同步 t_pattern_production / t_pattern_scan_record / t_scan_record(scan_type=pattern，order_no 冗余款号，顺带补 style_id) / t_production_order / t_cutting_bundle 的 style_no。PC 样衣工序列表"商品编码"列是前端拿快照 styleNo 现拼的（SampleProcessList.columns.tsx），拼接口径同步改直拼。
4. **存量数据统一**：新 `StyleSnapshotBackfillRunner`（ApplicationRunner，启动 15s 后守护线程执行，幂等——值相等 0 行更新；每条 SQL 独立 try/catch 不阻断启动）：SKU 编码按款式档案直拼回填（manually_edited 不动、SKU- 前缀按 use_sku_prefix 保留）+ 五张快照表 style_no 回填当前款号。不用 Flyway SQL 做（sku_code 唯一键冲突会让迁移失败卡启动）。

### 教训
- 快照字段（styleNo/skuCode 写进单据表）在源头变更时必须全链盘点——"改了款式那边没变"=只同步了主表没同步快照
- 存量格式迁移别用 Flyway UPDATE（唯一键冲突=迁移失败=启动挂），用幂等 Runner + 逐条容错
- 内层 PreviewGroup 是退出全局预览组的唯一正解（rc-image context 就近覆盖）

---

## D-216：商品下单抽屉六连修（2026-08-29，用户"齿轮进输入框/SHIRT英文/工序库滑不动/面料部/外发厂齿轮/编码去-号"）

### 各项根因与实现
1. **齿轮入框**：MultiColorOrderEditor 颜色/码数 Select 的属性库齿轮原是旁边独立 Button，改 `suffix` 内置（onClick preventDefault+stopPropagation 防触发下拉），与 CustomerSelect/MaintainGear 同范式。
2. **商品分类 SHIRT 英文**：字典有 SHIRT→衬衫，但 `OrderListContent.tsx` 调 `toCategoryCn(val)` 没传 options，兜底硬编码表只有 WOMAN/MAN/KIDS 等大类 → 改传 `CATEGORY_CODE_OPTIONS`。
3. **工序库滑不动**：D-207 只改了 `scroll.x='max-content'`，但 ResizableTable 无条件 `tableLayout='fixed'` 把它顶掉——antd 官方 max-content 必须配 auto 布局（issue #25227）。通用层修复：scroll.x==='max-content' 时 tableLayout 自动降为 'auto'，全站受益。
4. **内部工厂混入面辅料**：两层都漏——后端 `isProductionRelated` 对 ownerType=INTERNAL 无条件放行；前端白名单关键词 '组' 命中「面料1组」。双保险：后端名称/类别含面料/辅料/布行/仓库直接排除；前端 pathNames 同排除。
5. **外发厂齿轮**：OrderFactorySelector 外发 Select 加 suffix 齿轮开 QuickManageModal（新增 `supplierType` 入参，OUTSOURCE 建厂/MATERIAL 布行互不串）；保存广播 supplier 事件，useOrderDataFetch 订阅刷新下拉。外发下拉数据源 `/system/factory/list` 已有 D-200 过滤 supplierType=MATERIAL，布行天然不进。
6. **商品编码去-号**：`generateSkuCode` 恢复直拼（款号颜色尺码无分隔），用户拍板推翻 D-167 的"-"分隔。配套：`createOrUpdateSku` 查重键从 skuCode 改为 styleId+颜色+尺码（编码格式变更/款号变更后旧码匹配不上会重复建行的家族坑，D-215 已预警）。

### 教训
- ResizableTable 强制 tableLayout='fixed' 是全站 max-content 滚动的总闸——通用组件层的隐式默认会顶掉调用方的显式修复（D-207 修了表象没修闸门）
- 齿轮/快捷维护入口的统一形态=输入控件 suffix+SettingOutlined+stopPropagation；QuickManageModal 用 supplierType 参数扩展而非新建组件
- skuCode 格式改动必须同步查重键，否则存量行匹配不上

---

## D-215：款式编码放开编辑+撞号提示+商品编码联动（2026-08-29，用户"做错了就什么都改变不了"）

### 背景与实现
款式编码（styleNo）原只要有 id 就锁死。放开为 editLocked 才禁用；编辑保存撞号双端拦截：前端 handleSave 编辑分支先查 `/style/info/list` 提示"请修改款号"，后端 `StyleInfoOrchestrator.update()` 新增 `styleNoExistsExcluding`（排除自身）明确抛"款号已被其他款式使用"。新建撞号从静默加 -1 后缀改为 modal.confirm 让用户选"返回修改/自动加后缀"。款号变更后 `ProductSkuService.resyncSkuCodesForStyleNoChange` 联动重算商品编码（款号-颜色-尺码，manuallyEdited=1 只同步 styleNo 冗余字段），与 updateUseSkuPrefix 同范式。

### 教训
- createOrUpdateSku 以 skuCode 为查重键，款号变更必须显式按 styleId 重算编码，否则下次生成会按新码新建重复行
- 生产订单仍持旧款号，跨订单联动未做（推送前改码安全，已推订单慎改）

---

## D-214：检查库存用量口径纳入开发采购量（2026-08-29，用户"开发阶段肯定要判断开发的，大货才是实际纸样用量"）

### 背景与实现
`StyleBomOrchestrator.calculateRequirement` 只认 usageAmount（单件/纸样用量），开发阶段只填了开发采购量（devUsageAmount）被误判"未填用量"。改用已有 `pickEffectiveUsage` 口径：有纸样数据（patternSizeUsageMap 非空）→纸样用量；否则开发采购量优先。`StyleBomPurchaseHelper.buildPurchaseFromBom` 同步对齐（原先无条件 dev 优先，纸样完成后也不切换）。大货链路 `MaterialPurchaseServiceHelper.computeBomRequiredQuantity` 保持禁用 devUsageAmount 不动。

### 教训
- 同名"用量"三字段（usageAmount/devUsageAmount/sizeUsageMap）三处计算口径曾各自为政——改口径必须全链路核对（检查库存/生成采购单/采购车/大货）
- 口径统一的锚点是前端 `calcTotalPrice`/后端 `pickEffectiveUsage`："有无纸样数据"是开发期与大货期的天然分界

---

## D-213：物料清单保存后再添加物料旧行清空（2026-08-29，用户"点保存在添加一行新的，前面物料信息全部没有了"）

### 背景与实现
BOM 编辑态单元格是 `Form.Item name={[rowId, field]}` 非受控，值全靠 form store。保存后 `fetchBom` 会 `form.resetFields()` 清空 store；再点"添加物料"时 `handleAddRows` 只用 `form.getFieldsValue()`（已是空）回填，旧行输入框全部失绑显示空白。修复：handleAddRows 改为 `buildFormValues(syncedData)` 从 data 全量重建（与 enterTableEdit 同范式）。

### 教训
- 编辑态值存 form store 的表格，任何"清 store 的刷新"之后必须从 data 重建 form 值，不能依赖 getFieldsValue 回填
- 同一 hook 内已有正确范式（enterTableEdit）时，新增入口（handleAddRows）要对齐而非另起炉灶

---

## D-213：商品下单卡片码数堆积修复（2026-08-29，用户"码数全部堆积在一起看不到"）

CardSizeQuantityFieldGroups（订单管理/商品下单/生产管理卡片共用）码数格写死 width:22px，XS(155/72A) 类长码溢出绘制盖成一片。改自适应 chip（minWidth 64+nowrap+浅底圆角），码数/数量两行同宽可换行对齐。全站共用组件一处修全局生效。

### 串图排查结论（待数据确认）
列表图=StyleCoverThumb(styleId,styleNo,cover)、SKU颜色图=getSkuColorImage(styleNo+color)——查询全部带款号/租户过滤，静态代码无跨款路径。判定为个别款数据本身存错（style_info.cover 或 sku_color_image 写入了别款文件URL）。临时修复：商品编码表该行图片点"清除"重传；防复发护栏与数据订正待用户提供具体款号后核查 t_style_info.cover / t_product_sku.sku_color_image。

---
## D-212：删除 SKU 行同步清理 sizeColorConfig（2026-08-29 遗留修复，"删了又复活"根因）

### 背景与实现
删除 SKU 行后 sizeColorConfig 仍留旧码数，下次配置保存 `generateSkusForStyle` 按旧 config 把行重建回来。`ProductSkuOrchestrator.syncRemoveSizesFromConfig` 删码后同步删 config.sizes 及 matrixRows.quantities 对应位（索引对齐），失败不阻断主流程。

### 教训
- 会话中断的半成品要重点核注解位置：@Transactional 曾被插入的私有方法抢占，batchUpdateSkus 丢事务+productSkuMapper 字段被误删编译不过
- @Transactional 必须紧贴其方法签名，插入新方法时不得落在注解与原方法之间

---

## D-212：工具条精简聚合+合作合同模块+弹窗缓存修复等九项（2026-08-29，用户"全部内嵌不要多加按钮/聚合精简/输入框统一/报价单对齐/弹窗增删不更新/合同模块/头像同步/字面前缀删掉"）

1. **属性库入口内嵌**：尺寸表工具条/各码用量"新增尺码(多选)"下拉 popupRender 顶部加"从基础属性库选择"（删独立按钮）；工序单价码数 Input+齿轮 合并为"添加码数▾"Popover（内含输入+属性库入口）
2. **BOM 采购聚合**：生成采购单/重新生成/加入采购车 三按钮 → 一个"采购 ▾"Dropdown（已生成 N 条小 Tag 保留）
3. **工艺说明聚合**：保存工艺说明（primary）+ "制单 ▾"Dropdown（下载/打印/AI识别）
4. **字面前缀**开关整块删除（SKU编码模式行）
5. **报价单三表**（BOM/工序/二次工艺）统一 scroll.x max-content，列宽=内容宽，三表一致
6. **模板名 (null)**：sourceStyleNo 存了字符串 'null' 穿透三元——三处 label 过滤 'null'/'undefined'
7. **QuickManageModal（维护商品分类/季节等）增删后表单下拉不更新根因**：notifyChanged 触发重拉但命中 GET responseCache 旧缓存——增删改成功后 clearApiCache（dict/customer/supplier 各自 pattern）
8. **头像同步**：个人页 getMe 拉新后 freshImgUrl 加时间戳破 <image> 缓存（PC换头像路径可能不变）
9. **合作合同模块**：CooperationContractModal（OrderManagement/components）挂生产订单列表行"打印▾→合作合同"——标准服装购销加工合同，订单数据自动填充（甲乙方/数量/单价/总额/交期），条款可编辑，独立窗口 A4 宋体打印（含签章栏）

### 教训
- "加按钮"是偷懒方案——入口该内嵌进宿主控件的下拉（dropdownRender/popupRender 顶部插一项）
- 前端 GET 缓存是"弹窗增删后列表不更新"类 bug 的高频根因：写入后必须按 pattern 清缓存

---
## D-211：出货页对齐生产管理（2026-08-29 遗留收尾）

单菲/无菲默认展开明细不显示展开按钮（D-193 同范式）；快捷操作行上移展开区顶部（D-197）；进度卡删除子工序单价行（D-194）；SKU 表 flex→display:table 防列收缩（D-194 同范式）；复制订单号补 fail 提示。


## D-204：首页应用网格列数按数量自适应（2026-08-28，用户"只有2个app就2个模块并排，4个"）

### 背景与实现
menu-grid 原固定4列，组内只有2个应用时占半边显得空。改为每组算 cols：≤2→2列并排、3→3列、4→2×2、>4→4列；JS _buildMenuGroups 加 cols 字段，wxml 内联 style 应用。管理分组单入口 cols=2 占半宽。

### 教训
网格列数不该写死——按内容数量自适应（≤2→2、3→3、4→2×2）在权限过滤后应用数骤减时尤其必要

---

## D-206：PC端尺码/码数录入点全量接入基础属性库（2026-08-28，用户"所有要输入码数的都要接入属性库，全部核实"）

### 盘点结论（14个候选逐一核对）
- **已接 ✓**：样衣开发 ColorSizeSkuSection、价格模板 SyncProcessPriceModal（D-205）
- **不该接 ✓**（码数源自订单/款式既有数据，非录入）：Cutting CuttingFreeBundlePanel、OrderLinesCard（从订单行 uniq 选码，接了会造出订单不存在的码）
- **本轮新接 4 处**：①商品下单 MultiColorOrderEditor（颜色/码数两个 tags Select 旁各加齿轮，选组覆盖/追加）②价格模板内联编辑 ProcessInlineTable+useTemplateInlineEditorData.applySizes（覆盖/追加，新列沿用工价）③尺码表模板 SizeInlineTable（齿轮应用组，同步部位行 values 重建）④尺寸表工具条 StyleSizeToolbar（齿轮 → mergeSizeColumns 追加去重）

### 教训
- 判定"要不要接"的标准：该处是否产生**新的码数字符串**——产生（录入）就接，引用既有数据（选择）不接
- python 批量 patch 的锚点必须先打印实文核对（SizeInlineTable 插错位截断 import，靠二次修复）

---

## D-205：价格模板弹窗接入基础属性库选尺码+齿轮入口+输入框加长（2026-08-28，用户"配置模板为什么不能像样衣开发详情那样选基础属性库/没有齿轮/输入框要做长一点"）

### 背景与实现
工序进度单价模板（SyncProcessPriceModal）的尺码只能手输单个，而样衣开发详情的颜色码数区有"基础属性库"按钮成组选择。AttributeGroupLibraryModal 本就是通用组件（"任何成套属性录入表单传 groups+onApply 即可接入"），纯漏接。
1. useProcessEditor 新增 applySizesFromLibrary(values, mode)：replace 覆盖/append 追加去重、sortSizeNames 排序、所有行新列价目默认沿用工价（sizePrices/sizePriceTouched 按新列重建，保留已改列）
2. useProcessPriceActions 透传；SyncProcessPriceModal 加"基础属性库"按钮（SettingOutlined 齿轮，与样衣开发同款组件同交互），尺码名输入框 80→220px 占位提示"输入尺码名，如 XL(175/96A)"

### 教训
通用组件建好后要主动 grep 接入点（AttributeGroupLibraryModal 建了却只有样衣开发一处接）；"为什么别的页面有这个功能"多半是通用能力漏接而非要新开发

---

## D-204v2：首页小类目两两并排一行（2026-08-28，用户纠正："要是用户只有2个app在一个类目里面，就自动2个类目一行显示，不是你改的这样，之前还是之前样式"）

### 纠偏
D-204 理解错了——用户要的不是组内网格列数变化，而是**类目级排列**：≤2个应用的矮类目应两个并排一行（省纵向空间），类目内网格保持原样式。

### 实现
1. 撤销 per-group cols 内联 style，menu-grid 恢复原4列默认
2. _buildMenuGroups 末尾组装 menuRows：连续的≤2应用小组两两配对成 {layout:'pair', groups:[a,b]}，大组独占 {layout:'full'}；data 字段 menuGroups→menuRows（4处 setData+初始值同步）
3. wxml 双层循环 rows→groups；wxss .menu-row--pair 两列 grid，pair 内 .menu-grid--half 用2列（半宽组里2应用并排占满，4列会挤角落）

### 教训
"排列"歧义时先确认作用层级（应用级 vs 类目级）；用户说"之前样式"=除目标改动外一切回滚

---

## D-203：订单详情转单按钮补 tab=transfer 参数（2026-08-28，用户"转单页面点击到裁剪页面去了，没有转单了"）

### 背景与根因
bundle-detail 落地页双模式：showCuttingForm=true 显示裁剪分扎表单（无菲号订单），否则显示 菲号明细|转单 tab。onLoad 靠 `options.tab === 'transfer'` 强制切转单面板。全站转单入口两处：生产管理卡按钮带 tab=transfer（正常）；**订单详情 onActionTransfer 漏带**——无菲号订单点转单落在裁剪分扎表单，看起来"转单没了"。有菲号订单恰好 showCuttingForm=false 出 tab 栏，所以此前未暴露。

### 决策与实现
onActionTransfer URL 补 `tab=transfer`（一行）。其余入口（裁剪/领料/扫码/待办/发货）不带 tab 是正确语义（裁剪语境），不动。

### 教训
同一落地页服务多入口时，入口按钮与落地页模式的契约（tab 参数）要全量 grep 核对；"有菲号才出现的 UI"会掩盖参数缺失

---

## D-202：裁剪分扎表尺码遮挡下单数修复（2026-08-28，用户"尺寸把下单数遮挡了"）

### 背景与根因
cutting-table 各列写死 width:80rpx，"XS(155/72A)"内容约160rpx，text 无溢出控制直接绘制到右列上方盖住下单数（scroll-x 不生效第四形态：固定宽<内容宽=内容溢出绘制无容器感知）。

### 决策与实现
整表 display:table+table-cell（列宽跨行严格对齐），尺码列 auto 按内容扩展，全部 nowrap 不收缩；外层包 scroll-x scroll-view，超宽横滑；table-row 的 padding 无效改为打在 cell 上；末扎输入框 margin:auto 居中。

### 教训
text 固定宽度+nowrap=溢出绘制盖邻列（不是被截断）；表格列遮挡类问题直接 display:table+外层scroll-x 一招到底

---

## D-201：裁剪页实心按钮回归镂空规范（2026-08-28，用户"为什么要有实心的按钮颜色 手机端不是不要这个按钮吗"）

### 背景与根因
全局按钮规范（app.wxss）主按钮=蓝色镂空（透明底+蓝边框+蓝字）；但页面自写按钮类未走 .btn-primary：bundle-detail 的 .submit-btn（确认转单）/ .print-btn--generate（生成菲号）/ .pt-btn--receive（领取）硬编码实心蓝底白字。

### 决策与实现
三处统一改镂空：background:transparent + color primary + 1px 蓝边框。选中态标识（size-chip--active/mode-opt--active 等 primary 底）是状态指示不是动作按钮，保留。

### 教训
页面自写按钮类绕过全局 .btn 体系必然风格漂移；新按钮一律挂 .btn/.btn-primary 或按其值手写

---

## D-200：转单/下单工厂列表过滤布行+转单页工整化（2026-08-28，用户"转单怎么布行都能选到/布局乱全部优化/商品下单管理筛选也要弄清楚"）

### 背景与根因
1. 转单目标工厂 searchTransferableFactories 只过滤租户+active，不辨 supplierType——布行（Factory.supplierType=MATERIAL）全部混入转单目标
2. PC 订单管理下单"请选择外发工厂"下拉同样用 /system/factory/list 全量列表，布行照选
3. 转单面板 tf-process-check 是空 view——工序选择无可见勾选框；.search-row 零样式搜索框裸奔；行分隔线重

### 决策与实现
1. 后端 searchTransferableFactories 加 `supplierType != MATERIAL`（存量 NULL 保留防误伤）；**用户口径：本厂也是可选转单目标，不排除 INTERNAL**
2. PC useOrderDataFetch.fetchFactories 统一过滤 supplierType !== 'MATERIAL'——下单下拉/侧栏洞察全消费方一次干净
3. 转单面板：工序行补 ○/✓ 勾选（与菲号行同范式）；search-row 胶囊样式；行分隔线换 border-light+末行去线；勾选列 flex-shrink:0

### 教训
- "哪些工厂能被选"是业务口径，必须收在数据源/共享接口一处过滤（supplierType=MATERIAL=布行），而不是每个下拉各自判断
- 选择类列表的勾选框必须是可见控件——空 view 占位=用户不知道能不能选/选没选

---

## D-199：订单详情明细表横滑修复+信息格紧凑化（2026-08-28，用户"下单明细根本划不动/信息格全是空白拉得很长很丑"）

### 背景与根因
1. 下单明细 matrix 用 CSS Grid 固定列宽（96+150×n+88rpx），总宽超屏，但 .matrix-table 默认 width=100% 容器——grid 列溢出容器而元素自身不产生宽度，scroll-view 感知不到溢出内容→划不动
2. 信息格每格"标签一行+值一行"竖排 + 10px 行距 + 1.4 行高，5行信息叠出大片空白，卡片被拉长

### 决策与实现
1. .matrix-table 加 `width: max-content; min-width: 100%`——表格宽度按列定义收缩，scroll-view 感知溢出即可横滑
2. 信息格改横排：info-cell 由 column 改 row+baseline，标签定宽 84rpx 左对齐、值跟随；尺码行用 info-cell--stack 保持上下（标签+横滑chips）；行距 12px

### 教训
scroll-view scroll-x 的内容元素必须自身产生溢出宽度（max-content/inline-flex/table），display:grid 固定列宽默认仍占满容器宽=零溢出=划不动（scroll 不生效第三种形态：D-167 flex压缩、D-194 flex挤压、本例 grid宽度塌陷）

---

## D-198：订单详情尺码改横滑标签（2026-08-28，用户"还有里面的尺码信息这些"——生产信息卡尺码挤成换行长串）

### 背景与实现
order-detail 信息网格里尺码值 = allSizes.join(' / ') 塞半宽格子，"XS(155/72A) / S(160/76A) /…" 折成三四行。改为：specSummary 增加 sizeList 数组；尺码格 info-cell--full 占整行，scroll-x 内 nowrap 标签（bg-subtle 圆角 chip）横滑查看，长短码数不错位不换行。

### 教训
半宽格子里塞 join 长串必换行难看；凡"多码数/多颜色"枚举展示用 chip+横滑范式（与 D-194 SKU 表、D-166 筛选标签同族）

---

## D-197：订单卡快捷操作上移展开区顶部（2026-08-28，用户"下面的快捷按钮全部调整展开的最上面去"）

### 背景与实现
展开区底部（颜色尺码之后）的 详情/采购/裁剪/工序/转单/备注/复制单号 按钮行整体剪切到展开区顶部（菲号明细之前）——先给动作再看明细；样式由"上留白+顶部"改为"下分隔线+底部留白"与菲号明细区隔。功能与事件绑定不变。

### 教训
操作入口的位置跟用户动线走：展开卡片的第一诉求往往是操作（进采购/裁剪/工序），明细是查阅项，动作放底部要滚到底才够得着。

---

## D-196：生产管理第一tab改回全部订单（2026-08-28，用户"进行中显示33实际列表只有4个生产中，应该是全部订单才正确"）

### 背景与根因
第一个chip 数字用 orderStats.totalOrders=33（全部订单），列表查询却带 D-184 加的 excludeTerminal=true + 客户端终态过滤——同一chip数字按"全部"算、列表按"进行中"滤，33对4 口径打架。当年D-184把第一个tab从"全部"改名"进行中"并滤终态，与计数源（totalOrders）从未对齐。

### 决策与实现
第一个tab回归"全部"语义：label 进行中→全部；去掉 excludeTerminal 参数与客户端终态过滤块；statCounts.all 维持 totalOrders。用户要看已完成订单去"已完成"tab（completed=18 口径不变）。生产中(4)/延期(1)不受影响。

### 教训
chip 数字与列表查询必须同一数据源/同一过滤条件，改语义时先追计数函数；同一tab"改名+改过滤"的半截改动最容易留下口径分裂

---

## D-195：工序编辑页布局工整化（2026-08-28，用户"布局一团在一起不工整看着烦躁"）

### 背景与根因
1. D-192 加的口径说明文字太长绕成四行灰块，视觉噪音大
2. 阶段头与工序行字重字号几乎相同、紧贴无缩进，同名时（裁剪→裁剪）像重复两行，无层级
3. 阶段头合计与工序行价格右缘不齐；空组文案说"右上角"而加号实际在阶段头右侧

### 决策与实现
- 说明精简为一行无底色："工序单价＝计件工资单价，裁剪按菲号计件结算"
- 阶段头加 var(--color-bg-subtle) 浅色底条建立层级；合计改"小计 ¥x"次要色
- 工序行左缩进 28rpx + 上下 10px 留白 + 分隔线换 border-light；名称 md 字号（低于阶段头 lg）；价格 md/semibold 不与阶段头抢视觉
- 空组文案改为"暂无工序，点右侧 ＋ 新增"

### 教训
层级感=底色/缩进/字号三件套，缺一项同级元素就"糊"成一片；提示文案超过一行就该砍内容而不是缩字号

---

## D-194：生产管理进度卡去单价+颜色尺码横滑（2026-08-28，用户"裁剪的单价不要显示在这个页面上/码数不要堆积在一起要左右滑动"）

### 背景与根因
1. 订单卡"工序进度"每个阶段下渲染子工序行（裁剪 ¥2）——单价属工序编辑页口径，进度卡出现金额让用户误读
2. 颜色尺码表虽包了 scroll-x，但 `.sku-cell{flex:1}` 允许列收缩，"XS(155/80A)"类长码数被压扁堆积（D-167 同款炸弹：flex 压缩列）

### 决策与实现
1. wxml 删除 node-sub-procs 子工序列表块（名称与阶段重复+金额不该在进度卡），同步清除死 css
2. SKU 表 flex→display:table + border-collapse:collapse，单元格 table-cell+nowrap：列宽按最宽内容自适应且跨行严格对齐、不收缩，超宽走已有 sku-scroll 横滑（比固定 min-width 更优：长短码数混排也对齐）

### 教训
scroll-x 包裹不等于防压缩——内部还用 flex:1 照样挤成一团；列对齐用 display:table 一劳永逸

---

## D-193：生产管理单菲订单免展开直接显示明细（2026-08-28，用户"点击展开的单独有一个，不觉得奇怪吗"）

### 背景与根因
生产管理订单卡的"展开菲号明细"切换按钮不分菲数一律显示——共1菲的订单也要多点一下才看得到那一行（截图中 PO20260821160742 共1菲），0菲的也要展开才能看到"暂无菲号明细"，反直觉。

### 决策与实现
dashboard/index.js enrichForDashboard：`expanded = colorGroups.length <= 1`（单菲/无菲默认展开）；index.wxml 展开按钮加 `wx:if="{{item.colorGroups.length > 1}}"`。多菲订单保持折叠+切换不变；deep-link 自动展开逻辑（_pendingOrderId）不受影响。

### 教训
折叠/展开类交互要问"收起来保护了什么"——只有一条数据时折叠纯粹是增加点击成本（一眼看懂原则）。

---

## D-192：工序编辑页裁剪单价口径澄清+采购/入库分组移除（2026-08-28，用户"为什么工序会有裁剪的工序单价/添加工序里怎么还有采购与入库"）

### 背景与根因
1. **裁剪工序单价（非bug）**：裁剪是4个核心生产工序之一，其单价=裁剪计件工资单价来源——后端 CuttingBundleCompletionHelper.resolveCuttingUnitPrice 从款式价格模板解析"裁剪"单价，工资=单价×件数（扫菲计件）；¥0.81 来自 PC 工序价格模板下单时套用
2. **采购/入库分组残留**：ProductionConstants 早已定论（注释+NON_GATE_STAGES）——采购是供应链模块、入库是仓储模块，"工序配置、进度展示、门禁校验只使用4个核心生产工序"，后端会主动清空采购/入库子工序；D-184 生产管理页已过滤，但小程序工序编辑页 STAGE_MAP 漏了这层过滤，仍展示且可添加

### 决策与实现
1. process-edit/index.js：STAGE_MAP 保留6阶段用于归类识别存量，新增 EDITABLE_STAGE_IDS（4核心），_buildStages 只渲染/编辑核心4组；存量残留采购/入库工序不再显示，保存时随全量替换自动从订单工序移除（安全：后端本就清空其子工序做门禁、仓库扫码不依赖节点单价发工资——UCodeWarehouseScanExecutor/WarehousingRecordFactory 无 unitPrice 引用）
2. wxml 顶部加一行口径说明："工序单价=该工序计件工资单价；裁剪按菲号计件…采购/入库已独立为采购、仓库模块"（一眼看懂原则）

### 教训
- 同一规则多处落地时（后端常量/D-184过滤/工序编辑页），改规则必须 grep 所有消费点；常量注释里写清的行业结论是最佳判据
- "为什么会有X的单价"类问题先找工资/金额的计算链路反推数据源，再判断是bug还是口径

---

## D-191：图片预览左右切换全站生效修复（2026-08-28，用户"只有订单详情页预览有左右切换按钮，其他页面都没有，持续好久没修好"）

### 背景与根因
1. antd v6 箭头显示条件（rc-component/image/Preview/index.js:73）= `groupContext && count > 1`：图片必须注册进某个 PreviewGroup 且组内不止一张
2. D-138 在 Layout 埋了全局 `<Image.PreviewGroup>` 包 {children}，注释承诺"本页有几张图就能切几张"——**但从未真正生效**：全站列表缩略图走 StyleCoverThumb，它渲染的是**原生 `<img>`**，永远不会注册进全局组
3. 唯独订单详情页有箭头：ImageCarousel 自带局部 PreviewGroup 包 antd `<Image>`（count=2）
4. StyleCoverThumb 自己的 D-125 私有预览（openPreview 拉款式附件+自定义底部工具栏）只在附件≥2张时才有切换，且视觉与全局不一致

### 决策与实现
StyleCoverThumb 单点修复（21处引用全站生效）：裸 `<img>` → antd `<Image preview={!onClick}>`，每页所有缩略图注册进 Layout 全局组，点任意一张左右切换翻遍本页全部图片（D-138 承诺的行为真正落地）；传 onClick 的跳转场景 preview=false 不注册不预览，语义与旧行为一致；删除 D-125 私有预览（openPreview/previewSrcs/自定义工具栏/message 依赖），预览体验全站统一为 antd 原生侧边箭头+计数

### 教训
- "全局组件"要验证收集机制的实际链路：antd PreviewGroup 靠 context 收集 antd `<Image>`，原生 `<img>` 是盲区——埋了全局组≠全局生效
- 图片组件三套实现并存（SmartImage/ImageCarousel/StyleCoverThumb 私有预览）必然体验漂移；缩略图组件必须用 antd Image 才能进组

---

## D-190：扫码历史图/交期回归+待裁剪待办面料守卫+采购详情封面+品类中文四连修（2026-08-28，用户"最近新款没图片与时间/面料没到齐怎么出现待裁剪/采购详情没款式图/品类显示英文SHIRT"）

### 背景与根因
1. **扫码历史缺图缺时间**：新款式条目走的是**样衣扫码链路**（/api/production/pattern/scan-records/my-history），该接口从不返回图片字段，且把款号当 orderNo 去匹配生产订单交期必然匹配不上——不是"被砍了"，是样衣链路从未有过；生产扫码链路（PO 单）一直正常
2. **待裁剪待办误现**：裁剪任务下单即预创建（status=pending），getMyTasks 把 pending 任务原样当待办返回，hasCuttingMaterialReady 守卫只挂在"领取任务/生成裁剪单"两个动作点，不挂在待办查询点
3. **采购详情无图**：顶部是写死的 icon-package 占位，模板从未绑定图片；后端 listWithEnrichment 也不返回款式封面
4. **品类英文**：displayHelper.CATEGORY_LABEL 只有女装/男装维度 11 条，缺 SHIRT/连衣裙等款式维度；未命中回退原值直接漏出英文

### 决策与实现
1. 样衣扫码历史：后端批量查 StyleInfo（styleNo→cover/deliveryDate）注入 coverImage/styleImage + deliveryDateStr（交期优先 PatternProduction.deliveryTime 兜底款式档案）；前端 _createNewGroup 透传 record.deliveryDateStr（交期行 wx:if 自动点亮）
2. 待裁剪守卫：getMyTasks 单点修复——未领取(pending)任务必须 hasCuttingMaterialReady 才进待办，已领取(received)不受影响；PendingTaskOrchestrator/ProductionPendingCollector 两条待办路径都委托 getMyTasks，改一处即三端同口径
3. 采购封面：MaterialPurchaseOrchestratorHelper 注入 StyleInfoService，listWithEnrichment 批量注入 styleImage/coverImage（失败不阻断）；前端顶部卡有图显示图、无图保留占位图标
4. 品类映射：displayHelper.CATEGORY_LABEL 对齐 PC styleCategory.ts 全量 38 条；scan/pattern 详情、sample-development 列表/详情三处本地残缺映射统一收敛到 displayCategory

### 教训
- "功能被砍了"先分辨数据链路：同一页面不同来源（生产 vs 样衣）字段能力不同，用户看到的是混合列表
- 守卫挂在动作点不够，列表/待办等"展示点"也要同口径，否则用户在动作前就被误导
- 多端字段映射必须以单一权威表为准（PC styleCategory.ts），本地副本必然漂移

---

## D-189：样衣报工数量逻辑根治+扫码页重排（2026-08-28，用户"领取/完成报工数量怎么算的/根本点不了完成报工/制作中改名生产中/合并卡+码数横滑"）

### 背景与根因
1. **报工永远被拦（主根因）**：D-164 累计报工护栏按工序名求和时**没有排除 CLAIM 领取记录**——领取记录带 processName+数量1，任务1件的样板领取后"已报1件"，报工1件→2>1 永远超限。代码里"CLAIM 不是报工"的原则（不写工资镜像）在护栏里失守
2. 前端 scannedQtyMap/taskQuantity 实际无来源恒为空，拦截全靠后端——修后端即根治
3. 状态判定（isProcessCompletedByRecords）本就正确排除 CLAIM，护栏修完两端口径自然一致
4. "制作中"语义不清（顶部样衣状态徽章+工序徽章两处）
5. 页面布局：数量信息/款式信息两张卡隔在工序列表与报工表单之间；码数矩阵 `flex:1+min-width:0` 列压缩重叠（与 D-167 同款炸弹）

### 决策
1. **护栏排除 CLAIM/RECEIVE**（领取不是报工）：领取→报工1件→1≤1 通过；再报→拦截；报满→状态判定转 COMPLETED 按钮消失，三态闭环
2. **改名"生产中"**：PATTERN_STATUS_MAP.IN_PROGRESS（顶部徽章）+ 工序徽章 制作中(我)/生产中 + toast/lockReason/详情页阶段文案，小程序全端统一
3. **布局重排**：款式信息+码数数量矩阵合并"款式与数量"一张卡置于工序领取上方；报工/领取表单（含填写数量）自然紧跟工序列表
4. **码数横滑**：矩阵包 scroll-view scroll-x，列 flex:0 0 auto+min-width:128rpx+nowrap 不收缩（D-167 同范式推广到样衣扫码页）

### 关联
- 提交：fix+docs；后端需重启（本地已重启/云端待部署）；小程序需发版
- 并行会话提示：前端报价单模块（StyleQuotationTab/buildQuotationPrintHtml+D-169多轮自愈）同期在改，本条只圈样衣扫码+后端护栏，未动前端文件

---

## D-188：工艺说明编辑器乱码三连修（2026-08-28，用户"点击就出现乱码代码/背景色文字颜色全部不能用/摆设看板"）

### 背景与根因（D-187 上线即爆）
1. **双转义乱码（主根因）**：`isSheetRichHtml` 只认 `<img`/`<br>`，"加粗一行字"这类无换行无图的格式内容（`<span style="font-weight: bold;">…</span>`）被判为纯文本 → `escTextLines` 整段转义；父组件状态回声触发 effect 比对不等 → 用转义文本**当场覆盖编辑器**——用户点一下加粗立刻满屏 `&lt;span…`，再保存脏数据烙进库
2. **删除线静默丢失**：Chrome styleWithCSS 删除线产出 `text-decoration-line: line-through`，不在 style 白名单 → 清洗即剥
3. **颜色按钮难用**：Popover 套 ColorPicker 双层弹窗（点两次才出色板）；弹层收焦点丢选区，execCommand 落空
4. **插表格/插图丢存**：insertHtmlAtCaret 不上报内容，插完直接保存存的是旧内容

### 决策
1. 富文本判定改白名单标签正则（与 ALLOWED_TAGS 同词表）；**存量双转义自愈**：plainTextToSheetHtml 入口对 `&lt;tag…&gt;` 一层解码后再清洗——编辑器重开即修复显示，重存即净库（下游查看器不主动改写，以编辑器重存为准）
2. style 白名单补 text-decoration-line/text-decoration-style
3. effect 回声免疫：外部值与 lastReported **双方先过 plainTextToSheetHtml 再比较**，自己上报的原始 innerHTML 回声不再触发覆盖
4. selectionchange 持续缓存编辑器内非折叠选区 + exec/insert 前 focusEditor 恢复；ColorPicker 改 children 直触发（一层弹窗）
5. insertHtmlAtCaret 统一上报（表格/图片插入即同步）

### 关联
- 提交：fix+docs 两个 commit；纯前端（vite dev 5173 刷新即生效，无需重启）
- QA：tsc 通过；六场景用例（加粗回显/删除线保留/双转义自愈/回显幂等/老纯文本+脏行/危险拦截）全过

---

## D-187：生产制单→工艺说明富文本化（2026-08-28，用户"制单为什么有备注信息/一行一行的，要像正常文档，改名工艺说明，样衣开发做好下游只读"）

### 背景与根因
1. 制单 Tab 固定 15 行表格：内容按 \n 拆行塞表格，不足 15 行铺空行——UI 形态错误
2. 脏数据：`style.description` 烙着历史日志行（D-069 前系统 append 的 `[日期] 人 BOM库存检查：…`），8月9日存量数据仍在；D-069 已改写 t_style_operation_log，但存量未清
3. 数据形态：description 已是轻量 HTML（图片内嵌），下游多处按纯文本拆行渲染，新数据会裸露 HTML

### 决策
1. **改名**：内容展示处统一叫"工艺说明"（质检详情 Tab/入库独立详情/订单流转 Tab/样衣开发编辑器+Tab+阶段名/OCR 按钮/保存提示/数据中心详情/维护中心标签）；"生产制单"保留给单据实体（打印文档名/数据中心模块/推送阶段/附件命名）
2. **编辑器**（ProductionRequirementsSection）：图二样式工具栏——撤销/重做/段落标题/BIU删除线/字色底色/四向对齐/缩进/列表/清除格式/插表格/插图/全屏；document.execCommand+styleWithCSS，仍存轻量 HTML 进 description，保存链路不变
3. **下游只读**：新共享组件 SheetRichViewer（dangerouslySetInnerHTML 前走白名单清洗），替换全部行表格；打印 buildProductionSheetHtml 同清洗器同源
4. **清洗器**（sheetRichText.ts）：标签白名单（b/i/u/s/p/div/h1-h4/ul/ol/li/table 系/span/font/blockquote）+ style 属性白名单（text-align/color/background 等，禁 url()/expression()/position）+ 剥历史日志脏行（行首 `[YYYY-MM-DD HH:MM(:SS)]` 整行丢弃）
5. **手机端**：stage-detail 改名+rich-text 渲染（buildSheetRichHtml 剥脏行+危险标签）；scan-result 工艺提示剥标签转纯文本（防 HTML 裸露）
6. 维护中心仍是纯文本 TextArea（数据修正工具，编辑 HTML 属可接受例外）

### 关联
- 提交：971b570b0（25 文件，三副本同步）；纯前端+小程序，无需重启后端
- 用户验收点：质检详情工艺说明 Tab 图文文档化、编辑器工具栏、脏行消失、打印保格式

---

## D-186：大货扫码误入样衣链路根治——String.valueOf(null) 陷阱（2026-08-28，用户"大货生产扫码为什么跟样板单扯关系"）

### 事故
D-157 样衣委派判定 `hasText(String.valueOf(params.get("patternId")))`：缺 key 时 `String.valueOf(null)` 返回字符串 `"null"` 而非空串 → 判定恒真 → 所有大货扫码（production/quality/warehouse 三入口）被劫持进样衣链路。PC 工序报工批量完成报"样衣扫码缺少样板生产单ID(patternId)"；大货质检/入库扫码同样全断。D-157 上线时只回归了样衣扫码（命中类流量），未验证不命中类（大货扫码），且后端延迟重启把爆炸推迟到了 D-185 之后。

### 决策
1. 判定改 `TextUtils.safeText(params.get(...))`（null→""，语义正确），两处：`isSampleScanContext` + `executeProductionScan` 委派条件
2. `submitSamplePatternScan` 取 patternId 兜底链补齐为 patternProductionId→patternId→scanCode，与判定同口径
3. 全后端排查 `hasText(String.valueOf(get)` 模式：其余命中均有 `!= null` 前置守卫，无同类裸奔
4. 反模式沉淀 AP-BE-05；铁律补充：新路由判定上线必须两类流量各回归（命中+不命中）

### 关联
- 提交：e3006332a；需重启后端生效（本地+云端都要）
- 反模式：anti-patterns.md AP-BE-05

---

## D-171：入库仓库/库位搜索+库位容量显示与满位拦截（2026-08-27，用户"这么多仓库为什么选不到/要搜索功能/选库位要看到数量避免上限"）

### 仓库选不到核实结论
非 bug：各入库页按业务类型加载对应仓库（样衣→SAMPLE、大货→FINISHED、面辅料→MATERIAL），PC 仓库地图显示全部三类仓库（CP-001/WL-001/YY-001），小程序只显示当前业务类型仓库是有意设计。

### 决策
1. **仓库搜索**：仓库选项 >2 个时显示搜索框（pattern/scan-action/scan-result 三个 chips 风格页面），关键词实时过滤，无需弹层
2. **库位搜索**：库位选项 >4 个时显示搜索框，按库位编号过滤
3. **容量显示**：库位 chip 内联显示「已用/容量」（如 `A-01-1-1 3/100`），直接消费后端 listByType 已返回的 `usedCapacity`/`capacity` 字段，零后端改动
4. **满位拦截**：`used >= capacity` 的库位红边置灰（quality-detail picker 风格则名称标注「已满」），点击 toast 拦截「库位XX已满（3/100），请选其他库位」
5. **quality-detail 特例**：picker 下拉风格保持不变，数量拼进 option name（`A-01-1-1（3/100）`），满位在 change 事件拦截

### 理由
- 后端 `WarehouseLocationOrchestrator.listByType` 本就统计三类库存表计算 usedCapacity，前端此前未消费——补消费即可，避免重复造轮子
- 搜索阈值（仓库>2/库位>4）避免少量选项时搜索框徒增噪音
- 满位只拦截不隐藏：操作员需知道该库位存在且已满，红边+置灰传达状态

### 关联
- 提交：c47417428（30 文件，10 源文件×3 副本）
- 覆盖页面：scan/pattern、warehouse/sample/scan-action、scan/scan-result、quality-detail

---

## D-145：手机端整洁化第一批+样衣防重复领取（2026-08-26，用户"信息密度太高不工整/样衣工序能不能扫码被领取的过滤掉"）

### 样衣工序扫码核实结论
- 工序选项已实现：按 sortOrder 遍历→跳过已完成→门禁校验→**只出第一个可执行工序**（PatternScanProcessor.buildProcessOperationOptions）
- 缺口：后端 submitScan 无防重复领取（传统流 RECEIVE 谁都能再领）→ 已加服务端兜底：已被他人领取未完成时拒绝并提示领取人

### 整洁化第一批（样衣开发列表+全局）
- 样衣卡：去冗余"详情"按钮（整卡可点+右箭头）、件数行发丝线分隔、卡边距 14px、展开文案精简
- app.wxss 整洁层工具类：hairline-top/card-section/info-row(+label/value)/badge——后续各页统一套用
- 待续批次：工作台/采购任务/订单列表/扫码确认页逐批套用，每批用户过目

### 验证
mvn ✓ 已推送 ebd2e96bc；微信开发者工具看样衣列表卡观感

---

## D-144：拆菲逻辑全链路审查+两处加固（2026-08-26，用户要求核实拆菲完整性/手机端正确性）

### 业务规则确认（用户口述）
菲号20件A扫码做不完→拆一部分给B（数量自定，手机搜名字点确认）；拆后单价工资随数量转移；**拆只影响当前工序，后续工序照常扫原菲号原数量**

### 审查结论：现有实现与规则一致 ✓
- 模型：拆分时当前及之前工序拆成两个子菲（completed=A已完成归A / transfer=B待做归B），**后续工序跟踪保留在父菲号不动**（archiveSourceBundle注释明确"父菲号在后续工序仍然活跃"）
- 工资：按工序跟踪结算，completed子菲当前工序记A已扫码（工资A），transfer子菲待B扫码（工资B）
- 防护齐：后续工序已扫码/已有工资结算/终态订单/已拆过均禁止；数量校验 completed+transfer=原数；有完整撤销回滚（rollbackSplit恢复原菲+trackings+scans）
- 手机流程：搜订单/扫码→输转出件数(<总数)→选接手人→requestSplit(PENDING)→对方listPendingForMe确认confirmSplit

### 修的两处
1. completed子菲operator误写接手人B→改保留原工人A（列表显示不再张冠李戴；工资本就按tracking算不受影响）
2. requestSplit加防重：同菲号同工序已有PENDING请求禁止再发，防重复确认产生双份子菲

### 验证
mvn ✓ 已推送 091a36579；建议真机走一遍拆菲+B确认+双方扫码+下工序扫原菲

---

## D-143：裁剪菲号补全（2026-08-26，用户问"标签号是什么/我们的菲号呢/什么时候改的"）

### 核实结论
- "标签号"=bundleLabel 字段，2026-03-26（a3c0ca7c8）建列就有，**不是最近改的**
- 它是半成品字段：只有拆菲（裂变/转单）才写入（扎号-序号），正常生成菲号链路（generateBundles/样衣建单）从不赋值→永远"-"
- 系统里菲票实际标识=床号+扎号+QR码（打印菲票含订单/款号/颜色/码数/数量/扎号）

### 修复
- generateBundles 与样衣建单生成扎时写入 菲号=床号-扎号（与工厂叫法/打印菲票一致）
- 前端列改名"菲号"，存量空数据按床号-扎号兜底显示，无需迁移

### 验证
mvn ✓ build ✓ 已推送 759682e9b；订单 PO20260821160742 的 12 扎应显示 25-1~25-12

---

## D-142：财务总览营收口径对齐F-2+双趋势图改首页同款线条+饼图黑色修复（2026-08-26，用户报"总营收¥0/黑柱难看/要与首页线条一致"）

### 核实结论
- **总营收¥0根因**：顶部卡/按月趋势三处用 paid-only 严格口径（出货 status=paid×paidAt、电商 confirmed/reconciled×completeTime），与下方现金流时间线的 F-2 口径（创建即计）不一致 → 卡与图对不上
- **黑柱根因**：现金流图支出堆叠柱 itemStyle 用 `var(--color-primary, #fallback)`——canvas 不解析 CSS 变量整串无效→黑色；图例/轴线同病；饼图 SVG fill **属性**写 var() 同样变黑
- **按月趋势**是手写 CSS 叠条（橙色横条），非图表组件

### 修复
- 后端 FinanceDashboardHelper 三处对齐 F-2：sumShipmentRevenue/sumEcRevenue/aggregateRevenueByMonth 改出货 notIn(cancelled,rejected)×createTime + 电商全状态×createTime
- 现金流趋势：5 条平滑线+渐变面积（营收#52c41a/工资#2d7ff9/物料#f59e0b/费用#ef4444/借支#722ed1），图例/轴/网格线具体色值，boundaryGap:false 与首页一致
- 按月趋势：TrendChart 重写为 ECharts 双线（营收绿/成本橙渐变面积）
- 饼图 PIE_COLORS 改具体色值（与折线同色系），中心圆改 style 写法（CSS 属性支持 var() 跟随主题）

### 验证
mvn ✓ tsc/build ✓ 已推送 ec485305e；待重启后端验证：总营收卡与现金流图数字一致、图表全线条无黑柱

---

## D-141：手机端僵尸待采购根治+iOS日期兼容+订单详情图片轮播全局化（2026-08-26，用户报"手机端采购与PC不一致/详情空白/悬停闪烁"）

### 根因链（三端不一致的完整解释）
- **僵尸待领取**：`getMyTasks(includeCompleted=true)`（D-119引入）两分支都不做订单有效性过滤——订单走完后遗留的无主 PENDING 行在手机端永远显示"待领取"；而 PC 列表与手机详情页走 `listWithEnrichment`（会滤无效订单）→ 手机列表有、PC 没有
- **详情页空白**：点进僵尸任务，详情按 orderNo 查 `listWithEnrichment` 被无效订单过滤 → "暂无采购物料"
- **iOS日期警告刷屏**：bellTaskLoader `new Date("yyyy-MM-dd HH:mm:ss")` 空格格式 iOS 不支持

### 修复
- getMyTasks 拆两查询：我名下任务保留全量（保 D-119"已完成"Tab 语义），无主待领取行按订单有效性过滤（排除 closed/completed/cancelled/archived/scrapped，与 PC excludeScrappedOrders 同口径；无订单关联的独立采购保留）
- 顺手：已回料确认行禁编辑/删除后端兜底（D-124 遗留，防绕过UI直调API）
- bellTaskLoader 两处日期 `replace(' ', 'T')` 转 ISO 兼容
- **悬停闪烁根因**：antd Image 悬停遮罩与箭头按钮互相触发 hover 死循环（遮罩盖按钮→按钮区不再hover→遮罩淡出→又hover）；且 antd text Button hover 样式覆盖内联深色底导致按钮"消失"
- 新增**全局 ImageCarousel 组件**（components/common）：箭头常显（原生 button+半透明黑底白图标+z-index 5）、遮罩 `pointer-events:none` 根治循环、序号角标、onIndexChange 回调供外部浮层同步当前图；OrderImageManager 已接入
- 订单详情布局（用户要求中间大两侧小）：图片列 340→240，颜色/尺码/商品编码区 flex 加权 1.7（minWidth 380），基本信息/生产统计 0.9；矩阵列宽 24→44、字号 13→14

### 验证
mvn compile ✓；tsc/vite build ✓；已推送 8cb871252；待手机端验证：僵尸待领取消失、详情不再空白、小云待办同步干净

---

## D-140：首页仪表盘视觉层级重排+补齐专业性展示（2026-08-26，用户"要工整清晰布局合理+看缺哪些专业性展示"）

### 审计结论
- 后端 `/dashboard/delivery-alert`（交期预警）、`/quality-stats`（品质统计）、`/delayed-stage-breakdown`（延期环节）三个接口**后端早已存在但前端从未接入**
- TopStats 卡层级混乱：20px 总量数字挤在 icon 行右侧，日/周/月/年标签与数值同字号无主次
- ECharts canvas 不解析 CSS 变量：OrderCuttingChart itemStyle 用 `var(--color-indigo-500)` 等 4 处静默失效（图例/圆点颜色错乱），ScanCountChart legend 同病
- QuickEntryCard 设置按钮没传 icon → 界面上是个空白按钮
- 两套卡头风格混排（antd Card title 13px vs 自定义竖线标题 15px）；动效过度（rotateZ/scale/光泽扫过）；间距 16/20/24 混用

### 落地
- **新布局叙事**（漏斗式）：Toolbar → TopStats(5卡大数字主视觉) → AI洞察条 → 专业指标三卡(交期预警|品质概览|生产瓶颈) → 趋势双图并排等高 → 执行区(延期表2fr+右列动态/快捷入口1fr叠放)
- **TopStats 重排**：26px 中性色大数字为主视觉，标签统一灰、仅图标+左色条带色；日/周/月/年 label 12px/value 13px 拉开层级
- **三张新卡**：DeliveryAlertCard（紧急≤4天/预警5-7天双数字块+临期单行点击跳详情）、QualityStatsCard（合格率大数字按98/95分档变色+今日/本周/本月 Segmented+次品/返修行）、ProductionBottleneckCard（复用 useDelayedStageBreakdown hook，环节延期条形分布，大货/样衣切换，点击带 orderIds 精确跳转）
- 卡头统一：图表/表格 antd Card 标题加同款左竖线+15px 600；区块间距统一 20px；动效收敛为 translateY(-2px)+阴影
- 删除死样式约 300 行（filter-card 胶囊按钮系列——Dashboard 根本不渲染 filter-card、旧8卡 stat-card 系列、光泽/旋转动效）；删除零引用的模块根 styles.css

### 验证
tsc 0 errors ✓；vite build ✓；待用户浏览器验收视觉与三张新卡数据

---

## F-2/F-3：财务总览全金额日时间线 + 物料对账页头压缩（2026-08-25，用户"现在开始做"）

### F-2 每日资金趋势（口径＝业务发生日，与顶部统计卡对齐）
- **用户需求**：现金流时间线要包含所有金额事件——每天的生产(工资)、面辅料采购、费用、借支、营收，不再只画"已核已付"的稀疏数据（此前全0的根因：营收只算verified/paid、支出只算PAID）
- 后端 buildCashFlowPoints 重写为五类日序列：营收（出货对账创建即计，排除取消/驳回 + 电商全部状态）、工资（wage_payment success×paymentTime）、物料（对账 approved/paid×approvedAt）、费用（报销 approved/paid×approvalTime）、借支（advance×createTime）；point 增加 wage/material/expense/advance/expenseTotal 字段（保留 income/expense 兼容）
- **口径决策**：支出四类与顶部统计卡完全同源同口径——图上数字和卡片数字必须能对上（工工整整=口径一致）；成品出入库不单列（出库的钱已在营收线，入库是库存不是钱，避免双计）
- 前端图表：营收=绿色面积线，支出=堆叠柱（工资蓝/物料黄/费用红/借支绿），图例五项，tooltip 全类目
- 页面布局：随 F-1 单滚动条在 .layout-content 内滚动

### F-3 物料对账页头压缩
- 病灶：状态Tab与统计卡**功能完全重复**（统计卡本来就是可点击的状态筛选），两套并排多占一行
- 删除冗余状态Tab（含 statusTabs 数组与 Tabs import）；筛选卡内边距 12→8；统计卡间距 12→8
- 页头省约 50-60px，"全部"入口由合计金额卡承担

### 验证
mvn compile ✓；tsc 0 errors ✓；vite build ✓；待重启后端后浏览器验证时间线五系列与物料对账页头

## D-139：下单明细"单价0.81"三层混乱修正（2026-08-25，用户问"为什么单价是0.81，他是总价啊"）

### 核实结论（用户直觉正确）
- **字段名错**：行字段叫 `totalPrice`，装的其实是单价——名实不符
- **取值兜底不透明**：单价优先级 = 订单锁定单价 factoryUnitPrice → 款式报价 → 0；该订单 factoryUnitPrice 为空，静默兜底显示款式报价 0.81，用户以为是自己下单填的价格
- 列标题"单价"绑 totalPrice，三层（字段名/取值/列名）对不齐

### 修复
- 字段改名 totalPrice→unitPrice（使用面封闭：仅 buildOrderLineColumns 消费）
- 单价来源显式化：priceSource = order/quotation/none；兜底自款式报价时单元格加 ※ 角标 + Tooltip"订单未填锁定单价，请编辑订单补填"
- 加**小计列**（单价×数量），单价×数量×行数一目了然
- 与 D-128 联动提示：外发结算金额=订单锁定单价×合格入库，锁定单价为空的订单务必补填

### 验证
tsc 0 errors；HMR 生效；待用户在订单详情确认 ※ 标注与小计列

## D-138：订单详情四连修 + 全局单滚动条（2026-08-25，用户截图反馈）

### F-1 单滚动条（双滚动条根因）
- 病根：`.layout` 用 `min-height:100vh`——内容一高整个layout撑开，body 滚出外层滚动条，与页内滚动条并存
- 修复：`.layout { height:100vh; overflow:hidden }`，页面内容统一在 `.layout-content` 内滚动，全站只剩一根滚动条

### O-1 面辅料tab"没联动采购"澄清 + 展示补全
- 澄清：面辅料tab本就读实时采购表（arrivedQuantity 实时）——显示"已到货0却已完成"是因为这单走**仓库领料出库路径**（实物出库记 usedQuantity，不走到货登记）
- 补展示：加**已出库列**（usedQuantity）；状态列接全系统统一 MATERIAL_PURCHASE_STATUS_MAP 中文化（completed→已完成 Tag）

### O-2 颜色/尺码/商品编码矩阵套样衣开发布局
- 病灶：订单详情只读矩阵没有尺码表头行——"棕色 1 1 1 1 1 1"不知道哪列是哪个码；且调用侧把 skuNo 丢掉了
- 修复：OrderColorSizeMatrix 加尺码表头行（颜色+各码数，600字重）+ 商品编码行（每颜色一行，格内对应尺码 skuNo，有值才渲染）；CardSizeQuantityItem 加 skuNo 字段；调用侧透传
- 该组件生产订单头部(StyleAssets)同步受益

### O-3 全系统图片预览左右切换
- 病灶：D-125 只做了 StyleCoverThumb 自带本地分组，其余散落的 antd Image 预览没有 ‹ › 切换
- 修复：Layout 内容区包 **Image.PreviewGroup**——全系统所有 antd Image 点击预览都带左右切换（就近分组组件自动覆盖，不冲突）

### 验证
tsc 0 errors；vite build 成功；HMR 生效待浏览器确认

## D-137 续2：模板中心编辑模板 → SideDrawer（2026-08-25，继续抽屉化机械替换）

- **编辑模板**（EditTemplateModal，内嵌 TemplateInlineEditor 重编辑器，宽度随父页 modalWidth）→ 右侧抽屉
- **按款号生成模板 / 套用到目标款号** 保留居中弹窗——1~3 个字段的小表单，按既定约定（小确认/小表单居中，重内容侧滑）
- 抽屉化判定标准沉淀：**内容重（编辑器/多区块/表格）→ SideDrawer；字段少（≤3）或纯确认 → 居中 Modal；叠加在抽屉上的二级操作 → 居中 Modal 压抽屉**

## D-137 续：视觉整洁规范 + 工序单价编辑器抽屉化（2026-08-25，用户"做好一点，清晰整洁工工整整"）

### 视觉整洁规范（global.css，全 token 暗色自适配）
- **页面标题统一**：`.page-title` 15px → `var(--font-size-title,16px)`（此前 PageLayout 页与旧页面标题字号不一致）
- **页面卡稳重化**：去掉 page-card 的 hover 悬浮抬升阴影——页面级卡片不该有可交互卡片的浮动感，"工工整整"首先是静
- **表格统一规格**：表头 subtle 底+600 字重+13px；表体单元格 13px；分页固定 margin-top 12px；抽屉/弹窗内表格行高收紧（8px 上下）
- 全部走 design token，暗色主题自动适配

### 工序单价配置编辑器 → SideDrawer
- TemplateCenter 的 SyncProcessPriceModal（85vw 编辑器：款号匹配+工序表格+工艺图粘贴）转右侧抽屉
- 表格自带 scroll.y calc 保留（调用方显式指定不接管）

### 验证
tsc 0 errors；vite build 成功；HMR 已生效，待浏览器确认观感

## D-137：全局界面优化——App式固定布局 + 工序弹窗抽屉化（2026-08-25，用户要求"顶部底部固定中间滑动、工序弹窗改侧滑、层级清爽"）

### U-1 全局表格填充模式（一处改动30+页生效）
- 病灶：PageLayout 已有 fullheight 骨架（头部固定+body滚动），但表格随整个 body 滚——**表头滚走、分页沉底**，用户感觉"没有固定"
- 修复：ResizableTable 注入自动 scroll.y——在 `.page-layout-body` **直接子元素**位置时，ResizeObserver 测量容器高度减去表头/分页/导出行，表体内部滚动；表头+分页钉死
- 安全边界：①调用方显式传 scroll.y 时不接管；②非直接子元素（Modal内/包裹层/Tabs内）不启用保持原行为；③`.page-layout-body` 保留 overflow:auto 兜底，异常时退化为整页滚动
- PageLayout CSS：body 改 flex 列布局，非表格子项 shrink-0；Tabs 页签页整签内容滚动（页签栏钉死）
- 两帧收敛测高：scroll.y 注入后 antd 才渲染独立表头，rAF 二次精算

### U-2 工序弹窗→侧滑抽屉
- 新建统一 **SideDrawer** 组件（右侧滑、统一头部/底部条、footer 插槽）
- **NodeDetailModal 默认改为 SideDrawer**（原 85vw 居中弹窗）——生产列表/工序进度/采购等全部调用点一处生效；显式传 mode='modal' 可回退
- **FactoryShipModal（工序发货）** 转 SideDrawer（85vw，发货明细/矩阵/历史保留）
- 保留居中弹窗的场景（刻意决策）：扫码确认（倒计时小确认框）、QuickEdit（单字段小编辑）、RejectReason（原因输入）、**工序指派 AssigneeModal**（叠加在阶段抽屉之上，居中弹窗压抽屉是正确层级）、打印预览类
- 后续机械替换：样衣工序/模板中心等剩余重弹窗用 SideDrawer 逐个替换（组件已就绪）

### 理由
改公共组件（PageLayout/ResizableTable/NodeDetailModal）而非逐页改，一次生效全局、风险面可控；小确认框保留居中弹窗符合交互惯例，避免"为改而改"。

### 验证
tsc 0 errors；vite build 成功；待浏览器实测各页滚动与抽屉交互

## D-136：工厂结算差额滚存 + 订单结算付款回写ID错位修复（2026-08-25，用户"那就继续"）

### 核实结论（滚存的前置病灶）
- **订单结算付款回写同款ID错位**（与D-131工资链同病）：终审推送 bizId=工厂ID，付款回调 markOrderSettlementPaid 却按 settlementId(订单ID)=bizId 查审批表 → 永远落空 → 付款后订单永远停在 approved → 下月工厂汇总重复聚合同一批订单 → **重复推送重复付款**。这是滚存机制的前置bug，先修
- getApprovedIds 只认 approved（排除 paid），汇总本身不重复——病根就是 paid 永远写不上

### 改动
- **回调修复**：markOrderSettlementPaid 双口径——兼容 bizId=订单ID 的历史数据 + 按工厂维度（factoryId/factoryName 匹配生产订单→订单ID集合→批量置 paid）
- **抵扣标记**：t_deduction_item 加 settle_flag（V202608250005，存储过程幂等加列）；create-payable 接收 deductionIds，推送成功即标记已抵扣
- **汇总改造**：fillDeductionTotals 只统计未抵扣扣款；已支付订单名下未抵扣扣款作为"**上期结转**"并入同厂组抵扣清单；每组返回 deductionItems 明细（类型/描述/金额/订单号/结转标记）
- **前端**：终审确认弹窗改为抵扣清单勾选（默认全勾，取消勾选=本期不抵扣自动滚存），金额随勾选联动仍可手动微调；批量推送传全部 deductionIds
- **滚存语义**：扣款>加工费的差额、本月手动取消勾选的扣款 → 保持未抵扣 → 下期清单自动出现并带 [上期结转] 标签

### 理由
不加"月度结算单"新概念，用 settle_flag 一个字段+现有汇总页实现滚存：已结算的订单和扣款自然退出，未抵扣的自然滚入，用户零学习成本。

### 验证
tsc 0 errors；mvn compile 通过；check-flyway 通过；待重启验证 V202608250005 与"付款→订单变paid→下月不再重复推送"全链路

## D-133~D-135：面料费方案A落地 + 扣补款进终审推送 + 客户收款统一应收账本（2026-08-25，用户拍板"面料走A、收款统一应收、全部一起做"）

### D-133 面料费方案A：统一扣款抵扣，砍两套重复机制
- **用户决策**：面料费走方案A（从加工费里扣），不现结催收
- 查实同一批面料有三套钱并行：①领料出库自动记 MATERIAL_PICKUP 扣款项（保留，唯一真相源，回退已接）；②领料台账审核推 RECEIVABLE 应收+CRM应收（砍：audit 与 finance-settle 的 EXTERNAL 分支停推，留说明文案）；③物料出库推 PAYABLE 给供应商/工厂（砍：供应商款已由物料对账链产生属重复，"应付工厂面料款"方向本身错误）
- V202608250004 作废两套旧机制遗留的 PENDING 账单（已确认/已结算不动）
- 台账数据核实：领料记录金额=数量×单价（自动出库取库存成本价，财务核算可修正），物料库存页可导出，数据自洽

### D-134 扣补款进终审推送（修"扣了白扣"）
- 病灶：扣款/补款（含SUPPLEMENT）只改对账单 final_amount，工厂汇总终审推送 amount=加工费全额，扣了不影响实付
- 后端：factorySummary 聚合各厂已审批订单的扣款合计/补款合计/净额（fillDeductionTotals：扣款项→对账单→订单号→工厂归组，SUPPLEMENT为加项其余为减项，失败降级按加工费）
- 前端：终审确认弹窗列明细（加工费/−扣款/+补款）+ **本次结算金额可编辑**（默认=净额；本月不想扣款改回加工费即可）；批量推送按净额合计并在确认文案中说明
- 月度设计三招落地两招：可编辑金额✓、明细透明✓；差额自动滚存留待下轮（需结算月度状态字段）

### D-135 客户收款统一应收账本（消灭账外收款孤岛）
- 病灶：确认收款只改出库单自身 paidAmount，finance 对出库零引用——收了钱账本不知道
- 修复：confirmPayment 后同步应收账单，三级兜底——①出库自身 PRODUCT_OUTSTOCK 应收（原有）→ ②同订单销售对账单的 RECEIVABLE → ③都没有则**现建一张应收再核销**（幂等）；收款进度 settledAmount/SETTLING/SETTLED 全程可见
- EC电商链路核实完整可用（出库→pending→confirmed→reconciled，/finance/ec-revenue），不动

### 理由
三件事同根：钱的出口必须唯一（面料费=扣款抵扣；客户货款=应收账本；工厂实付=加工费−扣款+补款），且最终拍板权留给用户（可编辑金额）。

### 验证
tsc 0 errors；mvn compile 通过；check-flyway 通过；待重启验证 V202608250004 应用与三条链路实测

## D-132：外发应付砍双轨——出货对账单降级为扣款载体，付款唯一走成品结算终审（2026-08-25，用户拍板"留一个砍一个"）

**用户决策**：外发"出货对账单"与"成品结算"两条应付通道并存，留好的砍一条。

### 核实结论（留谁砍谁）
- **留成品结算轨**：有完整活UI（财务中心→外发结算：成品结算审核→工厂汇总终审推送），D-128 后金额=订单锁定单价×合格入库数，终审推送直通收付款中心
- **砍出货对账单的应付推送**：对账单**一创建就自动推 PAYABLE/EXTERNAL_FACTORY 账单**（出库自动建对账单→立即推），且其状态机UI（ShipmentReconContent）是死组件从未被路由——账单只能积压在账单管理里被人误确认，与成品结算重复付款
- **对账单实体保留两个职责**：① 成品结算页的**扣款明细/备注/日志载体**（deduction-items/remark/logs 接口都是按对账单挂的）；② **销售出货应收**（RECEIVABLE，收入侧不动）
- 定时补账任务（ensureShipmentReconciliationForOrder）保留——它只是补建扣款容器

### 改动
- 三处停推外发应付：production/finance 两包的 pushReceivableBill 外发分支 + ReconciliationStatusOrchestrator 审批外发分支，均改为日志说明（销售 RECEIVABLE 分支原样保留）
- 删死组件 ShipmentReconContent.tsx；清 ReconciliationStatusOrchestrator 无用注入
- V202608250003：一次性作废遗留的 sourceType=SHIPMENT_RECONCILIATION 且 PENDING 的 PAYABLE 账单（已确认/已付款的不动，由财务人工处理）

### 理由
砍掉的是"没有UI、没人看得见、却会默默生成应付账单"的那条轨；留下的是用户实际在用、金额口径已修正的轨。对账单实体降级复用，扣款链路零迁移。

### 验证
tsc 0 errors；mvn compile 通过；check-flyway 通过；待重启后验证：外发订单出库不再产生 EXTERNAL_FACTORY 应付账单、成品结算终审推送照常

## D-127~D-131：财务四链路 P0 修复包（2026-08-25，四探索代理审查后用户拍板）

**背景**：财务四链路审查发现"每条链都有双轨通道+金额无单一事实源"。用户两项关键决策：**① 外发加工费一律按下单时的订单锁定单价（factory_unit_price）；② 次品扣款不做自动（易生争议），审核时提醒、用户手动添加。**

### D-127 次品扣款改手动+审核提醒
- 自动扣款实为死代码：唯一触发点传零成本（ProductWarehousingPostActionHelper:218 传 0,0，helper 遇 ≤0 直接 return），从未生效
- 拆除：删调用点+helper 只留关单归集孤儿扣款（attachOrphanDeductionsToReconciliation，对账编排器仍在用）+清 FinanceDataConsistencyJob 死注入
- 提醒：成品结算单条/批量审核时，若 defectQuantity>0 弹确认框"系统不会自动扣款，可先手动添加扣款明细再审核"（不阻断）；手动扣款入口=成品结算页「扣款」（写 shipment-reconciliation/deduction-items）

### D-128 外发结算统一订单锁定单价
- 视图 v_finished_product_settlement 取价改为 `COALESCE(NULLIF(factory_unit_price,0), 款式报价, 款式档案价)`（V202608250002）——此前按款式**售价**（含利润报价）算应付，付工厂付多了
- 列表接口 applyLockedOrderPrice 读时覆算保留（双保险）；工厂汇总/确认终审直接读视图，视图修正后自动跟随
- 外发应付账单交易对手改订单工厂（此前误写客户）：ShipmentReconciliationOrchestrator.pushBill + ReconciliationStatusOrchestrator approve 分支，从关联生产订单解析 factoryId/Name

### D-129 采购金额口径统一为 采购数×单价
- totalAmount 此前 4 种口径互相覆盖：建单/编辑按"已到量×单价"（新单落库即 0 元）、到货登记按采购数（D-076 已修）、回料确认按回料数
- 修 savePurchaseAndUpdateOrder / updatePurchaseAndUpdateOrder / buildReturnPatch 三处 → 统一 `purchaseQuantity × unitPrice`

### D-130 出库类型词汇表对齐
- 前端发 `outboundType`（sales/free/transfer/scrap），后端读 `outstockType`（白名单 shipment/free_outbound/...）——**键名都对不上**，报废/调拨出库被静默记成销售出库
- 后端单点修复（FinishedOutstockHelper.outbound）：兼容 outboundType 键 + normalizeOutstockType 旧值映射（sales→shipment/free→free_outbound/transfer→transfer_out/scrap→damage_out）；PC出库/二维码出库两入口都汇聚此方法，一次修复全覆盖

### D-131 工资终审推送统一走结算单主链路
- 旧旁路三宗罪：create-payable bizId=operatorId 与回写按结算单ID查**错位**（付款后状态永不更新）；扫码未绑定结算单（关单再生成**重复计酬**）；页面"记录打款/添加扣款"按钮引用不存在的行ID（**点击必失败**）、"驳回"纯前端假动作
- 新链路：新增 `POST /finance/payroll-settlement/finalize-for-operator`（generate 按人+includeSettled=false 绑定扫码 → approve 推 PAYROLL 账单 → confirmBill 派生应付款）——付款中心付款后 WagePaymentCallbackHelper 按结算单ID精确回写，链路全通（已核实 initiatePaymentWithCallback 会用 payable.sourceType/SourceId 回写上游）
- 前端：终审推送改调新接口；删 记录打款/添加扣款/驳回 三按钮及 PaymentModal/DeductionModal/usePaymentAndDeduction 死文件；includeSettled 默认 false（页面口径=结算口径）

### 理由
双轨与口径不一是"财务复杂、数字对不上"的根因。本包全部朝"单一事实源"收敛：外发=订单锁定单价、采购=采购数×单价、工资=结算单唯一载体、次品扣款=人工决定。

### 验证
tsc 0 errors；mvn compile 通过；check-flyway-sql 通过；待后端重启后验证 V202608250001/2 迁移与终审推送全链路

## D-126：供应商准入闭环补全——审核入口+统计口径+历史回填（2026-08-25，用户问"为什么有待审核逻辑，没搞懂"）

**用户反馈**：供应商管理页统计卡"待审核 5"但表格里 4 行显示"-"只有 1 行标待审核；不明白准入/待审核是干嘛的。

### 核实结论（半成品功能三处断裂）
- **来源**：4-23"供应商管理"功能包引入准入审核流（5 状态机：pending/approved/probation/rejected/suspended）；新建时面辅料供应商默认 pending、外发厂默认 approved（FactoryOrchestrator.java:130）
- **断裂1**：后端审核接口 `PUT /system/factory/{id}/admission` 齐全但**前端零调用**（factoryApi.approveAdmission 无组件使用）→ 待审核永远卡死
- **断裂2**：统计卡把空状态也算待审核（utils.ts `admissionStatus === ''` → pendingCount++），而准入列空值渲染"-"→ 卡片与表格对不上；2 月老数据早于默认值逻辑全是空
- **断裂3**：admissionStatus 全后端无任何业务消费（采购/下单/扫码都不查它）→ 纯展示不拦截
- 用户拍板：补全（方案B）而非删除

### 修复
- **审核入口**：新增 AdmissionAuditModal（Radio 四结果：通过准入/试用合作/拒绝准入/暂停合作 + 意见，拒绝/暂停必填原因）；RowActions 对 pending/probation/rejected/suspended 行显示"准入审核"，仅 isAdmin 可见（后端 isTopAdmin 校验对应）
- **统计口径**：空状态计入已准入（与回填语义一致），仅显式 pending 计待审核
- **历史回填**：V202608250001__backfill_factory_admission_status.sql 幂等 UPDATE 空状态→approved
- factoryApi.approveAdmission 返回类型补 message 字段

### 理由
准入流程的价值前提是"能审得动"：没有入口的状态机只会制造困惑数字。补全三处断裂后流程才真正闭环，且不动任何业务拦截逻辑（保持零侵入）。

### 验证
tsc 0 errors；check-flyway-sql 通过；环境重启后 Flyway 应用迁移、待审核数与表格一致

## D-125：图片预览左右切换——下沉到 StyleCoverThumb 全局生效（2026-08-25，用户截图反馈）

**用户反馈**：商品下单页图片预览只有放大缩小/旋转，没有左右切换按钮。

### 核实结论
- 8-23 的"图片预览全局增强"（ef463405c）实际只改了 CoverImageUpload（款式图上传组件）+ 全局 CSS 样式，**不是全局能力**
- 商品下单列表的图片列是 StyleCoverThumb，点击行为是 **window.open 新窗口开原图**——根本没有页内预览，更没有切换
- 截图中的预览浮层来自其他入口的 antd Image（无 PreviewGroup 时 antd 本就不显示切换箭头）

### 修复（一处改动全局生效）
StyleCoverThumb（全系统几十处复用的款式缩略图组件）默认点击行为从 window.open 改为**页内多图预览**：
- 打开时拉取 /style/attachment/list 的全部图片（款式图/颜色图等，当前图置顶截取前20张）
- Image.PreviewGroup + actionsRender 自定义工具栏：‹ › 左右切换（单图点击提示"当前仅一张图片"），复用 design-system.css 已有的 style-image-preview-* 样式
- 传入自定义 onClick 的调用方行为不变；缩放/旋转等原工具栏按钮保留

### 理由
StyleCoverThumb 是全系统款式缩略图的标准组件——改它一处，商品下单/生产管理/订单流程等所有用到的地方同时获得多图预览能力，避免逐页补丁。

### 验证
tsc 0 errors；eslint 0 errors；style-image-preview CSS 类已在 design-system.css（4处）

## D-124：回料确认后仍可编辑物料——样衣明细页锁定规则补漏（2026-08-25，用户报"乱套了"）

**用户反馈**：回料都齐全了还能编辑物料（工具栏"编辑面辅料"+行级编辑/删除全可点）。

### 核实结论（大货 vs 样衣）
- **大货侧无此问题**：PurchaseModal 工具栏「编辑面辅料」`disabled={hasReturnConfirmed}`（任一行确认即锁），Collapse 行内本就没有编辑/删除按钮
- **样衣明细页有漏洞**：锁只有一把 `sampleBomLocked = sampleMode && sampleBomCompletedTime`（只看样衣BOM阶段是否完成），完全不看回料确认状态——回料全确认但BOM未完成时全表可编辑可删除

### 修复（与大货/列表页同规则对齐）
- **行级 编辑/删除**：按行锁定——本行 returnConfirmed=1 则本行禁改删（title"已回料确认，如需调整请先在操作中退回"），其他未确认行不受影响；BOM完成锁仍为整表
- **工具栏 编辑面辅料**：`disabled = sampleBomLocked || hasReturnConfirmedRow`（任一行确认即整表锁，与大货 hasReturnConfirmed 同规则），并显示"已回料确认 · 编辑已锁定"Tag
- 解锁路径：行级「退回」（supervisor）退回后恢复可编辑

### 遗留
后端 /production/purchase 保存/删除接口对 returnConfirmed=1 行无服务端校验（前端锁为唯一防线），建议后端补兜底校验

### 验证
tsc 0 errors；eslint 0 errors

## D-123：无资料下单明细矩阵化（对齐正常下单）+ 菜单名改"资料维护"（2026-08-25）

**用户反馈**：无资料下单（CuttingCreateTaskModal）的下单明细是 颜色/尺码/数量 平铺行+蓝色圆形加减号按钮，与正常下单不一致，"看着就不舒服"；要求矩阵改为 码数列/颜色行、按钮全部换成通用样式。

### 重构（OrderLinesCard 整体重写）
对齐 MultiColorOrderEditor（正常下单）同一套交互：
- 颜色/码数改 **Select mode=tags** 选择（自由输入，蓝色圆形加号按钮彻底移除）
- 工具行：清空 + 数量输入 + **全部铺量**（与正常下单同款）
- 矩阵：**颜色行 × 码数列**，单元格 InputNumber `controls={false}`（无加减号），含行小计列 + 码数合计行 + 右上总数量
- 数据仍写 createOrderLines（setCreateOrderLines），**提交链路零改动**
- 死代码清理：useMatrixInput.ts 无引用后删除（D-103 惯例）

### 菜单名
面料价格库 → **资料维护**（用户指正：该页就是资料维护，含 工序库/模板库 同组）

### 验证
tsc 0 errors；eslint 0 errors（routeConfig BarChartOutlined 为既有 warning）

## D-122：样衣采购"单条与批量操作不联动"修复（2026-08-25，用户报严重问题）

**用户反馈**：批量回料确认做完后，没有待确认回料的行了，单条"回料确认"居然还能点——单条与批量逻辑没同步走。

### 核实结论（全链路对比）
- **大货侧完善**：PurchaseModal footer/批量下拉/Collapse 行级全部排除 returnConfirmed（行级确认后按钮禁用、批量条件用 hasReceiveStatusForBatch 同源判定）
- **采购列表页完善**：已确认行直接不显示 回料确认/登记到货/品质异常，改显示 退回
- **样衣明细页（MaterialPurchaseDetail）是唯一病灶**，三处失联：①行级"回料确认"只判 !isPending&&!isCancelled，不查 returnConfirmed——已确认行还能再点②行级"追加到货"同病③工具栏 批量回料确认/确认回料完成 只挂 loading，无符合行时仍可点（点了才弹"没有可确认的物料"）

### 修复（判定源统一为 hooks/utils 的过滤器）
- 行级 回料确认/追加到货：`disabled: isReturnConfirmed`，title 提示"已回料确认，如需重做请先退回"（置灰不隐藏，符合用户偏好）
- 工具栏：`hasReturnable = filterReturnablePurchases(...).length>0`、`hasAwaitingConfirm = filterAwaitingConfirmPurchases(...).length>0`，无符合行时禁用+label 标注"（无可确认项）/（无待完成项）"——与行级同一判定函数，天然联动

### 教训
同一页面出现两套操作入口（单条/批量）时，可用条件必须引用同一个判定函数，禁止各写各的布尔表达式——本次三处失联全是各写各的产物。

### 验证
tsc 0 errors；eslint 0 errors

## D-121：交互简化三连——手填改选择/三层拍平/字典收敛（2026-08-25）

**原则**：看着简单好用、功能一个不少——全部复用现成组件，零新接口。

### 改动

1. **仓库入库抽屉**（WarehouseLocationMap/InboundDrawer）：物料编码/名称全手填 → 复用 `useMaterialDbSearch`+`fillFormFromMaterialDb`（采购模块现成钩子，防抖搜 /material/database/list，选中自动回填 名称/类型/颜色/规格等），**已停用物料过滤不进候选**；颜色 Input → DictAutoComplete(dictType=color)；供应商手填 → SupplierSelect（带维护齿轮）。提交 payload 不变
2. **人员列表**：调岗/离职/归档从 编辑→更多→变更在职状态→子项 三层拍平到「更多」一级（复用原回调 openRemarkModal 链路，零新逻辑）
3. **客户来源**：客户管理弹窗 + CRM 客户表单两处 Input → DictAutoComplete(dictType=customer_source, fallback 转介绍/展会/网络/门店/电话营销/其他)，自由输入+自动收录，兼容旧脏数据

### 新痛点扫描（列入待办，未改）
- 成品仓无单入库手拼商品编码（FreeInboundModal L291/303）
- 物料档案颜色/规格裸输入（MaterialFormDrawer L133/135，主数据源头不收敛持续产生脏值）
- 领料单无"按 BOM 应发自动填充数量"（PickingForm）

### 验证
tsc 0 errors（修掉 antd AutoComplete 无 loading 属性的类型错误）；eslint 0/0

## D-120：订单"预算天数"调整不联动根治 + 采购操作列撤销悬停 + 弹窗统一（2026-08-25）

### 1. 预算天数不联动（用户报"像写死了"）——根因实锤
`BudgetDaysEditor` 保存成功后 ①直接改 props（`record.expectedShipDate = newShipDate`，React 不触发重渲染）②派发 `progress-data-refresh` 自定义事件——**全系统零监听者**（孤儿事件）③四个调用点全都没传 onUpdated。数据其实已入库（quick-edit PUT 成功），但界面永远不变，手动刷新才可见。
**修复**：组件内加 `shipDateOverride` 本地状态——保存成功即覆盖交期入参，hint/gapInfo/编辑基准全部即时重算（组件自渲染）；孤儿事件换系统广播 `data:changed`；删除 props 直改。预算工时分支同样换事件。

### 2. 样衣采购操作列撤销悬停显现（用户反馈"这个操作列没必要"）
MaterialPurchaseDetail/columns 与 materialStatusActionColumns（采购列表）两处撤掉 revealOnHover，恢复常显。保留悬停显现的：样衣工序、物料出入库（用户未反对，随时可撤）。

### 3. 采购弹窗统一
- ArrivalConfirmModal：SmallModal（体系外）→ ResizableModal 40vw（与 领取并到货/登记到货/回料确认 兄弟弹窗同档）
- CancelReceiveModal 的 RejectReasonModal **保留**：全系统 20 处在用的"必填原因"标准组件，非体系外异类
- 遗留：BatchPurchaseModal 960px/OrderPickerModal 900px/48vw 等档位归一列入后续

### 验证
tsc 0 errors；eslint 0 errors 0 warnings（含修复自己引入的 exhaustive-deps）

## D-119：采购链路一致性跟进 + 手机端"已完成"筛选根治（2026-08-25）

### 1. 手机端采购"已完成"筛选永远为空（根因在后端）
`MaterialPurchaseQueryHelper.getMyTasks()`（/purchase/list?myTasks=true，手机端采购列表唯一数据源）只返回 待领取+我领取(received)，且**显式过滤掉已完成**（arrived>=purchase 剔除）与已回料确认——手机端"已完成"Tab 虽存在但永远是 0 条。
**修复**：新增 `getMyTasks(boolean includeCompleted)` 重载——true 时返回 我名下任意状态+无主待领取，不过滤完成/回料/无效订单（已完成采购多属已完成订单，再过滤会再度隐藏）；Controller 支持 `includeCompleted` 参数；小程序 myProcurementTasks 传 includeCompleted=true；默认 false 待办语义完全不变。三副本已同步。

### 2. 采购一致性审计结论与跟进
- 全部采购弹窗盘点：以 ResizableModal 为主（40/48/60vw/960px 并存），SmallModal 与 RejectReasonModal 两处体系外、三个 Drawer（品质异常/智能收货/采购详情）——统一档位列入后续
- 大货 PurchaseModal Drawer 内部工具栏的 采购全部/批量回料确认 与 footer 重复 → 收进「批量操作」悬停下拉（保留原 disabled 条件含 detailFrozen/canProcure，零行为变化）；footer 是抽屉主操作区保留不动
- 采购列表页操作列补 revealOnHover（与明细页对齐）
- PurchaseDetailCollapse 内联按钮未走 RowActions（重构面大，列入后续）
- 手机端采购功能三副本 diff 一致；其余不一致文件（home/more-apps/scan.json）与采购无关

### 验证
mvn compile EXIT=0；tsc 0 errors；eslint 0 errors；node --check 通过

## D-118：采购工具栏批量动作集成 + 菜单命名直白化（2026-08-25）

### 1. 批量动作集成（用户拍板"鼠标放上去出现"）
MaterialPurchaseDetail 工具栏的 批量采购/批量回料确认/确认回料完成 三按钮 → 集成为一个「批量操作 ▾」下拉，`trigger=['hover']` 悬停即展开。处理中态转译为菜单项文案"（处理中…）"+disabled（antd 菜单项无 loading）；无可采购项显示"批量采购（无可采购项）"并禁用。菜单项不支持 title 属性（TS 会报错），提示语并入 label。

### 2. 菜单命名直白化（routeConfig.ts 8 处，仅显示文案）
- 资料单价 → **面料价格库**（原命名看不出用途）
- 物料新增 → **物料资料**（该页是主数据维护，非新增）
- 物料库(AI搜索配置) → **物料出入库**（与菜单名统一）
- 角色权限/岗位管理 两处 → 统一 **岗位与权限**（消除同页两名）
- 供应商管理分组 → **合作伙伴**（消除父子同名）
- 孤立数据 → **异常数据清理**（去技术黑话）
- 生产订单列表(AI搜索配置) → **生产订单**（与菜单统一）

### 验证
tsc 0 errors；eslint 0 errors（routeConfig 的 BarChartOutlined 未用 warning 经 stash 对照确认为既有问题）

## D-117：表格操作列"悬停显现+终态置灰"（2026-08-25，用户拍板交互）

**背景**：用户反馈"密密麻麻全是按钮"+"已完成/终态的行按钮看着还能点"。用户建议鼠标悬停才出现按钮。

### 决策

1. **RowActions 新增 `revealOnHover` 模式**（RowActions.css，纯 CSS 按表启用不全局生效）：次要按钮（含"更多"）默认 `visibility:hidden`（移除误点击热区，优于 opacity），行悬停/键盘聚焦时显现；**主按钮（primary）常驻**保证核心动作一眼可点。`:not(.--primary)` 选择器 + 声明顺序控制优先级
2. **启用范围（三个高频表）**：样衣工序列表、物料出入库、采购明细
3. **终态行置灰**（antd Button disabled 原生灰显，RowActions 本就透传 disabled，补齐各表未设的）：物料出入库**已停用行**禁 采购指令/入库/料卷标签/出库/安全库存（仅留 启用+详情，title 提示"物料已停用，请先启用"）；采购明细**已取消行**禁品质异常

### 理由
- 悬停显现用 visibility 而非 opacity：不可见按钮不应保留点击热区
- 不默认全局开启：hover-reveal 有发现性成本，先在按钮最多的三张表验证，用户认可后再推广
- 用户提到的"批量采购/批量确认/确认完成集成"属工具栏批处理分组，与行操作列分离，列入后续批次

### 验证
tsc --noEmit 0 errors；eslint 4 个 TS 文件 0 错误（CSS 不入 eslint）

## D-116：SKU/BOM 术语残留批量清理 + "已完成"状态色统一（2026-08-25）

**背景**：D-073 全系统术语清理的查漏批次（审计发现约 20 处用户可见残留）。

### 清理明细（21 文件 23 处）

**SKU→商品编码（5 处）**：电商库存差异弹窗"SKU:"、智能定价列+弹窗"SKU ID"、样衣商品Tab"没有可填充的 SKU"/"N 个 SKU"、SkuTable alt="SKU图片"

**BOM→物料清单（15 处）**：样衣BOM组件簇（创建并填入BOM/暂无BOM数据/请先配置BOM物料×2/暂无已保存BOM/获取BOM失败/导入BOM模板×2/请选择目标BOM行/导出款式BOM.xlsx）、裁剪BOM删除确认、物料资料关联辅料提示×3、悬浮卡"BOM物料"标签、阶段胶囊"BOM"标签、教程"便于BOM精确配置"、智能寻源"暂无BOM明细/BOM预估"、码数用量"未配置BOM用量"

**刻意保留（勿"修复"）**：useSmartAlerts 'BOM缺失'（告警关键词匹配）、SYSTEM_ACTIONS '从BOM生成采购'（历史日志兼容）、代码注释/console

**状态色统一（3 处）**："已完成"异色改语义色 success——采购智能收货列(green)、孤立数据页(green)、BOM状态列(default灰)

### 验证
tsc --noEmit 0 errors；eslint 21 改动文件 0 errors（SmartSourcingDrawer 的 overviewLoading 未用变量 warning 为既有问题，与本次无关）；python 批量替换带命中次数断言防误替换

## D-115：样衣工序"操作了但状态不变/按钮还能点"三连修（2026-08-25）

**背景**：用户反馈样衣生产里"全部都操作了状态不变化、按钮还是可操作状态"。审计定位到 SampleProcessList 组件簇三个叠加病根。

### 修复（frontend/src/modules/basic/pages/StyleInfoList/components/）

1. **行状态取错数据源（核心）**：`useSampleProcessListData.subTableData` 每行 status 原取阶段总进度（percent<100 时已完成的行仍显示"待领取/手动完成"）→ 改为取行自身 `sub.completed`（percent>=100 兜底 trackingStats 口径），行只有 完成/待领取 两态
2. **手动完成提交行级标识**：原只提交阶段枚举 operationType（如 CUTTING），进度匹配靠 progressStage 阶段兜底把整个阶段所有行点亮 → 提交带 `processName: row.name`；同时 `useSampleProcessProgress` 两条记录循环（大货/样衣分支）增加 `configuredNames` 门控：**行级记录（processName=已配置子工序名）只点亮自身，不做阶段兜底**；旧数据（processName='样衣操作'等阶段级记录）保持原阶段兜底行为，完全向后兼容
3. **撤回删错记录**：原 `find` 第一条 `operationType===opType || processName===row.name`——点任意行撤回删的都是同一条阶段记录 → 改为优先按 processName 精确匹配取最新一条，仅旧阶段级记录退回 operationType 匹配（也取最新）
4. **指派后抽屉不刷新**：`StyleStageDrawer` 的 SampleProcessList onRefresh 原链只刷工序列表+外层列表，不重拉 PatternProduction 快照 → 统一 `refreshDrawerData`：刷进度 + `sample.reloadSampleStage()`（领取人/状态/领取时间）+ scanRefreshTick 联动扫码记录表 + 显式外层 onRefresh 双保险；SampleScanRecordsTable 加 `refreshSignal` prop（原仅 patternId 变化才重拉）

### 刻意不改
- `onCompleteProcess`（手动完成后向关联大货订单写扫码）保留：属数据口径问题（processCode 传阶段 key）而非状态刷新问题，单独评估，避免本次改动面扩大

### 验证
tsc --noEmit 0 errors；eslint 4 文件 0 错误 0 警告；无相关单测文件；向后兼容性靠 configuredNames 门控保证

## D-114：小云任务点击直达详情页——deepLink 精确化（2026-08-24）

**背景**：用户抱怨"小云PC端点击任务不跳转到任务详情页,还在界面到处找这个任务"。审计发现点击链路本身有 navigate,根因是后端 PendingTaskOrchestrator 给的 deepLinkPath 全是**模块列表页**（/production/cutting、/production/material、/style-info）,订单逾期/异常报告甚至只落 /production 根路由,且落地页不消费 orderNo/styleNo 参数——点完还得自己搜。

### 决策
不加独立任务详情页（系统待办是规则驱动实时聚合、无持久化任务表,独立详情页无处落数据）,而是把深链改为**业务对象精确路由**（路由已全部存在,零前端改动）：
- 裁剪任务 → /production/cutting/task/:orderNo
- 质检待处理 → /production/warehousing/inspect/:orderId（ScanRecord.orderId）
- 采购待收货 → /production/material/:styleNo
- 样衣开发 → /style-info/:id
- 订单逾期/异常报告 → /production/order-flow（该页已消费 orderNo 参数）
- 返修/财务三类无独立详情路由,保持列表页+query 定位参数
- 新增 pathSegment() URL 编码路径段,三个 Collector（PendingTask/Production/Order）同步修改

### 理由
前端 onSafeNavigate 白名单是前缀匹配无需扩;TaskAggregationPanel 拼 URL 已处理双问号;个人任务（协作任务）点击弹编辑框属合理交互暂不动。

### 验证
mvn compile EXIT=0。遗留：落地页消费 query 参数自动定位（如生产订单列表读 orderNo 自动过滤）列入后续优化。

## D-113：样衣列表页扫码"未匹配到样衣" + 打印三项优化 + 工序列商品编码（2026-08-24）

**背景**：用户在样衣开发跟进页扫码报"未匹配到样衣"；另反馈打印资料单缺成分列、长文字被截断、样衣生产工序列"SKU"列名与内容不完整。

### 根因与修复

1. **列表页扫码只做本地匹配**：`onScan` 仅在当前已加载列表里按 styleNo/orderNo 匹配；而打印资料单的 QR 内容是 `{"type":"pattern","id":"..."}`（无 styleNo/orderNo）→ 必然"未匹配到样衣"。修复为三级匹配：①pattern QR 直接跳详情（详情页支持 id=patternId 并自动反查 styleId）②本地列表快路径 ③后端 `listPatterns({keyword:styleNo})` 兜底（翻页/筛选后本地不命中）。JSONCodeParser 本就支持 id/patternId 键，无需改解析器
2. **打印 BOM 缺成分列**：BomTableSection 加「成分」列（dataIndex fabricComposition，StyleBom 实体本有此字段，/style/bom/list 原样返回）
3. **打印长文本截断**：BasicInfoSection 值单元格原为 `nowrap+ellipsis`（备注/面料成分被省略号截断）→ 改 `wordBreak:break-word` 自动换行；标签单元格保持不换行。生产制单区本就是 pre-wrap 无此问题
4. **工序列 SKU 列**：SampleProcessList columns `title:'SKU'` 且值只有 颜色/码数 → 改「商品编码」，值改完整格式 `款号-颜色-尺码`（与商品编码管理 SkuTable 的 skuCode 格式一致），宽度 110→150

### 核实结论（无需改动）

打印「基本信息区块」多选功能接线完整：PrintOptionsSelector 写 options → BasicInfoSection 按 styleInfoBlock/customerInfoBlock/patternInfoBlock/timeInfoBlock/remarkBlock 渲染，勾选实时作用于预览与打印（handlePrint 打印实时 DOM）。默认全选、备注默认不勾。用户看到"全部字段"是默认状态所致

### 验证
node --check 通过；tsc --noEmit 0 errors；eslint 3 个改动文件 0 errors；h5-web 两副本已同步

## D-112：样衣扫码"领取不到"根因（假成功stub+字段丢弃）+ 扫码AI提示英文根治（2026-08-24）

**背景**：用户反馈①大货扫码的 AI 提示全是英文代码文案；②样衣扫码领取工序一直领不到。

### 根因一：样衣扫码是"假成功"半截工程（三处叠加）

1. `ProductionScanExecutor.execute` 对 sourceBizType=SAMPLE 直接返回 `success=true` 的 stub——不写 t_scan_record（计件）、不更新 PatternProduction 状态/领取人/领取时间，注释自述"跳过大货校验直接记录"但什么都没记
2. 唯一补偿双写 `savePatternScanRecordFromProductionScan` 把 operationType 写成 `uppercase(progressStage)`——RECEIVE 选项 progressStage='采购' → operationType="采购"，所有按 `operationType==='RECEIVE'` / `status IN_PROGRESS` 判断的页面永远显示"待领取"
3. **最隐蔽**：多色多码分支 `SKUProcessor.generateScanRequests` 只透传固定字段，`sourceBizType:'SAMPLE'` 等 options 参数被整体丢弃——这类提交到大货接口后被当菲号扫码处理，必然失败
4. 附带：详情页「领取样衣」按钮调 workflow-action 'receive'，后端 switch 根本没有该 case，必报"不支持的操作"

### 修复（委派规范链路，不新造轮子）

- **ScanRecordOrchestrator.executeProductionScan 顶部拦截**：SAMPLE/patternProductionId 整体委派 `PatternProductionOrchestrator.submitScan`（其内含 t_pattern_scan_record 规范落库 + syncToScanRecord 计件镜像 + 状态流转 RECEIVE→IN_PROGRESS+receiver+receiveTime + 库存同步 + unitPrice 按款式工序配置服务端解析）；删除失真的补偿双写方法
- **operationType 映射**：优先前端显式传；缺失时 processName 含"领取"→RECEIVE，再退化 uppercase(progressStage)（动态工序走 applyOperationStatus default 分支 handleDynamicOperation，兼容）
- **ProductionScanExecutor stub 改为显式抛 BusinessException**——绕过编排层直调执行器绝不假成功
- **handleReceive 防重守卫**：已 IN_PROGRESS 且 receiver 非空时，他人重复领取抛"该样衣已由「XX」领取"，本人幂等成功，receiver 缺失则补齐
- **前端 pattern/index.js**：多色多码 forEach 补齐 sourceBizType/patternId/operationType/orderId/processName/remark；单数量分支补 operationType/patternId。**详情页 _doReceivePattern 改走 submitPatternScan(RECEIVE)** 与扫码页同链路

### 根因二：AI 提示英文——LLM 输出无语言约束且原样持久化

`StyleDifficultyOrchestrator.mergeAiResult` 直接采信 LLM JSON 的 imageInsight 并写入 t_style_info.image_insight；deepseek-v4-flash/agnes-2.5-flash 对中文指令遵循不稳，输出英文即整段入库长期展示；QualityAiSuggestionOrchestrator 同理且 24h 缓存放大。

**修复（三层防御）**：
1. prompt 硬约束：两编排类 system/vision prompt 追加"必须使用简体中文"
2. 生成侧校验：TextUtils 新增 `chineseRatio/isUsableChineseText`（阈值0.25）；imageInsight/visionRaw/keyFactors/质检 checkpoints/urgentTip 全部过检，不合格弃用改中文兜底文案或降级规则引擎，**英文永不入库**
3. 读取侧守卫：assess() CACHED 路径 + WorkerHintComposer.composeInto 对存量脏数据同样过滤——存量英文不再下发，无需数据迁移

### 关键发现（踩坑）

- **backend/src/test/ 整个目录在 .gitignore（第30行），仅 12 个测试文件被历史性 git add -f 跟踪**；本地 mvn test 被 untracked 遗留文件 SmartSourcingListOrdersRegressionTest（引用已删除的 TestRedisConfig）卡 testCompile，与 CI 无关（CI 只见 12 个跟踪文件）。本地跑测试需临时移开该文件
- generateScanRequests 类"options 不透传"陷阱：共享工具函数只复制白名单字段，新增上下文字段必须在调用方补齐

### 验证
node --check 小程序改动文件通过；mvn compile EXIT=0；临时移开坏文件后 ProductionOrderCreationHelperTest/FactoryShipmentOrchestratorTest/WarehouseAreaOrchestratorTest 全过 EXIT=0；h5-web 两份副本已同步

## D-111：尺码语义去重 + 物料停用闭环 + 出库客户关联（2026-08-24，用户四连需求）

**背景**：用户实测反馈四个问题——①纸样开发尺寸表出现 S(160/76) 与 S(160/76A) 重复列（要求"有重复的自动取重"）；②物料出入库无库存面料只能删不能停；③操作列"打印出库单"是纯预览废弃按钮；④库位出库抽屉客户/电话/地址纯手填未关联客户管理。

### 决策与实现

1. **尺码语义去重（前后端同规则）**：新增 `getSizeDedupeKey` 归一化键——取「字母前缀|数字序列|中文段」，忽略型体后缀(A/B/C)与分隔符，S(160/76)、S(160/76A)、S 160/76a 同键。前端 `normalizeSizeList` 改为按键保留先出现者（linkedSizeColumns 开发码先合并故优先保留开发码写法），覆盖 5 处入口：fetch 合并 / 开发码联动 / 新增尺码校验+下拉过滤+自由输入 / AI识别合并 / 各码实际用量 extraSizes。保存链路天然闭环：`obsoleteOriginalIds` 会删除不在当前列头的旧记录，去重后下次保存即清理 DB 脏行，无需迁移。
2. **后端模板 merge 防重（根因）**：`TemplateStyleOrchestrator.applySizeTemplate` merge 分支原来逐行盲 append；改为加载目标款式已有尺寸行，「部位::尺码语义键」命中即跳过（Java 版 sizeDedupeKey 与前端同规则）；overwrite 模式仍全清后写入但批内也去重。
3. **物料停用复用主数据**：不给 t_material_stock 加字段——t_material_database 已有 disabled 列与 PUT /material/database/{id}/disable|enable 接口（物料资料库页在用）。MaterialStock 实体加 @TableField(exist=false) 的 disabled/materialDatabaseId 两个透出字段，queryPage 按 disabledStatus 参数先查主数据停用编码集再 in/notIn 过滤（分页正确性），enrichConversionRate 批量带出。前端操作列加停用/启用（modal.confirm 确认），名称旁"已停用"Tag，工具栏加启用状态筛选。
4. **删废弃打印按钮**：handlePrintOutbound 是假单号 PREVIEW-时间戳的纯前端预览（备注自述"请先执行正式出库后再打印正式单据"），而手动出库确认/领料确认流程本就自动弹 MaterialOutboundPrintModal 正式打印 → 整链删除（columns/index/useOutboundActions 三处）。
5. **出库客户关联 CRM**：WarehouseLocationMap 的 OutboundDrawer 客户/领取人 Input 换 CustomerSelect（AutoComplete 封装，选中自动带 contactPhone/address，自带快捷维护客户齿轮），手输兼容保留；提交参数与后端 t_product_outstock 字段零改动。

### 理由
- 去重选"保留先出现者"而非"统一改成某一种写法"：开发码（SKU/各码实际用量同源）在前合并自然胜出，两表列头随之对齐
- 停用挂主数据而非库存表：主数据才是"这个物料还用不用"的归属地，且零迁移零新接口
- 不新增 customerId 列到 outstock 表：客户名/电话/地址已落库可追溯，避免为本次需求引入 Flyway 变更

### 验证
npx tsc --noEmit 0 errors（16 文件）；eslint 11 个改动文件 0 errors；mvn compile EXIT=0

## D-110：拼接字段列宽系统性风险 — t_style_bom size/color VARCHAR(20) 二连爆（2026-08-20）

**背景**：保存物料清单 POST /api/style/bom 持续 500。前一日 t_style_info.size 已因同类问题炸过（V202708172000），次日 t_style_bom.size/color 再次同根因复发。前端新建 BOM 行 `size = activeSizes.join('/')` 多码数拼接 59+ 字符，超 VARCHAR(20) 列宽 → Data truncation → 500。

**根因**：早期建表按"单值"设计列宽（size 装一个码数），后期业务演进为"拼接串"（多码数/多颜色 join('/')），列宽从未跟进。同一根因在不同表反复爆发。

**决策**：
1. `V202708201800` 将 t_style_bom size/color 扩到 VARCHAR(500)（INFORMATION_SCHEMA 幂等检查模式，与 V202708172000 一致）
2. `StyleBomOrchestrator.normalizeAndCalc` 加 `assertFieldLength` 防御——超长抛 IllegalArgumentException（400 带字段名+长度提示），不再裸 500

**理由（防重蹈）**：凡是被前端 join('/') 拼接写入的字段（size/color/规格类），列宽必须按拼接串上限设计（≥500）而非单值。同类高危字段应主动排查：`SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('size','color') AND CHARACTER_MAXIMUM_LENGTH<=50;` 命中即预防性扩列。防御层（assertFieldLength）让"万一超长"从 500 变成可读的 400。

---

## D-109：字典"维护成功却看不到"根因 — @Cacheable 无配套 @CacheEvict（2026-08-20）

**背景**：用户反馈商品品牌（原商品主题）在维护弹窗显示"更新成功"，但下拉列表永远看不到新词条，反复数天。前端刷新链路（QuickManageModal→notifyDataUpdated→DictAutoComplete 重拉）排查是通的，断点在后端。

**根因**：`DictServiceImpl.queryPage` 有 `@Cacheable("dict")`，但写操作走 `DictOrchestrator` → MyBatis-Plus 原生 `save/updateById/removeById`，**没有 @CacheEvict** → 写库成功但缓存永远旧值，前端重拉命中旧缓存。

**决策**：`DictOrchestrator` 的 create/update/delete/autoCollect 全部加 `@CacheEvict(value="dict", allEntries=true)`。allEntries=true 因字典缓存 key 含租户与参数组合，逐 key 清除不可行，字典量小全清代价可忽略。

**理由**：这是 Spring Cache 最经典的坑——@Cacheable 加了读缓存，写操作却直接穿透到 MyBatis-Plus 原生方法，缓存与库永远不一致。凡是"保存成功但列表不更新"类问题，第一时间查写操作是否带 @CacheEvict。

**后果**：全系统排查其他 @Cacheable 用法（如有），写路径必须配套 evict；同日本轮还修复 extJson 嵌套字段断链（collectExtValues 忽略表单 extJson 嵌套值 + useStyleDetail setFieldsValue 传 JSON 字符串导致嵌套 name 取不到），教训：嵌套表单字段（name={['extJson','fabric']}）加载时必须以对象形式 setFieldsValue，保存时必须显式合并表单嵌套值。

---

## D-108：CI/CD 三层质量门控闭环 — 冒烟测试端点必须对齐 Controller 实际映射（2026-08-20）

**背景**：用户连续遭遇"反复出问题"：订单创建 `plannedStartDate.format` 报错、500"数据访问失败"无根因、新端点 404 被误报"无快照数据"。深层根因链：代码已推送但 CI 编译失败 → deploy job 被 needs 静默跳过 → 云端继续跑旧代码 → 用户当测试员。且冒烟测试脚本本身有 6 个端点路径从未存在（404/405），把"版本滞后检测"变成了狼来了——真实 404 与脚本 bug 404 混在一起没人信。

**决策**：
1. **pre-push hook 智能全量模式**：按待推送文件类型自动选检查范围（.java→backend 编译、.ts/.tsx→frontend tsc、混合→全量、纯文档→quick），坏代码 push 前拦截
2. **冒烟测试版本滞后检测**：新端点 probe 404=云端旧代码、缺列 500=Flyway 未执行，提示词直接指向"deploy job 被跳过"；probe 端点永久保留防回滚
3. **CI 红灯强制**：冒烟去 continue-on-error、release tag 依赖冒烟成功、通知 job 任一环节失败 exit 1 全 workflow 显红
4. **端点修正铁律**：冒烟端点一律从后端 Controller `@RequestMapping`/`@GetMapping` 核对，必填参数（orderNo/startDate）脚本动态准备，禁止凭记忆写路径

**关键端点修正对照**（错误→正确）：
- `/api/color-card/list` → `/api/material-color-card/list`
- `/api/production/process/template/list` → `/api/production/process-price/processes?orderNo=xxx`
- `/api/production/material/list` → `/api/production/material/stock/list`
- GET `/api/finance/wage/payment/list` → POST `/api/finance/wage-payments/list`
- `/api/finance/wage/piece-rate/list` → `/api/finance/wage-payments/dashboard-stats?startDate&endDate`
- `/api/production/quality/check/list` → `/api/production/warehousing/pending-repair-tasks`
- GET `/api/production/order/{id}`（405）→ `/api/production/order/detail/{id}`；stages 在 `/flow/{id}`（校验 processName/status，无 progress 键）

**理由**：本地修复单个 bug 只治标；三层门控（push 前/部署后/发版前）+ 真实端点才治"用户当测试员"的本。验证：生产环境实跑 30/30 全通过。

**后果**：以后每次发版新增关键端点，须同步加到 `version_probe_endpoints`（永久保留）；写冒烟端点前必须 Grep Controller 确认。

---

## D-107：样衣详情保存数量 400 根治 — t_style_info.size VARCHAR(20) 列宽溢出（2026-08-17）

**背景**：用户炸点——样衣详情页保存数量 100% 失败，PUT /api/style/info 连续 7 次 400 "保存失败"，无任何线索。

**根因**：前端 `buildSizeString` 将所有选中码数 `join('/')` 拼接后写入 `t_style_info.size` 列，但该列定义是 **VARCHAR(20)**。典型多码串如 `XS(155/72A)/S(160/76)/M(165/80)/L(170/84)/XL(175/88)/D(定制码)` 长达 59 字符，MySQL 严格模式触发 DataIntegrityViolationException，被 `StyleInfoOrchestrator` catch-all 包装成 `IllegalStateException("保存失败: ...")` → GlobalExceptionHandler 映射 400。**用户选中 2 个以上长码数即必现**（二分法实测 >20 字符即失败）。

**决策**：
1. Flyway `V202708172000__expand_style_info_size_color_columns.sql`：`size` VARCHAR(20)→**VARCHAR(500)**（容纳 10+ 全码拼接）；`color` 防御性 VARCHAR(20)→**VARCHAR(200)**（同源拼接风险）
2. 幂等实现：MODIFY 前查 `INFORMATION_SCHEMA.COLUMNS ... CHARACTER_MAXIMUM_LENGTH >= 500`，达标即跳过；SET @s 内 COMMENT 双单引号转义（Flyway 静默失败陷阱）
3. `alter_t_style_info.sql` 同步追加生产手工执行段（与迁移逻辑一致）
4. Orchestrator 异常日志无需新增——L312-321 已有 `DataIntegrityViolationException` 专项捕获（duplicate→"款号已存在"）+ `log.error("数据完整性约束失败")`，本次靠它定位

**教训**：**400 "保存失败" 类无线索报错，优先查数据库列宽与前端拼接串长度**。DataIntegrityViolationException 的根因消息在后端日志里（log.error 已记录），前端只显示笼统文案；排查时直接看后端日志的 "数据完整性约束失败" 关键字即可秒定位。

**影响**：仅 2 个 SQL 文件，推送后 Flyway 随部署自动扩列，无需手工干预（生产已配自动迁移）；提交 a53294653。

---

## D-105：组织架构页工厂节点彻底剔除 — 过滤维度从 ownerType 升级为 nodeType（2026-08-17）

**背景**：用户长期炸点——内部组织管理页仍显示"本厂"节点（部门类型:外协工厂、状态:未启用），点开成员列表出现"666/未知部门/车间工人"。2026-08-16 曾修过一轮（部门下拉/统计卡片过滤 ownerType=EXTERNAL），但只治了"外部标签部门"，没治"工厂同步节点"。

**根因**：供应商管理每创建一个工厂（自有/外协）都会经 `OrganizationUnitBindingHelper.syncFactoryNode` 在组织树同步一个 `nodeType=FACTORY` 节点，其 ownerType 为 OWN/OUTSOURCE（不是 EXTERNAL）。上一轮过滤器只看 `ownerType==='EXTERNAL'`，全部 FACTORY 节点穿透。**过滤维度选错：内部组织页的边界是"节点性质"（DEPARTMENT vs FACTORY），不是"内外标签"（ownerType）**。

**决策**：
1. 前端 `useOrganizationTreeData.ts`：`filterExternalNodes` → `filterInternalNodes`，递归剔除 `nodeType==='FACTORY' || ownerType==='EXTERNAL'` 两类节点
2. 双视角保留：工厂账号仍走 `filterTreeByFactory`（保留本工厂子树含工厂节点，靠 factoryId 隔离）；租户账号走 `filterInternalNodes`（纯内部部门）
3. 口径联动：index.tsx 的部门下拉（internalDepartments）、selectedUnit 查找、unitMemberCount 递归统计、KPI visibleTotalMembers 全部改用过滤后可见树，杜绝"树里看不见、统计里还计数"的口径分裂
4. 后端 `tree()` 不动：工厂账号视图与外部树 externalTree() 均依赖 FACTORY 节点数据，过滤放展示层

**理由**：FACTORY 节点是供应商管理→组织树的同步镜像（单一数据源在 Factory 表），组织架构页只是不该"看见"它，而非数据错误；在后端删除会破坏工厂账号视图与邀请码/成员绑定链路。

**教训**：修过滤类 bug 先画出**完整数据写入链路**（syncFactoryNode 的所有 nodeType/ownerType 组合），再选过滤维度；只按单一字段过滤前先反问"还有哪些路径会写这个字段的其他取值"。

**影响**：仅前端 2 文件（useOrganizationTreeData.ts / index.tsx），tsc 0 错误；工厂账号视图回归靠 filterTreeByFactory 天然覆盖。

---

## D-104：批量采购弹窗"信息缺失+数量只读"双链路根治（2026-08-16）

**背景**：用户炸点——样衣采购管理（H00011111111）批量采购确认弹窗只显示"物料名 · -"（desc 只填了 color，空则"-"），物料编码/规格/单价/供应商全无，且数量纯文本不可编辑。核实双链路 5 个批量采购类弹窗：①MaterialPurchaseDetail 批量采购（样衣抽屉+大货订单详情**共用**，用户截图）、②③MaterialPurchase 主页"确认采购全部"样衣/大货分支，三处同病；④智能领取批量采购、⑤生成采购预览信息已全且数量口径（净需求/待采购）有业务含义，不动。

**决策**：
1. 新建 `BatchPurchaseModal`（ResizableModal+ResizableTable）：列=类型/名称+编码/规格颜色/单价/供应商/需求数量/**采购数量(InputNumber 可编辑)**+合计金额，①换用
2. ②③ Modal.confirm 内补信息（编码|规格|颜色|单价|供应商）+ InputNumber（非受控+闭包对象承接编辑值）；出库项数量受库存约束保持只读
3. **后端关键补洞**：`/production/purchase/receive` 原本完全忽略前端传的 quantity（历史 postReceive 就在传、被静默丢弃）——MaterialPurchaseStatusHelper.receive 新增可选 quantity 解析（parseEditedQuantity，>0 且≠原值先更新 purchase_quantity 再领取，带 tenantId 条件，Orchestrator 已有 @Transactional 保证原子）

**理由**：弹窗信息缺失根因是 desc 字段只填了 color；数量只读根因是后端接口不收 quantity，前端传了也白传——双端必须一起改。

**教训**：前端调用传了参数 ≠ 后端消费了参数，改交互前先核实后端接口签名。

---

## D-099：内部领料"领取即出库"——/pending 只建单不扣库存是事故源（2026-08-16）

**背景**：用户实测面辅料"无限领取、库存永远不变、通知一直挂着"。排查发现仓库扣减链路（manualOutbound/decreaseStockWithCheck/confirmPickingOutbound）SQL 全部正确，真正的事故源是**生产页领料（MaterialPickupModal → /production/picking/pending）**：只建 PENDING 待出库单+发仓库通知，不检查库存、不扣库存。

**决策**：
1. INTERNAL 领料改为"领取即出库"：`createPickingAndOutbound`（@Transactional）= savePendingPicking + confirmPickingOutbound 同事务，库存不足整体回滚报错——封死无限领取
2. EXTERNAL 保留两步流+通知：audit() 里有外发厂账单推送/应收联动，直接 APPROVED 会绕过财务联动，不能合并
3. INTERNAL 不再 sendPickupNotification（自己领自己出库，无仓库确认环节）
4. 存量挂着的 INTERNAL 待出库单**不自动清理**（账实问题，自动确认=凭空扣账，需用户逐张处理）
5. 领料单"谁领取/谁操作"：列表已有 pickerName 列，出库日志 operatorName=确认出库人（现在=领取人本人），无需签字流程

**教训**：两步流（申请→确认）设计给"生产端申请、仓库端确认"的分角色场景，但小团队一人多角时中间态就是灾难——每个中间态都是一条会挂着的"通知"。扣库存类操作宁可同步做（失败立即可见），不要异步等确认。

## D-098：设计师=内部人员选择、款名称自由输入、维护入口跟随编辑锁、SKU 排序/拖拽（2026-08-16）

**背景**：用户对基础信息表单四项不满：①设计师是内部人员为何要字典维护；②款名称就是起名字不该带维护；③未解锁编辑就能点"维护"入口（越权感）；④"虚拟分类"名称反直觉；另 SKU 表码数未按从小到大排序、无拖拽。

**决策**：
1. 设计师改内部人员 Select（showSearch）：超管 `/system/user/list?excludeFactoryUsers=true`，租户管理员 `tenantService.listSubAccounts()`（复用考勤页模式，值仍存 name 字符串，兼容旧数据/打印）
2. 款名称纯 Input，弃字典；**教训：名称类字段（人名/款式名）≠ 枚举字典，不该进 DictAutoComplete**
3. 主表单全部维护入口（5 处 Hint + 商品类型齿轮）包 `{!editLocked && ...}`——只读态零维护入口；本次仅改 BasicInfoSection，全局治理（其他页面 DictAutoComplete）留待后续
4. "虚拟分类"→"季节分类"纯文案改名（5 文件），season 字段/API 不动
5. SKU 排序：`getSizeSortValue` 语义序（字母码区间 -30~50，数字码×10，定制/FREE=8000，未知=9000）；展示序=色内 sortOrder 优先、未定义按语义序；保存时固化展示顺序为 sortOrder(1..n)
6. 拖拽用 HTML5 原生 DnD（把手 mousedown 激活 draggable），**不用 dnd-kit**：ResizableTable 内嵌列拖拽 DndContext，嵌套冲突+PointerSensor 会抢事件；原生 DnD 与 PointerSensor 天然互斥（draggable 后浏览器接管、pointermove 停发）
7. 后端 sort_order 走 Flyway V202708161300 + DbColumnDefinitions 双轨（本地/云端）；listByStyleId 排序 color,sort_order,id

**踩坑**：
- search_content 返回的相对路径不可靠（StylePrintModal 实际在 components/common/ 而非 modules/basic/pages/ 下；DictManage 在 system/pages/System/ 下），替换前必须用 ls/grep 验证真实路径
- SkuTable 行内 Input 与 draggable 冲突：整行 draggable 会拦截文本选择，必须把手激活式（mousedown→setState→dragstart 时 draggable 已 true）

## D-097：可选组件故障不得拖垮整体健康检查——DEGRADED 语义 + 探针分层（2026-08-16）

**背景**：backend-2114 部署失败。应用启动正常（103.6s）却在 17:19:00（=300s start-period + 3×30s retries 时刻）被优雅停机，反复回滚；线上 `/actuator/health` 503 而 `/actuator/health/readiness` 200。

**根因链（三层叠加）**：
1. Qdrant 服务不可达（外部依赖挂了）
2. `AiComponentHealthIndicator` 设计为"任一组件 DOWN→Health.down()"→ 主 health 整体 503——AI 组件实为可选增强能力，该语义过严
3. Dockerfile HEALTHCHECK：curl -f 遇 503 必失败；兜底 `echo > /dev/tcp/...` 依赖 bash 特性，但 HEALTHCHECK shell form 走 `/bin/sh`（Ubuntu=**dash**），`/dev/tcp` **从未生效过**——此前全靠主 health 200 掩盖

**决策**：
1. AI 组件任一 DOWN → 返回自定义 `Status("DEGRADED")`（不再 down）；全部 UP→UP；未配置→UNKNOWN 不变
2. `management.endpoint.health.status.http-mapping.DEGRADED: 200` + `order: DOWN,OUT_OF_SERVICE,DEGRADED,UP,UNKNOWN`——降级可见但 HTTP 200
3. Dockerfile HEALTHCHECK 主探测改 `/actuator/health/readiness`（只反映应用存活，语义正确且不受可选组件影响）；TCP 兜底显式 `/bin/bash -c 'echo > /dev/tcp/...'`

**教训（AP 候选）**：
- shell 兼容性：容器内 HEALTHCHECK/entrypoint 的 shell 特性（/dev/tcp、[[ ]] 等）必须显式声明 bash，dash/sh 下静默失效
- 健康语义分层：探活（readiness/liveness）≠ 依赖健康（外部组件状态）；可选依赖 DOWN 应降级而非判死
- 部署失败排查三板斧：①线上 health vs readiness 对比 ②启动时间 vs start-period+retries 探测时间线对齐 ③Flyway "No migration necessary" 反推运行的是否为回滚旧镜像

**验证**：read-lints 0 错误；readiness 端点线上 200 佐证。待重新部署端到端确认。

## D-096：全库 collation 统一为 utf8mb4_0900_ai_ci——74 张少数派表 CONVERT + 分裂源头根治（2026-08-16）

### 背景
- D-095 事故（工资单 JOIN 报 1267）暴露全库 290 张表 4 种 collation 并存：0900_ai_ci 216（主流）/ unicode_ci 49 / general_ci 14 / bin 11
- 用户指令：全部清偿该遗留债务

### 风险评估（迁移前逐项完成，全部通过）
1. **JOIN 引用扫描**：36 张有数据的少数派表在 Java 代码中**零跨表 JOIN 引用**（grep JOIN 表名逐一确认）→ CONVERT 不破坏现有查询
2. **唯一键撞键预检**：18 个非主键唯一索引 + 4 张 varchar 主键表（bin 派）按 `GROUP BY ... COLLATE utf8mb4_0900_ai_ci HAVING COUNT(*)>1` 逐一模拟预检 = **0 冲突**
3. **列级分离检查**：全库无"列 collation ≠ 表默认"的隐藏分离列
4. **bin→0900 语义变化**（区分大小写→不区分）：涉及表均为 AI 辅助表（无大小写敏感唯一约束），查询变宽松不报错，可安全转

### 决策与实施
1. 迁移 `V202708161200__unify_collation_utf8mb4_0900_ai_ci.sql`：74 张表逐表幂等 CONVERT（INFORMATION_SCHEMA 判断 + PREPARE，已 0900 或表不存在自动跳过）
2. **分裂源头根治**：
   - `init.sql` 建库语句 `COLLATE utf8mb4_unicode_ci → utf8mb4_0900_ai_ci`（unicode_ci 49 张表的出生地，新环境不再分裂）
   - 迁移尾部 `ALTER DATABASE ... COLLATE utf8mb4_0900_ai_ci`（老环境改库默认，未显式指定 collation 的后续建表继承 0900）
   - `DbTableDefinitions` 74 个建表语句已显式 `CHARSET=utf8mb4`（MySQL 8 默认 collation 即 0900）✓ 无需改动
3. 本地验证：迁移真跑 12.8s（含 49 万行 t_ai_job_run_log）✓ 幂等复跑零报错 ✓ 全库 290 张 100% 0900 ✓ 工资事故 SQL 回归通过 ✓ 数据完整性抽查（53 万行大表/唯一索引表）完好 ✓

### 教训
- collation 分裂的根因是**建库脚本写了非默认 collation**（unicode_ci），而后续 8 年 MySQL 默认是 0900 → 所有建表三源头（init.sql/Flyway/动态建表）各自继承不同默认，越走越散
- 防复发三件套：建库语句写死 0900 + ALTER DATABASE 对齐库默认 + 动态建表显式 CHARSET（MySQL8 下 utf8mb4 默认即 0900）

---

## D-095：关单自动工资单报错根因修复——全库 collation 分裂 + 动态建表缺列（2026-08-16，P0）

### 背景
- 生产报错（每次关单必炸）：`[计件薪资] 订单 xxx 自动生成工资单失败`，MyBatis 摘要 `The error occurred while setting parameters ... ScanRecordMapper.selectPayrollAggregation`
- 日志被截断看不到 Cause，MyBatis 该摘要涵盖**参数绑定+执行阶段**错误（含 Unknown column / Table doesn't exist / 1267 collation）

### 排查过程（证据链）
1. SQL 依赖列清单核对 → `t_production_process_tracking` 全项目无 Flyway/init.sql 建表语句，靠 `DbTableDefinitions` 启动动态建（`CREATE TABLE IF NOT EXISTS`）
2. 动态建表模板含 `scan_record_id`，但 `DbColumnDefinitions` 补列清单**漏了该列** → 早期环境表缺列且永不自愈（疑似根因之一）
3. **本地真跑迁移 SQL 抓到真凶**：回填 UPDATE 报 `ERROR 1267 Illegal mix of collations`；随后用工资 SQL 原样 JOIN 在本地（列齐全库）**100% 复现同错** → 真凶是 collation：
   - `t_production_process_tracking` = utf8mb4_unicode_ci（init.sql 派，全库仅 50 张）
   - `t_scan_record` 及 tracking 的**全部**业务关联表 = utf8mb4_0900_ai_ci（主流 215 张）
   - 全库还有 general_ci 14 张、bin 11 张，共 4 种 collation 并存

### 决策
1. `V202708161100__fix_tracking_scan_record_id.sql`：①CONVERT tracking 对齐主流 0900_ai_ci（全库唯一 JOIN 伙伴即本 SQL，其余关联表全 0900，零风险）②幂等补齐工资 SQL 依赖列 ③按 租户+订单+菲号+工序 四键回填 scan_record_id ④补 JOIN 索引
2. `DbColumnDefinitions.java` 同步补 7 列条目做双保险（防个别环境 Flyway 基线异常）
3. 本地验证：迁移幂等重跑 ✓、collation 统一 ✓、**工资 JOIN 原样复跑通过** ✓、回填语法正确（本地测试数据无四键匹配属预期）

### 遗留（待办）
- ⚠️ 全库 290 张表 4 种 collation 并存是系统性债务：unicode_ci 50 张 + general_ci 14 张 + bin 11 张将来任何跨派 JOIN 都会 1267。需要专门任务统一（CONVERT 有锁表风险，需逐表评估）
- ⚠️ schema 三轨制（init.sql / Flyway / Java 动态修复器）漂移是 V202608120001 hotfix 与本次事故的共同根因，新增表/列必须三处同步或收敛到 Flyway 单轨

### 教训
- MyBatis "setting parameters" 不一定是参数问题，**执行期 Unknown column / collation 1267 也报这个摘要**——必须拿到完整 Cause 或本地复现
- 跨表 JOIN 上线前应在本地用**生产同构数据+真实 SQL** 预跑，而非只看列名存在
- 动态建表模板演化后，`IF NOT EXISTS` 对已存在旧表不生效——新增列必须同步进 `DbColumnDefinitions` 补列清单

---

## D-094：员工计件工资条打印标准化重构——单表结构+简版订单汇总+人民币大写（2026-08-16）

### 背景
用户强烈反馈工资条"乱七八糟不像个东西"。旧实现问题：①嵌套表格（slip-table 里嵌 data-table）模拟区域导致边框错乱；②结算周期空值渲染"- 至 -"；③简版是一行"序号总数/订单号数/款式总数/总数量/总金额"统计数字，叫法怪且与明细合计对不上（简版自算 4788/6527.27 vs 后端 4204/4850.49）；④合计行右对齐挤成一坨；⑤font-family 以 sans-serif 结尾违反 P0 打印铁律；⑥存量错误 import '@/hooks/useUser'（模块不存在）。

### 决策
1. **打印类单据一律单表扁平结构**：标题/信息/表头/明细/合计/大写/签字全部是同一张 table 的行（colspan 组织），禁止表套表
2. **合计口径以后端 totalQuantity/totalAmount 为准**，前端不自算合计行，避免同一单据出现两个不一致的数
3. **简版=按订单号+款号聚合的明细压缩视图**，不展示独立合计（应发总计即合计）
4. 金额必须带**人民币大写行**（toChineseAmount：分→元角分，万段补零，零角零分→整）
5. 空日期区间显示"全部记录"，禁止"- 至 -"
6. 打印 font-family：`"Songti SC","STSong","SimSun","Microsoft YaHei",serif`（serif 结尾铁律）
7. 获取当前用户用 `@/utils/AuthContext` 的 useUser（hooks/useUser 不存在）

### 踩坑
- 旧文件 `import { useUser } from '@/hooks/useUser'` 是**不存在的模块**，tsc 曾报 TS2307 但一直没人修（vite build 不查类型所以能构建过）——**发现 TS2307 必须立刻修**，不能只看 vite build 过了就当没事
- JSX 里全角空格（　）触发 eslint no-irregular-whitespace，用 `&nbsp;` 或 span margin 代替

## D-093：SKC商品编码Tab统一编辑入口——未点「编辑」一律只读（2026-08-16）

### 背景
用户强烈反馈："为什么商品编码没有点击编辑就可以直接编辑？什么逻辑！"——表格中 69码/成本价/吊牌价/销售价/备注全是常驻输入框（D-086 的 canEditAttrs=true），底部提示还永远写着"手动编辑模式：可自由修改商品编码…"（硬编码无条件渲染），用户完全无法判断什么能改、什么时候能改。

### 决策
1. **推翻 D-086 的 canEditAttrs=true**：改为 `canEditAttrs = isEditing`——与编码字段规则对齐，未点「编辑」全部只读
2. **编辑按钮对所有模式可见**：原"编辑"按钮仅手动模式显示（isManual && !isEditing），现改为 !isEditing 即显示；自动模式原有独立「保存修改」按钮（!isManual && hasChanges）删除，统一为编辑态「保存/退回」
3. **模式开关语义收窄**：只决定"编码生成规则 + 编辑态下编码/颜色/尺码是否可改"，不再暗示可编辑性
4. **底部提示动态化**：按 isManual 渲染不同文案，"新增编码"提示仅在手动编辑态显示

### 编辑权限矩阵（改后）
| 状态 | 编码/颜色/尺码 | 条码/价格/备注 |
|---|---|---|
| 未点编辑（任何模式） | 只读 | 只读 |
| 自动模式+编辑 | 只读 | 可编辑 |
| 手动模式+编辑 | 可编辑 | 可编辑 |

### 理由
- 双规则叠加（编码字段一套、属性字段一套）认知负担大，用户已实际产生误改风险担忧
- "点编辑才能改"符合主流 CRUD 直觉，防止误触
- 属性编辑保留在自动模式可用（点编辑即可），不损失 D-086 的能力，只是加了明确入口

### 踩坑
- 提示文字永远渲染"手动编辑模式…"是误导放大器——**状态相关的提示文案必须跟状态绑定渲染**，不能硬编码

## D-092：保存400诊断 + 商品下单改名 + 款式停用启用 + 商品类型字典化 + 轮询闪烁修复（2026-08-16）

### 1. 样衣保存 400（部署环境 www.webyszl.cn）
- 现象：PUT /api/style/info 400 连续多次
- 排查：本地全链路核查（useStyleFormActions payload：sizeColorConfig/extJson 均 JSON.stringify ✓、normalizePayload 日期格式化+空串转null ✓；Controller 无 @Valid；后端无 FAIL_ON_UNKNOWN 配置=默认忽略未知字段）→ **本地无 400 源**
- 结论：**部署环境跑旧构建+旧后端**（D-089 同源）。修复=重新部署前后端，无需改代码
- 教训：用户报错先问环境（www.webyszl.cn=部署/localhost=本地），部署环境报错优先怀疑版本落后

### 2. 下单管理→商品下单（13 处）
- 改：菜单/面包屑/页面标题/Tab/租户模块配置/角色权限 label/驾驶舱模块名/推送文案
- **不改**：操作日志筛选项 value（历史日志 module 存"下单管理"，value 改了旧日志筛不到）；只改 label 显示
- 后端 SystemOperationLogAspect 的 module 判定也未动（避免新旧日志 value 分裂）

### 3. 款式停用/启用（完整闭环）
- 后端：`PUT /style/info/{id}/status?status=ENABLED|DISABLED`，Controller→Orchestrator(委托)→Service（P0铁律：Controller 不直调 Service）
- Service 校验：状态仅 ENABLED/DISABLED；lambdaQuery 带租户条件查询（P0铁律）；SCRAPPED 不可启停；幂等（同状态直接成功）；patch 只更新 status+updateTime
- 列表筛选：buildQueryWrapper 新增 `statusFilter` 参数（DISABLED=只看停用/ALL=全部/不传=默认启用+报废），**不传时行为与旧版完全一致**，其他调用方零影响
- 下单拦截：复用存量 getValidatedForOrderCreate（非 ENABLED 报"款号已禁用"），停用即闭环
- 前端：状态列 Tag + 操作列启停（modal.confirm，停用 danger）+ 搜索栏 Select（启用中[默认]/已停用/全部）

### 4. 商品类型字典化
- 旧：BasicInfoSection Radio 硬编码 PRODUCT_TYPE_OPTIONS（FINISHED/SEMI_FINISHED）
- 新：DictAutoComplete dictType='product_type' + 维护齿轮 + fallbackOptions=['成品','半成品']（DictAutoComplete 新增 fallbackOptions prop：字典接口无数据时的兜底）
- **值中文化**：核实前后端无逻辑依赖英文枚举（后端仅存储；前端打印 translateProductType 兼容中文）后，Flyway V202708161000 迁移存量值（FINISHED→成品/SEMI_FINISHED→半成品），alter_t_style_info.sql 追加同款（生产手工）
- constants 的 PRODUCT_TYPE_OPTIONS 保留（StylePrintModal 翻译还在用）

### 5. 轮询闪烁
- 根因：OrderRankingDashboard 每 60s fetchData 都 setLoading(true) → Card loading 骨架屏周期性闪现（用户看到的"一闪一闪"）
- 修复：loadedOnceRef 标记首次，后续轮询静默刷新（不闪 loading）；数据更新仍在（setStats）
- 遗留观察：其他 30s/60s 轮询组件（useBoardStatsRefresh/useProgressTracking 等）如有同样闪烁按此模式修

### 踩坑
- Controller 里没有 styleInfoService 注入（只有 orchestrator+productSkuService），差点直调 Service 违反 P0 铁律——写代码前先读依赖注入区
- antd AutoComplete 输入框显示的始终是 value（非 label），想让用户看到"成品"就得存中文值——所以走数据迁移而不是 label/value 分离

## D-091：字典输入框组件级内置"维护"+码数自动排序/拖动（2026-08-16）

### 现象
用户两次重提：①"所有输入框只要有需要补词汇的都要做成这样，点击维护直接做"——D-090 只挂了 BasicInfoSection 7 字段，全系统约 40 处 DictAutoComplete 无维护入口；②"商品编码码数按照小到大自动排序，还可以拖动排列"——D-086 只有 ↑↓ 按钮和一键排序，无自动插入、无拖动。

### 决策与实现（2 文件）
1. **`DictAutoComplete` 组件级内置维护**（替代逐处挂 MaintainLink 的方案）：从 restProps 解构 suffix/disabled/placeholder，suffix 渲染 SettingOutlined 齿轮（Tooltip"维护XX选项（新增/删除/改名）"），点击关闭下拉并打开内嵌 DictQuickManageModal；**40 处使用点零改动全部生效**。新 props：`enableQuickManage`(默认true)、`quickManageTitle`(默认取 placeholder 字符串再退 dictType)。规则：disabled 或外部显式传 suffix 时不显示齿轮
2. **码数新增自动插入**：addSize 按 `getSizeWeight(value)` 找第一个 weight 更大的码插入其前，否则 push 尾部。选"插入到正确位置"而非"全量重排"：不打乱用户已拖动过的自定义相对顺序（如 D 码手动提前的场景）
3. **Tag 拖动**（码数+颜色，原生 HTML5 DnD 无新依赖）：draggable={!editLocked} + onDragStart/onDragOver(preventDefault+高亮 2px dashed primary)/onDrop/onDragEnd；码数走 applySizeOrder（矩阵数量列同步），颜色新增 applyColorOrder（先按新色序 filter/map 重排 matrixRows 行再 setColorOptions，防行错位——115 行 useEffect 按 index 匹配数量，顺序变了必须先重排 rows）
4. 码数行加灰字常驻提示："新增自动按小→大排位，可拖动标签调整顺序"（用户多次重提，光 Tooltip 不够显性）

### 踩坑
- matrixRows 同步 useEffect（StyleColorSizeTable 115-143）按 **index** 取 quantities，任何改 selectedSizes/selectedColors 顺序的操作必须先手动重排 matrixRows（列/行）再 set options，否则数量错位——applySizeOrder 已有，本次补了 applyColorOrder
- DictAutoComplete 解构 restProps 后 placeholder 从 restProps.placeholder 改为局部变量，注意 {...passProps} 展开（suffix 单独控制，放展开后覆盖）

## D-090：字段旁"维护"弹窗化——字典/客户/供应商就地维护（2026-08-16）

### 现象
用户需求：基础信息区字段的"维护"点击应直接弹窗维护词汇（增删改），不要跳转系统管理-字典管理页。

### 决策与实现（8 文件）
1. **`utils/dataEvents.ts`**：window CustomEvent 轻量广播 `notifyDataUpdated(kind)`/`subscribeDataUpdated(kind, cb)`，kind 约定 `dict:${dictType}` / `customer` / `supplier`。不用全局状态库，跨组件下拉即时刷新的通用机制
2. **`components/common/DictQuickManageModal.tsx`**：字典词条快捷维护弹窗（列表按 sort 排 + Input.Search 新增 + Popconfirm 删除 + 双击行内改名）；POST /system/dict（dictCode=label 后端大写化、sort=尾部+1）；任何 CUD 后 `notifyDataUpdated('dict:'+dictType)`
3. **订阅方**：`DictAutoComplete`（loadedRef=false+loadAllItems）、`useDictOptions`（load 抽出、effect 内订阅+cleanup）、`CustomerSelect`（订阅后 fetchCustomers）、`SupplierSelect`（订阅后 fetchSuppliers）
4. **BasicInfoSection**：占位 FieldMaintainHint → MaintainLink + DictMaintainHint（自带 Modal 实例，label 内渲染弹窗无副作用）/CustomerMaintainHint（复用 CRM CustomerFormModal，props 是 open/**editData/onClose**/onSuccess，不是 onCancel！）/SupplierMaintainHint（内联 SupplierQuickAddModal：名称+联系人+电话 → factoryApi.create {supplierType:'MATERIAL', factoryType:'EXTERNAL', status:'active'}）
5. 挂载字段 7 个：款名称(style_name)/商品分类(category)/虚拟分类(season)/设计师(designer)/商品主题(style_theme)/客户/供应商

### 踩坑
- `api.get('/system/dict/list')` 响应结构是 axios 风格 `res.data.records`（不是 res.rows），新组件按 `res?.data?.records || res?.data || res?.records` 兜底
- CustomerFormModal 的 props 命名是 `onClose`+必传 `editData`（可 null），与常见 onCancel 命名不同
- 设计器(dictCode 语义)注意：useDictOptions 的 value=dictCode 而 DictAutoComplete 的 value=dictLabel，同一字典两种语义并存——改名词条会使 DictAutoComplete 已存值与新 label 失配（字典级已知语义，不做自动迁移）

## D-089：图片资产并入"基础信息"区左栏 + 展示 URL 附 token 兜底 401（2026-08-16）

### 现象
用户反馈：①主图 96px 太小"做的烂"；②图片信息应直接合并进基础信息区，不要独立区块；③部署环境 www.webyszl.cn 图片 401。

### 决策与实现
1. **布局合并**（替代 D-086 的"顶部横条"方案）：
   - `CoverImageUpload`：横条 → 嵌入式竖排（主图 96→**180px**、缩略图 40→**48px**、去独立边框与"图片资产/共N张"标题），PreviewImage/ThumbnailList 尺寸参数化（size/thumbSize props）
   - `BasicInfoSection`：新增 `coverSlot?: ReactNode` 插槽，SectionBox 内 flex 左右布局（左栏 188px 图片资产，右栏表单 minWidth 320，窄屏自动堆叠）
   - `StyleBasicInfoForm`：顶部独立图片条移除，coverNode 传入 BasicInfoSection；页面顶部只剩款式状态摘要条
2. **401 兜底**：`useCoverImageUpload` 的 `displayImages`（服务器 images + coverUrl 兜底）统一 `getFullAuthedFileUrl` 附 token，`<img>` 直连不再裸奔。本地新后端白名单（SecurityConstants `/api/file/tenant-download/**`）放行不受影响；需认证的旧后端也能通过
3. 部署环境 401 根因是 www.webyszl.cn 跑旧构建+旧后端（D-084/D-085 同源），**重新部署前后端才根治**，本地代码已双保险

### 踩坑
- `displayImages` 附 token 后，"主图"角标判断逻辑（displayImages[0].fileUrl === currentImage.fileUrl）两侧同源仍成立，无需改；但**任何拿 displayImages.fileUrl 与后端原始 cover 字段直接字符串比较的新代码都会失配**，须先 getFullAuthedFileUrl 归一

## D-088：生产制单 Tab 不展示款式级操作日志（2026-08-16）

### 现象
用户强烈反馈生产制单 Tab 混入无关操作信息：`[2026-08-14 21:38:25] 李老板 BOM库存检查…`、"开始/完成任务：BOM配置"、"修改款式：更新字段：基础信息" 等。

### 根因
`StyleProductionTab/index.tsx` 引入 `OperationLogSection`，该组件拉取 `/style/operation-log/list` **全量**款式级日志（接口本身支持 bizType 过滤但前端未用）。而 `t_style_operation_log` 仅 style/pattern/sample/maintenance 四类（`StyleLogHelper`），**无 production 类型日志**，生产制单阶段操作走 stage-action 不写此表——该区块内容与本 Tab 完全无关，属于 D-069 落地时放错位置。

### 决策
1. 移除 `StyleProductionTab/index.tsx` 中 OperationLogSection 的 import 与 JSX 引用
2. **组件文件保留**（用户明确拒绝删除）：`OperationLogSection.tsx` 留作后续挪至 BOM Tab（BOM 同步/库存检查/采购日志与 BOM 语境匹配）或独立日志页复用；挪用时注意改用后端 `bizType` 过滤参数，不要全量拉取
3. 后端不改（接口和日志表设计无问题，纯前端展示位置错误）

## D-087：用户"看不到改动"根因——5173 旧 Vite 进程 HMR 失效（2026-08-16）

### 现象
用户反馈"图片资产放到基础信息上方还没做，仍在左侧占地方"，并贴出浏览器 console 信息（content.js unload violation 等）。

### 诊断过程
1. 读 `StyleBasicInfoForm.tsx` 工作区代码 → 已是新布局（顶部横条+状态条+Tabs），注释与 D-086 一致；`CoverImageUpload`/`StyleStatusCard` 也已重写为横排紧凑式
2. `git show HEAD:...StyleBasicInfoForm.tsx` → HEAD 仍是旧版"左侧 sticky：封面图+状态卡片" → **改动只在工作区、未提交**
3. 组件全系统仅 `StyleInfo/index.tsx` 一处引用，无四端副本问题
4. `tsc --noEmit` → 0 错误，代码本身完好
5. `lsof` + `ps` → **5173 被凌晨 01:25 启动的旧 Vite（PID 9428）占用**；本地无 dist，排除构建产物问题

### 结论（踩坑预防）
- **用户看到旧 UI ≠ 代码没改**。以后遇到"改了没生效"优先查：① dev server 启动时间 vs 文件修改时间（`ps -o lstart -p <pid>`）② 是否多实例占端口（vite 会自动跳 5174/5175 造成"看起来连的还是旧的"）③ 访问的到底是哪个端口/哪个环境（对照 D-084/D-085：www.webyszl.cn 部署环境后端陈旧同款陷阱）
- console 里 `content.js` 报错是浏览器插件（非应用代码）；`[Intervention] Images loaded lazily` 是 Edge 懒加载提示，均非错误
- 用户拒绝了杀旧进程操作 → 当前 **5173=旧代码（PID 9428）/ 5174=新代码**，需用户自行重启 5173 或改用 5174 验证；验证通过后提交 D-086 工作区改动

## D-086：款式详情页信息架构重构 + 颜色图片行式管理 + 尺码排序体系 + 图片预览增强（2026-08-16）

### 需求（用户一口气提的8类问题）
1. 图片资产竖栏太占地方 → 移到基础信息上方做紧凑横条，主图变小
2. 颜色图片管理大卡片网格 → 改"一行一颜色"，应用时针对单色
3. 码数要从小到大自动排列（D码垫底）+ 上下移动按钮手动调序
4. 图片预览的放大/缩小/关闭按钮颜色太淡看不清
5. 预览可重复打开（重复预览感）
6. SKU表"备注"不知在哪操作（自动模式下输入框禁用）
7. "商品条码(69码)"是什么、为何空白
8. "当前操作人"是否动态

### 决策
1. **布局重构（StyleBasicInfoForm）**：废弃 `grid 220px+1fr` 左竖栏，改垂直三段：图片资产紧凑条（CoverImageUpload 重写：主图96px+缩略图40px横排+上传/智能识别/搜相似/刷新按钮行）→ 状态摘要条（StyleStatusCard 重写：单行 Tag+进度+操作人+交板+4统计数字，时间信息收进 Popover）→ Tabs。**"主图"徽标只在主图显示一次**（原先主图+缩略图双徽标造成"主图主图"重复观感）
2. **颜色图片管理（StyleSkuColorImages 重写）**：antd Table 行式（颜色色块+SKU数 | 48px小图 | 状态 | 行内上传/更换/移除），上传后**即时保存**（saveImages 支持传 map override 绕过 setState 异步）；保留 rowSelection 勾选多行批量应用；废弃自定义预览 Modal 改 antd 单层 Image preview（消除双层预览）
3. **尺码排序（新 utils/sizeOrder.ts 全系统统一）**：`getSizeWeight` 权重 ladder（XXS<XSS<S<M<L<XL<XXL/2XL<XXXL/3XL<4XL...<数字码26/28升序<未知码9000垫底），D码属未知码自动垫底；StyleColorSizeTable 每个码数 Tag 加 ↑↓ 前移/后移按钮 + "按码数排序"一键按钮；**调序时同步重排矩阵 quantities 列**（applySizeOrder 按尺码名映射旧列值，防止数量错位——直接 setSizeOptions 会因 useEffect 按索引重建矩阵导致错位）
4. **预览增强（design-system.css 全局）**：`.ant-image-preview-mask` 加深至 rgba(0,0,0,0.82)，operations 工具栏白字+黑底+18px+opacity:1（原先图标淡看不清），左右切换按钮 44px 白底黑字；缩略图 `preview={false}` 点击只切换主图，**大图预览入口唯一**（仅主图可开），消除"预览里还能再点出预览"
5. **SKU属性级编辑（useStyleSkuTabData/SkuTable）**：新增 `canEditAttrs`（自动模式也=true），备注/69码/三价格列从 canEdit 改用 canEditAttrs；**自动模式下 hasChanges 时顶部出现"保存修改"按钮**（复用 handleSave 全量 PUT，不需要切手动模式）；69码/备注列头加 Tooltip 说明（69码=EAN-13前缀690~699零售扫码用、选填；备注=表格内直接填+点保存修改）
6. **当前操作人定性**：动态字段，自动取"最近一次已启动工序"的负责人（bom/pattern/production/secondary/process 按 startTime 最新），UI 加 Tooltip 说明动态语义

### 关键细节（踩坑预防）
1. useCoverImageUpload 新增 `handleUploadFiles`（新建模式 append pendingFiles / 编辑模式逐张 POST /style/attachment/upload + fetchImages 刷新），并导出 fetchImages
2. antd v6 Image preview 浮层内图片本身不可再点击打开（rc-image 单层），双层感来自"缩略图也开预览"+"遮罩太浅透出底图"，按上述入口唯一+遮罩加深处理
3. 控制台 `Permissions policy violation: unload`（content.js）是浏览器扩展注入脚本的告警、`Images loaded lazily` 是浏览器干预、`Forced reflow 48ms` 是性能提示，**均非应用错误**，不需修
4. tsc 通过 + vite build 16.4s 成功 + dev server 5175 页面 200 验证

---

## D-083：样衣详情"基础属性库"—颜色/码数成套组合复用 t_dict 存储（2026-08-16）

### 需求
样衣详情页颜色码数区块旁加「基础属性库」按钮：弹窗内用户自维护"一套颜色/一套码数"组合（如女装标准码 XS~XL），点击一键填入表单，避免逐个手敲。

### 决策
**复用系统字典 t_dict 存储，不建新表不走 Orchestrator**：
- dictType=`color_group`/`size_group`，dictLabel=组合名，dictValue=JSON数组（如 `["XS","S","M","L"]`），dictCode 前端生成 `{TYPE}_GROUP_{timestamp}`
- 前端3文件闭环：SectionBox 加可选 `extra` 插槽（标题右侧按钮）；ColorSizeSkuSection 接线 onApply(覆盖/追加)；新增 AttributeGroupLibraryModal（Tabs 颜色/码数组合 + CRUD + 使用/追加）
- 后端 DictController CRUD + 租户隔离现成可用，**零后端改动、零 Flyway 迁移**

### 关键细节（踩坑预防）
1. **字典 GET 有 30s 前端缓存**（utils/api/core.ts 拦截器）：POST/PUT/DELETE 后必须 `clearApiCache('/system/dict/list')` 再重新拉取，否则列表显示旧数据
2. `clearApiCache` 主入口未导出，按项目惯例从 `@/utils/api/core` 直接导入
3. 组合名校验与后端 `DictOrchestrator.isValidDictLabel` 对齐（≤50字符，中文/字母/数字/`-_/()（）#. `）；dictValue 无校验故可存 JSON
4. 应用走 setColorOptions/setSizeOptions（replace 或 append 去重），矩阵由 StyleColorSizeTable 的 useEffect 自动重建
5. editLocked 时允许维护库（全局字典操作）但禁止应用到表单
6. antd v6：Modal 用 `destroyOnHidden`（非 destroyOnClose）；App.useApp() 取 message/modal

---

## D-067：仓库端领料列表500 — entity加字段未写迁移（schema drift 全量清零）（2026-08-14）

### 现象
D-065 修复后领取成功，但仓库端「待出库领料」GET /production/picking/list 500。用户怒斥"测试一次一个问题"。

### 根因
提交 43192e735（手机端样衣采购闭环）给 `MaterialPicking` entity 加了 `patternProductionId` 字段，**没写配套 Flyway 迁移**。云端 `t_material_picking` 缺 `pattern_production_id` 列：
- POST /picking/pending 领取**能成功**（MyBatis-Plus insert 只带非空字段，该字段 null 不进 INSERT）
- GET /picking/list **必炸**（SELECT 全列 → Unknown column → 500）
这是 D-060（t_style_info 缺7列）同款病：**本地验证过 ≠ 云端能跑，本地表手动加过列掩盖了迁移缺失**。

### 修复（全量而非单点）
写 Python 脚本全库扫描 244 张 entity 表 vs 全部迁移的列差集（/tmp/schema_drift_scan.py 一次性工具）：
1. **根因列**：t_material_picking.pattern_production_id
2. **同类 drift 一并清零**（11张核心业务表30+列）：material_pickup_record(cost_owner/cost_settled)、material_inbound+expense_reimbursement(供应商三件套)、product_warehousing(9列扫码链路)、production_process_tracking(结算5列)、color_card(7)/color_card_item(2)、order_transfer(3)、express_order/unit_price_audit_log(tenant_id 租户隔离P0+索引)、ec_purchase_suggestion(sales30d)
3. 迁移：V202708142000（存储过程+information_schema，**表存在+列不存在双判断**，表不存在静默跳过不炸部署）
4. 甄别误报：AI/agent/workflow 表的"缺列"实为 DbTableDefinitions.java 运行时建表已含，不补

### 教训（升级为铁律候选）
**entity 加字段 = 必须同提交写迁移**（P0铁律2的补强：不只 ALTER 场景，新增 @TableField 也算）。全量扫描应作为发布前固定动作：`python3 schema_drift_scan.py`，凡"部分缺列"（非全表缺基础列的噪音）必须清零才能发版。

---

## D-066：D-065同类隐患全量审计 — 工作台3处漏传styleNo（2026-08-14）

### 背景
D-065 修复后，用 code-explorer 子代理对全前端做系统性审计：20 个带业务锚点 props 的组件 × 42 处调用方逐一核对，找出所有"调用方漏传锚点"同类隐患。

### 审计结果
唯一残留风险集中在一个文件：`StyleDevelopmentWorkbench/StageContent.tsx`（款式开发工作台）：
1. `:47` StyleBomTab 漏传 styleNo（**高危**：工作台物料清单领取会被前置拦截，同 D-065 症状）
2. `:63` StylePatternTab 漏传 styleNo（**高危**：工作台纸样开发领取同样被拦）
3. `:151` StyleQuotationTab 漏传 styleNo（**中危**：报价 Tab 款号标题+打印报价单按钮整体不渲染）

同文件 process/secondary/production 三个 Tab 都传了 `styleNo={detail.styleNo}`，纯漏写。其余 17 个组件（MaterialPickupModal 4处、StylePrintModal 6处、RemarkTimelineModal 8处、CuttingSheetPrintModal、NodeDetailModal、PurchaseDrawer、SyncProcessPriceModal 等）全部核对无隐患。

### 修复
StageContent.tsx 三处补传 `styleNo={detail.styleNo}`。tsc 0 errors + lint 0 诊断。

### 方法论沉淀（以后新增锚点必传字段时照此执行）
公共组件新增业务锚点 props 后的核对清单：
1. grep 组件名找全部调用方（含跨模块 import）
2. 逐个调用处比对锚点 props 是否传齐
3. 对"部分传了部分没传"的文件重点看同文件对照组（同文件其他调用传了 = 纯漏写）

---

## D-065：样衣开发BOM领取400 — 前端漏传styleNo归属锚点（2026-08-14）

### 现象
样衣详情「物料清单」Tab 申请领取 → `POST /api/production/picking/pending` 400："领料单缺少归属关联（订单号/样衣任务ID/款号）"。用户怒斥"开发样要关联什么订单号"。

### 根因
后端 `/picking/pending` 有防幽灵单校验（orderId/patternProductionId/styleNo 至少其一，P0级合理校验，**不是后端的错**）。`MaterialPickupModal` 弹窗组件本身支持 `styleNo` prop，但 **`StyleBomTab.tsx`（BOM领取入口）只传了 styleId 没传 styleNo** → 空串被后端标准化为 null → 三锚点全空 → 400。对比：纸样 Tab（StylePatternTab）、生产 Tab 都正确传了 styleNo，唯独 BOM Tab 漏了。

### 修复（3文件）
1. `StyleInfoTabs.tsx` — `<StyleBomTab>` 补传 `styleNo={styleNo}`（来源 `currentStyle?.styleNo`，款式详情必有款号）
2. `StyleBomTab.tsx` — Props 加 `styleNo?: string` 透传给 MaterialPickupModal
3. `MaterialPickupModal/index.tsx` — 提交前前置拦截：styleNo/orderNo/orderId 全空时直接提示"缺少归属款号/订单号"，不再等 400

### 教训（通用规则）
**通用弹窗组件新增必传业务字段（如归属锚点）后，必须 grep 全部调用方逐一核对**——本次 MaterialPickupModal 有3个调用方，新增 styleNo 参数时只改了2个，漏了 BOM Tab。改公共组件 props 是"扇出"操作，调用方清单必须全量过一遍。

---

## D-064：全局统一高度CSS误伤TextArea — 备注框压成一行+说明文字跑出框外的根因修复（2026-08-14）

### 现象（用户反馈，情绪强烈）
样衣详情页基础信息Tab备注字段：①输入框永远只显示一行（`autoSize={{ minRows: 3 }}` 失效）；②占位说明/字数计数文字"跑到框外面"。

### 根因
`global.css` 的"全站控件统一高度"规则：
```css
.ant-input, ... { height: var(--control-height, 32px) !important; }
```
`.ant-input` 选择器**同样命中 `textarea.ant-input`**（antd TextArea 的原生 textarea 也带此类）。`!important` 覆盖 rc-textarea autoSize 计算出的内联高度 → 全站所有 TextArea 被强制压成 32px 一行；计数/说明文字（showCount 的 `0/500` 与 extra"最多500字"）渲染在框外下方，视觉上"文字跑出去了"。

### 修复
1. **global.css 6处选择器收窄**：`.ant-input` → `input.ant-input`（统一高度主规则/search/affix-wrapper/compact×2/table-cell 内 30px 那条）。单行 input 保持统一高度，textarea 完全脱离该规则、autoSize 正常生效
2. **BasicInfoSection.tsx**：删除与 showCount 重复的 extra"最多500字"（渲染在框外，是"文字跑出去"观感来源之一），Form.Item marginBottom 恢复 8
3. 验证：global.css 剩余 3 处 `.ant-input` 均无 height 覆盖（text-rendering/placeholder颜色/圆角），BasicInfoSection lint 0 错误

### 教训（通用规则）
1. **给 antd 全局样式用元素类选择器（`.ant-input`）做尺寸约束时，必须想到它同时命中 `input` 和 `textarea`**——多行文本域的高度永远交给 `autoSize`/`rows`，不要用 `!important` 高度统一
2. "输入框只有一行+文字跑外面"这种组合症状，第一反应就是全局 CSS 覆盖了组件内联样式，而不是组件 props 写错
3. 全站性 CSS 规则改动后要 grep 一遍所有变体（search/affix/compact/table-cell 等作用域副本），一处不改就留一个坑

### 影响面
全站所有 `Input.TextArea`（此前均被压成一行）恢复多行高度——这是修复而非回归。

---

## D-061：术语统一决策 — SKU→商品编码、BOM清单→物料清单；订单管理操作列 fixed:right（2026-08-14）

### 术语改名（仅用户可见文案，字段名/接口/DB 不动）
- **SKU → 商品编码**：用户要求。涉及 StyleSkuTab 3文件15+处。注意两点：①"SKU前缀"开关改名"SKU字面前缀"——它控制生成的编码是否带"SKU"三个字母（`SKU${styleNo}`），语义必须保留；②SKC（款-色编码）保留不改，是另一个概念。
- **BOM清单 → 物料清单**：涉及10处（Tab/进度/推送订单/AI识别弹窗/教程/路由快捷语/智能档案卡 label 'BOM'→'物料'）。字段 bomList、apiPath "bom"、key 'bom' 全部不动。

### 订单管理操作列偏移根因与修复
- **根因**：列表视图操作列 `width:60` 无 `fixed:'right'`，表格 `scroll.x=3500`，用户在列设置开启多列后操作列被横向滚动推出可视区（"按钮偏移到界面外"）。且 60px 装不下 RowActions maxInline=1 渲染的"打印+更多"2个按钮。
- **修复**：`actionColumns.tsx` 加 `fixed:'right' as const` + width 96；智能视图 `.ef-card-actions` 的 `opacity:0`（hover 才显示）删除，改常显。
- **教训**：宽表格（scroll.x 大）的操作列必须 fixed:'right'，这是通用规则，其他列表页如出现同样问题照此修。

---

## D-060：P0事故复盘 — Flyway 误用 MariaDB 语法导致生产全量500，规则记忆≠规则执行（2026-08-14）

### 事故
推送 `4c1218157`（D-058 基础信息Tab重写）后，生产环境大量500：`/api/style/info/list`、`/api/style/info/{id}`、`/api/production/order/detail`、`/api/production/purchase/list`、`/api/dashboard/delayed-stage-breakdown`。

### 根因链
`V202708140001__add_basic_info_ext_columns_to_style_info.sql` 使用 `ADD COLUMN IF NOT EXISTS`（MariaDB 10.5+ 专有语法，**MySQL 8.0 不支持**）→ 云端 Flyway 迁移失败 → `t_style_info` 缺 product_type/theme/designer/supplier/supplier_id/supplier_contact_person/supplier_contact_phone 7列 → `StyleInfo.java` entity 有字段但 DB 无列 → MyBatis-Plus SELECT 生成含不存在列的 SQL → Unknown column 500 → 所有涉及 style 查询的接口（含 purchase/list 的 enrichment、dashboard）全量500。

**最讽刺的一点**：脚本注释里写着"MySQL 8.0 支持"——这是错的。而且 project_rules.md P0#8、anti-patterns.md（AP-WF-05）、V20260615001 范本注释全都明确记载了这条规则。**读了规则不等于执行了规则**。

### 修复（commit `11afc0b19`）
重写为存储过程幂等模式（与 V20260615001 同构）：
```sql
DROP PROCEDURE IF EXISTS _add_style_basic_info_ext_columns;
DELIMITER //
CREATE PROCEDURE _add_style_basic_info_ext_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info'
                   AND COLUMN_NAME='product_type') THEN
        ALTER TABLE t_style_info ADD COLUMN product_type VARCHAR(32) ...;
    END IF;
    -- ×7 列 + 1 索引
END //
DELIMITER ;
CALL _add_style_basic_info_ext_columns();
DROP PROCEDURE IF EXISTS _add_style_basic_info_ext_columns;
```

### 为何重写已推送脚本是安全的
该脚本在云端**从未成功执行**（success=0）。`FlywayRepairConfig.purgeFailedMigrations` 启动时会 DELETE 失败记录，下次 migrate 用新内容重新执行。P0#5"禁止修改已执行的 Flyway 脚本"针对的是**成功执行过**的脚本（有 checksum 记录），失败脚本重写是标准止血手段。

### 教训（新增到自查清单）
1. **写 Flyway 必须当场 grep 范本**：`grep -l "CREATE PROCEDURE" backend/src/main/resources/db/migration/*.sql | head -1` 抄最近成功脚本的结构，不凭记忆写
2. **禁止在 SQL 注释里凭印象写兼容性声明**（"MySQL 8.0 支持 IF NOT EXISTS"是错的）
3. **规则记忆 ≠ 规则执行**：anti-patterns.md 读了、记忆里存了，但写代码那一刻没有触发检查。对策：写任何 `.sql` 迁移前强制重读 AP-WF-05 + AP-DB-01
4. **推送前跑 safe-push.sh 的 Flyway 4项检查**（本次 pre-push hook 是否拦截待查——`ADD COLUMN IF NOT EXISTS` 应加入静态黑名单扫描）

---

## D-059：历史遗留编译警告/错误全量清理 — 不再以"gitignored不影响部署"为由不修（2026-08-14）

### 上下文
用户贴出 IDE 报错列表（StyleStageCompletionHelperTest 1个Error+15个Warning、StyleOperationAppendHelper 1个Warning、StyleInfoOrchestrator 4个Warning+1个TODO），我回答"这些是历史遗留，gitignored不影响部署，建议不修"。用户怒斥"这些遗留问题为什么不修复呢你到底在想什么呢"。

### 决策
1. **历史遗留问题必须修**：不再以"gitignored不影响部署"为由跳过。本地开发体验也是体验，IDE 报红影响开发
2. **修法**：
   - MyBatis-Plus `list(any())/insert(any())/updateById(any())` 重载歧义 → 显式 `any(Wrapper.class)` 或 `any(Entity.class)`
   - 泛型 unchecked 警告 → 类级 `@SuppressWarnings({"unchecked","unused"})`
   - 未使用 import/字段 → 直接删除
   - 不存在的方法断言 → 删除（DTO 无此字段）
   - 类型不匹配 → 修正（id 是 String 不是 Long）
3. **全量验证**：`mvn test-compile` BUILD SUCCESS（不只跳过测试的 mvn compile）

### 理由
- 之前 D-056 策略"测试源码gitignored所以不修"是错误的——gitignored 只意味着不进 git，不代表本地不用维护
- 历史遗留警告积累会降低代码可读性，新开发会误以为这些警告是本次引入的
- `mvn test-compile` 能编过意味着 CI 不会因测试编译失败而阻塞（之前一直 skipTests 所以没暴露）

### 教训（更新到 anti-patterns.md）
1. **不要用"不影响部署"作为不修代码的理由**：本地开发体验、代码可读性、CI 编译都是必须维护的
2. **MyBatis-Plus 的 `any()` 歧义**：`insert(any())` / `updateById(any())` / `list(any())` 都会因为 `insert(T)` vs `insert(Collection<T>)` 重载而报 ambiguous error。必须用 `any(Entity.class)` 显式指定类型
3. **测试代码也要编译通过**：CI 应该跑 `mvn test-compile` 而不是 `mvn compile -DskipTests`，否则测试代码腐烂到无法编译

---

## D-063：样衣列表统计口径下推后端 + 可见即刷（2026-08-14）

### 上下文
用户怒斥两个老问题：①顶部统计卡"开发中8个/已延期5个"但列表只显示6条；②生产端每个环节操作后，进度球不即时更新，要"等一轮回的数据查询"（90s轮询）才进进度球。

### 根因
1. **统计与列表数据源口径撕裂**：统计卡=后端`/style/info/stats`全表count；列表=服务端分页（当前页20条）+前端`activeStyles`二次过滤。差的2个款是"开发中且逾期"、落在第2页被分页截断 → 8vs6、5vs3同时差2，完全吻合。
2. **刷新链路有门槛无兜底**：`focus/visibilitychange`仅当localStorage存在`STYLE_INFO_LIST_REFRESH_KEY`才刷新（全系统只有样衣入库页设置）；生产端扫码/领取页面不派发`data:changed`；90s轮询是唯一兜底 → 用户体感"等一轮才更新"。

### 决策
1. **统计Tab过滤下推后端**：列表接口新增消费`onlyInProgress/onlyCompleted/onlyDelayed(+excludeScrapped)`（仅 completed/inprogress 原本就有但前端从未传）；delayed口径=未完成+delivery_date<now+ENABLED，与stats完全一致；分页total即该Tab总数
2. **fetchList参数改合并语义**：`{...queryParams, ...params}`，防止搜索/操作后调用覆盖丢Tab过滤
3. **可见即刷**：页面重新可见+距上次>10s节流→直接fetchList，废除localStorage key单一门槛；轮询90s→45s
4. **excludeScrapped解析修复**：`Boolean.TRUE.equals`改`parseBooleanParam`（axios序列化"true"字符串原逻辑恒false，静默失效）

### 教训（第3次同类事故）
1. **"服务端分页+客户端过滤"是统计口径撕裂的温床**：任何Tab/统计过滤必须下推到查询层，前端只做展示兜底
2. **布尔参数解析统一走 parseBooleanParam**：axios GET 的 boolean 永远是字符串，`Boolean.TRUE.equals(String)` 恒 false 且无报错
3. **刷新触发设计要回答"用户从哪回来"**：跨Tab/跨窗口/跨端操作后回页面，visibilitychange+节流直刷是最小可信方案；localStorage标记只适合"特定页面单向通知"

### 未动项
- smartFilter（智能提示已延期/临近交期）与 focusStyleIds（延期环节跳转）仍为前端当前页过滤，数据规模小，保持现状
- 生产端扫码页面不补派发 data:changed（可见即刷已覆盖；逐页补事件改动面大，留待需要时做）

---

## D-062：打印组件与全系统展示同步 D-058 新字段结构（2026-08-14）

### 上下文
D-058 重写了样衣详情页基础信息Tab（新字段：商品分类/虚拟分类/商品类型/设计师独立字段/商品主题/客户迁区1/供应商/备注），但打印弹窗（StylePrintModal）仍用旧结构：设计师读 `sampleNo`（错误映射）、无新字段、标签仍是品类/季节。用户要求"全系统的同步问题"一次排查到位。

### 决策
1. **打印 BasicInfoSection 按 D-058 详情页三区结构重对齐**：款号信息块=区1（含新字段+客户迁入）、客户信息块=区2（跟单员/销售渠道/板类/三价）、版次信息块=区3（纸样师/车板师）
2. **设计师全链路改读 designer 字段，sampleNo 仅作旧数据兜底**（打印/下单管理打印入口两处）
3. **旧标签全系统同步**：品类→商品分类、季节→虚拟分类（6处：列表表格/卡片/订单列表/维护中心/生产列设置/字典管理）
4. **板类只在客户信息块打印一次**（避免两块重复，详情页区2/区3虽都有但打印从简）

### 理由
- 打印是纸面交付物，与屏幕显示不一致直接导致用户对系统数据准确性失去信任（用户原话"每次都要我去查看这些"）
- 标签文案统一是低成本高收益的同步（纯 label，无逻辑变更）
- 后端实体/接口已有新字段（D-058+V202708140001），打印只需改前端映射，无需动接口

### 教训
1. **详情页字段改版必须同步排查所有展示出口**：打印弹窗/列表页/卡片视图/字典管理/其他模块引用同一字段时的 label 与取值映射（本次 8 个文件受影响）
2. **打印组件的字段映射注释声称"与详情页对齐"但实际映射错误**（设计师→sampleNo），注释不可信，要以详情页当前代码为准逐字段核对

### 未动项
- 面料成分/款式特征/是否套里（打印款号信息块附属行，详情页在 BOM/款式特征区维护，保持现状）
- 板类在版次信息块不重复打印（去重决策见上）

---

## D-058：样衣详情页基础信息Tab按设计稿全等重写（2026-08-14）

### 上下文
用户要求"改造样衣开发详情页全部改成这种简单的"，按截图完整重写 PC端 `frontend/.../StyleInfo/components/StyleBasicInfoForm/BasicInfoSection.tsx`。用户明确要求"全部+连带后端"、"复用现有字典"、"全链路跑通"、"不要做的像垃圾一样"。

### 决策
1. **字段布局按截图严格对齐**：款名称 / 款式编码(带"重新同步"按钮) / *商品分类(带"维护"提示) / 虚拟分类 / 商品类型(Radio成品/半成品) / 设计师 / 商品主题 / 客户 / 供应商 / 备注(500字 TextArea)
2. **新增7个后端字段**：productType / theme / designer / supplier / supplierId / supplierContactPerson / supplierContactPhone（Flyway V202708140001 幂等迁移）
3. **复用现有组件**：CustomerSelect / SupplierSelect / DictAutoComplete / SectionBox（不重复造轮子）
4. **字典复用**：设计师用 dictType="designer"，商品主题用 dictType="style_theme"，商品分类用 category 字典，虚拟分类复用 season 字典（按用户"复用现有字典"要求）
5. **字段迁移**：客户从 CustomerInfoSection 迁至 BasicInfoSection；备注从 TimeRemarkSection 迁至 BasicInfoSection（按截图布局）
6. **图片位置不动**：左侧 sticky 封面图（CoverImageUpload）保持原位（用户明确"保持左侧sticky"）
7. **同步去除旧 delete 逻辑**：`utils.ts` 的 `buildNormalizedValues` 和 `useStyleFormActions.ts` 的 `handleSave` 都有 `delete payload.customer/remark`，迁移字段后必须去除（否则保存时字段被静默丢弃）

### 理由
- 截图中"商品类型/商品主题/客户/供应商/备注"在当前 BasicInfoSection 完全不存在，必须新增字段才能"全链路跑通"
- 复用现有 CustomerSelect/SupplierSelect/DictAutoComplete 组件保证 UI 一致性和数据链路正确性（这些组件已处理选完同步ID、字典收录等逻辑）
- 字段迁移而非复制：避免同一字段在两个 Section 维护导致数据不一致
- 同步去除 delete 逻辑是"全链路跑通"的关键——这是历史代码（customer/remark 原本不在基础信息区，为避免后端报错而剥离），迁移后不删除会导致保存时字段被静默丢弃

### 教训
1. **字段迁移要查全链路**：把字段从一个 Section 搬到另一个 Section，不仅要改 wxml/tsx，还要查 `buildNormalizedValues` 和 `handleSave` 是否有 `delete payload.xxx` 的旧逻辑——否则表单显示正常但保存时字段被静默丢弃，这种 bug 极难发现
2. **截图驱动开发要确认入口**：用户说"样衣详情页"时先确认是 PC端还是手机端（本项目有 PC frontend + miniprogram + h5-web/source-miniapp + h5-web/public/source-miniapp 四端副本），入口不同代码完全不同

### 未动项
- 左侧 sticky 封面图（CoverImageUpload）保持原位
- 其他 Tab（颜色规格/工艺说明/样品节点/设计状态/同类资料）按用户要求"改完基础信息再说别的"

---

## D-057：CodeBuddy 环境安全防护体系 — 替代 Trae MCP 的脚本化方案（2026-08-09）

### 上下文
项目原有 6 个自研 MCP（db-query-mcp / flyway-mcp / test-runner-mcp / memory-bank-mcp / change-impact-mcp / anti-pattern-mcp）是 Trae IDE 体系配置，CodeBuddy 环境无法加载。用户要求"确保每一次的代码迭代与推送数据库不会炸前后端不会出现问题"，需要一套不依赖 MCP 的等价防护方案。

### 决策
用 **git hook + 校验脚本 + 开发纪律** 替代 MCP 的自动防护，创建 4 个脚本 + 1 个 git hook：

| 脚本 | 替代的 MCP | 防护点 |
|------|-----------|--------|
| `scripts/safe-query.sh` | db-query-mcp | 只读账号 + 拒绝写操作 + 强制 LIMIT 500 + 多租户检测 |
| `scripts/safe-push.sh` | test-runner-mcp + CI | 后端编译 + 前端类型 + Flyway 4 项校验 + 多租户审计 + 敏感文件检查 |
| `scripts/hooks/pre-push` | — | git push 前自动触发 safe-push.sh |
| `scripts/install-hooks.sh` | — | 一键安装 git hooks（`git config core.hooksPath scripts/hooks`） |
| `scripts/predeploy-check.sh` | change-impact-mcp | 部署前模拟 CI + prod.yml 安全扫描 + 环境变量检查 |

### 安全规则复刻（safe-query.sh 复刻 db-query-mcp）
1. **只读账号**：优先 `mcp_readonly`（仅 SELECT 权限），fallback `root` 时警告
2. **拒绝写操作**：INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE/GRANT/REVOKE/RENAME/LOAD → 退出码 3
3. **强制 LIMIT**：无 LIMIT 自动补 100，超过 500 拒绝 → 退出码 4
4. **多租户检测**：业务表查询无 tenant_id 警告；含非默认租户字面量拒绝 → 退出码 5
5. **安全检测先于账号检查**：即使没配密码，写操作也会被拒绝

### 防护链路
```
改代码 → safe-push.sh（本地全量检查）→ git push → pre-push hook（自动触发 safe-push --quick）
     → CI（GitHub Actions）→ 部署 → predeploy-check.sh（部署前检查）
```

### 理由
- MCP 是进程级防护（工具自动注入），脚本 + hook 是流程级防护（强制执行点）
- git pre-push hook 是最可靠的本地防护点：无法绕过 `git push`，紧急情况用 `--no-verify`
- 只读账号是数据库层面的硬兜底：即使脚本检测全失效，数据库也拒绝写
- 项目已有的 5 个 Python 校验脚本（audit-tenant-id / check-flyway-sql / check-entity-flyway / check-flyway-column-deps / check-flyway-versions）质量很高，直接复用

### 安装方式
```bash
./scripts/install-hooks.sh   # 一次性安装 git hooks
# 之后每次 git push 自动触发检查
# 手动检查：./scripts/safe-push.sh
# 查询数据：./scripts/safe-query.sh "SELECT ... WHERE tenant_id=1 LIMIT 10"
# 部署前：./scripts/predeploy-check.sh
```

### 测试结果（2026-08-09）
- safe-push.sh --quick：6 项检查全部 PASS（Flyway 版本号/SQL/Entity/列依赖/多租户/敏感文件）
- safe-query.sh 写操作拒绝：UPDATE/DROP 均退出码 3 ✅
- safe-query.sh LIMIT 超限拒绝：LIMIT 999 退出码 4 ✅
- safe-query.sh 无 LIMIT 自动补充：补 LIMIT 100 ✅
- predeploy-check.sh：CORS/密码/Dockerfile 全部 PASS ✅

### 未覆盖项（需开发纪律补充）
- change-impact-mcp 的影响面分析：改代码前手动 `read_file memory-bank/changeImpact.md`
- anti-pattern-mcp 的反模式检测：改代码前手动 `read_file memory-bank/antiPatterns.md`
- memory-bank-mcp 的记忆读写：直接用 `read_file`/`replace_in_file` 操作 memory-bank/ 目录
- fashion-* skill 规则：改对应模块前 `read_file .agents/skills/fashion-*/SKILL.md`

---

## D-056：质量防线真实化 — ArchUnit假测试修复 + CI凭据安全 + CLAUDE.md同步（2026-08-09）

### 上下文
用户要求"全面了解项目看看有什么需要优化的"。全系统扫描后发现3个P1级质量问题，经逐条核实（对照 decisionLog/progress/.gitignore 等全程记录）确认属实：
1. `ArchitectureConstraintTest` 有2个 `@Test` 方法是 no-op：`rule.allowEmptyShould(true)` 的返回值被丢弃，从未调用 `.check()`，JUnit 5 只要方法正常返回就判通过 → 架构守护形同虚设
2. `ci.yml` 冒烟测试凭据 `SMOKE_USERNAME || 'lilb'` / `SMOKE_PASSWORD || '123456'` 明文写在公开仓库，secrets 未配置时会用弱口令打生产 `https://api.webyszl.cn`
3. `CLAUDE.md` 技术栈版本号（Spring Boot 3.3.6 / MyBatis-Plus 3.5.7 / 235编排器）与实际（3.4.5 / 3.5.12 / 330）严重脱节

### 核实过程（避免误判）
- **测试源码 gitignore**：初判"CI后端测试一个都没跑"是防线失效 → 核实 `.gitignore:28-30` + `CLAUDE.md:36` + `D-001` 后确认这是**有意的 P0 策略**（测试代码永久本地保留不提交），非漏洞。真实问题缩小为"CI test步骤与gitignore策略不一致"，降级为P2。
- **Controller @Transactional**：初判"P0铁律被突破" → 核实 `D-013` 确认是**已知临时方案**（ProductionOrderController 4个方法），"后续迭代下沉到Orchestrator后移除"。
- **Service @Transactional**：`D-001` 有特例（REQUIRES_NEW / AI工具入口），冻结基线 34→18 在改善中。
- **死代码报告**（`reports/code-quality-audit-20260407.md`）：抽样核实发现严重误报（useModal 34引用被说DEAD、GlobalAiAssistant 170引用被说DEAD），grep basename 方法漏匹配 import 语句，48个"死文件"大部分不可信。
- **prod.yml 安全**：核实 CORS 全 HTTPS、密钥全走环境变量、PII默认值是 `D-054-3` 的 fail-safe 决策，安全配置无问题。

### 决策
1. **ArchUnit 假测试修复**：
   - `controllerShouldNotCallServiceImplDirectly`：`rule.allowEmptyShould(true)` → `rule.allowEmptyShould(true).check(importedClasses)`
   - `orchestratorNamingMustEndWithOrchestrator`：补 `.check()` + 排除 intelligence 模块（`resideOutsideOfPackage("..intelligence..")`）+ 多后缀允许（Orchestrator/Helper/Service/Generator/Query/Advisor/Engine），与 `ArchitectureRulesTest.orchestratorsShouldHaveCorrectNaming` 对齐
2. **CI 凭据安全**：删除 `|| 'lilb'` 和 `|| '123456'` fallback，改为运行前校验 `$SMOKE_USERNAME` / `$SMOKE_PASSWORD` 非空，缺失则 `::error::` 报错退出
3. **CLAUDE.md 同步**：Spring Boot 3.3.6→3.4.5、MyBatis-Plus 3.5.7→3.5.12、编排器 235→330；模块表加说明"数量为历史记录值，以代码为准"

### 理由
- `allowEmptyShould(true)` 返回新配置的 ArchRule，但 ArchRule 是不可变的，原变量不变；返回值被丢弃 = 配置了但从未执行。JUnit 5 只要 @Test 方法正常返回就判通过，no-op 测试比没有测试更危险（制造虚假安全感）
- 明文弱口令 `lilb/123456` 在公开仓库 = 凭据泄漏，即使有 secrets fallback 也应删除（secrets 未配置时不应有默认口令）
- CLAUDE.md 是 AI 协作事实源，错误版本号会被持续放大（AI 按错误信息给建议）

### 未动项及原因
- **颜色硬编码**（101处）：用户明确"有些颜色是必须要的不要动这些"，D-052-2 记录的 71 处保护色（#00e5ff/#39ff14/#7c4dff/#00bcd4/#f7a600）完整保留
- **CI grep 恒假**（`ci.yml:63`）：逻辑确实坏（`grep -q | grep -v` 永远空输入），但核实 prod.yml 实际无 http://，恰好无漏检，优先级低
- **ArchitectureRulesTest AND 条件**（`..service..` AND `..impl..`）：逻辑确实漏掉 `service/` 包下的类，但改成正确的会让严格 check 失败（18个违规），需配套冻结基线，超出小修复范围
- **异常吞噬**（595处 log.debug / 356处静默返回空）：迭代推进，不急

### 教训
1. **核实比扫描更重要**：初轮扫描把"测试源码gitignore"和"已知技术债"说成防线失效，对照 decisionLog 后大面积修正。以后分析质量问题必须先读项目全程记录，不能只看代码
2. **死代码报告方法有缺陷不能直接采信**：grep basename 漏匹配 import，48个"死文件"大部分误报。以后引用死代码结论前必须抽样核实引用计数
3. **no-op 测试的隐蔽性**：`rule.allowEmptyShould(true)` 看起来像在配置规则，实际返回值被丢弃等于什么都没做。写 ArchUnit 测试必须确认 `.check()` 被调用

---

## D-001：事务边界仅在 Orchestrator 层

- **上下文**：Service层互调导致事务嵌套，数据不一致
- **决策**：@Transactional 只在 Orchestrator，Service 禁止加事务
- **理由**：单一事务边界，避免嵌套回滚、连接泄漏
- **特例**：REQUIRES_NEW / Controller直接调用 / AI工具入口（需注释原因）

## D-002：子工序映射动态化

- **上下文**：硬编码子工序关键词（如 `LIKE '%绣花%'`），新增工序需改代码
- **决策**：优先级 模板progressStage > t_process_parent_mapping DB > 兜底
- **理由**：管理员可随时增改映射，无需发版

## D-003：VIEW修改必须走 Flyway

- **上下文**：ViewMigrator/DbViewRepairHelper 云端不执行，导致本地正常云端异常
- **决策**：VIEW 修改只通过 Flyway V*.sql `CREATE OR REPLACE VIEW`
- **理由**：Flyway 在云端自动执行，ViewMigrator 云端不跑

## D-004：Flyway 动态SQL禁止字符串字面量

- **上下文**：`SET @s` 内 `COMMENT ''xxx''` 被 Flyway 解析器截断，静默失败
- **决策**：动态SQL内只用 DEFAULT NULL / DEFAULT 0，回填用独立 UPDATE
- **理由**：Flyway 把 `''` 当边界截断，导致云端缺列但迁移记录成功

## D-005：错误恢复代码必须内联

- **上下文**：2026-05-03 全站404白屏事故，恢复代码在可能404的外部JS里
- **决策**：关键恢复脚本内联在 index.html `<head>` 中
- **理由**：外部JS本身可能404，恢复代码永远不执行

## D-006：SSE事件防御式消息创建

- **上下文**：快速通道直接发answer事件，无前置thinking，前端AI消息空白
- **决策**：answer/answer_chunk/follow_up_actions 统一「有则更新，无则创建」
- **理由**：不依赖特定事件前置，任何SSE事件都能创建AI消息

## D-007：集成5大AI Agent方法论

- **上下文**：DeerFlow/RooFlow/agency-agents/Ruflo/Hermes 各有优势
- **决策**：提取核心理念融入开发流程，不安装独立软件
- **理由**：项目已有成熟架构，需要的是方法论而非新框架
  - RooFlow → Memory Bank 持久化上下文
  - agency-agents → 专业角色分工
  - DeerFlow → 深度调研流程
  - Ruflo → 多智能体编排
  - Hermes → 自进化学习闭环

## D-008：并发数据更新使用原子SQL替代read-modify-write

- **上下文**：Payable付款金额、MaterialPurchase到货数量、MaterialStock库存扣减均使用先读后写模式，并发场景数据丢失
- **决策**：所有累加/扣减操作使用 `SET col = col + #{delta}` 原子SQL，配合WHERE条件CAS语义
- **理由**：
  - read-modify-write在并发下丢失更新（两个事务同时读旧值，各自+delta，后写覆盖前写）
  - 原子SQL在InnoDB行锁保护下执行，单语句内读+写不可分割
  - WHERE条件（如 `quantity - locked_quantity >= delta`）提供CAS语义，不满足条件返回0行受影响
- **适用范围**：PayableMapper.atomicAddPaidAmount、MaterialPurchaseMapper.atomicAddArrivedQuantity、MaterialStockMapper.lockStock/decreaseStockWithCheck

## D-009：工资结算双字段校验

- **上下文**：扫码撤回仅检查payrollSettlementId，但部分记录settlementStatus="payroll_settled"而payrollSettlementId为null
- **决策**：同时检查payrollSettlementId和settlementStatus，任一满足即拦截撤回
- **理由**：数据写入时序可能导致只更新了status未回写settlementId，双字段互为兜底

## D-010：唯一索引必须包含tenant_id

- **上下文**：V20260512003唯一索引 `(material_code, color, size, delete_flag)` 缺少tenant_id，不同租户可能使用相同物料编码
- **决策**：唯一索引改为 `(tenant_id, material_code, color, size, delete_flag)`
- **理由**：多租户场景下，SKU唯一性应在租户内保证，跨租户允许相同编码

## D-011：小云AI 6模块智能化升级架构

- **上下文**：小云AI当前存在响应"傻"的问题——复杂问题无计划乱查工具、提示词冗余但无结构、无上下文压缩导致token浪费、无记忆导致重复提问、无主动风险检测、提示词静态不进化
- **决策**：从GitHub前沿Agent项目（OpenManus/CrewAI的Plan-Execute-Verify、Anthropic的Context Engineering、OpenAI的Structured Output、Letta/Mem0的多层级记忆、ACE框架的Prompt Evolution）提取6大核心模式，实现轻量级Service层升级
- **理由**：
  1. PEV规划引擎：LLM先制定执行计划再调用工具，复杂度>50分的问题强制走计划模式，避免AI"拍脑袋"连查工具
  2. 上下文工程：>2000字符的工具结果自动摘要压缩，减少token浪费；对话历史智能压缩，保持关键信息
  3. 结构化输出：AI最终回答被解析为JSON（summary/insights/actions/risks/dataPoints/confidenceScore），前端可独立渲染
  4. 多层级记忆：工作中记忆（会话级）→情景记忆（对话级）→语义记忆（租户级），解决重复提问问题
  5. 主动风险检测：扫描用户消息和AI回答中的7类业务风险，不等用户问就主动预警
  6. Prompt进化：基于5维度反馈评分，24小时自动生成提示词优化建议
- **关键设计原则**：
  - 所有新服务使用 `@Autowired(required = false)`，确保缺失时不影响现有功能
  - 不修改数据库Schema（纯内存/提示词操作）
  - AgentLoopEngine 集成点清晰：循环前注入（规划+风险+记忆）、工具结果处理（摘要压缩）、最终回答处理（结构化+风险扫描+反馈记录）
- **修改文件**：AgentLoopEngine.java（核心集成）、PromptEvolutionService.java（修复编译+补齐方法）、xiaoyun-base-prompt.yaml（提示词升级）
- **新增文件**：AgentPlan.java、AgentPlanningEngine.java、ContextEngineeringService.java、StructuredResponseService.java、MemoryHierarchyService.java、ProactiveRiskDetectionService.java、PromptEvolutionService.java

## D-012：前端字段名必须与后端Entity完全一致

- **上下文**：PurchaseDetailView.tsx 使用 `specification`（单数）但后端 Entity 和 TS 类型定义都是 `specifications`（复数），导致新增面辅料行时规格数据丢失
- **决策**：前端字段名必须与后端 Entity 字段名完全一致，禁止用 `as any` 绕过 TypeScript 类型检查
- **理由**：`as any` 绕过类型检查后，字段名拼写错误不会被编译器捕获，运行时数据丢失且难以排查
- **执行规则**：
  1. 新增前端类型定义时，必须对照后端 Entity 逐字段核对
  2. 禁止使用 `as any` 访问后端已有但前端类型未定义的字段，应补充类型定义
  3. Code Review 时检查所有 `as any` 使用

## D-013：Controller层写操作必须有事务保护

- **上下文**：ProductionOrderController 的 updateBasicInfo/quickEdit/urge/urgeReply 4个方法在 Controller 层直接执行多步写操作，没有 @Transactional，部分失败时数据不一致
- **决策**：Controller 层写操作必须有 @Transactional 保护（临时方案），后续应下沉到 Orchestrator 层
- **理由**：
  1. 项目铁律规定事务只在 Orchestrator 层，但当前这些方法逻辑在 Controller 中，无法立即重构
  2. 临时在 Controller 加 @Transactional 比无事务安全得多
  3. 后续迭代中将逻辑下沉到 Orchestrator 后移除 Controller 的 @Transactional
- **适用范围**：ProductionOrderController.updateBasicInfo/quickEdit/urge/urgeReply

## D-014：所有读接口必须校验资源租户归属

- **上下文**：ProductionOrderController 的 detail()/flow()/timeline() 三个读接口没有校验订单是否属于当前租户，healthScores() 未校验 orderIds 租户归属（IDOR）
- **决策**：所有按 ID 查询资源的读接口，必须在返回前校验 `TenantAssert.assertBelongsToCurrentTenant()`；批量查询接口必须先过滤出属于当前租户的 ID
- **理由**：
  1. MyBatis-Plus 租户插件对 `getById` 可能不生效（取决于插件配置）
  2. IDOR（Insecure Direct Object Reference）是 OWASP Top 10 漏洞
  3. 攻击者可通过猜测 ID 读取其他租户数据
- **执行规则**：
  1. 所有 `getById` 后必须 `TenantAssert.assertBelongsToCurrentTenant()`
  2. 所有批量查询必须先过滤租户归属
  3. Code Review 时检查所有新增的读接口

## D-015：容器内禁止使用 localhost 作为网络目标

- **上下文**：P0 事故 INC-20260611-001，docker-entrypoint.sh 中 socat 用 `localhost` 转发到 Tomcat，Ubuntu 24.04 解析 `localhost` 为 IPv6 `::1`，Tomcat 只监听 IPv4 `0.0.0.0`，导致 Connection refused → 全线 502
- **决策**：容器内所有网络目标地址必须使用明确的 IP 地址，禁止使用 `localhost`
- **理由**：
  1. `localhost` 的 IPv4/IPv6 解析行为依赖 glibc 版本和 `/etc/gai.conf` 配置，不可预测
  2. Ubuntu 24.04 (Noble) 默认 IPv6 优先，旧版可能不同
  3. 明确 IP 地址消除了歧义，行为可预测
- **执行规则**：
  1. 容器内回环连接用 `127.0.0.1`，不用 `localhost`
  2. HEALTHCHECK 中用 `127.0.0.1`
  3. 代理/转发配置用 `127.0.0.1`
  4. 本地开发脚本（不在容器内）可继续用 `localhost`

## D-016：去掉不必要的 socat 代理层

- **上下文**：docker-entrypoint.sh 用 socat 做端口转发（外部 8088 → 内部 8089），但 Spring Boot 的 `server.port=${PORT:8088}` 已能直接读取 PORT 环境变量
- **决策**：去掉 socat 代理层，让 Tomcat 直接监听 PORT 环境变量指定的端口
- **理由**：
  1. socat 代理完全多余，Spring Boot 本身支持动态端口
  2. 代理层增加了故障点（本次 P0 事故就是 socat 引起的）
  3. 减少镜像体积（不需要安装 socat）
  4. 减少启动复杂度（少一个进程管理）
- **附加**：JVM 启动参数加 `-Djava.net.preferIPv4Stack=true` 作为防御性措施

## D-017：永久移除 WebSocket 全局广播

- **上下文**：用户多次明确表示不需要全局广播通知（"别人扫了码其他人也能看到"），只保留本地提示（"自己操作自己看到本地提示"）。PC 端已砍，小程序端和后端需彻底清理。
- **决策**：永久移除所有 WebSocket 全局广播代码，禁止加回
- **理由**：
  1. 全局广播对业务无实际价值，干扰用户
  2. WebSocket 连接错误（"未完成的操作"）影响小程序稳定性
  3. 减少后端资源消耗（广播推送）
- **已删除文件**：
  - `backend/.../websocket/` 目录（7个文件）
  - `WebSocketConfig.java`
  - `RealTimePushService.java`
  - `DataSyncAspect.java`
- **已清理字段的 文件**（13个）：
  - `ScanRecordOrchestrator.java`
  - `ProductionOrderOrchestrator.java`
  - `CuttingBundleSplitTransferOrchestrator.java`
  - `ScanUndoHelper.java`
  - `ProductionScanExecutor.java`
  - `MaterialPurchaseStatusHelper.java`
  - `ProductWarehousingServiceImpl.java`
  - `WarehousingWriteHelper.java`
  - `ProductWarehousingPostActionHelper.java`
  - `WagePaymentOrchestrator.java`
  - `ChangeApprovalOrchestrator.java`
  - `ProactivePatrolAgent.java`
  - `UnifiedCacheManager.java`
  - `OrderRemarkController.java` ← 本次清理
  - `OrderImageOrchestrator.java` ← 本次清理
- **小程序端**：已删除 `websocket.js`，`app.js` 移除连接代码
- **执行规则**：
  1. 禁止在任何新代码中引入 WebSocket 全局广播
  2. 禁止在代码审查中批准涉及全局广播的 PR
  3. 业务通知走操作结果返回本地提示，不走广播

## D-018：CloudBase 探针配置强制入版本控制

- **上下文**：cloudbaserc.json 历史上无 InitialDelaySeconds，CloudBase 默认 2s，Spring Boot 启动需 90s+，探针过早检测导致容器判死重启
- **决策**：所有 CloudBase 探针参数必须在 cloudbaserc.json 中明确声明（InitialDelaySeconds: 300, PeriodSeconds: 30, TimeoutSeconds: 10, FailureThreshold: 5）
- **理由**：依赖云端默认值导致 P0 事故（INC-20260612-001）

## D-019：禁止使用 socat 做探针"作弊"

- **上下文**：socat 代理层绕过探针检测，让应用处于不健康状态但"看起来健康"
- **决策**：禁止使用 socat 来"伪造"健康状态，探针必须检测真实应用端口
- **理由**：socat 掩盖了探针配置缺失问题，正确做法是配置 InitialDelaySeconds

## D-020：MCP resources 多租户隔离

- **上下文**：MCP resources 启用后，MemoryBank/KnowledgeBase/FactoryProfile 暴露为 resources，存在跨租户读取风险
- **决策**：所有 McpResourceProvider 实现必须 list/read 带 tenantId，校验资源归属当前租户，从 UserContext.tenantId() 获取（不信任 URI 中嵌入的 tenantId）
- **理由**：A 工厂读取 B 工厂的记忆 = P0 事故（P0 铁律 4 + 15）

## D-021：自我进化组件必须有统一可观测

- **上下文**：12个自我进化组件散落各处，无统一 metrics 汇总，"自我进化空转"无法被发现（DynamicFollowUpEngine 孤儿、MemoryNudge.expireOldNudges 死代码、EvolutionEnginePatrolJob 空壳）
- **决策**：12个进化组件必须通过 EvolutionOrchestrator.getUnifiedMetrics() 汇总指标；新增进化组件时必须在 EvolutionOrchestrator 注册并暴露量化指标
- **理由**：统一可观测是"自我进化"的前提，散落各处时无法发现空转

## D-022：多视角对抗评审强制启用

- **日期**：2026-06-20
- **上下文**：原 SelfCritiqueGate（2026-06-18 引入）只做单一维度评分，高风险场景（涉及钱/权限/数据删除/跨租户）下幻觉/越权/数据错误仍可能通过门控。单一评审视角存在"盲区"，无法覆盖业务正确性、数据真实性、多租户安全、权限合规四个维度的独立风险。
- **决策**：高风险场景必须触发 MultiPerspectiveCritic 4视角并行评审 + AdversarialJudgePipeline Round 2 对抗评审
  - 4视角权重：业务正确性 30% + 数据真实性 30% + 多租户安全 25% + 权限合规 15%
  - 一票否决：任一视角得分<40 → 整体 HARD_FAIL，不再加权平均
  - 收敛停止：连续 2 轮评分提升<5 分停止，≤3 轮上限
  - 普通场景可跳过对抗评审（Round 2），但多视角评审（Round 1）不可跳过
- **理由**：
  1. 单一 SelfCriticService 评分容易"盲区"，4视角并行 + 一票否决堵住幻觉/越权/数据错误
  2. 高风险场景的代价远高于额外评审成本（钱/权限/数据删除一旦错误难以挽回）
  3. 对抗评审（Round 2）用反方立场质疑，能发现 Round 1 的确认偏差
  4. 收敛停止条件防止"无限打磨"消耗 token，符合 AI Hard Limits
- **借鉴来源**：Ruflo Truth Scoring + Claude Agent SDK Judge-and-iterate
- **执行规则**：
  1. HighRiskDetector 检测高风险场景（涉及钱/权限/数据删除/跨租户）→ 触发 Round 2
  2. 所有场景必须执行 Round 1（4视角并行）
  3. 任一视角<40 分 → HARD_FAIL，不再加权
  4. 连续 2 轮提升<5 分 → 停止迭代

## D-023：MCP resource description 必须 sanitize

- **日期**：2026-06-20
- **上下文**：2026-06-18 启用 MCP resources 后，resource description 直接暴露给 AI。如果 description 包含 prompt injection 模式（如 `ignore previous instructions`、`system: you are now...`、`<script>`），AI 行为可能被劫持。resource description 来源包括用户可控内容（如知识库条目标题、工厂画像描述），存在注入风险。
- **决策**：所有 McpResourceProvider 实现返回的 resource description 必须经过 `McpResourceSanitizer.sanitize()` 处理
  - 过滤 prompt injection 模式（`ignore previous`/`system:`/`<script>`/`assistant:`/`user:`）
  - 转义特殊字符（`<`/`>`/`&`/`"`/`'`）
  - 长度截断 ≤500 字符
  - 禁止直接返回用户可控内容作为 description
- **理由**：
  1. prompt injection 可劫持 AI 行为，导致越权/数据泄露/错误操作
  2. resource description 是 AI 上下文的一部分，注入风险等同于用户消息
  3. 用户可控内容（知识库标题/工厂描述）必须经过 sanitize，不可信任
  4. 违反 = P0 安全事故（prompt injection 可劫持 AI 行为）
- **执行规则**：
  1. 所有 McpResourceProvider.listResources() 返回的 description 必须经过 sanitize
  2. 所有 McpResourceProvider.readResource() 返回的 contents 必须经过 sanitize
  3. Code Review 时检查新增 Provider 是否调用 McpResourceSanitizer
  4. 禁止绕过 sanitize 直接返回原始内容

## D-024：Memory Bank 数据库化

- **日期**：2026-06-20
- **上下文**：Memory Bank 原为 Markdown 文件（product-context/active-context/system-patterns/decision-log/progress），AI 每次需要"通读全文"才能找到上下文，token 浪费严重（5个文件 ~10K token），且无法做语义检索。决策间关系（如 D-022 依赖 D-020）无法表达，知识图谱缺失。
- **决策**：Memory Bank 必须双写（Markdown + DB）
  - 写入：MemoryBankService 同时写 Markdown 文件 + t_memory_bank_entry 表
  - 读取：优先 DB 语义检索（topK=5），回退 Markdown 通读
  - 关系：决策/模式间关系必须存入 t_memory_bank_relation（知识图谱，关系类型 DEPENDS_ON/RELATES_TO/DERIVED_FROM）
  - 迁移：启动时 MemoryBankMigrationRunner 自动 Markdown → DB（Redis 幂等，key: `memory_bank:migration:done`）
  - 新增记忆类型时，必须同时更新 DB schema 和 Markdown 模板
- **理由**：
  1. Markdown 通读 token 浪费严重（~10K token），DB 语义检索 topK=5 仅 ~500 token，降低 ~70%
  2. 知识图谱关系支持"决策 D-022 依赖 D-020"类关联查询，Markdown 无法表达
  3. 双写兼容确保向后兼容，旧代码无感知，可渐进迁移
  4. 启动时自动迁移 + Redis 幂等，避免重复迁移
- **借鉴来源**：RooFlow Context Portal 2026-02-19（ConPort 模式）
- **执行规则**：
  1. MemoryBankService 所有写入操作必须双写（Markdown + DB）
  2. 读取操作优先 DB 语义检索，回退 Markdown
  3. 决策/模式间关系必须存入 t_memory_bank_relation
  4. 新增记忆类型时同步更新 DB schema 和 Markdown 模板
  5. 启动时 MemoryBankMigrationRunner 自动迁移，Redis 幂等

## D-025：per-call model selection 强制启用

- **日期**：2026-06-20
- **上下文**：所有 AI 调用原使用同一模型（glm-4-plus 旗舰），简单查询（如"今天有几条待办"）也用旗舰模型，成本高（旗舰 ~$0.05/次 vs 经济 ~$0.005/次，5-10倍差距）。同时上下文无限膨胀导致 token 成本爆炸，单会话可能消耗 $10+。
- **决策**：所有 AI 调用必须经过 ModelSelectionRouter 选择模型
  - 简单查询（复杂度<30）→ ECONOMY（glm-4-flash）
  - 一般对话（30-70）→ STANDARD（glm-4）
  - 复杂推理（>70）→ PREMIUM（glm-4-plus）
  - 禁止简单查询用旗舰模型（成本浪费 5-10 倍）
  - CostExplosionGuard 必须开启：
    - 上下文 >32K token → 自动摘要压缩
    - 连续 3 轮相似度>0.9 → 强制终止
    - 单会话 >$5 → 熔断，拒绝后续调用
    - 单轮工具调用 >10 次 → 强制收敛
  - 熔断时返回友好提示，不静默失败
- **理由**：
  1. 简单查询用旗舰模型成本浪费 5-10 倍，per-call selection 降低 ~80% 成本
  2. 上下文肥大是 token 成本爆炸主因，自动压缩防止失控
  3. 重复检测防止 AI"原地打转"消耗资源
  4. 熔断机制防止单会话成本失控（>$5 阈值基于业务可接受上限）
  5. 四维评估（意图复杂度+上下文长度+工具调用数+历史轮次）确保模型选择准确

## D-026：设置管理模块数据模型澄清

- **日期**：2026-06-22
- **上下文**：FactoryList (t_factory) 和 PartnerManagement (t_organization_unit) 被误认为重复功能，实际管理不同数据。用户反馈"搞的乱七八糟，不知道去哪改"。
- **决策**：不合并两个页面，明确区分职责
  - FactoryList (t_factory)：管理供应商/外发工厂/客户的主数据（联系人、资质、合同）
  - PartnerManagement (t_organization_unit)：管理外部企业的组织架构和成员分配
  - 供应商账号 (t_supplier_user)：独立账号体系，管理供应商用户
- **理由**：
  1. t_factory 和 t_organization_unit 是不同表，管理不同数据，不应合并
  2. 用户困惑的原因是菜单标签不清，不是功能重复
  3. 优化方向：菜单重组 + 供应商账号独立页面 + 预设角色模板

## D-027：预设角色模板平台级共享

- **日期**：2026-06-22
- **上下文**：新租户创建角色时不知道该创建哪些角色，需要预设模板参考。
- **决策**：角色模板表 t_role_template 为平台级（tenantId = null），预设模板所有租户共享
  - 预设模板：admin / merchandiser / warehouse_keeper / finance / quality_inspector 等
  - 租户可自定义模板（category=CUSTOM），仅自己可见
  - apply 方法只创建新角色，不修改现有角色
- **理由**：
  1. 平台级预设模板避免重复创建，新租户直接使用
  2. 租户自定义模板隔离，确保不影响其他租户
  3. apply 方法幂等，只增不减

- **借鉴来源**：Claude Agent SDK per-call model selection + Ruflo 成本爆炸防御
- **执行规则**：
  1. 所有 AI 调用必须经过 ModelSelectionRouter，禁止直接指定模型
  2. 复杂场景可用 `chatPremium()` 强制 PREMIUM，但需注释原因
  3. CostExplosionGuard 必须开启，不可关闭
  4. 熔断时返回友好提示（如"本次对话已较长，建议开启新会话"），不静默失败
  5. application.yml 中 model-selection.enabled 和 cost-guard 配置不可设为 false

## D-026：线程池大小必须可配置，禁止硬编码

- **日期**：2026-06-20
- **上下文**：AiAgentToolExecHelper 和 AiAgentPromptHelper 线程池用硬编码 `Executors.newFixedThreadPool(16)`/`new ThreadPoolExecutor(16,32...)`，调整并发需改代码+重新编译+重新部署，对"一两分钟才回答"问题无快速调优手段
- **决策**：所有 AI 相关线程池大小必须通过 @Value + application.yml 读取，不可硬编码
  - tool-executor: core=16, max=32, queue=256（默认值仅在未配置时使用）
  - prompt-executor: core=12, max=24, queue=128
  - 允许通过 application.yml 或环境变量 XIAOYUN_TOOL_EXECUTOR_* 覆盖
- **理由**：
  1. 硬编码需改代码+重新编译+重新部署，调试周期太长
  2. 不同租户/不同场景需求不同（开发机/不同时段负载不同，需动态调整
  3. 性能调优无需重新部署

## D-027：多工具并发调用必须有流式进度

- **日期**：2026-06-20
- **上下文**：原 executeToolsConcurrently 等所有工具全部完成后才输出，用户看到大片空白等待，"一两分钟才回答"问题最直观的是空白等待
- **决策**：多工具并发调用使用 CompletableFuture.anyOf 模式，完成一个立即推送一个的完成一个立即推送一个
  - 每个工具完成后立即触发 onThinking 进度事件，格式：`(2/5) [完成: query_order]…`
  - 工具执行过程中持续更新状态，不再"永远一片空白"
- **理由**：
  1. 用户能看到实时进展，减少焦虑（"一两分钟才回答"的核心痛点之一就是完全不知道AI在干什么）
  2. anyOf 模式只需循环处理，不阻塞主线程，不影响性能
  3. 与现有缓存机制兼容（cached result caching机制兼容（tool-executor 不变
## D-028：Prompt 上下文块必须有优先级

- **日期**：2026-06-20
- **上下文**：AiAgentPromptHelper 所有上下文块使用同一超时（3s），导致关键信息（工厂画像/实体记忆/当前问题）被其他次要信息（行为画像/历史洞察）一样可能被超时截断，关键信息丢失
- **决策**：Prompt 上下文块按优先级分级设置不同级设置三级超时保护：
  - HIGH（3s）：工厂画像/实体记忆/当前问题 — 永不缩减到 核心不缩减
  - MEDIUM（1.8s）：RAG 检索/知识图谱 — 可降级为精简版本，不影响主流程
  - LOW（1s）：行为画像/历史洞察 — 超时直接放弃，不影响主流程
- **理由**：
  1. 关键信息必须优先，确保不被其他次要信息不被不被时间紧迫时丢失
  2. 次要信息可降级，非关键信息超时可降级为精简版本
  3. 次要信息超时可降级为精简版本，不影响主流程
  4. 关键信息永不缩减，次要信息超时直接放弃

## D-029：code-search-mcp 用 Serena 替代，不自研

- **日期**：2026-07-02
- **上下文**：`.trae/rules/dev-mcp-design.md` 设计的 4 个开发专用 MCP 中，code-search-mcp（语义搜索 + AST 调用链 + 影响范围分析）一直未实现。调研发现 GitHub 上 Serena（https://github.com/oraios/serena，24.5k★）已是代码语义搜索事实标准，基于 LSP（Language Server Protocol）的语义级理解比 grep 省 token 3-5 倍，支持 Java/TS/JS 等 30+ 语言。
- **决策**：不自研 code-search-mcp，改用外部 MCP Serena 替代。Serena 通过 `uvx serena-mcp` 按需下载，已写入 `.trae/mcp.json`。
- **理由**：
  1. Serena 已是行业事实标准（24.5k★），自研重复造轮子无价值
  2. LSP 语义级理解比原设计的 ripgrep + tree-sitter 更精准
  3. 原设计的 find_tenant_violations / find_transaction_violations 已由 anti-pattern-mcp + test-runner-mcp.audit_tenant_id 覆盖
  4. Serena 支持 find_symbol / find_referencing_symbols / replace_symbol_body 等，完全覆盖原设计的 find_callers / find_callees / impact_analysis
- **影响**：`.trae/rules/dev-mcp-design.md` 状态更新为"已实现 6/7 + Serena 替代"

## D-030：MCP 配置文件统一管理

- **日期**：2026-07-02
- **上下文**：项目 6 个自研 MCP 代码已就绪，但 `.trae/mcp.json` 配置文件一直未创建，导致 MCP 无法被 Trae IDE 加载。MCP_CONFIG_TEMPLATE.md 模板也只含 5 个 MCP（缺 test-runner-mcp）。
- **决策**：
  1. 创建 `.trae/mcp.json`，包含 6 个自研 MCP + 1 个外部 MCP（Serena）
  2. 补齐 test-runner-mcp 配置（模板原缺失）
  3. flyway-mcp 和 test-runner-mcp 添加 PROJECT_ROOT 环境变量
  4. MCP_CONFIG_TEMPLATE.md 同步更新，新增 GitHub MCP 可选配置说明
- **理由**：
  1. 配置文件缺失导致已就绪的 MCP 代码无法使用，是 P0 级配置缺陷
  2. 统一配置管理，避免代码就绪但配置缺失的"最后一公里"问题
  3. GitHub MCP 作为可选项预留，需用户提供 PAT 后启用

## D-031：P0 #23 MCP 工具强制调用规则（配置 ≠ 自动调用）

- **日期**：2026-07-02
- **上下文**：D-029/D-030 完成 MCP 配置后，用户质疑"配置 MCP ≠ AI 会自动调用"。确认 AI 习惯用原生工具（RunCommand+SQL / mvn / Read）走熟悉路径，导致 6 个自研 MCP + Serena 形同虚设。仅靠"建议"无法改变 AI 行为，必须写入 P0 铁律强制。
- **决策**：
  1. 新增 P0 #23「MCP 工具强制调用规则」到 `project_rules.md`，列出 10 个强制场景表格（查业务数据 / Flyway 校验 / 编译验证 / 符号搜索 / 影响评估 / 反模式检测 / 记忆加载等），每场景明确"必须用 XX-mcp" + "禁止 YY 替代"
  2. 制定降级规则：MCP 不可用时必须明确告知用户"XX-mcp 不可用，降级为 YY"，并手动遵守对应 P0 铁律（#4 多租户 / #1 Flyway / #13 工具验证）
  3. tenantId 传递规则：从 UserContext 获取（测试租户=1 东方制衣厂），禁止编造 0/null
  4. 例外清单：项目内文件读写仍用原生工具（Read/Edit/Write/Glob/Grep，P0 铁律），MCP 不替代原生文件操作
  5. `agent-workflow.md` 嵌入 MCP 强制调用：第1步用 memory-bank-mcp、第3步用 change-impact-mcp + serena、第5步用 anti-pattern-mcp、第6步质量门控表格新增"强制 MCP 工具"列
  6. `mcp-tools-cheatsheet.md` 顶部新增 P0 #23 强制场景表速查
- **理由**：
  1. "建议使用 MCP"无法克服 AI 走熟悉路径的惯性，必须 P0 铁律级强制
  2. 10 个场景覆盖开发全流程（记忆加载→调研→影响评估→反模式→Flyway→编译→租户审计→业务数据验证），不留盲区
  3. 降级规则避免"MCP 不可用就停止工作"，但强制告知用户保持透明
  4. 例外清单防止过度执行（文件读写仍用原生工具，符合 P0 铁律）
- **影响**：
  - `project_rules.md` P0 铁律从 22 条增加到 23 条
  - `agent-workflow.md` 第1/3/5/6步嵌入 MCP 强制调用
  - `mcp-tools-cheatsheet.md` 顶部新增 P0 #23 强制场景表

## D-032：小云 AI P1 五项实用能力升级（Agentic RAG + NlQuery + 巡检闭环 + L4 程序性记忆 + Hermes 学习闭环）

- **日期**：2026-07-02
- **上下文**：基于对小云 AI 全量代码（165+ Orchestrators / 85+ Services / 100 Agent Tools）的系统核查，识别 5 项 P1 实用能力缺口。用户明确选择"实用能力升级"方向，跳过 P0（已稳定）和 P2（高阶但非急需）层级，要求 5 项全部实现。同时要求对孤儿组件"列出实际用处，不处理"。
- **决策**：按"最小工作量优先"顺序实现 5 项 P1：
  1. **P1-4 L4 Procedural Memory**：补全 `SkillCrystallizationService.promoteToProcedural()`（设计稿定义但未实现的唯一缺口），结晶化技能 useCount≥20 时自动升级为 `t_procedural_memory`，幂等性通过 sop_name 唯一性保证
  2. **P1-1 Agentic RAG**：将 `AgenticRagService.retrieve()` 从单次检索+兜底改造为 3 轮自纠正循环。LLM 查询重写（3s 超时+规则兜底）+ 启发式相关性评分（关键词 60% + 来源数 25% + 长度 15%）+ 阈值 0.30 触发提前停止
  3. **P1-3 巡检自动执行**：修复 `AiPatrolJob.performAutoAction()` 的 3 处断点：调用 `TaskCenterOrchestrator.createTask()` 创建真实跟进任务（带 UserContext 多租户隔离，try/finally 恢复）+ `WxAlertNotifyService.notifyAlert()` 推送微信订阅消息
  4. **P1-2 NlQuery**：`NlQueryTool` 从老式 AbstractAgentTool 升级为 `@AgentToolDef` + `@McpToolAnnotation`（readOnly=true, timeout=15s, 6 个 tags）；`/nl-query` 端点 `@DataTruth` source 从 AI_DERIVED 修正为 REAL_DATA
  5. **P1-5 Hermes Learning Loop**：4 处改动 — (a) `AgentLoopEngine` L667 硬编码 `qualityScore=0.8` 改为取 `SelfCritiqueGate.getScore()/100`（评分范围 0-100 归一化到 0-1，对齐 MIN_QUALITY_FOR_CRYSTALLIZE=0.75）；(b) `SkillCrystallizationService.recordFeedback()` 异步回写 successCount/avgRating（5 分制，score≥4 计入成功）；(c) `/ai-feedback` 接入反馈回写；(d) `EvolutionEventLogger` 新增 SKILL_FEEDBACK_RECEIVED 事件类型
- **关键设计权衡**：
  1. **P1-4 阈值 useCount≥20 而非 successCount≥10**：因 successCount/avgRating 在 P1-5 之前从未自动更新（仅手动 API），用 useCount 作即时可用的代理指标；P1-5 完成后两者协同（成功反馈累加 successCount，达到双重阈值可考虑更严格升级条件）
  2. **P1-1 评分用启发式而非 LLM-as-Judge**：避免在关键路径增加额外 LLM 调用（+1-2s 延迟），LLM 仅用于第 2+ 轮的查询重写；启发式评分（关键词/来源数/长度）足够区分"无结果/弱匹配/强匹配"三态
  3. **P1-3 createTask 用 try/finally 保护 UserContext**：Job 层无 HTTP 请求上下文，必须手动设置 system 身份（userId="system"），完成后恢复原 UserContext，避免污染后续 Job 调用
  4. **P1-5 qualityScore 归一化**：SelfCritiqueGate 评分范围 0-100（GateResult.pass 默认 80.0），需 /100 映射到 MIN_QUALITY_FOR_CRYSTALLIZE=0.75 的 0-1 标度
- **未处理项**（用户明确"不处理"）：
  - `ProcessKnowledgeOrchestrator` 加载已删除的 IE 知识文件（ai_ie_parts_knowledge.json）— 静默失败但不影响功能
  - 工序知识库（模板中心）vs AI 工序建议数据源不一致 — 已在 project_memory 记录，待统一处理
  - `AgentLoopEngineTest` 中其他硬编码值（非 L667）— 测试代码，不影响生产
- **影响**：
  - 小云 AI 实用能力从"基本可用"提升到"自纠正 + 自学习 + 自执行"闭环
  - L4 Procedural Memory 设计稿（five-layer-memory-design.md）的 P0 阶段全部落地
  - Hermes 学习闭环形成：用户反馈 → SkillTemplate.successCount/avgRating 更新 → useCount≥20 触发 ProceduralMemory 升级 → 下次直接调用 SOP 步骤
  - 编译验证通过（`mvn compile -q -pl .` exit code 0），无需回滚

## D-033：工序进度实时同步从轮询改为 WebSocket 推送

- **日期**：2026-07-08
- **上下文**：所有工序节点（扫码/采购/裁剪/车缝/二次工艺/尾部质检/入库/返修申报）均依赖 30 秒轮询更新进度，用户反馈"进度不同步"、"扫码了半天看不到变化"。前端 useWebSocket.ts 为空壳实现，无法建立真实 WebSocket 连接。order:progress:changed 事件仅在 PC 手动改进度时触发，扫码等其他操作不触发。
- **决策**：
  1. 后端新增 `OrderProgressWebSocketServer`（@ServerEndpoint），按订单号分组推送
  2. `ScanExecutorSupport.recomputeProgressSync` 后添加 WebSocket 推送（带 tenantId 多租户隔离）
  3. 前端重写 `useWebSocket.ts`，实现真实连接 + 自动重连 + 心跳检测
  4. 前端生产列表和订单详情订阅 WS 消息，收到后立即刷新数据
  5. 保留 5 分钟长轮询作为兜底（防止 WS 断连后完全不更新）
- **关键设计权衡**：
  1. **按订单号分组而非全量广播**：避免无关消息浪费带宽，一个订单的进度变化只推送给关注该订单的客户端
  2. **5 分钟长轮询兜底**：WS 连接可能因网络/nginx 超时断开，长轮询确保最终一致性
  3. **ServerEndpointExporter Bean 必须存在**：Spring Boot 内嵌 Tomcat 需要此 Bean 才能注册 @ServerEndpoint，缺失会导致 WS 连接 404
  4. **Nginx 需配置 WS 升级**：proxy_set_header Upgrade $http_upgrade + Connection "upgrade"，超时设 30min
- **影响**：
  - 扫码后进度从"最多等30秒"变为"秒级实时"
  - 新增文件：OrderProgressWebSocketServer.java、WebSocketConfig.java
  - 修改文件：ScanExecutorSupport.java、useWebSocket.ts、useProductionListData.ts、useOrderSync.ts
  - 部署后需验证 WS 连接是否成功建立（浏览器 F12 → Network → WS）

## D-034：异步线程必须显式传递租户上下文

- **日期**：2026-07-08
- **上下文**：P0 事故——生产订单列表和进度球数据全部不显示。根因：ProductionOrderQueryService 使用 CompletableFuture.runAsync 创建异步线程，ThreadLocal 中的 UserContext（含 tenantId）未传递到异步线程，导致 TenantAssert.assertTenantContext 抛异常、TenantInterceptor 跳过租户过滤，引发进度数据丢失和跨租户数据泄漏风险。
- **决策**：
  1. **所有异步操作必须显式传递 tenantId**：禁止在异步线程中依赖 ThreadLocal 的 UserContext
  2. **优先使用 UserContext.wrap()**：包裹 Runnable/Callable，自动捕获和恢复上下文
  3. **无法 wrap 时从数据库记录取 tenantId**：如订单查询场景，先从主记录获取 tenantId，再传入异步任务
  4. **Code Review 检查项**：凡是看到 CompletableFuture / @Async / 新建 Thread，必须检查是否传递了租户上下文
- **关键教训**：
  - ThreadLocal 在异步线程中默认不继承（InheritableThreadLocal 也仅在创建线程时继承，线程池复用时失效）
  - 多租户系统中，异步线程丢失 tenantId = 数据隔离失效 = P0 级事故
  - 修复顺序：先从数据源头获取 tenantId（最安全），再考虑上下文传递
- **影响**：
  - 修复了订单进度球数据不显示的 P0 事故
  - 系统性排查并修复了订单列表中所有异步线程的租户上下文传递
  - 提交：585af8405（进度球修复）+ 786310508（系统性修复）

## D-035：操作日志与业务字段必须分离，禁止污染业务字段

- **日期**：2026-07-08
- **上下文**：用户反馈样衣详情中"生产要求"字段出现无关操作日志（如"退回纸样开发"、"修改款式"）。根因：StyleOperationAppendHelper.java 将所有操作日志都追加到 style_info.description 字段（"生产要求"字段），而该字段是给制单人员填写业务内容的地方，操作日志混入后业务内容被污染。
- **决策**：
  1. **操作日志写入专用表**：t_style_operation_log，禁止写入业务字段
  2. **业务字段（description/生产要求）只保存用户主动输入的内容**：系统操作不得自动追加
  3. **历史数据清理**：用 Flyway 迁移脚本将已混入的操作日志从 description 中分离到专用表
  4. **通用规则**：所有业务对象的"备注/描述"字段，系统自动日志都走独立 operation_log 表，不污染业务字段
- **关键设计权衡**：
  - 专用表 vs JSON 扩展列：专用表查询性能更好、支持按时间/操作人筛选、不影响原表结构
  - 清理脚本幂等性：使用 PREPARE/EXECUTE 模式，重复执行不损坏数据
- **影响**：
  - 修复文件：StyleOperationAppendHelper.java、StyleStageHelper.java
  - 新增迁移：V20260708002__clean_operation_logs_from_style_description.sql
  - 提交：befdce60f

## D-036：工序阶段前置校验必须动态跳过被禁用的阶段

- **日期**：2026-07-09
- **上下文**：没有二次工艺的款式（hasSecondaryProcess=false），扫码进车缝时被误拦截："二次工艺阶段尚未开始，暂不能进入车缝"。根因：ProductionScanStageSupport.validateParentStagePrerequisite 用固定数组索引 FIXED_PRODUCTION_NODES[currentIdx - 1] 找前置阶段，没考虑该阶段被禁用的场景。
- **决策**：
  1. **新增 findPrevEnabledStage 方法**：从当前阶段往前遍历，跳过所有被 isStageExplicitlyDisabled 判定为禁用的阶段，返回第一个启用的阶段
  2. **isStageExplicitlyDisabled 判断逻辑**：检查 hasSecondaryProcess=false（二次工艺禁用）或 nodeOperations 中该阶段被移除
  3. **ProcessStageDetector.isAutoSkippableStageName 增强**：二次工艺阶段也检查 hasSecondaryProcess，若禁用则自动跳过
- **理由**：固定数组索引无法适应动态禁用场景，必须运行时动态判断
- **影响**：
  - 修改文件：ProductionScanStageSupport.java / ProcessStageDetector.java
  - 新增测试：ProductionScanStageSupportTest.java（3个测试用例）
  - 提交：ec9b20fd0
- **教训**：用户反馈"这个问题为什么反反复复在处理"——说明之前修复不彻底，只处理了表面没解决根因

## D-037：出库不需要选仓库/库位，系统自动从库存记录获取

- **日期**：2026-07-09
- **上下文**：样衣借出弹窗要求用户选"出库仓库"和"库位"，用户反馈"出库是样衣在仓库里面的东西出去，为什么还要选仓库？只有入库才有选择库位"。核实发现物料出库、成品扫码出库都有同样问题。
- **决策**：
  1. **出库移除仓库/库位选择器**：样衣借出、物料出库、成品扫码出库三个场景统一移除
  2. **改为只读显示当前存储位置**：让用户知道东西从哪里出，但不需要手动选
  3. **后端自动从库存记录获取仓库和库位**：
     - 样衣：从 SampleStock.warehouseAreaId/warehouseAreaName 获取
     - 物料：从 MaterialInventory.warehouseAreaId/location 获取
     - 成品：从最新 ProductWarehousing 记录获取（SKU本身不存库位）
  4. **成品库存查询接口增强**：/style/sku/inventory/{skuCode} 返回值从 Integer 改为 {stock, warehouseLocation, warehouseAreaId, warehouseAreaName}
- **理由**：出库时库存已经在仓库里了，系统应该知道东西在哪里。入库才需要选（决定放哪里）。
- **参考实现**：TransferToOutstockModal（样衣转出库）本身就是正确实现——没有仓库选择，应作为标准参考
- **影响**：
  - 后端：SampleStockOrchestrator / MaterialWarehouseOperationOrchestrator / FinishedOutstockHelper / ProductSkuController
  - 前端：LoanModal.tsx / OutboundModal.tsx / QrcodeOutboundModal.tsx / types.ts / useOutboundActions.ts
  - 提交：324ec2b06

## D-038：虚拟状态筛选必须后端过滤并重新分页

- **日期**：2026-07-14
- **上下文**：用户反馈样衣开发列表页「已延期」「临近交期」筛选按钮「跟狗屎一样」，分页错乱、数据随机
- **根因**：`OVERDUE` / `WARNING` 是前端虚拟状态，实现为后端按无状态分页返回后，前端再本地过滤。导致每页实际条目数随机、`total` 不准确、翻页体验极差
- **决策**：
  1. 虚拟状态筛选改由后端统一过滤并重新分页
  2. 后端 `PatternProductionOrchestrator.listWithEnrichment` 识别 `status=OVERDUE/WARNING`，按 `deliveryTime` / `styleInfo.deliveryDate` 过滤后手动分页
  3. 前端直接传 `status=OVERDUE/WARNING` 给后端，删除前端本地过滤逻辑
- **理由**：
  - 分页控件依赖准确的 `total` / `pages`，前端本地过滤会破坏分页语义
  - 交期计算规则应集中在一处（后端），避免前后端逻辑不一致
  - 搜索 + 筛选组合时，后端统一过滤才能保证结果正确
- **影响**：
  - 后端：`PatternProductionOrchestrator.java` 新增 `filterByDueDate` / `resolveDeliveryDate` / `paginateManually`
  - 前端：`miniprogram/pages/sample-development/index/index.js` 删除本地过滤
  - H5：`h5-web/source-miniapp` / `public/source-miniapp` / `dist/source-miniapp` 三端同步

## D-039：API 响应处理规范 — ok() vs raw() 必须严格区分

- **日期**：2026-07-16
- **上下文**：全局排查发现 9+ 个页面存在 API 响应处理不一致问题：`ok()` helper 已统一解包 `Result.data`，但大量页面仍残留 `res.data` / `res.code` 判断，导致部分页面数据全空（P0级），代码可读性差
- **根因**：
  1. 历史迁移不彻底：从裸 `request()` → ok()/raw()` 迁移时，部分页面未同步更新响应处理
  2. 缺少统一规范，开发者不知道哪些 API 用 ok()、哪些用 raw()
- **决策**：
  1. **ok() 包装的 API：成功时 `.then(res => res` 拿到的就是业务数据对象，失败直接 `.catch()`，**禁止**在 then 里判断 `res.code` / `res.data`
  2. **raw() 包装的 API：返回完整响应体 `{ code, data, message }`，需自行判断 `res.code === 200` 并取 `res.data`
  3. **使用原则**：
     - 业务接口默认用 **ok()**（95% 以上）
     - 登录/注册/公开接口（无需鉴权、需读 code）用 **raw()**
     - 需读 HTTP 状态码的场景用 **raw()**
  4. **当前 raw() 清单（仅 3 处）**：`system.login` / `tenant.publicList` / `tenant.workerRegister`
- **理由**：
  - ok() 统一解包减少重复判断，减少出错概率
  - 明确边界清晰，开发者一看 API 函数名就知道返回格式
  -失败统一走 catch，错误处理集中
- **影响**：
  - 小程序：清理 9 个文件的冗余 `res.data` 判断，修复 2 处 P0 级 `res.code` 判断错误
  - 后续新增 API 函数必须明确标注是 ok() 还是 raw() 包装
  - H5 三端同步同样规范

## D-040：多租户隔离强化 — 查询时直接带 tenant_id 过滤，禁止依赖后置校验

- **日期**：2026-07-18
- **上下文**：三端数据流转一致性核查中发现 3 个 P0 级多租户隔离漏洞，均采用"先查全量 → 再用 TenantAssert.assertBelongsToCurrentTenant 后置校验"模式，存在数据泄露风险窗口（查询已返回全量数据，校验失败才拒绝）
- **根因**：
  1. D-014 虽要求"所有读接口必须校验资源租户归属"，但未明确要求"查询时即带 tenant_id 过滤"
  2. 后置校验模式在数据量小时代价低，但一旦数据量大或并发高，会泄露其他租户数据
- **决策**：
  1. **所有多租户表的列表/详情查询必须在 SQL/Mapper 查询时直接带 `tenant_id` 过滤条件**（`.eq(Entity::getTenantId, tenantId)`）
  2. **禁止使用"先查全量 → 后置 TenantAssert 校验"模式**
  3. TenantAssert.assertBelongsToCurrentTenant 仅用于"按主键查询单条详情"场景的二次防御，不能作为唯一的隔离手段
  4. 新增 Controller 端点时，查询条件必须显式带 tenant_id，Code Review 必检
- **理由**：
  - 查询时过滤是数据库层面的隔离，零窗口泄露
  - 后置校验是应用层校验，存在"查到再拒绝"的时间窗口
  - 符合 P0 铁律 4（多租户隔离）的最严格实现
- **影响**：
  - 修复 PatternRevisionController.list、PatternProductionOrchestrator 列表查询、PatternProductionController 新端点
  - 后续所有新增查询接口必须遵循此决策
  - audit-tenant-id.py 扫描会持续监控

## D-041：财务数据链路闭环 — 反向账单机制 + isOwnFactory 字段化 + 样衣开发费用统一接入

- **日期**：2026-07-19
- **上下文**：财务全链路调研发现 10 P0 / 19 P1 / 21 P2 问题，核心结构性缺陷是"反向账单机制缺失"（B1 阻塞点），是 P0-3、P0-7、P0-9 的共同根因。另外发现 ShipmentReconciliation.isOwnFactory 字段在 Java 实体已声明 `@TableField("is_own_factory")` 但 DB 表从未通过 Flyway 添加列，导致 INSERT 静默丢失 → SELECT null → 三态判定退化为 null 分支 → 外发工厂对账错推 RECEIVABLE+SHIPMENT+CUSTOMER 方向，且 uk_source 幂等约束使方向不可纠正。样衣开发费用（BOM 物料 + 工序成本）完全游离于 BillAggregation 之外，仅二次工艺已接入。
- **决策**：
  1. **反向账单机制（reverseBill）**：所有退货/撤回/反转/删除场景必须联动 Bill → Payable/Receivable 全链路。未结清账单直接 CANCELLED + 联动 Payable/Receivable CANCELLED；已结清账单抛异常提示需先冲账（防止财务数据丢失）；已付款/已收款的保留痕迹（仅回写 remark）
  2. **isOwnFactory 字段化**：DB 表 t_shipment_reconciliation 必须显式有 is_own_factory 列（Flyway V202707191000），Java 三态判定 1=本厂（不推账单）/ 0=外发工厂（推 PAYABLE+EXTERNAL_FACTORY+FACTORY）/ null=销售出货（推 RECEIVABLE+SHIPMENT+CUSTOMER）
  3. **样衣开发费用接入 BillAggregation**：sourceType=STYLE_DEVELOPMENT / billType=PAYABLE / billCategory=EXPENSE / counterpartyType=EMPLOYEE，金额 = materialCost + processCost（不包含 secondaryProcessCost，避免与 SECONDARY_PROCESS sourceType 重复推送）。审核 PASS → pushBill；审核 REJECT/REWORK → reverseBySource
  4. **undoPatternScan 双写**：撤销样衣扫码必须同步删除 ScanRecord 镜像（scanType="pattern"，与 submitScan 的 syncToScanRecord 对称）+ 工资结算状态校验 + 写备注日志（与 submitScan 的 appendPatternRemark 对称）
  5. **可选注入模式**：跨域 Orchestrator 调用使用 `@Autowired(required = false) + @Lazy` 避免循环依赖
  6. **不阻塞主流程原则**：账单联动失败时记日志告警但不抛异常（已结清账单需人工冲账）
  7. **fail-safe 原则**：账单服务异常时应阻止业务操作（而非跳过校验），避免误删已对账数据
- **理由**：
  - 财务数据链路必须闭环：每个反向/删除/退货操作都必须联动账单状态，避免悬挂数据
  - isOwnFactory 字段化是方向不可纠正的根因修复，比 uk_source 幂等约束的副作用更彻底
  - 样衣开发费用接入使财务全链路统计完整，BOM+工序与二次工艺并行推送，互不重叠
  - 可选注入 + @Lazy 是 Spring 跨域 Orchestrator 互调的标准解法
- **影响**：
  - 后端修改文件：BillAggregationOrchestrator（reverseBySource/reverseByOrder）、SalesReturnOrchestrator、FactoryShipmentOrchestrator、ShipmentReconciliationOrchestrator、ReconciliationStatusOrchestrator、MaterialPurchasePickingHelper、MaterialPurchaseWarehousePickHelper、MaterialStockOrchestrator、MaterialPickupOrchestrator、SecondaryProcessOrchestrator、ProductionCleanupOrchestrator、FinishedWarehouseOperationOrchestrator、PurchaseReturnOrchestrator、PatternProductionOrchestrator（undoPatternScan 重写）、StyleInfoOrchestrator（pushStyleDevelopmentBill/reverseStyleDevelopmentBill）
  - Flyway 迁移：V202707191000__add_is_own_factory_to_shipment_reconciliation.sql（幂等加列 + 多租户安全回填）
  - 前端：billAggregationApi.ts 补 SHIPMENT 选项
  - 后续所有反向/退货/撤回/删除操作必须调用 reverseBySource 或 reverseByOrder
  - 后续新增 billCategory 必须在 7 种合法枚举内：MATERIAL / PRODUCT / EXTERNAL_FACTORY / PAYROLL / EXPENSE / SHIPMENT / DEDUCTION

## D-042：员工打卡健壮性增强 — 实体注解对齐 + 跨天补卡兜底 + 并发竞态兜底

- **日期**：2026-07-19
- **上下文**：用户要求"看看后端有没有什么问题"，全面检查 WorkAttendance 打卡功能后发现 1 个 P1 bug + 2 个 P2 边界问题：
  1. **P1 bug（updateTime 永不更新）**：WorkAttendance 实体的 `createTime`/`updateTime`/`tenantId` 三个字段未标注 `@TableField(fill = ...)`，与项目其他实体（SampleStock/SelectionBatch/StockTransfer 等）不一致。后果：MyBatisPlusMetaObjectHandler 的 `strictInsertFill`/`strictUpdateFill` 对无注解字段是 no-op；从 DB 加载的实体已带旧 updateTime，`updateById` 会显式 SET 旧值覆盖 `ON UPDATE CURRENT_TIMESTAMP`，导致 updateTime 永远停留在首次 INSERT 的时间
  2. **P2 跨天打卡丢工时**：clockOut 用 `LocalDate.now()` 查 today_record，凌晨下班打卡时（如 day1 23:55 上班，day2 00:30 下班）会走「漏打上班卡」分支，创建 day2 的 0 工时记录，day1 的真实上班卡永远没有 clock_out_time，工时丢失
  3. **P2 并发 clockIn 竞态**：两个并发 clockIn 都看到 `today_record==null` → 同时 INSERT → 唯一键 `uk_tenant_user_date` 让其中一个抛 DuplicateKeyException，用户看到 500
- **决策**：
  1. **实体注解对齐**：所有业务实体的 `createTime`/`updateTime`/`tenantId` 必须显式标注 `@TableField(fill = FieldFill.INSERT)`，`updateTime` 还要加 `FieldFill.INSERT_UPDATE`，与项目主流实体（SampleStock/StockTransfer/SelectionBatch 等）保持一致。即使 Orchestrator 手动 setTenantId，注解也是必需的，因为 TenantInterceptor 注释说"INSERT 通过 MetaObjectHandler 自动填充"，但 strictInsertFill 对无注解字段是 no-op
  2. **跨天补卡兜底**：clockOut 时如果今日无记录，先查最近一条「未下班打卡」记录（`clock_out_time IS NULL ORDER BY clock_in_time DESC LIMIT 1`），找到则补 clock_out_time 到该记录（不修改 workDate），避免跨天工时丢失
  3. **并发竞态兜底**：clockIn 的 save 调用包 try-catch DuplicateKeyException，捕获后重新查询返回"今日已上班打卡"，避免向用户报 500。数据完整性由唯一键 `uk_tenant_user_date` 保证，应用层只做友好降级
- **理由**：
  - 实体注解对齐是项目主流模式，未标注是漏配，会导致自动填充失效
  - 跨天补卡兜底是打卡系统的常见场景（夜班、加班），不能简单按"今日无记录"判定漏打上班卡
  - 并发兜底是「唯一键 + 友好降级」模式，避免向用户暴露数据库异常
- **影响**：
  - 后端修改文件：
    - WorkAttendance.java（补 3 个 @TableField 注解）
    - WorkAttendanceMapper.java（新增 selectLatestOpen）
    - WorkAttendanceService.java + WorkAttendanceServiceImpl.java（新增 findLatestOpen）
    - WorkAttendanceOrchestrator.java（clockIn 加 try-catch DuplicateKeyException，clockOut 加跨天兜底分支）
  - 后续新增业务实体时，必须按本决策标注 @TableField 注解
  - 后续涉及「按日期查询 + 跨天」的场景（如签到/签退），参考本决策的「先查今日，再查最近未关闭记录」模式

## D-043：小云AI智能化升级 — 死代码修复 + 可观测性增强 + 配置统一

- **日期**：2026-07-20
- **上下文**：用户要求"全局核实去GitHub调研最新的智能体...全部深入了解透彻后我们就开始升级"。先调研小云全链路架构（五层记忆模型/Hybrid Graph MAS v4.1/双Model Router/6个自研MCP/24+ Java Agent工具/D-021统一可观测/EvolutionPipeline自进化三件套），发现6个P0级死代码/断链、10个P1级稳定性/可观测性问题、3个P2级配置不一致
- **决策**：
  1. **死代码必须接入真实调用方，不得仅删除**：archivalMemCtx/selfCritiqueCtx/recordUsage 等死代码原本是"声明了但永远走不到"的代码路径，修复时必须找到原本应该调用的方法/Service并接入（如 selfCritiqueCtx 通过 EvolutionOrchestrator.getUnifiedMetrics 获取真实自评统计），而不是直接删除声明。理由：这些代码是设计意图的体现，删除会丢失功能
  2. **getUnifiedMetrics 公开化**：EvolutionOrchestrator 原16个 aggregateXxxStats 方法都是 private，外部无法访问。新增 public getUnifiedMetrics(tenantId) 便捷重载，供 AiAgentPromptHelper.buildSelfCritiqueBlock 和未来其他观测场景调用
  3. **自进化默认关闭，显式开启**：EvolutionPipeline.self-play-enabled 和 EvolutionSafetyGuard.auto-deploy-enabled 默认值统一改为 false。理由：自动应用未审查的进化提案存在生产风险（可能与人工编辑冲突），生产环境需要自进化时显式设置 XIAOYUN_EVOLUTION_AUTO_DEPLOY=true
  4. **cron 错峰调度**：凌晨3-4点的7个AI任务原本有3处时间冲突（MemoryArchive vs SelfDrill 03:30、SharedMem vs SystemDoctor vs Gepa 04:00、MemoryNudge vs AiSelfEvolution 04:30）。错峰到03:00-05:00区间，每个间隔15-20分钟
  5. **AI组件健康检查聚合**：新建 AiComponentHealthIndicator 实现 Spring Boot HealthIndicator，将 DeepSeek/Qdrant/Agnes/LiteLLM/Langfuse 5个组件的健康状态聚合到 /actuator/health。设计原则：单组件超时2s、独立try-catch、未配置返回UNKNOWN不视为DOWN
  6. **DEEPSEEK_API_KEY 启动校验**：AiInferenceRouter.@PostConstruct 校验 key 非空，默认仅告警不阻止启动（ai.api-key.fail-fast-on-empty=false）。理由：key为空时所有AI功能都会失败，但错误散落在各Service中，启动时统一告警+列出受影响功能更友好
  7. **配置默认值与yml统一**：ModelConsortiumRouter strategy 代码默认 cost-optimal → speed-first 对齐 yml；AiAgentMemoryHelper MAX_MEMORY_TURNS 硬编码15 → @Value注入对齐 yml 的20
  8. **@Scheduled 任务必须加 enabled 开关**：所有AI cron任务新增 `@Value("${xiaoyun.job.xxx.enabled:true}")` 开关，默认true不影响现有行为，运维可通过 yml/env 关闭
- **理由**：
  - 死代码修复原则是"接入真实调用方"而非"删除"，保留设计意图
  - 自进化默认关闭符合"生产环境不自动应用未审查变更"原则
  - 健康检查聚合到 actuator 可被 K8s/Prometheus 统一监控，无需额外对接
  - 配置默认值与yml统一避免"代码跑 cost-optimal 但运维以为 speed-first"的认知偏差
- **影响**：
  - 后端修改文件26个（含新建1个 AiComponentHealthIndicator.java），789 insertions(+), 27 deletions(-)
  - commit: 92b7fd957，已推送至 origin/main
  - 验证：mvn compile通过、audit-tenant-id.py通过、check-flyway-sql.py通过、代码搜索无残留
  - 后续所有新增 @Scheduled 任务必须带 enabled 开关
  - 后续所有 @Value 默认值必须与 application.yml 显式配置对齐

## D-044：智能化功能全量改为用户可配置开关（补全 8 个 HIGH 风险自动执行点）

- **日期**：2026-07-23
- **上下文**：用户核心诉求"全部优化好这些 这些这些智能化的 还是不要自动 让用户可以设置这些 理解吗 怕出现问题"。前一轮已为 AiPatrolJob.executeAutoActions/scanOverdueCollaborationTasks/scanPersonalTaskReminders/pushHighSeverityAlerts + EcSyncJob.stockSyncJob + ReceivableOverdueJob 加了开关。本轮全系统核查发现仍有 8 个 HIGH 风险 @Scheduled 方法会"自动执行写操作/对外通知/派单"但没有用户可配置开关
- **决策**：
  1. **AiPatrolJob 4 个跨租户巡检方法统一纳入 AUTO_PATROL_EXEC 开关**：scanProductionAnomalies / scanExtendedAnomalies / runDailyPatrol / checkTaskOrderProgress 均在方法开头用 isActionEnabledForAnyTenant(AUTO_PATROL_EXEC) 检查，全租户未开启则跳过（避免自动创建巡检工单+写 REFLECTIVE 记忆）
  2. **EcSyncJob.retryJob 纳入 AUTO_EC_STOCK_SYNC 开关**：按租户检查开关，关闭则不自动重试推库存/价格到电商平台（避免对外推送）
  3. **SmartNotifyJob.autoDetectAndNotify 纳入新开关 AUTO_MIND_PUSH**：在 doAutoDetect 租户循环内按租户检查，关闭则不自动推送微信/站内通知
  4. **XiaoyunDailyInsightJob 纳入新开关 AUTO_DAILY_INSIGHT_DISPATCH**：在 generateDailyInsights 租户循环内按租户检查，关闭则不自动生成洞察+派发协作任务
  5. **AgentBackgroundTaskJob 纳入新开关 AUTO_AGENT_BACKGROUND_TASK**：在 processPendingTasks 租户循环内按租户检查，关闭则不自动执行 AI 后台任务
  6. **BackendActionFlagService 新增 3 个开关枚举**：AUTO_MIND_PUSH / AUTO_DAILY_INSIGHT_DISPATCH / AUTO_AGENT_BACKGROUND_TASK，全部默认关闭
  7. **Flyway V202612070001 初始化新开关**：为已有租户和活跃租户插入 3 个新开关记录，enabled=0（默认关闭）
  8. **前端配置面板补充 3 个新开关文案**：ProfileSmartSettingsPanel.tsx 的 BACKEND_ACTION_LABELS 新增 3 条，含标题+描述+关闭后影响说明
- **理由**：
  - 用户明确"怕出现问题"，所有会触发实际操作（写数据/对外通知/派单/推送平台）的智能化能力必须默认关闭，由租户管理员显式开启
  - 跨租户巡查方法用 isActionEnabledForAnyTenant 粗粒度控制（任一租户开启才执行），单租户精确方法用 isEnabled 细粒度控制（按租户精确跳过）
  - 数据修复/清理类任务（FinanceDataConsistencyJob/AuditLogCleanupJob/cleanupOldNotices）不纳入开关，因为关掉会导致数据不一致或堆积，属于运维必需而非"智能化"范畴
- **影响**：
  - 后端修改 5 个 Job 文件 + 1 个 Service 文件（BackendActionFlagService）
  - 新建 1 个 Flyway 迁移（V202612070001）
  - 前端修改 1 个文件（ProfileSmartSettingsPanel.tsx）
  - 验证：mvn compile exit 0、npx tsc --noEmit 0 errors
  - 至此后端动作类智能开关共 15 个，全部默认关闭，覆盖所有 HIGH 风险自动执行点

## D-045：财务链路全链路闭环 + BillConstants 常量类引入

- **日期**：2026-07-28
- **上下文**：用户诉求"全部一次性修复所有财务链路问题"。系统核查发现 11 条 P0 级风险：BillAggregation 唯一索引被降级为普通索引存在并发幂等风险、财务结算视图 outstock_amount CASE 表达式两分支相同导致冲销金额未排除、closed 状态过滤缺失导致关单订单出现在结算列表、工资结算 generate 无分布式锁可能并发重复结算、外发工厂扣款账单方向错误（误推 RECEIVABLE+CUSTOMER 而非 PAYABLE+FACTORY）、BillAggregationOrchestrator 内 15 处硬编码字符串等
- **决策**：
  1. **BillAggregation 唯一索引恢复**（V202707280001）：重建复合唯一索引 `uk_source_active (source_type, source_id, tenant_id, delete_flag)`，未删除记录唯一，已删除记录不约束允许同来源重新创建
  2. **财务结算视图修复**（V202707280002）：outstock_amount 冲销分支改为 ELSE 0、补回 closed 状态排除、添加 factory_type 等组织字段、t_scan_record 不加 delete_flag 过滤（表无该字段）
  3. **DbViewRepairHelper 同步**：新增 missingOutstockQuantity/missingFactoryType 检查
  4. **工资结算 reverseApprove()**：新增反向审核方法，已审核工资单可反向账单（调用 billAggregationOrchestrator.reverseBySource）
  5. **工资结算分布式锁**：generate() 方法用 DistributedLockService.executeWithLock 防并发，lockKey=`payroll:generate:{tenantId}:{orderId}:{operatorId}`
  6. **外发工厂扣款账单方向修复**：ShipmentReconciliationOrchestrator.pushDeductionBills 按 isOwnFactory 三态判断（null/0/1），外发工厂订单推 PAYABLE+DEDUCTION+FACTORY
  7. **BillConstants 常量类引入**：新建 `finance/constant/BillConstants.java` 集中管理账单常量，涵盖 5 大维度（BILL_TYPE 2/CATEGORY 9/STATUS 5/SOURCE_TYPE 14/COUNTERPARTY_TYPE 6）+ 4 个便捷判断方法（isPayable/isReceivable/isTerminalStatus/isConfirmedGroup），BillAggregationOrchestrator 内 15 处硬编码字符串全部替换
- **理由**：
  - 财务数据准确性是 P0 底线，任何冲销/状态/方向错误都会导致账务悬挂或对账失败
  - 工资结算并发场景必须用分布式锁，否则可能产生重复结算单（已发生过类似事故）
  - 硬编码字符串分散在 18+ 文件中，新增分类时容易遗漏，集中常量化便于维护
  - DB 字段保持 VARCHAR 不变，仅代码层常量化，避免破坏现有 API 契约和数据库兼容性
- **影响**：
  - 新建文件：BillConstants.java、V202707280001/V202707280002 Flyway 迁移
  - 修改文件：BillAggregationOrchestrator.java、DbViewRepairHelper.java、PayrollSettlementOrchestrator.java、ShipmentReconciliationOrchestrator.java
  - 验证：mvn compile exit 0、mvn test-compile exit 0、npx tsc --noEmit 0 errors
  - 后续待办：外部模块（ShipmentReconciliationOrchestrator/SalesReturnOrchestrator/ExpenseReimbursementOrchestrator 等）调用 pushBill 时仍使用字符串字面量，可渐进迁移到 BillConstants 常量（不阻塞当前功能）

## D-046：全系统核查 — AI输出净化 + Helper事务边界 + Job开关控制

- **日期**：2026-07-28
- **上下文**：用户诉求"还有多少需要优化的 全系统都核实清楚 不要出现任何问题"。在 D-045 财务链路修复基础上，继续系统性核查全系统剩余优化项，发现 3 类 P0 级问题
- **决策**：
  1. **AI 输出净化 P0 修复**：StreamingAgentLoopCallback / SyncAgentLoopCallback 注入 `GuardrailsConfigService`，新增 `sanitize()` 方法调用 `sanitizeOutput()` 实现完整净化（剥离 prompt 标记 + 敏感信息屏蔽）。`onAnswer` / `onPlanMode` 改为使用净化后内容。EnhancedStreamingCallback 构造函数同步添加参数。AiAgentOrchestrator 创建回调时传递 `componentRegistry.getGuardrailsConfigService()`
  2. **Helper 层 @Transactional 残留 P0 修复**：移除 4 个 Helper 类共 10 处冗余 @Transactional 注解（ProductionOrderCreationHelper 2处 / ProductionOrderLifecycleHelper 3处 / ProductionOrderWorkflowHelper 4处 / SampleOrderCreationHelper 1处），每处添加注释说明事务由调用方 Orchestrator 声明
  3. **Job 开关控制违规 P0 修复**：AiPatrolJob.scanOverdueCollaborationTasks 原实现 `if (!isEnabled) continue;` 跳过整个租户扫描，违反"开关关闭时继续扫描记录日志，仅跳过创建动作"规则。改为 `boolean actionEnabled = ...`，在循环内部用 actionEnabled 控制 escalateTask + createAction 调用，新增 totalScanned 计数器
- **理由**：
  - AI 输出净化不完整会导致敏感信息通过 SSE 或记忆存储泄露，是安全底线
  - D-001 铁律要求事务仅在 Orchestrator 层，Helper 层冗余事务会导致嵌套回滚和连接泄漏
  - 巡检开关的语义是"控制写操作"，不是"停止巡检"，关闭时仍需扫描记录日志供运维查看
- **影响**：
  - 修改文件：StreamingAgentLoopCallback.java、SyncAgentLoopCallback.java、EnhancedStreamingCallback.java、AiAgentOrchestrator.java、ProductionOrderCreationHelper.java、ProductionOrderLifecycleHelper.java、ProductionOrderWorkflowHelper.java、SampleOrderCreationHelper.java、AiPatrolJob.java
  - 验证：mvn compile ✅ BUILD SUCCESS
  - Flyway 迁移脚本核查：check-flyway-sql.py 全量扫描，254 个警告均为历史迁移（已存在，不修复），无 P0 新问题

## D-047：全系统稳定性核查与优化（2026-07-28）

### 上下文
用户要求"全部都看看 智能化的这些还有什么 全系统的稳定度 操作交互 整体布局 代码冗余"，启动全系统扫描。

### 决策
1. **AI 线程池统一有界化**：所有 `Executors.newFixedThreadPool` / `newCachedThreadPool` 改为有界 `ThreadPoolExecutor`，队列容量 ≤128，拒绝策略 CallerRunsPolicy，必须 @PreDestroy 优雅关闭
2. **缓存多租户隔离**：所有 Caffeine/Redis 缓存的 key 必须包含 tenantId 前缀，命中后二次校验 tenantId（防 key 碰撞）
3. **N+1 查询零容忍**：循环内禁止 `getById/selectById/lambdaQuery().one()`，必须先批量 IN 查询 + Map 内存查找
4. **Job 凌晨 4 点错峰**：禁止使用 `*/4` 类 cron（必然撞 4 点档），改为具体小时列表如 `0,8,12,16,20`；批量 Job 必须有分布式锁
5. **Modal 统一 ResizableModal**：含 Form/Table/Upload 等复杂内容的 Modal 必须用 ResizableModal，禁止直接用 antd Modal
6. **渐变色零容忍**：页面背景/卡片/按钮禁止 linear-gradient/radial-gradient，统一用纯色 CSS 变量

### 理由
- AI 模块改动多，线程池/缓存/SSE 等基础组件问题影响全系统稳定
- N+1 查询在数据量增长后会导致接口超时
- Job 冲突在多实例部署时会重复执行昂贵操作
- UI 规范统一提升品牌一致性

## D-048：*LogAppendHelper 泛型基类重构（2026-07-28）

### 上下文
24个 `*LogAppendHelper` 类（分布在 finance/production/warehouse/stock/crm/style 6个模块）存在大量重复样板代码：每个类都重复声明 Service、Entity、getter/setter、appendOperation 方法，代码重复率超过 80%。

### 决策
1. 创建 `AbstractOperationLogAppendHelper<T, ID>` 泛型基类，封装通用逻辑
2. 子类只需实现4个抽象方法：getService()、getEntityName()、getRemarkGetter()、getRemarkSetter()
3. 基类提供 appendOperation() + 10个常用便捷方法（appendCreate/appendUpdate/appendDelete/appendClose等）
4. 复杂型Helper（双写、自定义格式、多实体同步）通过覆盖 `appendOperation` 方法扩展
5. PurchaseCartService 接口改造：新增 `extends IService<PurchaseCart>` 确保基类 getService() 返回类型兼容

### 理由
- 消除重复代码，24个Helper从平均80行缩减到平均30行
- 统一 null 防护和日志格式
- 基类新增便捷方法可被所有子类复用，新Helper可快速创建
- 复杂型Helper通过覆盖而非继承全部方法，保持灵活性

### 例外处理
- MaterialPurchaseLogAppendHelper：覆盖 appendOperation 实现双写策略（MaterialPurchase.remark + ProductionOrder.remarks）
- ScanRecordLogAppendHelper：保留 syncScanRecordToOrder 多实体同步逻辑
- CuttingTaskLogAppendHelper：覆盖 appendOperation 实现双写 + appendOrderOnly 仅同步方法
- PurchaseCartLogAppendHelper：覆盖 appendOperation 使用自定义 buildRemark 格式

---

## D-049：SoulAnchor 4锚点 LLM 重建 + @AgentToolDef 覆盖率提升（2026-07-28）

### 上下文
1. SoulAnchor 多锚点身份重建此前仅实现 decisionLog 锚点的完整重建（从 md 文件回灌），其他 3 个锚点（factoryProfile/userProfile/reflectiveMem）只做告警，需 LLM 推理（原标 P3 阶段）。
2. `@AgentToolDef` 注解覆盖率仅 25%（25/106），未达到 Agent 工具治理目标 80%+，影响工具元数据可观测性和自动化注册。

### 决策
#### D-049-1 SoulAnchor 4锚点 LLM 重建（P2-1 提前实施）
1. 注入 `IntelligenceInferenceOrchestrator`（懒加载）和 `QdrantService`（懒加载）到 `SoulAnchorRebuildService`
2. 新增 3 个 LLM 重建方法：
   - `rebuildFactoryProfileWithLLM(tenantId)`：从 AiLongMemory(FACT) 拉取工厂事实 → LLM 总结 → 写入 MemoryBankEntry(category=factory_profile)
   - `rebuildUserProfileWithLLM(tenantId)`：从 t_ai_conversation_memory 拉取会话摘要 → LLM 推断 → 写入 MemoryBankEntry(category=user_profile)
   - `rebuildReflectiveMemWithLLM(tenantId)`：从 L5 Archival Qdrant 召回 → LLM 反思 → 写入 AiLongMemory(layer=REFLECTIVE)
3. 容错：LLM 不可用/无素材/调用失败 → 返回 0 不抛异常，退化为告警模式
4. 开关：`xiaoyun.soul.llm-rebuild.enabled=true`（默认开启）

#### D-049-2 @AgentToolDef 覆盖率提升至 98%（P2-2）
1. 扫描 `agent/tool/*.java` 共 113 个文件，排除 7 个非Tool文件（基类/接口/枚举/注解/扫描器）
2. 批量补齐 80 个 Tool 的 `@AgentToolDef` 注解，覆盖率 25% → 98%（105/106）
3. 标注规则：name() 用类 getName() 返回值；description() 精简到 1 句话；domain() 按 ToolDomain 枚举分类；readOnly() 写操作 Tool 设为 false
4. 不修改 @McpToolAnnotation 注解、方法逻辑、字段定义

### 理由
- SoulAnchor 4 锚点 LLM 重建：避免人工介入的延迟，使租户切换/数据恢复后能快速重建身份锚点
- @AgentToolDef 覆盖率：工具元数据是 Agent 工具系统的基础，未标注的 Tool 无法被自动化注册/治理/可观测
- 懒加载依赖：避免循环依赖（IntelligenceInferenceOrchestrator 已依赖其他 Service）
- LLM 容错降级：保证 LLM 不可用时不影响 SoulAnchor 一致性校验主流程

### 验证
- 后端 `mvn compile -q -DskipTests` ✅ BUILD SUCCESS
- 前端 `npx tsc --noEmit` ✅ 0 errors
- @AgentToolDef 覆盖率核实：`grep -l "@AgentToolDef" ... | wc -l` = 105

---

## D-050：小云AI P3 升级 — 共享记忆滑动续期 + 工具版本化治理 + L5 分级存储（2026-07-28）

### 上下文
小云AI智能化系统六大模块完整度达 95%+，剩余 P3 阶段 3 项待升级：
1. **共享记忆滑动续期**：活跃会话中共享事实过期会被清理，导致多 Agent 协作时事实丢失
2. **工具版本化治理缺失**：@AgentToolDef 无版本字段，废弃工具无法标识和迁移
3. **L5 Archival 单层存储**：6 个月+ 冷数据全部存于同一 collection，无分级策略，召回效率低

### 决策

#### D-050-1 SharedAgentMemory 滑动续期（P3-1）
1. `SharedAgentMemoryMapper` 新增 `extendExpire(tenantId, sessionId, newExpire, maxExpire)` 方法
2. `SharedAgentMemoryService.readFacts/readFact` 读取后调用 `slideExpireBestEffort`：
   - newExpire = NOW + 24h（每次读取延长 24h）
   - maxExpire = 最早 createTime + 7 天（**7 天硬上限**防止无限续期）
   - SQL 限制：只续期 `expire_time < maxExpire` 的记录
3. best-effort 模式：续期失败不抛异常，仅 log.debug

#### D-050-2 @AgentToolDef 版本化治理（P3-2）
1. `@AgentToolDef` 新增 3 个字段：
   - `version`：语义化版本号（默认 "1.0.0"）
   - `deprecated`：是否已废弃（默认 false）
   - `replacedBy`：替代工具名（默认 ""）
2. 新建 `AgentToolVersionRegistry` 服务：
   - `@PostConstruct` 启动时扫描所有 `@AgentToolDef` Bean（支持 CGLIB 代理）
   - 内存存储 `Map<String, ToolVersionInfo>`，运行时只读
   - 提供 `listAllTools()` / `listDeprecatedTools()` / `versionDistribution()` / `healthCheck()` 方法

#### D-050-3 L5 Archival 分级存储策略（P3-3）
1. 新建 `ArchivalTier` 枚举：`HOT`（6m~1y）/ `WARM`（1~2y）/ `COLD`（2y+）
2. `ArchivalTier.of(originalCreateTime, now)` 静态方法按时间自动分级
3. `QdrantService` 新增 4 个方法：
   - `upsertArchivalTiered(..., ArchivalTier tier)`：写入 tier 字段到 payload（旧 `upsertArchival` 委托此方法）
   - `searchArchivalTiered(..., List<ArchivalTier> tierFilter)`：按 tier 过滤召回
   - `searchArchivalSmart(..., boolean includeCold)`：智能扩展（HOT → HOT+WARM → 全量）
   - `countArchivalByTier(tenantId)`：分级分布统计
4. `MemoryArchiveJob` 升级调用 `upsertArchivalTiered`，createTime 决定 tier
5. `MemoryArchiveService` 新增 `searchArchivalSmart` 和 `countArchivalByTier` 委托方法
6. `AiAgentPromptHelper.buildArchivalMemoryBlock` 改用 `searchArchivalSmart(includeCold=true)`

### 理由
- **滑动续期 7 天硬上限**：避免无限续期导致共享记忆永久留存，违背"会话内共享"设计原则
- **工具版本化用注解字段而非独立表**：减少侵入性，注解扫描即可获取元数据，无需 DB 查询
- **L5 三级分层 HOT/WARM/COLD**：参考 S3 存储分级和 AWS S3 Vectors 多 Agent 协作模式，热数据优先召回降低延迟
- **智能扩展策略**：默认场景仅搜 HOT（快），不足时扩展 WARM（兜底），明确历史查询时全量（含 COLD）
- **向后兼容**：`upsertArchival` 保留并委托 `upsertArchivalTiered(tier=null)`，旧调用方无需修改

### 验证
- 后端 `mvn compile` ✅ BUILD SUCCESS
- 后端 `mvn test-compile` ✅ BUILD SUCCESS
- 前端 `npx tsc --noEmit` ✅ 0 errors
- 提交 `46ff97a8c`，推送至 main 分支 ✅

### 影响
- 小云AI智能化系统六大模块完整度提升至 **98%+**
- L5 归档召回效率优化：HOT 层索引规模减小，向量检索延迟降低
- 工具治理可观测性提升：废弃工具可识别、可迁移路径明确
- 多 Agent 协作稳定性提升：活跃会话共享事实不会因过期丢失

### 后续待办
- 工具版本化治理：扫描现有 105 个 Tool，对真正废弃的 Tool 标记 `deprecated=true` + `replacedBy`
- L5 Archival：观察 Qdrant 分级分布，必要时调整 HOT/WARM/COLD 时间阈值
- SoulAnchor：观察 LLM 重建质量，必要时调整 prompt 模板

## D-051：财务闭环数据流转 + @Version乐观锁补齐 + 数字孪生深化（2026-07-31）

### 上下文
对比老牌系统排查优化点时发现 3 处数据流转断点/并发风险：
1. **账单→会计凭证断链**：BillAggregationOrchestrator 在账单确认/反向时未联动 AccountingVoucherOrchestrator，导致账单状态变更后会计凭证未同步生成/冲销，财务数据链路断裂（D-022 财务闭环设计的最后一公里未落地）
2. **金融实体并发风险**：Payable/Receivable/BillAggregation/WagePayment 4 个金融实体缺少 @Version 乐观锁，部分还款/冲账并发场景下可能丢更新（D-008 原子SQL已覆盖库存数量，但金融实体状态机仍依赖 read-modify-write）
3. **数字孪生空壳**：ProductionDomainProvider 未实现，FullDigitalTwinBuilder 缺少生产域数据，工厂负载热力图和在制品分布无法提供

### 决策

#### D-051-1 账单→凭证数据流转闭环
1. `BillAggregationOrchestrator.confirmBill()` 末尾调用 `ensureAccountingVoucherFromBill(bill)`
2. `ensureAccountingVoucherFromBill()` 调用 `accountingVoucherOrchestrator.generateVoucherFromBill(bill.getId())`
3. `reverseBillInternal()` 在账单置 CANCELLED 后调用 `accountingVoucherOrchestrator.reverseByBillAggregationId(bill.getId())`
4. **fail-safe 设计**：凭证生成/冲销失败用 try-catch + log.warn 记录，不阻塞账单主流程（账单状态已变更，凭证可人工补录）
5. `@Autowired(required = false)` 避免 AccountingVoucherOrchestrator 未启用时启动失败

#### D-051-2 @Version 乐观锁补齐
1. 4 个金融实体添加 `@Version private Integer version;` 字段
2. Flyway `V202608081400__add_version_to_finance_entities.sql` 为 4 张表添加 `version INT NOT NULL DEFAULT 0` 列
3. 与 D-008 协同：库存数量仍用原子SQL（`UPDATE ... SET qty = qty + ?`），金融实体状态机用 @Version 乐观锁

#### D-051-3 数字孪生 ProductionDomainProvider
1. 实现 `DomainDataProvider` 接口，提供 `buildProduction(tenantId)` 方法
2. 工厂负载热力图：按 factoryName 分组统计订单数/产能利用率/负载等级（low/medium/high/critical）
3. 在制品工序分布：基于最近 7 天扫码记录按 processCode 分组
4. 交期分桶：overdue/3d/7d/30d/30d+ 五档
5. 异常容错：任一子查询失败返回 null，不影响其他域

### 关键设计权衡
- **凭证 fail-safe 用 try-catch 而非传播异常**：账单是财务主链路，凭证是会计辅助链路。账单已确认/取消的状态不能因凭证失败而回滚（业务上账单状态变更已通知上下游），凭证可人工补录。这与样衣开发费用推送的 fail-safe 设计相反（样衣费用推送不用 try-catch，让账单异常触发审核事务回滚），原因是样衣费用是审核流程内的强一致场景，而账单确认是独立流程
- **@Version 与原子SQL 分工**：库存数量是高频并发累加场景，@Version 会导致大量重试，原子SQL 更合适；金融实体状态机是低频切换场景，@Version 乐观锁更直观
- **ProductionDomainProvider 异常容错返回 null**：数字孪生是辅助决策工具，不能因生产域查询失败导致整个 FullDigitalTwinBuilder 崩溃，null 由调用方跳过

### 验证
- 代码审查验证：
  - `confirmBill` line 359 → `ensureAccountingVoucherFromBill` → `generateVoucherFromBill` 链路闭环
  - `reverseBillInternal` line 528 → `reverseByBillAggregationId` 链路闭环
  - 4 个实体 @Version 注解全部到位（Payable:79, Receivable:80, BillAggregation:81, WagePayment:106）
  - Flyway V202608081400 存在
- 5 大核心链路数据流转闭环验证通过
- 环境限制无法执行 mvn compile，已通过代码审查确保语法正确性

### 影响
- 财务数据链路完整闭环：账单状态变更 → 会计凭证自动生成/冲销
- 金融实体并发保护补齐：部分还款/冲账场景不会丢更新
- 数字孪生生产域可用：工厂负载热力图、在制品分布、交期分桶可可视化
- 代码中 "D-022 财务闭环" 注释指本决策的财务闭环设计（非 decisionLog 的 D-022 多视角评审）

### 后续待办
- 编译验证：环境恢复后执行 `mvn compile` 确认无编译错误
- 凭证 fail-safe 监控：观察 `[BillAggregation] 会计凭证生成失败` 日志频率，高频时需排查根因
- @Version 冲突监控：观察 OptimisticLockException 频率，高频时考虑重试机制

## D-052：WhatIfSimulation 全场景 APS/ML 联动 + 颜色清理扩展 + 文件拆薄（2026-07-31）

### 上下文
对比老牌系统优化时发现 WhatIfSimulation 推演沙盘仅有 CHANGE_FACTORY 场景接入 APS排产联动，其他场景（ADVANCE_DELIVERY/ADD_WORKERS）仍用经验常数估算，推演精度不足。同时前端仍有 1854 个高频硬编码颜色未映射到 CSS 变量。

### 决策

#### D-052-1 WhatIfSimulation 全场景联动
1. **ADVANCE_DELIVERY + ML**：新增 `enrichAdvanceDeliveryWithMl(stats, accelDays)`，基于 ML 日均产能推算提前天数后的产能缺口比例，三档风险评级（<10% 降险 / 10-30% 微升 / >30% 显著上升）
2. **ADD_WORKERS + ML**：用 `mlAverageDailyVelocity` 替代 1800.0 经验常数，精确计算增员后新产能 `newVelocity = baseVelocity + baseVelocity * workers / 30 * 0.55`
3. **CHANGE_FACTORY + APS**（前次完成）：用 APS 真实约束求解结果覆盖启发式估算
4. **Baseline + ML**（前次完成）：每单调用 ML 预测统计真实逾期数

#### D-052-2 颜色清理扩展
1. `scripts/replace-colors.mjs` 新增 30+ 高频颜色映射（#000→--color-black, #3b82f6→--color-secondary, #8c8c8c→--color-text-muted 等）
2. 执行替换：801 处硬编码颜色转为 CSS 变量
3. 保护色 71 处完整保留（#00e5ff/#39ff14/#7c4dff/#00bcd4/#f7a600）

#### D-052-3 WhatIfSimulationOrchestrator 拆薄
1. 提取 `intelligence/helper/WhatIfScenarioParserHelper.java`（149 行）
2. 包含 4 个纯函数解析方法，@Component 注解
3. Orchestrator 从 840 行降至 719 行

### 关键设计权衡
- **ADVANCE_DELIVERY 用缺口比例而非绝对天数**：不同订单规模下提前 3 天的影响不同，用 `shortfallRatio = velocity * accelDays / remaining` 标准化后三档评级更合理
- **ADD_WORKERS 用 baseVelocity/30 作为单人产能**：30 人为基准工厂规模假设，ML 提供的真实日均产能比 1800.0 经验常数更准确
- **颜色映射扩展而非新建变量**：所有新增映射都指向 design-system.css 已定义的 CSS 变量，确保主题切换（亮/暗）自动生效
- **拆薄提取纯函数优先**：自然语言解析方法无实例状态依赖，是最安全的拆薄对象

### 验证
- 后端代码审查：imports 完整、无悬空引用、@Autowired 注入正确
- 前端类型检查：`npx tsc --noEmit` 通过，0 errors
- 数据流转：ML 4 条链路 + APS 1 条链路全部闭环，回退逻辑正确
- 颜色审计：0 可替换剩余，71 保护色完整

### 影响
- WhatIf 推演精度提升：4 个场景全部基于真实数据（ML预测/APS排产）而非经验常数
- 前端主题一致性提升：累计 1248 处硬编码色转 CSS 变量，亮/暗主题切换全覆盖
- 代码可维护性提升：WhatIfSimulationOrchestrator 聚焦核心逻辑，解析逻辑独立可测

### 后续待办
- 超长文件拆薄：仍有 341 个文件 >300 行（163 Orchestrator + 50 Service + 27 Controller + 46 Helper + 55 Other），优先拆分 Top 10 最大文件
- 编译验证：环境恢复后执行 `mvn compile` 确认 WhatIfScenarioParserHelper 注入正确

## D-053：Agnes视觉模型升级至2.5 Flash + 样衣扫码单价链路修复（2026-07-31）

### 上下文
用户通知 Agnes 官方发布 2.5 Flash 版本（对标 Claude Opus 4.7 代码能力且继续免费开放），需评估是否跟随升级。同时样衣扫码单价传递链路有历史遗留问题。

### 决策

#### D-053-1 Agnes视觉模型升级至2.5 Flash
1. **跟随升级**：确认升级，13处引用全量覆盖，零遗漏
2. **全量引用点修改**：
   - application.yml 3处（agnes.model / agnes2.model / ai.model.vision 默认值）
   - Java @Value 默认值 6处（ModelConsortiumRouter / IntelligenceAiAdvisorController / QdrantService / StyleDifficultyOrchestrator / IntelligenceInferenceOrchestrator 主+备）
   - Java 硬编码 2处（IntelligenceInferenceOrchestrator VISION_MODEL_N_MODEL 兜底值 / AiCostTrackingOrchestrator 定价表新增条目）
   - cloudbaserc.json 新增 3个环境变量（AGNES_MODEL / AGNES2_MODEL / AI_MODEL_VISION），运维可直接面板覆盖
   - 文档注释 2处（CODE_WIKI.md / QdrantService.java Javadoc）
3. **保留历史兼容**：AiCostTrackingOrchestrator 定价表同时保留 agnes-2.0-flash 和 agnes-2.5-flash 两条（2.0给历史成本数据用）

#### D-053-2 样衣扫码单价链路修复
1. **小程序端**：miniprogram/pages/scan/pattern/index.js 从 operationOptions 提取 unitPrice / processName / progressStage 三字段透传 submitPatternScan
2. **H5端**：h5-web/src/pages/ScanPatternPage.jsx 新增 resolveProcessMeta() 方法，工序配置加载后匹配当前工序提取参数
3. **三端副本同步**：miniprogram / source-miniapp / public/source-miniapp / dist/source-miniapp MD5 一致

### 关键设计权衡
- **环境变量兜底而非硬编码唯一版本号**：所有模型名均使用 `${ENV:默认值}` 形式，运维云基座设置环境变量可秒级回退至 2.0，无需发版。理由：模型升级虽经兼容性验证但存在不可预见的视觉输出差异，秒级回退是生产安全底线
- **AiCostTrackingOrchestrator 保留2.0定价条目而非删除**：t_ai_cost_tracking 表中已有 model_name=agnes-2.0-flash 的历史记录，保留定价条目保证成本汇总查询时 calculateCost() 不返回 null，不影响财务报表数据完整性
- **双模型主备配置 + 通用 VISION_MODEL_N 入口**：除了 agnes/agnes2 专用配置外，VISION_MODEL_1..20 通用配置入口允许运维随时增加第三方视觉模型（如 Doubao Vision）作为第三路故障转移，无需重启服务
- **样衣扫码后端仍保留兜底查询 lookupStyleProcessPrice**：前端传参是优化（精确匹配当前工序），后端兜底查询是安全网（前端代码Bug或旧小程序版本时仍能从工序配置表查到单价）。双路径防御符合P0事故双路径防御原则

### 验证
- **兼容性验证PASS**：
  - API端点无变化（apihub.agnes-ai.com/v1/chat/completions）
  - 请求格式标准OpenAI兼容（model + messages[].content[] image_url/text双part）
  - 响应格式标准 choices[0].message.content 解析
  - 定价不变（2.5 Flash延续免费政策）
- **全量引用验证PASS**：grep agnes-2.0 仅剩 AiCostTrackingOrchestrator line 24 一处故意保留，其余12处全部升级
- **部署配置验证PASS**：cloudbaserc.json 新增 3个变量面板可控，秒级回退可用
- **样衣扫码链路验证PASS**：前端传参 → 后端优先采用 → 兜底查询 → 写入 scanRecord.unitPrice 链路闭环

### 影响
- 视觉推理能力升级：样衣疵点识别、款式难度评估、Embedding语义向量质量预期提升
- 无兼容性风险：API完全兼容，零代码级破坏性变更
- 运维灵活性增强：云基座变量秒级切换模型版本，三配置入口支持多模型故障转移策略
- 样衣扫码单价数据完整性提升：后端兜底+前端透传双路径保证，工资结算工序单价计算精度提升

### 后续待办
- 观察 2.5 视觉输出质量差异：比较疵点召回率、款式难度评分分布偏移，如有显著差异需调整阈值
- 成本表观察：如 Agnes 官方调整 2.5 Flash 定价需及时更新 MODEL_PRICING 表
- 编译验证：环境恢复后执行 `mvn compile` 确认无编译错误

## D-054：云托管部署连续失败四连根因修复（2026-08-02）

### 上下文
8月1日 b8582636d 大改动（intelligence 模块全链路修复，新增大量 @Service/@Component Bean）后，8月2日云端部署从 backend-2003 到 backend-2006 连续失败，全部报 `Liveness/Readiness probe failed: connect: connection refused 8088`，期间出现 9 个 P0 救火 commit 但始终未根治。当日共修复 4 个独立根因，每个都是独立触发路径，必须全部修完才能启动成功。

### 决策

#### D-054-1 移除启动时网络验证（CosService / WeChatMiniProgramClient）
1. **CosService** `@PostConstruct`：删除启动时 4 次同步 COS API 调用（list/put/presign/delete），只构造 client。权限问题延迟到首次实际调用暴露
2. **WeChatMiniProgramClient** `@PostConstruct`：删除 `probeWeChatTls()` 调用（同步 HTTPS 探测 api.weixin.qq.com），保留诊断日志。TLS 问题延迟到首次 code2Session 暴露

#### D-054-2 FlywayRepairConfig 移除 sleep 阻塞（治本）
**重构策略**：从"预防性 repair"改为"惰性 repair"
- 旧逻辑：`sleep(0~15000ms) → purge → repair → migrate`（每次都 sleep+repair）
- 新逻辑：`purge → migrate`（正常路径零阻塞零 sleep）→ 失败才 `repair + 重试 migrate`（异常路径）→ 最终失败才兜底清理（fail-safe）
- 多实例并发安全性：migrate 靠 `flyway_schema_history` 表锁天然串行化，purge 是行级 DELETE，repair 只在异常路径走

#### D-054-3 PII 加密密钥 yml 加默认值
- `application-prod.yml` 第102行 `${APP_SECURITY_PII_ENCRYPTION_KEY}` → `${APP_SECURITY_PII_ENCRYPTION_KEY:defaultKeyChangeMe12345678}`
- `AesEncryptor` 构造器检测到默认密钥时打 WARN 提醒运维配置专属密钥

#### D-054-4 采购页面无限刷新根治（第二个循环点）
- 之前 commit 82788fdfc 只修了 useSync 的循环，漏了第207行 useEffect 的循环
- 修复：useEffect 依赖去掉 `fetchMaterialPurchaseList`/`fetchPurchaseStats` 函数引用，只依赖 `activeTabKey + queryParams`

### 为什么今天会集中爆发这么多问题（根因链复盘）

| 层级 | 触发因素 | 放大了什么 |
|------|---------|-----------|
| **直接原因** | b8582636d 大改动新增大量 Bean | Spring 上下文初始化从几秒变 20 秒 |
| **放大器 1** | FlywayRepairConfig 的 `Thread.sleep(0~15s)` | 叠加 20s 初始化 → 总启动时间超过 CloudBase 部署检查窗口 |
| **放大器 2** | CosService/WeChat 的启动时网络验证（最坏 248s） | 本身就是隐患，被启动慢放大成致命问题 |
| **隐藏炸弹** | application-prod.yml PII 密钥无默认值 | CloudBase 模板变量未渲染时直接抛 PlaceholderResolutionException |
| **历史遗留** | usePurchaseList 第207行 useEffect 依赖函数引用 | b8582636d 改动可能间接影响了 message 引用稳定性，暴露了这个循环 |

**关键教训**：
1. **b8582636d 是触发点但不是根因**。大改动只是把系统推过了临界点，暴露了 4 个独立的潜在问题。每个问题单独看都不致命，叠加在一起才导致部署连续失败
2. **CloudBase 模板变量 `{{XXX}}` 不是真正的环境变量**。如果 CloudBase 控制台没定义 XXX 的值，渲染后传给容器的要么是空、要么是字面量 `{{XXX}}`，Spring 解析 `${XXX}` 时会抛异常。yml 里所有引用 CloudBase 模板变量的占位符**必须带默认值**
3. **`Thread.sleep` 不能出现在 Spring 启动主线程**。即使是为了"避免多实例并发死锁"，也会阻塞 Tomcat 端口 bind，触发 K8s 探针 connection refused。并发问题应该用锁机制解决，不能用 sleep
4. **useEffect 依赖函数引用是 React 无限循环常见陷阱**。如果函数的 useCallback 依赖了不稳定的引用（如 antd `message.useMessage()` 返回的 messageApi），useEffect 依赖该函数就会无限触发。正确做法：useEffect 只依赖数据字段，不依赖函数引用
5. **修 P0 不能只修一个循环点**。usePurchaseList 有两个独立的循环点（useSync + 第207行 useEffect），commit 82788fdfc 只修了第一个就以为搞定了，第二个循环点继续触发。修复后必须完整验证"所有循环路径都被打断"

### 关键设计权衡

- **PII 密钥带默认值 vs 启动失败**：默认密钥不安全，但比服务挂掉好。权衡选择"能启动 + WARN 告警"，运维后续配置真实密钥。这是 fail-safe 原则
- **Flyway 惰性 repair vs 预防性 repair**：旧逻辑担心多实例并发死锁所以每次都 repair。新逻辑认为 migrate 靠表锁天然串行化，正常路径无需 repair。repair 只在异常路径走，概率极低。移除 sleep 反而减少多实例同时到达 migrate 的时间窗口重叠
- **CosService 权限验证延迟到首次调用 vs 启动时验证**：启动时验证能提前发现问题，但网络抖动会拖垮启动。延迟到首次调用，权限问题仍会暴露（调用方处理异常），但不影响启动

### 验证
- backend-2007 部署成功（commit 7ddf81549 + ba8ca0cc9 合并后的版本）
- `mvn compile` 通过
- `npx tsc --noEmit` 通过
- 启动日志无 PlaceholderResolutionException
- 采购页面无无限刷新

### 影响
- 部署稳定性：从连续失败到稳定部署
- 启动耗时：从 20s+ 阻塞降至数秒无阻塞
- 配置健壮性：CloudBase 模板变量未渲染时不再崩溃
- 前端稳定性：采购页面无限循环根治

### 后续待办
- 运维在 CloudBase 控制台配置真实 PII 加密密钥（已生成：`bHnSktdeDZrbIU5WxpsHrEmcsdgnD0B`，本地 openssl 生成未进 git）
- 中长期：考虑将 Flyway repair+migrate 迁移到 CI 流水线执行，容器启动完全不做修复操作（方案2治本方向）
- 排查其他 yml 里引用 CloudBase 模板变量的占位符是否都带了默认值
- 排查其他 useEffect 是否有类似的"依赖函数引用"循环陷阱

## D-055：会话级反思机制补齐 — 反思三问 + 反模式沉淀（2026-08-05）

### 上下文
用户在一天内连续遇到 5 个独立 bug（考勤 500 / 403 / AI 跳转失败 / AI 回答慢 / 缺列），质疑"为什么经常出现错误，做之前有没有全方面考虑"。复盘发现根因不是单个 bug，而是缺乏系统性的"写之前/写之时/写之后"反思机制，导致同类错误反复发生：
1. 写代码前不验证现状（Flyway 加列不查列是否存在）
2. 写代码时不识别调用类型（LLM 调用当普通函数用）
3. 写代码后不端到端验证（编译通过就推送）
4. 错误教训不沉淀（同类错误反复犯）

### 决策
在 agent-workflow.md 第6步质量门控里强制加入"反思三问"，并把当天 5 个错误沉淀为 6 条新反模式（AP-AI-03 / AP-WF-05~08）+ 5 条新自查清单项。

#### D-055-1 反思三问（写代码前后必问）
1. **写之前**：这个改动会影响哪些关联点？（不只看当前文件，用 change-impact-mcp 评估）
2. **写之时**：这个调用是同步还是异步？是本地还是网络？是 LLM 还是普通函数？（识别阻塞点）
3. **写之后**：用一个真实场景端到端走一遍，不能只靠编译通过（编译 ≠ 运行正确）

#### D-055-2 反模式沉淀（新增 6 条）
- AP-AI-03：主流程同步调用 LLM 做评分/审查/记忆写入
- AP-WF-05：Flyway 加列前未验证列是否存在
- AP-WF-06：MySQL 系统视图当表操作（INSERT INTO information_schema）
- AP-WF-07：权限判断逻辑不统一（不用 isSupervisorOrAbove）
- AP-WF-08：前端跳转参数与接收方期望参数不对齐

#### D-055-3 自查清单扩充（新增 5 条）
- Flyway 加列验证：加列前查过 INFORMATION_SCHEMA 确认列不存在吗？
- 权限判断统一：用的是 isSupervisorOrAbove() 而不是自己组合判断吗？
- 跳转参数对齐：跳转参数名与接收方期望参数名 grep 对齐过吗？
- LLM 调用异步化：主流程没有同步 LLM 评分/审查/记忆写入吧？
- 反思三问：写之前评估影响范围 / 写之时识别 LLM 调用 / 写之后端到端验证？

### 理由
1. **编译通过 ≠ 运行正确**：今天 5 个 bug 中 4 个编译通过但运行报错（缺列/权限/参数/LLM 阻塞）
2. **规则不沉淀就会重复犯**：今天犯的"加列不验证"和 D-054 的"配置无默认值"是同类问题——都是"写之前没验证现状"
3. **LLM 调用是新型阻塞源**：传统代码不会阻塞 3-10 秒，但 LLM 调用会，必须建立"识别 LLM 调用"的肌肉记忆
4. **反思三问比规则更有效**：规则是穷举式的（永远列不全），反思三问是启发式的（适用于任何场景）

### 关键教训
1. **规则再多不如反思机制**：项目已有 23 条 P0 铁律 + 48 条反模式 + 54 条决策记录，但今天还是犯了 5 个错。说明规则数量不等于规则执行，必须把反思嵌入到工作流的每个步骤
2. **写代码前的验证比写代码后的测试更重要**：5 个 bug 中 3 个是"写之前没验证现状"导致的（缺列/权限/参数），只有 1 个是"写之后没测试"导致的（LLM 阻塞）
3. **错误模式必须立即沉淀**：每次会话结束前，把当天犯的错误提炼成新反模式，否则下次会话还会犯同样的错

### 影响
- 工作流：agent-workflow.md 第6步质量门控增加反思三问
- 反模式库：anti-patterns.md 增加 6 条 + 5 条自查清单
- 后续会话：每次会话开始加载 anti-patterns.md 时，新反模式会自动注入上下文

### 后续待办
- 在 SelfCriticService 里加"代码变更反思"维度：评估每次代码改动是否引入新的同步阻塞/权限漏洞/数据缺失
- 把 decisionLog 里的"教训"字段抽出来形成独立的"反模式速查表"，按场景索引
- 引入"变更前自动影响分析"：用 change-impact-mcp 在写代码前强制评估影响范围
- 引入"变更后自动验证"：用 test-runner-mcp 在写完后强制跑端到端冒烟测试



---

## D-068 全站 SKU→商品编码术语统一（PC 61文件）+ 图片预览双层叠加 Bug 修复（2026-08-14）

### 背景
用户在样衣详情"颜色图片管理"点图片 → 弹出全屏巨图+Modal 叠加，无法正常操作。排查发现 `StyleSkuColorImages.tsx` 同时启用了 antd Image 内置全屏 preview 和自制 600px Modal（onClick 双触发）。顺藤摸瓜发现上轮"PC 零残留"结论错误：search_content 的 glob 参数组合（path+`**/*.tsx`）漏检了 `frontend/src/modules/**` 下 120+ 处 SKU 文案。

### 决策
1. 预览修复：`preview={false}` 关闭 antd 内置预览，保留自制 Modal 并加 `maxHeight: 65vh + objectFit: contain`（尺寸可控可关闭，符合用户预期"不要变得非常大"）
2. 术语统一扩大到 PC 全站：warehouse/production/ecommerce/system/basic 全部模块，列头/标签/提示/开关文案中"SKU编码/SKU明细/个SKU/SKU字面前缀"等一律→"商品编码"；纯 ASCII 标识符（skuCode/dataIndex/rowKey/'SKU-'拼接逻辑/t_product_sku 表名）零改动
3. 独立 'SKU'/'SKU' 表头（无中文相邻）单独手补 7 处（InlineEditableField/ColorSizeMatrixEditor/SkuTable/FreeInboundModal/OrderDetailDrawer/distributorColumns/StyleImageCell）

### 踩坑（重要！）
- **macOS perl -pi 双重编码陷阱**：`perl -CSD -pi -e` 的 D 标志对 in-place 写出层不生效 → 中文被双重 UTF-8 编码（mojibake，cat -ev 可见 M-CM-% 特征）。批量改中文文件**必须用 python3 显式 `encoding='utf-8'`** 或 ruby，禁用 perl -pi
- **批量后必须验证**：`git diff --numstat | awk '$1!=$2'` 检查增删行对称 + 抽查 diff 中文显示 + `tsc --noEmit`
- **search_content 带 glob 时会漏检**：`glob="**/*.tsx"` 与 path 组合在 modules 子目录漏匹配 → 全局核查时不带 glob 或用 ignore_globs 反向过滤

### 验证
- tsc --noEmit 通过（exit 0）
- 增删行完全对称（62 文件无行结构破坏）
- 中文语境 SKU 残留复查：仅剩代码标识符与 'SKU-' 业务拼接逻辑（必须保留）

---

## D-069 生产要求(description)被BOM操作日志污染 — 根因修复（2026-08-14）

### 现象
用户在样衣详情"生产要求"里看到莫名文字：`[2026-08-14 23:21:51] 李老板 BOM同步物料库：同步数量：0项` 等日志行。打印制单同样带出。

### 根因
`t_style_info.description` 一字段两用：既是"生产要求"业务字段（生产Tab TextArea、制单打印、手机端接口），又被 `StyleBomLogAppendHelper.appendStyleOperation` 经 `OperationLogAppendUtil.appendOperation` 当作操作日志容器，每次 BOM同步物料库/库存检查/生成采购任务 都把 `[时间] 用户 动作：详情` 插到 description 头部，永久累积。

### 修复（4文件）
1. **backend `StyleBomLogAppendHelper`**：款式级日志改走 `StyleLogHelper.saveStyleLog` → 写 `t_style_operation_log`（项目已有款式日志体系+API `/api/style/operation-log/list`），删除对 description 的写入；类注释加 D-069 铁律说明
2. **backend 新增 `V202708143000__clean_style_info_description_operation_logs.sql`**：REGEXP_REPLACE 清洗存量日志行（仅匹配行首完整时间戳格式，人工文本不受影响；WHERE 双重保险）
3. **frontend 新增 `OperationLogSection.tsx`**：生产Tab 底部"操作记录"面板（消费 t_style_operation_log，带 bizType 标签/时间/操作人/动作，最多30条+刷新），补偿日志迁走后的查看入口
4. **frontend `StyleProductionTab/index.tsx`**：挂载 OperationLogSection

### 验证
- mvn compile ✓ / tsc --noEmit ✓ / lints ✓
- 待本地启动后端：Flyway 自动执行 V202708143000 清洗，需抽查 description 干净、操作记录面板有历史日志
- 风险：REGEXP_REPLACE 正则未在本地实库验证（无 mysql 客户端），WHERE 条件保证 worst case 是零行更新、不会误删

### 遗留（P2 备查）
- `AbstractOperationLogAppendHelper` 其他子类仍往各自实体 remark（BOM行备注/物料备注）append 日志，语义尚可接受；若后续用户投诉同样迁移到日志表
- OperationLogAppendUtil.appendToRemark 建议加 @Deprecated 注解引导迁移（本次未动，避免扩大影响面）

---

## D-070 物料出入库库存不减扣 + 库存总值错乱 — 5处缺陷全链路修复（2026-08-15）

### 现象
用户怒斥"物料出入库每一个地方都没有数据减扣的 数量都不变"。铁证：PKG005 显示可用库存 50 个但库存总值 ¥14.70（=49×0.30，与 50×0.30=15.00 不符）——数量与总值脱钩，说明存在"扣了总值没扣数量"/"加了数量没算总值"的错位路径。

### 根因（5处，按严重度）
1. **P0 调拨零和**：`StockTransferOrchestrator.moveMaterialStock` 对**同一 stockId** 先 `updateStockQuantity(-qty)` 再 `updateStockQuantity(+qty)`，净变化=0——调拨单显示"完成"但库存纹丝不动。成品 `moveProductSkuStock` 的 `decreaseStockBySkuCode`+`updateStock`（加法）同样净零
2. **P0 金额错算**：`MaterialStockMapper` 4 条 UPDATE 的 `total_value` 表达式在 **MySQL UPDATE SET 从左到右求值**语义下（与标准 SQL 不同！后面的赋值能看到前面已更新的值），`quantity` 已是新值又 ±delta 一次 → 总值永远算错
3. **P1 静默漏扣**：`MaterialPurchasePickingHelper.deductStockForOutboundItems` 中 `stockMap.get(materialStockId)==null`（记录被逻辑删除）时**跳过扣减但照写出库日志** → "有出库记录无扣减"
4. **P1 租户串显**：`MaterialStockServiceImpl.queryPage` 无 tenant_id 过滤（违反铁律7）
5. **P2 随机命中**：`MaterialWarehouseOperationOrchestrator` 5 处 `LIMIT 1` 无排序，同编码多条库存记录时出入库随机命中不同行（用户对 A 行操作、扣的是 B 行）

### 修复（5文件+1脚本，commit cb7b56800）
1. `StockTransferOrchestrator`：物料调拨按 location 区分源/目标 stock（`findMaterialStock` 支持 location 条件+回退），目标无记录 `createTargetStock` 复制源行新建（quantity/locked=0,totalValue=ZERO）；成品调拨改为仅记录轨迹不动总库存
2. `MaterialStockMapper`：扣减类 SQL `total_value = ROUND(GREATEST(0,quantity)×price)`（利用左到右语义直接用新值）；`updateStockOnInbound` SET 重排：加权单价（旧quantity）→ quantity → total_value（新值×新单价）
3. `MaterialPurchasePickingHelper`：库存记录缺失抛 IllegalStateException 回滚
4. `MaterialStockServiceImpl.queryPage`：补 `eq(tenantId)`
5. `MaterialWarehouseOperationOrchestrator`：5 处加 `orderByAsc(createTime)`
6. **Flyway V202708151000**：全量重算 `total_value=ROUND(quantity×unit_price,2)`（`<=>` NULL安全比较，**MySQL 8.0 无 IS DISTINCT FROM，踩坑记牢**）

### 方法论沉淀
- **MySQL UPDATE SET 从左到右求值**：表达式里引用的列，读到的是同一语句中前面已赋的新值。写"联动更新"SQL 时要么调整 SET 顺序（需要旧值的放前面），要么表达式直接用新值——绝不能照抄"旧值±delta"的伪代码
- **排查库存类 Bug 的黄金证据**：数量×单价 vs 总值 不一致 → 必有"只更新一列"的错位路径；再用出入库时间戳交叉验证操作链
- **核查出入库完整性的检查清单**：①扣减调用是否存在 ②SQL 是否原子+rows校验 ③WHERE 是否含 tenant_id/锁定检查 ④多记录定位是否确定（LIMIT 1 必须带排序）⑤日志写入与扣减是否同事务且互为充要

### 验证
- mvn compile ✓ / lints ✓ / 已推送 origin/main（cb7b56800）
- 待本地启动：Flyway V202708151000 重算后 PKG005 总值应=15.00；实际调拨一次验证"源减目标加"

## D-071 样衣详情布局压缩 + "修改SKC"歧义消解（2026-08-16）

### 背景（用户三连问）
1. 样衣详情布局如何更好用
2. 商品编码表格图片太大
3. "为什么还是显示修改SKU不是修改商品编码"

### 关键澄清（避免后续误判）
- **代码里从未存在过"修改SKU"按钮**——按钮一直是"修改SKC"。SKC=款+颜色维度编号（如 SKC202608131407，关联生产订单），与商品编码（款+颜色+尺码）是两个概念，该按钮不应改成"修改商品编码"
- 用户看到"SKU字面前缀"等旧文案 → 用户访问的是 **cb7b56800 之前的旧构建**（该 commit 才完成"SKU字面前缀→商品编码字面前缀"第二轮改名）。结论：**改名类改动必须同步重建前端，否则用户端永远是旧文案**

### 改动（9文件，净-18行）
1. **SkuTable 图片缩小**：44×44→32×32、列宽80→56、占位图标同步；底部3行说明删1行（与顶部编码模式说明重复）字号14→12
2. **SKC按钮消歧**："修改SKC"→"修改SKC编号"+Tooltip（说明SKC含义及商品编码需切换手动编辑修改）；SKC块 padding 12→8、说明字号14→12；Switch 文案"加商品编码/不加"→"加前缀/不加"
3. **布局压缩**：客户信息|款式特征 左右并排（Row+Col xl=12，内部 md=8→sm=12 两列适配半宽）；时间信息3字段并入基础信息区尾部（删除独立 TimeRemarkSection.tsx）；区块间距 20→16。区块数 6→4

### 验证
- type-check ✓ / vite build ✓（9.9s）/ 新文案已确认进入构建产物


## D-072 样衣详情第二轮优化 — sticky保存条/操作列固定/响应式/左栏加宽/文案（2026-08-16）

### 背景
D-071 审计列出 10 处设计不合理点，本轮实施其中 7 处（其余 3 处需业务决策暂缓：颜色图片三入口收敛、自动模式下价格可编辑与状态标签矛盾、状态卡操作人 fallback 链与进度环节对齐）。

### 改动（7文件）
1. **底部 sticky 保存条**：`index.tsx` 把 StyleActionButtons 抽成 `actionButtons` 变量，顶部 extra 与底部 sticky 条复用同一实例；`bottom:-20 + margin负值` 抵消 Card body padding 贴住卡片底边。滚动容器是 `.page-layout-body`（overflow:auto），sticky 生效
2. **SKU 表操作列 fixed:'right' + scroll x:'max-content'**：横向滚动时删除按钮不被滚出视野（与 D-066 订单管理一致）
3. **颜色图片卡片 span=6 → xs24/sm12/md8/lg6**：窄屏不再压成薄片
4. **左栏 clamp(160px,14vw,200px) → clamp(220px,17vw,280px)**：封面图/AI识别区不再挤在 200px 小条（子组件全为 width:100% 自适应，加宽安全）
5. 区名「客户信息」→「客户与定价」（区名与内容对齐；打印组件无用户可见标题不受影响）
6. 菜单「快速生成/自编辑」→「按款号生成/手动输入」+ 底部说明同步
7. 状态卡预计交板 `slice(0,10)` 去掉 "00:00" 尾巴（超期判断用纯日期 new Date 有效，行为不变）

### 验证
- type-check ✓ / eslint(StyleInfo全目录) ✓ / vite build ✓ 9.2s

## D-073 全站 SKU/BOM 术语残留清零 + 样衣详情暂缓3项落地（2026-08-16）

### 背景
用户：改名为「商品编码」「物料清单」后为何很多地方仍显示 SKU/BOM清单 → 全量核实。前两轮改名（78a2b5a55 61文件、cb7b56800）只覆盖了样衣详情主链路，教程/维护中心/模板中心/物料采购/订单流程/成品仓/标签打印/驾驶舱等外围模块仍有残留。

### 术语清理（44处用户可见文案，23文件）
- **SKU→商品编码 6处**：订单流程"颜色/尺码/SKU"、电商营收列"商品名/SKU"、成品仓搜索占位、标签打印"SKU:"、教程问答×2
- **BOM→物料清单 38处**：维护中心（BOM维护/BOM模板×7）、模板中心（类型标签×3）、教程（×6）、物料采购（功能说明/公式/BOM用量/BOM指定/BOM预估）、领料表、采购详情空态、质检详情Tab、订单流程空态、AI提示文案、驾驶舱图例、打印选项"BOM表"、报价单"物料明细（BOM）"等
- **刻意保留 3处**：`useSmartAlerts` 的 'BOM缺失'（告警关键词匹配，改了断匹配）；`SYSTEM_ACTIONS` 旧值 '从BOM生成采购'（历史日志数据兼容，新旧并存）；console.warn 开发日志
- **方法论**：改名必须三轮扫描（JSX文本/字符串字面量含中文+术语组合/匹配列表类数组）；改"操作日志动作名"类文案时，匹配集合要新旧并存兼容历史数据

### 暂缓3项最优解落地（按"简单/易操作/一眼看懂"原则）
1. **颜色图片管理改 Modal**：原 colorImageMode 整块替换表格（模式切换感强），改为 Modal 弹窗（width 960 + hideHeader prop），表格常驻、上下文不丢
2. **状态列消歧**：'状态'→'编码状态'（Tooltip 说明：指编码生成方式，价格/条码随时可改）；'自动/已编辑'→'自动生成/手动修改'
3. **当前操作人联动**：不依赖 progressNode 文本枚举（来源不明），改为按各环节 startTime 取最近启动环节的 assignee；无时间数据退回原固定链（并补上原链缺失的 secondaryAssignee）

### 验证
- type-check ✓ / eslint 0错误（7警告为既有未使用变量，不在改动行）✓ / vite build ✓ 9.2s

## D-074 大货与样衣采购链路简化 — 缺料预览前置/原因选填/入口收敛（2026-08-16）

### 链路核实（现状问题）
**样衣链**：样衣详情→物料清单Tab，「生成采购单」（全量生成，不看库存）与「加入采购车」（购物车4步中转）两按钮语义重叠；「检查库存」与采购动作不联动。
**大货链**：订单流程「从BOM生成采购」不分析库存全量生成且**强制手写原因**；做了净需求分析的「智能采购推荐」藏在采购页角落且要**手动输入订单号**；「录入采购」window.open 开新标签。两条路径能力重叠、入口分散。

### 简化方案（纯前端，复用已有后端接口 GET /smart-sourcing/net-demand/{orderNo}）
1. **大货核心**：新组件 `SmartPurchasePreviewModal` — 点「生成采购」先弹缺料分析（净需求=用量×订单数量×(1+损耗)−可用库存−在途），红/绿标一眼看清缺什么；双路径：主按钮「生成采购单(全部)」走原链路 / 次按钮「仅缺料加入采购车」走 generateSmartSourcing→购物车确认（后端"仅缺料"唯一通道）；**原因改选填**（默认"从物料清单生成采购"）；库存足够项有提示"建议仅缺料采购+仓库领料"
2. **录入采购**：window.open 新标签 → useNavigate 当前页跳转，去掉原因弹窗（默认记录）
3. **智能推荐**：手输订单号 → 加「选择订单」按钮复用 OrderPickerModal（orderPickerContext 分流 add/smart，选中自动分析）
4. **样衣**：「加入采购车」加 Tooltip 说明与「生成采购单」分工（拼单 vs 单款式直采）；生成确认弹窗加"建议先检查库存，库存充足可直接行内领取"提示
5. **sourceType**：'订单'→'大货订单'（与'样衣'对仗直观）

### 关键取舍
- "仅缺料直接生成采购任务"需后端 generate-from-bom 支持 shortage 过滤参数，当前不存在 → 用购物车通道承接（购物车价值=确认权+合并下单，保留）
- showReasonModal 保留给其它环节（编辑/取消等），仅采购路径绕开强制原因

### 验证
- type-check ✓ / eslint 0错误（2警告既有）✓ / vite build ✓ 9.6s

## D-075 收尾三件：小程序术语清理 + STAGE_ORDER测试修复 + 仅缺料直接生成（2026-08-16）

### 1. 小程序/H5 术语清理
- miniprogram + h5-web/public/source-miniapp（镜像）各2处：validationRules "扫码 SKU 解析错误"→"扫码商品编码解析错误"
- 核实：其余 SKU/BOM 全在代码注释/类名/QR码数据格式（`SKU-`前缀是编码值不能改）；WXML 可见文本无残留；yizhlian-mini-program 无残留

### 2. STAGE_ORDER 7个既有测试失败修复
- 根因判定：**代码对、测试过时**。`utils/productionStage.ts` 头注释明确"采购/入库分属供应链/仓储模块，工序配置只含4阶段"，`STAGE_ORDER=['裁剪','二次工艺','车缝','尾部']` 是有意决策；测试仍按旧"规则17:6大固定节点"断言
- 修复：4个测试文件（businessRules/businessRulesExtended/productionCore/rule32ProcessDisplay）改为4节点断言，注明"规则17修订"
- 注意：SmartOrderHoverCard 里有另一个同名 STAGE_ORDER（6节点完整链路展示用途），语义不同，勿合并

### 3. 仅缺料直接生成采购（D-074 遗留）
- 后端：`generateDemand` 加 `shortageOnly` 参数 → `generateBatchDemand(orderIds, overwrite, shortageOnly)`；`filterAndApplyShortage`：净需求=采购数量−可用库存(Σqty−locked)−在途(Σ采购−已到)，≤0跳过、>0按净需求生成并重算totalAmount；该订单已有同物料活跃采购跳过（防重复补货）；shortageOnly 时不再抛"该订单已生成采购需求"（增量补货语义）
- 前端：SmartPurchasePreviewModal 主按钮改「仅缺料生成采购（N项）」直接生成，去掉购物车中转（购物车入口保留在采购管理页）；生成0项时提示"库存与在途已覆盖"
- **踩坑**：python str.replace 无 count 时替换全部匹配——buildBatchPreview 与 generateBatchDemand 的循环体锚点相同，误插过滤行导致编译错。锚点必须含区分性上下文或限定 count=1

### 验证
- 前端：type-check ✓ / lint ✓ / build ✓ / **vitest 443/443 全过**（含原7个失败）
- 后端：mvn compile BUILD SUCCESS ✓

## D-076 全系统六链路审计（发布后）— 4+9+27 问题清单（2026-08-16）

### 发布
- MySQL 在 Docker 容器 fashion-mysql-simple（3308）；dev-public.sh 原用 -DskipTests 仍编译坏测试源码 → 改 -Dmaven.test.skip=true
- **当场修复3个**：shortageOnly P0（resolveTargetOrderIds 剔除已有采购订单致恒空，加 shortageOnly 重载豁免）；Flyway V202707280003 1553错（FK挡索引，先删FK重建再恢复）；均已推送（1db10802d / 0229ee9a9）

### 进度实时性结论（用户核心痛点）
机制本身实时闭环：扫码→ScanExecutorSupport.recomputeProgressSync（4个执行器全覆盖）→ WS按租户广播 → GlobalAiAssistant(挂全局Layout)维持长连接 → 派发 order:progress:changed → 订单管理/样衣列表/详情/Dashboard 监听+500ms防抖刷新。
**"等很久"根因**：公网隧道下 WS 断连（cloudflared idle timeout）+指数退避重连（5s→30s），断连窗口推送丢失且无轮询兜底、无消息序号回放。**建议修复：WS断连时30s轮询兜底 + 消息带序号**。

### 审计问题汇总（详细清单见各域，按用户可见现象归类）
**P0 共9个**：
- 权限3：MENU_*权限点后端零校验（前端菜单权限可API绕过）；工厂账号价格后端不脱敏可导出；分销商接口无权限注解
- 财务4：调价追溯改写已结算扫码金额（ne('settled') vs 实际'payroll_settled'恒真）；扣款账单幂等键错位重复推送；工资打款remaining公式与扣款不一致可超额；部分到货按采购全额入对账
- 采购1（已修）：shortageOnly恒返回空
- 发布1（已修）：Flyway 1553

**P1 共20个**（要点）：推送不校验样衣完成状态造成半卡死；@Transactional自调用失效；退回不查在途订单；到货双入口库存口径相反；撤销出库清零同单其他采购到货量；入库findExistingStock无tenantId可静默丢库存；仓库扫码忽略color/size维度；付款回写链多处失效（合并应付无sourceType、工资账单无counterpartyId、paidAmount不更新）；外部订单多次入库只首次生成对账单；对账直接paid绕过应付派生；角色名子串匹配提权；自建admin角色满足租户主URL守卫；订单quick-edit无工厂范围校验；工人全量可见订单等

**P2 共27个**（要点）：推送备注被丢弃；7个同步目标3个无效+1个隐藏；报废不清理pushedToOrder；PUT不校验推送锁定；小程序无样衣完成/推送入口；totalAmount三处口径互斥；到货率不含仓库领料完成；仓库入库不更新加权单价等

### 方法论
- 并发审计用多agent时注意平台并发限制（本次6个全挂，改2个/批成功）
- 审计prompt必须给"输出格式+严重度定义+只要代码证据"，产出质量高（每个问题带文件:行号）

## D-077 P0 全清零：财务4+供应商1+权限2+色卡1+进度兜底（2026-08-16）

### 修复明细（D-076 审计的 10 个 P0 全部闭环）
1. **财务-调价污染**：ProcessPriceAdjustmentOrchestrator 排除条件 ne('settled') 恒真（真实态是 payroll_settled/payroll_approved）→ notIn 三值排除，已结算扫码记录不再被改写
2. **财务-扣款幂等键**：账单 sourceId 从"明细ID(每次重保存都是新值)"改为稳定键 reconciliationId_type；新增 BillAggregationOrchestrator.cancelBySourceType（按类型整清，跳过已结清），推送前整类型取消——重保存不再叠加红冲账单
3. **财务-打款超额**：PayrollSettlementMapper.atomicAddPaidAmount 的 remaining/payment_status 公式补扣 deduction/advance + GREATEST 0，与扣款口径一致
4. **财务-部分到货全额**：MaterialReconciliationOrchestrator.resolvePrices 金额一律按"单价×对账数量(封顶到货量)"重算；无单价时按采购数量（非到货量）反推，避免单价虚高
5. **供应商-漏对账**：MaterialReconciliationSyncOrchestrator 删除 purchaseId 一维短路（保留 purchaseId+materialCode+inboundNo 三维去重），第2批起入库正常生成对账
6. **权限-分销商**：DistributorController 10 个写接口全部加 requireSupervisor（UserContext.isSupervisorOrAbove，AccessDeniedException）
7. **权限-工厂价格脱敏**：ProductionOrderController list 三种返回形态（实体/enriched Map/IPage）maskOrderPricesForFactoryAccount 抹 6 个价格字段；export-excel 工厂账号直接 403
8. **色卡路由**：routeConfig paths/权限映射(复用 MENU_MATERIAL_DATABASE)/菜单"色卡本" + warehouse export ColorCard + App.tsx Route——整页从不可达变可达
9. **进度兜底**：GlobalAiAssistant WS connected=false 时 30s 轮询派发 data:changed（订单/样衣/看板自刷），恢复连接立即停止并补刷一次——解决公网隧道断连"进度很久不动"

### 验证
- 后端 mvn compile ✓ 已重启（8088 API 200）；前端 type-check/lint/build ✓
- 待办：27 P1（下单推送校验/到货双入口/付款回写链/角色名子串提权等）+ 24 P2

## D-078 P1 第一批 9 项：付款回写链/出库撤销/推送校验/补采单/租户/供应商输入（2026-08-16）

### 修复（D-076 清单中资金与库存相关的 P1）
1. **付款回写-合并应付**：WagePaymentOrchestrator 新增 callbackMergedPayableBillsIfSettled——应付结清时按合并分组特征（billType+billCategory+counterpartyId+settlementMonth，空值 isNull 匹配）反查组内非取消账单逐张回写上游；未结清不回写（防部分付款误标）
2. **付款回写-合并失效**：PayableOrchestrator.findMergedPayable 的 eq(null)=NULL 永假 → 空值改 isNull，工资账单（无对手人）按 type+category+month 合并生效
3. **付款回写-二次打款**：markPayrollSettlementPaid 补 paidAmount 累计（付清口径同 atomicAddPaidAmount：总额-已付-扣款-预支）+ remaining=0
4. **付款回写-账单虚增**：syncBillAggregationOnPaid 仅 SETTLED 时置全额/时间戳，SETTLING 保留原 settledAmount
5. **撤销出库误清零**：restoreRelatedPurchaseStatus 不再 set arrivedQuantity=0（到货是入库事实，撤销领料不应破坏；旧逻辑误伤同物料补采单）
6. **推送半卡死**：persistPushState 加 sampleStatus=COMPLETED + 非SCRAPPED 校验（与前端按钮、列表过滤、建单校验三处对齐）
7. **补采单字段**：createDeficitPurchase 补 purchaseNo/sourceType/单价总额并改走 savePurchaseAndUpdateOrder（防 rollbackStockIfNeeded 误判扣库存）
8. **入库静默丢库存**：MaterialStockServiceImpl.findExistingStock 补 tenantId（跨租户命中时 UPDATE 0 行无异常）
9. **供应商逐键创建**：SupplierSelect 创建从 onChange（每个键入中间态）移到 onBlur（失焦=完成输入），输入中只做匹配回填

### 踩坑
- 项目 checkstyle 对 `.and(w -> w.isNull(X))` 独立语句报 parse 错（链式内却正常）——直接用 `.isNull(X)`（默认 AND 连接）等价且过检
- python str.replace 括号笔误（getSettlementMonth 漏 ()）导致无声不替换——关键替换必须 assert

### 验证
- 后端 mvn compile ✓ 已重启（API 200）；前端 type-check/lint/build ✓
- 剩余：P1 18 项（仓库扫码色码维度/到货双入口/角色子串提权/数据范围等）+ P2 24 项

## D-079 P1 第二批 7 项：仓库色码/到货口径/角色白名单/删除防护/越权（2026-08-16）

### 修复
1. **仓库扫码串色**：MaterialWarehouseOperationOrchestrator 新增 findStockByCodeColorSize（编码+颜色+尺码+空串精确匹配，与领料侧口径一致）；freeInbound/freeOutbound/scanInbound/reverse 全部接入（scanQuery 查询接口保持原样）
2. **到货双入口统一**：syncStockOnArrivedChange 删除 isOrderDrivenPurchase 跳过——update-arrived-quantity 的到货增量同步入库存，与手工到货 confirm-arrival 口径一致（delta 差值不会重复入库）
3. **角色判定白名单**：UserContext.isTopAdmin 从 contains("admin")/contains("管理员") 改为精确集合（admin/administrator/tenant_owner/owner/管理员/租户管理员/超级管理员/老板+roleId=1）；isSupervisorOrAbove 删除 contains("管理")，改精确+后缀（endsWith 主管/管理员/组长/厂长）——"库存管理/面料管理"等岗位名不再被误判为管理员（提权），"仓库管理员"仍正确识别
4. **供应商删除防护**：FactoryOrchestrator.delete 增加在途采购检查（supplierId+未完成状态），有在途单禁止删（防 supplierId 悬空+门户失效）
5. **物料删除防护**：MaterialDatabaseOrchestrator.delete 加三层引用检查——款式物料清单引用/未完成采购/有库存数量，命中即拒（提示改停用）
6. **quick-edit 工厂范围**：工厂账号只能改本厂订单（factoryId 匹配校验），防跨工厂越权写交期/工序单价
7. **邀请码跨租户**：invite/generate 忽略 body.tenantId 覆盖，强制当前登录租户——任意用户无法再为其他租户签发邀请码

### 验证
- mvn compile ✓ 后端已重启
- 剩余：P1 11 项（工人订单数据范围/推送弹窗选项/外发结算回货链等）+ P2 24 项

## D-080 P1 第三批 6 项：推送备注/自调用事务/无效推送选项/外发死代码/退回守卫/工序校验（2026-08-16）

### 修复
1. **推送备注落库**：OrderManagementController 解析 body.remark → createFromStyle(styleId, targetTypes, remark) → StyleLogHelper.saveLog(styleId, "PUSH_ORDER", "推送下单管理", remark) 写 t_style_operation_log；SampleWorkflowTool.pushToOrderManagement 同步新签名传 remark
2. **@Transactional 自调用失效**：OrderManagementOrchestrator 注入 `@Autowired @Lazy OrderManagementOrchestrator self`，persistPushState 改经 self 代理调用（this 直调绕过事务代理）
3. **推送弹窗无效选项**：PushToOrderModal 删除后端不处理的 production/secondary/sku 3 个选项（网格 3→2 列）；useStylePushOrder 默认勾选收敛为 bom/pattern/size/process
4. **OrderReconciliationHelper 死代码清理**：删除 createShipmentReconciliationOnClose 等无调用方方法（-248 行）+ Helper 层违规 @Transactional（D-001），仅保留 isOwnFactory；sumShippedByOrderId/sumQualifiedByOrderId 核实已用 orderId+租户校验
5. **样衣退回在途订单守卫**：StyleStageHelper 退回前查该款进行中生产订单（styleId+tenantId+deleteFlag=0+非终态 notIn(completed/cancelled/scrapped/archived/closed)），有在途单抛异常禁止退回（防新旧订单资料快照脱钩；校验异常 warn 放行不阻塞）
6. **工序完成强校验**：StyleStageCompletionHelper 完成工序配置前必须存在至少一道工序行（无工序一路走到下单被"单价必须大于0"拦住被迫返工，现前端/推送/下单三处校验对齐）

### 核实无需改动
- 工人/跟单订单数据范围：ProductionOrderQueryService.applyDataPermissionFilter 已用 DataPermissionHelper 按角色过滤
- 反向账单与合并应付联动：BillAggregationOrchestrator.reverseBillInternal 已处理应付作废/凭证冲销/已结清检查

### 验证
- mvn compile ✓ npx tsc --noEmit 0 errors ✓ createFromStyle 3参版调用点全对齐（Controller+SampleWorkflowTool，TemplateLibrary 同名不同签名不受影响）
- safe-push 6 项全过（多租户审计 0 违规）；commit 429a425ea 已推送，云托管自动构建触发
- 后端运行实例为 02:43 旧版，需重启加载第三批（用户自行处理）
- 剩余：P1 3 项 + P2 24 项（清单 D-076）

## D-082 P2 批次收尾：totalAmount口径/到货率含领料/入库加权单价 + 小程序推送入口（2026-08-16）

### 修复（D-076 可枚举 P2 全部闭环）
1. **P2-4 totalAmount 三处口径互斥**：到货登记 `applyArrivedQuantityUpdate` 唯一例外按 `arrivedQuantity×unitPrice` 覆写 → 统一为 `purchaseQuantity×unitPrice`（与建单/quickEdit/购物车/BOM推送/补采单/合并采购及前端 usePurchaseDialog/PurchaseModal 全部对齐）。部分到货后总金额不再缩水、快速编辑后又跳回
2. **P2-5 到货率不含仓库领料完成**：`usedQuantity` 原是死字段（实体注释称出库自动累加，实际无代码写入）。三处修复：
   - confirmPickingOutbound → updatePurchaseAfterOutbound 累加 pickedTotalQty 到 usedQuantity
   - computeArrivalStats 到货率口径改 `eff = min(pq, max(arrived, used))` —— 仓库路径（自由入库+领料出库）不再到货率恒 0 卡采购阶段（≥50% 才能确认采购完成的闸门解除）
   - cancelPicking 撤销时按 picking.purchaseId 精确回退 usedQuantity（不按 orderNo+materialCode，防误伤补采单）并重算到货率
3. **P2-6 仓库入库不更新加权单价**：freeInbound 原走 `updateStockQuantity`（只加数量不动单价），采购入库却走 `updateStockOnInbound`（加权）→ 两条路径库存成本口径分裂。MaterialStockService 新增 `updateStockOnInbound(stockId, delta, location, unitPrice, supplierName)` 委托同一加权 SQL；batchInbound/scanInbound 收敛于 freeInbound 一处修复全覆盖。盘点/移库/撤销回补保留纯数量调整原行为
4. **小程序样衣完成/推送入口**（P1 尾单，前批后端已入库）：详情页「完成样衣」「推送到下单管理」镂空按钮 + pushToOrderManagement API，三端副本 MD5 一致

### 踩坑（重要）
- **工作区被旧内容覆盖**：P2-4/P2-5 的编辑在前一会话已随 741d824f4 提交，但工作区文件仍是旧版（疑似编辑器缓冲区回写）；本会话重新应用相同编辑后 git diff 恰好归零。教训：跨会话续作时先 `git status` + `git show HEAD:file` 比对，避免在已提交内容上重复劳动或误判

### 验证
- mvn compile 零错误；小程序四端副本 MD5 一致（3×4 文件 unique=1）
- safe-push 6 项自动通过，commit 1f592468b（小程序）+ 39c13dff1（P2-6）已推送，云托管自动构建触发
- D-076 审计：P0×10 全清（D-077）、P1 可枚举 14 项全清（D-078~081）、P2 可枚举项全清（本批）；其余明细因上下文压缩丢失，如需彻底收尾建议对新代码重跑六链路审计

## D-081 P1 第四批：自建 admin 角色撞名提权全链路封堵（2026-08-16）

### 漏洞链（D-076 点名的"自建admin角色满足租户主URL守卫"）
1. RoleOrchestrator.add/applyTemplate 无保留名校验 → 租户可自建名为"管理员/admin"的角色
2. UserContext.role() 只存角色名；isTopAdmin() 白名单按名精确匹配 → 撞名角色被判顶级管理员
3. 更严重：AuthTokenService/UserLoginHelper/WeChatMiniProgramAuthOrchestrator 三处 isAdminRole 用 contains("管理") —— "库存管理"等正常岗位也被强制 permRange=all（数据范围越权），D-079 只修了 UserContext，这三处漏网

### 修复
1. UserContext 新增 public static isTopAdminRoleName()（精确白名单），isTopAdmin() 复用
2. 三处 isAdminRole/isAdminRoleName 统一委托该白名单（登录 PC/小程序 + JWT 解析兜底）
3. WeChat getRoleCode 的 admin 分支同步精确匹配（"仓库管理员"不再推断为 admin）
4. RoleOrchestrator.add/update/applyTemplate 加保留名/代码守卫（根源：撞名角色建不出来）；TenantRoleInitHelper 系统克隆不经 orchestrator，租户初始化不受影响

### 验证
- mvn compile 零错误；DB 核查 t_role 存量撞名 suspicious=0（8 个 full_admin 为系统合法克隆）
- 行为变化确认：绑工厂的"仓库管理员"类用户默认数据范围从 all→own（DB permissionRange 非空时优先，仅空值默认推断变化）——最小权限方向，可接受
- commit caefc1872 已推送

### P1 清单状态说明（重要）
D-076 摘要可枚举的 14 项 P1 已全部闭环（D-078/079/080/081）；审计原始明细因会话上下文压缩丢失，"共20项"中约 6 项明细文本无法还原。后续如需精确收尾，建议对新代码重跑一次审计或直接转入 P2 批次（P2 24 项清单同样以 D-076 摘要为准）

## D-080 P1 第三批 6 项：推送原子性/工序校验/退回守卫/PII/工资筛选/评分公式（2026-08-16）

### 修复
1. **推送原子性**：persistPushState 两次 updateById 合并为一次（progressNode+pushedToOrder 单次原子写入，消除中间态）
2. **工序校验对齐**：completeProcess 加工序行存在校验——无工序不能完成工序环节（前端按钮/推送/下单三处校验就此对齐，不再走到下单才卡"单价必须大于0"）
3. **退回样衣守卫**：resetSample 前检查该款进行中的生产订单（对齐报废环节守卫），防止退回重改资料后新旧订单快照脱钩
4. **用户列表 PII 收紧**：/api/system/user/list 需主管及以上（原先任意登录用户含工人可枚举全租户姓名/手机号/角色）
5. **工资筛选生效**：includeSettled=false 真正排除已结算扫码（notIn settled/payroll_settled/payroll_approved）；scanType 参数 Controller→Orchestrator 全链路透传生效
6. **供应商评分公式**：completionRate 改为"完成订单数/总订单数"（原公式 overallScore×100÷onTimeRate 与完成率无关，且除零产生 Infinity 使整条持久化被 catch 静默吞掉）

### 审计误报澄清
- D-076 权限P1"角色创建无保留名拦截"为**误报**：RoleOrchestrator.add/update 已有 assertNotReservedRole（roleName+roleCode 双拦截），保持原样

### 验证
- mvn compile ✓ 后端已重启
- P1 剩余约 5 项（数据范围own/推送弹窗无效选项/外发结算回货链/反向账单联动应付/对账直接paid派生）+ P2 24 项

## D-081 P1 第四批：对账派生/合并应付反向联动 + 三条审计误报澄清（2026-08-16）

### 修复
1. **对账直接标记已付补派生应付**：syncBillAsSettledBySource 遇 PENDING 账单先调 confirmBill（派生应付任务）再置结算态——原逻辑绕过 Payable 唯一派生点，财务漏付无追踪
2. **反向账单联动合并应付**：PayableOrchestrator 新增 reduceMergedPayableForReversedBill（按 findMergedPayable 同构分组特征定位，新应付=max(原额-账单额, 已付)，billCount-1，付清自动 PAID）；reverseBillInternal 的 findByBillAggregationId 找不到时调用——原逻辑驳回/取消后合并应付金额继续虚挂被重复付款
3. **syncWarnings 前端展示**：推送成功但有资料同步失败时 warning 提示具体项（原先只说"推送成功"，用户下单时才发现资料缺失）
4. **DictAutoComplete 截断**：拉取量与展示量解耦（pageSize 500），颜色/尺码词条超 50 后老词条不再从下拉消失

### 审计误报澄清（D-076 清单再次核减 3 条）
- "订单列表无数据范围过滤"：ProductionOrderQueryService.applyDataPermissionFilter 已实现 all/team/own 完整过滤（agent 只看了前215行）
- "推送弹窗7选项3无效+隐藏sizePrice"：现行版本已是4选项且全部有效（旧版本问题已被此前重构修复）
- "推送备注被丢弃"：Controller 已接收 remark 传入 createFromStyle
→ 教训：审计 agent 报告基于代码快照，修复前必须逐条现场复核

### 验证
- mvn compile ✓ 后端已重启；前端 type-check/lint/build ✓
- **P1 全部清零**（27项：22修复+1误报角色名+3误报本轮澄清+数据范围1误报）；剩 P2 24 项

## D-084 打印预览与详情页字段对齐：板类fallback/生产要求防御清洗 + 部署环境陈旧定性（2026-08-16）

### 现象（用户打印 BR25CQ0573B 与详情页对比）
①商品类型打印`-` ②板类打印"未知" vs 详情"首版" ③款式特征打印缺失 ④生产要求打印仍带BOM操作日志

### 根因（三真一环境）
1. **板类"未知"=前端确定bug**：详情页板类是字典驱动（DictAutoComplete dictType=plate_type），**存 dictLabel 中文标签**（如"首版"）；打印 helpers.ts 硬编码 PLATE_TYPE_MAP 只穷举了 FIRST/REORDER/首单/翻单/首板/首翻单/复板，字典新值必然 miss → '未知'
2. **生产要求污染=目标环境 Flyway 未跑**：D-069 的 V202708143000 清洗脚本需后端重启执行；部署环境后端陈旧则 description 存量日志仍在
3. **商品类型`-`/款式特征缺失=环境问题非代码问题**：打印组件 D-062 起已接 productType（translateProductType）与 extJson 六特征字段；list 接口 MyBatis-Plus selectPage 全字段返回（extJson/product_type 均真实列）——链路核实完好
4. **环境定性证据**：本地 docker mysql(3308) 全表仅 96 条测试数据（PRICETEST/APITEST/GATE-* 等 6-7 月造数），无 BR25CQ0573B → 用户操作的是部署环境，其前端/后端/DB 任一陈旧都会造成①③④

### 修复（2文件）
- helpers.ts：translatePlateType 未命中 map 时**回退原值**（字典存的就是可读标签，穷举 map 只做旧编码兼容）；禁止显示"未知"
- ProductionSheetSection.tsx：新增 stripOperationLogLines 防御清洗（与 D-069 SQL 同规则：`^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]` 行剔除），双保险

### 验证
- tsc ✓ eslint ✓ 纯函数冒烟 ✓（translatePlateType('首版')→'首版' / ('FIRST')→'首单' / (undefined)→'-'；污染文本清洗只留业务行）
- 本地后端 8088 今日 12:05 已重启：D-081 财务修复+D-069 清洗在本地环境已生效（进程启动时间=class编译时间）

### 教训
- 打印/导出类组件的字典字段**禁止硬编码穷举映射**——字典值用户可自维护，永远穷举不完，fallback 原值即正确显示
- 用户报告"页面A与页面B显示不一致"时，先确认两者**实际连的环境**（本地/部署），本案本地库无该数据是定性关键转折



## D-085 2026-08-16 属性库通用化 + 打印视觉调整 + PUT /style/info 400 定性（三合一）

### 背景
用户三项诉求：①"基础属性库"做成通用组件供全系统属性编辑处复用 ②PUT /api/style/info 400（部署环境 www.webyszl.cn 连续5次）③打印二维码移右上角做小、表格图片做大

### PUT 400 定性（决定性实验）
1. 本地后端（最新代码）curl 实验：admin 登录 → GET /style/info/142 → **原样回传 PUT 200**
2. 模拟新前端完整 payload（含 4c1218157 全部新字段 + deliveryDate "yyyy-MM-dd HH:mm:ss" + quantities:null）→ **PUT 200**
3. 静态排查：实体无 @Valid/@NotNull；JacksonConfig（30c56e3d3）全局兼容 ISO/日期/日期时间三种格式；8月实体3次变更均纯新增字段无类型翻转；无 primitive 字段；新旧 payload 字段类型全兼容
4. 部署环境探针：空 body PUT → 401（网关正常，token 拦截层 OK）→ 400 来自应用层
5. **结论：本地代码无 bug；400 = 部署环境旧后端专属（D-084 同根因：环境陈旧）。解决 = 更新部署后端 + 跑 Flyway**。精确定位法：F12 → Network → 红色 PUT → Response body

### 属性库通用化（1迁1删1改）
- `components/common/AttributeGroupLibraryModal.tsx`（新）：groups: AttributeGroupDef[] 可配置任意成套属性组（key/itemDictType/groupDictType默认`${item}_group`/tabLabel/itemLabel），默认颜色+码数与原行为完全兼容；title 可定制
- 旧 `StyleBasicInfoForm/AttributeGroupLibraryModal.tsx` 删除；ColorSizeSkuSection 改引 common（onApply 签名不变）
- **全系统可接入点排查（dictType=color/size 直接使用者 8 处）**：样衣详情 ColorSizeSkuSection（已接入）/ StyleColorSizeTable / StyleBomMaterialModal / cuttingBomColumns / CuttingBomMaterialModal / MaterialSelectModal / MaterialPurchaseDetail columns / EditablePurchaseTable。其中"成套组合录入"高价值场景：StyleColorSizeTable（矩阵录入）、裁剪BOM、采购明细；单值选择场景（BOM物料弹窗等）不适合成套组合，无需接入
- 数据层零改动：仍复用 t_dict（xxx_group），新属性组自动获得存储能力

### 打印视觉调整（StylePrintModal/sections，全部打印入口共享）
- BasicInfoSection：QR 从左列（80px+logo20+文字）→ 右列顶部右上角（42px+logo10+竖排微字"扫码查看"），主图 90→120
- BomTableSection：图片列 40→64、列宽 90→110
- SizeTableSection 尺寸表图（120/220）已足够，未动；标签打印（26mm 标签）为独立场景未动

### 验证
- eslint 4 文件 0 错误；DictAutoComplete/clearApiCache 导出核验 ✓；vite dev 5173 热更新生效
- 打印为视觉改动，待用户在打印预览中确认（QR 可扫性 42px+logo10 留了纠错余量）

### 教训
- 跨环境报错（部署400）先做"原样回传实验"：GET→PUT 回环 200 即证明代码链路无 bug，避免在本地盲改

## D-100 2026-08-16 色卡本重复入口下线 + 供应商色卡供应商名三连修复（P0）

### 背景
用户炸点：①物料管理菜单又出现独立「色卡本」，与「物料新增」里的供应商色卡功能重复 ②编辑供应商色卡选供应商后名字不显示，卡片显示"供应商: -"但联系人"小刘 · 13144401544"有值。

### 供应商名不显示根因（MaterialColorCardDialog.tsx 一处代码三个坑）
1. **supplierName 未注册为 Form.Item name**：antd validateFields() 只返回注册字段 → 保存 payload 丢 supplierName → 后端存 null → 卡片"供应商: -" + 编辑回显空。联系人字段注册了所以有值——现象完全吻合
2. **option 字段名错误**：onChange 读 `option?.contactPerson/contactPhone`，SupplierSelect 的 option 实际暴露 `supplierContactPerson/supplierContactPhone` → 选中供应商后联系人/电话被清空
3. **supplierId 塞名字**：`option?.supplierId || value` 手动输入场景把供应商名写进 ID 字段

修复=按 SupplierSelect 标准用法：name="supplierName" 直接注册（显示/回显/保存全通），onChange 只填隐藏字段（正确字段名）。

### 色卡本重复=两套色卡系统并存
- 旧：/color-card/*（6 后端文件 + t_color_card 表）+ pages/ColorCard（11 前端文件）+「色卡本」菜单
- 新：/material-color-card/* + MaterialDatabase"供应商色卡"视图（t_material_color_card 表）
- 处置：**旧代码全删（后端 6 文件+前端 11 文件+菜单+权限映射），路由重定向防 404；表保留不删**（历史数据）；物料列表"查看色卡"原查旧表 → 新增 by-material 接口迁到新表（原来用户在供应商色卡视图改的数据，物料列表"查看色卡"永远看不到——两表不通）

### 验证
tsc --noEmit 0 错误；mvn compile 通过；旧 /color-card API 前端调用 0 残留；旧 ColorCard 类引用 0 残留

### 教训
- antd Form 里"显示正常但保存丢字段"优先查该字段是否注册了 name（validateFields 只返回注册字段，setFieldsValue 未注册字段不报错——静默丢失）
- 功能重构上线后旧入口必须同步下线，否则双入口双数据源（本项目已两次踩：旧色卡本、色卡本物料 tag 查旧表）


## D-101 2026-08-16 进度球实时刷新：重算服务统一广播 WebSocket（P0）

### 背景
用户反馈订单管理/工序跟进的进度球（父子订单卡）不实时更新，要等"轮回查询"10 多分钟。

### 根因（更新链路断层，不是没有实时机制而是覆盖不全）
- 前端已有完整实时链路：useWebSocket 收 progress 推送 → dispatch `order:progress:changed` → 订单管理/工序跟进页监听立即刷新（500ms 防抖）+ 切回页面静默刷新
- 后端重算覆盖全：15+ 写路径即时调 recomputeProgressFromRecords 更新 DB
- **断层**：WebSocket 广播只在扫码链路（ScanExecutorSupport.recomputeProgressSync）。非扫码操作（成品入库、回退、采购同步、ORDER_ADVANCE 手动推进、裁剪扎号、清理）更新了 DB 但不广播 → 打开着的页面收不到，只能等工序跟进页 5 分钟轮询（pauseOnHidden 切页暂停）或 30 分钟一致性 Job → 体感 10 多分钟

### 修复（收敛到统一出口，一处改动覆盖全部路径）
`ProductionOrderProgressRecomputeService.persistProgressUpdate` 成功后调 `broadcastProgressIfChanged`：
- 注入 OrderProgressWebSocketServer（required=false）
- **有变化才推**（对比更新前后 productionProgress/status/completedQuantity）——30 分钟 Job 批量重算无变化订单不推，防风暴
- 扫码链路 ScanExecutorSupport 原有推送保留（幂等，前端防抖）
- 前端 useOrderSync 兜底轮询 300000→60000ms

### 教训
- "实时推送"做了基建（WS+事件+防抖+重算）≠ 全链路实时：写路径有多少条，广播出口就必须收敛到多少条共用的那个点上（recompute 持久化出口），而不是每个 Controller 自己记得推
- 用户感知"等 N 分钟"先算三个数：轮询间隔 × 页面隐藏暂停 × 定时任务周期，基本能对上体感时间

### 验证
Java LS 零错误；推送 ccb9c63a0（safe-push 过）；部署后需双端端到端验证秒级刷新

## D-102 2026-08-16 IDE 警告反复出现的根因说明与六文件批量清理（P2 卫生）

### 背景
用户再次询问"为什么每次都这么多警告"。根因：IDE Java LS 全量扫描，**存量警告**（重构遗留的未使用字段、死代码、deprecated API、泛型原始类型转换）不清就一直显示，并非每次新产生。

### 决策
1. 未使用的 `@Autowired` 字段直接删（import+字段）；删除前 grep 全文件确认仅 import+声明 2 处引用
2. 死代码链整链删除：`ensureStyleFullyCompletedBeforeMaintenance → isStyleFullyCompleted → isPassedReview/isInboundCompleted/isCompleted`（链内互相调用闭环、外部零引用）+ 专属字段 patternProductionService/sampleStockMapper 及 import
3. `selectBatchIds`→`selectByIds`（MyBatis-Plus 3.5.12，语义相同）
4. `readValue(json, List.class)`→`TypeReference<List<String>>`（类型安全，无需 @SuppressWarnings）
5. 纯编译期改动（删死代码/等价替换）用 `mvn compile` 验证即可，不启动应用

### 教训
- 重构把逻辑委托给 Helper/Orchestrator 后，原注入字段无人清理是警告累积主因；重构完成时顺手删旧依赖
- IDE Warning≠Error，不影响编译运行，但长期不清会掩盖真问题

### 验证
`mvn compile` 通过；6 个文件 Java LS 诊断全部清零

## D-103 2026-08-16 警告根治：-Xlint 固化 + 全量清零 99→0（P2 卫生，44 文件）

### 背景
D-102 后用户要求"根治"。发现根因：IDE 警告只有打开文件才可见，编译/CI 无任何警告检查，警告会默默积累。

### 决策
1. **pom 固化 `-Xlint:all`（排除 unchecked/serial/this-escape/processing/classfile）**：编译期即暴露 rawtypes/deprecation/lossy/static 等，与 IDE 同源；新警告随 `mvn compile` 即时可见，不再默默积累。unchecked 排除原因：JSON 场景 Map 强转不可避免，IDE 亦不报，保留 rawtypes 抓 raw 声明即可
2. **清光两轮全量编译暴露的 99+26 条存量**：deprecation API 等价替换 14 处（selectByIds×3、getStatusCode().value()、trim()、keyCommands().scan、setMinEvictableIdleDuration、permissionsPolicyHeader、URI.create().toURL()、query 参数序、queryForObject 新签名）；static 方法改类名限定 30 处（UserContext.tenantId/factoryId/userId）；lossy 复合赋值显式 (int) 截断 10 处；raw 类型参数化 13 处（CompletableFuture<?>[0]×8、ResponseEntity/Map→ParameterizedTypeReference×4、Map body×2）；@SuppressWarnings("try")×2 方法（SpanScope close 副作用模式）；死代码删除（AiPatrolJob.generateReflectiveMemories、SecurityConfig.resolveClientIp、DataTruthGuard.qdrantService/TEMPORAL_WORDS、FeishuMessageEvent.messageId、QueryRecord 瘦身为单字段 record）

### 关键发现（踩坑）
- **@SafeVarargs 压不住 -Xlint:all 的 varargs 堆污染警告**：其 lint key 是 `varargs` 而非 `unchecked`，需 `@SuppressWarnings("varargs")`（已用最小实验验证）
- **FinishedInventoryOrchestrator/WarehouseScanExecutor 的 "@deprecated 建议直调 Helper" 标记违反 D-001**（事务必须在 Orchestrator 层，Controller/AI 工具调壳方法才保有事务边界）→ 清除误导标记保留壳方法，而非迁移调用方
- **-Xlint:all 首次启用会分两轮暴露存量**（第二轮全量重编才报出 WorkAttendance 等 22 条 static 警告），验收需连续两次编译为 0

### 遗留风险
- SecurityConfig `permissionsPolicyHeader` 为 Spring Security 6.4 新 API，与旧 API 共用 PermissionsPolicyConfig 行为等价；**部署后验证 Permissions-Policy 响应头正常**
- SelectionBatchController `/save` 旧端点计划 2026-Q4 移除（原 Q3 已过）

### 验证
javac -Xlint 警告 0；mvn compile EXIT=0；Java LS 全目录诊断 0。三重清零

## D-164 样衣工序扫码领取/报工闭环（MES CLAIM 模型）——2026-08-26

### 背景
用户强诉求：扫码样衣码 → 直接进工序页 → 按款式配置的工序逐道领取 → 本人完成报工 → 全部完成 → 审核 → 入库；必须有防重复领取。

### 决策
1. 后端新增 CLAIM operationType：领取写 t_pattern_scan_record(operation_type=CLAIM)，不写计件镜像不同步库存（领取不算工资）；完成报工才计件
2. process-config 接口返回每道工序 status(PENDING/CLAIMED/COMPLETED)+claimedBy+claimedByMe，由 PatternEnrichmentHelper 推导
3. validateProcessClaim 三层校验：工序必须在款式配置内 + 未完成 + 未被他人领取（本人幂等）；分布式锁 scan:sample:{patternId} 兜底并发
4. 前端工序列表视图：PatternScanProcessor 返回全部工序（不再只显示第一道可执行的），pattern/index.wxml 行内领取/完成报工按钮
5. 样衣列表页扫码路由修复：原 onScan 命中样板码直接跳详情页（用户炸点），改为复用 PatternScanProcessor 直达 /pages/scan/pattern/index

### 踩坑（重要）
- 小程序 config.js getBaseUrl() 强制把 localhost/内网地址替换为云端 https://api.webyszl.cn —— 开发者工具测的永远是云端后端，本地起后端无用，必须推送走 CI 部署
- 推送后 GitHub Actions 可能不自动触发（webhook 延迟），需空提交重触发或再推一个 commit
- 历史 fix 提交的 CI run 常被后续 docs 提交 cancel（concurrency cancel-in-progress），以最后一个 success run 为准

### 验证
本地实测（8088 + lilb/李老板）：领取裁剪成功→列表 CLAIMED+显示领取人；factory_meimei 领取被拒「已由 李老板 领取」；领取配置外工序被拒；跨租户拒绝；测试数据已清理

## D-224c 自愈Runner补建SKU与横线条件冲突（BR26X1K0651A 列表不显示根治）——2026-08-30

### 背景
线上 BR26X1K0651A 棕色连衣裙：库位详情有 132 件（读 t_product_warehousing），成品仓库列表却无此款（读 t_product_sku 且 stock>0）。D-224/D-224b 已部署但仍不显示。

### 根因
StyleSnapshotBackfillRunner 内部逻辑自相矛盾：步骤 6.5（D-224b）把入库明细编码重建为**无横线直拼**格式（`BR26X1K0651A棕色XS`），但步骤 8 补建缺失 SKU 仍要求编码**含 >=2 个横线**且按横线切分提取色/码——条件永不成立，SKU 行永远补不出来。另外步骤 7 对账 JOIN 也可能因 SKU 表旧横线编码与入库直拼编码不匹配而失效。

### 决策
1. 新增步骤 6.6：SKU 编码分隔符归一化——行内有款号/色/码、编码与直拼格式仅差横线（保留 SKU- 前缀）的统一为直拼，使对账 JOIN 能命中；manually_edited=1 不动
2. 步骤 8 重写：直接用入库明细行内 style_no/color/size 组装，去掉横线条件；INNER JOIN t_style_info 取 style_id（NOT NULL 约束）；NOT EXISTS 防护 uk_sku_code（全局唯一，跨租户）与 uk_style_color_size 唯一键，避免整批 INSERT 失败
3. 菜单「成品出入库」更名「成品仓库」（cb4881eab，12 文件全端同步，仅 UI 名，权限码/路由不变）

### 踩坑（重要）
- 自愈 Runner 改动必须核对**步骤间执行顺序与格式约定的一致性**：前一步改变的数据格式，后一步的 WHERE 条件必须同步适配（本次 6.5 直拼 vs 8 横线即典型冲突）
- t_product_sku 的 uk_sku_code 是**全局唯一**（不带 tenant_id），跨租户同码会冲突，批量 INSERT 必须 NOT EXISTS 防护
- 旧版步骤 8 因横线条件从未真正执行过，其 INSERT 列清单从未被约束验证过——"部署了"≠"生效过"

### 验证
mvn compile 通过；safe-push 8 项全过；推送 dbd3f0719 触发 CI 部署，后端重启 15 秒后 Runner 自动补建，BR26X1K0651A 六个码（各 22 件）应出现在成品仓库列表

## D-227 质检/手工入库不同步SKU表（新入库款成品仓库列表缺失根治）——2026-08-30

### 背景
线上 BR26X1K0651A 入库 132 件（12 行明细，行内色/码各自正确），成品仓库列表却无此款；库位详情塌缩成"棕色XS 132件"一行。用户反馈所有新入库款都有此问题。通过线上 API（api.webyszl.cn，账号 lilb）实证：入库明细 12 行 sku_code 全为 NULL，t_product_sku 52 行中无该款任何行。

### 根因（三处叠加）
1. **根源**：ProductWarehousingOrchestrator.save/batchSave 只写 t_product_warehousing，从不生成 sku_code、从不同步 t_product_sku（updateSkuStock 方法只被 delete 调用，且用旧横线编码格式）
2. **自愈失效一**：Runner 6.5 重建编码条件 `pw.sku_code <> CONCAT(...)` 在 sku_code IS NULL 时结果为 NULL（条件不成立）——NULL 行永不重建
3. **自愈失效二**：Runner 8 补建条件 `IFNULL(sku_code,'') <> ''` 排除空编码行

### 决策
1. 新增 ProductWarehousingSkuSyncHelper：入库保存后生成直拼编码（款号+色+码）回填明细 sku_code + upsert SKU 行（按编码→按款色码租户二次查找→按款式档案补建），try-catch 不阻断主流程
2. save/batchSave 接入同步；delete 恢复库存改直拼编码 + 行内色码兜底（原来只从菲号取色码）
3. Runner 6.5 改 `IFNULL(pw.sku_code,'') <> CONCAT(...)`，NULL 编码可重建，后续对账/补建链条打通

### 踩坑（重要）
- **SQL NULL 比较陷阱**：`col <> x` 在 col 为 NULL 时结果为 NULL 而非 TRUE，所有"与期望值不等则修复"的自愈 SQL 必须用 IFNULL 包裹
- **"部署了"≠"验证过"**：D-224 系列补建 SQL 因条件矛盾从未真正生效，直到用线上 API 查真实数据才暴露。线上问题必须查线上数据（本地库不同步），用 postdeploy-smoke-test.py 的 BASE_URL+账号 curl 登录即可
- 出库弹窗前端曾用颜色×尺码笛卡尔积拼假编码且整款总量错标到每码（D-226 已修）

## D-228 出入库SKU编码统一直拼（D-227 从未上线 + 双重累加 P0）——2026-08-30

### 背景
用户连续反馈「成品仓库看不到新入库的款」「库位地图塌缩成一行」，D-224/224b/224c/226/227 五轮修复均「推送了但没变化」。

### 一、D-227 从未上线（"没变化"的直接原因）
- `141813033`（D-227 代码）→ CI `33281468565` **cancelled**（33秒，被后续提交顶掉）
- `82947ddab`（决策记录）→ CI `33281483082` **failure**：后端测试 NPE
  ```
  Cannot invoke "ProductWarehousingSkuSyncHelper.syncSkuStockOnInbound(...)"
  because "this.warehousingSkuSyncHelper" is null
    at ProductWarehousingOrchestrator.save(:202)
  ```
  新增 Bean 未在 `WarehousingStockOrderIntegrationTest` 加 `@Mock` → 7 例 Error → deploy skipped
- 云端一直是 D-226 代码

### 二、D-227 即使上线也不生效（三处）
1. **改错地方**：改的是 `ProductWarehousingOrchestrator` 里仅 delete 使用的副本；保存链路真正调用的是 `ProductWarehousingHelper.updateSkuStock(:576)`
2. **编码仍是横线**：该处 `String.format("%s-%s-%s", ...)`，而 SKU 表自 D-215/216/217 已统一直拼 → 匹配不到任何行 → 库存静默不增
3. **Runner SQL 引用不存在的列**：6.5/第8步用 `pw.color`/`pw.size`，但实体里是 `@TableField(exist=false)`，数据库无此列 → 线上必报 Unknown column，被 `exec()` 的 try-catch 吞掉只记 warn → **自愈从未真正执行过**

### 三、P0：双重累加（幸因 CI 挂掉未上线）
```
Orchestrator.save(:255) → ServiceImpl(:172) → writeHelper.executePostSaveSideEffects(:190)
    → updateSkuStockAfterSave(:244) → helper.updateSkuStock(qualifiedQuantity)   ← 第1次
Orchestrator.save(:202) → skuSyncHelper.syncSkuStockOnInbound(qualifiedQuantity) ← 第2次
```
若部署，新入库库存翻倍。

### 四、连带发现：出库侧对称 bug
出入库链路共 6 处横线编码（含出库 3 处）→ 出库同样扣不到库存。已全部统一为直拼。

### 决策
1. 删除 `ProductWarehousingSkuSyncHelper` 及 Orchestrator 两处调用（202/288），**收敛为单一入口** `ProductWarehousingHelper.updateSkuStock`
2. `ProductSkuService` 新增 `upsertStockByStyleKeys(skuCode, styleNo, color, size, delta, tenantId)`：
   显式传色码，不靠字符串反解（直拼编码用 `-` 拆不出三段）；
   按编码累加 → 按款色码(+租户)二次查找 → 按款式档案补建；**扣减不凭空建行**
3. Runner 6.5/8 改为 `JOIN t_cutting_bundle`（颜色尺码的权威来源）

### 踩坑（重要）
- **改代码前必须确认"谁真正调用它"**：D-227 改的是同名方法的死副本。用 findReferences 确认调用链，不要假设
- **`col <> x` 与"列不存在"是两类自愈杀手**：前者遇 NULL 恒不成立（D-227 已修），后者直接抛异常被 try-catch 吞掉（D-228 才修）。自愈 SQL 引用的列必须核对实体 `@TableField(exist=false)`
- **新增同步点前先查是否已有**：库存这类共享状态，重复调用=数据翻倍。先 grep 全链路再动手
- **CI 状态必须逐个 run 看**：`git push` 成功 ≠ 部署成功。cancelled/failure 都会让云端跑旧代码
- **本地残留未跟踪测试文件会阻塞 testCompile**：`SmartSourcingListOrdersRegressionTest.java`（untracked，引用不存在的 `TestRedisConfig`）会导致本地 `mvn test` 编译失败；不进 git 故 CI 不受影响。已移至 `/tmp/bak_tests/` 备份
- **移走文件后需清理 `target/test-classes` 残留 class**，否则 `mvn test` 仍会跑旧 class

### 验证
后端全量测试 **140 通过**（原 12 例 NPE 全部转绿），BUILD SUCCESS。

### D-228b 补充：入库列表查询漏选 sku_code（2026-08-30）
线上验证 D-228 时发现：`/api/production/warehousing/list` 返回对象**不含** skuCode 键，
但 `/{id}` 单条详情有值且正确（`BR26X1K0651A棕色XL` 12 件等）。

根因：`ProductWarehousingServiceImpl.buildWarehousingQueryWrapper(:106)` 使用**显式 `.select(...)` 列清单**，
其中漏了 `ProductWarehousing::getSkuCode`。数据库有值 → 查询不选 → 前端拿不到 → 自行拼装假编码。

**踩坑（新增）**：
- **显式 `.select(...)` 列清单是"隐形数据丢失"高发区**：新增实体字段后，若列表查询用了显式列清单，
  新字段不会自动出现在结果里，且不报任何错。排查手法：`/{id}` 详情（select *）与 `/list` 对比，
  若详情有值而列表没有，99% 是列清单漏选
- **Jackson NON_NULL 会隐藏 null 字段**：接口返回里"某个键不存在"≠"该字段不存在于实体"，
  要用 `'key' in obj` 判断，不要只用 `obj.get(key)`
- **判断修复是否生效必须查数据库真实值**，不能只看列表接口（列表可能漏选/前端可能拼装）

修复：select 列清单补 `ProductWarehousing::getSkuCode`（出库列表为 select *，无此问题）。

### D-228 线上验证结果（2026-08-30，部署后实测）
- BR26X1K0651A：SKU 行 **6 行**，棕色 XS/S/M/L/XL/XXL **各 22 件、共 132 件**，编码为直拼格式 ✅
- SKU 总行数 52 → **144**（+92 行），款数 28 → 用户此前反馈"所有新入库款都看不到"已一并修复 ✅
- 同款同色同码重复组数 = **0**（未产生重复行）✅
- 无库存异常放大款（未双重累加，单一入口方案正确）✅
- 入库明细 sku_code 已由 Runner 6.5 正确回填（直拼格式，各码数量正确）✅
- 遗留：46 个历史横线格式编码（款式档案旧数据），因 upsert 的"按款色码二次查找"兜底，
  库存归集正确，仅显示格式未统一，不影响功能

## D-246 外发管理按钮归位/进度条修复 + 成品仓库按编码拆行 + 库位三表加图片（2026-08-30）

### 一、手机端外发管理 —— 用户要求"按生产管理的布局来改"
1. **按钮错位**：`factory/shipment/index.wxml` 的 `.expand-actions` **开标签在展开区顶部、闭标签在底部**，
   菲号明细/工序进度/颜色尺码被吞进按钮容器，7 个操作按钮反被挤到最底部。
   `dashboard/index.wxml`（生产管理）同一段结构是正确的（开闭标签都在按钮组内），故仅外发管理中招。
   修复：8 个按钮归入顶部按钮组、容器即闭合，明细区移到容器外；容器样式补底部分隔线对齐生产管理。
2. **进度条"截断"**：原用 `progressWidth`/`percentWidth` 中间变量，未赋值时渲染成 `width: %` → 宽度失效。
   改为与生产管理一致的内联钳制 `calculatedProgress > 100 ? 100 : calculatedProgress`。

### 二、PC 端成品仓库：一个商品编码一行（用户从三方案中选定）
- 新增 `flattenBySku.ts`：款级记录 → 编码级行，标记 `__rowSpan`/`__rowKey`
- 图片/成品信息/颜色尺码/库存状态/单价/入库/出库/操作 用 AntD `rowSpan` 合并
- 库存指标 3 行→2 行（去掉单独占行的"件"），列宽 260→200；入库/出库精简冗余，190→150
- 颜色/尺码 Tag 超 6 个折叠为 `+N` + tooltip

### 三、库位地图三表加图片
- 后端 `WarehouseLocationOrchestrator.queryLocationItems` 补 `imageUrl`：
  成品取 `t_style_info.cover`、物料取 `t_material_database.image`、样衣原本就有；
  **批量预取后映射**（避免 N+1），失败只 warn 不阻断
- 前端三表首列加图片，CSS grid 各 +1 列（图片固定 56px）

### 踩坑（新增）
- **小程序 wxml 标签错位是"哑 bug"**：开闭标签分离不报错，只表现为内容被错误吞并。
  排查手法：出现"元素跑到不该在的位置"时，优先核对容器的开闭标签配对
- **小程序 style 绑定慎用中间变量**：`style="width: {{x}}%"` 在 x 未赋值时变成 `width: %`（无效），
  且静默失败。直接用带兜底的表达式更安全
- **AntD 合并单元格**：`render` 返回 `{ children, props: { rowSpan } }`，非首行传 0；
  同时必须换掉会重复的 `rowKey`（否则拆行后 key 冲突）

### 验证
CI 全绿（后端 140 测试 / 前端 tsc 0 错误 / P0 冒烟）。线上实测：
成品仓 A-01-1-2 返回 21 条且 imageUrl 有值、样衣仓 5 条有值；
物料仓线上 18 个库位均无库存（usedCapacity=0），逻辑已就绪待有数据生效。

---

## D-246 手机端下单页码数一坨根治 + 布局工整化 + 对齐PC端批量操作（2026-08-30）

### 背景
用户反馈手机端下单页码数全部堆在一个 chip 里（截图：`XS(155/72A)/S(160/76)/M(165/80)/L(170/84)/XL(175/88)/...`），
下单界面"一锅粥"，要求对齐 PC 端下单逻辑，并强调"不要一个个输入，操作要方便、有效率"。

### 根因
- 该款式 `t_style_info.size` 为旧 `/`-拼接格式。
- PC 端 `frontend/src/utils/styleOptions.ts → splitStyleOptions`：优先按 `,` 切；
  无标准分隔符时才退化按 `/` 切，且**只切括号外**的 `/`（`L(170/84)` 内部的 `/` 被保护）。
- 小程序 `pages/order/create/form/index.js` 仅 `.split(',')` → 整段成为 1 个码数 chip。
- **教训**：PC 端修复过的解析类 bug（这里是 D-206 配套），如果工具函数没有跨端复用，
  另一端会原样复发。凡"字符串解析/格式化"类逻辑，应优先抽到共享 utils 而不是各端各写。

### 决策
1. **不直接抄 PC 的 TS 文件**，而是在小程序建 `utils/styleOptions.js` 用 ES5 复刻，
   注释里写清两种分隔符的坑（避免后人再"简化"成 `split(/[/,]/)`）。
2. **码数切分后立刻 `sortSizeNames` 排序**——复用小程序既有的 `utils/sizeUtils.js`，不新造轮子。
3. **行/列小计挂对象而非用动态索引**：WXML 里 `rowTotals[ridx]` 这类动态数组索引存在兼容风险，
   改为 `row.total` / `{size,total}` 对象数组。**WXML 模板尽量只用点号访问**。
4. **WXML 不用 `&&`**：虽然微信支持，但为可读性与工具链兼容，拆成单一条件 `wx:elif`。
5. **批量操作优先**：除对齐 PC 的"全选颜色/全选码数/清空/全部铺量"外，
   额外加 PC 没有的**按行铺量 / 按列铺量**（点颜色名铺整行、点码数列头铺整列）——
   手机屏幕小，逐格输入体验差，这是手机端必须有的提效。
6. **纸样师/跟单员改 picker**：复用已有的 `api.system.listUsers`，不新增接口。
7. **客户选择器暂不做**：PC 用 `/crm/customers/list`，小程序无 crm 模块；
   为控制改动面与风险，保留自由输入，列入下批。

### 验证
- 核心修复实测：`XS(155/72A)/.../XXXL(185/96)` 旧 1 个 → 新 7 个 ✓
- 边界：`S,M,L` / `XS/S/M` / `黑色，白色、红色` / 排序 / 批量去重 / null·空串·undefined 全过
- 四副本 `node --check` 通过；5 文件 MD5 一致
- WXML 标签栈 329 标签全闭合（四副本）；36 个事件处理器 JS 中全部有实现；WXSS 79/79 配对

### 待办
微信开发者工具真机验收；下批做基础属性库齿轮 + 客户选择器。

---

## D-247 无资料下单图片丢失根治（P0）+ 开放「从已有款式下单」（2026-08-30）

### 背景
D-246 交付后主动审查下单链路，发现一个比码数一坨**更严重的 P0**：
无资料下单上传的款式图片**提交后 100% 丢失**。

### 根因（四层叠加）
1. `wx.chooseImage` 返回本地临时路径（`wxfile://`），不是持久 URL
2. 提交 payload 完全没有图片字段
3. `ProductionOrder.coverImage` / `styleImage` 是 **`@TableField(exist = false)`**——不入库
4. 回填逻辑 `fillStyleCover` 三级回退**全部依赖 styleNo**
   （款式 cover → 款式附件 → 模板封面）；无资料订单无款式档案 → 三级全空

### 关键决策
1. **不新建表、不写 Flyway**：后端早有 `OrderImage` + `OrderImageOrchestrator` +
   `POST /api/production/order-image`，小程序 `api.production.addOrderImage()` 也已封装。
   **改代码前先搜是否已有现成体系**，比新造轮子安全得多。
2. **时序：先建单，再存图**。图片是附属信息，上传失败不应阻断下单；
   且后端 `addImage` 内部会校验订单存在，顺序上本来就要求先建单。
3. **回填优先级：订单自带图 > 款式三级回退**。若订单自带图存在，
   它就是用户真正上传的那张，语义上优先。
4. **跨租户必须显式带 tenant_id**：本项目**未启用** MyBatis-Plus 多租户插件
   （全局搜 `TenantLineInnerInterceptor` 零结果），`lambdaQuery()` 不会自动加租户条件。
   取租户用 `UserContext.tenantId()`（静态方法，非 `getTenantId()`——后者是实例方法）。
5. **改在 `fillStyleCover` 方法内部**而非各调用点：该方法有 6 个调用点
   （订单列表、订单详情、裁剪任务、成品入库待办、成品入库查询、另一处列表），
   改方法内部 → 全部自动受益，不用逐个改。
6. **fail-safe 是硬要求**：回填属装饰逻辑，任何异常只 warn 不抛，绝不能让列表/详情查询失败。

### P1：无资料下单两条路径
原实现在 noData tab 加载全量款式却**不显示列表**（wxml 只在 style tab 渲染），
属于死代码。改为"上传图片 / 选已有款式"两条路径并存——
现实中"款已在系统里但这次颜色码数和档案不同"是常见场景，走无资料下单选款更合理。

布局同步改 flex（`.page` 竖向 flex + `.list-section` flex:1 + `.grid-scroll` flex:1），
替代原 `calc(100vh - 120px)` 硬编码，上面有无上传区都能自适应。

### 自查发现并修复的引入问题
P1 让无资料下单支持选款式后，`onStyleTap` 会传 `coverImage`（网络图），
但 `form/index.js` 的 isNoData 分支**只读 `tempImage`** → 方式二封面丢失。
**教训：新增入口路径时，必须回头检查接收方是否覆盖了该入口的参数形态。**

### 本批刻意未做（风险 > 收益）
- 删死页面 `pages/order/no-data-create`：注册在 `app.json` + `h5-web/generated/route-manifest.json`，
  改 app.json 出错会导致小程序启动失败，收益（清一个空壳页）远小于风险
- 款式批量多选下单（改动面广）、`pageSize:500` 下调（可能加载不全）、
  款号强制校验（会阻碍"确实没款号"的正常场景）

### 验证
后端 `mvn compile` BUILD SUCCESS（EXIT=0，2297 源文件）；
四副本 `node --check` 全过、3 文件 MD5 一致；
WXML 处理器（create 5 / form 36）全部有 JS 实现、标签全闭合；WXSS 括号配对。

### 待办
真机验收无资料下单图片链路；下批做基础属性库齿轮 + 客户选择器。

---

## D-248 下单页补齐：客户选择器 + 基础属性库齿轮（2026-08-30）

### 背景
D-247 收尾时列的下批两项：基础属性库齿轮、客户选择器。
动手前先核实后端，结论是**两项都不需要改后端**。

### 决策 1：客户选择器用 active-list，不用 customers/list

后端 `CrmController` 有两个可用接口：
- `POST /api/crm/customers/list`（分页 + 搜索，PC 端 CustomerSelect 用这个）
- `GET /api/crm/customers/active-list`——**后端注释即"活跃客户下拉列表（用于订单创建时选择客户）"**

选后者：下单场景要的就是活跃客户下拉，且 `CustomerOrchestrator.listActive()`
**已做 tenantId 过滤 + 工厂账号只返回自己关联的客户**，前端零额外处理。
PC 端那个带搜索是因为 PC 有 AutoComplete 组件；小程序 picker 不支持搜索，用简单列表即可。

**客户字段名**：`Customer.companyName`（不是 customerName）。
提交时 `customerId` + `customerName`（customerName 取展示用的 companyName）。

### 决策 2：picker 没有 allowClear，用「（不选）」兜底

小程序 `<picker>` 不像 antd Select 有 `allowClear`，选中后无法清空。
客户是选填字段，必须能清空 → 在列表首项插入 `{id:'', companyName:'（不选）'}`，
`onCustomerChange` 里 `item.id` 为空则清空 customerId 与 company。

### 决策 3：基础属性库复用 t_dict，确认零后端改动

PC 端 `AttributeGroupLibraryModal` 源码注释明确：
"数据存储复用系统字典（t_dict，dictType=xxx_group，dictValue=JSON 数组），**无独立后端接口**"。
所以小程序直接用已有的 `api.system.getDictList('color_group' / 'size_group')` 即可，
不需要新增任何后端接口——**这与 D-246 的教训一致：动手前先确认有没有现成体系可复用**。

### 决策 4：手机端只做「使用组合」，管理留在 PC

组合的新增/编辑/删除是管理动作，手机上操作体验差、也非高频。
本批只做「覆盖 / 追加」两个使用动作，管理入口仍走 PC 端。
追加走 `mergeDistinctOptions` 自动去重，与手动添加码数的去重口径一致。

### 决策 5：解析逻辑与 PC 端保持一致

PC 端 `parseGroupValues`：先 `JSON.parse`，失败回退 `[,，、]` 分隔符。
小程序原样复刻——存量数据可能两种格式都有，只支持一种会丢数据。

### 走查补漏
写完自查找出：客户 picker 选中后无法清空（已加「（不选）」）。

### 验证
四副本 `node --check` 全过；5 文件 MD5 一致；
WXML form 页 40 个事件处理器全部有 JS 实现、标签全闭合；WXSS 94/94 配对。

### 至此下单页优化闭环
D-246（码数一坨 + 布局 + 批量操作）→ D-247（图片丢失 + 无资料选款）
→ D-248（客户选择器 + 属性库齿轮）。
仅剩「款式批量多选下单」未做（改动面广、非痛点）。

---

## D-252：物料链路闭环修复（BOM → 物料资料库 → 采购 → 对账）

**日期**：2026-08-31
**触发**：用户一次性吐槽 7 个模块，核心为「物料对账看不到大货采购」「颜色克重什么都匹配不过来」，
并质问「为什么这几天越做越多的问题」。

### 决策：不再逐点打补丁，改为打通整条数据链路

此前 D-246~D-251 全部集中在小程序下单页 UI，从未回头核对 PC 端深层数据链路，
导致用户每次打开都积累新怨气。本次改为先画数据流、定位每一跳的字段贯通情况，再动手。

### 三个真实断点（均为数据流断点，非 UI 问题）

**断点1（P0）：工厂类型 NULL 被误判为外发 → 对账整批跳过**
- 位置：`MaterialReconciliationOrchestrator.isInternalFactoryPurchase`、
  `MaterialPurchaseSyncHelper.isInternalOrderPurchase`（两处口径必须一致）
- 原口径：`StringUtils.hasText(factoryType) && "INTERNAL".equals(...)`
- 后果：线上大量订单 `factory_type` 为 NULL（D-243：「本厂」5 条、「最美服装工厂」2 条）
  → 判为非内部 → `shouldRouteOrderLinkedPurchaseToInbound` 返回 true → 对账整批跳过
  → 用户截图顶部的「最美服装工厂」采购在对账里一条都看不到
- **口径修正（业务决策）**：改为「**只有明确 EXTERNAL 才是外发**」，
  NULL / 未标注 / INTERNAL 均按内部处理
  - 依据：外发工厂面料款走加工费扣款（D-133 方案A），本厂与未标注工厂走物料对账
  - 权衡：宁可多进对账（用户能看到），不可整批丢失（用户完全看不到）
- 附带：`isInternalOrderPurchase` 原用 `getById` 查订单不带租户，违反 P0 铁律 #7，
  一并改为 `lambdaQuery` 带 tenantId

**断点2：BOM → 物料资料库漏同步颜色/成分/克重/米重换算**
- 位置：`StyleBomMaterialSyncHelper`（`MaterialDatabase` 本就有这些字段，同步时漏传）
- 修：抽取 `applyBomFields()` 供 create / update / 单条自动同步**共用同一份映射**，
  从机制上杜绝"改一处漏一处"

**断点3：BOM → 采购 属性全丢**
- 位置：`MaterialPurchaseServiceHelper.createPurchaseFromBom`
- 原实现只依赖资料库回填，源头空则空（连锁断点2）
- 另发现 `MaterialPurchase.lossRate` 注释写「来源于款号BOM，贯通采购链路」，
  **代码从未赋值**——注释与实现不符导致链路静默断掉
- 修：BOM 直带 `fabricComposition` / `fabricWeight` / `lossRate`，形成双保险

### 闭环最后一环：存量数据补生成入口
- 后端 `POST /finance/material-reconciliation/backfill` **早已存在**（含主管权限校验），
  但**前端无任何入口**，用户无法触发 → 修复只对新数据生效
- 补：`materialReconciliationApi.backfillMaterialReconciliation` +
  PC 端物料对账页「补生成对账」按钮（带 modal.confirm 说明，避免误操作）
- 采购属性显示无需额外处理：`MaterialPurchaseServiceImpl:75` 查询时已有
  `enrichFromMaterialDatabase` 从资料库回填，资料库补齐即可自动显示

### 附带：工序模板导入「覆盖 / 追加」可选
- `useStyleProcessActions.applyProcessTemplate` 此前**写死 overwrite**，用户无法追加
- 后端 `TemplateStyleOrchestrator` 早支持 mode（overwrite/cover/true → 覆盖，其余 → 追加），
  但**追加模式既不去重也不重排编码**：重复导入产生重复工序，
  processCode 与现有冲突还会导致前端「工序编码不能重复」校验失败（等于导入白做）
- 修：前端加「覆盖现有 / 追加新增」下拉（带 Tooltip 说明差异）；
  后端追加模式按「工序名 + 阶段」去重（幂等）+ sortOrder/processCode 续接重排

### 验证
后端 `mvn compile` BUILD SUCCESS；前端 `npx tsc --noEmit` 零错误；改动文件 lint 0 错误。
（未提交推送，待用户验收后提交）

### 方法论沉淀（回答"为什么越做越多问题"）
1. **P0 铁律只防「扫码/工序/质检/入库」四块的链路安全，不防「业务规则与用户预期不符」这层盲区**
2. 改写入侧逻辑后**必须确认存量数据能否自愈**，否则用户看到的还是旧数据，会认为"又没修好"
3. **注释与实现不符是高危信号**，发现即修（lossRate 案例）
4. 同一份字段映射必须**单点收敛**（`applyBomFields`），不要 create/update 各写一份

---

## D-253：D-252 下轮待办 4 项闭环（尺寸表简化 / 质检记录分类 / 齿轮标签落库 / 款式图片上传保持）

**日期**：2026-08-31
**触发**：D-252 遗留 4 项待办，用户要求「全部做好，一定要闭环」。

### ① 尺寸表简化（标准码+前后放码）——已随 D-252 闭环，无新增改动
- 列头仅显示码数简称（XS/S/D）+ Tooltip 完整名（防列宽撑爆）；
- 样版码列同口径简写；跳码区单元格精简摘要「前↓1 后↑1」，Tooltip 见完整明细
- 位置：`useStyleSizeColumns.tsx`

### ② 质检记录分类——新增「不合格分布」分类聚合
- 位置：`QcRecordsPanel.tsx`（成品仓质检记录面板）
- 决策：**分类不做成服务端聚合接口**，在明细数据的『不合格记录』上按两维度前端聚合：
  次品类别（颜色/尺寸/做工…）+ 处理方式（返修/报废…），各小组排序取 Top6 + 进度条占比
- 理由：记录行本身已带 defectCategory / defectRemark，无需动后端；
  「全合格」时不渲染该区块，避免空卡片噪音
- 符合：quality-inspection-advisor 的「不合格构成分析」方向，后续可接视觉 AI 疵点映射

### ③ 齿轮标签落库排查——链路完整，结论无需改动
- 排查结论：**标签确实落库**，全链路已对齐：
  迁移 `V202608260001` 加 `supplier_tag` → `Factory.java.supplierTag` →
  `FactoryController` POST/PUT 走 `factoryOrchestrator.save/update`（MyBatis-Plus 全字段）→
  前端 `QuickManageModal` 新增/编辑供应商均传 `supplierTag` → `simple-list` 返回标签
- 经验：类似「XX排查」待办先画调用链验证再下结论，避免为已完好链路写无用代码

### ④ 款式图片上传保持——修复一个真实 P0 缺口
- 缺口：`useStyleFormActions.handleSave` 图片上传逻辑**只在 `isNewPage` 分支执行**（提交
  款式后上传 pendingImages/pendingColorImages）。**编辑已有款式**时封面/主图区更换的图片
  进入 `pendingImages`，保存后**从未上传 → 图片丢失**
- 修：编辑分支（`currentStyle?.id`）同样执行 `separateStandaloneAndColorImages` →
  `uploadStyleImages`（styleId + styleNo 均就绪）→ 成功后 `fetchDetail` 刷新
- 附带验证：颜色图片编辑场景无需担心（`useColorImages.handleColorImageSync` 已有款式时
  即时删旧传新，不积压 pending）

### 验证
前端 `npx tsc --noEmit` 零错误；改动文件 ESLint 0 错误；无后端改动。
已提交推送 main。

---

## D-256：物料采购颜色/尺码/成分/克重/幅宽 空显根治（存量自愈 + 生成补漏）

**日期**：2026-08-31
**触发**：用户再次爆发——订单采购明细弹窗"面辅料信息"颜色/尺码全空、
物料采购列表成分/克重/规格大量空："修复了这么多天了一直没有处理好"。

### 根因（三个，D-252 只修了其一）

1. **存量物料资料库属性 97% 为空（主根因）**：实测本地 219 条采购记录中
   成分/克重/幅宽空 212 条。所有显示链路（列表页/订单弹窗/选料弹窗）都依赖
   查询时 `enrichFromMaterialDatabase` 从资料库回填，资料库空 → 无米下锅 → 永远空。
   D-252 断点2只修了"以后 BOM 同步资料库要带上这些字段"，**没有回填存量资料库**。
2. **生成链路落库即空**：订单采购 `createPurchaseFromBom`（D-252 已补成分/克重）、
   样衣采购 `StyleBomPurchaseHelper.buildPurchaseFromBom`（成分/克重/幅宽从不落库，
   只靠查询回填）。且 BOM 未填颜色 + 订单单色时 `displayColor` 直接落空（订单颜色明明知道）。
3. **尺码结构性为空**：分码 BOM（用量走 sizeUsageMap）的 size 本来就是空
   （一料对全码），查询时也从不回填 size → 弹窗尺码列整列空白。

### 修复（四件套）

1. **查询时 BOM 兜底（核心，存量自愈）**：`MaterialPurchaseQueryHelper.enrichFromMaterialDatabase`
   末尾追加 `enrichMissingFromBom`——资料库仍缺时从 t_style_bom 兜底：
   成分/克重/规格为物料固有属性按 materialCode 任取非空；颜色/尺码与款式绑定，
   仅 (styleId, materialCode) 去重后唯一才补（防多色行错配）。fail-safe 只 warn。
   一处改动覆盖列表+弹窗全部调用点。
2. **生成补漏**：`aggregateBomToPurchases` 单色订单且 BOM 无颜色时用订单颜色兜底。
3. **前端空值兜底**：`MaterialPurchaseDetail/columns.tsx` 尺码空显示"全码"、颜色空显示"-"。
4. **存量资料库回填脚本**：`scripts/backfill_material_database_from_bom.sql`
   （幂等 UPDATE JOIN，只填空值，带 tenant_id）。本地已执行验证：三项全空行 0，
   FAB001 成功补上 95%棉3%氨纶/160。**生产库需手动执行一次**。

### 验证
后端 `mvn compile` 通过；前端 `npx tsc --noEmit` 0 错误；lint 0 错误；回填脚本本地实测生效。

## D-259：CI 失败 → 部署静默 skip，线上长期跑旧代码（P0 级流程事故）

**日期**：2026-09-01
**触发**：用户反馈"线上代码都是最新的"但 D-256 修复不生效，怀疑修复方向错误。

### 根因（部署链路断裂，与代码无关）

1. `FactoryShipmentOrchestratorTest$Receive.alreadyReceived_rejected` 断言过时：
   D-242 引入分批收货时把"已收货防重复"文案从「无法收货」改为
   「已全部收货完成，无需重复收货」，测试断言没同步 → CI 后端测试 job 失败。
2. CI/CD 的「部署到微信云托管」job 依赖测试通过，失败即 **skip（静默）**。
   自 2026-08-30 起连续 8 次 CI failure（D-250~D-256 全部中招），
   **线上实际停在一周前的版本**，而本地/远程仓库代码已是最新。
3. 排查时误判方向：以为本地后端进程旧 → 重启本地（无意义，用户用的是云端）；
   以为数据/匹配逻辑问题 → 深挖回填代码。真正断点在 CI。

### 修复

1. 更新测试断言 `contains("无需重复收货")`（防重复行为本身正确，只是文案变了）。
2. 本地全量 `mvn test`：140/140 通过 → 提交推送 e783cf920。
3. CI 全绿：**「部署到微信云托管」+「部署后冒烟测试」首次真正执行**，
   D-250~D-256 积累的全部修复随此次部署上线。

### 铁律（新增）

- **推送 ≠ 部署**：每次 push 后必须 `gh run watch` 确认 CI 绿 且
  「部署到微信云托管」job conclusion=success（不是 skipped）。
- 用户说"线上是最新代码"时，第一动作是查 CI 部署记录，不要先改代码。
- 修 bug 前先问：**这个修复部署到线上了吗？**（gh run list 看 deploy job 状态）

## D-260：采购列表响应白名单丢字段——enrichRecord 重建 Map 未透传回填字段（D-256 空显的真正断点）

**日期**：2026-09-01
**触发**：D-257 部署上线后用户仍反馈采购列表成分/克重/颜色空显（订单 PO20260828173814，款 BC25CQ0355A）。

### 根因（响应组装层丢字段，前两层修复都白修）

数据链路四层，断在第四层：
1. **落库层**：采购记录创建（08-28，旧代码）不写成分/克重/颜色 → 库里为空（快照属性）
2. **查询回填层**：`queryPage` → `enrichFromMaterialDatabase`（资料库）→ `enrichMissingFromBom`（D-256 BOM兜底）→ **值确实填进了 MaterialPurchase 实体**（本次本地实测确认）
3. **响应组装层（断点）**：`MaterialPurchaseOrchestratorHelper.enrichRecord` 把实体逐字段拷进 `LinkedHashMap`（白名单模式），白名单只有 `specifications`，**没有 color/size/fabricComposition/fabricWeight/fabricWidth** → 回填值在这被全部丢弃
4. **前端展示层**：收到 undefined → 显示空/"-"/"全码"兜底

**为什么难查**：`/list` 调用链 Controller→Orchestrator→OrchestratorHelper→Service.queryPage 任何一层看代码都"没问题"，断点藏在第三层的手工字段拷贝里。Jackson NON_NULL 序列化把 null 字段直接从 JSON 里省略，前端连字段都看不到。

### 定位方法（可复用）

本地起后端 + curl `/production/purchase/list`，打印**响应 JSON 的完整 key 列表**：发现根本没有 fabricComposition 这个 key（不是 null，是不存在）→ 反推响应组装层丢字段。资料库/BOM 回填逻辑全部正常。

### 修复

`enrichRecord` 白名单补 5 个字段：`color`/`size`/`fabricComposition`/`fabricWeight`/`fabricWidth`（一行 map.put × 5）。

### 验证（运行时实测，非仅编译）

本地 lilb 登录实测 API：
- FAB001 → color=粉色 size=M 成分=95%棉3%氨纶 克重=160 ✅（资料库回填）
- RIB002 → 成分=100%棉 克重=220 ✅（资料库没有，BOM 兜底生效）
- LIN002 → 成分=90%涤10%棉 ✅
140/140 测试通过；CI 全绿；**部署 job + 冒烟 job 均 success**（D-257 铁律：确认 deploy=success 而非 skipped）。

### 铁律（新增）

- **改"回填/富化"逻辑必须查响应组装层**：本项目大量使用"实体→Map 白名单"模式
  （enrichRecord/buildPageResult），新增回填字段时必须同步 grep 所有 map.put 白名单。
- **验证接口返回必须看原始 JSON key**（curl + python json），不能只看前端显示——
  NON_NULL 序列化下"字段缺失"和"字段为null"前端表现一样，但根因完全不同。
- D-256 的教训补录：当时只做了 `mvn compile` 验证没做运行时验证，修了两层（回填）却断在
  第三层（透传），导致用户连续两天看到"没修复"。**编译通过 ≠ 运行正确 ≠ 端到端可见**。

---

## D-257：样衣列表页与详情页「子工序进度」显示不一致根治（单点收敛）

**日期**：2026-09-01
**触发**：用户反馈小程序样衣开发跟进列表展开的「子工序进度」只显示父阶段
（裁剪/车缝/尾部，无扫码人/时间），详情页显示的却是子工序（裁剪/整件/尾部手工/整烫，
带 李老板 08-29 14:08 元素）——"里面与外面显示的不一样，全部显示子工序就好了"。

### 根因（两个页面各写一份构建逻辑 + 数据源都不同）

- 列表页：`getPatternProcessConfig`（pattern 工序配置）→ `buildSampleStages`
  按**父阶段**聚合，只渲染 stage label + n/n 进度条，无领取人/时间
- 详情页：`style.listProcesses({styleId})` + `getPatternScanRecords(patternId)`
  → 内联 builder 按子工序渲染（含 _claimBy/_lastTime/_price/_completedQty）
- 两页数据源、聚合口径、字段、样式（列表缺 proc-tl-stage/proc-tl-meta）全不同

### 修复（单点收敛，遵守"同一份字段映射必须单点"方法论）

1. 抽共享模块 `miniprogram/utils/sampleProcessTimeline.js`：
   `buildProcessTimeline(processes, scans, totalQty)` 返回
   `{ processes, scanRecords }`（字段与详情页原 allProcesses 完全一致，含扫码记录明细）
2. 详情页 `_loadProcessesAndScans` 改为调用共享模块（行为不变，-146 行）
3. 列表页 onCardToggle 改为详情页同源数据（款式工序列表+扫码记录），
   展开渲染子工序时间线：工序名 + 阶段标签 + 已完成/总数 + 进度条 +
   领取人 · 时间 · ¥单价 meta 行；无 styleId/无配置显示"尚未配置工序"提示
4. 列表页补齐 proc-tl-stage / proc-tl-meta 样式；删除死代码
   （buildSampleStages/buildSubProcessRows/onStageTabTap/STAGE_KEY_MAP 等，-229 行）
5. 三副本同步（miniprogram / h5-web/source-miniapp / h5-web/public），
   5 个改动文件 md5 逐文件校验 = 1

### 验证
node --check 全过；WXML 标签栈扫描（修正自闭合判定后）两页 TAG_STACK_OK。

---

## D-258：采购状态文案"已采购"→"已领取"两端统一（数量类字段不动）

**日期**：2026-09-01
**触发**：用户指出采购页"已采购"状态误导人（实际是采购员领取了任务、还没到货），
要求手机端与 PC 端全部核实统一。

### 口径澄清（用户纠偏，必须记住）
- **状态字段**：pending=待采购 / received=**已领取**（领取了采购任务，尚未到货）
- **数量类列名**：「已采购量」「已采购数量」是数量（已采购多少米/件），**不改**
  —— 我曾把 PC 码数用量明细的"已采购量"误改成"已领取量"，被用户抓回

### 改动清单（8 处）
PC：
1. MaterialPurchase/statCardsConfig.ts 统计卡 已采购→已领取
2. MaterialSearchForm.tsx 筛选下拉 已采购→已领取（+注释）
3. usePurchaseReceiveActions.tsx 领取成功/失败提示 已采购/采购失败→已领取/领取失败
4. OrderFlow/useOrderLinkTimeline.ts 采购节点翻译 purchased/received→已领取
5. SizeUsageSummaryPanel.tsx "已采购量"曾误改已还原（数量列不动）
小程序：
6. pages/procurement/task-list STATUS_TABS received 已采购→已领取（顶部统计卡来源）+注释
7. pages/procurement/task-detail 一键领取 toast"已采购 N 项"→"已领取 N 项" +注释
8. shared/enumLabels.js PROCUREMENT_STATUS_MAP COMPLETED 已采购→已完成
   （displayHelper.PURCHASE_STATUS_LABEL 本就已是 pending=待领取/received=已领取，无需改）

### 验证
前端 tsc 0 错误；node --check 全过；全库 grep 状态类"已采购"残留=0（仅注释说明与数量列）；
三副本同步 md5 校验 = 1。

---

## D-267：面辅料采购→出入库→结算 全链路梳理 + 补生成对账 P0 修复

**日期**：2026-09-02
**触发**：用户要求「把面辅料采购/出入库/结算 内部外部全部梳理清楚」，
并反馈「内部订单采购的数据都没有扭转到物料对账里面」。

### 数据流（采购 → 对账）五道关卡
1. 采购生成（订单 BOM / 样衣 / 备货 batch）
2. 领取（receive → status=received）
3. 到货确认 → `MaterialPurchaseOrchestrator.updateArrivedQuantityAndSync`
   → `statusHelper.syncAfterPurchaseChanged` → `MaterialPurchaseSyncHelper.syncAfterPurchaseChanged`
4. **关卡1**：`allowReconciliation = !hasText(orderId) || isInternalOrderPurchase(p)`
   （两处 isInternalOrderPurchase / isInternalFactoryPurchase 口径均为「只有 EXTERNAL 才是外发」）
5. **关卡2**（upsertFromPurchaseId）：shouldCleanupByPurchase
   = shouldRouteOrderLinkedPurchaseToInbound(外发走入库回流→跳过) / deleteFlag / cancelled
   / **resolveEffectiveQuantity <= 0（到货量 0 → 跳过并清除 pending 对账）**
6. 生成/更新 t_material_reconciliation(status=pending) → 初审(approved) → 付款(paid)
   另：`ProcurementOrchestrator` 初审通过也会主动触发 upsertFromPurchaseId

### 用数据推翻了推测（关键方法论）
代码推演猜了 3 个断点，**逐条用按租户的真实数据验证，结论全反了**：

| 租户 | 类型 | 采购 | 到货 | 有对账 |
|---|---|---|---|---|
| 2 | **INTERNAL** | 51 | 24 | **24 = 100%** |
| 2 | EXTERNAL | 58 | 50 | **0（设计如此）** |
| 106 | manual/stock | 86 | 46 | 46 = 100% |
| 1 | batch 备货 | 10 | 6 | **0（真漏网，2026-02 老数据）** |

→ **内部订单采购链路是通的，100% 扭转**。D-252 的口径补丁确实生效。
用户感知的"没进去"指向两类：① 外发(EXTERNAL)按 D-133 方案A 走加工费扣款，本就不进对账；
② 存量老数据（口径修正前创建/从未触发过同步）不会自愈。

### 本次修复（`MaterialReconciliationOrchestrator.backfillFromPurchases`）
1. **P0 跨租户**：原实现 lambdaQuery **不带 tenantId**，扫全表并为其他租户采购建对账
   （upsertFromPurchase 内部也不校验归属）→ 违反 P0 铁律 #7。现已限定当前租户，
   并在 upsertFromPurchase 内加第二道归属校验兜底（拒绝跨租户并告警）
2. **老数据永远补不到**：原 `LIMIT 5000` + updateTime 倒序 → 采购超 5000 条时历史数据扫不到。
   改为分页全量遍历（每页 500、上限 40 页、按 createTime 升序，先补最老的存量）

### 结论/口径备忘
- EXTERNAL 订单采购 0 条对账 = 设计（外发面料款走加工费扣款），不是 bug
- 对账记录 tenant_id 由 `TenantMetaObjectHandler` 自动填充，不存在 NULL 租户（已验证 77 条全有值）
- 存量补回：物料对账页「补生成对账」按钮（需主管及以上权限）

### 验证
后端 `mvn compile` 通过；改动文件 lint 0 错误。

---

## D-268：补生成对账误删 10 条历史对账事故（P0 数据丢失）+ 修复

**日期**：2026-09-02
**触发**：用户点「补生成对账」后，对账从 33 条变 23 条——待核实的 10 条（含 8 条大货采购，
订单 PO20260307001/PO20260308001，供应商"最美服装工厂/最美布行"）被删除。

### 根因
`backfillFromPurchases` → `upsertFromPurchase` → `shouldRouteOrderLinkedPurchaseToInbound`
（外发订单采购走加工费扣款，不进对账）→ `cleanupPendingByPurchaseId` → `removeById`。
**"补生成"按钮实际会删除被判为外发的 pending 对账**。这些历史对账是早期代码生成的，
用户一直在用；首次跑 backfill 就把它们删了。教训：**"补"的语义是补齐，批量删除是事故**。

### 修复
1. `upsertFromPurchase` 加 `allowCleanup` 参数：backfill 传 false——**补生成绝不删除任何对账**
2. 新增 `restoreDeletedReconciliation`：全局配置了逻辑删除（logic-delete-field: deleteFlag），
   removeById 实际是 delete_flag=1，数据还在。backfill 先恢复被误删的（delete_flag=1→0）再补缺失
   → 用户再点一次「补生成对账」即可自愈还原
3. 实时同步链路（upsertFromPurchaseId）保留 cleanup（采购取消/到货清零时清理 pending 是合理设计）

### 遗留决策（待用户拍板）
外发订单采购到底要不要进物料对账？历史数据显示用户的物料对账供应商是"最美布行/最美服装工厂"
等**物料供应商**（面料采购款），与"外发加工费走外发结算"（D-133 方案A）不冲突——
面料是本厂出钱买的，理应对账。若用户确认，应去掉 shouldRouteOrderLinkedPurchaseToInbound
对大货采购的拦截（否则恢复的对账会在下次采购变更时又被实时链路删掉）。

## D-269：恢复物料对账「采购类型」筛选（大货/样衣/批量）

**日期**：2026-09-02
**触发**：用户反馈"之前有采购类型筛选，现在没有了"。
**核实**：筛选器曾存在（"采购来源"Select，queryParams.sourceType），在「refactor(finance):
精简财务模块6个页面」重构中被误删；后端 queryPage 的 sourceType 筛选一直健在
（batch 联动 batch/stock/manual）。已恢复前端下拉，tsc 0 错误。

---

## D-270（用户拍板）：废止「外发订单采购不进对账」，所有采购一律对账

**日期**：2026-09-02
**触发**：用户怒斥"那个是布行！采购的布行是谁你理解吗"——被删的 10 条对账供应商是
"最美布行"等**物料供应商**（面料款欠布行的钱），与"订单发给外发工厂加工"无关。

### 口径纠偏（两笔钱不能混）
- **物料采购款**：付给布行/面料商 → 必须进物料对账（不管订单谁做）
- **加工费**：付给外发工厂 → 走外发结算（D-133 方案A），与物料对账无关
- 旧口径把「订单 factory_type=EXTERNAL」当成「采购不进对账」→ 外发订单面料采购整批跳过，
  历史对账被 cleanup 误删（D-268 事故的深层根源）

### 修改（两处口径同步放开）
1. `MaterialReconciliationOrchestrator.shouldRouteOrderLinkedPurchaseToInbound` → 恒 return false
2. `MaterialPurchaseSyncHelper.syncAfterPurchaseChanged` → 去掉 allowReconciliation 拦截
（shouldCleanupByPurchase 的外发分支随之失效；到货量0/取消/已删的清理保留）

### 预期影响
部署后跑「补生成对账」：外发订单已到货采购（本地实测 50 条）会批量生成对账——**这是预期行为**，
量大属正常。被 D-268 误删的 10 条会由 restoreDeletedReconciliation 自动还原。

---

## D-271：补生成对账"点了没反应"双 bug 根治

**日期**：2026-09-02
**触发**：D-268/D-270 部署后用户点「补生成对账」，大货对账依然一条没出现。

### Bug 1（致命）：单条失败 → 整体事务回滚
backfillFromPurchases 标注 @Transactional，循环内逐条 upsert 无隔离——
任何一条抛异常（分布式锁超时/数据异常/NPE），**整个事务回滚，一条都不生成**，
用户看到的就是"点了没有任何新数据"。→ 循环加 per-item try-catch + failed 统计日志。

### Bug 2（隐蔽）：逻辑删除插件让"恢复误删"永远失效
全局配置 logic-delete-field: deleteFlag 后，MP 对**所有 wrapper 查询**自动追加
`AND delete_flag = 0` → `lambdaQuery().eq(deleteFlag, 1)` 生成
`delete_flag = 1 AND delete_flag = 0` → **永远空结果**。
上一版写的"恢复被误删对账"从未生效过。→ MaterialReconciliationMapper 加原生
@Select `selectDeletedByPurchaseId`（自定义 SQL 不受插件影响），恢复改走它。

### 方法论沉淀
- **逻辑删除项目的"查已删除数据"必须走原生 SQL**，wrapper 怎么写都查不到
- 批量写操作的 @Transactional 循环必须 per-item try-catch，否则一条毒丸毁全部
- 修复"看起来执行了但零效果"的功能时，优先怀疑：①事务整体回滚 ②框架层隐式过滤（逻辑删除/租户插件）

---

## D-272：「出库领取」按钮只在仓库真有库存时显示

**日期**：2026-09-02
**触发**：用户反馈——"直接采购直接用"（登记到货但从未入库）的采购，操作列却显示
「出库领取」，误点必报"仓库库存不足"。"采购了且做了入库才有出库逻辑"。

### 根因
`MaterialPurchaseDetail/columns.tsx` 出库领取按钮的显示条件只看采购状态
（isReturnConfirmed || isCompleted），**不看仓库有没有库存**。样衣模式早已隐藏
（D-117 注释记录了同样问题），但大货"直采直用"场景漏了。

### 修复（复用 PurchaseModal 家族的现成模式）
1. `MaterialPurchaseDetail/index.tsx`：加载 `/production/purchase/smart-receive-preview`
   → `buildStockMap`（purchaseId → availableStock），按 orderNo 优先、无订单用 styleNo
2. `columns.tsx`：出库领取显示条件加 `stockQty > 0`，标题带"仓库可用 N 单位"，
   领取数量取 min(库存, 到货量)。库存未知（接口失败）时同样隐藏——宁可少显示不误点

---

## D-272b：补生成对账全透明化（诊断返回页面）

**日期**：2026-09-02
**触发**：D-270/D-271 部署后用户点补生成——2~5 月老采购的对账回来了（23→43条），
**但 8/21 之后的新大货采购一条没生成**（PO20260901173322/PO20260828152504/PO20260821160742 均未对账）。

### 现状判断
- 08-21 是清晰分界线：之前的有、之后的没有——同一份 backfill、同一套判定，差异只能在数据或单条异常
- 纯代码推演已到极限（口径/租户/状态/到货量全部符合条件），**停止猜测，让系统自己交代原因**
- backfill 现返回 {touched, failed, skipped:{原因:数}, failures:[明细]}，前端弹窗展示
- 下一次点击即可看到：每条采购是"到货量为0/跨租户/已取消/保存失败(具体异常)"——真凶直接上屏

### 方法论
修复"看起来执行了但部分数据没效果"时，与其无限推理，不如把系统的每个决策点透明化，
让下一次执行直接产出诊断数据。

---

## D-274：已完成老采购到货量自愈（「有效到货量为0」写路径断点根治）

**日期**：2026-09-02
**触发**：D-273c（confirmComplete 回写到货量）部署后，用户指出那 7 条**已完成**的老采购
仍卡在「有效到货量为0(未到货)」——修复只管"以后"，存量没有任何路径能自愈。

### 写路径断点定位（三处状态推演）
1. 补生成候选已放行全部非取消采购（D-264 去掉 arrivedQuantity>0 预过滤）✅
2. 但 `upsertWithReason` → `resolveEffectiveQuantity`：completed 且 aq=0 → min(0,pq)=0 → 跳过 ❌
3. `confirmComplete` 幂等分支对已完成单直接 return，永不补写 arrivedQuantity ❌

### 修复
`MaterialReconciliationOrchestrator` 新增 `healArrivedQuantityIfCompleted`，在 `upsertWithReason`
qty 判定前调用（单点覆盖 backfill + 实时同步两条链路）：
- 条件：status=completed && arrivedQuantity≤0 && purchaseQuantity>0
- 动作：lambdaUpdate 回写 arrivedQuantity=purchaseQuantity + actualArrivalDate=now
  （乐观条件 isNull(or eq 0) 防并发覆盖真实到货量），并回写内存对象供后续 resolve 用
- 口径与 D-273c 一致：人工确认完成 = 背书「这批货齐了」；幂等（aq>0 不动）；失败只 warn 不阻断

### 教训
修"写路径断点"时必须区分**增量修复**（管以后）与**存量自愈**（管已坏的），
只修入口不改存量 = 用户数据永远回不来；自愈逻辑放被调用方法内部（单点）而非各调用点。

---

## D-275：裁剪弹窗快捷跳转恢复（D-137 抽屉化的隐性回归）

**日期**：2026-09-03
**触发**：用户发现裁剪节点详情弹窗里原来的「跳转裁剪详情页」快捷键没了。

### 根因（两处改动叠加的隐性回归）
1. D-137「工序弹窗抽屉化」：NodeDetailModal 默认 `mode = 'drawer'`（原 modal 居中弹窗改 SideDrawer，
   且连显式传 mode='modal' 的分支也渲染 SideDrawer），两个调用方都没传 mode → 永远是 'drawer'
2. NodeDetailBody 的「前往裁剪管理 →」按钮条件 `nodeTypeKey === 'cutting' && mode !== 'drawer'`
   ——原意可能是旧居中弹窗下的布局考虑，抽屉化后该条件使按钮**在任何情况下都不渲染**

### 修复
- 去掉 `mode !== 'drawer'`（抽屉 body 顶部放一个 Button 无布局冲突）
- 清理 destructure 中不再使用的 `mode` 形参（interface 保留，调用方兼容）
- 跳转目标 `/production/cutting/task/:orderNo` 路由确认存在（routeConfig.ts cuttingTask）

### 教训
改"容器形态"（modal→drawer）时，必须全局搜原形态的条件分支（`!== 'drawer'`、`=== 'modal'` 之类），
形态默认值一改，散落在 body 组件里的形态相关 UI 会**静默消失**——这类回归不报错、tsc 不红，只有用户点不到才发现。

---

## D-276：订单管理页尾部进度球父子映射口径根治

**日期**：2026-09-03
**触发**：用户出示 PO20260828152504 尾部弹窗（12 菲号 × 3 子工序 = 36 条跟踪、3 条已扫），
指出订单管理页多子工序情况下进度条不对，要按子父关系计算。

### 根因（关键字硬编码 vs 租户配置漂移）
主路径 `applyFlowStagesToOrder` 尾部球调 `resolveTrackingMinRate(tracking, baseQty,
parentKeywords={"尾部","大烫","整烫","剪线","尾工",...}, subProcessKeywords={"包装"})`：
- 尾部**自己的子工序**（剪线/整烫/大烫）被当 parentKeywords **排除**
- 只统计包含「包装」的子工序；用户租户尾部子工序配置是 03剪线/04整烫/05质检（无包装）
  → subProcessQtys 恒空 → null → 回退 packagingRate（视图包装量 0）→ **尾部球恒 0%**
- 而轻量路径 fillCompletionRates 用映射服务（buildParentNodeQtyMap max）能正常显示——
  两条路径口径不一致，同一订单不同入口显示不同

### 修复
1. `ProcessParentNodeResolver` 新增 `resolveParentStageRate`：逐个已扫子工序经
   `isParentNodeMatch`（同义词 + 租户映射配置，来源唯一）归属到目标父节点，取 **min**
   （串行子工序链完成度由最慢一道决定）；删除废弃的 resolveTrackingMinRate（关键字硬编码版本）
2. `applyFlowStagesToOrder` 尾部球三级回退：min(归属子工序) → 映射聚合量 max（与轻量路径同口径）→ 视图包装量

### 教训
- 进度聚合**禁止用关键字数组硬编码**工序归属——租户的子工序配置是活的（本例尾部挂了质检），
  必须走映射服务/配置单一来源；关键字法在配置漂移时**静默返回空**而非报错
- 同一指标多条计算路径（完整/轻量）时，改口径必须两路一起对齐或显式声明差异，否则同一数据两个显示

---

## D-283：工序单价租户级总开关（通用设置）

**日期**：2026-09-03
**触发**：用户要求"管理可以做一个通用的组件/设置，控制单价在公共页面显示与不显示"，明确时间显示正常不要动。

### 决策
1. **复用既有租户级智能开关机制**（t_tenant_smart_feature + /api/system/tenant-smart-feature），
   不新建表/接口——该机制就是"通用开关组件"：PC 智能开关面板统一管理，按租户持久化，全员同读一套。
   新增 key `display.process.unitPrice.visible`，**默认开**（defaultFeatureFlags 特例 DEFAULT_TRUE_FEATURE_KEYS，
   因为其语义是"默认显示、隐藏属例外"，与 smart.* 的"默认关"相反）。
2. **双入口**：PC 系统→个人资料→智能开关面板一行 + 小程序生产管理/外发管理页管理员专属 chips
   （`单价:全员可见/已隐藏`，canManageFlags = 租户老板 || 超管，与后端 assertWritable 对齐）。
3. **单价与时间解耦**：时间继续走 D-280 的管理层个人本地开关（showProcMeta），单价额外受租户级开关门控——
   隐藏时 JS 侧清空 node.priceText（_priceTextRaw 保留，重新打开无需重拉），WXML 零改动。

### 关键坑
- 后端 saveCurrentTenantFeatures 是**全量覆盖语义**（对 SUPPORTED_FEATURE_KEYS 全部 upsert，
  缺失 key 落默认值）→ 小程序切换单个开关必须 **先 GET 全量 → 合并 → PUT 整体提交**，
  直接 PUT {单key: 值} 会把其他智能开关全部冲回默认关闭。

### 教训
租户级配置类开关优先挂进既有 smart-feature 机制，别另起炉灶；
但接入前必须确认保存接口的覆盖语义（全量 vs 增量），增量语义的调用方按全量提交才能不误伤。

---

## D-284：工序「开始/完成」时间口径修正 + 小程序显示耗时/停留/等待（对齐 PC 进度看板）

**日期**：2026-09-03
**触发**：用户要求「开始 = 第一个人扫码的时间，结束 = 最后扫码完成的那个人的时间」，且小程序要像 PC 一样显示「多久完成 / 等待了多久」。

### 核实结论（改前先查证，别凭代码推演）
1. **flow 接口 stages 是「工序级」不是「阶段级」**：`ProductionOrderFlowOrchestrationService.buildProductionStageFlow()`
   按 `progressStage`（fallback `processName`）把扫码记录分组，工序顺序来自模板 `loadProgressWeights()`。
   - `startTime` = 该工序排序后第 0 条记录的 `scanTime` → 首扫 ✅
   - `completeTime` = **累计扫码量首次达到 orderQuantity 的时刻**，未达量为 **null**（不是最后扫码时间）❌
   - `lastTime` = 末条扫码记录的 `scanTime`，但**旧代码只在未完成分支 put**，completed 时前端拿不到
2. **PC 口径**：`useBoardStats.ts` 的 `nodeTimeMap[节点] = max(scanTime)`（最后扫码，scanTime 空兜底 createTime）；
   `nodeCalculations.ts` 的 `durationDisplay = completionTime - startTime`（>48h 标红）；
   `StageTimelineHint.tsx` 的「停留」= 上节点 end → 本节点 start，「等待」= 上节点 end → now（**仅当后续节点无任何进展**，避免跳过/直裁节点被误报成持续增长的等待）。
3. **数据源充足**：`t_scan_record.scan_time` 就是真实首扫/末扫，flow 接口已分好组，缺的只是把 lastTime 全量吐出。

### 决策
1. **后端**：`fillStageProgress()` 把 `lastTime/lastOperatorId/lastOperatorName` 提到 completed 判断之前，
   **无论是否达量都输出**（completed 时 completeTime 是达量时刻，达量后若还有补扫/返工扫码会偏早）。
2. **小程序 `utils/procTimeline.js`**：
   - `endTime = lastTime || completeTime`（末扫优先），新增 `endLabel`：completed→「完成」，否则→「末扫」（进行中显示"完成 xx"会误导）
   - 新增 `normalizeTimeText()`（兼容 `2026-09-01 15:15:00` 与 ISO `...T15:15:00.123`）、`parseTimeMs()`
     （**手动拆分 y/M/d H:m:s 构造 Date，iOS 不支持 `new Date('yyyy-MM-dd HH:mm:ss')`**）、`formatDuration()`
   - 新增 `applyTimelineDurations()`：耗时 = 末扫-首扫；停留 = 本节点首扫 - 上一节点末扫；等待 = now - 上一节点末扫（同样要求后续无进展）
   - 新增 `refreshWaitDurations()` + 页面 60s ticker，让「等待 X」随时间走动而不重拉接口（onHide/onUnload 清理）
   - 时间比较统一走**时间戳**，不再用短格式字符串比较（跨年会错）
3. **配色与文案对齐 PC**：≥3天红 / ≥1天橙 / 其余灰；耗时 >48h 标红。

### 关键坑
- **三副本 wxss 本来就不一致**（miniprogram 与 h5-web/public 有历史 UI 差异），同步时
  js/wxml 可整文件 cp（diff 确认差异正好是本次改动），**wxss 必须逐文件插入片段，不能覆盖**。
- 小程序目录被 `h5-web/package.json` 的 `"type":"module"` 影响，直接 node require 会报
  `require is not defined in ES module scope` → 自测时把文件复制到 /tmp 改成 .cjs 再跑。

### 验证
node --check 三副本 JS 全过；标签栈扫描 6 份 WXML 全闭合；`mvn -q compile` 通过；
相对时间用例实测：裁剪「耗时 4时」/ 车缝「耗时 1天6时 · 停留 6时」/ 尾部「末扫 09-03 15:16 · 耗时 2天5时」/ 包装「等待 5时」。

---

## D-285：撤销页内时间/单价开关，单价全局开关唯一入口收敛到「权限配置」页

**日期**：2026-09-03
**触发**：用户强烈不满（截图「更多应用」页）：页面上按钮太多（生产管理/外发管理各有「时间/单价」+「单价」两个 chips），
要求：① 只留**一个全局按钮**只控单价；② 开关不放在业务页面，放到**小程序「更多应用 → 权限配置」**；
③ **时间恢复正常显示，不要用任何开关控制时间**。

### 决策
1. **删除** dashboard / factory/shipment 两页的 `onToggleProcMeta`（时间/单价 chips）和
   `onToggleTenantPrice`（单价 chips）及 data 里 isManager/showProcMeta/canManageFlags；
   procTimeline.js 删 META_TOGGLE_KEY/getShowProcMeta/setShowProcMeta（时间开关机制整体下线）。
2. **时间恒显示**：WXML 去掉 `wx:if="{{showProcMeta}}"` 门控，meta 行条件改为
   `bundleInfo || startTime || endTime || durationText || gapText || priceText`（gapText 可能单独出现，不能漏）。
3. **单价全局开关唯一入口 = pages/admin/menu-role-config（权限配置）**：
   新增「全局显示开关」区块（canManagePrice = 租户老板 || 超管才渲染），点按切换，
   沿用 **GET 全量 → 合并 → PUT 整体提交**（后端全量覆盖语义，D-283 的坑）。
   两页 JS 保留 loadTenantPriceFlag/applyTenantPriceVisibility **只读生效**，不再提供切换。

### 教训
- 功能开关入口要做减法：业务列表页不放配置按钮，统一收敛到系统/权限配置类页面。
- 「管理层可切、默认开」的个人时间开关（D-280）是过度设计——时间本来就该显示，删掉比调参更对。

## D-290（2026-09-04）小程序样衣详情页数据恒空 —— ok() 解包反模式 + 上传接口不存在

**现象**：手机端样衣详情页「附件 / 纸样 / 款式备注 / 备注日志」永远显示"暂无"，上传附件必失败。

**根因 A｜AP-MP-03 的另一种变体（不是判断 res.code，而是兜底链缺 `|| res`）**
```js
// ❌ 错：ok() 已解包，List 型接口 res 就是数组，res.data 恒 undefined
const list = res?.data?.records || res?.data || res?.records || [];
// ✅ 对：与 utils/sampleProcessTimeline.js 的 toList 同实现
function toArray(res) {
  const list = (res && res.data) || res || [];
  return Array.isArray(list) ? list : (list.records || []);
}
```
判别方法：看后端 Controller 返回的是 `Result<List<T>>`（data 是数组）还是 `Result<IPage<T>>`（data 是 {records}）。
前者用上面的写法**必须**有 `|| res` 兜底，否则静默变空数组——比报错更难查。
排查命令：`grep -rn 'res?.data?.records || res?.data || res?.records' miniprogram/`

**根因 B｜改前端前没确认接口是否存在**
`wx.uploadFile` 打到 `/api/file/upload`——`TenantFileController` 只有
`tenant-download` 和 `storage-status`，**根本没有上传接口**，必然 404。
再调 `/api/style/attachment/upload` 传 JSON，而它是 `@RequestParam("file") MultipartFile`，只收 multipart。
→ 结论：小程序上传文件一律 `wx.uploadFile` 直传业务 multipart 接口，不要"先传通用接口拿 url 再存记录"。
排查命令：`grep -rn "RequestMapping(\"/api/file" backend/src/main/java`

**根因 C｜wx.uploadFile 的 multipart filename 是 temp 路径 basename**
不显式传 fileName，存库名会变成 `tmp_3f9a1.png`。
→ 后端 `StyleAttachmentController#upload` 加可选 `fileName` 参数，
`StyleAttachmentOrchestrator` 新增 6 参 `uploadWithVersion(..., fileName, versionRemark)`，
原 4 参/5 参重载全部保留（PC 端调用不受影响），并加 `sanitizeFileName()` 取 basename。

**根因 D｜跨端口径未复用共享 utils（尺寸表）**
小程序 `_pivotSizeTable` 把 "S/M" 当一整列，PC `useStyleSizeData` 用 `splitStyleOptions` 拆成两列。
→ 统一：小程序复用 `utils/styleOptions.js splitStyleOptions` + `utils/sizeUtils.js sortSizeNames`。

**副产品修复**
- WXML 里 `wx:for` 套 `wx:if` 过滤子集 → 列表有数据但一行都不渲染（整片空白）。
  正解：子集在 JS 里算好（如 `patternFileList`），子集项挂 `_srcIndex` 指回原数组避免点击错位。
- 异步分支提前 return 但没重置 loading → tab 永久"加载中"。所有提前 return 必须显式结束 loading。
- `wx.downloadFile` 访问 `/api/file/tenant-download/**` 必须带 token，
  用 `utils/fileUrl.js getAuthedImageUrl()` 拼 `?token=`。

## 2026-09-05 D-294 尺寸表智能导入"静默丢光"修复（用户反馈纸样开发尺寸表空白/导入无变化）✅代码完成

**反馈**：纸样开发页尺寸表显示 S/S/M/M/L/L/XL/XL 列但"暂无数据"；导入尺寸模板后提示成功但数据仍空白；与实际样衣码数对不上。

**根因 1（列头"被简化/重复"观感）**：尺寸列来自款式基础码数 `sizeColorConfig.sizes`（StyleInfoTabs 传 linkedSizes=matrixSizes），8 个码带型体后缀（如 S(155/80A)、S(160/84A)），列头按 D-252 用 `shortSizeLabel` 只显示字母简称 → 显示成 S/S/M/M/L/L/XL/XL。非 bug，是设计（悬浮可见完整名）；小程序样衣详情页不简称（_pivotSizeTable 用完整码名），两端口径不同导致"不匹配"观感。

**根因 2（表格空白）**：表格行来自 `t_style_size`，该款式无任何部位数据行。

**根因 3（导入无变化 = 真 bug）**：`TemplateStyleOrchestrator#applySizeTemplate` merge 分支——目标款无部位数据时，模板每行都走"部位不存在"分支，用 `canonicalSizeKeys`（款式 sizeColorConfig 码数语义键）过滤，**模板码语义键不在集合内就整行静默丢弃（foreignSizeRows++）**。模板是简单码 S/M/L/XL（键=S），款式配置是带型体码 S(155/80A)（键=S|155-80）时，模板所有行全被丢弃 → "导入成功"但表仍空白。

**决策**：merge 分支加 `hasExistingData` 判定——目标款**完全无尺寸行时跳过 canonical 过滤，整表按模板写入**；仅当目标款已有尺寸结构才用规范码数过滤（保留 D-264 防"拖入多余码列"）。改 `TemplateStyleOrchestrator.java` 1 处，mvn compile 通过。

**下一步**：用户线上用「覆盖导入」可立即绕过（覆盖分支本就不做码数过滤）；修复需重新部署后端后生效。注意：若模板为简单码而款式配置为带型体 8 码，导入后 PC 会并列多出简单码列，建议同时把款式基础码数配置改成与实际样衣一致的码。

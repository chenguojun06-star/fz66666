# 进度跟踪

> 本文件由 AI 助手自动维护，记录项目开发进度
> 最后更新：2026-08-27（D-167 裁剪管理码数矩阵防重叠）

## 已完成

### 2026-08-27 D-167 裁剪管理码数矩阵防重叠 ✅

- [x] sku-matrix compact 模式根因：flex:1+min-width:0 列可无限压缩，"XS/155"类长标签码数一多互相叠压成乱码
- [x] 改横向滚动表格：列 flex 不收缩+最小 88rpx，码数少时均分铺满、多时横滑不重叠；灰底表头+行发丝线+数字等宽
- [x] 数量明细卡：床次/操作人/编菲时间三行归入灰底圆角面板，与矩阵表格清晰分区
- [ ] 待真机验收：扫码确认页"下单明细"同组件同步受益

### 2026-08-26 D-166 顶部筛选标签统一32px ✅（已推送 ef733f3a0）

- [x] 样衣开发状态标签22px/10px字→32px/13px+边框；外发管理28px/12px→32px/13px
- [x] 全站盘点：采购/退货/瑕疵/生产管理等其余页面已是32px标准，无需动

### 2026-08-26 D-165 全站图片全景显示 ✅（已推送 1b47aa57d）

- [x] 49处商品/款式/物料/凭证图 aspectFill→aspectFit（完整显示+两侧留白）
- [x] 头像3处保留圆形裁剪（行业惯例）

### 2026-08-26 D-164 样衣任务数量模式+裁剪分类对齐 ✅（已推送 6c02f0f1e，需重启后端）

- [x] 样衣扫码累计报工护栏：同钥匙(工序名优先/否则操作类型)已报+本次>任务数量拒绝并提示剩余可报；撤销扫码释放额度；PC/小程序同端点都覆盖
- [x] 小程序确认页：数量限剩余可报+显示'已报X/任务Y·可报Z'
- [x] 裁剪管理订单分类对齐PC任务三态(cuttingTask.status pending/received/bundled)
- [ ] 待真机验收：多件样衣多人分批报工到任务数即拦截；裁剪三段与PC一致

### 2026-08-26 D-163 裁剪三段判定修正 ✅（已推送 056a730e2）

- [x] 裁剪中=已编菲且cuttingEndTime为空；已完成=cuttingEndTime已回填或订单已过裁剪工序
- [x] 修D-162把已编菲订单全归裁剪中的过度归类（用户指出：裁剪完成的应该是已完成）

### 2026-08-26 D-162 小云待办同款合并+待裁剪分类 ✅（已推送 4ca7b20ee）

- [x] 小云待办采购：分组键补styleNo兜底（样衣行无orderNo/patternProductionId时同款里料/主面料/口袋布各一条）→同款合并一条
- [x] 裁剪管理待裁剪分类：已生成菲号(扎数>0)归裁剪中，不再因泛化production/in_progress状态永远显示待裁剪

### 2026-08-26 D-161 待采购僵尸行+裁剪领取归位 ✅（已推送 85619f9a8，需重启后端）

- [x] 待采购数据bug根因：样衣采购回料确认只设returnConfirmed=1（回料数量0时状态仍PENDING），
  getMyTasks无主分支不查该字段→回料确认完永远显示待采购；补两道过滤（returnConfirmed排除+样衣生产已完成/作废排除）
- [x] 撤独立裁剪任务页（D-160），领取动作并入裁剪管理页：无订单参数进入时顶部待领取横条，领取后直接进该订单编菲
- [ ] 部署验证：手机端待采购列表不再出现已完成样衣；裁剪管理页顶部可领取

### 2026-08-26 D-160 手机端裁剪任务领取 ✅（已推送 c158aed7e）

- [x] 新增裁剪任务页：我的任务列表(全部/待领取/已领取)+领取动作(cutting-task/receive)
- [x] 已领取任务'去编菲'跳裁剪管理页复用其现有按扎自动分扎（不重复实现编菲表单）
- [x] 首页工作台新增'裁剪任务'入口
- [ ] 待真机验收：领取→编菲→菲号出现在裁剪管理页

### 2026-08-26 D-159 料卷扫码补操作日志 ✅（已推送 d1acb9f4b）

- [x] 料卷发料/退回原来只有slf4j无操作留痕→接recordOperation写t_operation_log
- [x] 扫码能力矩阵盘点：物料出库(发料)/退回入库/到货登记✓；成品入库=质检流程✓、出库=出货扫码✓；裁剪页查看为主；采购页当前页扫码匹配✓

### 2026-08-26 D-158 样衣开发页扫码闭环 ✅（已推送 3bac8ceae）

- [x] 详情页新增'工序扫码'按钮：复用PatternScanProcessor流水线→跳确认页→executeScan(SAMPLE)后端委派
- [x] 两个扫码入口（主扫码页/样衣开发页→详情页）逻辑闭环

### 2026-08-26 D-157 样衣扫码"未匹配到菲号"根治 ✅（已推送 bf4e48c1d，需重启后端）

- [x] 根因：/scan/execute按scanType分发，样衣工序scanType=quality/warehouse的环节进大货菲号查询（仅production入口有SAMPLE路由）→三入口统一isSampleScanContext委派样板链路
- [x] 样衣扫码页"菲号信息"→"数量信息"；未配置开发工序的款显示默认流程提示条
- [ ] 待真机验收：样衣QR扫码→按工序领取全流程；无配置款显示提示

### 2026-08-26 D-156 质检/样衣码/仓库选择三修 ✅（已推送 cf3fa993d）

- [x] 质检入库页恢复'详情'入口（navigateToInspect在钩子未接UI，抽屉化时丢了）
- [x] 样衣QR难扫根因：72/80px屏显+45字符JSON→140px+纠错M（展开区+阶段抽屉）
- [x] 小程序质检选仓库：26px小chip→3列网格40px触控
- [ ] 待验收：手机扫屏上/打印的样衣QR；质检入库操作列出现'详情'；小程序选仓库好点

### 2026-08-26 D-155 洗水唛偏移可调+条码批量打印 ✅（已推送 8f5613a9f）

- [x] 款式洗水唛Tab距剪口偏移写死30mm→可调（生产端弹窗本就走共享面板可调）
- [x] 条码打印支持多尺码批量（全选/仅当前/点选），一次打完整色所有码
- [x] 顺带修复：跳码区抽屉size属性传数字被antd忽略致378px（D-154, a0bf11ec2）

### 2026-08-26 D-153 供应商三连修 ✅（已推送 c84329a5e，需重启后端+Flyway迁移）

- [x] 供应商删除400：后端强制操作原因留痕而前端没传→弹窗收集删除原因+透出后端错误
- [x] 供应商标签：Factory.supplierTag(V202608260001)+维护弹窗下拉+列表/下拉显示——区分外发工厂/布行
- [x] BOM库存检查误判：用量未填需求=0，0>=0误判充足→新增no_usage'未填用量'(check-stock+stock-summary两处)
- [ ] 部署验证：删除供应商填原因成功；新物料检查显示'未填用量'

### 2026-08-26 D-152 左右布局左侧目录统一组件 ✅（已推送 95589169d）

- [x] 新建全局组件 components/common/SideCardPanel：岗位管理卡片式标准（头部/卡片条目/灰字指标/悬停操作/选中徽标/树形展开）
- [x] 四页接入：岗位管理（标准出处重构）、人员管理部门树、组织架构树、合作方工厂树；删废弃TreeItem.tsx
- [x] 盘点结论：弹窗内无真左目录布局；今后左右布局页面/弹窗统一用此组件

### 2026-08-26 D-151 组织架构左树+个人中心分区 ✅（已推送 abf58b88b）

- [x] 组织架构左树：节点彩色标签堆(人数/子部门/审批人3个Tag挤220px)→两行结构（名称行+灰字指标行），面板加宽240px
- [x] 个人中心：用户信息/修改密码/工厂信息裸div→标准Card分区；头像主题卡误用filter-card→标准Card；网格间距统一
- [ ] 待用户验收两页观感

### 2026-08-26 D-150 岗位权限界面优化+人员管理内联编辑 ✅（已推送 e32130387）

- [x] 岗位管理：修权限矩阵文字重叠（根因：前缀固定92px绝对定位，长前缀压复选框→改弹性排布）；数据权限栏收窄230px、菜单权限占满；复选框14px+点击区加高
- [x] 人员管理：部门列内联下拉（树拍平缩进）、岗位列点击编辑，PUT部分更新+操作留痕（与快速切角色同模式，后端null保留原值已核实）
- [ ] 待用户验收：岗位管理重叠消失/比例合适；人员表直接调部门岗位

### 2026-08-26 D-149 用户审批页归标准+Alert无效API修复 ✅（已推送 700aeaaf8）

- [x] 审计结论：人员管理/岗位管理两页结构与样式已符合标准（分栏容器6px=全局antd标准，不动）；用户表格列/岗位面板/权限矩阵质量良好
- [x] 用户审批页：旧Card骨架→PageLayout；修两处<Alert title>无效API（文字从未显示过）
- [x] 小程序收尾批：11页卡片边距归一
- [ ] 待续：其余系统页（字典/日志/组织树/合作方）按同标准巡检

### 2026-08-26 D-147 详情页整洁第三批 ✅（已推送 90303eca6）

- [x] 八个详情页（样衣/采购/订单/成品库存/发货/退货/裁剪菲号/质检）卡片边距归一14px，订单详情卡内线改发丝色
- [ ] 待用户开发者工具验收；后续按需继续：剩余列表页/设置类页面

### 2026-08-26 D-146 手机端整洁第二批 ✅（已推送 c388ad84f）

- [x] 工作台考勤卡重排三行（标题/三格时间区/按钮行36px档），全页卡距统一
- [x] 共享order-card.wxss修正（边距14px/发丝线/按钮圆角统一）——采购列表等复用页同步受益
- [x] 扫码确认页卡距统一
- [ ] 第三批：详情页（样衣/采购/订单）结构整治，待用户验收本批

### 2026-08-26 D-145续 小程序历史改版检查点入库+全量令牌化 ✅（已推送 309476067）

- [x] 核实：工作区2.5万行=7月未提交的界面改版（最后小程序提交停在6/9 v1.3.0），用户实际使用一个月的就是这套代码；四项核实全过（JS语法/页面注册/组件引用/括号配对）后入库推送
- [x] 72个wxss全量字号收编tokens（渲染值不变）；25文件按钮高度归一四档（28/36/44/50）
- [ ] 待续批次：详情页/工作台/扫码确认/采购列表按整洁层工具类逐页结构整治

### 2026-08-26 D-145 手机端整洁化第一批 ✅（已推送 ebd2e96bc）

- [x] 样衣防重复领取服务端兜底；工序选项"第一个未领取"逻辑核实已存在
- [x] 样衣开发卡整治+app.wxss整洁层工具类
- [ ] 待续：工作台/采购/订单/扫码页逐批套用（每批用户验收）

### 2026-08-26 D-144 拆菲全链路审查+加固 ✅（已推送 091a36579）

- [x] 审查：拆菲模型与用户规则一致（当前工序拆分/后续工序原菲原数量/工资随跟踪转移/防护与撤销完整）
- [x] 修：completed子菲操作人保留原工人A；requestSplit防重复PENDING
- [ ] 待真机回归：拆菲→B确认→双方扫码→下工序扫原菲号

### 2026-08-26 D-143 裁剪菲号补全 ✅（已推送 759682e9b）

- [x] 生成扎时写入菲号=床号-扎号（大货+样衣两链路）；前端列改名菲号+存量兜底
- [ ] 重启后端后新裁剪订单菲号落库；存量订单靠前端兜底显示

### 2026-08-26 D-142 财务总览营收口径对齐+趋势图线条化 ✅（已推送 ec485305e，待重启后端验收）

- [x] 总营收/按月趋势三处口径对齐F-2（创建即计），顶部卡与现金流图数字一致
- [x] 现金流趋势黑柱→5条平滑线渐变面积；按月趋势CSS叠条→ECharts双线；饼图SVG黑色修复
- [ ] 待重启后端验证营收数字与图表一致性

### 2026-08-26 D-141 手机端僵尸待采购根治+订单详情图片轮播全局化 ✅（已推送 8cb871252，待真机验收）

- [x] getMyTasks 无主待领取行按订单有效性过滤（僵尸待采购根治）；已回料确认行禁编辑/删除兜底
- [x] bellTaskLoader iOS new Date 空格格式转 T（两处）
- [x] 全局 ImageCarousel 组件：箭头常显+遮罩禁指针事件，根治悬停按钮消失/闪烁；订单详情接入
- [x] 订单详情布局：图片列 340→240，中间颜色尺码商品编码区加权 1.7，矩阵列宽/字号调大
- [ ] 待真机验证：手机端采购列表干净、详情不空白、小云待办同步；订单详情悬停不闪

### 2026-08-26 D-140 仪表盘视觉层级重排+专业性展示补齐 ✅（tsc/build 全过，待浏览器验收）

- [x] 接入三个闲置后端接口：交期预警/品质统计/延期环节 → 新增 DeliveryAlertCard、QualityStatsCard、ProductionBottleneckCard 三卡（专业指标区一行三列）
- [x] TopStats 层级重排：26px 大数字主视觉+中性色统一，日/周/月/年降为次级信息
- [x] 布局重排：趋势双图并排等高；延期表(2fr)+右列(最近动态/快捷入口叠放,动态卡内部滚动对齐底边)；间距统一 20px；antd 卡头加左竖线与自定义卡头统一
- [x] 修 ECharts canvas CSS 变量颜色 bug 5 处；修 QuickEntry 设置空白按钮
- [x] 删死样式约 300 行 + 零引用的模块根 styles.css；动效收敛（去 rotateZ/scale/光泽扫过）
- [ ] 待用户浏览器验收：三张新卡数据正确性与整体观感

### 2026-08-25 D-136 工厂结算差额滚存+回写修复 ✅（tsc/mvn/flyway 全过，待部署验证）

- [x] 修订单结算付款回写ID错位（bizId=工厂ID vs settlementId=订单ID）——付款后订单正确变 paid，杜绝下月重复推送重复付款
- [x] t_deduction_item 加 settle_flag（V202608250005）；create-payable 接收 deductionIds 标记已抵扣
- [x] 工厂汇总：只算未抵扣扣款；已付订单的未抵扣扣款作为[上期结转]并入同厂清单（滚存）；返回抵扣明细清单
- [x] 终审弹窗改抵扣清单勾选（取消勾选=本期不抵扣自动滚存），金额随勾选联动可微调
- [ ] 部署后验证：付款→订单变paid→下月汇总不再含该批订单；扣款>加工费差额下月清单带[上期结转]出现

### 2026-08-25 D-133~D-135 收款与扣补款三连修 ✅（已提交 e39e4c51d，迁移已应用）

- [x] D-133 面料费方案A：统一扣款抵扣；砍领料台账应收推送（audit+finance-settle EXTERNAL分支）与物料出库推PAYABLE（第三套）；V202608250004 作废遗留PENDING账单
- [x] D-134 扣补款进终审推送：factorySummary 聚合扣/补/净额；终审弹窗明细+可编辑金额（默认净额）；批量按净额
- [x] D-135 客户收款统一应收账本：confirmPayment 三级兜底（出库应收→对账单应收→现建应收）后核销，账外收款孤岛消灭
- [x] EC电商链路核实完整可用，未动
- [ ] 部署后验证：面料出库→扣款→终审金额=加工费−扣款+补款；客户收款后应收账单 SETTLING/SETTLED；领料审核不再产生应收账单

### 2026-08-25 D-132 外发应付砍双轨 ✅（已提交 ebbe2bea3，迁移已应用）

- [x] 留成品结算轨，砍出货对账单的应付推送（三处）；对账单保留扣款载体+销售应收；V202608250003 作废遗留PENDING重复账单（已应用）

### 2026-08-25 D-127~D-131 财务链路P0修复包 ✅（已提交 5a35103b6，迁移已验证应用）

- [x] D-127 次品扣款改手动：拆自动扣款死代码（传零成本从未生效）+成品结算审核时次品提醒（不阻断）
- [x] D-128 外发结算统一订单锁定单价：视图 V202608250002 改取 factory_unit_price+外发应付交易对手改工厂（两处）
- [x] D-129 采购金额统一 采购数×单价：建单/编辑/回料三处（新单落库 0 元根治）
- [x] D-130 出库类型对齐：后端兼容 outboundType 键+旧值规范化（报废/调拨不再误记销售）
- [x] D-131 工资终审推送统一：finalize-for-operator（生成→审核→确认账单）；删 3 个死按钮+2 个死弹窗+假驳回；includeSettled 默认 false
- [ ] 部署后验证：终审推送→收付款中心→付款回写全链路；外发结算金额=订单锁定单价×合格入库数

### 2026-08-25 D-126 供应商准入闭环补全 ✅（已提交 d7c7ee208）

- [x] AdmissionAuditModal 审核弹窗；RowActions 入口仅 isAdmin 可见
- [x] 统计口径修正：空状态计已准入；V202608250001 回填老数据 approved（已验证应用）
- [x] cloudflared 安装完成；隧道被本机代理 TUN 模式 fake-ip 阻断，待用户侧恢复后重启 dev-public.sh
- [ ] 待线上验证：待审核行出现"准入审核"，审核后统计卡与表格一致

### 2026-08-25 财务四链路全面审查 ✅（4 探索代理，报告已交用户）

- [x] 内部工资/外发结算/物料采购/成品次品四链路问题清单齐备（高严重度 13 项）
- [x] P0 五项已落地（D-127~D-131）；P1 双轨收敛（外发出货对账单 vs 成品结算并存）待后续

### 2026-08-25 D-125 图片预览左右切换全局下沉 ✅（tsc/eslint 全过，待部署）

- [x] StyleCoverThumb 页内多图预览替代新窗口；全系统生效
- [ ] 部署后验证切换效果

### 2026-08-25 D-124 回料确认后编辑锁定 ✅（tsc/eslint 全过，待部署）

- [x] 样衣明细页行级+工具栏编辑锁定对齐大货规则
- [ ] 部署后验证；后端兜底校验列入待办

### 2026-08-25 D-123 无资料下单矩阵化+菜单名 ✅（tsc/eslint 全过，待部署）

- [x] OrderLinesCard 对齐正常下单矩阵交互；菜单名改资料维护
- [ ] 部署后验证矩阵交互

### 2026-08-25 D-122 采购单条/批量联动修复 ✅（tsc/eslint 全过，待部署）

- [x] 样衣明细页行级+批量级判定源统一；大货/列表页核实无此问题
- [ ] 部署后验证联动效果

### 2026-08-25 D-121 交互简化三连 ✅（tsc/eslint 全过，待部署）

- [x] 入库物料搜索选择/员工菜单拍平/客户来源字典化
- [ ] 部署后验证三处交互

### 2026-08-25 D-120 预算天数联动根治+采购操作列回调 ✅（tsc/eslint 全过，待部署）

- [x] BudgetDaysEditor 本地覆盖即时重算+系统广播；采购两表撤销悬停显现；到货入库弹窗统一 ResizableModal
- [ ] 部署后验证：调预算天数立即变化

### 2026-08-25 D-119 采购一致性+手机端已完成筛选 ✅（mvn/tsc/eslint 全过，待部署）

- [x] getMyTasks(includeCompleted) 重载+Controller 参数+小程序传参（三副本同步）
- [x] 大货 Drawer 批量按钮集成下拉；列表页操作列 revealOnHover
- [ ] 部署后验证：手机端"已完成"Tab 有数据

### 2026-08-25 D-118 批量动作集成+菜单命名 ✅（tsc/eslint 全过，待部署）

- [x] 采购工具栏批量三按钮集成悬停下拉；菜单命名直白化 8 处
- [ ] 部署后验证：批量操作下拉与菜单新命名

### 2026-08-25 D-117 操作列悬停显现+终态置灰 ✅（tsc/eslint 全过，待部署）

- [x] RowActions revealOnHover 模式 + 三表启用 + 停用/取消行按钮置灰禁用
- [ ] 部署后验证：悬停显现效果与置灰状态

### 2026-08-25 D-116 术语残留清理+状态色统一 ✅（tsc/eslint 全过，待部署）

- [x] SKU/BOM 用户可见残留 20 处清理（3 处刻意保留）+ "已完成"状态色 3 处统一 success
- [ ] 部署后验证：文案与状态色（见 activeContext 2026-08-25）

### 2026-08-25 D-115 样衣工序状态联动三连修 ✅（tsc/eslint 全过，待部署）

- [x] 行状态改 sub.completed + 手动完成行级 processName + 阶段兜底门控 + 撤回精确匹配 + 抽屉全链刷新
- [ ] 部署后验证：指派后状态立变、单行完成只点亮该行、撤回删对记录

### 2026-08-24 D-114 小云任务点击直达详情页 ✅（mvn compile 通过，待部署）

- [x] 7 类任务 deepLink 从模块列表页改为精确业务路由（三个 Collector 同步+URL编码）
- [ ] 部署后验证：待办面板点击直达；遗留：落地页消费 query 自动定位列入优化清单

### 2026-08-24 D-113 列表页扫码修复 + 打印三项优化 ✅（tsc/eslint/node --check 全过，待部署）

- [x] 样衣列表页扫码三级匹配：pattern QR 直跳详情 / 本地列表 / 后端 keyword 兜底（根因：原只本地匹配，而资料单 QR 仅含 pattern id）
- [x] 打印 BOM 表加成分列（fabricComposition）
- [x] 打印基本信息值单元格长文本自动换行（去 nowrap+ellipsis）
- [x] 样衣生产工序列 SKU→商品编码，完整格式 款号-颜色-尺码
- [x] 核实打印基本信息区块多选功能完整生效（无需改）
- [ ] 部署后验证：扫码直进详情、成分列、长文本换行、完整商品编码

### 2026-08-24 D-112 样衣扫码领取根治 + 扫码AI英文根治 ✅（mvn compile+单测全过，待部署）

- [x] 样衣扫码委派 submitScan 规范链路：领取写 t_scan_record 计件+置 IN_PROGRESS+回填领取人；多色多码分支补齐被丢弃的 sourceBizType 等字段
- [x] 详情页「领取样衣」按钮从无 receive case 的 workflow-action 改走 submitPatternScan(RECEIVE)
- [x] handleReceive 防他人重复领取守卫（"已由XX领取"），本人幂等
- [x] 扫码AI提示英文三层防御：prompt中文约束 + chineseRatio 生成侧校验降级 + 读取侧过滤存量脏数据
- [x] 发现并记录：backend/src/test/ 整目录被 .gitignore，仅12文件跟踪；本地坏测试文件与 CI 无关
- [ ] 部署后验证：样衣扫码领取状态流转+AI提示全中文（见 activeContext 2026-08-24）

### 2026-08-24 D-111 四连修复 ✅（tsc/eslint/mvn compile 全过，待部署）

- [x] 纸样开发尺寸表尺码语义去重：S(160/76)/S(160/76A) 自动取重保留开发码写法，前端 7 处入口 + 后端模板 merge 查重；保存链路自动清理 DB 脏行
- [x] 各码实际用量与尺寸表列头随去重对齐（同归一化规则）
- [x] 物料出入库停用/启用（复用物料主数据 disabled 接口）+ 启用状态筛选 + 已停用标签
- [x] 删除废弃"打印出库单"按钮（正式出库/领料确认流程本就自动打印）
- [x] 库位出库抽屉客户信息关联客户管理（CustomerSelect 联动带出电话/地址）
- [x] 小程序 SKU 术语扫描收尾：用户可见文案零残留，D-073 关闭
- [ ] 部署后验证：四项功能端到端（见 activeContext 2026-08-24）

### 2026-08-22 订单详情布局规整 + 工序跟踪筛选精确匹配 + 订单管理入库弹窗只读 ✅（已推送 1a576d345）

- [x] 订单详情顶部四栏分区排版（Descriptions bordered + SectionTitle），对齐样衣详情页风格
- [x] 订单图片计数统一"共 X 张（含封面/款式图）"，消除 (0/5)共2张 矛盾
- [x] 工序跟踪：点具体工序子节点（剪线）只显示该工序记录（stripProcessSeqPrefix 归一化 + isSpecificProcessName 优先匹配）
- [x] 订单管理入库弹窗只读：InspectionDetail 新增 readOnly 模式，隐藏全部操作面板，仅展示入库进度+质检记录；操作入口保留在成品仓质检入库
- [x] tsc --noEmit 0 errors + safe-push 全过（9 文件 +245/-156）
- [ ] 部署后验证：订单详情顶部布局四栏清晰、点剪线只出剪线、订单管理入库弹窗无操作按钮、成品仓质检入库操作不受影响

### 2026-08-20 样衣详情基础信息 6 项老大难 UI/功能修复 ✅（tsc 0 错误 + mvn compile 通过，待部署）

- [x] 新建 StaffSelect 通用选人组件：设计师/跟单员可选租户用户（超管走 /system/user/list，租户走 listSubAccounts，失败兜底当前登录人）
- [x] 商品主题→商品品牌更名（表单/打印/类型注释三处，dictType 保持 style_theme 兼容）
- [x] 后端 DictOrchestrator create/update/delete/autoCollect 加 @CacheEvict("dict")，根治"维护显示成功但看不到新词条"
- [x] 备注输入框支持拖拽（去 autoSize + resize:vertical）
- [x] 颜色/码数标签蓝色文字（var(--color-primary) + 淡蓝底）
- [x] 全系统图片完整显示（global.css 规则 16c：img object-fit contain !important，豁免头像/.img-cover）
- [x] 款式特征 AI 识别断链双修复（collectExtValues 合并表单 extJson 嵌套值 + useStyleDetail 以对象形式 setFieldsValue）
- [ ] 部署后端到端验证：跟单员/设计师下拉选人、品牌维护后立即可见、备注拖拽、AI 识别特征保存后刷新不丢、图片完整显示

### 2026-08-17 组织架构页"本厂/外协工厂"节点彻底剔除 ✅（D-105）

- [x] filterInternalNodes 递归剔除 nodeType=FACTORY + ownerType=EXTERNAL（替换只看 ownerType 的旧过滤器）
- [x] 工厂账号保留 filterTreeByFactory 本厂子树，租户账号纯内部部门视图
- [x] 部门下拉/成员统计/KPI 总人数全部对齐可见树口径
- [x] tsc 0 错误，后端零改动
- [ ] 部署后验证：租户账号树中无"本厂"及外协工厂节点，KPI 不含工厂成员；工厂账号视图正常

### 2026-08-16 批量采购弹窗"信息缺失+数量只读"双链路根治 ✅（D-104，已推送 72f674109）

- [x] 新建 BatchPurchaseModal（物料编码/规格/单价/供应商全列 + 采购数量 InputNumber 可编辑 + 合计金额）
- [x] MaterialPurchaseDetail 批量采购换用新弹窗（样衣抽屉+大货订单详情共用）
- [x] MaterialPurchase 主页样衣/大货两个"确认采购全部"Modal.confirm 信息补全+数量可编辑
- [x] 后端 receive 接口支持可选 quantity（编辑数量先更新再领取，D-104）
- [x] 双端编译验证：tsc 0 错误 + mvn compile EXIT=0
- [ ] 部署后端到端验证：样衣采购管理→批量采购→弹窗显示编码/规格/单价/供应商→改数量→确认→列表数量更新

### 2026-08-16 警告根治：-Xlint 固化 + 全量清零 ✅（D-103+D-102，已推送 85ee789d6）

- [x] pom.xml 固化 -Xlint:all（排除 unchecked/serial/this-escape/processing/classfile）
- [x] 清零 99+26 条 javac 存量警告（deprecation/static/lossy/raw/varargs/try/死代码，44 文件）
- [x] 三重验证：javac 警告 0 + mvn compile EXIT=0 + Java LS 诊断 0
- [x] 详见 decisionLog D-103

### 2026-08-16 六文件 IDE 警告批量清理 ✅（D-102，未提交）

- [x] 5 处未使用 @Autowired 字段删除（FinanceOrchestration/ProcessTracking/PurchaseCart/CuttingTask/Serial）
- [x] StyleStageCompletionHelper 死代码链整链删除（4 方法+2 字段+5 import）
- [x] selectBatchIds→selectByIds；Jackson List.class→TypeReference
- [x] mvn compile EXIT=0、6 文件 LS 诊断清零

### 2026-08-16 四文件 IDE 警告清理 ✅（D-099/D-100 死代码残留，未提交）

- [x] MaterialPickingController：删 2 冗余 import + 3 未用字段 + 2 死方法（D-099 残留）
- [x] MaterialColorCardOrchestrator：删重复 import + cosService 字段（D-100 残留）
- [x] MaterialPurchaseOrchestrator：trimWhitespace 弃用 → id.trim()
- [x] ProductSkuServiceImpl：2 处 unchecked cast 加 @SuppressWarnings
- [x] mvn compile 通过、lint 清零；待提交
- [x] D-101 小程序同步确认：后端统一广播对小程序自动生效（WS→ORDER_PROGRESS_CHANGED 三页已订阅）；h5-web 副本一致；PC 轮询改动为 frontend 独有
- [x] 全量清理 151 条 import 类 checkstyle 警告（脚本批量删除+防御校验，validate 归零、编译通过零误删）+ PurchaseCartOrchestrator objectMapper→OBJECT_MAPPER

### 2026-08-16 进度球 10 多分钟不更新修复 ✅（D-101，P0，ccb9c63a0）

- [x] 根因：WebSocket 进度广播只在扫码链路，15+ 非扫码写路径（入库/回退/采购同步/手动推进/裁剪扎号）只更新 DB 不广播 → 前端等 5 分钟轮询（切页暂停）+30 分钟一致性 Job 兜底
- [x] 修复：ProductionOrderProgressRecomputeService 重算持久化后统一广播（有变化才推，防风暴）；useOrderSync 兜底轮询 5min→1min
- [ ] 部署后端到端验证：双端打开页面，一端操作入库/手动推进，另一端进度球秒级刷新

### 2026-08-16 色卡本重复入口下线 + 供应商名不显示修复 ✅（D-100，P0）

- [x] 供应商色卡三连 bug：supplierName 未注册表单字段（保存丢失→卡片"供应商: -"）、option 字段名 contactPerson→supplierContactPerson（选中后联系人被清空）、supplierId 塞名字
- [x] 「色卡本」重复入口整体下线：前端删 pages/ColorCard 11 文件+菜单+权限映射+路由重定向；后端删旧 ColorCard 6 文件（t_color_card 表保留）
- [x] 新增 `GET /material-color-card/by-material/{materialId}`；物料列表"查看色卡"迁移到新表（原来查旧表 t_color_card 永远对不上用户在供应商色卡视图改的数据）
- [x] 验证：tsc 0 错误、mvn compile 通过、旧 API/旧类引用全局 0 残留
- [ ] 存量旧色卡 supplierName=null 需编辑补选一次供应商保存
- [ ] 部署后端到端验证：物料列表查看色卡 + 编辑色卡供应商名回显/保存/显示

### 2026-08-16 内部领料"领取即出库" ✅（D-099，P0）

- [x] 根因：/pending 只建单不扣库存（无限领取/通知挂着/库存死数据），仓库扣减 SQL 本身无误
- [x] MaterialPurchaseOrchestrator.createPickingAndOutbound（同事务建单+确认出库）
- [x] Controller 分流：INTERNAL 领取即出库（库存不足回滚报错）；EXTERNAL 保留审核流（账单联动）
- [x] 前端成功文案区分内外部；tsc 0 错误；后端编译通过
- [ ] 存量挂着的 INTERNAL 待出库单待用户逐张处理（不自动清，账实风险）
- [ ] 部署后端到端验证：领料→库存立减→出库日志+操作人→无新通知

### 2026-08-16 打印弹窗修复（勾选互踩 + 分组错位 + QR 顶部对齐）✅（D-098 补充）

- [x] 主勾选组 onChange 误清空 5 个子区块（value 混入子区块 key + 全量重建）→ 只过滤主项 + ...options 保留
- [x] 基本信息子区块分组重排：客户信息真正含客户/供应商；版次信息=板类+打板人员+三价；面料成分/是否套里归备注信息
- [x] 新增打印头部行：标题+款号款名在左、QR 同行右上角对齐（原 QR 在表格上方独立占行）
- [x] 验证：tsc 0 错误；待用户打印预览确认

### 2026-08-16 基础信息表单治理 + SKU 排序/拖拽 ✅（D-098）

- [x] 设计师改内部人员搜索选择（超管 user/list，租户管理员 listSubAccounts），弃字典维护
- [x] 款名称改纯文本输入，弃字典维护
- [x] 未解锁编辑时隐藏全部维护入口（5 处 Hint + 商品类型齿轮，包 !editLocked）
- [x] "虚拟分类"全局改名"季节分类"（5 文件，season 字段不动）
- [x] SKU 码数从小到大语义排序（getSizeSortValue：字母码/数字码/定制码分级）
- [x] SKU 行拖拽排序（把手 HTML5 DnD，编辑态可用，保存固化 sortOrder）
- [x] 后端 sort_order 全链路（V202708161300 迁移 + 实体 + 列定义 + 查询排序 + 批量更新持久化）
- [x] 验证：tsc 0 错误、文案 0 残留；**未本地启动验证（≥5 文件，待部署后端到端验证）**
- [ ] 待办：commit+push 后部署验证（新建款全流程：款名称/设计师/季节分类→SKU 排序/拖拽→保存→刷新顺序保持）

### 2026-08-16 部署失败根因修复（Qdrant→health 503→HEALTHCHECK 误判）✅（D-097，P0）

- [x] 诊断：线上实测 /actuator/health=503 DOWN、/actuator/health/readiness=200；结合日志时间线（17:11:12 启动+300s start-period+3×30s≈17:19:00 被停）锁定 HEALTHCHECK 误判
- [x] AiComponentHealthIndicator：任一 AI 组件 DOWN → 整体返回 DEGRADED（AI 为可选增强，不拖垮主 health）
- [x] application.yml：http-mapping DEGRADED→200 + status.order
- [x] backend/Dockerfile：HEALTHCHECK 改探 readiness 组；TCP 兜底显式 /bin/bash（原 dash 下 /dev/tcp 从未生效）
- [ ] 待办：重新部署生产，验证部署成功 + V202708161100/V202708161200 迁移执行 + 关单工资单恢复
- [ ] 待办：决策 Qdrant 恢复或下线（清空 QDRANT_URL）

### 2026-08-16 员工计件工资条打印标准化重构 ✅（D-094）

- [x] WageSlipPrintModal.tsx 整体重写：单表扁平结构（标题/信息/表头/明细/合计/大写/签字行）
- [x] 简版改为按订单号+款号聚合表格；合计统一用后端数字；结算周期空值显示"全部记录"
- [x] 新增人民币大写 toChineseAmount；完成日期 YYYY-MM-DD；修复存量错误 import（@/utils/AuthContext）
- [x] 验证：tsc 0 错误 ✓ eslint 0 错误 ✓
- [ ] 待办：用户在工资结算页验证明细版/简版排版与多人打印分页

### 2026-08-16 SKC商品编码Tab统一编辑入口 ✅（D-093）

- [x] canEditAttrs: true → isEditing（未点编辑全只读）；编辑按钮全模式可见；删除自动模式独立「保存修改」按钮
- [x] 底部提示按模式动态渲染；列头 Tooltip/模式说明/SKC Tooltip 同步更新（3 文件：useStyleSkuTabData.ts / index.tsx / SkuTable.tsx）
- [x] 验证：tsc 0 错误 ✓ vite build 39.45s ✓
- [ ] 待办：用户 5174 验证编辑入口与提示文案（未点编辑无输入框/点编辑后按模式放开/提示随模式变化）

### 2026-08-16 保存400诊断 + 商品下单改名 + 款式停用启用 + 商品类型字典化 + 闪烁修复 ✅（D-092）

- [x] 400 诊断：本地链路无 400 源，根因=部署环境旧构建（需重新部署，见 activeContext 待办）
- [x] 下单管理→商品下单改名 13 处（日志筛选 value 保留兼容历史）
- [x] 款式停用/启用：后端 PUT /style/info/{id}/status + statusFilter 筛选 + 前端状态列/启停/筛选下拉 + 下单拦截闭环
- [x] 商品类型字典化：DictAutoComplete + fallbackOptions + Flyway V202708161000 值中文化迁移
- [x] OrderRankingDashboard 60s 轮询防闪（静默刷新）
- [ ] 待办：重新部署 www.webyszl.cn 后端+前端（Flyway 自动跑 V202708161000），验证 4 项：保存不 400/停用启用筛选/商品类型维护/闪烁消失

### 2026-08-16 全输入框字典维护 + 码数自动排序/拖动 ✅（D-091）

- [x] DictAutoComplete 内置 suffix 维护齿轮+DictQuickManageModal，全系统约 40 处字典输入框一次全生效（enableQuickManage 默认 true）
- [x] StyleColorSizeTable：addSize 按 getSizeWeight 自动插入正确位置（小→大，不打乱已拖过的顺序）；码数/颜色 Tag 原生拖动排序（矩阵列/行同步重排）
- [ ] 待办：用户 5174 验证齿轮维护+码数自动归位+拖动；验证通过后与 D-086~D-090 一起提交

### 2026-08-16 字段旁"维护"弹窗化 ✅（D-090）

- [x] DictQuickManageModal（字典词条增删改名）+ dataEvents 广播 + 4 组件订阅刷新 + BasicInfoSection 7 字段挂载（含客户/供应商就地新建）
- [ ] 待办：用户 5174 验证各字段"维护"弹窗与下拉即时刷新

### 2026-08-16 图片资产并入基础信息区 + 展示URL附token ✅（D-089）

- [x] CoverImageUpload 嵌入式竖排（主图180px）→ BasicInfoSection coverSlot 左栏合并；顶部独立图片条移除
- [x] displayImages 展示 URL 统一附 token（getFullAuthedFileUrl）兜底 tenant-download 401
- [ ] 待办：用户 5174 验证；**www.webyszl.cn 需重新部署前后端**（旧构建无 401 兜底+旧后端无白名单）

### 2026-08-16 生产制单 Tab 移除无关操作日志 ✅（D-088）

- [x] 移除 StyleProductionTab 的 OperationLogSection 引用（日志表无 production 类型，全量款式日志与本 Tab 无关）；组件文件保留待挪 BOM Tab
- [ ] 待办：用户浏览器验证；如需 BOM 日志展示，将 OperationLogSection 挪至 BOM Tab 并加 bizType 过滤

### 2026-08-16 "图片资产没移上去"环境诊断 ✅（D-087）

- [x] 定性：D-086 布局重构代码完好（tsc 0 错误）但未提交；用户访问的 5173 是凌晨旧 Vite 进程（HMR 失效）→ 看到旧布局
- [x] 新 dev server 已起在 **5174**（新代码）；用户拒绝杀 5173 旧进程，双端口并存
- [ ] **待办**：用户在 5174（或重启后的 5173）验证新布局 → 通过后提交 D-086 全部工作区改动（6 文件）

### 2026-08-16 详情页图片资产条/颜色图片行式/尺码排序/预览增强 ✅

- [x] 图片资产移基础信息上方紧凑横条（主图96px+缩略图40px横排+上传/识别/搜相似按钮行）
- [x] 状态卡改单行摘要条（操作人动态Tooltip+时间信息Popover收纳）
- [x] 颜色图片管理改一行一颜色Table（行内上传/更换/移除，即时保存，勾选批量应用）
- [x] 尺码排序：utils/sizeOrder.ts + 码数Tag↑↓按钮 + 一键排序（D码垫底）+ 矩阵数量列同步重排
- [x] 预览增强：全局CSS工具栏白字黑底+遮罩加深；缩略图不开预览，预览入口唯一
- [x] SKU属性级编辑：自动模式备注/69码/价格可编辑+保存修改按钮；列头说明Tooltip
- [x] 验证：tsc 0错误 ✓ vite build 16.4s ✓ dev:5175 HTTP 200 ✓；决策记录：D-086

### 2026-08-16 样衣详情"基础属性库"（颜色/码数成套组合）✅

- [x] 颜色码数标题右侧「基础属性库」按钮 + 弹窗（Tabs 颜色组合/码数组合）
- [x] 组合 CRUD + 「使用」覆盖/「追加」去重；成员录入带字典联想；复用 t_dict 零后端改动
- [x] 验证：tsc ✓ eslint ✓（未 build/未启动，属 3 文件小改动）；决策记录：D-083

### 2026-08-16 收尾：小程序术语+测试修复+仅缺料直生成 ✅

- [x] 小程序/H5 各2处术语；STAGE_ORDER 测试 4 文件修正（443 全过）；后端 shortageOnly + 前端直生成
- [x] 前端 type-check/lint/build/测试 ✓ 后端 mvn compile ✓；决策记录：D-075

### 2026-08-16 大货与样衣采购链路简化 ✅

- [x] SmartPurchasePreviewModal 缺料预览前置（复用 net-demand 接口）；原因选填；购物车承接"仅缺料"
- [x] 录入采购当前页跳转；智能推荐订单选择器；样衣按钮分工 Tooltip+库存提示；sourceType=大货订单
- [x] 验证：type-check ✓ eslint ✓ build ✓；决策记录：D-074

### 2026-08-16 全站术语残留清零 + 暂缓3项落地 ✅

- [x] SKU/BOM 用户可见文案 44处清零（3处刻意保留：匹配关键词/历史兼容/日志）
- [x] 颜色图片 Modal 化 / 编码状态列消歧 / 操作人按环节联动
- [x] 验证：type-check ✓ eslint ✓ build ✓；决策记录：D-073

### 2026-08-16 样衣详情第二轮优化（审计清单 7/10 落地）✅

- [x] sticky 保存条 / SKU 表操作列 fixed right + scroll x / 颜色卡片响应式 / 左栏加宽 / 三处文案
- [x] 验证：type-check ✓ eslint ✓ build ✓；决策记录：D-072
- [ ] 暂缓 3 项待业务决策（见 D-072 背景）

### 2026-08-16 样衣详情布局压缩+SKC按钮消歧+图片缩小 ✅

- [x] 澄清：无"修改SKU"按钮，实为"修改SKC"（款+颜色编号），已改"修改SKC编号"+Tooltip 消歧；用户端旧文案系旧构建未重建
- [x] 商品编码表图片 44→32、说明精简、SKC块紧凑化、Switch 文案消歧
- [x] 客户信息|款式特征并排、时间信息并入基础信息区、间距收紧（区块 6→4）
- [x] 验证：type-check/lint/build/vitest（7 个既有失败与本次无关，stash 基线确认）
- 决策记录：D-071

### 2026-08-15 物料出入库库存不减扣+总值错乱 — 5处缺陷修复并推送 ✅

用户投诉"出入库每个地方都没减扣数量不变"，全链路核查（Controller→Orchestrator→Service→Mapper SQL→前端数据映射）定位 5 处缺陷并全修：

- [x] P0 调拨零和（物料/成品对同一行先扣后加=净零）→ 源/目标库位分别扣加+目标无记录自动新建；成品仅记录轨迹
- [x] P0 total_value 4条SQL错算（MySQL SET 从左到右语义）→ 重写表达式+调整SET顺序
- [x] P1 确认出库静默漏扣（记录缺失跳过扣减仍写日志）→ 抛异常回滚
- [x] P1 queryPage 缺租户隔离 → 补 tenant_id
- [x] P2 五处 LIMIT 1 无排序 → orderByAsc(createTime)
- [x] Flyway V202708151000 全量重算 total_value
- [x] mvn compile ✓ / 推送 cb7b56800
- [ ] 待验证：启动后端跑 Flyway（PKG005 总值应=15.00）；实际调拨验证源减目标加
- 决策记录：D-070（含 MySQL SET 求值顺序方法论）

### 2026-08-14 生产要求被BOM日志污染根因修复 ✅（详见 D-069）

### 2026-08-14 仓库端领料列表500 — schema drift 全量清零 ✅

D-065 修复后领取成功，但 /picking/list 500。根因：43192e735 给 MaterialPicking 加 patternProductionId 没写迁移，云端缺列（insert 非空策略能过、select 全列必炸）。

- [x] Python 全库扫描 244 实体表 vs 迁移列差集
- [x] V202708142000：根因列 + 11张核心业务表同类 drift 30+列，全部表存在+列不存在双判断幂等
- [x] AI 表误报甄别（DbTableDefinitions.java 运行时建表已含）
- [x] mvn compile 0 错误；脚本模式与云端已验证的 V202708140001 一致
- [x] 决策记录：D-067
- [ ] 待云端部署（push 后 5~10 分钟）→ 用户验证仓库端待出库列表

### 2026-08-14 D-065同类隐患全量审计+工作台3处修复 ✅

用户质问"还有多少这样的垃圾问题"→ 用 code-explorer 对全前端做锚点props审计：20组件×42调用方。

- [x] 发现并修复 `StyleDevelopmentWorkbench/StageContent.tsx` 3处漏传 styleNo（BOM/纸样Tab领取被拦 + 报价Tab打印按钮消失）
- [x] 其余17个组件核对无隐患（MaterialPickupModal/StylePrintModal/RemarkTimelineModal等全量过）
- [x] PickingForm（生产端直接领料）payload 传齐 orderId/orderNo/styleId/styleNo 确认无问题
- [x] 验证：tsc 0 errors + lint 0 诊断
- [x] 决策记录：D-066（含锚点props核对方法论）

### 2026-08-14 样衣开发BOM申请领取 400 修复 ✅

用户反馈：样衣详情物料清单Tab领取面辅料 → `/picking/pending` 400"领料单缺少归属关联"。根因：`StyleBomTab.tsx` 调用 `MaterialPickupModal` 时漏传 `styleNo`（纸样/生产Tab都传了，唯独BOM Tab漏）。

- [x] `StyleInfoTabs.tsx` 给 `<StyleBomTab>` 补传 styleNo
- [x] `StyleBomTab.tsx` Props 增加 styleNo 透传
- [x] `MaterialPickupModal` 提交前前置拦截（三锚点全空直接提示，不再等400）
- [x] 验证：tsc 0 errors + lint 0 诊断
- [x] 决策记录：D-065
- [ ] 待用户在物料清单Tab重试领取确认走通

### 2026-08-14 备注/全站TextArea被压成一行的根因修复 ✅

用户反馈样衣详情页备注框只有一行、说明文字跑到框外。根因：global.css 全局统一高度规则 `.ant-input { height:32px !important }` 命中 `textarea.ant-input`，覆盖 autoSize 内联高度。

- [x] global.css 6处 `.ant-input` → `input.ant-input`（主规则/search/affix/compact×2/table-cell 30px）
- [x] BasicInfoSection.tsx 删除与 showCount 重复的 extra"最多500字"，marginBottom 恢复 8
- [x] 验证：剩余 `.ant-input` 规则均无 height 覆盖；lint 0 错误
- [x] 决策记录：D-064
- [ ] 待用户刷新页面确认备注框 3~6 行高度 + 计数显示在框右下角

### 2026-08-14 订单管理操作列修复 + 详情页术语统一 ✅（已推送 78a2b5a55）

- [x] 操作列 fixed:'right' + width 96（根因：scroll.x=3500 多列下被推出可视区）
- [x] 智能视图卡片操作按钮 hover 显示 → 常显
- [x] SKU → 商品编码（StyleSkuTab 3文件15+处可见文案）
- [x] BOM清单 → 物料清单（10处）
- [x] 基础信息/客户信息/时间信息/颜色码数逻辑核实通过
- [x] type-check 通过，commit `78a2b5a55` 已推送

### 2026-08-14 P0生产事故止血：Flyway MySQL 8.0 语法错误 ✅（待云端验证）

- [x] 根因定位：`V202708140001` 误用 `ADD COLUMN IF NOT EXISTS` → 云端迁移失败 → t_style_info 缺7列 → Unknown column → 全量500
- [x] 重写为存储过程幂等模式（参照 V20260615001），commit `11afc0b19` 已推送
- [x] Memory Bank 更新：D-060 事故复盘
- [ ] **待验证**：云端部署后 500 消除 + t_style_info 7列已加（需用户确认或盯部署日志）

### 2026-08-14 历史遗留编译警告/错误全量清理 ✅

用户质疑"这些遗留问题为什么不修复呢"——之前以"gitignored 不影响部署"为由不修是错误的。本次清理5个文件20+处历史遗留警告/错误：

- [x] 主代码 `StyleOperationAppendHelper.java` — 删除未使用 styleInfoService 字段 + import
- [x] 主代码 `StyleInfoOrchestrator.java` — 删除3处未使用 import/字段 + 1处 @SuppressWarnings
- [x] 测试 `StyleStageCompletionHelperTest.java` — 修复1个 Error(ambiguous) + 15个 Warning(unchecked)
- [x] 测试 `ProductionOrderQueryServiceStatsBoundaryTest.java` — 补 ArgumentCaptor import + 删3行不存在字段断言
- [x] 测试 `SmartSourcingServiceImplTest.java` — setId(1L) 改 setId("1")（id 是 String）
- [x] 测试 `SharedAgentMemoryServiceTest.java` — 3处 any() → any(SharedAgentMemory.class) 解决重载歧义
- [x] 验证：`mvn test-compile` BUILD SUCCESS（0 ERROR）
- [x] 决策记录：D-059

**教训**：之前以"gitignored 不影响部署"为由不修历史遗留问题是错误的。本地开发体验也是体验，遗留问题就该修。

---

### 2026-08-14 PC端样衣详情页-基础信息Tab按设计稿全等重写 ✅

用户诉求："改造样衣开发详情页全部改成这种简单的"，"全部+连带后端"，"复用现有字典"，"全链路跑通"，"先改基本信息这些tab页"。

按截图完整重写 PC端 `frontend/.../StyleInfo/components/StyleBasicInfoForm/BasicInfoSection.tsx`，并打通后端 entity + Flyway + 前端类型 + 表单提交全链路：

- [x] **后端**（2文件）
  - `StyleInfo.java` 新增7字段：productType/theme/designer/supplier/supplierId/supplierContactPerson/supplierContactPhone
  - `V202708140001__add_basic_info_ext_columns_to_style_info.sql` 幂等 ALTER + supplier_id 索引
- [x] **前端**（6文件）
  - `types/style.ts` — StyleInfo 类型补7字段
  - `constants.ts` — 新增 PRODUCT_TYPE_OPTIONS（成品/半成品）
  - `BasicInfoSection.tsx` — 按截图完全重写（款名称/款式编码/商品分类/虚拟分类/商品类型/设计师/商品主题/客户/供应商/备注）
  - `CustomerInfoSection.tsx` — 去除 customer（迁至基础信息），保留 customerId hidden
  - `TimeRemarkSection.tsx` — 去除 remark（迁至基础信息），改名"时间信息"
  - `hooks/utils.ts` + `hooks/useStyleFormActions.ts` — 去除 `delete payload.customer/remark` 旧逻辑（否则保存时字段被剥离）
- [x] **验证**：后端 mvn compile exit 0 + 前端 npx tsc --noEmit 0 errors + 所有修改文件 lint 0 errors
- [x] **决策记录**：D-058

**踩坑**：`utils.ts` 和 `useStyleFormActions.ts` 都有 `delete payload.customer/remark`，这是历史代码（这两个字段原本不在基础信息区）。迁移字段后必须同步去除这些 delete，否则保存时字段被静默丢弃——这是"全链路跑通"的关键。

**未动**：左侧 sticky 封面图保持原位；其他 Tab（颜色规格/工艺说明/样品节点/设计状态/同类资料）按用户要求"改完基础信息再说别的"

---

### 2026-08-09 CodeBuddy 环境安全防护体系 ✅

用户要求"确保每一次的代码迭代与推送数据库不会炸前后端不会出现问题"，创建脚本化防护体系替代 Trae MCP：

- [x] `scripts/safe-query.sh` — 只读查询封装（替代 db-query-mcp）：拒绝写操作 + 强制 LIMIT 500 + 多租户检测
- [x] `scripts/safe-push.sh` — 推送前全量检查（替代 test-runner-mcp）：编译 + 类型 + Flyway 4项 + 多租户 + 敏感文件
- [x] `scripts/hooks/pre-push` + `scripts/install-hooks.sh` — git hook 自动触发（已安装 `core.hooksPath=scripts/hooks`）
- [x] `scripts/predeploy-check.sh` — 部署前检查（替代 change-impact-mcp）：prod.yml 安全 + 环境变量 + Dockerfile
- [x] 测试全部通过：safe-push 6项 PASS、写操作拒绝退出码3、LIMIT超限退出码4

**防护链路**：改代码 → safe-push.sh → git push → pre-push hook → CI → 部署 → predeploy-check.sh

---

### 2026-08-09 质量防线真实化修复 ✅

用户诉求："你先全面了解一下这个项目 看看有什么需要优化的" → 全系统扫描 → 逐条核实 → "如果缺少是没有用的就做了修复优化，颜色硬编码不要动"

- [x] **ArchUnit 假测试修复**（`backend/src/test/java/com/fashion/supplychain/architecture/ArchitectureConstraintTest.java`）
  - `controllerShouldNotCallServiceImplDirectly`：`rule.allowEmptyShould(true)` 返回值丢弃无 check → 补 `.check(importedClasses)`
  - `orchestratorNamingMustEndWithOrchestrator`：同样 no-op → 补 `.check()` + 排除 intelligence + 多后缀允许
- [x] **CI 硬编码凭据移除**（`.github/workflows/ci.yml`）
  - 删除 `SMOKE_USERNAME || 'lilb'` 和 `SMOKE_PASSWORD || '123456'` 明文 fallback
  - 改为运行前校验非空，缺失则 `::error::` 退出
- [x] **CLAUDE.md 版本号同步**（Spring Boot 3.3.6→3.4.5、MyBatis-Plus 3.5.7→3.5.12、编排器 235→330）
- [x] **自进化记录更新**（activeContext / progress / decisionLog D-056 / optimization-log-20260809）

**未动**：颜色硬编码（D-052-2 的 71 处保护色 + 用户明确要求不动）

**核实结论**：测试源码 gitignore 是 D-001/CLAUDE.md 的有意 P0 策略，非漏洞；Controller @Transactional 是 D-013 已知临时方案；Service @Transactional 冻结基线 34→18 在改善中；CI grep 恒假但 prod.yml 实际无 http:// 恰好无漏检。

---

### 2026-08-01 智能化模块全链路修复 + 采购UI规范统一 ✅

用户诉求："你看看智能化的为什么做一半没有全部完成 你全部核实清楚 物料采购智能化你核实一下 还有为什么采购页面的操作栏做的乱七八糟的了" → "全部开始"

- [x] **异常自愈8个检测器修复/新建**
  - 3个AUTO：StagnantRiskDetector(7天→24h) / DelayRiskDetector(加组合判定) / QualityRiskDetector(次品率统计)
  - 5个SUGGESTION：MaterialRiskDetector(安全库存) / CostRiskDetector(工时维度) / PayrollRiskDetector(新建) / OutsourceRiskDetector(新建) / WarehouseDiffRiskDetector(新建)
  - RiskType枚举新增3个值，3个新检测器加@Component自动注册
- [x] **智能采购4个问题修复**
  - lossRate持久化：V202708010001迁移 + 4个Entity/DTO加字段 + 链路贯通
  - quick-edit重算bug：委托Orchestrator，先读unitPrice再重算totalAmount
  - 审价工作流：V202708010002迁移 + 5个字段 + 2个API端点 + confirm设pending_review
  - AI巡检Job串联：SourcingSpecialistPatrolJob注入SmartSourcingService自动触发
- [x] **PC采购页面UI 10项修复**
  - 状态漏洞：领取按钮排除终态 / 退回按钮去掉COMPLETED分支
  - 实心改镂空：3处（智能采购推荐/保存/编辑面辅料）
  - 筛选器7档对齐 + PatrolActionCenter类型映射 + 一键智能采购按钮
  - global.css 10处硬编码→CSS变量 + 操作列宽度220→260 + maxInline 3→2
- [x] **手机端+H5四端同步**
  - 4处实心改镂空 + 按钮高度统一 + 注释同步
  - 四端MD5一致：miniprogram/source-miniapp/public/source-miniapp/dist/source-miniapp
- [x] **发布前全面核实**
  - P0阻塞发布项：无
  - P1建议修复：SelfCritiqueGateTest/EvolutionOrchestratorTest 72测试 + 完整编译 + AI全链路冒烟
  - 历史遗留23项：21项已完成，2项本次已修复
- [x] **验证**：mvn compile exit 0 + npx tsc exit 0 + 四端MD5一致

---

### 2026-08-01 AiCostTrackingOrchestrator JUnit 5 单元测试创建 ✅

用户诉求："Create a JUnit 5 unit test at AiCostTrackingOrchestratorTest.java... 11 tests covering calculateCost/getCostSummary/recordAsync"

- [x] **测试文件创建**
  - 路径：`backend/src/test/java/com/fashion/supplychain/intelligence/orchestration/AiCostTrackingOrchestratorTest.java`
  - 技术栈：JUnit 5 + Mockito + AssertJ
  - 结构：`@ExtendWith(MockitoExtension.class)` / `@InjectMocks` / `@Mock AiCostTrackingMapper`
- [x] **UserContext 生命周期**（复用 WhatIfSimulationOrchestratorTest 模式）
  - `@BeforeEach`：setTenantId(1L) + setFactoryId("F001")
  - `@AfterEach`：UserContext.clear() 防污染
- [x] **calculateCost 私有方法反射测试（7 个）**
  - `agnes-2.5-flash`：1000+500 tokens → 0.000045
  - `agnes-2.0-flash` 同价验证（= 2.5）
  - 未知模型：默认 0.00020 → 1500 tokens = 0.00030
  - 零 tokens → 0
  - `deepseek-v4-flash`：500+500 = 0.00014
  - 大 tokens（999999×2）：BigDecimal 无溢出
  - `qwen-plus`：800+1200 = 0.00080
- [x] **getCostSummary 公共方法（3 个）**
  - sumCostSince 返回 null → estimatedCostUsd = 0（BigDecimal.ZERO）
  - Mapper 抛 RuntimeException → fail-safe 返回空 Map（非 null）
  - USD $150.5678 × 7.2 = CNY ¥1084.09，scale=2 精度验证
- [x] **recordAsync 方法（1 个）**
  - ArgumentCaptor<AiCostTracking> 捕获 insert 参数
  - verify times(1) + 全字段断言（tenantId/model/scene/tokens/latency/success/cost）
- [x] **规范**：所有 BigDecimal 比较统一用 `isEqualByComparingTo()`，避免 scale 差异误判

---

### 2026-07-31 财务闭环+数字孪生+@Version+颜色核查 ✅

用户诉求："好的全部开始吧 注意颜色哪些是必须保留的 做的时候注意数据流转这些问题 一定要到位"。

- [x] **账单→会计凭证数据流转闭环**（D-022）
  - BillAggregationOrchestrator.confirmBill → ensureAccountingVoucherFromBill → generateVoucherFromBill
  - BillAggregationOrchestrator.reverseBillInternal → reverseByBillAggregationId
  - 凭证异常 fail-safe 不阻塞账单主流程
- [x] **金融实体 @Version 乐观锁补齐**（D-008）
  - Payable/Receivable/BillAggregation/WagePayment 4 个实体添加 @Version
  - Flyway V202608081400__add_version_to_finance_entities.sql
- [x] **数字孪生深化**
  - ProductionDomainProvider 实现 DomainDataProvider 接口
  - 工厂负载热力图 + 在制品工序分布 + 交期分桶
- [x] **前端硬编码颜色清理核查**
  - dry-run 核查：0 可替换剩余，71 处保护色完整保留
  - 必须保留的 5 种保护色：#00e5ff/#39ff14/#7c4dff/#00bcd4/#f7a600
- [x] **质量门控**：5 大核心链路数据流转闭环验证通过

---

### 2026-07-26 P0多租户隔离+财务闭环+生产备注+AI持久化+多端补齐（6 commits）✅

用户诉求："全部开始优化 注意优化细节与数据链路的闭环"。

- [x] **P0多租户隔离修复**（commit 379554a3c）
  - CrmClientController: company like → customerId 精确匹配
  - WagePaymentCallbackHelper: 2 处查询补 tenantId 过滤
  - SupplierPortalController: supplierType 放宽为 MATERIAL/CMT/BOTH
  - DuplicateScanPreventer: findByRequestId 补 tenantId 过滤
- [x] **P0财务闭环反向账单统一**（commit b763df5a8）
  - 7 处 cancelBySource → reverseBySource（销售退货/工资/二次工艺/盘点/出库/扫码撤回）
  - 清理 FinishedWarehouseOperationOrchestrator WAREHOUSING 断头调用
- [x] **生产备注+异常传播+AI持久化**（commit a95f22685）
  - ScanRescanHelper/ScanUndoHelper: 移除 try-catch 让异常传播触发事务回滚（D-001）
  - ProductionOrderWorkflowHelper: 工序锁定/回滚/委派同步写入 OrderRemark 表
  - AiAgentMemoryHelper: 程序记忆持久化到 t_procedural_memory
- [x] **电商平台可用性标记**（commit 5ef6051cd）
  - 6 个未实现平台标记 available=false + "即将推出"角标
- [x] **H5 多端补齐**（commit 522ee5ba4）
  - api/index.js 新增 lockBundle/unlockBundle 接口
  - ScanQualityPage 菲号锁定/解锁
  - StyleDevPage REJECT 按钮
- [x] **三端订单生命周期同步**（commit 034b76470）
  - production.js 新增 completeOrder/closeOrder/scrapOrder API
  - order-detail 新增 onActionComplete/onActionClose/onActionScrap
  - 三端副本 MD5 一致
- [x] 质量门控全部通过：mvn compile ✅ / npx tsc ✅ / audit-tenant-id（仅 RoleTemplate 历史遗留）
- [x] 6 commits 推送至 origin/main（379554a3c → 034b76470）

---

### 2026-07-25 物料采购/领料/出库流程交互优化 ✅

用户诉求："全部核实清楚就开始优化修复，样衣那边的采购与领取，还有大货这边也是一样的"。

- [x] 采购按钮命名统一（"去采购"/"登记到货"/"撤回采购"）+ 操作提示
- [x] 领料表单 BOM 自动预选与需求对照（BOM 用量 / 订单需求 / 库存余量）
- [x] 出库批次 checkbox 选择 + FIFO 自动分配 + 清空选择
- [x] 出库订单选择后自动同步 pickupType / factoryType
- [x] 前端 type-check 通过
- [x] 修改文件 eslint 通过

---

### 2026-07-24 平台详情页顶部标签改为中文平台名 ✅

- [x] 识别 `/ecommerce/platform/:code` 路径
- [x] 从 `PLATFORM_LIST` 解析平台中文名
- [x] 顶部最近访问标签显示「{平台名} - 平台详情」
- [x] npx tsc --noEmit 通过
- [x] 提交 ec985965f 已推送到 origin/main

---

### 2026-07-23 智能化开关补全 8 个 HIGH 风险自动执行点 ✅

用户诉求："全部优化好这些 这些这些智能化的 还是不要自动 让用户可以设置这些 理解吗 怕出现问题"

全系统核查发现仍有 8 个 HIGH 风险 @Scheduled 方法会自动执行写操作/对外通知/派单但无用户可配置开关，全部补齐：

- [x] **AiPatrolJob 4 个跨租户巡检方法纳入 AUTO_PATROL_EXEC 开关**
  - scanProductionAnomalies / scanExtendedAnomalies / runDailyPatrol / checkTaskOrderProgress
  - 用 isActionEnabledForAnyTenant 粗粒度控制，全租户未开启则跳过
- [x] **EcSyncJob.retryJob 纳入 AUTO_EC_STOCK_SYNC 开关**
  - 按租户检查，关闭则不自动重试推库存/价格到电商平台
- [x] **SmartNotifyJob.autoDetectAndNotify 纳入新开关 AUTO_MIND_PUSH**
  - 在 doAutoDetect 租户循环内按租户检查，关闭则不自动推送微信/站内通知
- [x] **XiaoyunDailyInsightJob 纳入新开关 AUTO_DAILY_INSIGHT_DISPATCH**
  - 关闭则不自动生成洞察+派发协作任务
- [x] **AgentBackgroundTaskJob 纳入新开关 AUTO_AGENT_BACKGROUND_TASK**
  - 关闭则不自动执行 AI 后台任务
- [x] **BackendActionFlagService 新增 3 个开关枚举**（AUTO_MIND_PUSH/AUTO_DAILY_INSIGHT_DISPATCH/AUTO_AGENT_BACKGROUND_TASK）
- [x] **Flyway V202612070001 初始化 3 个新开关默认关闭**
- [x] **前端 ProfileSmartSettingsPanel.tsx 补充 3 个新开关文案**

**验证**：后端 mvn compile exit 0、前端 npx tsc --noEmit 0 errors
**变更范围**：后端 6 文件（5 Job + 1 Service）+ 1 Flyway 迁移 + 前端 1 文件
**决策记录**：D-044

---

### 2026-07-23 智能化功能全部改为用户可配置开关（用户核心诉求）✅

用户决策："全部优化好这些 这些这些智能化的 还是不要自动 让用户可以设置这些 理解吗 怕出现问题"

- [x] **AiPatrolJob 全部 @Scheduled 方法受开关控制**
  - `scanPersonalTaskReminders` 新增 `AUTO_TASK_REMINDER` 开关检查（本次新增）
  - `executeAutoActions` 已有 `AUTO_PATROL_EXEC` 开关
  - `scanOverdueCollaborationTasks` 已有 `AUTO_TASK_ESCALATION` 开关
  - `pushHighSeverityAlerts` 已有 `AUTO_HIGH_SEVERITY_DISPATCH` 开关
- [x] **EcSyncJob stockSyncJob 受 `AUTO_EC_STOCK_SYNC` 开关控制**
  - 注入 `BackendActionFlagService`，按租户判断开关
  - 关闭时仅本地计算库存，不推送到平台
- [x] **前端配置面板补充 5 个新开关文案**
  - ProfileSmartSettingsPanel.tsx 的 BACKEND_ACTION_LABELS 新增 5 条
- [x] **编译错误修复**
  - EcPriceSyncItem.java 添加 @NoArgsConstructor + @AllArgsConstructor
  - EcStockDiscrepancyOrchestrator.java getSkuName() 改为 buildSkuName(sku)
- [x] **确认 P1-2 返工智能派单已是手动**（SmartAssignmentOrchestrator 仅推荐不派单）
- [x] **确认 P1-3 物料对账差异已是仅展示**（explainException 只列原因不操作）

**验证**：后端 mvn compile exit 0、前端 npx tsc --noEmit 0 errors

---

### 2026-07-23 撤销 AiUpgradeCenter 独立页面 + Skills市场（用户决策回滚）✅

用户决策："集成到现有的这些里面来升级 不要多余的东西 很多用户都不知道这些玩意有什么用 要做好现有的升级就好 他们不是技术性的用户 都是普通用户 根本不需要技术性的东西 我们要做的是用户体验与使用这些好用"

- [x] **前端清理**
  - 删除 `frontend/src/modules/intelligence/pages/AiUpgradeCenter/` 整个目录（7 Tab + index.tsx）
  - `frontend/src/modules/intelligence/index.tsx` 移除 AiUpgradeCenter 导出
  - `frontend/src/routeConfig.ts` 移除 aiUpgradeCenter 路径/菜单项/页面元信息/权限码映射
  - `frontend/src/App.tsx` 移除 AiUpgradeCenter 导入 + 路由注册
- [x] **后端清理**
  - 删除 6 个 Controller（BrowserAgent/VisualAIInspection/FashionAIAsset/SmartScheduling/DigitalTwinSnapshot/SkillMarket）
  - 删除 6 个 Orchestrator（同上）
  - SkillTemplate.java 移除 7 个市场字段
- [x] **数据库回滚迁移（遵守 P0 #1 不修改已应用迁移）**
  - V202607230001/V202607230002 保留不删
  - 新增 V202607230003__rollback_ai_upgrade_tables.sql（幂等 DROP 5 表 + 7 字段 + 1 索引）

**验证**：后端 mvn compile exit 0、前端 npx tsc --noEmit 0 errors、全代码库 grep 无残留引用

**下一步方向**：智能化能力下沉到现有业务模块中作为内嵌辅助功能，不另立独立页面

---

### 2026-07-23 下单页智能化模块 P2+P3 共 7 项修复（全部完成）✅

用户要求"剩余的7个全部要优化好"，全部修复完毕。npx tsc --noEmit 通过。

- [x] **P2-9 OrderFactorySelector deliveryOnTimeRate null/undefined 兜底**
  - 新增 formatRate + FactoryStatBlock 子组件，消除 INTERNAL/EXTERNAL 重复渲染
- [x] **P2-10 SmartStyleInsightCard calcInsight 竞态保护 + 错误态区分**
  - useRef requestId + hasError state，错误时显示"重试"
- [x] **P2-11 StyleQuotePopover 失败清 data + 竞态保护 + Popover 关闭取消在飞请求**
- [x] **P2-12 FactoryInsightDrawer 错误态 UI + 重试按钮**
  - 新增 error state + Alert + 重试按钮
- [x] **P2-13 useOrderIntelligence 两个 fetch 竞态保护 + visible=false 重置**
  - deliveryRequestIdRef + schedulingRequestIdRef；弹窗关闭清空残留
- [x] **P3-14 多文件硬编码颜色改 CSS 变量**（5 个文件）
  - OrderFactorySelector / SmartStyleInsightCard / StyleQuotePopover / FactoryInsightDrawer / OrderSchedulingInsights
- [x] **P3-15 折叠态 loading 指示** — OrderSchedulingInsights + OrderLearningInsightCard
  - 新增 LoadingOutlined 旋转图标 + "分析中..."文字

**变更范围**：7 个前端文件
**验证**：npx tsc --noEmit 通过（exit 0）

---

### 2026-07-23 下单页智能化模块优化（P0+P1 共 9 项修复）✅

用户需求：盘点下单页所有智能化模块、检查逻辑问题、确认无资料下单弹窗是否支持智能化。

**调研结论**：下单页集成 8 类智能化模块（交货期智能建议 / AI 排产建议 / 款式报价建议 / 订单学习推荐 / 工厂全动态详情 Drawer / 智能款式分析卡 / 工厂产能数据 / 工序进度加载）；无资料下单弹窗（CuttingCreateTaskModal）此前完全未集成任何 intelligenceApi。

**P0 修复（2 项）**：
- [x] **P0-1 useOrderIntelligence deliverySuggestion 依赖项**
  - 原 `selectedFactoryStat?.factoryName` + eslint-disable 掩盖问题，工厂对象其他字段变化不触发重算
  - 改为整体 `selectedFactoryStat` + `factoryMode` + `fetchDeliverySuggestion` 依赖
- [x] **P0-2 FactoryInsightDrawer 防抖重构**
  - 原 useEffect 无防抖，open/orderQuantity/plannedDeadline 任一变化即触发 3 个 API 并行雪崩
  - 重构为：open 从 false→true 立即加载 / factoryName 变化立即加载 / 其他参数变化 600ms 防抖
  - 用 ref 保存最新参数避免闭包过期

**P1 修复（4 项）**：
- [x] **P1-3 无资料下单弹窗接入 FactoryInsightDrawer**
  - CuttingCreateTaskModal 新增「查看工厂全动态详情」镂空按钮（仅在 selectedFactoryStat 存在时显示）
  - useMemo 聚合 createOrderLines 计算总下单数量传给 Drawer
  - 接入交期预测/产能缺口/在产订单明细三大模块
  - 跳过交期建议/排产/订单学习：无资料下单无款号工价基础，FactoryInsightDrawer 已覆盖核心场景
- [x] **P1-4 StyleQuotePopover fetchedRef 缓存冲突**
  - destroyOnHidden=true 销毁内容，但 fetchedRef 在父作用域导致首次拉取后永不刷新
  - 去掉 fetchedRef，改为 onOpenChange 触发拉取（每次打开重新拉）
- [x] **P1-5 SmartStyleInsightCard 拉取量 + 防抖**
  - pageSize 100→30（足够算周期/准时率/频率统计）
  - 新增 400ms 防抖，避免快速切换款号时连续拉取
- [x] **P1-6 orderLearningApi 404 永久禁用改 5 分钟冷却**
  - 原 sessionStorage 布尔值永久标记不可用，后端修复后前端仍不重试
  - 改为时间戳 + 5 分钟冷却，过期自动恢复

**P2 修复（2 项）**：
- [x] **P2-7 排产建议加 500ms 防抖**
  - 原 useEffect 无防抖，visible/styleNo/totalOrderQuantity 变化即触发
  - 加 schedulingTimerRef + setTimeout 500ms + cleanup
- [x] **P2-8 selectedStyle 对象引用依赖**
  - 原 `selectedStyle` 整体引用依赖，setState 创建新引用导致重复拉取
  - 改为 `selectedStyle?.id` + `selectedStyle?.styleNo` 字段依赖

**变更范围**：前端 6 文件修改（useOrderIntelligence.ts / FactoryInsightDrawer.tsx / CuttingCreateTaskModal.tsx / StyleQuotePopover.tsx / SmartStyleInsightCard.tsx / orderLearningApi.ts），无后端变更。

**验证**：
- npx tsc --noEmit 通过（exit 0）

**待办（用户未确认）**：
- 剩余 P2 级 4 个问题（问题 9-12）+ P3 级 3 个问题（问题 14-16）未处理
- 无资料下单是否需要接入更多智能化模块（交期建议/排产/订单学习）— 已自行跳过，待用户确认

### 2026-07-23 下单页工厂全动态时间线（4 项 Gap 全部完成）✅

用户阶段四需求：下单人员在选择工厂时即可看到该工厂的全动态时间线（当前负载/预计完工/每天产量），不重复现有智能化逻辑、不占窗口位置（用 Drawer）。

**4 项 Gap + 时间线可视化组件**：
- [x] **Gap 1：预下单三档交期预测 API（不依赖 orderId）**
  - 新建 PreOrderDeliveryPredictionRequest/Response DTO + PreOrderDeliveryPredictionOrchestrator
  - 独特设计：用工厂总负载（含本单）计算排队时间，输出 timelineNodes 供前端直接渲染
  - 端点：`POST /intelligence/pre-order-delivery-prediction`
- [x] **Gap 2：产能缺口分析集成到下单页**
  - 复用现有 `CapacityGapOrchestrator.analyze()`（4 档 gapLevel）
  - Drawer 调用 `intelligenceApi.getCapacityGap()`，按 factoryName 过滤
- [x] **Gap 3：工厂当前在产订单明细（可点击详情查看）**
  - 新建 FactoryActiveOrderDTO + FactoryActiveOrderOrchestrator
  - 按 plannedEndDate 排序，danger/warning/safe 三档风险分类
  - 端点：`GET /intelligence/factory-active-orders?factoryName=xxx`
- [x] **Gap 4：后端下单时产能预警（不阻断，仅 warning）**
  - 新建 FactoryCapacityWarningHelper（@Component）
  - 阈值：5000 件 / 20 单
  - warnIfOverloaded 不抛异常，仅 log.warn
  - evictFactoryCapacityCache 删除 Redis key `factory_capacity:{tenantId}`
  - ProductionOrderOrchestrator.saveOrUpdateOrder 末尾 afterCommit 回调 warnIfOverloaded
  - evictCacheAfterCommit 同步路径 + afterCommit 路径都加 evictFactoryCapacityCache
- [x] **时间线可视化组件（详情视图）**
  - 新建 FactoryInsightDrawer.tsx（720px 宽 Drawer，destroyOnClose）
  - 三大区块：交期预测时间线（水平节点）+ 产能缺口分析 + 在产订单明细 Table（7 列）
  - Promise.all 并行 3 API
  - OrderFactorySelector.tsx 加「查看工厂全动态详情」镂空按钮（内部 + 外发工厂各一处）
  - renderInsightDrawer 在 return 末尾只渲染一次
  - intelligenceApi.ts + operation.ts 新增 4 类型 + 3 API 方法

**算法复用（不重复造轮子）**：
- 新建 FactoryVelocityCalculator.java 从 DeliveryPredictionOrchestrator 拆薄
- 复用 EWMA(α=0.33) + 趋势检测(最小二乘,±25%) + 季节性修正(周末70%) + P80 百分位混合(6:4) + 历史偏差校准
- 区别：单订单聚合 vs 工厂所有在制订单聚合

**踩坑修复（编译期）**：
- 后端：MyBatis-Plus `qw.ne("status", "a","b","c")` 不支持多值 → `qw.notIn("status", Arrays.asList(...))`
- 前端：ApiClient.post 泛型 R 默认 = T，`api.post<{code,data:T}>` 返回 `Promise<{code,data:T}>`，await 后直接 `.data`

**验证**：
- mvn compile -q 通过（exit 0）
- npx tsc --noEmit 通过（exit 0）

**变更范围**：后端 8 文件（5 新建 + 3 修改）+ 前端 4 文件（1 新建 + 3 修改）= 12 文件。

### 2026-07-22 小云AI P0+P1 前沿升级全部完成（待提交）✅

延续 GitHub 前沿调研（Mem0/Letta/Langfuse/Graphiti/Cognee/AWS S3 Vectors），本次完成 P0 三项 + P1 五项共 8 项智能化升级：

**P0 阶段（已完成）**：
- [x] P0-1 MCP 工具入参提示注入防御（4 个 MCP，仅本地）
- [x] P0-2 反思记忆闭环（ReflectiveMemoryWriter + 5 文件修改）
- [x] P0-3 L4 ProceduralMemory 自编辑工具集（AgentTool+Controller+CRUD）
- [x] P0-4 Langfuse 全链路追踪（span 层级 + 主对话接入 + submitScore）

**P1 阶段（已完成）**：
- [x] **P1-1 t_ai_long_memory 时序字段**（Graphiti 时序知识图谱方向）
  - 新建 Flyway V202707221000 — valid_from/valid_to/superseded_by + 2 索引 + 回填
  - 修改 AiLongMemory entity + LongTermMemoryOrchestrator（supersedeOldMemories + retrieve 过滤）
- [x] **P1-2 扫码 State Graph + HITL**（LangGraph 状态机方向）
  - 新建 ScanState（11 状态枚举）+ ScanStateGraph（状态机+HITL）+ Controller
  - 新建 Flyway V202707221002 — t_scan_state_log
  - 零侵入：未修改任何现有 ScanRecordOrchestrator 代码
- [x] **P1-3 t_shared_agent_memory + 消息总线**（AWS S3 Vectors 多 Agent 协作方向）
  - 新建 Flyway V202707221001 — t_shared_agent_memory
  - 新建 Entity/Mapper/Service/CleanupJob
  - MultiAgentGraphOrchestrator 已集成 readFacts/writeFact
- [x] **P1-4 离线评估 dataset**（Langfuse 离线评估方向）
  - 新建 Flyway V202707221003 — t_eval_dataset + t_eval_item
  - 新建 Entity/Mapper/Service/Job/DTO
  - 每周日 02:00 离线评估
- [x] **P1-5 记忆巩固定时任务**（Cognee 离线巩固方向）
  - 新建 MemoryConsolidationService + MemoryConsolidationJob + ConsolidationResult DTO
  - 每天 03:30 巩固相似记忆

**验证**：
- mvn compile -q 通过（exit 0）
- check-flyway-sql 无新增警告（253 个全为历史遗留）
- audit-tenant-id 无新增违规（1 处历史遗留 RoleTemplate）
- 6 个 MCP node --check 通过

**变更范围**：P0 17 文件 + P1 25 文件 = 42 文件，4 个新 Flyway 迁移。
**非任务文件**保持未暂存：PatternProductionController.java、types/style.ts。

### 2026-07-22 小云AI P0 前沿升级（待提交）✅

延续 GitHub 前沿调研（Mem0/Letta/Langfuse/Graphiti/Cognee），本次完成 P0 三项智能化升级：

- [x] **P0-1 MCP 工具入参提示注入防御**（仅本地，.trae/ 在 .gitignore）
  - db-query-mcp 新增 `assertNoSqlInjection` + `stripStringLiterals`，接入 3 个工具函数
  - flyway-mcp/test-runner-mcp/memory-bank-mcp 修复路径穿越/ReDoS 等 4 个 HIGH 风险
  - 参考 Azure DevOps MCP 2026-07 漏洞
- [x] **P0-2 反思记忆闭环**（Mem0/Letta 前沿方向）
  - 新建 ReflectiveMemoryWriter + SelfCritiqueResult DTO
  - 修改 AiAgentOrchestrator/ConversationReflectionOrchestrator/PromptContextProvider/AiAgentPromptHelper/IntentBasedPriorityRouter
  - SelfCritic 评分<75 → AiLongMemory(layer=REFLECTIVE) → 下次类似问题召回 → prompt 注入
- [x] **P0-3 L4 ProceduralMemory 自编辑工具集**（Letta 自编辑记忆方向）
  - 新建 ProceduralMemoryCreateDTO/UpdateDTO/ProceduralMemoryTool/ProceduralMemoryController
  - 修改 ProceduralMemoryService（追加 6 个 CRUD）+ AiAgentToolAccessService（注册工具）
  - AI 可自编辑 SOP，从"只读检索"升级为"自编辑进化"
- [x] **P0-4 Langfuse 全链路追踪**（Langfuse 28.4k star + OpenTelemetry 方向）
  - 增强 LangfuseTraceOrchestrator（beginSpan/endSpan/recordEvent/recordGeneration）
  - 新建 LangfuseSpanContext（ThreadLocal span 栈）+ LangfuseSpanHelper（try-with-resources）
  - 修改 AgentLoopEngine（5 个关键节点 span 包裹）+ AiAgentOrchestrator（pushTrace/submitScore/clear）
- [x] mvn compile -q 通过（exit 0）
- [x] audit-tenant-id 无新增违规（1 处历史遗留）
- [x] 6 个 MCP node --check 通过
- [x] 非任务文件保持未暂存：PatternProductionController.java、types/style.ts

**变更范围**：17 个文件（9 修改 + 8 新建），599 行新增。
**下一步**：P1-1~P1-5（时序字段/扫码 State Graph/共享记忆/离线评估/记忆巩固）。

### 2026-07-22 前端 eslint warning 全面清零（commit 6db64aecf）

- [x] 修复 54 个 react-hooks/exhaustive-deps warning（34 个文件）
- [x] 清理 8 个遗留 no-unused-vars warning
- [x] 3 组 subagent 并行执行（Group 1: 18 文件 / Group 2: 11 文件 / Group 3: 9 文件）
- [x] 全局 `npx tsc --noEmit` 0 errors
- [x] 全局 `npx eslint . --max-warnings 500` 0 warnings
- [x] 推送到远程（commit 6db64aecf，117 files changed）
- [x] 非任务文件保持未暂存：`PatternProductionController.java`、`types/style.ts`

**最终状态**：eslint 从 62 warnings → 0 warnings，CI 完全清零。

### 2026-07-22 前端 400-500 行超大文件拆分收尾（commit dbbbda837）

- [x] 拆分约 50 个 400-500 行区间超大 TS/TSX 业务文件
- [x] 三种拆分模式：目录化拆分（主组件+子组件）、Hook 拆分、列组按业务域拆分
- [x] 严格保持 API 路径、参数签名、字段名、返回值结构、业务逻辑不变
- [x] 修复目录化后相对路径层级问题（多加一层 `../`）
- [x] 修复 Hook 含 JSX 必须用 .tsx 扩展名问题
- [x] 修复共享 utils.ts interface 未导出（TS4058）问题
- [x] 修复类型系统兼容性（可选 vs 必填、索引签名）
- [x] 全局 `npx tsc --noEmit` 验证通过（0 errors）
- [x] 推送到远程（commit dbbbda837）
- [x] 非任务文件保持未暂存：`PatternProductionController.java`、`types/style.ts`

**最终统计**：500+ 行剩 2 个（intelligenceApi.ts/routeConfig.ts）、400-500 行剩 1 个（utils/api/core.ts 472 行）、300-400 行剩 146 个待推进。

### 2026-07-19 员工打卡后端健壮性增强（P1+P2 全修）

- [x] **P1**：WorkAttendance 实体补齐 @TableField(fill=FieldFill.INSERT/INSERT_UPDATE) 注解（修复 updateTime 永不更新的 bug）
- [x] **P2.1**：Mapper 新增 selectLatestOpen + Service 新增 findLatestOpen（查最近未下班打卡记录）
- [x] **P2.1**：Orchestrator.clockOut 新增跨天兜底分支（凌晨下班打卡补到昨晚的上班卡，避免工时丢失）
- [x] **P2.2**：Orchestrator.clockIn save 调用 try-catch DuplicateKeyException，并发兜底返回"今日已上班打卡"
- [x] mvn compile 验证通过（exit 0，2188 源文件）
- [x] check-flyway-sql.py 验证通过
- [x] audit-tenant-id.py 验证通过（1 处历史遗留 RoleTemplate 违规，非本次引入）
- [x] 决策 D-042 记录：员工打卡健壮性增强 — 实体注解对齐 + 跨天补卡兜底 + 并发竞态兜底

### 2026-07-19 财务数据链路闭环（Phase 1-4 + Phase 3 全部完成）

- [x] **Phase 1 止血（5 项核心修复）**：反向账单机制 + SalesReturn/FactoryShipment/ShipmentReconciliation/ReconciliationStatus 联动
- [x] **Phase 2 补齐（5 项 P0 修复）**：ProductionCleanup/FinishedWarehouse/PurchaseReturn/MaterialPurchase 系列
- [x] **Phase 2.5 EXTERNAL_FACTORY 核查（3 P0 + 6 P1 + 1 P2）**：SecondaryProcessOrchestrator 非法枚举修复 + 前端 SHIPMENT 选项
- [x] **Phase 4 审计修复（3 处编译错误）**：SalesReturnOrchestrator/FactoryShipmentOrchestrator/ShipmentReconciliationOrchestrator
- [x] **Phase 3-1: isOwnFactory 字段化** — Flyway V202707191000 幂等加列 + 多租户安全回填
- [x] **Phase 3-2: undoPatternScan 双写** — PatternProductionOrchestrator 重写，5 项修复（多租户/工资结算/ScanRecord 镜像/备注日志/时间窗）
- [x] **Phase 3-3: 样衣开发费用统一接入 BillAggregation** — StyleInfoOrchestrator 新增 pushStyleDevelopmentBill/reverseStyleDevelopmentBill，金额=materialCost+processCost
- [x] mvn compile 编译验证通过（exit 0）
- [x] check-flyway-sql.py 验证通过
- [x] 决策 D-041 记录：财务数据链路闭环 — 反向账单机制 + isOwnFactory 字段化 + 样衣开发费用统一接入

### 2026-07-18 三端数据流转一致性核查 + 3个P0级多租户漏洞修复

- [x] P0: 修复 PatternRevisionController.java list 接口缺少 tenant_id 过滤
- [x] P0: 修复 PatternProductionOrchestrator.java 列表查询缺少 tenant_id 过滤
- [x] P0: 修复 PatternProductionController.java 新端点（后置校验改为查询时直接带 tenant_id 过滤）
- [x] 三端一致性核查：共发现 47 项问题（13 P0 / 16 P1 / 18 P2），已记录待办
- [x] 小程序样衣开发进度显示修复（stage-detail 别名匹配/进度条UI/缓存重建）
- [x] 仓库库位选择修复（GET改POST + 字典兜底逻辑）
- [x] 工序展示与 PC 端配置对齐（按 stageKey 过滤 + 父阶段分组）
- [x] 代码质量扫描核实（删除3张未引用图片，确认误报）

### 2026-07-16 全局 API 响应处理规范清理 + P0 级问题修复

- [x] P0: 修复 `dashboard/order-detail/index.js` 2 处 `res.code !== 200` 判断错误（ok() 失败直接 throw，不会走到 then）
- [x] P0: 更新 `ScanSubmitter.js` 扫码成功判断逻辑注释，明确 ok() 返回值语义
- [x] P1: 清理 `defect/index.js` 冗余 `res.data` 判断
- [x] P1: 清理 `sample-development/index/index.js` 2 处冗余判断
- [x] P1: 清理 `home/index.js` + `more-apps/index.js` 收藏应用加载冗余判断
- [x] P1: 清理 `order/create/index.js` 2 处冗余判断
- [x] P1: 清理 `warehouse/sample/scan-action/index.js` 3 处冗余判断
- [x] P1: 清理 `components/purchase-cart-drawer/index.js` 2 处冗余判断
- [x] P1: 清理 `components/ai-assistant/index.js` 2 处冗余判断
- [x] 确认 `tenant.publicList()` / `system.login()` / `tenant.workerRegister()` 使用 raw()，`res.data` 判断正确，未修改
- [x] ESLint 验证：13 个 errors 均为历史遗留，本次修改未引入新 error
- [x] 新增决策 D-039：API 响应处理规范 — ok() vs raw() 必须严格区分

### 2026-07-15 PC 质检入库页订单号字体过大修复

- [x] 定位根因：`WarehousingTable.tsx` 订单号列硬编码 `fontSize: 14`，违背设计系统 `--table-cell-font-size: 12px`
- [x] 将文件中 9 处硬编码 `fontSize: 14` 统一改为 `var(--table-cell-font-size)`
- [x] 订单号下方生产方/组织路径改为 11px 灰色副标题样式
- [x] 前端 `npx tsc --noEmit` 0 errors

### 2026-07-14 质检页面款式图片不显示修复 + 外发管理状态确认

- [x] 定位质检列表图片缺失根因：`ScanRecord.styleId` 为空导致 `enrichStyleInfo` 无法匹配封面图
- [x] 后端 `ScanRecordEnrichHelper.enrichStyleInfo` 增加 `orderId → ProductionOrder.styleId` 兜底查询
- [x] 修复覆盖 `list/getByOrderId/getByStyleNo/getHistory/getMyHistory` 全链路扫码记录接口
- [x] 修复 `miniprogram/pages/defect/index.js` ESLint `no-empty` 错误
- [x] H5 `source-miniapp` / `public/source-miniapp` / `dist/source-miniapp` 同步 `defect/index.js`
- [x] 核查外发管理命名：小程序/H5 菜单与页面标题已统一为「外发管理」
- [x] 确认外发发货功能已实现：入口在「外发管理 → 我的订单 → 展开卡片 → 发货」
- [x] 后端 `mvn compile -q` 通过；`defect/index.js` ESLint 0 errors；H5 三端 diff 一致

### 2026-07-14 全量 API 模块核查 + 3 处修复

- [x] 扫描 `miniprogram/utils/api-modules/*.js` 全部 14 个模块的导出与语法
- [x] 发现并修复 `return.js` `salesReturn.reject` 参数传递 bug（`options.params` 不生效）
- [x] 发现并修复 `finance.js` `factoryShipment.listByOrder` 错误端点（`/list-by-order` → `/search`）
- [x] `api.js` 补充导出 `fieldConfig`
- [x] 修复 `field-config.js` 未使用 `raw` import 导致的 ESLint error
- [x] H5 `source-miniapp` + `public/source-miniapp` 同步以上修改
- [x] `node --check` 全部 api-modules 通过；`npx eslint` 0 errors；`mvn compile -q` 通过

### 2026-07-14 销售模块运行时错误修复 + 验证闭环

- [x] 新建 `miniprogram/utils/api-modules/ecommerce.js`，实现 `getSalesStats` / `listOrders`
- [x] `miniprogram/utils/api.js` 导入并导出 `ecommerce` 模块
- [x] 修复 `pages/sales/overview/index.js` 与 `pages/sales/order-list/index.js` 对 `api.ecommerce` 的调用
- [x] 后端 `DictController` 增加 `POST /api/system/dict/list-by-type` 映射，保留 `GET /by-type` 兼容
- [x] 后端 `EcommerceOrderOrchestrator.calcSalesStats` + `EcommerceOrderController.salesStats` 实现销售统计
- [x] 后端 `mvn compile -q` 通过
- [x] 小程序 4 个关键文件 ESLint 0 errors（仅历史 warnings）
- [x] H5 `source-miniapp` + `public/source-miniapp` 与小程序 source diff 一致

### 2026-07-14 样衣开发筛选/搜索/阶段后端联通性修复

- [x] 后端 `PatternProductionOrchestrator.listWithEnrichment` 支持 `status=OVERDUE/WARNING`，按交期过滤并重新分页
- [x] 前端 `sample-development/index/index.js` 删除 `OVERDUE/WARNING` 前端本地过滤，直接传 `status` 给后端
- [x] 修复 `sample-development/detail/index.js` 4 个 ESLint 硬错误
- [x] H5 `source-miniapp` + `public/source-miniapp` + `dist/source-miniapp` 三端同步
- [x] ESLint 0 错误、H5 三端 diff 一致、后端 `mvn compile -q` 通过
- [x] 记录决策 D-038：虚拟状态筛选必须后端过滤并重新分页
- [x] 修复 `sample-development/detail/index.js` `formatNodeTime` iOS 日期解析报错（MM-dd HH:mm 不应 replace 成 MM/DD HH:mm）
- [x] H5 三端同步 iOS 日期解析修复

### 2026-07-12 样衣开发阶段详情数据打通 + H5 三端同步

- [x] 小程序 `stage-detail/index.js` 工艺单/尺寸表/工序配置/码数单价改为调用 PC 端同款 API
- [x] 尺码表按部位×尺码矩阵展示
- [x] 工序配置优先 `styleApi.listProcesses` + 兜底 `patternProcessConfig`
- [x] 生产制单调用 `production.getProductionSheet` 展示完整 BOM/尺码/款式信息
- [x] 码数单价调用 `production.listSizePrices` 按工序×尺码矩阵展示
- [x] H5 `source-miniapp` + `public/source-miniapp` 三份拷贝与小程序完全一致
- [x] H5 `public/source-miniapp/utils/api-modules/production.js` 补充 `getProductionSheet`
- [x] JS 语法检查通过；无新增 `?.` / `padStart`；硬编码颜色未新增

### 2026-07-10 小程序/UI/性能/扫码全量优化日

- [x] iOS 日期格式兼容 + 样衣扫码脱离大货菲号系统
- [x] 性能优化 — 5 处 N+1 查询改为批量查询、7 个 RiskDetector 全表扫描加时间过滤/LIMIT
- [x] 工序进度条显示「完成件数/总件数 · 完成菲数/总菲数」
- [x] 小程序全局 UI 专业化 — 去 emoji、SVG 图标、镂空按钮、蓝色导航、纯色无渐变、卡片阴影
- [x] 字体/按钮/输入框高度统一（12px 主体、24-32px 按钮、32px 输入框）
- [x] 订单详情页图片轮播功能
- [x] 样衣开发详情页与 PC 端数据互通、附件预览下载
- [x] 设计预览页面创建与 6 类问题修复
- [x] 采购/样衣/裁剪/生产管理等多个页面交互 bug 修复
- [x] 样衣开发与采购节点数据联动（quick-edit + stock-check 接口）
- [x] 已关闭订单采购记录过滤修复
- [x] WebSocket 日志级别与后端 500 问题排查
- [x] 采购表格勾选后序号列消失修复（global.css 移除 position/z-index）
- [x] 前端类型检查通过、生产构建通过
- [x] 外发工厂/发货多端逻辑一致性修复（手机端+H5+后端）

### 2026-07-09 出库优化 + 工序阶段修复 + WebSocket修复

- [x] 工序阶段误判修复 — 二次工艺禁用时动态跳过，不再误拦车缝（`ec9b20fd0`）
- [x] 出库仓库/库位选择优化 — 3个出库场景移除选择器，改为显示当前位置（`324ec2b06`）
  - 样衣借出：移除仓库/库位选择，显示当前存储位置
  - 物料出库：移除仓库/库位选择，显示当前位置
  - 成品扫码出库：移除仓库/库位选择，表格增加"当前库位"列
  - 后端统一自动从库存记录获取仓库和库位
- [x] WebSocket修复（3项）— token缺失 / 握手500 / StrictMode双重挂载（`88a782352` + `c356c8660` + `3c26e7bff`）
- [x] RESTful迁移第二批 — 7个Controller + 15个前端/小程序/H5文件（`324ec2b06`）
- [x] Flyway修复 — V202606240001/002/003 MySQL 8.0兼容 + V20260708002表名错误（`ae98091a0` + `afa2d72c0`）
- [x] CI优化 — 门禁job合并 + 变量名修复（`531d7adc1` + `0b4d3e3cd`）

### 2026-07-05 ~ 2026-07-08 高密度问题修复（64 个提交）

- [x] P0：扫码页崩溃打不开修复（`e1902dfdb`）
- [x] P0：订单进度球数据全部不显示修复 — 异步线程租户上下文丢失（`585af8405`）
- [x] P0：订单列表异步线程租户上下文丢失系统性修复（`786310508`）
- [x] P0：扫码按钮点不动 + Flyway CI 校验失败修复（`1e9ef17fb`）
- [x] P0：Flyway 版本号撞车 + V49 非幂等导致迁移链路卡死修复（`1eb11c809`）
- [x] P0：20个P0问题修复 — 数据链路断点+状态码英文+多端不一致（`523efce49`）
- [x] P1：25个P1问题修复 — 多模式覆盖+数据链路+跨端一致性+状态码兜底（`21a03dff5`）
- [x] 扫码模块 20+ 项修复（样衣扫码/大货扫码/扫码页2次整体重做）
- [x] Flyway/迁移 4 项修复（版本号撞车/非幂等/DELIMITER bug/CI校验）
- [x] 小程序 8 项修复（编译报错/状态判断/wx:if/app.json/领取功能/工序保存）
- [x] 裁剪模块 5 项修复（404/领取提示/冗余页面/入口合并）
- [x] 采购模块 7 项修复（弹窗/超领bug/字段补全/封面图/布局对齐）
- [x] 工序跟踪 3 项修复（终态订单/UUID归组/节点时间+iOS日期）
- [x] 中文化/字段一致性 3 项（全系统多端中文化/颜色图片回填）
- [x] 新功能 5 项（数据链路可视化地图/统计卡片/聚水潭对接/字段配置简化/操作日志全链路）
- [x] 补录 memory-bank/activeContext.md（7-05~7-08 记录，之前滞后到 7-04）
- [x] 创建 TRAE 项目记忆 project_memory.md（含"记忆同步规则"）
- [x] 小程序样衣开发列表点击不跳转修复（改 `data-item` 为字符串 `data-style-id` / `data-id`）

### 2026-07-04 款式一键复制功能实现完成

- [x] 后端：`StyleInfoOrchestrator.copyStyle()` 补充工序/二次工艺/报价复制逻辑
- [x] 后端：修复 `buildNewStyleFromSource()` 扩展字段复制（sizeColorConfig/洗水唛等）
- [x] 后端：新增 `copyProcessToNewStyle()` / `copySecondaryProcessToNewStyle()` / `copyQuotationToNewStyle()` 方法
- [x] 后端：新增 `StyleQuotationService` / `StyleQuotation` 导入
- [x] 后端编译验证通过（`mvn compile -q` exit code 0）
- [x] 前端：API路径验证正确（`/style/info/${id}/copy`）
- [x] 前端编译验证通过（`npx tsc --noEmit` exit code 0）
- [x] 更新 `memory-bank/activeContext.md` 记录本次变更

---

## 已完成

### 2026-07-02 小云 AI P1 实用能力升级 5 项全部完成

- [x] P1-4 L4 Procedural Memory 完整实现（`SkillCrystallizationService.promoteToProcedural()` + `tryPromoteAsync()`）
- [x] P1-1 Agentic RAG 三阶段闭环（`AgenticRagService.retrieve()` 3 轮自纠正 + LLM 重写 + 启发式评分）
- [x] P1-3 巡检自动执行闭环（`AiPatrolJob.performAutoAction()` 创建真实任务 + 微信通知）
- [x] P1-2 NlQuery 完成（`NlQueryTool` @AgentToolDef 升级 + @DataTruth 修正）
- [x] P1-5 Hermes Learning Loop（`AgentLoopEngine` qualityScore 接入 SelfCritiqueGate + `recordFeedback()` 反馈回写 + 新事件类型）
- [x] 后端编译验证通过（`mvn compile -q -pl .` exit code 0）
- [x] 更新 `memory-bank/activeContext.md` 记录本次变更
- [x] 添加决策 D-032（小云 AI P1 五项实用能力升级）

### 2026-07-02 新增 P0 #23 MCP 工具强制调用规则（配置 ≠ 自动调用）

- [x] `.trae/rules/project_rules.md` 新增 P0 #23（10 个强制场景 + 降级规则 + tenantId 规则 + 例外清单）
- [x] `.trae/rules/agent-workflow.md` 嵌入 MCP 强制调用（第1/3/5/6步）
- [x] `memory-bank/mcp-tools-cheatsheet.md` 顶部新增 P0 #23 强制场景表
- [x] 更新 `memory-bank/activeContext.md` 记录本次变更
- [x] 添加决策 D-031（P0 #23 MCP 工具强制调用规则）

### 2026-07-02 MCP 工具体系全面优化（调研 + 配置 + 文档同步）

- [x] 调研 GitHub 2026 最火 AI 工具（MCP/Skill/Agent），4 方向并行核实
- [x] 创建 `.trae/mcp.json`（含 6 自研 MCP + Serena，之前缺失）
- [x] 接入 Serena（uvx）替代未实现的 code-search-mcp
- [x] 更新 `memory-bank/mcp-tools-cheatsheet.md`（决策树 + 36 工具清单 + Serena）
- [x] 更新 `.trae/rules/dev-mcp-design.md` 状态（设计 → 已实现 6/7）
- [x] 同步 `.trae/mcp-servers/MCP_CONFIG_TEMPLATE.md`（5 → 7 MCP + GitHub 可选）
- [x] 更新 `memory-bank/activeContext.md` 记录本次变更
- [x] 添加决策 D-029（Serena 替代 code-search-mcp）+ D-030（MCP 配置统一管理）

### 2026-06-23 系统全面体验优化（8大模块）

**背景**：用户反馈"线上经常出问题""操作不好用""信息不清晰"，全面梳理并按P0/P1/P2优先级批量修复。

- [x] 🔴 P0-1：数据库性能加固
  - t_scan_record新增9个多租户联合索引（tenant_id前缀）
  - 慢查询告警阈值从1000→500，新增慢查询比例监控（>1%告警）
  - Flyway迁移：V20270623001__add_scan_record_tenant_indexes.sql
- [x] 🔴 P0-2：AI接口超时对齐
  - AI_VISION_TIMEOUT_MS从30s→60s
  - 3个AI识别接口全部显式配置60s超时
- [x] 🔴 P0-3：加载状态+防重提交
  - 5个高频页面（成品库存/原料库存/订单列表/用户列表）增加双重防御
  - UI loading + useRef逻辑锁
- [x] 🟡 P1-1：错误提示友好化
  - GlobalExceptionHandler 5种异常提示改为用户友好文案
  - 前端新增showErrorWithRetry（带重试按钮的错误通知）
- [x] 🟡 P1-2：交互一致性规范
  - 6个核心页面分页默认值统一为20
  - 10个页面成功提示/危险确认弹窗全部符合规范
- [x] 🟡 P1-3：表单草稿自动保存
  - 新增useFormDraft Hook（300ms防抖+localStorage+7天过期）
  - 订单创建/款号新增/采购申请3个长表单集草稿保存与恢复
- [x] 🟢 P2-1：信息层级优化
  - 7个核心表格空状态增加"去创建"操作引导
  - 13处日期格式统一
  - 工资结算页面统计卡片视觉突出
- [x] 🟢 P2-2：视觉降噪
  - 定义6色状态CSS变量系统
  - 10个核心页面状态标签颜色统一收敛
- [x] 后端 mvn compile BUILD SUCCESS
- [x] 前端 npx tsc --noEmit 0 errors
- [x] Flyway SQL校验：新增迁移幂等性通过
- [x] 多租户隔离审计：本次修改未引入新风险
- [x] 更新 memory-bank/activeContext.md + progress.md

### 2026-06-23 权限系统大牌水准优化

**背景**：用户要求"优化到大牌的水准，比他们的系统要好用更简单，租户开户就马上知道怎么使用"。

- [x] 新租户开户向导 - TenantSetupGuide 组件（RoleList/index.tsx 集成）
- [x] 预设角色模板 - 7个模板已就绪（管理员/跟单员/仓库管理员/财务/质检/生产主管/裁剪师傅）
- [x] 数据权限维度验证 - all/team/own + factoryId 供应商隔离
- [x] 供应商数据隔离验证 - SupplierPortalController 完整实现
- [x] 权限矩阵可视化验证 - RoleList 页面功能完善
- [x] TypeScript 错误修复 - TenantSetupGuide.tsx res.message 类型问题
- [x] 编译错误修复 - RoleTemplateController.java Result.error → Result.badRequest
- [x] 后端编译验证 - mvn compile BUILD SUCCESS
- [x] 前端编译验证 - npx tsc --noEmit 0 errors

### 2026-06-20 小云AI 6大升级 + 开发效能体系

**借鉴来源**：Ruflo Truth Scoring / Claude Agent SDK / RooFlow Context Portal / GenericAgent / Hermes GEPA / SIJE 7-Agent / Agency-Agents 215角色

- [x] 🔴 P0-1：SelfCritiqueGate 多视角对抗评审
  - 新增 MultiPerspectiveCritic.java（285行，4视角并行：业务30%+数据30%+租户25%+权限15%，一票否决）
  - 新增 AdversarialJudgePipeline.java（215行，高风险场景Round 2验证+HighRiskDetector）
  - 新增 ConvergenceStopCondition.java（88行，连续2轮提升<5分停止）
  - 修改 SelfCritiqueGate.java（177→298行，集成多视角+对抗+收敛）
- [x] 🔴 P0-2：MCP 生产化
  - 新增 McpResourceSanitizer.java（95行，防prompt injection）
  - 新增 McpIdentityContext.java（113行，身份传播值对象）
  - 新增 McpToolError.java（130行，SERF结构化错误5类码）
  - 新增 McpTimeoutBudget.java（70行，ATBA自适应超时QUERY/REPORT/COMPUTATION）
  - 修改 McpResourceProvider接口（+默认方法向后兼容）+ 3个Provider实现 + McpProtocolService + 2个Controller
- [x] 🔴 P0-3：Memory Bank 数据库化（ConPort 模式）
  - Flyway V202606201003（t_memory_bank_entry + t_memory_bank_relation 两表）
  - 新增 MemoryBankEntry/Relation Entity + Mapper（含CTE递归traverseGraph）
  - 新增 MemoryBankDbService.java（274行，upsert/semanticSearch/addRelation/importFromMarkdown）
  - 新增 MemoryBankRelationService.java（76行，知识图谱遍历depth≤2）
  - 新增 MemoryBankMigrationRunner.java（132行，启动时Markdown→DB迁移，Redis幂等）
  - 修改 MemoryBankService（双写兼容）+ EvolutionOrchestrator（D-021指标）
- [x] 🟡 P1-1：Skill 三层渐进式披露
  - Flyway V202606201001（t_skill_template新增6字段：metadata_yaml/skill_md/references_json/token_budget/disclosure_level/disclosure_updated_at）
  - 新增 SkillDisclosureLoader.java（195行，三层按需加载+token估算+旧数据降级）
  - 新增 SkillDisclosureController.java（95行，REST API三层查询）
  - 修改 SkillTemplate Entity（+6字段）+ SkillAutoCreationService（生成三层）+ SkillExecutionTool（按需加载）
- [x] 🟡 P1-2：技能结晶化 + GEPA 遗传优化
  - Flyway V202606201002（t_prompt_optimization表）
  - 新增 SkillCrystallizationService.java（239行，高频问题Redis语义哈希计数→结晶化→跳过LLM）
  - 新增 GepaPromptOptimizer.java（337行，17个prompt块当基因，遗传算法种群10/代数≤5）
  - 新增 ConstraintGates.java（193行，三重门控：尺寸/语义漂移/测试套件）
  - 新增 EvolutionEventLogger.java（169行，events.jsonl append-only审计）
  - 修改 EvolutionOrchestrator（D-021注册3新组件+指标+健康检查）
- [x] 🟡 P1-3：服装专属 Skills（10个）
  - scan-flow-expert / wage-settlement-guard / tenant-isolation-auditor / delivery-forecast-advisor / supplier-risk-agent / quality-inspection-advisor / production-scheduling-advisor / cost-negotiation-advisor / fabric-sourcing-strategist / compliance-checker
  - 路径：.trae/skills/<name>/SKILL.md（每个80-115行）
- [x] 🟢 P2-2：per-call model selection + 成本爆炸防御
  - 新增 ModelSelectionRouter.java（242行，ECONOMY/STANDARD/PREMIUM三级，四维评估）
  - 新增 CostExplosionGuard.java（307行，上下文肥大+重复检测+熔断）
  - 修改 AiInferenceRouter（+chatWithModelSelection/+chatPremium）+ AiAgentOrchestrator（接入防御）+ EvolutionOrchestrator（D-021）+ application.yml（配置块）
- [x] 🟢 开发 skills 补充（8个）
  - orchestrator-scaffolder / tenant-isolation-auditor / transaction-boundary-checker / ai-tool-scaffolder / skill-scaffolder / mcp-resource-scaffolder / prompt-block-optimizer / evolution-component-scaffolder
  - 路径：.trae/skills/<name>/SKILL.md（每个108-141行）
- [x] 🟢 开发 MCP 服务器设计文档
  - 新增 .trae/rules/dev-mcp-design.md（410行）
  - 4个MCP：db-query-mcp / flyway-mcp / test-runner-mcp / code-search-mcp
  - 含工具清单/多租户安全/技术栈/集成方式/实施路线图
- [x] 后端 mvn compile BUILD SUCCESS（全部模块编译通过）
- [x] Flyway 迁移脚本 V202606201001/V202606201002/V202606201003 校验通过
- [x] EvolutionOrchestrator D-021 合规（17组件全部注册：原12 + 新5）
- [x] 新增铁律 D-022（多视角对抗评审强制启用）+ D-023（MCP resource description 必须 sanitize）+ D-024（Memory Bank 数据库化）+ D-025（per-call model selection 强制启用）
- [x] 更新 memory-bank/activeContext.md + decisionLog.md + progress.md
- [x] 新建 optimization-log-20260620.md

### 2026-06-19 Controller 事务边界全面治理 + 文档体系更新
- [x] 🔴 P0-1：PatternRevisionController → PatternRevisionOrchestrator 化（save/update/remove 全部下沉
- [x] 🔴 P0-2：PatternProductionController → PatternProductionOrchestrator 化
- [x] 🔴 P0-3：ProductionOrderNodeController → ProductionOrderOrchestrator.saveNodeOperations
- [x] 🔴 P0-4：SupplierUser / SupplierPortal Controller → SupplierUserOrchestrator 化
- [x] 🔴 P0-5：MaterialPickingController.audit() → MaterialPickingOrchestrator.audit
- [x] 🔴 P0-6：PaymentCallbackController → PaymentCallbackOrchestrator 化
- [x] 🔴 P0-7：AiMetricsOrchestrator.generateSnapshot() 加 @Transactional
- [x] 🔴 P0-8：ClosedOrderAiDataCleanupService 加 assertTenantOwnership 租户校验
- [x] 🟡 P1-1：GlobalExceptionHandler 新增 SecurityException 处理器（403 + 友好提示）
- [x] 🟡 P1-2：文档全面更新（decisionLog / productContext / project_rules / mcp-tools-cheatsheet）
- [x] 🟡 P1-3：新建 optimization-log-20260619.md（完整记录本轮治理
- [x] 🟢 P2-1：新增 memory-bank-updater Skill（.trae/skills/memory-bank-updater/SKILL.md）
- [x] 🟢 P2-2：新增 ci-rollback Skill（.trae/skills/ci-rollback/SKILL.md）
- [x] 后端 mvn compile BUILD SUCCESS（编译验证）
- [x] 更新 memory-bank/activeContext.md + decisionLog.md + progress.md

### 2026-06-18 小云AI CL4R1T4S 借鉴升级（6项优化）
- [x] P0-1 SelfCritiqueGate 输出前硬门控（PASS/SOFT_FAIL/HARD_FAIL 三档决策）
- [x] P0-2 memory_limitations 上下文块（四层记忆边界声明）
- [x] P0-3 响应延迟优化（PostTurnHooks异步 + 线程池扩容 + 缓存阈值降低 + Checkpoint异步 + MAS缓存）
- [x] P1-1 HIGH_RISK 工具 opt-in + 7条反例规则（结构化suggest + TTL 60→300）
- [x] P1-2 上下文块意图动态优先级（IntentBasedPriorityRouter）
- [x] P2-1 EvolutionOrchestrator 统一12组件 + 量化评估 + 补MemoryNudge @Scheduled
- [x] P2-2 MCP resources 启用（memory:// knowledge:// factory:// + 3个ResourceProvider）
- [x] 后端 mvn clean compile -q BUILD SUCCESS（3次验证）
- [x] 更新 memory-bank/activeContext.md + decisionLog.md + progress.md
- [x] 新建 optimization-log-20260618.md
- [x] 新增铁律 D-020（MCP resources 多租户隔离）+ D-021（自我进化组件统一可观测）

### 2026-06-11
- [x] 🔴 安全修复：微信支付回调验签逻辑不完整 → 使用 wechatpay-java SDK 实现正确验签
- [x] 🔴 安全修复：WechatPayAdapter.verifyCallback() 直接返回 false → 实现完整的 SDK 验签
- [x] 🟡 安全修复：数据库密码未校验 → 生产环境强制要求配置密码
- [x] 🟢 安全增强：IntegrationHttpClient 添加 HTTPS URL 强制校验
- [x] 🔧 修复：SampleWorkflowTool.saveSampleReview() 参数不匹配问题
- [x] 后端 mvn compile BUILD SUCCESS
- [x] Flyway SQL 校验通过

### 2026-06-01
- [x] 🔴 P0修复：getByOrderNo() 无 tenant_id 过滤 — 跨租户数据泄露
- [x] 🔴 P0修复：createOrderFromStyle() 未显式设置 tenant_id
- [x] 🔴 P0修复：PurchaseCartOrchestrator addItem/updateItem 添加 @Transactional
- [x] 🔴 P0修复：PurchaseDetailView.tsx specification→specifications 字段名修正（4处）
- [x] 🔴 P0修复：ProductionOrderController updateBasicInfo() 多表更新添加 @Transactional
- [x] 🔴 P0修复：ProductionOrderController quickEdit/urge/urgeReply 添加 @Transactional
- [x] 🟡 P1修复：PurchaseCartController 添加 @PreAuthorize
- [x] 🟡 P1修复：ProductionOrderController detail()/flow()/timeline() 添加 TenantAssert
- [x] 🟡 P1修复：ProductionOrderController healthScores() IDOR 修复（过滤租户归属）
- [x] 采购车系统全链路（后端Orchestrator/Service/Controller + 前端组件/Hook/API + 小程序同步）
- [x] 样衣开发展开视图 + 采购快捷操作
- [x] ResizableTable 增强
- [x] 小程序全量 var→const 重构 + 页面优化
- [x] 补写 2026-05-12/13 优化日志
- [x] 补写 2026-06-01 优化日志
- [x] 更新 memory-bank（activeContext + progress + decisionLog D-012/D-013/D-014）
- [x] 后端 mvn compile BUILD SUCCESS
- [x] 前端 npx tsc --noEmit 0 errors

### 2026-05-29
- [x] 自动化测试缺口分析：审查近期代码变更，识别3个缺少测试覆盖的核心模块
- [x] 新增测试：WarehouseLocationOrchestratorTest（11个测试用例）
  - P0 SQL语法错误修复验证：空标识符集合返回空列表，不执行SQL查询
  - 有效标识符查询入库记录并更新usedCapacity
  - 创建/批量初始化/容量更新等核心路径
- [x] 新增测试：GraphRagServiceTest（10个测试用例）
  - 知识图谱上下文构建：空消息、无匹配关键词、无实体、空结果
  - 关系链格式化输出、关系类型翻译（MANUFACTURED_BY等）
  - 数据库异常静默处理、实体去重
- [x] 新增测试：FactoryProfileLearningServiceTest（7个测试用例）
  - 工厂画像上下文：无数据、格式化表格、低评分预警、S/A级推荐
  - 工厂名称截断、null值默认值处理、数据库异常静默处理
- [x] 测试验证：28个新测试全部通过（BUILD SUCCESS）
- [x] 确认 TenantAiConfigService 已有完整测试覆盖（无需新增）

### 2026-05-28
- [x] 小云AI 9大智能化升级（全部3轮）深度审查 + 7项修复
- [x] 🔴 修复 AgentCheckpoint 实体冲突 — 删除 agent/checkpoint/AgentCheckpoint.java，transient 字段合并到 entity 版本
- [x] 🔴 修复 AgentCheckpointManager — 正确 import intelligence.entity.AgentCheckpoint + intelligence.mapper.AgentCheckpointMapper
- [x] 🔴 修复 AgentLoopEngine — import 切换到 intelligence.entity.AgentCheckpoint
- [x] 🔴 修复 AgentCheckpointManager selectCount().intValue() 类型转换
- [x] 确认 HandoffEngine/SubAgentRegistry/Skill YAML 无其余问题
- [x] 后端 mvn compile BUILD SUCCESS, 0 errors
- [x] 前端 npx tsc --noEmit 0 errors（1项预存测试错误，与本次无关）
- [x] memory-bank 更新
- [x] 小云AI 6大智能化升级 — 上下文工程系统（工具结果智能摘要）
- [x] 小云AI 6大智能化升级 — 结构化输出（JSON置信度+行动建议）
- [x] 小云AI 6大智能化升级 — 多层级记忆引擎（工作中/情景/语义）
- [x] 小云AI 6大智能化升级 — 主动风险检测（7类业务风险扫描）
- [x] 小云AI 6大智能化升级 — Prompt进化系统（自进化提示词）
- [x] AgentLoopEngine 集成全部6个新Service
- [x] xiaoyun-base-prompt.yaml 提示词升级（规划先行+结构化输出+智能增色）
- [x] PromptEvolutionService 编译错误修复（@Getter + 5缺失方法 + getDeleteFlag）
- [x] 后端 mvn compile BUILD SUCCESS, 0 errors, 0 Checkstyle violations
- [x] 前端 npx tsc --noEmit 0 errors
- [x] memory-bank 全面更新

### 2026-05-13
- [x] 订单号生成格式统一：SerialOrchestrator/ProductionOrderServiceImpl/ProductionOrderCommandService 三入口统一为 PO+yyyyMMddHHmmss
- [x] ProductionOrderCommandService 添加唯一性检查（JdbcTemplate 绕过逻辑删除）
- [x] 前端 OrderCreateModal placeholder 更新为 PO20260513143025
- [x] 小程序 fallback 从 ORD+Date.now() 改为 PO+yyyyMMddHHmmss
- [x] 编译验证通过：后端 mvn compile + 前端 tsc --noEmit 0 errors
- [x] 测试缺口分析：审查最近代码提交，识别4个缺少测试覆盖的核心模块
- [x] 新增测试：OrderDeliveryRiskOrchestratorTest（8个测试用例）
- [x] 新增测试：ProductionProgressToolTest（2个测试用例）
- [x] 新增测试：SystemOverviewToolTest（4个测试用例）
- [x] 新增测试：DeepAnalysisToolTest（4个测试用例）
- [x] 测试验证：18个新测试全部通过（BUILD SUCCESS）

### 2026-05-12
- [x] P0修复：扫码撤回工资结算拦截（ScanUndoHelper + settlementStatus检查）
- [x] P1修复：ScanRecordOrchestrator.undo()添加@Transactional
- [x] P1修复：MaterialStockMapper lockStock/decreaseStockWithCheck可用量检查
- [x] P1修复：PayableMapper atomicAddPaidAmount原子更新
- [x] P1修复：WagePaymentOrchestrator原子更新替代read-modify-write
- [x] P1修复：MaterialPurchaseMapper atomicAddArrivedQuantity原子更新
- [x] P1修复：MaterialInboundOrchestrator原子更新arrivedQuantity
- [x] P1修复：ProductWarehousingRollbackHelper入库回退工资结算拦截
- [x] P1修复：ShipmentReconciliationOrchestrator扫码成本计算统一过滤
- [x] P1修复：V20260512003唯一索引加入tenant_id
- [x] P1兼容性修复：前端cutting/by-code GET→POST
- [x] P2兼容性修复：小程序material/roll/list-by-inbound GET→POST
- [x] 测试修复：MaterialInboundOrchestratorTest mock对齐（lenient + 双次返回值）
- [x] 全面系统测试完成：2781单元 + 315集成 + 22并发/幂等 = 0故障
- [x] 集成5大AI Agent方法论到开发流程

### 2026-05-05
- [x] P0修复：PC端AI助手消息空白（useAiChat.ts防御式消息创建）
- [x] 小云AI自我进化系统（SelfCriticService + QuickPathQualityGate + DataTruthGuard 5级 + DynamicFollowUpEngine + RealTimeLearningLoop）
- [x] 误报治理：StatusTranslator补全映射 + 提示词增加订单终态精确区分
- [x] Flyway修复：V20260505001版本号重复 + V20260308b表名冲突
- [x] AgentLoopEngineTest补充Mock

### 2026-05-03
- [x] P0修复：部署后全站404白屏（index.html内联恢复脚本 + nginx修复 + try_files修复）

### 2026-05-02
- [x] V202605020932 VIEW迁移失败修复
- [x] SmartRemark巡检remarks字段溢出修复
- [x] 扫码记录tenant_id为NULL修复
- [x] V202605021000 Flyway迁移失败修复
- [x] Flyway版本号重复修复
- [x] 10处旧式API端点迁移RESTful
- [x] REGEXP编码修复兼容MySQL 8.0
- [x] t_factory索引修改修复
- [x] DbColumnDefinitions新增38列覆盖
- [x] DbTableDefinitions新增6张表定义
- [x] 8处Service层@Transactional违规移除
- [x] 前端WagePayment 22处中性色替换

## 当前任务

- [ ] PC端样衣详情页其他 Tab 改造（颜色规格/工艺说明/样品节点/设计状态/同类资料）— 等用户下一步指令

## 待办

- [ ] PC端样衣详情页其他 Tab 按截图改造（颜色规格/工艺说明/样品节点/设计状态/同类资料）
- [x] 手机端/H5 端是否需同步 D-058~D-067 近期更新（2026-08-14 全量核实：全部向后兼容，mobile 零改动；领料锚点 mobile 早已兼容；H5 两份副本 diff 一致）
- [x] 全端术语统一 SKU→商品编码 / BOM→物料清单（2026-08-14：小程序13文件17处 + 两份H5副本同步；PC 扩大范围 62 文件 120+ 处——纠正上轮 glob 漏检导致的"PC零残留"误判，tsc 通过，详见 D-068）
- [x] 样衣详情颜色图片预览 Bug（双预览层叠加）修复（2026-08-14：StyleSkuColorImages 关闭 antd 内置 preview，Modal 限高 65vh）
- [x] 生产要求(description)被BOM操作日志污染根因修复（2026-08-14 D-069：日志迁 t_style_operation_log + Flyway V202708143000 清洗 + 生产Tab操作记录面板；待本地启动验证 Flyway 效果）
- [ ] 小云AI全链路测试（规划引擎+结构化输出+主动风险检测实际效果验证）
- [x] 打印/列表/字典全系统同步 D-058 新字段结构（D-062：打印BasicInfoSection重对齐+设计师改读designer+6处旧标签同步，tsc 0 errors）
- [x] 样衣列表统计8vs6修复+进度球可见即刷（D-063：统计Tab下推后端onlyInProgress/onlyCompleted/onlyDelayed+fetchList合并语义+45s轮询，前后端编译通过）
- [x] P1性能：MaterialPurchase统计查询DATE()函数索引失效（291d42b55）
- [x] P1性能：订单列表查询添加缓存（已接入OrderListCacheHelper）
- [ ] P2：@Version与手写原子SQL混用风险统一
- [ ] P2：前端移除xlsx重复依赖
- [ ] P2：vendor-react-antd chunk拆分
- [x] P2：RESTful迁移第二批（cutting-task/by-style-no等）
- [ ] 前端硬编码颜色值批量替换（~555处中性色）
- [ ] Service层@Transactional违规治理（剩余62处，需逐个分析调用链）
- [x] 打印预览与详情页字段对齐（D-084 2026-08-16：板类 translatePlateType 回退原值修"未知"+生产要求打印防御清洗日志行；商品类型/款式特征链路核实完好属部署环境陈旧，详见 decisionLog）
- [x] 属性库通用化+打印二维码右上角缩小+BOM图放大（D-085 2026-08-16：AttributeGroupLibraryModal迁common泛化groups可配置；打印QR 80→42右列顶右上角/主图90→120/BOM图40→64；PUT 400本地实测200定性为部署环境旧后端，需更新部署后端+Flyway）

### 2026-06-20 测试闭环（已完成）

- [x] 测试闭环：5389 tests, 0 failures, 0 errors（从 122 失败修复到 0）
- [x] 主代码 bug 修复 5 个：
  - EcStockSyncEventListener/EcSyncJob 添加 @ConditionalOnProperty（条件Bean依赖者未加条件注解）
  - GepaPromptOptimizer 拆分 @Scheduled 带参方法（Spring 禁止 @Scheduled 带参数）
  - DagExecutor 并行任务用 state 副本（HashMap 并发写入 bug）
  - ScanUndoHelper 提取 safeRecomputeProgress（异常传播导致撤销返回失败）
- [x] 测试配置修复：application-test.yml 添加 allow-bean-definition-overriding
- [x] 测试文件修复 13 个（Service/Controller/集成测试 mock 缺失与断言修正）
- 详见 `.trae/rules/optimization-log-20260620.md` 第十五章
### 2026-07-08 二次工艺筛选 + 菲号显示修复（`bee543b48`）

- [x] 二次工艺筛选去混入尾部子工序 — `riskBadgeRenderers.tsx` 使用 `isSecondaryProcessSubNode` 过滤
- [x] 菲号显示带订单号信息 — `useProcessTrackingColumns.tsx` 接收 `orderNo`，纯数字 bundleNo 拼接订单号

### 2026-08-16 系统设置三页布局优化（人员/岗位/组织架构，对齐 _SPEC 设计稿）

- [x] 人员管理：StatsBar 4 KPI 卡片 + 工号 employeeNo 全链路（Flyway V202708161400 + 前后端）+ 手机号脱敏 PhoneCell + 行内操作对齐
- [x] 岗位管理：左侧岗位卡片补"N 人 · N 权限点"指标 + 右侧双栏（菜单权限矩阵/数据权限 4 级）+ 底部关联人员内嵌预览
- [x] 组织架构：KPI 改部门/团队/总人数/平均团队 + 右侧子部门卡片网格（点击下钻）
- [x] 验证：tsc 0 错误 + mvn compile EXIT=0（24 文件 +761/-257）
- [ ] 部署后验证：Flyway employee_no 加列 + 三页布局端到端

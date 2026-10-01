# 进度跟踪

> 本文件由 AI 助手自动维护，记录项目开发进度
> 最后更新：2026-10-01（D-698 Spring Boot 4.1.1 升级上线 + D-699 SSE 截断/DSML 泄漏 + D-700 AI 成本归因重建 + D-674~D-711 前端 as any 大批次）

## 已完成

### 2026-10-01 D-698 Spring Boot 3.4.5 → 4.1.1 升级上线（PR #27）

- [x] parent 3.4.5 → 4.1.1；starter-aop → starter-aspectj（Boot4 BOM 已移除）；MyBatis-Plus 3.5.12 → 3.5.16（刻意不选 3.5.17：其迁包会改 278 个文件 import）；新增 spring-boot-flyway + spring-boot-starter-json
- [x] 9 个源文件适配新包名（Health→health.contributor / ErrorController→webmvc.error / Lettuce 7 泛型 / JacksonConfig 显式 new），包名均由 jar 反查 + javap 确认非推测
- [x] application.yml：WRITE_DATES_AS_TIMESTAMPS → spring.jackson.datetime.*（Jackson3 迁移，旧键位在 Boot4 下绑定失败 → 上下文启动失败，实测复现）
- [x] 阻断点：Spring AI 1.0.0 与 Spring Framework 7 二进制不兼容（NoSuchMethodError: HttpHeaders.addAll(MultiValueMap)；javap 验证 Spring 7.0.9 的 HttpHeaders 无该重载）；327 项单测全绿是因为 Mockito 把该 bean mock 掉了，非真实可用
- [x] 处置：SpringAiAdapterConfig 默认值 true → false，AI 由 LegacyInferenceAdapter（IntelligenceInferenceOrchestrator 1117 行，零 Spring AI 依赖）承担，AiInferenceRouter(@Primary) 负责路由与熔断
- [x] 补 AI 模块测试安全网 327 → 340（SpringContextSmokeTest 4 / AiInferenceGatewayContractTest 7 / AiToolMetadataConsistencyTest 6）——发现真实迁移面只有 3 个文件（grep 命中的「57 个」里 54 个是自研类）
- [x] 基线对照实测：启动 21.577s / 21.272s、工具注册数均 103、运行期工具执行痕迹均 0 → 工具调用未触发是既有实现特性，非本次升级回归
- [x] Flyway 12.4.0 只读校验：Pending=0、checksum 0 不匹配、Failed=0，未重跑 624 条迁移；数据库全程零改动
- [x] 回滚路径干净：一条迁移都没执行，回退 Boot 3.4.5 时 flyway_schema_history 原样未被改写
- [x] 顺带修 D-701 遗留的多余 eslint-disable（CI 带 --report-unused-disable-directives 才报，本地不带该 flag 复现不出，不修 PR 的 CI 始终红）
- [ ] 未做：Spring AI 2.0.0 迁移（实测为范式重写：OpenAiApi 类完全移除、工具改由 ToolCallingAdvisor 注入），需先补 AI 模块集成测试
- [ ] 未做：resilience4j spring-boot4 变体（当前仍 spring-boot3 2.2.0）

### 2026-10-01 D-699 SSE 流被截断 + DSML 协议残渣泄漏

- [x] 现象：AI 顾问面板 net::ERR_INCOMPLETE_CHUNKED_ENCODING（HTTP 却是 200）；气泡出现 <calls> / <invoke name=""> 内部协议残渣
- [x] 根因1（Boot 4.1 回归）：Spring Security 7.1.1 的 AuthorizationFilter 对「每个 dispatch」都授权，SseEmitter 异步处理后容器再做一次 ASYNC 分发；本项目 sessionManagement=STATELESS 无 HttpSession → SecurityContext 无处恢复 → 视为匿名 → 命中 /api/**.authenticated()。响应已提交故错误页也渲染不出 → 连接被硬关闭
- [x] 修法1：SecurityConfigHelper 首行 dispatcherTypeMatchers(ASYNC, ERROR).permitAll()，只放行 ASYNC/ERROR 二次分发，REQUEST 分发仍走全部规则（鉴权强度不变）
- [x] 根因2：旧实现逐 delta 判断 content.contains("DSML")，而模型会把一段协议拆到多个 SSE delta → 开标记在上一片里，续行逃过清洗
- [x] 修法2：DsmlToolCallParser.stripLines() 跨 delta 缓冲、成行后整行判断；strip() 复用同一逻辑保证「流式看到的」与「落库重读的」同貌；新增 flushDsmlTail()（模型最后一句通常不带换行）
- [x] 测试 349 全绿（新增 9）：DsmlStreamingLeakTest(6) 逐字复刻线上拆行场景；SseAsyncDispatchAuthorizationTest(3) 含「匿名 REQUEST 仍被拒」反向断言，防有人改成 anyRequest().permitAll()

### 2026-10-01 D-700 AI 成本无法归因 + 预算护栏对后台任务失效

- [x] 现象：DeepSeek 账单单日 ¥7.27 / 1243 次 / 199 万 tokens，而 t_ai_cost_tracking 自建表起 0 行 → 数据库口径 9.1 万 vs 账单口径 199 万，22 倍盲区，系统完全无法回答「钱花在哪」
- [x] 根因1：AiCostTracking 实体无任何 @TableField，默认推导出 model_name / estimated_cost_usd，实际列是 model / estimated_cost → INSERT 因未知列必失败，且失败被 catch 里的 log.debug 静默吞掉
- [x] 根因2：成本只挂在 AiInferenceRouter，而后台 agent/定时任务大量走 IntelligenceInferenceOrchestrator.chat()/chatStream() 直连，绕过 Router
- [x] 根因3（P0）：canInvoke / tryDeduct / recordUsage 都有 if (tenantId == null) return true;，而后台任务恰恰没有租户上下文 → 花得最多的一批调用完整绕过 50 万/租户/日上限
- [x] 修法：补 @TableField 映射真实列名；在 finalizeResult / finalizeStreamResult（唯一收口点）补记账；无租户上下文归入「系统桶」tenant 0 统一计量限流（不直接拒绝，避免巡检/日报整体停摆）；失败日志 debug → warn
- [x] 降本：ProactivePatrolAgent 每小时 → 每 6 小时（AI_PROACTIVE_PATROL_CRON 可覆盖）——实测 24×4=96 次部门级调用/天/租户，avg response 仅 15 字符、avg latency 约 130ms，绝大多数是空转
- [x] 止损：XiaoyunModelWarmup 补 @ConditionalOnProperty（原「已关闭」仍每 90 秒被调度，实测每天空跑 662 次，每次留一条 t_ai_job_run_log，该表已 73.9 万行）
- [x] 清理死配置：删除 application.yml 的 ai.spring-ai.* 块（enabled 默认 true 与真实生效值相反，极易误导）
- [x] 部署陷阱入档：.env.backend 不入库且 env_file 优先级高于 yml，含 SPRING_AI_ADAPTER_ENABLED=true 会无声覆盖 yml 的 false → NoSuchMethodError → 容器起不来 → 全站 502
- [x] 测试 356 全绿（新增 7）：AiCostTrackingEntityMappingTest(4) + AiAgentTokenBudgetServiceTest(3)
- [ ] 实测归因结论：81% 成本来自定时任务而非真人提问；核对开销必须查生产库（MCP 连的是本地开发库）

### 2026-10-01 D-618 待办中心支持「已完成」任务维度

- [x] PendingTaskOrchestrator 新增 15 个已完成任务收集器（裁剪/质检/返修/物料/逾期订单/异常/款式开发/工资/物料对账/报销/发货/样品借还/领料），与原有「待处理」维度并列
- [x] 新增 26 处查询全部带 tenantId（audit-tenant-id.py 审计 0 违规）
- [x] 同步前端 TaskListView / useTaskManager + 小程序与 h5-web 三处 wxml（两套副本 + h5-web public 镜像，共 6 个文件）

### 2026-10-01 D-694 任务状态契约补齐 escalated

- [x] 根因：前端 TaskStatus 只声明 5 个值，后端 CollaborationTask.TaskStatus 有 6 个（多 ESCALATED）；后端把 ESCALATED 当活跃任务（计入 inProgressRaw、findActiveByTenant 会返回）→ 升级中的任务「待处理/进行中/已完成」哪个页签都不计入（幽灵项），且操作区只判 in_progress/accepted → 领取不了也完成不了（死路）
- [x] 改法：types.ts 补 'escalated'；statusBucket 由 as 断言改为穷举 Record<TaskStatus, StatusTab>（后端新增枚举未同步时 TS 直接报错 TS2741，已实测）；操作按钮条件补 escalated
- [x] 新增 taskStatus.test.ts 5 项；全量单测 480 → 485 全绿
- [x] 勘误：此前「后端 taskStatus 大小写不统一、DTO 未定死契约」结论有误——系统待办与个人任务出参均为小写、契约一致，真实问题是枚举不全

### 2026-10-01 D-693 领料出库旁路缺事务 + AI 工具绕过编排层

- [x] 缺陷：MaterialPickingOrchestrator.createPicking 下游连做 4 个写操作（save 领料单 → insert 明细 → decreaseStock 扣库存 → recordOutboundLog），而 decreaseStockWithCheckDecimal 返回 0 时抛 IllegalStateException；该链路此前全程 0 个 @Transactional → 多明细第 N 条库存不足时前 N-1 条已提交且无回滚 → 「领料单 completed + 明细缺失 + 库存已扣 + 出库日志缺失」脏数据
- [x] 真实库佐证：t_material_picking 22 条，MPK 前缀 7 条（走本旁路）最后使用 2026-05-29，PICK- 主流程 13 条最后 2026-09-12 —— 旁路仍在产生真实数据，非死代码
- [x] 修法1：createPicking 补 @Transactional(rollbackFor=Exception)（跨 Bean 调用非同类自调用，AOP 生效）
- [x] 修法2：MaterialPickingTool 的 create 动作改走 MaterialPickingOrchestrator（原直接注入 Service 做多表写入，同时违反「跨服务编排上移 Orchestrator」+「事务只在 Orchestrator 层」两条）
- [x] 守护：新增 MaterialPickingTransactionTest(3)，反射读注解；实测临时移除事务注解立即 FAIL
- [x] 同批架构收敛（service→service 21 → 19）：LoginLogServiceImpl 改注入 OperationLogMapper；DataCenterQueryServiceImpl 上移编排层——其 7 个方法全带 @Cacheable，不能并入调用方否则同类自调用缓存静默失效
- [x] 新增 D693InjectionVerificationTest(5)；mvn test 315 → 323、ArchUnit 7 规则全绿
- [x] 文档勘误：架构违规治理方案 3 处内部矛盾修正 + 领料事务核实报告；A4「三项均是 @Transactional 内业务写链」说法经核实不成立（三个文件 @Transactional 出现次数均为 0）

### 2026-10-01 依赖 EOL ratchet 门禁 + 云端健康诊断脚本

- [x] scripts/check-dependency-eol.py + dependency-eol-baseline.properties；CI「质量门禁」新增阻断步骤 + pre-push-checklist.sh 接入
- [x] 为什么用基线而非直接阻断：Boot 3.4.5 与 Spring AI 1.0.0 建基线时已 EOL，直接阻断会让 CI 从第一天就常红 → 必然出现「加 --strict 绕过」或「临时关 job」
- [x] 基线 2 → 1（D-698 上线后 3.x 不再是当前版本）；剩余唯一 EOL 项 Spring AI 1.0.0（运行时已被显式关闭）；门禁有效性实测：基线临时调到 0 → 退出码 1
- [x] check-cloud-health.sh（只读诊断）：一次看清容器状态 / MySQL 连接数 / 向量回灌进度 / Qdrant 集合 / 后端日志
- [x] 修正原稿连接参数错误：IP 由 106.53.5.62 + root 改为实际生产机 106.55.12.216 + ubuntu（root 不可用会卡在交互提示，诊断脚本反成故障第一道障碍）；已实测 Threads_connected=11 / max_connections=151

### 2026-10-01 D-674~D-711 前端 as any 治理大批次（any-lines 3204 → 2661）

- [x] 38 个批次，any-lines 3204 → 2661（净减 543 行）
- [x] 代表批次：D-677 StyleInfoTabs 去 49 处 → 3155；D-686 款式开发工作台去 89 处 detail as any → 2979；D-684 useBoardStats 去 28 处 → 3048；D-685 resizableTableHelpers 去 29 处 → 3020；D-709 NodeDetailModal 簇整批 34 行 → 2683
- [x] D-695 固化 scripts/find-any-clusters.py；order 家族四批共清 92 处（D-695/696/697/698）
- [x] 方法：连续 9+ 个「字段全齐」案例——断言纯属历史遗留，机械删除即可；tsc 首轮常拦下真实类型缺口后收口
- [x] 各批次验证：tsc 0 错误 · vitest 34 文件/480 项全通过 · ESLint 0 告警 · 打印红线零命中
- [ ] any-lines 基线 2661 仍未清零，剩余分布待继续收敛

### 2026-10-01 D-672~D-676 前端质量基线与循环依赖治理

- [x] D-673 破除 10 处前端循环依赖（madge 10 → 0）：形态 A 9 处把类型定义抽到独立 <业务名>Types.ts + 主文件 re-export 兼容旧引用路径；形态 B 1 处 Cutting barrel 再导出成环，改直连
- [x] D-676 上锁：新增 scripts/check-frontend-circular.py（ratchet）+ 接 pre-push + CI madge 从 continue-on-error 升为阻断——服务器 autodeploy 是独立 cron 不看 CI 结果，真正能拦回退的只有 pre-push
- [x] D-674 消除 8 处 exhaustive-deps 禁用（126 → 118）：全量探测确认 126 处全部真需要，无一处历史遗留的多余注释；剩余 109 处「缺依赖」多是有意省略
- [x] D-672 消除 9 处 no-unused-vars 禁用（135 → 126）
- [x] D-675 生产订单列表修复重复重绑与 stale closure（118 → 115）：fetchProductionList 原为普通 async 函数却被 3 个 useEffect 列进依赖 → 每次渲染都重挂事件（含 WS 退订重订）；顺带修 visibilitychange 的 stale closure（切走再切回会用过期的查询条件拉数据）

### 2026-10-01 D-667/D-668 维护弹窗与 Select 下拉冲突

- [x] D-667 根因：antd Select/AutoComplete 用原生 mousedown 切换下拉，React 委托层的 onMouseDown 阻断为时已晚（原生事件已冒泡过选择器）→ 齿轮改 onMouseDownCapture 在事件到达选择器前拦死；修复 BasicInfoSection MaintainGear + DictAutoComplete + SupplierSelect + CustomerSelect 四处
- [x] QuickManageModal 的 ➕新增/➖删除圆形图标按钮改文字按钮「新增」「删除」（用户要求去图标化）
- [x] D-668 续报：点新增后选项列表又弹出盖住弹窗——rc-select 焦点链路在弹窗焦点流转时自行置 open=true，onMouseDownCapture + preventDefault 均拦不住 → MaintainGear 加 onOpenChange，各 Select 加 open={gearModalOpen ? false : undefined} 强制压制
- [x] 浏览器实测：齿轮→维护弹窗→新增全程无下拉遮挡；正常点击选择框本体下拉照常弹出（回归通过）

### 2026-10-01 记忆文件同步（Boot 4.1.1 现状 + 今日全部踩坑）

- [x] 版本号同步：CLAUDE.md Spring Boot 3.4.5 → 4.1.1；copilot-instructions.md 从 2.7.18（落后两个大版本）→ 4.1.1
- [x] 修正一条与现行政策完全相反的 P0 铁律：copilot-instructions.md 原写「Java 单元测试永不提交仓库」，实际自 2026-09-15 起全部入库——历史上正是该策略导致 CI checkout 后测试目录为空、ArchUnit 架构门控空转（假绿灯）
- [x] 新增两节：Boot 4.1 + Spring Security 7 陷阱（SSE 截断根因 + SPRING_AI_ADAPTER_ENABLED 被 .env.backend 无声覆盖）/ AI 成本归因与止损
- [x] 补测试文件数 Java 33 → 44、前端 33 → 34；填「当前进度快照」；明确记下 MCP 连的是本地开发库（flyway 624）不是生产库（1941）

### 2026-09-30 D-654/D-654b 巡检工单刷量根治 + 铃铛红点跟随简报卡关闭

- [x] 现象：1181 条待审批实为 71 个真问题；同一停滞订单一天被自动执行 40 次重复催单
- [x] 根因：createAction 去重条件「PENDING 超 24h 即失效」→ 老工单不断被重复建
- [x] createAction 去重拆两条：PENDING 不限时长即拦截；APPROVED/AUTO_RUNNING 在途保留 24h 窗口
- [x] 新增 existsAutoExecutedSince：同租户 + 同问题类型 + 同目标 24h 内已自动执行则冷却；建单侧（AutoRemediationExecutor）与执行侧（AiPatrolJob）双冷却，执行侧命中则撤销重复工单（不执行不通知，留痕可追溯）
- [x] SmartAlertBell AI 巡检简报整卡加 ×（今日持久）；误导提示只在有行时显示（原行级 × 全关后标题卡永远关不掉）
- [x] D-654b：点 × 后巡检工单当日不再计入铃铛红点

### 2026-09-30 D-655 教程中心死按钮接真

- [x] 「下载用户手册」原为无 onClick 死按钮且全仓无手册文件 → 新增 userManual.ts 实时把教程数据编译为打印 HTML（封面=生成日期 + __BUILD_COMMIT__ 版本戳 + 收录篇数，目录按分类分组，含步骤/温馨提示/FAQ/截图），safePrint 另存为 PDF → 教程更新手册自动跟新
- [x] 「意见反馈」原也是死按钮 → 复用个人中心 ProfileFeedbackModal + feedbackService 提交链路（与 D-527 同源），成功后提示到个人中心看进展
- [x] Tutorial/README.md 定同步纪律：界面改动的 D 号须同批更新教程 + 清理旧描述 + 截图随改版换
- [ ] 教程内容停在 D-513，D-514 后大改版未回补，待专项

### 2026-09-30 D-657 供应商编码全量自动生成

- [x] 后端空编码自动生成沿用存量 F+时间戳风格；factory_code 全局唯一索引下先查重重试 5 次防同毫秒撞码
- [x] 前端新建模式编码框禁用 + 占位「保存后自动生成」+ 去必填；编辑态保留可改（存量手输乱码如 Table/0006/名字当编码可修正）
- [x] SupplierSelect 失焦建供应商 / QuickManage 快捷建卡均不传编码，统一落此生成器

### 2026-09-30 D-660 物料需求一览铺进采购链路

- [x] 共享组件 MaterialDemandSummary（components/common）：每物料卡 = 需求(含损耗)/可用库存/在途/缺口（净需求=需求-库存-在途），头部结论行 + 底部合计，compact 速览条与整卡组两形态
- [x] 后端 /demand/preview 加 orderNo 入参（手工采购表单只持有订单号，内部解析成订单后走原预览链路，orderId 优先保持兼容）
- [x] 接入点①采购单创建表单：填订单号+物料编码后实时显示「本订单 需求X/库存Y/还差Z」速览条（useOrderDemandPreview 防抖 + 按物料+颜色匹配聚合）
- [x] 接入点②采购单详情页：码数用量汇总下新增整单物料需求一览（补库存/在途维度，样衣模式不显示）

### 2026-09-30 D-663/663b/663c/663d 顶栏用户名升级「工厂-岗位 姓名」

- [x] 后端 /system/user/me 返回补 position；前端登录/启动两处映射 position（老会话刷新页面即得）
- [x] 显示规则：设了岗位=「东方制衣厂-总裁CEO 李老板」；没设=「东方制衣厂-李老板」；工厂账号保留原橙色工厂标签不重复前缀；下拉菜单顶部加「欢迎您，{全称}」；user-name 加 240px 省略防挤爆顶栏
- [x] 663b 平台名后加欢迎语「云裳智链 欢迎您」（小一号浅色后缀）；663c 移除顶栏左侧工厂名标签（工厂名已在右上角带出，不再重复）
- [x] 663d 真凶：me() 返回的 position 永远为 null——resolveCurrentUser 走的 getCoreById/getCoreByUsername 是防迁移报错的显式列名查询，白名单漏了 position 列；两处白名单补上（t_user.position 生产库已存在已核实）

### 2026-09-30 D-665 仪表盘更名首页（全量同步）

- [x] menuConfig title 首页（shortTitle 同步，侧栏 rail 两字规范）；i18n menu.sections.dashboard 同步（侧边栏实际走此键）
- [x] routeConfig 深链标签：/dashboard=首页；/dashboard/main 主仪表盘→经营概览（独立深链保留区分）
- [x] 页面 PageLayout 标题、路由错误边界页名、数据加载失败提示、延期催单备注、教程中心三处文案全量同步

### 2026-09-30 D-666 小程序 i18n wxml↔js 绑定缺口治理（33 → 10 → 0）

- [x] 定出第 4 类 i18n 盲区：wxml 用了 {{t.x}} 但同目录 js 的 applyLanguage 从不给 t.x 赋值 → t.x 恒 undefined → 文案静默丢失（不报错、构建也过）；全项目 18 个页面 / 33 处
- [x] 守卫 check-i18n-keys.py 由 4 项扩到 8 项：新增 [5]「NS + 'x'」无点引用校验（小程序 83 个文件用 NS + 'reviewPass'，原正则要求含点 → 按 NS 解析后实为 2634 个键）、[6]「值是翻译表片段」检测、[7] 死键报告（非阻塞 + 基线 68）、[8] 绑定缺口（非阻塞 + 基线 33）
- [x] P0 修 5 处线上裸键名（submitFailRetry/claimFailed/recordInvalidW/completeTimeLabel/loadFailColon）+ 1 处语言包结构损坏（mp.attendanceDetail.accumHoursW 被写成整块翻译表片段 → String(对象) 渲染成 [object Object]）；四语言键数 3915 → 3917 → 3918
- [x] 补 23 处绑定（覆盖 14 个页面）；踩两坑：①一个页面可能有多个 t: {} 块，模块级初始 data 里那个是空的、作用域无 lang，第一版插进去直接 ReferenceError（被 test-warehouse-pages.mjs 当场抓到）；②插入格式 rstrip 残留空格行
- [x] 收敛基线 33 → 10 → 0；修 4 处语言包值写错（wxml 把数字放在键外但键值含占位符 → 渲染出字面 {count}）+ 新增 5 键 + 修 1 处 wxml 路径错（smart-ops 的 scanSubText js 设在 setData 顶层而 wxml 读 {{t.scanSubText}}，不是漏绑定——守卫 [8] 因此增加分类输出）
- [x] 其余 D-666 子项：手机端样衣审核独立页（可写评语 + 传现场照片）；阶段详情审核改跳统一审核页（删掉重复表单）；样衣详情补 5 个从未赋值的 t.* 绑定（计数单位静默丢失）；右缘控件两处缺陷（清空 × 压住齿轮 + TextArea 顶部 22px 死区）
- [x] 验证：14 个 js node --check 通过；test-warehouse-pages.mjs 2423 项 0 失败（真实 eval 各页面模块，能抓 ReferenceError）；三副本内容完全一致

### 2026-09-30 D-664 批量菜单灰项加原因反馈

- [x] 核实结论：五处采购入口的禁用条件本身符合业务规则（到货数量=0 时回料确认/确认完成确实不可用），真正缺陷=antd 禁用菜单项悬停 tooltip 不渲染，调用方传的原因用户永远看不到
- [x] PurchaseActionBar：禁用菜单项标签内联渲染原因（title → 灰字小字后缀），打开菜单即见为什么
- [x] 订单详情-面辅料采购 Tab 原因改为「需先登记到货（到货数量＞0）」/「没有待领取的物料」；InlinePurchasePanel 三菜单项 + PurchaseDetailView 的 batchReturn/confirmComplete 补传原因
- [x] 已核实无需改：采购管理列表页（D-360y 已修冻结全灰，走智能领取）、样衣 BOM/物料 Tab（生成采购下拉无批量菜单）

### 2026-09-30 D-654/D-655~D-671 架构违规收敛续（Controller→Mapper 47 → 0，service→service 48 → 21）

- [x] D-654 规则1 Controller→Mapper 清零：判据 haveSimpleNameEndingWith("Mapper") → resideInAPackage("..mapper..")，消除 Jackson ObjectMapper 造成的 3 个假阳性（18 → 7），再三处下沉到 0（D-635 起累计 47 → 0）
- [x] D-655 ProductionOrderQueryService 更名移包 ProductionOrderQueryOrchestrator（注入 8 个 Service 本质是跨服务编排）→ 48 → 47；教训：规则7 按「类」计数，该类依赖 8 个也只算 1 条违规，「依赖数」衡量的是重构成本而非收益
- [x] D-656~D-669 规则7 逐批更名移包/删死代码/改 Helper：47 → 45 → 43 → 42 → 37 → 34 → 32 → 30 → 28 → 26 → 24 → 23 → 22 → 21（含 QdrantService 移入 common，一次归零 5 个 Service 的依赖）
- [x] D-670/D-671 AuthTokenService + TokenSubject 移入 common（22 → 21）+ 补 D-667~D-669 遗漏的 4 个旧文件删除
- [x] 新修复范式：基础设施 Service 移入既有豁免包（位置与性质一致，不为它放宽判据）；两个坑：漏扫 src/test 会编译失败、嵌套类型即使同包也需 import
- [x] 错误语义保持：域内失败统一抛 IllegalArgumentException → 全局处理器 400 + 原样中文 message（刻意不用 404——前端 http.js 对 404 会用固定文案覆盖后端 message）
- [ ] 剩余 service→service 21 项按治理方案批次推进（A 类 3 + B 类 3 + C 类 15，「降到 15 即停」）

### 2026-09-30 D-656/D-658/D-659/D-661/D-662 文案与排版细节

- [x] D-661 顶栏整排字调小 2 号（用户反馈顶栏文字比正文大太多，D-516 全站字体加大把顶栏一起抬高）：页签/今日预警/用户名 15→13px、品牌 17→15、厂名 13→12，只动字号不动高度布局
- [x] D-662 打板基础码按实填码数联动（原把矩阵全部码数列带进打板尺码，与「基础码」语义不符；一码未填不覆盖手工值）+ 商品规格区统一 3×3 网格 + tooltip 同步
- [x] D-659 无资料下单顶部信息区排版对齐有资料下单（网格节奏 + 标签样式 + 生产方同构）
- [x] D-656 CUTTING_BACKLOG 正名「裁剪积压」→「裁剪后积压」（原词与描述自相矛盾）
- [x] D-658 注释钉板：物料出库领料去向刻意不过滤供应商类型（发二次工艺厂/外发厂/退回布行均为真实场景，用户拍板保持全量）

### 2026-09-29 D-626/D-627 AI 巡检可读化

- [x] 用户反馈三点：AI 巡检通知关不掉、面板要侧滑、巡检页满屏代码/编码看不懂
- [x] SmartAlertBell 下滑悬浮面板 → antd Drawer 右侧侧滑（宽 min(460px,94vw)，遮罩/Esc 关闭由 Drawer 自带，移除手写的点外关闭 + Escape 监听与 panelRef/btnRef）
- [x] AI 巡检简报行补 × 关闭（当日不再提醒，dismissedIds 按日 localStorage 持久化，key=patrol_<工单id>，老数据用类型+文案稳定键兜底）
- [x] 类型原始英文码可读化：DELAY/STAGNANT/SAMPLE_OVERDUE → 交期延误/进度停滞/样衣逾期
- [x] 新建 services/intelligence/patrolLabels.ts 唯一权威映射（合并 useAiPatrol 4 键小表与 PatrolActionCenter D-513 大表并补 SAMPLE_OVERDUE/SAMPLE_STAGNANT/DELIVERY_RISK/MATERIAL_LOW/PURCHASE_OVERDUE/OVERDUE 等落库值），两处同源不再漂移
- [x] 后端 PatrolTargetLabelEnricher（新组件）：t_ai_patrol_action.target_id 对订单存 32 位 UUID、对样衣存 pattern 雪花 ID，列表接口批量翻译为订单号/款号；by-status/by-target/recent/pending/summary 全接线，失败静默降级为原始 ID
- [x] D-627 关闭键恒显补齐：决策卡 × 由 top/right 6px 移到卡片右上角外沿 -7px 加白底阴影（原位置被「规则判断/高置信」标签压住，找不到也点不到）；dismissKey 改用卡片标题（面板每 10 分钟重拉后卡片顺序会变，序号键会导致「点了 × 又复活」）；.sap-event-dismiss-btn / .sap-notice-dismiss-btn opacity 0 → 1 恒显（触摸屏无 hover 时该键永远不出现）
- [x] 依据 D-287「行操作按钮常显」定论，悬停显现模式一律弃用
- [x] 验证（本机 vite dev + Playwright 真机命中测试 + 真实点击）：点 × 3 次 dismissed 计数恰好 +1；不误触发卡片/行跳转；打印样式红线零命中

### 2026-09-29 D-628 选款编号去除随机后缀

- [x] 根因：Math.random()*9000+1000 只有 9000 个取值，生日悖论下同一日期段约 112 条记录即有 50% 撞号概率（按月分段月产 100 款约 55%），且不可重放、不利于排查
- [x] 风险分级：批次号/候选号有 uk_*_no_tenant 唯一索引兜底（撞号=插入失败，可恢复）；款号 t_style_info.style_no 无唯一索引（V20260131 建索引语句被注释掉）→ 撞号静默产生重复款号
- [x] 修复：新增 SelectionNoGenerator，按「日期段 + 类型」分段进程内原子自增，分段起点由数据库水位（该日期段最大编号 +1）推导，避免服务重启后序号归零与历史编号重复；与 B2BOrderOrchestrator.generateOrderNo / PaymentNoGenerator 既有思路一致
- [x] 刻意不用分布式锁：锁只能防并发写，防不住不同时刻的随机碰撞，此处要解决的是编号唯一性不是并发问题
- [x] 顺带修正 CLAUDE.md 两处与事实相反的过时描述（Java/前端单测自 2026-09-15、09-19 起已入库，原文「gitignored and never committed」会误导）

### 2026-09-29 D-629 移除价格变更死链路 + 供应链风险监控默认关闭

- [x] PriceChangeEvent 孤儿链路整体移除：有 2 个监听器但主代码无任何发布方（仅测试构造），功能已被 EcSyncJob（定时 PRICE_SYNC）与 EcSyncController → ProductSyncOrchestrator.pushPriceToPlatform 覆盖
- [x] 顺带消除隐患：SyncEventListener.onPriceChange 缺 onStockChange 那样的 BackendActionKey 开关守卫，若将来有人补上发布方接线，价格会被静默推送到电商平台，绕过「智能化不自动执行」原则
- [x] SupplyChainRiskMonitorJob 加 fashion.risk-monitor.enabled 开关默认 false：依赖 ExternalDataService 桩实现（Math.random 模拟面料价格指数/汇率/天气/风险评分），开启后每天 7:00 产生十几条「⚠️ 价格波动超过10%」假预警；更大隐患是 logRiskAdvice 已列出【待集成】真实推送通道（SmartAdvice/企业微信机器人/App 消息中心）
- [x] ExternalDataService 类头加使用约束警告：禁止将其返回值用作对用户展示的决策依据

### 2026-09-29 D-630/D-631 质量门禁补位（ArchUnit 分层 + 前端质量基线）

- [x] 背景：CLAUDE.md 的 P0 铁律已写明「Controllers must NOT call multiple services」与「Services must NOT call each other」，但 ArchUnit 没有对应规则——属「有规范、无门禁」，存量违规持续增长无人察觉
- [x] D-630 新增规则6 Controller 不得直接依赖多个 Service、规则7 Service 不得依赖其他 Service（豁免 .common. 基础设施 Service），纳入 ratchet 冻结基线
- [x] 口径关键：两条规则都只统计字段注入（@Autowired / @RequiredArgsConstructor 的 final 字段），不用 getDirectDependenciesFromSelf()——后者会把方法参数/返回值/泛型里的 Service 也算进来，实测会把违规数从 56 放大到 370
- [x] 首次实测基线（ArchUnit 字节码口径，非 grep 估算）：controller.depends.on.multiple.services=35、service.depends.on.service=56
- [x] D-631 前端质量基线门禁：新增 scripts/check-frontend-quality.py + frontend/code-quality-baseline.json，三项指标（any-lines=3204 / eslint-disable=135 / console-log=6）冻结进基线，超基线退出码 1，接入 safe-push.sh 前端段
- [x] 口径一律用「行数」而非出现次数（同一份代码两种口径相差近一倍，混用会让基线失去可比性）；背景是 .eslintrc.json 里 no-explicit-any 与 no-console 均为 off，前端类型安全与日志规范实际处于无约束状态

### 2026-09-29 D-632~D-653 架构违规收敛（Controller→多 Service 33 → 0）

- [x] D-632 CrmClientController 7 个 Service 下沉 CrmClientOrchestrator（545 → 158 行）+ 新增 SupplierPortalOrchestrator（534 → 183 行）
- [x] D-633 门户编排层改用 Result 表达成败（零行为变更）
- [x] D-634~D-652 逐批下沉：33 → 29 → 23 → 20 → 17 → 15 → 13 → 11 → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 3 → 2 → 1 → 0（D-638 顺带修 D-634 引入的 PlatformWebhookControllerTest 全红回归）
- [x] D-653 修正规则7 四处判据缺陷（ExecutorService/ScheduledExecutorService 被误判为业务 Service；顶层 com.fashion.supplychain.service 包未按 javadoc 豁免；.common. 按段匹配漏掉包本身；宿主类未双向豁免）+ 两个编排层类改名 → service.depends.on.service 56 → 48
- [x] 错误语义保持：域内失败抛 IllegalArgumentException → 400（刻意不用 404，前端 http.js 会覆盖后端 message）；两个 Web 层守卫（「请先登录」/供应商门户 403）刻意留在 Controller，下沉会丢失专属文案
- [x] 租户/客户/供应商隔离条件全部保留：id 只来自 token，不接受请求参数

### 2026-09-29 D-625 样衣字段治理 + 列表/页签双置顶

- [x] 样衣详情删「商品属性」(productNature，与基础信息「商品类型」语义重复，全系统零消费方) + 删「标签」(styleTags，自由文本零消费方，易与季节分类混淆)
- [x] 「打扮尺码」错别字更正为「打板尺码」（商品资料表单/详情抽屉同源修正）
- [x] 打板尺码/数量与颜色码数矩阵联动（码数列自动带出、数量=矩阵总数，linked 只读模式）；分区更名「商品规格」
- [x] 共享 usePinnedRows：localStorage(按用户隔离) + t_user_preference 双写，跨登录跟随账号；生产订单 + 样衣开发三种视图接入行置顶（置顶行常驻最前 + 淡蓝底标识，场外钉住单按 id 补拉详情插队最前）
- [x] 顶部页签栏每页签加图钉（PushpinFilled/Outlined），固定页签常驻最前、跨登录持久；关闭页签自动解钉
- [x] 后端 /api/system/user-preference 从租户主账号门槛放开到所有登录用户（数据严格按 tenantId+userId 隔离，普通主管此前存任何偏好都 403）
- [x] 清理 useStyleActions 死代码 handleToggleTop（后端无 isTop 列，PUT 静默丢弃）；i18n layout.pinTab/unpinTab 四语言

### 2026-09-29 D-624 ai-assistant 工具名 i18n 机制

- [x] describeTool 背后的 TOOL_NAMES 有 80 项中文工具名，接入 i18n：键 common.toolName.<驼峰>，缺键回落中文表（与 D-619 状态表同款「缺键回落，翻译分批补」）
- [x] 键名自动转换规则：去 tool_ 前缀 + 下划线转驼峰（tool_query_production_progress → queryProductionProgress）
- [x] 本批零建键（机制先上线，补之前其他语言回落中文表，不报错不空白）；测试 2423 → 2423 零行为变化
- [x] 勘误：D-623 提交信息里写的「TOOL_LABELS 70 项」实为 TOOL_NAMES 80 项

### 2026-09-28 D-615~D-623 i18n 收官批次 + 岗位池任务面板内领取

- [x] displayHelper 状态 i18n 机制：D-619 salesOrder 域试点 → D-620 扩至 payment/return/advance/split/quality 6 个域 → D-621 补完剩余 4 域，10/10 域全部接入
- [x] ai-assistant 模块：D-622 三个 loader 文件接入四语言（33 键）→ D-623 主体接入（75 键，Component 生命周期适配）
- [x] D-615 样衣开发簇残留修补（25 键）+ cutting 簇定性豁免；D-616 待办详情页 + 退货列表页接入四语言；D-618 登录页收尾 + warehouse/work 簇定性豁免
- [x] D-613/617 岗位池任务面板内直接领取（卡片领取按钮直达业务接口；编号与 i18n 批次撞号，commit message 不重写、以 D-617 为准）

### 2026-09-28 D-611b 批量打印返修

- [x] 实测 Chromium 边距页码无法按单重置（Playwright page.pdf + pdfjs 取文取证）→ 每单独立页码走独立打印任务
- [x] 逐单连打主按钮（safePrint 加 onAfterPrint 串链条，关抽屉中断）；合并为一次打印保留次选
- [x] 第一单实时预览 StyleBatchPrintPreview（与正式打印同源，勾选联动）
- [x] 测试 13 例绿、全量 475/475、tsc/lint 零输出

### 2026-09-28 D-611 大货生产单/样衣工艺单批量打印

- [x] 共享正文 StylePrintDocBody + CSS 常量双端复用（批量=单一逐字节一致）；数据装载抽 fetchStylePrintData 服务
- [x] buildBatchPrintHtml 合并 N 单（每单自带大标题+页脚、单间分页、整批连续页码）；runBatchStylePrint 并发 3+失败跳过+图片等待 6s；单批上限 30
- [x] 入口：大货订单列表（复用现成 rowSelection+批量条）+ 样衣开发列表表格视图（补 rowSelection+批量条）；统一勾选抽屉 StyleBatchPrintModal 复用 PrintOptionsSelector
- [x] safePrint 加 imageWaitMs 参数（单打默认 1.5s 不变）
- [x] 测试 batchStylePrint.test 11 例绿；全量 473/473 绿；tsc 0 错误（顺手修掉 ProductionTableView smartQueueFilter boolean/string 存量错配）；eslint 0 警告
- [ ] 待用户线上验收：大货列表/样衣列表勾选多单 → 批量打印

### 2026-09-27 D-590 工人提示根治——"5 针"误抓 + 面料驱动针号/针具/注意点

- [x] 溯源"针号建议：5 针"=贴进备注的工艺单行号 5 + "针织面料"首字被宽松正则误抓（BR26X1S1140A 实锤）
- [x] 后端 WorkerHintComposer 重构：针号只认"X号针/针号：X"明确形态+剥 HTML；新增针距提取；面料五类（薄/弹力/中等/厚/皮革）驱动针号+针具+3 条大白话注意点
- [x] 工序过滤同步：裁剪/质检保留面料注意点，针号针距针具仅车缝全展
- [x] PC 工人提示预览改用 profile.workerHints（与工人端同源）；小程序扫码结果加针距/注意点行+工艺说明截断 5 行（三副本+i18n 四语言）
- [x] 回归测试 WorkerHintComposerTest 8 例全绿；前端 build/TS/lint 绿
- [ ] 小程序需手动发版后工人端生效

### 2026-09-24 D-543 保活探针单次 900 秒 —— 排查 + 加超时封顶

- [x] 量化：近 30 天 14,198 次，平均 1697ms、**最大 900457ms**；超 60 秒 17 次
- [x] 找到强规律：11 条超长记录**全落在 900.1~900.5 秒**、间隔恰好 990 秒（=900+90 fixedDelay），
      集中在 9/15 凌晨 02:33~05:18 → 是**超时预算被耗光**，不是真的算了 15 分钟
- [x] 列全 9/14 起所有超 10 秒记录：**17 条全部来自保活探针**（另一类是数据一致性任务 10~17 秒，正常）
- [x] **推翻自己的初步推断**：原以为"单线程调度器被堵、15 分钟内所有定时任务停摆"，
      实测那 900 秒窗口内其他任务照常 35~39 次/窗口 → 没被堵；
      再查出 `ScheduledConfig` 自定义了 `poolSize=10` 才解释得通
- [x] 定位 900 秒来源：`DEFAULT_MAX_TIMEOUT_SECONDS=300` × 3 级调用累加
- [x] 修复：给 `scene=model-warmup` 单独封顶 **10 秒**（复用已有的按场景封顶机制）
- [x] 新增 `InferenceTimeoutCapTest`（4 例全绿）钉住该行为
- [x] 记录潜在风险（未改）：调度池 10 线程，多个 LLM 任务同时挂住有耗尽风险；目前其他任务最大 17 秒
- [ ] 待上线验证：保活探针耗时不再出现 900 秒级记录

### 2026-09-24 D-542 定时任务运行记录「全部接通」（用户拍板）

- [x] 查清"之前不是通的吗"：**原本是通的**，2026-04-14 的杂项提交 `4ae80d5d9`
      给查询加了 `WHERE tenant_id = ?`，而该表 tenant_id 全为 NULL → 从此永远返回空
- [x] 判断出正解是**去掉过滤**（系统级作业日志本无租户维度，且接口仅限超管），
      不是"补 tenant_id"；顺带确认全仓**没有租户拦截器**，该过滤是唯一的卡点
- [x] 后端：`selectRecent` 去租户过滤；新增按状态筛选 + 统计 + 最慢任务 + 失败 TOP
      （别名统一 camelCase —— Map 结果不受下划线转驼峰影响）
- [x] 后端：新增 `/jobs/overview?days=` 一次返回概览+两榜，避免页面打三次请求
- [x] 前端：**新增「工具 → 定时任务运行记录」页面**（此前根本不存在）
      —— 5 张概览卡 + 运行记录/最慢任务/失败任务 三 Tab + 可导出 + 耗时超 5 秒标黄
- [x] 注册 5 处（paths / 权限码复用 MENU_LOGIN_LOG / 工具菜单 / modules/system / App 路由），
      无需新增 t_permission 迁移
- [x] 三个统计 SQL 先在**线上库只读跑通**再落代码
- [x] 新增 `AiJobRunLogMapperSqlTest`（4 例）钉死"不得含 tenant_id"，防后人改回去
- [x] `audit-tenant-id.py` 0 违规；`mvn compile` 过；`tsc` 0 错；ESLint 0 错
- [ ] 待线上验证：页面能打开、能出数据（近 7 天 32,618 次运行 / 18 个任务）

### 2026-09-24 D-541 t_ai_job_run_log 保留期清理（用户拍板 90 天）

- [x] 查清表用途：切所有 @Scheduled 方法自动写入的运行日志，**只写不读**（前端零调用）
- [x] 两级保留：成功/跳过流水 **90 天**、**失败记录 365 天**
      （340 条 FAILED 全在 90 天以前，一刀切会清空排障线索）
- [x] 复用既有分批删除范式（每批 500 + LIMIT 循环防锁表），抽出 batchDelete + 常量
- [x] **连带修 bug 1**：`readRetentionDays` 原 SQL 用了不存在的列名
      （config_key/config_value/delete_flag），异常被吞 → 「保留天数可配」一直静默失效
- [x] **连带修 bug 2**：`V202706260006` 以"索引重叠"为由误删了 `idx_start_time`，
      导致按 start_time 过滤只能全索引扫描（rows=2180211）→ `V202709240004` 补回
- [x] `V202709240003` 补齐三个保留期参数行（auditLog 90 / jobRunLog 90 / failedRetentionDays 365）
- [x] 新增 `AuditLogCleanupJobTest`（8 例全绿），含"SQL 不得再用错误列名"的回归断言
- [ ] 待观察：次日 04:50 首次执行后确认删除行数与耗时（预计删 ~183 万行 / 数分钟）
- [ ] 未做：`/intelligence/jobs/recent` 的 tenant_id 全 NULL 导致接口永远返回空（功能变更，待评估）

### 2026-09-24 D-540 微信云托管残留清理（只修会误导人的知识，不删东西）

- [x] 按危害排序修 7 处：反模式库 AP-WF-03/04 的错误部署流、上线部署指南、copilot-instructions、
      deploy-lighthouse.yml 风险警告、ci.yml 探针检查改指向 compose、check-run-health.sh 标注、
      以及 6 处零散过时引用
- [x] 闭环悬案：`cloudbaserc.json` 证明 h5-web 的部署目标就是微信云 → 不是代码废弃，是**部署出口没了**
- [x] 刻意没动：`docs/archive/**`、decisionLog/activeContext 的历史记录（改了是篡改）、
      `cloudbaserc.json` 等文件本体（用户要求不废弃）
- [x] 验证：两个 workflow YAML 经解析器校验通过；两个 shell 脚本 `bash -n` 通过

### 2026-09-24 D-539 Embedding 429 不熔断 —— 限流期每次请求空转（已上线实测生效）

- [x] 量化：24h 内 122 次 429、62 次降级为伪向量，每次白等 2.9~4.4 秒
- [x] 根因：原实现只对 404/401/402 熔断，**429 不熔断**（把"会自愈"和"不会自愈"混为一谈）
- [x] 失败分类抽成纯静态方法 `classifyEmbeddingFailure`：
      PERMANENT(404/401/403/402) 永久熔断 / RATE_LIMITED(429/quota/throttl) 连续 N 次冷却熔断 /
      TRANSIENT(超时) 不熔断
- [x] 冷却 + 半开探测 + 成功复位；阈值与冷却时长可配（默认 3 次 / 10 分钟），冷却有 1000ms 下限
- [x] 顺带修掉同类浪费：没配 Key / 熔断中时**跳过视觉描述调用**（描述转不成向量，纯属浪费）
- [x] 新增 `QdrantServiceEmbeddingCircuitBreakerTest`（10 例，全绿）
- [x] 写入 anti-patterns.md **AP-AI-04** + 自查清单新增一条
- [x] **上线实测生效**：撞上 style-vector-backfill 一次发 62 个请求，
      修后只有 **2 次**真正打到远端、429 从 62 降到 **4**、**60 次**直接跳过
- [x] 顺带挖出真根因：429 的响应体是**「余额不足或无可用资源包,请充值」**（智谱欠费）
      → 日志文案已改为指向"充值"而非"查限流"；⚠️ **需业务给智谱 Embedding 账户充值**

### 2026-09-24 D-538 磁盘 85% 治理——根因是 Docker 构建缓存（已清理 + 加自动回收）

- [x] 根因定位：`/var/lib/docker` 仅 1.8G，真正大头是 **`/var/lib/containerd` 28G**
      （overlayfs 存储驱动；overlay 快照 21G + 内容 blob 7.1G）= Docker 构建缓存
- [x] 立即清理 `docker builder prune -af` → **回收 25.32GB，磁盘 85% → 36%（可用 31G）**
- [x] 清理后复验：6 容器全在、backend healthy、www 200、api health 200、后端 0 ERROR
- [x] 根治：`autodeploy.sh` 新增每日回收（常态清 30 天前缓存 + dangling 镜像；
      磁盘 ≥85% 兜底全清）+ 磁盘水位写进 `disk-snapshot.log`
- [x] 在服务器上用临时目录隔离验证三种分支（每日/跳过/告急），`set -e` 下不会意外退出
- [x] 刻意不执行 `docker image prune -a`（会删掉构建基础镜像，下次构建要重拉，不划算）
- [ ] 未做：`autodeploy.log` 32MB 无轮转（影响远小于磁盘问题）

### 2026-09-24 D-533 套装定价口径——行单价=套装单价、原价留痕（用户拍板，本地实测）

- [x] allocateComboPrice 重写：行 salesPrice=套装单价（传入价优先，否则组合设定售价），不再按子SKU原价比例折算
- [x] 子SKU原售价自动落 original_sales_price（复用改价逻辑，改价原因"套装单价X元/套×N套"绕开10%校验）
- [x] 行金额按件数占比平账（最大余数法），合计恰=套装价×套数——收款账单不错账
- [x] 出库记录明细新增「子SKU原价」列（划线灰显）；套装出库抽屉/EC直发弹窗文案同步新口径
- [x] 本地实测：出 2 套价 60 → 两行单价 60.00、原价 36.86/37.03 留痕、80.00+40.00=120.00 精确

### 2026-09-24 D-532 组合商品接入电商——平台套装订单按子SKU出库（本地全链路实测）

- [x] V202709240002：t_ecommerce_order 加 combo_id/combo_code
- [x] receiveOrder 组合识别（comboCode→回填组合名/售价、跳过款式匹配与智能分仓）
- [x] directOutbound 组合分支→FinishedOutstockHelper.comboOutbound（子SKU扣减/共单号/分摊/溯源）
- [x] GET /api/ec/stock/combo-list + pushStockToPlatform 推组合可售套数
- [x] 前端：订单列表/详情/直发弹窗套装展示与提示、智能库存「组合商品库存」面板
- [x] 顺手修既有 P0×2：匿名请求空上下文致 webhook 恒 401；webhook 无租户上下文致接单回滚
- [x] 本地实测：webhook 签名推单→识别→直发 2 套（79.88+40.12=120 精确）→ combo-list 27 套

### 2026-09-24 D-529 组合商品（套装）——组合SKU销售、实际按子SKU出库（双端编译绿 + 本地全链路实测）

- [x] Flyway V202709240001：`t_combo_product` + `t_combo_product_item` 两新表、
      `t_product_outstock` 加 combo_id/combo_code/combo_name 溯源三列、MENU_COMBINED_PRODUCT 菜单+full_admin 授权
- [x] 后端 `/api/combo-product`：list/detail/create/update/delete/set-status/options
      （CRUD 走 Orchestrator 事务；子项快照服务端权威回填；编码 ZH+日期+序号自动生成；可用库存=min 子SKU）
- [x] 套装出库 `POST /api/warehouse/finished-inventory/combo-outbound`：复用 outbound() 主链路
      （原子扣减防超卖/共单号/审批/收款/账单推送全继承），套装价最大余数法分摊精确到分
- [x] 前端「组合商品」页 `/warehouse/combined-product`（成品管理组菜单）：
      列表 + SideDrawer 三态（新建/编辑/详情，分区锚点，子商品远程搜索添加+可编辑数量）
- [x] 商品仓储工具条「套装出库」SideDrawer（选组合→套数→客户/物流→确认）；
      出库记录 Tab 聚合行「套装」标记 + 明细行「套装」列
- [x] 本地实测：建组合→出2套价60→子SKU各-2、分摊 59.86+60.14=120 精确、共单号、combo三列有值、
      超卖拦截回滚、更新数量重算
- [ ] 待办：推送后线上验收；「组合商品上架电商店铺」属电商模块本期未接

### 2026-09-23 D-525 商品仓储（旧称"成品库存"）与入库/收货各处补款式图列（tsc 0 错 / eslint 0 错）

- [x] 命名统一：`routeConfig.ts` 智能场景 label、`App.tsx` 错误边界 pageName
      「成品库存」→「商品仓储」（菜单/i18n/权限标签本来就是"商品仓储"）
- [x] 补齐 8 处缺图列表：出库弹窗商品编码明细、入库记录抽屉明细、扫码出库弹窗、
      自由入库弹窗、商品编码详情抽屉（加 96px 大图）、出库记录主表、出库单明细、出库接收
- [x] 复用 D-524 的统一工厂（`useStyleCoverImages` + `styleImageColumn`），
      并把手写列工厂改为透传 `imageMap` 的纯函数
- [x] `StyleImageColumnArgs.skuCode` 改为可选（只给 styleNo 也能出图）
- [x] 核实「本来就有图」的清单并记录，避免以后重复劳动
- [x] CLAUDE.md 铁律 15 补「已覆盖清单」+「两个取图键的差别」（sku_code 无分隔符 vs 二维码有分隔符）
- [ ] 未做：小程序端入库/仓储页面（等 D-517 收尾，避免三副本一致性门禁冲突）
- [ ] 有意不加：同一款的颜色尺码明细表（表头已有大图，加列是噪声）

### 2026-09-23 D-524 电商所有列表补「款式图 + 款号」列（mvn 编译过 / 新增 9 例测试全绿 / tsc 0 错 / eslint 0 错）

- [x] 后端 `POST /api/style/sku/brief`（skuCode 维度）与 `POST /api/ecommerce/orders/brief`（订单号维度）
      —— 都以 `t_product_sku` 为权威口径，单次上限 500，**查不到不返回该键**
- [x] `ProductSkuOrchestrator.briefBySkuCodes` / `briefBySkuIds`；`SmartEcommerceController /price/suggestions`
      补 `skuCode/styleNo/color/size/imageUrl`（原来只有 skuId 数字）
- [x] 前端 `useStyleCoverImages` 重写（`briefBySku` / `orderImageMap` / `briefByOrderNo` / `seedBriefs`），
      **删除 `extractStyleNoFromSkuCode`（就是那个 `split('-')[0]`）**
- [x] 新增列工厂 `styleImageColumns.tsx`（`styleImageColumn`/`styleNoColumn`/`orderImageColumn`/`orderStyleNoColumn`）
- [x] 14 处列表接入图片列：电商中心 8 组列 + SmartRefund/SmartPrice/StockDiscrepancy + 分销 2 组 +
      PlatformDetail/orderColumns + warehouse/EcommerceOrders/columns
- [x] 「合单发货」弹窗补商品明细缩略图
- [x] CLAUDE.md 新增铁律 15（电商/仓库列表必须带款式图列，款号只能来自后端解析）
- [x] 新增 `SmartEcommerceControllerBriefTest` 9 例（含"查不到不编造""两种键各查一次""租户过滤"）
- [ ] 待上线后实测：进电商中心各 tab 看款式图是否出图（线上 `t_product_sku` 206 行 / `t_style_info` 110 行，应有图）
- [ ] 未做：平台真实推单（线上凭证是占位值，需商家提供真实 AppKey/AppSecret）

### 2026-09-23 D-523 电商库存入口补齐 + Flyway 幂等 + Webhook 状态码（mvn 编译过 / 5 个测试类全绿 / tsc 0 错，已推送）

- [x] `V202709200001` 改幂等（information_schema 判列），消除每次启动的 Duplicate column ERROR
- [x] `EcStockOrchestrator.syncAllStock` 返回重算 SKU 数；Controller 返回 `{skuCount}`
- [x] 「电商中心 → 库存明细」新增「重算库存」按钮（此前接口无任何前端入口）
- [x] `PlatformWebhookController` 异常→500、未配置→401（新增 8 例测试，含关键回归断言）
- [x] CLAUDE.md 新增铁律 14（入站 Webhook 失败必须用非 2xx 表达）
- [ ] 待上线后实测：界面点「重算库存」→ `t_ec_universal_stock` 是否有行
- [ ] 未做：平台真实推单（线上凭证是占位值，需商家提供真实 AppKey/AppSecret）

### 2026-09-12 D-384 指派明细表 + 按人卡额度 ✅（mvn SUCCESS / tsc / eslint / build 全过，未推送）

- [x] 新表 `t_pattern_process_assignment`（V202709120500）+ Entity/Mapper
- [x] 指派落明细（带工序名 + 单价快照）；`GET /{patternId}/assignments` 查询
- [x] 报工按「工序+颜色+操作人」的指派额度卡控（可分次报满）；无指派回退旧口径（兼容）
- [x] PC「指派安排」列展示张三 2 件 / 李四 1 件
- [x] 工资未改（本就按报工记录的操作人+件数+单价计）

### 2026-09-12 D-383 完成数量人为输入 + 手机端阶段数按配置 ✅（PC tsc/eslint/build 全过；小程序四副本一致，未推送）

- [x] 两端统一：完成数量一律由操作人手填（不预设默认值）——PC 弹窗数量输入框 / 手机端报工数量清空
- [x] PC 删「手动完成」，统一「完成」弹窗（勾选色码 + 填数量）
- [x] 手机端进度分母不再写死 4 个阶段（`stageDefs` 算了没用），改为按 PC 实际配置的阶段数
- [ ] 待回归：填数量完成、两端阶段数一致

### 2026-09-12 D-382 PC 端对齐手机端多色多码 ✅（mvn SUCCESS / tsc 0 错 / ESLint 0 错 / build ✓，未推送）

- [x] PC「批量完成」弹窗：列出全部色码任务，勾选一次完成多个（附已完成色码自动不勾选，防重复计件）
- [x] PC 工序状态列显示「x/y 色」（按工序+颜色聚合，修掉 scan-records 里 color 被丢弃的问题）
- [x] 撤回按颜色收窄（后端可选 color 重载 + 前端传当前色码），消除跨颜色误删
- [x] 修 `StyleProgressTab` 请求 `undefined` 导致整页空数据的 bug
- [ ] 待回归 PC 四处
- [ ] 待业务口径确认：手动完成数量口径、进度分母口径

### 2026-09-12 D-381 样衣批量扫码接口（外单大单性能）✅（mvn SUCCESS / node --check×4 / md5 / ESLint，未推送）

- [x] 后端 `submitScanBatch`（一事务内循环复用 `submitScan`，任一条失败整批回滚）+ `/pattern/scan-batch`
- [x] 小程序报工 + 多色领取改为 1 条批量请求（原 N 条并发，20色×8码=160 条）
- [x] PC 端不涉及；单条端点保留
- [ ] 待真机回归大单报工
- [ ] 遗留：批量内部逐条 `submitScan`，校验查询未合并

### 2026-09-12 D-380 样衣工序进度「3/1」根因 + 状态按件数判定 ✅（node --check×4 / md5 / ESLint 无新增错误，未推送）

- [x] 分母统一：新增共享 `resolveSampleTotalQty()`（色码矩阵合计优先）→ 详情页 3/1 变 3/3，与列表页一致
- [x] 状态按件数判定：只做部分不再显示"已完成"（消除"显示完成后无法继续报工"的阻塞）
- [x] 四副本同步
- [ ] 待真机回归：3 色全报工 = 3/3；只报 1 色 = 1/3 生产中
- [ ] 待确认：列表页/详情页工序数据源不同（款式工序 vs 样板工序）导致显示不一致

### 2026-09-12 D-379 样衣扫码「多颜色勾选领取」（手机端）✅（node --check×4 / WXML / eslint 0 error，未推送）

- [x] 领取表单改为颜色勾选列表：有几个颜色显示几行，勾选颜色 + 填数量，可单色可多色一起领
- [x] 按颜色逐条提交 CLAIM；后端幂等钥匙「工序+颜色」逐色不短路 → 后端零改动；CLAIM 不计工资，多色不会翻倍
- [x] 修掉阻断性 bug：领取按钮原只在 PENDING 显示，领完第 1 色后消失 → 多色时显示「加领」
- [x] 四副本同步（wxss 只追加不覆盖）
- [ ] 待真机回归：勾选多色领取 / 加领剩余颜色
- [ ] 遗留：未屏蔽"他人已领颜色"的勾选（后端会拦截提示）

### 2026-09-12 D-375 备注列表「操作类型/操作人」列错位根治 ✅（7/7 CI 全绿，已部署）

- [x] 后端 `OrderRemarkController` 映射操作日志为备注行时 `setAuthorRole(log.getBizType())`
      → bizType("style") 塞进角色槽 → 操作人显示 style；改为显式「操作日志」标记
- [x] 前端 `RemarkTimelineModal`：操作类型列不再渲染 author（人名），改为 tag/operation/operator/备注 兜底链
- [x] 操作人列显示人名，角色/工序放括号内补充
- [x] 清理 4 处未使用图标导入，lint 保持零警告
- [ ] 待用户回归：备注弹窗四列各归各位

### 2026-09-12 状态更正（此前记录滞后，以本节为准）

- [x] **D-366b（领取与到货拆分 + 到货选去向）**：已由 D-367 完成，非"待实施"
- [x] **worktree 分支 `agents/miniapp-homepage-click-issue`**：已由 D-364 废弃，非"待决定"
- [x] **小数到货迁移**：用户已拍板**暂缓不做**（D-370），非"下一轮 P0"
- [x] **绿色改动**：已按用户要求回退（`--color-success` 恢复 #52c41a）

### 2026-09-11/12 其他会话完成（非本会话，已在 main）

- [x] D-363a 样衣撤回不清数据根治（ad10da0a7）
- [x] D-363b 领取出库终点封口 usedQuantity 台账（20da80b0d）
- [x] D-363c 订单变更快照：操作日志记录修改字段前后值（98c1fd065，CI 绿）
- [x] D-362g/D-362i 日志统一四列表格 + RecordLogDrawer 侧滑日志看板

### 2026-09-11 D-368 采购按钮全灰根治 + 数量默认预填 ✅（tsc/build 0 错误，已推送）

- [x] 「批量领取▾」三动作永久灰 → 判定改业务事实（到货量>0 + 终态排除），样衣与大货节点弹窗两侧统一
- [x] 回料确认可用条件同步放宽（原来漏 awaiting_confirm 等状态）
- [x] 登记到货数量默认预填并整数归一；物料出库单批次自动预填可用量
- [ ] 待回归：到货后动作可点、两个弹窗数量已预填

### 2026-09-11 D-367 领取/到货拆两步 + 到货必选去向 ✅（tsc/build/mvn 全过，已推送）

- [x] 领取只认领（不传数量）；修掉大货侧"提交 arrivedQuantity 而后端只读 quantity、到货从未登记"的错位
- [x] 登记到货必选去向：入库到物料仓库（选仓库+库位）/ 直采使用（不进仓库）
- [x] 仓库+库位选择照抄「样衣入库」Select 范式（含空态提示），大货/样衣一致
- [x] 到货数量整数约束如实提示 + 后端 parseQuantity 防类型转换异常
- [ ] 下一轮 P0：arrived_quantity / inbound_quantity 改 DECIMAL 支持小数到货
- [ ] 待回归：领取→登记到货→选去向全链路

### 2026-09-11 D-366 到货入库弹窗修正 ✅（tsc/lint 0，已推送）

- [x] 弹窗物料信息不再显示订单码数（record.size → record.specifications，三处）
- [x] 「已入库/待入库」标签纠正为「已到货/待到货」
- [x] 库位改物料仓库布局选择（MATERIAL 库区 + 库位选择器），样衣/大货节点弹窗一致
- [x] 到货数量支持小数（原只收整数）
- [ ] D-366b：领取与到货拆分 + 到货选去向（入库/直采），待实施
- [ ] 待回归：弹窗无码数、库位可选

### 2026-09-11 D-365 采购单款式图兜底 + 标题主次 ✅（tsc/lint 0，已推送）

- [x] 打印/预览无图真根因：组件自己兜底拉图，数据层 styleCover 为空 → 打印侧内置同一条兜底链（颜色图→附件）+ token 包装
- [x] 兜底异步：按钮 loading，一键下载等图就绪
- [x] 标题改两行主次：公司名（主）+ 样衣开发采购单/大货采购单/物料采购单（次），两套模板统一
- [ ] 待回归：打印与预览出现款式图、标题两行

### 2026-09-11 D-364 样衣采购弹窗 + 打印单修复 ✅（tsc/lint 0，已推送）

- [x] 样衣采购弹窗补 `ProductionOrderHeader`（款式图+款号款名+颜色+码数矩阵）+ 来源/采购单数/到货率/BOM 状态
- [x] 打印无款式图两因：无 styleId 时按款号兜底查款式；图片 URL 走 `getFullAuthedFileUrl` 补 token
- [x] 打印「工厂」→ 无工厂时改显「来源」= 样衣(开发)/大货/批量
- [x] 废弃卡死 worktree 分支 `agents/miniapp-homepage-click-issue`
- [ ] 待回归：样衣采购弹窗顶部信息、打印款式图与来源文案

### 2026-09-11 D-363 每日流水 + 财务总览数据链路四项修复 ✅（mvn/tsc/safe-push 全过，已推送）

- [x] P0 每日流水排除系统编排记录（scanType=orchestration + 下单/采购等系统阶段名，NULL 保留）
- [x] P0 采购阶段记录时间漂移根治：UPDATE 不覆盖 scanTime + 锚点改订单 createTime + correctStageRecordTimeIfDrifted 存量自愈
- [x] P1 财务总览新增 materialPending（未审批对账金额）+ 前端「待审批物料」卡与明细口径
- [x] 核实无需改动 3 项：出库 5 单（D-360n 已修增量）、232,800 非虚增、入库 3 条=3 菲号正常
- [ ] 待用户回归：流水不再出现"生产扫码-采购" / 总览出现待审批物料卡 / 时间轴采购节点时间正确

### 2026-09-11 D-362 成品入库/出库链路六连修 + 采购闭环 ✅（13 提交，CI 全 success，已推送）

- [x] 采购侧：单据抽屉合并（D-360f）/ 大货采购弹窗按样衣统一（D-360g）/ 选用物料编码弹窗全端统一 50% 侧滑（D-360h）/ 节点详情统一款式信息头（D-360i）
- [x] 采购闭环：节点弹窗双矩阵修复 + 码数合并脏数据防御（D-360g·2）/ 到货后入库出库闭环 + 存量补录（D-360h·2）
- [x] 仓库侧：质检直发客户 + 入库记录工厂列（D-360i·2）/ 入库弹窗款式图兜底（D-360j）/ 质检直发接入完整销售出库 + 物料入库库位必填（D-360k）/ 成品资料 405 + 误标直发退回（D-360l）/ **入库记录款号精确匹配 like→eq，根治 H001 混入 HH001**（D-360m）/ 一次出库一个出库单 + 调拨出库回入库 + 迁移 V202709110100（D-360n）
- [x] 迁移：V202709110100 t_product_outstock.transfer_inbound_status
- [ ] 待用户回归（5 项）：选用物料右滑 50% / 大货采购弹窗按钮一行 + 打印款式图矩阵 / 质检直发完整出库 / 调拨回入库闭环 / H001 不再混入 HH001
- [ ] 遗留①：当日 D 编号重复（g/h/i 各两次），需在后续取号严格走 git log 取号
- [ ] 遗留②：worktree 分支 `agents/miniapp-homepage-click-issue` 处于 merge 冲突中断状态（28 文件冲突、落后 main 1344 提交），待决定废弃或重做

### 2026-09-10 D-333 主题切换黑白块 + 折叠弹出层文字不可见根修 ✅（build 通过，已推送）

- [x] design-system.css 暗色令牌从 OS 媒体查询解耦到 data-theme（媒体查询收紧 :not([data-theme]) + 新增 :root[data-theme="dark"] 块）
- [x] 清理"底色令牌反当文字色"：dark-theme-global.css 45 处 + AppProviders 18 处 + global.css 暗色 --neutral-text
- [x] Playwright OS配色×应用主题 4 组合矩阵全 PASS；1280/1920/2560 分辨率零溢出

### 2026-09-10 D-331 委派"选择人员"空列表根修 + 委派/质检卡片工整化 ✅（build 通过，已推送）

- [x] 修复 useNodeDetailData.loadUsers：status 'enabled'→'active' + 非超管走 tenantService.listSubAccounts（PII 权限双路径，照 StaffSelect 范式）
- [x] BundleDelegatePanel：卡片 160→180px/字号加大一档，底部"外发工序+委派目标+保存"收进浅底操作条，选择器定宽 130/260
- [x] QcTabContent：卡片与委派卡同尺寸放大；多选批量质检/单选质检逻辑不变（并行提交 ad7fdd7da 已落卡片网格）

### 2026-09-08 D-315 PC端小云统一待办面板 + D-316 手机端待办九区梳理 ✅（tsc 0错 + mvn BUILD SUCCESS，已推送 待部署回归）

- [x] D-315 PC端：TaskAggregationPanel 删除并入 TaskListView 统一面板（分类chips+13业务分组+紧急筛选+卡片去重+入口统一）
- [x] D-315 后端：resolveAssigneeIdsByName 运行时按名字批量回填 assigneeId（返修/逾期/异常/外发/样衣7环节，免跨表迁移）
- [x] D-315 去 emoji：分类chips/组头/卡片meta 全改纯文字标签（SmartBubble/PendingItemsSection 同步）
- [x] D-316 手机端：九区按业务四组排序 + 卡片去重（占位首字/来源标记/超期N天/到货合并）+ 超时提醒区块统一 + 提醒区合并
- [ ] 待部署回归：统一面板分类分组展示、铃铛点击落到待办任务视图、手机端九区排序

### 2026-09-07 批量问题优化六阶段 ✅（前端 tsc 0 错误 + 后端 mvn BUILD SUCCESS，待推送）

- [x] Phase1 操作日志与备注分离（OperationLogAppendUtil 直写 t_operation_log，12+ 调用点清理，cleanup-remark-logs.py 幂等清洗）
- [x] Phase2 手工编菲（单数量输入/码数匹配提示/快捷键加行/快速分扎/提交排序）
- [x] Phase3 采购全链路（PurchasePrintModal 专业采购单/状态中文化/样衣采购无订单降级/样衣出库领取）
- [x] Phase4 订单管理（打印生产单入口/排行榜收敛/智能数据分析/无资料下单快捷齿轮）
- [x] Phase5 菲号尺码排序全系统（前端 compareSizeAsc + 后端 ProductionOrderUtils，自由编菲/一键生成/后端生成全覆盖）
- [x] Phase6 裁剪菲号明细表 disableFillScrollY 自然平铺
- [ ] 待推送部署后回归：手工编菲/采购单打印/样衣采购/备注纯净/打印生产单/排行榜尺寸/菲号小码在前

### 2026-09-05 D-294 尺寸表智能导入"静默丢光"修复 ✅（后端1文件，mvn compile 过，待推送）

- [x] 修复 merge 导入在目标款无尺寸数据时按 canonical 码数过滤导致模板全部行被静默丢弃
- [x] 列头 S/S/M/M/L/L/XL/XL 观感 = shortSizeLabel 简称（D-252 设计），非数据错误
- [x] 用户可先用「覆盖导入」绕过（覆盖分支不做码数过滤）
- [ ] 待推送部署后端后回归：空尺寸表款式导入模板能正常写入部位数据

### 2026-09-03 D-283 工序单价租户级总开关 ✅（后端1+前端3+小程序6含h5副本，node --check/tsc/mvn 过，待推送）

- [x] 新增租户级开关 display.process.unitPrice.visible（复用 t_tenant_smart_feature，默认开，无迁移）
- [x] PC 智能开关面板 + 小程序生产管理/外发管理管理员 chips 双入口
- [x] 单价隐藏时时间显示不受影响；非管理员只读跟随
- [ ] 待推送 CI 部署后用户回归：关开关→两页单价消失（全员）；开→恢复

### 2026-09-03 D-289 拖动不改写进度节点 ✅（前端1文件，已推送待 CI 部署）

- [x] 去掉拖动"进度节点跟随落点"逻辑——拖动只调顺序

### 2026-09-03 D-287/288 行操作常显+工序单价排序拖动 ✅（前端7文件，tsc/eslint 过，已推送待 CI 部署）

- [x] D-287 六处悬停显现改常显（全站表格+smart rows+左卡+三棵树）
- [x] D-288 导入按父进度规范序重排重编码；编辑态拖动排序（节点跟随+编码重排）
- [ ] 待用户回归：按钮直接可见、导入分组顺序、拖动调序

### 2026-09-03 D-283~286 工序时间线四连 ✅（后端2+PC3+小程序9含h5副本，全检查过，已推送待 CI 部署）

- [x] D-283 租户单价开关（权限配置页）/ D-284 耗时停留等待 / D-285 时间恒显 / D-286 前沿呼吸
- [ ] 待用户回归：呼吸点、单价开关全租户生效、耗时文本

### 2026-09-03 D-282 吸底回归修复+卡片视图翻页器 ✅（前端5文件，tsc/eslint 过，已推送待 CI 部署）

- [x] 填充公式改底边锚定修裁剪管理自锁；填充容器兜底 .layout-content 覆盖质检入库等旧页
- [x] StandardPagination 加 sticky；样衣开发(卡片+表格)/工序跟进/订单管理卡片视图接入
- [ ] 待用户回归：裁剪管理/样衣开发/工序跟进/质检入库

### 2026-09-03 D-281 报废状态+分页吸底 ✅（后端2文件+前端2文件，tsc/eslint/mvn 过，已推送待 CI 部署）

- [x] closeOrder 对 scrapped/cancelled/archived 抛错拒绝（堵复活漏洞）
- [x] 自愈：completed 且 completed_quantity=0 → scrapped（Runner 第10步，云端部署后生效）
- [x] 填充模式放宽为容器内任意深度，全站列表页分页吸底
- [ ] 待用户回归：报废单四端显示、各页分页固定

### 2026-09-03 D-280 三联动修 ✅（后端2+前端2+小程序9含h5副本，全检查过，已推送待 CI 部署）

- [x] 人员管理部门树=组织架构层级（parentId 客户端组树）
- [x] 岗位关联人员/人员管理角色筛选修通（后端 roleId 参数兼容新旧角色表）
- [x] 生产管理/外发管理 工序进度=样衣同款时间线+时间单价统一开关（管理层）
- [ ] 待用户回归三处

### 2026-09-03 D-279 岗位权限"堆积/名字对不上"根治 ✅（迁移1+前端4文件，全检查过，已推送待 CI 部署）

- [x] V2027090301：权限名对齐侧边栏（code 键幂等）+ 员工借支/查看财务数据/财税工具挂靠修正（本地库实测生效）
- [x] 矩阵分层渲染：子模块分组块（名行+按钮行），menu children 过滤，单子模块同名去重
- [x] 财务管理补 工资结算/员工借支 项；labels 全量对齐 menuConfig
- [ ] 待用户回归：系统→角色 岗位权限面板分层清晰、名字与侧边栏一致

### 2026-09-03 D-278 工资页缺图/扫码历史缺单价 ✅（后端1文件+小程序26文件含h5副本，全检查过，已推送待 CI 部署）

- [x] 工资页样衣记录缺图：enrichStyleInfo 加第三级 styleNo 批量兜底（样衣链路无 styleId/orderId）
- [x] 扫码历史样衣记录缺单价：_formatPatternRecord 接上后端已返回的 unitPrice/scanCost，isPayable 同步生效
- [x] h5 两副本遗留半成品补齐同步（工资页图片/搜索框、历史页封面/数量、json 组件注册），四副本一致
- [x] 附带 quality-detail 长菲号标签换行 + sample-development 码数 chip 防出界两条遗留 wxss
- [ ] 待 CI 部署后用户回归：两页 工序/单价/图片/明细 显示一致

### 2026-09-03 D-277 样衣仓库入库"selectOne found: 2"根治 ✅（后端3文件，mvn 过，已推送待 CI 部署）

- [x] 根因：手机端入库不传 sampleType → `inbound()` 防重键 eq(null) 永不匹配被架空 → 同 SKU 重复插行 → `scanQuery` `.one()` 抛 TooManyResultsException（截图 BR26Q1Q0929A 棕色 XS 实证）
- [x] 修复：inbound 防重键收敛为款号+颜色+尺码；scanQuery 改 list 兜底取最早一条；PatternStockHelper 出库/归还补尺码+getOne(throwEx=false)
- [x] 存量自愈：StyleSnapshotBackfillRunner 第 9 步幂等四连（数量合并→字段回填→借调单重指向→软删）
- [ ] 待 CI 部署后用户回归：样衣扫码详情正常显示；已入库 SKU 再入库提示"该颜色尺码已入库"

### 2026-09-03 D-276 尾部进度球父子映射口径根治 ✅（后端2文件，mvn 过，已推送待 CI 部署）

- [x] 根因：主路径尾部球只认「包装」子工序，剪线/整烫/质检配置的订单恒 0%（PO20260828152504 实证）
- [x] 修复：resolveParentStageRate（映射服务 + min 口径）+ 三级回退（min → 映射聚合 max → 视图包装量）
- [ ] 待 CI 部署后用户验收尾部球

### 2026-09-03 D-275 裁剪弹窗快捷跳转恢复 ✅（前端1文件，CI 全绿已部署）

### 2026-09-03 D-275 裁剪弹窗快捷跳转恢复 ✅（前端1文件，tsc/eslint 0错，已推送待 CI 部署）

- [x] 根因：D-137 抽屉化把 NodeDetailModal 默认 mode 改 'drawer'，「前往裁剪管理」按钮条件 `mode !== 'drawer'` → 永不渲染
- [x] 修复：去掉形态条件 + 清理未用 mode 形参；路由 /production/cutting/task/:orderNo 确认存在
- [ ] 待 CI 部署后用户刷新验收弹窗顶部快捷按钮

### 2026-09-02 D-274 已完成老采购到货量自愈 ✅（后端1文件，mvn compile 过，已推送待 CI 部署）

- [x] 定位：7 条已完成老采购卡「有效到货量为0」——D-273c 只修增量，存量无自愈路径（confirmComplete 幂等分支直接 return）
- [x] 修复：MaterialReconciliationOrchestrator.upsertWithReason 前置 healArrivedQuantityIfCompleted（completed && aq≤0 → 回写 purchaseQuantity，幂等防并发）
- [ ] 待 CI 部署成功后用户点「补生成对账」验收 7 条入账

### 2026-09-01 D-261 用户暴走七连修 ✅（前端11文件+后端5文件；mvn/tsc/eslint 全过，待推送）

用户一次性甩出 10+ 个截图抱怨"全部写的死的""做的什么垃圾"。逐项核实根因后批量修，详见 decisionLog D-261。

- [x] 款式特征 6 栏合 1 个整段文本框（共享模块 styleFeature.ts + 4 处消费点）
- [x] 尺寸表 AI 识别改覆盖语义 + 修复行 key 冲突导致的"乱跳"
- [x] 公差改名"正负公差"+ ± 号；部位/度量方式/BOM 颜色列加宽
- [x] 排产建议排除布行（与 D-200 同口径）
- [x] 资料单价退回"没反应"3 处吞异常修复（UnitPrice/SizeTable/TemplateCenter）
- [x] 视觉 AI 失败原因透传（洗水唛/图形分析/尺寸表/BOM OCR 全链路）
- [x] 样衣采购创建带色/成分/克重/损耗率（与 D-252 大货路径对齐）
- [ ] 待用户验收：推送部署后端到端验证 7 项

### 2026-08-31 D-252 物料链路闭环修复（BOM→资料库→采购→对账）+ 工序导入模式可选 ✅（后端+前端，待用户验收推送）

用户暴走「全部一起优化好…不要到处都是问题」，核心为「物料对账看不到大货采购」「颜色克重匹配不过来」。
本次不再打补丁，改为打通整条数据链路，一次性修掉 3 个数据流断点 + 补存量入口。

* [x] **断点1（P0）工厂类型 NULL 误判外发 → 对账整批跳过**
  `MaterialReconciliationOrchestrator.isInternalFactoryPurchase` +
  `MaterialPurchaseSyncHelper.isInternalOrderPurchase` 两处口径统一改为
  「**只有明确 EXTERNAL 才是外发**」，NULL/未标注/INTERNAL 均按内部
  （线上「最美服装工厂」「本厂」订单 factory\_type 为 NULL，旧口径下对账全丢）
  顺带给 isInternalOrderPurchase 补 tenantId 隔离（原 getById 不带租户，违反 P0 #7）

* [x] **断点2 BOM→物料资料库漏同步属性**
  `StyleBomMaterialSyncHelper` 抽 `applyBomFields()` 供 create/update/单条自动同步**共用**，
  补齐 color / fabricComposition / fabricWeight / conversionRate

* [x] **断点3 BOM→采购 属性全丢**
  `MaterialPurchaseServiceHelper.createPurchaseFromBom` 直带
  fabricComposition / fabricWeight / lossRate（lossRate 注释说「贯通采购链路」却从未赋值）

* [x] **存量补生成入口**：后端 `/backfill` 早已存在但前端无入口 →
  补 `materialReconciliationApi.backfillMaterialReconciliation` + 物料对账页「补生成对账」按钮

* [x] **工序模板导入可选覆盖/追加**：前端加下拉（带 Tooltip）；
  后端追加模式补「工序名+阶段」去重（幂等）+ sortOrder/processCode 续接重排
  （原追加模式不去重，重复导入产生重复工序且编码冲突导致保存失败）

* [x] 验证：后端 `mvn compile` BUILD SUCCESS / 前端 `npx tsc --noEmit` 零错误 / lint 0 错误

* [ ] 待用户验收：进物料对账页点「补生成对账」→ 大货采购对账出现；
  BOM 页「同步到物料资料库」→ 采购列表颜色/克重显示出来

### 2026-08-31 D-252 下轮待办 4 项全部闭环 ✅（D-253，已推送）

* [x] **尺寸表简化（标准码+前后放码）**：随 D-252 一并完成——尺寸表列头仅显示码数简称
  （XS/S/D）+ Tooltip 完整名；样版码列简写；跳码区单元格精简摘要「前↓1 后↑1」、
  Tooltip 看带码数明细（useStyleSizeColumns.tsx，已提交 4ad4fc8a2）

* [x] **质检记录分类**：成品仓质检记录面板（QcRecordsPanel）新增「不合格分布」分类聚合
  卡片——按次品类别 + 处理方式两个维度排序聚合 + 进度条占比，全部合格时不渲染

* [x] **齿轮标签落库排查**：排查结论=链路完整已落库，无需改动——迁移
  V202608260001 加 supplier\_tag 列；Factory.java 有 supplierTag 字段；
  FactoryController POST/PUT 走 factoryOrchestrator.save/update（MyBatis-Plus 全字段）
  落库；前端 QuickManageModal 新增/编辑供应商均传 supplierTag；
  simple-list 返回 supplierTag

* [x] **款式图片上传保持**：修复 P0——useStyleFormActions.handleSave 编辑分支原先只在
  新建（isNewPage）时上传 pendingImages/pendingColorImages，编辑已有款式时
  封面/主图区更换的图片保存后丢失；现编辑分支同样上传后 fetchDetail 刷新

### 2026-08-31 D-249 下单页按钮回归镂空规范 + 输入框改白底描边 ✅（纯 wxss，用户截图反馈）

* [x] 按钮全部镂空：f-btn/bar-btn/next-btn/submit-btn（对齐 app.wxss .btn-primary 规范）

* [x] 输入/选择框统一白底（--color-bg-card）+ 浅灰描边（--color-border），6 处

* [x] 正则扫描实心蓝残留 0；四副本 MD5 一致；括号配对 OK

* [ ] 真机验收观感

### 2026-08-30 D-248 下单页补齐：客户选择器 + 基础属性库齿轮 ✅（纯小程序，零后端改动，已提交推送）

* [x] 客户选择器：新建 `api-modules/crm.js`，用 `GET /api/crm/customers/active-list`
  （后端已 tenantId + 工厂隔离）；form 页改 picker，无数据回退手输

* [x] 提交补 `customerId` / `customerName`（原先恒 null）

* [x] picker 首项插「（不选）」解决无法清空问题

* [x] 基础属性库：复用 t\_dict `color_group` / `size_group`，**零后端改动**

* [x] 颜色/码数区块加「库」按钮 → 半屏弹层 → 覆盖 / 追加（追加自动去重）

* [x] 只做「使用组合」，组合增删改留在 PC 端

* [x] QA：四副本 node --check / MD5 一致 / 40 处理器全有实现 / WXSS 94/94

* [ ] 真机验收：客户选择器 + 属性库覆盖追加

### 2026-08-30 D-247 无资料下单图片丢失根治（P0）+ 开放「从已有款式下单」（P1）✅（后端+小程序，已提交推送）

* [x] **P0 根因**：订单 `coverImage`/`styleImage` 是 `@TableField(exist=false)`，靠 styleNo 三级回退；
  无资料下单无款式档案 → 用户上传的图片 100% 丢失

* [x] 小程序 `_persistCoverImage`：建单成功后上传并存 `t_order_image`（失败不阻断下单）

* [x] 后端 `fillCoverFromOrderImages`：按 orderNo 回填，显式带 tenant\_id，fail-safe

* [x] 覆盖 6 个 fillStyleCover 调用点（列表 + 详情 + 裁剪 + 入库两处 + 另一列表）自动受益

* [x] 零 Flyway 迁移（复用既有 OrderImage 体系）

* [x] P1：无资料下单两条路径（上传图片 / 选已有款式），修复原「列表不显示」死代码

* [x] 布局改 flex，`.grid-scroll` 去 `calc(100vh-Npx)` 硬编码

* [x] 自查修复：方式二（选已有款式）封面丢失（onLoad 只读 tempImage）

* [x] QA：后端 BUILD SUCCESS / 四副本 node --check / MD5 一致 / WXML 处理器全有实现

* [ ] 待真机验收：无资料下单上传图 → 列表与详情能看到

* [ ] 低优先级：删死页面 `pages/order/no-data-create`（风险 > 收益，本批未动）

### 2026-08-30 D-246 手机端下单页码数一坨根治 + 布局工整化 + 对齐PC批量操作 ✅（纯小程序，待开发者工具验收）

* [x] 根因：小程序只按 `,` 切码数，旧 `/`-拼接数据（`XS(155/72A)/S(160/76)/...`）整段变 1 个 chip

* [x] 新建 `utils/styleOptions.js`（PC `splitStyleOptions` 1:1 复刻，智能切括号外 `/`）

* [x] 实测：旧实现 1 个码数 → 新实现 7 个码数；7 个边界场景全过

* [x] 颜色/码数支持批量粘贴去重；全选颜色/全选码数/清空/全部铺量（对齐 PC）

* [x] 新增按行铺量 / 按列铺量（PC 端没有，手机端专属提效）

* [x] 矩阵横滑 + 左侧颜色列 sticky 固定 + 行小计 + 码数合计行

* [x] 统计条（开发色/开发码/已选/组合）对齐 PC Tag

* [x] 纸样师/跟单员改 picker 选择器；下单类型 label 带中文；品类不再被字典首项覆盖

* [x] 无资料下单：传 category + 款号款名可手填

* [x] QA：四副本 node --check 通过、MD5 一致、WXML 329 标签全闭合、36 处理器全有实现、WXSS 括号配对

* [ ] 待真机验收：微信开发者工具编译 + 多码数横滑 + 键盘弹出不挤压

* [ ] 待办（下批）：基础属性库齿轮、客户选择器（小程序缺 crm 模块）

### 2026-08-28 D-206 PC端尺码录入全量接入基础属性库 ✅（已推送；纯前端）

* [x] 4处新接+2处确认不接；tsc零错误

### 2026-08-28 D-205 价格模板接入基础属性库选尺码 ✅（已推送；纯前端）

* [x] applySizesFromLibrary（覆盖/追加+新列沿用工价）；齿轮按钮+220px输入框；tsc通过

### 2026-08-28 D-204v2 首页小类目两两并排一行 ✅（已推送；纯小程序）

* [x] menuRows 配对布局；撤销 D-204 列数内联；node --check 通过

### 2026-08-28 D-204 首页应用网格列数自适应 ✅（已推送；纯小程序）

* [x] \_buildMenuGroups 加 cols；menu-grid 内联 repeat(cols,1fr)；node --check 通过

### 2026-08-28 D-203 订单详情转单按钮补 tab=transfer ✅（已推送；纯小程序）

* [x] 全站 bundle-detail 入口 grep 核对，仅 onActionTransfer 漏参，已补

### 2026-08-28 D-202 裁剪分扎表尺码遮挡修复 ✅（已推送；纯小程序）

* [x] display:table+scroll-x；尺码列auto扩展；cell级padding；输入框居中

### 2026-08-28 D-201 裁剪页实心按钮回归镂空规范 ✅（已推送；纯小程序）

* [x] bundle-detail 三处页面自写按钮对齐 app.wxss 镂空主按钮；选中态底色指示器保留

### 2026-08-28 D-200 转单/下单工厂过滤布行+转单页工整化 ✅（已推送；后端需重启）

* [x] searchTransferableFactories 与 PC fetchFactories 双点过滤 MATERIAL；转单面板勾选框/搜索框/分隔线整治；mvn compile 通过

### 2026-08-28 D-199 订单详情明细表横滑修复+信息格紧凑化 ✅（已推送；纯小程序）

* [x] width:max-content 修复横滑；信息格单行式紧凑对齐

### 2026-08-28 D-198 订单详情尺码改横滑标签 ✅（已推送；纯小程序）

* [x] specSummary.sizeList 数组 + info-cell--full + scroll-x nowrap chip

### 2026-08-28 D-197 订单卡快捷操作上移展开区顶部 ✅（已推送；纯小程序）

* [x] 按钮行整体移至展开区最上面，功能不变；样式改下分隔线

### 2026-08-28 D-196 生产管理第一tab改回全部订单 ✅（已推送；纯小程序）

* [x] label 全部；去 excludeTerminal + 客户端终态过滤；计数与列表同口径（totalOrders）

### 2026-08-28 D-195 工序编辑页布局工整化 ✅（已推送；纯小程序）

* [x] 提示一行化；阶段头底色条+小计标签；工序行缩进28rpx+留白+字号降档；空组文案修正

### 2026-08-28 D-194 生产管理进度卡去单价+颜色尺码横滑 ✅（已推送；纯小程序）

* [x] 删 node-sub-procs 单价行+死css；SKU表 display:table 对齐不压缩+横滑

### 2026-08-28 D-193 生产管理单菲订单免展开直接显示明细 ✅（已推送；纯小程序）

* [x] enrichForDashboard expanded=colorGroups.length<=1；展开按钮仅多菲显示；node --check 通过

### 2026-08-28 D-192 工序编辑页采购/入库分组移除+裁剪单价口径澄清 ✅（已推送；纯小程序）

* [x] EDITABLE\_STAGE\_IDS 只渲染4核心工序；采购/入库残留工序保存时自动清除

* [x] 页面顶部单价口径说明；node --check + wxss 括号校验通过

### 2026-08-28 D-191 图片预览左右切换全站生效修复 ✅（已推送；纯前端无需重启后端）

* [x] StyleCoverThumb 单点修复（21处引用）：antd Image 注册进 Layout 全局 PreviewGroup，点击预览带侧边左右箭头+页码计数

* [x] 移除 D-125 私有附件预览，全站预览体验统一（tsc 零错误 + vite build 通过）

### 2026-08-28 D-190 扫码历史图/交期回归+待裁剪待办面料守卫+采购详情封面+品类中文四连修 ✅（已推送；后端需重启）

* [x] 样衣扫码历史：后端注入款式封面+交期（PatternProductionController.myPatternScanHistory），前端 HistoryHandler 透传 deliveryDateStr

* [x] 待裁剪待办：CuttingTaskOrchestrator.getMyTasks 未领取(pending)任务加 hasCuttingMaterialReady 过滤，双路径待办自动同口径

* [x] 采购详情：MaterialPurchaseOrchestratorHelper.listWithEnrichment 批量注入款式封面；小程序顶部卡条件渲染

* [x] 品类中文：displayHelper.CATEGORY\_LABEL 补齐 PC 全量枚举，scan/pattern+sample-development 两页本地映射收敛

### 2026-08-26 D-171续 资料单打印物料清单修正 ✅（已推送 7e6593e24）

* [x] 打印BOM列与页面一致：部位/子部位/成分/克重/颜色/规格幅宽/开发采购用量/单件用量/损耗率/单价/小计/单位/供应商
  （原列错位：规格用错字段名specifications、用量读不存在的quantity字段显示空）

* [x] 备注列过滤日志行：StyleBomLogAppendHelper把操作日志追加进BOM.remark字段，打印备注只显人工备注

### 2026-08-26 D-169续 报价单打印人+版本确认 ✅（已推送 bf2bcb1d3）

* [x] 核实：origin/main 上 buildQuotationPrintHtml 已是D-169新版（标准表格）——用户看到旧样
  是浏览器旧bundle或云端未重新部署，非漏推

* [x] 报价单加'打印人'：页眉打印人字段+页脚落款(打印人·打印时间)，取当前登录人姓名

### 2026-08-26 D-169 工艺说明乱码+报价单打印 ✅（已推送 277ec0c4c）

* [x] 工艺说明：Word形状粘贴的多层转义(\&lt;/\&amp;lt;)一层解码不够→循环解码至稳定；
  粘贴识别转义HTML串→解码清洗按富文本插入（不再裸文字进编辑器）

* [x] 报价单打印重写标准中文表格：黑框线、列与页面一致(开发采购用量/倍率/成本汇总四列)、
  小计行、去英文Quotation Sheet与emoji、具体色值（独立窗口var()全失效原样）

### 2026-08-28 D-189 样衣报工数量逻辑根治+扫码页重排 ✅（已推送；后端需重启/云端待部署，小程序需发版）

* [x] 报工永远被拦根因：D-164 累计报工护栏未排除 CLAIM 领取记录（领取带数量1吃掉全部额度）；护栏排除 CLAIM/RECEIVE 后领取→报工→报满转已完成三态闭环

* [x] "制作中"→"生产中"：样衣状态徽章+工序徽章+toast+详情页阶段文案，小程序统一

* [x] 扫码页重排：款式与数量合并一张卡置于工序上方；报工表单紧跟工序列表；码数矩阵 scroll-x 横滑列不收缩

* [x] QA：后端 mvn compile 过；四副本 node --check/wxml/wxss 结构检查全过

### 2026-08-28 D-188 工艺说明编辑器乱码三连修 ✅（已推送，纯前端刷新即生效）

* [x] 双转义乱码根治：isSheetRichHtml 只认 img/br → 加粗一行字被整段转义+回声覆盖编辑器；改白名单标签正则+effect 双侧 normalize 比较

* [x] 存量脏数据自愈：编辑器重开对 `&lt;tag&gt;` 一层解码还原，重存净库

* [x] 删除线保住（style 白名单补 text-decoration-line）+ 颜色按钮一层弹窗+选区恢复 + 插表格/插图即时上报

* [x] QA：tsc 通过，六场景清洗器用例全过

### 2026-08-26 D-168 SKU编码统一+属性库左右布局 ✅（已推送 791e6fcdd，需重启后端）

* [x] SKU编码不一致根因：样衣端generateSkuCode无分隔直拼 vs 下单端buildSkuNo全'-'连接；
  下单优先用开发端码→同SKU两个长相。样衣端改'款号-颜色-尺码'，AUTO重算刷非手改行

* [x] 基础属性库弹窗改左右布局：左侧组合目录(选中态卡片)+右侧全量内容/编辑器，680→860宽

### 2026-08-28 D-187 工艺说明富文本化 ✅

* [x] 样衣开发编辑器加图二工具栏（撤销/段落/加粗/字色底色/对齐/缩进/列表/表格/插图/全屏），仍存轻量HTML进 style.description

* [x] 下游全部只读文档渲染（新组件 SheetRichViewer）：质检详情/入库独立详情/订单流转/数据中心——弃15行表格，输入什么显示什么

* [x] 清洗器扩白名单+剥历史日志脏行（D-069 前烙进 description 的"BOM库存检查"等日志行）

* [x] 全线改名工艺说明（质检Tab/订单流转Tab/编辑器/OCR按钮/数据中心/维护中心/手机端stage-detail）；单据名"生产制单"保留

* [x] 手机端 stage-detail rich-text 渲染保图片排版；scan-result 工艺提示剥标签防HTML裸露

* [x] 提交 971b570b0；纯前端+小程序，开发者工具重编译即见

### 2026-08-28 D-186 大货扫码误入样衣链路根治 ✅

* [x] 根因：D-157 样衣委派判定 hasText(String.valueOf(params.get("patternId")))，缺 key 时 String.valueOf(null)=="null" 字符串恒真，大货扫码三入口（production/quality/warehouse）全被劫持进样衣链路

* [x] 修复：isSampleScanContext + executeProductionScan 委派条件改 TextUtils.safeText；submitSamplePatternScan 兜底链补 patternId（与判定同口径）

* [x] 全后端排查同类模式，其余命中均有 !=null 守卫；AP-BE-05 反模式沉淀

* [x] 提交 e3006332a；需重启后端（本地+云端）

### 2026-08-28 D-185 质检页三连修 ✅

* [x] 质检入库选库位：废弃底部 picker 弹窗，改页面内直选——仓库 chips 行 → 点选后出现库位 chips（带已用/容量、满位虚线置灰+点击拦截），对齐样衣仓库页交互

* [x] 扫码结果页补尺寸表：style.listSizes 透视（行=部位/列=尺码）横滚表格，当前码数列高亮，随生产提示顺路异步加载

* [x] 长菲号优化：扫码结果页菲号显示短版（orderNo-序号），长按复制完整号；质检入库表单菲号同步改短版

* [x] 6文件三副本同步；QA全过

### 2026-08-28 D-184 生产管理五连修 ✅

* [x] 工序进度节点过滤采购/入库（progressNodes.js 两份副本：dashboard+factory；defaultNodes 收敛为4生产阶段）

* [x] 订单详情下单明细矩阵：fr挤压改横向滚动+固定列宽（颜色96rpx/码数150rpx/小计88rpx）+nowrap

* [x] 订单详情操作栏状态联动：采购/裁剪/工序图标下加完成率徽章（已完成绿/进行中蓝/未开始灰）

* [x] 进行中tab客户端过滤终态订单（防旧云端忽略excludeTerminal）；后端stats新版totalOrders=activeOrders语义已正确

* [x] 工序编辑行重构：名称行+属性行两行结构，价格独立右对齐（原全挤一行自动换行杂乱）

* [x] 核实结论：转单两端同端点✓；工序编辑写同表✓；进行中/仓库页异常根因=云端后端旧版待部署

### 2026-08-28 D-183 已入库样衣仍显示"样衣入库"按钮修复 ✅

* [x] 用户报：已完成的样衣（在库）详情页还显示蓝色实心"样衣入库"；仓库页在库样品三个按钮全显示

* [x] 关键认知纠正：**入库后 pattern.status=COMPLETED（不是 WAREHOUSE\_IN）**——"已完成"标签=已入库在库闭环；D-181 把 COMPLETED 当"可再入库"状态是弄反了

* [x] 详情页修复：入库按钮条件收紧为「审核通过 && status=PRODUCTION\_COMPLETED（生产完成未入库）」；COMPLETED/WAREHOUSE\_OUT（在库/借出）一律不显示

* [x] 仓库页兜底：scan-action 前端过滤——有库存记录(found)时强制剔除 inbound 动作（在库→借调、借出→归还），防旧版云端后端误返回

* [x] 仓库页三按钮全显的根因是云端后端旧版（本地 scanQuery 已按库存状态返回正确 actions），彻底解决需云端部署

* [x] 2文件三副本同步；QA全过

### 2026-08-28 D-182 详情页父工序不再固定显示——按真实配置渲染 ✅

* [x] 用户指出：详情页固定显示裁剪/二次工艺/车缝/尾部4个父工序，实际未配置，误导用户以为已配置

* [x] 根因：buildStages 无条件渲染 SAMPLE\_PARENT\_STAGES 固定4阶段（列表页 D-176 已修过同类问题，详情页漏了）

* [x] 修复：loadStyleDetail 先拉 getPatternProcessConfig，buildStages 只渲染配置了子工序的父阶段；明确无配置→阶段区显示"该款未配置开发工序，请先在PC端款式资料中配置工序"提示（文案与扫码拦截一致）；无生产单/接口失败回退旧渲染

* [x] 附带修正：总进度/完成节点数只统计已配置阶段（原来未配置阶段按0%稀释平均值）

* [x] resolveStageKey/STAGE\_KEY\_MAP 收编进共享 sampleHelper（详情页复用，列表页本地副本暂保留）

* [x] 4文件三副本同步；QA全过

### 2026-08-28 D-181 样衣入库/审核不再是"工序"——对齐PC流程 ✅

* [x] 用户拍板：入库不该出现在工序扫码列表里，PC怎么做手机就怎么做

* [x] PC核实：工序列表只有真实工序；审核是详情页独立区块；入库是审核通过后的按钮→跳样衣仓库页

* [x] PatternScanProcessor：删除"样衣入库/样衣审核"两个虚拟节点（D-180的"已完成展示"方案一并废弃，那是治标）

* [x] 样衣详情页新增「样衣审核」按钮（生产完成未审核时显示，ActionSheet通过/返修/驳回）+「样衣入库」按钮（审核通过未入库时显示，带styleNo/color/size跳样衣仓库scan-action，与PC带参跳转同构）

* [x] 扫码页工序全部完成后显示指引条"请返回样衣详情完成样衣审核与入库"

* [x] scan-action onLoad 已支持 styleNo+color+size 带参直达样品（入库/借调/归还动作），入口天然存在

* [x] 7文件三副本同步；QA全过

### 2026-08-27 D-180 样衣已入库，工序扫码仍显示"待领取/去入库"修复 ✅

* [x] 根因：PatternScanProcessor.buildProcessOperationOptions 的"样衣入库"是前端追加的虚拟节点，写死 status:'PENDING'，从不检查 pattern.status 是否已 WAREHOUSE\_IN

* [x] 修复：status===WAREHOUSE\_IN 时入库节点改输出 COMPLETED（显示已完成，无"去入库"按钮）；后端 warehouseIn 对已入库给明确提示"该样衣已在仓库中，请勿重复入库"（原误导为"样板生产未完成"）

* [x] 同族排查结论：全项目写死 PENDING 的虚拟节点仅入库/审核两处（审核节点语义正确）；quality-detail"待入库"自洽（本页入库回写 warehouse 字段）；WAREHOUSE\_OUT/COMPLETED(归还) 显示去入库是后端支持的重入流程，非 bug

* [x] 三副本同步；QA 全过+后端编译过；后端已重启

### 2026-08-27 D-179 登录体验三连修：告别频繁"重新登录" ✅

* [x] 配置：access token 4h→12h（覆盖一个工作日）、refresh token 72h→720h（30天，后端本就滚动续期）——活跃用户不再被迫重登

* [x] 小程序 request.js/websocket.js：刷新失败区分「后端明确拒绝」（清token跳登录）与「网络/5xx暂时失败」（保留登录态+0.8s/1.6s退避补刷2次+本次请求友好报错），上传/预刷新/401三路径全改

* [x] PC core.ts：新增 refreshAccessTokenSingleFlight 单飞锁（并发401只发一次刷新）+同样的温和失败语义；请求预刷新/响应401两处接入

* [x] PC 启动 boot：网络失败不再清token踢登录页，用缓存用户进入；/me失败同样温和

* [x] QA全过（前端lint+typecheck、小程序eslint、后端compile）；api测试11/11

### 2026-08-27 D-178 手机端应用分组对齐PC端菜单 ✅

* [x] 下单管理：生产组→开发组（PC"商品下单"在样衣管理组，用户指定）

* [x] 原"仓库"大杂烩拆分为 物料（采购任务/物料入库/物料资料，对齐PC物料管理）+ 成品（成品仓储/库位扫码，对齐PC成品管理）

* [x] "个人"组→"系统"组（用户审批/意见反馈是管理功能，对齐PC系统设置语义）

* [x] home/index.js 与 more-apps/index.js 两份 ALL\_APPS 同步改；收藏/菜单权限按应用id存储，移组不受影响

* [x] 分组由6→7（开发/生产/物料/成品/财务/系统/其他）；三副本同步；node --check+QA 全过

### 2026-08-27 D-167 裁剪管理码数矩阵防重叠 ✅

* [x] sku-matrix compact 模式根因：flex:1+min-width:0 列可无限压缩，"XS/155"类长标签码数一多互相叠压成乱码

* [x] 改横向滚动表格：列 flex 不收缩+最小 88rpx，码数少时均分铺满、多时横滑不重叠；灰底表头+行发丝线+数字等宽

* [x] 数量明细卡：床次/操作人/编菲时间三行归入灰底圆角面板，与矩阵表格清晰分区

* [ ] 待真机验收：扫码确认页"下单明细"同组件同步受益

### 2026-08-26 D-166 顶部筛选标签统一32px ✅（已推送 ef733f3a0）

* [x] 样衣开发状态标签22px/10px字→32px/13px+边框；外发管理28px/12px→32px/13px

* [x] 全站盘点：采购/退货/瑕疵/生产管理等其余页面已是32px标准，无需动

### 2026-08-26 D-165 全站图片全景显示 ✅（已推送 1b47aa57d）

* [x] 49处商品/款式/物料/凭证图 aspectFill→aspectFit（完整显示+两侧留白）

* [x] 头像3处保留圆形裁剪（行业惯例）

### 2026-08-26 D-164 样衣任务数量模式+裁剪分类对齐 ✅（已推送 6c02f0f1e，需重启后端）

* [x] 样衣扫码累计报工护栏：同钥匙(工序名优先/否则操作类型)已报+本次>任务数量拒绝并提示剩余可报；撤销扫码释放额度；PC/小程序同端点都覆盖

* [x] 小程序确认页：数量限剩余可报+显示'已报X/任务Y·可报Z'

* [x] 裁剪管理订单分类对齐PC任务三态(cuttingTask.status pending/received/bundled)

* [ ] 待真机验收：多件样衣多人分批报工到任务数即拦截；裁剪三段与PC一致

### 2026-08-26 D-163 裁剪三段判定修正 ✅（已推送 056a730e2）

* [x] 裁剪中=已编菲且cuttingEndTime为空；已完成=cuttingEndTime已回填或订单已过裁剪工序

* [x] 修D-162把已编菲订单全归裁剪中的过度归类（用户指出：裁剪完成的应该是已完成）

### 2026-08-26 D-162 小云待办同款合并+待裁剪分类 ✅（已推送 4ca7b20ee）

* [x] 小云待办采购：分组键补styleNo兜底（样衣行无orderNo/patternProductionId时同款里料/主面料/口袋布各一条）→同款合并一条

* [x] 裁剪管理待裁剪分类：已生成菲号(扎数>0)归裁剪中，不再因泛化production/in\_progress状态永远显示待裁剪

### 2026-08-26 D-161 待采购僵尸行+裁剪领取归位 ✅（已推送 85619f9a8，需重启后端）

* [x] 待采购数据bug根因：样衣采购回料确认只设returnConfirmed=1（回料数量0时状态仍PENDING），
  getMyTasks无主分支不查该字段→回料确认完永远显示待采购；补两道过滤（returnConfirmed排除+样衣生产已完成/作废排除）

* [x] 撤独立裁剪任务页（D-160），领取动作并入裁剪管理页：无订单参数进入时顶部待领取横条，领取后直接进该订单编菲

* [ ] 部署验证：手机端待采购列表不再出现已完成样衣；裁剪管理页顶部可领取

### 2026-08-26 D-160 手机端裁剪任务领取 ✅（已推送 c158aed7e）

* [x] 新增裁剪任务页：我的任务列表(全部/待领取/已领取)+领取动作(cutting-task/receive)

* [x] 已领取任务'去编菲'跳裁剪管理页复用其现有按扎自动分扎（不重复实现编菲表单）

* [x] 首页工作台新增'裁剪任务'入口

* [ ] 待真机验收：领取→编菲→菲号出现在裁剪管理页

### 2026-08-26 D-159 料卷扫码补操作日志 ✅（已推送 d1acb9f4b）

* [x] 料卷发料/退回原来只有slf4j无操作留痕→接recordOperation写t\_operation\_log

* [x] 扫码能力矩阵盘点：物料出库(发料)/退回入库/到货登记✓；成品入库=质检流程✓、出库=出货扫码✓；裁剪页查看为主；采购页当前页扫码匹配✓

### 2026-08-26 D-158 样衣开发页扫码闭环 ✅（已推送 3bac8ceae）

* [x] 详情页新增'工序扫码'按钮：复用PatternScanProcessor流水线→跳确认页→executeScan(SAMPLE)后端委派

* [x] 两个扫码入口（主扫码页/样衣开发页→详情页）逻辑闭环

### 2026-08-26 D-157 样衣扫码"未匹配到菲号"根治 ✅（已推送 bf4e48c1d，需重启后端）

* [x] 根因：/scan/execute按scanType分发，样衣工序scanType=quality/warehouse的环节进大货菲号查询（仅production入口有SAMPLE路由）→三入口统一isSampleScanContext委派样板链路

* [x] 样衣扫码页"菲号信息"→"数量信息"；未配置开发工序的款显示默认流程提示条

* [ ] 待真机验收：样衣QR扫码→按工序领取全流程；无配置款显示提示

### 2026-08-26 D-156 质检/样衣码/仓库选择三修 ✅（已推送 cf3fa993d）

* [x] 质检入库页恢复'详情'入口（navigateToInspect在钩子未接UI，抽屉化时丢了）

* [x] 样衣QR难扫根因：72/80px屏显+45字符JSON→140px+纠错M（展开区+阶段抽屉）

* [x] 小程序质检选仓库：26px小chip→3列网格40px触控

* [ ] 待验收：手机扫屏上/打印的样衣QR；质检入库操作列出现'详情'；小程序选仓库好点

### 2026-08-26 D-155 洗水唛偏移可调+条码批量打印 ✅（已推送 8f5613a9f）

* [x] 款式洗水唛Tab距剪口偏移写死30mm→可调（生产端弹窗本就走共享面板可调）

* [x] 条码打印支持多尺码批量（全选/仅当前/点选），一次打完整色所有码

* [x] 顺带修复：跳码区抽屉size属性传数字被antd忽略致378px（D-154, a0bf11ec2）

### 2026-08-26 D-153 供应商三连修 ✅（已推送 c84329a5e，需重启后端+Flyway迁移）

* [x] 供应商删除400：后端强制操作原因留痕而前端没传→弹窗收集删除原因+透出后端错误

* [x] 供应商标签：Factory.supplierTag(V202608260001)+维护弹窗下拉+列表/下拉显示——区分外发工厂/布行

* [x] BOM库存检查误判：用量未填需求=0，0>=0误判充足→新增no\_usage'未填用量'(check-stock+stock-summary两处)

* [ ] 部署验证：删除供应商填原因成功；新物料检查显示'未填用量'

### 2026-08-26 D-152 左右布局左侧目录统一组件 ✅（已推送 95589169d）

* [x] 新建全局组件 components/common/SideCardPanel：岗位管理卡片式标准（头部/卡片条目/灰字指标/悬停操作/选中徽标/树形展开）

* [x] 四页接入：岗位管理（标准出处重构）、人员管理部门树、组织架构树、合作方工厂树；删废弃TreeItem.tsx

* [x] 盘点结论：弹窗内无真左目录布局；今后左右布局页面/弹窗统一用此组件

### 2026-08-26 D-151 组织架构左树+个人中心分区 ✅（已推送 abf58b88b）

* [x] 组织架构左树：节点彩色标签堆(人数/子部门/审批人3个Tag挤220px)→两行结构（名称行+灰字指标行），面板加宽240px

* [x] 个人中心：用户信息/修改密码/工厂信息裸div→标准Card分区；头像主题卡误用filter-card→标准Card；网格间距统一

* [ ] 待用户验收两页观感

### 2026-08-26 D-150 岗位权限界面优化+人员管理内联编辑 ✅（已推送 e32130387）

* [x] 岗位管理：修权限矩阵文字重叠（根因：前缀固定92px绝对定位，长前缀压复选框→改弹性排布）；数据权限栏收窄230px、菜单权限占满；复选框14px+点击区加高

* [x] 人员管理：部门列内联下拉（树拍平缩进）、岗位列点击编辑，PUT部分更新+操作留痕（与快速切角色同模式，后端null保留原值已核实）

* [ ] 待用户验收：岗位管理重叠消失/比例合适；人员表直接调部门岗位

### 2026-08-26 D-149 用户审批页归标准+Alert无效API修复 ✅（已推送 700aeaaf8）

* [x] 审计结论：人员管理/岗位管理两页结构与样式已符合标准（分栏容器6px=全局antd标准，不动）；用户表格列/岗位面板/权限矩阵质量良好

* [x] 用户审批页：旧Card骨架→PageLayout；修两处<Alert title>无效API（文字从未显示过）

* [x] 小程序收尾批：11页卡片边距归一

* [ ] 待续：其余系统页（字典/日志/组织树/合作方）按同标准巡检

### 2026-08-26 D-147 详情页整洁第三批 ✅（已推送 90303eca6）

* [x] 八个详情页（样衣/采购/订单/成品库存/发货/退货/裁剪菲号/质检）卡片边距归一14px，订单详情卡内线改发丝色

* [ ] 待用户开发者工具验收；后续按需继续：剩余列表页/设置类页面

### 2026-08-26 D-146 手机端整洁第二批 ✅（已推送 c388ad84f）

* [x] 工作台考勤卡重排三行（标题/三格时间区/按钮行36px档），全页卡距统一

* [x] 共享order-card.wxss修正（边距14px/发丝线/按钮圆角统一）——采购列表等复用页同步受益

* [x] 扫码确认页卡距统一

* [ ] 第三批：详情页（样衣/采购/订单）结构整治，待用户验收本批

### 2026-08-26 D-145续 小程序历史改版检查点入库+全量令牌化 ✅（已推送 309476067）

* [x] 核实：工作区2.5万行=7月未提交的界面改版（最后小程序提交停在6/9 v1.3.0），用户实际使用一个月的就是这套代码；四项核实全过（JS语法/页面注册/组件引用/括号配对）后入库推送

* [x] 72个wxss全量字号收编tokens（渲染值不变）；25文件按钮高度归一四档（28/36/44/50）

* [ ] 待续批次：详情页/工作台/扫码确认/采购列表按整洁层工具类逐页结构整治

### 2026-08-26 D-145 手机端整洁化第一批 ✅（已推送 ebd2e96bc）

* [x] 样衣防重复领取服务端兜底；工序选项"第一个未领取"逻辑核实已存在

* [x] 样衣开发卡整治+app.wxss整洁层工具类

* [ ] 待续：工作台/采购/订单/扫码页逐批套用（每批用户验收）

### 2026-08-26 D-144 拆菲全链路审查+加固 ✅（已推送 091a36579）

* [x] 审查：拆菲模型与用户规则一致（当前工序拆分/后续工序原菲原数量/工资随跟踪转移/防护与撤销完整）

* [x] 修：completed子菲操作人保留原工人A；requestSplit防重复PENDING

* [ ] 待真机回归：拆菲→B确认→双方扫码→下工序扫原菲号

### 2026-08-26 D-143 裁剪菲号补全 ✅（已推送 759682e9b）

* [x] 生成扎时写入菲号=床号-扎号（大货+样衣两链路）；前端列改名菲号+存量兜底

* [ ] 重启后端后新裁剪订单菲号落库；存量订单靠前端兜底显示

### 2026-08-26 D-142 财务总览营收口径对齐+趋势图线条化 ✅（已推送 ec485305e，待重启后端验收）

* [x] 总营收/按月趋势三处口径对齐F-2（创建即计），顶部卡与现金流图数字一致

* [x] 现金流趋势黑柱→5条平滑线渐变面积；按月趋势CSS叠条→ECharts双线；饼图SVG黑色修复

* [ ] 待重启后端验证营收数字与图表一致性

### 2026-08-26 D-141 手机端僵尸待采购根治+订单详情图片轮播全局化 ✅（已推送 8cb871252，待真机验收）

* [x] getMyTasks 无主待领取行按订单有效性过滤（僵尸待采购根治）；已回料确认行禁编辑/删除兜底

* [x] bellTaskLoader iOS new Date 空格格式转 T（两处）

* [x] 全局 ImageCarousel 组件：箭头常显+遮罩禁指针事件，根治悬停按钮消失/闪烁；订单详情接入

* [x] 订单详情布局：图片列 340→240，中间颜色尺码商品编码区加权 1.7，矩阵列宽/字号调大

* [ ] 待真机验证：手机端采购列表干净、详情不空白、小云待办同步；订单详情悬停不闪

### 2026-08-26 D-140 仪表盘视觉层级重排+专业性展示补齐 ✅（tsc/build 全过，待浏览器验收）

* [x] 接入三个闲置后端接口：交期预警/品质统计/延期环节 → 新增 DeliveryAlertCard、QualityStatsCard、ProductionBottleneckCard 三卡（专业指标区一行三列）

* [x] TopStats 层级重排：26px 大数字主视觉+中性色统一，日/周/月/年降为次级信息

* [x] 布局重排：趋势双图并排等高；延期表(2fr)+右列(最近动态/快捷入口叠放,动态卡内部滚动对齐底边)；间距统一 20px；antd 卡头加左竖线与自定义卡头统一

* [x] 修 ECharts canvas CSS 变量颜色 bug 5 处；修 QuickEntry 设置空白按钮

* [x] 删死样式约 300 行 + 零引用的模块根 styles.css；动效收敛（去 rotateZ/scale/光泽扫过）

* [ ] 待用户浏览器验收：三张新卡数据正确性与整体观感

### 2026-08-25 D-136 工厂结算差额滚存+回写修复 ✅（tsc/mvn/flyway 全过，待部署验证）

* [x] 修订单结算付款回写ID错位（bizId=工厂ID vs settlementId=订单ID）——付款后订单正确变 paid，杜绝下月重复推送重复付款

* [x] t\_deduction\_item 加 settle\_flag（V202608250005）；create-payable 接收 deductionIds 标记已抵扣

* [x] 工厂汇总：只算未抵扣扣款；已付订单的未抵扣扣款作为\[上期结转]并入同厂清单（滚存）；返回抵扣明细清单

* [x] 终审弹窗改抵扣清单勾选（取消勾选=本期不抵扣自动滚存），金额随勾选联动可微调

* [ ] 部署后验证：付款→订单变paid→下月汇总不再含该批订单；扣款>加工费差额下月清单带\[上期结转]出现

### 2026-08-25 D-133\~D-135 收款与扣补款三连修 ✅（已提交 e39e4c51d，迁移已应用）

* [x] D-133 面料费方案A：统一扣款抵扣；砍领料台账应收推送（audit+finance-settle EXTERNAL分支）与物料出库推PAYABLE（第三套）；V202608250004 作废遗留PENDING账单

* [x] D-134 扣补款进终审推送：factorySummary 聚合扣/补/净额；终审弹窗明细+可编辑金额（默认净额）；批量按净额

* [x] D-135 客户收款统一应收账本：confirmPayment 三级兜底（出库应收→对账单应收→现建应收）后核销，账外收款孤岛消灭

* [x] EC电商链路核实完整可用，未动

* [ ] 部署后验证：面料出库→扣款→终审金额=加工费−扣款+补款；客户收款后应收账单 SETTLING/SETTLED；领料审核不再产生应收账单

### 2026-08-25 D-132 外发应付砍双轨 ✅（已提交 ebbe2bea3，迁移已应用）

* [x] 留成品结算轨，砍出货对账单的应付推送（三处）；对账单保留扣款载体+销售应收；V202608250003 作废遗留PENDING重复账单（已应用）

### 2026-08-25 D-127\~D-131 财务链路P0修复包 ✅（已提交 5a35103b6，迁移已验证应用）

* [x] D-127 次品扣款改手动：拆自动扣款死代码（传零成本从未生效）+成品结算审核时次品提醒（不阻断）

* [x] D-128 外发结算统一订单锁定单价：视图 V202608250002 改取 factory\_unit\_price+外发应付交易对手改工厂（两处）

* [x] D-129 采购金额统一 采购数×单价：建单/编辑/回料三处（新单落库 0 元根治）

* [x] D-130 出库类型对齐：后端兼容 outboundType 键+旧值规范化（报废/调拨不再误记销售）

* [x] D-131 工资终审推送统一：finalize-for-operator（生成→审核→确认账单）；删 3 个死按钮+2 个死弹窗+假驳回；includeSettled 默认 false

* [ ] 部署后验证：终审推送→收付款中心→付款回写全链路；外发结算金额=订单锁定单价×合格入库数

### 2026-08-25 D-126 供应商准入闭环补全 ✅（已提交 d7c7ee208）

* [x] AdmissionAuditModal 审核弹窗；RowActions 入口仅 isAdmin 可见

* [x] 统计口径修正：空状态计已准入；V202608250001 回填老数据 approved（已验证应用）

* [x] cloudflared 安装完成；隧道被本机代理 TUN 模式 fake-ip 阻断，待用户侧恢复后重启 dev-public.sh

* [ ] 待线上验证：待审核行出现"准入审核"，审核后统计卡与表格一致

### 2026-08-25 财务四链路全面审查 ✅（4 探索代理，报告已交用户）

* [x] 内部工资/外发结算/物料采购/成品次品四链路问题清单齐备（高严重度 13 项）

* [x] P0 五项已落地（D-127\~D-131）；P1 双轨收敛（外发出货对账单 vs 成品结算并存）待后续

### 2026-08-25 D-125 图片预览左右切换全局下沉 ✅（tsc/eslint 全过，待部署）

* [x] StyleCoverThumb 页内多图预览替代新窗口；全系统生效

* [ ] 部署后验证切换效果

### 2026-08-25 D-124 回料确认后编辑锁定 ✅（tsc/eslint 全过，待部署）

* [x] 样衣明细页行级+工具栏编辑锁定对齐大货规则

* [ ] 部署后验证；后端兜底校验列入待办

### 2026-08-25 D-123 无资料下单矩阵化+菜单名 ✅（tsc/eslint 全过，待部署）

* [x] OrderLinesCard 对齐正常下单矩阵交互；菜单名改资料维护

* [ ] 部署后验证矩阵交互

### 2026-08-25 D-122 采购单条/批量联动修复 ✅（tsc/eslint 全过，待部署）

* [x] 样衣明细页行级+批量级判定源统一；大货/列表页核实无此问题

* [ ] 部署后验证联动效果

### 2026-08-25 D-121 交互简化三连 ✅（tsc/eslint 全过，待部署）

* [x] 入库物料搜索选择/员工菜单拍平/客户来源字典化

* [ ] 部署后验证三处交互

### 2026-08-25 D-120 预算天数联动根治+采购操作列回调 ✅（tsc/eslint 全过，待部署）

* [x] BudgetDaysEditor 本地覆盖即时重算+系统广播；采购两表撤销悬停显现；到货入库弹窗统一 ResizableModal

* [ ] 部署后验证：调预算天数立即变化

### 2026-08-25 D-119 采购一致性+手机端已完成筛选 ✅（mvn/tsc/eslint 全过，待部署）

* [x] getMyTasks(includeCompleted) 重载+Controller 参数+小程序传参（三副本同步）

* [x] 大货 Drawer 批量按钮集成下拉；列表页操作列 revealOnHover

* [ ] 部署后验证：手机端"已完成"Tab 有数据

### 2026-08-25 D-118 批量动作集成+菜单命名 ✅（tsc/eslint 全过，待部署）

* [x] 采购工具栏批量三按钮集成悬停下拉；菜单命名直白化 8 处

* [ ] 部署后验证：批量操作下拉与菜单新命名

### 2026-08-25 D-117 操作列悬停显现+终态置灰 ✅（tsc/eslint 全过，待部署）

* [x] RowActions revealOnHover 模式 + 三表启用 + 停用/取消行按钮置灰禁用

* [ ] 部署后验证：悬停显现效果与置灰状态

### 2026-08-25 D-116 术语残留清理+状态色统一 ✅（tsc/eslint 全过，待部署）

* [x] SKU/BOM 用户可见残留 20 处清理（3 处刻意保留）+ "已完成"状态色 3 处统一 success

* [ ] 部署后验证：文案与状态色（见 activeContext 2026-08-25）

### 2026-08-25 D-115 样衣工序状态联动三连修 ✅（tsc/eslint 全过，待部署）

* [x] 行状态改 sub.completed + 手动完成行级 processName + 阶段兜底门控 + 撤回精确匹配 + 抽屉全链刷新

* [ ] 部署后验证：指派后状态立变、单行完成只点亮该行、撤回删对记录

### 2026-08-24 D-114 小云任务点击直达详情页 ✅（mvn compile 通过，待部署）

* [x] 7 类任务 deepLink 从模块列表页改为精确业务路由（三个 Collector 同步+URL编码）

* [ ] 部署后验证：待办面板点击直达；遗留：落地页消费 query 自动定位列入优化清单

### 2026-08-24 D-113 列表页扫码修复 + 打印三项优化 ✅（tsc/eslint/node --check 全过，待部署）

* [x] 样衣列表页扫码三级匹配：pattern QR 直跳详情 / 本地列表 / 后端 keyword 兜底（根因：原只本地匹配，而资料单 QR 仅含 pattern id）

* [x] 打印 BOM 表加成分列（fabricComposition）

* [x] 打印基本信息值单元格长文本自动换行（去 nowrap+ellipsis）

* [x] 样衣生产工序列 SKU→商品编码，完整格式 款号-颜色-尺码

* [x] 核实打印基本信息区块多选功能完整生效（无需改）

* [ ] 部署后验证：扫码直进详情、成分列、长文本换行、完整商品编码

### 2026-08-24 D-112 样衣扫码领取根治 + 扫码AI英文根治 ✅（mvn compile+单测全过，待部署）

* [x] 样衣扫码委派 submitScan 规范链路：领取写 t\_scan\_record 计件+置 IN\_PROGRESS+回填领取人；多色多码分支补齐被丢弃的 sourceBizType 等字段

* [x] 详情页「领取样衣」按钮从无 receive case 的 workflow-action 改走 submitPatternScan(RECEIVE)

* [x] handleReceive 防他人重复领取守卫（"已由XX领取"），本人幂等

* [x] 扫码AI提示英文三层防御：prompt中文约束 + chineseRatio 生成侧校验降级 + 读取侧过滤存量脏数据

* [x] 发现并记录：backend/src/test/ 整目录被 .gitignore，仅12文件跟踪；本地坏测试文件与 CI 无关

* [ ] 部署后验证：样衣扫码领取状态流转+AI提示全中文（见 activeContext 2026-08-24）

### 2026-08-24 D-111 四连修复 ✅（tsc/eslint/mvn compile 全过，待部署）

* [x] 纸样开发尺寸表尺码语义去重：S(160/76)/S(160/76A) 自动取重保留开发码写法，前端 7 处入口 + 后端模板 merge 查重；保存链路自动清理 DB 脏行

* [x] 各码实际用量与尺寸表列头随去重对齐（同归一化规则）

* [x] 物料出入库停用/启用（复用物料主数据 disabled 接口）+ 启用状态筛选 + 已停用标签

* [x] 删除废弃"打印出库单"按钮（正式出库/领料确认流程本就自动打印）

* [x] 库位出库抽屉客户信息关联客户管理（CustomerSelect 联动带出电话/地址）

* [x] 小程序 SKU 术语扫描收尾：用户可见文案零残留，D-073 关闭

* [ ] 部署后验证：四项功能端到端（见 activeContext 2026-08-24）

### 2026-08-22 订单详情布局规整 + 工序跟踪筛选精确匹配 + 订单管理入库弹窗只读 ✅（已推送 1a576d345）

* [x] 订单详情顶部四栏分区排版（Descriptions bordered + SectionTitle），对齐样衣详情页风格

* [x] 订单图片计数统一"共 X 张（含封面/款式图）"，消除 (0/5)共2张 矛盾

* [x] 工序跟踪：点具体工序子节点（剪线）只显示该工序记录（stripProcessSeqPrefix 归一化 + isSpecificProcessName 优先匹配）

* [x] 订单管理入库弹窗只读：InspectionDetail 新增 readOnly 模式，隐藏全部操作面板，仅展示入库进度+质检记录；操作入口保留在成品仓质检入库

* [x] tsc --noEmit 0 errors + safe-push 全过（9 文件 +245/-156）

* [ ] 部署后验证：订单详情顶部布局四栏清晰、点剪线只出剪线、订单管理入库弹窗无操作按钮、成品仓质检入库操作不受影响

### 2026-08-20 样衣详情基础信息 6 项老大难 UI/功能修复 ✅（tsc 0 错误 + mvn compile 通过，待部署）

* [x] 新建 StaffSelect 通用选人组件：设计师/跟单员可选租户用户（超管走 /system/user/list，租户走 listSubAccounts，失败兜底当前登录人）

* [x] 商品主题→商品品牌更名（表单/打印/类型注释三处，dictType 保持 style\_theme 兼容）

* [x] 后端 DictOrchestrator create/update/delete/autoCollect 加 @CacheEvict("dict")，根治"维护显示成功但看不到新词条"

* [x] 备注输入框支持拖拽（去 autoSize + resize:vertical）

* [x] 颜色/码数标签蓝色文字（var(--color-primary) + 淡蓝底）

* [x] 全系统图片完整显示（global.css 规则 16c：img object-fit contain !important，豁免头像/.img-cover）

* [x] 款式特征 AI 识别断链双修复（collectExtValues 合并表单 extJson 嵌套值 + useStyleDetail 以对象形式 setFieldsValue）

* [ ] 部署后端到端验证：跟单员/设计师下拉选人、品牌维护后立即可见、备注拖拽、AI 识别特征保存后刷新不丢、图片完整显示

### 2026-08-17 组织架构页"本厂/外协工厂"节点彻底剔除 ✅（D-105）

* [x] filterInternalNodes 递归剔除 nodeType=FACTORY + ownerType=EXTERNAL（替换只看 ownerType 的旧过滤器）

* [x] 工厂账号保留 filterTreeByFactory 本厂子树，租户账号纯内部部门视图

* [x] 部门下拉/成员统计/KPI 总人数全部对齐可见树口径

* [x] tsc 0 错误，后端零改动

* [ ] 部署后验证：租户账号树中无"本厂"及外协工厂节点，KPI 不含工厂成员；工厂账号视图正常

### 2026-08-16 批量采购弹窗"信息缺失+数量只读"双链路根治 ✅（D-104，已推送 72f674109）

* [x] 新建 BatchPurchaseModal（物料编码/规格/单价/供应商全列 + 采购数量 InputNumber 可编辑 + 合计金额）

* [x] MaterialPurchaseDetail 批量采购换用新弹窗（样衣抽屉+大货订单详情共用）

* [x] MaterialPurchase 主页样衣/大货两个"确认采购全部"Modal.confirm 信息补全+数量可编辑

* [x] 后端 receive 接口支持可选 quantity（编辑数量先更新再领取，D-104）

* [x] 双端编译验证：tsc 0 错误 + mvn compile EXIT=0

* [ ] 部署后端到端验证：样衣采购管理→批量采购→弹窗显示编码/规格/单价/供应商→改数量→确认→列表数量更新

### 2026-08-16 警告根治：-Xlint 固化 + 全量清零 ✅（D-103+D-102，已推送 85ee789d6）

* [x] pom.xml 固化 -Xlint:all（排除 unchecked/serial/this-escape/processing/classfile）

* [x] 清零 99+26 条 javac 存量警告（deprecation/static/lossy/raw/varargs/try/死代码，44 文件）

* [x] 三重验证：javac 警告 0 + mvn compile EXIT=0 + Java LS 诊断 0

* [x] 详见 decisionLog D-103

### 2026-08-16 六文件 IDE 警告批量清理 ✅（D-102，未提交）

* [x] 5 处未使用 @Autowired 字段删除（FinanceOrchestration/ProcessTracking/PurchaseCart/CuttingTask/Serial）

* [x] StyleStageCompletionHelper 死代码链整链删除（4 方法+2 字段+5 import）

* [x] selectBatchIds→selectByIds；Jackson List.class→TypeReference

* [x] mvn compile EXIT=0、6 文件 LS 诊断清零

### 2026-08-16 四文件 IDE 警告清理 ✅（D-099/D-100 死代码残留，未提交）

* [x] MaterialPickingController：删 2 冗余 import + 3 未用字段 + 2 死方法（D-099 残留）

* [x] MaterialColorCardOrchestrator：删重复 import + cosService 字段（D-100 残留）

* [x] MaterialPurchaseOrchestrator：trimWhitespace 弃用 → id.trim()

* [x] ProductSkuServiceImpl：2 处 unchecked cast 加 @SuppressWarnings

* [x] mvn compile 通过、lint 清零；待提交

* [x] D-101 小程序同步确认：后端统一广播对小程序自动生效（WS→ORDER\_PROGRESS\_CHANGED 三页已订阅）；h5-web 副本一致；PC 轮询改动为 frontend 独有

* [x] 全量清理 151 条 import 类 checkstyle 警告（脚本批量删除+防御校验，validate 归零、编译通过零误删）+ PurchaseCartOrchestrator objectMapper→OBJECT\_MAPPER

### 2026-08-16 进度球 10 多分钟不更新修复 ✅（D-101，P0，ccb9c63a0）

* [x] 根因：WebSocket 进度广播只在扫码链路，15+ 非扫码写路径（入库/回退/采购同步/手动推进/裁剪扎号）只更新 DB 不广播 → 前端等 5 分钟轮询（切页暂停）+30 分钟一致性 Job 兜底

* [x] 修复：ProductionOrderProgressRecomputeService 重算持久化后统一广播（有变化才推，防风暴）；useOrderSync 兜底轮询 5min→1min

* [ ] 部署后端到端验证：双端打开页面，一端操作入库/手动推进，另一端进度球秒级刷新

### 2026-08-16 色卡本重复入口下线 + 供应商名不显示修复 ✅（D-100，P0）

* [x] 供应商色卡三连 bug：supplierName 未注册表单字段（保存丢失→卡片"供应商: -"）、option 字段名 contactPerson→supplierContactPerson（选中后联系人被清空）、supplierId 塞名字

* [x] 「色卡本」重复入口整体下线：前端删 pages/ColorCard 11 文件+菜单+权限映射+路由重定向；后端删旧 ColorCard 6 文件（t\_color\_card 表保留）

* [x] 新增 `GET /material-color-card/by-material/{materialId}`；物料列表"查看色卡"迁移到新表（原来查旧表 t\_color\_card 永远对不上用户在供应商色卡视图改的数据）

* [x] 验证：tsc 0 错误、mvn compile 通过、旧 API/旧类引用全局 0 残留

* [ ] 存量旧色卡 supplierName=null 需编辑补选一次供应商保存

* [ ] 部署后端到端验证：物料列表查看色卡 + 编辑色卡供应商名回显/保存/显示

### 2026-08-16 内部领料"领取即出库" ✅（D-099，P0）

* [x] 根因：/pending 只建单不扣库存（无限领取/通知挂着/库存死数据），仓库扣减 SQL 本身无误

* [x] MaterialPurchaseOrchestrator.createPickingAndOutbound（同事务建单+确认出库）

* [x] Controller 分流：INTERNAL 领取即出库（库存不足回滚报错）；EXTERNAL 保留审核流（账单联动）

* [x] 前端成功文案区分内外部；tsc 0 错误；后端编译通过

* [ ] 存量挂着的 INTERNAL 待出库单待用户逐张处理（不自动清，账实风险）

* [ ] 部署后端到端验证：领料→库存立减→出库日志+操作人→无新通知

### 2026-08-16 打印弹窗修复（勾选互踩 + 分组错位 + QR 顶部对齐）✅（D-098 补充）

* [x] 主勾选组 onChange 误清空 5 个子区块（value 混入子区块 key + 全量重建）→ 只过滤主项 + ...options 保留

* [x] 基本信息子区块分组重排：客户信息真正含客户/供应商；版次信息=板类+打板人员+三价；面料成分/是否套里归备注信息

* [x] 新增打印头部行：标题+款号款名在左、QR 同行右上角对齐（原 QR 在表格上方独立占行）

* [x] 验证：tsc 0 错误；待用户打印预览确认

### 2026-08-16 基础信息表单治理 + SKU 排序/拖拽 ✅（D-098）

* [x] 设计师改内部人员搜索选择（超管 user/list，租户管理员 listSubAccounts），弃字典维护

* [x] 款名称改纯文本输入，弃字典维护

* [x] 未解锁编辑时隐藏全部维护入口（5 处 Hint + 商品类型齿轮，包 !editLocked）

* [x] "虚拟分类"全局改名"季节分类"（5 文件，season 字段不动）

* [x] SKU 码数从小到大语义排序（getSizeSortValue：字母码/数字码/定制码分级）

* [x] SKU 行拖拽排序（把手 HTML5 DnD，编辑态可用，保存固化 sortOrder）

* [x] 后端 sort\_order 全链路（V202708161300 迁移 + 实体 + 列定义 + 查询排序 + 批量更新持久化）

* [x] 验证：tsc 0 错误、文案 0 残留；**未本地启动验证（≥5 文件，待部署后端到端验证）**

* [ ] 待办：commit+push 后部署验证（新建款全流程：款名称/设计师/季节分类→SKU 排序/拖拽→保存→刷新顺序保持）

### 2026-08-16 部署失败根因修复（Qdrant→health 503→HEALTHCHECK 误判）✅（D-097，P0）

* [x] 诊断：线上实测 /actuator/health=503 DOWN、/actuator/health/readiness=200；结合日志时间线（17:11:12 启动+300s start-period+3×30s≈17:19:00 被停）锁定 HEALTHCHECK 误判

* [x] AiComponentHealthIndicator：任一 AI 组件 DOWN → 整体返回 DEGRADED（AI 为可选增强，不拖垮主 health）

* [x] application.yml：http-mapping DEGRADED→200 + status.order

* [x] backend/Dockerfile：HEALTHCHECK 改探 readiness 组；TCP 兜底显式 /bin/bash（原 dash 下 /dev/tcp 从未生效）

* [ ] 待办：重新部署生产，验证部署成功 + V202708161100/V202708161200 迁移执行 + 关单工资单恢复

* [ ] 待办：决策 Qdrant 恢复或下线（清空 QDRANT\_URL）

### 2026-08-16 员工计件工资条打印标准化重构 ✅（D-094）

* [x] WageSlipPrintModal.tsx 整体重写：单表扁平结构（标题/信息/表头/明细/合计/大写/签字行）

* [x] 简版改为按订单号+款号聚合表格；合计统一用后端数字；结算周期空值显示"全部记录"

* [x] 新增人民币大写 toChineseAmount；完成日期 YYYY-MM-DD；修复存量错误 import（@/utils/AuthContext）

* [x] 验证：tsc 0 错误 ✓ eslint 0 错误 ✓

* [ ] 待办：用户在工资结算页验证明细版/简版排版与多人打印分页

### 2026-08-16 SKC商品编码Tab统一编辑入口 ✅（D-093）

* [x] canEditAttrs: true → isEditing（未点编辑全只读）；编辑按钮全模式可见；删除自动模式独立「保存修改」按钮

* [x] 底部提示按模式动态渲染；列头 Tooltip/模式说明/SKC Tooltip 同步更新（3 文件：useStyleSkuTabData.ts / index.tsx / SkuTable.tsx）

* [x] 验证：tsc 0 错误 ✓ vite build 39.45s ✓

* [ ] 待办：用户 5174 验证编辑入口与提示文案（未点编辑无输入框/点编辑后按模式放开/提示随模式变化）

### 2026-08-16 保存400诊断 + 商品下单改名 + 款式停用启用 + 商品类型字典化 + 闪烁修复 ✅（D-092）

* [x] 400 诊断：本地链路无 400 源，根因=部署环境旧构建（需重新部署，见 activeContext 待办）

* [x] 下单管理→商品下单改名 13 处（日志筛选 value 保留兼容历史）

* [x] 款式停用/启用：后端 PUT /style/info/{id}/status + statusFilter 筛选 + 前端状态列/启停/筛选下拉 + 下单拦截闭环

* [x] 商品类型字典化：DictAutoComplete + fallbackOptions + Flyway V202708161000 值中文化迁移

* [x] OrderRankingDashboard 60s 轮询防闪（静默刷新）

* [ ] 待办：重新部署 [www.webyszl.cn](http://www.webyszl.cn) 后端+前端（Flyway 自动跑 V202708161000），验证 4 项：保存不 400/停用启用筛选/商品类型维护/闪烁消失

### 2026-08-16 全输入框字典维护 + 码数自动排序/拖动 ✅（D-091）

* [x] DictAutoComplete 内置 suffix 维护齿轮+DictQuickManageModal，全系统约 40 处字典输入框一次全生效（enableQuickManage 默认 true）

* [x] StyleColorSizeTable：addSize 按 getSizeWeight 自动插入正确位置（小→大，不打乱已拖过的顺序）；码数/颜色 Tag 原生拖动排序（矩阵列/行同步重排）

* [ ] 待办：用户 5174 验证齿轮维护+码数自动归位+拖动；验证通过后与 D-086\~D-090 一起提交

### 2026-08-16 字段旁"维护"弹窗化 ✅（D-090）

* [x] DictQuickManageModal（字典词条增删改名）+ dataEvents 广播 + 4 组件订阅刷新 + BasicInfoSection 7 字段挂载（含客户/供应商就地新建）

* [ ] 待办：用户 5174 验证各字段"维护"弹窗与下拉即时刷新

### 2026-08-16 图片资产并入基础信息区 + 展示URL附token ✅（D-089）

* [x] CoverImageUpload 嵌入式竖排（主图180px）→ BasicInfoSection coverSlot 左栏合并；顶部独立图片条移除

* [x] displayImages 展示 URL 统一附 token（getFullAuthedFileUrl）兜底 tenant-download 401

* [ ] 待办：用户 5174 验证；**[www.webyszl.cn](http://www.webyszl.cn)** **需重新部署前后端**（旧构建无 401 兜底+旧后端无白名单）

### 2026-08-16 生产制单 Tab 移除无关操作日志 ✅（D-088）

* [x] 移除 StyleProductionTab 的 OperationLogSection 引用（日志表无 production 类型，全量款式日志与本 Tab 无关）；组件文件保留待挪 BOM Tab

* [ ] 待办：用户浏览器验证；如需 BOM 日志展示，将 OperationLogSection 挪至 BOM Tab 并加 bizType 过滤

### 2026-08-16 "图片资产没移上去"环境诊断 ✅（D-087）

* [x] 定性：D-086 布局重构代码完好（tsc 0 错误）但未提交；用户访问的 5173 是凌晨旧 Vite 进程（HMR 失效）→ 看到旧布局

* [x] 新 dev server 已起在 **5174**（新代码）；用户拒绝杀 5173 旧进程，双端口并存

* [ ] **待办**：用户在 5174（或重启后的 5173）验证新布局 → 通过后提交 D-086 全部工作区改动（6 文件）

### 2026-08-16 详情页图片资产条/颜色图片行式/尺码排序/预览增强 ✅

* [x] 图片资产移基础信息上方紧凑横条（主图96px+缩略图40px横排+上传/识别/搜相似按钮行）

* [x] 状态卡改单行摘要条（操作人动态Tooltip+时间信息Popover收纳）

* [x] 颜色图片管理改一行一颜色Table（行内上传/更换/移除，即时保存，勾选批量应用）

* [x] 尺码排序：utils/sizeOrder.ts + 码数Tag↑↓按钮 + 一键排序（D码垫底）+ 矩阵数量列同步重排

* [x] 预览增强：全局CSS工具栏白字黑底+遮罩加深；缩略图不开预览，预览入口唯一

* [x] SKU属性级编辑：自动模式备注/69码/价格可编辑+保存修改按钮；列头说明Tooltip

* [x] 验证：tsc 0错误 ✓ vite build 16.4s ✓ dev:5175 HTTP 200 ✓；决策记录：D-086

### 2026-08-16 样衣详情"基础属性库"（颜色/码数成套组合）✅

* [x] 颜色码数标题右侧「基础属性库」按钮 + 弹窗（Tabs 颜色组合/码数组合）

* [x] 组合 CRUD + 「使用」覆盖/「追加」去重；成员录入带字典联想；复用 t\_dict 零后端改动

* [x] 验证：tsc ✓ eslint ✓（未 build/未启动，属 3 文件小改动）；决策记录：D-083

### 2026-08-16 收尾：小程序术语+测试修复+仅缺料直生成 ✅

* [x] 小程序/H5 各2处术语；STAGE\_ORDER 测试 4 文件修正（443 全过）；后端 shortageOnly + 前端直生成

* [x] 前端 type-check/lint/build/测试 ✓ 后端 mvn compile ✓；决策记录：D-075

### 2026-08-16 大货与样衣采购链路简化 ✅

* [x] SmartPurchasePreviewModal 缺料预览前置（复用 net-demand 接口）；原因选填；购物车承接"仅缺料"

* [x] 录入采购当前页跳转；智能推荐订单选择器；样衣按钮分工 Tooltip+库存提示；sourceType=大货订单

* [x] 验证：type-check ✓ eslint ✓ build ✓；决策记录：D-074

### 2026-08-16 全站术语残留清零 + 暂缓3项落地 ✅

* [x] SKU/BOM 用户可见文案 44处清零（3处刻意保留：匹配关键词/历史兼容/日志）

* [x] 颜色图片 Modal 化 / 编码状态列消歧 / 操作人按环节联动

* [x] 验证：type-check ✓ eslint ✓ build ✓；决策记录：D-073

### 2026-08-16 样衣详情第二轮优化（审计清单 7/10 落地）✅

* [x] sticky 保存条 / SKU 表操作列 fixed right + scroll x / 颜色卡片响应式 / 左栏加宽 / 三处文案

* [x] 验证：type-check ✓ eslint ✓ build ✓；决策记录：D-072

* [ ] 暂缓 3 项待业务决策（见 D-072 背景）

### 2026-08-16 样衣详情布局压缩+SKC按钮消歧+图片缩小 ✅

* [x] 澄清：无"修改SKU"按钮，实为"修改SKC"（款+颜色编号），已改"修改SKC编号"+Tooltip 消歧；用户端旧文案系旧构建未重建

* [x] 商品编码表图片 44→32、说明精简、SKC块紧凑化、Switch 文案消歧

* [x] 客户信息|款式特征并排、时间信息并入基础信息区、间距收紧（区块 6→4）

* [x] 验证：type-check/lint/build/vitest（7 个既有失败与本次无关，stash 基线确认）

* 决策记录：D-071

### 2026-08-15 物料出入库库存不减扣+总值错乱 — 5处缺陷修复并推送 ✅

用户投诉"出入库每个地方都没减扣数量不变"，全链路核查（Controller→Orchestrator→Service→Mapper SQL→前端数据映射）定位 5 处缺陷并全修：

* [x] P0 调拨零和（物料/成品对同一行先扣后加=净零）→ 源/目标库位分别扣加+目标无记录自动新建；成品仅记录轨迹

* [x] P0 total\_value 4条SQL错算（MySQL SET 从左到右语义）→ 重写表达式+调整SET顺序

* [x] P1 确认出库静默漏扣（记录缺失跳过扣减仍写日志）→ 抛异常回滚

* [x] P1 queryPage 缺租户隔离 → 补 tenant\_id

* [x] P2 五处 LIMIT 1 无排序 → orderByAsc(createTime)

* [x] Flyway V202708151000 全量重算 total\_value

* [x] mvn compile ✓ / 推送 cb7b56800

* [ ] 待验证：启动后端跑 Flyway（PKG005 总值应=15.00）；实际调拨验证源减目标加

* 决策记录：D-070（含 MySQL SET 求值顺序方法论）

### 2026-08-14 生产要求被BOM日志污染根因修复 ✅（详见 D-069）

### 2026-08-14 仓库端领料列表500 — schema drift 全量清零 ✅

D-065 修复后领取成功，但 /picking/list 500。根因：43192e735 给 MaterialPicking 加 patternProductionId 没写迁移，云端缺列（insert 非空策略能过、select 全列必炸）。

* [x] Python 全库扫描 244 实体表 vs 迁移列差集

* [x] V202708142000：根因列 + 11张核心业务表同类 drift 30+列，全部表存在+列不存在双判断幂等

* [x] AI 表误报甄别（DbTableDefinitions.java 运行时建表已含）

* [x] mvn compile 0 错误；脚本模式与云端已验证的 V202708140001 一致

* [x] 决策记录：D-067

* [ ] 待云端部署（push 后 5\~10 分钟）→ 用户验证仓库端待出库列表

### 2026-08-14 D-065同类隐患全量审计+工作台3处修复 ✅

用户质问"还有多少这样的垃圾问题"→ 用 code-explorer 对全前端做锚点props审计：20组件×42调用方。

* [x] 发现并修复 `StyleDevelopmentWorkbench/StageContent.tsx` 3处漏传 styleNo（BOM/纸样Tab领取被拦 + 报价Tab打印按钮消失）

* [x] 其余17个组件核对无隐患（MaterialPickupModal/StylePrintModal/RemarkTimelineModal等全量过）

* [x] PickingForm（生产端直接领料）payload 传齐 orderId/orderNo/styleId/styleNo 确认无问题

* [x] 验证：tsc 0 errors + lint 0 诊断

* [x] 决策记录：D-066（含锚点props核对方法论）

### 2026-08-14 样衣开发BOM申请领取 400 修复 ✅

用户反馈：样衣详情物料清单Tab领取面辅料 → `/picking/pending` 400"领料单缺少归属关联"。根因：`StyleBomTab.tsx` 调用 `MaterialPickupModal` 时漏传 `styleNo`（纸样/生产Tab都传了，唯独BOM Tab漏）。

* [x] `StyleInfoTabs.tsx` 给 `<StyleBomTab>` 补传 styleNo

* [x] `StyleBomTab.tsx` Props 增加 styleNo 透传

* [x] `MaterialPickupModal` 提交前前置拦截（三锚点全空直接提示，不再等400）

* [x] 验证：tsc 0 errors + lint 0 诊断

* [x] 决策记录：D-065

* [ ] 待用户在物料清单Tab重试领取确认走通

### 2026-08-14 备注/全站TextArea被压成一行的根因修复 ✅

用户反馈样衣详情页备注框只有一行、说明文字跑到框外。根因：global.css 全局统一高度规则 `.ant-input { height:32px !important }` 命中 `textarea.ant-input`，覆盖 autoSize 内联高度。

* [x] global.css 6处 `.ant-input` → `input.ant-input`（主规则/search/affix/compact×2/table-cell 30px）

* [x] BasicInfoSection.tsx 删除与 showCount 重复的 extra"最多500字"，marginBottom 恢复 8

* [x] 验证：剩余 `.ant-input` 规则均无 height 覆盖；lint 0 错误

* [x] 决策记录：D-064

* [ ] 待用户刷新页面确认备注框 3\~6 行高度 + 计数显示在框右下角

### 2026-08-14 订单管理操作列修复 + 详情页术语统一 ✅（已推送 78a2b5a55）

* [x] 操作列 fixed:'right' + width 96（根因：scroll.x=3500 多列下被推出可视区）

* [x] 智能视图卡片操作按钮 hover 显示 → 常显

* [x] SKU → 商品编码（StyleSkuTab 3文件15+处可见文案）

* [x] BOM清单 → 物料清单（10处）

* [x] 基础信息/客户信息/时间信息/颜色码数逻辑核实通过

* [x] type-check 通过，commit `78a2b5a55` 已推送

### 2026-08-14 P0生产事故止血：Flyway MySQL 8.0 语法错误 ✅（待云端验证）

* [x] 根因定位：`V202708140001` 误用 `ADD COLUMN IF NOT EXISTS` → 云端迁移失败 → t\_style\_info 缺7列 → Unknown column → 全量500

* [x] 重写为存储过程幂等模式（参照 V20260615001），commit `11afc0b19` 已推送

* [x] Memory Bank 更新：D-060 事故复盘

* [ ] **待验证**：云端部署后 500 消除 + t\_style\_info 7列已加（需用户确认或盯部署日志）

### 2026-08-14 历史遗留编译警告/错误全量清理 ✅

用户质疑"这些遗留问题为什么不修复呢"——之前以"gitignored 不影响部署"为由不修是错误的。本次清理5个文件20+处历史遗留警告/错误：

* [x] 主代码 `StyleOperationAppendHelper.java` — 删除未使用 styleInfoService 字段 + import

* [x] 主代码 `StyleInfoOrchestrator.java` — 删除3处未使用 import/字段 + 1处 @SuppressWarnings

* [x] 测试 `StyleStageCompletionHelperTest.java` — 修复1个 Error(ambiguous) + 15个 Warning(unchecked)

* [x] 测试 `ProductionOrderQueryServiceStatsBoundaryTest.java` — 补 ArgumentCaptor import + 删3行不存在字段断言

* [x] 测试 `SmartSourcingServiceImplTest.java` — setId(1L) 改 setId("1")（id 是 String）

* [x] 测试 `SharedAgentMemoryServiceTest.java` — 3处 any() → any(SharedAgentMemory.class) 解决重载歧义

* [x] 验证：`mvn test-compile` BUILD SUCCESS（0 ERROR）

* [x] 决策记录：D-059

**教训**：之前以"gitignored 不影响部署"为由不修历史遗留问题是错误的。本地开发体验也是体验，遗留问题就该修。

***

### 2026-08-14 PC端样衣详情页-基础信息Tab按设计稿全等重写 ✅

用户诉求："改造样衣开发详情页全部改成这种简单的"，"全部+连带后端"，"复用现有字典"，"全链路跑通"，"先改基本信息这些tab页"。

按截图完整重写 PC端 `frontend/.../StyleInfo/components/StyleBasicInfoForm/BasicInfoSection.tsx`，并打通后端 entity + Flyway + 前端类型 + 表单提交全链路：

* [x] **后端**（2文件）
  * `StyleInfo.java` 新增7字段：productType/theme/designer/supplier/supplierId/supplierContactPerson/supplierContactPhone

  * `V202708140001__add_basic_info_ext_columns_to_style_info.sql` 幂等 ALTER + supplier\_id 索引

* [x] **前端**（6文件）
  * `types/style.ts` — StyleInfo 类型补7字段

  * `constants.ts` — 新增 PRODUCT\_TYPE\_OPTIONS（成品/半成品）

  * `BasicInfoSection.tsx` — 按截图完全重写（款名称/款式编码/商品分类/虚拟分类/商品类型/设计师/商品主题/客户/供应商/备注）

  * `CustomerInfoSection.tsx` — 去除 customer（迁至基础信息），保留 customerId hidden

  * `TimeRemarkSection.tsx` — 去除 remark（迁至基础信息），改名"时间信息"

  * `hooks/utils.ts` + `hooks/useStyleFormActions.ts` — 去除 `delete payload.customer/remark` 旧逻辑（否则保存时字段被剥离）

* [x] **验证**：后端 mvn compile exit 0 + 前端 npx tsc --noEmit 0 errors + 所有修改文件 lint 0 errors

* [x] **决策记录**：D-058

**踩坑**：`utils.ts` 和 `useStyleFormActions.ts` 都有 `delete payload.customer/remark`，这是历史代码（这两个字段原本不在基础信息区）。迁移字段后必须同步去除这些 delete，否则保存时字段被静默丢弃——这是"全链路跑通"的关键。

**未动**：左侧 sticky 封面图保持原位；其他 Tab（颜色规格/工艺说明/样品节点/设计状态/同类资料）按用户要求"改完基础信息再说别的"

***

### 2026-08-09 CodeBuddy 环境安全防护体系 ✅

用户要求"确保每一次的代码迭代与推送数据库不会炸前后端不会出现问题"，创建脚本化防护体系替代 Trae MCP：

* [x] `scripts/safe-query.sh` — 只读查询封装（替代 db-query-mcp）：拒绝写操作 + 强制 LIMIT 500 + 多租户检测

* [x] `scripts/safe-push.sh` — 推送前全量检查（替代 test-runner-mcp）：编译 + 类型 + Flyway 4项 + 多租户 + 敏感文件

* [x] `scripts/hooks/pre-push` + `scripts/install-hooks.sh` — git hook 自动触发（已安装 `core.hooksPath=scripts/hooks`）

* [x] `scripts/predeploy-check.sh` — 部署前检查（替代 change-impact-mcp）：prod.yml 安全 + 环境变量 + Dockerfile

* [x] 测试全部通过：safe-push 6项 PASS、写操作拒绝退出码3、LIMIT超限退出码4

**防护链路**：改代码 → safe-push.sh → git push → pre-push hook → CI → 部署 → predeploy-check.sh

***

### 2026-08-09 质量防线真实化修复 ✅

用户诉求："你先全面了解一下这个项目 看看有什么需要优化的" → 全系统扫描 → 逐条核实 → "如果缺少是没有用的就做了修复优化，颜色硬编码不要动"

* [x] **ArchUnit 假测试修复**（`backend/src/test/java/com/fashion/supplychain/architecture/ArchitectureConstraintTest.java`）
  * `controllerShouldNotCallServiceImplDirectly`：`rule.allowEmptyShould(true)` 返回值丢弃无 check → 补 `.check(importedClasses)`

  * `orchestratorNamingMustEndWithOrchestrator`：同样 no-op → 补 `.check()` + 排除 intelligence + 多后缀允许

* [x] **CI 硬编码凭据移除**（`.github/workflows/ci.yml`）
  * 删除 `SMOKE_USERNAME || 'lilb'` 和 `SMOKE_PASSWORD || '123456'` 明文 fallback

  * 改为运行前校验非空，缺失则 `::error::` 退出

* [x] **CLAUDE.md 版本号同步**（Spring Boot 3.3.6→3.4.5、MyBatis-Plus 3.5.7→3.5.12、编排器 235→330）

* [x] **自进化记录更新**（activeContext / progress / decisionLog D-056 / optimization-log-20260809）

**未动**：颜色硬编码（D-052-2 的 71 处保护色 + 用户明确要求不动）

**核实结论**：测试源码 gitignore 是 D-001/CLAUDE.md 的有意 P0 策略，非漏洞；Controller @Transactional 是 D-013 已知临时方案；Service @Transactional 冻结基线 34→18 在改善中；CI grep 恒假但 prod.yml 实际无 http\:// 恰好无漏检。

***

### 2026-08-01 智能化模块全链路修复 + 采购UI规范统一 ✅

用户诉求："你看看智能化的为什么做一半没有全部完成 你全部核实清楚 物料采购智能化你核实一下 还有为什么采购页面的操作栏做的乱七八糟的了" → "全部开始"

* [x] **异常自愈8个检测器修复/新建**
  * 3个AUTO：StagnantRiskDetector(7天→24h) / DelayRiskDetector(加组合判定) / QualityRiskDetector(次品率统计)

  * 5个SUGGESTION：MaterialRiskDetector(安全库存) / CostRiskDetector(工时维度) / PayrollRiskDetector(新建) / OutsourceRiskDetector(新建) / WarehouseDiffRiskDetector(新建)

  * RiskType枚举新增3个值，3个新检测器加@Component自动注册

* [x] **智能采购4个问题修复**
  * lossRate持久化：V202708010001迁移 + 4个Entity/DTO加字段 + 链路贯通

  * quick-edit重算bug：委托Orchestrator，先读unitPrice再重算totalAmount

  * 审价工作流：V202708010002迁移 + 5个字段 + 2个API端点 + confirm设pending\_review

  * AI巡检Job串联：SourcingSpecialistPatrolJob注入SmartSourcingService自动触发

* [x] **PC采购页面UI 10项修复**
  * 状态漏洞：领取按钮排除终态 / 退回按钮去掉COMPLETED分支

  * 实心改镂空：3处（智能采购推荐/保存/编辑面辅料）

  * 筛选器7档对齐 + PatrolActionCenter类型映射 + 一键智能采购按钮

  * global.css 10处硬编码→CSS变量 + 操作列宽度220→260 + maxInline 3→2

* [x] **手机端+H5四端同步**
  * 4处实心改镂空 + 按钮高度统一 + 注释同步

  * 四端MD5一致：miniprogram/source-miniapp/public/source-miniapp/dist/source-miniapp

* [x] **发布前全面核实**
  * P0阻塞发布项：无

  * P1建议修复：SelfCritiqueGateTest/EvolutionOrchestratorTest 72测试 + 完整编译 + AI全链路冒烟

  * 历史遗留23项：21项已完成，2项本次已修复

* [x] **验证**：mvn compile exit 0 + npx tsc exit 0 + 四端MD5一致

***

### 2026-08-01 AiCostTrackingOrchestrator JUnit 5 单元测试创建 ✅

用户诉求："Create a JUnit 5 unit test at AiCostTrackingOrchestratorTest.java... 11 tests covering calculateCost/getCostSummary/recordAsync"

* [x] **测试文件创建**
  * 路径：`backend/src/test/java/com/fashion/supplychain/intelligence/orchestration/AiCostTrackingOrchestratorTest.java`

  * 技术栈：JUnit 5 + Mockito + AssertJ

  * 结构：`@ExtendWith(MockitoExtension.class)` / `@InjectMocks` / `@Mock AiCostTrackingMapper`

* [x] **UserContext 生命周期**（复用 WhatIfSimulationOrchestratorTest 模式）
  * `@BeforeEach`：setTenantId(1L) + setFactoryId("F001")

  * `@AfterEach`：UserContext.clear() 防污染

* [x] **calculateCost 私有方法反射测试（7 个）**
  * `agnes-2.5-flash`：1000+500 tokens → 0.000045

  * `agnes-2.0-flash` 同价验证（= 2.5）

  * 未知模型：默认 0.00020 → 1500 tokens = 0.00030

  * 零 tokens → 0

  * `deepseek-v4-flash`：500+500 = 0.00014

  * 大 tokens（999999×2）：BigDecimal 无溢出

  * `qwen-plus`：800+1200 = 0.00080

* [x] **getCostSummary 公共方法（3 个）**
  * sumCostSince 返回 null → estimatedCostUsd = 0（BigDecimal.ZERO）

  * Mapper 抛 RuntimeException → fail-safe 返回空 Map（非 null）

  * USD $150.5678 × 7.2 = CNY ¥1084.09，scale=2 精度验证

* [x] **recordAsync 方法（1 个）**
  * ArgumentCaptor<AiCostTracking> 捕获 insert 参数

  * verify times(1) + 全字段断言（tenantId/model/scene/tokens/latency/success/cost）

* [x] **规范**：所有 BigDecimal 比较统一用 `isEqualByComparingTo()`，避免 scale 差异误判

***

### 2026-07-31 财务闭环+数字孪生+\@Version+颜色核查 ✅

用户诉求："好的全部开始吧 注意颜色哪些是必须保留的 做的时候注意数据流转这些问题 一定要到位"。

* [x] **账单→会计凭证数据流转闭环**（D-022）
  * BillAggregationOrchestrator.confirmBill → ensureAccountingVoucherFromBill → generateVoucherFromBill

  * BillAggregationOrchestrator.reverseBillInternal → reverseByBillAggregationId

  * 凭证异常 fail-safe 不阻塞账单主流程

* [x] **金融实体 @Version 乐观锁补齐**（D-008）
  * Payable/Receivable/BillAggregation/WagePayment 4 个实体添加 @Version

  * Flyway V202608081400\_\_add\_version\_to\_finance\_entities.sql

* [x] **数字孪生深化**
  * ProductionDomainProvider 实现 DomainDataProvider 接口

  * 工厂负载热力图 + 在制品工序分布 + 交期分桶

* [x] **前端硬编码颜色清理核查**
  * dry-run 核查：0 可替换剩余，71 处保护色完整保留

  * 必须保留的 5 种保护色：#00e5ff/#39ff14/#7c4dff/#00bcd4/#f7a600

* [x] **质量门控**：5 大核心链路数据流转闭环验证通过

***

### 2026-07-26 P0多租户隔离+财务闭环+生产备注+AI持久化+多端补齐（6 commits）✅

用户诉求："全部开始优化 注意优化细节与数据链路的闭环"。

* [x] **P0多租户隔离修复**（commit 379554a3c）
  * CrmClientController: company like → customerId 精确匹配

  * WagePaymentCallbackHelper: 2 处查询补 tenantId 过滤

  * SupplierPortalController: supplierType 放宽为 MATERIAL/CMT/BOTH

  * DuplicateScanPreventer: findByRequestId 补 tenantId 过滤

* [x] **P0财务闭环反向账单统一**（commit b763df5a8）
  * 7 处 cancelBySource → reverseBySource（销售退货/工资/二次工艺/盘点/出库/扫码撤回）

  * 清理 FinishedWarehouseOperationOrchestrator WAREHOUSING 断头调用

* [x] **生产备注+异常传播+AI持久化**（commit a95f22685）
  * ScanRescanHelper/ScanUndoHelper: 移除 try-catch 让异常传播触发事务回滚（D-001）

  * ProductionOrderWorkflowHelper: 工序锁定/回滚/委派同步写入 OrderRemark 表

  * AiAgentMemoryHelper: 程序记忆持久化到 t\_procedural\_memory

* [x] **电商平台可用性标记**（commit 5ef6051cd）
  * 6 个未实现平台标记 available=false + "即将推出"角标

* [x] **H5 多端补齐**（commit 522ee5ba4）
  * api/index.js 新增 lockBundle/unlockBundle 接口

  * ScanQualityPage 菲号锁定/解锁

  * StyleDevPage REJECT 按钮

* [x] **三端订单生命周期同步**（commit 034b76470）
  * production.js 新增 completeOrder/closeOrder/scrapOrder API

  * order-detail 新增 onActionComplete/onActionClose/onActionScrap

  * 三端副本 MD5 一致

* [x] 质量门控全部通过：mvn compile ✅ / npx tsc ✅ / audit-tenant-id（仅 RoleTemplate 历史遗留）

* [x] 6 commits 推送至 origin/main（379554a3c → 034b76470）

***

### 2026-07-25 物料采购/领料/出库流程交互优化 ✅

用户诉求："全部核实清楚就开始优化修复，样衣那边的采购与领取，还有大货这边也是一样的"。

* [x] 采购按钮命名统一（"去采购"/"登记到货"/"撤回采购"）+ 操作提示

* [x] 领料表单 BOM 自动预选与需求对照（BOM 用量 / 订单需求 / 库存余量）

* [x] 出库批次 checkbox 选择 + FIFO 自动分配 + 清空选择

* [x] 出库订单选择后自动同步 pickupType / factoryType

* [x] 前端 type-check 通过

* [x] 修改文件 eslint 通过

***

### 2026-07-24 平台详情页顶部标签改为中文平台名 ✅

* [x] 识别 `/ecommerce/platform/:code` 路径

* [x] 从 `PLATFORM_LIST` 解析平台中文名

* [x] 顶部最近访问标签显示「{平台名} - 平台详情」

* [x] npx tsc --noEmit 通过

* [x] 提交 ec985965f 已推送到 origin/main

***

### 2026-07-23 智能化开关补全 8 个 HIGH 风险自动执行点 ✅

用户诉求："全部优化好这些 这些这些智能化的 还是不要自动 让用户可以设置这些 理解吗 怕出现问题"

全系统核查发现仍有 8 个 HIGH 风险 @Scheduled 方法会自动执行写操作/对外通知/派单但无用户可配置开关，全部补齐：

* [x] **AiPatrolJob 4 个跨租户巡检方法纳入 AUTO\_PATROL\_EXEC 开关**
  * scanProductionAnomalies / scanExtendedAnomalies / runDailyPatrol / checkTaskOrderProgress

  * 用 isActionEnabledForAnyTenant 粗粒度控制，全租户未开启则跳过

* [x] **EcSyncJob.retryJob 纳入 AUTO\_EC\_STOCK\_SYNC 开关**
  * 按租户检查，关闭则不自动重试推库存/价格到电商平台

* [x] **SmartNotifyJob.autoDetectAndNotify 纳入新开关 AUTO\_MIND\_PUSH**
  * 在 doAutoDetect 租户循环内按租户检查，关闭则不自动推送微信/站内通知

* [x] **XiaoyunDailyInsightJob 纳入新开关 AUTO\_DAILY\_INSIGHT\_DISPATCH**
  * 关闭则不自动生成洞察+派发协作任务

* [x] **AgentBackgroundTaskJob 纳入新开关 AUTO\_AGENT\_BACKGROUND\_TASK**
  * 关闭则不自动执行 AI 后台任务

* [x] **BackendActionFlagService 新增 3 个开关枚举**（AUTO\_MIND\_PUSH/AUTO\_DAILY\_INSIGHT\_DISPATCH/AUTO\_AGENT\_BACKGROUND\_TASK）

* [x] **Flyway V202612070001 初始化 3 个新开关默认关闭**

* [x] **前端 ProfileSmartSettingsPanel.tsx 补充 3 个新开关文案**

**验证**：后端 mvn compile exit 0、前端 npx tsc --noEmit 0 errors
**变更范围**：后端 6 文件（5 Job + 1 Service）+ 1 Flyway 迁移 + 前端 1 文件
**决策记录**：D-044

***

### 2026-07-23 智能化功能全部改为用户可配置开关（用户核心诉求）✅

用户决策："全部优化好这些 这些这些智能化的 还是不要自动 让用户可以设置这些 理解吗 怕出现问题"

* [x] **AiPatrolJob 全部 @Scheduled 方法受开关控制**
  * `scanPersonalTaskReminders` 新增 `AUTO_TASK_REMINDER` 开关检查（本次新增）

  * `executeAutoActions` 已有 `AUTO_PATROL_EXEC` 开关

  * `scanOverdueCollaborationTasks` 已有 `AUTO_TASK_ESCALATION` 开关

  * `pushHighSeverityAlerts` 已有 `AUTO_HIGH_SEVERITY_DISPATCH` 开关

* [x] **EcSyncJob stockSyncJob 受** **`AUTO_EC_STOCK_SYNC`** **开关控制**
  * 注入 `BackendActionFlagService`，按租户判断开关

  * 关闭时仅本地计算库存，不推送到平台

* [x] **前端配置面板补充 5 个新开关文案**
  * ProfileSmartSettingsPanel.tsx 的 BACKEND\_ACTION\_LABELS 新增 5 条

* [x] **编译错误修复**
  * EcPriceSyncItem.java 添加 @NoArgsConstructor + @AllArgsConstructor

  * EcStockDiscrepancyOrchestrator.java getSkuName() 改为 buildSkuName(sku)

* [x] **确认 P1-2 返工智能派单已是手动**（SmartAssignmentOrchestrator 仅推荐不派单）

* [x] **确认 P1-3 物料对账差异已是仅展示**（explainException 只列原因不操作）

**验证**：后端 mvn compile exit 0、前端 npx tsc --noEmit 0 errors

***

### 2026-07-23 撤销 AiUpgradeCenter 独立页面 + Skills市场（用户决策回滚）✅

用户决策："集成到现有的这些里面来升级 不要多余的东西 很多用户都不知道这些玩意有什么用 要做好现有的升级就好 他们不是技术性的用户 都是普通用户 根本不需要技术性的东西 我们要做的是用户体验与使用这些好用"

* [x] **前端清理**
  * 删除 `frontend/src/modules/intelligence/pages/AiUpgradeCenter/` 整个目录（7 Tab + index.tsx）

  * `frontend/src/modules/intelligence/index.tsx` 移除 AiUpgradeCenter 导出

  * `frontend/src/routeConfig.ts` 移除 aiUpgradeCenter 路径/菜单项/页面元信息/权限码映射

  * `frontend/src/App.tsx` 移除 AiUpgradeCenter 导入 + 路由注册

* [x] **后端清理**
  * 删除 6 个 Controller（BrowserAgent/VisualAIInspection/FashionAIAsset/SmartScheduling/DigitalTwinSnapshot/SkillMarket）

  * 删除 6 个 Orchestrator（同上）

  * SkillTemplate.java 移除 7 个市场字段

* [x] **数据库回滚迁移（遵守 P0 #1 不修改已应用迁移）**
  * V202607230001/V202607230002 保留不删

  * 新增 V202607230003\_\_rollback\_ai\_upgrade\_tables.sql（幂等 DROP 5 表 + 7 字段 + 1 索引）

**验证**：后端 mvn compile exit 0、前端 npx tsc --noEmit 0 errors、全代码库 grep 无残留引用

**下一步方向**：智能化能力下沉到现有业务模块中作为内嵌辅助功能，不另立独立页面

***

### 2026-07-23 下单页智能化模块 P2+P3 共 7 项修复（全部完成）✅

用户要求"剩余的7个全部要优化好"，全部修复完毕。npx tsc --noEmit 通过。

* [x] **P2-9 OrderFactorySelector deliveryOnTimeRate null/undefined 兜底**
  * 新增 formatRate + FactoryStatBlock 子组件，消除 INTERNAL/EXTERNAL 重复渲染

* [x] **P2-10 SmartStyleInsightCard calcInsight 竞态保护 + 错误态区分**
  * useRef requestId + hasError state，错误时显示"重试"

* [x] **P2-11 StyleQuotePopover 失败清 data + 竞态保护 + Popover 关闭取消在飞请求**

* [x] **P2-12 FactoryInsightDrawer 错误态 UI + 重试按钮**
  * 新增 error state + Alert + 重试按钮

* [x] **P2-13 useOrderIntelligence 两个 fetch 竞态保护 + visible=false 重置**
  * deliveryRequestIdRef + schedulingRequestIdRef；弹窗关闭清空残留

* [x] **P3-14 多文件硬编码颜色改 CSS 变量**（5 个文件）
  * OrderFactorySelector / SmartStyleInsightCard / StyleQuotePopover / FactoryInsightDrawer / OrderSchedulingInsights

* [x] **P3-15 折叠态 loading 指示** — OrderSchedulingInsights + OrderLearningInsightCard
  * 新增 LoadingOutlined 旋转图标 + "分析中..."文字

**变更范围**：7 个前端文件
**验证**：npx tsc --noEmit 通过（exit 0）

***

### 2026-07-23 下单页智能化模块优化（P0+P1 共 9 项修复）✅

用户需求：盘点下单页所有智能化模块、检查逻辑问题、确认无资料下单弹窗是否支持智能化。

**调研结论**：下单页集成 8 类智能化模块（交货期智能建议 / AI 排产建议 / 款式报价建议 / 订单学习推荐 / 工厂全动态详情 Drawer / 智能款式分析卡 / 工厂产能数据 / 工序进度加载）；无资料下单弹窗（CuttingCreateTaskModal）此前完全未集成任何 intelligenceApi。

**P0 修复（2 项）**：

* [x] **P0-1 useOrderIntelligence deliverySuggestion 依赖项**
  * 原 `selectedFactoryStat?.factoryName` + eslint-disable 掩盖问题，工厂对象其他字段变化不触发重算

  * 改为整体 `selectedFactoryStat` + `factoryMode` + `fetchDeliverySuggestion` 依赖

* [x] **P0-2 FactoryInsightDrawer 防抖重构**
  * 原 useEffect 无防抖，open/orderQuantity/plannedDeadline 任一变化即触发 3 个 API 并行雪崩

  * 重构为：open 从 false→true 立即加载 / factoryName 变化立即加载 / 其他参数变化 600ms 防抖

  * 用 ref 保存最新参数避免闭包过期

**P1 修复（4 项）**：

* [x] **P1-3 无资料下单弹窗接入 FactoryInsightDrawer**
  * CuttingCreateTaskModal 新增「查看工厂全动态详情」镂空按钮（仅在 selectedFactoryStat 存在时显示）

  * useMemo 聚合 createOrderLines 计算总下单数量传给 Drawer

  * 接入交期预测/产能缺口/在产订单明细三大模块

  * 跳过交期建议/排产/订单学习：无资料下单无款号工价基础，FactoryInsightDrawer 已覆盖核心场景

* [x] **P1-4 StyleQuotePopover fetchedRef 缓存冲突**
  * destroyOnHidden=true 销毁内容，但 fetchedRef 在父作用域导致首次拉取后永不刷新

  * 去掉 fetchedRef，改为 onOpenChange 触发拉取（每次打开重新拉）

* [x] **P1-5 SmartStyleInsightCard 拉取量 + 防抖**
  * pageSize 100→30（足够算周期/准时率/频率统计）

  * 新增 400ms 防抖，避免快速切换款号时连续拉取

* [x] **P1-6 orderLearningApi 404 永久禁用改 5 分钟冷却**
  * 原 sessionStorage 布尔值永久标记不可用，后端修复后前端仍不重试

  * 改为时间戳 + 5 分钟冷却，过期自动恢复

**P2 修复（2 项）**：

* [x] **P2-7 排产建议加 500ms 防抖**
  * 原 useEffect 无防抖，visible/styleNo/totalOrderQuantity 变化即触发

  * 加 schedulingTimerRef + setTimeout 500ms + cleanup

* [x] **P2-8 selectedStyle 对象引用依赖**
  * 原 `selectedStyle` 整体引用依赖，setState 创建新引用导致重复拉取

  * 改为 `selectedStyle?.id` + `selectedStyle?.styleNo` 字段依赖

**变更范围**：前端 6 文件修改（useOrderIntelligence.ts / FactoryInsightDrawer.tsx / CuttingCreateTaskModal.tsx / StyleQuotePopover.tsx / SmartStyleInsightCard.tsx / orderLearningApi.ts），无后端变更。

**验证**：

* npx tsc --noEmit 通过（exit 0）

**待办（用户未确认）**：

* 剩余 P2 级 4 个问题（问题 9-12）+ P3 级 3 个问题（问题 14-16）未处理

* 无资料下单是否需要接入更多智能化模块（交期建议/排产/订单学习）— 已自行跳过，待用户确认

### 2026-07-23 下单页工厂全动态时间线（4 项 Gap 全部完成）✅

用户阶段四需求：下单人员在选择工厂时即可看到该工厂的全动态时间线（当前负载/预计完工/每天产量），不重复现有智能化逻辑、不占窗口位置（用 Drawer）。

**4 项 Gap + 时间线可视化组件**：

* [x] **Gap 1：预下单三档交期预测 API（不依赖 orderId）**
  * 新建 PreOrderDeliveryPredictionRequest/Response DTO + PreOrderDeliveryPredictionOrchestrator

  * 独特设计：用工厂总负载（含本单）计算排队时间，输出 timelineNodes 供前端直接渲染

  * 端点：`POST /intelligence/pre-order-delivery-prediction`

* [x] **Gap 2：产能缺口分析集成到下单页**
  * 复用现有 `CapacityGapOrchestrator.analyze()`（4 档 gapLevel）

  * Drawer 调用 `intelligenceApi.getCapacityGap()`，按 factoryName 过滤

* [x] **Gap 3：工厂当前在产订单明细（可点击详情查看）**
  * 新建 FactoryActiveOrderDTO + FactoryActiveOrderOrchestrator

  * 按 plannedEndDate 排序，danger/warning/safe 三档风险分类

  * 端点：`GET /intelligence/factory-active-orders?factoryName=xxx`

* [x] **Gap 4：后端下单时产能预警（不阻断，仅 warning）**
  * 新建 FactoryCapacityWarningHelper（@Component）

  * 阈值：5000 件 / 20 单

  * warnIfOverloaded 不抛异常，仅 log.warn

  * evictFactoryCapacityCache 删除 Redis key `factory_capacity:{tenantId}`

  * ProductionOrderOrchestrator.saveOrUpdateOrder 末尾 afterCommit 回调 warnIfOverloaded

  * evictCacheAfterCommit 同步路径 + afterCommit 路径都加 evictFactoryCapacityCache

* [x] **时间线可视化组件（详情视图）**
  * 新建 FactoryInsightDrawer.tsx（720px 宽 Drawer，destroyOnClose）

  * 三大区块：交期预测时间线（水平节点）+ 产能缺口分析 + 在产订单明细 Table（7 列）

  * Promise.all 并行 3 API

  * OrderFactorySelector.tsx 加「查看工厂全动态详情」镂空按钮（内部 + 外发工厂各一处）

  * renderInsightDrawer 在 return 末尾只渲染一次

  * intelligenceApi.ts + operation.ts 新增 4 类型 + 3 API 方法

**算法复用（不重复造轮子）**：

* 新建 FactoryVelocityCalculator.java 从 DeliveryPredictionOrchestrator 拆薄

* 复用 EWMA(α=0.33) + 趋势检测(最小二乘,±25%) + 季节性修正(周末70%) + P80 百分位混合(6:4) + 历史偏差校准

* 区别：单订单聚合 vs 工厂所有在制订单聚合

**踩坑修复（编译期）**：

* 后端：MyBatis-Plus `qw.ne("status", "a","b","c")` 不支持多值 → `qw.notIn("status", Arrays.asList(...))`

* 前端：ApiClient.post 泛型 R 默认 = T，`api.post<{code,data:T}>` 返回 `Promise<{code,data:T}>`，await 后直接 `.data`

**验证**：

* mvn compile -q 通过（exit 0）

* npx tsc --noEmit 通过（exit 0）

**变更范围**：后端 8 文件（5 新建 + 3 修改）+ 前端 4 文件（1 新建 + 3 修改）= 12 文件。

### 2026-07-22 小云AI P0+P1 前沿升级全部完成（待提交）✅

延续 GitHub 前沿调研（Mem0/Letta/Langfuse/Graphiti/Cognee/AWS S3 Vectors），本次完成 P0 三项 + P1 五项共 8 项智能化升级：

**P0 阶段（已完成）**：

* [x] P0-1 MCP 工具入参提示注入防御（4 个 MCP，仅本地）

* [x] P0-2 反思记忆闭环（ReflectiveMemoryWriter + 5 文件修改）

* [x] P0-3 L4 ProceduralMemory 自编辑工具集（AgentTool+Controller+CRUD）

* [x] P0-4 Langfuse 全链路追踪（span 层级 + 主对话接入 + submitScore）

**P1 阶段（已完成）**：

* [x] **P1-1 t\_ai\_long\_memory 时序字段**（Graphiti 时序知识图谱方向）
  * 新建 Flyway V202707221000 — valid\_from/valid\_to/superseded\_by + 2 索引 + 回填

  * 修改 AiLongMemory entity + LongTermMemoryOrchestrator（supersedeOldMemories + retrieve 过滤）

* [x] **P1-2 扫码 State Graph + HITL**（LangGraph 状态机方向）
  * 新建 ScanState（11 状态枚举）+ ScanStateGraph（状态机+HITL）+ Controller

  * 新建 Flyway V202707221002 — t\_scan\_state\_log

  * 零侵入：未修改任何现有 ScanRecordOrchestrator 代码

* [x] **P1-3 t\_shared\_agent\_memory + 消息总线**（AWS S3 Vectors 多 Agent 协作方向）
  * 新建 Flyway V202707221001 — t\_shared\_agent\_memory

  * 新建 Entity/Mapper/Service/CleanupJob

  * MultiAgentGraphOrchestrator 已集成 readFacts/writeFact

* [x] **P1-4 离线评估 dataset**（Langfuse 离线评估方向）
  * 新建 Flyway V202707221003 — t\_eval\_dataset + t\_eval\_item

  * 新建 Entity/Mapper/Service/Job/DTO

  * 每周日 02:00 离线评估

* [x] **P1-5 记忆巩固定时任务**（Cognee 离线巩固方向）
  * 新建 MemoryConsolidationService + MemoryConsolidationJob + ConsolidationResult DTO

  * 每天 03:30 巩固相似记忆

**验证**：

* mvn compile -q 通过（exit 0）

* check-flyway-sql 无新增警告（253 个全为历史遗留）

* audit-tenant-id 无新增违规（1 处历史遗留 RoleTemplate）

* 6 个 MCP node --check 通过

**变更范围**：P0 17 文件 + P1 25 文件 = 42 文件，4 个新 Flyway 迁移。
**非任务文件**保持未暂存：PatternProductionController.java、types/style.ts。

### 2026-07-22 小云AI P0 前沿升级（待提交）✅

延续 GitHub 前沿调研（Mem0/Letta/Langfuse/Graphiti/Cognee），本次完成 P0 三项智能化升级：

* [x] **P0-1 MCP 工具入参提示注入防御**（仅本地，.trae/ 在 .gitignore）
  * db-query-mcp 新增 `assertNoSqlInjection` + `stripStringLiterals`，接入 3 个工具函数

  * flyway-mcp/test-runner-mcp/memory-bank-mcp 修复路径穿越/ReDoS 等 4 个 HIGH 风险

  * 参考 Azure DevOps MCP 2026-07 漏洞

* [x] **P0-2 反思记忆闭环**（Mem0/Letta 前沿方向）
  * 新建 ReflectiveMemoryWriter + SelfCritiqueResult DTO

  * 修改 AiAgentOrchestrator/ConversationReflectionOrchestrator/PromptContextProvider/AiAgentPromptHelper/IntentBasedPriorityRouter

  * SelfCritic 评分<75 → AiLongMemory(layer=REFLECTIVE) → 下次类似问题召回 → prompt 注入

* [x] **P0-3 L4 ProceduralMemory 自编辑工具集**（Letta 自编辑记忆方向）
  * 新建 ProceduralMemoryCreateDTO/UpdateDTO/ProceduralMemoryTool/ProceduralMemoryController

  * 修改 ProceduralMemoryService（追加 6 个 CRUD）+ AiAgentToolAccessService（注册工具）

  * AI 可自编辑 SOP，从"只读检索"升级为"自编辑进化"

* [x] **P0-4 Langfuse 全链路追踪**（Langfuse 28.4k star + OpenTelemetry 方向）
  * 增强 LangfuseTraceOrchestrator（beginSpan/endSpan/recordEvent/recordGeneration）

  * 新建 LangfuseSpanContext（ThreadLocal span 栈）+ LangfuseSpanHelper（try-with-resources）

  * 修改 AgentLoopEngine（5 个关键节点 span 包裹）+ AiAgentOrchestrator（pushTrace/submitScore/clear）

* [x] mvn compile -q 通过（exit 0）

* [x] audit-tenant-id 无新增违规（1 处历史遗留）

* [x] 6 个 MCP node --check 通过

* [x] 非任务文件保持未暂存：PatternProductionController.java、types/style.ts

**变更范围**：17 个文件（9 修改 + 8 新建），599 行新增。
**下一步**：P1-1\~P1-5（时序字段/扫码 State Graph/共享记忆/离线评估/记忆巩固）。

### 2026-07-22 前端 eslint warning 全面清零（commit 6db64aecf）

* [x] 修复 54 个 react-hooks/exhaustive-deps warning（34 个文件）

* [x] 清理 8 个遗留 no-unused-vars warning

* [x] 3 组 subagent 并行执行（Group 1: 18 文件 / Group 2: 11 文件 / Group 3: 9 文件）

* [x] 全局 `npx tsc --noEmit` 0 errors

* [x] 全局 `npx eslint . --max-warnings 500` 0 warnings

* [x] 推送到远程（commit 6db64aecf，117 files changed）

* [x] 非任务文件保持未暂存：`PatternProductionController.java`、`types/style.ts`

**最终状态**：eslint 从 62 warnings → 0 warnings，CI 完全清零。

### 2026-07-22 前端 400-500 行超大文件拆分收尾（commit dbbbda837）

* [x] 拆分约 50 个 400-500 行区间超大 TS/TSX 业务文件

* [x] 三种拆分模式：目录化拆分（主组件+子组件）、Hook 拆分、列组按业务域拆分

* [x] 严格保持 API 路径、参数签名、字段名、返回值结构、业务逻辑不变

* [x] 修复目录化后相对路径层级问题（多加一层 `../`）

* [x] 修复 Hook 含 JSX 必须用 .tsx 扩展名问题

* [x] 修复共享 utils.ts interface 未导出（TS4058）问题

* [x] 修复类型系统兼容性（可选 vs 必填、索引签名）

* [x] 全局 `npx tsc --noEmit` 验证通过（0 errors）

* [x] 推送到远程（commit dbbbda837）

* [x] 非任务文件保持未暂存：`PatternProductionController.java`、`types/style.ts`

**最终统计**：500+ 行剩 2 个（intelligenceApi.ts/routeConfig.ts）、400-500 行剩 1 个（utils/api/core.ts 472 行）、300-400 行剩 146 个待推进。

### 2026-07-19 员工打卡后端健壮性增强（P1+P2 全修）

* [x] **P1**：WorkAttendance 实体补齐 @TableField(fill=FieldFill.INSERT/INSERT\_UPDATE) 注解（修复 updateTime 永不更新的 bug）

* [x] **P2.1**：Mapper 新增 selectLatestOpen + Service 新增 findLatestOpen（查最近未下班打卡记录）

* [x] **P2.1**：Orchestrator.clockOut 新增跨天兜底分支（凌晨下班打卡补到昨晚的上班卡，避免工时丢失）

* [x] **P2.2**：Orchestrator.clockIn save 调用 try-catch DuplicateKeyException，并发兜底返回"今日已上班打卡"

* [x] mvn compile 验证通过（exit 0，2188 源文件）

* [x] check-flyway-sql.py 验证通过

* [x] audit-tenant-id.py 验证通过（1 处历史遗留 RoleTemplate 违规，非本次引入）

* [x] 决策 D-042 记录：员工打卡健壮性增强 — 实体注解对齐 + 跨天补卡兜底 + 并发竞态兜底

### 2026-07-19 财务数据链路闭环（Phase 1-4 + Phase 3 全部完成）

* [x] **Phase 1 止血（5 项核心修复）**：反向账单机制 + SalesReturn/FactoryShipment/ShipmentReconciliation/ReconciliationStatus 联动

* [x] **Phase 2 补齐（5 项 P0 修复）**：ProductionCleanup/FinishedWarehouse/PurchaseReturn/MaterialPurchase 系列

* [x] **Phase 2.5 EXTERNAL\_FACTORY 核查（3 P0 + 6 P1 + 1 P2）**：SecondaryProcessOrchestrator 非法枚举修复 + 前端 SHIPMENT 选项

* [x] **Phase 4 审计修复（3 处编译错误）**：SalesReturnOrchestrator/FactoryShipmentOrchestrator/ShipmentReconciliationOrchestrator

* [x] **Phase 3-1: isOwnFactory 字段化** — Flyway V202707191000 幂等加列 + 多租户安全回填

* [x] **Phase 3-2: undoPatternScan 双写** — PatternProductionOrchestrator 重写，5 项修复（多租户/工资结算/ScanRecord 镜像/备注日志/时间窗）

* [x] **Phase 3-3: 样衣开发费用统一接入 BillAggregation** — StyleInfoOrchestrator 新增 pushStyleDevelopmentBill/reverseStyleDevelopmentBill，金额=materialCost+processCost

* [x] mvn compile 编译验证通过（exit 0）

* [x] check-flyway-sql.py 验证通过

* [x] 决策 D-041 记录：财务数据链路闭环 — 反向账单机制 + isOwnFactory 字段化 + 样衣开发费用统一接入

### 2026-07-18 三端数据流转一致性核查 + 3个P0级多租户漏洞修复

* [x] P0: 修复 PatternRevisionController.java list 接口缺少 tenant\_id 过滤

* [x] P0: 修复 PatternProductionOrchestrator.java 列表查询缺少 tenant\_id 过滤

* [x] P0: 修复 PatternProductionController.java 新端点（后置校验改为查询时直接带 tenant\_id 过滤）

* [x] 三端一致性核查：共发现 47 项问题（13 P0 / 16 P1 / 18 P2），已记录待办

* [x] 小程序样衣开发进度显示修复（stage-detail 别名匹配/进度条UI/缓存重建）

* [x] 仓库库位选择修复（GET改POST + 字典兜底逻辑）

* [x] 工序展示与 PC 端配置对齐（按 stageKey 过滤 + 父阶段分组）

* [x] 代码质量扫描核实（删除3张未引用图片，确认误报）

### 2026-07-16 全局 API 响应处理规范清理 + P0 级问题修复

* [x] P0: 修复 `dashboard/order-detail/index.js` 2 处 `res.code !== 200` 判断错误（ok() 失败直接 throw，不会走到 then）

* [x] P0: 更新 `ScanSubmitter.js` 扫码成功判断逻辑注释，明确 ok() 返回值语义

* [x] P1: 清理 `defect/index.js` 冗余 `res.data` 判断

* [x] P1: 清理 `sample-development/index/index.js` 2 处冗余判断

* [x] P1: 清理 `home/index.js` + `more-apps/index.js` 收藏应用加载冗余判断

* [x] P1: 清理 `order/create/index.js` 2 处冗余判断

* [x] P1: 清理 `warehouse/sample/scan-action/index.js` 3 处冗余判断

* [x] P1: 清理 `components/purchase-cart-drawer/index.js` 2 处冗余判断

* [x] P1: 清理 `components/ai-assistant/index.js` 2 处冗余判断

* [x] 确认 `tenant.publicList()` / `system.login()` / `tenant.workerRegister()` 使用 raw()，`res.data` 判断正确，未修改

* [x] ESLint 验证：13 个 errors 均为历史遗留，本次修改未引入新 error

* [x] 新增决策 D-039：API 响应处理规范 — ok() vs raw() 必须严格区分

### 2026-07-15 PC 质检入库页订单号字体过大修复

* [x] 定位根因：`WarehousingTable.tsx` 订单号列硬编码 `fontSize: 14`，违背设计系统 `--table-cell-font-size: 12px`

* [x] 将文件中 9 处硬编码 `fontSize: 14` 统一改为 `var(--table-cell-font-size)`

* [x] 订单号下方生产方/组织路径改为 11px 灰色副标题样式

* [x] 前端 `npx tsc --noEmit` 0 errors

### 2026-07-14 质检页面款式图片不显示修复 + 外发管理状态确认

* [x] 定位质检列表图片缺失根因：`ScanRecord.styleId` 为空导致 `enrichStyleInfo` 无法匹配封面图

* [x] 后端 `ScanRecordEnrichHelper.enrichStyleInfo` 增加 `orderId → ProductionOrder.styleId` 兜底查询

* [x] 修复覆盖 `list/getByOrderId/getByStyleNo/getHistory/getMyHistory` 全链路扫码记录接口

* [x] 修复 `miniprogram/pages/defect/index.js` ESLint `no-empty` 错误

* [x] H5 `source-miniapp` / `public/source-miniapp` / `dist/source-miniapp` 同步 `defect/index.js`

* [x] 核查外发管理命名：小程序/H5 菜单与页面标题已统一为「外发管理」

* [x] 确认外发发货功能已实现：入口在「外发管理 → 我的订单 → 展开卡片 → 发货」

* [x] 后端 `mvn compile -q` 通过；`defect/index.js` ESLint 0 errors；H5 三端 diff 一致

### 2026-07-14 全量 API 模块核查 + 3 处修复

* [x] 扫描 `miniprogram/utils/api-modules/*.js` 全部 14 个模块的导出与语法

* [x] 发现并修复 `return.js` `salesReturn.reject` 参数传递 bug（`options.params` 不生效）

* [x] 发现并修复 `finance.js` `factoryShipment.listByOrder` 错误端点（`/list-by-order` → `/search`）

* [x] `api.js` 补充导出 `fieldConfig`

* [x] 修复 `field-config.js` 未使用 `raw` import 导致的 ESLint error

* [x] H5 `source-miniapp` + `public/source-miniapp` 同步以上修改

* [x] `node --check` 全部 api-modules 通过；`npx eslint` 0 errors；`mvn compile -q` 通过

### 2026-07-14 销售模块运行时错误修复 + 验证闭环

* [x] 新建 `miniprogram/utils/api-modules/ecommerce.js`，实现 `getSalesStats` / `listOrders`

* [x] `miniprogram/utils/api.js` 导入并导出 `ecommerce` 模块

* [x] 修复 `pages/sales/overview/index.js` 与 `pages/sales/order-list/index.js` 对 `api.ecommerce` 的调用

* [x] 后端 `DictController` 增加 `POST /api/system/dict/list-by-type` 映射，保留 `GET /by-type` 兼容

* [x] 后端 `EcommerceOrderOrchestrator.calcSalesStats` + `EcommerceOrderController.salesStats` 实现销售统计

* [x] 后端 `mvn compile -q` 通过

* [x] 小程序 4 个关键文件 ESLint 0 errors（仅历史 warnings）

* [x] H5 `source-miniapp` + `public/source-miniapp` 与小程序 source diff 一致

### 2026-07-14 样衣开发筛选/搜索/阶段后端联通性修复

* [x] 后端 `PatternProductionOrchestrator.listWithEnrichment` 支持 `status=OVERDUE/WARNING`，按交期过滤并重新分页

* [x] 前端 `sample-development/index/index.js` 删除 `OVERDUE/WARNING` 前端本地过滤，直接传 `status` 给后端

* [x] 修复 `sample-development/detail/index.js` 4 个 ESLint 硬错误

* [x] H5 `source-miniapp` + `public/source-miniapp` + `dist/source-miniapp` 三端同步

* [x] ESLint 0 错误、H5 三端 diff 一致、后端 `mvn compile -q` 通过

* [x] 记录决策 D-038：虚拟状态筛选必须后端过滤并重新分页

* [x] 修复 `sample-development/detail/index.js` `formatNodeTime` iOS 日期解析报错（MM-dd HH:mm 不应 replace 成 MM/DD HH:mm）

* [x] H5 三端同步 iOS 日期解析修复

### 2026-07-12 样衣开发阶段详情数据打通 + H5 三端同步

* [x] 小程序 `stage-detail/index.js` 工艺单/尺寸表/工序配置/码数单价改为调用 PC 端同款 API

* [x] 尺码表按部位×尺码矩阵展示

* [x] 工序配置优先 `styleApi.listProcesses` + 兜底 `patternProcessConfig`

* [x] 生产制单调用 `production.getProductionSheet` 展示完整 BOM/尺码/款式信息

* [x] 码数单价调用 `production.listSizePrices` 按工序×尺码矩阵展示

* [x] H5 `source-miniapp` + `public/source-miniapp` 三份拷贝与小程序完全一致

* [x] H5 `public/source-miniapp/utils/api-modules/production.js` 补充 `getProductionSheet`

* [x] JS 语法检查通过；无新增 `?.` / `padStart`；硬编码颜色未新增

### 2026-07-10 小程序/UI/性能/扫码全量优化日

* [x] iOS 日期格式兼容 + 样衣扫码脱离大货菲号系统

* [x] 性能优化 — 5 处 N+1 查询改为批量查询、7 个 RiskDetector 全表扫描加时间过滤/LIMIT

* [x] 工序进度条显示「完成件数/总件数 · 完成菲数/总菲数」

* [x] 小程序全局 UI 专业化 — 去 emoji、SVG 图标、镂空按钮、蓝色导航、纯色无渐变、卡片阴影

* [x] 字体/按钮/输入框高度统一（12px 主体、24-32px 按钮、32px 输入框）

* [x] 订单详情页图片轮播功能

* [x] 样衣开发详情页与 PC 端数据互通、附件预览下载

* [x] 设计预览页面创建与 6 类问题修复

* [x] 采购/样衣/裁剪/生产管理等多个页面交互 bug 修复

* [x] 样衣开发与采购节点数据联动（quick-edit + stock-check 接口）

* [x] 已关闭订单采购记录过滤修复

* [x] WebSocket 日志级别与后端 500 问题排查

* [x] 采购表格勾选后序号列消失修复（global.css 移除 position/z-index）

* [x] 前端类型检查通过、生产构建通过

* [x] 外发工厂/发货多端逻辑一致性修复（手机端+H5+后端）

### 2026-07-09 出库优化 + 工序阶段修复 + WebSocket修复

* [x] 工序阶段误判修复 — 二次工艺禁用时动态跳过，不再误拦车缝（`ec9b20fd0`）

* [x] 出库仓库/库位选择优化 — 3个出库场景移除选择器，改为显示当前位置（`324ec2b06`）
  * 样衣借出：移除仓库/库位选择，显示当前存储位置

  * 物料出库：移除仓库/库位选择，显示当前位置

  * 成品扫码出库：移除仓库/库位选择，表格增加"当前库位"列

  * 后端统一自动从库存记录获取仓库和库位

* [x] WebSocket修复（3项）— token缺失 / 握手500 / StrictMode双重挂载（`88a782352` + `c356c8660` + `3c26e7bff`）

* [x] RESTful迁移第二批 — 7个Controller + 15个前端/小程序/H5文件（`324ec2b06`）

* [x] Flyway修复 — V202606240001/002/003 MySQL 8.0兼容 + V20260708002表名错误（`ae98091a0` + `afa2d72c0`）

* [x] CI优化 — 门禁job合并 + 变量名修复（`531d7adc1` + `0b4d3e3cd`）

### 2026-07-05 \~ 2026-07-08 高密度问题修复（64 个提交）

* [x] P0：扫码页崩溃打不开修复（`e1902dfdb`）

* [x] P0：订单进度球数据全部不显示修复 — 异步线程租户上下文丢失（`585af8405`）

* [x] P0：订单列表异步线程租户上下文丢失系统性修复（`786310508`）

* [x] P0：扫码按钮点不动 + Flyway CI 校验失败修复（`1e9ef17fb`）

* [x] P0：Flyway 版本号撞车 + V49 非幂等导致迁移链路卡死修复（`1eb11c809`）

* [x] P0：20个P0问题修复 — 数据链路断点+状态码英文+多端不一致（`523efce49`）

* [x] P1：25个P1问题修复 — 多模式覆盖+数据链路+跨端一致性+状态码兜底（`21a03dff5`）

* [x] 扫码模块 20+ 项修复（样衣扫码/大货扫码/扫码页2次整体重做）

* [x] Flyway/迁移 4 项修复（版本号撞车/非幂等/DELIMITER bug/CI校验）

* [x] 小程序 8 项修复（编译报错/状态判断/wx:if/app.json/领取功能/工序保存）

* [x] 裁剪模块 5 项修复（404/领取提示/冗余页面/入口合并）

* [x] 采购模块 7 项修复（弹窗/超领bug/字段补全/封面图/布局对齐）

* [x] 工序跟踪 3 项修复（终态订单/UUID归组/节点时间+iOS日期）

* [x] 中文化/字段一致性 3 项（全系统多端中文化/颜色图片回填）

* [x] 新功能 5 项（数据链路可视化地图/统计卡片/聚水潭对接/字段配置简化/操作日志全链路）

* [x] 补录 memory-bank/activeContext.md（7-05\~7-08 记录，之前滞后到 7-04）

* [x] 创建 TRAE 项目记忆 project\_memory.md（含"记忆同步规则"）

* [x] 小程序样衣开发列表点击不跳转修复（改 `data-item` 为字符串 `data-style-id` / `data-id`）

### 2026-07-04 款式一键复制功能实现完成

* [x] 后端：`StyleInfoOrchestrator.copyStyle()` 补充工序/二次工艺/报价复制逻辑

* [x] 后端：修复 `buildNewStyleFromSource()` 扩展字段复制（sizeColorConfig/洗水唛等）

* [x] 后端：新增 `copyProcessToNewStyle()` / `copySecondaryProcessToNewStyle()` / `copyQuotationToNewStyle()` 方法

* [x] 后端：新增 `StyleQuotationService` / `StyleQuotation` 导入

* [x] 后端编译验证通过（`mvn compile -q` exit code 0）

* [x] 前端：API路径验证正确（`/style/info/${id}/copy`）

* [x] 前端编译验证通过（`npx tsc --noEmit` exit code 0）

* [x] 更新 `memory-bank/activeContext.md` 记录本次变更

***

## 已完成

### 2026-07-02 小云 AI P1 实用能力升级 5 项全部完成

* [x] P1-4 L4 Procedural Memory 完整实现（`SkillCrystallizationService.promoteToProcedural()` + `tryPromoteAsync()`）

* [x] P1-1 Agentic RAG 三阶段闭环（`AgenticRagService.retrieve()` 3 轮自纠正 + LLM 重写 + 启发式评分）

* [x] P1-3 巡检自动执行闭环（`AiPatrolJob.performAutoAction()` 创建真实任务 + 微信通知）

* [x] P1-2 NlQuery 完成（`NlQueryTool` @AgentToolDef 升级 + @DataTruth 修正）

* [x] P1-5 Hermes Learning Loop（`AgentLoopEngine` qualityScore 接入 SelfCritiqueGate + `recordFeedback()` 反馈回写 + 新事件类型）

* [x] 后端编译验证通过（`mvn compile -q -pl .` exit code 0）

* [x] 更新 `memory-bank/activeContext.md` 记录本次变更

* [x] 添加决策 D-032（小云 AI P1 五项实用能力升级）

### 2026-07-02 新增 P0 #23 MCP 工具强制调用规则（配置 ≠ 自动调用）

* [x] `.trae/rules/project_rules.md` 新增 P0 #23（10 个强制场景 + 降级规则 + tenantId 规则 + 例外清单）

* [x] `.trae/rules/agent-workflow.md` 嵌入 MCP 强制调用（第1/3/5/6步）

* [x] `memory-bank/mcp-tools-cheatsheet.md` 顶部新增 P0 #23 强制场景表

* [x] 更新 `memory-bank/activeContext.md` 记录本次变更

* [x] 添加决策 D-031（P0 #23 MCP 工具强制调用规则）

### 2026-07-02 MCP 工具体系全面优化（调研 + 配置 + 文档同步）

* [x] 调研 GitHub 2026 最火 AI 工具（MCP/Skill/Agent），4 方向并行核实

* [x] 创建 `.trae/mcp.json`（含 6 自研 MCP + Serena，之前缺失）

* [x] 接入 Serena（uvx）替代未实现的 code-search-mcp

* [x] 更新 `memory-bank/mcp-tools-cheatsheet.md`（决策树 + 36 工具清单 + Serena）

* [x] 更新 `.trae/rules/dev-mcp-design.md` 状态（设计 → 已实现 6/7）

* [x] 同步 `.trae/mcp-servers/MCP_CONFIG_TEMPLATE.md`（5 → 7 MCP + GitHub 可选）

* [x] 更新 `memory-bank/activeContext.md` 记录本次变更

* [x] 添加决策 D-029（Serena 替代 code-search-mcp）+ D-030（MCP 配置统一管理）

### 2026-06-23 系统全面体验优化（8大模块）

**背景**：用户反馈"线上经常出问题""操作不好用""信息不清晰"，全面梳理并按P0/P1/P2优先级批量修复。

* [x] 🔴 P0-1：数据库性能加固
  * t\_scan\_record新增9个多租户联合索引（tenant\_id前缀）

  * 慢查询告警阈值从1000→500，新增慢查询比例监控（>1%告警）

  * Flyway迁移：V20270623001\_\_add\_scan\_record\_tenant\_indexes.sql

* [x] 🔴 P0-2：AI接口超时对齐
  * AI\_VISION\_TIMEOUT\_MS从30s→60s

  * 3个AI识别接口全部显式配置60s超时

* [x] 🔴 P0-3：加载状态+防重提交
  * 5个高频页面（成品库存/原料库存/订单列表/用户列表）增加双重防御

  * UI loading + useRef逻辑锁

* [x] 🟡 P1-1：错误提示友好化
  * GlobalExceptionHandler 5种异常提示改为用户友好文案

  * 前端新增showErrorWithRetry（带重试按钮的错误通知）

* [x] 🟡 P1-2：交互一致性规范
  * 6个核心页面分页默认值统一为20

  * 10个页面成功提示/危险确认弹窗全部符合规范

* [x] 🟡 P1-3：表单草稿自动保存
  * 新增useFormDraft Hook（300ms防抖+localStorage+7天过期）

  * 订单创建/款号新增/采购申请3个长表单集草稿保存与恢复

* [x] 🟢 P2-1：信息层级优化
  * 7个核心表格空状态增加"去创建"操作引导

  * 13处日期格式统一

  * 工资结算页面统计卡片视觉突出

* [x] 🟢 P2-2：视觉降噪
  * 定义6色状态CSS变量系统

  * 10个核心页面状态标签颜色统一收敛

* [x] 后端 mvn compile BUILD SUCCESS

* [x] 前端 npx tsc --noEmit 0 errors

* [x] Flyway SQL校验：新增迁移幂等性通过

* [x] 多租户隔离审计：本次修改未引入新风险

* [x] 更新 memory-bank/activeContext.md + progress.md

### 2026-06-23 权限系统大牌水准优化

**背景**：用户要求"优化到大牌的水准，比他们的系统要好用更简单，租户开户就马上知道怎么使用"。

* [x] 新租户开户向导 - TenantSetupGuide 组件（RoleList/index.tsx 集成）

* [x] 预设角色模板 - 7个模板已就绪（管理员/跟单员/仓库管理员/财务/质检/生产主管/裁剪师傅）

* [x] 数据权限维度验证 - all/team/own + factoryId 供应商隔离

* [x] 供应商数据隔离验证 - SupplierPortalController 完整实现

* [x] 权限矩阵可视化验证 - RoleList 页面功能完善

* [x] TypeScript 错误修复 - TenantSetupGuide.tsx res.message 类型问题

* [x] 编译错误修复 - RoleTemplateController.java Result.error → Result.badRequest

* [x] 后端编译验证 - mvn compile BUILD SUCCESS

* [x] 前端编译验证 - npx tsc --noEmit 0 errors

### 2026-06-20 小云AI 6大升级 + 开发效能体系

**借鉴来源**：Ruflo Truth Scoring / Claude Agent SDK / RooFlow Context Portal / GenericAgent / Hermes GEPA / SIJE 7-Agent / Agency-Agents 215角色

* [x] 🔴 P0-1：SelfCritiqueGate 多视角对抗评审
  * 新增 MultiPerspectiveCritic.java（285行，4视角并行：业务30%+数据30%+租户25%+权限15%，一票否决）

  * 新增 AdversarialJudgePipeline.java（215行，高风险场景Round 2验证+HighRiskDetector）

  * 新增 ConvergenceStopCondition.java（88行，连续2轮提升<5分停止）

  * 修改 SelfCritiqueGate.java（177→298行，集成多视角+对抗+收敛）

* [x] 🔴 P0-2：MCP 生产化
  * 新增 McpResourceSanitizer.java（95行，防prompt injection）

  * 新增 McpIdentityContext.java（113行，身份传播值对象）

  * 新增 McpToolError.java（130行，SERF结构化错误5类码）

  * 新增 McpTimeoutBudget.java（70行，ATBA自适应超时QUERY/REPORT/COMPUTATION）

  * 修改 McpResourceProvider接口（+默认方法向后兼容）+ 3个Provider实现 + McpProtocolService + 2个Controller

* [x] 🔴 P0-3：Memory Bank 数据库化（ConPort 模式）
  * Flyway V202606201003（t\_memory\_bank\_entry + t\_memory\_bank\_relation 两表）

  * 新增 MemoryBankEntry/Relation Entity + Mapper（含CTE递归traverseGraph）

  * 新增 MemoryBankDbService.java（274行，upsert/semanticSearch/addRelation/importFromMarkdown）

  * 新增 MemoryBankRelationService.java（76行，知识图谱遍历depth≤2）

  * 新增 MemoryBankMigrationRunner.java（132行，启动时Markdown→DB迁移，Redis幂等）

  * 修改 MemoryBankService（双写兼容）+ EvolutionOrchestrator（D-021指标）

* [x] 🟡 P1-1：Skill 三层渐进式披露
  * Flyway V202606201001（t\_skill\_template新增6字段：metadata\_yaml/skill\_md/references\_json/token\_budget/disclosure\_level/disclosure\_updated\_at）

  * 新增 SkillDisclosureLoader.java（195行，三层按需加载+token估算+旧数据降级）

  * 新增 SkillDisclosureController.java（95行，REST API三层查询）

  * 修改 SkillTemplate Entity（+6字段）+ SkillAutoCreationService（生成三层）+ SkillExecutionTool（按需加载）

* [x] 🟡 P1-2：技能结晶化 + GEPA 遗传优化
  * Flyway V202606201002（t\_prompt\_optimization表）

  * 新增 SkillCrystallizationService.java（239行，高频问题Redis语义哈希计数→结晶化→跳过LLM）

  * 新增 GepaPromptOptimizer.java（337行，17个prompt块当基因，遗传算法种群10/代数≤5）

  * 新增 ConstraintGates.java（193行，三重门控：尺寸/语义漂移/测试套件）

  * 新增 EvolutionEventLogger.java（169行，events.jsonl append-only审计）

  * 修改 EvolutionOrchestrator（D-021注册3新组件+指标+健康检查）

* [x] 🟡 P1-3：服装专属 Skills（10个）
  * scan-flow-expert / wage-settlement-guard / tenant-isolation-auditor / delivery-forecast-advisor / supplier-risk-agent / quality-inspection-advisor / production-scheduling-advisor / cost-negotiation-advisor / fabric-sourcing-strategist / compliance-checker

  * 路径：.trae/skills/<name>/SKILL.md（每个80-115行）

* [x] 🟢 P2-2：per-call model selection + 成本爆炸防御
  * 新增 ModelSelectionRouter.java（242行，ECONOMY/STANDARD/PREMIUM三级，四维评估）

  * 新增 CostExplosionGuard.java（307行，上下文肥大+重复检测+熔断）

  * 修改 AiInferenceRouter（+chatWithModelSelection/+chatPremium）+ AiAgentOrchestrator（接入防御）+ EvolutionOrchestrator（D-021）+ application.yml（配置块）

* [x] 🟢 开发 skills 补充（8个）
  * orchestrator-scaffolder / tenant-isolation-auditor / transaction-boundary-checker / ai-tool-scaffolder / skill-scaffolder / mcp-resource-scaffolder / prompt-block-optimizer / evolution-component-scaffolder

  * 路径：.trae/skills/<name>/SKILL.md（每个108-141行）

* [x] 🟢 开发 MCP 服务器设计文档
  * 新增 .trae/rules/dev-mcp-design.md（410行）

  * 4个MCP：db-query-mcp / flyway-mcp / test-runner-mcp / code-search-mcp

  * 含工具清单/多租户安全/技术栈/集成方式/实施路线图

* [x] 后端 mvn compile BUILD SUCCESS（全部模块编译通过）

* [x] Flyway 迁移脚本 V202606201001/V202606201002/V202606201003 校验通过

* [x] EvolutionOrchestrator D-021 合规（17组件全部注册：原12 + 新5）

* [x] 新增铁律 D-022（多视角对抗评审强制启用）+ D-023（MCP resource description 必须 sanitize）+ D-024（Memory Bank 数据库化）+ D-025（per-call model selection 强制启用）

* [x] 更新 memory-bank/activeContext.md + decisionLog.md + progress.md

* [x] 新建 optimization-log-20260620.md

### 2026-06-19 Controller 事务边界全面治理 + 文档体系更新

* [x] 🔴 P0-1：PatternRevisionController → PatternRevisionOrchestrator 化（save/update/remove 全部下沉

* [x] 🔴 P0-2：PatternProductionController → PatternProductionOrchestrator 化

* [x] 🔴 P0-3：ProductionOrderNodeController → ProductionOrderOrchestrator.saveNodeOperations

* [x] 🔴 P0-4：SupplierUser / SupplierPortal Controller → SupplierUserOrchestrator 化

* [x] 🔴 P0-5：MaterialPickingController.audit() → MaterialPickingOrchestrator.audit

* [x] 🔴 P0-6：PaymentCallbackController → PaymentCallbackOrchestrator 化

* [x] 🔴 P0-7：AiMetricsOrchestrator.generateSnapshot() 加 @Transactional

* [x] 🔴 P0-8：ClosedOrderAiDataCleanupService 加 assertTenantOwnership 租户校验

* [x] 🟡 P1-1：GlobalExceptionHandler 新增 SecurityException 处理器（403 + 友好提示）

* [x] 🟡 P1-2：文档全面更新（decisionLog / productContext / project\_rules / mcp-tools-cheatsheet）

* [x] 🟡 P1-3：新建 optimization-log-20260619.md（完整记录本轮治理

* [x] 🟢 P2-1：新增 memory-bank-updater Skill（.trae/skills/memory-bank-updater/SKILL.md）

* [x] 🟢 P2-2：新增 ci-rollback Skill（.trae/skills/ci-rollback/SKILL.md）

* [x] 后端 mvn compile BUILD SUCCESS（编译验证）

* [x] 更新 memory-bank/activeContext.md + decisionLog.md + progress.md

### 2026-06-18 小云AI CL4R1T4S 借鉴升级（6项优化）

* [x] P0-1 SelfCritiqueGate 输出前硬门控（PASS/SOFT\_FAIL/HARD\_FAIL 三档决策）

* [x] P0-2 memory\_limitations 上下文块（四层记忆边界声明）

* [x] P0-3 响应延迟优化（PostTurnHooks异步 + 线程池扩容 + 缓存阈值降低 + Checkpoint异步 + MAS缓存）

* [x] P1-1 HIGH\_RISK 工具 opt-in + 7条反例规则（结构化suggest + TTL 60→300）

* [x] P1-2 上下文块意图动态优先级（IntentBasedPriorityRouter）

* [x] P2-1 EvolutionOrchestrator 统一12组件 + 量化评估 + 补MemoryNudge @Scheduled

* [x] P2-2 MCP resources 启用（memory:// knowledge:// factory:// + 3个ResourceProvider）

* [x] 后端 mvn clean compile -q BUILD SUCCESS（3次验证）

* [x] 更新 memory-bank/activeContext.md + decisionLog.md + progress.md

* [x] 新建 optimization-log-20260618.md

* [x] 新增铁律 D-020（MCP resources 多租户隔离）+ D-021（自我进化组件统一可观测）

### 2026-06-11

* [x] 🔴 安全修复：微信支付回调验签逻辑不完整 → 使用 wechatpay-java SDK 实现正确验签

* [x] 🔴 安全修复：WechatPayAdapter.verifyCallback() 直接返回 false → 实现完整的 SDK 验签

* [x] 🟡 安全修复：数据库密码未校验 → 生产环境强制要求配置密码

* [x] 🟢 安全增强：IntegrationHttpClient 添加 HTTPS URL 强制校验

* [x] 🔧 修复：SampleWorkflowTool.saveSampleReview() 参数不匹配问题

* [x] 后端 mvn compile BUILD SUCCESS

* [x] Flyway SQL 校验通过

### 2026-06-01

* [x] 🔴 P0修复：getByOrderNo() 无 tenant\_id 过滤 — 跨租户数据泄露

* [x] 🔴 P0修复：createOrderFromStyle() 未显式设置 tenant\_id

* [x] 🔴 P0修复：PurchaseCartOrchestrator addItem/updateItem 添加 @Transactional

* [x] 🔴 P0修复：PurchaseDetailView\.tsx specification→specifications 字段名修正（4处）

* [x] 🔴 P0修复：ProductionOrderController updateBasicInfo() 多表更新添加 @Transactional

* [x] 🔴 P0修复：ProductionOrderController quickEdit/urge/urgeReply 添加 @Transactional

* [x] 🟡 P1修复：PurchaseCartController 添加 @PreAuthorize

* [x] 🟡 P1修复：ProductionOrderController detail()/flow()/timeline() 添加 TenantAssert

* [x] 🟡 P1修复：ProductionOrderController healthScores() IDOR 修复（过滤租户归属）

* [x] 采购车系统全链路（后端Orchestrator/Service/Controller + 前端组件/Hook/API + 小程序同步）

* [x] 样衣开发展开视图 + 采购快捷操作

* [x] ResizableTable 增强

* [x] 小程序全量 var→const 重构 + 页面优化

* [x] 补写 2026-05-12/13 优化日志

* [x] 补写 2026-06-01 优化日志

* [x] 更新 memory-bank（activeContext + progress + decisionLog D-012/D-013/D-014）

* [x] 后端 mvn compile BUILD SUCCESS

* [x] 前端 npx tsc --noEmit 0 errors

### 2026-05-29

* [x] 自动化测试缺口分析：审查近期代码变更，识别3个缺少测试覆盖的核心模块

* [x] 新增测试：WarehouseLocationOrchestratorTest（11个测试用例）
  * P0 SQL语法错误修复验证：空标识符集合返回空列表，不执行SQL查询

  * 有效标识符查询入库记录并更新usedCapacity

  * 创建/批量初始化/容量更新等核心路径

* [x] 新增测试：GraphRagServiceTest（10个测试用例）
  * 知识图谱上下文构建：空消息、无匹配关键词、无实体、空结果

  * 关系链格式化输出、关系类型翻译（MANUFACTURED\_BY等）

  * 数据库异常静默处理、实体去重

* [x] 新增测试：FactoryProfileLearningServiceTest（7个测试用例）
  * 工厂画像上下文：无数据、格式化表格、低评分预警、S/A级推荐

  * 工厂名称截断、null值默认值处理、数据库异常静默处理

* [x] 测试验证：28个新测试全部通过（BUILD SUCCESS）

* [x] 确认 TenantAiConfigService 已有完整测试覆盖（无需新增）

### 2026-05-28

* [x] 小云AI 9大智能化升级（全部3轮）深度审查 + 7项修复

* [x] 🔴 修复 AgentCheckpoint 实体冲突 — 删除 agent/checkpoint/AgentCheckpoint.java，transient 字段合并到 entity 版本

* [x] 🔴 修复 AgentCheckpointManager — 正确 import intelligence.entity.AgentCheckpoint + intelligence.mapper.AgentCheckpointMapper

* [x] 🔴 修复 AgentLoopEngine — import 切换到 intelligence.entity.AgentCheckpoint

* [x] 🔴 修复 AgentCheckpointManager selectCount().intValue() 类型转换

* [x] 确认 HandoffEngine/SubAgentRegistry/Skill YAML 无其余问题

* [x] 后端 mvn compile BUILD SUCCESS, 0 errors

* [x] 前端 npx tsc --noEmit 0 errors（1项预存测试错误，与本次无关）

* [x] memory-bank 更新

* [x] 小云AI 6大智能化升级 — 上下文工程系统（工具结果智能摘要）

* [x] 小云AI 6大智能化升级 — 结构化输出（JSON置信度+行动建议）

* [x] 小云AI 6大智能化升级 — 多层级记忆引擎（工作中/情景/语义）

* [x] 小云AI 6大智能化升级 — 主动风险检测（7类业务风险扫描）

* [x] 小云AI 6大智能化升级 — Prompt进化系统（自进化提示词）

* [x] AgentLoopEngine 集成全部6个新Service

* [x] xiaoyun-base-prompt.yaml 提示词升级（规划先行+结构化输出+智能增色）

* [x] PromptEvolutionService 编译错误修复（@Getter + 5缺失方法 + getDeleteFlag）

* [x] 后端 mvn compile BUILD SUCCESS, 0 errors, 0 Checkstyle violations

* [x] 前端 npx tsc --noEmit 0 errors

* [x] memory-bank 全面更新

### 2026-05-13

* [x] 订单号生成格式统一：SerialOrchestrator/ProductionOrderServiceImpl/ProductionOrderCommandService 三入口统一为 PO+yyyyMMddHHmmss

* [x] ProductionOrderCommandService 添加唯一性检查（JdbcTemplate 绕过逻辑删除）

* [x] 前端 OrderCreateModal placeholder 更新为 PO20260513143025

* [x] 小程序 fallback 从 ORD+Date.now() 改为 PO+yyyyMMddHHmmss

* [x] 编译验证通过：后端 mvn compile + 前端 tsc --noEmit 0 errors

* [x] 测试缺口分析：审查最近代码提交，识别4个缺少测试覆盖的核心模块

* [x] 新增测试：OrderDeliveryRiskOrchestratorTest（8个测试用例）

* [x] 新增测试：ProductionProgressToolTest（2个测试用例）

* [x] 新增测试：SystemOverviewToolTest（4个测试用例）

* [x] 新增测试：DeepAnalysisToolTest（4个测试用例）

* [x] 测试验证：18个新测试全部通过（BUILD SUCCESS）

### 2026-05-12

* [x] P0修复：扫码撤回工资结算拦截（ScanUndoHelper + settlementStatus检查）

* [x] P1修复：ScanRecordOrchestrator.undo()添加@Transactional

* [x] P1修复：MaterialStockMapper lockStock/decreaseStockWithCheck可用量检查

* [x] P1修复：PayableMapper atomicAddPaidAmount原子更新

* [x] P1修复：WagePaymentOrchestrator原子更新替代read-modify-write

* [x] P1修复：MaterialPurchaseMapper atomicAddArrivedQuantity原子更新

* [x] P1修复：MaterialInboundOrchestrator原子更新arrivedQuantity

* [x] P1修复：ProductWarehousingRollbackHelper入库回退工资结算拦截

* [x] P1修复：ShipmentReconciliationOrchestrator扫码成本计算统一过滤

* [x] P1修复：V20260512003唯一索引加入tenant\_id

* [x] P1兼容性修复：前端cutting/by-code GET→POST

* [x] P2兼容性修复：小程序material/roll/list-by-inbound GET→POST

* [x] 测试修复：MaterialInboundOrchestratorTest mock对齐（lenient + 双次返回值）

* [x] 全面系统测试完成：2781单元 + 315集成 + 22并发/幂等 = 0故障

* [x] 集成5大AI Agent方法论到开发流程

### 2026-05-05

* [x] P0修复：PC端AI助手消息空白（useAiChat.ts防御式消息创建）

* [x] 小云AI自我进化系统（SelfCriticService + QuickPathQualityGate + DataTruthGuard 5级 + DynamicFollowUpEngine + RealTimeLearningLoop）

* [x] 误报治理：StatusTranslator补全映射 + 提示词增加订单终态精确区分

* [x] Flyway修复：V20260505001版本号重复 + V20260308b表名冲突

* [x] AgentLoopEngineTest补充Mock

### 2026-05-03

* [x] P0修复：部署后全站404白屏（index.html内联恢复脚本 + nginx修复 + try\_files修复）

### 2026-05-02

* [x] V202605020932 VIEW迁移失败修复

* [x] SmartRemark巡检remarks字段溢出修复

* [x] 扫码记录tenant\_id为NULL修复

* [x] V202605021000 Flyway迁移失败修复

* [x] Flyway版本号重复修复

* [x] 10处旧式API端点迁移RESTful

* [x] REGEXP编码修复兼容MySQL 8.0

* [x] t\_factory索引修改修复

* [x] DbColumnDefinitions新增38列覆盖

* [x] DbTableDefinitions新增6张表定义

* [x] 8处Service层@Transactional违规移除

* [x] 前端WagePayment 22处中性色替换

## 当前任务

* [ ] PC端样衣详情页其他 Tab 改造（颜色规格/工艺说明/样品节点/设计状态/同类资料）— 等用户下一步指令

## 待办

* [ ] PC端样衣详情页其他 Tab 按截图改造（颜色规格/工艺说明/样品节点/设计状态/同类资料）

* [x] 手机端/H5 端是否需同步 D-058\~D-067 近期更新（2026-08-14 全量核实：全部向后兼容，mobile 零改动；领料锚点 mobile 早已兼容；H5 两份副本 diff 一致）

* [x] 全端术语统一 SKU→商品编码 / BOM→物料清单（2026-08-14：小程序13文件17处 + 两份H5副本同步；PC 扩大范围 62 文件 120+ 处——纠正上轮 glob 漏检导致的"PC零残留"误判，tsc 通过，详见 D-068）

* [x] 样衣详情颜色图片预览 Bug（双预览层叠加）修复（2026-08-14：StyleSkuColorImages 关闭 antd 内置 preview，Modal 限高 65vh）

* [x] 生产要求(description)被BOM操作日志污染根因修复（2026-08-14 D-069：日志迁 t\_style\_operation\_log + Flyway V202708143000 清洗 + 生产Tab操作记录面板；待本地启动验证 Flyway 效果）

* [ ] 小云AI全链路测试（规划引擎+结构化输出+主动风险检测实际效果验证）

* [x] 打印/列表/字典全系统同步 D-058 新字段结构（D-062：打印BasicInfoSection重对齐+设计师改读designer+6处旧标签同步，tsc 0 errors）

* [x] 样衣列表统计8vs6修复+进度球可见即刷（D-063：统计Tab下推后端onlyInProgress/onlyCompleted/onlyDelayed+fetchList合并语义+45s轮询，前后端编译通过）

* [x] P1性能：MaterialPurchase统计查询DATE()函数索引失效（291d42b55）

* [x] P1性能：订单列表查询添加缓存（已接入OrderListCacheHelper）

* [ ] P2：@Version与手写原子SQL混用风险统一

* [ ] P2：前端移除xlsx重复依赖

* [ ] P2：vendor-react-antd chunk拆分

* [x] P2：RESTful迁移第二批（cutting-task/by-style-no等）

* [ ] 前端硬编码颜色值批量替换（\~555处中性色）

* [ ] Service层@Transactional违规治理（剩余62处，需逐个分析调用链）

* [x] 打印预览与详情页字段对齐（D-084 2026-08-16：板类 translatePlateType 回退原值修"未知"+生产要求打印防御清洗日志行；商品类型/款式特征链路核实完好属部署环境陈旧，详见 decisionLog）

* [x] 属性库通用化+打印二维码右上角缩小+BOM图放大（D-085 2026-08-16：AttributeGroupLibraryModal迁common泛化groups可配置；打印QR 80→42右列顶右上角/主图90→120/BOM图40→64；PUT 400本地实测200定性为部署环境旧后端，需更新部署后端+Flyway）

### 2026-06-20 测试闭环（已完成）

* [x] 测试闭环：5389 tests, 0 failures, 0 errors（从 122 失败修复到 0）

* [x] 主代码 bug 修复 5 个：
  * EcStockSyncEventListener/EcSyncJob 添加 @ConditionalOnProperty（条件Bean依赖者未加条件注解）

  * GepaPromptOptimizer 拆分 @Scheduled 带参方法（Spring 禁止 @Scheduled 带参数）

  * DagExecutor 并行任务用 state 副本（HashMap 并发写入 bug）

  * ScanUndoHelper 提取 safeRecomputeProgress（异常传播导致撤销返回失败）

* [x] 测试配置修复：application-test.yml 添加 allow-bean-definition-overriding

* [x] 测试文件修复 13 个（Service/Controller/集成测试 mock 缺失与断言修正）

* 详见 `.trae/rules/optimization-log-20260620.md` 第十五章

### 2026-07-08 二次工艺筛选 + 菲号显示修复（`bee543b48`）

* [x] 二次工艺筛选去混入尾部子工序 — `riskBadgeRenderers.tsx` 使用 `isSecondaryProcessSubNode` 过滤

* [x] 菲号显示带订单号信息 — `useProcessTrackingColumns.tsx` 接收 `orderNo`，纯数字 bundleNo 拼接订单号

### 2026-08-16 系统设置三页布局优化（人员/岗位/组织架构，对齐 \_SPEC 设计稿）

* [x] 人员管理：StatsBar 4 KPI 卡片 + 工号 employeeNo 全链路（Flyway V202708161400 + 前后端）+ 手机号脱敏 PhoneCell + 行内操作对齐

* [x] 岗位管理：左侧岗位卡片补"N 人 · N 权限点"指标 + 右侧双栏（菜单权限矩阵/数据权限 4 级）+ 底部关联人员内嵌预览

* [x] 组织架构：KPI 改部门/团队/总人数/平均团队 + 右侧子部门卡片网格（点击下钻）

* [x] 验证：tsc 0 错误 + mvn compile EXIT=0（24 文件 +761/-257）

* [ ] 部署后验证：Flyway employee\_no 加列 + 三页布局端到端

## 2026-08-30 D-228 / D-228b 成品仓库新入库款不显示（已修复并线上验证）

**状态**：✅ 已完成并部署上线（CI 全绿，含 P0 冒烟门控）

**线上实测结果**：

* 入库列表 `skuCode` 字段已返回，前 50 条 **50/50** 均有完整直拼编码

* 成品仓库 BR26X1K0651A：6 行（XS/S/M/L/XL/XXL）**各 22 件、共 132 件**

* SKU 总行数 52 → 144（+92 行），其他新入库款一并恢复

* 同款同色同码重复组 = 0，无库存翻倍

**关键发现（供后续排查参考）**：

1. D-224/224b/224c/226/227 五轮"推送了但没变化" → D-227 **从未部署**（CI cancelled + 后端测试 NPE → deploy skipped）
2. D-227 即使上线也不生效：改错方法副本 + 编码仍是横线格式 + Runner SQL 引用不存在的 `pw.color/pw.size`
3. D-227 存在双重累加 P0（若上线新入库库存翻倍），已收敛为单一入口
4. 出库侧 3 处同样的横线编码 bug（出库扣不到库存）一并修复
5. 入库列表 `.select(...)` 显式列清单漏选 `sku_code` → 前端拿不到真实编码而被迫拼装假编码

**待办**：

* 46 个历史横线格式编码（款式档案旧数据）尚未归一化；因 upsert 有"按款色码二次查找"兜底，
  库存归集正确，仅显示格式不统一，不影响功能

* 前端列表编码列拼接 bug：`HYY202601111` 显示为 `HYY2026011111黑色-XL`（多一个字符 + 横线格式），
  需核查 D-226 前端补编码列的拼装逻辑

* 本地 `SmartSourcingListOrdersRegressionTest.java`（untracked，引用不存在的 `TestRedisConfig`）
  已移至 `/tmp/bak_tests/`，待确认是否彻底删除


### 2026-08-31 D-256 物料采购属性空显根治（颜色/尺码/成分/克重/幅宽）
- [x] 查询时 BOM 兜底回填（MaterialPurchaseQueryHelper.enrichMissingFromBom）
- [x] 单色订单颜色兜底 + 前端尺码"全码"兜底
- [x] scripts/backfill_material_database_from_bom.sql（生产库待执行）
- [ ] 生产库执行回填 SQL；推送后回归验证采购列表/订单弹窗属性显示

### 2026-09-01 D-257 样衣列表/详情子工序进度不一致根治
- [x] 共享模块 sampleProcessTimeline.js 单点收敛，两页同源渲染
- [x] 列表页展开显示子工序+领取人+时间+单价，与详情页一致

### 2026-09-01 D-258 采购状态文案统一"已领取"
- [x] PC+小程序 8 处；数量类"已采购量"明确不改

### 2026-09-02 D-267 面辅料采购→结算全链路梳理
- [x] 五道关卡数据流地图（含代码位置）
- [x] backfillFromPurchases 跨租户(P0)+LIMIT5000 修复
- [ ] 用户线上跑「补生成对账」后回归；确认其"内部订单"真实 factory_type

### 2026-09-03 D-284 工序时间口径修正 + 小程序耗时/等待展示
- [x] 后端 flow stages 全量输出 lastTime（真实末扫时间，completed 分支原先不吐）
- [x] procTimeline.js：结束时间改末扫口径 + 耗时/停留/等待计算 + 等待 60s 计时
- [x] 生产管理(dashboard) / 外发管理(factory/shipment) 双页展示，文案与配色对齐 PC
- [x] 三副本同步（js/wxml 覆盖 + wxss 片段插入）+ node --check + 标签栈校验 + mvn compile
- [ ] 真机验收：展开订单确认「开始/末扫/耗时/停留/等待」与 PC 进度看板一致

### 2026-09-03 D-285 撤销页内开关 + 单价全局开关收敛到权限配置页
- [x] 删两页「时间/单价」「单价」chips 及 JS 开关方法；时间恢复恒显示（含耗时/停留/等待，不受控制）
- [x] 权限配置页（menu-role-config）新增「全局显示开关→工序单价显示」（租户老板/超管可见）
- [x] procTimeline.js 时间开关逻辑下线；两页单价只读生效
- [x] 三副本同步（8 文件 md5 唯一值=1）+ node --check + WXML 标签栈校验 + 旧开关逻辑零残留扫描
- [ ] 真机验收：页面无任何 chips；时间恒显示；权限配置页切换单价后两页生效

### 2026-09-03 D-285 热修复：等待计时器在未加载阶段数据时崩溃
- [x] refreshWaitDurations 对 gapText 为 undefined 的节点（未懒加载阶段时间）跳过；null/undefined/空数组/单节点边界全防御
- [x] 三副本同步 + 边界用例实测通过；开发者工具复现场景已消除

### 2026-09-03 D-285 补充修复
- [x] 发现第四副本 h5-web/dist/source-miniapp（构建产物，之前一直漏同步），已同步全部改动文件
- [x] dashboard/shipment onShow 重拉租户单价开关（修复"权限配置页切完返回不生效"）
- [ ] 用户反馈 navigateTo menu-role-config "未注册"：app.json 三/四副本均已注册、文件齐全 → 判断为 devtools 热重载缓存，待用户清缓存重编译验证

### 2026-09-03 D-285 根因定位：「权限配置」页导航失败
- [x] 排查：app.json 四副本均已注册、页面文件齐全、packOptions 无忽略、devtools 确认打开 miniprogram/ 工程
- [x] 根因 = miniprogram/project.private.config.json 的 setting.ignoreDevUnusedFiles: true（「过滤无依赖文件」），
      safeNavigate 动态字符串跳转的页面被静态依赖分析误剔出编译产物 → navigateTo 报"未注册"
- [x] 已改 ignoreDevUnusedFiles: false；用户需在工具 详情→本地设置 确认该项未勾选后重编译

### 2026-09-04 D-290 样衣详情页多模块数据对接不上 PC
- [x] 修 ok() 解包反模式：附件/款式备注/备注日志 5 处恒空（新增 toArray 统一归一化）
- [x] 修附件上传：改 wx.uploadFile multipart 直传 /api/style/attachment/upload（原 /api/file/upload 不存在）
- [x] 后端新增可选 fileName 参数 + sanitizeFileName（修小程序上传后文件名变 tmp_xxx）
- [x] 附件下载/预览加 token 鉴权（图片 previewImage，其它 openDocument + showMenu）
- [x] 尺寸表对齐 PC：splitStyleOptions 拆合并码 + sortSizeNames 排序
- [x] 纸样 tab 改用 JS 预算的 patternFileList（修"有数据但整片空白"）；_srcIndex 防点击错位
- [x] _loadBomAndSizes 无 styleId 时结束 loading（修三 tab 永久转圈）
- [x] 四副本同步（js/wxml 覆盖 + wxss 片段插入）+ mvn compile/test-compile + node --check + 标签栈校验
- [ ] 真机验收：附件/纸样/备注/尺寸表与 PC 一致；上传附件文件名正确

### 2026-09-04 D-291 样衣详情页去重 + 无资料下单直达表单
- [x] 附件去重：删底部「附件文件」区块，上传按钮移入「附件」tab 头部，只显示一份
- [x] 备注去重：删 tab「备注日志」（含 _loadPatternRemarks 全套），只留底部「款式备注」
- [x] 无资料下单直达：no-data-create 直接 redirectTo form?noData=true（原跳列表页）
- [x] create 页下线方式一选图区块与三个相关函数，noData tab 只留"从已有款式下单"
- [x] form 页新增款式图选填上传（chooseMedia 优先+chooseImage 降级+权限引导），不传图可下单
- [x] 四副本 8 文件同步（md5 唯一值=1）+ node --check + 12 份 WXML 标签栈 + 表达式扫描 0
- [ ] 真机验收：附件/备注单份展示；无资料下单直达表单、图可选、下单后订单详情可见款式图

### 2026-09-07 D-313 小云待办覆盖领取类任务全量（待推送）
- [x] 采集上限每类 10→100（原个人领取>10 条后面任务消失）
- [x] 样衣开发按 7 环节展开任务化：pattern/bom/size/process/production/secondary/sizePrice，口径=领取人非空 && 未完成；新增 addStyleStageTask + STY_{id}_{stage} 深链 /style-info/{id}?tab=xxx
- [x] 样衣详情 ?tab= 深链断链修复（URL tab 映射到 bomAreaTabKey，尺寸表→pattern、码数单价→process）
- [x] 新增外发收货 SHIPMENT / 样衣借还 SAMPLE_LOAN（assigneeId=borrowerId）/ 领料出库 MATERIAL_PICKING（assigneeId=pickerId）三类 collector
- [x] mvn compile EXIT=0 + tsc 0 错误
- [ ] 遗留待拍板：merchandiser/xxxAssignee 仅存姓名无用户ID，需补 xxxAssigneeId 落库根治

### 2026-09-07 D-314 小云个人创建任务可追踪（待推送）
- [x] 根因：t_collaboration_task 无创建人字段；createTask 取 userId/username 未落库；getMyTasks 对 MANUAL 全放行无"我创建的"视图；全域待办未采集协作任务
- [x] Flyway V202609070001：加 creator_id/creator_name + idx_collab_creator；createTask 落库创建人
- [x] my-tasks 新增 scope=created/mine 追踪视图（scope 模式全量含已完成，默认行为不变）
- [x] PendingTaskOrchestrator 新增 collectCollaborationTasks：我创建/我领取+未完成并入全域待办，深链 xiaoyun://tasks（前端 TaskAggregationPanel 识别协议打开任务面板）
- [x] TaskListView 新增「全部/我创建的/我领取的」筛选 + 卡片创建人徽标；TaskItem 补 creatorName/creatorId
- [x] 验证：mvn compile EXIT=0 + tsc 0 错误

## 2026-09-23 D-515 物料中心 tab 去重（小程序）✅ 已推送 c514e7dcc
- [x] 顶部 sticky-search-bar 只在「库存」tab 显示（消除双重搜索框/双扫码入口）
- [x] 领料默认状态 pending → 全部（D-099 后内部领料领取即出库，默认待出库恒空）
- [x] 库存 tab 补分页（加载更多 + onReachBottom）→ 删除孤儿页 material-inventory/index + app.json 摘除
- [x] 待办领料深链去掉 ?status=pending
- [x] h5-web 两份镜像已 sync；test-warehouse-pages.mjs 补 5 条回归断言（172 项全通过）
- [ ] 待用户：微信开发者工具上传小程序后真机验收（服务器 autodeploy 只重建 backend/frontend，
      小程序改动不会触发服务器构建，登录页部署版本号也不会变，属正常）

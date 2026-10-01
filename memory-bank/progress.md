# 进度跟踪

> 本文件由 AI 助手自动维护，记录项目开发进度
> ⚠️ **本文件只保留近 30 天**：2026-08-31 及以前的记录已归档到 `archive/progress-202608.md`（首次归档 2026-10-01）
> 最后更新：2026-10-01（①归档 08-31 及以前内容；②D-698 Spring Boot 4.1.1 升级上线 + D-699 SSE 截断/DSML 泄漏 + D-700 AI 成本归因重建 + D-674~D-711 前端 as any 大批次）

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

> 更早内容（2026-08-31 及以前）已归档：memory-bank/archive/progress-202608.md

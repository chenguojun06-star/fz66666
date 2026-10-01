# Optimization Log — 2026-10-01 Spring Boot 4.1.1 升级 + AI 成本归因重建（D-698/D-699/D-700）

> 日期：2026-10-01
> 状态：**已上线 / 主要项闭环**（Spring AI 2.0 迁移仍遗留）
> 关联决策：**D-698**（Boot 3.4.5 → 4.1.1 升级）· **D-699**（SSE 流截断 + DSML 残渣泄漏，P0）· **D-700**（AI 成本无法归因 + 预算护栏失效，P0）· **D-618**（待办中心已完成维度）· **D-694**（任务状态契约补齐 escalated）· **D-693**（领料出库旁路缺事务 + AI 工具绕过编排层）
> 关联提交：`84d5a2776`（PR #27 升级）· `f714bad2c`（D-699）· `f7306492d`（D-700）· `944db3cba`（D-618）· `1cfa67790`（D-694）· `af782f020`（D-693）· `ab250c940`（EOL 门禁/诊断）· `bb469d449`（D-698 留痕）· `272e96428`（记忆同步）

---

## 一、Spring Boot 3.4.5 → 4.1.1 升级（D-698）

### 背景
Boot 3.4.5（Spring Framework 6.2 / Security 6.4）已 EOL。评估后确认需要升级到 4.1.1（Spring Framework 7 / Security 7.1.1），本次升级目标：**不动业务逻辑、Flyway 不改 schema、可干净回滚**。留痕 6 份文档（`docs/SpringBoot升级评估-3.4到4.1.md`、`升级前核实结论-5项.md`、`升级实测-Stage1-Boot4.1编译验证.md`、`升级实测-Flyway12只读校验通过.md`、`升级实测-StepA-B-Boot4.1全绿.md`、`升级实测-StepB-真库启动发现SpringAI阻断.md`）。

### 根因 / 关键发现
1. **依赖矩阵**（`pom.xml`）
   - parent `3.4.5 → 4.1.1`
   - `starter-aop → starter-aspectj`（Boot4 BOM 已移除 `starter-aop`，逐个核对本地 `spring-boot-dependencies-4.1.1.pom` 的 9 个 starter 后确认）
   - MyBatis-Plus `3.5.12 → 3.5.16` + `spring-boot3-starter → spring-boot4-starter`。**刻意选 3.5.16 而非 3.5.17**：3.5.17 迁移了包（`IService`/`ServiceImpl`/`Model` `extension.* → spring.*`），会导致 278 个文件改 import；3.5.16 是「有 boot4 starter 且未迁包」的最后版本。
   - 新增 `spring-boot-flyway`（Boot4 把 Flyway 自动配置拆出该模块）
   - 新增 `spring-boot-starter-json`（Boot4 的 `starter-web` 不再传递）
2. **源码适配**（新包名均由 jar 反查 + `javap` 确认，非推测）
   - Health/HealthIndicator：`boot.actuate.health.* → boot.health.contributor.*`（3 文件）
   - `MeterRegistryCustomizer → boot.micrometer.metrics.autoconfigure.*`
   - `ErrorController：boot.web.servlet.error → boot.webmvc.error`
   - `FlywayConfigurationCustomizer` / `FlywayMigrationStrategy → boot.flyway.autoconfigure.*`
   - `RedisConfig`：Lettuce 7 泛型 `<Object> → <StatefulConnection<?,?>>`
   - `JacksonConfig`：不再注入 `Jackson2ObjectMapperBuilder`（Boot4 不再注册该 bean，实测 `NoSuchBeanDefinition`）→ 改为显式 new，**不能直接 `new ObjectMapper()`**（会丢失 well-known modules 注册，改变 `LocalDateTime` 序列化行为）
3. **配置键位迁移**（`application.yml`）：`spring.jackson.serialization.WRITE_DATES_AS_TIMESTAMPS → spring.jackson.datetime.*`（Jackson3 把该常量从 `SerializationFeature` 移到 `cfg.DateTimeFeature`，旧键位在 Boot4 下绑定失败 → 上下文启动失败，实测复现）
4. **★ 真正阻断点（数据层才暴露）**：Spring AI **1.0.0** 与 Spring Framework 7 **二进制不兼容**。真实库启动时 `Error creating bean 'springAiOpenAiApi'` → `NoSuchMethodError: HttpHeaders.addAll(MultiValueMap)`（`javap` 验证：Spring 7.0.9 的 `HttpHeaders` 只有 `addAll(String,List)` 与 `addAll(HttpHeaders)`）。这就是「三层验证法」样本：**接口层与实现层全通（PR #27 五项 CI 全绿、340 单测全绿），数据层才暴露真实问题** —— 327 项单测全绿是因为 Mockito mock 掉了该 bean。
   - 迁移面核对：全仓直接引用 Spring AI 的**只有 3 个文件**（`SpringAiAdapterConfig.java` ← 启动阻断点、`SpringAiInferenceAdapter.java` ← 唯一实现、`FashionSupplychainApplication.java` ← 自动配置排除清单）。此前评估的「57 个」有误（54 个是项目自研类，仅类名含 "Advisor" 被误匹配）。项目自研 `AiInferenceGateway` 抽象层是迁移代价可控的关键。

### 处置
- **关闭 Spring AI 适配器**：`spring-ai.adapter.enabled` 默认值 `true → false`。AI 能力由 `LegacyInferenceAdapter → IntelligenceInferenceOrchestrator`（1117 行，零 Spring AI 依赖，自实现 tool_calls）承担，`AiInferenceRouter`（`@Primary`）负责路由与熔断。
- 版本号同步三个记忆文件：`CLAUDE.md`（Boot 3.4.5 → 4.1.1、MyBatis-Plus 3.5.12 → 3.5.16）、`.github/copilot-instructions.md`（Boot **2.7.18** → 4.1.1，此前落后两个大版本）、`.trae/rules/project_rules.md`（3.4.5 → 4.1.1，该目录被 `.gitignore`，仅本地修正）。
- 同步修正 `copilot-instructions.md` 一条**与现行政策完全相反**的高危铁律：原写「Java 单元测试永不提交仓库」并要求 `git ls-files backend/src/test/ | wc -l` 必须为 0，而实际政策自 2026-09-15 起**全部入库**（历史上曾把 `backend/src/test/` 排除，导致 CI checkout 后测试目录为空、ArchUnit 架构门控空转 —— 假绿灯）。已按事实重写。

### 验证
- `mvn clean test`：**340/340**（升级前 327，补 AI 模块测试 +13）
- 真实 MySQL(3308) + Redis(6379) 启动至失败点前全部正常：HikariPool 建连成功 / Redis 真实往返 227ms / Tomcat 11 启动 / 110 个 AI 工具扫描注册正常 → 证明 9 个文件改动运行时有效
- 同 key / 同入口 / 同问题对照：基线 3.4.5 与应用启动 21.577s vs 升级版 21.272s；工具注册数 103；DB 全链路 pending-tasks 返回 **53 条真实待办**。**关键结论：工具调用未触发是既有实现特性，非本次升级引入**（两版本运行期工具执行痕迹均为 0）
- Flyway 12.4.0 只读校验（`flyway:info`，未 migrate）：`Pending=0`、checksum 0 不匹配、`Failed=0`；3 个 Missing 已被 `application.yml` 的 `ignore-migration-patterns "*:missing"`（D-415）覆盖
- **数据库全程零改动**：验证前后均 624 行、latest 不变
- 补测试发现既有问题（未阻断）：`EcStockAlertNotifyTool` / `EcStockQueryTool` 是死代码（`@AgentToolDef` 但未实现 `AgentTool` 接口，`execute` 签名为 `execute(Map)` 而非契约的 `execute(String)`，`McpToolScanner:63` 按类型扫不到）

### 遗留
- [ ] **Spring AI 2.0 迁移**：2.0.0 实测为**范式重写**而非升级（`OpenAiApi` 类完全移除、`OpenAiChatOptions.tools()` 亦移除，工具改由 `ToolCallingAdvisor` 在 Advisor 链注入），需先补 AI 模块集成测试作安全网，再重写 `SpringAiInferenceAdapter` + `SpringAiAdapterConfig`
- [ ] `resilience4j` 仍用 `spring-boot3` 2.2.0 变体，未切 boot4 变体
- [ ] actuator health 出参兼容性、真实接口调用未覆盖（应用未启动时无法验证）
- [x] 回滚路径干净：本次 Pending=0、一条迁移都没执行、`flyway_schema_history` 未被改写，Boot 3.4.5 回退时 Flyway 10.20.1 看到的仍是原样

---

## 二、D-699 SSE 流被截断 + DSML 协议残渣泄漏（P0）

### 背景
线上 AI 顾问面板两个现象：① 浏览器报 `net::ERR_INCOMPLETE_CHUNKED_ENCODING`（**HTTP 却是 200**）；② 气泡里出现 `<calls>` / `<invoke name=""> (内部数据) </invoke> </calls>` 协议残渣。两者都不改业务代码就复发，属 Boot 4.1 回归 + 流式清洗结构性缺陷。

### 根因
1. **SSE 流被截断**：Spring Security **7.1.1** 的 `AuthorizationFilter` 对**每个 dispatch** 都做授权（官方 "All Dispatches Are Authorized"；`setFilterAsyncDispatch` 默认 `true`），Boot 3.4 的 Spring Security 6.4 不会。`SseEmitter` 启动异步处理后容器会再做一次 `ASYNC` 分发；本项目 `sessionManagement = STATELESS` 无 `HttpSession` → `ASYNC` 分发时 SecurityContext 无处恢复 → 视为匿名 → 命中 `/api/**.authenticated()` → `AuthorizationDeniedException`。**此时响应已提交，错误页也渲染不出来** → 连接被硬关闭 → 浏览器拿不到 chunked 结束块。
2. **DSML 残渣泄漏**：旧实现（D-361c）在流式路径上**逐 delta 判断** `if (content.contains("DSML")) content = content.replaceAll(...)`。而 deepseek-flash 会把一段协议拆到多个 SSE delta：`delta1 = "<｜｜DSML｜｜ "`（含 DSML，侥幸被清）、`delta2 = "invoke name=\"...\">\n"`（不含 DSML，逃过清洗，原样推给前端 ← 泄漏点）。逐 delta 判断在协议被拆行时**结构性失效** —— 判断「这行是不是协议」所需的开标记恰好在上一片里。

### 处置
1. `SecurityConfigHelper.configure()` **首行**加 `authz.dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll();`（**必须放在所有 `requestMatchers` 之前**）。只放行 `ASYNC`/`ERROR` 二次分发；真正调用 controller、校验 token 的 `REQUEST` 分发仍走 `TokenAuthFilter` + 全部原有规则，**鉴权强度不变**。
2. 跨 delta 缓冲，攒够一个完整换行才成行、成行后整行判断：
   - `DsmlToolCallParser.stripLines()`：逐段扫描剔除协议行、逐字符保留其余内容（不 trim、不改行尾）；整行皆协议则连行尾丢弃；标记前有正文则保留正文，并丢掉紧贴标记的 `<` / `</`（否则气泡里会出现游离的 `<calls>`）
   - `strip()` 改为复用 `stripLines()`，保证「流式看到的」与「落库后重读的」是同一套清洗结果
   - 新增 `flushDsmlTail()`：模型最后一句通常不带换行，不 flush 会整句丢失

### 验证
- **349 全绿（新增 9）**
- `DsmlStreamingLeakTest`（6）：逐字复刻线上「标记与续行分属不同 delta」场景，断言推给前端的分片不含任何协议残渣，且协议前后正文一字不丢；含「无协议时零改写」「单 delta 整段协议」「无结尾换行」等边界
- `SseAsyncDispatchAuthorizationTest`（3）：只跑真实链上的 `AuthorizationFilter`（不跑全链——`TokenAuthFilter` 会查 Redis/DB，测试库无表，跑了只会得到无关 SQL 异常并掩盖断言点）。断言 `ASYNC`/`ERROR` 放行，并**反向断言匿名 `REQUEST` 仍被拒**，防止有人改成 `anyRequest().permitAll()` 而测试照样绿

### 遗留
- 无。清洗逻辑与鉴权放行均已加测试守护。

---

## 三、D-700 AI 成本无法归因 + 预算护栏对后台任务失效（P0）

### 背景
DeepSeek 账单累计 **¥317**、单日 **¥7.27 / 1243 次 / 199 万 tokens**，而系统侧 `t_ai_cost_tracking` 自建表起 **0 行**，`t_intelligence_metrics` 里后台任务 token 恒为 0 —— **数据库口径 9.1 万 vs 账单口径 199 万，22 倍盲区**。系统完全无法回答「钱花在哪」。

### 根因
1. **成本表恒为 0 行（两个各自足以致命的缺陷叠加）**：`AiCostTracking` 实体没有任何 `@TableField`，依赖驼峰→下划线默认推导生成 `model_name` / `estimated_cost_usd`，而表实际列是 `model` / `estimated_cost` → INSERT 因未知列**必然失败**；失败又被 catch 里的 `log.debug` 静默吞掉（debug 不进生产日志）。编译通过、单测通过、启动正常，只有真正 INSERT 才炸。
2. **成本记录只挂在 `AiInferenceRouter` 上**：后台 agent / 定时任务大量走 `IntelligenceInferenceOrchestrator` 的 `chat()` / `chatStream()` **直连路径、绕过 Router** → 这些调用全部不记账。
3. **（P0）预算护栏对后台任务完全失效**：`canInvoke` / `tryDeduct` / `recordUsage` 都有 `if (tenantId == null) return true;`，而后台定时任务与系统级 agent **恰恰没有 `UserContext` 租户上下文** → 「花得最多的那一批调用」完整绕过 50 万/租户/日上限：`canInvoke` 直接放行（限额形同虚设）、`recordUsage` 直接返回（一个 token 都没进桶）。

### 处置
1. 补 `@TableField` 映射到真实列名；`success` / `errorMessage` 标 `@TableField(exist = false)`（表无此列，失败详情已在 `t_intelligence_metrics`，不重复落库、不新增迁移）；记录失败日志从 `debug` 提到 `warn`。
2. 在 `finalizeResult` / `finalizeStreamResult`（所有推理结果唯一收口点）补记一次；流式路径记估算值，注释标明口径差异（分析时勿与真实 usage 直接相加）。
3. 无租户上下文时归入**「系统桶」tenant 0** 统一计量与限流（口径与 `t_ai_cost_tracking.tenant_id` 的 NOT NULL 兜底值一致，两表可对齐排查）；**不直接拒绝**（否则所有后台巡检/日报整体停摆）。`recordUsage` 的 `log.debug` 同样提到 `warn`。
4. **降本**：`ProactivePatrolAgent` 由每小时降为每 6 小时（env 可覆盖）。该任务每次对每个活跃租户拉起 4 个部门 agent（pmc/finance/qc/ceo），即 24×4=96 次部门级调用/天/租户；实测当天 ceo/finance/qc/pmc-agent 各 51 次、跨 17 小时，且 avg response 仅 15 字符、avg latency 约 130ms —— 全部命中关键词兜底，**绝大多数是空转**。取舍：异常发现时效性从最迟 1 小时变为 6 小时，属刻意决策；临时恢复用 `AI_PROACTIVE_PATROL_CRON=0 5 * * * ?`。
5. **停止空转**：`XiaoyunModelWarmup` 补 `@ConditionalOnProperty`。此前只有方法内 `if (!enabled) return`，「已关闭」的 warmup 仍每 90 秒被调度一次 → 实测每天空跑 662 次、每次留一条 `t_ai_job_run_log`（该表已 73.9 万行）。现关闭时 bean 根本不注册。临时保活用 `XIAOYUN_WARMUP_ENABLED=true`。
6. **清理死配置**：删除 `application.yml` 的 `ai.spring-ai.*` 块（该块 `enabled` 默认 `true`，与真实生效值相反，极易误导；已 grep 确认全仓无代码读取该路径。真正生效的是顶层 `spring-ai` 块，`SpringAiAdapterConfig` 的 `@ConditionalOnProperty` 读它）。
7. **部署陷阱入档**：`deploy/lighthouse/README.md` 补 `SPRING_AI_ADAPTER_ENABLED=false` —— `.env.backend` 被 `.gitignore` 排除、不入库，且 `env_file` 优先级高于 yml，只要它含 `true` 就会无声覆盖 yml 的 `false`，导致 Spring AI 1.0 在 Spring 7 上 `NoSuchMethodError` → 容器起不来 → **全站 502**；且每次从云托管控制台「整份复制」都会把旧值带回来。已写明现象、根因、验证命令（`--force-recreate` 生效，`restart` 无效）。

### 验证
- **356 全绿（新增 7）**
- `AiCostTrackingEntityMappingTest`（4）：把「实体↔表列名一致」变成可断言事实（此类 bug 编译期无感知，只有真正 INSERT 才炸）
- `AiAgentTokenBudgetServiceTest`（3）：断言无租户上下文时不再直接放行、用量落入系统桶 `ai:budget:0:*`；并反向断言应急开关 `ai.budget.enabled=false` 仍全量放行
- **实测归因结论**：成本最高的调用是定时任务，不是真人提问 —— **81% 成本来自定时任务**（`ProactivePatrolAgent` 的 4 个部门 agent）。实测 tenant 2 当日已用 45.6 万逼近限额仍未被拦，系统桶用量根本查不到
- **核对开销的正确姿势**：`docker exec` 进**生产库** MySQL 查 `t_ai_cost_tracking`，不要只看 DeepSeek 控制台（账单含重试/失败请求，系统侧未必有对应行）。⚠️ 本次踩过的坑：**MCP 连的是本地开发库（flyway 624），不是生产库（1941）**，据此做归因会错

### 遗留
- [ ] 流式路径成本为估算值，与真实 usage 口径不同，后续需在报表层区分展示
- [ ] 异常发现时效性由 1 小时放宽到 6 小时（刻意取舍），如业务需要可再评估
- [ ] `AI_CRON_INFERENCE_ENABLED=false` 为应急一键切断后台 AI 的开关（真人提问不受影响），需在应急预案中留存

---

## 四、D-618 待办中心支持「已完成」任务维度

### 背景
待办中心此前只有「待处理」维度，用户看不到已完成任务。

### 处置
- `PendingTaskOrchestrator` 新增 15 个已完成任务收集器，覆盖裁剪、质检、返修、物料、逾期订单、异常、款式开发、工资、物料对账、报销、发货、样品借还、领料等模块，与原「待处理」维度并列。
- 前端同步 `TaskListView` / `useTaskManager`；小程序与 h5-web 三处 wxml（两套副本 + h5-web public 镜像，共 6 个文件）同步。

### 验证
- **租户隔离**：新增的 26 处查询全部带 `tenantId` 条件过滤，已通过 `scripts/audit-tenant-id.py` 审计（需修复 0）。

### 遗留
- 无。

---

## 五、D-694 任务状态契约补齐 escalated

### 背景
前端 `TaskStatus` 只声明 5 个值，而后端 `CollaborationTask.TaskStatus` 有 6 个枚举（`PENDING`/`ACCEPTED`/`IN_PROGRESS`/`COMPLETED`/`ESCALATED`/`CANCELLED`），出参经 `TaskCenterOrchestrator.toPersonalTaskViewList`（501 行 `.toLowerCase()`）后为小写。即前端**缺 `'escalated'`**。

### 根因
`ESCALATED` 在后端被当作活跃任务（`countByTenantAndStatus` 把它计入 `inProgressRaw`，`findActiveByTenant` 也会返回它），故升级中的任务此前：① **幽灵项** —— `statusBucket` 未给它归桶 → 出现在「全部」列表，但「待处理/进行中/已完成」哪个页签都不计入；② **无任何操作按钮** —— `TaskListView` 操作区只判 `in_progress`/`accepted`，`escalated` 卡片领取不了也完成不了（已核后端 `updateTaskStatus` 对任意合法枚举均接受，含 `COMPLETED`，故升级中的任务本就可正常完成）。

### 处置
1. `types.ts`：`TaskStatus` 补 `'escalated'`，与后端 6 个枚举严格一一对应。
2. `TaskListView`：`statusBucket` 由 `s === 'accepted' ? ... : (s as ...)` 改为**穷举映射 `Record<TaskStatus, StatusTab>`**（原 `as` 断言对未知值静默透传 —— 这正是 escalated 漏归桶却无人察觉的根因；改为穷举后后端新增枚举若未同步，**TypeScript 直接编译报错**）；操作按钮条件补 `escalated`。
3. 新增 `__tests__/taskStatus.test.ts`（5 项）。

### 验证
- `type-check` ✅ / 全量单测 **480 → 485 全绿** / lint 0 error
- 反向验证测试有效性：临时加 `'snoozed'` → 编译报错 **TS2741**；临时删 `escalated` 映射 → 3 个测试立即 FAIL（含键数一致性断言）

### 勘误
- 此前判断「后端 `taskStatus` 大小写不统一、DTO 未定死契约」**有误**。实测：系统待办 `PendingTaskDTO` 硬编码小写字面量（仅 pending/completed），个人任务出参已 `.toLowerCase()`，两条路径均为小写、契约一致。真实问题是**枚举不全**，与大小写无关。（`useTaskManager.ts` 的 `.toLowerCase()` 属 D-618 批次，本次未动。）

### 遗留
- 无。

---

## 六、D-693 领料出库旁路缺事务 + AI 工具绕过编排层（架构治理）

### 背景
`MaterialPickingOrchestrator.createPicking` 下游连续做 4 个写操作：`save(领料单) → insert(明细) → decreaseStock(扣库存) → recordOutboundLog(出库日志)`，而 `decreaseStockWithCheckDecimal` 返回 0 时抛 `IllegalStateException`（库存不足）。

### 根因
该链路**全程无 `@Transactional`**（编排层方法与三个 Service 实现均为 0 个注解）。多明细领料单在第 N 条库存不足时，前 N-1 条写操作已提交且无回滚 → 「领料单 `status=completed` + 明细缺失 + 库存已扣 + 出库日志缺失」的脏数据。
更深层：`MaterialPickingTool` 的 create 动作**直接注入 `MaterialPickingService`** 做多表写入，同时违反两条铁律：跨服务编排必须上移 Orchestrator（P0）+ 事务只在 Orchestrator 层（故此路径无事务）。

### 处置
1. `MaterialPickingOrchestrator.createPicking` 补 `@Transactional(rollbackFor = Exception.class)`（事务只在 Orchestrator 层；跨 Bean 调用非同类自调用 → AOP 代理生效）。主流程 INTERNAL 领料走 `createPickingAndOutbound` 早已有事务，不受影响。
2. `MaterialPickingTool` 的 create 动作改走 `MaterialPickingOrchestrator`；只读动作（list/get_items）仍用 Service 与 Mapper（Tool 已有 `@Lazy`，无循环依赖；已核 Orchestrator 不反向依赖任何 Tool/Agent）。
3. 新增 `MaterialPickingTransactionTest`（3 项，用反射读注解守护），含主流程 `createPickingAndOutbound` 的事务断言，防 D-099 修复被回退。

### 验证
- 真实库佐证：`t_material_picking` 共 22 条，其中 MPK 前缀 7 条（走本旁路）最后使用于 2026-05-29；主流程 PICK- 前缀 13 条最后使用于 2026-09-12 —— **旁路仍在产生真实数据，非死代码**
- 守护有效性实测：临时移除事务注解后测试立即 FAIL，恢复后 PASS —— 非假守护
- `mvn clean test` **323/323 通过**；零 SQL/XML/Flyway 变更；全程未对数据库执行写操作
- 架构违规收敛批次1：service→service **21 → 19**

### 遗留
- [ ] service→service 违规仍有 19，需按治理方案继续收敛批次

---

## 七、依赖 EOL ratchet 门禁 + 云端健康诊断脚本

### 背景
Spring Boot 3.4.5 与 Spring AI 1.0.0 在建立基线时已 EOL，需要一道可持续的依赖治理门禁；同时缺少一个一次看清线上状态的只读诊断脚本。

### 处置
1. **依赖版本 EOL ratchet 门禁**
   - `scripts/check-dependency-eol.py`：检查关键依赖是否已 EOL
   - `dependency-eol-baseline.properties`：冻结基线，**存量只告警、新增才阻断**
   - CI「质量门禁」job 新增阻断步骤，另加一个 `continue-on-error` 的报告步骤
   - `scripts/pre-push-checklist.sh` 同步接入本地预检
   - **为什么用基线而非直接阻断**：若直接阻断，CI 从第一天就常红 → 必然出现「加 `--strict` 绕过」或「临时关 job」，结果比假绿灯更糟（同 `arch-baseline.properties` 记录过的教训）
2. **`check-cloud-health.sh`（只读诊断）**：一次性看清 5 件事 —— 容器状态 / MySQL 连接数 / 向量回灌进度 / Qdrant 集合 / 后端日志。只读，不修改任何数据
   - 修正原稿连接参数错误：IP 写的 `106.53.5.62 + root` 与实际生产机（`106.55.12.216 + ubuntu`）不符 —— 会连到错误主机，且 root 密码登录不可用时会卡在交互提示，诊断脚本反而成了故障时的第一道障碍。改为 `ubuntu + ~/.ssh/fz66666_backup`（可用 `SSH_KEY` 覆盖），并给全部 docker 命令加 `sudo`（ubuntu 不在 docker 组，与 `autodeploy.sh` 的约定一致）

### 验证
- 门禁有效性实测：把基线临时调到 **0 → 退出码 1**（确实阻断），非空转
- 基线 **2 → 1**：D-698 完成 Boot 3.4.5 → 4.1.1 升级并上线后，3.x 不再是当前版本，EOL 计数减 1
- `check-cloud-health.sh` 已实测跑通：`Threads_connected=11 / max_connections=151`

### 遗留
- [ ] 剩余唯一 EOL 项为 **Spring AI 1.0.0** —— 该组件在 Boot 4.1 下已被显式关闭（`spring-ai.adapter.enabled` 默认 false），运行时不加载，但仍留在 pom 里等待 2.0 范式重写迁移

---

## 八、前端 as any 治理批次（D-674 ~ D-711）

### 背景
前端质量基线治理：清除 `as any`、破除循环依赖、消除 `exhaustive-deps` 禁用，全部以可量化的行数/计数 ratchet 收口。

### 处置
- **`as any` 治理（主体，D-677 ~ D-711）**：`any-lines` **3204 → 2661**。逐文件清零，例：`StyleInfoTabs` 全清 49 处（根因是 props 把 `currentStyle` 标成 any，真实类型是 `StyleInfo | null`，给 `types/style.ts` 补 19 个缺失可选字段）、款式开发工作台去 89 处、`resizableTableHelpers` 去 29 处、`useBoardStats` 去 28 处、`order` 家族多批合计 90+ 处。配套固化 `scripts/find-any-clusters.py`（D-695）。
- **循环依赖**（D-673/D-676）：`madge` **10 → 0**，成果上锁（pre-push 门禁 + CI 升级为阻断）。
- **`exhaustive-deps` 禁用**（D-674）：全量探测确认 126 处**全部是真需要的**（非历史遗留）；安全子集（`useCallback` 化 + 补稳定依赖）处理后基线 **126 → 118**。
- 相关修复：D-675 生产订单列表修复重复重绑与 stale closure（质量基线 118 → 115）。

### 验证
- 各批次：`tsc --noEmit` 0 错误 · 全量 vitest 通过（末期 **34 文件 / 480 项**）· ESLint 0 告警 · 打印红线零命中
- 基线逐批次下调并实测，非空转

### 遗留
- 剩余 110+ 处经分类确认不宜批量处理：多为有意省略的依赖（补入会改变 effect 时序或造成循环）与「把不稳定状态版本号放进依赖以强制重算」的 hack，需逐个人工评估

---

## 九、记忆文件同步（`272e96428`）

### 背景
当天改动量大（Boot 4.1.1 升级上线 + 2 个 P0 + 成本归因重建 + 降本），但三个记忆文件（`CLAUDE.md` / `.github/copilot-instructions.md` / `.trae/rules/project_rules.md`）全部停留在旧状态，且漏记当天所有新机制。

### 处置
- 版本号同步（见「一、处置」）
- 修正 `copilot-instructions.md` 与现行政策完全相反的高危铁律
- 新增两节：**「Boot 4.1 + Spring Security 7 陷阱」**（陷阱1 SSE 截断 → AP-FW-01；陷阱2 `.env.backend` 无声覆盖 → AP-FW-02）、**「AI 成本归因与止损」**（对应 AP-AI-05 / AP-AI-06）
- 补齐遗漏条目：测试文件数 Java 33 → 44、前端 33 → 34（以 `git ls-files` 实测为准）；Common Commands 补 `check-cloud-health.sh`、`audit-tenant-id.py`、`check-dependency-eol.py`（含 `--no-baseline` 治理验收用法）；填写「当前进度快照」，其中明确记下「**MCP 连的是本地开发库（flyway 624），不是生产库（1941）**」，避免后续再犯当天的归因错误

### 验证
- 三文件 diff 已核对；版本号、测试文件数、命令入口与本日志一致

### 遗留
- [ ] 反模式沉淀：本次新增 AP-FW-01 / AP-FW-02 / AP-BE-06 / AP-AI-05 / AP-AI-06 五条（见 `memory-bank/anti-patterns.md`），本条优化日志为其归档依据

---

## 十、当日小结

| 项 | 结果 |
|---|---|
| Spring Boot | 3.4.5 → **4.1.1**（已上线，回滚干净；Spring AI 默认关闭） |
| 单测 | 后端逐阶段 323 → 327 → 340 → 349 → **356**；前端 480 → **485** |
| P0 修复 | D-699（SSE 截断 + DSML 泄漏）、D-700（成本归因 + 预算护栏） |
| 归因结论 | 单日账单 ¥7.27 / 1243 次 / 199 万 tokens；**81% 来自定时任务**（非真人提问） |
| 降本 | `ProactivePatrolAgent` 每小时 → 每 6 小时；`XiaoyunModelWarmup` 关闭（日空跑 662 次） |
| 数据库 | 全程零改动（624 行不变，Flyway Pending=0） |
| 前端基线 | `as any` 3204 → 2661 · 循环依赖 10 → 0 · `exhaustive-deps` 禁用 126 → 118 |
| 遗留 | Spring AI 2.0 范式重写迁移（需先补 AI 模块集成测试） |
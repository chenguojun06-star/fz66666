# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

服装MES（Manufacturing Execution System）— 服装加工行业的生产执行系统，三端协同（PC管理后台 + 微信小程序扫码 + H5移动端）。

## Tech Stack

- **Backend**: Spring Boot **4.1.1** + Java 21 + MyBatis-Plus **3.5.16**（boot4 starter） + Flyway 12 + Redis + MySQL 8.0
- **Frontend**: React 18 + TypeScript + Vite 7 + Ant Design 6 + Zustand
- **Mini Program**: 微信原生小程序
- **AI**: 小云AI智能体（自研 `LegacyInferenceAdapter` + MCP Tools + DAG编排）；DeepSeek `deepseek-flash`
  - ⚠️ **Spring AI 已默认关闭**（`spring-ai.adapter.enabled` 默认 `false`）。Spring AI 1.0.0 与
    Spring Framework 7 二进制不兼容（`OpenAiApi` 调 `HttpHeaders.addAll(MultiValueMap)`，
    Spring 7 只剩 `addAll(String,List)`/`addAll(HttpHeaders)`）→ `NoSuchMethodError` → 启动失败 502。
    AI 能力由 `LegacyInferenceAdapter → IntelligenceInferenceOrchestrator` 承担。
    详见下方「Boot 4.1 + Spring Security 7 陷阱」。

## Distributed Lock

`DistributedLockService` (`common.lock` package) provides Redis-based distributed locking via Lua scripts:
- `executeWithLock(key, timeout, unit, supplier)` — lock & auto-release, throws if busy
- `executeWithStrictLock(key, timeout, unit, supplier)` — same but throws immediately on contention
- `executeWithLockOrFallback(key, timeout, unit, supplier)` — retries once, then throws

Already used in 10+ AI jobs and production consistency jobs. Lock key prefix: `fashion:lock:`.
**Do NOT add Redisson** — existing implementation covers all needs.

## Boot 4.1 + Spring Security 7 陷阱（2026-10-01 升级实测，D-698/D-699）

升级 Spring Boot 3.4.5 → 4.1.1 时踩到两个**框架行为变化**导致的故障。两者都不改业务代码就复发，
且症状与业务无关，极难定位，故在此长期留档。

### 陷阱 1：SSE 流式接口被截断（前端 `ERR_INCOMPLETE_CHUNKED_ENCODING`）

**现象**：浏览器报 `net::ERR_INCOMPLETE_CHUNKED_ENCODING`，但 HTTP 状态码是 **200**；
SSE 事件已写出、连接被硬关闭，浏览器拿不到 chunked 结束块。

**根因**：Spring Security **7.1.1** 的 `AuthorizationFilter` 对**每一个 dispatch** 都做授权
（官方文档 "All Dispatches Are Authorized"；`setFilterAsyncDispatch` 默认 `true`）；
Boot 3.4 用的 Spring Security 6.4 **不会**。`SseEmitter` 启动异步处理后，
容器在响应结束前会再做一次 `ASYNC` 分发。本项目 `sessionManagement = STATELESS`（无 HttpSession），
`ASYNC` 分发时 SecurityContext 无处恢复 → 视为匿名 → 命中 `/api/**`.authenticated()` →
抛 `AuthorizationDeniedException`；此时响应已提交，错误页也渲染不出来 → 连接被截断。

**修复**：`SecurityConfigHelper.configure()` 首行
`authz.dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll();`
**必须放在所有 `requestMatchers` 之前**（dispatcherTypeMatchers 优先匹配）。

**为什么这不放宽鉴权**：真正调用 controller、真正校验 token 的是 `REQUEST` 分发，
仍走 `TokenAuthFilter` + 全部原有规则。`ASYNC`/`ERROR` 分发只负责把**已授权的**响应收尾。
`SseAsyncDispatchAuthorizationTest` 同时**反向断言**匿名 `REQUEST` 仍被拒，
防止有人图省事改成 `anyRequest().permitAll()` 而测试照样绿。

### 陷阱 2：`spring-ai.adapter.enabled` 会被环境变量无声覆盖

`application.yml` 里默认值已是 `false`，但 `deploy/lighthouse/docker-compose.yml` 用
`env_file: .env.backend`，**环境变量优先级高于 yml**。而 `.env.backend` 被 `.gitignore` 排除、
**不入库** —— 所以「代码里默认值是安全的」这个结论在服务器上**不成立**。
一旦该文件里存在 `SPRING_AI_ADAPTER_ENABLED=true`，Spring AI 1.0.0 就会被启用 →
`NoSuchMethodError` → 容器起不来 → **全站 502**。
且每次从云托管控制台「整份复制」重新覆盖 `.env.backend` 都会把旧值带回来。

**改完必须重建容器才生效**（`env_file` 只在创建时读取，不热更新）：
```bash
cd /opt/fz66666/deploy/lighthouse
docker compose up -d --force-recreate backend
docker compose exec backend printenv SPRING_AI_ADAPTER_ENABLED   # 期望 false
```
已写入 `deploy/lighthouse/README.md`。**改服务器配置前先读那一节。**

## Java / Spring 通用陷阱（2026-10-14 实测，全部「看似正确、实际零效果」）

这三个的共同特征：**代码读起来完全正确、编译通过、单测若不刻意断言也过，
但运行期行为与预期不符，且症状与原因无关，极难定位**。故长期留档。

### 陷阱 1：自定义 `HandlerMethodArgumentResolver` 对 `@RequestParam` 参数不会被调用

给全站分页参数加上限时，第一版写的是自定义 `HandlerMethodArgumentResolver`
并在 `WebConfig#addArgumentResolvers` 注册 —— 看着是标准做法，**实际一次都不会执行**。

**根因**：`RequestMappingHandlerAdapter#getDefaultArgumentResolvers()` 的顺序是
「注解类解析器（`RequestParamMethodArgumentResolver` 等）→ 类型类解析器 →
**custom（`getCustomArgumentResolvers()`）** → catch-all」。
所以 `@RequestParam int pageSize` 这种写法会被内置解析器先命中，custom 永远轮不到。

**结论**：自定义 `HandlerMethodArgumentResolver` 只对**内置解析器不支持**的参数生效。
要拦截已有注解参数，用 **`Filter` + `HttpServletRequestWrapper`**
（跑在 `DispatcherServlet` 之前，与参数怎么声明无关）。
本轮最终实现见 `common/web/PageSizeLimitFilter.java`。

### 陷阱 2：三元表达式混用 `Long` 与 `Integer` 会被数值提升成基本类型 `long`

```java
// ❌ 编译通过，但结果类型被提升成 long，再装箱回 Long
return t == Long.class ? Long.valueOf(clamped) : Integer.valueOf((int) clamped);
```
按 JLS 15.25，两边都是包装类且可转数值时走**二进制数值提升**，
结果类型是基本类型 `long` → 返回给 `Object` 时自动装箱成 `Long`。
于是 `Integer` 形参永远收到 `Long`，反射调用控制器方法时类型不匹配。

**改法**：拆成两个独立 `if/return`。本轮是被单元测试
（`PageSizeLimitFilterTest` 断言 `isInstanceOf(Integer.class)`）当场抓住的，
否则会一次性打挂 7 个 `Integer pageSize` 的接口。

### 陷阱 3：包装 `HttpServletRequest` 时在构造函数里读 `getParameterMap()` 会提前解析 multipart

```java
// ❌ 构造期读 getParameterMap() 会强制容器解析 multipart 表单
ClampedRequest(HttpServletRequest req) { super(req); this.map = clamp(req.getParameterMap()); }
```
症状是**文件上传突然失败** —— 等 Spring 的 `MultipartResolver` 再去处理上传请求时就晚了。

**改法**：包装类必须惰性 —— `getParameter`/`getParameterValues` 走单值快路径，
只有真被问 `getParameterMap()` 时才构造。
`PageSizeLimitFilterTest#constructionMustNotEagerlyParseParameters`
用「一被问就记账」的请求把这个约束钉住了。

## AI 成本归因与止损（D-700）

**先看这里再动 AI 相关配置** —— 本项目曾出现「账单累计 ¥317、单日 ¥7.27，
但系统对钱花在哪完全失明」。

| 表/服务 | 作用 | 坑 |
|---|---|---|
| `t_ai_cost_tracking` | **唯一**的成本账（scene/model/token/金额/租户） | 实体列名必须用 `@TableField` 映射到 `model`/`estimated_cost`，否则 INSERT 必失败 |
| `t_intelligence_metrics` | 调用观测 | 后台/降级路径 token 常为 0，**不可单独用于归因** |
| `AiAgentTokenBudgetService` | 50 万/租户/日限额 | 无 `UserContext` 的调用归**系统桶 tenant 0**，不再跳过 |
| `AI_BUDGET_TENANT_DAILY_TOKEN_LIMIT` | 调限额 | env 覆盖 |
| `AI_CRON_INFERENCE_ENABLED=false` | **一键切断所有后台 AI**（真人提问不受影响） | 应急止血用 |

**成本最高的调用是定时任务，不是真人提问**（2026-10-01 实测：208 万 tokens 中 81% 来自
`ProactivePatrolAgent` 的 4 个部门 agent）。`ai.proactive-patrol.cron` 默认 `0 5 0/6 * * ?`
（每 6 小时，原为每小时）—— 改频率前先想清楚「异常发现时效性」这个产品取舍。
`XiaoyunModelWarmup` 已用 `@ConditionalOnProperty` 关闭（曾每天空跑 857 次）。

**核对开销的正确姿势**：`docker exec` 进生产 MySQL 查 `t_ai_cost_tracking`，
**不要只看 DeepSeek 控制台**（账单含重试/失败请求，系统侧未必有对应行）。

## 向量检索（Embedding）配置纪律（D-701）

**换 embedding 提供方前必读**，本项目已在这一步栽过一次。

### 为什么必须写下来

智谱 embedding-3 欠费被删后，`application-prod.yml` 里**硬编码的智谱配置继续生效**，
日志连续 62 次 `Embedding 降级为伪向量 … 429 余额不足`，
向量检索静默退化成关键词哈希 —— **以图搜款/相似款推荐质量下降，但系统零告警、查不出原因**。

### 两个坑

| 坑 | 说明 |
|---|---|
| **`dimensions` 不通用** | 硅基流动 `BAAI/bge-m3` **不支持**该参数，带上返回 `400 {"code":20015}`。正确值 `0` = 不裁剪，用模型原生维度（bge-m3 原生 1024，与 Qdrant 集合一致） |
| **base-url / path / model 必须成套** | 混搭（如硅基 base-url + 智谱 `/v4/embeddings`）会 404，且报错看不出哪里配错，极易误判为 key 或网络问题 |

### 纪律

1. **只改 `application-prod.yml` 是错的** —— 它的默认值会**覆盖**代码里
   `QdrantService` 的 `@Value` 默认值。换 provider 时**必须同时核对这两处**，
   否则会出现「代码写着 A、yml 写着 B、线上跑的是 B」的静默错配。
2. **仓库内不留任何密钥**。`api-key` 一律 `${AI_EMBEDDING_API_KEY:}` 留空，
   凭证只走环境变量（服务器 `.env.backend`，不入库）。
3. **换完后必须实测**，不要只看「启动日志打印了 provider 名」：

```bash
# 1) 容器内直连验证 key + 模型 + 维度（重建容器前做，避免配完才发现不可用）
# 2) 重建容器使 env 生效（env_file 不热更新）
cd /opt/fz66666/deploy/lighthouse && docker compose up -d --force-recreate backend
# 3) 验收：这三个数必须同时为 0
docker logs lighthouse-backend-1 2>&1 | grep -c "降级为伪向量"      # 0
docker logs lighthouse-backend-1 2>&1 | grep -c "400 Bad Request"     # 0
# 4) 确认向量真的入库（不是空库在空转）
wget -qO- http://qdrant:6333/collections/style_images
```

> 当前生产：硅基流动 `BAAI/bge-m3`，1024 维，`style_images` 已入库 61 个真实向量。

## Architecture Constraints (P0 Rules)

```
Controller → Orchestrator → Service → Mapper
```

- **Orchestrator layer is mandatory** for cross-service/跨表 logic. 330 orchestrators (business + AI, across 14 domain modules).
- **Services must NOT call each other** — all cross-service orchestration goes through Orchestrator.
- **Controllers must NOT call multiple services** — delegate to Orchestrator.
- **@Transactional only in Orchestrator layer** — never in Service or Controller.
- **按"层"分包是本项目的既定架构，不要改** — 各模块一律按 `controller / orchestration / service / mapper`（+ `entity`）分层组织，
  **不要**照搬通用 Spring Boot 最佳实践里"按功能/领域分包"（package-by-feature）的建议去重构包结构
  （例如仓库里的 `java-springboot` skill 就写了这条）。
  ArchUnit 架构守护会在 pre-push 每轮校验分层依赖，改成非分层结构会**直接卡住推送**。
  同理，本项目普遍使用字段注入（`@Autowired` 字段），改成构造器注入属大范围重构，需单独排期，不是随手可改项。
- **All test sources ARE committed** — 测试代码入库策略的权威说明在 `.gitignore` 的「测试代码入库策略」段落。
  Java 单元测试（`backend/src/test/`，2026-09-15 起入库）、前端单元测试（2026-09-19 起入库）、
  小程序单元测试（`miniprogram/test/`，2026-10-10 起入库）、Shell 集成测试（`scripts/test/`）、
  Playwright E2E（`frontend/e2e/`）**全部入库，无一端被排除**。
  ⚠️ **同一原因已连续踩坑三次**，每次都是「CI 门控静默空转」：
  backend（2026-04-11，ArchUnit 空转）、frontend（2026-09-19，447 个测试不执行）、
  miniprogram（2026-10-10，46 个测试纯靠本机手动跑 —— D-165 改动后
  `patternScanProcessor` 测试烂了近 2 个月无人发现）。
  **测试不入库 ≠ 省事，而是把门控关掉。不要再次把任何端的测试源码移出版本控制。**

## Backend Module Structure (14 modules)

| Module | Orchestrators | Responsibility |
|--------|--------------|----------------|
| production | 31 | 生产订单、扫码、裁剪、质检、进度 |
| finance | 21 | 工资结算、对账、报销、付款、成本 |
| system | 15 | 租户、用户、角色、工厂、配置 |
| style | 9 | 款式信息、BOM、工艺、报价 |
| warehouse | 8 | 物料库存、入库、出库、调拨 |
| intelligence | 130 | 小云AI对话、知识库、异常检测 |
| selection | 4 | 选款审核、批次、候选 |
| integration | 3 | 开放API、电商订单、支付/物流 |
| dashboard | 3 | 数据看板、趋势分析 |
| crm | 3 | 客户管理 |
| template | 2 | 生产模板、款式模板 |
| procurement | 2 | 采购订单、供应商评分 |
| wechat | 2 | H5/小程序授权 |
| datacenter | 1 | 数据同步、质量管理 |
| search | 1 | 全局搜索 |

> 各模块编排器数量为 CLAUDE.md 历史记录值，实际总数 330 个会随迭代变化，以代码为准。

## Frontend Module Structure (10 modules)

basic, crm, dashboard, finance, integration, intelligence, production, selection, system, warehouse

## Common Commands

```bash
# Backend
cd backend && mvn clean test -DskipTests=false   # 运行Java单元测试
cd backend && mvn spring-boot:run                 # 启动后端 (port 8088)

# Frontend  
cd frontend && npm run dev                        # 启动前端 (port 5173)
cd frontend && npm run lint                       # ESLint
cd frontend && npm run type-check                 # TypeScript 类型检查
cd frontend && npm run check:all                  # 全量检查（lint + type + deps + circular）
cd frontend && npm run test                       # Vitest 单元测试
cd frontend && npm run test:e2e                   # Playwright E2E测试

# 小程序单元测试（无需 npm install，只依赖 node:test 内置模块）
cd miniprogram && npm run 测试                   # 46 个用例
cd miniprogram && npm run 检查                   # ESLint

# Shell集成测试（需先启动后端）
./scripts/test/test-complete-business-flow.sh     # 完整业务流程E2E
./scripts/test/test-all-settlement-flows.sh       # 结算流程测试
./scripts/test/test-tenant-isolation.sh           # 多租户隔离测试

# Full stack
./dev-public.sh                                   # 一键启动（MySQL + 后端 + 前端）

# 生产诊断（只读，不改任何数据）
./check-cloud-health.sh                           # 容器/MySQL连接数/向量回灌/Qdrant/后端日志
python3 scripts/audit-tenant-id.py                # 多租户隔离审计（CI 同款，本地可跑）
python3 scripts/check-dependency-eol.py           # 依赖 EOL 检查（存量告警/新增阻断）
python3 scripts/check-dependency-eol.py --no-baseline   # 治理验收：看全部 EOL，不看基线
```

## Testing Landscape

| Type | Count | Location | Language |
|------|-------|----------|----------|
| Shell集成测试 | 26 scripts | `scripts/test/` | Bash |
| 根目录测试 | 3 scripts | `test-*.sh` | Bash |
| Playwright E2E | 4 specs | `frontend/e2e/` | TypeScript |
| Python冒烟测试 | 1 script | `scripts/smoke_test.py` | Python |
| Flutter测试 | 2 files | `flutter/test/`, `flutter_app/test/` | Dart |
| Java单元测试 | ✅ 已入库（44 文件，2026-09-15 起） | `backend/src/test/` | Java |
| 前端单元测试 | ✅ 已入库（34 文件，2026-09-19 起） | `frontend/src/**/*.test.ts(x)` | TypeScript |
| 小程序单元测试 | ✅ 已入库（6 文件/46 用例，2026-10-10 起） | `miniprogram/test/` | JavaScript |

Note: **三端测试源码均已入库，无一端被排除**。历史教训：同一原因连续踩坑三次
（backend ArchUnit 空转 / frontend 447 个测试不执行 / miniprogram 46 个测试
纯靠本机手动跑，D-165 后测试腐烂近 2 个月）。详见 `.gitignore`「测试代码入库策略」
段落的完整决策过程与三次事故记录。

## Key Design Rules

1. **Entity-Flyway alignment**: 每新增 `@TableField("xxx")` 必须有对应 Flyway 迁移脚本
2. **No hardcoded colors/fonts**: 使用 CSS 变量 (var(--primary-color) 等 Design Token)
3. **Print font-family must end with `serif`** (not `sans-serif`) — macOS Safari bug
4. **No global WebSocket notifications** — use page-level `useWebSocket()` only
5. **No gradient colors** — pure colors only, use Design Token variables
6. **SKU system**: 款号+颜色+尺码 三维统一，三端共享
7. **Full copilot instructions** at `.github/copilot-instructions.md` — read it for complete P0/P1 rules
8. **禁止静默吞异常**：catch 里不得只打 `log.debug`（生产日志级别看不见）。
   2026-10-14 盘点出的 8 处原生 SQL 缺陷正是靠这个藏了数月 —— 抛 `Unknown column`
   被 catch 成 debug、返回空值，功能静默空转。新增由 `scripts/check-silent-catch.py` 阻断；
   确属可忽略的旁路（缓存未命中、可选调用）加一行注释说明即可。
9. **原生 SQL 的列名必须有守护**：新增/修改原生 SQL 后跑
   `python3 scripts/check-native-sql-columns.py`（拿生产库列快照离线核对，
   覆盖注解 / `jdbcTemplate` 拼串 / XML 三类来源）。
   迁移上线后记得 `--refresh` 刷新快照。
10. **分页参数上限统一收口**：`pageSize` / `size` / `limit` 由
    `common/web/PageSizeLimitFilter` 夹到 `[1, 10000]`，**不要在 Controller 里再各写一遍**。
    上限取 10000 有依据：前端有 96 处传的分页值超过 200（下拉框全量加载，实测最大 9999），
    改小会静默截断下拉框。
11. **用户明确说过的尺寸/比例/位置，照做；有异议先说再做，不得自行推翻**
    （2026-10-18 收银台布局事故）
    用户原话是「本单这边太小了，本单放左边，选货扫码右边」，
    随后又明确「本单这边是 7，选货那边是 3」。
    我却把本单改成了**固定 420px** —— 理由是"专业 POS 购物车栏宽度固定、
    靠肌肉记忆定位"。这个理由本身不算错，但**前提是那根栏占 3 分位**；
    用户要的是 7 分，固定 420px 在大屏上直接变成 3:7，**正好反了**。
    同期还把收款条放到了 `.pos-body` 外面，横跨整页宽度。

    **教训分两层**：
    - 判断失误：把"变大"做成了"固定住"。
    - 更严重的是**擅自推翻用户已经说清楚的要求**。用户第一次就说了"太小"，
      我要解决的是让它变大，不是替它做主。
      有不同意见（乃至更"专业"的方案）可以提，但**必须先说、征得同意，不能自己改完再讲道理**。

    推论：凡是用户给出了**明确的数字/比例/位置**，就当成约束而不是建议。
    凭经验优化只能在用户没表态的地方做。
12. **D 编号取号前必须查重**：`python3 scripts/check-d-number.py --last 10` 看当前最大号，
    再用候选号跑 `python3 scripts/check-d-number.py <号>` 确认未占用，两个都干净才落
    commit message。历史撞号 6 次（D-362/618/667/702/808 双用、D-785 未取号即被引用）
    全是事故——撞号会让 memory-bank 的 progress/decisionLog 条目互相覆盖。
13. **改方法签名/接口契约 = 同一提交必须同步改测试**：任何 fix/refactor 改动 public
    方法签名、接口入参/出参结构、DTO 字段时， commit 必须包含对应测试类的同步修改，
    不允许「先改签、测试下轮补」。2026-10-21 事故：D-817 组合收款改签后 4 个测试类
    （PosSale/PosShift 等）没跟上，CI 连红 **15 个 run 一整天**无人处理——红叉只在
    GitHub 页面没人看，而 autodeploy 独立于 CI，红提交照常上生产。
    配套机制：`notify` job 已扩为 5 个 job 全查（此前漏 quality-gate/frontend-lint，
    它们红时整体显示"全绿"——假绿）；配置 `NOTIFY_WEBHOOK` secret（企业微信群机器人/
    Server 酱）后失败主动推送（`scripts/notify-ci.sh`）。

### CI 门禁里「真实踩过的坑」清单

quality-gate 有 50+ 步骤，以下几条是**这个项目真实发生、且靠静默藏了很久**的问题，
不要以为是形式主义：

| 脚本 | 拦什么 |
|---|---|
| `check-native-sql-columns.py` | SQL 引用生产库不存在的列（8 处缺陷的守护） |
| `check-db-repair-vs-flyway.py` | 往启动自愈清单加条目却不补 Flyway 迁移（结构真相源只能有一个） |
| `check-silent-catch.py` | 新增「catch 里只打 log.debug」的静默吞异常 |
| `check-api-envelope-leak.py` | service 层把 `{code,data}` 信封直接 return 给调用方（收银台白屏/丢挂单守护） |
| `check-shop-c-page.py` | 顾客端店铺页交互（切图 / 放大 / 选色出尺码） |
| `audit-tenant-id.py` | Entity/Mapper 缺 tenant_id（P0 铁律） |
| `check-entity-flyway.py` | 新增 `@TableField` 没有 Flyway 迁移 |

**写这类守护脚本的纪律**：必须**双向验证** —— 对修复前的代码要失败、对修复版要通过。
不验证就会出现"脚本永远绿灯、其实什么都没拦"。本轮三个新脚本都返工过
（漏扫 `jdbcTemplate`、误报洪水、被自己写的注释骗过、抓不到单行 catch 写法）。

**门禁自己也会坏，且坏法更隐蔽**（2026-10-19 实测）：
`check-api-envelope-leak.py` 曾因主循环一个条件写反
（`if kind is None and not DIRECT_RETURN.search(line)`），
**单行 `list: () => api.get<T>('/x')` 完全漏检**——docstring 举例要拦的
最典型写法反而畅通无阻，25 处存量就是这么漏掉的。
同脚本的 `--update` 原先无任何约束，一次无理由执行把 baseline 从 175 放大到 337
（+196 被洗成"历史存量"）。现已双修：单行/多行/泛型三种写法全检出；
`--update` 遇新增键必须传 `--reason` 否则拒绝保存。
**推论：守护脚本的"检出能力"和"baseline 纪律"本身也要有人周期性怀疑——
跑一遍 `--all` 看存量、拿探针文件试检出，别默认它还在好好干活。**

## 第三方平台对接与集成规范（P0 铁律）

本节来自电商模块对接的真实事故复盘，违反任一条都可能造成"看起来成功、实际没生效"的静默故障。

### 禁止模式（Code Review 必查）

1. **禁止"HTTP 200 即成功"**
   调用第三方 API 后**必须解析业务响应**再判定成败。平台普遍会在 HTTP 200 里返回
   `error_response`，只看状态码会把失败当成成功。
   ```java
   // ❌ 禁止：发完就计数成功
   httpClient.postJson(url, payload, Map.class);
   synced++;
   // ✅ 正确：先校验再计数
   Map<String,Object> resp = httpClient.postJson(url, payload, Map.class);
   if (EcPlatformApiSupport.isSuccess(resp)) synced++; else failed++;
   ```
2. **禁止无签名直连第三方 API**
   淘宝/京东/拼多多等强制校验 `sign`。签名统一用 `SignatureUtils.buildSortedSign()`
   （参数按 key 排序 + 密钥包裹 + MD5 大写，三平台规则一致），**不要自己再写一遍**。
   签名规则**必须以官方文档的代码示例为准**，并写单测守护拼接内容与顺序。
   历史教训：顺丰签名曾多拼了 `appKey`，导致**密钥完全正确也会被拒**，
   现象极像"密钥填错了"，排查成本很高。厂商文档的示例输出有时与自身示例矛盾，
   以代码示例为准，并在拿到账号后用官方签名测试工具实测确认。
3. **禁止桩实现混入主干**
   不允许出现 `return null` / 仅打日志的"占位方法"来冒充已实现功能。
   确实做不了要显式返回失败（如 `-1`、`false`）并让调用方感知，**不能假装成功**。
4. **方法名必须与行为一致**
   名为 `syncXxx` / `pushXxx` 的方法必须真的对外同步；只做本地计算就别叫 sync
   （历史教训：`EcStockOrchestrator.syncAllStock` 只本地重算，从未推送平台）。
5. **禁止同一能力在两处各写一套**
   同一能力只保留一个实现出口，其余处透传调用。历史教训：平台库存拉取在
   `PlatformNotifyService` 与 `EcStockDiscrepancyOrchestrator` 各写一份，
   一边修成真实现、另一边仍是桩。
6. **造轮子前先搜现有工具**
   新增签名/HTTP/加解密能力前，先查 `integration/util/`（已有 `SignatureUtils`、
   `IntegrationHttpClient`、`JstApiGuard`）。
7. **禁止用随机数/常量伪造业务数据**
   财务对账严禁 `Math.random()` 编造差异，物流严禁 `"SF"+时间戳` 编造运单号。
   宁可返回"不可用"，也不能编造——假数据会被当真使用（财务据此申诉核账、
   假运单号被回传电商平台污染真实订单），比功能缺失严重得多。
   ```java
   // ❌ 禁止：伪造差异 / 伪造运单号
   double diff = amount * (Math.random() * 0.1);
   String mockNo = "SF" + System.currentTimeMillis();
   // ✅ 正确：做不了就显式返回不可用，让调用方走人工流程
   return List.of();               // 平台账单拉不到 → 空，不编造
   throw new LogisticsException("渠道尚未接入真实API，无法自动下单");
   ```
8. **Mock/降级实现必须可被识别并拦截**
   适配器要显式声明自己是否已接入真实 API（参考 `LogisticsService.isRealImplementation()`）。
   未接入的渠道，其"成功返回"必须被管理器拦截（参考 `LogisticsManager.requireRealChannel`），
   **不得让编造数据流向下游**。将来真接入后，只需 override 该标识返回 `true` 即自动放行。
9. **只读接口禁止"缺失即兜底"**
   看板/悬浮面板/详情这类只读查询，字段查不到就返回 `null` 或 `linked=false` + `reason`，
   由前端显示"—/暂无数据"。**严禁把缺失写成 0、把未知进度写成 0%、把无交期写成"正常"**——
   0 和"无数据"在业务上是两回事，兜底会让人把缺失当成真实经营结果。
   参考 `EcProductionLinkOrchestrator`：`belowSafeStock` 仅在安全库存 >0 时才判定，
   销量趋势的 0 必须来自真实流水为空，而不是默认值。
10. **关联字段必须成对写入（id + 单号）**
   建立跨模块关联时，`xxxId` 与 `xxxNo` 必须同时落库。只写单号会导致
   `isNull(xxxId)` 这类 SQL 判空条件**静默失效**（条件恒为真）。
   历史事故：`EcommerceOrder.productionOrderId` 从未赋值，
   使仓库"待发货需求"把已投产订单重复计入，库存欠数虚高。
   另外：新增 `xxxId` 字段后要全局搜一次"谁在用 `isNull(xxxId)` 判空"。
11. **事件类必须有真实发布方（禁止"孤儿监听器"）**
   定义了 `XxxEvent` + `@EventListener` 监听器，但**生产代码里没有任何
   `publishEvent`** —— 这条链路就是死代码，且极难发现（编译通过、测试通过、
   监听器单测也通过，因为测试里自己 `new` 了事件）。
   自查命令：`grep -rn "publishEvent" backend/src/main` 与
   `grep -rn "new XxxEvent(" backend/src/main` 必须都能命中。
   历史事故：`StockChangeEvent` 有两个监听器却无发布方，
   导致"入库/出库 → 电商库存重算"从未触发，`t_ec_universal_stock` 长期不刷新。
   修复方式见 `StockChangePublisher`（事务提交后发布 + 解析不到 SKU 就跳过）。
12. **自动动作事件要过开关，不得绕过"智能化不自动执行"原则**
   监听器里做**外部**写操作（推平台、发通知）前，必须查
   `BackendActionFlagService.isEnabled(tenantId, BackendActionKey.XXX)`，
   与手动入口保持同一开关。只做**本地重算**的分支不受开关限制。
13. **禁止用字符串切分猜款号（SKU 编码的真实格式）**
   真实 SKU 编码是「**款号直接拼颜色尺码，没有分隔符**」，
   例如 `BR24XQ0098E草绿色L(170/84A)`（款号 `BR24XQ0098E`，颜色 `草绿色`，尺码 `L(170/84A)`）。
   因此下面这些写法在真实数据上**恒不命中**，属于隐性 P0：
   - `skuCode.split("-")[0]`
   - `skuCode.indexOf('-')` 取前缀
   - `likeRight(skuCode, styleNo + "-")`
   - `eq(skuCode, styleNo)`

   正确做法（按优先级）：
   1. 有 `style_id` 就用 `style_id` 精确等值（`t_ec_universal_stock` 等表都有该列）；
   2. 只有 `sku_code` 时，先由 `t_product_sku`（sku_code → style_id）+ `t_style_info`
      解析出权威款号，再用 `IN (该款全部 sku_code)` 或前缀匹配；
   3. 解析不到就返回 `null` / 不匹配，**不要退回字符串猜测**。

   历史事故：`EcProductionLinkOrchestrator`、`EcommerceOrderOrchestrator`、
   `EcStockCalculator`、`ChannelSalesPredictor` 四处都用 `-` 切分猜款号，
   导致悬浮面板库存永远"暂无数据"、EC 单永远关联不上生产单、待发货占用恒为 0。
14. **入站 Webhook 的失败必须体现在 HTTP 状态码上（禁止"200 + 业务失败"）**
   平台侧（淘宝/京东/顺丰…）只看 **HTTP 状态码**决定是否重推。
   若失败时返回 200、只把失败写进 JSON body，平台会认为"已送达"而**不再重试**，
   订单/回调就被静默丢弃——线上现象是"平台说推送成功、系统里没有单"，极难排查。

   状态码约定（**所有入站回调必须一致**）：
   - `200` 处理成功 / 幂等命中重复推送
   - `401` 配置类错误：未配置平台、缺 AppKey/AppSecret、缺签名头、签名不匹配
     —— 重试无意义，需人工修配置
   - `500` 处理异常（DB 抖动等）—— 平台可安全重推，落库侧按业务唯一键幂等去重

   ```java
   // ❌ 禁止：异常也返回 200
   catch (Exception e) { return ResponseEntity.ok(Map.of("received", false)); }
   // ✅ 正确
   catch (Exception e) {
       return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
               .body(Map.of("received", false, "error", e.getMessage()));
   }
   ```

   历史事故：`EcommerceOrderController.receiveWebhook`（D-522 修）与
   `PlatformWebhookController.receiveOrder`（D-523 修）同一 bug 各写一遍；
   物流回调也曾把未处理写成 `processed=true`。**改动任一回调时，顺手扫一遍同类入口。**

15. **api.get 返回的是信封 `{code,data}`，不是业务数据**（2026-10-18 收银台整页白屏）
    `createApiClient` 的响应拦截器 `return response.data`，所以
    `api.get<T>()` 返回的是**信封**。约定：**service 层解包，调用方拿裸数据**。

    ```ts
    // ✅ 正确
    list: async () => unwrapApiData<Row[]>(await api.get('/x'), '加载失败')
    // ❌ 禁止：泛型不要写 { code: number; data: X }，那等于对外声明"返回信封"
    getById: (id: string) => api.get<ApiResult<Customer>>(`/c/${id}`)
    ```

    事故经过：三个新面板（挂单/退货/交接班）都把返回值直接塞给 antd Table，
    信封是对象不是数组 → `dataSource.some is not a function` → **整页白屏**。
    更严重的是 `resumeHold` 因此拿不到 `lines`，**取回挂单会把空购物车交给收银台**，
    顾客的东西在界面上消失而无人察觉。

    为什么单测全绿：测试 `vi.mock` 整个 service 模块，mock 返回的是**已解包数组**。
    **mock 什么形状本身就是测试的一部分** —— mock 成已解包等于替实现说谎。

    三道防线（都已落地）：
    | 措施 | 位置 |
    |---|---|
    | `unwrapApiData` 改成**幂等**（非信封原样返回） | `utils/api/core/helpers.ts` |
    | 禁止新增 service 层信封泄漏（**存量已全部清零**，2026-10-19 D-825：9 批共清 460+ 处（终批代码因并行会话 git add -A 落于 60e1bf2c2，编号改记 D-825）；posApi/crm/production/finance/shop/system/intelligence 均已在 service 层解包） | `scripts/check-api-envelope-leak.py` |
    | posApi / ticketApi 已在 service 层解包 | 已改造 |

    ✅ 2026-10-19 D-825 全部清零：intelligenceApi 96 法/179 处已迁完（脚本化平衡括号解析 + tsc 抓调用方 + 契约测试 10 例），
    baseline 从 179 → 0。后续新增泄漏由该脚本在 CI 阻断。

    ⚠️ 多行箭头写法（`=>` 结尾换行接 `api.get<T>`）也会被拦 ——
    第 2 批升级守护后才看见它们，真实存量比首拍多一倍。posApi 会员脸上的
    `setMember(信封)` 靠升级才暴露：信封恒 truthy，
    会员面板读 `member.name` 全 undefined、充值提示「余额 undefined」。
    混装解包比全量信封更容易藏 bug ——两批参考正反范本见 posApi。**

16. **电商/仓库的每一张商品相关列表都必须带「款式图 + 款号」列**
   用户原话：「所有的电商的这些 必须都要有图片列，不然看都不好看，还不知道是什么订单」。
   只看一串 `skuCode` / 一个 `skuId` 数字，运营根本无法确认是不是那件货。

   两条硬性要求：
   - **列必须有**：新建任何电商/仓库列表（含 tab、弹窗里的明细）时，
     「款式图」列是**默认项**，不是可选项；列宽、占位灰块、点击预览全站统一。
   - **款号只能来自后端解析**：即铁律 13。前端一律走 `POST /api/style/sku/brief`
     （或 `POST /api/ecommerce/orders/brief` 按订单号回查），**禁止任何 `split('-')` 猜测**。

   统一实现（**照抄，不要各写各的**）：
   | 场景 | 后端 | 前端列工厂 |
   |------|------|-----------|
   | 行里有 `skuCode` | `POST /api/style/sku/brief` | `styleImageColumn` / `styleNoColumn` |
   | 行里只有订单号 | `POST /api/ecommerce/orders/brief` | `orderImageColumn` / `orderStyleNoColumn` |

   - 数据源：`useStyleCoverImages()`（`imageMap` / `briefBySku` + `orderImageMap` / `briefByOrderNo`）；
     接口自带摘要时用 `seedBriefs()` 省一次请求。
   - 查不到就显示占位/退回编码，**不编造默认图或假款号**。
   - 加新列表后自查：`grep -rn "split('-')\[0\]" frontend/src` 不应再出现商品相关命中。

   历史事故：`skuCode.split('-')[0]` 使款式图列**永远是灰块**、款号列显示整串编码
   （D-522 修后端四处，D-524 修电商全部列表，D-525 修商品仓储 + 入库/收货各处）。

   **已覆盖清单（改动前先对照，别重复劳动）**
   - 电商：电商中心 8 组列、退款、定价建议、库存差异、分销 2 组、平台详情订单、
     仓库-电商订单、合单发货弹窗。
   - 商品仓储（菜单名，代码目录 `FinishedInventory`）：主表、出库弹窗「商品编码明细」、
     入库记录抽屉明细、扫码出库弹窗、自由入库弹窗、商品编码详情抽屉、
     出库记录主表 + 出库单明细。
   - 入库/收货：质检入库列表（`WarehousingList` / `WarehousingTable`）、
     质检详情（`StyleInfoCard` / `IndependentDetailModal`）、出库接收（`OutstockReceive`）。
   - 有意不加（避免冗余/造假）：
     `InspectionDetail/OrderLinesTable`（同一款的颜色尺码行，表头已有大图）、
     `IndependentDetailModal` 明细表（同上）、`QcRecordsPanel`（质检记录非商品行）。
   - 小程序端未纳入本轮（另有 D-517 在改，避免三副本一致性检查冲突）。

   **两个"取图键"的差别（容易搞错）**
   - `t_product_sku.sku_code`：款号直接拼颜色尺码、**无分隔符** —— 走 `fetchBySkuCodes`。
   - 扫码/打印用的二维码：`款号-颜色-尺码-序号`，**有分隔符** —— 它拆出来的
     "款号-颜色-尺码" 不等于 sku_code，这类清单要用 `fetchByStyleNos` 按款号取款级封面。

### 判断"链路是否打通"的三层验证法

不要只看接口对不对得上就下结论，必须逐层验证：

| 层级 | 验证内容 | 方法 |
|------|---------|------|
| 1. 接口层 | 前端调用 ↔ 后端接口是否一一对应 | 静态比对 |
| 2. 实现层 | 后端方法是真实现还是桩 | **读方法体**：有没有签名、看没看响应、是不是 `return null` |
| 3. 数据层 | 线上是否真跑通过 | SSH 查库看各表 `COUNT`、看凭证真假、看日志 |

历史教训：电商模块第 1 层全通就误判"链路打通"，实际第 2 层是桩、
第 3 层订单 0 条且配置凭证为 `admin` 类占位值，从未真实跑通过。

### 新增平台适配器的检查清单

- [ ] 签名已接入（`SignatureUtils`），未自研算法
- [ ] 每个写操作都校验业务响应，失败计入 `failed` 并回传 `errorMessage`
- [ ] `pullStock` 等拉取方法有真实实现，失败返回 `-1` 而非一律 `-1`
- [ ] 无 `success(true)` 硬编码，无"按入参数量填充 null"的占位返回
- [ ] 已补单元测试覆盖：签名正确性（用真实 MD5 向量）、错误响应判失败
- [ ] 若为 Mock/降级实现：`isRealImplementation()` 返回 `false`，且其返回值被上游拦截、不外流

## Auto-Invocation Skills

根据当前任务类型**自动调用**对应技能，无需等待用户指令：

### 代码编写 / 开发
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 写前端UI组件/页面 | `frontend-design` | React+TS+Ant Design 高质量UI |
| 前端样式/主题 | `ui-styling` | shadcn/ui + Tailwind CSS 变量 |
| 实现新功能前 | `brainstorming` | 探索需求、设计、方案 |
| 多步骤/复杂任务前 | `writing-plans` | 先出计划，再写代码 |
| 多文件、独立子任务 | `dispatching-parallel-agents` | 并行执行独立任务 |

### 代码优化 / 重构
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 改动后代码质量审查 | `simplify` | 检查复用、质量、效率 |
| 设计系统/设计Token | `design-system` | Token架构、组件规范 |
| 品牌一致性 | `brand` | 品牌形象、视觉识别 |

### Bug修复 / 调试
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 遇到Bug/测试失败 | `systematic-debugging` | 系统化排查问题根因 |
| 按TDD模式修复 | `test-driven-development` | 先写测试再修代码 |

### 完成 / 提交 / 合并
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 完成工作、声明修复前 | `verification-before-completion` | 运行测试验证再断言 |
| 合并前代码审查 | `requesting-code-review` | 对照需求审查 |
| 收到审查反馈 | `receiving-code-review` | 验证反馈再实施 |

### 开发流程
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 新功能独立开发 | `using-git-worktrees` | 创建隔离 worktree |
| 执行实现计划 | `subagent-driven-development` | 按计划分步执行 |
| 减少权限弹窗 | `fewer-permission-prompts` | 扫描并添加权限白名单 |

## Key Reference Docs

- [CLAUDE.md](CLAUDE.md) — 完整架构规范与禁止模式（本文件）
- [模块与职责快速查询表.md](模块与职责快速查询表.md) — 编排器速查
- [设计系统完整规范-2026.md](设计系统完整规范-2026.md) — 前端UI强制规范
- [系统状态.md](系统状态.md) — 完整业务逻辑与数据流向
- [系统状态.md](系统状态.md) — 系统全景与更新日志

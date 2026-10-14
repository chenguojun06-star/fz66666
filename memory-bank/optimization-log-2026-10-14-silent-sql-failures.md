# Optimization Log — 2026-10-14 全项目盘点：8 处静默失效的原生 SQL 缺陷（含 2 个 P0）

> 日期：2026-10-14
> 状态：**已上线 / 全部闭环**（1 项待次日 04:50 观察清理任务实跑结果）
> 关联提交：`39bb8091e`（修 8 处 SQL）· `7ec5d7ab1`（刷新列快照）· `aebd839c7`（分页上限）· `fb4eb3cd2`（自愈器提级）· `091d61262`（静默吞异常门禁）· `5a22ad917`（契约测试 18 条）· `10553cd8a`（监控假告警）
> 同日前置：`30d25ea5c`（店铺全屏看图支持缩放 —— 本轮盘点正是由顾客反馈"图片不能缩放"引出的）
> 非本次改动（并行会话）：`d368c9cd4` · `cdd6f1291` · `aa52073d4` · `f2b9ecc61`（D-800 商品上架系列）

---

## 零、一句话结论

**不是"还有一堆小毛病"，而是 8 处原生 SQL 在生产库上根本跑不通** ——
其中工资打款必 500、日志清理 6 个月一条没删。它们能藏这么久，
共同点不是"SQL 写错"，而是：

```
抛 Unknown column → 被 catch 抓住 → 只打 log.debug → 生产日志级别看不见
→ 功能静默失效数月 → 没人发现
```

所以本轮除了修缺陷，重点是把**"看不见"本身**修掉。

---

## 一、怎么盘出来的（方法可复用）

拿生产库真实结构反向核对全仓原生 SQL，而不是靠读代码猜：

1. 导出生产库 **5740 个真实列 / 308 张表** 作为基准
2. 抽取全仓原生 SQL 的**三类来源**：
   - `@Select/@Update/@Insert/@Delete` 注解（含 Java 15 文本块）
   - `jdbcTemplate.update/query/queryForAny` 的字符串拼接
   - `resources/mapper/*.xml`
3. 逐个 SQL 取其涉及的表，核对 SQL 里出现的列名是否真在该表上

**关键教训：第一版只扫注解 SQL，正好漏掉最严重的两处**（都在 `jdbcTemplate` 拼串里）。
扫描器必须覆盖三类来源，否则等于没扫。

---

## 二、8 处缺陷（共 11 个引用）

| # | 位置 | 坏列 | 真列 | 后果 |
|---|---|---|---|---|
| 1 | `PayrollSettlementMapper:14` | `settlement_time` | 该列**不存在** | **P0** 工资打款必 500 回滚 |
| 2 | `AuditLogCleanupJob:42` | `create_time` | `created_at` | **P0** 每天 04:50 清理必失败 |
| 3 | `AuditLogCleanupJob:58` | 同上 | 同上 | 同上 |
| 4 | `AiSelfEvolutionService:53` | `tool_name` `arguments_json` `result_summary` `avg_feedback` | 四列全不存在 | AI 自进化取不到样本 |
| 5 | `AiSelfEvolutionService:66` | `session_id` `tool_calls_count` `create_time` | `id` `trace_id` `created_at` | 低健康分会话恒为空 |
| 6 | `AiSelfEvolutionService:107` | `insights` `status` `create_time` | `insight` / 无此列 / `created_at` | 洞察永远存不下来 |
| 7 | `SelfDrillOrchestrator:244` | `t_tenant.delete_flag` | 无此列 | 自演练一个租户都不跑 |
| 8 | `PatrolEvidenceEnricher:62,93` | `order_no` `progress_stage` | `production_order_no` `process_name` | AI 巡检订单工单永远没证据 |

另有 2 个误报已排除：CTE 名（`child_r` / `graph_path`）、排序规则标识（`utf8mb4_bin`）。

### P0-1 工资打款（`settlement_time`）

- **实证**：生产库直跑该 UPDATE → `ERROR 1054 (42S22) Unknown column 'settlement_time' in 'field list'`
- **根因**：照抄了 `ProductOutstockMapper.atomicAddPaidAmount`（`t_product_outstock` 的这列由
  `V202608031000` 补过），**抄了语句、漏了列**
- **影响**：该方法在 `@Transactional` 内且调用方无 try/catch → 异常冒泡回滚 → 功能完全不可用
- **修法**：补列（`V202710140001`）+ 实体加字段。**补列而非改 SQL** ——
  列的语义明确（全额付清时刻），且与 `t_product_outstock` 同构；
  删掉它会静默丢掉"何时付清"，`payment_status` 只能说"已付清"、说不了"什么时候"

### P0-2 日志清理（`create_time`）

- **最恶劣的一点**：外层 catch 把**后面两段清理一起中断** —— 巡检工单、AI 任务日志从不清理
- **实证**：`t_ai_job_run_log` 250.5 万行，其中 **191 万行超 90 天保留期仍未被删**，
  最早记录停在 2026-04-15；每天备份要 21.5 秒扫 227 万行
- **修法**：① 列名改 `created_at`；② **三个清理阶段拆开各自 try/catch**（单段失败不再连累其他段）；
  ③ 所有 catch 从 `log.debug` 提到 `log.warn` —— 沉默的清理等于没清理，这条 bug 正是靠 debug 躲了半年
- **附带修**：巡检工单完工时间改 `COALESCE(close_time, execution_time, update_time)`。
  实测 `AUTO_EXECUTED` 的 16378 条 **`close_time` 全为 NULL**，
  原条件 `close_time < X` 对它们恒不成立 → 永远删不掉

### 三处 AI 功能静默空转

`AiSelfEvolutionService`（两处查询 + 一处落库）、`SelfDrillOrchestrator`、
`PatrolEvidenceEnricher` —— 全部按**真实存在且有信号**的列重写：

- 自进化的"低反馈"口径改为 `confidence_score`（实测区间 29~85、均值 56.7）；
  该表 `user_feedback`/`feedback_note` 实测 0 条非空，没有"用户评分"这回事
- 自演练的租户筛选改为 `status = 'active'`。**注意这里有两个错**：
  `delete_flag` 不存在（查询必失败），且 `NOT IN ('DISABLED','SUSPENDED')`
  与库里真实取值 `active`/`inactive`（小写）也对不上 —— 去掉 delete_flag 也筛不掉任何人
- 巡检证据的关联列改 `production_order_no`，投影/分组改 `process_name`

---

## 三、性能项

| 项 | 实证 | 处置 |
|---|---|---|
| `AiJobRunLogMapper.selectRecentByStatus` | `(#{status} IS NULL OR status=#{status})` 的 OR 谓词让索引失效，250 万行全表扫 + filesort，慢日志一天 16 次 | 改等值条件；**Service 层按 status 是否为空分流到两条语句**（动态 SQL 反而做不到这件事）。V202710140002 补 `(status, start_time)` 复合索引 |
| 巡检查询 | 慢日志 60 条（一天内最多），`t_ai_patrol_action` 缺 `(status, risk_level)` 组合 | V202710140002 补该索引 + `(close_time, status)` |
| 审计日志清理 | 按 `(tenant_id, created_at)` 删，原索引只在 tenant_id 上 | V202710140002 补同序复合索引 |
| 遗留备份表 | 6 张，其中 `t_intelligence_signal_bak_d702` **15 万行无主键无索引**、还在被全表扫 | 待清理（见遗留） |

---

## 四、把"看不见"本身修掉（本轮的重点）

### 4.1 CI 门禁：原生 SQL 列名核对（`scripts/check-native-sql-columns.py`）

拿生产库列快照（`scripts/data/prod-schema-columns.tsv`，5741 列）**离线**核对 391 条原生 SQL。

- 对修复前的代码报 **12 条错、退出码 1**；对修复版通过 —— 双向验证过
- 覆盖三类 SQL 来源；另单独核对 **INSERT 的显式列清单**
  （`insights`/`status` 没有下划线，靠"snake_case 裸标识符"规则查不出来 ——
  第 6 处缺陷就是守护脚本刚上线才抓出来的，我人工盘点时漏了）
- 误报排除：CTE 名、AS 别名、**表别名**（`JOIN t_kg_relation child_r ON` 里的 child_r）
- 用 `scripts/data/pending-new-columns.txt` 解开"代码先引用新列、迁移还没上线 → 门禁先红"的死结；
  `--refresh` 时自动剔除已上线列

### 4.2 CI 门禁：自愈清单新增条目必须有 Flyway 迁移（`check-db-repair-vs-flyway.py`）

项目里有**两条结构真相源**：Flyway 迁移 + `DbColumnRepairRunner` 的启动自愈清单
（`DbTableDefinitions` 74 张表 / `DbColumnDefinitions` 1138 条补列）。
自愈器原先每次动手只打 `log.warn`，散落在几百行启动日志里没人看，
**Flyway 漂移被它悄悄盖住**。

- **先取证再动**：实测生产启动日志是"关键表结构完整，无需修复"——
  兜底逻辑当前空转，所以有条件只改"可见性"、不动"还修不修"
- 自愈器每次动手 `warn` → `error`，并汇总一行；无漂移时输出
  `结构真相源=Flyway，无漂移`，方便 grep / 配告警
- 新增门禁为**棘轮式**（存量 1138 条写于 Flyway 之前，逐条要求会立刻全红）
- **两个实现坑**：① 必须做真 diff —— 第一版写成"迁移提到某表 → 该表所有列都得出现"，
  一个提到 `t_user` 的迁移把 20 多条历史条目全判成漂移，**误报洪水**；
  ② 比对前**先剥 SQL 注释** —— 注释里提到列名不算覆盖，第一版验证时被自己写的注释骗过

### 4.3 CI 门禁：禁止新增「catch 里只打 log.debug」（`check-silent-catch.py`）

这是那 8 个缺陷能藏半年的**真正根因**。所以这里 `log.debug` 不是"日志级别选得保守"，
而是**把故障藏起来的手段**。

- 规则：新增的 catch 若既无 `warn/error`、块内也无解释性注释 → 构建失败；
  可忽略的旁路加一行注释即可（`// 尽力而为：失败不影响主流程`）
- 存量 32 处不动（其中确有合理的：缓存未命中、可选旁路）
- **实现坑**：第一版假定 catch 总在 `log.debug` 上一行，但
  `catch (Exception e) { log.debug(...); return null; }` 全写一行很常见 → **一条都抓不到**

### 4.4 分页大小统一上限（`PageSizeLimitFilter`）

全仓 47 个 Controller、70 个分页参数（`pageSize` 37 / `limit` 27 / `size` 6），
此前只有 7 个文件各自截断，其余直接透传给 MyBatis-Plus 的 `Page<>`。
已确认 `OperationLogController` 就是直通：`?pageSize=100000` 把整表捞回
（实测该表 8393 行，全量返回时响应体数 MB）。`pageSize=0` 在 MyBatis-Plus 语义下
还可能退化为不分页，比设大值更危险。

**为什么用 Filter 而不是自定义 `HandlerMethodArgumentResolver`**（先试过后放弃）：
自定义解析器在 Spring 解析器链里**排在 `@RequestParam` 内置解析器之后**
（`RequestMappingHandlerAdapter#getDefaultArgumentResolvers` 先加注解类、再加 custom），
对 `@RequestParam int pageSize` 这种写法**一次都不会被调用** ——
代码看着完全正确、实际零效果。Filter 跑在 DispatcherServlet 之前，
包一层请求即可覆盖所有控制器，与参数怎么声明无关。

**上限为什么是 10000 而不是常见的 50~200**：定数字前先把调用方数了一遍 ——
前端有 **96 处**传的分页值超过 200，全是"下拉框一次性加载全部选项"
（供应商 1000、客户 1000、字典 999、角色用户 9999、环节配置 9999…）。
夹到 200 会让这些下拉框**静默只显示前 200 项** —— 租户有 300 个供应商时后 100 个凭空消失，
正是本轮在修的那类静默截断。取 10000 覆盖现有全部合法用法（实测最大 9999）。

> **通用教训：给"防滥用"的阈值定数字前，必须先统计现有合法用法的分布，
> 否则阈值本身就成了新的静默截断源。**

实现坑：
- **必须惰性**：包装类不能在构造函数里读 `getParameterMap()` ——
  那会**提前触发 multipart 表单解析**，等 MultipartResolver 再处理上传请求时就晚了，
  症状是"文件上传突然失败"。已写守护测试（用一个"一被问就记账"的请求验证构造期零访问）
- **三元表达式混用 `Long`/`Integer` 会被数值提升**：
  `t == Long.class ? Long.valueOf(x) : Integer.valueOf(x)` 按 JLS 15.25
  结果类型被提升成基本类型 `long` 再装箱回 `Long`，
  于是 `Integer` 形参永远收到 `Long`（反射调用控制器会类型不匹配）。
  改为两个独立 `if/return`。**这条是被单元测试当场抓住的**，
  否则会一次性打挂 7 个 `Integer pageSize` 的接口

### 4.5 监控假告警：首次调用不计入慢方法（`PerformanceMonitor`）

生产报 `AiAdvisorService.cleanupStaleCounters() 1252ms`，
但该方法只有一行 `removeIf` —— 是 `@Scheduled(fixedRate=3600000)` 启动后
**首次调用**的类加载/JIT 开销。同形态还有 `CronSchedulerService.tick()`、
`AsyncIntelligenceAuditService.flush()`，每次重启各刷一条。

**危害是假告警会训练人忽略真告警** —— 看久了就没人再看这一行，
而这行恰恰是发现真慢方法的唯一入口。改为首次调用只打 debug，统计照常记录。

### 4.6 生产 CORS 明文条目（非代码改动）

启动校验 `ProductionSecurityValidator` 每次告警"包含 HTTP 协议源"，
实际白名单里有 `http://h5.webyszl.cn`。

- **先验证再动**：`curl -D - http://h5.webyszl.cn/` → **308 Permanent Redirect → https**，
  说明浏览器永远发不出这个 Origin，条目是死的，删掉安全
- 改的是服务端 `/opt/fz66666/deploy/lighthouse/.env.backend`（**不在仓库里**），
  已备份 `.env.backend.bak_cors_20261014_225952`，`docker compose up -d --force-recreate backend` 生效

---

## 五、契约测试（18 条）

intelligence 域 969 个源文件只有 34 个测试，正是这批缺陷的集中地。
逐个补不现实，所以**优先钉住"本轮真实修过、且此前完全没测试"的路径**。

| 测试类 | 条数 | 锁住什么 |
|---|---|---|
| `AiSelfEvolutionServiceTest` | 4 | 两个取样查询不得再用那 7 个不存在的列；INSERT 不得用 `insights`/`status`/`create_time` |
| `SelfDrillOrchestratorTest` | 3 | 不得用 `t_tenant.delete_flag`；状态值必须小写 `active` |
| `PatrolEvidenceEnricherTest` | 5 | 关联必须用 `production_order_no`；不得用 `progress_stage`；边界（空/null/多单） |
| `PayrollSettlementMapperSqlTest` | 6 | 资金链路：乐观锁、租户隔离、剩余金额与付清口径一致 |
| `AuditLogCleanupJobTest`（改） | +3 | 列名必须 `created_at`、巡检完工时间必须 COALESCE、**三阶段必须互相独立** |
| `AiJobRunLogMapperSqlTest`（改） | +2 | 不得含 `IS NULL OR`；Service 层分流 |
| `PageSizeLimitFilterTest` | 15 | 上限/下限、三个参数名、非数字放行、其他参数不动、构造期零访问、跨端守护 |
| `PerformanceMonitorTest` | 3 | 首次调用标记预热但统计照记 |

**关键验证手法（必须坚持）**：把源文件换回修复前的版本再跑 ——
**12 条里 7 条失败**，报错逐条对应各自缺陷；换回修复版 12/12 通过。
**不这样做就无法区分"测试在测行为"和"测试在复述实现"。**

> **诚实边界**：`PayrollSettlementMapperSqlTest` 锁的是不变量，
> **抓不到当初那个 bug** —— 当初 SQL 文本本身是对的，错的是库里没那列，
> 纯文本断言无从判断。那类问题由 `check-native-sql-columns.py`（列快照比对）负责，
> 它确实抓到了。两组守护各管一段，不重复也不互相替代。

### 顺带修正两条锁死坏写法的旧断言

- `AiJobRunLogMapperSqlTest` 原断言 `contains("#{status} IS NULL")` ——
  正是把本轮要修的索引杀手当成契约钉住（与早前 galImgs 那次同类问题：
  断言"代码长什么样"而不是"行为对不对"）
- `AuditLogCleanupJobTest` 原测试反射调用 `batchDelete(String, Integer)`，
  签名改 varargs 后失配 —— 顺手把新不变量补了进去

---

## 六、验证（全部为生产实证）

| 项 | 证据 |
|---|---|
| 迁移生效 | 生产库 `settlement_time datetime` 已建；4 个索引已建；Flyway 两条记录 success |
| 迁移安全 | **先在沙箱库实跑**：`CREATE TABLE ... LIKE` 克隆真实结构 → 执行 → 二次执行幂等（全部走 `SELECT 1` 跳过）→ 退出码 0 → drop 沙箱 |
| 工资打款 | 修后同语句生产库退出码 **0**（修前 `ERROR 1054`） |
| 清理量预估 | COUNT 形式预跑：audit_log 24804 / patrol 15 / **joblog 1910263** 条待删 |
| 分页上限 | `pageSize=100000` → 日志 `已夹到 10000`，HTTP 200；`pageSize=0` → 夹到 1；`pageSize=20`/`9999` 原样通过（夹取计数不变） |
| 自愈器 | 启动日志出现 `关键表结构完整，无需修复（结构真相源=Flyway，无漂移）` |
| CORS | 告警 0 条；`https://www.webyszl.cn`/`https://h5.webyszl.cn` 仍放行、`http://h5.webyszl.cn` 不再返回 ACAO；店铺页 200、商品接口正常 |
| 服务健康 | 生产日志 0 ERROR、0 `Unknown column`；后端全量 **895 用例 0 失败**；CI 全绿 |

---

## 七、遗留（按优先级）

- [ ] **观察日志清理实跑**：次日 04:50 执行，预期回收 191 万行 job log + 2.5 万条 audit log，
      日志应出现 `[AuditLogCleanup] 清理90天前AI任务执行日志(成功/跳过流水): 删除N条`
- [ ] **清理 6 张遗留备份表**：`t_intelligence_signal_bak_d702`（15 万行、无主键无索引、
      还在被全表扫）、`t_ai_patrol_action_bak_d654`、`bak_d744_patrol_action`、
      `bak_d719_bill_subject_mapping`、`bak_d719_bill_aggregation`、
      `t_material_purchase_ghost_backup_20260927`
- [ ] **前端 96 处"全量加载下拉"**：改为服务端搜索，而不是拉一万行在浏览器里过滤
      （属产品决策，非安全修复）
- [ ] **存量 32 处 `log.debug` 静默 catch**：逐个评估是否该提级
      （已用门禁禁止新增，存量未动）
- [ ] **`DbTableDefinitions` 退役**：1664 行 Java DDL 与 Flyway 重复，
      目标是把自愈清单逐步搬到迁移、让自愈器最终只告警不改库
- [ ] **crm / style / production 等域补测试**：本轮只覆盖了真实修过的路径

---

## 八、本轮留下的可复用资产

| 资产 | 用途 |
|---|---|
| `scripts/check-native-sql-columns.py` | 拿生产库列快照离线核对原生 SQL 列名；`--refresh` 刷新快照 |
| `scripts/data/prod-schema-columns.tsv` | 生产库列快照（5741 列），**需随迁移定期 refresh** |
| `scripts/check-db-repair-vs-flyway.py` | 自愈清单新增条目必须有 Flyway 迁移 |
| `scripts/check-silent-catch.py` | 禁止新增 debug-only 的静默吞异常 |
| `scripts/data/pending-new-columns.txt` | 解开"新列先于迁移上线"的门禁死结 |

CI quality-gate 现共 50 个步骤，其中四条是**这个项目真实踩过、且靠静默藏了很久**的坑。

### 本轮反复出现的三个通用教训

1. **静默是最大的敌人**：catch 成 debug、只打 warn 散在启动日志里、
   阈值定错导致假告警 —— 三种不同形态，同一个后果：**没人看见真相**。
2. **定阈值/定上限前先统计现有用法分布**：否则阈值本身就是新的静默截断源
   （分页上限从 200 改到 10000 就是这个过程）。
3. **守护脚本本身也会错，必须双向验证**：对修复前的代码要失败、对修复版要通过。
   本轮三个新脚本都返工过（漏扫 jdbcTemplate、误报洪水、被自己的注释骗过、抓不到单行写法）。

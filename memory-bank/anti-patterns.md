# 常见反模式速查表（Anti-Patterns）

> 把踩过的坑变成可搜索的警示清单，防止重复踩坑
> 每条反模式都有：识别信号 → 错误做法 → 正确做法 → 触发的P0铁律

---

## 🗄️ 数据库相关

### AP-DB-01: 修改已执行的 Flyway 脚本内容
**识别信号**：看到有人修改 `V*.sql` 文件，且该文件里的版本号对应的脚本已经在云端执行过
**错误做法**：直接编辑已执行过的 `V20260601001__xxx.sql` 内容（如加列/改字段类型）
**正确做法**：创建新的 V*.sql 文件，做 ALTER TABLE 增量变更。Flyway 会记录每个版本的 checksum，修改已执行的内容 → checksum 不匹配 → 应用启动失败
**触发P0铁律**：#5 禁止修改已执行的 Flyway 脚本
**历史教训**：2026-06-11 有过多次此类事故

---

### AP-DB-02: Entity 字段和数据库表不同步
**识别信号**：Entity 新增字段但没写 Flyway 脚本，或写了 Flyway 但 Entity 没加字段
**错误做法**：
```java
// Entity 加了字段
private String newField;
// 但没写 ALTER TABLE t_xxx ADD COLUMN new_field VARCHAR(255);
```
**正确做法**：改 Entity = 同步写 Flyway，写 Flyway = 同步改 Entity。两者必须成对出现
**触发P0铁律**：#2 数据库同步
**检查命令**：修改完后先本地测一下，看报不报 `Unknown column`

---

### AP-DB-03: SQL 查询不带 tenant_id 过滤
**识别信号**：Mapper XML 或 Service 里的查询条件没有 `tenant_id = #{tenantId}`
**错误做法**：
```xml
<select id="getAllOrders">
  SELECT * FROM t_production_order  <!-- 没有 tenant_id 过滤！ -->
</select>
```
**正确做法**：所有查询必须带 `tenant_id = #{tenantId}` 条件
**触发P0铁律**：#7 跨租户隔离
**后果**：A 工厂用户能看到 B 工厂的数据 → P0 安全事故

---

## 🔧 后端架构相关

### AP-BE-01: Controller 直接调用多个 Service
**识别信号**：Controller 方法里写了 `orderService.create()` + `stockService.deduct()` + `scanService.init()` 三段调用
**错误做法**：
```java
@RestController
public class OrderController {
  public Result create(OrderRequest req) {
    orderService.create(req);       // ❌
    stockService.deduct(req.getSku()); // ❌ 跨Service直调
    scanService.initialize(req.getId()); // ❌ 没有事务边界
    return Result.success();
  }
}
```
**正确做法**：创建 `ProductionOrderOrchestrator`，在编排器层统一管理事务和调用顺序
**触发P0铁律**：#1 Orchestrator 事务边界
**后果**：中间步骤失败无法回滚 → 数据不一致

---

### AP-BE-02: Service 层加 @Transactional
**识别信号**：Service 类或方法上标了 `@Transactional`
**错误做法**：
```java
@Service
@Transactional  // ❌ 事务边界放错了层
public class ProductionOrderService { ... }
```
**正确做法**：@Transactional 只出现在 Orchestrator 层。Service 是单领域 CRUD，不应该管事务
**触发P0铁律**：#1 Orchestrator 事务边界

---

### AP-BE-03: 凭空造权限码字符串
**识别信号**：代码里出现 `@PreAuthorize("hasAuthority('SOME_NEW_PERMISSION')")` 但数据库没这条
**错误做法**：
```java
// 代码里写了这个权限码
@PreAuthorize("hasAuthority('ORDER_AUDIT')")  // ❌
public Result audit() { ... }

// 但 t_permission 表里根本没有 'ORDER_AUDIT' 这条记录
```
**正确做法**：先在数据库 `t_permission` 表插入权限码记录，代码里才能用
**触发P0铁律**：#4 权限码必须真实存在
**后果**：全员 403，功能完全不可用

---

### AP-BE-04: API 路径/响应格式随意改
**识别信号**：把 `POST /api/v1/orders` 改成 `POST /api/production/orders-list`，或者把响应从 `{code, data}` 改成了 `{status, payload}`
**错误做法**：只管后端改完，不管前端和小程序是否同步
**正确做法**：先用 `grep -rn "旧路径" frontend/ miniprogram/` 搜出所有调用点，再同步修改
**触发P0铁律**：#3 全链路验证
**后果**：前端 404，小程序功能静默失败

---

### AP-BE-05: String.valueOf(map.get(key)) 喂 hasText 判空（D-186 事故）
**识别信号**：看到 `hasText(String.valueOf(params.get("xxx")))` 或 `String.valueOf(map.get(...))` 参与判空/路由分支
**错误做法**：`String.valueOf(null)` 返回的是字符串 `"null"`（4个字符）不是空串 → `hasText` 恒真 → 判定分支永远命中。D-157 样衣委派判定踩中：所有不带 patternId 的大货扫码（production/quality/warehouse 三入口）被劫持进样衣链路，PC批量完成报"缺少样板生产单ID"，大货质检/入库扫码全断；D-157 当时只测了样衣扫码所以漏网，后端一重启才爆
**正确做法**：Map 取值判空一律 `TextUtils.safeText(params.get("key"))`（null→""，语义正确）；`String.valueOf` 只用于"确定非 null"或展示拼接场景
**触发P0铁律**：#3 全链路验证——新分支判定上线前，必须各跑一遍"命中"与"不命中"两类流量（样衣扫码 + 大货扫码）
**排查命令**：`grep -rn "hasText(String.valueOf" backend/src/main/java`

---

## 🖥️ 前端相关

### AP-FE-00: @ServerEndpoint 用 @Autowired 注入 Spring Bean
**识别信号**：WebSocket 端点类（`@ServerEndpoint`）或其 Configurator 里用了 `@Autowired` / Setter 注入 Spring Bean
**错误做法**：
```java
@ServerEndpoint(value = "/ws/xxx", configurator = MyConfigurator.class)
@Component
public class MyEndpoint {
    @Autowired private SomeService service;  // ❌ 永远是 null
}
```
**正确做法**：
```java
// 用 SpringContextHolder 静态获取 Bean
SomeService service = SpringContextHolder.getBean(SomeService.class);
```
**根因**：`@ServerEndpoint` 的 Configurator 和 Endpoint 实例由 **Tomcat 容器 new**，不走 Spring 容器，`@Autowired` 和 Setter 注入全部失效。即使标了 `@Component`，Tomcat 创建的实例也不是那个 Spring Bean。
**后果**：握手时 NPE → HTTP 500 → 前端 WS 连接失败 → 控制台刷屏
**触发P0铁律**：无（但属于 Spring + JSR-356 集成经典陷阱）
**历史教训**：2026-07-09 WebSocket 握手 500，AuthTokenService 和 ObjectMapper 永远为 null。D-033 新增的 WS 功能一上线就崩。

---

### AP-FE-01: 打印组件 font-family 用 sans-serif
**识别信号**：打印页面的 CSS 里写了 `font-family: 'PingFang SC', sans-serif;`
**错误做法**：
```css
.print-label {
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;  /* ❌ 以 sans-serif 结尾 */
}
```
**正确做法**：
```css
.print-label {
  font-family: 'Heiti SC', 'Songti SC', 'Hiragino Sans GB', serif; /* ✅ 以 serif 结尾 */
}
```
**触发P0铁律**：#6 打印字体
**后果**：macOS 上 `sans-serif` 回退到 Helvetica（无中文字符）→ 打印中文完全不显示

---

### AP-FE-02: 弹窗尺寸随意自定义
**识别信号**：看到 `<ResizableModal width="55vw">` 或 `defaultWidth`/`defaultHeight` 属性
**错误做法**：
```tsx
<ResizableModal width="55vw" defaultHeight="500px">  {/* ❌ 非标准尺寸 */}
```
**正确做法**：只能用 60vw（复杂表单）/ 40vw（普通表单）/ 30vw（确认对话框）三级
**触发P0铁律**：前端设计系统规范（见 copilot-instructions.md 弹窗部分）
**后果**：设计不一致，用户体验混乱

---

### AP-FE-03: 新增页面不使用标准通用组件
**识别信号**：手写了一个新的 Modal 组件，手写了一个 Table，没有用 `ResizableModal`/`RowActions`/`ModalContentLayout`
**错误做法**：
```tsx
<div className="my-own-modal">  {/* ❌ 重复造轮子 */}
  <table>...</table>            {/* ❌ 不用 ResizableTable */}
</div>
```
**正确做法**：优先使用 `components/common/` 下的标准组件
**触发P0铁律**：#3 全链路一致性（间接）
**后果**：样式不一致，维护困难，每个页面都有自己的 bug

---

## 📱 小程序相关

### AP-MP-01: PC 端改了逻辑但小程序没同步
**识别信号**：PC 端加了一个新的校验规则（如扫码间隔>5秒），但小程序端没改同样的逻辑
**错误做法**：只改 `frontend/src/utils/validationRules.ts`，没改 `miniprogram/utils/validationRules.js`
**正确做法**：两端的 validationRules 必须同步更新
**触发P0铁律**：#3 全链路验证
**后果**：PC 端和小程序端行为不一致，用户困惑

---

### AP-MP-02: 小程序直接写死 API 路径
**识别信号**：页面里直接写 `wx.request({ url: 'https://xxx.com/api/orders' })`
**错误做法**：
```js
// 页面里
wx.request({
  url: 'https://api.example.com/api/orders',  // ❌ 硬编码
  ...
});
```
**正确做法**：所有 API 请求走 `miniprogram/utils/api.js` 的统一封装
**后果**：API 路径改了需要到处搜

---

### AP-MP-03: ok() 包装的 API 仍判断 res.code / res.data

**识别信号**：用 `ok()` 包装的 API 调用后，`.then()` 里写 `if (res.code === 200)` 或 `res && res.data`
**错误做法**：
```js
// ok() 已经解包了 Result.data，res 就是业务数据
api.production.listScans(params).then(function (res) {
  if (res.code === 200) {     // ❌ res.code 永远是 undefined
    const data = res.data;      // ❌ res.data 永远是 undefined
  }
});
```
**正确做法**：
```js
// ok() 成功时 res 就是业务数据，失败直接 catch
api.production.listScans(params).then(function (res) {
  const records = Array.isArray(res) ? res : (res && res.records ? res.records : []);
}).catch(function (err) {
  // 错误处理统一走这里
});
```
**如何判断是 ok() 还是 raw()**：
- 业务接口（95%+）→ ok() → 直接用 res
- 登录/注册/公开接口 → raw() → 取 res.data
- 查 `utils/api-modules/*.js` 里函数体是 `return ok(...)` 还是 `return raw(...)`
**后果**：
- P0 级：页面数据全空（res.code 判断永远不成立，数据被丢弃）
- 代码混乱：同一个项目里两种风格混用，维护困难
**触发P0铁律**：#3 全链路一致性（间接）
**历史教训**：2026-07-15 工资页面数据全空，根因是 payroll.js 仍判断 `res.code === 200`，ok() 返回的 res 里压根没有 code

---

## 🔄 工作流相关

### AP-WF-01: 跳过编译验证直接推送代码
**识别信号**：改完代码直接 git commit + push，没跑 `mvn clean compile` 和 `npx tsc --noEmit`
**错误做法**："我只改了一行，应该没问题" → 直接推送
**正确做法**：
```bash
cd backend && mvn clean compile -q      # ✅ 后端编译
cd frontend && npx tsc --noEmit         # ✅ 前端类型检查
```
**后果**：CI 失败，线上崩溃
**触发P0铁律**：隐含在质量门控流程中

---

### AP-WF-02: 修改代码前不做影响范围评估
**识别信号**：拿到需求直接动手写代码，不搜现有实现，不查数据库结构
**错误做法**："我觉得这样改就行" → 直接改
**正确做法**：
1. 先看 `change-impact-matrix.md` 评估影响范围
2. 搜相关代码了解现有实现
3. 查数据库 schema 确认字段是否存在
4. 列清单再动手

---

### AP-WF-03: 会话开始未加载 Memory Bank 就动手
**识别信号**：用户说线上有问题，AI 直接看代码、改代码，不读 `memory-bank/` 任何文件
**错误做法**：跳过 `agent-workflow.md` 第1步（RooFlow Memory Bank 加载），凭对话上下文猜项目背景
**正确做法**：
1. 会话开始先读 `memory-bank/quick-start-5min.md` + `activeContext.md` + `decisionLog.md`（至少这三份）
2. 涉及部署/CI 时再读 `anti-patterns.md` + `change-impact-matrix.md`
3. 不知道部署流就去查 Memory Bank，不要凭空让用户"刷新页面"
**历史教训**：2026-07-09 WS token 修复，AI 没加载 Memory Bank，不知道"GitHub push → 微信云自动拉取"的部署流，让用户"刷新页面"被骂

---

### AP-WF-04: 修复线上问题却让用户手动刷新/部署
**识别信号**：用户反馈云端控制台报错，AI 改完代码后说"刷新页面后即可生效"
**错误做法**：改完代码不 push，让用户"刷新浏览器"或"手动部署"
**正确做法**：
1. 本项目部署流：`git commit` → `git push origin main` → 微信云自动拉取部署
2. 改完代码直接 commit + push，不要等用户问"怎么部署"
3. push 后告知用户"已推送，微信云会自动拉取"，而不是"请刷新页面"
**触发P0铁律**：无（部署流程规范，但严重影响用户体验）
**历史教训**：2026-07-09 WS token 修复后让用户"刷新页面"，被用户怒斥"云端部署的代码，本地刷新没用"

---

## 🧬 Collation 与动态建表相关（2026-08-16 新增，D-095 P0 事故）

### AP-COLLATION-01: 跨表 JOIN 前不核对两表 collation
**识别信号**：SQL 报 `ERROR 1267 Illegal mix of collations`；MyBatis 层只显示 `The error occurred while setting parameters`（该摘要涵盖 Unknown column/Table doesn't exist/1267，**极易误判为参数问题**）
**正确做法**：任何新增跨表字符串列 JOIN，先查 `information_schema.TABLES.TABLE_COLLATION` 两表是否同派；本库主流=`utf8mb4_0900_ai_ci`（215 张），unicode_ci/general_ci/bin 为历史少数派
**历史教训**：2026-08-16 关单自动工资单每次必炸，真凶就是 tracking(unicode_ci) JOIN scan_record(0900)。全库 290 张表 4 种 collation 并存，跨派 JOIN 都会炸
**✅ 已清偿（D-096）**：全库 290 张已 100% 统一 utf8mb4_0900_ai_ci；源头已根治（init.sql 建库 0900 + ALTER DATABASE 库默认对齐 + 动态建表显式 CHARSET）。新表仍需遵守：建表语句显式 `CHARSET=utf8mb4`（勿写其他 collation），新库初始化用新 init.sql

### AP-SCHEMA-03: 动态建表模板加新列但 DbColumnDefinitions 补列清单不同步
**识别信号**：`DbTableDefinitions.TABLE_FIXES` 建表语句加了列，但 `DbColumnDefinitions` 没有对应 add() 条目
**正确做法**：动态建表模板任何列变更，必须同步 `DbColumnDefinitions` 补列清单（`CREATE TABLE IF NOT EXISTS` 对已存在旧表不生效，唯一自愈通道是补列清单）；理想方案是收敛到 Flyway 单轨
**历史教训**：tracking 表早期模板无 scan_record_id，老环境永不自愈；V202608120001 hotfix（云端缺列）与本次事故同根因——schema 三轨制（init.sql/Flyway/Java动态修复器）漂移

---

## 🚀 启动流程相关（2026-08-02 新增，6 次部署失败血泪教训）

### AP-STARTUP-01: @PostConstruct 里扫表/网络调用/Thread.sleep
**识别信号**：`@PostConstruct` 方法体里有 `service.list()` / `mapper.selectList()` / HTTP 调用 / `Thread.sleep()` / 循环加密
**错误做法**：
```java
@PostConstruct
void migratePlaintextSecrets() {
    List<TenantApp> apps = tenantAppService.list();  // 扫全表！
    for (TenantApp app : apps) {
        app.setAppSecret(aesEncryptor.encrypt(app.getAppSecret()));  // 批量加密
        tenantAppService.updateById(app);  // 写库！
    }
}
```
**正确做法**：
- 数据迁移 → 运维脚本一次性执行
- 定期任务 → `@Scheduled`
- 异步初始化 → `ApplicationRunner` + `@Async`
- 健康检查 → actuator health endpoint 或首次调用时探测
**触发P0铁律**：#28 禁止启动时副作用
**历史教训**：2026-08-02 b8582636d 的 TenantAppOrchestrator.migratePlaintextSecrets() 每次启动扫全表加密，导致 SQL 字段长度溢出持续报错

---

### AP-STARTUP-02: FlywayRepairConfig 用 Thread.sleep 阻塞启动
**识别信号**：Flyway 修复逻辑里有 `Thread.sleep(randomDelay)` 避免"多实例并发死锁"
**错误做法**：
```java
@PostConstruct
void repair() {
    long delay = ThreadLocalRandom.current().nextLong(0, 15000);
    Thread.sleep(delay);  // 阻塞 Spring 上下文初始化 0-15 秒
    flywayRepair();
}
```
**问题**：Spring 上下文刷新被阻塞 → Tomcat 端口未 bind → K8s 探针 `connection refused` → Pod 被判失败重启
**正确做法**：移除 sleep，migrate 靠 `flyway_schema_history` 表锁天然串行化。如需防并发，用分布式锁或行级锁
**触发P0铁律**：#28 禁止启动时副作用 / #17 CloudBase 探针配置
**历史教训**：2026-08-02 e2ac3e792 修复前，FlywayRepairConfig sleep 0-15s 导致探针超时

---

### AP-STARTUP-03: @PostConstruct 做外部 API 网络调用（无超时配置）
**识别信号**：`@PostConstruct` 里调 `cosClient.listObjects()` / `httpClient.send()` / `restTemplate.exchange()` 且无超时设置
**错误做法**：
```java
@PostConstruct
void init() {
    cosClient.listObjects(listRequest);   // 同步 COS API，无超时
    cosClient.putObject(putRequest);       // 再来一次
    cosClient.presignedUrl(...);           // 再来一次
    cosClient.deleteObject(...);           // 再来一次 → 最坏 240 秒阻塞
}
```
**问题**：启动时网络故障 → 阻塞最坏 240 秒 → 探针超时 → 部署失败
**正确做法**：客户端构造时只初始化 client 对象，网络验证放到首次实际调用或运维监控
**触发P0铁律**：#28 禁止启动时副作用
**历史教训**：2026-08-02 0ddee4104 修复前，CosService @PostConstruct 4 次同步 COS 调用，最坏 240s 阻塞

---

### AP-STARTUP-04: 配置项无默认值且依赖环境变量
**识别信号**：`application-prod.yml` 里 `${VAR_NAME}` 无 `:default` 兜底
**错误做法**：
```yaml
app:
  security:
    pii-encryption-key: ${APP_SECURITY_PII_ENCRYPTION_KEY}  # 无默认值！
```
**问题**：环境变量未注入 → Spring 占位符解析失败 → `PlaceholderResolutionException` → 启动失败
**正确做法**：
```yaml
app:
  security:
    pii-encryption-key: ${APP_SECURITY_PII_ENCRYPTION_KEY:defaultKeyChangeMe12345678}  # 有默认值
```
**触发P0铁律**：#27 大改动启动验证 checklist
**历史教训**：2026-08-02 7ddf81549 修复前，PII 密钥无默认值导致启动失败

---

### AP-STARTUP-05: 大改动（≥5 文件）未经本地启动验证直接 push
**识别信号**：单次 commit 改了 10+ 文件，只跑了 `mvn compile` 就 push
**错误做法**：
```
改动 15 个文件 → mvn compile 通过 → git push → CloudBase 部署 → 启动失败 → 12 次重试 → 2 小时救火
```
**正确做法**：
```
改动 15 个文件 → mvn spring-boot:run 启动验证 → 前端打开看页面 → 启动日志无 ERROR → git push
```
**触发P0铁律**：#27 大改动必须通过启动验证 checklist
**历史教训**：2026-08-02 b8582636d 改了 intelligence 模块全链路，6 个潜在问题集中爆发

---

### AP-STARTUP-06: 部署后不看日志，失败后盲目重试
**识别信号**：部署后没看 `Started FashionSupplychainApplication` 是否出现，失败后直接再部署
**错误做法**：
```
部署 backend-2002 失败 → 不查日志 → 改一通代码 → 部署 backend-2003 失败 → 再改 → ... 12 次
```
**正确做法**：
```
部署后立即盯日志 5 分钟 → 没出现 Started → 搜索 ERROR/Caused by → 定位根因 → 修复 → 重新部署
```
**触发P0铁律**：#29 部署后必须盯日志 5 分钟
**历史教训**：2026-08-02 连续 12 次部署失败，如果第一次就盯日志能省 1.5 小时

---

### AP-STARTUP-07: Redis 限流器无熔断器，Redis 故障拖垮全站
**识别信号**：每个请求经过的 Filter/Interceptor 调 Redis 且无熔断，Redis 连不上时每个请求阻塞 5 秒
**错误做法**：
```java
public void doFilter(...) {
    Long count = redisTemplate.execute(...);  // Redis 挂了 → 阻塞 5 秒
    if (count > limit) { ... }
}
```
**问题**：Tomcat 线程池被 5 秒阻塞占满 → 业务请求排队 → 前端 axios 超时 → 全站不可用
**正确做法**：
```java
// 加熔断器：连续失败 3 次后 60 秒内跳过 Redis 调用
if (circuitBreaker.isOpen()) {
    return;  // fail-open 放行
}
Long count = redisTemplate.execute(...);
```
**触发P0铁律**：#28 禁止启动时副作用（间接相关）
**历史教训**：2026-08-02 b0d146c9d 修复前，GlobalRateLimitFilter 无熔断，Redis 故障导致采购列表超时

---

## 🛡️ AI 助手常见反模式

### AP-AI-01: AI 输出代码后用户不问"是否符合P0铁律"
**识别信号**：AI 给了一段代码，但用户没有要求它验证是否符合本项目的规范
**建议**：每次 AI 输出代码后，可以问一句："这段代码是否符合 project_rules.md 的 P0 铁律？"

---

### AP-AI-02: AI 忘记更新 memory-bank
**识别信号**：完成了一个大功能，但 activeContext.md / progress.md / decisionLog.md 没有更新
**正确做法**：每次完成一个任务后，让 AI 更新 memory-bank。这是本指南中 `context-rot-mgmt.md` 定义的标准流程

---

### AP-AI-03: 主流程同步调用 LLM 做评分/审查/记忆写入（2026-08-05 新增）
**识别信号**：在用户请求的关键路径上看到 `chatModel.call()` / `inferenceOrchestrator.chat()` / `evaluateWithLlm()` 等同步 LLM 调用
**错误做法**：
```java
// triggerPostTurnHooks 里同步调 LLM 评分（3-10秒），SSE emitter.complete() 被阻塞
selfScore = selfCriticService.calculateCritiqueScore(...);  // 内部 evaluateWithLlm → 同步 LLM 调用
// 用户看到"回答完了但还在转"3-10 秒
```
**正确做法**：LLM 评分/审查/记忆写入一律异步化，主流程用占位值立即返回
```java
final double placeholderScore = 80.0;
postTurnTasks.add(() -> {
    double realScore = selfCriticService.calculateCritiqueScore(...);  // 异步
    reflectiveMemoryWriter.writeAsync(..., SelfCritiqueResult.of(realScore));
});
```
**历史教训**：2026-08-05 小云 AI 回答慢 3-10 秒，根因是 calculateCritiqueScore 同步调 LLM 评分阻塞 SSE
**触发P0铁律**：性能与用户体验

---

## 🔄 工作流反思相关（2026-08-05 新增）

### AP-WF-05: Flyway 加列前未验证列是否存在
**识别信号**：写 `ALTER TABLE t_xxx ADD COLUMN` 前没跑 `SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='t_xxx' AND COLUMN_NAME='xxx'`
**错误做法**：凭印象觉得列不存在就直接写 ALTER TABLE，可能撞 "Duplicate column name" 错误
**正确做法**：
1. 加列前必须先查 `INFORMATION_SCHEMA.COLUMNS` 确认列不存在
2. 用 `PREPARE stmt + EXECUTE + DEALLOCATE` 幂等方式（P0 #1 Flyway 强制幂等）
**历史教训**：2026-08-05 考勤表 status 列缺失导致 500
**触发P0铁律**：#1 Flyway 强制

---

### AP-WF-06: MySQL 系统视图当表操作
**识别信号**：看到 `INSERT INTO information_schema.COLUMNS` / `UPDATE information_schema.XXX`
**错误做法**：
```sql
-- 这不生效！information_schema 是只读系统视图，INSERT 不会修改表结构
INSERT INTO information_schema.COLUMNS (TABLE_NAME, COLUMN_NAME, ...) VALUES (...);
```
**正确做法**：用 `ALTER TABLE t_xxx ADD COLUMN xxx TYPE COMMENT 'xxx'` 修改表结构
**历史教训**：2026-08-05 V202608041800 用 INSERT INTO information_schema.COLUMNS 加列，列实际没加上，导致 500
**触发P0铁律**：#1 Flyway 强制

---

### AP-WF-07: 权限判断逻辑不统一
**识别信号**：看到 `RoleHelper.isAdminRole(role) && !UserContext.isSuperAdmin()` 这类组合判断
**错误做法**：每个模块自己写一套权限判断，租户主账号（tenantOwner=true）role 字段不是标准 admin 字符串时被误拒
```java
// 错误：租户主账号 role="tenant_owner" 时不包含 admin/manager/supervisor → 403
if (!RoleHelper.isAdminRole(ctx.getRole()) && !UserContext.isSuperAdmin()) {
    throw new AccessDeniedException("无权限");
}
```
**正确做法**：统一用 `UserContext.isSupervisorOrAbove()`，判定链路包含 isTenantOwner
```java
if (!UserContext.isSupervisorOrAbove()) {
    throw new AccessDeniedException("无权限");
}
```
**历史教训**：2026-08-05 考勤管理页对租户主账号返回 403
**触发P0铁律**：权限判定不得写死

---

### AP-WF-08: 前端跳转参数与接收方期望参数不对齐
**识别信号**：前端跳转传 `?orderNo=xxx`，但接收方页面 `if (!query.orderId) return;` 直接返回不加载数据
**错误做法**：跳转方和接收方各写各的，参数名不一致
**正确做法**：跳转前 grep 接收方的 query 解析代码，确认参数名一致；接收方对缺失关键参数要有降级（如用 orderNo 反查 orderId）
**历史教训**：2026-08-05 小云 AI 点击订单号跳转显示"缺少订单ID"
**触发P0铁律**：前后端字段名必须一致

---

## 📊 反模式自查清单

每次提交代码前，快速过一遍：

- [ ] **数据库**：Entity 字段和 Flyway 同步了吗？查询带 tenant_id 吗？
- [ ] **事务**：Orchestrator 层管事务吗？Service 层没有 @Transactional 吧？
- [ ] **权限**：权限码在 t_permission 表真实存在吗？
- [ ] **全链路**：改扫码/工序/质检了吗？PC端和小程序端都同步了吗？
- [ ] **打印**：打印组件 font-family 以 serif 结尾吗？
- [ ] **前端**：用的是标准组件吗？弹窗尺寸是三级之一吗？
- [ ] **编译**：mvn compile 过了吗？npx tsc --noEmit 过了吗？
- [ ] **AI记忆**：完成后让 AI 更新 memory-bank 了吗？
- [ ] **启动副作用**（2026-08-02 新增）：@PostConstruct 里有扫表/网络/sleep 吗？
- [ ] **大改动验证**（2026-08-02 新增）：改动 ≥5 文件时跑过 `mvn spring-boot:run` 吗？
- [ ] **配置默认值**（2026-08-02 新增）：yml 里的 `${VAR}` 都有 `:default` 兜底吗？
- [ ] **熔断器**（2026-08-02 新增）：Filter/Interceptor 调 Redis 有熔断器吗？
- [ ] **Flyway 加列验证**（2026-08-05 新增）：加列前查过 INFORMATION_SCHEMA 确认列不存在吗？
- [ ] **权限判断统一**（2026-08-05 新增）：用的是 `isSupervisorOrAbove()` 而不是自己组合判断吗？
- [ ] **跳转参数对齐**（2026-08-05 新增）：跳转参数名与接收方期望参数名 grep 对齐过吗？
- [ ] **LLM 调用异步化**（2026-08-05 新增）：主流程没有同步 LLM 评分/审查/记忆写入吧？
- [ ] **反思三问**（2026-08-05 新增）：写之前评估影响范围 / 写之时识别 LLM 调用 / 写之后端到端验证？

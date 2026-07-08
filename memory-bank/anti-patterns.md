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

## 🛡️ AI 助手常见反模式

### AP-AI-01: AI 输出代码后用户不问"是否符合P0铁律"
**识别信号**：AI 给了一段代码，但用户没有要求它验证是否符合本项目的规范
**建议**：每次 AI 输出代码后，可以问一句："这段代码是否符合 project_rules.md 的 P0 铁律？"

---

### AP-AI-02: AI 忘记更新 memory-bank
**识别信号**：完成了一个大功能，但 activeContext.md / progress.md / decisionLog.md 没有更新
**正确做法**：每次完成一个任务后，让 AI 更新 memory-bank。这是本指南中 `context-rot-mgmt.md` 定义的标准流程

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

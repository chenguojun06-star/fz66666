# Stage 1 实测：Boot 3.4.5 → 4.1.1 编译验证结果

> 执行日期：2026-10-01
> 分支：`upgrade/spring-boot-4.1`（**已删除**，`main` 已还原且 `mvn clean compile` 通过）
> 方法：只改 `pom.xml` 的 Boot parent 版本，跑 `mvn clean compile` 统计真实错误
> **本轮只做测量，未保留任何升级改动。**

---

## 结论先行：比我预估的小得多

| 指标 | 结果 |
|---|---|
| 编译错误 | **40 处** |
| 受影响文件 | **6 个 / 2332 个（0.26%）** |
| 根因类别 | **仅 4 类** |
| pom.xml 改动 | **1 处**（starter 改名） |

⚠️ 这**修正了核实文档的预估**：`Health`/`ErrorController` 这类看起来"要动很多"的地方，
实际只有 6 个文件。但其中 `Health` API **不只是改 import**，见下方风险。

---

## 实测发现的两个 pom.xml 硬改动

### 改动 1：`spring-boot-starter-aop` 已从 Boot 4 BOM 移除

**这是第一个编译失败点**，报错：
```
'dependencies.dependency.version' for org.springframework.boot:spring-boot-starter-aop:jar is missing
```

**权威验证**（直接读本地 `spring-boot-dependencies-4.1.1.pom`，不靠推测）：

| starter | 在 Boot 4.1.1 BOM 中 |
|---|---|
| `spring-boot-starter-aop` | ❌ **已移除** |
| `spring-boot-starter-aspectj` | ✅ 存在（替代品） |
| actuator / cache / data-redis / security / test / validation / web / websocket | ✅ 全部仍在 |

**改动**：`spring-boot-starter-aop` → `spring-boot-starter-aspectj`

**影响**：项目有 **6 个 `@Aspect` 切面**，必须保证 aspectjweaver 在 classpath：
```
intelligence/aspect/JobRunObservabilityAspect.java
intelligence/aspect/DataTruthAspect.java
common/datascope/DataScopeAspect.java
common/aop/SystemOperationLogAspect.java
common/PerformanceMonitor.java
common/aspect/CacheAspect.java
```
`CacheAspect` 涉缓存、`SystemOperationLogAspect` 涉操作日志、`DataScopeAspect` 涉数据权限
—— 这三个是**业务关键切面**，需在集成测试里验证行为不变。

---

## 40 处编译错误的 4 类根因

### 类 1：`actuate.health.{Health, HealthIndicator}`（12 处，3 文件）

| 文件 | import |
|---|---|
| `config/CoreSchemaPreflightChecker.java:8-9` | `boot.actuate.health.Health` / `HealthIndicator` |
| `config/MonitoringConfig.java:8-9` | 同上 |
| `intelligence/health/AiComponentHealthIndicator.java:10-11` | 同上 |

**新归属已用 jar 内容反查确认**：Boot 4 新增独立模块 `spring-boot-health`，
包路径变为 `org.springframework.boot.health.actuate.endpoint.*`
（实测 jar 内含 `HealthDescriptor` / `HealthEndpoint` / `HealthEndpointGroup`）。

🔴 **风险（比改 import 严重）**：Boot 4 引入了 `HealthDescriptor` / `HealthEndpoint` 体系，
`Health` / `HealthIndicator` 的 API 本身可能已变更。
**必须逐个核对方法签名，不能只做 import 替换。**

涉及 `AiComponentHealthIndicator`（AI 组件健康检查）——这是 AI 模块的运维探针，
改动需保证 `/actuator/health` 的出参结构对监控/巡检系统兼容。

### 类 2：`autoconfigure.flyway`（4 处，2 文件）

| 文件 | import |
|---|---|
| `config/FlywayDirtyVersionCleaner.java:6` | `boot.autoconfigure.flyway.FlywayConfigurationCustomizer` |
| `config/FlywayRepairConfig.java:58` | 同上（隐式） |

⚠️ **这两个类与你们的 620 个 Flyway 脚本直接相关**
（`FlywayDirtyVersionCleaner` 处理迁移失败修复，`FlywayRepairConfig` 配置 repair）。
**这是全项目数据风险最高的一处** —— Flyway 迁移出错会阻断启动。

Boot 4 中 flyway autoconfiguration 已拆为独立模块，需确认新的 artifact 与包名。

### 类 3：`web.servlet.error.ErrorController`（2 处，1 文件）

| 文件 | import |
|---|---|
| `common/CustomErrorController.java:8` | `boot.web.servlet.error.ErrorController` |

影响全局错误响应结构 → **所有 API 的错误码格式**。改动需回归前端错误处理。

### 类 4：`actuate.autoconfigure.metrics.MeterRegistryCustomizer`（2 处，1 文件）

| 文件 | import |
|---|---|
| `config/MonitoringConfig.java:7` | `boot.actuate.autoconfigure.metrics.MeterRegistryCustomizer` |

影响 Micrometer 指标注册（Prometheus 监控）。

---

## 本轮**没有**触及的部分（重要）

以下核实过的结论，本轮实测**未触发**，说明它们对 Boot 4.1 迁移**不是障碍**：

| 项 | 核实结论 | 实测验证 |
|---|---|---|
| **Jackson 245 文件** | 不必迁（Jackson 2/3 不同 groupId 可共存） | ✅ 零错误 —— **确认不用改** |
| **Security 185 处 `@PreAuthorize`** | 方法级注解，不构成风险 | ✅ 零错误 |
| `WebSecurityConfigurerAdapter` | 0 处 | ✅ |
| `javax.servlet` | 0 处 | ✅ |
| **MyBatis-Plus** | 需换 boot4 starter | ⏸ **未测**（本轮只改 Boot 版本，MP 仍用 boot3 starter 却编译通过 → 说明 MP 3.5.12 暂未在编译期报错，但**运行期兼容性未验证**） |

🔑 **Jackson 零改动是本轮最有价值的验证** —— 核实文档里我把它从 🔴245 文件
降级为 🟢0 文件，现在得到编译实证。

---

## 尚未验证（本轮故意未做）

| 项 | 说明 |
|---|---|
| **MyBatis-Plus boot4 starter** | 本轮未换。MP 3.5.12 + boot3 starter 在 Boot 4.1 下**编译通过**，但**运行期**（自动配置装配、MyBatis-Spring 版本）未验证 |
| **Spring AI 2.0** | 本轮未升。2.0 的工具调用循环重构对 57 个 `ChatClient`/`Advisor` 文件影响未知 |
| **resilience4j spring-boot4** | 本轮未换 |
| 编译通过 ≠ 运行通过 | 本轮只到 `compile`。`mvn test`（327 项）+ 上下文冒烟 + 真库启动都未跑 |

---

## 建议的下一步（按风险从低到高）

### Step A：先补完这 6 个文件 + starter 改名，跑 `mvn test`
在 upgrade 分支上完成 Boot 4.1 的编译修复，用 **327 项测试 + SpringContextSmokeTest** 验证。
预期：能过，但需重点回归 Flyway repair 与 actuator health 出参。

### Step B：换 MyBatis-Plus boot4 starter，再跑一次
⚠️ 这是**运行期风险点**（编译过不代表自动配置能装配）。必须跑上下文冒烟。

### Step C：升 Spring AI 2.0（最大不确定性）
57 个 `ChatClient`/`Advisor` 文件 + 110 个 AI 工具。建议单独分支，
且**先补 AI 模块的集成测试**再动 —— 目前 AI 侧几乎没有测试覆盖。

### Step D：真库启动验证
连接真实 MySQL 跑一次完整启动 + Flyway 校验，确认 620 个迁移脚本在新版 Flyway 下行为一致。

---

## 一句话总结

**Boot 4.1 的编译期迁移比预期小（6 个文件），但真正的风险不在这 6 个文件里** ——
而在「编译期看不出来」的 MyBatis-Plus / Spring AI 运行期兼容性，
以及 Flyway 这条与 620 个迁移脚本直接相关的数据链路。

⚠️ **强烈建议：不要只凭 `mvn compile` 通过就认为升级可行。**
本轮只证明了"编译能过"，距离"生产可上"还差测试、上下文装配、真库启动三道关。

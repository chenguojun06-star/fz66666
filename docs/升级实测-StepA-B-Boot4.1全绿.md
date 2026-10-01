# Step A + Step B 实测结果：Boot 4.1.1 迁移（编译 + 测试全绿）

> 执行日期：2026-10-01
> 分支：`upgrade/spring-boot-4.1`
> 验证：`mvn clean test` → **327/327 通过**（含 D-698 新增的 Spring 上下文冒烟 4 项）
> **本分支未提交、未推送。**

---

## 一句话结论

**Boot 4.1.1 迁移的技术改动量很小（9 个源文件 + 1 个配置文件 + pom），测试全绿。**
但过程中发现**我此前"Jackson 零改动"的判断是错的** —— 详见第三节，这是本次最重要的发现。

---

## 改动清单（全部为最小改动）

### pom.xml（3 处）

| 改动 | 原因 |
|---|---|
| parent `3.4.5` → `4.1.1` | 目标版本 |
| `spring-boot-starter-aop` → `spring-boot-starter-aspectj` | Boot 4 BOM 已移除 starter-aop（已用本地 BOM 逐个核对 9 个 starter） |
| MyBatis-Plus `3.5.12` → `3.5.16`，`boot3-starter` → `boot4-starter` | 见第二节 |
| 新增 `spring-boot-flyway` | Boot 4 把 Flyway 自动配置拆出独立模块 |
| 新增 `spring-boot-starter-json` | Boot 4 的 starter-web 不再传递它 |

### 源文件（9 个）

| 文件 | 改动 | 依据 |
|---|---|---|
| `CoreSchemaPreflightChecker` | `actuate.health.Health/HealthIndicator` → `health.contributor.*` | jar 反查 |
| `MonitoringConfig` | 同上 + `MeterRegistryCustomizer` → `micrometer.metrics.autoconfigure.*` | jar 反查 |
| `AiComponentHealthIndicator` | 同 Health 两项 | jar 反查 |
| `FlywayDirtyVersionCleaner` | `autoconfigure.flyway` → `flyway.autoconfigure` | jar 反查 |
| `FlywayRepairConfig` | `FlywayMigrationStrategy` 同步改包 | jar 反查 |
| `CustomErrorController` | `web.servlet.error` → `webmvc.error` | jar 反查 |
| `RedisConfig` | Lettuce 7 泛型 `<Object>` → `<StatefulConnection<?,?>>` | javap 确认签名 |
| `IntelligenceAdminController` | 全限定名 `actuate.health.Health` → `health.contributor.Health` | 编译暴露 |
| `JacksonConfig` | 去掉 `Jackson2ObjectMapperBuilder` 注入，改为显式 new | 见第三节 |

### 配置文件（1 个）

`application.yml`：`spring.jackson.serialization.WRITE_DATES_AS_TIMESTAMPS`
→ `spring.jackson.datetime.WRITE_DATES_AS_TIMESTAMPS`

---

## 二、MyBatis-Plus：踩到一个"编译过但运行炸"的坑

### 现象

换 Boot 4.1.1、编译 **0 错误**，但 `mvn test` 时上下文冒烟报：

```
Error creating bean with name 'memoryBankEntryMapper':
Property 'sqlSessionFactory' or 'sqlSessionTemplate' are required
```

### 根因

MyBatis-Plus `3.5.12` 的 `spring-boot3-starter` 在 Boot 4 下**自动配置无法生效**，
Mapper 拿不到 `sqlSessionFactory`。
**这正是核实文档里 Step B 预警的"编译过不代表运行期可用"，本轮实证命中。**

### 版本选择（有个坑）

第一次直接跳到 **3.5.17**（最新），结果编译爆出 278 个文件需要改 import ——
因为 **3.5.17 做了包迁移**：

| 类 | 3.5.12 及之前 | 3.5.17 |
|---|---|---|
| `IService` | `mybatisplus.extension.service` | `mybatisplus.spring.service` |
| `ServiceImpl` | `...extension.service.impl` | `...mybatisplus.spring.service.impl` |
| `Model` | `...extension.activerecord` | `...mybatisplus.spring.service.activerecord` |

逐版本反查后确认：**3.5.16 是"有 boot4 starter 且未迁包"的最后版本**：

| 版本 | 有 boot4 starter | `IService` 包位置 |
|---|---|---|
| 3.5.13–3.5.16 | ✅ | `extension.service`（**不变**） |
| 3.5.17 | ✅ | `spring.service`（**已迁移**） |

**选 3.5.16，278 个文件 0 改动。**

---

## 三、🔴 我此前的判断错了：Jackson 不是"零改动"

### 我之前怎么说

核实文档里我写：
> 「Jackson 2 与 Jackson 3 是不同 groupId，**可以共存** → Boot 4 不强制迁移 →
> **245 个文件可以一个都不改**」

### 实测结果

**这个判断只在"编译期"成立，运行期不成立。**

Boot 4 的 `JacksonAutoConfiguration` 已改为提供 **Jackson 3** 的
`tools.jackson.databind.json.JsonMapper`，**不再注册 `Jackson2ObjectMapperBuilder` bean**。
实测报错：

```
No qualifying bean of type 'Jackson2ObjectMapperBuilder' available
```

连带触发一连串失败：
```
memoryBankMigrationRunner → memoryBankDbService → objectMapper
  → Jackson2ObjectMapperBuilder 缺失 → 上下文启动失败 → 全站 500
```

### 更隐蔽的一颗雷

即使补上 `JacksonConfig`，还会撞上这个：

```
Failed to bind properties under 'spring.jackson.serialization'
No enum constant tools.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS
```

**Jackson 3 把 `WRITE_DATES_AS_TIMESTAMPS` 从 `SerializationFeature` 移到了 `DateTimeFeature`**，
所以 `spring.jackson.serialization.*` 的配置项**绑定失败** → 上下文起不来。

⚠️ 这颗雷的特点：**配置文件语法完全合法，只有在 Boot 4 + Jackson 3 下才会炸**。
在 Boot 3 下永远发现不了。

### 结论修正

| | 编译期 | 运行期 |
|---|---|---|
| 245 个 `com.fasterxml.jackson` import | ✅ 不用改 | ✅ 仍不用改（Jackson 2 jar 仍在 classpath） |
| `JacksonConfig` | — | ❌ **必须改**（依赖被移除的 bean） |
| `application.yml` jackson 配置 | — | ❌ **必须改**（键位在 Jackson 3 下不存在） |

**准确表述是：「业务代码的 245 个 import 不用改，但 Jackson 集成层（1 个 Config + 1 段 yml）必须改」。**
我之前说的"零改动"是错的。

---

## 四、验证结果

```
mvn clean test  →  Tests run: 327, Failures: 0, Errors: 0, Skipped: 0
                   BUILD SUCCESS
```

其中 `SpringContextSmokeTest`（D-698 新增）4 项全绿 —— 它是本轮唯一能发现
「编译过但运行炸」的门禁，**如果没有它，这三个问题（MP / JacksonConfig / yml）
都会漏到生产启动才炸**。

⚠️ 但仍需说清：**327 项是单测 + 上下文冒烟，不是集成测试**。
以下仍未验证：
- 真实 MySQL 启动 + 620 个 Flyway 迁移脚本行为
- actuator health 出参结构对巡检/监控系统的兼容性
- Lettuce 连接池参数在真实 Redis 下的行为
- Spring AI 2.0（**本轮未升**）

---

## 五、待决策

| 项 | 状态 |
|---|---|
| **Spring AI 1.0.0** | 🔴 仍是 EOL，且 2.0 要求 Boot 4.x —— **Boot 已升到 4.1.1，但 Spring AI 没升**，现在版本不匹配 |
| resilience4j | 🏷 仍是 `spring-boot3`（2.2.0），未换 boot4 变体 |
| 真库启动验证 | 未做 |

⚠️ **当前状态是"半升级"**：Boot 4.1.1 + Spring AI 1.0.0 不兼容
（Spring AI 1.0 对应 Boot 3.x）。虽然测试通过，但**不建议以此状态上生产**。

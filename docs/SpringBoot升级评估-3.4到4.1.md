# Spring Boot 3.4.5 → 4.1 升级影响面评估

> 评估日期：2026-10-01
> 方法：源码静态扫描 + 依赖树实测 + 上游 release 公告检索
> **本文档只做评估，不含任何代码改动。** 执行前需重新核实上游版本与日期。

---

## 一、为什么要升（紧迫性）

| 组件 | 当前版本 | 状态 | 依据 |
|---|---|---|---|
| **Spring Boot** | 3.4.5 | 🔴 **OSS 支持已于 2025-12-31 结束**（已过 274 天） | spring.io/projects/spring-boot#support |
| Spring AI | 1.0.0 | 🔴 已被 1.1.x / 2.0 取代 | github.com/spring-projects/spring-ai |
| ArchUnit | 1.3.0 | 🟢 仍在支持（1.5.0 最新） | github.com/TNG/ArchUnit/releases |

**关键：EOL 意味着不再收到安全补丁。** 这是真实风险，不是版本号洁癖。

已落地防护：`scripts/check-dependency-eol.py` + `dependency-eol-baseline.properties`
（ratchet：存量只告警，新增才阻断）。

### 官方推荐路径

```
3.4.5 (EOL)  ──→  3.5.x  ──→  4.1.x（目标）
                    ↑           ↑
                  waypoint    正式目标（OSS 支持至 2027-07-31）
```

⚠️ **不要停在 4.0**：4.0 的 OSS 支持 2026-12-31 结束（只剩 3 个月），
4.1 支持到 2027-07-31。

---

## 二、硬约束：Boot 与 Spring AI 必须同批升级

| Spring AI 版本 | 要求的 Spring Boot |
|---|---|
| 1.0.x（当前） | Boot 3.4 |
| 1.1.x | Boot 3.5 |
| 2.0.x | **Boot 4.x** |

→ **不能拆分升级**。要么都停在原地，要么一起走。
这直接决定排期：Spring AI 2.0 的迁移工作量要算进 Boot 升级，不是两件事。

---

## 三、实测影响面（本项目真实数据）

### 3.1 代码规模（决定风险量级）

| 指标 | 数量 |
|---|---|
| Java 文件 | **2332** |
| 编排器 | **422** |
| Flyway 迁移脚本 | **620** |
| 后端测试 | 327 |

### 3.2 破坏性变更逐项核对

| 变更项 | 本项目实测 | 风险 |
|---|---|---|
| **Jackson 3 包迁移**<br>`com.fasterxml.jackson` → `tools.jackson` | **245 个文件**引用 Jackson，650 处 `ObjectMapper`/`TypeReference` 使用 | 🔴 **最高** |
| **Spring Security 7** | 186 个文件用 `SecurityFilterChain`/`@PreAuthorize` | 🟡 中 |
| `WebSecurityConfigurerAdapter`（已废弃 API） | **0 处** ✅ | 🟢 无 |
| `javax.servlet`（Boot 4 移除） | **0 处** ✅ | 🟢 无 |
| Tomcat 11 | 未直接引用 | 🟢 低 |
| 虚拟线程（`spring.threads.virtual`） | 91 处 `ThreadLocal`/`Executors` | 🟡 需评估 |
| **MyBatis-Plus starter 切换** | 当前 `mybatis-plus-spring-boot3-starter:3.5.12` | 🟡 **必改 artifactId** |
| resilience4j | ~~需换 spring-boot4 版~~ | ✅ 已删除（D-718：实查全仓零 import，系死依赖，无需迁移） |
| Flyway | 10.20.1 | 🟢 随 Boot BOM 走 |

### 3.3 Jackson 是主要工作量

**245 个文件 / 650 处**。Boot 4 迁 Jackson 3 涉及：
- 包名 `com.fasterxml.jackson.*` → `tools.jackson.*`
- `ObjectMapper` → `JsonMapper`（且 Jackson 3 默认按字母序序列化）
- 序列化默认值变化可能影响**接口出参 JSON 字段顺序**
- ⚠️ 你们 `ArchUnit` 规则1 的判据历史上就踩过 Jackson `ObjectMapper` 被误判成 Mapper 的坑
  （基线文件 D-654 有记录）—— 换包名后需复核该规则

---

## 四、MyBatis-Plus 与 resilience4j 的具体动作

```xml
<!-- 现状 -->
<artifactId>mybatis-plus-spring-boot3-starter</artifactId>

<!-- Boot 4 必须改为（已核实存在，最高 3.5.17） -->
<artifactId>mybatis-plus-spring-boot4-starter</artifactId>
```

⚠️ `mybatis-plus-spring-boot4-starter` 依赖 `mybatis-spring 4.0.0`、
`spring-boot-autoconfigure 4.0.x`，与 Boot 4.1 可能需对齐 patch 版本。

resilience4j 同样需要 `resilience4j-spring-boot3` → `spring-boot4` 变体。

> **D-718 勘误（2026-10-02）**：实查发现 resilience4j 全仓零代码引用（真正的断路器是
> IntelligenceModelGatewayOrchestrator 自实现的 GatewayCircuitBreaker），系死依赖，
> 已连同 yml 配置块一并删除，无需迁移。

---

## 五、建议排期（分三步，每步可独立验证/回滚）

> ⚠️ **2026-10-01 核实后撤销**（详见 [升级前核实结论-5项.md](升级前核实结论-5项.md)）：
> **3.5.x 的 OSS 支持已于 2026-06-30 结束**（官方 13 个月政策；
> Spring Boot 3.5.16 官方博客明确 "the last OSS release of the 3.5.x generation"）。
> 升到 3.5.x **只能买到到年底的窗口，不是稳定落点** →
> **本步骤撤销，不存在"低风险先升 3.5"的中间路线。**
> 实际只剩两个选择：① 维持现状 + 采购 enterprise support（Boot 3.5 可支持至 2032）；
> ② 接受风险直接上 4.1.x。

<details>
<summary>（已撤销）原步骤 1 内容</summary>

### ~~步骤 1：3.4.5 → 3.5.x（低风险，可立即做）~~

| 项 | 说明 |
|---|---|
| 改动 | 仅 `pom.xml` parent 版本；Spring AI 1.0 → 1.1.x |
| 代码改动 | 预计 0（3.5 是 minor） |
| 收益 | ~~离开 EOL 状态，止住安全补丁缺口~~ ❌ **3.5 同样 EOL** |
| 风险 | 🟢 低 |
| 验证 | `mvn clean test` 327 项 + 新增上下文冒烟 |

</details>

### 步骤 2：3.5.x → 4.0.x（中高风险）

| 项 | 说明 |
|---|---|
| 改动 | parent 4.0；MyBatis-Plus 换 boot4 starter；resilience4j 换变体；Spring AI 1.1 → 2.0 |
| 代码改动 | Jackson 245 文件（可分批）；Security 回归验证 |
| 风险 | 🔴 高（Jackson + Security 双破坏性变更叠加） |
| 建议 | **独立分支 + 独立 PR**，不进主干 |

⚠️ 4.0 只买到 3 个月支持期，**不建议在此停留**。

### 步骤 3：4.0.x → 4.1.x（低风险）

纯粹的 patch 升级，通常仅改版本号。

---

## 六、升级前必须补的测试（当前缺口）

| 缺口 | 现状 | 建议 |
|---|---|---|
| **Spring 上下文测试** | ✅ 已补（D-698 `SpringContextSmokeTest`） | 步骤 2 的核心防线 |
| 接口契约测试（JSON 出参） | ❌ 无 | ⚠️ **Jackson 3 默认改序列化顺序**，建议补关键接口的 JSON 快照测试 |
| Security 配置回归 | ❌ 无 | 需补登录/权限路径的集成测试 |

⚠️ **Jackson 3 的序列化默认变化是隐形的**——不报错，但出参字段顺序变了。
若有前端按字段顺序解析、或有下游系统对接，会静默出问题。

---

## 七、风险与建议

### 建议（⚠️ 2026-10-01 核实后修正）
1. ~~**先做步骤 1**（3.4.5 → 3.5.x）~~ —— ❌ **撤销：3.5 同样 EOL**（2026-06-30）
2. **实际只剩两个选择**：① 维持现状 + 采购 enterprise support（Boot 3.5 支持至 2032）；
   ② 一次性上 4.1.x
3. **若走 ②**：先在独立分支只改 `pom.xml`，跑 `mvn clean compile`
   用**真实编译错误数**量化工作量，再决定是否继续
4. **不要为版本号冒生产风险**：2332 个 Java 文件 + 620 个迁移脚本

> 核实发现风险比原估**显著更低**：Jackson **不必迁**（Jackson 2 与 3 是不同 groupId，
> 可共存 → 245 文件可 0 改动）；Security 配置**仅集中在 1 个文件**（185 处
> `@PreAuthorize` 不构成风险）；序列化契约风险**实测排除**（电商签名走 TreeMap 排序，
> 与序列化顺序无关；微信 v3 签的是原始 body）。
> 详见 [升级前核实结论-5项.md](升级前核实结论-5项.md)。

### 不建议
- ❌ 一次性跳到 4.1（跳过 3.5 缓冲，问题堆在一起难定位）
- ❌ 停在 4.0（3 个月后又要再动一次）
- ❌ 拆分 Boot 与 Spring AI 升级（版本不兼容）

---

## 八、待核实事项（本评估的局限）

⚠️ 以下**未能实测**，执行前必须自行核实：

1. **EOL 日期**来自网络检索（2026-10-01），应以 Spring 官方 support page 为准
2. Jackson 245 文件的**实际改动量**未逐个评估（多数可能只需改 import）
3. Spring Security 7 的具体行为变更未逐条对照
4. MyBatis-Plus 3.5.17 与 Boot 4.1 的兼容性**未实测**
5. 虚拟线程（91 处）对本项目扫码高并发场景的影响未评估

> 建议：在独立分支做步骤 1，用 `mvn clean test` 327 项 + 上下文冒烟验证，
> 再评估步骤 2 的 Jackson 改动量。

---

## 附：相关文件

| 文件 | 用途 |
|---|---|
| `scripts/check-dependency-eol.py` | EOL 门禁（CI + pre-push 可用） |
| `dependency-eol-baseline.properties` | EOL 冻结基线（ratchet） |
| `backend/arch-baseline.properties` | 架构违规基线（同款 ratchet 思路） |
| `backend/src/test/java/.../SpringContextSmokeTest.java` | 上下文装配冒烟（D-698 新增） |

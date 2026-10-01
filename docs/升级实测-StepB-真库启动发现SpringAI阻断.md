# Step B 实测：真库启动验证 —— 发现单元测试无法捕获的阻断性问题

> 执行日期：2026-10-01
> 分支：`upgrade/spring-boot-4.1`
> 方式：真实 MySQL（127.0.0.1:3308）+ 真实 Redis（6379），**Flyway 关闭**（不动 schema）
> **结论：Boot 4.1.1 迁移被 Spring AI 1.0.0 硬阻断，应用无法启动。**

---

## 一、🔴 结论：升级不可行（当前依赖组合）

```
Spring Boot 4.1.1  ✅ 编译通过 / 单测 327 全绿
Spring AI  1.0.0  ❌ 与 Spring Framework 7 二进制不兼容 → 应用启动失败
```

**这是 327 项单元测试 + 上下文冒烟全都无法发现的问题。**

---

## 二、失败详情

```
Error creating bean with name 'springAiOpenAiApi'
defined in class path resource [intelligence/springai/SpringAiAdapterConfig.class]:
Failed to instantiate [org.springframework.ai.openai.api.OpenAiApi]:
  Factory method 'springAiOpenAiApi' threw exception with message:
  'void org.springframework.http.HttpHeaders.addAll(org.springframework.util.MultiValueMap)'
```

### 根因（已用 javap 验证，非推断）

| 版本 | `HttpHeaders.addAll` 的方法签名 |
|---|---|
| **Spring 7.0.9**（Boot 4.1.1 引入） | `addAll(String, List<? extends String>)`<br>`addAll(HttpHeaders)`<br>**❌ 无 `addAll(MultiValueMap)`** |
| **Spring AI 1.0.0 期望** | `addAll(MultiValueMap<String,String>)` |

→ `NoSuchMethodError`。**二进制不兼容，非配置问题、非编码问题。**

⚠️ 这类错误只在**真正加载类并执行到该方法**时暴露。
单元测试用 Mockito mock 掉了 `OpenAiApi`，上下文冒烟的 `lazy-initialization`
也没触发到这个 bean —— **所以全绿**。

---

## 三、✅ 本次验证确认可用的部分

虽然启动最终失败，但失败点之前的链路**已全部验证通过**：

| 验证项 | 结果 | 证据 |
|---|---|---|
| **真实 MySQL 连接** | ✅ | `FashionHikariPool - Start completed.` + `Added connection` |
| **Boot 4 + MySQL 驱动** | ✅ | 连接池正常建立 |
| **真实 Redis 连接** | ✅ | `RedisService.get(..) 耗时 227ms`（真实往返） |
| **Lettuce 连接池配置** | ✅ | 我改的泛型 `<StatefulConnection<?,?>>` 生效，Redis 可用 |
| **Tomcat 11** | ✅ | `Tomcat initialized with port 18099` |
| **McpToolScanner（110 个 AI 工具）** | ✅ | `✓ 注册工具: tool_flyway_safety_check ...` |
| **Flyway 关闭时不影响启动** | ✅ | 未触碰 schema |

🔑 **这验证了 Step A 里那 6 个 import 修改 + Lettuce 泛型修改 + starter-json
在真实运行时是有效的**，不只是编译过。

---

## 四、⚠️ 关于 Flyway 12 的风险（尚未验证，但风险已升级）

启动前发现：

```
升级前：flyway-core 10.20.1
升级后：flyway-core 12.4.0   ← 跨两个大版本
```

**这是本轮最需要警惕的未爆雷项**，因为：

1. 你们有 **620 个迁移脚本 + 库里 624 条已执行记录**
2. `FlywayDirtyVersionCleaner` 的注释写明它是为 **Flyway 10.x** 的
   `SPLIT_REGEX = \\.(?=\\d)` 版本号解析行为写的兜底
   —— **Flyway 12 是否沿用同一解析规则，未知**
3. Flyway 大版本可能改变 checksum 校验、版本号解析、repair 行为

### 我没有实测的原因（如实说明）

- 本机**无 `mysqldump` / `mysql` 客户端**（已确认不在 PATH，homebrew 无 mysql-client）
- 在**没有备份**的情况下对 624 条迁移记录的库跑 Flyway 12 迁移，
  一旦 checksum 不兼容触发 repair 或重跑，后果不可逆

→ **这是我主动选择不做的，不是遗漏。**

### 建议的安全验证路径

1. 先装 `mysqldump`（`brew install mysql-client`）做全量备份
   ```bash
   mysqldump -h127.0.0.1 -P3308 -uroot -pchangeme fashion_supplychain \
     > backup_$(date +%Y%m%d).sql
   ```
2. 用 `mvn flyway:info`（**只读**，不 migrate）验证 620 个脚本的 checksum
   在 Flyway 12 下是否全部匹配
3. checksum 有差异时，先评估再决定，绝不直接 migrate

---

## 五、决策点：三条路

### 路线 1：升 Spring AI 到 2.0（唯一能让 Boot 4.1 跑起来的路）

| 项 | 评估 |
|---|---|
| 改动面 | 🔴 **大**：57 个 `ChatClient`/`Advisor` 文件 + 110 个 AI 工具 |
| 破坏性变更 | 2.0 把工具调用循环从各 ChatModel 私有实现**提到 Advisor 链**，是架构级改动 |
| 前置条件 | ⚠️ **AI 模块目前几乎没有测试覆盖**，改完无法验证 |
| 风险 | 高 |

### 路线 2：放弃 Boot 4.1，维持现状 + 采购 enterprise support

| 项 | 评估 |
|---|---|
| Boot 3.5 enterprise support | 官方政策：最后 minor **额外 +5 年** → 可支持至 **2032** |
| 成本 | 商业订阅费用 |
| 风险 | 🟢 零技术风险 |

### 路线 3：只升 Spring AI 到 1.1.x（对应 Boot 3.5）

| 项 | 评估 |
|---|---|
| 能否解决 EOL | ❌ **不能** —— Boot 3.5 也是 EOL（2026-06-30） |
| 价值 | 仅让 Spring AI 脱离废弃状态，Boot 的安全缺口仍在 |

**❌ 不推荐，等于做了一半还是没解决核心问题。**

---

## 六、我的建议

**倾向路线 2（维持现状 + enterprise support）。** 理由：

1. **升级的真实成本远高于预估**。核实阶段我估算"Jackson 不用改、Security 只 1 个文件"，
   确实成立；但**没预料到 Spring AI 是硬阻断**，且它牵连 AI 架构级重构。
2. **AI 模块缺测试是决定性因素**。110 个工具、57 个 Advisor 文件，
   目前没有能验证其行为的集成测试 —— 这种情况下做架构级重构，
   **无法证明改对了**，出了线上问题也无法定位。
3. **enterprise support 到 2032** 覆盖了 Boot 3.5 的剩余生命周期，
   成本远低于一次失败的大重构。

**如果一定要走路线 1**，前置条件是：
- [ ] 先给 AI 模块补集成测试（能验证工具调用、Advisor 链行为）
- [ ] 单独分支、单独 PR，不进主干
- [ ] 装好 mysqldump 并完成全库备份，再验证 Flyway 12

---

## 七、本次未做的事（如实说明）

| 项 | 原因 |
|---|---|
| Flyway 12 迁移实测 | 本机无 mysqldump，无法备份 → 主动不做 |
| 620 个脚本 checksum 校验 | 同上（`flyway:info` 虽只读，但需先确认连接方式与版本兼容） |
| Spring AI 2.0 实际迁移 | 需用户决策（路线 1 风险高） |
| actuator health 出参验证 | 应用未能启动，无从验证 |
| 真实接口调用 | 同上 |

⚠️ **本报告的所有"✅"都只证明"失败点之前链路可用"，
不证明应用可用。应用当前状态下无法启动。**

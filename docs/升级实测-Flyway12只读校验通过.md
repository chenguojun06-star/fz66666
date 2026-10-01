# Flyway 12.4.0 兼容性验证结果（只读，数据库零改动）

> 执行日期：2026-10-01
> 方式：`mvn org.flywaydb:flyway-maven-plugin:12.4.0:info`（**只读**，不执行 migrate）
> 目标库：127.0.0.1:3308/fashion_supplychain（624 条已执行迁移）
> **结论：Flyway 10.20.1 → 12.4.0 跨两个大版本，checksum 校验全部通过，无待执行迁移。**

---

## 一、核心结论

| 校验项 | 结果 |
|---|---|
| **待执行迁移（Pending）** | **0** ✅ |
| **checksum 不匹配** | **0** ✅ |
| **失败迁移（Failed）** | **0** ✅ |
| Missing（库有 / 仓库无） | 3 个 —— **已被项目配置显式忽略** ✅ |

🔑 **最重要的一条：Pending = 0** —— 意味着在这个库上启动应用，
**Flyway 不会执行任何迁移**，624 条历史迁移不会被重跑或改写。
这是本次验证最有价值的产出：**最大的一颗雷排掉了。**

---

## 二、State 分布（623 条记录的分布）

```
| State         | 数量 |
|---------------|------|
| Success       | 248  |
| Out of Order  | 372  |
| Missing       |   3  |
| Pending       |   0  |
| Failed        |   0  |
```

> `Out of Order` 372 条属正常：项目配置了 `out-of-order: true`
> （`application.yml:113`），允许补插入的历史迁移。

---

## 三、3 个 `Missing` 是既有问题，且已被项目配置覆盖

### 明细

| 版本 | 描述 | 库中执行时间 |
|---|---|---|
| `47` | cleanup factory reconciliation table | 2026-06-28 |
| `202709110200` | change material quantity to decimal | 2026-09-12 |
| `202709120200` | material quantities to decimal | 2026-09-12 |

### 已确认与本次升级无关

- 这 3 个脚本**仓库里本来就没有**（`git ls-files` 与目录枚举均为 0 命中）
- 是历史上"库已执行、脚本后来从仓库删除"的遗留
- **升级前（Flyway 10.20.1）同样存在**，非 Boot 4 迁移引入

### 关键：项目已显式忽略

```yaml
# application.yml:112-119
validate-on-migrate: true
out-of-order: true
# D-415：忽略「数据库已应用、但脚本已不在仓库」的迁移（*:missing）
ignore-migration-patterns: "*:missing"
```

→ `validate-on-migrate: true` 虽然开启，但 `*:missing` 模式把这 3 条排除在校验之外。
**所以不会阻断启动。**

---

## 四、对 `FlywayDirtyVersionCleaner` 的影响评估

该类是为 **Flyway 10.x** 的版本号解析行为写的兜底（javadoc 原文）：

> Flyway 10.x 的 `MigrationVersion` 使用 `SPLIT_REGEX = \\.(?=\\d)` 分割版本号，
> 每个部分调用 `new BigInteger(part)`，字母后缀会导致 `NumberFormatException`
> → `FlywayException` → Bean 创建失败 → 502

### 本次验证能证明什么

✅ **Flyway 12.4.0 能正确读取并校验全部 623 条历史迁移**
→ 说明 12.4.0 对这批版本号（含点分隔格式）的解析**没有回归**。

### 本次验证不能证明什么

⚠️ **不能证明该兜底逻辑变得不必要。** 因为：
- Pending = 0，**没有任何新迁移被执行**
- 该类解决的是「未来新增带字母后缀版本号的脚本」会被 502 的问题
- 这是**预防性保护**，其价值要等下次新增迁移时才体现

**结论：该类在 Flyway 12 下是否仍必要，未验证。**
但保留它**无成本**（它只是个 `@Configuration` + `FlywayConfigurationCustomizer`），
且已随 Boot 4 一起完成包迁移（`autoconfigure.flyway` → `flyway.autoconfigure`，
编译已验证），**建议保留，不要删**。

---

## 五、数据库安全性确认

本次验证**全程只读**，验证前后对比：

| 时点 | 总行数 | 最新 installed_on | 失败数 |
|---|---|---|---|
| 验证前 | 624 | 2026-09-27 04:27:26 | 0 |
| **验证后** | **624** | **2026-09-27 04:27:26** | **0** |

✅ **零改动。** 未执行 migrate、未触发 repair、未写入任何迁移记录。

（未做全量备份，但因本次是只读操作，不需要备份即安全。
若后续要真正执行 `flyway:migrate`，**仍建议先装 mysqldump 备份**。）

---

## 六、结论汇总：升级风险清单更新

| 风险项 | 上一轮状态 | 本轮结论 |
|---|---|---|
| **Flyway 大版本兼容** | 🔴 未验证，最大未知 | 🟢 **已排除**（checksum 全过 + Pending=0） |
| **启动会重跑迁移** | 🔴 担忧 | 🟢 **不会**（Pending=0） |
| `FlywayDirtyVersionCleaner` 是否仍需保留 | ❓ 未知 | 🟡 未验证但**建议保留**（无成本） |
| 真实 MySQL / Redis 连接 | ❓ 未验证 | 🟢 **已验证可用**（上一轮） |
| **Spring AI 1.0.0 二进制不兼容** | 🔴 未验证 | 🔴 **已确认存在，阻断启动** |

**当前唯一的硬阻断仍是 Spring AI。**

---

## 七、仍未验证（不得据此认为升级可行）

| 项 | 原因 |
|---|---|
| Spring AI 2.0 的实际迁移成本 | 需先补 AI 模块集成测试（当前几乎无覆盖） |
| 应用能否真正启动 | 被 Spring AI 阻断 |
| actuator health 出参兼容性 | 应用未能启动 |
| 真实接口调用 / 前端联调 | 同上 |

⚠️ **Flyway 这条线已彻底排除风险，但它只是"能安全启动的必要条件"，
不是"升级可行"的充分条件。**

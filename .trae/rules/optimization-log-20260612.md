# 优化日志 2026-06-12（追加到 optimization-log-20260611.md）

---

## INC-20260612-001：大规模部署失败 — 探针超时 + socat IPv6 双故障

### 事故等级：P0（全站不可用）

### 影响范围
- 2026-06-12 00:00 ~ 09:20 UTC+8 全站 502 Bad Gateway
- CloudBase 后端服务反复重启（容器判死 → 重启 → 再判死 → 再重启）
- 持续时间：约 9 小时
- 影响范围：PC 端、小程序、H5 全部崩溃

---

## 一、完整时间线（精确到分钟）

```
Apr 30  最初方案：添加 socat 代理(8088→8089)，解决 Spring Boot 启动慢导致探针失败
         server.address 未配置（依赖默认），socat 用 localhost:8089

Jun 10  正常部署，最后一次成功（commit 0ef4b6d6d）

Jun 11  23:44  P0 事故处理 commit(1e789f8d4)：
         - 永久移除 WebSocket 全局广播（OPT-20260611-002）
         - 修复 socat IPv6 localhost 解析问题（INC-20260611-001）
         - 去掉 socat 代理，Tomcat 直接监听 PORT
         - 但 cloudbaserc.json 仍无 InitialDelaySeconds（=默认~2-10s）
         问题：Spring Boot 启动需 90s+，探针 10s 内就检测 → 连接拒绝 → 容器重启

Jun 12  01:08  commit(9016c9bd9)：修正 InitialDelaySeconds 大小写，设为 150s
         问题：cloudbaserc.json InitialDelaySeconds 云端解析可能失败（值仍不足）

Jun 12  08:08  commit(0fc859c17)：添加 spring.main.lazy-initialization=true
         减小 HikariCP 连接池：100→30, minimum-idle: 20→5
         问题：启动提速有限，150s 仍可能不够

Jun 12  08:56  commit(e4e363368)：application-prod.yml 添加 Actuator 健康检查
         management.endpoints.web.exposure.include=health
         management.endpoint.health.probes.enabled=true
         问题：Actuator 端点暴露，但探针路径/延迟仍需验证

Jun 12  09:20  commit(4d454c0ea) 最终修复：
         - cloudbaserc.json: InitialDelaySeconds 150→300，加 PeriodSeconds/TimeoutSeconds/FailureThreshold
         - deploy-backend.yml: API 请求加入探针参数
         - Dockerfile HEALTHCHECK start-period=300s，HTTP+TCP 双保险
         - application-prod.yml: server.address=0.0.0.0 显式声明
         - docker-entrypoint.sh: TieredCompilation/StopAtLevel=1 加速启动
         - docker-entrypoint.sh: java.security.egd=/dev/./urandom 随机数加速
         - 推送成功，部署验证中
```

---

## 二、根因分析（多层级）

### 层级1：直接原因
`socat` 代理层被移除后，Tomcat 直接暴露在探针检测下。
CloudBase 探针默认 `initialDelaySeconds` 极短（估算 2-10s），
而 Spring Boot 完整启动（含 Flyway 迁移、Redis 连接、AI 模块初始化）需 **90+ 秒**。
10s 时端口未绑定 → 连接拒绝 → 容器判死 → 重启 → 无限循环 → 502。

### 层级2：触发原因
**Jun 11 23:44 的 P0 修复 commit**（处理 WebSocket + socat IPv6）：
- 正确去掉了 socat 代理（解决 IPv6 问题）
- 但 **cloudbaserc.json 未配置 InitialDelaySeconds**
- 应用启动时间随 AI 模块增加（Qdrant 连接、GraphRAG、知识库初始化等）已从 30s 增长到 90s+

### 层级3：深层原因

| 因素 | 说明 |
|------|------|
| **无 InitialDelaySeconds 配置** | `cloudbaserc.json` 历史上从未配置过此参数，云端默认 2s |
| **socat 是临时补丁，不是最终方案** | Apr 30 加 socat 是为了绕过探针问题，治标不治本 |
| **应用启动时间持续增长** | AI 模块（Qdrant/Graph/Knowledge/工厂画像）每次新增都增加 5-10s 启动时间 |
| **探针配置未纳入版本控制** | 一直靠 CloudBase 控制台默认参数 |
| **部署测试不足** | P0 紧急修复时跳过了验证步骤 |
| **基础镜像升级未验证** | Ubuntu 24.04 后 glibc 地址选择策略变化，导致 `localhost` 行为不同 |

### 层级4：系统性原因

1. **socat 掩盖了真正问题**：从 Apr 30 开始，socat 代理一直让容器"看起来健康"，但从未真正解决应用启动慢的问题
2. **InitialDelaySeconds 从未入配置**：这个 CloudBase 必需参数在项目中一直被忽略
3. **加速措施未系统化**：每次只加一个参数（lazy init / 连接池 / TieredCompilation），没有整体规划
4. **P0 修复太仓促**：Jun 11 处理 socat IPv6 时，只想着"去掉 localhost"，没考虑探针问题

---

## 三、关键发现（这次才挖出来的）

### 发现1：cloudbaserc.json 历史上无 InitialDelaySeconds
```
Jun 10 (0ef4b6d6d): 无 InitialDelaySeconds → CloudBase 默认 2s
  但当时有 socat 代理：socat 立即绑定 8088，探针通过 → "看起来正常"
Jun 11 (1e789f8d4): 去掉 socat，Tomcat 直接监听 8088
  但 InitialDelaySeconds 仍未配置 → 探针 2s 后检测 → 失败

结论：之前能部署成功，是因为 socat 临时"伪造"了健康状态，不是应用真的健康。
```

### 发现2：Spring Boot 启动时间已达 90s+
| 时间 | 启动时间 | 主要原因 |
|------|---------|---------|
| Apr 30 | ~30s | 加 socat 时的基准 |
| Jun 10 | ~60s | AI 模块（Qdrant + GraphRAG） |
| Jun 11+ | ~90s+ | 工厂画像 + 知识库 + 记忆系统 |

### 发现3：socat 从一开始就是错误的方向
socat 代理掩盖了探针配置缺失的问题，让团队在 Apr 30 ~ Jun 10 期间"以为部署正常"，实际上每次部署都在靠 socat 的 8088 绑定"作弊"。

---

## 四、修复方案（已在 commit 4d454c0ea 中实施）

| 文件 | 修复内容 | 状态 |
|------|---------|------|
| `cloudbaserc.json` | InitialDelaySeconds: 300, PeriodSeconds: 30, TimeoutSeconds: 10, FailureThreshold: 5 | ✅ 已推送 |
| `deploy-backend.yml` | API 请求加探针参数 | ✅ 已推送 |
| `backend/Dockerfile` | HEALTHCHECK start-period=300s, HTTP+TCP 双保险 | ✅ 已推送 |
| `Dockerfile`（根目录）| 同上 | ✅ 已推送 |
| `docker-entrypoint.sh` | TieredCompilation C1 + urandom + IPv4 + 明确 server.address | ✅ 已推送 |
| `application-prod.yml` | server.address=0.0.0.0, banner-mode=off | ✅ 已推送 |

---

## 五、教训（深刻且系统化）

### 教训1：socat 是临时补丁，不是最终方案
**错误**：每次遇到探针问题就加 socat 绕过。
**正确**：探针参数必须正确配置 InitialDelaySeconds。

### 教训2：应用启动时间必须持续监控
**错误**：AI 模块每次加功能时不考虑启动时间影响。
**正确**：启动时间是部署基础设施的"一等公民"，需要持续关注和优化。

### 教训3：P0 修复必须验证
**错误**：Jun 11 处理 socat 时只改了代码，没有在测试环境验证部署流程。
**正确**：紧急修复也需要走完整的部署验证。

### 教训4：基础设施参数必须入版本控制
**错误**：cloudbaserc.json 的 InitialDelaySeconds 从未被配置。
**正确**：所有 CloudBase 探针配置必须在配置文件中明确声明。

---

## 六、新增铁律

### D-018：CloudBase 探针配置强制入版本控制

> 所有 CloudBase 探针参数必须在 `cloudbaserc.json` 中明确声明，不得依赖云端默认值。
> 最低配置：
> ```json
> {
>   "InitialDelaySeconds": 300,
>   "PeriodSeconds": 30,
>   "TimeoutSeconds": 10,
>   "FailureThreshold": 5
> }
> ```
> 每次新增显著增加启动时间的模块（如 AI/缓存/连接池）后，必须重新评估 InitialDelaySeconds。

### D-019：禁止使用 socat 做探针"作弊"

> socat 代理层可以绕过探针检测，但让应用处于不健康状态。
> 禁止使用 socat 来"伪造"健康状态。探针必须检测真实应用端口。
> 正确做法是配置 InitialDelaySeconds，而不是用代理绕过。

---

## 七、后续行动（待执行）

- [ ] 监控 Jun 12 09:20 部署后的启动时间（期望 <120s，否则继续调优）
- [ ] 在 CI 中增加启动时间测试：构建镜像后，启动容器并记录端口就绪时间
- [ ] 考虑 Spring Boot 启动分离：将非核心模块（Qdrant/Graph/Knowledge）改为懒加载 Bean
- [ ] 飞书通知：配置探针失败/恢复的通知，让团队第一时间感知

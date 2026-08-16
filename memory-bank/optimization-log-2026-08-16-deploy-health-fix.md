# Optimization Log — 2026-08-16 部署失败根因修复（P0）

## 事故

backend-2114 部署失败。用户日志显示应用 **17:12:52 正常启动（103.6s）**，却在 **17:19:00 被优雅停机**，随后 17:30:55 再次停机；期间无 OOM、无异常栈、无 Flyway 失败。

## 诊断过程（三板斧）

1. **health vs readiness 对比**：线上实测 `/actuator/health` = **503 DOWN**，`/actuator/health/readiness` = **200** → 主 health 被某组件拖垮，探活组正常
2. **时间线对齐**：容器 17:11:12 启动 → HEALTHCHECK start-period=300s 到 17:16:12 → 3 次×30s 探测全失败 → 判死 ≈ 17:18:42 → **17:19:00 graceful shutdown**（误差 18s，吻合）
3. **反推镜像版本**：启动日志 Flyway 显示 `Current version: 202708161100, No migration necessary`，而 origin/main 已含 17:04:46 提交的 `V202708161200` → 该实例是**部署失败后 CloudBase 回滚的旧镜像**，非本次构建产物（不是 Flyway 问题）

## 根因链（三层叠加）

1. **外部依赖**：Qdrant 服务不可达（启动日志 WARN "Qdrant不可用，跳过向量化"）
2. **健康语义过严**：`AiComponentHealthIndicator` 任一组件 DOWN → `Health.down()` → 主 health 整体 503（AI 组件实为可选增强能力）
3. **兜底静默失效**：Dockerfile HEALTHCHECK 的 TCP 兜底 `echo > /dev/tcp/127.0.0.1/8088` 依赖 bash 特性，但 HEALTHCHECK shell form 用 `/bin/sh`（Ubuntu=**dash**），`/dev/tcp` 不被支持 → **兜底从未生效**，此前全靠主 health 200 掩盖

## 修复（3 文件）

| 文件 | 改动 |
|---|---|
| `AiComponentHealthIndicator.java` | 任一 DOWN → `Health.status("DEGRADED")`（不再 down）；全部 UP→UP；未配置→UNKNOWN 不变 |
| `application.yml` | `management.endpoint.health.status.http-mapping.DEGRADED: 200` + `order: DOWN,OUT_OF_SERVICE,DEGRADED,UP,UNKNOWN` |
| `backend/Dockerfile` | HEALTHCHECK 主探测改 `/actuator/health/readiness`；TCP 兜底显式 `/bin/bash -c 'echo > /dev/tcp/...'` |

## 验证

- read-lints：0 错误
- 线上 readiness 200 佐证新探测目标语义正确
- 待部署后端到端确认：部署成功 + health 返回 200/DEGRADED + V202708161100/V202708161200 迁移执行

## 遗留

- [x] commit `95a6d8779` + push origin main（2026-08-16 17:49，safe-pass 6 项全过）→ 微信云自动拉取部署
- [ ] 部署完成后端到端确认：health 返回 200/DEGRADED + V202708161100/V202708161200 迁移执行
- [ ] Qdrant 恢复或清空 `QDRANT_URL`（修复后不影响部署，仅影响向量检索）
- [ ] D-096 迁移随本次重新部署一并上线（74 表 CONVERT，t_ai_job_run_log 49 万行预计数秒）

---
name: fashion-deploy-infra
description: 服装供应链系统部署与基础设施铁律。当修改 Dockerfile、docker-entrypoint.sh、cloudbaserc.json、CI/CD workflow、Nginx 配置、环境变量、健康检查时必须遵循。违反会导致全站502或部署失败（已出3次P0事故）。
version: 1.0.0
---

# 部署基础设施铁律

> 本 skill 浓缩自 3 次 P0 部署事故的血泪教训。改任何部署/基础设施代码前必须遵守。

## 1. CI/CD 部署锁定（P0#12）

> **禁止更换部署方式** — INC-20260614 血的教训

```yaml
# ✅ 唯一正确方式：TencentCloudBase/cloudbase-action@v2
- name: 部署到腾讯云 CloudBase
  uses: TencentCloudBase/cloudbase-action@v2
  with:
    secretId: ${{ secrets.CLOUDBASE_SECRET_ID }}
    secretKey: ${{ secrets.CLOUDBASE_SECRET_KEY }}
    envId: ${{ secrets.CLOUDBASE_ENV_ID }}
```

**禁止**：
- ❌ 改用 `tcb framework deploy` 直接调用（缺少认证，CI 环境无法交互登录）
- ❌ 改用 `tcb login` + `tcb framework deploy`（认证不稳定）
- ❌ 修改 `.github/workflows/ci.yml` 中的部署步骤，除非用户明确要求
- ❌ 添加 `npm install -g @cloudbase/cli` 等 CLI 安装步骤（action 内部已包含）

## 2. 容器内禁止 localhost（P0#11）

> **INC-20260611-001：socat localhost IPv6 解析导致全线 502**

```bash
# ❌ 禁止：容器内使用 localhost（IPv6/IPv4 解析不可预测）
socat TCP-LISTEN:8088,fork,reuseaddr TCP:localhost:8089 &
curl http://localhost:8088/actuator/health

# ✅ 正确：使用 127.0.0.1
curl http://127.0.0.1:8088/actuator/health
```

**原因**：Ubuntu 24.04 默认 IPv6 优先，`localhost` 解析为 `::1`，而 Tomcat 只监听 IPv4 `0.0.0.0`。

**规则**：
- ✅ 容器内网络目标必须用 `127.0.0.1`
- ✅ HEALTHCHECK 用 `127.0.0.1`
- ✅ 代理/转发配置用 `127.0.0.1`
- ❌ 禁止容器内使用 `localhost`

## 3. CloudBase 探针配置（D-018）

> **INC-20260612-001：探针超时 + socat IPv6 双故障，全站 502 持续 9 小时**

```json
// cloudbaserc.json — 必须显式配置，不得依赖云端默认值
{
  "containerPort": 8088,
  "InitialDelaySeconds": 300,
  "PeriodSeconds": 30,
  "TimeoutSeconds": 10,
  "FailureThreshold": 5
}
```

**关键认知**：
- CloudBase 默认 `InitialDelaySeconds=2`，Spring Boot 启动需 90s+
- Docker `HEALTHCHECK` 的 `start-period` 在 CloudBase 中**不生效**，CloudBase 使用自己的探针配置
- 每次新增显著增加启动时间的模块（AI/缓存/连接池）后，必须重新评估 `InitialDelaySeconds`

## 4. 禁止 socat 代理（D-019）

> **socat 从一开始就是错误的方向** — 它掩盖了探针配置缺失的问题

```bash
# ❌ 禁止：socat 代理"伪造"健康状态
socat TCP-LISTEN:${EXTERNAL_PORT},fork,reuseaddr TCP:localhost:${INTERNAL_PORT} &

# ✅ 正确：Tomcat 直接监听 PORT 环境变量
echo "[entrypoint] Starting Spring Boot on port ${PORT:-8088}"
exec java \
  -Djava.net.preferIPv4Stack=true \
  -jar /app/app.jar
```

**socat 的危害**：
- 立即绑定端口让探针通过 → 掩盖应用未就绪的事实
- 增加不必要的网络层和故障点
- IPv6 解析问题导致 502

## 5. 白屏防护（P0#8）

```nginx
# ✅ 正确：nginx 配置
location @spa_fallback {
    # JS/CSS 返回 404，不返回 index.html（避免白屏）
    if ($uri ~* \.(js|css)$) { return 404; }
    root /usr/share/nginx/html;
    try_files /index.html =404;
    add_header Cache-Control "no-cache, no-store";
}
```

**规则**：
- ✅ 错误恢复代码必须内联在 `index.html` `<head>` 中
- ✅ nginx `@spa_fallback` 对 JS/CSS 返回 404，不返回 index.html
- ✅ `try_files` 去掉 `$uri/`，确保根路径走 no-cache 头

## 6. 环境变量安全

```yaml
# ❌ 禁止：jwt-secret 无默认值（云端未设置时启动失败）
jwt:
  secret: ${JWT_SECRET:}

# ✅ 正确：必须有开发环境默认值
jwt:
  secret: ${JWT_SECRET:ThisIsA_LocalJwtSecret_OnlyForDev_0123456789}
```

**必须配置的环境变量**：
- `JWT_SECRET` — 生产环境必须设置，开发环境有默认值
- `APP_PUBLIC_BASE_URL` — 公网访问地址，AI 功能依赖
- `PORT` — CloudBase 自动注入，Tomcat 直接监听

## 7. Dockerfile 规范

```dockerfile
# ✅ 正确的 Dockerfile 配置
HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=5 \
  CMD curl -f http://127.0.0.1:8088/actuator/health || exit 1

# 启动加速参数
ENTRYPOINT ["docker-entrypoint.sh"]
```

**docker-entrypoint.sh 规范**：
- ✅ 加 `-Djava.net.preferIPv4Stack=true`（强制 IPv4）
- ✅ 加 `-XX:TieredStopAtLevel=1`（C1 编译加速启动）
- ✅ 加 `-Djava.security.egd=file:/dev/./urandom`（随机数加速）
- ✅ `server.address=0.0.0.0` 显式声明
- ❌ 禁止安装 socat
- ❌ 禁止任何代理转发层

## 8. 历史事故索引

| 事故编号 | 日期 | 根因 | 影响 | 持续时间 |
|---------|------|------|------|---------|
| INC-20260611-001 | 06-11 | socat 用 localhost → IPv6 解析 → 502 | 全站不可用 | 整天 |
| INC-20260612-001 | 06-12 | 去掉 socat 后无 InitialDelaySeconds → 探针失败 | 全站 502 | 9 小时 |
| INC-20260612-002 | 06-12 | CI 改用 tcb CLI → 交互卡住 → 部署失败 | 全站 502 | 24 小时 |

**共同教训**：
1. 每次改部署代码，必须验证部署流程端到端
2. P0 修复不能只改代码，必须确认新版本真正部署成功
3. 基础设施参数必须入版本控制，不依赖平台默认值

## 9. 改部署代码前自检清单

- [ ] CI/CD 部署方式是否仍为 `TencentCloudBase/cloudbase-action@v2`？（禁止更换）
- [ ] 容器内是否有 `localhost` 引用？→ 全部改为 `127.0.0.1`
- [ ] `cloudbaserc.json` 探针参数是否显式配置？（InitialDelaySeconds ≥ 300）
- [ ] Dockerfile HEALTHCHECK 是否用 `127.0.0.1`？`start-period` 是否 ≥ 300s？
- [ ] 是否引入了代理层（socat/nginx 代理等）？→ 禁止，Tomcat 直接监听 PORT
- [ ] 新增环境变量是否有默认值？（jwt-secret 必须有）
- [ ] 白屏防护代码是否完整？（index.html head 内联 + nginx @spa_fallback）
- [ ] 改完后能否在 CI 环境端到端验证部署？（P0 修复必须验证）

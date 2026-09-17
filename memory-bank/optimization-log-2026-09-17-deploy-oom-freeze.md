# Optimization Log — 2026-09-17 自动部署内存耗尽整机假死（P0，D-453）

## 一、事故现象

- 用户反馈：推送色卡那版代码（`d6fd94b11`）后 https://www.webyszl.cn **整站打不开**
- 外部探测：80/443 TCP 三次握手**能通**，但 TLS 握手与 HTTP 请求**全部超时（15s 无任何字节）**
- SSH：TCP 22 能连，**banner exchange 超时**，认证流程都进不去
- 结论形态：**内核活着、用户态全部饿死**（不是宕机、不是 502、不是应用崩溃）

## 二、时间线

| 时间（约） | 事件 |
|---|---|
| 推送前 | 服务器全栈正常：MySQL + Redis + Qdrant + CloudBeaver + backend(-Xmx3g) + frontend + Caddy |
| T+0 | 推送 `d6fd94b11`，同时改动 `backend/`（Java）和 `frontend/`（TS/React） |
| T+2min 内 | cron 触发 `autodeploy.sh`：`git pull` → `docker compose up -d --build backend frontend` |
| T+2~6min | **Maven 构建与 Vite 构建并行**，内存峰值叠加，8G 耗尽；系统**无 swap**，OOM/thrashing |
| 用户发现 | 网站超时打不开；此时 sshd/dockerd/Caddy 已无法被调度响应 |
| 重启后 | 容器 `restart: unless-stopped` 全部自动拉起，前端 200、后端 readiness 401（正常鉴权响应），网站恢复旧版本 |

## 三、根因（五层，不只是"内存不够"）

### 直接原因：并行构建
`autodeploy.sh` 原实现把变更服务拼成字符串一次性构建：

```bash
SERVICES=""
echo "$CHANGED" | grep -q '^backend/'  && SERVICES="$SERVICES backend"
echo "$CHANGED" | grep -q '^frontend/' && SERVICES="$SERVICES frontend"
sudo docker compose up -d --build $SERVICES   # backend+frontend 同时 build
```

一次双端同改的提交 → Maven 镜像构建与 Node/Vite 镜像构建**在同一时刻并行**。

### 资源算账（⚠️实际机型是 2核4G，比 README 推荐的 4核8G 小一半——这是事故的必然前提）

activeContext 明确记录：生产实例为**腾讯云轻量 2核4G**（106.55.12.216）。
4G 内存下，光常驻全家桶就已经在超载边缘：

| 占用方 | 估算内存 |
|---|---|
| backend 旧容器（**-Xmx3g**，构建期间不停机；4G 机上光堆上限就占 3/4） | 3 GB（上限） |
| MySQL 8 | 0.5~1 GB |
| CloudBeaver（JVM 应用）+ Qdrant + Redis + Caddy + 系统 | 1~1.5 GB |
| **常驻小计** | **常态已贴满甚至超卖 4G，全靠 JVM 惰性吃堆 + 容器 cgroup 硬撑** |
| Maven 构建（JVM + 编译） | 1.5~2 GB |
| Vite/Node 构建（esbuild/rollup 高峰值） | 1~1.5 GB |
| **并行构建叠加峰值** | **直接冲 6~8 GB，对 4G 机 = 200% 超载，必挂** |

> 结论：2核4G 上**任何一次双端同改的并行构建都是必死局**；即使单端构建也会非常危险。
> backend `-Xmx3g` 对 4G 机明显过大（留给 OS + 5 个邻居容器只有 1G），后续必须降到 `-Xmx1536m` 左右，
> 最稳妥的方案仍是升级到 README 原推荐的 4核8G（约 630 元/年）。

### 帮凶 1：swap 只有镜像默认的 1.9G，扛不住 200% 超卖
> 修正（初版判断有误）：系统**并非无 swap**——Ubuntu 云镜像自带 `/swap.img` 1.9G。
> 但 3.6G RAM + 1.9G swap = 5.5G 总虚拟内存，仍远低于并行构建 6~8G 的瞬时需求；
> swap 被瞬间打满后进入无换页空间的 thrashing，cgroup 保住部分容器，宿主机 sshd/dockerd 被饿死。
> 教训：有 swap ≠ 安全，swap 只能吸收几百 MB 缓冲突发，扛不住成倍超卖。

### 帮凶 2："TCP 通但应用层死"的假象延误判断
SYN 收包在内核软中断完成，内存紧张时仍可握手；sshd 是用户态进程，拿不到调度就发不出 banner。
排查时一度以为是网络/防火墙问题，实际是**用户态饥饿**。特征记牢：**ping/通、握手通、banner/TLS 无响应 = 内存耗尽假死，不是断网**。

### 深层原因：部署链路缺三道防线
1. **无资源预检**：构建前不看可用内存，flock 只防"两次构建重叠"，不防"构建 vs 常驻服务抢内存"
2. **无串行化**：双端构建没有先后顺序，也没有"后端健康后再构建前端"的编排
3. **无失败可观测**：autodeploy 只在服务器本地 echo 日志，构建失败/机器假死没有任何外部通知，只能靠用户发现网站挂了

### 流程原因（我方）
- 推送前只过了代码质量钩（编译/tsc/多租户审计），**没有"这次提交会不会同时构建前后端"的部署风险意识**
- pre-push 钩管代码不管服务器容量；双端同改的提交应视为高风险部署

## 四、修复措施

### 1. autodeploy.sh（已改，待安全推送）
- **内存守卫**：构建前 `free -m` 取 available，<1200MB 直接跳过本轮（不 pull、不构建），下轮 cron 自动重试
- **串行构建**：固定顺序 backend → frontend，逐个 `docker compose up -d --build`
- **健康门控**：backend 构建后轮询 `/actuator/health` 通过再构建 frontend
- **失败中止**：单个服务构建失败立即 exit 1，旧容器继续服务，不连带重建

### 2. 服务器加固（手动，一次性）
- 系统已有 `/swap.img` 1.9G（镜像自带）；构建内存已被 MAVEN_OPTS/NODE_OPTIONS 封顶，1.9G swap 足够兜底，暂不扩容
- 事故处理期间先注释 autodeploy cron，修复上线后再恢复
- **backend JVM 降堆**：`-Xmx3g` 在 4G 机上占比过高，改为 `-Xmx1536m -Xms512m`（compose env JAVA_OPTS），给 OS/MySQL/构建留余量
- 中期建议：升级 4核8G（README 原推荐配置，约 630 元/年），2核4G 跑 7 容器 + 本地构建本就超配
- 注意：内存守卫 1200MB 阈值在 4G 机常驻状态下余量很小（常态 available ~1.5G）→ 繁忙时 autodeploy 会跳过，这是**有意的安全行为**；容量未扩容前，发版尽量走低峰期

### 3. 流程纪律（记入铁律）
- **双端同改的提交 = 高风险部署**：推送后必须盯 5~10 分钟（服务器在串行构建），确认登录页版本水印更新
- 以后再次出现"网站打不开、SSH banner 超时"，优先怀疑内存耗尽，直接控制台重启 + 查 free/swap
- autodeploy 任何调整必须在服务器低峰期手动验证一轮，不能只靠 cron 试错

## 五、遗留与验证（2026-09-17 17:05 全部闭环）

- [x] 网站重启后恢复（容器自愈策略生效）
- [x] autodeploy.sh 修复（69d8c10），`bash -n` 语法通过
- [x] 服务器端：cron 已停→修复上线→**已恢复**；系统 swap 为镜像自带 1.9G（无需另建）
- [x] 手动串行部署实测：后端构建 3m08s（峰值 avail 335MB / swap 649MB），70 秒恢复 healthy；
      前端构建 62s（峰值 swap 767MB）——串行+限堆后 2核4G 安全
- [x] 外部验收：前端 200（0.29s）、recognize-entries 401（路由在线）、7 容器全 healthy、水印 69d8c10
- [x] 附带发现：崩溃前前端其实是 5eb765d（d6fd94b 前端没构建完），本次一并补建
- [x] 上线后内存：used 1.3G / available 2.3G（事故前 2.1G / 1.5G）；backend RSS 1.18G → 813M
- [ ] 中期：升级 4核8G（630 元/年）；观察繁忙时段内存守卫跳过频率，必要时再压构建堆
- [ ] 运维改进（未做）：autodeploy 构建结果无外部通知，下次可加 Server 酱/企业微信机器人 webhook

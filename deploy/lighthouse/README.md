# 轻量服务器迁移手册（云托管 → 腾讯云轻量）

> ⚠️ **实际购买的是 2核4G**（见 `activeContext.md`），不是本文最初推荐的 4核8G。
> 容量只有一半，直接导致 D-453 的并行构建假死事故 → 构建必须串行 + 内存守卫，
> 详见 `memory-bank/optimization-log-2026-09-17-deploy-oom-freeze.md`。
> 长期建议仍是升级 4核8G（约 630 元/年）。
>
> 架构：一台服务器跑全栈 —— Caddy(HTTPS) + frontend + backend + MySQL + Redis + Qdrant + CloudBeaver
> （db.webyszl.cn 管理台，D-435 起由 CloudBeaver 提供，phpMyAdmin 已退役）
> 已核实的前提：后端调微信全部**直连官方** api.weixin.qq.com，不依赖云托管任何专属能力 ✓

## 0. 购买服务器（你来操作，10 分钟）

1. 打开 https://cloud.tencent.com/act/pro/dis-lighthouse
2. 选 **轻量应用服务器 4核8G 10M**（约 630 元/年；预算紧可 2核4G 188/年，略紧）
3. 地域选**广州**（域名已备案，必须大陆）；镜像选 **Ubuntu 24.04**
4. 购买后：控制台 → 防火墙 → 放行端口 **22, 80, 443**
5. 记下公网 IP，能 `ssh root@IP` 登录即可

## 1. 服务器初始化（你把两个文件传上去跑一下）

```bash
# 在你 Mac 上：
scp deploy/lighthouse/bootstrap-server.sh deploy/lighthouse/docker-compose.yml deploy/lighthouse/Caddyfile deploy/lighthouse/deploy-app.sh root@服务器IP:/root/
ssh root@服务器IP
bash bootstrap-server.sh
```

脚本会装 Docker、克隆仓库到 /opt/fz66666、生成 `.env.backend` 模板后暂停。

## 2. 填环境变量（实际只需改 2 行）

1. 云托管控制台 → backend → 服务设置 → 环境变量 → **整份复制**（从 SPRING_PROFILES_ACTIVE 到最后一行全选）
2. 粘贴进服务器 `/opt/fz66666/deploy/lighthouse/.env.backend`
3. **只改这 2 行**（其余一个字不动）：

```
# 改这行：数据库指向本机容器（保留末尾的时区参数）
SPRING_DATASOURCE_URL=jdbc:mysql://mysql:3306/fashion_supplychain?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai

# 清空这行：服务器上的 Redis 不设密码（等号后面留空）
SPRING_REDIS_PASSWORD=
```

> 不用改的：SPRING_REDIS_HOST 和 QDRANT_URL 会被 docker-compose 自动覆盖成容器地址，改了也白改。

4. `echo "MYSQL_ROOT_PASSWORD=自己定一个强密码" > /opt/fz66666/deploy/lighthouse/.env`
5. 第 3 步迁移数据时用的数据库账号密码 = 上面抄过的 SPRING_DATASOURCE_USERNAME / SPRING_DATASOURCE_PASSWORD

再跑一次 `bash bootstrap-server.sh` —— 启动 MySQL/Redis/Qdrant 并等健康。

## 3. 迁移生产数据（手把手版，全程只读不影响线上）

### 第1步：给云托管 MySQL 开公网访问（3 次点击）

1. 打开 腾讯云开发控制台(cloud.tencent.com/product/cloudbase) → 你的环境
2. 左侧菜单找 **「数据库」** 或 **「MySQL」** 管理页
3. 找 **「公网访问/外网访问」** 开关 → **开启**
4. 开启后会显示一个 **公网域名 + 端口**（形如 xxx.tencentdb.com:6xxxx），复制下来
5. 同一页面有 **IP 白名单** → 填入你**轻量服务器的公网 IP**

> 如果找不到这个开关：把该页面截图发我，走备用方案。

### 第2步：找到数据库账号密码

云托管控制台 → backend → 服务设置 → 环境变量，找这三行抄下来：
- `APP_DB_USERNAME`（用户名，一般是 root）
- `APP_DB_PASSWORD`（密码）

### 第3步：在【新服务器】上跑两条命令

```bash
# 导出（从云托管库拉全量，只读操作，线上无任何影响，几分钟）
docker run --rm mysql:8.0 mysqldump \
  -h<第1步的公网域名> -P<第1步的端口> \
  -u<第2步用户名> -p'<第2步密码>' \
  --single-transaction --routines --triggers \
  fashion_supplychain > /opt/dump.sql

# 确认文件不为 0 且有几~几百 MB
ls -lh /opt/dump.sql

# 导入（进新库）
docker compose -f /opt/fz66666/deploy/lighthouse/docker-compose.yml exec -T mysql \
  mysql -uroot -p'<你的MYSQL_ROOT_PASSWORD>' fashion_supplychain < /opt/dump.sql
```

### 第4步：核对（两条数，两边应该一致）

```bash
# 新服务器上新库：
docker compose -f /opt/fz66666/deploy/lighthouse/docker-compose.yml exec -T mysql \
  mysql -uroot -p'<密码>' fashion_supplychain \
  -e "SELECT COUNT(*) FROM t_user; SELECT COUNT(*) FROM t_production_order;"
# 对照云托管后台同表数量（或问小云"系统里有多少用户/订单"）
```

> 导完先别动云托管那边的库——它是回滚保险，观察一周没问题再处理。

## 4. 启动全栈

```bash
bash /opt/fz66666/deploy/lighthouse/deploy-app.sh
```

## 5. HTTPS 证书（自动）

Caddy 需要域名解析到服务器才能签证书。**先切 DNS 再启动 Caddy**（或先启动也行，会自动重试）：

- DNS 控制台：`api.webyszl.cn` 和 `www.webyszl.cn` 的 A 记录 → 服务器 IP，TTL 改 600
- Caddy 自动签发 Let's Encrypt，续期全自动，零维护

## 6. 验证（DNS 生效后）

- 浏览器开 https://www.webyszl.cn → 登录 → 抽查订单/库存页
- 小程序真机 → 登录/扫码 → 抽查
- `curl https://api.webyszl.cn/actuator/health`

## 7. 自动部署（推代码即更新）

### ✅ 实际生效的机制：服务器端 cron 自拉取

**生产上线只依赖服务器上的 `deploy/lighthouse/autodeploy.sh`**（cron 每 2 分钟执行）：

1. `git fetch origin main` → 与本地 HEAD 比对，无变化直接退出
2. **全服务在场巡检**（D-455）：compose 里定义了但没在跑的服务自动补起（不构建）
3. **内存守卫**：`free -m` available < 1200MB 则跳过本轮，下轮重试（防 D-453 假死）
4. `git pull --ff-only` → 把短 commit 写进 `.env`（供登录页版本水印）
5. **串行构建**：backend 先构建 + 等健康检查 → 再 frontend；单个失败立即中止，旧容器继续服务

**判断是否上线**：登录页底部「部署版本：<7位短 commit>」。
纯 `docs/` / `memory-bank/` 提交**不触发重建**，版本号不变是正常的。

### 🔍 push 后长时间不上线？按执行顺序逐关卡查

**注意**：登录页水印只能证明"最后一次成功构建"，**无法区分"没 pull"还是"pull 了但没构建"** ——
所以从外部探测定位不了，必须登服务器看：

```bash
cd /opt/fz66666 && sudo bash -x deploy/lighthouse/autodeploy.sh 2>&1 | tail -60
```

按 autodeploy 的执行顺序逐关排查（**内存守卫排在第 6 位，不是第一嫌疑**）：

| # | 关卡 | 静默失败的表现 | 检查 |
|---|---|---|---|
| 1 | cron 是否在跑 | 脚本从未被调用 | `sudo crontab -l \| grep autodeploy` |
| 2 | `flock -n 9` | 上一轮卡住持有锁 → 后续每轮立即退出 | `ps -ef \| grep autodeploy` |
| 3 | `git fetch` | git 的 **dubious ownership** 校验（repo 属主≠执行身份）直接拒绝 | `sudo git -C /opt/fz66666 status` |
| 4 | `git fetch origin main` | 网络/凭证问题 | 同上命令看报错 |
| 5 | `git pull --ff-only` | **本地分叉**时失败 | `git -C /opt/fz66666 status -sb` |
| 6 | 内存守卫 | available < 1200MB 跳过（**先量再说**） | `free -m` 看 available |
| 7 | 本就无需重建 | 纯 `docs/`、`memory-bank/` 提交不重建，水印不变是正常的 | `git diff --name-only A B` |

### 🔔 部署结果通知（D-456，强烈建议开启）

autodeploy 的失败/跳过此前**只写服务器本地日志，没人看就等于没有** ——
2026-09-17 实测内存守卫每轮跳过，**部署静默阻塞 20 分钟无人察觉**
（站点正常、水印不变，从外部完全看不出异常）。

配置：在服务器 `deploy/lighthouse/.env` 里加一行（该文件已 gitignore，密钥不入库）：

```bash
NOTIFY_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx   # 企业微信群机器人
# 或 NOTIFY_WEBHOOK=https://sctapi.ftqq.com/SCTxxxx.send                  # Server 酱
# 或任意接收 POST JSON {"text":"..."} 的地址
# 可选：NOTIFY_FORMAT=wecom|serverchan|json   默认按 URL 自动嗅探
```

- 未配置时是 **no-op**（静默成功退出）
- 通知失败**绝不**影响部署流程（任何情况返回 0）
- 触发时机：① 内存守卫跳过（每小时最多 1 次，防刷屏）② 开始构建 ③ 构建失败 ④ 构建完成
- 排查为何没发出：`NOTIFY_DEBUG=1 bash deploy/lighthouse/notify.sh "测试"`

### ⚠️ `Deploy Lighthouse` workflow 是死的（2026-09-17 核实）

`.github/workflows/deploy-lighthouse.yml` 依赖 `LIGHTHOUSE_HOST` / `LIGHTHOUSE_USER` /
`LIGHTHOUSE_SSH_KEY`，但仓库 secrets 里**根本没有这三项**（现有仅 `CLOUDBASE_*` /
`SERPAPI_KEY` / `SMOKE_*`），也无 environment / variable → **手动触发必然失败**。

**且服务器 SSH 是密码登录而非密钥**，所以「本机 SSH 上去部署」这条路走不通 ——
**一切服务器侧动作只能靠「改脚本 + push」让 autodeploy 自执行**。

> 历史遗留：下面这套密钥开通步骤（原文档）从未完成过，保留仅供未来需要手动部署能力时参考。
>
> 1. 本机生成部署密钥：`ssh-keygen -t ed25519 -f ~/.ssh/lighthouse_deploy -N ""`
> 2. 公钥追加到服务器：`ssh root@IP 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/lighthouse_deploy.pub`
> 3. GitHub → Settings → Secrets 添加 `LIGHTHOUSE_HOST` / `LIGHTHOUSE_SSH_KEY`
> 4. Actions 页手动跑一次 `Deploy Lighthouse` 验证
> 5. 稳定后放开 `.github/workflows/deploy-lighthouse.yml` 里的 `push:` 注释
>
> 若确认不需要，直接删掉该 workflow 更干净，避免误触发。

## 8. 回滚预案（迁移后观察一周）

- 云托管环境**先别删**；DNS 改回原记录即回滚，5 分钟内恢复
- 观察一周稳定后：云托管删 backend/frontend/h5/my-qdrant/my-redis 服务（MySQL 导出留档后再退订）

## 9. 数据库管理台（db.webyszl.cn）

- **CloudBeaver**（DBeaver 官方 Web 版）跑在 compose 里（`cloudbeaver` 服务，端口 8978），Caddy 反代对外提供 HTTPS 入口 db.webyszl.cn，**不直接开端口**
- 只允许内网连库（`jdbc:mysql://mysql:3306`），CloudBeaver → MySQL 流量不出服务器；管理台设置持久化在 `cloudbeaver-data` 卷
- D-435 起替换原 phpMyAdmin（更现代：暗色模式/SQL 自动补全/手机浏览器可用）；phpMyAdmin 容器已退役
- ⚠️ **CloudBeaver 建议按需启动**：它是查库工具、不在业务链路上，常驻没有必要。
  按需启动：`sudo docker compose up -d cloudbeaver`；用完停掉：`sudo docker compose stop cloudbeaver`
- 它已在 `autodeploy.sh` 的 `SWEEP_SKIP` 名单里，**不会被"全服务在场巡检"自动拉起**
  （否则会跟有意停掉它的操作形成每 2 分钟一次的拉锯）
- 更正（2026-09-17）：曾把"部署被阻塞"归因于 CloudBeaver 触发内存守卫，
  用户实测 `free -m` available **1913MB** 远高于 1200MB 阈值，**该归因已被推翻**。
  排查部署不上线请走 §7 的逐关流程，不要先怀疑内存。
- **首次使用**：① 打开 db.webyszl.cn → 按向导创建管理员账号（自己起，记住即可）→ ② 左侧点「服装66666 业务库」→ 输一次 MySQL root 密码（服务器 `.env` 的 `MYSQL_ROOT_PASSWORD`）并勾选保存
- 预置连接配置：`cloudbeaver/conf/initial-data-sources.conf`（**不含密码**，密码首次连接时输入；若预置连接未出现，在界面里 Add Connection 选 MySQL 手动加一次：host 填 `mysql`）
- 第一次打开库会下载 MySQL 驱动（约 10~30 秒），属正常
- 导入大文件：CloudBeaver SQL 编辑器支持执行大 SQL；整库恢复仍建议命令行（见第 6 节迁移命令）

## 10. 数据库备份与容灾（D-455 补齐）

> ⚠️ **2026-09-17 核查发现：整条备份链路此前从未跑通，生产库长期零备份。**
> 三处断点：① 服务器侧没有任何东西产出备份；② 本机公钥未授权到服务器；
> ③ launchd 任务未加载。以下为补齐后的完整链路。

### 链路总览

```
服务器 autodeploy（每 2 分钟）
  └─ 调 deploy/lighthouse/backup-db.sh
       └─ 自调度：每天 03:00 后首次执行 → /opt/backups/fz66666-YYYY-MM-DD.sql.gz（留 14 份）

本机 launchd（每天 10:07）
  └─ 调 ~/fz66666-backups/pull.sh
       └─ rsync 拉回 ~/fz66666-backups/（留 14 份）→ 异地第二副本
```

### 服务器侧：`deploy/lighthouse/backup-db.sh`

- 由 `autodeploy.sh` 每轮调用，脚本**内部自调度** —— autodeploy 每 2 分钟跑一次，
  靠脚本内的日期戳 + 30 分钟冷却闸门控制「一天只真正备份一次」，失败也不会每 2 分钟猛跑
- `--single-transaction` 一致性快照不锁表；`--routines --triggers` 一并备份存储过程/触发器
- 密码取自容器内环境变量，不出现在宿主 `ps` 里
- 守卫：磁盘可用 < 2GB 直接跳过（防写满）；mysql 容器未运行跳过
- 先写 `.part` 再 `gzip -t` 校验通过才改名，避免半截文件被当成有效备份
- 手动强制跑一次：`sudo bash /opt/fz66666/deploy/lighthouse/backup-db.sh --force`

### 本机侧：`~/fz66666-backups/pull.sh`

- **故意不放进仓库**：本机是外接卷 `/Volumes/macoo2`，卷没挂载时仓库路径不可用，
  脚本必须自包含才能保证每天跑到
- launchd 配置：`~/Library/LaunchAgents/com.fz66666.db-backup.plist`（每天 10:07）
- 用 `BatchMode=yes`：密钥未授权时**快速失败并打印排查指引**，不会挂在密码提示上

### 启用步骤（三步，缺一不可）

```bash
# ① 服务器侧：确认 autodeploy 已带 D-455 补丁（会产出备份）
ssh ubuntu@106.55.12.216 'ls -lh /opt/backups/'

# ② 本机公钥授权到服务器 ubuntu 用户
ssh-copy-id -i ~/.ssh/fz66666_backup.pub ubuntu@106.55.12.216

# ③ 加载 launchd 任务，并立刻手动验证一次
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.fz66666.db-backup.plist
bash ~/fz66666-backups/pull.sh
```

### 恢复演练（**没演练过的备份等于没有备份**）

```bash
gunzip -c ~/fz66666-backups/fz66666-YYYY-MM-DD.sql.gz | head -50   # 先看内容是否正常
# 恢复到新库（不要直接覆盖生产库）
docker compose -f /opt/fz66666/deploy/lighthouse/docker-compose.yml exec -T mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE restore_check;"
gunzip -c /opt/backups/fz66666-YYYY-MM-DD.sql.gz | \
  docker compose -f /opt/fz66666/deploy/lighthouse/docker-compose.yml exec -T mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" restore_check
```

### 已知不足

- **备份没有外部告警**：拉取失败只写本机 `pull.log`，没人看就等于没有
- 本机 rsync 是 macOS 自带 **openrsync（协议 29 / 2.6.9 兼容）**，功能残缺；
  若出现诡异行为，`brew install rsync` 换正式版
- 备份产物只在服务器磁盘 + 本机（外接卷），**没有第三份异地存储**（可考虑 COS）

## 迁移收益清单

| 项 | 云托管 | 轻量服务器 |
|---|---|---|
| 费用 | 数百/月 | ≈52/月 |
| Qdrant 向量 | 无持久卷，发版即清零 | 本地磁盘**永久保存** |
| 探针误判 | 启动慢被误判失败 | compose 健康检查 start_period 300s |
| 部署 | 平台黑盒 | GitHub Actions 全程可见 |

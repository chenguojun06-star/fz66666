# 轻量服务器迁移手册（云托管 → 腾讯云轻量 4核8G）

> 目标成本：**约 52 元/月**（630 元/年）替代云托管每月数百元
> 架构：一台服务器跑全栈 —— Caddy(HTTPS) + frontend + backend + MySQL + Redis + Qdrant + phpMyAdmin
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

1. 你 Mac 上生成部署密钥：`ssh-keygen -t ed25519 -f ~/.ssh/lighthouse_deploy -N ""`
2. 公钥追加到服务器：`ssh root@IP 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/lighthouse_deploy.pub`
3. GitHub 仓库 → Settings → Secrets → 添加：
   - `LIGHTHOUSE_HOST` = 服务器 IP
   - `LIGHTHOUSE_SSH_KEY` = 私钥全文（lighthouse_deploy 文件内容）
4. Actions 页手动跑一次 `Deploy Lighthouse` 验证
5. 稳定后把 `.github/workflows/deploy-lighthouse.yml` 里 `push:` 两行注释放开 → 恢复"推代码即部署"

## 8. 回滚预案（迁移后观察一周）

- 云托管环境**先别删**；DNS 改回原记录即回滚，5 分钟内恢复
- 观察一周稳定后：云托管删 backend/frontend/h5/my-qdrant/my-redis 服务（MySQL 导出留档后再退订）

## 9. 数据库管理台（db.webyszl.cn）

- **CloudBeaver**（DBeaver 官方 Web 版）跑在 compose 里（`cloudbeaver` 服务，端口 8978），Caddy 反代对外提供 HTTPS 入口 db.webyszl.cn，**不直接开端口**
- 只允许内网连库（`jdbc:mysql://mysql:3306`），CloudBeaver → MySQL 流量不出服务器；管理台设置持久化在 `cloudbeaver-data` 卷
- D-435 起替换原 phpMyAdmin（更现代：暗色模式/SQL 自动补全/手机浏览器可用）；phpMyAdmin 容器已退役
- **首次使用**：① 打开 db.webyszl.cn → 按向导创建管理员账号（自己起，记住即可）→ ② 左侧点「服装66666 业务库」→ 输一次 MySQL root 密码（服务器 `.env` 的 `MYSQL_ROOT_PASSWORD`）并勾选保存
- 预置连接配置：`cloudbeaver/conf/initial-data-sources.conf`（**不含密码**，密码首次连接时输入；若预置连接未出现，在界面里 Add Connection 选 MySQL 手动加一次：host 填 `mysql`）
- 第一次打开库会下载 MySQL 驱动（约 10~30 秒），属正常
- 导入大文件：CloudBeaver SQL 编辑器支持执行大 SQL；整库恢复仍建议命令行（见第 6 节迁移命令）

## 迁移收益清单

| 项 | 云托管 | 轻量服务器 |
|---|---|---|
| 费用 | 数百/月 | ≈52/月 |
| Qdrant 向量 | 无持久卷，发版即清零 | 本地磁盘**永久保存** |
| 探针误判 | 启动慢被误判失败 | compose 健康检查 start_period 300s |
| 部署 | 平台黑盒 | GitHub Actions 全程可见 |

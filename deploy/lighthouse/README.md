# 轻量服务器迁移手册（云托管 → 腾讯云轻量 4核8G）

> 目标成本：**约 52 元/月**（630 元/年）替代云托管每月数百元
> 架构：一台服务器跑全栈 —— Caddy(HTTPS) + frontend + backend + MySQL + Redis + Qdrant
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

## 2. 填环境变量（5 分钟）

1. 云托管控制台 → backend → 服务设置 → 环境变量 → **整份复制**
2. 粘贴进服务器 `/opt/fz66666/deploy/lighthouse/.env.backend`
3. 只需改/确认三行指向（其余 DEEPSEEK_API_KEY、COS、微信配置全部原样）：
   - `APP_DB_HOST=mysql`、`APP_DB_USERNAME=root`、`APP_DB_PASSWORD=<你定的密码>`
   - `SPRING_REDIS_HOST=redis`
   - `QDRANT_URL=http://qdrant:6333`（**必须带 ：6333**）
4. `echo "MYSQL_ROOT_PASSWORD=同一个密码" > /opt/fz66666/deploy/lighthouse/.env`

再跑一次 `bash bootstrap-server.sh` —— 会启动 MySQL/Redis/Qdrant 并等健康。

## 3. 迁移生产数据（唯一需要小心的步骤）

> ⚠️ 禁止让 Flyway 在空库上重放全部迁移（历史迁移非全幂等）。
> 正确姿势：**整库导出导入**（flyway_schema_history 随库一起过来，Flyway 接着往后走）。

导出（二选一）：
- A. 云托管控制台 → MySQL → 导出（若有此入口）
- B. 云托管 MySQL 开启公网访问 → 在你 Mac 上：
  `mysqldump -h<公网host> -P端口 -u用户 -p --single-transaction --routines --triggers fashion_supplychain > dump.sql`

导入（服务器上）：
```bash
scp dump.sql root@服务器IP:/root/
ssh root@服务器IP
docker compose -f /opt/fz66666/deploy/lighthouse/docker-compose.yml exec -T mysql \
  mysql -uroot -p'<密码>' fashion_supplychain < /root/dump.sql
```

核对：导入后两边行数抽查（t_user / t_production_order）。

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

## 迁移收益清单

| 项 | 云托管 | 轻量服务器 |
|---|---|---|
| 费用 | 数百/月 | ≈52/月 |
| Qdrant 向量 | 无持久卷，发版即清零 | 本地磁盘**永久保存** |
| 探针误判 | 启动慢被误判失败 | compose 健康检查 start_period 300s |
| 部署 | 平台黑盒 | GitHub Actions 全程可见 |

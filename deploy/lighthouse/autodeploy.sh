#!/usr/bin/env bash
# =====================================================================
# 自动拉取部署机器人（D-430）：由 cron 每 2 分钟调用
# 有新代码 → 拉取；backend/ 或 frontend/ 有变动才重建对应容器
# miniprogram/文档类改动只拉代码不重建（省 7 分钟构建）
# =====================================================================
set -e
exec 9>/tmp/autodeploy.lock
flock -n 9 || exit 0   # 上一次还没跑完就静默退出，防重叠

cd /opt/fz66666
git fetch origin main -q || exit 0
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

# ── 部署结果通知（D-456）──
# 背景（2026-09-17 事故）：失败/跳过只写服务器本地日志，没人看就等于没有 ——
# 当日实测内存守卫每轮跳过，**部署静默阻塞 20 分钟无人察觉**（站点正常、水印不变，
# 从外部完全看不出异常）。故在关键节点加通知。
# 未配置 NOTIFY_WEBHOOK 时是 no-op；任何情况下都不影响部署流程（见 notify.sh）。
# ⚠️ 必须用绝对路径：构建段执行前脚本已 `cd deploy/lighthouse`，
#    相对路径会解析成 deploy/lighthouse/deploy/lighthouse/... 从而静默失效。
REPO_ROOT=/opt/fz66666
notify() {
  local f="$REPO_ROOT/deploy/lighthouse/notify.sh"
  [ -f "$f" ] || return 0
  bash "$f" "$1" >/dev/null 2>&1 || true
  return 0
}

# ── 全服务在场巡检（D-455，替换 D-433 已退役的 phpMyAdmin 接管逻辑）──
# 背景：D-433 的接管块用 grep '^  phpmyadmin:' 判定，D-435 移除该服务后永久失配 →
# 死代码。但它暴露了真问题：autodeploy 只 up backend/frontend，
# **任何新加入 compose 的服务永远不会被拉起**（CloudBeaver 自 D-435 起静默 502 一整天即此因，
# 且 restart:unless-stopped 对"从未创建过"的容器无能为力）。
# 改为通用巡检：把 compose 里已定义但未运行的服务补起。幂等、不构建、放在版本判断前每轮重试。
# 注意：backend/frontend 有独立的串行构建流程（见下方），此处跳过，避免无 --build 启动失败。
#
# ⚠️ 按需服务白名单（SWEEP_SKIP）—— 必须有，否则会跟"有意停掉的服务"打架：
#   cloudbeaver 是查库工具、不在业务链路上，运维可能**有意停掉它**（例如为省内存）。
#   若不排除，本巡检会每 2 分钟把它重新拉起，与运维意图形成拉锯。
#   故 CloudBeaver 改为按需启动：`docker compose up -d cloudbeaver`（用完 `stop`）。
#   运维若手工 `docker compose stop <服务>`，也应把该服务名加到这里，否则会被自动拉起。
#   （2026-09-17 更正：曾把"部署被阻塞"归因于 CloudBeaver 触发内存守卫，
#     用户实测 available 1913MB 远高于 1200MB 阈值，该归因**已被推翻**；
#     跳过名单的理由改为上面这条"不与运维意图拉锯"，与内存无关。）
SWEEP_SKIP="cloudbeaver"
# 统一用绝对路径：脚本中段会 `cd deploy/lighthouse`，相对路径一旦被挪到 cd 之后就会静默失效
COMPOSE="$REPO_ROOT/deploy/lighthouse/docker-compose.yml"
if [ -f "$COMPOSE" ]; then
  DEFINED=$(sudo docker compose -f "$COMPOSE" config --services 2>/dev/null || true)
  RUNNING=$(sudo docker compose -f "$COMPOSE" ps --services --status running 2>/dev/null || true)
  MISSING=""
  for S in $DEFINED; do
    case "$S" in backend|frontend) continue ;; esac
    case " $SWEEP_SKIP " in *" $S "*) continue ;; esac
    echo "$RUNNING" | grep -qx "$S" || MISSING="$MISSING $S"
  done
  if [ -n "$MISSING" ]; then
    echo "[$(date '+%F %T')] ⚠️ 检测到未运行服务:$MISSING，执行补起（不重建镜像）"
    # 不传 --build：只拉起，绝不触发构建（构建走下方串行流程，防止再次打爆内存）
    sudo docker compose -f "$COMPOSE" up -d $MISSING \
      || echo "[$(date '+%F %T')] ⚠️ 补起失败，下轮自动重试"
  fi
fi

# ── 每日数据库备份（D-455）──
# 本机 launchd（~/fz66666-backups/pull.sh，每天 10:07）会来 rsync 拉 /opt/backups/fz66666-*.sql.gz，
# 但服务器侧此前**没有任何东西产出备份** → 生产库长期零备份（2026-09-17 查清）。
# backup-db.sh 内部自调度（每天 03:00 后首次执行，失败 30 分钟冷却），这里每轮无脑调用即可。
# 必须 || true：备份失败绝不能连带把部署流程打断。
# 同样用绝对路径（理由同上）。
BACKUP_SH="$REPO_ROOT/deploy/lighthouse/backup-db.sh"
[ -f "$BACKUP_SH" ] \
  && { sudo bash "$BACKUP_SH" || echo "[$(date '+%F %T')] ⚠️ 备份脚本返回非零（已忽略，不影响部署）"; }

[ "$LOCAL" = "$REMOTE" ] && exit 0

CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE" || true)

# ── 资源守卫（D-453，2026-09-17 P0 事故教训）──
# 构建极耗内存（Maven ~2G + Vite ~1.5G），而机器上还跑着全栈；可用内存不足时跳过本轮，防整机假死
AVAIL_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
if [ "${AVAIL_MB:-9999}" -lt 1200 ]; then
  echo "[$(date '+%F %T')] ⚠️ 可用内存仅 ${AVAIL_MB}MB < 1200MB，跳过本轮构建（防过载假死），下轮自动重试"
  # 通知节流：每小时最多一次，否则每 2 分钟刷屏
  NSTAMP=/tmp/autodeploy-skip-notify.stamp
  NLAST=$(cat "$NSTAMP" 2>/dev/null || echo 0)
  if [ $(( $(date +%s) - NLAST )) -ge 3600 ]; then
    date +%s > "$NSTAMP" || true
    notify "⚠️ 服装66666 部署被跳过：可用内存仅 ${AVAIL_MB}MB（阈值 1200MB，防整机假死）。
积压变更：${LOCAL} → ${REMOTE}，内存回落后每 2 分钟自动重试。
常见原因：CloudBeaver 等常驻服务吃内存 → cd /opt/fz66666/deploy/lighthouse && sudo docker compose stop cloudbeaver"
  fi
  exit 0
fi

git pull --ff-only origin main -q || exit 0
echo "[$(date '+%F %T')] 检测到更新 $LOCAL..$REMOTE"

cd deploy/lighthouse

# 把刚拉到的 commit 写进 .env，供 compose 构建前端时注入版本水印（登录页"部署版本"）
COMMIT=$(git -C /opt/fz66666 rev-parse --short HEAD)
if grep -q '^GIT_COMMIT=' .env 2>/dev/null; then
  sed -i "s|^GIT_COMMIT=.*|GIT_COMMIT=$COMMIT|" .env || true
else
  echo "GIT_COMMIT=$COMMIT" >> .env || true
fi

SERVICES=""
RESTART_CADDY=0
echo "$CHANGED" | grep -q '^backend/'  && SERVICES="$SERVICES backend"
echo "$CHANGED" | grep -q '^frontend/' && SERVICES="$SERVICES frontend"
echo "$CHANGED" | grep -q '^deploy/lighthouse/Caddyfile$'         && RESTART_CADDY=1
echo "$CHANGED" | grep -q '^deploy/lighthouse/docker-compose.yml$' && RESTART_CADDY=1
# deploy/lighthouse/ 下只有影响运行时配置的文件才需要重建双端；
# 脚本（autodeploy.sh）与文档（README.md）本身改了不需要重建。
# D-455：此前任何 deploy/lighthouse/ 下的改动都会触发 backend+frontend 全量重建（≈7 分钟），
# 在 2核4G 上属高风险操作 —— 改一行 README 也要付这个代价，明显不合理。
if echo "$CHANGED" | grep -qE '^deploy/lighthouse/(\.env\.backend|docker-compose\.yml|Caddyfile)'; then
  SERVICES="$SERVICES backend frontend"
fi

if [ -n "$SERVICES" ]; then
  # ── 串行构建（D-453，2026-09-17 P0）：Maven 与 Vite 并行构建曾把 2核4G 全栈机器打到假死，必须逐个来 ──
  # 顺序固定 backend → frontend：后端构建期间旧容器继续服务，新后端先起来健康了，再动前端
  notify "🚀 服装66666 开始部署 ${LOCAL} → ${REMOTE}（重建：${SERVICES}，可用内存 ${AVAIL_MB}MB）"
  for S in backend frontend; do
    case " $SERVICES " in
      *" $S "*)
        echo "[$(date '+%F %T')] 串行构建 $S ..."
        if ! sudo docker compose up -d --build "$S"; then
          echo "[$(date '+%F %T')] ❌ $S 构建失败，中止本轮（后续轮次重试），旧容器继续服务"
          notify "❌ 服装66666 部署失败：${S} 构建失败，已中止本轮（旧容器继续服务）。
目标版本 ${REMOTE}，下轮 cron 会自动重试。"
          exit 1
        fi
        if [ "$S" = "backend" ]; then
          for i in $(seq 1 30); do
            if sudo docker compose exec -T backend curl -sf http://localhost:8088/actuator/health >/dev/null 2>&1; then
              echo "[$(date '+%F %T')] ✅ backend healthy"; break
            fi
            sleep 10
          done
        fi
        ;;
    esac
  done
  notify "✅ 服装66666 部署完成 ${LOCAL} → ${REMOTE}（${SERVICES}）
登录页底部「部署版本」应显示 ${REMOTE:0:7}"
else
  echo "[$(date '+%F %T')] 变更不涉及 backend/frontend，跳过构建"
fi

if [ "$RESTART_CADDY" = 1 ]; then
  sudo docker compose restart caddy
  echo "[$(date '+%F %T')] caddy 已重启（配置变更）"
fi

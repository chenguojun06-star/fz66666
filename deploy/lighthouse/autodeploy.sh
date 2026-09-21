#!/usr/bin/env bash
# =====================================================================
# 自动拉取部署机器人（D-430）：由 cron 每 2 分钟调用
# 有新代码 → 拉取；backend/ 或 frontend/ 有变动才重建对应容器
# miniprogram/文档类改动只拉代码不重建（省 7 分钟构建）
# =====================================================================
set -e

# ── D-514f：禁用 compose Bake 构建器 ──
# 2026-09-21 实证：compose 新版默认走 Bake，`up -d --build frontend` 会把依赖图里的
# backend 一起构建（Maven 全量 3 分钟+）并因镜像更新连带重建 backend 容器
# ——前端部署变成后端也重启，API 白白中断约 3 分钟。
# COMPOSE_BAKE=false 回到经典构建器：只构建点名的服务，绝不碰依赖。
export COMPOSE_BAKE=false

# ── 部署结果通知（D-456）──
# 必须**最先定义**：后面的单实例锁失败、git fetch 失败都要靠它报出去。
# 背景（2026-09-17 事故）：失败只写服务器本地日志，没人看就等于没有 ——
# 实测脚本因锁文件权限问题在第 8 行原地暴毙、每 2 分钟一次、持续数小时无人察觉。
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

# ── 单实例锁（D-457）──
# 修复历史故障（2026-09-17 实测）：原实现用固定路径 /tmp/autodeploy.lock，
# 该文件一旦被**别的身份**创建（例如手动 `sudo bash autodeploy.sh`），
# 之后的运行就 `exec 9>/tmp/autodeploy.lock` 报 Permission denied，
# 配合 set -e → **脚本在第 8 行原地退出**，cron 每 2 分钟白跑一次，
# 部署彻底停摆且只有一句 bash 错误、毫无可观测性。
# 现在：① 锁名带 uid，不同身份各用各的，不再互相踩；
#       ② 先探测可写性再打开，失败时明确报错并**发通知**。
# ⚠️ 代价：不同身份不再互斥。手动验证请用同一身份跑，才能共享锁：
#     sudo -u ubuntu bash /opt/fz66666/deploy/lighthouse/autodeploy.sh
LOCK="${TMPDIR:-/tmp}/autodeploy.$(id -u).lock"
if ! : >>"$LOCK" 2>/dev/null; then
  echo "[$(date '+%F %T')] ❌ 锁文件不可写：$LOCK（执行身份 $(id -un)）—— 本轮跳过"
  notify "❌ 服装66666 部署机器人无法启动：锁文件 $LOCK 不可写（执行身份 $(id -un)）。
部署已停摆，请检查该文件属主/权限，或删除后等下一轮 cron。"
  exit 1
fi
exec 9>>"$LOCK"
flock -n 9 || exit 0   # 上一次还没跑完就静默退出，防重叠

cd /opt/fz66666
git fetch origin main -q || {
  echo "[$(date '+%F %T')] ❌ git fetch 失败（检查服务器到 GitHub 的凭证）"
  notify "❌ 服装66666 部署机器人 git fetch 失败 —— 服务器拉不到 GitHub，部署已停摆。
排查：cd /opt/fz66666 && git fetch origin main（注意用 cron 同一身份：ubuntu）"
  exit 0
}
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

# ── D-465：确保 swap 存在且够大（2核4G 不升配方案的核心一环）──
# 背景：D-453 事故中构建峰值把 available 打到 335M，靠 swap 才没 OOM kill。
# 4G 物理内存 + 4G swap，等于给构建期多一倍缓冲，成本为零（用的是 SSD 空闲空间）。
# 幂等：已启用且 ≥4G 就什么都不做；创建失败绝不阻断部署（|| true）。
SWAP_FILE=/swapfile
SWAP_TARGET_KB=4194304   # 4G
# D-469：mkswap 会占用少量元数据，4G 文件实际可用约 4194300KB，永远比 4194304 小几 KB。
# 直接与目标值比较会**每轮都误判为不足**，导致每 2 分钟 swapoff→rm→fallocate→mkswap→swapon
# 一次（线上实测），swapoff 会把内容换回内存造成瞬间压力，纯粹自伤。故留 64MB 容差。
SWAP_TOLERANCE_KB=65536
SWAP_MIN_KB=$((SWAP_TARGET_KB - SWAP_TOLERANCE_KB))
CUR_SWAP_KB=$(awk '/^\/swapfile/{print $3}' /proc/swaps 2>/dev/null | head -1)
CUR_SWAP_KB=${CUR_SWAP_KB:-0}
if [ "$CUR_SWAP_KB" -lt "$SWAP_MIN_KB" ] 2>/dev/null; then
  echo "[$(date '+%F %T')] ℹ️ 当前 swapfile ${CUR_SWAP_KB}KB < 目标 ${SWAP_TARGET_KB}KB，尝试扩容"
  # ⚠️ 所有 sudo 都加 </dev/null：cron 下若 sudo 需密码会挂起等待输入，卡死整轮部署
  if [ -f "$SWAP_FILE" ]; then sudo swapoff "$SWAP_FILE" </dev/null >/dev/null 2>&1 || true; sudo rm -f "$SWAP_FILE" || true; fi
  if sudo fallocate -l 4G "$SWAP_FILE" </dev/null >/dev/null 2>&1 \
     && sudo chmod 600 "$SWAP_FILE" </dev/null >/dev/null 2>&1 \
     && sudo mkswap "$SWAP_FILE" </dev/null >/dev/null 2>&1 \
     && sudo swapon "$SWAP_FILE" </dev/null >/dev/null 2>&1; then
    grep -q '^/swapfile' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null 2>&1 || true
    echo "[$(date '+%F %T')] ✅ swap 已扩容到 4G"
  else
    echo "[$(date '+%F %T')] ⚠️ swap 扩容失败（权限不足或磁盘不够），继续部署不影响"
  fi
fi

# ── D-465：停掉已改为「按需」的遗留容器，释放内存 ──
# docker compose 加 profiles 后，up 不会主动停掉**之前已创建**的容器 ——
# 不显式 stop 的话，这次优化等于没生效（内存照旧被占）。
# ⚠️ 必须用 `docker compose stop`，不能 `docker stop cloudbeaver`：
#    compose 生成的容器名是 lighthouse-cloudbeaver-1（带项目前缀和序号），
#    用服务名 docker stop 会报 No such container 而静默失效（2026-09-18 实测踩坑）。
# ⚠️ 必须带 --profile dbtools，否则 compose 解析不到带 profile 的服务。
for S in phpmyadmin cloudbeaver; do
  if sudo docker ps --format '{{.Names}}' </dev/null 2>/dev/null | grep -q "$S"; then
    echo "[$(date '+%F %T')] ℹ️ 停掉按需服务 $S（需查库时：docker compose --profile dbtools up -d $S）"
    sudo docker compose -f /opt/fz66666/deploy/lighthouse/docker-compose.yml \
      --profile dbtools stop "$S" </dev/null >/dev/null 2>&1 || true
  fi
done

# ── 内存快照（D-465）──
# 没有 SSH 的远端机器做容量决策只能靠数据。每轮把 free + 容器占用写进备份目录，
# 本机 launchd 拉备份时顺带拉回（pull.sh 已同步该目录），下次即可按真实数据调参。
SNAP_DIR=/opt/backups
mkdir -p "$SNAP_DIR" 2>/dev/null || true
{
  echo "=== $(date '+%F %T') ==="
  free -m 2>/dev/null | head -2
  sudo docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' 2>/dev/null | sort -k2 -h -r | head -12
} >>"$SNAP_DIR/memory-snapshot.log" 2>/dev/null || true
# 只保留最近 3000 行，防止无限增长
tail -3000 "$SNAP_DIR/memory-snapshot.log" >"$SNAP_DIR/.mem.tmp" 2>/dev/null \
  && mv "$SNAP_DIR/.mem.tmp" "$SNAP_DIR/memory-snapshot.log" 2>/dev/null || true

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
#   故 CloudBeaver 改为按需启动（D-465 起带 profile）：
#   `docker compose --profile dbtools up -d cloudbeaver`（用完 `stop`）。
#   运维若手工 `docker compose stop <服务>`，也应把该服务名加到这里，否则会被自动拉起。
#   （2026-09-17 更正：曾把"部署被阻塞"归因于 CloudBeaver 触发内存守卫，
#     用户实测 available 1913MB 远高于 1200MB 阈值，该归因**已被推翻**；
#     跳过名单的理由改为上面这条"不与运维意图拉锯"，与内存无关。）
# D-465：phpmyadmin 同样只在需要时手动拉起（Caddy 并未路由到它）
SWEEP_SKIP="cloudbeaver phpmyadmin"
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
# D-514d：内存贴地死锁修复——机器常驻占用后 MemAvailable 长期停在 ~1185MB，旧口径"仅看内存"
# 永远差十几 MB → 部署无限跳过（2026-09-21 实证停摆 1 小时+，用户线上一直旧包）。
# 新增 swap 辅助口径：内存不足但 swap 空闲充裕时放行（串行+堆封顶已实证安全，D-453；
# 构建期借 swap 变慢 1-3 分钟可接受，旧容器继续服务不中断）。
# 双兜底：MemAvailable ≥500MB（别太见底）且「内存+swap 空闲」≥3000MB（≥构建峰值 2 倍余量）。
AVAIL_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
SWAP_FREE_MB=$(free -m 2>/dev/null | awk '/^Swap:/{print $4}')
SWAP_FREE_MB=${SWAP_FREE_MB:-0}
if [ "${AVAIL_MB:-9999}" -lt 1200 ]; then
  if [ "${AVAIL_MB:-0}" -ge 500 ] && [ $(( ${AVAIL_MB:-0} + SWAP_FREE_MB )) -ge 3000 ]; then
    echo "[$(date '+%F %T')] ℹ️ 内存 ${AVAIL_MB}MB<1200MB，但 swap 空闲 ${SWAP_FREE_MB}MB 充裕，按 D-514d 允许 swap 辅助构建"
  else
    echo "[$(date '+%F %T')] ⚠️ 可用内存仅 ${AVAIL_MB}MB、swap 空闲 ${SWAP_FREE_MB}MB，双双不足，跳过本轮构建（防过载假死），下轮自动重试"
    # 通知节流：每小时最多一次，否则每 2 分钟刷屏
    NSTAMP=/tmp/autodeploy-skip-notify.stamp
    NLAST=$(cat "$NSTAMP" 2>/dev/null || echo 0)
    if [ $(( $(date +%s) - NLAST )) -ge 3600 ]; then
      date +%s > "$NSTAMP" || true
      notify "⚠️ 服装66666 部署被跳过：可用内存仅 ${AVAIL_MB}MB、swap 空闲 ${SWAP_FREE_MB}MB（内存<1200 且 内存+swap<3000，防整机假死）。
积压变更：${LOCAL} → ${REMOTE}，回落后每 2 分钟自动重试。
常见原因：CloudBeaver 等常驻服务吃内存 → cd /opt/fz66666/deploy/lighthouse && sudo docker compose stop cloudbeaver"
    fi
    exit 0
  fi
fi

# ── 拉取代码（D-458：失败必须可见）──
# 原实现 `git pull --ff-only origin main -q || exit 0` **完全静默** ——
# 2026-09-17 实测：服务器上存在一个手工放置的未跟踪文件 deploy/lighthouse/backup-db.sh，
# 而 main 分支新增了同名文件 → git 拒绝覆盖 → 每次 pull 都 `Aborting`，
# 日志里重复刷了 10+ 次却无人察觉，部署自 21:29 起停摆。
# 现在：捕获并打印原始报错 + 发通知 + 明确给出处置办法。
if ! PULL_ERR=$(git pull --ff-only origin main 2>&1); then
  echo "[$(date '+%F %T')] ❌ git pull 失败："
  echo "$PULL_ERR"
  notify "❌ 服装66666 部署停摆：git pull --ff-only 失败。
最常见原因：**服务器上存在未跟踪的同名文件**（有人手工放上去的），
git 拒绝覆盖 → 每轮 pull 都 Aborting。处置：把冲突文件移走即可恢复。
原始报错：
$PULL_ERR"
  exit 0
fi
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
        # --no-deps：只动本服务，依赖(mysql等)已在跑，绝不连带重启（D-514f）
        if ! sudo docker compose up -d --build --no-deps "$S"; then
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

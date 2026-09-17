#!/usr/bin/env bash
# =====================================================================
# 生产数据库每日备份（D-455）
#
# 用法：sudo bash deploy/lighthouse/backup-db.sh [--force]
#   由 autodeploy.sh 每 2 分钟调用一次（脚本内部自调度，平时立即退出）
#   手动强制跑一次：sudo bash deploy/lighthouse/backup-db.sh --force
#
# 产出：/opt/backups/fz66666-YYYY-MM-DD.sql.gz（保留最近 14 份）
# 消费方：本机 launchd（~/fz66666-backups/pull.sh）每天 10:07 rsync 拉走作异地第二副本
#
# 背景（2026-09-17 查清）：本机侧 pull.sh 与 launchd 任务都已建好，
# 但**服务器侧从来没有任何东西产出备份** → 生产库长期零备份。
# 本脚本补上这一环。
# =====================================================================
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$COMPOSE_DIR/docker-compose.yml"
# 可用 BACKUP_DIR 环境变量覆盖（便于本地验证自调度闸门，不影响生产默认值）
BACKUP_DIR="${BACKUP_DIR:-/opt/backups}"
DB_NAME="fashion_supplychain"
KEEP=14           # 保留份数（与本机 pull.sh 一致）
COOLDOWN=1800     # 失败后重试冷却（秒）—— 防止每 2 分钟反复 mysqldump 打爆 2核4G
START_HOUR=3      # 每天几点之后允许执行（避开白天业务高峰）
MIN_FREE_KB=2097152   # 备份目录至少留 2GB，不足则跳过

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

mkdir -p "$BACKUP_DIR"
TODAY=$(date +%F)
SUCCESS_MARK="$BACKUP_DIR/.last-success"
ATTEMPT_MARK="$BACKUP_DIR/.last-attempt"

# ── 自调度闸门（autodeploy 每 2 分钟调一次，靠这里控制"一天只跑一次"）──
if [ "$FORCE" = 0 ]; then
  # 今天已成功 → 直接退出
  [ "$(cat "$SUCCESS_MARK" 2>/dev/null || true)" = "$TODAY" ] && exit 0
  # 未到允许时间 → 退出
  [ "$(date +%H)" -ge "$START_HOUR" ] || exit 0
  # 冷却期内（上次尝试距今不足 COOLDOWN）→ 退出
  LAST_ATTEMPT=$(cat "$ATTEMPT_MARK" 2>/dev/null || echo 0)
  [ $(( $(date +%s) - LAST_ATTEMPT )) -ge "$COOLDOWN" ] || exit 0
fi

# ── 前置检查 ──
if ! docker compose -f "$COMPOSE" ps -q mysql 2>/dev/null | grep -q .; then
  echo "[$(date '+%F %T')] ⚠️ mysql 容器未运行，跳过备份"
  exit 0
fi

AVAIL_KB=$(df -Pk "$BACKUP_DIR" | awk 'NR==2{print $4}')
if [ "${AVAIL_KB:-0}" -lt "$MIN_FREE_KB" ]; then
  echo "[$(date '+%F %T')] ⚠️ 磁盘可用空间不足 2GB（当前 $(( AVAIL_KB / 1024 ))MB），跳过备份防写满"
  exit 0
fi

date +%s > "$ATTEMPT_MARK"

OUT="$BACKUP_DIR/fz66666-$TODAY.sql.gz"
TMP="$OUT.part"
rm -f "$TMP"

echo "[$(date '+%F %T')] 开始每日数据库备份 → $OUT"

# 密码取自容器内环境变量（不经过宿主命令行，不会出现在 ps 里）
# --single-transaction：InnoDB 一致性快照，不锁表，业务无感
# --routines --triggers：存储过程/触发器一并备份，避免恢复后功能缺失
if docker compose -f "$COMPOSE" exec -T mysql sh -c \
     'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --default-character-set=utf8mb4 '"$DB_NAME" \
     | gzip > "$TMP" \
   && [ -s "$TMP" ] && gzip -t "$TMP"; then
  mv "$TMP" "$OUT"
  echo "$TODAY" > "$SUCCESS_MARK"
  echo "[$(date '+%F %T')] ✅ 备份完成：$(du -h "$OUT" | cut -f1)"
  # 只保留最近 KEEP 份
  ls -t "$BACKUP_DIR"/fz66666-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
  echo "[$(date '+%F %T')] 已保留最近 $KEEP 份，当前 $(ls -1 "$BACKUP_DIR"/fz66666-*.sql.gz 2>/dev/null | wc -l) 份"
else
  rm -f "$TMP"
  echo "[$(date '+%F %T')] ❌ 备份失败（下轮 ${COOLDOWN}s 冷却后自动重试）"
  exit 1
fi

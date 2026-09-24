#!/bin/bash
# ⚠️ 已过时（2026-09-24 标注）：这是**微信云托管时代**的健康速查脚本。
#
# 现状：生产环境 **2026-09-17 已从微信云托管迁到自建腾讯云轻量服务器**
#       （见 deploy/lighthouse/README.md），微信云托管不再部署。
#       本脚本默认指向的云托管地址已不可用。
#
# 仍可复用的一点：它本质是「打 /actuator/health + liveness + readiness」的只读检查，
#       用环境变量覆盖地址仍能用于自建服务器，例如：
#         API_BASE=https://api.webyszl.cn  FE_BASE=https://www.webyszl.cn  ./check-run-health.sh
#       但更推荐直接用 `ssh` 看容器：`docker ps` / `docker logs lighthouse-backend-1`。
#
# 历史：更早的 check-cloud-health.sh 是 ssh 老 VM（106.53.5.62）看 docker 容器的，
#       迁移后失效；本脚本是它的云托管替代品，现在同样失效 —— 又一次印证
#       「部署方式一变，健康检查脚本必须同步改，否则会误导排查方向」。
#
# 用法：在项目根目录执行  ./check-run-health.sh
#       （可用环境变量覆盖地址：API_BASE / FE_BASE）
#
# 能看到什么：
#   1. 后端 /actuator/health + liveness + readiness（K8s 探针用的就是这两个）
#   2. health 为 DEGRADED/DOWN 时，提示怎么打开明细定位到具体组件
#   3. 前端 / h5 是否可达
#   4. 最近 3 次 GitHub Actions 的结果（确认部署有没有真的生效）

set -uo pipefail

API="${API_BASE:-https://api.webyszl.cn}"
FE="${FE_BASE:-https://www.webyszl.cn}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

hr() { echo "────────────────────────────────────────────────"; }
# 从 {"status":"DEGRADED","groups":[...]} 里取 status；兼容 "status": "UP" 带空格的写法
status_of() { sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([A-Za-z]*\)".*/\1/p' <<<"$1" | head -1; }

echo "云托管健康速查   $(date '+%Y-%m-%d %H:%M:%S')"
hr

echo "1. 后端  ${API}"
code=$(curl -s -m 15 -o "$TMP/health.json" -w '%{http_code}' "${API}/actuator/health" || echo "000")
body=$(cat "$TMP/health.json" 2>/dev/null)
st=$(status_of "$body")
echo "   /actuator/health   HTTP ${code}   status=${st:-未知}"
echo "   liveness           $(curl -s -m 15 "${API}/actuator/health/liveness" 2>/dev/null)"
echo "   readiness          $(curl -s -m 15 "${API}/actuator/health/readiness" 2>/dev/null)"

if [ "$st" != "UP" ]; then
  echo ""
  if grep -q '"components"' <<<"$body"; then
    echo "   ▼ 明细："
    if command -v python3 >/dev/null 2>&1; then
      python3 -m json.tool <<<"$body" 2>/dev/null | sed 's/^/     /' || sed 's/^/     /' <<<"$body"
    else
      sed 's/^/     /' <<<"$body"
    fi
  else
    echo "   ⚠️  状态非 UP，但没返回 components（show-details=when-authorized，匿名看不到明细）"
    echo "      定位方法：云托管控制台 → 服务 fashion-backend → 环境变量，加"
    echo "        ACTUATOR_SHOW_DETAILS=always"
    echo "      重启服务后再跑本脚本即可看到 components.ai 下每个组件是 UP / DOWN / UNKNOWN。"
    echo "      看完记得改回 when-authorized（always 会向匿名访问者暴露内部依赖信息）。"
  fi
fi

hr
echo "2. 前端 / h5"
printf "   %-34s %s\n" "${FE}" "$(curl -s -m 15 -o /dev/null -w 'HTTP %{http_code}  %{time_total}s' "${FE}" 2>/dev/null || echo '不可达')"
printf "   %-34s %s\n" "${FE}/h5" "$(curl -s -m 15 -o /dev/null -w 'HTTP %{http_code}  %{time_total}s' "${FE}/h5" 2>/dev/null || echo '不可达')"

hr
echo "3. 最近 3 次 GitHub Actions（确认部署是否真的生效）"
if command -v gh >/dev/null 2>&1; then
  gh run list --limit 3 --json databaseId,conclusion,displayTitle \
    --jq '.[] | "   \(.conclusion)  \(.databaseId)  \(.displayTitle)"' 2>/dev/null \
    || echo "   (gh 取不到，可能未登录：gh auth login)"
else
  echo "   (未安装 gh)"
fi

hr
echo "判读要点："
echo "  · liveness/readiness = UP 就是服务正常，探针不会杀容器"
echo "  · /actuator/health 非 UP 但 liveness UP = 有可选组件降级，不影响主流程"
echo "  · 云托管后台偶发『部署版本失败 Liveness probe failed』但 gh 全绿 = 平台探针误判，"
echo "    以 GitHub Actions 的『部署后冒烟测试（P0门控）』为准"
echo ""

#!/usr/bin/env bash
# =====================================================================
# CI 流水线失败通知（D-828）
#
# 用法（在 .github/workflows/ci.yml 的 notify job 里调）：
#   CI_NOTIFY_WEBHOOK="${{ secrets.NOTIFY_WEBHOOK }}" \
#   bash scripts/notify-ci.sh "消息内容"
#
# 配置：GitHub 仓库 Settings → Secrets and variables → Actions →
#       New repository secret，名 NOTIFY_WEBHOOK，值任选其一：
#   - 企业微信群机器人：https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
#   - Server 酱：      https://sctapi.ftqq.com/SCTxxxx.send
#   - 任意接收 POST JSON {"text":"..."} 的地址
# 可选：CI_NOTIFY_FORMAT=wecom|serverchan|json（默认按 URL 自动嗅探）
#
# 未配置 CI_NOTIFY_WEBHOOK 时静默成功退出（no-op）——本地/未配 secret 不报错。
# **任何情况下都返回 0** —— 通知失败绝不能反过来把 CI 搞红。
#
# 背景（2026-10-21 事故）：D-817 组合收款改了方法签名，4 个测试类没跟上，
# CI 连红 15 个 run、一整天无人处理（红叉只在 GitHub 页面，没人去看）。
# autodeploy 又不看 CI，红提交照常上生产。本脚本把"流水线红"推送到人眼前。
# =====================================================================
set -uo pipefail

MSG="${1:-}"
[ -n "$MSG" ] || exit 0

WEBHOOK="${CI_NOTIFY_WEBHOOK:-}"
[ -n "$WEBHOOK" ] || exit 0

FORMAT="${CI_NOTIFY_FORMAT:-auto}"
if [ "$FORMAT" = "auto" ]; then
  case "$WEBHOOK" in
    *qyapi.weixin.qq.com*) FORMAT=wecom ;;
    *sctapi.ftqq.com*)     FORMAT=serverchan ;;
    *)                     FORMAT=json ;;
  esac
fi

# 截断防超长（企业微信 markdown 上限 4096 字节）
MSG="${MSG:0:3500}"

case "$FORMAT" in
  wecom)
    # 企业微信机器人：markdown 消息
    PAYLOAD=$(CI_NOTIFY_MSG="$MSG" python3 -c '
import json, os
print(json.dumps({"msgtype": "markdown", "markdown": {"content": os.environ["CI_NOTIFY_MSG"]}}))
' 2>/dev/null)
    ;;
  serverchan)
    PAYLOAD=$(CI_NOTIFY_MSG="$MSG" python3 -c '
import json, os
print(json.dumps({"title": "CI 流水线失败", "desp": os.environ["CI_NOTIFY_MSG"]}))
' 2>/dev/null)
    ;;
  *)
    PAYLOAD=$(CI_NOTIFY_MSG="$MSG" python3 -c '
import json, os
print(json.dumps({"text": os.environ["CI_NOTIFY_MSG"]}))
' 2>/dev/null)
    ;;
esac

[ -n "$PAYLOAD" ] || exit 0

curl -sS -m 10 -X POST -H "Content-Type: application/json" -d "$PAYLOAD" "$WEBHOOK" \
  >/dev/null 2>&1 || echo "notify-ci: webhook 发送失败（已忽略，不影响 CI）"

exit 0

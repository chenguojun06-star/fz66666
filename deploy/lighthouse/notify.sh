#!/usr/bin/env bash
# =====================================================================
# 部署结果通知（D-456）
#
# 用法：bash deploy/lighthouse/notify.sh "消息内容"
#
# 配置：在 deploy/lighthouse/.env 里加一行（该文件已 gitignore，密钥不入库）
#   NOTIFY_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx   # 企业微信群机器人
#   NOTIFY_WEBHOOK=https://sctapi.ftqq.com/SCTxxxx.send                      # Server 酱
#   NOTIFY_WEBHOOK=<其它任意接收 JSON {"text":"..."} 的地址>
#
# 未配置 NOTIFY_WEBHOOK 时静默成功退出（no-op）。
# **任何情况下都返回 0** —— 通知失败绝不能影响部署流程。
#
# 背景（2026-09-17 事故）：autodeploy 的失败/跳过只写服务器本地日志，
# 没人看就等于没有。当日实测：启动 CloudBeaver 后内存守卫每轮跳过，
# **部署静默阻塞 20 分钟无人察觉**（站点正常、水印不变，从外部看不出任何异常）。
# =====================================================================
set -uo pipefail

MSG="${1:-}"
[ -n "$MSG" ] || exit 0

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
read_env() {  # $1=键名；从 .env 取值并去掉可能的包裹引号
  local v
  v=$(grep -E "^$1=" "$DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2-)
  v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

WEBHOOK=$(read_env NOTIFY_WEBHOOK)
[ -n "$WEBHOOK" ] || exit 0

# 通知格式：默认按 URL 自动嗅探，可用 NOTIFY_FORMAT 显式覆盖
# （显式覆盖更稳：中转/代理地址不含特征域名时，嗅探会走错分支）
#   wecom=企业微信群机器人 / serverchan=Server酱 / json=通用 POST {"text":"..."}
FORMAT=$(read_env NOTIFY_FORMAT)
if [ -z "$FORMAT" ] || [ "$FORMAT" = "auto" ]; then
  case "$WEBHOOK" in
    *qyapi.weixin.qq.com*) FORMAT=wecom ;;
    *sctapi.ftqq.com*)     FORMAT=serverchan ;;
    *)                     FORMAT=json ;;
  esac
fi
# NOTIFY_DEBUG=1 时把解析结果打到 stderr，便于排查"为什么没发出去"
[ "${NOTIFY_DEBUG:-0}" = "1" ] && echo "[notify] format=$FORMAT url=${WEBHOOK%%\?*}" >&2

# JSON 字符串转义（反斜杠 → 双引号 → 换行），不依赖 python/jq
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '{printf "%s\\n", $0}'
}

ESC=$(json_escape "$MSG")

case "$FORMAT" in
  wecom)
    # 企业微信群机器人
    curl -s -m 10 -H 'Content-Type: application/json' \
      -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"$ESC\"}}" "$WEBHOOK" >/dev/null 2>&1 ;;
  serverchan)
    # Server 酱：表单提交
    curl -s -m 10 --data-urlencode "title=服装66666 部署通知" \
      --data-urlencode "desp=$MSG" "$WEBHOOK" >/dev/null 2>&1 ;;
  *)
    # 通用：POST JSON {"text":"..."}
    curl -s -m 10 -H 'Content-Type: application/json' \
      -d "{\"text\":\"$ESC\"}" "$WEBHOOK" >/dev/null 2>&1 ;;
esac

exit 0

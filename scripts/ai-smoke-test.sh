#!/usr/bin/env bash
# D-762：小云部署后冒烟测试——每次 AI 相关发版后跑一遍，不通过不算部署完成。
# 用法 A（服务器内网直测，推荐）：
#   服务器上铸临时 JWT（uid/tenantId 用真实租户管理员）后：
#   SMOKE_TOKEN=<token> BASE_URL=http://172.18.0.x:8088 /tmp/ai-smoke-test.sh
#   铸币要点：hutool JWT 的 iat/exp 数值必须用【秒】（毫秒会被判失效）；HS256，密钥=容器 env APP_AUTH_JWT_SECRET
# 用法 B（外网+账号密码）：./scripts/ai-smoke-test.sh [BASE_URL] [用户名] [密码]
# 断言口径：回答非空 && 不含已知故障文案（无法给出回答/次数已消耗/超出单次预算/推理不可用）&& 预期关键词。
# 断言口径：回答非空 && 不含已知故障文案 && 指定问题含预期关键词。
set -u

BASE_URL="${1:-https://fz66666.com}"
USER="${2:-lilb}"
PASS="${3:-admin@2026}"
API="$BASE_URL/api"

FAIL_COUNT=0

command -v curl >/dev/null || { echo "需要 curl"; exit 2; }
command -v python3 >/dev/null || { echo "需要 python3"; exit 2; }

jsonget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1" 2>/dev/null; }

# ── 登录拿 token（或外部直接提供 SMOKE_TOKEN 免登录） ────────
if [ -n "${SMOKE_TOKEN:-}" ]; then
  TOKEN="$SMOKE_TOKEN"
  echo "✅ 使用外部提供的 SMOKE_TOKEN"
else
TOKEN=$(curl -sS -m 20 -X POST "$API/system/user/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" \
  | jsonget "d['data']['token'] if isinstance(d.get('data'),dict) and d['data'].get('token') else (d.get('data') if isinstance(d.get('data'),str) else '')")
if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败（$USER@${BASE_URL}）——先核对账号或 BaseURL 再谈冒烟"
  exit 1
fi
echo "✅ 登录成功"
fi

# ── 单题执行：POST chat，输出 source/耗时/答案前 N 字 ──
ask() {
  local label="$1" question="$2" raw="$3" expect_re="$4"
  local start end ms body answer source
  start=$(date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))')
  body=$(curl -sS -m 120 -X POST "$API/intelligence/ai-advisor/chat" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "$(python3 -c "import json,sys;print(json.dumps({'question':sys.argv[1],'rawQuestion':sys.argv[2]}))" "$question" "$raw")")
  end=$(date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))')
  ms=$((end - start))
  answer=$(echo "$body" | jsonget "d['data'].get('displayAnswer') or d['data'].get('answer') or ''")
  source=$(echo "$body" | jsonget "d['data'].get('source','')")
  local status="✅"
  # 故障文案黑名单：任何一条命中即 FAIL
  if [ -z "$answer" ] \
     || echo "$answer" | grep -qE "无法给出回答|次数已消耗|超出单次对话预算|推理服务暂时不可用" \
     || [ "$source" = "error" ]; then
    status="❌"
    FAIL_COUNT=$((FAIL_COUNT+1))
  elif [ -n "$expect_re" ] && ! echo "$answer" | grep -qE "$expect_re"; then
    status="⚠️ 未含预期内容"
    FAIL_COUNT=$((FAIL_COUNT+1))
  fi
  local head_txt
  head_txt=$(echo "$answer" | tr '\n' ' ' | cut -c1-80)
  echo "$status [$label] ${ms}ms source=$source | $head_txt"
}

echo "── 小云冒烟开始 $(date '+%F %T') ──"
# 1) 历史故障回归：曾经「无法给出回答」
ask "你会什么" "你会什么啊" "你会什么啊" ".+"
# 2) 历史故障回归：曾经误报日配额用完
ask "逾期列表" "逾期的是哪几个订单" "逾期的是哪几个订单" "PO|订单|逾期"
# 3) 直查快路径
ask "异常检测" "今天有没有异常" "今天有没有异常" ".+"
# 4) 常规业务问答
ask "库存问答" "现在什么面料库存最少" "现在什么面料库存最少" ".+"
echo "── 冒烟结束：失败 $FAIL_COUNT 题 ──"
exit $([ "$FAIL_COUNT" -eq 0 ] && echo 0 || echo 1)

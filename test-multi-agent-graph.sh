#!/usr/bin/env bash
# test-multi-agent-graph.sh — Hybrid Graph MAS v4.0 API 冒烟测试
# 用法：./test-multi-agent-graph.sh [BASE_URL] [JWT_TOKEN]
#
# 示例（本地）：
#   ./test-multi-agent-graph.sh http://localhost:8088 "Bearer eyJxxxx"
# 示例（云端）：
#   ./test-multi-agent-graph.sh https://backend-xxx.sh.run.tcloudbase.com "Bearer eyJxxxx"

set -euo pipefail

BASE="${1:-http://localhost:8088}"
TOKEN="${2:-Bearer please-set-your-jwt-token}"
URL="$BASE/api/intelligence/multi-agent-graph/run"

echo "========================================"
echo " Graph MAS v4.0 冒烟测试"
echo " 目标：$URL"
echo "========================================"

# ---------- 用例 1：全面分析（无 orderIds）---------- #
echo ""
echo "▶ 用例 1 / 全面分析（scene=full）"
RESP=$(curl -sf -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"scene":"full","question":"当前供应链整体风险如何？"}' \
  --max-time 60)
echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
CODE=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('code','?'))" 2>/dev/null || echo "?")
echo "→ code=$CODE"

# ---------- 用例 2：货期风险（指定订单）---------- #
echo ""
echo "▶ 用例 2 / 货期风险（scene=delivery_risk）"
RESP2=$(curl -sf -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"scene":"delivery_risk","orderIds":[],"question":"哪些订单货期最紧迫？"}' \
  --max-time 60)
echo "$RESP2" | python3 -m json.tool 2>/dev/null || echo "$RESP2"
CODE2=$(echo "$RESP2" | python3 -c "import sys,json;print(json.load(sys.stdin).get('code','?'))" 2>/dev/null || echo "?")
echo "→ code=$CODE2"

# ---------- 用例 3：采购风险 ---------- #
echo ""
echo "▶ 用例 3 / 采购风险（scene=sourcing）"
RESP3=$(curl -sf -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"scene":"sourcing"}' \
  --max-time 60)
CODE3=$(echo "$RESP3" | python3 -c "import sys,json;print(json.load(sys.stdin).get('code','?'))" 2>/dev/null || echo "?")
echo "→ code=$CODE3"

# ---------- 汇总 ---------- #
echo ""
echo "========================================"
if [[ "$CODE" == "200" && "$CODE2" == "200" && "$CODE3" == "200" ]]; then
  echo "✅ 全部通过（3/3）"
else
  echo "⚠️  部分失败：code1=$CODE code2=$CODE2 code3=$CODE3"
  exit 1
fi
echo "========================================"

#!/usr/bin/env bash
# 全系统 API 综合测试脚本 v2
BASE="http://localhost:8088"
PASS=0; FAIL=0; WARN=0
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}OK  $*${NC}"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}FAIL $*${NC}"; FAIL=$((FAIL+1)); }
warn() { echo -e "  ${YELLOW}WARN $*${NC}"; WARN=$((WARN+1)); }
section(){ echo -e "\n${BLUE}=== $* ===${NC}"; }
get() { curl -s -X GET "$BASE$1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json"; }
post_body() { curl -s -X POST "$BASE$1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2"; }
rcode() { echo "$1" | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('code','?'))
except: print('ERR')" 2>/dev/null; }
rtotal() { echo "$1" | python3 -c "import sys,json
try:
  d=json.load(sys.stdin); r=d.get('data',{})
  if isinstance(r,di#!/usr/bin/env bash
# 全系统 API 综合测试脚本 v2
BASE="http://localhost:8088"
PASS=0; FAIL=0n(# 全系统 API ??BASE="http://localhost:8088"
PASS=0;}
PASS=0; FAIL=0; WARN=0
GREEspGREEN='\033[0;32m'; R$2ok()   { echo -e "  ${GREEN}OK  $*${NC}"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}F.sfail() { echo -e "  ${RED}FAIL $*${NC}"; FAIL=$((FAIL+1))})
  warn() { echo -e "  ${YELLOW}WARN $*${NC}"; WARN=$((WARN+1)))section isinstance(r,list): recs=r
  else: recs=[]
  if not recsget() { curl -s -X GET "$BASE$1" -H "Authorizat ipost_body() { curl -s -X POST "$BASE$1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/exrcode() { echo "$1" | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('code','?'))
except: print('ERR')eltry: print(json.load(sys.stdin).get('code','?'))n%except: print('ERR')" 2>/dev/null; }
rtotal() {"$rtotal() { echo "$1" | python3 -c " Otry:
  d=json.load(sys.stdin); r=d.get('datarn  "    dy   if isinstance(r,di#!/usr/bin/env bash
# ?"# 全系统 API 综合测试脣?查" ;;
BASE="http://localhost:8088"
PASS=0;saPASS=0; FAIL=0n(# 全系统$rPASS=0;}
PASS=0; FAIL=0; WARN=0
GREEspGREEN='\033[0;32m'; R$2ok??PASS=0;??GREEspGREEN='\033[0;3?ail() { echo -e "  ${RED}F.sfail() { echo -e "  ${RED}FAIL $*${NC}"; FAIL=$((FAIL+1))})
rl  warn() { echo -e "  ${YELLOW}WARN $*${NC}"; WARN=$((WARN+1)))section isinstance(r,lisd   else: recs=[]
  if not recsget() { curl -s -X GET "$BASE$1" -H "Authorizat ipost_body() { curl(e  if not recsg ptry: print(json.load(sys.stdin).get('code','?'))
except: print('ERR')eltry: print(json.load(sys.stdin).get('code','?'))n%except: print('ERR')" 2>/dev/null; }
rtotal() {"$rtotal() { echo "$1" | python3 -c " Otry:
  d=??xcept: print('ERR')eltry: print(json.load(sys.?total() {"$rtotal() { echo "$1" | python3 -c " Otry:
  d=json.load(sys.stdin); r=d.get('datarn  "    dy   /r  d=json.load(sys.stdin); r=d.get('datarn  "    dy  [ # ?"# 全系统 API 综合测试脣?查" ;;
BASE="http://localhost:8088 print(json.load(syBASE="http://localhost:8088"
PASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FAIL=0; WARN=0
GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -e "  ${YELLOW}WARN $*${NC}"; WARN=$((WARN+1)))section isinstance(r,lisd   else: recs=[]
  if not recsget() { curl -s -X GET "$BASE$1"io  if not recsget() { curl -s -X GET "$BASE$1" -H "Authorizat ipost_body() { curl(e  if not recsg ptry: prrtexcept: print('ERR')eltry: print(json.load(sys.stdin).get('code','?'))n%except: print('ERR')" 2>/dev/null; }
rtotal() {"$rtotal() { echo "$1" | p3.rtotal() {"$rtotal() { echo "$1" | python3 -c " Otry:
  d=??xcept: print('ERR')eltry: print(json.load(sys.? d=??xcept: print('ERR')eltry: print(json.load(sysct  d=json.load(sys.stdin); r=d.get('datarn  "    dy   /r  d=json.load(sys.stdin); r=d.get('datarn  "    dy  "$BASE="http://localhost:8088 print(json.load(syBASE="http://localhost:8088"
PASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FAIL=0; WARN=0
GREEspGRE 4PASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FAIL=0; WARN=0
GREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GREEspGREEN='\033[0;3?/o  if not recsget() { curl -s -X GET "$BASE$1"io  if not recsget() { curl -s -X GET "$BASE$1" -H "Authorizat ipost_body() { curl(rdrtotal() {"$rtotal() { echo "$1" | p3.rtotal() {"$rtotal() { echo "$1" | python3 -c " Otry:
  d=??xcept: print('ERR')eltry: print(json.load(sys.? d=??xcept: print('ERR')eltry: print(json.load(sysct  d=json.load(sys.stdin); r=d.get('datarn  "    dy   /r  d=jk   d=??xcept: print('ERR')eltry: print(json.load(sys.? d=??xcept: print('ERR')eltry: pricPASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FAIL=0; WARN=0
GREEspGRE 4PASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FAIL=0; WARN=0
GREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GREEspGREEN='\033[0;3?/o  if not recsget() { curl -s -X GET "$BASE$1"??REEspGRE 4PASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FageGREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GR(rtotal "$RESP") 条"
  print_fie  d=??xcept: print('ERR')eltry: print(json.load(sys.? d=??xcept: print('ERR')eltry: print(json.load(sysct  d=json.load(sys.stdin); r=d.get('datarn  "    dy   /r  d=jk   d=??xcept: print('ERR')eltry: print(json.load(sys.? d=??xcept: print('ERR')eltry: pricPASS=0;saPASS=??PASS=0;satoGREEspGRE 4PASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FAIL=0; WARN=0
GREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GREEspGREEN='\033[0;3?/o  if not recsget() { curl -s -X GET "$BASE$1"??REEspGRE 4PASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FageGREEs??GREEspGREEN='\033[0;32"
GREEs??GREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { echo -D=GR(rtotal "$RESP") 条"
  print_fie  d=??xcept: print('ERR')eltry: print(json.load(sys.? d=??xcept: print('ERR')eltry: print(json.load(sysct  d=json.load(sys.stdin)?? print_fie  d=??xcept: print('ERR')eltry: print(json.load(sys.??GREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GREEspGREEN='\033[0;3?/o  if not recsget() { curl -s -X GET "$BASE$1"??REEspGRE 4PASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FageGREEs??GREEspGREEN='\033[0;32"
GREEs??GREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\03REGREEspGREEN='\033[0;3??l  wastGREEs??GREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { echo -D=GR(rtotal "$RESP") 条"
  print_fie  d=??xcept: prodGREEspGREEN='\033[0;3??l  warn() { ? print_fie  d=??xcept: print('ERR')eltry: print(json.load(sys.? d=??xcept: print('ERR')eltry: print(json.load(sysct  d=json.load(sys.stdin)?. GREEspGREEN='\033[0;3??l  warn() { echo -D=GREEspGREEN='\033[0;3?/o  if not recsget() { curl -s -X GET "$BASE$1"??REEspGRE 4PASS=0;saPASS=??PASS=0;saPASS=0; FAIL=0n(# ?ASS=0; FageGREEs??GREEspGREEN='\033[0;32"
GREEs??GREEsount,status,settleDGREEs??GREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\03REGREEspGREEN='\033[0;3??l  wastGREEs??GREEs??GREEspGREEN='\033[0;32"
GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { echo -D=GR(rtotal "$RESP") 条"
  ═════? print_fie  d=??xcept: prodGREEspGREEN='\033[0;3??l  warn() { ? print_fie  d=??xcept: print('ERR')eltry: print(json.load(sys.? d=??xceptpeGREEs??GREEsount,status,settleDGREEs??GREEs??GREEspGREEN='\033[0;32"
GREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\03REGREEspGREEN='\033[0;3??l  wastGREEs??GREEs??GREEspGREEN='\033[0;32"
GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { echo -D=GR(rtotal "$RESP") ?EGREEspGREEN='\033[0;3[ "$C" = "403" ]; then fail "用户管理 403 ?REEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { e$(  ═════? print_fie  d=??xcept: prodGREEspGREEN='\033[0;3??l  warn() { ? print_fie  d=??xcept: print('ERR')eltry: print(json.load(sys.? d=??xceptpeGREEs??GREEsount,status,set?REEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\03REGREEspGREEN='\033[0;3??l  wastGREEs??GREEs??GREEspGREEN='\033[0;32"
GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { e
tGREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { e
tGREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { e
tGREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { e
tGREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REgetGREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() {litGREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  warn() { }:tGREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  warn() { echo -D=GRagGREEspGREEN='\033[0;3??l  waP"GREEspGREEN='\033[0;3??l  war??段[{ptGREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REgetGREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[03 GREEspGR?REEspGREEN='\033[0;3??l  warn() { riGREEspGREEN='\033[0;3??l  war?═════════════════════════════
echo ""
echo -e "${BLUE}════════════════════════════════${NC}"
echo -e "${BLUE}  测试汇总${NC}"
echo -e "${BLUE}════════════════════════════════${NC}"
echo -e "  总计: $((PASS+FAIL+WARN)) 项"
echo -e "  ${GREEN}通过: $PASS ✅${NC}"
echo -e "  ${RED}失败: $FAIL ❌${NC}"
echo -e "  ${YELLOW}警告: $WARN ⚠️${NC}"
if [ $FAIL -eq 0 ]; then
  echo -e "\n  ${GREEN}所有核心接口验证通过！${NC}"
else
  echo -e "\n  ${RED}有 $FAIL 项失败，请检查！${NC}"
fi

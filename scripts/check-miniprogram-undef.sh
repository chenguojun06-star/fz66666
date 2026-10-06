#!/usr/bin/env bash
# 小程序「未定义变量 / 无效 this」静态扫描门禁（D-723）
#
# 背景：i18n 四语言批次留下两类"加载不报、走到才炸"的手误——
#   ① 裸引用未定义变量（lang/language 各 45/3 处，登录即炸、浮标失控）
#   ② wx/API 回调里写 this._lang（this 不指向页面实例，229 处，触发即 ReferenceError）
# 这类错误 CI 不编译小程序、回归脚本只加载不执行，均拦不住。
# 本脚本用 eslint no-undef + TS AST invalid-this 精确扫描，发现即阻断推送。
#
# 用法：bash scripts/check-miniprogram-undef.sh [miniprogram目录，默认 ./miniprogram]
set -u
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MINI_DIR="${1:-$ROOT_DIR/miniprogram}"
ESLINT="$MINI_DIR/node_modules/.bin/eslint"
FAIL=0

if [[ ! -x "$ESLINT" ]]; then
  echo "[mp-undef] ⚠️ 未找到 ${ESLINT}，跳过扫描"
  exit 0
fi

# ── ① no-undef：裸引用未定义变量 ──
# 排除三类非小程序运行时代码（2026-10-03 实测误报）：
#   test/**          —— Node 测试脚本（global 是合法全局）
#   assets/audio/gen-sounds.js —— Node 生成脚本（Buffer/__dirname 合法）
#   weapp-qrcode.js  —— vendor UMD 库（define/uni 由加载器注入），不应改动源码
echo "[mp-undef] 🔍 no-undef 扫描（未定义变量）"
UNDEF_OUT=$(cd "$MINI_DIR" && "$ESLINT" --no-eslintrc \
  --env browser,es2022 \
  --parser-options=ecmaVersion:2022 \
  --global wx,getApp,getCurrentPages,Page,Component,App,Behavior,require,module,exports,setTimeout,clearTimeout,setInterval,clearInterval,console,Promise,JSON,Math,Date,Object,Array,String,Number,Boolean,RegExp,Error,parseInt,parseFloat,isNaN,encodeURIComponent,decodeURIComponent,Infinity,NaN,undefined,globalThis \
  --rule '{"no-undef":"error"}' \
  $(find . -name "*.js" -not -path "./node_modules/*" -not -path "./miniprogram_npm/*" \
      -not -path "./test/*" -not -path "./assets/audio/gen-sounds.js" -not -name "weapp-qrcode.js") 2>&1 || true)
UNDEF_HITS=$(echo "$UNDEF_OUT" | grep -c "is not defined" || true)
if [[ "$UNDEF_HITS" -gt 0 ]]; then
  echo "$UNDEF_OUT" | grep -B4 "is not defined" | head -40
  echo "❌ no-undef：发现 $UNDEF_HITS 处未定义变量引用，推送已阻止"
  FAIL=1
else
  echo "[mp-undef] ✅ 未定义变量 0 处"
fi

# ── ② 无效 this 作用域内的 _lang（i18n 批次签名模式）──
echo "[mp-undef] 🔍 invalid-this 扫描（回调内 this._lang）"
THIS_OUT=$(node "$ROOT_DIR/scripts/check-mp-invalid-this.js" "$MINI_DIR" 2>&1 || true)
LANG_HITS=$(echo "$THIS_OUT" | grep -c "_lang" || true)
if [[ "$LANG_HITS" -gt 0 ]]; then
  echo "$THIS_OUT" | grep "_lang" | head -20
  echo "❌ invalid-this：回调内 this._lang 共 $LANG_HITS 处（应改 i18n.getLanguage() 或捕 that/self），推送已阻止"
  FAIL=1
else
  echo "[mp-undef] ✅ 回调内 this._lang 0 处"
fi

# ── ③ wxml 循环变量遮蔽 data 键（D-729）──
# 背景：D-623 把待办按钮写成 <button>{{t.btnView}}</button>，而卡片循环变量也叫 t
# （wx:for-item="t"）——WXML 里循环变量遮蔽组件 data 的同名键，取到待办对象的
# btnView（不存在）→ 按钮文字渲染成空。编译通过、真机不报错，8 道门禁全部放行。
echo "[mp-undef] 🔍 wxml 循环变量遮蔽扫描（wx:for-item 与 data 键同名）"
SHADOW_OUT=$(node "$ROOT_DIR/scripts/check-mp-wxml-shadow.js" "$MINI_DIR" 2>&1)
SHADOW_CODE=$?
echo "$SHADOW_OUT"
if [[ $SHADOW_CODE -ne 0 ]]; then
  echo "❌ wxml-shadow：循环变量遮蔽 data 键，推送已阻止"
  FAIL=1
fi

if [[ $FAIL -ne 0 ]]; then
  echo ""
  echo "⚠️  小程序不走 CI 编译 —— 这类错误会直到开发者工具/真机运行阶段才暴露。"
  exit 1
fi
echo "[mp-undef] ✅ 全部通过"
exit 0

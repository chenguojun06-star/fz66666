#!/usr/bin/env python3
"""禁止「React.lazy 二次包裹」门禁（D-885）

==========================================================
背景：2026-10-25/26 全站 P0 白屏事故
----------------------------------------------------------
现象：线上所有业务页面崩溃，控制台 `Minified React error #306`，
      路由错误边界文案逐字对应 pageName（"首页 page error"…）。

根因（已实锤）：
  · `frontend/src/modules/*/index.tsx` 这 10 个 barrel **早已**把每个页面包成
    `export const X = React.lazy(() => import('./pages/X'))`；
  · D-875 误判「81 个页面是同步导入」，在 App.tsx 又套一层：
    `lazyPage(() => import('./modules/basic'), 'MaintenanceCenter')`
    → **lazy 套 lazy** → React 解析出的是 lazy 对象（`[object Object]`）
    → React #306 → 全站白屏，持续约 33 小时。

本门禁拦两类写法：
  A) `React.lazy(() => import('...').then(m => ({ default: m.X })))`
     —— 从模块取「具名导出」当 default。具名导出在 barrel 里可能就是 lazy
        组件，二次包裹必崩；即使不是，也应改用默认导出。
  B) 自定义 lazy 包装器（lazyPage / lazyWith / lazyImport 等）从 barrel
     取具名属性 —— 同上。

注意：`tsc --noEmit` 全绿也拦不住（本次 tsc 通过但运行时全站崩），
所以这是必须有的**静态门禁**，不能靠类型检查兜底。

用法：python3 scripts/check-lazy-wrapper.py
退出码：0=通过；1=发现危险写法（CI 会红）
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend" / "src"

# A) React.lazy(...).then(...) 里取具名属性
#    匹配形如：React.lazy(() => import('./x').then((m) => ({ default: m.Name })))
LAZY_THEN_NAMED = re.compile(
    r"React\.lazy\s*\([^;]{0,400}?\.then\s*\([^)]*?\{\s*default\s*:\s*"
    r"(?:\(\s*\w+\s+as\s+\w+\s*\)|\(\s*\w+\s*\)|\w+)\s*"
    r"(?:\[\s*['\"][\w-]+['\"]\s*\]|\.\w+)"
    r"\s*\}",
    re.S,
)

# B) 自定义 lazy 包装器：lazyPage/lazyWith/lazyImport/lazyRoute 等
CUSTOM_LAZY_FN = re.compile(
    r"(?:const|function)\s+(lazy\w*)\s*(?:=\s*)?\(", re.I
)
# 包装器内部从 import 结果取具名属性
CUSTOM_LAZY_NAMED = re.compile(
    r"lazy\w*\s*\([^;]{0,300}?import\s*\([^)]*\)\s*[^;]{0,200}?"
    r"\.then\s*\([^)]*?\{\s*default\s*:\s*"
    r"(?:\(\s*\w+\s+as\s+\w+\s*\)|\(\s*\w+\s*\)|\w+)\s*"
    r"(?:\[\s*['\"][\w-]+['\"]\s*\]|\.\w+)\s*\}",
    re.S,
)
# 包装器以「取名参数」方式从 barrel 取组件：lazyPage(() => import('./modules/x'), 'Name')
CUSTOM_LAZY_BARREL = re.compile(
    r"lazy\w*\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['\"][^'\"]*modules/[\w/]+['\"]\s*\)"
    r"\s*,\s*['\"][\w-]+['\"]\s*\)",
    re.S,
)

SCAN_SUFFIX = (".ts", ".tsx")


def iter_files():
    for p in FRONTEND.rglob("*"):
        if p.suffix in SCAN_SUFFIX and "node_modules" not in p.parts:
            yield p


def main():
    hits = []
    for path in iter_files():
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        rel = path.relative_to(ROOT)
        for pattern, kind in (
            (LAZY_THEN_NAMED, "A: React.lazy(...).then(取具名属性)"),
            (CUSTOM_LAZY_NAMED, "B: 自定义 lazy 包装器从 import 结果取具名属性"),
            (CUSTOM_LAZY_BARREL, "B: 自定义 lazy 包装器从 barrel 按名取组件"),
        ):
            for m in pattern.finditer(text):
                line_no = text[:m.start()].count("\n") + 1
                snippet = " ".join(m.group(0).split())[:120]
                hits.append((str(rel), line_no, kind, snippet))

    if not hits:
        print("✅ 未发现「React.lazy 二次包裹」危险写法")
        return 0

    print("=" * 78)
    print("❌ 发现 React.lazy 二次包裹风险（D-885 门禁）")
    print("=" * 78)
    print("2026-10-25/26 全站白屏事故根因：barrel 已把页面包成 React.lazy，")
    print("再用 React.lazy 取具名导出 → lazy 套 lazy → React #306 → 全站崩（约 33 小时）。")
    print("tsc --noEmit 拦不住，必须静态拦截。\n")
    for rel, ln, kind, snippet in hits:
        print(f"  {rel}:{ln}")
        print(f"      [{kind}]")
        print(f"      {snippet}")
    print("\n修法：")
    print("  · 页面组件懒加载要放在 barrel（modules/*/index.tsx）里，App.tsx 直接按名导入即可；")
    print("  · 若确需在 App.tsx 懒加载，必须用默认导出：React.lazy(() => import('./pages/X'))；")
    print("  · 绝不要 React.lazy(() => import('./modules/x').then(m => ({ default: m.Name })))。")
    return 1


if __name__ == "__main__":
    sys.exit(main())

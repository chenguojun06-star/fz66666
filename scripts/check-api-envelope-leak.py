#!/usr/bin/env python3
"""
守护：service 层不得把 {code, data} 信封直接 return 给调用方。

背景（真实事故，不是假想）
--------------------------
`api.get` 的响应拦截器 `return response.data`，也就是返回 **信封** `{code, data, message}`。
本项目长期有两种约定并存：

- 一部分 service 直接 `return api.get(...)`，把信封原样丢给调用方；
- 一部分 service 自己解包后返回裸数据（ticketApi / posApi）。

两种并存本身就是隐患。2026-10-18 收银台整页白屏就是这个坑的成品：
三个新面板（挂单 / 退货 / 交接班）都把返回值直接塞给 antd Table，
信封是对象不是数组 → `dataSource.some is not a function` → 整页崩。
更严重的是 `resumeHold` 因此拿不到 lines，**取回挂单会把空购物车交给收银台**。

而且单测还是绿的 —— 因为测试 `vi.mock` 整个 service 模块，
mock 返回的是已解包数组。**mock 什么形状本身就是测试的一部分**。

本脚本的作用
------------
不是要求一次性改完历史（149 处，改完也不能逐页验证），
而是**让欠账不再增长**：新增/修改 service 时再泄漏就直接阻断。

配套的两道防线
--------------
1. `unwrapApiData` 已改成**幂等**：入参不是信封时原样返回。
   这样 service 层解包之后，调用方残留的那层解包自动变成空操作，
   历史代码可以分批迁移，不必一次改完。
2. 本脚本拦住新的泄漏。

用法
----
    python3 scripts/check-api-envelope-leak.py            # 只报新增（对比 baseline）
    python3 scripts/check-api-envelope-leak.py --all      # 打印全部存量
    python3 scripts/check-api-envelope-leak.py --update   # 重新记录 baseline

baseline
--------
历史存量记录在 `scripts/baseline/api-envelope-leak.json`（键为 `文件:行`）。
新增泄漏会被拦截；修掉一处就删掉对应键，然后 `--update` 收敛。

**baseline 只能变小不能变大** —— 否则把脚本跑一次 `--update` 就等于
把刚引入的问题也登记成"历史存量"，门控当场失效。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVICES = ROOT / "frontend" / "src" / "services"
BASELINE = Path(__file__).resolve().parent / "baseline" / "api-envelope-leak.json"

# 形如 api.get<{ code: number; data: T }>(...) —— 泛型里显式声明了信封，
# 说明这个方法的返回值**就是信封**，调用方必须自己解包（极易漏）。
ENVELOPE_TYPED = re.compile(r"api\.(?:get|post)<\s*\{[^{}]*?\bcode\b\s*:[^{}]*?\bdata\b\s*:")

# 形如 name: (...) => api.get<T>(...) —— 把 api 结果直接 return，同样是泄漏信封。
DIRECT_RETURN = re.compile(r"=>\s*api\.(?:get|post)<")


def iter_service_files() -> list[Path]:
    return sorted(SERVICES.rglob("*.ts"))


def load_baseline() -> set[str]:
    if not BASELINE.exists():
        return set()
    try:
        return set(json.loads(BASELINE.read_text(encoding="utf-8")))
    except Exception:
        return set()


def save_baseline(keys: set[str]) -> None:
    BASELINE.parent.mkdir(parents=True, exist_ok=True)
    BASELINE.write_text(
        json.dumps(sorted(keys), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="打印全部存量，不做新增比对")
    ap.add_argument("--update", action="store_true", help="重新记录 baseline")
    args = ap.parse_args()

    if not SERVICES.exists():
        print(f"❌ 找不到目录：{SERVICES}")
        return 1

    hits: dict[str, str] = {}
    for f in iter_service_files():
        text = f.read_text(encoding="utf-8", errors="replace")
        for lineno, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            if stripped.startswith(("*", "//", "/*")):
                continue
            if "unwrapApiData" in line:
                continue
            kind = None
            if ENVELOPE_TYPED.search(line):
                kind = "泛型声明返回信封"
            elif DIRECT_RETURN.search(line):
                kind = "直接 return api 结果（信封外泄）"
            if kind:
                rel = str(f.relative_to(ROOT))
                hits[f"{rel}:{lineno}"] = f"[{kind}] {stripped[:100]}"

    current = set(hits)

    if args.update:
        save_baseline(current)
        print(f"✅ baseline 已更新：{len(current)} 处存量")
        return 0

    baseline = load_baseline()
    new_keys = current - baseline
    removed = baseline - current

    if args.all:
        print(f"共 {len(current)} 处 service 层信封泄漏：\n")
        for k in sorted(current):
            print(f"  {k}  {hits[k]}")
        return 0

    if new_keys:
        print(f"❌ 新增 {len(new_keys)} 处 service 层信封泄漏：\n")
        for k in sorted(new_keys):
            print(f"  {k}  {hits[k]}")
        print("\n怎么改：")
        print("  import api, { unwrapApiData } from '@/utils/api';")
        print("  list: async () => unwrapApiData<Row[]>(await api.get('/x'), '加载失败'),")
        print("\n为什么不拦：api.get 返回 {code,data} 信封，调用方忘了解包就会")
        print("把信封当数组塞给 antd Table —— 收银台整页白屏，线上实测。")
        return 1

    print(f"✅ 未新增 service 层信封泄漏（存量 {len(baseline & current)} 处待清理）。")
    if removed:
        print(f"   提示：本次修复了 {len(removed)} 处，记得跑 --update 收敛 baseline。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

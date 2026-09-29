#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""前端代码质量基线门禁（ratchet 策略）

与 backend/arch-baseline.properties 同一思路：把存量问题冻结进基线，
**只许减少不许增加**。每清理一处就调低基线一格，保证质量单调收敛，
不追求"一次性改完"（1769 行 any 那样的存量，硬改只会引入更多风险）。

检查项（纯文本扫描，不跑 eslint / tsc，全仓约 1-2 秒）：
  any-lines       含 `: any` 或 `as any` 的行数（TypeScript 类型安全）
  eslint-disable  eslint-disable 指令数（规范豁免）
  console-log     console.log 调用数（应走统一 logger）

⚠️ 口径说明 —— 为什么用「行数」而不是「出现次数」：
   行数口径稳定、可复现，且与历史统计一致（一行里出现 3 个 any 仍记 1 行）。
   改成"出现次数"会让基线失去可比性（同一份代码两种口径差近一倍）。

用法：
  python3 scripts/check-frontend-quality.py            # 校验，超基线则退出码 1
  python3 scripts/check-frontend-quality.py --update   # 仅在指标下降时下调基线
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "frontend", "src")
BASELINE = os.path.join(ROOT, "frontend", "code-quality-baseline.json")

ANY_COLON = re.compile(r":\s*any\b")
ANY_AS = re.compile(r"\bas\s+any\b")
ESLINT_DISABLE = re.compile(r"eslint-disable")
CONSOLE_LOG = re.compile(r"console\.log")

METRICS = ("any-lines", "eslint-disable", "console-log")

GREEN, RED, YELLOW, BLUE, NC = "\033[32m", "\033[31m", "\033[33m", "\033[34m", "\033[0m"


def scan():
    """扫描 frontend/src 下的 .ts/.tsx，返回各指标的行数。"""
    counts = {m: 0 for m in METRICS}
    if not os.path.isdir(SRC):
        print(f"{RED}[FAIL]{NC} 源码目录不存在: {SRC}")
        sys.exit(1)

    for dirpath, dirnames, filenames in os.walk(SRC):
        # 就地裁剪，避免进入依赖目录
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", "dist", "build")]
        for name in filenames:
            if not name.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, encoding="utf-8", errors="ignore") as fh:
                    for line in fh:
                        if ANY_COLON.search(line) or ANY_AS.search(line):
                            counts["any-lines"] += 1
                        if ESLINT_DISABLE.search(line):
                            counts["eslint-disable"] += 1
                        if CONSOLE_LOG.search(line):
                            counts["console-log"] += 1
            except OSError as exc:
                print(f"{YELLOW}[WARN]{NC} 读取失败，跳过: {path} ({exc})")
    return counts


def load_baseline():
    """读取基线；不存在返回 None（首次运行：只记录，不失败）。"""
    if not os.path.exists(BASELINE):
        return None
    try:
        with open(BASELINE, encoding="utf-8") as fh:
            data = json.load(fh)
        return {m: int(data[m]) for m in METRICS if m in data}
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"{YELLOW}[WARN]{NC} 基线解析失败，按「无基线」处理: {exc}")
        return None


def write_baseline(counts):
    payload = {
        "_comment": (
            "前端代码质量冻结基线（ratchet）。指标只许减少不许增加。"
            "由 scripts/check-frontend-quality.py 维护，每清理一处即调低对应值。"
            "口径为「行数」：含 : any 或 as any 的行数 / eslint-disable 指令数 / console.log 调用数。"
        ),
        "_updated": "D-631",
        **counts,
    }
    with open(BASELINE, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def main():
    update = "--update" in sys.argv
    counts = scan()
    baseline = load_baseline()

    print(f"{BLUE}━━━ 前端代码质量基线 ━━━{NC}")
    for m in METRICS:
        print(f"  {m:16s} 实测 {counts[m]}")

    if baseline is None:
        print(f"\n{YELLOW}[首次记录]{NC} 基线文件不存在，写入当前值（本次不失败）")
        print(f"  → {os.path.relpath(BASELINE, ROOT)}")
        write_baseline(counts)
        return 0

    regressions = []
    improvements = []
    for m in METRICS:
        base = baseline.get(m)
        if base is None:
            continue
        if counts[m] > base:
            regressions.append((m, base, counts[m]))
        elif counts[m] < base:
            improvements.append((m, base, counts[m]))

    if regressions:
        print(f"\n{RED}[FAIL]{NC} 以下指标劣化（只许减少不许增加）：")
        for m, base, actual in regressions:
            print(f"  {m}: 基线 {base} → 实测 {actual}（+{actual - base}）")
        print(f"\n  → 请消除新增项；若确为合理新增，需在评审中说明后再调高 {os.path.relpath(BASELINE, ROOT)}")
        return 1

    if improvements:
        if update:
            merged = dict(baseline)
            for m, _, actual in improvements:
                merged[m] = actual
            write_baseline(merged)
            print(f"\n{GREEN}[PASS]{NC} 已收敛并下调基线：")
            for m, base, actual in improvements:
                print(f"  {m}: {base} → {actual}")
        else:
            print(f"\n{GREEN}[PASS]{NC} 未劣化。以下指标已收敛，可运行 --update 下调基线：")
            for m, base, actual in improvements:
                print(f"  {m}: {base} → {actual}")
        return 0

    print(f"\n{GREEN}[PASS]{NC} 所有指标与基线持平，无劣化")
    return 0


if __name__ == "__main__":
    sys.exit(main())

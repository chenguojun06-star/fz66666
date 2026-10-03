#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""前端循环依赖门禁（ratchet 策略）

与 scripts/check-frontend-quality.py 同一思路：把存量问题冻结进基线，
**只许减少不许增加**。2026-10-01 D-673 已把全仓循环依赖清零
（madge 实测 1941 个文件、0 环），本脚本把这个成果锁死，防止架构回退
—— 一个反向 `import type` 就能重新成环，必须靠门禁拦截。

⚠️ 为什么独立成脚本而不是并入 check-frontend-quality.py：
  quality 脚本是纯文本扫描（全仓 1-2 秒），而本脚本要跑 madge 构建
  全量模块依赖图（约 60 秒，依赖 node_modules）—— 不能让 quality 的
  无条件全跑背上这 1 分钟。故由 pre-push 仅在前端 .ts/.tsx 变更时触发，
  并对 madge 加超时保护，避免外接卷 IO 抖动时挂死 push。

判定口径（与 D-673 手工验证一致）：
  - 有环：stdout 尾部 `✖ Found N circular dependencies!`，madge 退出码 1
  - 无环：`✔ No circular dependency found!`，madge 退出码 0

用法：
  python3 scripts/check-frontend-circular.py            # 校验，超基线则退出码 1
  python3 scripts/check-frontend-circular.py --update   # 仅在下降时下调基线
"""

import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(ROOT, "frontend")
MADGE = os.path.join(FRONTEND, "node_modules", ".bin", "madge")
BASELINE = os.path.join(FRONTEND, "circular-baseline.json")
# D-741：项目长大后 madge 实测 ~316s（1948 个文件），300s 门禁已必超时。
# 调到 900s（实测的 ~3 倍余量），后续若再逼近请考虑给 madge 换 TS 解析策略而不是继续加时间。
TIMEOUT_SECONDS = 900

GREEN, RED, YELLOW, BLUE, NC = "\033[32m", "\033[31m", "\033[33m", "\033[34m", "\033[0m"

FOUND_RE = re.compile(r"Found (\d+) circular dependencies!")


def run_madge():
    """跑 madge --circular，返回循环依赖数量。"""
    if not os.path.exists(MADGE):
        print(f"{RED}[FAIL]{NC} 未找到 madge: {MADGE}")
        print("  → 请先在 frontend/ 下执行 npm install")
        sys.exit(1)
    try:
        proc = subprocess.run(
            [MADGE, "--circular", "--extensions", "ts,tsx", "src/"],
            cwd=FRONTEND,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        print(f"{RED}[FAIL]{NC} madge 超过 {TIMEOUT_SECONDS}s 未完成，按失败处理（请手动重跑确认）")
        sys.exit(1)

    out = (proc.stdout or "") + (proc.stderr or "")
    m = FOUND_RE.search(out)
    if m is not None:
        return int(m.group(1))
    if proc.returncode == 0 and "No circular dependency found" in out:
        return 0
    print(f"{RED}[FAIL]{NC} 无法解析 madge 输出（退出码 {proc.returncode}），输出尾部：")
    print(out[-2000:])
    sys.exit(1)


def load_baseline():
    """读取基线；不存在返回 None（首次运行：只记录，不失败）。"""
    if not os.path.exists(BASELINE):
        return None
    try:
        with open(BASELINE, encoding="utf-8") as fh:
            data = json.load(fh)
        return int(data["max-circular"])
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"{YELLOW}[WARN]{NC} 基线解析失败，按「无基线」处理: {exc}")
        return None


def write_baseline(count):
    payload = {
        "_comment": (
            "前端循环依赖冻结基线（ratchet）。指标只许减少不许增加。"
            "由 scripts/check-frontend-circular.py 维护。madge 全量跑一次约 60s，"
            "故独立于 check-frontend-quality.py（纯文本 1-2s），仅由 pre-push 在"
            "前端 .ts/.tsx 变更时触发。2026-10-01 D-673 已清零（1941 文件 / 0 环）。"
        ),
        "_updated": "D-676",
        "max-circular": count,
    }
    with open(BASELINE, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def main():
    update = "--update" in sys.argv
    count = run_madge()
    baseline = load_baseline()

    print(f"{BLUE}━━━ 前端循环依赖门禁 ━━━{NC}")
    print(f"  {'circular':16s} 实测 {count}")

    if baseline is None:
        print(f"\n{YELLOW}[首次记录]{NC} 基线文件不存在，写入当前值（本次不失败）")
        print(f"  → {os.path.relpath(BASELINE, ROOT)}")
        write_baseline(count)
        return 0

    if count > baseline:
        print(f"\n{RED}[FAIL]{NC} 循环依赖劣化：基线 {baseline} → 实测 {count}（+{count - baseline}）")
        print("  修法（见 .workbuddy-ai/memory/FRONTEND-QUALITY-NOTES.md §3）：")
        print("    形态A 类型定义在 hook/主文件内被子文件反向 import type → 抽 <业务名>Types.ts")
        print("    形态B barrel index.ts 再导出 + 兄弟组件从 barrel 引入 → 改直连具体文件")
        return 1

    if count < baseline:
        if update:
            write_baseline(count)
            print(f"\n{GREEN}[PASS]{NC} 已收敛并下调基线：circular {baseline} → {count}")
        else:
            print(f"\n{GREEN}[PASS]{NC} 未劣化。已收敛，可运行 --update 下调基线：circular {baseline} → {count}")
        return 0

    print(f"\n{GREEN}[PASS]{NC} 与基线持平（{count}），无劣化")
    return 0


if __name__ == "__main__":
    sys.exit(main())

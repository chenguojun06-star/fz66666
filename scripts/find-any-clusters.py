#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""前端 `as any` 聚簇扫描 —— 找「源头模式」治理的杠杆点

背景（D-677~D-694 实战验证）：大面积重复的 `(X as any).field` 断言，
根因几乎总是 X 的类型标注缺失字段或干脆标了 any。**修源头一处类型，
下游几十处断言可机械删除** —— 比逐个改断言便宜两个数量级。

本脚本统计每个文件内「同一变量名的 `(X as any)` 断言出现次数」，
按聚簇分数降序输出。分数 ≥5 的文件几乎都可按「源头模式」治理：
  1. 找 X 的声明（props / useState / 函数参数），确认真实类型
  2. 真实类型缺字段 → 补可选字段；标了 any → 改真实类型
  3. 机械替换 `(X as any)?` → `X?`（注意索引签名坑：
     具名类型带 [key: string]: unknown 时，非具名字段访问从 any 变 unknown，
     调用处需要 String()/Boolean() 收口）
  4. tsc 驱动收尾（报错只指第一个不兼容字段，同类键值对一次收口）

⚠️ 不是所有 as any 都该清（见 2026-10-01 D-674）：
  - react-hooks/exhaustive-deps 的 disable 是有意为之，不在本扫描范围
  - 「把不稳定状态的版本号放进依赖」类 hack、ESLint 保守提示，保留

用法：
  python3 scripts/find-any-clusters.py                  # 阈值 5
  python3 scripts/find-any-clusters.py --threshold 3    # 长尾阶段用
  python3 scripts/find-any-clusters.py --src frontend/src
"""

import argparse
import collections
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAT = re.compile(r"\((\w+) as any\)")

GREEN, YELLOW, NC = "\033[32m", "\033[33m", "\033[0m"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=int, default=5, help="聚簇分数下限（默认 5）")
    ap.add_argument("--src", default=os.path.join(ROOT, "frontend", "src"))
    args = ap.parse_args()

    hits: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    total = 0
    for dirpath, dirnames, filenames in os.walk(args.src):
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", "dist", "build")]
        for name in filenames:
            if not name.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(dirpath, name)
            try:
                content = open(path, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            for m in PAT.finditer(content):
                hits[path][m.group(1)] += 1
                total += 1

    rows = sorted(
        ((p, var, n) for p, cc in hits.items() for var, n in cc.items() if n >= args.threshold),
        key=lambda r: (-r[2], r[0]),
    )
    print(f"扫描 {args.src}，(X as any) 总计 {total} 处；聚簇 ≥{args.threshold} 的文件/变量：")
    for p, var, n in rows:
        print(f"{GREEN}{n:4d}{NC}  {var:24s} {os.path.relpath(p, ROOT)}")
    if not rows:
        print(f"{GREEN}（无 ≥{args.threshold} 的聚簇，长尾阶段可降低阈值）{NC}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

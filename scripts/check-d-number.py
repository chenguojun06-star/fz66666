#!/usr/bin/env python3
"""
D 编号查重工具 —— 治「D 号撞号」复发。

背景（真实事故，不是假想）
--------------------------
本项目用 D-XXX 编号跟踪工作项。编号重复的后果：memory-bank 的
progress/decisionLog 条目互相覆盖、会话之间引用错条目、D-785 这种
「从未取号却被后续提交引用」的编号主文件里查无此条。

已确认的撞号记录（全部为事故，没有一次是「有意复用」）：
- D-362（遗留问题里自己记的「当日 D 编号重复」）
- D-618（09-28 登录页 i18n 与 10-01 待办中心双用）
- D-667/D-668（09-30 已被占用，10-01 又用）
- D-702（另有 Prompt 缓存历史用途）
- D-808（10-16 shop 详情长图与收银台投产核实时区修复双用）
- D-785（D-811 提交引用它，但从未有提交取过此号）

用法
----
    python3 scripts/check-d-number.py 808            # 查 D-808 是否已被占用
    python3 scripts/check-d-number.py --last 10      # 最近使用的 10 个编号
    python3 scripts/check-d-number.py --commits HEAD~3..HEAD
        # 检查待推送的提交是否撞上更早历史（提 PR / 推送前跑）

纪律：取新号前先跑一次 `--last`，再用候选号跑一次查重；
两个都干净才落 commit message。
"""
from __future__ import annotations

import re
import subprocess
import sys

DNO = re.compile(r"D-(\d+)")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=True
    ).stdout


def history() -> list[tuple[str, str, str]]:
    """返回 [(commit, date, subject)]，按时间正序（早 -> 晚）。"""
    out = git("log", "--format=%H%x09%ad%x09%s", "--date=short", "--reverse")
    rows = []
    for line in out.splitlines():
        if not line.strip():
            continue
        h, d, s = line.split("\t", 2)
        rows.append((h[:9], d, s))
    return rows


def used_by(number: int) -> list[tuple[str, str, str]]:
    tag = f"D-{number}"
    return [(h, d, s) for h, d, s in history() if tag in s]


def cmd_check(number: int) -> int:
    rows = used_by(number)
    if not rows:
        print(f"✅ D-{number} 未被占用，可以取用")
        return 0
    print(f"❌ D-{number} 已被 {len(rows)} 个提交占用（撞号）：")
    for h, d, s in rows:
        print(f"  {h} {d}  {s[:80]}")
    if len(rows) > 1:
        print("\n⚠️ 同一编号多个用途 = 记忆库条目会互相覆盖，必须换号或显式标注「撞号提示」")
    return 1


def cmd_last(n: int) -> int:
    seen: dict[int, tuple[str, str, str]] = {}
    for h, d, s in reversed(history()):
        for m in DNO.findall(s):
            num = int(m)
            if num not in seen:
                seen[num] = (h, d, s)
    print(f"最近使用的 {n} 个 D 编号：")
    for num in sorted(seen, reverse=True)[:n]:
        h, d, s = seen[num]
        print(f"  D-{num}  {h} {d}  {s[:70]}")
    top = max(seen) if seen else 0
    print(f"\n当前最大编号：D-{top}（新号建议 ≥ D-{top + 1}，取号后务必再跑一次查重）")
    return 0


def cmd_commits(rng: str) -> int:
    try:
        git("rev-parse", rng)
    except subprocess.CalledProcessError:
        print(f"❌ 无效的 git 范围：{rng}")
        return 2
    out = git("log", "--format=%H%x09%ad%x09%s", "--date=short", rng)
    pending: dict[int, list[str]] = {}
    for line in out.splitlines():
        if not line.strip():
            continue
        h, d, s = line.split("\t", 2)
        for m in DNO.findall(s):
            pending.setdefault(int(m), []).append(f"{h[:9]} {s[:60]}")
    if not pending:
        print("（待检查范围内没有 D 编号）")
        return 0
    bad = 0
    for num in sorted(pending, reverse=True):
        rows = used_by(num)
        # 待检查提交自己不算占用；与更早历史撞才算
        earlier = [r for r in rows if r[2] not in [p.split(" ", 1)[1][:60] for p in pending[num]]]
        if earlier and len(earlier) >= len(pending[num]):
            pass  # 全部用途都在更早历史 → 纯撞号
        if earlier:
            hits = [r for r in earlier]
            # 只要该号在待推送范围之外还被用过，就警示
            outside = [r for r in rows if not any(r[0] == p[:9] for p in pending[num])]
            if outside:
                bad += 1
                print(f"❌ D-{num} 与更早历史撞号：")
                for h, d, s in outside:
                    print(f"    更早：{h} {d}  {s[:70]}")
                for p in pending[num]:
                    print(f"    本次：{p}")
    if bad:
        print(f"\n共 {bad} 个编号撞历史，推送前先换号（或确认是有意复用并在记忆库标注）")
        return 1
    print(f"✅ 范围 {rng} 内 {len(pending)} 个 D 编号均未撞更早历史")
    return 0


def main() -> int:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if args[0] == "--last":
        n = int(args[1]) if len(args) > 1 else 10
        return cmd_last(n)
    if args[0] == "--commits":
        if len(args) < 2:
            print("用法：--commits <range>，如 HEAD~3..HEAD")
            return 2
        return cmd_commits(args[1])
    raw = args[0]
    if raw.isdigit():
        return cmd_check(int(raw))
    m = DNO.search(raw)
    if not m:
        print(f"无法解析编号：{raw}（示例：808 或 D-808）")
        return 2
    return cmd_check(int(m.group(1)))


if __name__ == "__main__":
    sys.exit(main())

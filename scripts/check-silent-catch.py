#!/usr/bin/env python3
"""
禁止新增「catch 里只打 log.debug」的静默吞异常（CI 门禁，棘轮式）
================================================================
背景（2026-10-14 全项目盘点的最大教训）：

一次拿生产库 5740 个真实列核对全仓原生 SQL，命中 **8 处引用不存在列**的真缺陷：
工资打款必 500、日志清理 6 个月没删过数据、AI 自进化取不到样本、
自演练一个租户都不跑、AI 巡检没有证据……

它们能藏这么久，共同点不是"SQL 写错"，而是：

    抛 Unknown column → 被 catch 抓住 → 只打 log.debug → 生产日志级别看不见
    → 功能静默失效数月 → 没人发现

所以 `log.debug` 在这里不是"日志级别选得保守"，而是**把故障藏起来的手段**。

规则（只约束新增，存量不动）：
  本次新增的 catch 块，如果
    (a) 既没有 log.warn 也没有 log.error，且
    (b) 块内没有解释"为什么可以忽略"的注释
  则构建失败。
  真正可忽略的旁路（缓存未命中、可选的旁路调用）加一行注释说明即可，
  例如 `// 尽力而为：失败不影响主流程`。

存量 32 处不动 —— 逐个改风险大于收益，且其中确有合理的。要防的是继续扩散。
退出码 0=通过，1=发现新增。
"""
import os
import re
import subprocess
import sys

SRC = "backend/src/main/java"

ALLOW_MARKERS = ("尽力而为", "不影响主流程", "可忽略", "忽略该异常", "best-effort",
                 "best effort", "optional", "swallow")

FAILURES = []


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def one_liner_debug_catches(text):
    """返回 {行号: catch 块正文}，只收"只打 debug、没有 warn/error"的块"""
    out = {}
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if "log.debug(" not in line:
            continue
        # 向前（最多 6 行）找包含 catch 的行 —— 不能假定它在上一行，
        # `catch (Exception e) { log.debug(...); return null; }` 全写在一行很常见
        start = None
        for k in range(i, max(-1, i - 6), -1):
            if re.search(r"catch\s*\(", lines[k]):
                start = k
                break
        if start is None:
            continue
        # 从 catch 那行开始扫到花括号配平
        depth = 0
        body = []
        started = False
        j = start
        while j < min(len(lines), start + 8):
            l = lines[j]
            for ch in l:
                if ch == "{":
                    depth += 1
                    started = True
                elif ch == "}":
                    depth -= 1
            body.append(l)
            if started and depth <= 0:
                break
            j += 1
        blk = "\n".join(body)
        if re.search(r"log\.(warn|error)\(", blk):
            continue
        if any(m in blk for m in ALLOW_MARKERS):
            continue
        out[start + 1] = blk
    return out


def catch_locations(ref, path):
    if ref is None:
        if not os.path.exists(path):
            return {}
        return one_liner_debug_catches(open(path, encoding="utf-8", errors="ignore").read())
    r = sh("git", "show", f"{ref}:{path}")
    if r.returncode != 0:
        return {}
    return one_liner_debug_catches(r.stdout)


def changed_java_files():
    """本次提交相对上一次提交改动过的 .java 文件"""
    r = sh("git", "diff", "--name-only", "HEAD^", "HEAD", "--", SRC)
    if r.returncode != 0:
        return []
    return [f for f in r.stdout.splitlines() if f.endswith(".java") and f.strip()]


def main():
    if sh("git", "rev-parse", "--verify", "HEAD^").returncode != 0:
        print("⚠️  没有上一次提交可比，跳过")
        return 0

    changed = changed_java_files()
    print(f"本次提交改动的后端源文件：{len(changed)}")

    new_total = 0
    for path in changed:
        before = set(catch_locations("HEAD^", path).keys())
        after = catch_locations("HEAD", path)
        for line, blk in sorted(after.items()):
            if line in before:
                continue          # 存量行号未变，不算新增
            new_total += 1
            FAILURES.append(
                f"{path}:{line}\n"
                f"        {blk.strip().splitlines()[0].strip()[:110]}\n"
                f"        → catch 里只打了 log.debug，生产日志级别下完全看不见。"
                f"这正是 8 处 SQL 缺陷藏了半年的原因。\n"
                f"        → 改成 log.warn/log.error；若确属可忽略的旁路，"
                f"加一行注释说明（如\"尽力而为：失败不影响主流程\"）。"
            )

    if FAILURES:
        print(f"\n❌ 本次提交新增了 {new_total} 处「catch 只打 debug」的静默吞异常：\n")
        for i, m in enumerate(FAILURES, 1):
            print(f"  {i}. {m}")
        print("\n背景：2026-10-14 盘出 8 处引用不存在列的原生 SQL 缺陷，"
              "全部因为被 catch 成 log.debug 而静默失效数月。")
        print("存量 32 处暂不动，但不许再新增。")
        return 1
    print("✅ 没有新增「catch 只打 debug」的静默吞异常")
    return 0


if __name__ == "__main__":
    sys.exit(main())

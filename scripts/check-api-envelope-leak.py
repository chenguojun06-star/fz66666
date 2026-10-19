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
    python3 scripts/check-api-envelope-leak.py --update   # 重新记录 baseline（只减不增）
    python3 scripts/check-api-envelope-leak.py --update --reason "..."  # 有理由的合法放大

baseline
--------
历史存量记录在 `scripts/baseline/api-envelope-leak.json`（键为 `文件|方法名`）。
用方法名而非行号，是因为行号会随任意上方代码增删漂移 —— 实测一次普通改动
就制造 25 处「幽灵新增」，同时把真泄漏掩成「已修复」。
新增泄漏会被拦截；修掉一处就删掉对应键，然后 `--update` 收敛。

**baseline 只能变小不能变大** —— 本纪律由代码强制执行（2026-10-19 加固）：
`--update` 时若发现新增键，必须同时传 `--reason`，否则拒绝保存。
背景：该纪律原先只写在本 docstring 里，`ef40a136c` 一次无理由 `--update`
把 175 放大到 337（+196 被登记成"存量"），门禁对那些泄漏永久失效。

**检出规则同样踩过坑**（2026-10-19 修复）：单行 `list: () => api.get<T>('/x')`
曾因主循环条件写反而完全漏检——最典型的写法反而不过门禁。修规则属
「扫描能力升级」，随之补录的存量用 `--reason` 登记，属合法放大。
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
# get/post/put/delete 全算：update/delete 同样会把信封塞给调用方。
ENVELOPE_TYPED = re.compile(r"api\.(?:get|post|put|delete)<\s*\{[^{}]*?\bcode\b\s*:[^{}]*?\bdata\b\s*:")

# 形如 name: (...) => api.get<T>(...) —— 把 api 结果直接 return，同样是泄漏信封。
# 服务里多行写法（上一行结尾是 =>，api.* 在下一行）也会命中：先把两行拼起来再判。
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
    ap.add_argument(
        "--reason",
        default="",
        help="baseline 合法放大时必须给出理由（如：修复漏检 bug 后补录存量）",
    )
    args = ap.parse_args()

    if not SERVICES.exists():
        print(f"❌ 找不到目录：{SERVICES}")
        return 1

    hits: dict[str, str] = {}

    def method_name(lines: list[str], idx: int) -> str:
        """向上回溯最多 8 行找方法名。

        用「文件|方法名」而不是「文件:行号」作 baseline 键 ——
        行号会随着上方任何一行代码增删而漂移，把已登记的存量变成
        "新增"，同时把真问题掩成"已修复"（2026-10-19 实际发生：
        仅给 productionApi 增加几行，就冒出 25 处幽灵新增）。
        """
        for back in range(0, 9):
            i = idx - back
            if i < 0:
                break
            m = re.search(r"^\s{0,6}([A-Za-z_$][\w$]*)\s*[:(]", lines[i])
            if m and m.group(1) not in ("api", "export", "const", "function", "async"):
                return m.group(1)
        return "<unknown>"

    def classify(line: str) -> str | None:
        stripped = line.strip()
        if stripped.startswith(("*", "//", "/*")):
            return None
        if "unwrapApiData" in line:
            return None
        if ENVELOPE_TYPED.search(line):
            return "泛型声明返回信封"
        return None

    for f in iter_service_files():
        text = f.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        for lineno, line in enumerate(lines, start=1):
            rel = str(f.relative_to(ROOT))
            kind = classify(line)
            # 单行直接 return：list: () => api.get<T>('/x')
            # ⚠️ 历史 bug：这里原来写的是
            #   `if kind is None and not DIRECT_RETURN.search(line):`（只做多行检查）
            # 导致**单行直接 return 完全漏检** —— 而这正是最常见、docstring 举例
            # 要拦的那种写法。实测（2026-10-19）：三种写法只有它过不了门禁。
            if kind is None and DIRECT_RETURN.search(line):
                kind = "直接 return api 结果（信封外泄）"
            # 多行写法：xxx: (..) =>
            #           api.get<T>(...)
            # 单行匹配不到 DIRECT_RETURN（=> 和 api 分居两行），单独判：
            # 本行以 => 结尾、下一行以 api.get/post< 开头 即外泄。
            if kind is None:
                nxt = lines[lineno].strip() if lineno < len(lines) else ""
                joined = line.rstrip() + " " + nxt
                this_ends_arrow = line.rstrip().endswith("=>")
                nxt_starts_api = re.match(r"api\.(?:get|post)<", nxt) is not None
                if this_ends_arrow and nxt_starts_api and "unwrapApiData" not in joined:
                    kind = "直接 return api 结果（信封外泄）"
            if kind:
                name = method_name(lines, lineno - 1)
                key = f"{rel}|{name}"
                seq = 2
                while key in hits:
                    key = f"{rel}|{name}#{seq}"
                    seq += 1
                hits[key] = f"[{kind}] L{lineno} {line.strip()[:100]}"

    current = set(hits)

    if args.update:
        old = load_baseline()
        added = sorted(current - old)
        removed = sorted(old - current)
        # 「baseline 只能变小不能变大」原来只写在 docstring 里、无任何机制执行，
        # 结果 ef40a136c 一次 --update 把 175 放大到 337（+196 登记），
        # 新泄漏被洗成"历史存量"，门禁对它们永久失效。这里把纪律变成代码：
        if added and not args.reason:
            print(f"❌ 拒绝更新 baseline：新增 {len(added)} 处（另修复 {len(removed)} 处）。")
            print("   baseline 只能变小不能变大 —— 要么当场修掉这些泄漏，")
            print("   要么用 --reason 说明为什么必须登记（如：修复漏检 bug 后补录存量），")
            print("   并把理由写进 commit message，否则后人无法判断这次放大是否合法。\n")
            for k in added[:20]:
                print(f"  {k}  {hits[k]}")
            if len(added) > 20:
                print(f"  ... 其余 {len(added) - 20} 处略")
            return 1
        save_baseline(current)
        print(f"✅ baseline 已更新：{len(current)} 处存量")
        if added:
            print(f"⚠️ 本次登记 {len(added)} 处新增存量，理由：{args.reason}")
            print("   请把该理由原样写进 commit message。")
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

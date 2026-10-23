#!/usr/bin/env python3
"""「做了没接」扫描器（D-848）
=================================

背景（2026-10-23 盘点）：本项目近期所有生产事故都是同一类病——**写了但没接线**：
  · DataConsistencyChecker 有两个「空壳检查」（只有注释 + 空循环），每日在跑等于没查
  · StockChangeLog 流水表机制完整，但出库/手工调账从不写
  · progressColumnHelpers.ts 是零引用死文件，还带着过时口径
  · FreeInboundModal 被挂载但没有任何按钮能触发它
  · AOP 操作日志只记 operation，details 恒 null（键名单缺键）
共同特征：**代码存在 ≠ 功能生效**。而这类问题编译、单测都发现不了，
每次都要等生产报障、再靠逆向排查才发现。

本脚本扫描两类"做了没接"：
  1. 空壳方法：public 方法体只有注释 / 只有 return null|空 / 只有 throw UnsupportedOperation
  2. 未接线方法：public 方法名在整个后端只出现一次（定义处，无任何调用方）

用法：
    python3 scripts/check-unwired.py              # 汇总 + 前 20 条
    python3 scripts/check-unwired.py --all        # 完整清单
    python3 scripts/check-unwired.py --empty      # 只看空壳
    python3 scripts/check-unwired.py --unwired    # 只看未接线

退出码恒 0（当前是盘点工具，不是门禁）；接入 CI 门禁前先看存量规模。
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "backend" / "src" / "main" / "java"

# 扫描对象：这些后缀的类才管"接线"（DTO/Entity/Config 里的 getter 没有调用方是正常的）
TARGET_SUFFIXES = ("Service.java", "ServiceImpl.java", "Orchestrator.java", "Controller.java",
                   "Helper.java", "Job.java", "Executor.java", "Factory.java", "Validator.java")

# 判"空壳"用正向白名单：去掉注释后，只剩这些才算空壳。
# ⚠️ 首版用 LOGIC_HINTS 反向找"有逻辑"的关键字，正则末尾 \b 位置错误，
# 把 `return jdbcTemplate;` 这类正常方法全判成空壳（812 处误报洪水）——
# 反向判"没有逻辑"永远会漏，正向判"只有空返回"才准。
SHELL_ONLY = re.compile(
    r'^(?:\s*(?:return\s*(?:null|0|false|true|-1|""|\'\')?\s*;?)?\s*)*$'
)

METHOD_RE = re.compile(
    r"^[ \t]*public\s+(?!class|interface|enum|record|static\s+final)"
    r"(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?"
    r"([\w<>\[\],.\s?]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,.\s]+)?\{",
    re.M,
)


def method_body(text: str, start: int) -> str:
    """从 '{' 之后取配对到右括号的方法体（字符串/字符字面量感知）。"""
    depth, i, n = 1, start, len(text)
    in_str = in_char = in_line_cmt = in_blk_cmt = False
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if in_line_cmt:
            if c == "\n":
                in_line_cmt = False
        elif in_blk_cmt:
            if c == "*" and nxt == "/":
                in_blk_cmt = False
                i += 1
        elif in_str:
            if c == "\\":
                i += 1
            elif c == '"':
                in_str = False
        elif in_char:
            if c == "\\":
                i += 1
            elif c == "'":
                in_char = False
        else:
            if c == "/" and nxt == "/":
                in_line_cmt = True
                i += 1
            elif c == "/" and nxt == "*":
                in_blk_cmt = True
                i += 1
            elif c == '"':
                in_str = True
            elif c == "'":
                in_char = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[start:i]
        i += 1
    return text[start:]


def strip_comments(body: str) -> str:
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    return re.sub(r"//[^\n]*", "", body)


def scan():
    files = [p for p in SRC.rglob("*.java") if p.name.endswith(TARGET_SUFFIXES)]
    # 全后端方法名出现次数（判"未接线"）
    all_text = {}
    for p in SRC.rglob("*.java"):
        try:
            all_text[p] = p.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

    empty_shells, unwired = [], []
    for path in files:
        text = all_text.get(path, "")
        rel = path.relative_to(ROOT)
        for m in METHOD_RE.finditer(text):
            ret_type, name, params = m.group(1).strip(), m.group(2), m.group(3)
            if name in ("main", "toString", "equals", "hashCode") or len(name) < 4:
                continue
            # getter/setter/builder 天然只有一行，不算"做了没接"
            if re.match(r"^(get|set|is|has|with)[A-Z]", name):
                continue
            body = method_body(text, m.end())
            code = strip_comments(body).strip()
            line_no = text[:m.start()].count("\n") + 1

            # ① 空壳：去掉注释后只剩空返回（return null/0/;/false/""）
            if SHELL_ONLY.match(code):
                empty_shells.append((str(rel), line_no, f"{ret_type} {name}({params.strip()[:60]})", code[:60].replace("\n", " ")))
                continue

            # ② 未接线：方法名在全后端只出现一次（仅定义处）
            # 排除框架回调：Spring 端点/定时/事件监听由容器调用，文本扫描找不到
            head = text[max(0, m.start() - 300):m.start()]
            if re.search(r"@(Get|Post|Put|Delete|Patch|Request)Mapping|@Scheduled|@EventListener|"
                         r"@KafkaListener|@RabbitListener|@TransactionalEventListener|@PostConstruct|@PreDestroy", head):
                continue
            occurrences = sum(t.count(name) for t in all_text.values())
            if occurrences <= 1:
                unwired.append((str(rel), line_no, f"{ret_type} {name}({params.strip()[:60]})", ""))

    return empty_shells, unwired


BASELINE = ROOT / "scripts" / "unwired-baseline.txt"

# 自动分类规则（按文件路径/方法名推断"这处未接线大概是什么性质"）
CLASSIFY_RULES = [
    # (正则, 类别, 说明)
    (r"/intelligence/(service|helper|prompt|engine|orchestration|gateway)/", "AI能力库",
     "AI 模块的能力/提示词/工具库，多数供 AiTool 内部按需调用或尚未接入对话流程"),
    (r"/(common)/DataPermissionHelper", "高危-数据权限", "权限过滤器未接线 = 权限可能形同虚设，必须核实"),
    (r"/(common)/SensitiveDataMaskHelper", "高危-脱敏", "脱敏方法未接线 = 接口可能泄露敏感字段，必须核实"),
    (r"StockChangeLogOrchestrator", "高危-库存流水", "流水统一入口未接线，各业务分散写流水"),
    (r"/(finance)/", "账务", "账务能力未接线 = 可能少生成账单/应收，需核实"),
    (r"/(production)/helper/", "生产helper", "生产的日志/装配/同步 helper，常见于漏接入"),
    (r"/(style)/", "款式域", "款式/SKU 域能力"),
    (r"/(integration)/", "外部集成", "第三方对接抽象，可能仅部分平台使用"),
    (r"/(warehouse)/", "仓储", "仓储域能力"),
    (r"Legacy$|legacy", "兼容旧接口", "带 Legacy 命名的旧端点/兼容方法"),
    (r"^.*$", "其他", "需要人工判断"),
]


def classify(rel_path: str, name: str) -> tuple:
    for pattern, cat, desc in CLASSIFY_RULES:
        if re.search(pattern, rel_path + " " + name):
            return cat, desc
    return "其他", "需要人工判断"


def load_baseline() -> set:
    if not BASELINE.exists():
        return set()
    return {ln.strip() for ln in BASELINE.read_text(encoding="utf-8").splitlines()
            if ln.strip() and not ln.startswith("#")}


def key_of(rel: str, ln: int, sig: str) -> str:
    """baseline 键：文件 + 方法签名（不用行号——行号会因无关改动漂移，
    D-840 已经踩过「行号做键导致集体误报」的坑）。

    ⚠️ 签名必须把换行/连续空白压成单空格：多参数方法签名跨行时，
    原样写进 baseline 会被拆成多行，读回来比对全部错位（首版实测：
    baseline 161 条 vs 实际 156 条，报 14 处假新增）。"""
    norm = re.sub(r"\s+", " ", sig).strip()
    return f"{rel}::{norm}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--empty", action="store_true")
    ap.add_argument("--unwired", action="store_true")
    ap.add_argument("--classify", action="store_true", help="按类别分组输出")
    ap.add_argument("--write-baseline", action="store_true", help="写入/更新 baseline（清理后调用）")
    ap.add_argument("--check", action="store_true", help="CI 门禁：只允许减少，新增即失败")
    args = ap.parse_args()

    empty_shells, unwired = scan()
    show_empty = args.empty or (not args.unwired)
    show_unwired = args.unwired or (not args.empty)

    if args.write_baseline:
        lines = ["# 未接线方法 baseline（D-851）",
                 "# 只允许减少：清理掉一条就从这里删一行；新增未接线会被 --check 拦下",
                 "# 键 = 文件::方法签名（不用行号，避免无关改动导致漂移误报）"]
        lines += sorted(key_of(f, ln, sig) for f, ln, sig, _ in unwired)
        BASELINE.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"✅ baseline 已写入 {BASELINE.relative_to(ROOT)}：{len(unwired)} 条")
        return 0

    if args.check:
        base = load_baseline()
        current = {key_of(f, ln, sig): (f, ln, sig) for f, ln, sig, _ in unwired}
        new_items = [v for k, v in current.items() if k not in base]
        removed = [k for k in base if k not in current]
        print(f"baseline: {len(base)} 条 / 当前: {len(current)} 条")
        if removed:
            print(f"✅ 已清理 {len(removed)} 条（记得 --write-baseline 收口）")
        if new_items:
            print(f"❌ 新增 {len(new_items)} 处未接线（代码写了却没有任何调用方）：")
            for f, ln, sig in new_items[:15]:
                print(f"   {f}:{ln}  {sig}")
            print("\n修法二选一：①接到真实调用链上；②若为预留能力，加 // RESERVED(D-xxx) 说明并更新 baseline")
            return 1
        print("✅ 无新增未接线")
        return 0

    print("=" * 78)
    print("「做了没接」扫描（D-848）—— 代码存在 ≠ 功能生效")
    print("=" * 78)
    print(f"扫描范围: backend/src/main/java 共 {len(list(SRC.rglob('*.java')))} 个 java 文件")
    print(f"空壳方法 : {len(empty_shells)} 处")
    print(f"未接线方法: {len(unwired)} 处")

    if args.classify:
        groups = {}
        for f, ln, sig, _ in unwired:
            cat, desc = classify(f, sig)
            groups.setdefault(cat, []).append((f, ln, sig))
        print(f"\n【按类别分组】共 {len(groups)} 类")
        for cat in sorted(groups, key=lambda c: -len(groups[c])):
            items = groups[cat]
            desc = next((d for p, c, d in CLASSIFY_RULES if c == cat), "")
            print(f"\n── {cat}（{len(items)} 处）: {desc}")
            for f, ln, sig in items if args.all else items[:6]:
                print(f"   {f}:{ln}  {sig}")
            if not args.all and len(items) > 6:
                print(f"   ... 其余 {len(items) - 6} 处用 --all 查看")
        return 0

    limit = None if args.all else 20
    if show_empty and empty_shells:
        print("\n【空壳方法】方法体只有注释/return null/无实际逻辑——每日在跑等于没跑：")
        for f, ln, sig, code in empty_shells[:limit]:
            print(f"  {f}:{ln}")
            print(f"      {sig}")
            if code:
                print(f"      body: {code}")
        if limit and len(empty_shells) > limit:
            print(f"  ... 其余 {len(empty_shells) - limit} 处用 --all 查看")

    if show_unwired and unwired:
        print("\n【未接线方法】public 方法全后端无调用方——写了没人用（死代码或忘了接）：")
        for f, ln, sig, _ in unwired[:limit]:
            print(f"  {f}:{ln}")
            print(f"      {sig}")
        if limit and len(unwired) > limit:
            print(f"  ... 其余 {len(unwired) - limit} 处用 --all 查看")

    print("\n提示：不是所有条目都要改——")
    print("  · 空壳但被定时任务/框架调用的，要补实现或删掉（空跑比没有更危险）")
    print("  · 未接线但计划中的，加 @Deprecated 或 TODO(批次) 标注，别让它看起来像能用")
    return 0


if __name__ == "__main__":
    sys.exit(main())

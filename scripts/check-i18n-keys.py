#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n 键守卫（D-546）

背景：2026-09-25 线上出过一次真实事故 —— `shared-locales/source/*.json` 里
`status` 树被多嵌套了一层（`status.status.order.*`），而代码取 `status.order.*`。
`t()` 找不到键时会**回落成键名本身**，于是线上状态标签直接显示
`status.order.accepted` 这种裸键名。全程不报错、构建通过、类型检查通过。

本脚本把这类问题在推送前拦住，检查 8 件事（1~6 阻塞，7~8 仅提示）：
  1. 代码引用的 i18n 键在语言包里是否都存在（逐个语言校验）
  2. 语言包内是否存在「同名命名空间自我嵌套」（如 status.status）——本次事故根因
  3. 语言包的值是否本身就是 i18n 键（二次包装，会导致渲染出键名）
  4. 四个语言包的键集合是否完全一致（缺键会静默回落到中文）
  5. 【D-666】「NS + 'x'」形态的引用是否都存在 —— 原守卫盲区：
     正则要求字面量含点，而小程序 83 个文件用的是 `NS + 'reviewPass'` 这种无点写法，
     一个都没被校验过。补上后实测曾漏出 6 处线上裸键名。
  6. 【D-666】语言包里「值是一整块翻译表片段」的损坏（子键是语言码）——
     检查2 只找同名嵌套、检查3 只对 str 生效，两处都漏掉这一类。
     后果：`t()` 走 `String(value)` → 界面显示 `[object Object]`。实测曾漏出 1 处。
  7. 【D-666】死键报告（非阻塞）：叶子名在源码里从未出现过的键必然无人引用。
     与基线文件比对，只提示「新增」的死键，不阻塞推送。
  8. 【D-666】wxml↔js 绑定缺口（非阻塞）：wxml 用了 {{t.x}} 但同目录 js 的
     applyLanguage 从不赋值 → t.x 恒为 undefined → 文案静默丢失（不报错、构建也过）。
     实测全项目 18 个页面 / 34 处。与基线比对，只提示新增。

用法：
    python3 scripts/check-i18n-keys.py                     # 检查
    python3 scripts/check-i18n-keys.py --strict            # 警告也算失败
    python3 scripts/check-i18n-keys.py --update-dead-baseline        # 收敛死键基线
    python3 scripts/check-i18n-keys.py --update-wxml-bind-baseline   # 收敛绑定缺口基线

退出码：0 = 通过，1 = 发现问题
"""
import json
import os
import re
import sys
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, 'shared-locales', 'source')
LANGS = ['zh-CN', 'en-US', 'vi-VN', 'km-KH']

# 代码扫描范围
SCAN_DIRS = ['frontend/src', 'miniprogram']
SCAN_EXT = ('.ts', '.tsx', '.js', '.jsx')
SKIP_PARTS = ('node_modules', '/dist', '/build', '/.git')

STRICT = '--strict' in sys.argv
UPDATE_DEAD_BASELINE = '--update-dead-baseline' in sys.argv
UPDATE_BIND_BASELINE = '--update-wxml-bind-baseline' in sys.argv

# 已知的「长得像 i18n 键、其实不是」的字面量。
# 加白名单前必须确认它不是真的漏翻，否则等于把 bug 藏起来。
ALLOWLIST = {
    # localStorage 的存储键，不是界面文案
    'layout.header.recentPages',   # frontend/src/components/Layout/router.tsx
    'layout.header.pinnedPages',   # frontend/src/components/Layout/router.tsx（D-625 页签图钉固定，按用户后缀存）
    'layout.sidebar.collapsed',    # frontend/src/components/Layout/index.tsx
}


def flatten(obj, prefix=''):
    """把嵌套字典拍平成 {a.b.c: value}"""
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.update(flatten(v, f'{prefix}.{k}' if prefix else k))
    else:
        out[prefix] = obj
    return out


def load_packs():
    packs = {}
    for lang in LANGS:
        path = os.path.join(SOURCE_DIR, f'{lang}.json')
        if not os.path.exists(path):
            print(f'❌ 缺少语言源文件: {path}')
            sys.exit(1)
        with open(path, encoding='utf-8') as fh:
            packs[lang] = json.load(fh)
    return packs


def collect_refs(namespaces):
    """扫描代码里出现的命名空间字面量，返回 {key: {文件}}"""
    pat = re.compile(r"['\"]([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+)['\"]")
    refs = collections.defaultdict(set)
    for scan in SCAN_DIRS:
        base = os.path.join(ROOT, scan)
        if not os.path.isdir(base):
            continue
        for dirpath, _dirnames, filenames in os.walk(base):
            if any(part in dirpath for part in SKIP_PARTS):
                continue
            for name in filenames:
                if not name.endswith(SCAN_EXT):
                    continue
                full = os.path.join(dirpath, name)
                try:
                    with open(full, encoding='utf-8', errors='ignore') as fh:
                        text = fh.read()
                except OSError:
                    continue
                for match in pat.finditer(text):
                    key = match.group(1)
                    if key.split('.')[0] in namespaces and key not in ALLOWLIST:
                        refs[key].add(os.path.relpath(full, ROOT))
    return refs


# ==========================================================================
# D-666 新增：补上原守卫的两个盲区 + 死键报告
#
# 盲区 1：「NS + 'x'」形态的引用完全不在 collect_refs 视野内 —— 上面那个正则
#   要求字面量含点（`a.b.c`），而小程序主流写法是 `NS + 'reviewPass'`（字面量无点）。
#   实测：官方守卫只看到 776 处全路径引用，按 NS 解析后是 3046 处。
#   ⚠️ 只扫 miniprogram：前端 43k 文件里只有 1 处 `ext = '.'` 的伪常量，
#      不存在这种写法（已实测确认）。
#
# 盲区 2：语言包里「值是一整块翻译表片段」的损坏（子键是语言码）。
#   检查[2] 只找同名嵌套（key in value）、检查[3] 只对 str 生效 → 两处都漏。
#   后果：utils/i18n/index.js 的 t() 走 String(value) → 界面显示 [object Object]。
# ==========================================================================
MINIAPP_DIR = 'miniprogram'
DEAD_BASELINE = os.path.join(ROOT, 'scripts', 'i18n-dead-keys-baseline.json')
BIND_BASELINE = os.path.join(ROOT, 'scripts', 'i18n-wxml-bind-baseline.json')

# 「以点结尾的字符串常量」，如 const NS = 'mp.sampleDetail.'
NS_DECL_RE = re.compile(r"(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=\s*['\"]([A-Za-z0-9_.]*\.)['\"]")
# NS + 'key'
NS_REF_RE = re.compile(r"\b([A-Za-z_$][\w$]*)\s*\+\s*['\"]([A-Za-z0-9_]+)['\"]")
# 本地 helper：const t = (k) => i18n.t(NS + k, lang)
NS_HELPER_RE = re.compile(
    r"(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*"
    r"i18n\.(?:t|tf)\(\s*([A-Za-z_$][\w$]*)\s*\+"
)


def iter_miniapp_sources():
    """产出 (相对路径, 文本)，供检查 5/7 复用（避免多次遍历外接卷）"""
    base = os.path.join(ROOT, MINIAPP_DIR)
    for dirpath, _dirnames, filenames in os.walk(base):
        if any(part in dirpath for part in SKIP_PARTS):
            continue
        for name in filenames:
            if name == 'locales.generated.js':
                continue
            if name.endswith(('.js', '.wxml')):
                full = os.path.join(dirpath, name)
                try:
                    with open(full, encoding='utf-8', errors='ignore') as fh:
                        yield os.path.relpath(full, ROOT), fh.read()
                except OSError:
                    continue


def collect_ns_refs():
    """解析「NS + 'x'」引用。
    返回 (refs, dyn)：refs = {完整键: {文件}}；
    dyn = {前缀: {文件}}，对应 `NS + 'a' + k.charAt(0)...` 这类动态拼键（只校验前缀）。"""
    refs = collections.defaultdict(set)
    dyn = collections.defaultdict(set)
    for rel, text in iter_miniapp_sources():
        nsmap = {m.group(1): m.group(2) for m in NS_DECL_RE.finditer(text)}
        if not nsmap:
            continue
        for m in NS_REF_RE.finditer(text):
            name, leaf = m.group(1), m.group(2)
            if name not in nsmap:
                continue
            # 字面量后面还跟 + → 动态拼键，不能当完整键校验
            if re.match(r'\s*\+', text[m.end():m.end() + 3]):
                dyn[nsmap[name] + leaf].add(rel)
            else:
                refs[nsmap[name] + leaf].add(rel)
        for m in NS_HELPER_RE.finditer(text):
            helper, nsname = m.group(1), m.group(3)
            if nsname not in nsmap:
                continue
            for c in re.finditer(r'\b' + re.escape(helper) + r"\(\s*['\"]([A-Za-z0-9_]+)['\"]", text):
                refs[nsmap[nsname] + c.group(1)].add(rel)
    return refs, dyn


def find_fragment_nodes(tree):
    """值是 dict 且子键含语言码 → 翻译表片段被误合并。
    `language.names` 是合法的语言名表（本就按语言码做键），排除。"""
    hits = []

    def walk(node, path=''):
        if isinstance(node, dict):
            if set(node.keys()) & set(LANGS) and path != 'language.names':
                hits.append(path)
            for k, v in node.items():
                walk(v, f'{path}.{k}' if path else k)

    walk(tree)
    return hits


def find_dead_keys(zh_flat, blob):
    """死键（保守口径，零假阳性）：键的叶子名在源码里一次都没出现过。
    任何引用（含 NS + 'x'、动态拼键）都必须包含叶子名字面量，所以「没出现过」= 必然无人引用。
    宁可少报也不误报 —— 误删一个活键会让界面显示裸键名（D-547 事故形态）。"""
    dead = []
    for key in zh_flat:
        leaf = key.rsplit('.', 1)[-1]
        if not re.search(r'(?<![A-Za-z0-9_])' + re.escape(leaf) + r'(?![A-Za-z0-9_])', blob):
            dead.append(key)
    return sorted(dead)


# ---------- D-666 检查 8：wxml ↔ js 绑定缺口 ----------
# 第 4 类 i18n 盲区：wxml 用了 {{t.x}}，但同目录 js 的 applyLanguage 从不给 t.x 赋值
# → t.x 恒为 undefined → wxml 渲染为空 → 文案静默丢失（不报错、构建也过）。
# 实测全项目 18 个页面 / 34 处。
# ⚠️ 三个必须避开的陷阱，否则假阳性会从 34 涨到 1914：
#   ① `t: { ... }` 里的字段是**裸键名**（`cancel: i18n.t(...)`），不是 `t.cancel: ...`
#      → 必须按大括号配平提取顶层键，不能靠 `t.` 前缀匹配；
#   ② **必须先剥注释** —— 注释里的 `{{ }}` 会让配平提前归零、截断代码块
#      （第一版就踩了：某字段明明补上了仍报缺失）；
#   ③ `t` 可能是 `wx:for-item` 的循环别名（如 components/ai-assistant），
#      此时 {{t.title}} 与 i18n 无关 → 整个文件跳过。
def strip_js_comments(js):
    js = re.sub(r'/\*[\s\S]*?\*/', '', js)
    js = re.sub(r'(?m)^\s*//.*$', '', js)
    js = re.sub(r'(?<![:"\'])//[^\n\'"]*$', '', js, flags=re.M)
    return js


def extract_t_block_keys(js):
    """提取所有 `t: { ... }` 块的顶层键。返回 (键集合, 是否含无法枚举的展开运算符)。"""
    js = strip_js_comments(js)
    keys, has_spread = set(), False
    for m in re.finditer(r'\bt\s*:\s*\{', js):
        start = m.end() - 1
        depth, i = 0, start
        while i < len(js):
            if js[i] == '{':
                depth += 1
            elif js[i] == '}':
                depth -= 1
                if depth == 0:
                    break
            i += 1
        block = js[start + 1:i]
        parts, cur, d = [], '', 0
        for ch in block:
            if ch in '{[(':
                d += 1
            elif ch in '}])':
                d -= 1
            if ch == ',' and d == 0:
                parts.append(cur)
                cur = ''
            else:
                cur += ch
        parts.append(cur)
        for p in parts:
            if p.strip().startswith('...'):
                has_spread = True
                continue
            mm = re.match(r"\s*['\"]?([A-Za-z_$][\w$]*)['\"]?\s*:", p)
            if mm:
                keys.add(mm.group(1))
    return keys, has_spread


WXML_T_RE = re.compile(r'\{\{[^}]*?(?<![\w$.])t\.([A-Za-z0-9_]+)')
WXML_LOOP_T_RE = re.compile(r'wx:for-item\s*=\s*["\']t["\']')


def find_wxml_bind_gaps(sources):
    """返回 {wxml相对路径: [缺失字段]}。含展开运算符或看不到 t 赋值块的页面跳过（无法枚举）。"""
    gaps = {}
    for rel, text in sources.items():
        if not rel.endswith('.wxml'):
            continue
        js = sources.get(rel[:-5] + '.js')
        if js is None:
            continue
        if WXML_LOOP_T_RE.search(text):
            continue
        used = set(WXML_T_RE.findall(text))
        if not used:
            continue
        keys, spread = extract_t_block_keys(js)
        keys |= set(re.findall(r"['\"]t\.([A-Za-z0-9_]+)['\"]", js))  # setData({'t.x': ...})
        if spread or not keys:
            continue
        miss = sorted(used - keys)
        if miss:
            gaps[rel] = miss
    return gaps


def find_self_nesting(node, path=''):
    """找出「同名命名空间自我嵌套」，如 status.status / menu.menu"""
    hits = []
    if isinstance(node, dict):
        for key, value in node.items():
            here = f'{path}.{key}' if path else key
            if isinstance(value, dict) and key in value and key not in (
                'names', 'items', 'sections', 'current',
            ):
                hits.append(here)
            hits.extend(find_self_nesting(value, here))
    return hits


def find_key_like_values(flat_map, namespaces):
    """值本身长得像 i18n 键 → 二次包装"""
    pat = re.compile(r'^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$')
    hits = []
    for key, value in flat_map.items():
        if not isinstance(value, str):
            continue
        if pat.match(value) and value.split('.')[0] in namespaces:
            hits.append((key, value))
    return hits


def main():
    packs = load_packs()
    namespaces = set(packs['zh-CN'].keys())
    zh_flat = flatten(packs['zh-CN'])
    problems = 0

    print(f'命名空间 ({len(namespaces)}): {", ".join(sorted(namespaces))}')
    print(f'zh-CN 键总数: {len(zh_flat)}')
    print()

    # --- 检查 1：代码引用 vs 语言包 ---
    refs = collect_refs(namespaces)
    print(f'[1] 代码引用的 i18n 键: {len(refs)} 个')
    missing = []
    for key in sorted(refs):
        for lang in LANGS:
            if key not in flatten(packs[lang]):
                missing.append((key, lang, sorted(refs[key])[0]))
    if missing:
        problems += len(missing)
        print(f'    ❌ {len(missing)} 处引用在语言包里不存在：')
        for key, lang, where in missing[:30]:
            print(f'       {key}  [缺 {lang}]  ← {where}')
        if len(missing) > 30:
            print(f'       ... 另有 {len(missing) - 30} 处')
    else:
        print('    ✅ 全部命中')

    # --- 检查 2：自我嵌套 ---
    print('[2] 命名空间自我嵌套（本次线上事故根因）')
    nested = []
    for lang in LANGS:
        for hit in find_self_nesting(packs[lang]):
            nested.append((lang, hit))
    if nested:
        problems += len(nested)
        print(f'    ❌ {len(nested)} 处：')
        for lang, hit in nested[:20]:
            print(f'       {lang}: {hit}.{hit.rsplit(".", 1)[-1]}  ← 多套了一层')
    else:
        print('    ✅ 无自我嵌套')

    # --- 检查 3：值像键（二次包装）---
    print('[3] 语言包值本身是 i18n 键（会渲染出键名）')
    keylike = []
    for lang in LANGS:
        for key, value in find_key_like_values(flatten(packs[lang]), namespaces):
            keylike.append((lang, key, value))
    if keylike:
        problems += len(keylike)
        print(f'    ❌ {len(keylike)} 处：')
        for lang, key, value in keylike[:20]:
            print(f'       {lang}: {key} = "{value}"')
    else:
        print('    ✅ 无二次包装')

    # --- 检查 4：四语言键集合一致性 ---
    print('[4] 四语言键集合一致性')
    inconsistent = 0
    for lang in LANGS[1:]:
        other = flatten(packs[lang])
        only_zh = sorted(set(zh_flat) - set(other))
        only_other = sorted(set(other) - set(zh_flat))
        if only_zh or only_other:
            inconsistent += len(only_zh) + len(only_other)
            if only_zh:
                print(f'    ⚠️ {lang} 缺 {len(only_zh)} 键: {only_zh[:6]}')
            if only_other:
                print(f'    ⚠️ {lang} 多 {len(only_other)} 键: {only_other[:6]}')
    if inconsistent:
        problems += inconsistent
        print(f'    共 {inconsistent} 处不一致（缺键会静默回落到中文）')
    else:
        print(f'    ✅ 四语言各 {len(zh_flat)} 键，完全一致')

    # --- 检查 5：NS + 'x' 形态（原守卫盲区 1）---
    print("[5] NS + 'x' 形态的引用（原守卫看不到这类写法）")
    ns_refs, ns_dyn = collect_ns_refs()
    ns_missing = []
    for key in sorted(ns_refs):
        for lang in LANGS:
            if key not in flatten(packs[lang]):
                ns_missing.append((key, lang, sorted(ns_refs[key])[0]))
    dyn_bad = []
    for prefix in sorted(ns_dyn):
        if not any(k.startswith(prefix) for k in zh_flat):
            dyn_bad.append((prefix, sorted(ns_dyn[prefix])[0]))
    if ns_missing or dyn_bad:
        problems += len(ns_missing) + len(dyn_bad)
        print(f'    ❌ {len(ns_missing)} 处引用不存在 + {len(dyn_bad)} 处动态前缀无匹配：')
        for key, lang, where in ns_missing[:30]:
            print(f'       {key}  [缺 {lang}]  ← {where}')
        if len(ns_missing) > 30:
            print(f'       ... 另有 {len(ns_missing) - 30} 处')
        for prefix, where in dyn_bad[:10]:
            print(f'       动态前缀 {prefix}* 无任何匹配键  ← {where}')
    else:
        print(f'    ✅ {len(ns_refs)} 个不同的键 + {len(ns_dyn)} 处动态前缀全部命中')

    # --- 检查 6：语言包值-是翻译表片段（原守卫盲区 2）---
    print('[6] 语言包值-是翻译表片段（会渲染出 [object Object]）')
    frags = []
    for lang in LANGS:
        for path in find_fragment_nodes(packs[lang]):
            frags.append((lang, path))
    if frags:
        problems += len(frags)
        print(f'    ❌ {len(frags)} 处：')
        for lang, path in frags[:20]:
            print(f'       {lang}: {path}')
    else:
        print('    ✅ 无翻译表片段')

    # --- 检查 7：死键报告（非阻塞）---
    print('[7] 死键报告（非阻塞；叶子名在源码里从未出现 = 必然无人引用）')
    blob = '\n'.join(text for _rel, text in iter_miniapp_sources())
    dead = [k for k in find_dead_keys(zh_flat, blob) if k.startswith('mp.')]
    baseline = set()
    if os.path.exists(DEAD_BASELINE):
        try:
            with open(DEAD_BASELINE, encoding='utf-8') as fh:
                baseline = set(json.load(fh).get('keys', []))
        except (OSError, ValueError):
            baseline = set()
    if UPDATE_DEAD_BASELINE:
        with open(DEAD_BASELINE, 'w', encoding='utf-8') as fh:
            json.dump({
                'note': '死键基线（判据：叶子名在 miniprogram 源码里一次都没出现过）。'
                        '清理完存量后重跑 --update-dead-baseline 收敛。',
                'count': len(dead),
                'keys': dead,
            }, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        print(f'    ✅ 已更新基线 {DEAD_BASELINE}（{len(dead)} 个）')
    else:
        new_dead = sorted(set(dead) - baseline)
        gone = sorted(baseline - set(dead))
        print(f'    存量基线 {len(baseline)} 个 / 当前实测 {len(dead)} 个')
        if new_dead:
            print(f'    ⚠️ 新增 {len(new_dead)} 个死键（不阻塞推送，建议清理或补回引用）：')
            for k in new_dead[:30]:
                print(f'       {k}  = {zh_flat[k]!r}')
            if len(new_dead) > 30:
                print(f'       ... 另有 {len(new_dead) - 30} 个')
        else:
            print('    ✅ 无新增死键')
        if gone:
            print(f'    ℹ️ 基线里 {len(gone)} 个已不再是死键 → 可跑 --update-dead-baseline 收敛')

    # --- 检查 8：wxml ↔ js 绑定缺口（非阻塞）---
    print('[8] wxml↔js 绑定缺口（非阻塞；wxml 用了 t.x 但 applyLanguage 从不赋值）')
    sources = {rel: text for rel, text in iter_miniapp_sources()}
    gaps = find_wxml_bind_gaps(sources)
    bind_baseline = {}
    if os.path.exists(BIND_BASELINE):
        try:
            with open(BIND_BASELINE, encoding='utf-8') as fh:
                bind_baseline = json.load(fh).get('pages', {})
        except (OSError, ValueError):
            bind_baseline = {}
    if UPDATE_BIND_BASELINE:
        with open(BIND_BASELINE, 'w', encoding='utf-8') as fh:
            json.dump({
                'note': 'wxml↔js 绑定缺口基线（判据：wxml 用了 {{t.x}} 但同目录 js 的 '
                        'applyLanguage 从不赋值 → 文案静默丢失）。'
                        '修完一批后重跑 --update-wxml-bind-baseline 收敛。',
                'total': sum(len(v) for v in gaps.values()),
                'pages': gaps,
            }, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        print(f'    ✅ 已更新基线 {BIND_BASELINE}'
              f'（{len(gaps)} 个页面 / {sum(len(v) for v in gaps.values())} 处）')
    else:
        new_gaps = {}
        for page, fields in gaps.items():
            old = set(bind_baseline.get(page, []))
            fresh = [f for f in fields if f not in old]
            if fresh:
                new_gaps[page] = fresh
        print(f'    存量基线 {len(bind_baseline)} 个页面 / '
              f'当前实测 {len(gaps)} 个页面、{sum(len(v) for v in gaps.values())} 处')
        if new_gaps:
            print(f'    ⚠️ 新增 {sum(len(v) for v in new_gaps.values())} 处（不阻塞推送）：')
            for page, fields in list(new_gaps.items())[:12]:
                print(f'       {page}  →  {fields}')
        else:
            print('    ✅ 无新增缺口')

    print()
    if problems:
        print(f'❌ i18n 键检查未通过：{problems} 个问题')
        if not STRICT:
            print('   （缺键/不一致属阻塞项；如确认无误可加 --strict 复跑）')
        return 1
    print('✅ i18n 键检查全部通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n 文案抽取器（D-548）

用途：把一个页面/模块里的**硬编码中文文案**抽出来，形成待翻译工作清单。
不修改任何文件，只输出清单。

设计要点（踩过的坑都在这里）：
  1. **必须剥注释**，否则代码注释里的中文会被当成文案，工作量虚高
     （初版没剥注释，13726 条里混入大量注释，实际有效文案远少于此）
  2. **wxml 与 js 要分开**，因为两者的替换手法完全不同：
     - wxml：静态文本 → `{{t.xxx}}`；属性（placeholder/title）→ `{{t.xxx}}`
     - js  ：字符串字面量 → `i18n.t('xxx')`
  3. **区分「可翻译文案」与「不能翻的」**：
     - 排除纯符号/数字/单位（`-`、`%`、`CM`）
     - 排除看起来像数据值的（型号 `XS(155/80A)`、颜色码）
     - **标记**含 `{{}}` 插值的（需要 tf() 传参，不能简单替换）
  4. **带上下文输出**（文件:行:列 + 所在标签/属性），否则替换时无法判断该不该动

用法：
    python3 scripts/i18n-extract.py miniprogram/pages/warehouse            # 整目录
    python3 scripts/i18n-extract.py miniprogram/pages/warehouse/location-scan --format=md
    python3 scripts/i18n-extract.py frontend/src/modules/warehouse --format=json --out /tmp/x.json
"""
import argparse
import json
import os
import re
import sys
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CJK = re.compile(r'[\u4e00-\u9fff]')

# 打印红线：这些文件一个字都不许动
PRINT_SKIP = re.compile(r'print|label|wash|barcode|sticker|quotation|certificate', re.I)

# 不能翻译的（纯符号/数字/单位/尺寸码）
NON_TRANSLATABLE = re.compile(
    r'^[\s\d\W]*$'                                  # 全是符号数字
    r'|^[A-Z]{1,4}\(\d+/\d+[A-Z]?\)$'               # XS(155/80A)
    r'|^[\d.]+\s*(CM|MM|KG|G|PCS|M|㎡|米|码)$'        # 140CM
)


def strip_comments_js(text):
    """剥掉 js/ts 注释。顺序很重要：先块注释，再整行注释，再行尾注释。"""
    text = re.sub(r'/\*[\s\S]*?\*/', '', text)
    text = re.sub(r'(?m)^\s*//.*$', '', text)
    text = re.sub(r'(?m)\s+//[^\n]*$', '', text)
    return text


def strip_comments_wxml(text):
    text = re.sub(r'<!--[\s\S]*?-->', '', text)
    return text


# 装饰性图片占位块：`<view class="...--placeholder"><text ...>衣</text></view>`
#
# 图片缺失时灰底方块里的那个汉字（「衣」/「料」）**是图形占位，不是文案** ——
# 全项目 material-database / material-center / material-inventory/detail /
# finished-inventory 等 5+ 个页面都这么硬编码，不参与 i18n。
# 若不跳过，每个带占位图的页面都会多出一条假文案。
#
# ⚠️ 与 `scripts/test-warehouse-pages.mjs` 的 `DECOR_PLACEHOLDER_RE` 是**同一条规则**，
#    两处必须保持一致，否则抽取器说「有」、测试说「不该有」，互相打架。
DECOR_PLACEHOLDER = re.compile(
    r'<view[^>]*class="[^"]*--placeholder[^"]*"[^>]*>\s*'
    r'(?:<!--[\s\S]*?-->\s*)?'
    r'<text[^>]*>[^<]*</text>\s*</view>',
    re.S)

# 被跳过的装饰占位符 (文件, 内层文本)，供汇总时展示，避免「静默跳过」
DECOR_SKIPPED = []

_DECOR_INNER = re.compile(r'<text[^>]*>([^<]*)</text>')


def strip_decor_placeholders(text, rel=''):
    def _sub(m):
        inner = _DECOR_INNER.search(m.group(0))
        DECOR_SKIPPED.append((rel, inner.group(1) if inner else '?'))
        return ''
    return DECOR_PLACEHOLDER.sub(_sub, text)


def has_interp(s):
    """含插值 —— 需要 tf() 传参，不能当纯静态文案替换。
    wxml 用 {{}}；js 模板串用 ${}。两种都要认（只认 {{}} 会漏掉模板串）。"""
    return '{{' in s or '}}' in s or '${' in s


def line_of(text, pos):
    return text.count('\n', 0, pos) + 1


def context_of_wxml(text, pos):
    """取该位置所在标签名，便于人工判断"""
    head = text[:pos]
    m = None
    for m in re.finditer(r'<([a-zA-Z][\w-]*)', head):
        pass
    return m.group(1) if m else '?'


def scan_wxml(path, rel):
    out = []
    raw = open(path, encoding='utf-8', errors='ignore').read()
    text = strip_decor_placeholders(strip_comments_wxml(raw), rel)
    # 静态文本：>xxx<
    # ⚠️ 这里必须用 [^<>]+ 而不是 [^<>{}]+ —— 含 {{}} 插值的文案（如「共 {{n}} 条」）
    #    恰恰是最需要人工处理的（要换成 tf() 传参），用 [^<>{}] 会把它们**整条静默跳过**。
    for m in re.finditer(r'>([^<>]+)<', text):
        s = m.group(1)
        if not CJK.search(s):
            continue
        t = s.strip()
        if not t:
            continue
        if NON_TRANSLATABLE.match(t):
            continue
        out.append({
            'kind': 'wxml-text-interp' if has_interp(s) else 'wxml-text',
            'file': rel,
            'line': line_of(text, m.start(1)),
            'text': t,
            'raw': s,
            'tag': context_of_wxml(text, m.start()),
            'interp': has_interp(s),
        })
    # 属性值：placeholder="xxx" title="xxx" 等
    for m in re.finditer(r'([\w:-]+)\s*=\s*"([^"]*)"', text):
        attr, val = m.group(1), m.group(2)
        if not CJK.search(val):
            continue
        v = val.strip()
        if not v or NON_TRANSLATABLE.match(v):
            continue
        out.append({
            'kind': f'wxml-attr:{attr}',
            'file': rel,
            'line': line_of(text, m.start(2)),
            'text': v,
            'raw': val,
            'tag': context_of_wxml(text, m.start()),
            'interp': has_interp(val),
        })
    return out


def scan_js(path, rel):
    out = []
    raw = open(path, encoding='utf-8', errors='ignore').read()
    text = strip_comments_js(raw)
    pat = re.compile(r"'([^'\\\n]*)'|\"([^\"\\\n]*)\"|`([^`]*)`")
    for m in pat.finditer(text):
        s = next(g for g in m.groups() if g is not None)
        if not CJK.search(s):
            continue
        t = s.strip()
        if not t or NON_TRANSLATABLE.match(t):
            continue
        # 判断用途：toast/报错 vs 展示文案
        head = text[max(0, m.start() - 90):m.start()]
        if re.search(r'toast\.(error|info|success|warn)\s*\(\s*$', head):
            kind = 'js-toast'
        elif re.search(r'(throw new Error|console\.\w+)\s*\(\s*$', head):
            kind = 'js-devmsg'          # 开发者信息，通常不翻
        elif re.search(r'(placeholder|title|label|text|name)\s*:\s*$', head):
            kind = 'js-label'
        else:
            kind = 'js-string'
        out.append({
            'kind': kind,
            'file': rel,
            'line': line_of(text, m.start()),
            'text': t,
            'raw': s,
            'tag': '',
            'interp': has_interp(s),
        })
    return out


def scan(target, skip_print=True):
    base = os.path.join(ROOT, target) if not os.path.isabs(target) else target
    if not os.path.exists(base):
        print(f'❌ 路径不存在: {base}')
        sys.exit(1)
    files, skipped = [], []
    if os.path.isfile(base):
        files = [base]
    else:
        for dp, dns, fns in os.walk(base):
            if 'node_modules' in dp or '/dist' in dp:
                continue
            for fn in fns:
                if fn.endswith(('.wxml', '.js', '.ts', '.tsx')):
                    files.append(os.path.join(dp, fn))
    items = []
    for fp in sorted(files):
        rel = os.path.relpath(fp, ROOT)
        if skip_print and PRINT_SKIP.search(rel):
            skipped.append(rel)
            continue
        if fp.endswith('.wxml'):
            items += scan_wxml(fp, rel)
        else:
            items += scan_js(fp, rel)
    return items, skipped


def report_md(items, skipped, target):
    by_file = collections.defaultdict(list)
    for it in items:
        by_file[it['file']].append(it)
    lines = [f'# 文案抽取清单 — `{target}`', '']
    lines.append(f'- 条目总数：**{len(items)}**')
    lines.append(f'- 去重文案：**{len(set(i["text"] for i in items))}**')
    lines.append(f'- 涉及文件：**{len(by_file)}**')
    if skipped:
        lines.append(f'- ⛔ 跳过（打印红线）：{len(skipped)} 个文件')
    lines.append('')
    kinds = collections.Counter(i['kind'].split(':')[0] for i in items)
    lines.append('| 类型 | 条数 |')
    lines.append('|---|---|')
    for k, v in kinds.most_common():
        lines.append(f'| {k} | {v} |')
    lines.append('')
    for f in sorted(by_file):
        lines.append(f'## `{f}`')
        lines.append('')
        lines.append('| 行 | 类型 | 文案 | 插值 |')
        lines.append('|---|---|---|---|')
        for it in sorted(by_file[f], key=lambda x: x['line']):
            t = it['text'].replace('|', '\\|')
            lines.append(f'| {it["line"]} | {it["kind"]} | `{t}` | {"✓" if it["interp"] else ""} |')
        lines.append('')
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('target', help='要抽取的目录或文件（相对仓库根）')
    ap.add_argument('--format', choices=['md', 'json', 'summary'], default='summary')
    ap.add_argument('--out', help='输出文件路径（默认打印到 stdout）')
    ap.add_argument('--keep-print', action='store_true', help='不跳过打印相关文件（危险）')
    args = ap.parse_args()

    items, skipped = scan(args.target, skip_print=not args.keep_print)

    if args.format == 'json':
        payload = json.dumps(items, ensure_ascii=False, indent=2)
    elif args.format == 'md':
        payload = report_md(items, skipped, args.target)
    else:
        by_kind = collections.Counter(i['kind'].split(':')[0] for i in items)
        by_file = collections.Counter(i['file'] for i in items)
        payload = '\n'.join([
            f'目标: {args.target}',
            f'条目总数: {len(items)}   去重: {len(set(i["text"] for i in items))}   文件数: {len(by_file)}',
            f'跳过(打印红线): {len(skipped)} 个文件',
            '',
            '按类型:',
            *[f'  {k:<16} {v}' for k, v in by_kind.most_common()],
            '',
            '按文件 Top 15:',
            *[f'  {v:>5}  {k}' for k, v in by_file.most_common(15)],
            '',
            '含插值（需 tf() 传参，不能直接替换）:',
            *[f'  {i["file"]}:{i["line"]}  {i["text"]!r}' for i in items if i['interp']][:15],
            '',
            '已跳过（装饰性图片占位符，非文案）:',
            *[f'  {rel}: {txt!r}' for rel, txt in DECOR_SKIPPED][:15],
        ])

    if args.out:
        with open(args.out, 'w', encoding='utf-8') as fh:
            fh.write(payload + '\n')
        print(f'✅ 已写入 {args.out}')
    else:
        print(payload)


if __name__ == '__main__':
    main()

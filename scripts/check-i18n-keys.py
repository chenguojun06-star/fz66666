#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n 键守卫（D-546）

背景：2026-09-25 线上出过一次真实事故 —— `shared-locales/source/*.json` 里
`status` 树被多嵌套了一层（`status.status.order.*`），而代码取 `status.order.*`。
`t()` 找不到键时会**回落成键名本身**，于是线上状态标签直接显示
`status.order.accepted` 这种裸键名。全程不报错、构建通过、类型检查通过。

本脚本把这类问题在推送前拦住，检查 4 件事：
  1. 代码引用的 i18n 键在语言包里是否都存在（逐个语言校验）
  2. 语言包内是否存在「同名命名空间自我嵌套」（如 status.status）——本次事故根因
  3. 语言包的值是否本身就是 i18n 键（二次包装，会导致渲染出键名）
  4. 四个语言包的键集合是否完全一致（缺键会静默回落到中文）

用法：
    python3 scripts/check-i18n-keys.py            # 检查
    python3 scripts/check-i18n-keys.py --strict   # 警告也算失败

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

# 已知的「长得像 i18n 键、其实不是」的字面量。
# 加白名单前必须确认它不是真的漏翻，否则等于把 bug 藏起来。
ALLOWLIST = {
    # localStorage 的存储键，不是界面文案
    'layout.header.recentPages',   # frontend/src/components/Layout/router.tsx
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

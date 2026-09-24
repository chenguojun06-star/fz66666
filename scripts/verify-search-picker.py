#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 search-picker 批量转换的结果。"""
import re
import json
import glob
import os

print("=== ① 所有 data-handler 在对应 js 里是否存在 ===")
bad = 0
for f in glob.glob('**/*.wxml', recursive=True):
    if 'node_modules' in f:
        continue
    s = open(f, encoding='utf-8').read()
    if 'data-handler=' not in s:
        continue
    js = f[:-5] + '.js'
    js_src = open(js, encoding='utf-8').read() if os.path.exists(js) else ''
    for h in sorted(set(re.findall(r'data-handler="([^"]+)"', s))):
        if h not in js_src:
            print(f"  ❌ {f} → {h} 不存在")
            bad += 1
print(f"  缺失 {bad} 处")

print("\n=== ② 每个转换后的页面都有 search-picker 三件套 ===")
miss = 0
for f in glob.glob('**/*.wxml', recursive=True):
    if 'node_modules' in f:
        continue
    s = open(f, encoding='utf-8').read()
    if 'bindtap="openPicker"' not in s:
        continue
    js = f[:-5] + '.js'
    jj = f[:-5] + '.json'
    j = open(js, encoding='utf-8').read() if os.path.exists(js) else ''
    for need, tag in [('openPicker', 'js.openPicker'), ('onPickerSelect', 'js.onPickerSelect'),
                      ('onPickerClose', 'js.onPickerClose'), ('pickerVisible', 'js.data.pickerVisible'),
                      ('<search-picker', 'wxml.search-picker')]:
        if need not in s and need not in j:
            print(f"  ❌ {f} 缺 {tag}")
            miss += 1
    if os.path.exists(jj):
        try:
            uc = json.load(open(jj, encoding='utf-8')).get('usingComponents') or {}
            if 'search-picker' not in uc:
                print(f"  ❌ {jj} 未注册 search-picker")
                miss += 1
        except Exception as e:
            print(f"  ❌ {jj} json 非法: {e}")
            miss += 1
print(f"  缺失 {miss} 处")

print("\n=== ③ WXML view 标签配对 ===")
bad3 = 0
for f in glob.glob('**/*.wxml', recursive=True):
    if 'node_modules' in f:
        continue
    s = open(f, encoding='utf-8').read()
    v = len(re.findall(r'<view[\s>]', s))
    sc = len(re.findall(r'<view[^>]*/>', s))
    vc = len(re.findall(r'</view>', s))
    if v - sc != vc:
        print(f"  ❌ {f}: view {v}({sc}自闭合)/{vc}")
        bad3 += 1
print(f"  不配对 {bad3} 个")

print("\n=== ④ 残留 selector picker ===")
for f in glob.glob('**/*.wxml', recursive=True):
    if 'node_modules' in f:
        continue
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r'<picker([^>]*)>', s, re.S):
        a = m.group(1)
        mm = re.search(r'mode\s*=\s*"([^"]+)"', a)
        mode = mm.group(1) if mm else 'selector'
        if mode == 'selector':
            print(f"  {f}:{s[:m.start()].count(chr(10)) + 1}")

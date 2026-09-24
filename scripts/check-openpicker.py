#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查 openPicker 的两套实现分布，为统一做准备。"""
import re
import glob
import os

rows = []
for f in glob.glob('**/*.wxml', recursive=True):
    if 'node_modules' in f:
        continue
    s = open(f, encoding='utf-8').read()
    if 'openPicker' not in s:
        continue
    js = f[:-5] + '.js'
    if not os.path.exists(js):
        rows.append((f, '无 js', 0, 0, ''))
        continue
    j = open(js, encoding='utf-8').read()
    # 找 openPicker 定义体的前 200 字符，判断它读的是 dataset.key 还是 dataset.handler
    m = re.search(r'openPicker\s*[:(]\s*(?:function\s*)?\([^)]*\)\s*\{', j)
    body = j[m.end():m.end() + 320] if m else ''
    reads = []
    if re.search(r'dataset\s*\.\s*key', body):
        reads.append('key')
    if re.search(r'dataset\s*\.\s*handler', body) or 'ds.handler' in body:
        reads.append('handler')
    nk = len(re.findall(r'data-key=', s))
    nh = len(re.findall(r'data-handler=', s))
    rows.append((f, '+'.join(reads) or '?', nk, nh, '有 _openPickerByKey' if '_openPickerByKey' in j else ''))

print(f"{'文件':<52} {'openPicker读':<14} {'data-key':>8} {'data-handler':>12}")
for f, reads, nk, nh, extra in sorted(rows):
    print(f"{f:<52} {reads:<14} {nk:>8} {nh:>12}  {extra}")

print('\n=== 需要修的（同一文件里两种 data-* 并存）===')
for f, reads, nk, nh, extra in rows:
    if nk and nh:
        print(f"  ⚠️ {f}  data-key={nk} data-handler={nh}")

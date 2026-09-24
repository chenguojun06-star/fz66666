#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""去掉重复的 onPickerClose 定义（保留最后一个 —— 通用块里的那个）。"""
import io
import glob
import os
import re

MP = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram'))


def find_method(src, name):
    m = re.search(r'\n(\s*)' + re.escape(name) + r'\s*[:(]', src)
    if not m:
        return None
    b = src.find('{', m.end())
    if b < 0:
        return None
    depth = 0
    i = b
    while i < len(src):
        c = src[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                if src[end:end + 1] == ',':
                    end += 1
                return (m.start(), end)
        i += 1
    return None


n = 0
for js in sorted(glob.glob(os.path.join(MP, '**', '*.js'), recursive=True)):
    if 'node_modules' in js or 'components/search-picker' in js:
        continue
    src = io.open(js, encoding='utf-8').read()
    if len(re.findall(r'\n\s*onPickerClose\s*[:(]', src)) < 2:
        continue
    # 删到只剩一个
    while len(re.findall(r'\n\s*onPickerClose\s*[:(]', src)) > 1:
        r = find_method(src, 'onPickerClose')
        if not r:
            break
        src = src[:r[0]] + src[r[1]:]
    io.open(js, 'w', encoding='utf-8').write(src)
    rel = os.path.relpath(js, MP).replace(os.sep, '/')
    left = len(re.findall(r'\n\s*onPickerClose\s*[:(]', src))
    print(f'  ✅ {rel}  → 剩 {left} 个')
    n += 1
print(f'\n清理 {n} 个文件')

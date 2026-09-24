#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把误注入到 Component 对象末尾的通用 openPicker 块搬回 methods: {} 内部。

组件（Component({...})）的方法必须写在 methods 里；注入到对象顶层会变成
"组件属性"而不是方法 → this.openPicker is not a function，页面点了没反应。
（页面 Page({...}) 无此问题，方法本来就是顶层。）
"""
import io
import os
import re

MP = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram'))
MARK = '/* ── D-533：可搜索选择器的**统一入口**'

for rel in ['components/material-inbound-form/index.js', 'components/material-outbound-form/index.js']:
    p = os.path.join(MP, rel)
    s = io.open(p, encoding='utf-8').read()

    if 'Component(' not in s:
        print(f'  ⏭  {rel} 不是组件，跳过')
        continue

    start = s.find('  ' + MARK)
    end = s.rfind('\n});')
    if start < 0 or end < 0 or start > end:
        print(f'  ⏭  {rel} 未找到注入块')
        continue

    block = s[start:end]
    s2 = s[:start] + s[end:]

    m = re.search(r'\n  methods:\s*\{', s2)
    if not m:
        print(f'  ❌ {rel} 找不到 methods')
        continue
    b = s2.find('{', m.end() - 1)
    depth = 0
    i = b
    while i < len(s2):
        if s2[i] == '{':
            depth += 1
        elif s2[i] == '}':
            depth -= 1
            if depth == 0:
                break
        i += 1

    out = s2[:i] + block.rstrip() + '\n  ' + s2[i:]
    io.open(p, 'w', encoding='utf-8').write(out)
    print(f'  ✅ {rel}  通用块已搬进 methods')

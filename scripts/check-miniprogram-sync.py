#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
小程序三份副本一致性检查 —— 防止「只改源、忘了同步镜像」

背景（同一个坑踩了两次）：
  - D-475：修 6 处 @import 路径，**只改了 miniprogram/**，两份镜像仍带 bug
  - D-476：把 2 处相对路径统一成绝对路径，又只改了源，镜像仍是旧写法

引用完整性检查（check-miniprogram-refs.py）是**逐份独立**校验，查不出「源改了
镜像没改」—— 因为旧写法本身可能照样能解析（比如 pages/scan 是两层深，
'../../styles/x' 同样合法）。故需要专门做**三份之间的比对**。

比对范围 = 同步脚本 h5-web/scripts/sync-miniprogram.mjs 的 copyEntries：
    app.js / app.json / app.wxss / config.js / config /
    pages / components / utils / styles / assets / shared

用法：
    python3 scripts/check-miniprogram-sync.py
退出码：0 = 三份一致；1 = 有差异
"""
import filecmp
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'miniprogram')
MIRRORS = [
    os.path.join(ROOT, 'h5-web', 'source-miniapp'),
    os.path.join(ROOT, 'h5-web', 'public', 'source-miniapp'),
]

# 与同步脚本 copyEntries 保持一致
ENTRIES = [
    'app.js', 'app.json', 'app.wxss', 'config.js', 'config',
    'pages', 'components', 'utils', 'styles', 'assets', 'shared',
]

SKIP_DIRS = {'node_modules', '.git', 'miniprogram_npm', '__tests__'}


def collect(base, entry):
    """返回 {相对路径: 绝对路径}"""
    p = os.path.join(base, entry)
    out = {}
    if os.path.isfile(p):
        out[entry] = p
        return out
    if not os.path.isdir(p):
        return out
    for dirpath, dirnames, filenames in os.walk(p):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            fp = os.path.join(dirpath, f)
            out[os.path.relpath(fp, p)] = fp
    return out


def main():
    if not os.path.isdir(SRC):
        print('❌ 未找到源目录:', SRC)
        return 1

    problems = []
    for mirror in MIRRORS:
        if not os.path.isdir(mirror):
            problems.append('镜像目录不存在: %s' % os.path.relpath(mirror, ROOT))
            continue
        for entry in ENTRIES:
            a = collect(SRC, entry)
            b = collect(mirror, entry)
            if not a:
                continue  # 源里没有该条目，跳过
            for rel in sorted(set(a) | set(b)):
                label = '%s/%s' % (entry, rel) if os.path.isdir(os.path.join(SRC, entry)) else entry
                if rel not in b:
                    problems.append('镜像缺文件: %s  (%s)' % (label, os.path.relpath(mirror, ROOT)))
                elif rel not in a:
                    problems.append('镜像多出文件: %s  (%s)' % (label, os.path.relpath(mirror, ROOT)))
                elif not filecmp.cmp(a[rel], b[rel], shallow=False):
                    problems.append('内容不一致: %s  (%s)' % (label, os.path.relpath(mirror, ROOT)))

    print('小程序三份副本一致性检查')
    print('  源: %s' % os.path.relpath(SRC, ROOT))
    for m in MIRRORS:
        print('  镜像: %s' % os.path.relpath(m, ROOT))
    print()

    if problems:
        print('❌ 发现 %d 处不一致：' % len(problems))
        for p in problems[:40]:
            print('   ' + p)
        if len(problems) > 40:
            print('   ...还有 %d 处' % (len(problems) - 40))
        print()
        print('   修复：python3 -c "..." 手工同步，或跑 h5-web/scripts/sync-miniprogram.mjs')
        print('   ⚠️ 注意：sync-miniprogram.mjs 会先清空两个输出目录再全量拷贝，')
        print('      若只需同步少量文件，定向拷贝更安全。')
        return 1

    print('✅ 三份副本内容完全一致')
    return 0


if __name__ == '__main__':
    sys.exit(main())

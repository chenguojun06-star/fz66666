#!/usr/bin/env python3
"""
i18n 剩余盘点（按行上下文自动分类）

为什么需要它：`i18n-extract.py` 只按「中文字符串」计数，报数 ≠ 待翻键数。
实测偏差极大（shared 132 → 可翻 0；dashboard 85 → 可翻 5）。
本脚本按**整行上下文**把中文行分成四类，给出接近真实的待办量：

  契约  —— 拿去 ===/includes/indexOf/当 Map 键/数组常量 的（不可翻）
  文案  —— 出现在 toast/showModal/title/message/placeholder 等处的（可翻）
  日志  —— console.* 行（不翻）
  待定  —— 无法自动判断，需人工看（脚本会打印样例）

用法：
  python3 scripts/i18n-survey.py                 # 全量（pages + components + utils + shared）
  python3 scripts/i18n-survey.py miniprogram/pages/sales   # 指定目录

⚠️ 已知排除：miniprogram/utils/i18n/locales.generated.js 是语言包数据本身，
   含数千中文但**绝不该计入**（脚本已自动跳过）。
"""
import re
import os
import sys
import collections

CJK = re.compile(r'[\u4e00-\u9fff]')

# 契约值判据（整行命中即视为不可翻）
CONTRACT = re.compile(
    r"===|!==|includes\(|indexOf\(|match:|new Set\(|= \['|=\[|startsWith\(|endsWith\("
    r"|\.test\(|_MAP = \{|_LIST = \[|OPTIONS = \[|KEYWORDS|data-val=|PLATFORM_NAMES"
)
# 显示文案判据（整行命中即视为可翻）
DISPLAY = re.compile(
    r"toast|showModal|showToast|showLoading|title:|content:|placeholder|message:"
    r"|confirmText|cancelText|label:|hint:|desc:|text=|\.t\(|statusText|emptyText"
    r"|emptyHint|navTitle|Text:|\{\{t\.|>[^<>{}\[\]]*[\u4e00-\u9fff]"
)
# 语言包数据文件本身，跳过
SKIP_FILES = {'locales.generated.js', 'locales.generated.ts'}


def strip_noise(src):
    """剥掉块注释 / 行注释 / wxml 注释，避免把注释里的中文算进来（保留行号）"""
    src = re.sub(r'/\*[\s\S]*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), src)
    src = re.sub(r'<!--[\s\S]*?-->', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), src)
    out = []
    for line in src.split('\n'):
        i = line.find('//')
        if i >= 0 and (line[:i].count("'") + line[:i].count('"')) % 2 == 0:
            line = line[:i]
        out.append(line)
    return '\n'.join(out)


def survey(roots):
    stat = collections.defaultdict(collections.Counter)
    samples = collections.defaultdict(list)
    for root in roots:
        for dp, dn, fn in os.walk(root):
            dn[:] = [d for d in dn if d != 'node_modules']
            for f in fn:
                if not f.endswith(('.js', '.wxml')) or f in SKIP_FILES:
                    continue
                p = os.path.join(dp, f)
                rel = p.replace('miniprogram/', '')
                parts = rel.split('/')
                cluster = parts[1] if parts[0] in ('pages', 'components') and len(parts) > 1 else parts[0]
                try:
                    src = strip_noise(open(p, encoding='utf-8').read())
                except Exception:
                    continue
                for i, line in enumerate(src.split('\n'), 1):
                    if not CJK.search(line):
                        continue
                    if re.search(r'console\.(log|warn|error|info|debug)', line):
                        stat[cluster]['日志'] += 1
                        continue
                    if CONTRACT.search(line) and not DISPLAY.search(line):
                        stat[cluster]['契约'] += 1
                        continue
                    if DISPLAY.search(line):
                        stat[cluster]['文案'] += 1
                        continue
                    stat[cluster]['待定'] += 1
                    if len(samples[cluster]) < 2:
                        samples[cluster].append('%s:%d %s' % (parts[-1], i, line.strip()[:56]))
    return stat, samples


def main():
    roots = sys.argv[1:] or ['miniprogram/pages', 'miniprogram/components',
                             'miniprogram/utils', 'miniprogram/shared']
    stat, samples = survey(roots)
    print('%-24s%6s%6s%6s%6s' % ('簇', '契约', '文案', '日志', '待定'))
    print('-' * 48)
    tot = collections.Counter()
    rows = [(k, v) for k, v in stat.items() if v['文案'] + v['待定'] > 0]
    for k, v in sorted(rows, key=lambda x: -(x[1]['文案'] + x[1]['待定'])):
        print('%-24s%6d%6d%6d%6d' % (k, v['契约'], v['文案'], v['日志'], v['待定']))
        tot.update(v)
    print('-' * 48)
    print('%-24s%6d%6d%6d%6d' % ('合计', tot['契约'], tot['文案'], tot['日志'], tot['待定']))
    print()
    print('→ 真活儿 ≈ 文案 + 待定（待定需人工复核，其中常混着契约值）')
    print()
    print('=== 待定样例（需人工判断）===')
    for k, arr in samples.items():
        if arr:
            print('  [%s]' % k)
            for x in arr:
                print('    ', x)


if __name__ == '__main__':
    main()

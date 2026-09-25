#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
i18n 键注入器（D-548）

把一个「翻译表」合并进 `shared-locales/source/*.json`，并重新生成产物。

翻译表格式（JSON）：
    {
      "mp.warehouse.locationScan.title": {
        "zh-CN": "点击扫码查询库位库存",
        "en-US": "Tap to scan location stock",
        "vi-VN": "Nhấn để quét tồn kho vị trí",
        "km-KH": "Tap to scan location stock"
      }
    }

键命名规范（本脚本强制校验）：
    miniprogram 页面 → mp.<group>.<pageCamel>.<key>
        group = pages/ 下第二段目录名；pageCamel = 其余段 camelCase 拼接
        例：pages/warehouse/location-scan/ → mp.warehouse.locationScan.*
            pages/warehouse/finished-inventory/detail/ → mp.warehouse.finishedInventoryDetail.*
    PC 页面 → pc.<module>.<pageCamel>.<key>
        例：modules/warehouse/pages/MaterialInventory/ → pc.warehouse.materialInventory.*
    跨页共用 → common.<key>

为什么强制前缀：语言包会长到上万键，没有命名规范必然碎片化
（同一个「确定」出现 50 份），后期无法维护、无法保证翻译一致。

安全保证：
  - 默认 --dry-run，只报告不写文件
  - 键冲突检测：已存在的键**默认拒绝覆盖**（--overwrite 才改）
  - 写完自动校验 4 语言键集合一致 + 调 check-i18n-keys.py
  - 不破坏原有键顺序（新键追加到对应子树末尾）

用法：
    python3 scripts/i18n-add-keys.py /tmp/keys.json --dry-run
    python3 scripts/i18n-add-keys.py /tmp/keys.json --apply
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, 'shared-locales', 'source')
LANGS = ['zh-CN', 'en-US', 'vi-VN', 'km-KH']

# 允许的顶层命名空间前缀
VALID_PREFIXES = ('mp.', 'pc.', 'common.', 'status.', 'language.', 'login.', 'layout.', 'menu.', 'tabbar.', 'admin.')


def validate_key(key):
    """校验键命名是否符合规范"""
    if not any(key.startswith(p) for p in VALID_PREFIXES):
        return f'顶层命名空间不合法（需属于 {"/".join(p[:-1] for p in VALID_PREFIXES)}）'
    if not re.match(r'^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$', key):
        return '键路径只允许 [A-Za-z0-9] 段，用 . 分隔'
    return None


def set_by_path(tree, key, value):
    """按点路径写入；已存在的叶子返回 False（不覆盖）"""
    parts = key.split('.')
    node = tree
    for p in parts[:-1]:
        if p not in node:
            node[p] = {}
        if not isinstance(node[p], dict):
            return None  # 中间节点是叶子，路径冲突
        node = node[p]
    last = parts[-1]
    if last in node:
        return False
    node[last] = value
    return True


def get_by_path(tree, key):
    node = tree
    for p in key.split('.'):
        if not isinstance(node, dict) or p not in node:
            return None
        node = node[p]
    return node


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('keys_file', help='翻译表 JSON')
    ap.add_argument('--apply', action='store_true', help='实际写入（默认 dry-run）')
    ap.add_argument('--overwrite', action='store_true', help='允许覆盖已存在的键')
    args = ap.parse_args()

    with open(args.keys_file, encoding='utf-8') as fh:
        table = json.load(fh)

    # ---- 校验 ----
    errors = []
    for key, trans in table.items():
        err = validate_key(key)
        if err:
            errors.append(f'{key}: {err}')
        if not isinstance(trans, dict):
            errors.append(f'{key}: 值必须是 {{lang: text}} 对象')
            continue
        missing = [l for l in LANGS if l not in trans]
        if missing:
            errors.append(f'{key}: 缺少语言 {missing}')
        for l, v in trans.items():
            if not isinstance(v, str) or not v.strip():
                errors.append(f'{key}.{l}: 空值')
    if errors:
        print('❌ 翻译表校验未通过：')
        for e in errors:
            print('   ', e)
        return 1
    print(f'✅ 翻译表校验通过：{len(table)} 个键')

    # ---- 读入 4 语言 ----
    trees = {}
    for lang in LANGS:
        p = os.path.join(SOURCE_DIR, f'{lang}.json')
        trees[lang] = json.loads(open(p, encoding='utf-8').read())

    # ---- 冲突检测 ----
    conflicts, added = [], []
    for key in table:
        existing = {l: get_by_path(trees[l], key) for l in LANGS}
        present = [l for l in LANGS if existing[l] is not None]
        if present:
            conflicts.append((key, {l: existing[l] for l in present}))
        else:
            added.append(key)

    if conflicts:
        print(f'\n⚠️  {len(conflicts)} 个键已存在：')
        for key, ex in conflicts[:20]:
            print(f'   {key}  = {list(ex.values())[0]!r}')
        if not args.overwrite:
            print('\n   默认不覆盖。确认要改请加 --overwrite；确认要跳过请把冲突键从翻译表里删掉。')
            return 1

    print(f'\n待新增 {len(added)} 个键' + (f'，覆盖 {len(conflicts)} 个' if conflicts else ''))

    if not args.apply:
        print('\n（dry-run，未写入。确认无误后加 --apply）')
        for key in added[:40]:
            print(f'   + {key}  = {table[key]["zh-CN"]}')
        if len(added) > 40:
            print(f'   ... 另有 {len(added) - 40} 个')
        return 0

    # ---- 写入 ----
    for lang in LANGS:
        tree = trees[lang]
        for key in table:
            val = table[key][lang]
            if key in added:
                ok = set_by_path(tree, key, val)
                if ok is None:
                    print(f'❌ {key} 路径冲突（中间节点已是叶子）')
                    return 1
            else:  # 覆盖
                parts = key.split('.')
                node = tree
                for p in parts[:-1]:
                    node = node.setdefault(p, {})
                node[parts[-1]] = val
        p = os.path.join(SOURCE_DIR, f'{lang}.json')
        with open(p, 'w', encoding='utf-8') as fh:
            fh.write(json.dumps(tree, ensure_ascii=False, indent=2) + '\n')
        print(f'  写入 {lang}.json')

    # ---- 重新生成产物 ----
    node_bin = os.environ.get('NODE_BIN', 'node')
    r = subprocess.run([node_bin, os.path.join(ROOT, 'scripts', 'sync-locales.js')],
                       capture_output=True, text=True, cwd=ROOT)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode != 0:
        return r.returncode

    # ---- 同步 h5-web 两份镜像 ----
    src = os.path.join(ROOT, 'miniprogram', 'utils', 'i18n', 'locales.generated.js')
    for mirror in ['h5-web/source-miniapp/utils/i18n/locales.generated.js',
                   'h5-web/public/source-miniapp/utils/i18n/locales.generated.js']:
        dst = os.path.join(ROOT, mirror)
        with open(src, encoding='utf-8') as a, open(dst, 'w', encoding='utf-8') as b:
            b.write(a.read())
    print('  已同步 h5-web 两份镜像')

    # ---- 自检 ----
    print()
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'check-i18n-keys.py')],
                       capture_output=True, text=True, cwd=ROOT)
    print(r.stdout.strip())
    return r.returncode


if __name__ == '__main__':
    sys.exit(main())

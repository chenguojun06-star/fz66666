#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
小程序「引用完整性」检查 —— 凡是写了路径的地方，都验证目标是否真的存在。

动机（2026-09-20）：两天内连出 3 次引用类故障，都是"编译/运行时才暴露"：
  1. design-tokens.wxss 自定义属性写在规则块外 → 整个 token 文件编译失败
  2. 6 个三层深页面用 ../../styles/ 引共享样式 → 层级写浅，文件找不到（D-475）
  3. 备份脚本与服务器上未跟踪文件同名 → git pull 被拒，部署停摆
本脚本把这类问题**提前**跑出来，比等开发者工具报错再排查省事得多。

用法：
    python3 scripts/check-miniprogram-refs.py            # 检查
    python3 scripts/check-miniprogram-refs.py --strict   # 页面缺 .json 也算错误

退出码：0 = 无错误；1 = 有错误（可接 CI / pre-commit）

检查项：
  ① app.json 声明的页面（含分包）：.js / .wxml 必须存在；.json 缺失仅提示
  ② 所有 usingComponents（全局 + 页面级）：路径可解析（组件路径**不带扩展名**）
  ③ tabBar 图标：iconPath / selectedIconPath 存在
  ④ 所有 .wxss 的 @import：目标存在（**先剥注释**再匹配，避免文档示例误报）
  ⑤ 所有 .js 的 require()：目标存在（相对/绝对路径；常省略 .js，也可能是目录）
     —— 裸模块名（npm 包、node: 内建）无法静态解析，跳过
  ⑥ WXML 的 <import>/<include> src：目标存在

编写注意（前两版都因这些误报过）：
  - 匹配前**必须先剥注释**，否则文档注释里的使用示例会被当成真的引用
  - 组件路径**不带扩展名**，要补 .js/.json/.wxml/.wxss 判断
  - 页面 .json 在小程序里**可省略**（走全局默认），不能算错误
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MP = os.path.join(ROOT, 'miniprogram')

# 组件路径合法形态：目录（含 index.*）或 无扩展名的同名文件组
COMP_EXTS = ('.js', '.json', '.wxml', '.wxss')
# 这些目录不参与检查
SKIP_DIRS = {'node_modules', 'miniprogram_npm', '.git'}


def load_json(path):
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except Exception:
        return None


def strip_comments(text):
    """必须先剥注释：文档注释里的使用示例会被正则当成真的 @import。"""
    return re.sub(r'/\*.*?\*/', '', text, flags=re.S)


def strip_js_comments(text):
    """
    剥 JS 注释。与 WXSS 同理 —— 注释里的示例代码会被正则当成真的 require。
    只剥 /* */ 块 与 行首 // （行尾 // 不动，避免误伤字符串里的 "https://"）。
    """
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'(?m)^\s*//.*$', '', text)


def resolve(base_dir, spec):
    """把引用路径解析成本地文件路径。 '/' 开头 = 小程序根；否则相对 base_dir。"""
    if spec.startswith('/'):
        return os.path.join(MP, spec.lstrip('/'))
    return os.path.normpath(os.path.join(base_dir, spec))


def exists_any(base):
    """组件/页面路径可能不带扩展名，逐一补后缀判断。"""
    if os.path.exists(base):
        return True
    return any(os.path.isfile(base + ext) for ext in COMP_EXTS)


def main():
    strict = '--strict' in sys.argv
    errors = []
    warns = []

    app = load_json(os.path.join(MP, 'app.json'))
    if app is None:
        print('❌ 读不到 miniprogram/app.json')
        return 1

    # ── ① 页面文件 ──────────────────────────────────────────────
    pages = [(p, '主包') for p in (app.get('pages') or [])]
    for sp in (app.get('subpackages') or app.get('subPackages') or []):
        root = sp.get('root', '')
        for p in (sp.get('pages') or []):
            pages.append((os.path.join(root, p), '分包:' + root))

    for page, src in pages:
        for ext in ('.js', '.wxml'):
            if not os.path.isfile(os.path.join(MP, page + ext)):
                errors.append('页面文件缺失  [%s] %s%s' % (src, page, ext))
        if not os.path.isfile(os.path.join(MP, page + '.json')):
            # 页面 .json 在小程序里是可省略的（走全局默认），仅提示
            msg = '页面缺 .json（可省略，走全局默认）  [%s] %s.json' % (src, page)
            (errors if strict else warns).append(msg)

    # ── ② tabBar 图标 ───────────────────────────────────────────
    for item in ((app.get('tabBar') or {}).get('list') or []):
        for key in ('iconPath', 'selectedIconPath'):
            val = item.get(key)
            if val and not os.path.isfile(resolve(MP, val)):
                errors.append('tabBar 图标缺失  %s → %s' % (key, val))

    # ── ③ usingComponents ───────────────────────────────────────
    comp_count = 0

    def check_components(mapping, where):
        nonlocal comp_count
        for name, path in (mapping or {}).items():
            if not isinstance(path, str):
                continue
            comp_count += 1
            if path.startswith('plugin://'):
                continue
            if not exists_any(resolve(MP, path)):
                errors.append('组件引用不可解析  %s  中 "%s" → %s' % (where, name, path))

    check_components(app.get('usingComponents'), 'app.json(全局)')
    for dirpath, dirnames, filenames in os.walk(MP):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith('.json'):
                continue
            if fn in ('app.json', 'project.config.json', 'sitemap.json'):
                continue
            jf = os.path.join(dirpath, fn)
            data = load_json(jf)
            if data:
                check_components(data.get('usingComponents'),
                                 os.path.relpath(jf, MP))

    # ── ④ WXSS @import ──────────────────────────────────────────
    import_count = 0
    for dirpath, dirnames, filenames in os.walk(MP):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith('.wxss'):
                continue
            wf = os.path.join(dirpath, fn)
            try:
                with open(wf, encoding='utf-8') as fh:
                    text = strip_comments(fh.read())
            except Exception:
                continue
            for m in re.finditer(r'@import\s+[\'"]([^\'"]+)[\'"]', text):
                spec = m.group(1)
                import_count += 1
                target = resolve(dirpath, spec)
                if not os.path.isfile(target):
                    errors.append('@import 目标不存在  %s → %s'
                                  % (os.path.relpath(wf, MP), spec))

    # ── ⑤ JS require() 路径 ─────────────────────────────────────
    # 只查相对/绝对路径；裸模块名（npm 包、node: 内建）无法静态解析，跳过。
    require_count = 0
    for dirpath, dirnames, filenames in os.walk(MP):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith('.js'):
                continue
            jf = os.path.join(dirpath, fn)
            try:
                with open(jf, encoding='utf-8') as fh:
                    text = strip_js_comments(fh.read())
            except Exception:
                continue
            for m in re.finditer(r"""require\(\s*['"]([^'"]+)['"]\s*\)""", text):
                spec = m.group(1)
                if not (spec.startswith('.') or spec.startswith('/')):
                    continue          # 裸模块名：npm / node: 内建
                if spec.startswith('node:'):
                    continue
                require_count += 1
                target = resolve(dirpath, spec)
                # 小程序的 require 常省略扩展名，也可能指向目录
                if (os.path.isfile(target)
                        or os.path.isfile(target + '.js')
                        or os.path.isfile(os.path.join(target, 'index.js'))):
                    continue
                errors.append('require 目标不存在  %s → %s'
                              % (os.path.relpath(jf, MP), spec))

    # ── ⑥ WXML <import>/<include> src ────────────────────────────
    wxml_count = 0
    for dirpath, dirnames, filenames in os.walk(MP):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith('.wxml'):
                continue
            xf = os.path.join(dirpath, fn)
            try:
                with open(xf, encoding='utf-8') as fh:
                    text = fh.read()
            except Exception:
                continue
            for m in re.finditer(r'<(import|include)\s+src=["\']([^"\']+)["\']', text):
                spec = m.group(2)
                wxml_count += 1
                target = resolve(dirpath, spec)
                if not (os.path.isfile(target) or os.path.isfile(target + '.wxml')):
                    errors.append('WXML <%s> 目标不存在  %s → %s'
                                  % (m.group(1), os.path.relpath(xf, MP), spec))

    # ── 报告 ────────────────────────────────────────────────────
    print('小程序引用完整性检查')
    print('  页面 %d 个（主包+分包）' % len(pages))
    print('  组件引用 %d 处' % comp_count)
    print('  @import %d 处' % import_count)
    print('  require %d 处（相对/绝对；裸模块名跳过）' % require_count)
    print('  WXML import/include %d 处' % wxml_count)
    print()

    if errors:
        print('❌ 发现 %d 处错误：' % len(errors))
        for e in errors:
            print('   ' + e)
    else:
        print('✅ 无错误：所有引用均可解析')

    if warns:
        print()
        print('⚠️ 提示 %d 条（不影响运行，--strict 可升级为错误）：' % len(warns))
        for w in warns:
            print('   ' + w)

    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())

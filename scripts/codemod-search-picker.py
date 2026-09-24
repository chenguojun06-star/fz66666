#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把小程序里的原生 <picker mode="selector"> 批量替换为可搜索的 <search-picker>。

设计要点（为什么用 data-* 传参而不是在 JS 里维护映射表）：
  wxml 上带 data-handler / data-names / data-range-key，
  JS 只需注入**同一套**通用 openPicker / onPickerSelect / onPickerClose，
  不需要每个页面各写一份映射 —— 少了 19 处手写映射，就少了 19 处出错机会。
  选中后仍回调页面原有的 onXxxChange，既有逻辑一行不改。

用法：
  python3 scripts/codemod-search-picker.py            # dry-run，只报告
  python3 scripts/codemod-search-picker.py --apply    # 实际写入
"""
import io
import json
import os
import re
import sys

MP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram')
MP = os.path.normpath(MP)

APPLY = '--apply' in sys.argv

# 不动的文件：
#  - date-picker 内部的年月日 picker 是日期选择器本体，换成搜索反而更差
#  - no-data-create 是**死代码页**：index.js 只有 11 行，onLoad 直接 redirect 到
#    order/create/form，WXML 永远不会被渲染（且其 picker 的 bindchange 指向
#    根本不存在的方法）。要清理应该整页删掉，不该在这里转。
SKIP_FILES = {
    'components/common/date-picker/index.wxml',
    'pages/order/no-data-create/index.wxml',
}

METHODS = '''
  /* ── D-533：可搜索选择器（原生 picker 没有搜索，选项多时只能一路滚）────────
     由 scripts/codemod-search-picker.py 注入，各页面内容一致。
     选中后回调页面原有的 onXxxChange（e.detail.value 为下标），既有逻辑不变。 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    var arr = this.data[ds.names] || [];
    var rangeKey = ds.rangeKey || '';
    var opts = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var label;
      if (rangeKey) {
        label = it ? it[rangeKey] : '';
      } else if (it && typeof it === 'object') {
        label = it.label != null ? it.label : (it.name != null ? it.name : '');
      } else {
        label = it;
      }
      label = String(label == null ? '' : label);
      if (!label) continue;
      // value 用下标 —— 选中后直接回传原 handler 需要的 e.detail.value
      opts.push({ label: label, value: String(i) });
    }
    this._pickerHandler = ds.handler || '';
    this.setData({
      pickerTitle: ds.title || '请选择',
      pickerOptions: opts,
      pickerValue: '',
      pickerVisible: true,
    });
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (!handler || typeof this[handler] !== 'function') return;
    this[handler]({ detail: { value: Number(e.detail.value) } });
  },
'''

PICKER_TAG = '''
<!-- 可搜索选择器：替代原生 picker（原生没有搜索，选项多时只能一路滚） -->
<search-picker
  visible="{{pickerVisible}}"
  title="{{pickerTitle}}"
  options="{{pickerOptions}}"
  value="{{pickerValue}}"
  bind:select="onPickerSelect"
  bind:close="onPickerClose"
/>
'''

# 匹配 <picker ...> ... </picker>（picker 不会嵌套）
PICKER_RE = re.compile(r'<picker\b([^>]*)>(.*?)</picker>', re.S)
ATTR_RE = re.compile(r'(\w[\w-]*)\s*=\s*"([^"]*)"')


def parse_attrs(s):
    return dict(ATTR_RE.findall(s))


def convert_wxml(rel, src):
    """返回 (新内容, 转换数, 警告列表)"""
    warns = []
    count = 0

    def repl(m):
        nonlocal count
        attrs = parse_attrs(m.group(1))
        inner = m.group(2)
        mode = attrs.get('mode', 'selector')
        if mode != 'selector':
            return m.group(0)  # date/time 不动
        names_m = re.search(r'\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}', attrs.get('range', ''))
        handler = attrs.get('bindchange', '')
        if not names_m or not handler:
            warns.append(f'range/bindchange 解析失败，跳过：{m.group(0)[:70]!r}')
            return m.group(0)
        names = names_m.group(1)
        range_key = attrs.get('range-key', '')

        # 把 data-* 注入到内部第一个 <view 上（保留原有 class/结构）
        vm = re.search(r'<view\b', inner)
        if not vm:
            warns.append(f'内部没有 <view>，跳过：{m.group(0)[:70]!r}')
            return m.group(0)
        data = f' bindtap="openPicker" data-handler="{handler}" data-names="{names}"'
        if range_key:
            data += f' data-range-key="{range_key}"'
        if 'disabled' in attrs:
            warns.append(f'⚠️ 原 picker 带 disabled，已忽略（{handler}）')
        new_inner = inner[:vm.end()] + data + inner[vm.end():]
        count += 1
        return new_inner

    out = PICKER_RE.sub(repl, src)

    if count and '<search-picker' not in out:
        out = out.rstrip() + '\n' + PICKER_TAG
    if count and 'pickerVisible' not in out:
        warns.append('已插入 openPicker，但 data 里可能缺少 pickerVisible/pickerTitle/pickerOptions/pickerValue')
    return out, count, warns


def convert_json(rel, src):
    try:
        j = json.loads(src)
    except Exception as ex:
        return src, 0, [f'json 解析失败：{ex}']
    uc = j.setdefault('usingComponents', {})
    if 'search-picker' in uc:
        return src, 0, []
    uc['search-picker'] = '/components/search-picker/index'
    return json.dumps(j, ensure_ascii=False, indent=2) + '\n', 1, []


def convert_js(rel, src):
    if 'openPicker' in src:
        return src, 0, []
    # 插到文件最后一个 `});` 之前 —— 即 Page({...}) 对象字面量的末尾
    idx = src.rfind('\n});')
    if idx < 0:
        return src, 0, ['找不到 `});` 结尾，未注入方法']
    # 页面 data 里要有 search-picker 需要的四个字段
    if 'pickerVisible' not in src:
        dm = re.search(r'(\n\s*)data\s*:\s*\{', src)
        if dm:
            pad = dm.group(1) + '  '
            src = (src[:dm.end()]
                   + f'\n{pad}// D-533：可搜索选择器状态（原生 picker 没有搜索）'
                   + f'\n{pad}pickerVisible: false,'
                   + f'\n{pad}pickerTitle: \'\','
                   + f'\n{pad}pickerOptions: [],'
                   + f'\n{pad}pickerValue: \'\','
                   + src[dm.end():])
            idx = src.rfind('\n});')
        else:
            return src, 0, ['找不到 data 块，未注入']
    src = src[:idx] + '\n' + METHODS + src[idx:]
    return src, 1, []


def main():
    targets = []
    for root, _dirs, files in os.walk(MP):
        if 'node_modules' in root:
            continue
        for fn in files:
            if not fn.endswith('.wxml'):
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, MP).replace(os.sep, '/')
            if rel in SKIP_FILES:
                continue
            s = io.open(full, encoding='utf-8').read()
            if re.search(r'<picker\b[^>]*>', s) and re.search(r'<picker[^>]*>.*?</picker>', s, re.S):
                # 只看 selector 型的
                if any(parse_attrs(m.group(1)).get('mode', 'selector') == 'selector'
                       for m in PICKER_RE.finditer(s)):
                    targets.append(rel)

    print(f'{"【写入】" if APPLY else "【dry-run】"} 待处理 {len(targets)} 个 wxml\n')
    total = 0
    for rel in sorted(targets):
        wxml = os.path.join(MP, rel)
        src = io.open(wxml, encoding='utf-8').read()
        out, n, warns = convert_wxml(rel, src)
        if n == 0:
            print(f'  ⏭  {rel}  （0 个可转换）')
            for w in warns:
                print(f'        {w}')
            continue
        total += n
        print(f'  ✅ {rel}  → {n} 个 picker')

        # 校验：每个 data-handler 都要在对应 js 里真实存在
        js_path = wxml[:-5] + '.js'
        js_src = io.open(js_path, encoding='utf-8').read() if os.path.exists(js_path) else ''
        for h in set(re.findall(r'data-handler="([^"]+)"', out)):
            if h not in js_src:
                print(f'        ❌ data-handler="{h}" 在 {os.path.basename(js_path)} 里不存在！')

        for w in warns:
            print(f'        {w}')

        if not APPLY:
            continue

        io.open(wxml, 'w', encoding='utf-8').write(out)
        js_out, jn, jw = convert_js(rel, js_src)
        for w in jw:
            print(f'        ⚠️ js: {w}')
        if jn:
            io.open(js_path, 'w', encoding='utf-8').write(js_out)
        json_path = wxml[:-5] + '.json'
        if os.path.exists(json_path):
            jj = io.open(json_path, encoding='utf-8').read()
            jout, cn, cw = convert_json(rel, jj)
            for w in cw:
                print(f'        ⚠️ json: {w}')
            if cn:
                io.open(json_path, 'w', encoding='utf-8').write(jout)
        else:
            io.open(json_path, 'w', encoding='utf-8').write(
                json.dumps({'usingComponents': {'search-picker': '/components/search-picker/index'}},
                           ensure_ascii=False, indent=2) + '\n')
            print('        ＋ 新建了 index.json（原先没有）')

    print(f'\n合计转换 {total} 个 picker')


if __name__ == '__main__':
    main()

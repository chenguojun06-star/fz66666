#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一 openPicker / onPickerSelect 入口，消除"东一个西一个"。

背景：仓里存在两套 search-picker 用法
  A. D-517 时期：<view bindtap="openPicker" data-key="X"> + 页面自写 openPicker
     里 switch(key)，onPickerSelect 里 switch(this.data.pickerKey)
  B. 本次通用式：<view bindtap="openPicker" data-handler="onXChange" data-names="xOptions">
     + 注入的通用 openPicker / onPickerSelect

两套共用同一批 data 字段（pickerVisible/pickerTitle/pickerOptions/pickerValue），
UI 也完全是同一个 search-picker，但入口实现分叉 —— 同一个文件里混用时，
B 的行会调到 A 的实现（switch 不到）→ **点了没反应**。

本脚本做法（行为零变更，只统一入口）：
  1. 把 A 的 openPicker    重命名为 _openPickerByKey
  2. 把 A 的 onPickerSelect 重命名为 _onPickerSelectByKey
  3. 删除所有旧的 openPicker / onPickerSelect 定义
  4. 注入**唯一一个**带分派的通用 openPicker / onPickerSelect：
       有 data-handler → 走通用逻辑
       只有 data-key   → 委托给 _openPickerByKey / _onPickerSelectByKey
  5. 确保 onPickerClose 与 picker* data 字段存在

用法：python3 scripts/unify-openpicker.py [--apply]
"""
import io
import glob
import os
import re
import sys

APPLY = '--apply' in sys.argv
MP = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'miniprogram'))

UNIVERSAL = '''  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (!ds.handler && typeof this._openPickerByKey === 'function') {
      return this._openPickerByKey(e);
    }
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

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (handler && typeof this[handler] === 'function') {
      this[handler]({ detail: { value: Number(e.detail.value) } });
      return;
    }
    if (typeof this._onPickerSelectByKey === 'function') {
      return this._onPickerSelectByKey(e);
    }
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },
'''


def find_method(src, name):
    """返回 (start, end) —— 方法定义从 `name` 前 2 个空格到匹配的 `},` 之后。"""
    m = re.search(r'\n(\s*)' + re.escape(name) + r'\s*[:(]', src)
    if not m:
        return None
    # 从签名后的第一个 { 开始做花括号计数
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


def body_of(src, name):
    r = find_method(src, name)
    return src[r[0]:r[1]] if r else ''


def main():
    targets = sorted(glob.glob(os.path.join(MP, '**', '*.js'), recursive=True))
    # 组件自身不能被注入 openPicker（它的文档注释里就写着 openPicker 用法）
    skip = {'components/search-picker/index.js'}
    changed = []
    for js in targets:
        if 'node_modules' in js:
            continue
        rel = os.path.relpath(js, MP).replace(os.sep, '/')
        if rel in skip:
            continue
        src = io.open(js, encoding='utf-8').read()
        # ⚠️ 判据看 **wxml** 里有没有 openPicker，而不是 js ——
        #    有的页面 wxml 已改好、js 还没注入（否则会被漏掉）
        wxml = js[:-3] + '.wxml'
        if not os.path.exists(wxml):
            continue
        if 'openPicker' not in io.open(wxml, encoding='utf-8').read():
            continue
        orig = src

        # ① A 的 openPicker → _openPickerByKey
        ob = body_of(src, 'openPicker')
        renamed = []
        if ob and re.search(r'dataset\s*\.\s*key', ob) and '_openPickerByKey' not in src:
            r = find_method(src, 'openPicker')
            src = src[:r[0]] + src[r[0]:r[1]].replace('openPicker', '_openPickerByKey', 1) + src[r[1]:]
            renamed.append('_openPickerByKey')

        # ② A 的 onPickerSelect → _onPickerSelectByKey
        sb = body_of(src, 'onPickerSelect')
        if sb and re.search(r'this\.data\.pickerKey', sb) and '_onPickerSelectByKey' not in src:
            r = find_method(src, 'onPickerSelect')
            src = src[:r[0]] + src[r[0]:r[1]].replace('onPickerSelect', '_onPickerSelectByKey', 1) + src[r[1]:]
            renamed.append('_onPickerSelectByKey')

        # ③ 删掉所有旧的 openPicker / onPickerSelect 定义（保留 onPickerClose）
        for nm in ('openPicker', 'onPickerSelect'):
            while True:
                r = find_method(src, nm)
                if not r:
                    break
                src = src[:r[0]] + src[r[1]:]

        # ④ 注入唯一入口
        idx = src.rfind('\n});')
        if idx < 0:
            print(f'  ⚠️ {rel} 找不到 `}});`，跳过')
            continue
        src = src[:idx] + '\n' + UNIVERSAL + src[idx:]

        # ⑤ data 字段
        if 'pickerVisible' not in src:
            dm = re.search(r'(\n\s*)data\s*:\s*\{', src)
            if dm:
                pad = dm.group(1) + '  '
                src = (src[:dm.end()]
                       + f"\n{pad}// D-533：可搜索选择器状态"
                       + f"\n{pad}pickerVisible: false,"
                       + f"\n{pad}pickerTitle: '',"
                       + f"\n{pad}pickerOptions: [],"
                       + f"\n{pad}pickerValue: '',"
                       + src[dm.end():])

        if src != orig:
            changed.append((rel, renamed))
            if APPLY:
                io.open(js, 'w', encoding='utf-8').write(src)

    print(f'{"【写入】" if APPLY else "【dry-run】"} 将统一 {len(changed)} 个文件\n')
    for rel, renamed in changed:
        tag = ('  旧分支改名为 ' + ', '.join(renamed)) if renamed else ''
        print(f'  ✅ {rel}{tag}')
    print(f'\n合计 {len(changed)} 个文件')


if __name__ == '__main__':
    main()

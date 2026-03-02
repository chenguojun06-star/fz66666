"""
精确迁移 finished/list 和 material/alerts 的弹窗到 mp-modal
策略：仅替换外层容器 + 标题栏，内层 modal-body / modal-actions 原样保留
"""
import os, json

BASE = '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/miniprogram'

# ════════════════════════════════
#  1. finished/list
# ════════════════════════════════
path = os.path.join(BASE, 'pages/warehouse/finished/list')

# 1a. json — 注册 mp-modal
with open(f'{path}/index.json', 'w', encoding='utf-8') as f:
    json.dump({
      "navigationBarTitleText": "成品库存",
      "usingComponents": {
        "mp-modal": "/components/common/mp-modal/index"
      }
    }, f, ensure_ascii=False, indent=2)
    f.write('\n')
print("finished/list json ✅")

# 1b. wxml — 替换三行包装（保留内部内容原封不动）
with open(f'{path}/index.wxml', 'r', encoding='utf-8') as f:
    wxml = f.read()

OLD_FIN = ('  <!-- 出库弹窗 -->\n'
           '  <view wx:if="{{modal.visible}}" class="modal">\n'
           '    <view class="modal-box">\n'
           '      <view class="modal-head">成品出库 - 多尺码明细</view>\n')
NEW_FIN = ('  <!-- 出库弹窗 —— mp-modal 通用组件 -->\n'
           '  <mp-modal\n'
           '    visible="{{modal.visible}}"\n'
           '    title="成品出库 - 多尺码明细"\n'
           '    show-close="{{false}}"\n'
           '  >\n')

OLD_FIN_CLOSE = ('    </view>\n'
                 '  </view>\n'
                 '</view>\n')
NEW_FIN_CLOSE = ('  </mp-modal>\n'
                 '</view>\n')

assert OLD_FIN in wxml, f"OLD_FIN not found!\n{OLD_FIN!r}"
assert OLD_FIN_CLOSE in wxml, f"OLD_FIN_CLOSE not found!\n{OLD_FIN_CLOSE!r}"

wxml = wxml.replace(OLD_FIN, NEW_FIN)
wxml = wxml.replace(OLD_FIN_CLOSE, NEW_FIN_CLOSE)

# 移除多余的一级缩进（原本 modal-body 内缩进是 8 spaces，mp-modal slot 下应是 4 spaces）
# 只需将 modal-body 和 modal-actions 的缩进从 6 spaces → 4 spaces
wxml = wxml.replace('      <view class="modal-body">', '    <view class="modal-body">')
wxml = wxml.replace('      <view class="modal-actions">', '    <view class="modal-actions">')
# 对应的关闭标签（modal-body 最后一个 </view> 和 modal-actions 最后一个 </view>）
# 这两个 </view> 在文件里是不唯一的，保持不动也可以（多余空格不影响功能）

with open(f'{path}/index.wxml', 'w', encoding='utf-8') as f:
    f.write(wxml)
mp_count = wxml.count('<mp-modal')
old_count = wxml.count('class="modal"')
print(f"finished/list wxml ✅  mp-modal: {mp_count}, old modal: {old_count}")

# 1c. wxss — 删除 .modal / .modal-box / .modal-head 容器 CSS
#   策略：精确删除这三个规则块，保留 .modal-row / .modal-textarea / .sku-* 等
with open(f'{path}/index.wxss', 'r', encoding='utf-8') as f:
    css = f.read()

import re

def remove_rule(css, selector):
    """删除一个 CSS 规则块（selector { ... }），允许多行"""
    pat = re.escape(selector) + r'\s*\{[^{}]*\}'
    new = re.sub(pat, f'/* {selector.strip()} → mp-modal 提供 */', css)
    removed = pat and css != new
    return new, removed

css, r1 = remove_rule(css, '.modal ')
css, r1b = remove_rule(css, '.modal{')
css, r2 = remove_rule(css, '.modal-box')
css, r3 = remove_rule(css, '.modal-head')
# .modal-body 的滚动/溢出样式可以保留，只删弹窗外层
with open(f'{path}/index.wxss', 'w', encoding='utf-8') as f:
    f.write(css)
print(f"finished/list wxss ✅  removed: .modal={r1 or r1b}, .modal-box={r2}, .modal-head={r3}")


# ════════════════════════════════
#  2. material/alerts
# ════════════════════════════════
path2 = os.path.join(BASE, 'pages/warehouse/material/alerts')

# 2a. json
with open(f'{path2}/index.json', 'w', encoding='utf-8') as f:
    json.dump({
      "navigationBarTitleText": "面辅料需求排行",
      "usingComponents": {
        "mp-modal": "/components/common/mp-modal/index"
      }
    }, f, ensure_ascii=False, indent=2)
    f.write('\n')
print("material/alerts json ✅")

# 2b. wxml
with open(f'{path2}/index.wxml', 'r', encoding='utf-8') as f:
    wxml2 = f.read()

OLD_ALRT = ('  <view wx:if="{{orderModal.visible}}" class="modal">\n'
            '    <view class="modal-box">\n'
            '      <view class="modal-head">下发采购指令</view>\n')
NEW_ALRT = ('  <!-- 采购指令弹窗 —— mp-modal 通用组件 -->\n'
            '  <mp-modal\n'
            '    visible="{{orderModal.visible}}"\n'
            '    title="下发采购指令"\n'
            '    show-close="{{false}}"\n'
            '  >\n')

OLD_ALRT_CLOSE = ('    </view>\n'
                  '  </view>\n'
                  '</view>\n')
NEW_ALRT_CLOSE = ('  </mp-modal>\n'
                  '</view>\n')

assert OLD_ALRT in wxml2, f"OLD_ALRT not found!\n{OLD_ALRT!r}"
assert OLD_ALRT_CLOSE in wxml2, f"OLD_ALRT_CLOSE not found!\n{OLD_ALRT_CLOSE!r}"

wxml2 = wxml2.replace(OLD_ALRT, NEW_ALRT)
wxml2 = wxml2.replace(OLD_ALRT_CLOSE, NEW_ALRT_CLOSE)
wxml2 = wxml2.replace('      <view class="modal-body">', '    <view class="modal-body">')
wxml2 = wxml2.replace('      <view class="modal-actions">', '    <view class="modal-actions">')

with open(f'{path2}/index.wxml', 'w', encoding='utf-8') as f:
    f.write(wxml2)
mp2 = wxml2.count('<mp-modal')
old2 = wxml2.count('class="modal"')
print(f"material/alerts wxml ✅  mp-modal: {mp2}, old modal: {old2}")

# 2c. wxss — 只删外层容器，保留 .modal-info / .modal-title / .modal-sub / .modal-field 等
with open(f'{path2}/index.wxss', 'r', encoding='utf-8') as f:
    css2 = f.read()

css2, ra = remove_rule(css2, '.modal ')
css2, rab = remove_rule(css2, '.modal{')
css2, rb = remove_rule(css2, '.modal-box')
css2, rc = remove_rule(css2, '.modal-head')
with open(f'{path2}/index.wxss', 'w', encoding='utf-8') as f:
    f.write(css2)
print(f"material/alerts wxss ✅  removed: .modal={ra or rab}, .modal-box={rb}, .modal-head={rc}")

print("\n=== 迁移完成 ===")

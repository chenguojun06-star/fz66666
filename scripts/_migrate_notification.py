"""
迁移 admin/notification 两个弹窗到 mp-modal 通用组件
从 CSS show/hide 模式 → wx:if + mp-modal
"""
import os, json

BASE = '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/miniprogram'
path = os.path.join(BASE, 'pages/admin/notification')

# ── 1. index.json ──
old_json = json.load(open(f'{path}/index.json', encoding='utf-8'))
old_json['usingComponents'] = {
    "mp-modal": "/components/common/mp-modal/index"
}
with open(f'{path}/index.json', 'w', encoding='utf-8') as f:
    json.dump(old_json, f, ensure_ascii=False, indent=2)
    f.write('\n')
print("json ✅")

# ── 2. index.wxml ──
with open(f'{path}/index.wxml', 'r', encoding='utf-8') as f:
    wxml = f.read()

# ── 批准弹窗 ──
OLD_APPROVE = (
    '  <!-- 批准弹窗 -->\n'
    '  <view class="modal {{showApprovalModal ? \'show\' : \'\'}}" catchtouchmove="preventMove">\n'
    '    <view class="modal-mask" bindtap="cancelApprove"></view>\n'
    '    <view class="modal-content">\n'
    '      <view class="modal-header">\n'
    '        <view class="modal-title">批准用户</view>\n'
    '        <view class="modal-close" bindtap="cancelApprove">✕</view>\n'
    '      </view>\n'
)
NEW_APPROVE = (
    '  <!-- 批准弹窗 —— mp-modal 通用组件 -->\n'
    '  <mp-modal\n'
    '    visible="{{showApprovalModal}}"\n'
    '    title="批准用户"\n'
    '    show-close="{{true}}"\n'
    '    bind:close="cancelApprove"\n'
    '  >\n'
)

# 批准弹窗结束: 关闭 modal-content 和 modal（外层 view）
OLD_APPROVE_CLOSE = (
    '    </view>\n'          # closes modal-content
    '  </view>\n'            # closes modal (that's approval modal)
    '\n'
    '  <!-- 拒绝弹窗 -->'
)
NEW_APPROVE_CLOSE = (
    '  </mp-modal>\n'
    '\n'
    '  <!-- 拒绝弹窗 -->'
)

# ── 拒绝弹窗 ──
OLD_REJECT = (
    '  <view class="modal {{showRejectModal ? \'show\' : \'\'}}" catchtouchmove="preventMove">\n'
    '    <view class="modal-mask" bindtap="cancelReject"></view>\n'
    '    <view class="modal-content">\n'
    '      <view class="modal-header">\n'
    '        <view class="modal-title">拒绝用户</view>\n'
    '        <view class="modal-close" bindtap="cancelReject">✕</view>\n'
    '      </view>\n'
)
NEW_REJECT = (
    '  <!-- 拒绝弹窗 —— mp-modal 通用组件 -->\n'
    '  <mp-modal\n'
    '    visible="{{showRejectModal}}"\n'
    '    title="拒绝用户"\n'
    '    show-close="{{true}}"\n'
    '    bind:close="cancelReject"\n'
    '  >\n'
)

OLD_REJECT_CLOSE = (
    '    </view>\n'
    '  </view>\n'
    '</view>\n'
)
NEW_REJECT_CLOSE = (
    '  </mp-modal>\n'
    '</view>\n'
)

# 验证并替换
for name, old, new in [
    ('APPROVE_OPEN',  OLD_APPROVE,       NEW_APPROVE),
    ('APPROVE_CLOSE', OLD_APPROVE_CLOSE, NEW_APPROVE_CLOSE),
    ('REJECT_OPEN',   OLD_REJECT,        NEW_REJECT),
    ('REJECT_CLOSE',  OLD_REJECT_CLOSE,  NEW_REJECT_CLOSE),
]:
    assert old in wxml, f"❌ {name} not found in wxml"
    wxml = wxml.replace(old, new)
    print(f"  {name} replaced ✅")

with open(f'{path}/index.wxml', 'w', encoding='utf-8') as f:
    f.write(wxml)
mp_count = wxml.count('<mp-modal')
old_count = wxml.count('class="modal')
print(f"wxml ✅  mp-modal: {mp_count}, old modal class: {old_count}")

# ── 3. index.wxss ──
import re
with open(f'{path}/index.wxss', 'r', encoding='utf-8') as f:
    css = f.read()

def remove_rule(css, selector):
    pat = re.escape(selector.strip()) + r'\s*\{[^{}]*\}'
    new = re.sub(pat, f'/* {selector.strip()} → mp-modal */', css)
    return new, css != new

# 删除弹窗容器 CSS（保留 modal-body / modal-footer / modal-btn 等内容CSS）
for sel in ['.modal ', '.modal.show', '.modal-mask', '.modal-content', '.modal-header', '.modal-title', '.modal-close']:
    css, removed = remove_rule(css, sel)
    if removed:
        print(f"  removed {sel.strip()} ✅")

with open(f'{path}/index.wxss', 'w', encoding='utf-8') as f:
    f.write(css)
print("wxss ✅")
print("\n=== admin/notification 迁移完成 ===")

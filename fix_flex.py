with open('miniprogram/components/ai-assistant/index.wxss', 'r') as f:
    content = f.read()

content = content.replace(".chat-main { flex: 1; display: flex; flex-direction: column; height: 100%; overflow: hidden; }", ".chat-main { flex: 1; display: flex; flex-direction: column; min-height: 0; width: 100%; overflow: hidden; }")

content = content.replace(".chat-history { flex: 1; min-height: 0; height: 100%; box-sizing: border-box; padding: 24rpx; background: #f8f9fa; }", ".chat-history { flex: 1; height: 0; width: 100%; box-sizing: border-box; padding: 24rpx; background: #f8f9fa; }")

with open('miniprogram/components/ai-assistant/index.wxss', 'w') as f:
    f.write(content)

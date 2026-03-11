import os
with open('miniprogram/components/ai-assistant/index.js', 'r') as f: content = f.read()
with open('miniprogram/components/ai-assistant/index.js', 'w') as f: f.write(content.replace('},,,', '},').replace('},,', '},'))

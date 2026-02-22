import os, re
from collections import Counter

results = []
files_with_sizes = []

for root, dirs, files in os.walk('frontend/src'):
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fname in files:
        if not fname.endswith('.tsx'):
            continue
        path = os.path.join(root, fname)
        if 'ResizableModal.tsx' in path:
            continue
        content = open(path, encoding='utf-8').read()
        # Find all ResizableModal opening tag blocks (multi-line aware)
        for m in re.finditer(r'<ResizableModal(?:Any)?(\s[^>]*?)(?:/>|>)', content, re.DOTALL):
            block = m.group(1)
            dw = re.search(r'defaultWidth=["\'](.*?)["\']', block)
            dh = re.search(r'defaultHeight=["\'](.*?)["\']', block)
            w = dw.group(1) if dw else 'default(0.6vw)'
            h = dh.group(1) if dh else 'default(720px)'
            results.append((w, h))
            if dw or dh:
                short = path.replace('frontend/src/modules/', '').replace('frontend/src/', '')
                files_with_sizes.append(f'  {short}: 宽={w} 高={h}')

c = Counter(results)
print('=== 弹窗尺寸规格分布 ===')
for k,v in sorted(c.items(), key=lambda x: -x[1]):
    print(f'  {v:2d} 个  宽={k[0]}  高={k[1]}')
print(f'\n总计 {sum(c.values())} 个 ResizableModal 实例，{len(set([k[0] for k in c.keys()]))} 种宽度规格')

print('\n=== 显式指定了尺寸的弹窗 ===')
for s in sorted(set(files_with_sizes)):
    print(s)

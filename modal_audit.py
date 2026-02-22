#!/usr/bin/env python3
"""Audit all ResizableModal instances: extract file, title, current size."""
import os, re

results = []

for root, dirs, files in os.walk('frontend/src'):
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fname in files:
        if not fname.endswith('.tsx'):
            continue
        path = os.path.join(root, fname)
        if 'ResizableModal.tsx' in path:
            continue
        content = open(path, encoding='utf-8').read()
        # Find each ResizableModal opening tag (multi-line)
        for m in re.finditer(r'<ResizableModal(?:Any)?(\s[^>]*?)(?:/>|(?=>))', content, re.DOTALL):
            block = m.group(1)
            # Extract title
            title_m = re.search(r'title=\{[^}]*?["\']([^"\']+)["\']', block)
            if not title_m:
                title_m = re.search(r'title="([^"]+)"', block)
            if not title_m:
                title_m = re.search(r'title=\{([^}]+)\}', block)
            title = title_m.group(1).strip() if title_m else '?'

            # Current size props (wrong names)
            dw = re.search(r'defaultWidth=["\'](.*?)["\']', block)
            dh = re.search(r'defaultHeight=["\'](.*?)["\']', block)
            # Correct names
            w = re.search(r'\bwidth=["\'](.*?)["\']', block)
            ih = re.search(r'initialHeight=\{?([0-9]+)\}?', block)

            cur_w = dw.group(1) if dw else (w.group(1) if w else 'default')
            cur_h = dh.group(1) if dh else (ih.group(1) if ih else 'default')

            short = path.replace('frontend/src/', '')
            results.append({
                'path': path,
                'short': short,
                'title': title[:40],
                'cur_w': cur_w,
                'cur_h': cur_h,
                'has_wrong_prop': bool(dw or dh),
            })

# Print grouped by file
print(f"{'FILE':<65} {'TITLE':<42} {'W':<14} {'H':<12} WRONG?")
print('-'*155)
for r in sorted(results, key=lambda x: x['short']):
    wrong = '⚠️ WRONG PROP' if r['has_wrong_prop'] else ''
    print(f"{r['short']:<65} {r['title']:<42} {r['cur_w']:<14} {r['cur_h']:<12} {wrong}")

print(f"\n总计: {len(results)} 个 ResizableModal 实例")
print(f"错误 prop 名: {sum(1 for r in results if r['has_wrong_prop'])} 个")

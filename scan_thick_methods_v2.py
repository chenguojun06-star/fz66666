import os, re

base = '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain'
results = []

for root, dirs, files in os.walk(base):
    for f in files:
        if not f.endswith('.java'):
            continue
        filepath = os.path.join(root, f)
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as fh:
            lines = fh.readlines()

        i = 0
        while i < len(lines):
            stripped = lines[i].strip()
            m = re.match(r'(?:public|private|protected)\s+(?:static\s+)?(?:[\w<>\[\],\s]+?)\s+(\w+)\s*\(', stripped)
            if m and not stripped.startswith('//') and not stripped.startswith('*'):
                name = m.group(1)
                start = i + 1
                brace = 0
                found_open = False
                j = i
                while j < len(lines):
                    for ch in lines[j]:
                        if ch == '{':
                            brace += 1
                            found_open = True
                        elif ch == '}':
                            brace -= 1
                    if found_open and brace <= 0:
                        end = j + 1
                        length = end - start
                        if length > 80:
                            results.append((filepath, name, start, end, length))
                        break
                    j += 1
                i = j + 1 if found_open else i + 1
            else:
                i += 1

results.sort(key=lambda x: -x[4])
for filepath, name, start, end, length in results:
    short = filepath.replace(base + '/', '')
    print(f'{length:4d} lines  L{start}-L{end}  {short}  {name}()')

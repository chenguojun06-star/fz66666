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

        method_start = None
        method_name = None
        brace_count = 0
        in_method = False

        for i, line in enumerate(lines):
            stripped = line.strip()

            if not in_method:
                m = re.match(r'(?:public|private|protected)\s+(?:static\s+)?(?:[\w<>\[\],\s]+?)\s+(\w+)\s*\(', stripped)
                if m and not stripped.startswith('//') and not stripped.startswith('*'):
                    method_name = m.group(1)
                    method_start = i + 1
                    brace_count = 0
                    in_method = True
                    if '{' in stripped:
                        brace_count += stripped.count('{')
                    if '}' in stripped:
                        brace_count -= stripped.count('}')
                    if brace_count <= 0:
                        in_method = False
                        length = i + 1 - method_start + 1
                        if length > 80:
                            results.append((filepath, method_name, method_start, length))
            else:
                brace_count += stripped.count('{')
                brace_count -= stripped.count('}')
                if brace_count <= 0:
                    in_method = False
                    length = i + 1 - method_start + 1
                    if length > 80:
                        results.append((filepath, method_name, method_start, length))

results.sort(key=lambda x: -x[3])
for filepath, name, start, length in results:
    short = filepath.replace(base + '/', '')
    print(f'{length:4d} lines  {short}:{start}  {name}()')

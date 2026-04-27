import os, re

base = '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain'
results = []

SKIP_DIRS = {'intelligence', 'selection', 'integration', 'config'}

for root, dirs, files in os.walk(base):
    rel = os.path.relpath(root, base)
    parts = rel.split(os.sep)
    if any(p in SKIP_DIRS for p in parts):
        continue
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
                    line_content = lines[j]
                    in_string = False
                    in_char = False
                    in_line_comment = False
                    k = 0
                    while k < len(line_content):
                        ch = line_content[k]
                        if in_line_comment:
                            break
                        if ch == '/' and k + 1 < len(line_content) and line_content[k+1] == '/':
                            in_line_comment = True
                            break
                        if ch == '/' and k + 1 < len(line_content) and line_content[k+1] == '*':
                            end_m = line_content.find('*/', k + 2)
                            if end_m >= 0:
                                k = end_m + 2
                                continue
                            else:
                                break
                        if not in_string and not in_char:
                            if ch == '"':
                                in_string = True
                            elif ch == "'":
                                in_char = True
                            elif ch == '{':
                                brace += 1
                                found_open = True
                            elif ch == '}':
                                brace -= 1
                        else:
                            if ch == '\\' and k + 1 < len(line_content):
                                k += 2
                                continue
                            if in_string and ch == '"':
                                in_string = False
                            elif in_char and ch == "'":
                                in_char = False
                        k += 1
                    if found_open and brace <= 0:
                        end = j + 1
                        length = end - start
                        if length > 80:
                            results.append((filepath, name, start, end, length))
                        break
                    j += 1
                i = j + 1 if found_open and brace <= 0 else i + 1
            else:
                i += 1

results.sort(key=lambda x: -x[4])
for filepath, name, start, end, length in results:
    short = filepath.replace(base + '/', '')
    print(f'{length:4d} lines  L{start}-L{end}  {short}  {name}()')

import os, re

def count_method_lines(filepath):
    results = []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
    except:
        return results
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        match = re.match(r'^\s*(public|private|protected)\s+.*\s+(\w+)\s*\(', line)
        if not match:
            i += 1
            continue
        method_name = match.group(2)
        if method_name in ('equals', 'hashCode', 'toString', 'main'):
            i += 1
            continue
        start = i
        brace_count = 0
        found_brace = False
        j = i
        while j < len(lines):
            cl = lines[j].rstrip()
            brace_count += cl.count('{') - cl.count('}')
            if brace_count > 0:
                found_brace = True
            if found_brace and brace_count == 0:
                method_lines = j - start + 1
                if method_lines > 80:
                    rel_path = filepath.split('/fashion/supplychain/')[-1]
                    results.append((rel_path, start + 1, method_lines, method_name))
                i = j + 1
                break
            j += 1
        else:
            i += 1
            continue
        if not found_brace:
            i += 1
    return results

all_results = []
base = '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain'
for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith('.java'):
            fp = os.path.join(root, f)
            results = count_method_lines(fp)
            all_results.extend(results)

all_results.sort(key=lambda x: -x[2])
print(f'Total methods > 80 lines: {len(all_results)}')
print()
for path, line, count, name in all_results[:40]:
    print(f'{count:4d} lines | L{line:5d} | {name:40s} | {path}')

#!/usr/bin/env python3
import os, re

base = 'backend/src/main/java/com/fashion/supplychain'
results = []

for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith('Controller.java'):
            path = os.path.join(root, f)
            rel = os.path.relpath(path, base)
            module = rel.split('/')[0]
            classname = f.replace('.java', '')

            with open(path, 'r') as fh:
                content = fh.read()
                lines = content.split('\n')

            # Count endpoints
            endpoint_pattern = re.compile(r'@(Get|Post|Put|Delete|Patch)Mapping')
            endpoints = len(endpoint_pattern.findall(content))

            # Count PreAuthorize
            preauth = len(re.findall(r'@PreAuthorize', content))

            # Class-level check - look for @PreAuthorize before "public class"
            class_level = 'NO'
            for i, line in enumerate(lines):
                if 'public class' in line:
                    # Check previous 5 lines for @PreAuthorize
                    for j in range(max(0, i-5), i):
                        if '@PreAuthorize' in lines[j]:
                            class_level = 'YES'
                    break

            # Find methods missing @PreAuthorize
            missing_methods = []
            for i, line in enumerate(lines):
                if endpoint_pattern.search(line):
                    # Check previous 3 lines for @PreAuthorize
                    has_preauth = False
                    for j in range(max(0, i-3), i):
                        if '@PreAuthorize' in lines[j]:
                            has_preauth = True
                            break
                    if not has_preauth and class_level == 'NO':
                        # Find the method signature (next few lines)
                        for k in range(i, min(i+5, len(lines))):
                            if 'public ' in lines[k] and '(' in lines[k]:
                                sig = lines[k].strip()
                                missing_methods.append(sig)
                                break

            results.append({
                'module': module,
                'class': classname,
                'endpoints': endpoints,
                'preauth': preauth,
                'class_level': class_level,
                'path': path,
                'missing': missing_methods
            })

results.sort(key=lambda x: (x['module'], x['class']))

print("=" * 120)
print(f"{'Module':<15} {'Controller':<45} {'Endpoints':>9} {'PreAuth':>8} {'ClassLvl':>9} {'Missing':>8}")
print("=" * 120)

total_endpoints = 0
total_preauth = 0
total_missing = 0

for r in results:
    missing_count = len(r['missing'])
    if r['class_level'] == 'YES':
        effective_missing = 0  # class-level covers all
    else:
        effective_missing = missing_count

    total_endpoints += r['endpoints']
    total_preauth += r['preauth']
    total_missing += effective_missing

    flag = " <<<" if effective_missing > 0 else ""
    print(f"{r['module']:<15} {r['class']:<45} {r['endpoints']:>9} {r['preauth']:>8} {r['class_level']:>9} {effective_missing:>8}{flag}")

print("=" * 120)
print(f"{'TOTAL':<15} {'':<45} {total_endpoints:>9} {total_preauth:>8} {'':>9} {total_missing:>8}")
print()

# Now show details of missing controllers
print("\n" + "=" * 120)
print("CONTROLLERS WITH MISSING @PreAuthorize (grouped by module)")
print("=" * 120)

current_module = None
for r in results:
    if r['class_level'] == 'YES':
        continue  # class-level covers all
    if not r['missing']:
        continue

    if r['module'] != current_module:
        print(f"\n--- {r['module'].upper()} ---")
        current_module = r['module']

    print(f"\n  {r['class']} ({r['path']})")
    print(f"  Endpoints: {r['endpoints']}, PreAuth: {r['preauth']}, Missing: {len(r['missing'])}")
    for m in r['missing']:
        print(f"    - {m}")

print("\n\n" + "=" * 120)
print("CONTROLLERS WITH CLASS-LEVEL @PreAuthorize (fully covered)")
print("=" * 120)
for r in results:
    if r['class_level'] == 'YES':
        print(f"  {r['module']:<15} {r['class']:<45} ({r['endpoints']} endpoints)")

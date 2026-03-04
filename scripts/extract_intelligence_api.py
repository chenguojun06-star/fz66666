import sys

path = 'frontend/src/services/production/productionApi.ts'
with open(path, 'r') as f:
    all_lines = f.readlines()

start_line = None
end_line = None
for i, ln in enumerate(all_lines):
    if '\u667a\u80fd\u5316\u7b2c\u4e8c\u6279 TS \u7c7b\u578b\u5b9a\u4e49' in ln:
        start_line = i
    if '\u2318K \u5168\u5c40\u641c\u7d22' in ln and start_line is not None:
        end_line = i
        break

print(f'start_line={start_line}, end_line={end_line}', file=sys.stderr)

if start_line is None or end_line is None:
    print('ERROR: markers not found', file=sys.stderr)
    sys.exit(1)

replacement = [
    '// Intelligence API \u5df2\u8fc1\u79fb\u81f3\u72ec\u7acb\u6a21\u5757\n',
    '// \u4e3a\u4fdd\u6301\u5411\u540e\u517c\u5bb9\uff0c\u6b64\u5904\u4fdd\u7559 re-export\uff1b\u65b0\u4ee3\u7801\u8bf7\u76f4\u63a5\u4ece\u4ee5\u4e0b\u8def\u5f84\u5bfc\u5165\uff1a\n',
    "//   import { intelligenceApi } from '@/services/intelligence/intelligenceApi';\n",
    "export * from '../intelligence/intelligenceApi';\n",
    '\n',
]

new_lines = all_lines[:start_line] + replacement + all_lines[end_line:]
with open(path, 'w') as f:
    f.writelines(new_lines)

print(f'OK: {len(all_lines)} -> {len(new_lines)} lines', file=sys.stderr)

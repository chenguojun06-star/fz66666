#!/usr/bin/env python3
"""Find empty or near-empty catch blocks in Java files, ranked by business risk."""
import re, os

base = 'backend/src/main/java/com/fashion/supplychain/'
findings = []

for root, dirs, files in os.walk(base):
    for f in files:
        if not f.endswith('.java'):
            continue
        path = os.path.join(root, f)
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as fh:
                content = fh.read()
                lines = content.split('\n')
        except Exception:
            continue

        i = 0
        while i < len(lines):
            line = lines[i]
            if re.search(r'\bcatch\s*\(', line):
                catch_line = i + 1  # 1-based
                block_lines = [line]
                brace_count = line.count('{') - line.count('}')
                j = i + 1
                while j < len(lines) and j < i + 15:
                    block_lines.append(lines[j])
                    brace_count += lines[j].count('{') - lines[j].count('}')
                    if brace_count <= 0:
                        break
                    j += 1

                body_lines = block_lines[1:]
                body_content = ''
                for bl in body_lines:
                    stripped = bl.strip()
                    if stripped in ('}', '{', ''):
                        continue
                    if stripped.startswith('//'):
                        continue
                    body_content += stripped + ' '

                body_content = body_content.strip()
                is_empty = len(body_content) == 0
                is_trace_only = (
                    bool(re.search(r'(e\.print|log\.(trace|debug)|System\.err)', body_content))
                    and not re.search(r'(throw|log\.(warn|error|info)|return|Result\.error)', body_content)
                )

                if is_empty or is_trace_only:
                    start = max(0, i - 5)
                    end = min(len(lines), j + 2)
                    context = '\n'.join(lines[start:end])

                    risk = 0
                    lpath = path.lower()
                    for kw, score in [
                        ('payment', 5), ('payroll', 5), ('settlement', 5), ('reconcil', 5),
                        ('scan', 4), ('webhook', 5), ('push', 4), ('notify', 4), ('notice', 4),
                        ('audit', 4), ('price', 3), ('stock', 4), ('warehouse', 4),
                        ('order', 3), ('finance', 4), ('wechat', 3),
                        ('orchestrat', 3), ('executor', 3),
                    ]:
                        if kw in lpath:
                            risk = max(risk, score)
                    if is_empty:
                        risk += 2
                    if is_trace_only:
                        risk += 1

                    findings.append((risk, path, catch_line, context, is_empty))
            i += 1

findings.sort(key=lambda x: -x[0])
for idx, (risk, path, line_no, ctx, empty) in enumerate(findings[:15]):
    kind = 'EMPTY CATCH' if empty else 'TRACE/DEBUG ONLY'
    # shorten path
    short = path.replace('backend/src/main/java/com/fashion/supplychain/', '')
    print(f'=== #{idx+1} | Risk={risk} | {kind} | {short}:{line_no} ===')
    print(ctx)
    print()

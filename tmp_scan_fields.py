#!/usr/bin/env python3
"""Scan frontend source for form fields missing id/name attributes."""
import re, os, json

src_dir = "frontend/src"
COMPONENTS = ['Input', 'Select', 'InputNumber', 'DatePicker', 'Switch', 'Checkbox', 'Radio', 'AutoComplete', 'TextArea', 'RangePicker']

cat1_standalone = []  # value+onChange, no id/name, not in Form.Item
cat2_formitem_noname = []  # Form.Item without name wrapping input
cat3_html = []  # raw <input>, <select>, <textarea>
cat4_filter_search = []  # filter/search inputs (onChange only)

for root, dirs, files in os.walk(src_dir):
    for fname in files:
        if not fname.endswith(('.tsx', '.ts')):
            continue
        fpath = os.path.join(root, fname)
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except:
            continue

        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith('import ') or stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
                continue

            # Category 3: raw HTML inputs
            html_match = re.search(r'<(input|select|textarea)\b', line, re.IGNORECASE)
            if html_match and not re.search(r'(Input|Select|TextArea)', line):
                has_id = bool(re.search(r'\bid=', line))
                has_name = bool(re.search(r'\bname=', line))
                if not has_id and not has_name:
                    cat3_html.append({
                        'file': fpath.replace('frontend/src/', ''),
                        'line': i+1,
                        'component': html_match.group(1),
                        'code': stripped[:150]
                    })

            # Check Ant Design components
            for comp in COMPONENTS:
                pat = rf'<{comp}\b'
                if comp == 'Input' and re.search(r'<Input(Number|Group|\.)', line):
                    continue
                if not re.search(pat, line):
                    continue

                # Gather multiline props (check next 5 lines too for multiline JSX)
                end = min(len(lines), i + 8)
                block = ''.join(lines[i:end])

                has_value = bool(re.search(r'\bvalue[={\s]', block[:500]))
                has_onchange = bool(re.search(r'\bonChange[={\s]', block[:500]))
                has_id = bool(re.search(r'\bid[={\s]', block[:500]))
                has_name_prop = bool(re.search(r'\bname[={\s]', block[:500]))

                # Check context above for Form.Item
                start = max(0, i - 8)
                context_above = ''.join(lines[start:i+1])
                in_form_item_with_name = bool(re.search(r'<Form\.Item[^>]*\bname\s*=', context_above))
                in_form_item_any = bool(re.search(r'<Form\.Item', context_above))
                closed_form_item = bool(re.search(r'</Form\.Item>', context_above))

                # If Form.Item was opened AND closed before this line, we're outside it
                if closed_form_item:
                    in_form_item_any = False
                    in_form_item_with_name = False

                # Category 1: standalone controlled (value+onChange, no id/name, not in Form.Item with name)
                if has_value and has_onchange and not has_id and not has_name_prop and not in_form_item_with_name:
                    cat1_standalone.append({
                        'file': fpath.replace('frontend/src/', ''),
                        'line': i+1,
                        'component': comp,
                        'code': stripped[:150]
                    })

                # Category 2: inside Form.Item WITHOUT name
                if in_form_item_any and not in_form_item_with_name and not has_id and not has_name_prop:
                    cat2_formitem_noname.append({
                        'file': fpath.replace('frontend/src/', ''),
                        'line': i+1,
                        'component': comp,
                        'code': stripped[:150]
                    })

                # Category 4: filter/search pattern (onChange but no value, not in Form)
                if has_onchange and not has_value and not in_form_item_any and not has_id and not has_name_prop:
                    cat4_filter_search.append({
                        'file': fpath.replace('frontend/src/', ''),
                        'line': i+1,
                        'component': comp,
                        'code': stripped[:150]
                    })

def print_cat(title, items, max_show=200):
    print(f"\n{'='*80}")
    print(f"{title} (Total: {len(items)})")
    print('='*80)
    for item in sorted(items, key=lambda x: (x['file'], x['line']))[:max_show]:
        print(f"  {item['file']}:{item['line']} [{item['component']}]")
    if len(items) > max_show:
        print(f"  ... and {len(items) - max_show} more")

print_cat("CATEGORY 1: Standalone controlled components (value+onChange, no id/name, likely outside Form.Item)", cat1_standalone)
print_cat("CATEGORY 2: Inside Form.Item WITHOUT name prop (Form.Item has no name=)", cat2_formitem_noname)
print_cat("CATEGORY 3: Raw HTML <input>/<select>/<textarea> without id/name", cat3_html)
print_cat("CATEGORY 4: Filter/search inputs (onChange only, no Form wrapper, no id/name)", cat4_filter_search)

# File-level summary
print(f"\n{'='*80}")
print(f"FILE-LEVEL BREAKDOWN (Category 1)")
print('='*80)
from collections import Counter
file_counts = Counter(item['file'] for item in cat1_standalone)
for f, c in file_counts.most_common():
    print(f"  {c:3d}  {f}")

print(f"\n{'='*80}")
print(f"SUMMARY")
print(f"{'='*80}")
print(f"  Category 1 (standalone controlled):    {len(cat1_standalone)}")
print(f"  Category 2 (Form.Item without name):   {len(cat2_formitem_noname)}")
print(f"  Category 3 (raw HTML elements):         {len(cat3_html)}")
print(f"  Category 4 (filter/search w/o id):      {len(cat4_filter_search)}")
print(f"  TOTAL potential issues:                  {len(cat1_standalone) + len(cat2_formitem_noname) + len(cat3_html) + len(cat4_filter_search)}")

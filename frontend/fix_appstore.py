#!/usr/bin/env python3
"""Fix AppStore form: remove ModalFieldRow wrappers, add labels to Form.Item"""
import re

filepath = 'src/modules/system/pages/AppStore/index.tsx'
with open(filepath, 'r') as f:
    lines = f.readlines()

result = []
i = 0
# Map of Form.Item name -> label
labels = {
    'subscriptionType': '订阅类型',
    'userCount': '用户数量',
    'contactName': '联系人',
    'contactPhone': '联系电话',
    'contactEmail': '联系邮箱',
    'companyName': '公司名称',
    'invoiceRequired': '是否需要发票',
    'invoiceTitle': '发票抬头',
    'invoiceTaxNo': '纳税人识别号',
}

while i < len(lines):
    line = lines[i]
    stripped = line.strip()

    # Skip <ModalFieldRow> opening tags (empty ones without label)
    if stripped == '<ModalFieldRow>':
        i += 1
        continue

    # Skip </ModalFieldRow> closing tags
    if stripped == '</ModalFieldRow>':
        i += 1
        continue

    # Fix Form.Item: remove noStyle and add label
    if '<Form.Item name="' in stripped and 'noStyle' in stripped:
        for name, label in labels.items():
            if f'name="{name}"' in stripped:
                # Remove noStyle
                line = line.replace(' noStyle', '')
                # Add label after name="xxx"
                line = line.replace(f'name="{name}"', f'name="{name}" label="{label}"')
                # Reduce indentation by 2 spaces (was inside ModalFieldRow)
                if line.startswith('              ') and '</Form.Item>' not in stripped:
                    line = line.replace('              ', '            ', 1)
                break
    elif '<Form.Item name="' in stripped and 'noStyle' not in stripped:
        # already has no noStyle - just fix indentation if needed
        pass

    result.append(line)
    i += 1

with open(filepath, 'w') as f:
    f.writelines(result)

# Verify
with open(filepath, 'r') as f:
    content = f.read()
print(f"ModalFieldRow count: {content.count('ModalFieldRow')}")
print(f"noStyle count: {content.count('noStyle')}")
print(f"label= count: {content.count('label=')}")

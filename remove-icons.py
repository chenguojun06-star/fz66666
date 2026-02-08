#!/usr/bin/env python3
"""删除所有RowActions中的icon属性行"""

import os
import re
from pathlib import Path

def remove_icon_lines(file_path):
    """删除文件中的icon属性行"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # 匹配 icon: <...Outlined /> 这一行（任意缩进）
    pattern = r'^\s*icon:\s*<\w+Outlined\s*/>,?\s*$\n'
    content = re.sub(pattern, '', content, flags=re.MULTILINE)
    
    if content != original:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    print("🔧 使用Python删除所有icon属性行...")
    
    # 遍历所有tsx文件
    modules_dir = Path('frontend/src/modules')
    components_dir = Path('frontend/src/components')
    
    count = 0
    for directory in [modules_dir, components_dir]:
        if not directory.exists():
            continue
            
        for tsx_file in directory.rglob('*.tsx'):
            if remove_icon_lines(tsx_file):
                print(f"✓ {tsx_file}")
                count += 1
    
    print(f"\n✅ 完成！处理了 {count} 个文件")

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""删除所有Button的icon属性"""

import os
import re
from pathlib import Path

def remove_button_icons(file_path):
    """删除Button组件的icon属性"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # 匹配 <Button ... icon={<...Outlined />} ...>
    # 删除 icon={<...Outlined />} 部分
    pattern = r'\s*icon=\{<\w+Outlined\s*/>\}'
    content = re.sub(pattern, '', content)
    
    if content != original:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    print("🔧 删除所有Button的icon属性...")
    
    # 遍历所有tsx文件
    modules_dir = Path('frontend/src/modules')
    components_dir = Path('frontend/src/components')
    
    count = 0
    for directory in [modules_dir, components_dir]:
        if not directory.exists():
            continue
            
        for tsx_file in directory.rglob('*.tsx'):
            if remove_button_icons(tsx_file):
                print(f"✓ {tsx_file}")
                count += 1
    
    print(f"\n✅ 完成！处理了 {count} 个文件")

if __name__ == '__main__':
    main()

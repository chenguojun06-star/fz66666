#!/usr/bin/env python3
"""
批量替换硬编码颜色为 CSS 变量（保持业务语义）
"""

import os
import re
from pathlib import Path

# 颜色替换映射（保持业务语义）
COLOR_REPLACEMENTS = [
    # 成功/合格/正常 - 绿色
    (r"'#52c41a'", "'var(--color-success)'"),
    (r'"#52c41a"', '"var(--color-success)"'),
    (r"'#52C41A'", "'var(--color-success)'"),
    (r'"#52C41A"', '"var(--color-success)"'),
    
    # 警告/待处理 - 黄色
    (r"'#faad14'", "'var(--color-warning)'"),
    (r'"#faad14"', '"var(--color-warning)"'),
    (r"'#FAAD14'", "'var(--color-warning)'"),
    (r'"#FAAD14"', '"var(--color-warning)"'),
    
    # 错误/延期 - 红色
    (r"'#ff4d4f'", "'var(--color-danger)'"),
    (r'"#ff4d4f"', '"var(--color-danger)"'),
    (r"'#FF4D4F'", "'var(--color-danger)'"),
    (r'"#FF4D4F"', '"var(--color-danger)"'),
    
    # 信息 - 蓝色
    (r"'#1890ff'", "'var(--color-info)'"),
    (r'"#1890ff"', '"var(--color-info)"'),
    (r"'#1890FF'", "'var(--color-info)'"),
    (r'"#1890FF"', '"var(--color-info)"'),
]

# 排除的文件（保留进度组件和工具类）
EXCLUDED_FILES = [
    'LiquidProgressBar.tsx',
    'LiquidProgressLottie.tsx',
    'progressColor.ts',
    'Login/styles.css',  # 保留品牌色
]

def should_process_file(filepath):
    """判断文件是否需要处理"""
    if not filepath.suffix in ['.tsx', '.ts', '.css']:
        return False
    
    for excluded in EXCLUDED_FILES:
        if excluded in str(filepath):
            return False
    
    return True

def replace_colors_in_file(filepath):
    """替换单个文件中的颜色"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # 执行所有替换
        for pattern, replacement in COLOR_REPLACEMENTS:
            content = re.sub(pattern, replacement, content)
        
        # 只在内容改变时写入
        if content != original_content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        
        return False
    except Exception as e:
        print(f"❌ 处理文件失败: {filepath} - {e}")
        return False

def main():
    """主函数"""
    frontend_dir = Path('frontend/src')
    
    if not frontend_dir.exists():
        print("❌ frontend/src 目录不存在")
        return
    
    print("🚀 开始替换硬编码颜色...")
    
    processed_count = 0
    changed_count = 0
    
    # 遍历所有文件
    for filepath in frontend_dir.rglob('*'):
        if not filepath.is_file():
            continue
        
        if not should_process_file(filepath):
            continue
        
        processed_count += 1
        
        if replace_colors_in_file(filepath):
            changed_count += 1
            print(f"✅ {filepath.relative_to(frontend_dir)}")
    
    print(f"\n" + "="*60)
    print(f"✅ Phase 3 完成!")
    print(f"📊 处理文件: {processed_count} 个")
    print(f"📝 修改文件: {changed_count} 个")
    print(f"🎨 替换规则:")
    print(f"   • #52c41a → var(--color-success) [绿色=成功/合格]")
    print(f"   • #faad14 → var(--color-warning) [黄色=警告/待处理]")
    print(f"   • #ff4d4f → var(--color-danger)  [红色=错误/延期]")
    print(f"   • #1890ff → var(--color-info)    [蓝色=信息]")
    print(f"="*60)

if __name__ == '__main__':
    main()

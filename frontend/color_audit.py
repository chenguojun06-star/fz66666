#!/usr/bin/env python3
"""
硬编码颜色审计脚本
搜索 .tsx/.ts/.css 文件中的硬编码颜色，统计出现次数，匹配 CSS 变量
"""

import os
import re
import sys
from collections import defaultdict
from pathlib import Path

SRC_DIR = Path(__file__).parent / "src"
DESIGN_SYSTEM_FILE = SRC_DIR / "styles" / "design-system.css"

# 颜色正则表达式
HEX_COLOR_PATTERN = re.compile(
    r'#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b'
)
RGB_COLOR_PATTERN = re.compile(
    r'rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)'
)

# 注释正则（用于排除）
LINE_COMMENT_PATTERN = re.compile(r'//.*$', re.MULTILINE)
BLOCK_COMMENT_PATTERN = re.compile(r'/\*.*?\*/', re.DOTALL)


def normalize_color(color_str):
    """标准化颜色值，便于比较"""
    color_str = color_str.strip().lower()
    
    # 处理十六进制
    if color_str.startswith('#'):
        hex_part = color_str[1:]
        # 3位转6位
        if len(hex_part) == 3:
            hex_part = ''.join(c * 2 for c in hex_part)
        # 4位转8位（含alpha）
        elif len(hex_part) == 4:
            hex_part = ''.join(c * 2 for c in hex_part)
        return '#' + hex_part
    
    # 处理 rgb/rgba
    if color_str.startswith('rgb'):
        # 提取数字
        nums = re.findall(r'[\d.]+', color_str)
        if len(nums) >= 3:
            r, g, b = int(nums[0]), int(nums[1]), int(nums[2])
            a = float(nums[3]) if len(nums) > 3 else 1.0
            if a == 1.0:
                return f'rgb({r}, {g}, {b})'
            else:
                return f'rgba({r}, {g}, {b}, {a})'
    
    return color_str


def remove_comments(content, file_ext):
    """移除文件内容中的注释"""
    if file_ext in ('.tsx', '.ts', '.jsx', '.js', '.css'):
        # 移除块注释
        content = BLOCK_COMMENT_PATTERN.sub('', content)
        # 移除行注释
        content = LINE_COMMENT_PATTERN.sub('', content)
    return content


def extract_design_system_colors():
    """从 design-system.css 提取颜色变量映射"""
    color_vars = {}
    
    if not DESIGN_SYSTEM_FILE.exists():
        print(f"警告: 未找到 {DESIGN_SYSTEM_FILE}")
        return color_vars
    
    content = DESIGN_SYSTEM_FILE.read_text(encoding='utf-8')
    
    # 匹配 CSS 变量定义: --variable-name: color-value;
    var_pattern = re.compile(
        r'(--[\w-]+)\s*:\s*([^;]+?)\s*;',
        re.IGNORECASE
    )
    
    for match in var_pattern.finditer(content):
        var_name = match.group(1)
        var_value = match.group(2).strip()
        
        # 只提取颜色相关的变量
        color_match = HEX_COLOR_PATTERN.search(var_value) or RGB_COLOR_PATTERN.search(var_value)
        if color_match:
            normalized = normalize_color(color_match.group(0))
            # 只保存浅色模式的值（第一个出现的）
            if normalized not in color_vars:
                color_vars[normalized] = var_name
    
    return color_vars


def find_colors_in_file(filepath):
    """在单个文件中查找硬编码颜色"""
    try:
        content = filepath.read_text(encoding='utf-8')
    except Exception as e:
        print(f"读取文件失败 {filepath}: {e}")
        return []
    
    file_ext = filepath.suffix
    
    # 移除注释
    content_no_comments = remove_comments(content, file_ext)
    
    colors = []
    
    # 查找十六进制颜色
    for match in HEX_COLOR_PATTERN.finditer(content_no_comments):
        colors.append({
            'value': match.group(0),
            'normalized': normalize_color(match.group(0)),
            'position': match.start(),
            'type': 'hex'
        })
    
    # 查找 rgb/rgba 颜色
    for match in RGB_COLOR_PATTERN.finditer(content_no_comments):
        colors.append({
            'value': match.group(0),
            'normalized': normalize_color(match.group(0)),
            'position': match.start(),
            'type': 'rgb'
        })
    
    return colors


def is_color_in_style_context(content, position, file_ext):
    """判断颜色是否在 style 上下文中（内联样式、CSS等）"""
    if file_ext == '.css':
        return True
    
    # 对于 tsx/ts，检查是否在 style={{...}} 或 style="..." 中
    # 简化处理：所有颜色都计入，因为用户要求重点关注内联style
    return True


def main():
    print("=" * 80)
    print("硬编码颜色审计报告")
    print("=" * 80)
    
    # 1. 提取设计系统颜色变量
    print("\n[1/5] 提取 design-system.css 中的颜色变量...")
    design_system_colors = extract_design_system_colors()
    print(f"  找到 {len(design_system_colors)} 个颜色变量")
    
    # 2. 遍历所有文件
    print("\n[2/5] 扫描源文件中的硬编码颜色...")
    
    color_counts = defaultdict(int)
    color_files = defaultdict(list)
    file_color_counts = defaultdict(int)
    file_colors_detail = defaultdict(list)
    
    total_files = 0
    total_colors = 0
    
    for root, dirs, files in os.walk(SRC_DIR):
        # 跳过 node_modules 等
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', 'build')]
        
        for filename in files:
            filepath = Path(root) / filename
            rel_path = filepath.relative_to(SRC_DIR)
            
            # 只处理 .tsx/.ts/.css 文件
            if filepath.suffix not in ('.tsx', '.ts', '.css'):
                continue
            
            # 排除 design-system.css
            if filepath == DESIGN_SYSTEM_FILE:
                continue
            
            # 排除 xiaoyun-tokens.css 等设计系统相关
            if 'tokens' in filename.lower() and filepath.suffix == '.css':
                continue
            
            total_files += 1
            
            # 提取颜色
            colors = find_colors_in_file(filepath)
            
            if colors:
                file_color_counts[rel_path] = len(colors)
                total_colors += len(colors)
                
                for color in colors:
                    normalized = color['normalized']
                    color_counts[normalized] += 1
                    
                    if rel_path not in color_files[normalized]:
                        color_files[normalized].append(rel_path)
                    
                    file_colors_detail[rel_path].append(color)
    
    print(f"  扫描文件数: {total_files}")
    print(f"  发现硬编码颜色实例: {total_colors}")
    print(f"  不同颜色值数量: {len(color_counts)}")
    
    # 3. 按出现次数排序 TOP 30
    print("\n[3/5] 统计硬编码颜色 TOP 30...")
    sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)
    top_30 = sorted_colors[:30]
    
    # 4. 问题最严重的 TOP 10 文件
    print("\n[4/5] 分析颜色问题最严重的文件...")
    sorted_files = sorted(file_color_counts.items(), key=lambda x: x[1], reverse=True)
    top_10_files = sorted_files[:10]
    
    # 5. 匹配可替换的 CSS 变量
    print("\n[5/5] 匹配可替换为现有 CSS 变量的颜色...")
    
    replaceable = []
    for color_val, count in sorted_colors:
        if color_val in design_system_colors:
            replaceable.append({
                'color': color_val,
                'count': count,
                'variable': design_system_colors[color_val],
                'files': color_files[color_val][:3]
            })
    
    # ============ 输出报告 ============
    print("\n" + "=" * 80)
    print("📊 审计结果")
    print("=" * 80)
    
    # TOP 30 硬编码颜色
    print("\n" + "─" * 80)
    print("🔥 TOP 30 硬编码颜色（按出现次数排序）")
    print("─" * 80)
    print(f"{'排名':<6} {'颜色值':<30} {'次数':<8} {'代表性文件'}")
    print("-" * 80)
    
    for i, (color_val, count) in enumerate(top_30, 1):
        # 找到第一个文件作为代表
        rep_file = str(color_files[color_val][0]) if color_files[color_val] else "N/A"
        if len(rep_file) > 40:
            rep_file = "..." + rep_file[-37:]
        
        # 标记是否有对应变量
        var_mark = "✓" if color_val in design_system_colors else " "
        var_name = design_system_colors.get(color_val, "")
        
        print(f"{i:<6} {color_val:<24} {var_mark} {count:<8} {rep_file}")
        if var_name:
            print(f"       → 可替换为: {var_name}")
    
    # TOP 10 问题文件
    print("\n" + "─" * 80)
    print("📁 TOP 10 颜色问题最严重的文件")
    print("─" * 80)
    print(f"{'排名':<6} {'文件路径':<60} {'颜色数':<8}")
    print("-" * 80)
    
    for i, (filepath, count) in enumerate(top_10_files, 1):
        path_str = str(filepath)
        if len(path_str) > 58:
            path_str = "..." + path_str[-55:]
        print(f"{i:<6} {path_str:<60} {count:<8}")
    
    # 可替换为 CSS 变量的颜色
    print("\n" + "─" * 80)
    print("✅ 可直接替换为现有 CSS 变量的颜色")
    print("─" * 80)
    
    if replaceable:
        total_replaceable = sum(item['count'] for item in replaceable)
        print(f"共 {len(replaceable)} 种颜色，{total_replaceable} 处可直接替换")
        print()
        print(f"{'颜色值':<30} {'变量名':<35} {'次数':<8} {'主要出现文件'}")
        print("-" * 90)
        
        for item in replaceable:
            files_str = ", ".join(str(f) for f in item['files'][:2])
            if len(files_str) > 40:
                files_str = files_str[:37] + "..."
            print(f"{item['color']:<30} {item['variable']:<35} {item['count']:<8} {files_str}")
    else:
        print("没有找到可直接替换的颜色")
    
    # 额外统计：内联样式 vs CSS 文件
    print("\n" + "─" * 80)
    print("📊 颜色分布统计")
    print("─" * 80)
    
    css_color_count = 0
    tsx_color_count = 0
    ts_color_count = 0
    
    for filepath, colors in file_colors_detail.items():
        if filepath.suffix == '.css':
            css_color_count += len(colors)
        elif filepath.suffix == '.tsx':
            tsx_color_count += len(colors)
        elif filepath.suffix == '.ts':
            ts_color_count += len(colors)
    
    print(f"CSS 文件中的硬编码颜色: {css_color_count}")
    print(f"TSX 文件中的硬编码颜色: {tsx_color_count}")
    print(f"TS 文件中的硬编码颜色: {ts_color_count}")
    print(f"总计: {total_colors}")
    
    # 按类型分类
    hex_count = sum(1 for colors in file_colors_detail.values() for c in colors if c['type'] == 'hex')
    rgb_count = sum(1 for colors in file_colors_detail.values() for c in colors if c['type'] == 'rgb')
    print(f"\n十六进制颜色: {hex_count}")
    print(f"RGB/RGBA 颜色: {rgb_count}")
    
    print("\n" + "=" * 80)
    print("审计完成！")
    print("=" * 80)


if __name__ == '__main__':
    main()

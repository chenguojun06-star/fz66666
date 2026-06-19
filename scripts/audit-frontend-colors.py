#!/usr/bin/env python3
"""
前端硬编码颜色审计与批量替换脚本
================================
扫描所有 .css/.tsx/.jsx 文件，找到硬编码的 hex 颜色，
根据 design-system.css 建立的颜色映射，批量替换为 CSS 变量。

用法：
  python3 scripts/audit-frontend-colors.py            # 只扫描，不替换
  python3 scripts/audit-frontend-colors.py --replace   # 扫描并替换
  python3 scripts/audit-frontend-colors.py --verbose   # 显示详细信息
"""
import os
import re
import sys
import argparse
from typing import Dict, List, Tuple, Set
from collections import Counter

FRONTEND_SRC = "frontend/src"

# design-system.css 中定义的颜色 → CSS 变量映射
# 顺序很重要：先匹配长色值，再匹配短色值
COLOR_MAP = {
    # 主色调
    '#2D7FF9': 'var(--color-primary)',
    '#2d7ff9': 'var(--color-primary)',
    '#1677ff': 'var(--color-primary)',  # Ant Design 5.x 主色
    '#5B9CFA': 'var(--color-primary-light)',
    '#5b9cfa': 'var(--color-primary-light)',
    '#1E6FE8': 'var(--color-primary-dark)',
    '#1e6fe8': 'var(--color-primary-dark)',
    '#1558D6': 'var(--color-primary-darker)',
    '#1558d6': 'var(--color-primary-darker)',
    # 辅助色
    '#faad14': 'var(--color-warning)',
    '#fa8c16': 'var(--color-warning)',  # Ant Design warning-dark
    '#FF4D4F': 'var(--color-danger)',
    '#ff4d4f': 'var(--color-danger)',
    '#52c41a': 'var(--color-success)',
    '#1890ff': 'var(--color-info)',
    '#f5222d': 'var(--color-error)',
    '#cf1322': 'var(--color-error)',  # error-dark
    # 语义强调色
    '#722ed1': 'var(--color-accent-purple)',
    '#13c2c2': 'var(--color-accent-cyan)',
    '#38bdf8': 'var(--color-accent-sky)',
    '#10b981': 'var(--color-accent-emerald)',
    # 中性色 - 文字
    '#1a1a1a': 'var(--color-text-primary)',
    '#6b7280': 'var(--color-text-secondary)',
    '#9ca3af': 'var(--color-text-tertiary)',
    '#bfbfbf': 'var(--color-text-quaternary)',
    # 中性色 - 背景
    '#fafafa': 'var(--color-bg-container)',
    '#f5f5f5': 'var(--color-bg-subtle)',
    '#f8fafc': 'var(--color-bg-page)',
    '#ebf2ff': 'var(--color-bg-highlight)',
    '#f5f7fb': 'var(--color-bg-stripe)',
    # 边框
    '#e5e7eb': 'var(--color-border)',
    '#f0f0f0': 'var(--color-border-light)',
    '#d9d9d9': 'var(--color-border-antd)',
}

# 白色和黑色特殊处理（使用场景多，需要上下文判断）
# #fff/#ffffff 可能是 bg-base/bg-card/border-light，#000 可能是 text-primary
WHITE_BLACK_MAP = {
    '#ffffff': 'var(--color-bg-base)',
    '#fff': 'var(--color-bg-base)',
    '#FFFFFF': 'var(--color-bg-base)',
    '#FFF': 'var(--color-bg-base)',
}


def scan_files() -> List[str]:
    """扫描所有 .css/.tsx/.jsx 文件"""
    files = []
    for root, dirs, fnames in os.walk(FRONTEND_SRC):
        # 跳过 node_modules
        if 'node_modules' in root:
            continue
        for fname in fnames:
            if fname.endswith(('.css', '.tsx', '.jsx', '.ts')):
                files.append(os.path.join(root, fname))
    return files


def find_hardcoded_colors(content: str) -> List[Tuple[str, int]]:
    """查找内容中的硬编码 hex 颜色，返回 (颜色值, 行号) 列表"""
    results = []
    # 匹配 #xxx 或 #xxxxxx 格式（不匹配已经是 var(--xxx) 的）
    pattern = re.compile(r'#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b')
    for match in pattern.finditer(content):
        color = match.group(0)
        # 跳过已经在 var() 中的（虽然正则不会匹配 var(--xxx)，但防御性检查）
        before = content[:match.start()]
        if 'var(' in before[-20:]:
            continue
        line_num = before.count('\n') + 1
        results.append((color, line_num))
    return results


def is_replaceable(color: str) -> bool:
    """判断颜色是否可替换（在映射表中）"""
    return color in COLOR_MAP or color in WHITE_BLACK_MAP


def replace_colors_in_file(filepath: str, do_replace: bool) -> Tuple[int, int, List[Tuple[str, int]]]:
    """处理单个文件，返回 (总颜色数, 可替换数, 不可替换列表)"""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception:
        return 0, 0, []

    colors = find_hardcoded_colors(content)
    if not colors:
        return 0, 0, []

    replaceable = 0
    not_replaceable = []

    for color, line_num in colors:
        if color in COLOR_MAP:
            replaceable += 1
        elif color in WHITE_BLACK_MAP:
            replaceable += 1
        else:
            not_replaceable.append((color, line_num))

    if do_replace and replaceable > 0:
        new_content = content
        # 先替换长色值（6位），再替换短色值（3位），避免 #fff 替换破坏 #ffffxx
        sorted_colors = sorted(COLOR_MAP.keys(), key=len, reverse=True)
        for color in sorted_colors:
            new_content = new_content.replace(color, COLOR_MAP[color])
        # 白色黑色单独处理
        for color in WHITE_BLACK_MAP:
            new_content = new_content.replace(color, WHITE_BLACK_MAP[color])

        if new_content != content:
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
            except Exception as e:
                print(f"  ⚠️  写入失败 {filepath}: {e}")

    return len(colors), replaceable, not_replaceable


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--replace', action='store_true', help='执行替换（默认只扫描）')
    parser.add_argument('--verbose', action='store_true', help='显示详细信息')
    args = parser.parse_args()

    print("=" * 60)
    print("  前端硬编码颜色审计" + (" + 替换" if args.replace else ""))
    print("=" * 60)

    files = scan_files()
    print(f"\n扫描文件数: {len(files)}")

    total_colors = 0
    total_replaceable = 0
    all_not_replaceable = []
    color_counter = Counter()
    files_with_colors = 0

    for filepath in files:
        colors_count, replaceable, not_replaceable = replace_colors_in_file(filepath, args.replace)
        if colors_count > 0:
            files_with_colors += 1
            total_colors += colors_count
            total_replaceable += replaceable
            all_not_replaceable.extend([(filepath, c, ln) for c, ln in not_replaceable])

            # 统计颜色分布
            try:
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
                for color, _ in find_hardcoded_colors(content):
                    color_counter[color] += 1
            except Exception:
                pass

    print(f"\n--- 审计结果 ---")
    print(f"  含硬编码颜色的文件: {files_with_colors}")
    print(f"  硬编码颜色总数: {total_colors}")
    print(f"  可替换为 CSS 变量: {total_replaceable}")
    print(f"  不可替换（无映射）: {len(all_not_replaceable)}")

    print(f"\n--- 颜色分布 Top 20 ---")
    for color, count in color_counter.most_common(20):
        mapped = COLOR_MAP.get(color) or WHITE_BLACK_MAP.get(color, '（无映射）')
        print(f"  {color:10s} × {count:4d}  → {mapped}")

    if all_not_replaceable and args.verbose:
        print(f"\n--- 不可替换的颜色（前 20 个）---")
        for filepath, color, line_num in all_not_replaceable[:20]:
            basename = os.path.basename(filepath)
            print(f"  {basename}:{line_num}  {color}")

    if args.replace:
        print(f"\n✅ 已替换 {total_replaceable} 处硬编码颜色为 CSS 变量")
    else:
        print(f"\nℹ️  只扫描未替换。加 --replace 执行替换。")

    print("=" * 60)


if __name__ == "__main__":
    main()

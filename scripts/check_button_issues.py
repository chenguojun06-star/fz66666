#!/usr/bin/env python3
"""
按钮失效问题自动检测脚本
检查前端代码中可能导致按钮失效的常见问题
"""

import os
import re
from typing import List, Tuple

def find_tsx_files(root_dir: str) -> List[str]:
    """查找所有 TSX 文件"""
    tsx_files = []
    for root, dirs, files in os.walk(root_dir):
        # 跳过 node_modules 和 dist
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'dist', '.vite', 'build']]
        for file in files:
            if file.endswith('.tsx'):
                tsx_files.append(os.path.join(root, file))
    return tsx_files

def check_empty_onclick(content: str, filepath: str) -> List[Tuple[int, str]]:
    """检查空的 onClick 处理器"""
    issues = []
    lines = content.split('\n')

    patterns = [
        (r'onClick=\{\(\)\s*=>\s*\{\s*\}\}', '空的 onClick 箭头函数'),
        (r'onClick=\{\s*\(\)\s*=>\s*\{\s*//.*\}\}', '只有注释的 onClick'),
        (r'onClick=\{undefined\}', 'undefined onClick'),
        (r'onClick=\{null\}', 'null onClick'),
        (r'onClick=\{\s*\}', '空 onClick'),
    ]

    for i, line in enumerate(lines, 1):
        for pattern, desc in patterns:
            if re.search(pattern, line):
                issues.append((i, desc))

    return issues

def check_missing_functions(content: str, filepath: str) -> List[Tuple[int, str]]:
    """检查调用了但未定义的函数"""
    issues = []
    lines = content.split('\n')

    # 提取所有 onClick 中调用的函数名
    onclick_pattern = r'onClick=\{([a-zA-Z_][a-zA-Z0-9_]*)\}'
    called_functions = set()

    for line in lines:
        matches = re.findall(onclick_pattern, line)
        called_functions.update(matches)

    # 检查这些函数是否定义
    for func_name in called_functions:
        # 检查是否有函数定义
        func_def_patterns = [
            rf'const\s+{func_name}\s*=',
            rf'function\s+{func_name}\s*\(',
            rf'{func_name}\s*:\s*\(',
        ]

        found = False
        for pattern in func_def_patterns:
            if re.search(pattern, content):
                found = True
                break

        if not found:
            # 找到调用位置
            for i, line in enumerate(lines, 1):
                if f'onClick={{{func_name}}}' in line:
                    issues.append((i, f'函数 {func_name} 未定义'))

    return issues

def check_static_message_usage(content: str, filepath: str) -> List[Tuple[int, str]]:
    """检查静态 message 方法使用（应该用 App.useApp）"""
    issues = []
    lines = content.split('\n')

    # 检查是否导入了 message
    has_message_import = 'message' in content and 'from \'antd\'' in content
    has_app_hook = 'const { message } = App.useApp()' in content or 'useApp()' in content

    if has_message_import and not has_app_hook:
        for i, line in enumerate(lines, 1):
            if re.search(r'message\.(success|error|warning|info)', line):
                issues.append((i, '使用静态 message 方法（建议改用 App.useApp）'))

    return issues

def check_async_without_loading(content: str, filepath: str) -> List[Tuple[int, str]]:
    """检查异步操作但没有 loading 状态"""
    issues = []
    lines = content.split('\n')

    # 查找 async onClick
    for i, line in enumerate(lines, 1):
        if 'onClick={async' in line or 'onClick={handleAsync' in line:
            # 检查附近是否有 loading 或 disabled 状态
            context_start = max(0, i - 10)
            context_end = min(len(lines), i + 5)
            context = '\n'.join(lines[context_start:context_end])

            if 'loading' not in context.lower() and 'disabled' not in context.lower():
                issues.append((i, '异步操作但未设置 loading/disabled 状态'))

    return issues

def check_button_without_type(content: str, filepath: str) -> List[Tuple[int, str]]:
    """检查 Button 没有 type 属性"""
    issues = []
    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        if '<Button' in line and 'onClick' in line:
            # 检查接下来几行是否有 type
            context_start = i - 1
            context_end = min(len(lines), i + 3)
            button_block = '\n'.join(lines[context_start:context_end])

            if 'type=' not in button_block and '/>' in button_block:
                issues.append((i, 'Button 缺少 type 属性'))

    return issues

def check_placeholder_functions(content: str, filepath: str) -> List[Tuple[int, str]]:
    """检查占位函数（空实现）"""
    issues = []
    lines = content.split('\n')

    placeholder_patterns = [
        r'const\s+\w+\s*=\s*async\s*\(\)\s*=>\s*\{\s*//\s*占位',
        r'const\s+\w+\s*=\s*\(\)\s*=>\s*\{\s*//\s*占位',
        r'const\s+\w+\s*=\s*async\s*\(\)\s*=>\s*\{\s*console\.log',
    ]

    for i, line in enumerate(lines, 1):
        for pattern in placeholder_patterns:
            if re.search(pattern, line):
                # 提取函数名
                match = re.search(r'const\s+(\w+)', line)
                if match:
                    func_name = match.group(1)
                    issues.append((i, f'占位函数 {func_name} 未实现'))

    return issues

def analyze_file(filepath: str) -> dict:
    """分析单个文件"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return {'error': str(e)}

    issues = {
        '空onClick': check_empty_onclick(content, filepath),
        '未定义函数': check_missing_functions(content, filepath),
        '静态message': check_static_message_usage(content, filepath),
        '异步无loading': check_async_without_loading(content, filepath),
        'Button无type': check_button_without_type(content, filepath),
        '占位函数': check_placeholder_functions(content, filepath),
    }

    # 过滤掉空结果
    issues = {k: v for k, v in issues.items() if v}

    return issues

def main():
    frontend_root = "/Users/guojunmini4/Documents/服装66666/frontend/src"

    print("🔍 扫描前端按钮失效问题...")
    print("=" * 60)

    tsx_files = find_tsx_files(frontend_root)
    print(f"找到 {len(tsx_files)} 个 TSX 文件")
    print()

    total_issues = 0
    files_with_issues = 0

    issue_summary = {}

    for filepath in tsx_files:
        issues = analyze_file(filepath)

        if issues and 'error' not in issues:
            files_with_issues += 1
            rel_path = filepath.replace(frontend_root, 'src')

            print(f"📄 {rel_path}")

            for issue_type, issue_list in issues.items():
                if issue_type not in issue_summary:
                    issue_summary[issue_type] = 0
                issue_summary[issue_type] += len(issue_list)

                total_issues += len(issue_list)

                for line_no, desc in issue_list[:5]:  # 最多显示5个
                    print(f"  ⚠️  Line {line_no}: {desc}")

                if len(issue_list) > 5:
                    print(f"  ... 还有 {len(issue_list) - 5} 个类似问题")

            print()

    print("=" * 60)
    print(f"📊 扫描结果汇总:")
    print(f"  - 有问题的文件: {files_with_issues}")
    print(f"  - 问题总数: {total_issues}")
    print()
    print("问题分类:")
    for issue_type, count in sorted(issue_summary.items(), key=lambda x: -x[1]):
        print(f"  - {issue_type}: {count}")

    print()
    print("💡 建议:")
    print("  1. 优先修复'占位函数'和'未定义函数'")
    print("  2. 为异步操作添加 loading 状态")
    print("  3. 将静态 message 改用 App.useApp()")
    print("  4. 移除或实现空的 onClick 处理器")

if __name__ == "__main__":
    main()

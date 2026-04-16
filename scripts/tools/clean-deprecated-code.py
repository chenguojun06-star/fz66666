#!/usr/bin/env python3
"""
清理后端废弃代码
删除所有标记为 @Deprecated 的方法
"""
import re
import os
from pathlib import Path

# 所有需要清理的文件（相对于backend/src/main/java路径）
FILES_TO_CLEAN = [
    "com/fashion/supplychain/finance/controller/MaterialReconciliationController.java",
    "com/fashion/supplychain/finance/controller/ShipmentReconciliationController.java",
    "com/fashion/supplychain/system/controller/UserController.java",
    "com/fashion/supplychain/style/controller/StyleBomController.java",
    "com/fashion/supplychain/style/controller/StyleInfoController.java",
    "com/fashion/supplychain/production/controller/ScanRecordController.java",
    "com/fashion/supplychain/production/controller/CuttingBundleController.java",
    "com/fashion/supplychain/production/controller/ProductionOrderController.java",
    "com/fashion/supplychain/production/controller/ProductWarehousingController.java",
    "com/fashion/supplychain/production/controller/PatternProductionController.java",
    "com/fashion/supplychain/production/controller/OrderTransferController.java",
    "com/fashion/supplychain/production/controller/CuttingTaskController.java",
    "com/fashion/supplychain/production/controller/MaterialInboundController.java",
    "com/fashion/supplychain/production/controller/PatternRevisionController.java",
    "com/fashion/supplychain/production/controller/MaterialPurchaseController.java",
    "com/fashion/supplychain/template/controller/TemplateLibraryController.java",
]

def find_method_end(content, start_pos):
    """从方法开始位置找到方法结束位置（匹配大括号）"""
    brace_count = 0
    in_method = False
    i = start_pos

    while i < len(content):
        if content[i] == '{':
            brace_count += 1
            in_method = True
        elif content[i] == '}':
            brace_count -= 1
            if in_method and brace_count == 0:
                return i + 1
        i += 1

    return -1

def clean_deprecated_methods(filepath):
    """删除文件中所有废弃的方法"""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    content = ''.join(lines)
    original_length = len(content)

    # 查找所有 @Deprecated 位置
    deprecated_positions = []
    for match in re.finditer(r'@Deprecated', content):
        deprecated_positions.append(match.start())

    if not deprecated_positions:
        return 0, 0

    # 对每个 @Deprecated，找到其对应的完整方法
    methods_to_remove = []

    for dep_pos in deprecated_positions:
        # 向前找到 /** 注释开始
        comment_start = content.rfind('/**', 0, dep_pos)
        if comment_start == -1:
            comment_start = dep_pos

        # 向后找到方法声明开始（public/private/protected）
        method_match = re.search(
            r'(public|private|protected)\s+',
            content[dep_pos:]
        )

        if not method_match:
            continue

        method_start = dep_pos + method_match.start()

        # 找到方法体的开始 {
        brace_start = content.find('{', method_start)
        if brace_start == -1:
            continue

        # 找到方法体的结束 }
        method_end = find_method_end(content, brace_start)
        if method_end == -1:
            continue

        methods_to_remove.append((comment_start, method_end))

    # 从后往前删除（避免位置偏移）
    removed_count = 0
    for start, end in reversed(sorted(methods_to_remove)):
        # 清理前后空白
        while start > 0 and content[start-1] in ' \t':
            start -= 1
        if start > 0 and content[start-1] == '\n':
            start -= 1

        content = content[:start] + '\n' + content[end:]
        removed_count += 1

    # 清理多余空行
    content = re.sub(r'\n{3,}', '\n\n', content)

    # 写回文件
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    new_length = len(content)
    saved = original_length - new_length

    return removed_count, saved

def main():
    base_path = Path("/Users/guojunmini4/Documents/服装66666/backend/src/main/java")

    total_methods = 0
    total_bytes = 0
    cleaned_files = []

    print("🧹 开始清理废弃代码...\n")

    for rel_path in FILES_TO_CLEAN:
        filepath = base_path / rel_path
        if not filepath.exists():
            print(f"⚠️  文件不存在: {rel_path}")
            continue

        methods, bytes_saved = clean_deprecated_methods(filepath)

        if methods > 0:
            total_methods += methods
            total_bytes += bytes_saved
            cleaned_files.append(rel_path.split('/')[-1])
            print(f"✅ {rel_path.split('/')[-1]:<50} 删除 {methods:>2} 个废弃方法，节省 {bytes_saved:>5} 字节")
        else:
            print(f"⏭️  {rel_path.split('/')[-1]:<50} 无废弃方法")

    print(f"\n" + "="*80)
    print(f"🎉 清理完成!")
    print(f"   - 处理文件: {len(cleaned_files)} 个")
    print(f"   - 删除方法: {total_methods} 个")
    print(f"   - 节省代码: {total_bytes} 字节 (~{total_bytes // 1024:.1f} KB)")
    print(f"\n📋 已清理文件:")
    for filename in cleaned_files:
        print(f"   - {filename}")

if __name__ == "__main__":
    main()

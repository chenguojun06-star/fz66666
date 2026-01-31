#!/usr/bin/env python3
# -*- coding: utf-8 -*-

file_path = "backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionOrderOrchestrator.java"

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 找到需要删除的范围
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if 'private void generateWorkorderAttachmentOnCreate' in line:
        start_idx = i
    if start_idx >= 0 and 'public boolean deleteById(String id)' in line:
        end_idx = i
        break

if start_idx >= 0 and end_idx >= 0:
    # 删除并插入注释
    new_lines = lines[:start_idx]
    new_lines.append('    // PDF自动生成功能已移除（所有PDF相关方法已删除）\n\n')
    new_lines.extend(lines[end_idx:])

    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    deleted_count = end_idx - start_idx
    print(f"✅ 已删除 {deleted_count} 行PDF相关代码")
    print(f"   删除范围：第 {start_idx+1} 行到第 {end_idx} 行")
else:
    print("❌ 未找到匹配的代码块")
    print(f"   start_idx={start_idx}, end_idx={end_idx}")

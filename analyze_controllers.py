#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Controller API端点分析脚本
"""

import os
import re
from collections import defaultdict
from pathlib import Path

def extract_controller_info(file_path):
    """提取Controller文件的信息"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 提取类名
    class_name = Path(file_path).stem

    # 提取@RequestMapping路径
    request_mapping_patterns = [
        r'@RequestMapping\s*\(\s*"([^"]+)"',
        r'@RequestMapping\s*\(\s*\{\s*"([^"]+)"',
        r'@RequestMapping\s*\(\s*value\s*=\s*"([^"]+)"'
    ]
    base_path = ""
    for pattern in request_mapping_patterns:
        match = re.search(pattern, content)
        if match:
            base_path = match.group(1)
            break

    # 提取端点详情 - 使用更精确的方法
    endpoints = []

    # 分割成行进行处理
    lines = content.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # 检测HTTP方法注解
        http_method = None
        path = ""

        if '@GetMapping' in line:
            http_method = 'GET'
        elif '@PostMapping' in line:
            http_method = 'POST'
        elif '@PutMapping' in line:
            http_method = 'PUT'
        elif '@DeleteMapping' in line:
            http_method = 'DELETE'

        if http_method:
            # 提取路径
            path_match = re.search(r'Mapping\s*\(\s*[{"]*\s*"([^"]*)"', line)
            if path_match:
                path = path_match.group(1)

            # 查找PreAuthorize注解（可能在这一行或下一行）
            permission = ""
            auth_check_lines = [line]
            if i + 1 < len(lines):
                auth_check_lines.append(lines[i + 1])
            for check_line in auth_check_lines:
                perm_match = re.search(r"@PreAuthorize\s*\(\s*\"hasAuthority\('([^']+)'\)", check_line)
                if perm_match:
                    permission = perm_match.group(1)
                    break

            # 查找方法名（在接下来的几行中）
            method_name = ""
            for j in range(i + 1, min(i + 5, len(lines))):
                method_line = lines[j].strip()
                # 匹配方法定义
                method_match = re.search(r'public\s+[\w<>,\s\?]+\s+(\w+)\s*\(', method_line)
                if method_match:
                    method_name = method_match.group(1)
                    break

            if method_name:
                endpoints.append({
                    'method': http_method,
                    'name': method_name,
                    'path': path,
                    'permission': permission
                })

        i += 1

    return {
        'class_name': class_name,
        'base_path': base_path,
        'endpoints': endpoints,
        'stats': {
            'GET': len([e for e in endpoints if e['method'] == 'GET']),
            'POST': len([e for e in endpoints if e['method'] == 'POST']),
            'PUT': len([e for e in endpoints if e['method'] == 'PUT']),
            'DELETE': len([e for e in endpoints if e['method'] == 'DELETE']),
            'total': len(endpoints),
            'with_auth': len([e for e in endpoints if e['permission']])
        }
    }

def main():
    base_path = Path('/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain')

    # 按模块组织Controller
    modules = defaultdict(list)

    # 遍历所有Controller文件
    for controller_file in base_path.rglob('*Controller.java'):
        # 提取模块名
        parts = controller_file.relative_to(base_path).parts
        module = parts[0] if parts else 'unknown'

        # 提取Controller信息
        info = extract_controller_info(controller_file)
        modules[module].append(info)

    # 生成Markdown报告
    print("# 后端 Controller API 端点完整分析报告")
    print()
    print(f"**生成时间**: 2026-02-01")
    print(f"**总Controller数**: {sum(len(controllers) for controllers in modules.values())}")
    print(f"**总API端点数**: {sum(c['stats']['total'] for controllers in modules.values() for c in controllers)}")
    print()

    # 模块分类映射
    module_names = {
        'system': '系统管理',
        'auth': '认证',
        'production': '生产管理',
        'warehouse': '仓库管理',
        'finance': '财务管理',
        'payroll': '工资结算',
        'style': '款式/样衣管理',
        'stock': '库存',
        'logistics': '物流',
        'template': '模板库',
        'datacenter': '数据中心',
        'dashboard': '看板',
        'wechat': '微信小程序',
        'common': '通用'
    }

    # 输出汇总表
    print("## 📊 模块统计汇总")
    print()
    print("| 模块 | Controller数 | API端点数 | GET | POST | PUT | DELETE | 带权限 |")
    print("|------|------------|----------|-----|------|-----|--------|--------|")

    for module in sorted(modules.keys()):
        controllers = modules[module]
        total_endpoints = sum(c['stats']['total'] for c in controllers)
        total_get = sum(c['stats']['GET'] for c in controllers)
        total_post = sum(c['stats']['POST'] for c in controllers)
        total_put = sum(c['stats']['PUT'] for c in controllers)
        total_delete = sum(c['stats']['DELETE'] for c in controllers)
        total_auth = sum(c['stats']['with_auth'] for c in controllers)

        module_display = module_names.get(module, module)
        print(f"| {module_display} ({module}) | {len(controllers)} | {total_endpoints} | {total_get} | {total_post} | {total_put} | {total_delete} | {total_auth} |")

    print()
    print("## 📑 详细Controller列表")
    print()

    # 按模块输出详细信息
    for module in sorted(modules.keys()):
        module_display = module_names.get(module, module)
        print(f"### {module_display} ({module})")
        print()

        controllers = sorted(modules[module], key=lambda x: x['class_name'])

        for ctrl in controllers:
            print(f"#### {ctrl['class_name']}")
            print()
            print(f"- **基础路径**: `{ctrl['base_path']}`")
            print(f"- **端点数量**: {ctrl['stats']['total']} (GET: {ctrl['stats']['GET']}, POST: {ctrl['stats']['POST']}, PUT: {ctrl['stats']['PUT']}, DELETE: {ctrl['stats']['DELETE']})")
            print(f"- **权限控制**: {ctrl['stats']['with_auth']}/{ctrl['stats']['total']} 个端点有权限注解")
            print()

            if ctrl['endpoints']:
                print("| HTTP方法 | 路径 | 方法名 | 权限码 |")
                print("|---------|------|--------|--------|")

                for ep in sorted(ctrl['endpoints'], key=lambda x: (x['method'], x['path'])):
                    full_path = ctrl['base_path'] + (ep['path'] if ep['path'] else '')
                    permission = ep['permission'] if ep['permission'] else '-'
                    print(f"| {ep['method']} | `{full_path}` | `{ep['name']}` | {permission} |")

                print()

        print()

    # 输出问题分析
    print("## 🔍 RESTful规范分析")
    print()

    issues = []

    # 检查路径命名
    for module, controllers in modules.items():
        for ctrl in controllers:
            base_path = ctrl['base_path']

            # 检查是否使用了复数形式
            if base_path and not any(plural in base_path for plural in ['/list', '/page', 's/']):
                if not base_path.endswith('s') and not any(word in base_path for word in ['dashboard', 'auth', 'reconciliation', 'approval']):
                    issues.append(f"⚠️ `{ctrl['class_name']}`: 基础路径 `{base_path}` 可能需要使用复数形式")

            # 检查端点路径
            for ep in ctrl['endpoints']:
                full_path = base_path + ep['path']

                # 检查是否使用了动词
                if any(verb in ep['path'].lower() for verb in ['get', 'add', 'update', 'delete', 'create', 'remove']):
                    issues.append(f"⚠️ `{ctrl['class_name']}.{ep['name']}`: 路径 `{full_path}` 包含动词，应使用HTTP方法表达操作")

                # 检查POST是否用于查询
                if ep['method'] == 'POST' and any(word in ep['name'].lower() for word in ['get', 'list', 'query', 'search']):
                    issues.append(f"⚠️ `{ctrl['class_name']}.{ep['name']}`: 查询操作应使用GET而不是POST")

    if issues:
        print("### 发现的问题")
        print()
        for issue in issues[:20]:  # 只显示前20个
            print(f"- {issue}")
        if len(issues) > 20:
            print(f"- ... 还有 {len(issues) - 20} 个问题")
    else:
        print("✅ 未发现明显的RESTful规范问题")

    print()
    print("## 📝 总结")
    print()
    print(f"- 系统共有 **{sum(len(controllers) for controllers in modules.values())} 个Controller**")
    print(f"- 提供 **{sum(c['stats']['total'] for controllers in modules.values() for c in controllers)} 个API端点**")
    print(f"- 其中 **{sum(c['stats']['with_auth'] for controllers in modules.values() for c in controllers)} 个端点** 有权限控制")
    print(f"- 平均每个Controller有 **{sum(c['stats']['total'] for controllers in modules.values() for c in controllers) // sum(len(controllers) for controllers in modules.values()):.1f} 个端点**")
    print()
    print("**建议**：")
    print("- 继续保持使用 `@PreAuthorize` 进行细粒度的权限控制")
    print("- 考虑将一些超大Controller（端点数>20）拆分为多个子Controller")
    print("- 统一API路径命名规范，尽量遵循RESTful设计原则")

if __name__ == '__main__':
    main()

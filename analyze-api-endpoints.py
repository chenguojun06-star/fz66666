#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
后端Controller API接口详细统计分析
分析所有Controller的API端点，识别重复、冗余和优化机会
"""

import os
import re
from collections import defaultdict
from pathlib import Path
import json

def classify_function_type(method, path, method_name):
    """功能类型分类"""
    path_l = path.lower()
    method_l = method_name.lower()

    # 列表/分页查询
    if '/list' in path_l or '/page' in path_l:
        return 'list_query'

    # 详情查询
    if '/detail' in path_l or '/{id}' in path or '/info' in path_l:
        return 'detail_query'

    # 统计/聚合
    if any(kw in path_l for kw in ['/statistics', '/summary', '/dashboard', '/count', '/overview']):
        return 'statistics'

    # 导出
    if '/export' in path_l or 'export' in method_l:
        return 'export'

    # 批量操作
    if '/batch' in path_l or 'batch' in method_l:
        return 'batch_operation'

    # 创建
    if method == 'POST' and (any(kw in path_l for kw in ['/create', '/add', '']) and 'update' not in path_l):
        return 'create'

    # 更新
    if method == 'PUT' or '/update' in path_l or 'update' in method_l:
        return 'update'

    # 删除
    if method == 'DELETE' or '/delete' in path_l or 'delete' in method_l:
        return 'delete'

    # 业务操作
    if any(kw in path_l for kw in ['/submit', '/approve', '/reject', '/close', '/cancel', '/finish', '/confirm', '/backfill']):
        return 'business_operation'

    # 其他查询
    if method == 'GET':
        return 'other_query'

    # 其他创建
    if method == 'POST':
        return 'other_create'

    return 'other'

def classify_api_category(path, controller_name):
    """API分类：小程序/PC/管理后台"""
    path_l = path.lower()
    ctrl_l = controller_name.lower()

    # 小程序API
    if any(kw in path_l for kw in ['/wechat/', '/miniprogram/', '/mini-program/']):
        return 'miniprogram'

    # 扫码相关主要是小程序
    if 'scan' in ctrl_l or 'bundle' in ctrl_l:
        return 'miniprogram'

    # 管理后台API
    if any(kw in ctrl_l for kw in ['user', 'role', 'permission', 'operationlog', 'loginlog', 'factory', 'dict', 'auth']):
        return 'admin'

    # 默认PC端
    return 'pc'

def extract_endpoints(file_path):
    """从Controller文件提取所有端点"""
    endpoints = []

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

        # 提取类名
        class_match = re.search(r'public\s+class\s+(\w+Controller)', content)
        controller_name = class_match.group(1) if class_match else file_path.stem

        # 提取@RequestMapping基础路径
        base_path_match = re.search(r'@RequestMapping\s*\(\s*["\']([^"\']+)["\']', content)
        base_path = base_path_match.group(1) if base_path_match else ''

        # 匹配模式：支持有参数和无参数的情况
        patterns = [
            (r'@GetMapping\s*(?:\(\s*["\']([^"\']*)["\'])?', 'GET'),
            (r'@PostMapping\s*(?:\(\s*["\']([^"\']*)["\'])?', 'POST'),
            (r'@PutMapping\s*(?:\(\s*["\']([^"\']*)["\'])?', 'PUT'),
            (r'@DeleteMapping\s*(?:\(\s*["\']([^"\']*)["\'])?', 'DELETE'),
        ]

        for pattern, http_method in patterns:
            for match in re.finditer(pattern, content):
                # 提取路径
                path = match.group(1) if match.lastindex and match.group(1) else ''
                full_path = base_path + path

                # 提取Java方法名（注解后的下一个public方法）
                pos = match.end()
                # 寻找注解后的方法定义
                method_search = content[pos:pos+500]
                java_method_match = re.search(r'public\s+(?:ResponseEntity<\w+>|Result<[\w<>, ]+>|\w+)\s+(\w+)\s*\(', method_search)
                java_method = java_method_match.group(1) if java_method_match else 'unknown'

                # 分类
                func_type = classify_function_type(http_method, full_path, java_method)
                category = classify_api_category(full_path, controller_name)

                endpoint = {
                    'method': http_method,
                    'path': full_path,
                    'java_method': java_method,
                    'func_type': func_type,
                    'category': category,
                    'controller': controller_name,
                    'file': str(file_path)
                }
                endpoints.append(endpoint)

    return endpoints

def find_potential_duplicates(all_endpoints):
    """查找潜在的重复/冗余API"""
    duplicates = []
    path_groups = defaultdict(list)

    # 按路径分组
    for ep in all_endpoints:
        normalized_path = re.sub(r'\{[^}]+\}', '{id}', ep['path'])  # 标准化路径参数
        path_groups[normalized_path].append(ep)

    # 查找重复
    for path, endpoints in path_groups.items():
        if len(endpoints) > 1:
            # 检查是否是真正的重复（不同Controller的同名端点可能是正常的）
            controllers = set(ep['controller'] for ep in endpoints)
            if len(controllers) > 1:
                duplicates.append({
                    'path': path,
                    'count': len(endpoints),
                    'controllers': list(controllers),
                    'endpoints': endpoints
                })

    return duplicates

def analyze_optimization_opportunities(all_endpoints, modules_data):
    """分析优化机会"""
    suggestions = []

    # 1. 查找list和page并存的情况
    list_page_duplicates = []
    for module, data in modules_data.items():
        list_endpoints = [ep for ep in data['endpoints'] if '/list' in ep['path'].lower()]
        page_endpoints = [ep for ep in data['endpoints'] if '/page' in ep['path'].lower()]

        # 检查同一资源是否同时有list和page
        for list_ep in list_endpoints:
            for page_ep in page_endpoints:
                if list_ep['controller'] == page_ep['controller']:
                    list_page_duplicates.append({
                        'module': module,
                        'controller': list_ep['controller'],
                        'list': list_ep['path'],
                        'page': page_ep['path']
                    })

    if list_page_duplicates:
        suggestions.append({
            'type': 'list_page_duplicate',
            'title': '同一Controller同时存在/list和/page端点',
            'count': len(list_page_duplicates),
            'items': list_page_duplicates,
            'recommendation': '建议保留/page端点（支持分页），废弃/list端点或用查询参数区分'
        })

    # 2. 查找可以用查询参数替代的端点
    param_opportunities = []
    for module, data in modules_data.items():
        endpoints = data['endpoints']
        base_paths = defaultdict(list)

        for ep in endpoints:
            # 提取基础路径（去除最后一段）
            parts = ep['path'].split('/')
            if len(parts) > 2:
                base = '/'.join(parts[:-1])
                base_paths[base].append(ep)

        # 查找同一基础路径下的多个GET端点
        for base, eps in base_paths.items():
            get_eps = [ep for ep in eps if ep['method'] == 'GET']
            if len(get_eps) >= 3:  # 3个或更多GET端点
                param_opportunities.append({
                    'module': module,
                    'base_path': base,
                    'endpoints': [ep['path'] for ep in get_eps],
                    'count': len(get_eps)
                })

    if param_opportunities:
        suggestions.append({
            'type': 'query_param_opportunity',
            'title': '可以用查询参数合并的端点',
            'count': len(param_opportunities),
            'items': param_opportunities[:5],  # 只显示前5个
            'recommendation': '建议用单一端点 + 查询参数替代多个相似端点'
        })

    # 3. 查找功能重叠的端点
    detail_endpoints = [ep for ep in all_endpoints if ep['func_type'] == 'detail_query']
    detail_by_controller = defaultdict(list)
    for ep in detail_endpoints:
        detail_by_controller[ep['controller']].append(ep)

    overlapping_details = []
    for controller, eps in detail_by_controller.items():
        if len(eps) > 2:  # 超过2个详情查询端点
            overlapping_details.append({
                'controller': controller,
                'endpoints': [ep['path'] for ep in eps],
                'count': len(eps)
            })

    if overlapping_details:
        suggestions.append({
            'type': 'overlapping_details',
            'title': '同一Controller有多个详情查询端点',
            'count': len(overlapping_details),
            'items': overlapping_details[:5],
            'recommendation': '建议评估是否可以合并为单一详情端点'
        })

    return suggestions

def main():
    """主函数"""
    print("=" * 100)
    print("后端Controller API接口详细统计分析")
    print("=" * 100)

    # 扫描所有Controller文件
    base_path = Path('backend/src/main/java/com/fashion/supplychain')
    controller_files = list(base_path.rglob('*Controller.java'))

    print(f"\n扫描到 {len(controller_files)} 个Controller文件")
    print("正在分析...")

    # 统计数据结构
    stats = {
        'total_endpoints': 0,
        'total_controllers': len(controller_files),
        'http_methods': defaultdict(int),
        'function_types': defaultdict(int),
        'api_categories': defaultdict(list),
        'modules': defaultdict(lambda: {'count': 0, 'endpoints': [], 'controllers': set()})
    }

    all_endpoints = []

    # 提取所有端点
    for ctrl_file in controller_files:
        # 确定模块名
        parts = ctrl_file.parts
        module_idx = -1
        for i, part in enumerate(parts):
            if part == 'supplychain' and i + 1 < len(parts):
                module_idx = i + 1
                break

        module = parts[module_idx] if module_idx > 0 else 'unknown'

        try:
            endpoints = extract_endpoints(ctrl_file)
            all_endpoints.extend(endpoints)

            stats['total_endpoints'] += len(endpoints)
            stats['modules'][module]['count'] += len(endpoints)
            stats['modules'][module]['endpoints'].extend(endpoints)
            stats['modules'][module]['controllers'].add(ctrl_file.stem)

            for ep in endpoints:
                stats['http_methods'][ep['method']] += 1
                stats['function_types'][ep['func_type']] += 1
                stats['api_categories'][ep['category']].append(ep)

        except Exception as e:
            print(f"处理 {ctrl_file} 时出错: {e}")

    print(f"\n✓ 分析完成！共找到 {stats['total_endpoints']} 个API端点\n")

    # ============= 输出统计报告 =============

    print("\n" + "=" * 100)
    print("【1. HTTP方法分类统计】")
    print("=" * 100)
    for method in ['GET', 'POST', 'PUT', 'DELETE']:
        count = stats['http_methods'][method]
        pct = count / stats['total_endpoints'] * 100 if stats['total_endpoints'] > 0 else 0
        print(f"  {method:8s}: {count:3d} 个 ({pct:5.1f}%)")

    print("\n" + "=" * 100)
    print("【2. 功能类型分类统计】")
    print("=" * 100)
    type_names = {
        'list_query': '列表/分页查询',
        'detail_query': '详情查询',
        'create': '创建操作',
        'update': '更新操作',
        'delete': '删除操作',
        'statistics': '统计/聚合',
        'export': '导出功能',
        'batch_operation': '批量操作',
        'business_operation': '业务操作',
        'other_query': '其他查询',
        'other_create': '其他创建',
        'other': '其他'
    }

    for func_type, count in sorted(stats['function_types'].items(), key=lambda x: -x[1]):
        pct = count / stats['total_endpoints'] * 100 if stats['total_endpoints'] > 0 else 0
        name = type_names.get(func_type, func_type)
        print(f"  {name:18s}: {count:3d} 个 ({pct:5.1f}%)")

    print("\n" + "=" * 100)
    print("【3. API分类（按使用端）】")
    print("=" * 100)
    category_names = {
        'miniprogram': '小程序专用',
        'pc': 'PC端业务',
        'admin': '管理后台'
    }

    for cat in ['pc', 'admin', 'miniprogram']:
        count = len(stats['api_categories'][cat])
        pct = count / stats['total_endpoints'] * 100 if stats['total_endpoints'] > 0 else 0
        print(f"  {category_names[cat]:14s}: {count:3d} 个 ({pct:5.1f}%)")

    print("\n" + "=" * 100)
    print("【4. 各模块端点数量】")
    print("=" * 100)
    for module, info in sorted(stats['modules'].items(), key=lambda x: -x[1]['count']):
        controller_count = len(info['controllers'])
        print(f"  {module:20s}: {info['count']:3d} 个端点 ({controller_count:2d} 个Controller)")

    # ============= 重复/冗余分析 =============

    print("\n" + "=" * 100)
    print("【5. 重复/冗余API识别】")
    print("=" * 100)

    duplicates = find_potential_duplicates(all_endpoints)
    if duplicates:
        print(f"发现 {len(duplicates)} 组可能重复的端点：")
        for dup in duplicates[:10]:  # 只显示前10个
            print(f"\n  路径: {dup['path']}")
            print(f"  出现次数: {dup['count']}")
            print(f"  涉及Controller: {', '.join(dup['controllers'])}")
    else:
        print("✓ 未发现明显的重复端点")

    # ============= 优化建议 =============

    print("\n" + "=" * 100)
    print("【6. API优化建议】")
    print("=" * 100)

    suggestions = analyze_optimization_opportunities(all_endpoints, stats['modules'])

    if suggestions:
        for idx, suggestion in enumerate(suggestions, 1):
            print(f"\n{idx}. {suggestion['title']}")
            print(f"   发现数量: {suggestion['count']}")
            print(f"   建议: {suggestion['recommendation']}")

            if suggestion['items']:
                print("   示例:")
                for item in suggestion['items'][:3]:  # 只显示前3个示例
                    if suggestion['type'] == 'list_page_duplicate':
                        print(f"     - {item['controller']}: {item['list']} 和 {item['page']}")
                    elif suggestion['type'] == 'query_param_opportunity':
                        print(f"     - {item['base_path']}/... ({item['count']}个端点)")
                    elif suggestion['type'] == 'overlapping_details':
                        print(f"     - {item['controller']} ({item['count']}个详情端点)")
    else:
        print("✓ 未发现明显的优化机会")

    # ============= 保存详细数据 =============

    output_data = {
        'summary': {
            'total_endpoints': stats['total_endpoints'],
            'total_controllers': stats['total_controllers'],
            'http_methods': dict(stats['http_methods']),
            'function_types': dict(stats['function_types']),
            'api_categories': {k: len(v) for k, v in stats['api_categories'].items()}
        },
        'modules': {
            module: {
                'count': info['count'],
                'controllers': list(info['controllers']),
                'endpoints': info['endpoints']
            }
            for module, info in stats['modules'].items()
        },
        'duplicates': duplicates,
        'optimization_suggestions': suggestions
    }

    output_file = 'Controller-API统计报告-详细数据.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 100)
    print(f"详细数据已保存到: {output_file}")
    print("=" * 100)

if __name__ == '__main__':
    main()

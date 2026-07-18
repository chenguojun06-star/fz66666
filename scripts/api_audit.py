#!/usr/bin/env python3
"""
三端 API 一致性校验工具
用法: python3 scripts/api_audit.py [--verbose]

扫描后端所有 Controller 端点，对比 PC端/小程序/H5 的 API 调用，
找出所有路径不匹配的调用，防止"拼连问题"。

支持：
  - @RequestMapping 数组语法 {"/api/x", "/api/y"} 多路径
  - 反引号模板字符串 `...${var}...` 允许内部含引号
  - {param} 通配符匹配（前端 `${type}` 可匹配后端具体路径 /payroll 等）
"""

import os
import re
import sys
import argparse


def get_project_root():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(script_dir)


def find_backend_endpoints(backend_root):
    """扫描后端所有 Controller，提取完整 API 端点路径

    支持数组语法：@RequestMapping({"/api/x", "/api/y"}) 会展开为两个端点
    """
    endpoints = []
    # 数组语法：@RequestMapping({...}) 或 @RequestMapping({...} ...) 等
    # 单路径语法：@RequestMapping("/api/x")
    class_array_pattern = re.compile(
        r'@RequestMapping\s*\(\s*\{([^}]+)\}'
    )
    class_single_pattern = re.compile(
        r'@RequestMapping\s*\(\s*["\']([^"\']+)["\']'
    )
    method_mapping_pattern = re.compile(
        r'@(GetMapping|PostMapping|PutMapping|DeleteMapping)\s*\(\s*(?:value\s*=\s*)?["\']([^"\']+)["\']'
    )
    # 数组语法的方法级注解：@GetMapping({"/x", "/y"})
    method_array_pattern = re.compile(
        r'@(GetMapping|PostMapping|PutMapping|DeleteMapping)\s*\(\s*\{([^}]+)\}'
    )
    bare_method_pattern = re.compile(
        r'@(GetMapping|PostMapping|PutMapping|DeleteMapping)\s*(?:\(\s*\))?\s*$'
    )
    # 提取字符串字面量
    string_literal_pattern = re.compile(r'["\']([^"\']+)["\']')

    def parse_array_paths(array_content):
        """从数组内容 {"/a", "/b"} 中提取所有路径"""
        return [m.group(1) for m in string_literal_pattern.finditer(array_content)]

    for root, dirs, files in os.walk(backend_root):
        for file in files:
            if file.endswith('.java') and 'Controller' in file:
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                except Exception:
                    continue

                class_prefixes = []  # 支持多个 class prefix（数组语法）
                found_class = False
                for line in lines:
                    if ' class ' in line:
                        found_class = True
                        break
                    # 数组语法优先
                    arr_match = class_array_pattern.search(line)
                    if arr_match:
                        paths = parse_array_paths(arr_match.group(1))
                        for p in paths:
                            class_prefixes.append(p.strip('/'))
                        # 不 break，可能多行
                    else:
                        single_match = class_single_pattern.search(line)
                        if single_match:
                            class_prefixes.append(single_match.group(1).strip('/'))

                if not found_class:
                    continue

                # 如果类没有 @RequestMapping，使用空 prefix
                if not class_prefixes:
                    class_prefixes = ['']

                for line_num, line in enumerate(lines, 1):
                    stripped = line.strip()
                    if stripped.startswith('*') or stripped.startswith('//') or stripped.startswith('/*'):
                        continue

                    # 方法级数组语法：@GetMapping({"/x", "/y"})
                    method_arr_match = method_array_pattern.search(line)
                    if method_arr_match:
                        method_type = method_arr_match.group(1)
                        method_paths = parse_array_paths(method_arr_match.group(2))
                        for mp in method_paths:
                            mp = mp.strip('/')
                            for cp in class_prefixes:
                                if cp and mp:
                                    full_path = f"/{cp}/{mp}"
                                elif cp:
                                    full_path = f"/{cp}"
                                elif mp:
                                    full_path = f"/{mp}"
                                else:
                                    full_path = "/"
                                full_path = full_path.replace('//', '/')
                                endpoints.append({
                                    'path': full_path,
                                    'method': _http_method_of(method_type),
                                    'file': os.path.relpath(path, get_project_root())
                                })
                        continue  # 已处理，跳过单路径匹配

                    # 方法级单路径语法：@GetMapping("/x")
                    for match in method_mapping_pattern.finditer(line):
                        method_type = match.group(1)
                        method_path = match.group(2).strip('/')
                        for cp in class_prefixes:
                            if cp and method_path:
                                full_path = f"/{cp}/{method_path}"
                            elif cp:
                                full_path = f"/{cp}"
                            elif method_path:
                                full_path = f"/{method_path}"
                            else:
                                full_path = "/"
                            full_path = full_path.replace('//', '/')
                            endpoints.append({
                                'path': full_path,
                                'method': _http_method_of(method_type),
                                'file': os.path.relpath(path, get_project_root())
                            })

                    # 方法级无路径注解：@PostMapping
                    bare_match = bare_method_pattern.match(stripped)
                    if bare_match:
                        method_type = bare_match.group(1)
                        for cp in class_prefixes:
                            if cp:
                                full_path = f"/{cp}"
                            else:
                                full_path = "/"
                            full_path = full_path.replace('//', '/')
                            endpoints.append({
                                'path': full_path,
                                'method': _http_method_of(method_type),
                                'file': os.path.relpath(path, get_project_root())
                            })

    return endpoints


def _http_method_of(mapping_type):
    if mapping_type == 'PostMapping':
        return 'POST'
    if mapping_type == 'PutMapping':
        return 'PUT'
    if mapping_type == 'DeleteMapping':
        return 'DELETE'
    return 'GET'


# 匹配三种引号包裹的字符串：单引号'x'、双引号"x"、反引号`x`
# 反引号内允许包含 ' 和 "
_API_CALL_PATTERN = re.compile(
    r'''(?:api|http)\.(get|post|put|delete|patch)\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)''',
    re.IGNORECASE
)

# 小程序 ok('path', 'METHOD', ...) 调用
_OK_CALL_PATTERN = re.compile(
    r'''\bok\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)\s*,\s*['"]?(GET|POST|PUT|DELETE)['"]?'''
)


def find_pc_frontend_calls(frontend_root):
    """扫描 PC 端 API 调用: api.get('/path') 或 api.get(`...${var}...`)"""
    calls = []
    skip_dirs = {'node_modules', 'dist', '__tests__', '.test.', '.spec.'}

    for root, dirs, files in os.walk(frontend_root):
        if any(skip in root for skip in skip_dirs):
            continue
        for file in files:
            if file.endswith(('.tsx', '.ts', '.jsx', '.js')):
                if any(skip in file for skip in skip_dirs):
                    continue
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        for line_num, line in enumerate(f, 1):
                            for match in _API_CALL_PATTERN.finditer(line):
                                method = match.group(1).upper()
                                if method == 'PATCH':
                                    continue
                                # 取三种引号中匹配到的那一种
                                url = match.group(2) or match.group(3) or match.group(4)
                                if not url:
                                    continue
                                # 跳过动态拼接：${BASE}/xxx 这种动态 baseURL 无法静态解析
                                if url.startswith('${'):
                                    continue
                                # 把 ${var} 替换为 {param}
                                url = re.sub(r'\$\{[^}]+\}', '{param}', url)
                                # 跳过完整外部 URL
                                if url.startswith('http://') or url.startswith('https://'):
                                    continue
                                calls.append({
                                    'path': url,
                                    'method': method,
                                    'file': os.path.relpath(path, get_project_root()),
                                    'line': line_num
                                })
                except Exception:
                    pass
    return calls


def find_miniprogram_calls(miniprogram_root):
    """扫描小程序 API 调用: return ok('/api/xxx', 'GET', {})"""
    calls = []
    api_modules = os.path.join(miniprogram_root, 'utils', 'api-modules')
    if not os.path.exists(api_modules):
        return calls

    for root, dirs, files in os.walk(api_modules):
        for file in files:
            if file.endswith('.js'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        for line_num, line in enumerate(f, 1):
                            for match in _OK_CALL_PATTERN.finditer(line):
                                url = match.group(1) or match.group(2) or match.group(3)
                                method = match.group(4).upper()
                                if not url:
                                    continue
                                url = re.sub(r'\$\{[^}]+\}', '{param}', url)
                                calls.append({
                                    'path': url,
                                    'method': method,
                                    'file': os.path.relpath(path, get_project_root()),
                                    'line': line_num
                                })
                except Exception:
                    pass
    return calls


def find_h5_calls(h5_root):
    """扫描 H5 端 API 调用: http.get('/api/xxx')"""
    calls = []
    api_dir = os.path.join(h5_root, 'src', 'api')
    if not os.path.exists(api_dir):
        return calls

    for root, dirs, files in os.walk(api_dir):
        for file in files:
            if file.endswith('.js'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        for line_num, line in enumerate(f, 1):
                            for match in _API_CALL_PATTERN.finditer(line):
                                method = match.group(1).upper()
                                if method == 'PATCH':
                                    continue
                                url = match.group(2) or match.group(3) or match.group(4)
                                if not url:
                                    continue
                                # 跳过动态拼接：${BASE}/xxx 这种动态 baseURL 无法静态解析
                                if url.startswith('${'):
                                    continue
                                url = re.sub(r'\$\{[^}]+\}', '{param}', url)
                                if url.startswith('http://') or url.startswith('https://'):
                                    continue
                                calls.append({
                                    'path': url,
                                    'method': method,
                                    'file': os.path.relpath(path, get_project_root()),
                                    'line': line_num
                                })
                except Exception:
                    pass
    return calls


def normalize_path(path):
    """标准化路径用于比对: 去掉尾部斜杠、参数占位符统一为 {param}"""
    p = path.rstrip('/')
    p = re.sub(r'\{[^}]+\}', '{param}', p)
    p = re.sub(r':[a-zA-Z0-9_]+', '{param}', p)
    if '?' in p:
        p = p.split('?')[0]
    return p


def _path_to_regex(path):
    """把含 {param} 的路径转换为正则，{param} 匹配任意非斜杠段"""
    parts = path.split('/')
    regex_parts = []
    for p in parts:
        if p == '{param}':
            regex_parts.append(r'[^/]+')
        else:
            regex_parts.append(re.escape(p))
    return re.compile('^' + '/'.join(regex_parts) + '$')


def match_endpoint(call_path, call_method, endpoints):
    """检查前端调用是否能匹配到后端端点

    规则：
      - 严格匹配：调用与端点路径完全一致（含 {param} 占位符位置）
      - 通配符匹配：调用方含 {param} 时，{param} 可匹配后端任意路径段
        例：调用 /finance/tax-export/{param} 可匹配后端 /finance/tax-export/payroll
    """
    call_norm = normalize_path(call_path)

    # 调用方两种变体：带/不带 /api 前缀
    call_variants = [call_norm]
    if call_norm.startswith('/api'):
        call_variants.append(call_norm[4:])
    else:
        call_variants.append('/api' + call_norm)

    # 如果调用方含 {param}，预编译正则
    call_regexes = []
    if '{param}' in call_norm:
        for cv in call_variants:
            try:
                call_regexes.append(_path_to_regex(cv))
            except re.error:
                pass

    for ep in endpoints:
        if call_method != ep['method']:
            continue

        ep_norm = normalize_path(ep['path'])
        ep_variants = [ep_norm]
        if ep_norm.startswith('/api'):
            ep_variants.append(ep_norm[4:])
        else:
            ep_variants.append('/api' + ep_norm)

        for cv in call_variants:
            for ev in ep_variants:
                # 严格相等
                if cv == ev:
                    return ep
                # 通配符匹配：调用方含 {param}，后端是具体路径
                if call_regexes and '{param}' not in ev:
                    for rgx in call_regexes:
                        if rgx.match(ev):
                            return ep

    return None


def find_suggestions(call_path, call_method, endpoints, top_n=3):
    """为不匹配的调用找最相似的后端端点建议"""
    call_norm = normalize_path(call_path)
    call_parts = set(p for p in call_norm.split('/') if p and p != '{param}')

    scored = []
    for ep in endpoints:
        if call_method != ep['method']:
            continue
        ep_norm = normalize_path(ep['path'])
        ep_parts = set(p for p in ep_norm.split('/') if p and p != '{param}')
        if not call_parts or not ep_parts:
            continue
        overlap = len(call_parts & ep_parts)
        total = len(call_parts | ep_parts)
        similarity = overlap / total if total > 0 else 0
        if similarity > 0.3:
            scored.append((similarity, ep))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [ep for _, ep in scored[:top_n]]


def main():
    parser = argparse.ArgumentParser(description='三端 API 一致性校验')
    parser.add_argument('--verbose', '-v', action='store_true', help='详细输出')
    args = parser.parse_args()

    project_root = get_project_root()
    backend_root = os.path.join(project_root, 'backend', 'src', 'main', 'java')
    frontend_root = os.path.join(project_root, 'frontend', 'src')
    miniprogram_root = os.path.join(project_root, 'miniprogram')
    h5_root = os.path.join(project_root, 'h5-web')

    print("=" * 70)
    print("  三端 API 一致性校验工具")
    print("=" * 70)

    print("\n[1/5] 扫描后端端点...")
    endpoints = find_backend_endpoints(backend_root)
    print(f"  后端端点总数: {len(endpoints)}")

    print("\n[2/5] 扫描 PC 端 API 调用...")
    pc_calls = find_pc_frontend_calls(frontend_root)
    print(f"  PC 端调用数: {len(pc_calls)}")

    print("\n[3/5] 扫描小程序 API 调用...")
    mini_calls = find_miniprogram_calls(miniprogram_root)
    print(f"  小程序调用数: {len(mini_calls)}")

    print("\n[4/5] 扫描 H5 端 API 调用...")
    h5_calls = find_h5_calls(h5_root)
    print(f"  H5 端调用数: {len(h5_calls)}")

    print("\n[5/5] 比对分析...")

    all_issues = []

    for platform, calls in [('PC端', pc_calls), ('小程序', mini_calls), ('H5端', h5_calls)]:
        matched = 0
        issues = []
        seen = set()

        for call in calls:
            key = (call['method'], normalize_path(call['path']))
            if key in seen:
                matched += 1
                continue
            seen.add(key)

            match = match_endpoint(call['path'], call['method'], endpoints)
            if match:
                matched += 1
            else:
                suggestions = find_suggestions(call['path'], call['method'], endpoints)
                issues.append({
                    'platform': platform,
                    'method': call['method'],
                    'path': call['path'],
                    'file': call['file'],
                    'line': call['line'],
                    'suggestions': suggestions
                })

        all_issues.extend(issues)

    print("\n" + "=" * 70)
    print("  校验结果汇总")
    print("=" * 70)

    for platform, calls in [('PC端', pc_calls), ('小程序', mini_calls), ('H5端', h5_calls)]:
        platform_issues = [i for i in all_issues if i['platform'] == platform]
        total_unique = len(set(
            (i['method'], normalize_path(i['path']))
            for i in all_issues if i['platform'] == platform
        ))
        print(f"\n  {platform}: {len(calls)} 个调用, {len(platform_issues)} 个可疑不匹配 ({total_unique} 个唯一路径)")

    print(f"\n  总计: {len(all_issues)} 个可疑不匹配")

    if all_issues:
        print("\n" + "=" * 70)
        print("  可疑不匹配详情")
        print("=" * 70)

        for platform in ['PC端', '小程序', 'H5端']:
            platform_issues = [i for i in all_issues if i['platform'] == platform]
            if not platform_issues:
                continue

            print(f"\n  【{platform}】")
            unique_paths = {}
            for issue in platform_issues:
                key = (issue['method'], normalize_path(issue['path']))
                if key not in unique_paths:
                    unique_paths[key] = []
                unique_paths[key].append(issue)

            for key, issues in unique_paths.items():
                method, path = key
                sample = issues[0]
                print(f"\n    [{method}] {path}")
                print(f"      出现位置: {len(issues)} 处")
                if args.verbose:
                    for iss in issues:
                        print(f"        - {iss['file']}:{iss['line']}")
                else:
                    print(f"        首次出现: {sample['file']}:{sample['line']}")
                if sample['suggestions']:
                    print(f"      💡 可能是:")
                    for sug in sample['suggestions']:
                        print(f"        [{sug['method']}] {sug['path']}  ({sug['file']})")

    print("\n" + "=" * 70)

    if all_issues:
        print(f"\n  ⚠️  发现 {len(all_issues)} 个可疑不匹配，请逐一核实")
        sys.exit(1)
    else:
        print("\n  ✅ 所有 API 调用路径均匹配")
        sys.exit(0)


if __name__ == "__main__":
    main()

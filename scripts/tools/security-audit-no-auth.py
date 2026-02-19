#!/usr/bin/env python3
"""扫描缺少@PreAuthorize注解的API端点"""
import os
import re

backend_path = 'backend/src/main/java'
missing_auth = []

for root, dirs, files in os.walk(backend_path):
    for file in files:
        if file.endswith('Controller.java'):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                
                for i, line in enumerate(lines):
                    # 查找Mapping注解
                    if re.search(r'@(Get|Post|Put|Delete|Patch)Mapping', line):
                        # 跳过公开端点
                        method_block = ''.join(lines[max(0, i-5):min(len(lines), i+10)])
                        if any(kw in method_block.lower() for kw in ['login', 'register', 'captcha', 'health', 'actuator']):
                            continue
                        
                        # 检查附近是否有@PreAuthorize
                        has_auth = False
                        for j in range(max(0, i-5), min(len(lines), i+2)):
                            if '@PreAuthorize' in lines[j]:
                                has_auth = True
                                break
                        
                        if not has_auth:
                            # 提取映射路径
                            mapping_match = re.search(r'@(\w+Mapping)\("?([^")\n]*)', line)
                            if mapping_match:
                                http_method = mapping_match.group(1)
                                path_str = mapping_match.group(2) if mapping_match.group(2) else "/"
                                
                                # 提取方法名
                                for k in range(i+1, min(len(lines), i+10)):
                                    method_match = re.search(r'public\s+\w+\s+(\w+)\s*\(', lines[k])
                                    if method_match:
                                        method_name = method_match.group(1)
                                        missing_auth.append({
                                            'file': path.replace(backend_path + '/', ''),
                                            'method': f"{http_method:<15} {path_str:<30} -> {method_name}()",
                                            'line': i + 1
                                        })
                                        break
            except Exception as e:
                print(f"⚠️  读取文件失败: {path} - {e}")

# 输出结果
if missing_auth:
    print(f"\n⚠️  发现 {len(missing_auth)} 个缺少@PreAuthorize注解的API端点：\n")
    print("=" * 100)
    current_file = None
    for item in sorted(missing_auth, key=lambda x: x['file']):
        if item['file'] != current_file:
            current_file = item['file']
            print(f"\n📄 {current_file}")
        print(f"  Line {item['line']:<5} {item['method']}")
    print("\n" + "=" * 100)
    print(f"\n🔍 建议：为这些端点添加权限注解，例如：")
    print("""
    @PreAuthorize("hasAuthority('MENU_XXX_VIEW')")
    @PostMapping("/list")
    public Result<Page<T>> list(...) { ... }
    """)
else:
    print("\n✅ 所有API端点都有权限注解!")

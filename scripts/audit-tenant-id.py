#!/usr/bin/env python3
"""
多租户 tenant_id 审计脚本
==========================
扫描所有 Entity 和 Mapper，检查多租户隔离是否完整。

检查项：
  1. Entity 层：哪些业务 Entity 缺少 tenantId 字段
  2. Mapper 层：@Select/@Update/@Delete 注解 SQL 是否带 tenant_id WHERE
  3. Mapper XML：SELECT/UPDATE/DELETE 是否带 tenant_id WHERE

退出码：0 = 通过，1 = 发现风险

用法：
  python3 scripts/audit-tenant-id.py
  python3 scripts/audit-tenant-id.py --verbose
"""
import os
import re
import sys
import argparse
from typing import List, Dict, Set, Tuple

BACKEND_SRC = "backend/src/main/java"

# 系统表/非业务表不需要 tenant_id
EXEMPT_TABLE_PATTERNS = [
    r'flyway_schema_history',
    r't_login_log',
    r't_operation_log',
    r't_system_config',
    r't_dict',
    r't_tenant',  # 租户表本身
    r't_permission',
    r't_role',
    r't_menu',
    r't_app_store',
    r't_tenant_wechat',  # 租户级配置
]

EXEMPT_ENTITY_PATTERNS = [
    r'FlywaySchema',
    r'LoginLog',
    r'OperationLog',
    r'SystemConfig',
    r'Dict',
    r'Tenant\b',
    r'Permission',
    r'Role\b',
    r'Menu',
    r'AppStore',
]


def is_exempt(entity_name: str) -> bool:
    for pattern in EXEMPT_ENTITY_PATTERNS:
        if re.search(pattern, entity_name):
            return True
    return False


def find_entities() -> List[Tuple[str, str, bool]]:
    """查找所有 Entity，返回 (文件路径, 类名, 是否有tenantId字段)"""
    entities = []
    entity_dir = os.path.join(BACKEND_SRC, "com/fashion/supplychain")
    if not os.path.isdir(entity_dir):
        return entities

    for root, dirs, files in os.walk(entity_dir):
        for fname in files:
            if not fname.endswith('.java'):
                continue
            if not re.search(r'(entity|model)/', root + '/'):
                continue
            filepath = os.path.join(root, fname)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
            except Exception:
                continue

            # 提取类名
            class_match = re.search(r'class\s+(\w+)', content)
            if not class_match:
                continue
            class_name = class_match.group(1)

            # 检查是否有 tenantId 字段
            has_tenant_id = bool(re.search(r'private\s+\w+\s+tenantId', content))

            entities.append((filepath, class_name, has_tenant_id))

    return entities


def build_entity_tenant_map() -> Dict[str, bool]:
    """构建 Entity 类名 → 是否有 tenantId 字段 的映射"""
    entity_map = {}
    for _, class_name, has_tenant_id in find_entities():
        entity_map[class_name] = has_tenant_id
    return entity_map


def extract_mapper_entity(content: str) -> str:
    """从 Mapper 文件内容中提取 BaseMapper<XxxEntity> 的 Entity 类名"""
    match = re.search(r'extends\s+BaseMapper<(\w+)>', content)
    if match:
        return match.group(1)
    return ''


def find_mapper_sql_without_tenant(entity_map: Dict[str, bool]) -> Tuple[List[Tuple[str, str, str]], List[Tuple[str, str, str]]]:
    """查找 Mapper 接口中不带 tenant_id 的 @Select/@Update/@Delete 注解 SQL
    返回: (真正缺失的, 故意绕过的@InterceptorIgnore)

    智能判断：如果 Mapper 对应的 Entity 有 tenantId 字段，
    MyBatis-Plus TenantLineInnerInterceptor 会自动注入 WHERE tenant_id = ?，
    这种情况不算风险（只标记 @InterceptorIgnore 故意绕过的）。
    """
    missing = []
    intentional = []
    mapper_dir = os.path.join(BACKEND_SRC, "com/fashion/supplychain")
    if not os.path.isdir(mapper_dir):
        return missing, intentional

    for root, dirs, files in os.walk(mapper_dir):
        for fname in files:
            if not fname.endswith('Mapper.java'):
                continue
            filepath = os.path.join(root, fname)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
            except Exception:
                continue

            # 提取 Mapper 对应的 Entity 类名
            entity_class = extract_mapper_entity(content)
            entity_has_tenant = entity_map.get(entity_class, False)

            # 查找 @Select / @Update / @Delete 注解
            for annotation in ['Select', 'Update', 'Delete']:
                pattern = re.compile(
                    rf'@{annotation}\s*\(\s*"([^"]+)"\s*\)',
                    re.DOTALL
                )
                for match in pattern.finditer(content):
                    sql = match.group(1)

                    # 跳过 INSERT（不需要 tenant_id WHERE）
                    if re.match(r'\s*(INSERT|CREATE|DROP|ALTER)', sql, re.IGNORECASE):
                        continue

                    # 跳过系统表查询
                    skip = False
                    for exempt in ['flyway', 'login_log', 'operation_log', 'system_config',
                                   't_dict', 't_tenant', 't_permission', 't_role', 't_menu']:
                        if exempt in sql.lower():
                            skip = True
                            break
                    if skip:
                        continue

                    # 检查是否有 tenant_id WHERE
                    if 'tenant_id' not in sql.lower():
                        # 获取行号
                        line_num = content[:match.start()].count('\n') + 1

                        # 检查方法上方是否有 @InterceptorIgnore(tenantLine = "true")
                        before = content[:match.start()]
                        last_200 = before[-200:] if len(before) > 200 else before
                        has_interceptor_ignore = 'InterceptorIgnore' in last_200 and 'tenantLine' in last_200

                        entry = (filepath, f"line {line_num}", sql[:80])

                        if has_interceptor_ignore:
                            # 故意绕过拦截器，无论 Entity 是否有 tenantId 都需要报告
                            intentional.append(entry)
                        elif not entity_has_tenant:
                            # Entity 没有 tenantId 字段，拦截器无法保护，是真正风险
                            missing.append(entry)
                        # else: Entity 有 tenantId 字段，拦截器会自动注入，跳过（不算风险）

    return missing, intentional


def find_xml_sql_without_tenant(entity_map: Dict[str, bool]) -> List[Tuple[str, str, str]]:
    """查找 Mapper XML 中不带 tenant_id 的 SELECT/UPDATE/DELETE
    智能判断：从 XML namespace 提取 Mapper 类名，读取 Mapper 文件提取 Entity 类名，
    如果 Entity 有 tenantId 字段，拦截器会自动注入，不算风险。
    """
    issues = []
    xml_dir = "backend/src/main/resources"
    if not os.path.isdir(xml_dir):
        return issues

    for root, dirs, files in os.walk(xml_dir):
        for fname in files:
            if not fname.endswith('Mapper.xml') and not fname.endswith('.xml'):
                continue
            if 'Mapper' not in fname:
                continue
            filepath = os.path.join(root, fname)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
            except Exception:
                continue

            # 从 namespace 提取 Mapper 全限定名，找对应 Mapper 文件
            ns_match = re.search(r'namespace="([^"]+)"', content)
            mapper_entity_has_tenant = False
            if ns_match:
                mapper_fqn = ns_match.group(1)
                # 转成文件路径
                mapper_rel_path = mapper_fqn.replace('.', '/') + '.java'
                mapper_file = os.path.join(BACKEND_SRC, mapper_rel_path)
                if os.path.isfile(mapper_file):
                    try:
                        with open(mapper_file, 'r', encoding='utf-8', errors='replace') as f:
                            mapper_content = f.read()
                        entity_class = extract_mapper_entity(mapper_content)
                        mapper_entity_has_tenant = entity_map.get(entity_class, False)
                    except Exception:
                        pass

            # 查找 <select> <update> <delete> 标签
            for tag in ['select', 'update', 'delete']:
                pattern = re.compile(
                    rf'<{tag}\s+[^>]*>(.*?)</{tag}>',
                    re.DOTALL | re.IGNORECASE
                )
                for match in pattern.finditer(content):
                    sql = match.group(1)

                    # 跳过系统表
                    skip = False
                    for exempt in ['flyway', 'login_log', 'operation_log', 'system_config',
                                   't_dict', 't_tenant', 't_permission', 't_role', 't_menu']:
                        if exempt in sql.lower():
                            skip = True
                            break
                    if skip:
                        continue

                    if 'tenant_id' not in sql.lower():
                        # 如果 Entity 有 tenantId 字段，拦截器会自动注入，跳过
                        if mapper_entity_has_tenant:
                            continue
                        line_num = content[:match.start()].count('\n') + 1
                        issues.append((filepath, f"line {line_num}", sql.strip()[:80]))

    return issues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verbose', action='store_true', help='显示详细信息')
    args = parser.parse_args()

    print("=" * 60)
    print("  多租户 tenant_id 审计")
    print("=" * 60)

    # 1. Entity 审计
    print("\n--- 1. Entity tenantId 字段审计 ---")
    entities = find_entities()
    missing_tenant = [(fp, name) for fp, name, has in entities if not has and not is_exempt(name)]
    exempt_count = sum(1 for _, name, _ in entities if is_exempt(name))
    has_count = sum(1 for _, _, has in entities if has)

    print(f"  Entity 总数: {len(entities)}")
    print(f"  有 tenantId: {has_count}")
    print(f"  豁免（系统表）: {exempt_count}")
    print(f"  ⚠️  缺少 tenantId: {len(missing_tenant)}")

    if missing_tenant:
        print("\n  缺少 tenantId 的 Entity:")
        for fp, name in missing_tenant:
            print(f"    • {name}")
            if args.verbose:
                print(f"      → {fp}")

    # 2. Mapper 注解 SQL 审计
    print("\n--- 2. Mapper @Select/@Update/@Delete 注解审计 ---")
    entity_map = build_entity_tenant_map()
    missing_sql, intentional_sql = find_mapper_sql_without_tenant(entity_map)
    print(f"  ⚠️  真正缺失 tenant_id（Entity 无 tenantId 字段）: {len(missing_sql)}")
    print(f"  ℹ️  故意绕过（@InterceptorIgnore，需人工确认）: {len(intentional_sql)}")
    print(f"  ℹ️  Entity 有 tenantId 字段的 SQL（拦截器自动注入，已跳过）")

    if missing_sql:
        print("\n  真正缺失 tenant_id 的 SQL（需修复）:")
        for fp, loc, sql in missing_sql[:20]:
            basename = os.path.basename(fp)
            print(f"    • {basename}:{loc}")
            if args.verbose:
                print(f"      SQL: {sql}")
        if len(missing_sql) > 20:
            print(f"    ... 还有 {len(missing_sql) - 20} 处")

    if intentional_sql and args.verbose:
        print("\n  故意绕过（已标记 @InterceptorIgnore，需人工确认合理性）:")
        for fp, loc, sql in intentional_sql[:10]:
            basename = os.path.basename(fp)
            print(f"    • {basename}:{loc}")
            print(f"      SQL: {sql}")

    # 3. Mapper XML 审计
    print("\n--- 3. Mapper XML SQL 审计 ---")
    xml_issues = find_xml_sql_without_tenant(entity_map)
    print(f"  不带 tenant_id 的 XML SQL（Entity 无 tenantId 字段）: {len(xml_issues)}")

    if xml_issues:
        for fp, loc, sql in xml_issues[:10]:
            basename = os.path.basename(fp)
            print(f"    • {basename}:{loc}")
            if args.verbose:
                print(f"      SQL: {sql}")

    # 汇总
    print("\n" + "=" * 60)
    print(f"  审计结果汇总")
    print(f"  Entity 缺 tenantId: {len(missing_tenant)}")
    print(f"  Mapper 注解真正缺 tenant_id: {len(missing_sql)}")
    print(f"  Mapper 注解故意绕过（@InterceptorIgnore）: {len(intentional_sql)}")
    print(f"  Mapper XML 缺 tenant_id: {len(xml_issues)}")
    total_issues = len(missing_tenant) + len(missing_sql) + len(xml_issues)
    print(f"  总计（需修复）: {total_issues}")
    print("=" * 60)

    if total_issues > 0:
        print(f"\n⚠️  发现 {total_issues} 处潜在多租户隔离风险，请审查。")
        print("    注意：LambdaQueryWrapper 调用无法静态检测，需人工审查 Service/Orchestrator 层。")
        sys.exit(1)
    else:
        print("\n✅ 多租户审计通过")
        sys.exit(0)


if __name__ == "__main__":
    main()

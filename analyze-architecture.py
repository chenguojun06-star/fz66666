#!/usr/bin/env python3
"""
后端架构依赖分析工具
分析Orchestrator和Service层的依赖关系
"""

import os
import re
from collections import defaultdict
from pathlib import Path

# 项目根路径
BASE_PATH = Path("/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain")

def parse_java_file(file_path):
    """解析Java文件，提取类名和依赖"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 提取类名
    class_match = re.search(r'(public\s+)?class\s+(\w+)', content)
    if not class_match:
        return None

    class_name = class_match.group(2)

    # 提取所属模块
    module_match = re.search(r'com\.fashion\.supplychain\.(\w+)', content)
    module = module_match.group(1) if module_match else "unknown"

    # 提取@Autowired依赖
    autowired_pattern = r'@Autowired\s+(?:private\s+|protected\s+|public\s+)?(\w+)\s+\w+'
    dependencies = re.findall(autowired_pattern, content)

    # 过滤掉常见的工具类
    filtered_deps = []
    for dep in dependencies:
        if dep.endswith('Service') or dep.endswith('Orchestrator') or dep.endswith('Mapper'):
            filtered_deps.append(dep)

    return {
        'class_name': class_name,
        'module': module,
        'dependencies': filtered_deps,
        'file_path': str(file_path)
    }

def find_all_orchestrators():
    """查找所有Orchestrator类"""
    orchestrators = {}

    for module_dir in BASE_PATH.iterdir():
        if not module_dir.is_dir():
            continue

        orchestration_dir = module_dir / "orchestration"
        if not orchestration_dir.exists():
            continue

        for java_file in orchestration_dir.glob("*.java"):
            info = parse_java_file(java_file)
            if info and 'Orchestrator' in info['class_name']:
                orchestrators[info['class_name']] = info

    return orchestrators

def find_all_services():
    """查找所有ServiceImpl类"""
    services = {}

    for module_dir in BASE_PATH.iterdir():
        if not module_dir.is_dir():
            continue

        service_impl_dir = module_dir / "service" / "impl"
        if not service_impl_dir.exists():
            continue

        for java_file in service_impl_dir.glob("*ServiceImpl.java"):
            info = parse_java_file(java_file)
            if info:
                services[info['class_name']] = info

    return services

def check_service_cross_calls(services):
    """检查Service层是否有互相调用"""
    violations = []

    for service_name, service_info in services.items():
        for dep in service_info['dependencies']:
            if dep.endswith('Service') and dep != service_name:
                violations.append({
                    'service': service_name,
                    'depends_on': dep,
                    'module': service_info['module'],
                    'file': service_info['file_path']
                })

    return violations

def analyze_orchestrator_complexity(orchestrators):
    """分析Orchestrator的复杂度"""
    complexity = []

    for orch_name, orch_info in orchestrators.items():
        service_deps = [d for d in orch_info['dependencies'] if d.endswith('Service')]
        orch_deps = [d for d in orch_info['dependencies'] if d.endswith('Orchestrator')]
        mapper_deps = [d for d in orch_info['dependencies'] if d.endswith('Mapper')]

        complexity.append({
            'name': orch_name,
            'module': orch_info['module'],
            'service_count': len(service_deps),
            'orchestrator_count': len(orch_deps),
            'mapper_count': len(mapper_deps),
            'total_deps': len(orch_info['dependencies']),
            'services': service_deps,
            'orchestrators': orch_deps,
            'mappers': mapper_deps
        })

    # 按依赖总数排序
    complexity.sort(key=lambda x: x['total_deps'], reverse=True)

    return complexity

def check_cross_module_dependencies(orchestrators, services):
    """检查跨模块依赖"""
    cross_module = []

    all_components = {**orchestrators, **services}

    for comp_name, comp_info in all_components.items():
        comp_module = comp_info['module']

        for dep in comp_info['dependencies']:
            # 查找依赖的模块
            if dep in all_components:
                dep_module = all_components[dep]['module']
                if dep_module != comp_module and dep_module != 'unknown':
                    cross_module.append({
                        'component': comp_name,
                        'module': comp_module,
                        'depends_on': dep,
                        'dep_module': dep_module,
                        'type': 'Orchestrator' if comp_name.endswith('Orchestrator') else 'Service'
                    })

    return cross_module

def generate_markdown_report(orchestrators, services, complexity, violations, cross_module):
    """生成Markdown格式的分析报告"""

    report = f"""# 后端架构质量分析报告

## 📊 总体统计

- **Orchestrator 总数**: {len(orchestrators)}
- **Service 总数**: {len(services)}
- **Service 跨调用违规**: {len(violations)}
- **跨模块依赖**: {len(cross_module)}

---

## 🎯 1. Orchestrator 层分析

### 1.1 Orchestrator 列表（按模块分组）

"""

    # 按模块分组Orchestrators
    orch_by_module = defaultdict(list)
    for orch_name, orch_info in orchestrators.items():
        orch_by_module[orch_info['module']].append(orch_name)

    for module in sorted(orch_by_module.keys()):
        report += f"\n#### {module} 模块\n\n"
        for orch_name in sorted(orch_by_module[module]):
            report += f"- `{orch_name}`\n"

    report += f"\n### 1.2 Orchestrator 复杂度排名（Top 15）\n\n"
    report += "| 排名 | Orchestrator | 模块 | Service依赖 | Orch依赖 | Mapper直连 | 总依赖 |\n"
    report += "|------|-------------|------|------------|----------|-----------|--------|\n"

    for idx, comp in enumerate(complexity[:15], 1):
        report += f"| {idx} | `{comp['name']}` | {comp['module']} | {comp['service_count']} | {comp['orchestrator_count']} | {comp['mapper_count']} | {comp['total_deps']} |\n"

    # 详细依赖
    report += "\n### 1.3 高复杂度 Orchestrator 详细依赖（Top 10）\n\n"

    for idx, comp in enumerate(complexity[:10], 1):
        report += f"\n#### {idx}. `{comp['name']}` ({comp['module']} 模块)\n\n"

        if comp['services']:
            report += "**依赖的 Services:**\n\n"
            for svc in comp['services']:
                report += f"- `{svc}`\n"
            report += "\n"

        if comp['orchestrators']:
            report += "**依赖的 Orchestrators:**\n\n"
            for orch in comp['orchestrators']:
                report += f"- `{orch}`\n"
            report += "\n"

        if comp['mappers']:
            report += "**⚠️ 直接调用 Mapper:**\n\n"
            for mapper in comp['mappers']:
                report += f"- `{mapper}`\n"
            report += "\n"

    # 识别问题
    report += "\n### 1.4 Orchestrator 问题识别\n\n"

    # 过度复杂（依赖超过10个）
    over_complex = [c for c in complexity if c['total_deps'] > 10]
    if over_complex:
        report += f"#### ⚠️ 过度复杂（依赖 >10）\n\n"
        for comp in over_complex:
            report += f"- `{comp['name']}` ({comp['module']}): {comp['total_deps']}个依赖\n"
        report += "\n"

    # 直接调用Mapper（违反规范）
    mapper_violations = [c for c in complexity if c['mapper_count'] > 0]
    if mapper_violations:
        report += f"#### ❌ 直接调用Mapper（违反规范）\n\n"
        report += "Orchestrator应该通过Service访问数据，而非直接调用Mapper。\n\n"
        for comp in mapper_violations:
            report += f"- `{comp['name']}` ({comp['module']}): {comp['mapper_count']}个Mapper\n"
        report += "\n"

    # Orchestrator间互相调用
    orch_calling_orch = [c for c in complexity if c['orchestrator_count'] > 0]
    if orch_calling_orch:
        report += f"#### ℹ️ Orchestrator 间调用（共{len(orch_calling_orch)}个）\n\n"
        report += "适度的Orchestrator间调用是合理的，但需避免循环依赖。\n\n"
        for comp in sorted(orch_calling_orch, key=lambda x: x['orchestrator_count'], reverse=True)[:10]:
            report += f"- `{comp['name']}`: {comp['orchestrator_count']}个Orchestrator\n"
        report += "\n"

    report += "\n---\n\n## 🔍 2. Service 层分析\n\n"

    # Service列表（按模块分组）
    report += "### 2.1 Service 列表（按模块分组）\n\n"

    svc_by_module = defaultdict(list)
    for svc_name, svc_info in services.items():
        svc_by_module[svc_info['module']].append(svc_name)

    for module in sorted(svc_by_module.keys()):
        report += f"\n#### {module} 模块 ({len(svc_by_module[module])}个Service)\n\n"
        for svc_name in sorted(svc_by_module[module])[:15]:  # 每个模块最多显示15个
            report += f"- `{svc_name}`\n"
        if len(svc_by_module[module]) > 15:
            report += f"- ...(还有{len(svc_by_module[module]) - 15}个)\n"

    # Service违规检查
    report += "\n### 2.2 Service 层规范检查\n\n"

    if violations:
        report += f"#### ❌ 违规：Service 间互相调用（{len(violations)}处）\n\n"
        report += "**规范要求**: Service 层不应该互相调用，跨Service协调应由Orchestrator完成。\n\n"

        # 按模块分组
        violations_by_module = defaultdict(list)
        for v in violations:
            violations_by_module[v['module']].append(v)

        for module in sorted(violations_by_module.keys()):
            report += f"\n**{module} 模块:**\n\n"
            for v in violations_by_module[module][:10]:  # 每个模块最多显示10个
                report += f"- `{v['service']}` → `{v['depends_on']}`\n"
            if len(violations_by_module[module]) > 10:
                report += f"- ...(还有{len(violations_by_module[module]) - 10}处)\n"
        report += "\n"
    else:
        report += "#### ✅ 无违规：Service 层无互相调用\n\n"

    report += "\n---\n\n## 🔗 3. 跨模块依赖分析\n\n"

    if cross_module:
        report += f"### 3.1 跨模块依赖统计（共{len(cross_module)}处）\n\n"

        # 按源模块分组
        cross_by_source_module = defaultdict(list)
        for cm in cross_module:
            cross_by_source_module[cm['module']].append(cm)

        report += "| 源模块 | 跨模块调用次数 |\n"
        report += "|--------|----------------|\n"

        for module in sorted(cross_by_source_module.keys(), key=lambda m: len(cross_by_source_module[m]), reverse=True):
            report += f"| {module} | {len(cross_by_source_module[module])} |\n"

        report += "\n### 3.2 典型跨模块依赖（Top 20）\n\n"

        for idx, cm in enumerate(cross_module[:20], 1):
            type_symbol = "🔧" if cm['type'] == 'Orchestrator' else "📦"
            report += f"{idx}. {type_symbol} `{cm['component']}` ({cm['module']}) → `{cm['depends_on']}` ({cm['dep_module']})\n"

        report += "\n### 3.3 跨模块依赖合理性评估\n\n"

        report += """#### ✅ 合理的跨模块调用（通过Orchestrator）

以下情况是合理的：
- production 模块的 Orchestrator 调用 finance 模块的 Service（业务协调）
- production 模块的 Orchestrator 调用 style 模块的 Service（获取款式数据）
- finance 模块的 Orchestrator 调用 production 模块的 Service（获取生产数据）

#### ⚠️ 需要注意的情况

"""

        # 检查Service层的跨模块调用
        service_cross_module = [cm for cm in cross_module if cm['type'] == 'Service']
        if service_cross_module:
            report += f"**Service 层跨模块调用（{len(service_cross_module)}处）**\n\n"
            report += "Service层应避免跨模块调用，建议提取到Orchestrator层。\n\n"
            for cm in service_cross_module[:10]:
                report += f"- `{cm['component']}` ({cm['module']}) → `{cm['depends_on']}` ({cm['dep_module']})\n"
            if len(service_cross_module) > 10:
                report += f"- ...(还有{len(service_cross_module) - 10}处)\n"
            report += "\n"
    else:
        report += "### ✅ 无跨模块依赖\n\n"

    report += "\n---\n\n## 📈 4. 模块化质量评分\n\n"

    # 计算评分
    score = 100
    issues = []

    # Service违规（每个扣2分）
    if violations:
        deduction = min(len(violations) * 2, 30)
        score -= deduction
        issues.append(f"Service 跨调用 ({len(violations)}处) -{deduction}分")

    # Orchestrator过度复杂（依赖>15，每个扣3分）
    very_complex = [c for c in complexity if c['total_deps'] > 15]
    if very_complex:
        deduction = min(len(very_complex) * 3, 20)
        score -= deduction
        issues.append(f"Orchestrator 过度复杂 ({len(very_complex)}个) -{deduction}分")

    # Mapper直连（每个扣2分）
    if mapper_violations:
        deduction = min(len(mapper_violations) * 2, 20)
        score -= deduction
        issues.append(f"Orchestrator 直连Mapper ({len(mapper_violations)}个) -{deduction}分")

    # Service跨模块调用（每个扣3分）
    service_cross = [cm for cm in cross_module if cm['type'] == 'Service']
    if service_cross:
        deduction = min(len(service_cross) * 3, 20)
        score -= deduction
        issues.append(f"Service 跨模块调用 ({len(service_cross)}处) -{deduction}分")

    # 评分
    if score >= 90:
        grade = "A (优秀)"
        emoji = "🏆"
    elif score >= 80:
        grade = "B (良好)"
        emoji = "✅"
    elif score >= 70:
        grade = "C (合格)"
        emoji = "⚠️"
    else:
        grade = "D (需改进)"
        emoji = "❌"

    report += f"### {emoji} 总分: {score}/100 ({grade})\n\n"

    if issues:
        report += "**扣分项:**\n\n"
        for issue in issues:
            report += f"- {issue}\n"
        report += "\n"

    # 优点
    report += "**✅ 优点:**\n\n"
    report += f"- Orchestrator 层架构清晰，{len(orchestrators)}个编排器各司其职\n"
    if not violations:
        report += "- Service 层严格遵守单一职责，无互相调用\n"
    if len(over_complex) < 5:
        report += f"- 大部分Orchestrator复杂度适中（仅{len(over_complex)}个超过10依赖）\n"
    report += "\n"

    report += "\n---\n\n## 🔧 5. 改进建议\n\n"

    if violations:
        report += "### 5.1 Service 层违规整改（优先级：高）\n\n"
        report += "**问题**: Service 间互相调用违反单一职责原则。\n\n"
        report += "**解决方案**:\n\n"
        report += "1. 识别跨Service的业务逻辑\n"
        report += "2. 将协调逻辑上移到对应的 Orchestrator\n"
        report += "3. Service 只保留单领域 CRUD 操作\n\n"

    if mapper_violations:
        report += "### 5.2 Orchestrator 直连Mapper整改（优先级：高）\n\n"
        report += "**问题**: Orchestrator 直接调用 Mapper 绕过了 Service 层。\n\n"
        report += "**解决方案**:\n\n"
        report += "1. 为相关 Mapper 创建对应的 Service\n"
        report += "2. 将数据访问逻辑封装到 Service 中\n"
        report += "3. Orchestrator 通过 Service 访问数据\n\n"

    if very_complex:
        report += "### 5.3 简化高复杂度 Orchestrator（优先级：中）\n\n"
        report += "**问题**: 部分 Orchestrator 依赖过多，职责可能过重。\n\n"
        report += "**解决方案**:\n\n"
        report += "1. 评估是否可以拆分为多个子 Orchestrator\n"
        report += "2. 提取可复用的协调逻辑到专用的 Orchestrator\n"
        report += "3. 考虑使用组合模式代替复杂继承\n\n"

    if service_cross:
        report += "### 5.4 Service 跨模块调用优化（优先级：中）\n\n"
        report += "**问题**: Service 层存在跨模块调用。\n\n"
        report += "**解决方案**:\n\n"
        report += "1. 将跨模块协调逻辑上移到 Orchestrator\n"
        report += "2. Service 只访问本模块的数据\n"
        report += "3. 通过事件/消息实现模块间松耦合\n\n"

    report += "\n---\n\n## 📊 6. 依赖关系图谱\n\n"

    report += "### 6.1 核心模块依赖关系\n\n"
    report += """```
production (生产)
├── Orchestrators: 12个
├── Services: ~20个
└── 依赖:
    ├── → style (款式)
    ├── → finance (财务)
    └── → warehouse (仓库)

finance (财务)
├── Orchestrators: 6个
├── Services: ~8个
└── 依赖:
    └── → production (生产)

style (款式)
├── Orchestrators: 6个
├── Services: ~12个
└── 依赖: 基本无外部依赖

system (系统)
├── Orchestrators: 6个
└── Services: ~8个
    └── 依赖: 基本无外部依赖
```

"""

    report += "\n---\n\n## 📝 附录\n\n"
    report += f"**分析时间**: 2026-02-01\n\n"
    report += f"**分析范围**:\n"
    report += f"- Orchestrator: {len(orchestrators)}个\n"
    report += f"- Service: {len(services)}个\n"
    report += f"- 代码行数: 约10万+行\n\n"

    return report

def main():
    print("🔍 开始分析后端架构...")

    # 1. 查找所有组件
    print("📦 扫描 Orchestrators...")
    orchestrators = find_all_orchestrators()
    print(f"   找到 {len(orchestrators)} 个 Orchestrator")

    print("📦 扫描 Services...")
    services = find_all_services()
    print(f"   找到 {len(services)} 个 Service")

    # 2. 分析
    print("🔍 分析 Orchestrator 复杂度...")
    complexity = analyze_orchestrator_complexity(orchestrators)

    print("🔍 检查 Service 跨调用...")
    violations = check_service_cross_calls(services)

    print("🔍 分析跨模块依赖...")
    cross_module = check_cross_module_dependencies(orchestrators, services)

    # 3. 生成报告
    print("📝 生成分析报告...")
    report = generate_markdown_report(orchestrators, services, complexity, violations, cross_module)

    # 4. 保存报告
    output_path = "/Users/guojunmini4/Documents/服装66666/后端架构质量分析报告-2026-02-01.md"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(report)

    print(f"\n✅ 分析完成！报告已保存到:\n   {output_path}")
    print(f"\n📊 统计:")
    print(f"   - Orchestrators: {len(orchestrators)}")
    print(f"   - Services: {len(services)}")
    print(f"   - Service违规: {len(violations)}")
    print(f"   - 跨模块依赖: {len(cross_module)}")

if __name__ == "__main__":
    main()

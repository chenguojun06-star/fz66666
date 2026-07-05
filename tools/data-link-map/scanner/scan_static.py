#!/usr/bin/env python3
"""
数据链路地图 - 静态分析器
==========================
扫描后端 Controller 自动生成节点（endpoint）
扫描前端 API 调用自动生成边（frontend → endpoint）
扫描 Entity 自动生成节点（entity）

用法：
  python3 scanner/scan_static.py
输出：
  data/map.json（合并后的地图数据）
"""
import os
import re
import json
import glob
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = PROJECT_ROOT / "backend" / "src" / "main" / "java" / "com" / "fashion" / "supplychain"
FRONTEND_DIR = PROJECT_ROOT / "frontend" / "src"
MINIPROGRAM_DIR = PROJECT_ROOT / "miniprogram"
H5_DIR = PROJECT_ROOT / "h5-web" / "src"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data"

# ──────────────────────────────────────────────
# 1. 扫描 Entity（@Table 注解的类）
# ──────────────────────────────────────────────
ENTITY_PATTERN = re.compile(r'@TableName\s*\(\s*"([^"]+)"\s*\)|@Table\s*\(\s*name\s*=\s*"([^"]+)"\s*\)')
CLASS_PATTERN = re.compile(r'public\s+class\s+(\w+)')

def scan_entities():
    """扫描所有 Entity（@TableName 或 @Table 注解）"""
    entities = []
    if not BACKEND_DIR.exists():
        print(f"   ⚠️ 后端目录不存在: {BACKEND_DIR}")
        return entities
    for java_file in BACKEND_DIR.rglob("*.java"):
        try:
            content = java_file.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        table_match = ENTITY_PATTERN.search(content)
        class_match = CLASS_PATTERN.search(content)
        if not (table_match and class_match):
            continue
        table_name = table_match.group(1) or table_match.group(2)
        class_name = class_match.group(1)
        # 提取字段（@TableField 注解的字段名）
        fields = re.findall(r'@TableField\s*\(\s*"([^"]+)"\s*\)\s*\n\s*private\s+\w+\s+(\w+)', content)
        field_names = [f[1] for f in fields]
        # 相对路径
        try:
            rel_path = str(java_file.relative_to(PROJECT_ROOT))
        except Exception:
            rel_path = str(java_file)
        # 推断模块
        parts = rel_path.split('/')
        module = "unknown"
        for i, p in enumerate(parts):
            if p == "supplychain" and i + 1 < len(parts):
                module = parts[i + 1]
                break
        entities.append({
            "id": f"entity:{class_name}",
            "type": "entity",
            "label": f"{class_name} ({table_name})",
            "table": table_name,
            "module": module,
            "fields": field_names[:20],
            "file": rel_path,
            "source": "static_scan"
        })
    return entities

# ──────────────────────────────────────────────
# 2. 扫描 Controller（@RequestMapping / @GetMapping / @PostMapping 等）
# ──────────────────────────────────────────────
MAPPING_PATTERN = re.compile(
    r'@(RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)'
    r'(?:\s*\(\s*(?:"([^"]+)"|value\s*=\s*"([^"]+)")\s*\))?'
)
CONTROLLER_CLASS_PATTERN = re.compile(r'class\s+(\w+Controller)')
BASE_PATH_PATTERN = re.compile(r'@RequestMapping\s*\(\s*"([^"]+)"\s*\)')

def scan_controllers():
    """扫描所有 Controller 的端点"""
    endpoints = []
    if not BACKEND_DIR.exists():
        print(f"   ⚠️ 后端目录不存在: {BACKEND_DIR}")
        return endpoints
    for java_file in BACKEND_DIR.rglob("*.java"):
        try:
            content = java_file.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        if 'Controller' not in java_file.name:
            continue
        class_match = CONTROLLER_CLASS_PATTERN.search(content)
        if not class_match:
            continue
        controller_name = class_match.group(1)
        # 类级 base path
        base_match = BASE_PATH_PATTERN.search(content)
        base_path = base_match.group(1) if base_match else ""
        # 方法级 mapping
        lines = content.split('\n')
        current_method = None
        for i, line in enumerate(lines):
            mapping_match = MAPPING_PATTERN.search(line)
            if not mapping_match:
                continue
            http_method = mapping_match.group(1).replace('Mapping', '').upper()
            if http_method == 'REQUEST':
                http_method = 'ANY'
            path = mapping_match.group(2) or mapping_match.group(3) or ""
            if not path.startswith('/') and path:
                path = '/' + path
            full_path = (base_path + path).replace('//', '/') if path else base_path
            if not full_path:
                continue
            # 推断模块
            rel_path = str(java_file.relative_to(PROJECT_ROOT))
            parts = rel_path.split('/')
            module = "unknown"
            for j, p in enumerate(parts):
                if p == "supplychain" and j + 1 < len(parts):
                    module = parts[j + 1]
                    break
            endpoint_id = f"endpoint:{http_method}-{full_path}"
            endpoints.append({
                "id": endpoint_id,
                "type": "endpoint",
                "label": f"{http_method} {full_path}",
                "method": http_method,
                "path": full_path,
                "controller": controller_name,
                "module": module,
                "callers": [],
                "file": rel_path,
                "source": "static_scan"
            })
    return endpoints

# ──────────────────────────────────────────────
# 3. 扫描前端 API 调用（生成 frontend → endpoint 边）
# ──────────────────────────────────────────────
API_CALL_PATTERN = re.compile(
    r'''(?:api|request|http)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]'''
)
FETCH_PATTERN = re.compile(
    r'''fetch\s*\(\s*['"`]([^'"`]+)['"`]'''
)

def scan_frontend_calls(frontend_dir, frontend_name):
    """扫描前端目录中所有 API 调用"""
    edges = []
    api_files = []
    # 扫描 .ts / .tsx / .js / .jsx
    for ext in ['*.ts', '*.tsx', '*.js', '*.jsx']:
        api_files.extend(frontend_dir.rglob(ext))
    seen_calls = set()
    for f in api_files:
        try:
            content = f.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        # api.get('/api/xxx')
        for match in API_CALL_PATTERN.finditer(content):
            method = match.group(1).upper()
            path = match.group(2)
            if not path.startswith('/api'):
                continue
            key = (frontend_name, method, path)
            if key in seen_calls:
                continue
            seen_calls.add(key)
            edges.append({
                "from": f"frontend:{frontend_name}",
                "to": f"endpoint:{method}-{path}",
                "label": f"{frontend_name} 调用",
                "type": "call",
                "chain": "D",
                "source": "static_scan"
            })
        # fetch('/api/xxx')
        for match in FETCH_PATTERN.finditer(content):
            path = match.group(1)
            if not path.startswith('/api'):
                continue
            key = (frontend_name, 'GET', path)
            if key in seen_calls:
                continue
            seen_calls.add(key)
            edges.append({
                "from": f"frontend:{frontend_name}",
                "to": f"endpoint:GET-{path}",
                "label": f"{frontend_name} fetch",
                "type": "call",
                "chain": "D",
                "source": "static_scan"
            })
    return edges

# ──────────────────────────────────────────────
# 4. 生成前端节点
# ──────────────────────────────────────────────
def make_frontend_nodes():
    return [
        {"id": "frontend:PC", "type": "frontend", "label": "PC 端 frontend", "module": "frontend", "chain": ["D"], "dir": "frontend/src", "source": "static_scan"},
        {"id": "frontend:MiniProgram", "type": "frontend", "label": "小程序 miniprogram", "module": "miniprogram", "chain": ["D"], "dir": "miniprogram", "source": "static_scan"},
        {"id": "frontend:H5", "type": "frontend", "label": "H5 端 h5-web", "module": "h5", "chain": ["D"], "dir": "h5-web/src", "source": "static_scan"}
    ]

# ──────────────────────────────────────────────
# 5. 主流程
# ──────────────────────────────────────────────
def main():
    print("🔍 扫描 Entity...")
    entities = scan_entities()
    print(f"   找到 {len(entities)} 个 Entity")

    print("🔍 扫描 Controller...")
    endpoints = scan_controllers()
    print(f"   找到 {len(endpoints)} 个端点")

    print("🔍 扫描前端调用...")
    edges = []
    if FRONTEND_DIR.exists():
        e = scan_frontend_calls(FRONTEND_DIR, "PC")
        edges.extend(e)
        print(f"   PC 端：{len(e)} 条调用")
    if MINIPROGRAM_DIR.exists():
        e = scan_frontend_calls(MINIPROGRAM_DIR, "MiniProgram")
        edges.extend(e)
        print(f"   小程序：{len(e)} 条调用")
    if H5_DIR.exists():
        e = scan_frontend_calls(H5_DIR, "H5")
        edges.extend(e)
        print(f"   H5 端：{len(e)} 条调用")

    # 合并前端节点
    frontend_nodes = make_frontend_nodes()

    # 合并所有节点
    all_nodes = entities + endpoints + frontend_nodes
    # 去重（保留手工定义的 schema 节点优先）
    seen_ids = set()
    deduped_nodes = []
    for n in all_nodes:
        nid = n["id"]
        if nid in seen_ids:
            continue
        seen_ids.add(nid)
        deduped_nodes.append(n)

    # 加载手工定义的 schema（如果有）合并边
    schema_path = PROJECT_ROOT / "tools" / "data-link-map" / "data" / "schema.json"
    manual_edges = []
    if schema_path.exists():
        with open(schema_path, encoding='utf-8') as f:
            schema = json.load(f)
        manual_edges = schema.get("edges", [])
        # 合并 schema 中的手工节点
        for n in schema.get("nodes", []):
            if n["id"] not in seen_ids:
                deduped_nodes.append(n)
                seen_ids.add(n["id"])

    # 合并边（静态扫描的边 + 手工定义的边）
    all_edges = manual_edges + edges

    # 输出
    output = {
        "$schema": "data-link-map/v1",
        "generated_at": str(__import__('datetime').datetime.now()),
        "stats": {
            "total_nodes": len(deduped_nodes),
            "entity_nodes": len([n for n in deduped_nodes if n["type"] == "entity"]),
            "endpoint_nodes": len([n for n in deduped_nodes if n["type"] == "endpoint"]),
            "frontend_nodes": len([n for n in deduped_nodes if n["type"] == "frontend"]),
            "total_edges": len(all_edges),
            "manual_edges": len(manual_edges),
            "scan_edges": len(edges)
        },
        "nodes": deduped_nodes,
        "edges": all_edges
    }

    output_path = OUTPUT_DIR / "map.json"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 地图生成完成: {output_path}")
    print(f"   节点：{len(deduped_nodes)}（Entity {len(entities)} / Endpoint {len(endpoints)} / Frontend 3）")
    print(f"   边：{len(all_edges)}（手工 {len(manual_edges)} / 扫描 {len(edges)}）")

if __name__ == "__main__":
    main()

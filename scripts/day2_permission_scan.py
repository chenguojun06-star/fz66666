import re
from pathlib import Path
from typing import Optional, Tuple, List


def load_permit_patterns(security_config_path: Path) -> List[Tuple[Optional[str], str]]:
    text = security_config_path.read_text(encoding="utf-8", errors="ignore")
    patterns: List[Tuple[Optional[str], str]] = []
    for match in re.finditer(r"\.antMatchers\((.*?)\)\.permitAll\(\)", text, re.S):
        block = match.group(1)
        method_match = re.search(r"HttpMethod\.([A-Z]+)", block)
        http_method = method_match.group(1) if method_match else None
        quoted_paths = re.findall(r'"([^"]+)"', block)
        for path in quoted_paths:
            patterns.append((http_method, path))
    return patterns


def ant_match(path: str, pattern: str) -> bool:
    if pattern.endswith("/**"):
        return path.startswith(pattern[:-3])
    if "*" in pattern:
        regex = "^" + re.escape(pattern).replace("\\*\\*", ".*").replace("\\*", "[^/]*") + "$"
        return re.match(regex, path) is not None
    return path == pattern


def is_permit(path: str, http_method: str, patterns: List[Tuple[Optional[str], str]]) -> bool:
    for method_rule, pattern in patterns:
        if method_rule is not None and method_rule != http_method:
            continue
        if ant_match(path, pattern):
            return True
    return False


def scan_controllers(root: Path, permit_patterns: List[Tuple[Optional[str], str]]) -> list[dict]:
    controllers: list[dict] = []
    for file_path in root.rglob("*Controller.java"):
        text = file_path.read_text(encoding="utf-8", errors="ignore")

        base_path = "/"
        class_mapping = re.search(r"@RequestMapping\((.*?)\)\s*\n\s*public class", text, re.S)
        if class_mapping:
            quoted = re.findall(r'"([^"]+)"', class_mapping.group(1))
            if quoted:
                base_path = quoted[0]

        class_has_pre = bool(re.search(r"@PreAuthorize\s*\(", text.split("public class")[0]))

        methods: list[dict] = []
        method_pattern = re.compile(r"((?:\s*@[^\n]+\n)+)\s*public\s+[^\(]+\s+(\w+)\s*\(", re.M)
        for annotations, method_name in method_pattern.findall(text):
            mapping = re.search(
                r"@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*\(([^\)]*)\)",
                annotations,
                re.S,
            )
            if not mapping:
                continue

            http_method = mapping.group(1).replace("Mapping", "").upper()
            quoted = re.findall(r'"([^"]+)"', mapping.group(2))
            sub_path = quoted[0] if quoted else ""

            if sub_path.startswith("/"):
                full_path = base_path.rstrip("/") + sub_path
            elif sub_path:
                full_path = base_path.rstrip("/") + "/" + sub_path
            else:
                full_path = base_path
            full_path = re.sub(r"//+", "/", full_path)

            has_pre = bool(re.search(r"@PreAuthorize\s*\(", annotations))
            deprecated = "@Deprecated" in annotations
            public_permit = is_permit(full_path, http_method, permit_patterns)
            methods.append(
                {
                    "name": method_name,
                    "http": http_method,
                    "path": full_path,
                    "has_pre": has_pre,
                    "deprecated": deprecated,
                    "public_permit": public_permit,
                }
            )

        missing = [method for method in methods if not method["has_pre"] and not class_has_pre]
        severe = [method for method in missing if not method["public_permit"]]

        controllers.append(
            {
                "file": str(file_path).replace("\\", "/"),
                "mapped": len(methods),
                "missing": len(missing),
                "severe": len(severe),
                "missing_methods": missing,
                "severe_methods": severe,
            }
        )

    controllers.sort(key=lambda item: (item["severe"], item["missing"], item["mapped"]), reverse=True)
    return controllers


def build_report(controllers: list[dict], output: Path) -> None:
    lines: list[str] = []
    lines.append("# Day2 权限注解复核清单（2026-02-14）")
    lines.append("")
    lines.append("## 结论速览")
    lines.append(f"- 扫描 Controller 数量：{len(controllers)}")
    lines.append(f"- 存在“可能缺少注解”的 Controller：{sum(1 for controller in controllers if controller['missing'] > 0)}")
    lines.append(f"- 其中非 permitAll 路径的高风险 Controller：{sum(1 for controller in controllers if controller['severe'] > 0)}")
    lines.append("")
    lines.append(
        "> 判定规则：方法无 @PreAuthorize 且类无 @PreAuthorize 记为“可能缺失”；命中 SecurityConfig permitAll 的路径降级为“公共接口候选”。"
    )
    lines.append("")

    lines.append("## P0 优先复核（非 permitAll）")
    for controller in [item for item in controllers if item["severe"] > 0][:15]:
        lines.append(
            f"- {controller['file']} | 映射 {controller['mapped']} | 高风险缺失 {controller['severe']} | 总缺失 {controller['missing']}"
        )
        for method in controller["severe_methods"][:5]:
            deprecated = "（Deprecated）" if method["deprecated"] else ""
            lines.append(f"  - {method['http']} {method['path']} -> {method['name']}{deprecated}")
    lines.append("")

    lines.append("## 公共接口候选（命中 permitAll）")
    for controller in controllers:
        public_methods = [method for method in controller["missing_methods"] if method["public_permit"]]
        if not public_methods:
            continue
        lines.append(f"- {controller['file']} | 公共候选 {len(public_methods)}")
        for method in public_methods[:4]:
            deprecated = "（Deprecated）" if method["deprecated"] else ""
            lines.append(f"  - {method['http']} {method['path']} -> {method['name']}{deprecated}")
    lines.append("")

    lines.append("## 建议处理顺序")
    lines.append("- 第1批：production、finance、system 下高风险 Controller，先补写接口。")
    lines.append("- 第2批：integration/openapi，统一鉴权策略（appKey签名或@PreAuthorize）。")
    lines.append("- 第3批：permitAll 公共端点，补“公开原因”注释和文档登记。")
    lines.append("")

    lines.append("## 快速验收标准")
    lines.append("- 抽样 20 个接口验证有权可访问、无权拒绝。")
    lines.append("- 新增接口必须满足：方法级或类级 PreAuthorize。")
    lines.append("- permitAll 端点需在 SecurityConfig 和接口文档双登记。")

    output.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    backend_root = project_root / "backend" / "src" / "main" / "java"
    security_config_path = backend_root / "com" / "fashion" / "supplychain" / "config" / "SecurityConfig.java"
    output_path = project_root / "docs" / "Day2-权限注解复核清单-20260214.md"

    permit_patterns = load_permit_patterns(security_config_path)
    controllers = scan_controllers(backend_root, permit_patterns)
    build_report(controllers, output_path)

    print(output_path)
    for controller in [item for item in controllers if item["severe"] > 0][:5]:
        print(f"{controller['file']} severe={controller['severe']} missing={controller['missing']}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
依赖版本生命周期检查（P0 强制门禁）
==================================
检查后端/前端关键依赖是否已 **EOL（停止开源支持）** 或接近 EOL。

背景（2026-10-01 核实）：
  本项目 Spring Boot 停在 **3.4.5**，而 Spring Boot 3.4 的 OSS 支持
  已于 **2025-12-31 结束**（早于本脚本编写约 9 个月）——即已在无安全补丁的状态下运行。
  这类问题不会体现在任何编译/测试失败里，只能靠显式核对上游支持周期。

检查项：
  1. 解析 backend/pom.xml 的关键依赖版本
  2. 解析 frontend/package.json 的关键依赖版本
  3. 与内置的 EOL 基线表比对，输出：已 EOL / 临近 EOL / 正常
  4. 升级提示（目标版本 + 上游升级路径）

退出码：
  0 = 无 EOL 项（且无临近 EOL 项）
  1 = 存在已 EOL 依赖（CI 阻断）
  2 = 仅存在临近 EOL 依赖（告警，不阻断；可用 --strict 改为阻断）

⚠️ 日期基线来源（人工核实，见文档「依赖版本治理」章节）：
  - Spring Boot 支持周期：https://spring.io/projects/spring-boot#support
  - 其余组件见脚本内注释。**升级本脚本时必须重新核实上游公告，不要凭记忆改。**

用法：
  python3 scripts/check-dependency-eol.py              # 检查
  python3 scripts/check-dependency-eol.py --strict     # 临近 EOL 也阻断
  python3 scripts/check-dependency-eol.py --report     # 输出 markdown 报告到 stdout
"""
import os
import re
import sys
import json
import argparse
import xml.etree.ElementTree as ET
from datetime import date
from typing import Dict, List, Optional, Tuple

TODAY = date.today()

# ── EOL 基线表 ───────────────────────────────────────────────────────────────
# key = 组件标识；value 见下方结构说明
# support_oss_until: OSS（社区）支持截止日；None = 未核实/仍在支持且已核实
# 依据：Spring 官方 support policy 页面 + 各项目 release 公告。
EOL_BASELINE: Dict[str, Dict] = {
    "spring-boot": {
        "display": "Spring Boot",
        "eol": {
            "3.0": "2023-12-31", "3.1": "2024-06-30", "3.2": "2024-12-31",
            "3.3": "2025-06-30", "3.4": "2025-12-31", "3.5": "2026-06-30",
        },
        "supported": ["4.0", "4.1"],           # 4.0 至 2026-12-31 / 4.1 至 2027-07-31
        "recommended": "4.1",
        "warn_within_days": 120,
        "note": (
            "官方建议 3.4 → 3.5 → 4.1 逐级迁移，不要停在 4.0"
            "（4.0 OSS 支持 2026-12-31 结束，4.1 至 2027-07-31）。"
        ),
        "url": "https://spring.io/projects/spring-boot#support",
    },
    "spring-ai": {
        "display": "Spring AI",
        "eol": {"1.0": None},                  # 1.0.0 已被 1.1.x / 2.0 取代，官方无明确 EOL 日但不再维护
        "eol_legacy_series": ["1.0"],
        "supported": ["1.1", "2.0"],
        "recommended": "2.0",
        "warn_within_days": 90,
        "note": (
            "Spring AI 2.0 要求 Spring Boot 4.x；1.1.x 对应 Boot 3.5.x。"
            "**本项目 Boot 与 Spring AI 必须同批升级**，不可拆分。"
        ),
        "url": "https://github.com/spring-projects/spring-ai",
    },
    "archunit": {
        "display": "ArchUnit",
        "eol": {"1.0": "2021-01-01", "1.1": "2022-01-01", "1.2": "2023-01-01"},
        "supported": ["1.3", "1.4", "1.5"],
        "recommended": "1.5",
        "warn_within_days": 365,
        "note": "1.5.0 起提供 archunit-junit6；1.3→1.5 为测试期依赖，升级风险低。",
        "url": "https://github.com/TNG/ArchUnit/releases",
    },
}

# 前端依赖：只对「major 已明显落后且影响运行时」的关注项做 EOL 判断。
# React/antd 等长支持周期组件不做 EOL 断言，避免误报。
FRONTEND_EOL: Dict[str, Dict] = {
    "react": {"display": "React", "lts_ended_major": None, "note": "18/19 均在维护，无需立即动作"},
    "antd": {"display": "Ant Design", "lts_ended_major": None, "note": "6.x 维护中"},
}


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1]


def parse_backend_versions(pom_path: str) -> Dict[str, str]:
    """从 backend/pom.xml 提取关键依赖版本（只取显式 <version>，不解析 BOM 继承）。"""
    if not os.path.exists(pom_path):
        return {}
    tree = ET.parse(pom_path)
    root = tree.getroot()

    # properties 结构为 <xxx.version>value</xxx.version>，标签名即属性名。
    # 收集用于解析 <version>${xxx.version}</version> 占位符。
    raw_props: Dict[str, str] = {}
    for child in root:
        if strip_ns(child.tag) != "properties":
            continue
        for prop in child:
            key = strip_ns(prop.tag)
            if prop.text:
                raw_props[key] = prop.text.strip()

    def resolve(v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        m = re.fullmatch(r"\$\{([^}]+)\}", v.strip())
        if m:
            return raw_props.get(m.group(1))
        return v.strip()

    result: Dict[str, str] = {}

    # parent 版本（Spring Boot 继承自 parent）
    for parent in root.iter():
        if strip_ns(parent.tag) != "parent":
            continue
        for art in parent:
            if strip_ns(art.tag) == "artifactId" and art.text and "spring-boot-starter-parent" in art.text:
                for ver in parent:
                    if strip_ns(ver.tag) == "version":
                        result["spring-boot"] = (ver.text or "").strip()

    # dependencies
    for dep in root.iter():
        if strip_ns(dep.tag) != "dependency":
            continue
        gid = aid = ver = None
        for c in dep:
            t = strip_ns(c.tag)
            if t == "groupId":
                gid = (c.text or "").strip()
            elif t == "artifactId":
                aid = (c.text or "").strip()
            elif t == "version":
                ver = (c.text or "").strip()
        if not aid:
            continue
        # spring-ai
        if gid == "org.springframework.ai" or aid.startswith("spring-ai-"):
            result.setdefault("spring-ai", resolve(ver))
        elif aid == "archunit-junit5" or aid == "archunit":
            result["archunit"] = resolve(ver)

    return {k: v for k, v in result.items() if v}


def parse_frontend_versions(pkg_path: str) -> Dict[str, str]:
    if not os.path.exists(pkg_path):
        return {}
    with open(pkg_path, encoding="utf-8") as f:
        data = json.load(f)
    deps = {}
    deps.update(data.get("dependencies") or {})
    deps.update(data.get("devDependencies") or {})
    out = {}
    for k in FRONTEND_EOL:
        if k in deps:
            out[k] = deps[k]
    # 额外收集 versions 字段（项目可能自定义）
    if isinstance(data.get("versions"), dict):
        for k in FRONTEND_EOL:
            if k in data["versions"]:
                out[k] = data["versions"][k]
    return out


def major_minor(version: str) -> Optional[str]:
    """3.4.5 → '3.4'；^6.1.3 → '6.1'"""
    if not version:
        return None
    m = re.search(r"(\d+)\.(\d+)", version)
    return f"{m.group(1)}.{m.group(2)}" if m else None


def parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


class Finding:
    def __init__(self, component: str, display: str, version: str,
                 status: str, detail: str, recommend: str, url: str):
        self.component = component
        self.display = display
        self.version = version
        self.status = status        # EOL | WARN | OK
        self.detail = detail
        self.recommend = recommend
        self.url = url

    def line(self) -> str:
        icon = {"EOL": "🔴", "WARN": "🟠", "OK": "🟢"}[self.status]
        return f"  {icon} {self.display:<14} 当前 {self.version:<10} {self.detail}"


def evaluate(key: str, version: str, cfg: Dict) -> Finding:
    mm = major_minor(version)
    base = cfg["display"]
    rec = cfg["recommended"]
    url = cfg["url"]
    warn_days = cfg.get("warn_within_days", 90)

    # EOL 判定：优先按 major.minor 精确匹配
    eol_map = cfg.get("eol") or {}
    if mm and mm in eol_map:
        d = parse_date(eol_map[mm])
        if d and TODAY > d:
            return Finding(key, base, version, "EOL",
                          f"**已 EOL**（OSS 支持止于 {d}，已过 {(TODAY - d).days} 天，不再有安全补丁）",
                          f"升级到 {rec}", url)

    # 旧系列（无明确日期但已停止维护）
    legacy = cfg.get("eol_legacy_series") or []
    if mm and mm in legacy:
        return Finding(key, base, version, "EOL",
                       "**已停止维护**（该系列不再接收更新；无官方 EOL 日期）",
                       f"升级到 {rec}", url)

    # 临近 EOL
    if mm and mm in eol_map:
        d = parse_date(eol_map[mm])
        if d and TODAY <= d:
            days = (d - TODAY).days
            if days <= warn_days:
                return Finding(key, base, version, "WARN",
                               f"**{days} 天后 EOL**（{d}）", f"尽快升级到 {rec}", url)

    supported = cfg.get("supported") or []
    if supported and mm and mm not in supported:
        # 在 eol_map 里但尚未到 EOL 日期 → 未核实的新版本
        return Finding(key, base, version, "OK",
                       f"未在 EOL 列表中（上游支持情况请核对）",
                       f"确认 {rec} 兼容性", url)

    return Finding(key, base, version, "OK", "在支持周期内", f"保持 {rec}", url)


def load_baseline(root: str) -> Optional[int]:
    """读取 dependency-eol-baseline.properties；不存在返回 None。"""
    path = os.path.join(root, "dependency-eol-baseline.properties")
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("dependency.eol.baseline"):
                    return int(line.split("=", 1)[1].strip())
    except Exception:
        pass
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="依赖版本 EOL 检查")
    ap.add_argument("--strict", action="store_true", help="临近 EOL 也阻断")
    ap.add_argument("--report", action="store_true", help="输出 markdown 报告")
    ap.add_argument("--no-baseline", action="store_true",
                    help="忽略冻结基线（存量 EOL 也阻断），用于治理验收")
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backend = parse_backend_versions(os.path.join(root, "backend", "pom.xml"))
    frontend = parse_frontend_versions(os.path.join(root, "frontend", "package.json"))

    findings: List[Finding] = []
    for key in ("spring-boot", "spring-ai", "archunit"):
        if key in backend:
            findings.append(evaluate(key, backend[key], EOL_BASELINE[key]))
        else:
            findings.append(Finding(key, EOL_BASELINE[key]["display"], "未检出", "OK",
                                    "未在 pom.xml 中找到显式版本", "—",
                                    EOL_BASELINE[key]["url"]))

    # 前端：仅提示不断言
    for key, cfg in FRONTEND_EOL.items():
        if key in frontend:
            findings.append(Finding(key, cfg["display"], frontend[key], "OK",
                                    cfg.get("note", ""), "—", ""))

    eol = [f for f in findings if f.status == "EOL"]
    warn = [f for f in findings if f.status == "WARN"]

    # ── ratchet：存量 EOL 已在基线内则只告警，新增才阻断 ──
    baseline = None if args.no_baseline else load_baseline(root)
    blocking: List[Finding] = eol
    if baseline is not None:
        if len(eol) > baseline:
            blocking = eol  # 数量超过基线 → 全部视为新增问题，阻断
        else:
            blocking = []
            if len(eol) < baseline:
                print(f"[eol] 已收敛：{baseline} → {len(eol)}，"
                      f"请把 dependency-eol-baseline.properties 更新为 {len(eol)}")

    if args.report:
        print("## 依赖版本生命周期检查\n")
        print(f"检查日期：{TODAY.isoformat()}\n")
        print("| 组件 | 当前版本 | 状态 | 建议 |")
        print("|---|---|---|---|")
        for f in findings:
            st = {"EOL": "🔴 EOL", "WARN": "🟠 临近 EOL", "OK": "🟢 正常"}[f.status]
            print(f"| {f.display} | {f.version} | {st} | {f.recommend} |")
        return 1 if blocking else (2 if warn and args.strict else 0)

    print("依赖版本生命周期检查")
    print("=" * 60)
    for f in findings:
        print(f.line())

    if eol:
        print()
        tag = "❌ 新增 EOL（阻断）" if blocking else f"⚠️  存量 EOL（基线允许 {baseline}，不阻断）"
        print(f"{tag}：共 {len(eol)} 个依赖已无安全补丁")
        for f in eol:
            print(f"   • {f.display} {f.version}")
            print(f"     {f.detail}")
            print(f"     建议：{f.recommend}")
            print(f"     依据：{f.url}")
        print()
        print("   ⚠️ 版本升级涉及运行时行为变更（Boot 4 含 Jackson 3 包迁移、")
        print("      Spring Security 7、Tomcat 11），**不要仅为版本号冒生产风险**。")
        print("      请先出影响面评估，再排期。")
        if baseline is not None and not blocking:
            print(f"   ℹ️ 治理验收用：python3 scripts/check-dependency-eol.py --no-baseline")

    if warn:
        print()
        print(f"🟠 {len(warn)} 个依赖临近 EOL：")
        for f in warn:
            print(f"   • {f.display} {f.version} — {f.detail}，建议 {f.recommend}")

    if not eol and not warn:
        print("\n✅ 关键依赖均在支持周期内")

    if blocking:
        return 1
    return 2 if warn and args.strict else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
RAG 索引构建器 - 服装供应链管理系统
================================
扫描项目文档和关键代码，切块，保存为可检索的 JSON 索引。

用法：
    python3 rag/build_index.py
"""

import json
import os
import re
import sys
from pathlib import Path

# 项目根目录
ROOT = Path(__file__).parent.parent

# -------------------------------------------------------------------
# 要索引的文件规则
# -------------------------------------------------------------------
DOC_FILES = [
    "开发指南.md",
    "系统状态.md",
    "业务流程说明.md",
    "设计系统完整规范-2026.md",
    "快速测试指南.md",
    "INVENTORY_SYSTEM_GUIDE.md",
    "README.md",
    ".github/copilot-instructions.md",
]

DOC_DIRS = [
    "docs",
    "deployment",
]

CODE_GLOBS = [
    # 后端编排器（业务核心）
    ("backend/src/main/java", "**/*Orchestrator.java", "orchestrator"),
    # 后端Controller（API端点）
    ("backend/src/main/java", "**/*Controller.java", "controller"),
    # 前端服务层
    ("frontend/src/services", "**/*.ts", "api"),
    # 前端Store
    ("frontend/src/stores", "**/*.ts", "store"),
    # 前端路由配置
    ("frontend/src", "routeConfig.ts", "config"),
    # 前端工具函数
    ("frontend/src/utils", "**/*.ts", "util"),
]

# 索引输出路径
INDEX_FILE = ROOT / "rag" / "index.json"

# BM25 token 文件
TOKENS_FILE = ROOT / "rag" / "tokens.json"

# -------------------------------------------------------------------
# 中文+代码混合分词
# -------------------------------------------------------------------
def tokenize(text: str) -> list[str]:
    """使用 jieba 分词，兼容中英文代码混合内容"""
    try:
        import jieba
        jieba.setLogLevel(60)  # 静默
        # 对代码标识符做额外分割（camelCase → 小写词）
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        tokens = list(jieba.cut(text, cut_all=False))
        # 过滤单字符无意义 token（空白、标点）
        return [t.strip().lower() for t in tokens if len(t.strip()) > 1]
    except ImportError:
        # fallback：按汉字边界 + 英文单词分割
        tokens = re.findall(r'[\u4e00-\u9fff]+|[a-zA-Z][a-zA-Z0-9_]*', text)
        return [t.lower() for t in tokens if len(t) > 1]


# -------------------------------------------------------------------
# 文档切块策略（按 Markdown 标题分段）
# -------------------------------------------------------------------
def chunk_markdown(content: str, source: str, doc_type: str) -> list[dict]:
    """按 ## 标题切块，超长段落再等分。"""
    chunks = []
    MAX_CHARS = 800
    OVERLAP = 100

    # 按 ## 标题分割
    sections = re.split(r'\n(?=#{1,3} )', content)

    for section in sections:
        section = section.strip()
        if len(section) < 30:
            continue

        # 提取标题
        title_match = re.match(r'^(#{1,3})\s+(.+)', section)
        title = title_match.group(2).strip() if title_match else ""

        if len(section) <= MAX_CHARS:
            chunks.append({
                "source": source,
                "type": doc_type,
                "title": title,
                "content": section,
            })
        else:
            # 超长段落：滑动窗口切分
            words = section.split('\n')
            buf = []
            buf_len = 0
            for line in words:
                buf.append(line)
                buf_len += len(line)
                if buf_len >= MAX_CHARS:
                    text = '\n'.join(buf)
                    chunks.append({
                        "source": source,
                        "type": doc_type,
                        "title": title,
                        "content": text,
                    })
                    # overlap：保留最后几行
                    overlap_lines = []
                    overlap_len = 0
                    for l in reversed(buf):
                        overlap_len += len(l)
                        overlap_lines.insert(0, l)
                        if overlap_len >= OVERLAP:
                            break
                    buf = overlap_lines
                    buf_len = overlap_len
            if buf:
                text = '\n'.join(buf).strip()
                if len(text) > 30:
                    chunks.append({
                        "source": source,
                        "type": doc_type,
                        "title": title,
                        "content": text,
                    })

    return chunks


def chunk_code(content: str, source: str, code_type: str) -> list[dict]:
    """代码文件：按类/方法切块，超长等分。"""
    chunks = []
    MAX_CHARS = 600

    lines = content.split('\n')
    buf = []
    buf_len = 0
    current_title = Path(source).name

    for line in lines:
        # 跳过纯注释块（保留 Javadoc）
        stripped = line.strip()
        if stripped.startswith('//') and not stripped.startswith('///'):
            continue

        # 识别类/方法边界作为 chunk 标题
        java_class = re.match(r'\s*(?:public|private|protected)?\s*(?:class|interface|enum)\s+(\w+)', line)
        java_method = re.match(r'\s*(?:public|private|protected|static|final|\s)+\s+\w+\s+(\w+)\s*\(', line)
        ts_fn = re.match(r'\s*(?:export\s+)?(?:const|function|async function)\s+(\w+)', line)

        if java_class:
            current_title = f"class {java_class.group(1)}"
        elif java_method and buf_len > 50:
            current_title = f"method {java_method.group(1)}"
        elif ts_fn:
            current_title = f"fn {ts_fn.group(1)}"

        buf.append(line)
        buf_len += len(line)

        if buf_len >= MAX_CHARS:
            text = '\n'.join(buf).strip()
            if len(text) > 50:
                chunks.append({
                    "source": source,
                    "type": code_type,
                    "title": current_title,
                    "content": text,
                })
            buf = buf[-10:]  # overlap
            buf_len = sum(len(l) for l in buf)

    if buf:
        text = '\n'.join(buf).strip()
        if len(text) > 50:
            chunks.append({
                "source": source,
                "type": code_type,
                "title": current_title,
                "content": text,
            })

    return chunks


# -------------------------------------------------------------------
# 主流程
# -------------------------------------------------------------------
def main():
    chunks = []

    # 1. 固定文档文件
    for rel_path in DOC_FILES:
        path = ROOT / rel_path
        if not path.exists():
            print(f"  [skip] {rel_path} (不存在)")
            continue
        content = path.read_text(encoding="utf-8", errors="ignore")
        source = rel_path
        new_chunks = chunk_markdown(content, source, "doc")
        chunks.extend(new_chunks)
        print(f"  [doc] {rel_path} → {len(new_chunks)} chunks")

    # 2. 文档目录
    for dir_rel in DOC_DIRS:
        dir_path = ROOT / dir_rel
        if not dir_path.exists():
            continue
        for md_file in sorted(dir_path.glob("**/*.md")):
            rel = str(md_file.relative_to(ROOT))
            content = md_file.read_text(encoding="utf-8", errors="ignore")
            new_chunks = chunk_markdown(content, rel, "doc")
            chunks.extend(new_chunks)
            print(f"  [doc] {rel} → {len(new_chunks)} chunks")

    # 3. 代码文件
    for base_rel, pattern, code_type in CODE_GLOBS:
        base = ROOT / base_rel
        if not base.exists():
            continue
        for code_file in sorted(base.glob(pattern)):
            # 跳过测试文件
            if "test" in str(code_file).lower() or "Test" in code_file.name:
                continue
            rel = str(code_file.relative_to(ROOT))
            try:
                content = code_file.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            if len(content) < 100:
                continue
            new_chunks = chunk_code(content, rel, code_type)
            chunks.extend(new_chunks)
            print(f"  [code/{code_type}] {code_file.name} → {len(new_chunks)} chunks")

    # 4. 给每个 chunk 加 id
    for i, chunk in enumerate(chunks):
        chunk["id"] = i

    # 5. 保存 chunks
    INDEX_FILE.write_text(json.dumps(chunks, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✅ 索引完成：{len(chunks)} 个 chunks → {INDEX_FILE}")

    # 6. 预计算 BM25 tokens
    print("⏳ 分词中（首次较慢）...")
    token_list = [tokenize(c["title"] + " " + c["content"]) for c in chunks]
    TOKENS_FILE.write_text(json.dumps(token_list, ensure_ascii=False), encoding="utf-8")
    print(f"✅ Token 索引完成 → {TOKENS_FILE}")


if __name__ == "__main__":
    print(f"🔍 开始构建索引，项目根: {ROOT}\n")
    main()

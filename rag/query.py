#!/usr/bin/env python3
"""
RAG 查询工具 - 服装供应链管理系统
=================================
从已构建的索引中检索与问题最相关的文档片段。

用法：
    python3 rag/query.py "如何添加一个新的Orchestrator"
    python3 rag/query.py "扫码防重复算法" --top 5
    python3 rag/query.py "弹窗尺寸规范" --type doc
    python3 rag/query.py "生产订单API" --brief
"""

import json
import re
import sys
import argparse
from pathlib import Path

ROOT = Path(__file__).parent.parent
INDEX_FILE = ROOT / "rag" / "index.json"
TOKENS_FILE = ROOT / "rag" / "tokens.json"


def tokenize(text: str) -> list[str]:
    try:
        import jieba
        jieba.setLogLevel(60)
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        tokens = list(jieba.cut(text, cut_all=False))
        return [t.strip().lower() for t in tokens if len(t.strip()) > 1]
    except ImportError:
        tokens = re.findall(r'[\u4e00-\u9fff]+|[a-zA-Z][a-zA-Z0-9_]*', text)
        return [t.lower() for t in tokens if len(t) > 1]


def load_index():
    if not INDEX_FILE.exists():
        print("❌ 索引不存在，请先运行：python3 rag/build_index.py")
        sys.exit(1)
    chunks = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
    tokens = json.loads(TOKENS_FILE.read_text(encoding="utf-8"))
    return chunks, tokens


def search(query: str, chunks: list, tokens: list, top_n: int = 5, filter_type: str = None) -> list[dict]:
    from rank_bm25 import BM25Okapi

    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    # copilot-instructions.md 是 summary 文件，密度极高会霸榜
    # 降权至 0.4（仍可出现，但不会每次都排第一）
    SUMMARY_SOURCES = {".github/copilot-instructions.md"}
    SUMMARY_WEIGHT = 0.4

    # 可选：按类型过滤
    if filter_type:
        indices = [i for i, c in enumerate(chunks) if filter_type in c.get("type", "")]
        filtered_tokens = [tokens[i] for i in indices]
        filtered_chunks = [chunks[i] for i in indices]
    else:
        indices = list(range(len(chunks)))
        filtered_tokens = tokens
        filtered_chunks = chunks

    if not filtered_tokens:
        return []

    bm25 = BM25Okapi(filtered_tokens)
    scores = bm25.get_scores(query_tokens)

    # 对 summary 文件降权
    for i, chunk in enumerate(filtered_chunks):
        if chunk.get("source", "") in SUMMARY_SOURCES:
            scores[i] *= SUMMARY_WEIGHT

    # 取 top_n
    top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_n]

    results = []
    for idx in top_indices:
        if scores[idx] < 0.01:
            continue
        chunk = filtered_chunks[idx].copy()
        chunk["score"] = round(float(scores[idx]), 3)
        results.append(chunk)

    return results


def display(results: list[dict], brief: bool = False):
    if not results:
        print("⚠️  没有找到相关内容")
        return

    for i, r in enumerate(results, 1):
        score = r.get("score", 0)
        source = r.get("source", "")
        title = r.get("title", "")
        rtype = r.get("type", "")
        content = r.get("content", "")

        bar = "█" * min(int(score * 3), 10)
        print(f"\n{'─'*60}")
        print(f"#{i}  [{rtype}] {source}")
        if title:
            print(f"    📌 {title}")
        print(f"    相关度: {bar} {score}")
        print(f"{'─'*60}")

        if brief:
            # 只显示前 200 字
            preview = content[:200].replace('\n', ' ')
            print(f"{preview}{'...' if len(content) > 200 else ''}")
        else:
            print(content[:600])
            if len(content) > 600:
                print(f"... [共 {len(content)} 字，截断显示]")


def main():
    parser = argparse.ArgumentParser(description="查询服装项目知识库")
    parser.add_argument("query", help="检索问题，例如：如何添加Orchestrator")
    parser.add_argument("--top", type=int, default=5, help="返回结果数量（默认5）")
    parser.add_argument("--type", dest="filter_type", default=None,
                        help="按类型过滤：doc / orchestrator / controller / api / store / util")
    parser.add_argument("--brief", action="store_true", help="只显示摘要（前200字）")

    args = parser.parse_args()

    print(f"\n🔍 查询：{args.query}")
    if args.filter_type:
        print(f"   过滤类型：{args.filter_type}")
    print()

    chunks, tokens = load_index()
    results = search(args.query, chunks, tokens, top_n=args.top, filter_type=args.filter_type)
    display(results, brief=args.brief)

    print(f"\n共找到 {len(results)} 条相关内容（索引共 {len(chunks)} chunks）\n")


if __name__ == "__main__":
    main()

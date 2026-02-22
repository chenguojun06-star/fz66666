# RAG 知识库 - 服装供应链管理系统

本地检索工具，供 AI 快速查阅项目文档与代码。

## 首次使用

```bash
# 安装依赖（只需一次）
pip install rank-bm25 jieba

# 构建索引（文档更新后重新运行）
python3 rag/build_index.py
```

## 查询

```bash
# 基本查询
python3 rag/query.py "如何添加一个新的Orchestrator"

# 查询并只看摘要
python3 rag/query.py "扫码防重复时间间隔" --brief

# 只查文档（不含代码）
python3 rag/query.py "弹窗尺寸规范" --type doc

# 只查编排器代码
python3 rag/query.py "生产订单事务边界" --type orchestrator

# 返回更多结果
python3 rag/query.py "面料入库流程" --top 8
```

## 类型过滤选项

| `--type` | 内容 |
|---|---|
| `doc` | 所有 .md 文档 |
| `orchestrator` | 后端编排器 Java 代码 |
| `controller` | 后端 Controller Java 代码 |
| `api` | 前端 API 服务层 |
| `store` | 前端 Zustand Store |
| `util` | 前端工具函数 |
| `config` | routeConfig 等配置 |

## 索引覆盖范围

- 全部 `.md` 文档（开发指南、业务流程、设计规范、部署说明等）
- 全部 37 个后端 Orchestrator
- 全部后端 Controller
- 前端 services / stores / utils / routeConfig

当前约 **9000+ chunks**，构建耗时 ~30 秒。

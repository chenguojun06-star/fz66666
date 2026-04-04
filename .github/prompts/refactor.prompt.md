---
description: "安全重构流程：拆分大文件、提取 Hook/Helper、消除重复代码"
mode: "agent"
tools: ["semantic_search", "grep_search", "file_search", "read_file", "replace_string_in_file", "run_in_terminal", "get_errors"]
---
# 安全重构流程

对现有代码进行结构优化，保证行为完全不变。

## 铁则
- **NEVER** 在重构 PR 中混入功能变更。
- **NEVER** 删除你不理解的代码——先搜索全局引用。
- **ALWAYS** 先读完整文件，理解上下文后再动手。

## 第一步：度量与目标
- 当前文件行数 vs 目标行数（参考 copilot-instructions.md 的文件大小限制表）。
- 确认拆分策略：按 Tab？按数据域？按职责？

| 类型 | 绿色目标 | 红色禁止 |
|------|---------|---------|
| React 组件 | ≤200 行 | >300 行 |
| React 页面 | ≤400 行 | >500 行 |
| Hook | ≤80 行 | >150 行 |
| Orchestrator | ≤150 行 | >200 行 |
| Service | ≤200 行 | >300 行 |

## 第二步：提取计划
列出要提取的模块：
```
原文件 → 提取目标 → 预估行数
index.tsx(1200行) → useXxxData.ts(80行) + XxxTable.tsx(150行) + XxxModal.tsx(120行) + index.tsx(400行)
```

**WARNING**：拆分后每个文件必须独立可理解，禁止循环依赖。

## 第三步：逐步提取
每次只提取一个模块，提取后立即验证：
```bash
# 前端
cd frontend && npx tsc --noEmit

# 后端
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  /opt/homebrew/bin/mvn clean compile -q
```

## 第四步：回归确认
- 原文件所有 export 是否仍然对外可用？
- 提取的组件 props/接口是否类型完整？
- `git diff --stat HEAD` 确认只有预期文件变动。
- 无 TODO/FIXME 残留、无注释代码残留。

---
description: "推送前强制验证：编译、类型检查、git 状态、数据库一致性、废弃代码清查"
mode: "agent"
tools: ["run_in_terminal", "grep_search", "file_search", "read_file", "get_errors"]
---
# 推送前检查清单

**CRITICAL**：本检查由 AI 主动执行并汇报结果。不得把检查步骤甩给用户手动执行。
仅 git push 需要用户明确授权。

请按以下顺序逐项执行，每步通过后立即标记并继续。

## 第一步：后端编译
```bash
cd /Users/guojunmini4/Documents/服装66666/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
/opt/homebrew/bin/mvn clean compile -q
```
- 必须 `BUILD SUCCESS`，退出码 0。
- 失败时：读取错误信息并尝试修复，而非直接报告给用户。

## 第二步：前端类型检查
```bash
cd /Users/guojunmini4/Documents/服装66666/frontend && npx tsc --noEmit
```
- 必须 0 errors。

## 第三步：Git 状态核查
```bash
cd /Users/guojunmini4/Documents/服装66666 && \
git status && git diff --stat HEAD
```
- 确认所有需要提交的文件已暂存，无遗漏。
- **NEVER** 使用 `git add .`，逐个精确 add。
- 检查是否有不应提交的文件（.backup-*、临时脚本、日志文件等）。

## 第四步：数据库一致性
- **CRITICAL**：Entity 新增字段必须有对应 Flyway V*.sql，反之亦然。
- 确认 Flyway 脚本使用幂等 `INFORMATION_SCHEMA` + `SET @s = IF(...)` 模式。
- **NEVER** 修改已执行过的 V*.sql 文件（checksum 不匹配 → 全系统 500）。
- `SET @s = IF(...)` 内 SQL 字符串禁止包含 `COMMENT ''text''`（Flyway 解析截断）。
- 新脚本版本号格式：`V{YYYYMMDDHHMM}__description.sql`（12 位时间戳）。

## 第五步：废弃代码清查
- 是否有需要同步删除的旧逻辑、注释代码、兼容代码？
- 检查 TODO/FIXME 标记：不允许未处理标记直接提交。
- 检查 `@Deprecated` 方法是否有残留调用。

## 第六步：安全与架构审查
- Controller 是否有 class 级别 `@PreAuthorize("isAuthenticated()")`？
- 是否引用了 `t_permission` 表中不存在的权限码？
- Service 是否存在互调（应通过 Orchestrator 编排）？
- 多表写操作是否有 `@Transactional(rollbackFor = Exception.class)`？
- 统计计数返回值是否用 `int`（避免 JacksonConfig Long→String 序列化问题）？

## 最终汇报
用表格列出每步结果：

| 步骤 | 状态 | 详情 |
|------|------|------|
| 后端编译 | ✅/❌ | ... |
| 前端类型 | ✅/❌/⏭️跳过 | ... |
| Git 状态 | ✅/❌ | ... |
| 数据库一致性 | ✅/❌/⏭️无DB改动 | ... |
| 废弃代码 | ✅/❌ | ... |
| 安全审查 | ✅/❌ | ... |

全部通过 → 提示"可以安全提交"。任一失败 → 列出修复建议。

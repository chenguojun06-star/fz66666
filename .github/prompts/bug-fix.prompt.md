---
description: "Bug 排查与修复模板：先定位根因再修复，禁止盲改"
mode: "agent"
tools: ["semantic_search", "grep_search", "file_search", "read_file", "replace_string_in_file", "run_in_terminal", "get_errors", "manage_todo_list"]
---
# Bug 排查与修复模板

用 manage_todo_list 追踪每步进度。**NEVER 假设** — 不确定就查。

## 第一步：复现与定位
1. 明确 Bug 表现（HTTP 状态码、错误信息、截图）。
2. 确认影响范围：仅本地？还是云端也有？哪些端点/页面受影响？
3. 在后端日志中搜索关键错误：
   ```bash
   grep -i "error\|exception\|500" backend/logs/fashion-supplychain.log | tail -30
   ```
4. **CRITICAL**：先搜索代码定位根因，再制定修复方案。禁止未定位就开始改代码。

## 第二步：根因分析
- 判断 Bug 类型并选择对应排查路径：

| 类型 | 排查方向 |
|------|----------|
| HTTP 500 | 后端日志 → 异常堆栈 → 定位 Service/Orchestrator |
| HTTP 403 | 权限码是否存在于 t_permission？class 级别 @PreAuthorize？ |
| 数据不一致 | Entity ↔ DB 列是否同步？Flyway 是否静默失败？ |
| 前端白屏/报错 | `npx tsc --noEmit` + 浏览器 Console |
| 云端有本地无 | DB Schema 漂移？云端缺列？用最小字段 select 绕开 |

- **WARNING**：云端 `Unknown column` 错误的常见根因是 Flyway `SET @s = IF(...)` 内含 `COMMENT ''text''` 导致列静默未添加。

## 第三步：修复实施
- 遵循最小改动原则，只修复 Bug，不顺便重构。
- 多表写操作确认 `@Transactional(rollbackFor = Exception.class)`。
- 如果涉及 DB 列缺失：
  1. 新增 Flyway 脚本补列（幂等 INFORMATION_SCHEMA）。
  2. 同步更新 `DbColumnRepairRunner` 启动自愈名单。
  3. 热路径改为最小字段 `select(...)`，降低对扩展列的脆弱依赖。

## 第四步：验证
- 后端编译通过：`mvn clean compile -q`。
- 复现路径重新测试：确认 Bug 已修复。
- 回归测试：确认修复未影响相关功能。
- 废弃代码清查：修复过程中是否引入了需要清理的兼容代码？

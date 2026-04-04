---
description: "新功能全栈实现模板：后端四层 + 前端页面 + 可选小程序"
mode: "agent"
tools: ["semantic_search", "grep_search", "file_search", "read_file", "replace_string_in_file", "create_file", "run_in_terminal", "get_errors", "manage_todo_list"]
---
# 新功能实现模板

请按以下流程实施新功能。用 manage_todo_list 追踪每步进度。

## ⚠️ 开始前（CRITICAL — 禁止跳过）
- **NEVER 假设**：不确定的类型、方法、表结构必须先 grep/read 确认，禁止凭记忆猜测。
- **先搜后建**：新建 Orchestrator 前，先 `grep -rl "关键词" backend/src/` 搜索是否已有可复用的。
- **先读后改**：修改任何文件前，必须先 read_file 了解上下文。
- 确认功能所属业务领域（production / finance / style / warehouse / system / intelligence）。
- 是否涉及数据库表结构变更？→ 需要 Flyway 脚本。
- 是否跨端（PC 端 + 小程序）？→ 需要同步 validationRules。
- 是否需要新建 Orchestrator？判断标准：
  | 情况 | 需要 Orchestrator？ |
  |------|---------------------|
  | 单表 CRUD | ❌ 直接 Service |
  | 读 2+ Service 数据拼装 | ✅ 需要 |
  | 写操作涉及 2+ 张表 | ✅ 需要（@Transactional） |
  | 状态流转 + 审计日志 | ✅ 需要 |

## 第一步：数据层
- 确认表结构，编写 Flyway 脚本（`V{YYYYMMDDHHMM}__xxx.sql`，幂等模式）。
- **CRITICAL**：`ALTER TABLE ADD COLUMN` 必须用 `INFORMATION_SCHEMA` 条件判断，禁止裸 ALTER。
- **CRITICAL**：`SET @s = IF(...)` 块内 SQL 字符串禁止使用 `COMMENT ''text''`（会被 Flyway 截断）。
- 同步 Entity 字段（类型映射：`Integer` / `Long` / `String` / `LocalDateTime`）。
- 检查字段 NOT NULL 约束：有 NOT NULL 必须有默认值或代码赋值，否则 MySQL STRICT 报 500。
- 高频查询字段是否需要复合索引？（tenant_id + status 等）

## 第二步：后端实现
- **Controller**（≤100 行）：class 级别 `@PreAuthorize("isAuthenticated()")`，方法级别不重复。
- **Orchestrator**（≤150 行）：`@Transactional(rollbackFor = Exception.class)`，跨 Service 编排。
  - **WARNING**：`UserContext.tenantId()` 返回 `Long`（非 String），`userId()` 返回 `String`（非 Long）。
- **Service**（≤200 行）：单领域 CRUD，禁止互调。
- 路由约定：列表 `POST /list`，状态流转 `POST /{id}/stage-action`，响应 `Result<T>`。
- **NEVER** 引用 `t_permission` 表中不存在的权限码（会导致全员 403）。

## 第三步：前端实现
- 页面 index（≤400 行）+ 数据 Hook（≤80 行）+ 组件（≤200 行）。
- **强制组件库**（禁止替代品）：
  - `ResizableTable` 替代 antd `Table`
  - `ResizableModal` 仅用 60vw / 40vw / 30vw
  - `RowActions` 用于表格操作列
  - `ModalContentLayout` + `ModalFieldRow` 用于弹窗表单
- 在 `services/` 添加 API 函数和完整 TS 类型定义。
- 注册路由 `routeConfig.ts`。

## 第四步：小程序（如需要）
- 同步 `validationRules.ts` ↔ `validationRules.js`。
- 使用共享样式 `page-utils.wxss` / `modal-form.wxss`，禁止页面内重复定义。
- 确认正式版 API 地址指向云端。

## 第五步：验证（CRITICAL — 全部通过才能提交）
```bash
# 后端编译
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  /opt/homebrew/bin/mvn clean compile -q
# 前端类型
cd frontend && npx tsc --noEmit
# Git 状态
git status && git diff --stat HEAD
```
- Entity ↔ Flyway 双向一致性检查。
- 废弃代码清查：是否有需要同步删除的旧逻辑、注释代码、TODO/FIXME？
- 跨端影响：PC 端改动是否影响小程序？validationRules 是否需同步？

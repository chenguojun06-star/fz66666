# MCP 工具参数速查表

> 每轮对话开始时加载到上下文，消除 MCP 工具调用的参数试错环节
> 最后更新：2026-07-02（新增 6 个自研 MCP + Serena 语义代码搜索 + P0 #23 强制标注）
> 规则：调用 MCP 前先查表，第一次就用正确参数名

---

## ⚠️ P0 #23 强制调用场景（违反即 P0 违规）

> 2026-07-02 新增铁律：以下 10 个场景**必须**用 MCP，禁止用原生工具替代。
> 详见 `.trae/rules/project_rules.md` P0 #23。

| 场景 | 必须用 | 禁止替代 |
|------|--------|---------|
| 查业务数据 | `db-query-mcp.query_table` / `query_by_id` | ❌ RunCommand + 裸 SQL |
| 校验 Flyway SQL | `flyway-mcp.validate_migration_sql` | ❌ `python3 scripts/check-flyway-sql.py` |
| Flyway 列依赖/Entity 同步 | `flyway-mcp.check_column_deps` / `check_entity_sync` | ❌ 直接跑 python 脚本 |
| 后端编译 | `test-runner-mcp.compile_backend` | ❌ `mvn compile` |
| 前端类型检查 | `test-runner-mcp.typecheck_frontend` | ❌ `npx tsc --noEmit` |
| 多租户隔离审计 | `test-runner-mcp.audit_tenant_id` | ❌ `python3 scripts/audit-tenant-id.py` |
| 符号搜索/调用链 | `serena`（find_symbol / find_referencing_symbols） | ❌ Grep 搜类名做调用链 |
| 变更前影响评估 | `change-impact-mcp.analyze_change_risk` | ❌ 凭记忆判断影响 |
| 写代码前反模式检测 | `anti-pattern-mcp.detect_anti_patterns` | ❌ 跳过反模式检查 |
| 会话开始加载记忆 | `memory-bank-mcp.read_all_core` | ❌ 逐个 Read memory-bank |

**降级规则**：MCP 不可用时必须明确告知用户"XX-mcp 不可用，降级为 YY"，并手动遵守对应 P0 铁律（多租户/Flyway/工具验证）。

---

## 0. 我应该用原生工具还是 MCP？

**快速决策树（Yes/No）

```
是否需要操作项目内代码或文件？
   ├─ YES → 使用原生工具（Read / Edit / Write / Glob / SearchCodebase）
   │   └─ 项目内文件操作 → 永久禁调用 MCP Filesystem（P0 铁律
   │
是否需要语义级代码搜索/调用链/引用追踪？
   ├─ YES → serena（find_symbol / find_referencing_symbols，LSP 语义分析
   │   └─ 简单关键词搜索 → 原生 Grep / SearchCodebase
   │
是否需要查业务数据（多租户安全）？
   ├─ YES → db-query-mcp（强制 tenantId，自动注入 WHERE tenant_id
   │   └─ 禁止 RunCommand + 裸 SQL（P0 铁律 #4 跨租户泄漏风险
   │
是否需要校验 Flyway 迁移？
   ├─ YES → flyway-mcp（validate_migration_sql / check_column_deps
   │
是否需要编译/类型检查/冒烟测试？
   ├─ YES → test-runner-mcp（compile_backend / typecheck_frontend / run_smoke_test
   │
是否需要读 Memory Bank 或追加变更记录？
   ├─ YES → memory-bank-mcp（read_all_core / append_active_context / mark_progress_complete
   │
是否需要分析变更风险 / 检查 P0 铁律？
   ├─ YES → change-impact-mcp（analyze_change_risk / check_p0_rules / generate_checklist
   │
是否需要检测反模式？
   ├─ YES → anti-pattern-mcp（detect_anti_patterns / generate_self_check_list
   │
是否需要打开真实浏览器测试前端页面？
   ├─ YES → integrated_browser（browser_navigate → browser_snapshot → browser_click）
   │
是否需要查第三方库官方文档？
   ├─ YES → mcp_context7（通过 libraryId 检索）
   │
是否需要操作 Docker 容器/镜像/网络/卷？
   ├─ YES → mcp_docker（list_containers / build_image / 等
   │
是否需要显式分步推理拆解复杂问题？
   ├─ YES → mcp_Sequential_Thinking（thought + thoughtNumber + totalThoughts
   │
以上都不是？
   └─ 使用 TodoWrite + 自身推理能力
```

**高频场景工具建议

| 场景 | 推荐工具 | 说明 |
|------|---------|------|
| 读单个文件 | **Read | 直接读取，最快速
| 关键词搜代码 | **Grep | 支持中文关键词，带行号
| 语义搜代码/调用链 | **serena | LSP 语义分析，省 token 3-5 倍
| 查业务数据 | **db-query-mcp | 多租户安全，禁止裸 SQL
| 校验 Flyway | **flyway-mcp | 包装 4 个 Python 脚本
| 编译验证 | **test-runner-mcp | mvn compile / npx tsc
| 读 Memory Bank | **memory-bank-mcp | read_all_core 一次读全部
| 变更风险评估 | **change-impact-mcp | P0/P1/P2 分级
| 反模式检测 | **anti-pattern-mcp | 16 类反模式
| 测试前端页面 | integrated_browser | 真实浏览器测试
| 查 Spring Boot API | mcp_context7 + resolve-library-id("Spring Boot"


---

## 一、本机可用的 MCP Servers

### 1.1 通用 MCP（5 个，Trae IDE 内置）

| Server Name | 用途 | 何时使用 |
|-------------|------|---------|
| **integrated_browser** | 浏览器自动化（导航/点击/填表/截图/抽取数据） | 需要打开网页、操作 Web 界面、获取 Web 内容时 |
| **mcp_Filesystem** | 本地文件系统（读文件/目录/文件信息） | ⚠️ 项目路径不在允许范围，项目内文件操作用原生工具 |
| **mcp_Sequential_Thinking** | 多步推理（显式逐步思考） | 复杂问题需要拆解思路时 |
| **mcp_context7** | 第三方库/框架官方文档查询（resolve + query） | 需要查某个库的 API 用法时 |
| **mcp_docker** | Docker 容器管理（列表/启动/停止/日志/镜像/网络/卷） | 需要操作 Docker 容器、镜像时 |

### 1.2 项目自研 MCP（6 个，.trae/mcp.json 配置）

| Server Name | 用途 | 工具数 | 何时使用 |
|-------------|------|--------|---------|
| **db-query-mcp** | 多租户安全只读数据库查询 | 5 | 查业务数据（强制 tenantId，自动注入 WHERE tenant_id） |
| **flyway-mcp** | Flyway 迁移校验 + 模板生成 | 8 | 校验迁移 SQL / 检查列依赖 / 生成迁移模板 |
| **test-runner-mcp** | 编译/类型检查/冒烟/审计 | 8 | mvn compile / npx tsc / 冒烟测试 / 多租户审计 |
| **memory-bank-mcp** | Memory Bank 读写 | 6 | 读 activeContext/progress / 追加变更 / 标记完成 |
| **change-impact-mcp** | 变更影响分析 | 4 | P0/P1/P2 风险评估 / 生成 CHECKLIST |
| **anti-pattern-mcp** | 反模式检测 | 5 | 检测 16 类反模式 / 生成自查清单 |

### 1.3 外部接入 MCP（1 个）

| Server Name | 用途 | 何时使用 |
|-------------|------|---------|
| **serena** | 语义代码搜索（LSP） | find_symbol / find_referencing_symbols / 精确编辑，省 token 3-5 倍 |

---

## 二、各 Server 工具清单 & 正确参数名

### 2.1 mcp_Filesystem

> **⚠️ 路径限制**：只能访问 `/Users/guojunmini4/Desktop` 和 `/Users/guojunmini4/Documents`
> **⚠️ 注意**：本项目路径是 `/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/`，MCP Filesystem **无法直接访问**
> **✅ 方案**：项目内的文件操作**优先使用原生工具**（Read / Edit / Write / Glob / Grep / LS / SearchCodebase），不要调用 mcp_Filesystem

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **read_file** | `path` (string) | 读取文件（二进制）|
| **read_text_file** | `path` (string) | 读取文本文件 |
| **read_multiple_files** | `paths` (array of string) | 批量读取多个文件 |
| **write_file** | `path` (string), `content` (string) | 写入文件 |
| **create_directory** | `path` (string) | 创建目录 |
| **list_directory** | `path` (string) | 列出目录内容 |
| **directory_tree** | `path` (string) | 目录树 |
| **get_file_info** | `path` (string) | 文件元信息 |
| **edit_file** | `path` (string), `edits` (array) | 编辑文件 |
| **search_files** | `pattern` (string), `path` (string, optional) | 搜索文件 |
| **list_allowed_directories** | 无参数 | 列出允许访问的目录 |

**正确调用示例**：
```
run_mcp(mcp_Filesystem, read_text_file, { path: "/Users/guojunmini4/Documents/test.txt" })
```

---

### 2.2 mcp_Sequential_Thinking

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **sequentialthinking** | `thought` (string), `thoughtNumber` (number), `totalThoughts` (number), `nextThoughtNeeded` (boolean), `enable_hardcoded_system_prompt` (boolean, optional) | 一步一步思考 |

**正确调用示例**：
```
run_mcp(mcp_Sequential_Thinking, sequentialthinking, {
  thought: "第1步：分析问题核心",
  thoughtNumber: 1,
  totalThoughts: 3,
  nextThoughtNeeded: true,
  enable_hardcoded_system_prompt: true
})
```

---

### 2.3 mcp_docker

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **list_containers** | 无参数 | 列出所有容器 |
| **create_container** | `name` (string), `image` (string), ... | 创建容器 |
| **run_container** | `name` (string), `image` (string), ... | 运行容器 |
| **recreate_container** | `name` (string), `image` (string), ... | 重新创建并运行 |
| **start_container** | `name` (string) | 启动已有容器 |
| **stop_container** | `name` (string) | 停止容器 |
| **remove_container** | `name` (string) | 删除容器 |
| **fetch_container_logs** | `name` (string), `tail` (number, optional) | 获取容器日志 |
| **list_images** | 无参数 | 列出镜像 |
| **pull_image** | `image` (string) | 拉取镜像 |
| **push_image** | `image` (string) | 推送镜像 |
| **build_image** | `dockerfile` (string), `tag` (string), `context` (string) | 构建镜像 |
| **remove_image** | `image` (string) | 删除镜像 |
| **list_networks** | 无参数 | 列出网络 |
| **create_network** | `name` (string) | 创建网络 |
| **remove_network** | `name` (string) | 删除网络 |
| **list_volumes** | 无参数 | 列出卷 |
| **create_volume** | `name` (string) | 创建卷 |
| **remove_volume** | `name` (string) | 删除卷 |

**正确调用示例**：
```
run_mcp(mcp_docker, list_containers, {})
run_mcp(mcp_docker, fetch_container_logs, { name: "fashion-mysql-simple", tail: 50 })
```

---

### 2.4 mcp_context7

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **resolve-library-id** | `libraryName` (string) | 通过关键词找 libraryId（格式：`/owner/repo`）|
| **query-docs** | `libraryId` (string, 格式 `/owner/repo`), `query` (string), `context_length` (number, optional), `response_type` (string, optional) | 查询指定库的文档 |

**正确调用示例**：
```
run_mcp(mcp_context7, resolve-library-id, { libraryName: "Spring Boot" })
run_mcp(mcp_context7, query-docs, {
  libraryId: "/spring-projects/spring-boot",
  query: "如何配置 @Transactional 事务隔离级别",
  context_length: 4000,
  response_type: "brief"
})
```

---

### 2.5 integrated_browser

| Tool | 参数（必填） | 说明 |
|------|-------------|------|
| **browser_navigate** | （无需参数，浏览器内部有状态）| 导航到指定 URL |
| **browser_navigate_back** | 无参数 | 返回上一页 |
| **browser_tabs** | 无参数 | 列出当前打开的标签页 |
| **browser_snapshot** | 无参数 | 获取当前页面快照（DOM 结构/可点击元素）|
| **browser_take_screenshot** | 无参数 | 截取当前页面截图 |
| **browser_click** | `element` (string, CSS选择器或元素引用) | 点击元素 |
| **browser_hover** | `element` (string) | 悬停在元素上 |
| **browser_type** | `element` (string), `text` (string) | 在输入框中输入文本 |
| **browser_select_option** | `element` (string), `option` (string) | 选择下拉选项 |
| **browser_press_key** | `key` (string) | 按下键盘按键 |
| **browser_get_attribute** | `element` (string), `attribute` (string) | 获取元素属性 |
| **browser_scroll** | `direction` (string: "up"/"down"/"left"/"right") | 滚动页面 |
| **browser_console_messages** | 无参数 | 获取浏览器 console 输出 |
| **browser_network_requests** | 无参数 | 获取网络请求记录 |
| **browser_wait_for** | 无参数，或 `selector` (string, optional) | 等待页面加载或元素出现 |
| **browser_lock** | 无参数 | 锁定浏览器（操作前必须）|
| **browser_unlock** | 无参数 | 解锁浏览器（操作后必须）|
| **browser_evaluate** | `script` (string) | 在页面执行 JS |
| **browser_handle_dialog** | `action` (string: "accept"/"dismiss") | 处理弹窗 |

**标准调用流程**：
```
1. run_mcp(integrated_browser, browser_lock, {})            // 先锁定
2. run_mcp(integrated_browser, browser_navigate, { url: "https://example.com" })
3. run_mcp(integrated_browser, browser_snapshot, {})         // 看页面有什么
4. run_mcp(integrated_browser, browser_click, { element: "button.submit" })
5. run_mcp(integrated_browser, browser_take_screenshot, {})  // 截图验证
6. run_mcp(integrated_browser, browser_unlock, {})           // 最后解锁
```

---

### 2.6 db-query-mcp（多租户安全只读，P0 铁律 #4）

> **⚠️ 强制 tenantId**：所有查询工具必填 tenantId，自动注入 `WHERE tenant_id = ?`
> **⚠️ 禁止裸 SQL**：查业务数据必须用此 MCP，禁止 RunCommand + 裸 SQL

| Tool | 参数（必填加 *） | 说明 |
|------|-------------|------|
| **query_table** | `tableName`*(string), `columns`(array,可选), `whereClause`(string,可选,不含tenant_id), `limit`(number,默认100上限500), `tenantId`*(number) | 按表查询，自动注入 tenant_id |
| **describe_table** | `tableName`*(string) | 查看表结构（无需 tenantId） |
| **query_by_id** | `tableName`*(string), `id`*(number), `tenantId`*(number) | 按主键查单行 |
| **count_table** | `tableName`*(string), `whereClause`(string,可选), `tenantId`*(number) | 按表计数 |
| **execute_readonly_sql** | `sql`*(string,仅SELECT), `tenantId`*(number) | 只读自定义SQL，AST白名单+跨租户检测+强制LIMIT 500 |

**正确调用示例**：
```
run_mcp(db-query-mcp, query_table, { tableName: "t_style_info", tenantId: 1, limit: 10 })
run_mcp(db-query-mcp, query_by_id, { tableName: "t_style_info", id: 100, tenantId: 1 })
```

---

### 2.7 flyway-mcp（Flyway 迁移校验，P0 铁律 #1）

> **只读**：禁止执行迁移，只校验和生成模板

| Tool | 参数（必填加 *） | 说明 |
|------|-------------|------|
| **list_migrations** | 无 | 查询 flyway_schema_history（最多200条） |
| **check_migration_status** | `version`(string,可选) | 查询迁移状态，不传返回最近50条 |
| **find_failed_migrations** | 无 | 查询 success=0 的失败迁移 |
| **validate_migration_sql** | `filePath`*(string) | 校验迁移SQL（包装check-flyway-sql.py） |
| **check_column_deps** | `since`(string,可选), `all`(boolean,可选) | 检查新增列依赖（包装check-flyway-column-deps.py） |
| **check_version_format** | 无 | 检查版本号唯一性（包装check-flyway-versions.py） |
| **check_entity_sync** | `since`(string,可选), `all`(boolean,可选) | 检查Entity-Flyway对齐（包装check-entity-flyway.py） |
| **generate_migration_template** | `description`*(string), `operationType`*(string: add_column/create_table/create_index/modify_column), `tableName`(string,可选)... | 生成幂等迁移模板（禁止IF NOT EXISTS，用information_schema+存储过程） |

**正确调用示例**：
```
run_mcp(flyway-mcp, validate_migration_sql, { filePath: "backend/src/main/resources/db/migration/V20260702001__test.sql" })
run_mcp(flyway-mcp, generate_migration_template, { description: "add_remark_to_style", operationType: "add_column", tableName: "t_style_info", columnName: "remark", columnType: "VARCHAR(500)" })
```

---

### 2.8 test-runner-mcp（编译/测试/审计）

| Tool | 参数（必填加 *） | 说明 |
|------|-------------|------|
| **compile_backend** | `module`(string,可选,默认backend) | mvn compile -DskipTests（超时300s） |
| **typecheck_frontend** | `module`(string,可选,默认frontend) | npx tsc --noEmit（超时180s） |
| **run_smoke_test** | `baseUrl`*(string), `username`(string,可选默认lilb), `password`(string,可选默认123456) | 冒烟测试（超时180s） |
| **audit_tenant_id** | `verbose`(boolean,可选) | 扫描Entity/Mapper/XML多租户违规（超时120s） |
| **audit_frontend_colors** | 无 | 扫描前端硬编码颜色（超时120s） |
| **check_flyway_sql** | `filePath`(string,可选), `since`(string,可选) | 校验Flyway脚本（超时60s） |
| **check_entity_sync** | 无 | Entity-Flyway对齐检查（超时60s） |
| **run_data_consistency** | 无 | 数据一致性校验（orphan/tenant_id/delete_flag，超时60s） |

**正确调用示例**：
```
run_mcp(test-runner-mcp, compile_backend, {})
run_mcp(test-runner-mcp, typecheck_frontend, {})
run_mcp(test-runner-mcp, audit_tenant_id, { verbose: true })
```

---

### 2.9 memory-bank-mcp（Memory Bank 读写）

| Tool | 参数（必填加 *） | 说明 |
|------|-------------|------|
| **read_memory** | `file`*(string: activeContext/progress/decisionLog/productContext/quickStart/antiPatterns/changeImpact/contextRot/aiDashboard) | 读取单个Memory Bank文件 |
| **read_all_core** | 无 | 读取全部9个核心文件（开发任务开始时必读） |
| **append_active_context** | `content`*(string) | 追加到activeContext.md"最近变更"部分 |
| **mark_progress_complete** | `taskId`*(string) | 标记progress.md任务为已完成 |
| **append_ai_dashboard** | `filePath`*(string), `operation`*(string: 新增/修改/删除), `lines`*(number), `riskLevel`*(string: P0/P1/P2) | 追加操作日志到ai-dashboard.md |
| **generate_session_summary** | `completedTasks`*(array<string>), `keyDecisions`(array<string>,可选), `modifiedFiles`*(array<string>) | 生成会话摘要（长会话压缩用） |

**正确调用示例**：
```
run_mcp(memory-bank-mcp, read_all_core, {})
run_mcp(memory-bank-mcp, append_active_context, { content: "完成MCP配置优化" })
run_mcp(memory-bank-mcp, mark_progress_complete, { taskId: "task-1" })
```

---

### 2.10 change-impact-mcp（变更影响分析）

| Tool | 参数（必填加 *） | 说明 |
|------|-------------|------|
| **analyze_change_risk** | `changeDescription`*(string), `changedFiles`(array<string>,可选) | 分析变更风险等级（P0/P1/P2）和影响范围 |
| **check_p0_rules** | `changeDescription`*(string) | 检查是否触发P0铁律（7类：flyway/api/permission/scan/tenant/transaction/print） |
| **generate_checklist** | `changeDescription`*(string) | 生成变更前必做CHECKLIST（8条检查项） |
| **get_impact_matrix** | 无 | 读取完整变更影响矩阵文件 |

**正确调用示例**：
```
run_mcp(change-impact-mcp, analyze_change_risk, { changeDescription: "修改t_style_info表结构新增remark字段", changedFiles: ["V20260702001__add_remark.sql", "StyleInfo.java"] })
run_mcp(change-impact-mcp, check_p0_rules, { changeDescription: "修改扫码逻辑" })
```

---

### 2.11 anti-pattern-mcp（反模式检测）

| Tool | 参数（必填加 *） | 说明 |
|------|-------------|------|
| **detect_anti_patterns** | `changeDescription`*(string), `changedFiles`(array<string>,可选) | 检测是否违反16类反模式 |
| **get_anti_pattern** | `patternId`*(string: AP-DB-01~03/AP-BE-01~04/AP-FE-01~03/AP-MP-01~02/AP-WF-01~02/AP-AI-01~02) | 获取特定反模式详情 |
| **get_all_anti_patterns** | `category`(string,可选: database/backend/frontend/miniprogram/workflow/ai/all) | 获取所有反模式列表 |
| **generate_self_check_list** | 无 | 生成反模式自查清单（提交代码前核对） |
| **get_anti_patterns_file** | 无 | 读取完整anti-patterns.md文件 |

**正确调用示例**：
```
run_mcp(anti-pattern-mcp, detect_anti_patterns, { changeDescription: "在Service层加@Transactional" })
run_mcp(anti-pattern-mcp, generate_self_check_list, {})
```

---

### 2.12 serena（语义代码搜索，LSP）

> **优势**：基于LSP语义分析，比grep省token 3-5倍；支持符号发现/引用追踪/精确编辑
> **支持语言**：Java/TypeScript/JavaScript/Python等30+语言

| Tool | 常用参数 | 说明 |
|------|---------|------|
| **find_symbol** | `name`(string), `relative_path`(string,可选), `symbol_kind`(string,可选) | 按名称查找符号定义 |
| **find_referencing_symbols** | `symbol_name`(string), `relative_path`(string,可选) | 查找引用某符号的所有位置（调用链分析） |
| **find_symbol_overloads** | `name`(string) | 查找方法重载 |
| **get_symbols_overview** | `relative_path`(string) | 获取文件符号概览 |
| **replace_symbol_body** | `name`(string), `relative_path`(string), `new_body`(string) | 精确替换方法体 |
| **insert_after_symbol** | `name`(string), `relative_path`(string), `content`(string) | 在符号后插入代码 |

**正确调用示例**：
```
run_mcp(serena, find_symbol, { name: "ScanRecordOrchestrator", relative_path: "backend/src" })
run_mcp(serena, find_referencing_symbols, { symbol_name: "productionOrderService", relative_path: "backend/src" })
```

**何时用 serena vs Grep**：
- 找符号定义/引用链/重载 → **serena**（语义级，精准）
- 找中文关键词/简单文本 → **Grep**（更快）

---

## 三、文件操作工具优先级

| 场景 | 优先工具 | 说明 |
|------|---------|------|
| 项目内文件读取 | **Read** / **Glob** | 不受 MCP 路径限制 |
| 项目内代码搜索 | **SearchCodebase** / **Grep** | 支持中文关键词，带行号 |
| 项目内文件修改 | **Edit** / **Write** | 直接修改 |
| 项目外文件读/写 | **mcp_Filesystem** | 仅限 `/Users/guojunmini4/Documents` 和 `Desktop` |
| 复杂文件操作 | **RunCommand** | bash 命令灵活处理 |

**铁律**：项目文件操作永远不调用 mcp_Filesystem，直接用原生工具。

---

## 四、MCP 调用失败自愈流程

当 MCP 返回 `Input validation error` 或 `server is not found` 时，按以下顺序自愈：

### Step 1：参数名错误（最常见）
检查：参数名是否与上表一致？常见错写：
- ❌ `uri` → ✅ `path` (Filesystem)
- ❌ `query` → ✅ `thought` (SequentialThinking)
- ❌ `library` → ✅ `libraryId` (context7)
- ❌ `container` → ✅ `name` (docker)
- ❌ `url` → ✅ 浏览器内部状态，通常 navigate 不需要参数

### Step 2：路径不在允许范围内（Filesystem）
- 检查 path 是否以 `/Users/guojunmini4/Documents` 或 `/Users/guojunmini4/Desktop` 开头
- 如果是 `/Volumes/macoo2/...`，改用 **原生 Read/Glob/LS**

### Step 3：Server 不可用
- 查"本机可用的 MCP Servers"列表
- 目标 server 不在列表中 → 改用替代方案（如用 `RunCommand` 替代 mcp_docker 等）

### Step 4：返回给用户的信息
- 如果自愈失败，明确告诉用户：尝试了 X 种参数名 / 路径方案，均失败
- 给出下一步建议（如"请确认 MCP server 是否已启用"或"改用 shell 命令执行"）

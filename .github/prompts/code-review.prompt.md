---
description: "AI 代码审查模板：架构合规、安全、性能、风格全面审查"
mode: "agent"
tools: ["semantic_search", "grep_search", "file_search", "read_file", "get_errors"]
---
# 代码审查模板

对指定文件或最近改动执行全面审查，按以下维度逐项检查。

## 审查维度

### 1. 架构合规
- [ ] Controller → Orchestrator → Service → Mapper 分层是否正确？
- [ ] Controller 是否直接调用多个 Service？（❌ 应通过 Orchestrator）
- [ ] Service 是否互相调用？（❌ 禁止）
- [ ] 多表写操作是否有 `@Transactional(rollbackFor = Exception.class)`？
- [ ] Orchestrator ≤150行 / Service ≤200行 / Controller ≤100行 / 页面 ≤400行？

### 2. 安全
- [ ] Controller class 是否有 `@PreAuthorize("isAuthenticated()")`？
- [ ] 权限码是否存在于 `t_permission` 表？
- [ ] 是否有 SQL 注入风险（裸字符串拼接 SQL）？
- [ ] 敏感信息（密码、密钥）是否泄漏到代码/日志？
- [ ] 租户隔离：查询是否包含 `tenantId` 条件？

### 3. 数据一致性
- [ ] Entity 字段 ↔ Flyway 脚本双向一致？
- [ ] NOT NULL 列是否有默认值或代码赋值？
- [ ] 统计计数 Long → int 转换（避免 JacksonConfig 序列化为 String）？
- [ ] `UserContext.tenantId()` → Long，`userId()` → String（类型正确）？

### 4. 前端规范
- [ ] 使用 `ResizableTable`（禁止裸 antd Table）？
- [ ] 弹窗尺寸仅用 60vw / 40vw / 30vw？
- [ ] 使用 `RowActions` 组件而非自定义操作列？
- [ ] 颜色使用 CSS 变量（业务风险色除外）？
- [ ] Hook ≤80行，组件 ≤200行？超出需拆分。

### 5. 可维护性
- [ ] 废弃 API（`@Deprecated`）是否有新引用？
- [ ] 是否有未处理的 TODO/FIXME？
- [ ] 是否有注释掉的代码块？
- [ ] 函数/方法体 ≤40行？

## 输出格式
按严重程度分类汇报：

| 严重程度 | 文件 | 行号 | 问题描述 | 建议修复 |
|----------|------|------|----------|----------|
| 🔴 CRITICAL | ... | ... | ... | ... |
| 🟠 WARNING | ... | ... | ... | ... |
| 🟡 INFO | ... | ... | ... | ... |

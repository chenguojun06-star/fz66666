## 📝 变更摘要

| 项目 | 说明 |
|-----|------|
| **变更主题** | <!-- 一句话描述，如"修复扫码撤回时工资已结算状态判断" --> |
| **影响模块** | <!-- 后端/前端/小程序/数据库，多选 --> |
| **风险等级** | <!-- 🔴 P0 / 🟡 P1 / 🟢 P2，参照 change-impact-matrix.md --> |
| **涉及 P0 铁律条数** | <!-- 本次变更触发了几条 P0 铁律（见 project_rules.md） --> |
| **新增文件数** | <!-- N 个 --> |
| **修改文件数** | <!-- N 个 --> |
| **数据库变更** | <!-- 是/否，如有则列出 Flyway 版本号 --> |
| **编译验证** | <!-- ✅ mvn compile / ✅ npx tsc --noEmit / ⏳ 待验证 --> |

---

## 变更描述

<!-- 简要描述本次变更的目的和内容 -->

## 变更类型

- [ ] 🐛 Bug 修复（不改变业务逻辑）
- [ ] ✨ 新功能（符合规则37 Spec-First 流程）
- [ ] 🔧 重构/优化（不改变业务逻辑）
- [ ] 🗃️ 数据库变更（Entity + Flyway + DbColumnRepairRunner 三层同步）

## 数据库变更检查（有 Entity/SQL 改动时必填）

- [ ] 新增 Entity 字段已同步写 Flyway 脚本
- [ ] Flyway 脚本使用 `SET @s = IF(EXISTS...)` 幂等写法，**不含 `COMMENT ''`**
- [ ] DbColumnRepairRunner 已同步添加 `add()` 调用
- [ ] 未修改任何已执行过的 Flyway 脚本文件内容

## 权限检查（有 Controller 改动时必填）

- [ ] Controller class 级别有 `@PreAuthorize("isAuthenticated()")`
- [ ] 方法级别**未加** `hasAuthority('XXX')` 权限码（规则11）
- [ ] 读操作有 `TenantAssert.assertTenantContext()`（规则6）
- [ ] 写操作有 `TenantAssert.assertBelongsToCurrentTenant()`（规则7）
- [ ] `getById` 有租户过滤（规则8）

## 前端检查（有前端改动时必填）

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run lint` → 0 errors
- [ ] 打印相关 `font-family` 以 `serif` 结尾（规则12）
- [ ] 弹窗使用 `ResizableModal`，表格使用 `ResizableTable`

## 🔍 变更影响分析

<!-- 对照 memory-bank/change-impact-matrix.md 评估 -->

- [ ] **扫码/工序/质检/入库链路**是否受影响？需要端到端测试吗？
- [ ] **API 路径或响应格式**是否变化？前端+小程序是否同步更新？
- [ ] **Entity 字段**是否变更？Flyway 脚本是否同步？
- [ ] **权限码**是否新增/修改？t_permission 表是否有对应记录？
- [ ] **多租户隔离**是否被破坏？所有查询都带 tenant_id 吗？
- [ ] **事务边界**是否正确？写操作都在 Orchestrator 层加了 @Transactional 吗？
- [ ] **打印组件**的 font-family 仍是 serif 结尾吗？

---

## 📋 修改文件清单

| 文件路径 | 操作（新增/修改/删除） | 变更性质 |
|---------|----------------------|---------|
| <!-- path/to/file --> | <!-- 新增/修改 --> | <!-- 数据库/业务逻辑/样式/文档 --> |
| | | |

---

## 📚 关联文档/决策

- 关联的 decisionLog.md 条目：<!-- 如有 -->
- 关联的 optimization-log：<!-- 如有 -->
- 本次是否需要更新 memory-bank：<!-- 是/否，如需要请列出更新的文件 -->

---

## 本地验证

- [ ] `mvn clean compile -q` → BUILD SUCCESS（有 Java 改动）
- [ ] `npx tsc --noEmit` → 0 errors（有 TypeScript 改动）
- [ ] 功能测试通过（扫码/下单/质检等核心流程）

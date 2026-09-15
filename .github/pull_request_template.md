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

## ⚠️ 隐性缺陷检查（构建绿 ≠ 功能对）

> 以下每一条都是本项目**真实踩过的坑**：编译、类型检查、CI 全部通过，但功能失效或静默出错。
> 自动化工具查不出来，只能靠人眼过一遍。

### 前端

- [ ] **表单控件在 `<Form>` 的子树内**（React 层级，不是 DOM 层级）
      D-419：把 `Form.Item` 写进 Table 的 columns，而 `<Form>` 放在 Table 外面当兄弟节点
      → 值不同步、`validateFields()` 取到 undefined，点保存必然失败。
      需要 Form 包住但不想多套 DOM 时，用 `<Form component={false}>`。
- [ ] **弹窗/侧滑用了统一组件**（`SideDrawer` / `ResizableModal`），没有自己造一套
- [ ] **没有新增硬编码颜色或 `!important`**（存量 940 个是历史债，只减不增）

### 后端

- [ ] **查询 filter 的常量值核对过实际落库值**
      D-417：`RecordLogDrawer` 的 `module`/`targetType` 按字段名想当然填写，
      实际一个不存在、一个是 null，后端 `wrapper.eq` 精确匹配 → **静默返回 0 条，不报错**。
      改这类 filter 前先查 `OperationLogAppendUtil.writeLog()` 与 `SystemOperationLogAspect.resolveModule()`。
- [ ] **类型改造后检查了截断点**（改数量/金额类型时必看）
      D-410：`Integer`→`BigDecimal` 编译全过，但 6 处 `coerceInt()` 截断没改，语义没通。
      自查：`grep -rnE "coerceInt|intValue\(\)|Math\.(floor|round)" <相关目录>`
- [ ] **异常没有被吞掉**（空 catch / `printStackTrace` 当前已清零，保持 0）
- [ ] **一次性闩锁有复位路径**（本项目高频缺陷模式）
      boolean / AtomicBoolean 标记置 true 后**永不复位**，容器重建或依赖闪断后功能永久失效。
      自查：grep 字段名，数一下有几处置 true、几处置 false —— **只有置 false 没有置 true 必是 bug**。

### 架构与提交

- [ ] **Controller 未直接依赖 Mapper**（ArchUnit 已卡，存量基线 47，只减不增）
- [ ] **commit 带了路径**（`git commit -o -- <paths>`）
      本项目多会话并发操作同一工作区，不带路径会把别人已暂存的改动一起提交。
- [ ] **没有用 `-DskipTests` 绕过门控**（绕过的门控比假绿灯更糟：连记录都不留）

---

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

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

## 本地验证

- [ ] `mvn clean compile -q` → BUILD SUCCESS（有 Java 改动）
- [ ] `npx tsc --noEmit` → 0 errors（有 TypeScript 改动）
- [ ] 功能测试通过（扫码/下单/质检等核心流程）

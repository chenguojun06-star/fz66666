## 📋 变更说明

**这个 PR 做了什么？**
<!-- 一句话描述这次变更的核心目的 -->


**影响范围**
<!-- 受影响的模块/页面/接口，打勾选择 -->
- [ ] 后端（Java / Orchestrator / Service / Entity）
- [ ] 前端（React 组件 / 页面 / 状态管理）
- [ ] 数据库（Entity 字段 / Flyway 脚本 / 表结构）
- [ ] 小程序
- [ ] CI/CD / 配置文件

---

## 🔍 代码审核检查清单

### 架构合规性
- [ ] 跨 Service 调用已通过 Orchestrator 编排（无 Controller 直调多 Service）
- [ ] 多表写操作已加 `@Transactional(rollbackFor = Exception.class)`
- [ ] 未在 Service 之间直接调用

### 数据库一致性（有 DB 改动时必填）
- [ ] 新增 Entity 字段已同步写 Flyway 脚本（`V{YYYYMMDDHHMM}__xxx.sql`）
- [ ] Flyway 脚本使用 INFORMATION_SCHEMA 幂等写法（不含 `COMMENT ''text''`，禁止直接 ALTER TABLE）
- [ ] 未修改任何已执行过的 Flyway 脚本文件内容

### 权限控制
- [ ] Controller class 级别有 `@PreAuthorize("isAuthenticated()")`
- [ ] 方法级别无重复 `@PreAuthorize`
- [ ] 新增权限码已在 `t_permission` 表中存在（无虚构权限码）

### 前端规范
- [ ] 弹窗只使用 60vw / 40vw / 30vw 三档尺寸
- [ ] 所有表格使用 `ResizableTable`，弹窗使用 `ResizableModal`
- [ ] 组件文件 ≤ 300 行，页面 ≤ 500 行（超出已拆分）

### 测试与验证
- [ ] 本地 `mvn clean compile -q` → BUILD SUCCESS（有 Java 改动）
- [ ] 本地 `npx tsc --noEmit` → 0 errors（有 TypeScript 改动）
- [ ] `git status` 已核对，所有文件已 `git add`

### 废弃代码清查
- [ ] 无 TODO / FIXME 注释未处理
- [ ] 无已废弃的注释代码块残留
- [ ] 无同步需要删除的旧逻辑（兼容代码、临时 hack）

---

## 🧪 测试验证

**本地测试方式**
<!-- 如何验证这次改动是正确的？ -->


**测试脚本**（如有）
```bash
# 例：./test-production-order-creator-tracking.sh
```

---

## 📎 相关链接

- 关联 Issue / 需求：
- 设计文档：
- 云端 SQL（如需手动执行）：

---

## ⚠️ 风险提示

**上线后是否需要手动执行 SQL？**
- [ ] 否（Flyway 自动执行）
- [ ] 是 → 请在下方贴出 SQL 并说明步骤：

```sql
-- 粘贴需要手动执行的 SQL
```

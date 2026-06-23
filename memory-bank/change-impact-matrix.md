# 变更影响矩阵（Change Impact Matrix）

> 每次修改代码前先查这个矩阵，评估影响范围
> 核心目标：防止"改一个字段，全链路崩"

---

## 📊 核心文件影响关系图

### 后端→前端→小程序 三级联动

| 修改项 | 可能影响的后端文件 | 可能影响的前端文件 | 可能影响的小程序文件 | 需同步的校验 |
|--------|-------------------|-------------------|-------------------|-------------|
| 新增 Flyway 列（ALTER TABLE） | Entity 字段 + Mapper + Service + Controller | TS类型定义 + API调用 + 页面展示 | API响应字段解析 | ✅ schema核对 ✅ 编译验证 ✅ 云端SQL |
| 修改 Entity 字段名 | Mapper XML + Service + Controller JSON | frontend types/*.ts + services/* | miniprogram utils/*.js | ✅ API字段对齐 ✅ 多端测试 |
| 修改 API 路径（POST /xxx） | Controller @RequestMapping | frontend services/* axios调用 | miniprogram utils/api.js | ✅ 全局grep路径 ✅ routeConfig同步 |
| 修改 API 响应字段 | Controller 返回值 + Result<T> | 前端所有用到该接口的组件 | 小程序所有用到该接口的页面 | ✅ 全链路搜索 ✅ 接口兼容性 |
| 扫码/工序/质检相关 | ScanRecordOrchestrator + Executors | 扫码页面 + 进度展示 | miniprogram/pages/scan/* | ✅ P0铁律 业务流程完整性 |
| 多租户 tenant_id | 所有涉及的Service + Mapper + Controller | 前端请求上下文 | 小程序登录态检查 | ✅ P0铁律 跨租户隔离 |
| 工资结算字段 | Payroll*Orchestrator + Controller | 财务模块页面 | miniprogram/pages/payroll/* | ✅ 工资已结算禁止撤回 |
| 权限码/角色 | t_permission表 + RoleController | 前端 permission.ts 检查 | miniprogram utils/permission.js | ✅ 不存在的权限码=全员403 |
| 打印组件（标签/水洗唛） | Print*Controller | safePrint.ts + 打印弹窗 | 小程序打印相关页面 | ✅ font-family以serif结尾 |
| 弹窗尺寸/设计系统 | 无后端影响 | design-system.css + ResizableModal + ModalContentLayout | styles/*.wxss | ✅ 60vw/40vw/30vw三级 |

---

## 🔴 P0 级变更识别清单

满足以下**任一条件**的变更 = P0级，必须执行完整三步验证：

| # | 判断条件 | 举例 | 必须做的验证 |
|---|---------|------|-------------|
| 1 | 修改了 `scan`/`scan_record`/`production_order` 表结构 | 扫码记录表加字段 | ✅ mvn compile ✅ 本地测扫码 ✅ 小程序同步测试 |
| 2 | 修改了 Controller 的 @RequestMapping 路径 | 从 `/api/v1/orders` 改成 `/api/production/orders` | ✅ 全局grep旧路径 ✅ 前端services全改 ✅ 小程序API路径 |
| 3 | 修改了 Entity 字段名或类型 | `orderNo: String` → `orderNumber: Long` | ✅ 前后端TS类型对齐 ✅ 数据库schema兼容 ✅ 小程序JSON解析 |
| 4 | 修改了权限码字符串 | `MENU_PRODUCTION` → `MENU_FACTORY` | ✅ t_permission表有对应记录 ✅ 前端permission.ts同步 ✅ 超管端测试 |
| 5 | 修改了事务边界（@Transactional位置） | Service加了@Transactional | ✅ 原子操作确认 ✅ 回滚场景测试 ✅ 并发场景 |
| 6 | 修改了 MCP resource provider 代码 | 知识库/记忆bank暴露接口 | ✅ 多租户隔离 ✅ 敏感数据屏蔽 ✅ 鉴权测试 |
| 7 | 修改了打印组件 font-family 或 CSS | 打印样式 sans-serif → serif | ✅ 本地打印预览 ✅ P0铁律检查 |

---

## 🟡 P1 级变更识别

| # | 判断条件 | 需做的验证 |
|---|---------|----------|
| 1 | 新增/修改前端页面组件 | ✅ npx tsc --noEmit ✅ 浏览器手动测试 |
| 2 | 修改 Service 层业务逻辑（非跨服务调用） | ✅ mvn compile ✅ 单元测试 |
| 3 | 修改 Flyway 迁移脚本（新增文件非修改已有） | ✅ 本地SQL执行 ✅ schema核对 |
| 4 | 修改 API 接口请求参数（不影响响应格式） | ✅ 前端传参同步 ✅ 类型定义更新 |

---

## 🟢 P2 级变更识别

| # | 判断条件 | 需做的验证 |
|---|---------|----------|
| 1 | 纯文档/注释修改 | 无代码验证 |
| 2 | README/使用说明更新 | 无代码验证 |
| 3 | 前端组件样式微调（不影响布局） | ✅ npx tsc --noEmit |

---

## 🔍 变更前必做检查（CHECKLIST）

每次动手改代码前，逐条过一遍：

- [ ] **1. 影响范围识别**：我要改的代码属于哪个模块（production/finance/warehouse/style/system/AI）？
- [ ] **2. P0铁律检查**：是否涉及扫码/工序/质检/入库/多租户/权限码/工资结算/打印字体？
- [ ] **3. 数据库同步**：改 Entity 字段 = 必须有 Flyway 脚本；改 Flyway = 必须同步 Entity
- [ ] **4. API 链路检查**：改 Controller 路径/响应格式 = 必须搜索前端和小程序所有调用点
- [ ] **5. 小程序同步**：PC端逻辑变动 = 检查 miniprogram/pages/* 是否有对应逻辑需要同步
- [ ] **6. 权限码核对**：新增权限码 = 检查 t_permission 表是否存在，前端 permission.ts 是否同步
- [ ] **7. 编译验证**：mvn compile ✅ + npx tsc --noEmit ✅ 两项都通过才能推进
- [ ] **8. 已执行的Flyway不修改**：确认要改的 V*.sql 是否已经在云端执行（已执行的禁止修改）

---

## 💡 典型高风险变更案例速查

### 案例1：扫码记录表加新字段
```
风险等级：🔴 P0
必须同步：
  1. Flyway: ALTER TABLE t_scan_record ADD COLUMN xxx
  2. Entity: ScanRecord.java 加对应字段 + getter/setter
  3. Service/Orchestrator: 扫码逻辑是否用到新字段
  4. 前端: types/production.ts 加字段定义
  5. 小程序: utils/api.js 解析 + pages/scan 展示
  6. 验证: 本地扫码流程完整测试
```

### 案例2：API 路径变更
```
风险等级：🔴 P0
必须做：
  1. Grep 旧路径: grep -rn "/api/v1/orders" frontend/ miniprogram/
  2. 前端: services/* 所有 axios 调用点更新
  3. 小程序: utils/api.js 所有 wx.request 调用点更新
  4. routeConfig.ts 检查是否有路径依赖
  5. 验证: 浏览器+小程序双端手动测试
```

### 案例3：权限码字符串修改
```
风险等级：🔴 P0
必须做：
  1. 查 t_permission 表: SELECT code FROM t_permission WHERE code LIKE '%XXX%'
  2. 查前端: frontend/src/utils/permission.ts 是否有对应检查
  3. 查小程序: miniprogram/utils/permission.js 是否有对应检查
  4. 验证: 超管端+普通用户端双端测试
```

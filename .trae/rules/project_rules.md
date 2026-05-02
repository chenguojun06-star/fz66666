# 项目核心铁律速查手册
> 提取自 `.github/copilot-instructions.md`（3261行）— 2026-05-02

---

## 🏗 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Spring Boot 3.4.5 + MyBatis-Plus + MySQL 8.0 |
| 前端 | React 18 + TypeScript + Ant Design 5.22 |
| 小程序 | 微信原生 + 共享 `miniprogram/shared/` 模块 |
| 数据库 | Docker `fashion-mysql-simple:3308` |
| 缓存 | Redis (Lettuce) |
| 消息 | WebSocket + STOMP |
| 部署 | 腾讯云 CloudBase + GitHub Actions CI/CD |

---

## 🔴 P0 铁律

### 1. 数据库变更必须 Flyway
- ✅ 所有 ALTER TABLE / ADD COLUMN / CREATE TABLE 通过 `V{timestamp}__{desc}.sql`
- ❌ 禁止手动 `docker exec mysql -e "ALTER TABLE..."`
- ❌ 禁止修改已执行的 V*.sql（checksum 校验失败 → 启动报错）
- ⚠️ **Flyway SET @s 陷阱**：动态 SQL 内禁止 `COMMENT 'xxx'` / `DEFAULT 'PENDING'` 等字符串字面量 → Flyway 把 `''` 当边界截断 SQL，静默失败
- ⚠️ **Flyway PREPARE + DEFAULT NULL 陷阱**：`PREPARE stmt FROM @s` 动态 SQL 中禁止写 `DEFAULT NULL`，MySQL 8.0 会报 `ERROR 1064 near 'NULL'` → 列实际未添加但 Flyway 可能记录成功 → 云端 500。正确做法：不写 DEFAULT（MySQL 默认即为 NULL），回填值用独立 UPDATE

### 2. 权限码必须真实存在
- ❌ 禁止使用 `t_permission` 表中不存在的权限码（导致全员 403）
- 实际存在的：`MENU_*`（菜单）、`STYLE_CREATE/DELETE`、`PAYMENT_APPROVE`、`MATERIAL_RECON_CREATE`、`SHIPMENT_RECON_AUDIT`
- ✅ class 级别设 `@PreAuthorize("isAuthenticated()")`，方法级别不重复

### 3. 事务仅 Orchestrator 层
- ✅ `@Transactional` 只在 Orchestrator
- ❌ Service 不加事务注解

### 4. 业务链路必须全链路校验
- 扫码/工序/质检/入库/PC端/小程序端，禁止只改一端
- 必须校验上下游数据一致性与工序依赖

### 5. 子工序→父节点映射优先级
- 模板 `progressStage` > `t_process_parent_mapping` DB 动态表 > 硬编码兜底
- 6 大固定父进度：采购→裁剪→二次工艺→车缝→尾部→入库

### 6. 多租户/多工厂数据隔离
- 所有查询必须加 tenantId + factoryId 条件
- 工厂工人只能看自己工厂的数据

---

## ✅ 强制规范

### 代码质量

| 类型 | 绿色目标 | 红色禁止 |
|------|---------|---------|
| React 组件 | ≤200行 | >300行 |
| React 页面 index | ≤400行 | >500行 |
| 自定义 Hook | ≤80行 | >150行 |
| Java Orchestrator | ≤150行 | >200行 |
| Java Service | ≤200行 | >300行 |
| Java Controller | ≤100行 | >150行 |
| 单方法/函数体 | ≤40行 | >50行 |

### 前端组件（强制使用）

| 必须用 | 禁止用 |
|--------|--------|
| `ResizableTable` | antd `Table`（缺少列宽拖拽） |
| `RowActions`（最多1主按钮） | 自定义操作列 |
| `ResizableModal`（60/40/30vw） | 自定义弹窗尺寸 |
| `ModalContentLayout` + `ModalFieldRow` | 自定义表单布局 |
| `ModalHeaderCard`（#f8f9fa） | 自定义头部样式 |
| CSS 变量颜色 | 硬编码颜色（业务风险色除外） |
| 小程序 `styles/.wxss` | 页面内重复定义同名类 |

### 弹窗三级尺寸

| 尺寸 | 场景 | 规则 |
|------|------|------|
| 60vw | 复杂表单/多Tab/表格 | **必须传 `initialHeight={Math.round(window.innerHeight * 0.82)}`** |
| 40vw | 普通表单 | 默认高度即可 |
| 30vw | 确认对话框 | 默认高度即可 |

### API 规范
- ❌ 旧 GET 查询：`GET /by-xxx/{id}` → ✅ `POST /list` + 过滤参数
- ❌ 旧状态流转：`POST /{id}/submit` → ✅ `POST /{id}/stage-action?action=xxx`
- ❌ 旧 CRUD：`POST /save` → ✅ RESTful（`POST /`、`DELETE /{id}`）

### 小程序共享样式
- `app.wxss`：全局样式（空状态、筛选区、搜索行）自动生效
- `styles/design-tokens.wxss`：CSS 变量
- `styles/modal-form.wxss`：弹窗表单
- `styles/page-utils.wxss`：加载更多、Tag 标签
- ❌ 禁止页面内重复定义同名 .wxss 类

### 测试要求
- Orchestrator：**100% 覆盖率**（强制）
- Service：70%+（推荐）
- Entity：不要求

### 跨端验证
- `validationRules.ts`（PC）与 `validationRules.js`（小程序）必须同步修改

---

## ⚠️ 常见陷阱 TOP 15

| # | 陷阱 | 预防 |
|---|------|------|
| 1 | 改业务只改一端 → 断链 | 全链路校验上下游 |
| 2 | 使用不存在的权限码 → 403 | 确认 `t_permission` 表实际存在 |
| 3 | Docker MySQL 端口 3308 非 3306 | 检查端口 |
| 4 | 使用 `@Deprecated` API | 全部用 POST/list + stage-action |
| 5 | 弹窗尺寸不统一 | 只用 60/40/30vw |
| 6 | Service 直接互调 | 必须通过 Orchestrator |
| 7 | 修改防重复扫码算法 | 不改 minInterval 逻辑 |
| 8 | 改 validationRules 不同步两端 | PC+小程序同步 |
| 9 | MySQL UTC vs JVM CST 时区差8h | 测试数据用 `CONVERT_TZ(NOW(),'+00:00','+08:00')` |
| 10 | 工资已结算扫码撤回 | `payrollSettled=true` 时拒绝 |
| 11 | Flyway Silent Failure（SET @s + COMMENT） | 不写字符串字面量在动态SQL中 |
| 12 | JacksonConfig Long→String 导致计数拼接 | 计数返回 int；前端 `Number()` 包裹 |
| 13 | 修改已执行 Flyway V*.sql | checksum 失败 → 启动不了 |
| 14 | VIEW 修改只改 ViewMigrator 不改 Flyway | 云端 Flyway 执行，ViewMigrator 云端不跑 |
| 15 | request_id 超 VARCHAR(64) | 紧凑格式 |
| 16 | Flyway PREPARE + DEFAULT NULL 报错 | 动态SQL中不写 `DEFAULT NULL`，MySQL默认即NULL |

---

## 🔧 关键案例 & 修复模式

### 模式 #1：Flyway `SET @s` 静默失败（最危险）

**症状**：Flyway 执行成功，`flyway_schema_history` 记录成功标记，但列实际不存在于云端 DB。本地没问题，云端 HTTP 500。

**根因**：Flyway SQL 解析器把动态 SQL 内的 `''` 当字符串结束符：

```sql
-- ❌ 错误：第一个 '' 被 Flyway 当结束符，ALTER TABLE 被截断
SET @s = IF(..., 'ALTER TABLE t_xxx ADD COLUMN status VARCHAR(20) DEFAULT ''PENDING''', ...);
PREPARE stmt FROM @s;  -- 执行的是截断后的垃圾
```

**正确做法**：
```sql
-- ✅ 动态 SQL 内只用 DEFAULT NULL / DEFAULT 0，不含 '' 字符串字面量
ALTER TABLE t_xxx ADD COLUMN status VARCHAR(20) DEFAULT NULL;

-- ✅ 回填值用独立 UPDATE（在动态 SQL 外部）
UPDATE t_xxx SET status = 'PENDING' WHERE status IS NULL;
```

> 曾触发案例：`factory_type`、`repair_status` 两条列因 Flyway Silent Failure 从未添加到云端，导致铃铛任务面板 + 首页统计反复 500

---

### 模式 #2：云端 Schema 漂移 — 双路径防御

**症状**：本地开发正常，部署云端后热点接口大量 500 + Unknown column 日志风暴

**策略**：不只修 Flyway（根源），还加**代码防御 select（双保险）**

```
阶段一（🩹 热修）：代码层最小字段 select
  → CuttingTaskServiceImpl: 改为显式 select 核心字段
  → ProductWarehousingOrchestrator: 走 QueryWrapper + listMaps 绕开实体映射
  → 效果：即使 DB 列补库需重启才生效，热点入口也不 500

阶段二（🔧 根源）：Flyway 补列 + 移除防御临时代码
```

**核心原则**：云端即使有历史结构债，**热点入口不能先崩**

---

### 模式 #3：request_id 超 VARCHAR(64)

**症状**：`ORDER_OP:{action}:{orderId}:{uuid}` 超过 64 字符导致 INSERT 失败

**修复**：紧凑格式，保留语义前缀：
```
✅ ORDER_OP/ORDER_ADVANCE/ORDER_ROLLBACK/ORCH_FAIL + 紧凑ID
❌ 全路径带UUID拼接
```

---

### 模式 #4：VIEW 修改 — Flyway vs ViewRepair 区别

| 路径 | 云端执行 | 本地执行 |
|------|:--:|:--:|
| Flyway V*.sql `CREATE OR REPLACE VIEW` | ✅ | ✅ |
| ViewMigrator.java | ❌ 不跑 | ✅ |
| DbViewRepairHelper.java | ❌ 不跑 | ✅ |

**结论**：VIEW 修改必须走 Flyway 迁移脚本，不能只改 ViewMigrator/DbViewRepair — 否则本地好云端坏。

---

### 模式 #5：本地 `ALTER TABLE` 无 Flyway → 云端下单 500

**经典案例**：`progress_workflow_json` 等 5 个字段本地手动 ALTER TABLE 添加，未写 Flyway。`grep -r "progress_workflow" db/migration/` → 零结果。云端 DB 无此列 → `INSERT` 报 `Unknown column` → `@Transactional` 内异常冒泡 → 全局异常兜底 500。

**教训**：本地加字段再方便也**必须先写 Flyway 迁移**，检查命令：
```bash
grep -r "${新列名}" db/migration/  # 必须有结果
```

---

### 模式 #6：子工序硬编码 vs 动态映射（本次修复）

**架构原则**：6 大固定父节点 + 子工序动态映射

```
扫码工序名 → ProcessParentNodeResolver
  ├── progressStage（模板配置，最高优先）
  ├── ProcessSynonymMapping（父节点同义词）
  └── t_process_parent_mapping（DB 动态映射，管理员可随时增改）
```

**不该做的**：在多处硬编码子工序关键词 → 有人加"激光切割→二次工艺"到 DB，硬编码数组不认识

**正确做法**：SQL VIEW 用 `EXISTS (SELECT 1 FROM t_process_parent_mapping ...)` 动态关联，不再写 `LIKE '%绣花%'`

---

## 🚀 推送前三步验证

```bash
# 1. 编译
cd backend && mvn clean compile -q    # BUILD SUCCESS
cd frontend && npx tsc --noEmit       # 0 errors

# 2. git 全量检查
git status && git diff --stat HEAD
git add <每个文件路径>           # ❌ 禁止 git add .
git diff --cached --stat

# 3. 数据库检查（有 Entity/表结构改动时）
./scripts/pre-push-checklist.sh --schema-confirmed
# 新增 Entity 字段 → 必须有 Flyway
# 新增 Flyway → 必须有 Entity 字段
```

---

## 📊 架构统计

- 编排器总数：**158**
- 模块分布：intelligence(64) > production(24) > finance(18) > system(15)
- API 端点：ProductionOrderController(8) / StyleInfoController(23,待拆分)
- 待优化大文件：OrderManagement(2120行) / MaterialPurchase(1690行) / ProgressDetail(1670行)

---

## 🔗 关键文档

- `.github/copilot-instructions.md` — 完整原文（3261行）
- `系统状态.md` — 系统概览
- `开发指南.md` — 开发规范
- `设计系统完整规范-2026.md` — 前端设计 v3.0
- `docs/小程序开发完整指南.md` — 小程序规范
- `docs/客户傻瓜式开通与数据迁移SOP.md` — 运维手册

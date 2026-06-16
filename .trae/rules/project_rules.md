# 项目铁律速查（唯一真相源）

> 合并自 project_rules.md + 开发必读项.md + DATA_SAFETY_CHECKLIST.md
> 最后更新：2026-06-11
> **任何修改前必须对照此文件检查！**

---

## 开发环境

| 项目 | 值 |
|------|-----|
| 后端端口 | **8088** |
| 前端端口 | 5173（dev） |
| Docker MySQL | 3308 |
| 测试账号 | lilb / 123456（东方制衣厂） |

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Spring Boot 3.4.5 + MyBatis-Plus + MySQL 8.0 |
| 前端 | React 18 + TypeScript + Ant Design 5.22 |
| 小程序 | 微信原生 + 共享 `miniprogram/shared/` 模块 |
| 缓存 | Redis (Lettuce) |
| 部署 | 腾讯云 CloudBase + GitHub Actions CI/CD |

---

## P0 铁律（违反必出事故）

### 1. 数据库变更必须 Flyway

- ✅ 所有 ALTER/CREATE 通过 `V{timestamp}__{desc}.sql`
- ❌ 禁止手动 `docker exec mysql -e "ALTER TABLE..."`
- ❌ 禁止修改已执行的 V*.sql（checksum 校验失败 → 启动报错）
- ❌ SET @s 动态 SQL 内禁止 `COMMENT ''xxx''` / `DEFAULT ''字符串''`（Flyway 静默失败）
- ❌ PREPARE + DEFAULT NULL（MySQL 8.0 报 ERROR 1064）
- ✅ 推送前必须跑 `python3 scripts/check-flyway-sql.py`

### 2. 事务仅 Orchestrator 层

- ✅ `@Transactional` 只在 Orchestrator
- ❌ Service 禁止加 `@Transactional`（特例需注释原因）
- ❌ Service 禁止互调，必须通过 Orchestrator
- ❌ Controller 禁止调用多个 Service

### 3. 权限码必须真实存在

- ❌ 禁止使用 `t_permission` 表中不存在的权限码（导致全员 403）
- ✅ class 级别设 `@PreAuthorize("isAuthenticated()")`，方法级别不重复

### 4. 多租户数据隔离

- ✅ 任何查询必须有 `tenant_id` 条件
- ✅ 任何新增必须有 `tenant_id` 赋值
- ✅ 使用 `TenantAssert.requireTenantId()`
- ❌ 绝对禁止任何不带 `tenant_id` 的全表查询
- ❌ 绝对禁止跨租户数据访问

### 5. 业务链路必须全链路校验

- 扫码/工序/质检/入库/PC端/小程序端，禁止只改一端
- 子工序→父节点映射优先级：模板 `progressStage` > `t_process_parent_mapping` > 兜底
- 工序节点名禁止硬编码，必须通过 `ProductionScanStageSupport` 集中校验

### 6. 扫码核心链路禁止随意改动

- ❌ 禁止修改防重复扫码算法（minInterval）
- ❌ 禁止修改二维码解析逻辑
- ❌ 禁止修改3大Executor核心逻辑
- ✅ 入库扫码强制选仓库

### 7. 工资结算核心规则

- ✅ `operator_id` 决定工资归属
- ✅ 外发任务 `operator_id` 为 null，不计入内部工资
- ❌ 工资已结算禁止扫码撤回（`payrollSettled=true` 时拒绝）

### 8. 部署白屏防护

- ✅ 错误恢复代码必须内联在 index.html `<head>` 中
- ✅ nginx @spa_fallback 对 JS/CSS 返回 404，不返回 index.html
- ✅ try_files 去掉 `$uri/`，确保根路径走 no-cache 头

### 9. 自定义Hook返回值必须稳定

- ✅ Hook返回对象必须用 `useMemo` 包裹
- ✅ Hook返回函数必须用 `useCallback` 包裹
- ✅ mount-only useEffect 必须加 ref 守卫
- ❌ 禁止 useEffect 依赖裸函数/裸对象

### 10. 上下文必须维护

- ✅ 每次对话开始前，必须读取 `memory-bank/`
- ✅ 对话结束时，必须更新 activeContext.md + progress.md
- ❌ 禁止推送含 TODO/FIXME 标记或未处理兼容代码的变更

### 11. 容器内禁止使用 localhost（INC-20260611-001 血的教训）

- ✅ 容器内网络目标必须用 `127.0.0.1`，不用 `localhost`
- ✅ HEALTHCHECK 用 `127.0.0.1`
- ✅ 代理/转发配置用 `127.0.0.1`
- ❌ 禁止容器内使用 `localhost`（IPv6/IPv4 解析不可预测，Ubuntu 24.04 默认 IPv6 优先）
- ❌ 禁止不必要的代理层（socat 等），Spring Boot 直接监听 PORT 环境变量

### 12. CI/CD 部署禁止更换部署方式（INC-20260614 血的教训）

- ✅ 部署必须使用 `TencentCloudBase/cloudbase-action@v2`，配置如下：
  ```yaml
  - name: 部署到腾讯云 CloudBase
    uses: TencentCloudBase/cloudbase-action@v2
    with:
      secretId: ${{ secrets.CLOUDBASE_SECRET_ID }}
      secretKey: ${{ secrets.CLOUDBASE_SECRET_KEY }}
      envId: ${{ secrets.CLOUDBASE_ENV_ID }}
  ```
- ❌ 禁止改用 `tcb framework deploy` 直接调用（缺少认证，CI 环境无法交互登录）
- ❌ 禁止改用 `tcb login` + `tcb framework deploy`（认证不稳定）
- ❌ 禁止修改 `.github/workflows/ci.yml` 中的部署步骤，除非用户明确要求
- ❌ 禁止添加 `npm install -g @cloudbase/cli` 等 CLI 安装步骤（action 内部已包含）

---

## 代码薄原则（强制上限）

| 类型 | 上限 | 红线 |
|------|------|------|
| React 页面 index.tsx | ≤300行 | >400行 |
| React 组件 | ≤150行 | >200行 |
| 自定义 Hook | ≤60行 | >80行 |
| Java Orchestrator | ≤120行 | >150行 |
| Java Service | ≤150行 | >200行 |
| Java Controller | ≤80行 | >100行 |
| 单方法/函数体 | ≤25行 | >40行 |

---

## 前端强制规范

### 组件（必须用 / 禁止用）

| 必须用 | 禁止用 |
|--------|--------|
| `ResizableTable` | antd `Table` |
| `RowActions`（最多1主按钮） | 自定义操作列 |
| `ResizableModal`（60/40/30vw） | 自定义弹窗尺寸 |
| `ModalContentLayout` + `ModalFieldRow` | 自定义表单布局 |
| `ModalHeaderCard` | 自定义头部样式 |
| CSS 变量颜色 | 硬编码颜色（业务风险色除外） |

### 弹窗尺寸

| 尺寸 | 宽度 | 场景 | 高度规则 |
|------|------|------|---------|
| sm | 30vw | 确认对话框 | 默认 |
| md | 40vw | 普通表单 | 默认 |
| lg | 60vw | 复杂表单/多Tab | **必须传 `initialHeight={Math.round(window.innerHeight * 0.82)}`** |

### 全局表格样式禁止擅自修改

- ❌ 禁止未经用户明确要求修改 global.css / design-system.css 中的表格 CSS 变量
- ✅ 仅在用户明确说"表格行高太高/太低"等指令时才可修改

---

## API 规范

| 旧式（禁止新增） | RESTful（必须使用） |
|-----------------|-------------------|
| `GET /by-xxx/{id}` | `POST /list` + 过滤参数 |
| `POST /{id}/submit` | `POST /{id}/stage-action?action=xxx` |
| `POST /save` | `POST /`（新建）+ `PUT /{id}`（更新） |

---

## 小程序共享规则

- ✅ 颜色/尺码分布必须复用 `buildColorSizeMatrix`
- ✅ 校验规则与PC端同步：`validationRules.js` ↔ `validationRules.ts`
- ✅ 共享样式用 `styles/.wxss`，禁止页面内重复定义同名类

---

## VIEW 修改规则

| 路径 | 云端执行 | 本地执行 |
|------|:--:|:--:|
| Flyway V*.sql `CREATE OR REPLACE VIEW` | ✅ | ✅ |
| ViewMigrator.java | ❌ 不跑 | ✅ |
| DbViewRepairHelper.java | ❌ 不跑 | ✅ |

**结论**：VIEW 修改必须走 Flyway，不能只改 ViewMigrator/DbViewRepair。

---

## 云端兼容性陷阱

### System.getenv() 云端返回 null

```java
// ❌ 本地正常，云端 NPE
String apiUrl = System.getenv().getOrDefault("KEY", "default");
// ✅ 始终安全
String value = System.getenv("KEY");
String apiUrl = value != null ? value : "default";
```

### MySQL TINYINT(1) 驱动类型差异

```java
// ❌ 云端 Connector/J 8.x 抛 ClassCastException
Integer success = (Integer) row.get("success");
// ✅ 兼容所有驱动版本
Object successObj = row.get("success");
Integer success = null;
if (successObj instanceof Boolean) { success = ((Boolean) successObj) ? 1 : 0; }
else if (successObj instanceof Integer) { success = (Integer) successObj; }
else if (successObj instanceof Number) { success = ((Number) successObj).intValue(); }
```

### Flyway 10.x 版本号格式

- ✅ 纯数字：`V1__xxx.sql`、`V20260222__xxx.sql`
- ✅ 点号分隔：`V20260222.01__xxx.sql`
- ❌ 字母后缀：`V20260222b__xxx.sql`（BigInteger 解析失败 → 迁移被跳过）
- ❌ `sql-migration-version-format` 属性已被 Flyway 10.x 移除，配置无效

### Java 静态 Map 重复 key

- ❌ `Map.of("裁床", "cutting", "裁床", "cutting_table")` → 类初始化失败 → 启动失败
- ✅ 每个 key 唯一

### jwt-secret 无默认值

- ❌ `jwt.secret: ${JWT_SECRET:}` → 环境变量未设置时启动失败
- ✅ `jwt.secret: ${JWT_SECRET:ThisIsA_LocalJwtSecret_OnlyForDev_0123456789}`

### MySQL 8.0 不支持 MariaDB 语法（P0 血的教训 2026-06-15）

```sql
-- ❌ MySQL 8.0 不支持，语法错误 → Flyway 迁移失败 → Unknown column → 500
ALTER TABLE t_xxx ADD COLUMN IF NOT EXISTS new_col VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_xxx ON t_xxx(col);

-- ✅ 用 information_schema + 存储过程实现幂等
DROP PROCEDURE IF EXISTS _add_columns;
DELIMITER //
CREATE PROCEDURE _add_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_xxx' AND COLUMN_NAME='new_col') THEN
        ALTER TABLE t_xxx ADD COLUMN new_col VARCHAR(100) DEFAULT NULL COMMENT '说明';
    END IF;
END //
DELIMITER ;
CALL _add_columns();
DROP PROCEDURE IF EXISTS _add_columns;
```

**关键规则**：
- ❌ 禁止在 Flyway SQL 中使用 `IF NOT EXISTS`（ADD COLUMN / CREATE INDEX）
- ✅ 必须用 `information_schema` 查询 + 存储过程实现幂等
- ✅ 写完 Flyway 后必须本地验证：`mvn compile` → 检查 `flyway_schema_history` 中 `success=1`
- ✅ 新增 Entity 字段后，必须确认对应 Flyway 迁移已成功执行

### Flyway 迁移失败后必须修复 flyway_schema_history

- Flyway 迁移失败会在 `flyway_schema_history` 中插入 `success=0` 的记录
- 后续迁移会被阻塞（Flyway 拒绝执行失败版本之后的迁移）
- ✅ 修复步骤：1) 删除 `success=0` 的记录 2) 修复 SQL 3) 手动执行 ALTER TABLE 4) 插入 `success=1` 的记录
- ❌ 禁止忽略 `success=0` 的记录直接重启（会导致数据不一致）

### antd 5.x 废弃 API 替换

- ❌ `Descriptions` 的 `contentStyle` → 废弃警告
- ✅ 使用 `styles={{ content: {...} }}` 替代
- ❌ `Table` 的 `columns` 中 `render` 返回非 ReactNode → 控制台警告
- ✅ 确保所有 `render` 返回 `ReactNode | null`

---

## 常见陷阱 TOP 15

| # | 陷阱 | 预防 |
|---|------|------|
| 1 | 改业务只改一端 → 断链 | 全链路校验上下游 |
| 2 | 使用不存在的权限码 → 403 | 确认 `t_permission` 表实际存在 |
| 3 | Docker MySQL 端口 3308 非 3306 | 检查端口 |
| 4 | Flyway SET @s + COMMENT | 不写字符串字面量在动态SQL中 |
| 5 | 修改已执行 Flyway V*.sql | checksum 失败 → 启动不了 |
| 6 | VIEW 只改 ViewMigrator 不改 Flyway | 云端 Flyway 执行，ViewMigrator 云端不跑 |
| 7 | 本地 ALTER TABLE 无 Flyway | 云端 Unknown column → 500 |
| 8 | 部署后全站 404 白屏 | 错误恢复代码必须内联在 index.html `<head>` 中 |
| 9 | Hook返回裸对象/裸函数 → 无限循环 | Hook返回值必须 useMemo/useCallback 包裹 |
| 10 | JacksonConfig Long→String 计数拼接 | 计数返回 int；前端 `Number()` 包裹 |
| 11 | **MySQL 8.0 不支持 `IF NOT EXISTS`**（ADD COLUMN/CREATE INDEX） | 用 `information_schema` + 存储过程实现幂等 |
| 12 | **Flyway 迁移 `success=0` 阻塞后续迁移** | 写完必须验证 `flyway_schema_history` 中 `success=1` |
| 13 | **新增 Entity 字段但 Flyway 未执行** → Unknown column 500 | 推送前 `grep -r "新列名" db/migration/` 必须有结果 |
| 14 | **antd `contentStyle` 废弃** → 控制台警告刷屏 | 用 `styles={{ content: {...} }}` 替代 |
| 15 | **容器内 `localhost` 解析为 IPv6** → 502 | 容器内网络目标必须用 `127.0.0.1` |

---

## 推送前四步验证

```bash
# 1. 编译
cd backend && mvn clean compile -q    # BUILD SUCCESS
cd frontend && npx tsc --noEmit       # 0 errors

# 2. Flyway SQL 校验（P0 强制）
python3 scripts/check-flyway-sql.py

# 3. Flyway 迁移执行验证（P0 强制，新增 2026-06-15）
#    确认新迁移已成功执行，避免 Unknown column 500
docker exec fashion-mysql-simple mysql -u root -p<password> fashion_supplychain \
  -e "SELECT version, success FROM flyway_schema_history WHERE version='<新版本号>'"
#    success 必须为 1，否则修复后再推送

# 4. git 全量检查
git status && git diff --stat HEAD
git add <每个文件路径>           # ❌ 禁止 git add .

# 5. 数据库检查（有 Entity/表结构改动时）
grep -r "${新列名}" db/migration/  # 必须有结果
```

---

## 架构统计

- 编排器总数：**158**
- 模块分布：intelligence(64) > production(24) > finance(18) > system(15)
- 待优化大文件：OrderManagement(2120行) / MaterialPurchase(1690行) / ProgressDetail(1670行)

---

## 关键文档索引

- `agent-workflow.md` — 智能体驱动开发7步流程
- `xiaoyun-ai-inventory.md` — 小云AI全量系统清单
- `thick-methods-backlog.md` — 全系统拆薄记录
- `设计风格规范.md` — UI设计规范（Impeccable + Taste Skill）
- `memory-bank/` — 项目记忆（activeContext + progress + decisionLog）
- `.github/agents/` — Agent角色定义

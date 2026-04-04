---
applyTo: "backend/**"
---

# 后端开发域指令（backend/**）

> 本文件仅在编辑 `backend/` 目录下文件时自动激活，补充主指令中的后端专属约束。

---

## 四层架构（绝对不可破坏）

```
Controller → Orchestrator → Service → Mapper
```

- **Controller**：路由端点，class 级 `@PreAuthorize("isAuthenticated()")`，方法级不重复。≤ 100 行。
- **Orchestrator**：跨服务编排 + `@Transactional(rollbackFor = Exception.class)`。≤ 150 行，单方法 ≤ 40 行。
- **Service**：单领域 CRUD，**禁止互调其他 Service**。≤ 200 行。
- **Mapper**：MyBatis-Plus 数据访问，优先 `LambdaQueryWrapper` 而非 `@Select` 手写 SQL。

### 何时新建 Orchestrator

| 场景 | 需要？ |
|------|--------|
| 单表 CRUD，无跨服务 | ❌ Service |
| 读 ≥2 个 Service 拼装 | ✅ |
| 写操作涉及 ≥2 张表 | ✅（必加 `@Transactional`） |
| 状态流转 + 审计日志 | ✅ |
| 第三方 API + 本地更新 | ✅ |

---

## 权限码安全

- 权限码**只能**引用 `t_permission` 表已存在的值。
- 已有：`MENU_*`、`STYLE_CREATE`、`STYLE_DELETE`、`PAYMENT_APPROVE`、`MATERIAL_RECON_CREATE`、`SHIPMENT_RECON_AUDIT`、`INTELLIGENCE_MONTHLY_VIEW`。
- 虚构权限码 → **全员 403**（P0 事故）。
- 超管专属端点：`@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")`。

---

## 类型安全核查表

| 方法 | 返回类型 | 常见错误 |
|------|---------|---------|
| `UserContext.tenantId()` | **Long** | ❌ `String` |
| `UserContext.userId()` | **String** | ❌ `Long` |
| `UserContext.factoryId()` | **String** | ❌ `Long` |
| `o.getOrderQuantity()` | **Integer** | ❌ `int`（NPE） |
| `o.getProductionProgress()` | **Integer** | ❌ 未判空参与运算 |

---

## REST API 路由约定

- 列表查询：`POST /list`（旧 `GET/POST /page` 已废弃）
- 状态流转：`POST /{id}/stage-action?action=xxx`
- 统一响应：`Result.success(data)` / `Result.error("message")`
- 前端 axios 拦截器自动解包 `data`。

---

## Entity 与数据库一致性（P0）

- 新增 Entity 字段 → 必须同时新增 Flyway `V*.sql` 脚本。
- 新增 Flyway 列 → 必须有对应 Entity 字段（双向核查）。
- `NOT NULL` 列必须有 `DEFAULT` 值或代码赋值（MySQL STRICT 模式下 null → 500）。
- **禁止** `@TableField(exist=false)` transient 字段 + 关联查询填充。

---

## JacksonConfig 统计计数陷阱

全局 `Long → ToStringSerializer`（防 JS 18 位精度溢出）会把统计数字序列化为字符串。

```java
// ❌ 返回 Long → 前端 "91" + "8" = "918"
map.put("overdueCount", overdueCount);

// ✅ 转为 int 规避序列化
map.put("overdueCount", (int) overdueCount);
```

---

## 工资已结算扫码记录禁止撤回

```java
if (scanRecord.getPayrollSettled()) {
    throw new BusinessException("该扫码记录已参与工资结算，无法撤回");
}
// 撤回 + 库存回滚 → 同一 @Transactional
```

---

## 测试覆盖率目标

| 层次 | 覆盖率 | 备注 |
|------|--------|------|
| Orchestrator | **100%** | 强制 |
| Service | 70%+ | 推荐 |
| Entity | 不要求 | Getter/Setter 无价值 |

---

## 数据库连接

- 端口 **3308**（非 3306），容器 `fashion-mysql-simple`。
- 环境变量：`.run/backend.env`。
- MySQL UTC vs JVM CST+8：手动插测试数据用 `CONVERT_TZ(NOW(),'+00:00','+08:00')`。

---

## 云端与 Flyway

- `FLYWAY_ENABLED=true`（cloudbaserc.json），push main 后 Flyway 自动执行。
- 本地 `FLYWAY_ENABLED=false`，由 `DbColumnRepairRunner` 启动自愈。
- **铁则**：禁止修改已执行过的 `V*.sql` 文件内容 → checksum 不匹配 → 全 API 500。

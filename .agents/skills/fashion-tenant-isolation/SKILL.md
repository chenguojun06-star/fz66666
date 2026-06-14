---
name: fashion-tenant-isolation
description: 服装供应链系统多租户与数据权限隔离规范。当编写涉及数据查询（SQL/Mapper/Service/Orchestrator）、用户身份处理、工厂/团队数据过滤、权限校验、跨租户接口时必须遵循。违反会导致跨租户数据泄露（P0 级安全事故）。
version: 1.0.0
---

# 多租户隔离与数据权限（P0 强制执行）

> 本 skill 浓缩自 `docs/租户隔离与数据一致性规范.md` + `开发指南.md` 权限章节。

## 1. 核心铁律

> **所有查询必须带 `tenant_id`，没有 tenant_id 的查询 = 跨租户数据泄露 = P0 级事故**

```java
// ❌ 禁止：无 tenant_id 的查询（泄露所有租户数据）
lambdaQuery().eq(MaterialPurchase::getOrderNo, orderNo).list();

// ✅ 正确：必须带 tenant_id
lambdaQuery()
    .eq(MaterialPurchase::getTenantId, tenantId)
    .eq(MaterialPurchase::getOrderNo, orderNo)
    .list();
```

## 2. 身份获取

```java
Long tenantId = UserContext.tenantId();   // 当前租户
Long userId = UserContext.userId();        // 当前用户
String factoryId = UserContext.factoryId(); // 当前工厂

// 关键路径强制断言（无 tenantId 直接抛异常）
TenantAssert.requireTenantId();
```

## 3. 4 层数据权限（基于 t_role.data_scope）

```
┌─ ALL（总部管理员）factory_id=NULL ── 看所有工厂 ─┐
│  ┌─ FACTORY_ONLY（工厂管理员）factory_id='工厂A' ─┐
│  │  ┌─ TEAM（组长）── 看本团队 ─┐                │
│  │  │  ┌─ OWN（员工）── 看自己 ─┐               ││
│  │  │  └────────────────────────┘              ││
│  │  └────────────────────────┘                  ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

| data_scope | factory_id | 可见范围 | 过滤条件 |
|-----------|-----------|---------|---------|
| `ALL` | NULL | 所有工厂 | 不过滤 |
| `FACTORY_ONLY` | '工厂A' | 仅本工厂 | `WHERE factory_id = ?` |
| `TEAM` | - | 本团队 | `WHERE team_id = ?` |
| `OWN` | - | 自己 | `WHERE operator_id = ?` |

### 权限注入流程
```
登录 → TokenAuthFilter 注入 authority：
  1. ROLE_${roleName}（如 ROLE_manager）
  2. 租户主账号 → 额外 ROLE_tenant_owner
  3. 超管 → 额外 ROLE_SUPER_ADMIN
  4. PermissionCalculationEngine 从 t_permission 读权限码
```

## 4. SQL 过滤模板

### 4.1 简单查询（Service 层）
```java
public List<Order> listByFactory(String factoryId, Long tenantId) {
    return lambdaQuery()
        .eq(Order::getTenantId, tenantId)        // 必须
        .eq(factoryId != null, Order::getFactoryId, factoryId)  // 工厂过滤
        .eq(Order::getDeleteFlag, 0)              // 逻辑删除
        .list();
}
```

### 4.2 自定义 SQL（Mapper XML）
```xml
<select id="selectByOrderNo" resultType="Order">
    SELECT * FROM t_order
    WHERE order_no = #{orderNo}
      AND tenant_id = #{tenantId}        <!-- 必须 -->
      AND delete_flag = 0
      <if test="factoryId != null">
        AND factory_id = #{factoryId}    <!-- 工厂过滤 -->
      </if>
</select>
```

### 4.3 跨表关联（Orchestrator 层）
```java
@Transactional(rollbackFor = Exception.class)
public OrderDetailVO getOrderDetail(Long orderId) {
    Long tenantId = UserContext.tenantId();
    TenantAssert.requireTenantId();

    Order order = orderService.getByIdAndTenant(orderId, tenantId);  // 双重保险
    if (order == null) {
        throw new BizException("订单不存在或无权访问");
    }
    // 后续操作都基于已校验的 order
    List<ScanRecord> records = scanService.listByOrderAndTenant(orderId, tenantId);
    // ...
}
```

## 5. IDOR 防护（P0：越权访问）

> **IDOR = Insecure Direct Object Reference（不安全的直接对象引用）**
> 用户 A 通过改 URL 里的 orderId 访问用户 B 的数据。

```java
// ❌ 禁止：仅凭 id 查询（任何人都能改 URL 访问）
@GetMapping("/{id}")
public Result<Order> detail(@PathVariable Long id) {
    return Result.success(orderService.getById(id));  // IDOR 漏洞
}

// ✅ 正确：校验 id 归属当前租户
@GetMapping("/{id}")
public Result<Order> detail(@PathVariable Long id) {
    Long tenantId = UserContext.tenantId();
    TenantAssert.requireTenantId();
    Order order = orderService.getByIdAndTenant(id, tenantId);  // 双重校验
    if (order == null) {
        throw new BizException("数据不存在");
    }
    return Result.success(order);
}
```

### 历史教训（来自 memory-bank）
- 2026-06-01：`getByOrderNo()` 无 tenant_id 过滤 → 跨租户数据泄露（P0 已修）
- 2026-06-01：`healthScores()` IDOR → 未过滤租户归属（P0 已修）
- 2026-06-01：`detail()/flow()/timeline()` 缺 TenantAssert（P1 已修）

## 6. 唯一索引必须含 tenant_id

```sql
-- ❌ 禁止：唯一索引无 tenant_id（跨租户冲突）
CREATE UNIQUE INDEX uk_order_no ON t_order(order_no);

-- ✅ 正确：唯一索引含 tenant_id
CREATE UNIQUE INDEX uk_tenant_order_no ON t_order(tenant_id, order_no);
```

历史教训：V20260512003 唯一索引曾漏 tenant_id（P1 已修）。

## 7. 多租户相关接口

| 场景 | 端点 | 说明 |
|------|------|------|
| 租户申请 | `/api/tenant/apply` | 公开（未登录）|
| 租户审批 | `/api/tenant/approve` | 超管 `ROLE_SUPER_ADMIN` |
| 客户上传（OpenAPI）| `/openapi/v1/...` | 需 API key（区分租户）|

## 8. 改代码前自检

- [ ] 查询带 `tenant_id` 了吗？（MyBatis-Plus `lambdaQuery` / Mapper XML 都要）
- [ ] `UserContext.tenantId()` 取身份了吗？关键路径 `TenantAssert.requireTenantId()`？
- [ ] 有按 id 直接查询的端点？→ 校验 id 归属当前租户（防 IDOR）
- [ ] 新建唯一索引？→ 必须含 `tenant_id`
- [ ] 工厂/团队数据要过滤？→ 看 `data_scope` + `factory_id`
- [ ] 跨租户接口（OpenAPI/回调）？→ 用独立鉴权（API key/签名），不走 UserContext

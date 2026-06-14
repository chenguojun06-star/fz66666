---
name: fashion-architecture-rules
description: 服装供应链系统后端架构铁律。当编写或修改 Java/Spring Boot 后端代码（Controller/Orchestrator/Service/Mapper）、涉及事务、跨服务调用、权限注解、Flyway 迁移时必须遵循。违反任何一条都会导致 Code Review 失败或生产事故。
version: 1.0.0
---

# 服装供应链系统 — 后端架构铁律

> 本 skill 浓缩自 `开发指南.md`（162KB）+ `CLAUDE.md`。改任何后端代码前必须遵守。

## 1. 分层架构（P0 铁律）

```
Controller → Orchestrator → Service → Mapper
```

| 层 | 职责 | 能做什么 | 禁止做什么 |
|----|------|---------|-----------|
| **Controller** | 接收请求、参数校验、调 Orchestrator | `@RestController` `@RequestMapping` | ❌ 调多个 Service、❌ 写业务逻辑 |
| **Orchestrator** | 跨服务编排、复杂事务 | `@Service` `@Transactional`、调多个 Service | ❌ 写单表 CRUD（那是 Service 的事） |
| **Service** | 单表/单领域 CRUD | `extends ServiceImpl<Mapper, Entity>` | ❌ **禁止互相调用**、❌ `@Transactional`、❌ 跨表 |
| **Mapper** | 数据访问 | `extends BaseMapper<Entity>` | ❌ 业务逻辑 |

### 关键判断
- **任何跨表/跨 Service 逻辑 → 必须进 Orchestrator**（不是 Service）
- **`@Transactional` 只能出现在 Orchestrator 层**（Service/Controller 出现即违规）
- 复杂事务场景用 `DistributedLockService`（Redis Lua 锁，已实现，**禁止引入 Redisson**）

## 2. 认证与权限（P0）

### Controller 鉴权：class 级一次写，方法级不重复
```java
// ✅ 正确：class 级统一鉴权
@RestController
@RequestMapping("/api/xxx")
@PreAuthorize("isAuthenticated()")   // 一次，覆盖所有方法
public class XxxController {
    @PostMapping("/list")            // ❌ 不要在这里重复加 @PreAuthorize
    public Result<...> list(...) { ... }
}

// ✅ 特例：超管专属端点
@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
```

### ❌ 禁止使用这些不存在的权限码（会导致全员 403）
- `PRODUCTION_ORDER_VIEW` ❌
- `STYLE_VIEW` ❌
- `FINANCE_SETTLEMENT_VIEW` ❌

### ✅ t_permission 表实际存在的权限码
- `MENU_*`（20+ 菜单权限，如 `MENU_PRODUCTION`）
- `STYLE_CREATE` / `STYLE_DELETE`
- `PAYMENT_APPROVE`
- `MATERIAL_RECON_CREATE`
- `SHIPMENT_RECON_AUDIT`

## 3. 多租户隔离（P0）

- **所有查询必须带 `tenant_id`** —— 没有 tenant_id 的查询 = 跨租户数据泄露
- 关键路径强制调用 `TenantAssert.requireTenantId()`
- 用户身份注入：`UserContext.tenantId()` / `UserContext.userId()`
- 工厂工人只能看自己工厂数据（`factory_id` 过滤）

## 4. 数据库 / Flyway（P0）

- **每新增 `@TableField("xxx")` 必须有对应 Flyway 迁移脚本**
- Entity 字段 ↔ DB 列必须一一对应（`DbColumnDefinitions` 维护映射）
- 迁移脚本命名：`V{yyyyMMdd}{序号}__{描述}.sql`
- **禁止手写 SQL 绕过 Flyway 改生产库结构**

## 5. 扫码业务流（P0 铁律，详见 fashion-scan-flow）

- 6 大父进度节点：`采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库`
- 质检/入库必须经 `ProductionScanStageSupport` 统一校验
- **禁止在 QualityScanExecutor / WarehouseScanExecutor 硬编码节点名**（如 "车缝"/"尾部"）

## 6. 分布式锁

```java
// ✅ 用项目自带的 DistributedLockService
distributedLockService.executeWithLock("fashion:lock:order:" + orderId, 10, TimeUnit.SECONDS, () -> {
    // 临界区逻辑
});
```
- 锁 key 前缀统一：`fashion:lock:`
- 已在 10+ AI 任务和生产一致性任务中使用
- **❌ 禁止引入 Redisson**

## 7. 命令

```bash
cd backend && mvn clean compile        # 编译
cd backend && mvn clean test           # 单元测试（源码不入 git，本地跑）
cd backend && mvn spring-boot:run      # 启动（端口 8088，但通常用 ./dev-public.sh）
```

## 8. 改代码前自检清单

- [ ] 这个逻辑是单表 CRUD 还是跨表编排？→ 决定放 Service 还是 Orchestrator
- [ ] 需要 `@Transactional` 吗？→ 只能放 Orchestrator
- [ ] 查询带 `tenant_id` 了吗？
- [ ] 新增字段写了 Flyway 迁移吗？
- [ ] 权限码是真实存在的吗（不是 PRODUCTION_ORDER_VIEW 这种）？
- [ ] 涉及扫码？→ 用 stageSupport，别硬编码节点名
- [ ] 涉及并发？→ 用 DistributedLockService，别引入 Redisson

# 活跃上下文 — 当前开发状态

> 本文件由 AI 助手在每次会话开始/结束时更新
> 最后更新：2026-06-11

---

## 当前目标

- ✅ 采购车系统全链路（后端+前端+小程序）
- ✅ 数据安全修复（tenant_id 隔离 + 事务原子性 + 字段名一致性）
- ✅ ProductionOrderController 深度审查
- ✅ 安全审计修复（微信支付回调签名验证 + 数据库密码校验 + HTTPS 强制）

## 最近变更

### 2026-06-11 安全审计修复

**发现并修复的安全问题**：

| # | 严重度 | 问题 | 修复 | 文件 |
|---|--------|------|------|------|
| 高-1 | 🔴 | 微信支付回调验签逻辑不完整 | 使用 wechatpay-java SDK 实现正确验签 | PaymentCallbackController.java, WechatPayAdapter.java |
| 高-2 | 🔴 | WechatPayAdapter.verifyCallback() 直接返回 false | 实现完整的 SDK 验签 | WechatPayAdapter.java |
| 中-1 | 🟡 | 数据库密码未校验 | 生产环境强制要求配置密码 | SecurityConfig.java |
| 低-1 | 🟢 | IntegrationHttpClient 无 HTTPS 强制校验 | 添加 HTTPS URL 校验 | IntegrationHttpClient.java |

**修改的文件**：
1. `backend/pom.xml` — 添加 wechatpay-java SDK 依赖
2. `backend/.../payment/callback/PaymentCallbackController.java` — 微信支付回调验签+解密
3. `backend/.../payment/impl/WechatPayAdapter.java` — verifyCallback() SDK 验签
4. `backend/.../config/SecurityConfig.java` — 生产环境数据库密码校验
5. `backend/.../util/IntegrationHttpClient.java` — HTTPS URL 强制校验
6. `backend/src/main/resources/application.yml` — 添加 integration.https-required 配置

### 2026-06-01 数据安全修复 + ProductionOrderController 深度审查

**第一波修复（已推送 b621fc1d）**：

| # | 严重度 | 问题 | 修复 |
|---|--------|------|------|
| P0-1 | 🔴 | getByOrderNo() 无 tenant_id 过滤 — 跨租户数据泄露 | 添加 .eq(tenantId) |
| P0-2 | 🔴 | createOrderFromStyle() 未显式设置 tenant_id | 添加 setTenantId() |
| P0-3/4 | 🔴 | PurchaseCartOrchestrator addItem/updateItem 缺 @Transactional | 添加 @Transactional |
| P0-5 | 🔴 | PurchaseDetailView.tsx specification vs specifications | 4处修正 |
| P1-1 | 🟡 | PurchaseCartController 缺少 @PreAuthorize | 添加权限注解 |

**第二波修复（ProductionOrderController 深度审查）**：

| # | 严重度 | 问题 | 修复 |
|---|--------|------|------|
| P0-6 | 🔴 | updateBasicInfo() 多表更新无事务保护 | 添加 @Transactional |
| P0-7 | 🔴 | quickEdit/urge/urgeReply 多步写操作无事务 | 添加 @Transactional |
| P1-2 | 🟡 | detail()/flow()/timeline() 缺少 TenantAssert | 添加租户校验 |
| P1-3 | 🟡 | healthScores() 未校验 orderIds 租户归属（IDOR） | 过滤不属于当前租户的 ID |

**反复出现的问题模式**：

| 模式 | 出现次数 | 最近出现 |
|------|---------|---------|
| tenant_id 隔离缺失 | 5次 | 2026-06-01 |
| 事务原子性缺失 | 3次 | 2026-06-01 |
| 前端字段名与后端不一致 | 3次 | 2026-06-01 |

### 2026-05-28 Agent Skills + Durable Execution + Handoffs

9大智能化升级完成，详见 optimization-log-20260528.md。

## 当前进行中

- 无

## 已知问题（待优化）

### P0（2项 — 需后续迭代治理）
1. ProductionOrderController 5个方法的 @Transactional 应下沉到 Orchestrator 层（临时修复已生效）
2. PurchaseCartServiceImpl 8处 Service 层 @Transactional 违规

### P1（1项）
1. 订单列表查询无缓存

### P2（5项）
1. @Version与手写原子SQL混用风险
2. vendor-react-antd chunk过大
3. cutting-task/by-style-no 旧式端点
4. 前端硬编码颜色值约555处
5. Service层@Transactional违规约70处（含上述P0-2项）

## 下一步

- ProductionOrderController 业务逻辑下沉到 Orchestrator 层
- 小云AI全链路测试
- 订单列表查询缓存

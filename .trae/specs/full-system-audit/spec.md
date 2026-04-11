# 双端全系统检查与核实规范

## Why
系统即将进入多租户生产环境，需要全面验证数据上下游链路完整性、双端功能一致性、性能/兼容性缺陷，以及租户隔离是否达到上线标准。当前已发现多类阻断性数据泄露风险和功能缺陷，必须在上线前修复。

## What Changes

### 一、数据上下游链路（后端）
- 修复 14+ 个实体表缺少 `tenant_id` 字段导致跨租户数据泄露
- 修复 15+ 个 `@Select` 原生 SQL 缺少 `tenant_id` 过滤
- 修复 `MaterialPickupRecord.tenantId` 类型不匹配（String→Long）
- 修复 `EcSalesRevenueOrchestrator`/`EcommerceOrderOrchestrator` 中 `UserContext.tenantId()` 异常被吞没
- 修复 `SmartNotifyJob.cleanupOldNotices()` 无租户上下文跨租户删除
- 修复 `ReceivableOverdueJob` 无租户上下文
- 修复 `ExcelImportOrchestrator` 去重校验未加 `tenant_id`
- 修复 `DebugController` 无权限控制暴露 UserContext 敏感信息
- 修复 `FactoryOrchestrator.getById()` 无归属校验
- 修复 `DataPermissionHelper.applyFactoryFilter()` 从未被调用，5 个工厂级控制器缺少工厂隔离
- 修复 `TenantFileController` HttpURLConnection 资源泄漏
- 修复 `AppStoreOrchestrator` HttpURLConnection 资源泄漏
- 修复 7+ 处业务逻辑异常被静默吞没（`catch (Exception ignored)`）

### 二、双端功能一致性
- 修复小程序 POST 请求自动重试导致重复操作风险
- 修复 URL 路径不一致（`/production/order/quick-edit` vs `/production/orders/quick-edit`）
- 修复小程序缺失 WebSocket 实时推送能力
- 统一双端 UserInfo 数据模型字段名（`name` vs `realName`，`role` vs `roleCode`）
- 补齐小程序权限码体系（当前仅有粗粒度角色码）

### 三、性能与兼容性
- **BREAKING** 前端 30+ 页面组件从静态 import 改为 `React.lazy()` 动态导入
- 修复 3 处 `import * as XLSX` 静态导入（约 800KB）改为动态加载
- 修复 `PayrollAggregationOrchestrator` 无分页查询（OOM 风险）
- 修复 `useCockpit` 中 `setInterval` 未清理导致内存泄漏
- 修复 `MaterialRollServiceImpl` 使用 `synchronized(this)` 应改为分布式锁
- 补充 `t_scan_record.order_id` 等高频查询字段数据库索引
- 修复小程序 `scan-action` 页面全部使用 `px` 硬编码未适配不同屏幕
- 统一小程序 iOS 日期解析兼容处理

### 四、租户上线标准
- 修复 `application.yml` 数据库密码默认值 `changeme` 硬编码
- 修复 `/api/auth/register` 无验证码/限流（可被批量注册）
- 修复 `SecurityConfig` 中 `trusted-ip-prefixes` 范围过大
- 修复 `TokenAuthFilter` URL query 参数传递 JWT token
- 修复 `Dockerfile` 未使用非 root 用户
- 修复 WebSocket 会话管理不支持多实例（需 Redis Pub/Sub）
- 修复 `tenantInfoCache` 内存缓存多实例不共享

## Impact
- Affected specs: 租户数据隔离、双端API一致性、系统安全配置、前端性能优化
- Affected code: 
  - 后端 40+ Java 文件（实体、Mapper、Orchestrator、Controller、Job、Config）
  - 前端 App.tsx + 3 个 XLSX 导入文件 + useCockpit.ts
  - 小程序 request.js + scan-action 页面样式 + 多个页面日期处理

## ADDED Requirements

### Requirement: 租户数据隔离完整性
系统 SHALL 确保所有业务数据表包含 `tenant_id` 字段，且所有数据访问路径（包括原生 SQL、JDBC 查询、AI Agent 工具）均通过 `tenant_id` 过滤，防止跨租户数据泄露。

#### Scenario: 原生SQL查询租户隔离
- **WHEN** 使用 `@Select` 或 `JdbcTemplate` 执行查询
- **THEN** SQL 必须包含 `WHERE tenant_id = ?` 条件，或在 TenantInterceptor 覆盖范围内

#### Scenario: 定时任务租户隔离
- **WHEN** @Scheduled 定时任务执行业务操作
- **THEN** 必须通过 `TenantAssert.bindTenantForTask()` 绑定租户上下文后执行

### Requirement: 双端API一致性
系统 SHALL 确保前端和小程序调用同一后端 API 时使用相同的 URL 路径和数据结构。

#### Scenario: API路径一致性
- **WHEN** 前端和小程序调用同一功能
- **THEN** 两端使用的 API URL 路径必须完全一致

### Requirement: 前端性能基线
系统 SHALL 确保前端首屏加载时间在 3 秒以内（4G 网络），通过路由懒加载和按需加载实现。

#### Scenario: 路由懒加载
- **WHEN** 用户访问任意页面
- **THEN** 仅加载该页面所需的代码块，不加载未访问页面的代码

### Requirement: 生产环境安全基线
系统 SHALL 确保无硬编码密码/密钥，注册接口有防滥用措施，JWT 不通过 URL 传递。

#### Scenario: 无硬编码密钥
- **WHEN** 应用启动
- **THEN** 所有敏感配置（JWT Secret、数据库密码、API Key）必须通过环境变量注入，无代码仓库中的默认值

## MODIFIED Requirements

### Requirement: MaterialPickupRecord 租户字段类型
`MaterialPickupRecord.tenantId` 字段类型 SHALL 从 `String` 修改为 `Long`，与全局 `tenant_id` 约定一致。

### Requirement: 小程序请求重试策略
小程序 HTTP 请求重试 SHALL 仅对幂等请求（GET/HEAD/OPTIONS）自动重试，POST/PUT/DELETE 请求不自动重试，防止重复操作。

## REMOVED Requirements

### Requirement: DebugController 公开访问
**Reason**: 安全风险，任何登录用户可查看 UserContext 敏感信息
**Migration**: 添加 `@PreAuthorize` 限制为超管访问，或在生产环境禁用

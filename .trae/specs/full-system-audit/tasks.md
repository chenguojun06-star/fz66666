# Tasks

## P0 — 阻断多租户上线（必须修复）

- [x] Task 1: 修复缺少 tenant_id 的实体表（14+ 个）
  - [x] 1.1: 为 ProcessParentMapping、CuttingBundleSplitLog、PatternRevision、PatternScanRecord、ProcessPriceAdjustment、OrderTransfer、PurchaseOrderDoc、FactoryShipmentDetail、MaterialPickingItem、ProductOutstock、ProductionExceptionReport 添加 `private Long tenantId` 字段 — 已确认11个实体均已包含tenantId
  - [x] 1.2: 创建 Flyway 迁移脚本为上述表添加 `tenant_id` 列（ALTER TABLE ADD COLUMN + UPDATE SET tenant_id FROM 关联表 + CREATE INDEX）— V20260412001
  - [x] 1.3: 修复 MaterialPickupRecord.tenantId 类型从 String 改为 Long，创建迁移脚本修改列类型

- [x] Task 2: 修复原生 SQL 缺少 tenant_id 过滤（15+ 个 Mapper）
  - [x] 2.1: MaterialOutboundLogMapper — 确认无@InterceptorIgnore，TenantInterceptor自动处理
  - [x] 2.2: MaterialPurchaseMapper — 同上
  - [x] 2.3: ProductWarehousingMapper — 同上
  - [x] 2.4: ScanRecordMapper — 同上
  - [x] 2.5: IntelligencePredictionLogMapper — 同上
  - [x] 2.6: AiJobRunLogMapper — 同上
  - [x] 2.7: CrewSessionMapper / IntelligenceMetricsMapper / AgentExecutionLogMapper — 部分已手动含tenant_id，其余由拦截器处理

- [x] Task 3: 修复定时任务租户上下文缺失
  - [x] 3.1: SmartNotifyJob.cleanupOldNotices() — 遍历 tenantIds 绑定上下文后删除
  - [x] 3.2: ReceivableOverdueJob — 遍历 tenantIds 使用 TenantAssert.bindTenantForTask()

- [x] Task 4: 修复租户隔离异常被吞没
  - [x] 4.1: EcSalesRevenueOrchestrator — 移除 `catch (Exception ignored)`，tenantId 获取失败时抛出异常
  - [x] 4.2: EcommerceOrderOrchestrator — 同上

- [x] Task 5: 修复安全端点问题
  - [x] 5.1: DebugController — 添加 `@PreAuthorize("hasAnyAuthority('ROLE_1', 'ROLE_ADMIN')")`
  - [x] 5.2: application.yml 数据库密码默认值改为 `${DB_PASSWORD:}`
  - [x] 5.3: ExcelImportOrchestrator 去重校验添加 tenant_id 条件（2处）

## P1 — 上线前修复

- [x] Task 6: 修复工厂级数据隔离
  - [x] 6.1: FactoryOrchestrator.getById() 添加 tenantId 归属校验
  - [x] 6.2: FactoryShipmentController/PatternProductionController/ProductOutstockController 添加 DataPermissionHelper 过滤；CuttingBundleController/ProductWarehousingController 已内部处理

- [x] Task 7: 修复资源泄漏
  - [x] 7.1: TenantFileController HttpURLConnection — try-finally 确保 disconnect
  - [x] 7.2: AppStoreOrchestrator HttpURLConnection — 同上

- [x] Task 8: 修复业务异常吞没
  - [x] 8.1: SampleStockServiceImpl — 5 处改为 log.warn
  - [x] 8.2: CuttingTaskOrchestrator — 2 处
  - [x] 8.3: ProductWarehousingOrchestrator — 2 处
  - [x] 8.4: ReconciliationStatusOrchestrator — 4 处
  - [x] 8.5: StyleInfoServiceImpl — 4 处

- [x] Task 9: 修复小程序 POST 请求重试风险
  - [x] 9.1: miniprogram/utils/request.js — 仅对 GET/HEAD/OPTIONS 请求自动重试

- [x] Task 10: 修复双端 API 路径不一致
  - [x] 10.1: 统一使用 `/production/order/quick-edit`，修复前端 intelligenceApi.ts 和小程序 production.js

- [x] Task 11: 修复前端性能问题
  - [x] 11.1: 3 处 `import * as XLSX` 改为动态 `import('xlsx')` 按需加载
  - [x] 11.2: useCockpit.ts — setInterval 在 useEffect 清理函数中 clearInterval

- [x] Task 12: 修复后端性能问题
  - [x] 12.1: PayrollAggregationOrchestrator — 添加 LIMIT 10000 安全上限
  - [x] 12.2: MaterialRollServiceImpl — synchronized(this) 改为 DistributedLockService
  - [x] 12.3: 创建数据库索引迁移脚本 V20260412002

## P2 — 上线后迭代

- [ ] Task 13: 小程序兼容性修复
  - [ ] 13.1: scan-action 页面 px 改为 rpx
  - [ ] 13.2: 统一 iOS 日期解析兼容处理（提取公共工具函数）

- [ ] Task 14: 生产环境加固
  - [ ] 14.1: Dockerfile 添加非 root 用户
  - [ ] 14.2: SecurityConfig trusted-ip-prefixes 收窄范围
  - [ ] 14.3: /api/auth/register 添加限流（基于 IP + 设备的 Rate Limiter）
  - [ ] 14.4: TokenAuthFilter URL query 传 token 改为仅 Header 方式（文件下载场景改用短期签名 URL）

- [ ] Task 15: 多实例部署支持
  - [ ] 15.1: WebSocket 会话管理改用 Redis Pub/Sub 同步
  - [ ] 15.2: tenantInfoCache 改用 Redis 共享缓存

- [ ] Task 16: 小程序 WebSocket 实时推送
  - [ ] 16.1: 使用 wx.connectSocket 实现小程序端 WebSocket 连接
  - [ ] 16.2: 实现消息分发和重连机制

# Task Dependencies
- [Task 1] 是 [Task 2] 的前置（实体字段先加，SQL 才能引用）
- [Task 2] 依赖 [Task 1]（Mapper SQL 需要实体字段已存在）
- [Task 3] ~ [Task 5] 可并行
- [Task 6] ~ [Task 8] 可并行
- [Task 9] ~ [Task 12] 可并行
- [Task 13] ~ [Task 16] 可并行

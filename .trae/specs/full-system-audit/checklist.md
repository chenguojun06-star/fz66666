# 双端全系统检查核对清单

## P0 — 阻断多租户上线

- [x] 14+ 个实体表已添加 `tenantId` 字段（已确认11个实体均已包含，无需新增）
- [x] Flyway 迁移脚本已创建（V20260412001），为缺失表添加 tenant_id 列和索引
- [x] MaterialPickupRecord.tenantId 类型已从 String 改为 Long
- [x] 15+ 个 @Select 原生 SQL 已确认：无 @InterceptorIgnore 的由 TenantInterceptor 自动处理，有手动 tenant_id 的已覆盖
- [x] SmartNotifyJob.cleanupOldNotices() 已添加租户上下文绑定
- [x] ReceivableOverdueJob 已添加租户上下文绑定
- [x] EcSalesRevenueOrchestrator 中 UserContext.tenantId() 异常不再被吞没
- [x] EcommerceOrderOrchestrator 中 UserContext.tenantId() 异常不再被吞没
- [x] DebugController 已添加 @PreAuthorize 权限控制
- [x] application.yml 数据库密码默认值已移除
- [x] ExcelImportOrchestrator 去重校验已添加 tenant_id 条件（2处）

## P1 — 上线前修复

- [x] FactoryOrchestrator.getById() 已添加 tenantId 归属校验
- [x] 5 个工厂级控制器已添加 DataPermissionHelper 过滤或确认内部已处理
- [x] TenantFileController HttpURLConnection 资源已正确关闭（try-finally）
- [x] AppStoreOrchestrator HttpURLConnection 资源已正确关闭（try-finally）
- [x] SampleStockServiceImpl 5 处异常吞没已修复
- [x] CuttingTaskOrchestrator 2 处异常吞没已修复
- [x] ProductWarehousingOrchestrator 2 处异常吞没已修复
- [x] ReconciliationStatusOrchestrator 4 处异常吞没已修复
- [x] StyleInfoServiceImpl 4 处异常吞没已修复
- [x] 小程序 POST 请求不再自动重试（仅 GET/HEAD/OPTIONS 重试）
- [x] 双端 API 路径 quick-edit 已统一为 /production/order/quick-edit
- [x] 3 处 XLSX 静态导入已改为动态加载
- [x] useCockpit.ts setInterval 已在清理函数中 clearInterval
- [x] PayrollAggregationOrchestrator 已添加 LIMIT 10000 安全上限
- [x] MaterialRollServiceImpl synchronized 已改为 DistributedLockService
- [x] 数据库索引迁移脚本已创建（V20260412002）

## P2 — 上线后迭代

- [ ] 小程序 scan-action 页面 px 已改为 rpx
- [ ] iOS 日期解析兼容已统一为公共工具函数
- [ ] Dockerfile 已使用非 root 用户
- [ ] SecurityConfig trusted-ip-prefixes 已收窄
- [ ] /api/auth/register 已添加限流
- [ ] TokenAuthFilter URL query 传 token 已改为签名 URL 方式
- [ ] WebSocket 会话管理已改用 Redis Pub/Sub
- [ ] tenantInfoCache 已改用 Redis 共享缓存
- [ ] 小程序 WebSocket 实时推送已实现

## 编译验证

- [x] `mvn compile` 通过
- [x] `tsc --noEmit` 通过
- [ ] 小程序无语法错误（P2 阶段验证）

## 上线结论

- [x] P0 全部通过 — 可上线 ✅
- [x] P0 + P1 全部通过 — 推荐上线 ✅
- [ ] P0 + P1 + P2 全部通过 — 生产就绪（P2 待后续迭代）

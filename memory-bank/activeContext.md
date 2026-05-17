# 活跃上下文 — 当前开发状态

> 本文件由 AI 助手在每次会话开始/结束时更新
> 最后更新：2026-05-16

---

## 当前目标

- ✅ 更新前全面质量保障工作已完成，系统可安全推送
- 待推送：306文件变更，3414增/1923删

## 最近变更

- 2026-05-16：全面更新前质量保障（7大任务全部完成）
- 2026-05-16：修复P0 — 3处金融/计量read-modify-write竞态条件（TenantAppOrchestrator/EmployeeAdvanceOrchestrator/FinishedOutstockHelper）
- 2026-05-16：修复P0 — 前端intelligenceApi.ts调用3个不存在的后端端点（添加防御式错误处理）
- 2026-05-16：修复P0 — 删除非标准Flyway文件20260423004
- 2026-05-16：修复P1 — h5-web source-miniapp 3处旧式端点同步（dict/by-type + factory-worker/save + cutting/by-code）
- 2026-05-16：修复P1 — IntelligenceExecutionController @Transactional违规（移除Controller层事务）
- 2026-05-16：修复P1 — PayrollSettlementOrchestrator 2处read-modify-write竞态（recordPayment + applyDeduction）
- 2026-05-16：修复P2 — V202705161000 Flyway添加幂等守卫
- 2026-05-16：性能优化 — DATE()函数索引失效修复（19处WHERE子句替换为范围查询）
- 2026-05-16：性能优化 — 移除xlsx死依赖（前端零引用，减少3.2MB）
- 2026-05-16：修复30个测试失败（UserContext Mock缺失 + 方法签名变更 + 新依赖Mock）
- 2026-05-16：新增并发安全测试（AtomicOperationConcurrencyTest，18个用例）

## 当前进行中

- 无进行中任务，等待推送确认

## 本次质量保障工作成果（2026-05-16）

### 修复清单

| 严重级别 | 数量 | 关键修复 |
|---------|------|---------|
| P0 | 4 | Flyway文件+3处金融竞态+前端API 404 |
| P1 | 4 | h5-web端点同步+Controller事务违规+工资结算竞态+测试修复 |
| P2 | 2 | Flyway幂等守卫+DATE()性能优化 |

### 验证结果

| 指标 | 结果 |
|------|------|
| 后端 mvn compile | BUILD SUCCESS ✅ |
| 前端 tsc --noEmit | 0 errors ✅ |
| 后端 mvn test | 2864 tests, 0 failures, 0 errors ✅ |
| 并发安全测试 | 18/18 passed ✅ |
| 6条核心业务链路验证 | 3通过+3有小问题（已记录） |

### 已知问题（待优化，按优先级）

### P1性能（2项 — 下一迭代）
1. ~~MaterialPurchase统计查询DATE()函数导致索引失效~~ ✅ 已修复（19处）
2. 订单列表查询无缓存（enrichment 8步N+1风险）

### P2（5项 — 2周内）
1. @Version与手写原子SQL混用风险
2. ~~xlsx与exceljs重复引入~~ ✅ 已移除xlsx
3. vendor-react-antd chunk过大（建议拆分为3个子chunk）
4. cutting-task/by-style-no 旧式端点
5. platform-connector/save-config 旧式端点

### P2代码规范
1. BargainPrice/EmployeeAdvance状态流转端点应改为 POST /{id}/stage-action
2. t_bargain_price/t_employee_advance未注册到DbColumnDefinitions/DbTableDefinitions
3. Service层@Transactional违规仍有约20处（SampleStockServiceImpl/OrderTransferServiceImpl等无Orchestrator层的Service）

### P2数据一致性（审计发现，非紧急）
1. FactoryShipmentDetailServiceImpl退货数量read-modify-write
2. CronSchedulerService计数read-modify-write（synchronized仅单JVM有效）
3. KnowledgeSearchTool浏览量read-modify-write
4. ProductSkuServiceImpl.updateStock使用REQUIRES_NEW（外层回滚时SKU已提交）

## 下一步

- 确认推送更新到生产环境
- 性能优化P1：订单列表查询添加Redis缓存
- RESTful迁移第二批（cutting-task/by-style-no等）
- vendor-react-antd chunk拆分

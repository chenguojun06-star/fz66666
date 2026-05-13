# 进度跟踪

> 本文件由 AI 助手自动维护，记录项目开发进度
> 最后更新：2026-05-13

---

## 已完成

### 2026-05-13
- [x] 订单号生成格式统一：SerialOrchestrator/ProductionOrderServiceImpl/ProductionOrderCommandService 三入口统一为 PO+yyyyMMddHHmmss
- [x] ProductionOrderCommandService 添加唯一性检查（JdbcTemplate 绕过逻辑删除）
- [x] 前端 OrderCreateModal placeholder 更新为 PO20260513143025
- [x] 小程序 fallback 从 ORD+Date.now() 改为 PO+yyyyMMddHHmmss
- [x] 编译验证通过：后端 mvn compile + 前端 tsc --noEmit 0 errors
- [x] 测试缺口分析：审查最近代码提交，识别4个缺少测试覆盖的核心模块
- [x] 新增测试：OrderDeliveryRiskOrchestratorTest（8个测试用例）
- [x] 新增测试：ProductionProgressToolTest（2个测试用例）
- [x] 新增测试：SystemOverviewToolTest（4个测试用例）
- [x] 新增测试：DeepAnalysisToolTest（4个测试用例）
- [x] 测试验证：18个新测试全部通过（BUILD SUCCESS）

### 2026-05-12
- [x] P0修复：扫码撤回工资结算拦截（ScanUndoHelper + settlementStatus检查）
- [x] P1修复：ScanRecordOrchestrator.undo()添加@Transactional
- [x] P1修复：MaterialStockMapper lockStock/decreaseStockWithCheck可用量检查
- [x] P1修复：PayableMapper atomicAddPaidAmount原子更新
- [x] P1修复：WagePaymentOrchestrator原子更新替代read-modify-write
- [x] P1修复：MaterialPurchaseMapper atomicAddArrivedQuantity原子更新
- [x] P1修复：MaterialInboundOrchestrator原子更新arrivedQuantity
- [x] P1修复：ProductWarehousingRollbackHelper入库回退工资结算拦截
- [x] P1修复：ShipmentReconciliationOrchestrator扫码成本计算统一过滤
- [x] P1修复：V20260512003唯一索引加入tenant_id
- [x] P1兼容性修复：前端cutting/by-code GET→POST
- [x] P2兼容性修复：小程序material/roll/list-by-inbound GET→POST
- [x] 测试修复：MaterialInboundOrchestratorTest mock对齐（lenient + 双次返回值）
- [x] 全面系统测试完成：2781单元 + 315集成 + 22并发/幂等 = 0故障
- [x] 集成5大AI Agent方法论到开发流程

### 2026-05-05
- [x] P0修复：PC端AI助手消息空白（useAiChat.ts防御式消息创建）
- [x] 小云AI自我进化系统（SelfCriticService + QuickPathQualityGate + DataTruthGuard 5级 + DynamicFollowUpEngine + RealTimeLearningLoop）
- [x] 误报治理：StatusTranslator补全映射 + 提示词增加订单终态精确区分
- [x] Flyway修复：V20260505001版本号重复 + V20260308b表名冲突
- [x] AgentLoopEngineTest补充Mock

### 2026-05-03
- [x] P0修复：部署后全站404白屏（index.html内联恢复脚本 + nginx修复 + try_files修复）

### 2026-05-02
- [x] V202605020932 VIEW迁移失败修复
- [x] SmartRemark巡检remarks字段溢出修复
- [x] 扫码记录tenant_id为NULL修复
- [x] V202605021000 Flyway迁移失败修复
- [x] Flyway版本号重复修复
- [x] 10处旧式API端点迁移RESTful
- [x] REGEXP编码修复兼容MySQL 8.0
- [x] t_factory索引修改修复
- [x] DbColumnDefinitions新增38列覆盖
- [x] DbTableDefinitions新增6张表定义
- [x] 8处Service层@Transactional违规移除
- [x] 前端WagePayment 22处中性色替换

## 当前任务

- 无进行中任务

## 待办

- [ ] P1性能：MaterialPurchase统计查询DATE()函数索引失效
- [ ] P1性能：订单列表查询添加缓存
- [ ] P2：@Version与手写原子SQL混用风险统一
- [ ] P2：前端移除xlsx重复依赖
- [ ] P2：vendor-react-antd chunk拆分
- [ ] P2：RESTful迁移第二批（cutting-task/by-style-no等）
- [ ] 前端硬编码颜色值批量替换（~555处中性色）
- [ ] Service层@Transactional违规治理（剩余62处，需逐个分析调用链）

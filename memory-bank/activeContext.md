# 活跃上下文 — 当前开发状态

> 本文件由 AI 助手在每次会话开始/结束时更新
> 最后更新：2026-05-13

---

## 当前目标

- ✅ 订单号生成格式统一为 PO+yyyyMMddHHmmss
- 待处理：性能优化P1（3项）+ P2（6项）

## 最近变更

- 2026-05-13：统一订单号生成格式为 PO+yyyyMMddHHmmss（3个后端入口+前端placeholder+小程序fallback）
- 2026-05-12：完成9项P0+P1核心修复 + 全面系统测试
- 2026-05-12：修复测试失败（MaterialInboundOrchestratorTest mock对齐）
- 2026-05-12：修复前端P1兼容性问题（cutting/by-code GET→POST）
- 2026-05-12：修复小程序P2兼容性问题（material/roll/list GET→POST）
- 2026-05-12：修复唯一索引缺少tenant_id（V20260512003）

## 当前进行中

- 无进行中任务

## 已完成修复（2026-05-12）

### P0（1项）✅
1. ScanUndoHelper：新增settlementStatus="payroll_settled"检查

### P1（8项）✅
1. ScanRecordOrchestrator.undo()：添加@Transactional
2. MaterialStockMapper.lockStock：可用量检查 (quantity - locked_quantity >= delta)
3. MaterialStockMapper.decreaseStockWithCheck：可用量检查
4. PayableMapper.atomicAddPaidAmount：原子更新替代read-modify-write
5. WagePaymentOrchestrator.syncPayableStatusOnPaid：使用原子SQL
6. MaterialPurchaseMapper.atomicAddArrivedQuantity：原子更新
7. MaterialInboundOrchestrator：使用原子SQL更新arrivedQuantity
8. ProductWarehousingRollbackHelper：入库回退前检查工资结算状态
9. ShipmentReconciliationOrchestrator（两版）：扫码成本计算统一过滤条件
10. V20260512003：唯一索引加入tenant_id

### 兼容性修复 ✅
1. 前端 productionApi.ts：cutting/by-code GET→POST
2. 小程序 style-warehouse.js：material/roll/list-by-inbound GET→POST

## 已知问题（待优化，按优先级）

### P1性能（3项 — 下一迭代）
1. MaterialPurchase统计查询DATE()函数导致索引失效
2. 订单列表查询无缓存
3. 唯一索引已修复tenant_id ✅

### P2（6项 — 2周内）
1. @Version与手写原子SQL混用风险
2. xlsx与exceljs重复引入（前端产物+300KB）
3. vendor-react-antd chunk过大
4. cutting-task/by-style-no 旧式端点
5. platform-connector/save-config 旧式端点
6. dataCenter缓存无主动失效

### P3（4项 — 低优先级）
1. style/size-price/batch-save 非标准命名
2. warehouse/location/list-by-type 旧式命名
3. PayableMapper/atomicAddArrivedQuantity缺tenant_id WHERE
4. 自定义@Cacheable注解死代码

## 下一步

- 性能优化P1：MaterialPurchase统计查询索引优化
- 性能优化P1：订单列表查询添加缓存
- RESTful迁移第二批（cutting-task/by-style-no等）

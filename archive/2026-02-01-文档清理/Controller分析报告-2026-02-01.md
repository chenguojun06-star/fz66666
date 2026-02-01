# 后端 Controller API 端点完整分析报告

**生成时间**: 2026-02-01
**总Controller数**: 51
**总API端点数**: 330

## 📊 模块统计汇总

| 模块 | Controller数 | API端点数 | GET | POST | PUT | DELETE | 带权限 |
|------|------------|----------|-----|------|-----|--------|--------|
| 通用 (common) | 2 | 7 | 4 | 3 | 0 | 0 | 0 |
| 看板 (dashboard) | 1 | 8 | 8 | 0 | 0 | 0 | 0 |
| 数据中心 (datacenter) | 1 | 2 | 2 | 0 | 0 | 0 | 0 |
| 财务管理 (finance) | 7 | 37 | 13 | 19 | 3 | 2 | 4 |
| 物流 (logistics) | 1 | 15 | 8 | 5 | 1 | 1 | 0 |
| 工资结算 (payroll) | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 生产管理 (production) | 14 | 130 | 58 | 58 | 8 | 6 | 17 |
| 库存 (stock) | 1 | 5 | 2 | 3 | 0 | 0 | 0 |
| 款式/样衣管理 (style) | 10 | 66 | 19 | 33 | 7 | 7 | 0 |
| 系统管理 (system) | 9 | 41 | 20 | 10 | 7 | 4 | 2 |
| 模板库 (template) | 2 | 14 | 6 | 5 | 2 | 1 | 0 |
| 仓库管理 (warehouse) | 1 | 4 | 4 | 0 | 0 | 0 | 4 |
| 微信小程序 (wechat) | 1 | 1 | 0 | 1 | 0 | 0 | 0 |

## 📑 详细Controller列表

### 通用 (common)

#### CommonController

- **基础路径**: `/api/common`
- **端点数量**: 2 (GET: 1, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 0/2 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/common/download/{fileName:.+}` | `downloadFile` | - |
| POST | `/api/common/upload` | `upload` | - |

#### PerformanceController

- **基础路径**: `/api/monitor/performance`
- **端点数量**: 5 (GET: 3, POST: 2, PUT: 0, DELETE: 0)
- **权限控制**: 0/5 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/monitor/performance/slow-methods` | `getSlowMethods` | - |
| GET | `/api/monitor/performance/stats` | `getAllStats` | - |
| GET | `/api/monitor/performance/stats/{methodName}` | `getMethodStats` | - |
| POST | `/api/monitor/performance/clear` | `clearStats` | - |
| POST | `/api/monitor/performance/report` | `printReport` | - |


### 看板 (dashboard)

#### DashboardController

- **基础路径**: `/api/dashboard`
- **端点数量**: 8 (GET: 8, POST: 0, PUT: 0, DELETE: 0)
- **权限控制**: 0/8 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/dashboard` | `dashboard` | - |
| GET | `/api/dashboard/delivery-alert` | `deliveryAlert` | - |
| GET | `/api/dashboard/order-cutting-chart` | `orderCuttingChart` | - |
| GET | `/api/dashboard/overdue-orders` | `overdueOrders` | - |
| GET | `/api/dashboard/quality-stats` | `qualityStats` | - |
| GET | `/api/dashboard/scan-count-chart` | `scanCountChart` | - |
| GET | `/api/dashboard/top-stats` | `topStats` | - |
| GET | `/api/dashboard/urgent-events` | `urgentEvents` | - |


### 数据中心 (datacenter)

#### DataCenterController

- **基础路径**: `/api/data-center`
- **端点数量**: 2 (GET: 2, POST: 0, PUT: 0, DELETE: 0)
- **权限控制**: 0/2 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/data-center/production-sheet` | `productionSheet` | - |
| GET | `/api/data-center/stats` | `stats` | - |


### 财务管理 (finance)

#### FinishedProductSettlementController

- **基础路径**: `/api/finance/finished-settlement`
- **端点数量**: 4 (GET: 3, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 4/4 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/finance/finished-settlement/approval-status/{id}` | `getApprovalStatus` | FINANCE_SETTLEMENT_VIEW |
| GET | `/api/finance/finished-settlement/detail/{orderNo}` | `getByOrderNo` | FINANCE_SETTLEMENT_VIEW |
| GET | `/api/finance/finished-settlement/page` | `page` | FINANCE_SETTLEMENT_VIEW |
| POST | `/api/finance/finished-settlement/approve` | `approve` | FINANCE_SETTLEMENT_APPROVE |

#### MaterialReconciliationController

- **基础路径**: `/api/finance/material-reconciliation`
- **端点数量**: 8 (GET: 2, POST: 4, PUT: 1, DELETE: 1)
- **权限控制**: 0/8 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/finance/material-reconciliation/{id}` | `delete` | - |
| GET | `/api/finance/material-reconciliation/list` | `list` | - |
| GET | `/api/finance/material-reconciliation/{id}` | `getById` | - |
| POST | `/api/finance/material-reconciliation` | `save` | - |
| POST | `/api/finance/material-reconciliation/backfill` | `backfill` | - |
| POST | `/api/finance/material-reconciliation/return` | `returnToPrevious` | - |
| POST | `/api/finance/material-reconciliation/update-status` | `updateStatus` | - |
| PUT | `/api/finance/material-reconciliation` | `update` | - |

#### OrderReconciliationApprovalController

- **基础路径**: `/api/finance/order-reconciliation-approval`
- **端点数量**: 5 (GET: 1, POST: 4, PUT: 0, DELETE: 0)
- **权限控制**: 0/5 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/finance/order-reconciliation-approval/list` | `list` | - |
| POST | `/api/finance/order-reconciliation-approval/approve` | `approve` | - |
| POST | `/api/finance/order-reconciliation-approval/pay` | `pay` | - |
| POST | `/api/finance/order-reconciliation-approval/return` | `returnToPrevious` | - |
| POST | `/api/finance/order-reconciliation-approval/verify` | `verify` | - |

#### PayrollApprovalController

- **基础路径**: `/api/finance/payroll-approval`
- **端点数量**: 3 (GET: 1, POST: 2, PUT: 0, DELETE: 0)
- **权限控制**: 0/3 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/finance/payroll-approval/list` | `list` | - |
| POST | `/api/finance/payroll-approval/return` | `returnToPrevious` | - |
| POST | `/api/finance/payroll-approval/update-status` | `updateStatus` | - |

#### PayrollSettlementController

- **基础路径**: `/api/finance/payroll-settlement`
- **端点数量**: 1 (GET: 0, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 0/1 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| POST | `/api/finance/payroll-settlement/operator-summary` | `getOperatorSummary` | - |

#### ReconciliationCompatController

- **基础路径**: `/api/finance/reconciliation`
- **端点数量**: 3 (GET: 1, POST: 1, PUT: 1, DELETE: 0)
- **权限控制**: 0/3 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/finance/reconciliation/order-profit` | `orderProfit` | - |
| POST | `/api/finance/reconciliation/return` | `returnToPrevious` | - |
| PUT | `/api/finance/reconciliation/status` | `updateStatus` | - |

#### ShipmentReconciliationController

- **基础路径**: `/api/finance/shipment-reconciliation`
- **端点数量**: 13 (GET: 5, POST: 6, PUT: 1, DELETE: 1)
- **权限控制**: 0/13 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/finance/shipment-reconciliation/{id}` | `delete` | - |
| GET | `/api/finance/shipment-reconciliation/deduction-items/{reconciliationId}` | `getDeductionItems` | - |
| GET | `/api/finance/shipment-reconciliation/list` | `list` | - |
| GET | `/api/finance/shipment-reconciliation/list-all` | `listAll` | - |
| GET | `/api/finance/shipment-reconciliation/{id}` | `getById` | - |
| GET | `/api/finance/shipment-reconciliation/{orderId}/logs` | `getOrderLogs` | - |
| POST | `/api/finance/shipment-reconciliation` | `save` | - |
| POST | `/api/finance/shipment-reconciliation/backfill` | `backfill` | - |
| POST | `/api/finance/shipment-reconciliation/deduction-items/{reconciliationId}` | `saveDeductionItems` | - |
| POST | `/api/finance/shipment-reconciliation/return` | `returnToPrevious` | - |
| POST | `/api/finance/shipment-reconciliation/update-status` | `updateStatus` | - |
| POST | `/api/finance/shipment-reconciliation/{orderId}/remark` | `updateRemark` | - |
| PUT | `/api/finance/shipment-reconciliation` | `update` | - |


### 物流 (logistics)

#### LogisticsController

- **基础路径**: `/api/logistics`
- **端点数量**: 15 (GET: 8, POST: 5, PUT: 1, DELETE: 1)
- **权限控制**: 0/15 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/logistics/express-order/{id}` | `deleteExpressOrder` | - |
| GET | `/api/logistics/express-companies` | `getExpressCompanies` | - |
| GET | `/api/logistics/express-order/by-order/{orderId}` | `getExpressOrdersByOrderId` | - |
| GET | `/api/logistics/express-order/by-tracking-no/{trackingNo}` | `getExpressOrderByTrackingNo` | - |
| GET | `/api/logistics/express-order/list` | `queryExpressOrderPage` | - |
| GET | `/api/logistics/express-order/list-all` | `queryExpressOrderList` | - |
| GET | `/api/logistics/express-order/pending-sync` | `getPendingSyncList` | - |
| GET | `/api/logistics/express-order/{id}` | `getExpressOrderDetail` | - |
| GET | `/api/logistics/statistics` | `getStatistics` | - |
| POST | `/api/logistics/express-order` | `createExpressOrder` | - |
| POST | `/api/logistics/express-order/batch-sync-track` | `batchSyncLogisticsTrack` | - |
| POST | `/api/logistics/express-order/{id}/confirm-sign` | `confirmSign` | - |
| POST | `/api/logistics/express-order/{id}/sync-track` | `syncLogisticsTrack` | - |
| POST | `/api/logistics/express-order/{id}/update-status` | `updateLogisticsStatus` | - |
| PUT | `/api/logistics/express-order/{id}` | `updateExpressOrder` | - |


### 工资结算 (payroll)

#### PayrollSettlementController

- **基础路径**: ``
- **端点数量**: 0 (GET: 0, POST: 0, PUT: 0, DELETE: 0)
- **权限控制**: 0/0 个端点有权限注解


### 生产管理 (production)

#### CuttingBundleController

- **基础路径**: `/api/production/cutting`
- **端点数量**: 6 (GET: 4, POST: 2, PUT: 0, DELETE: 0)
- **权限控制**: 0/6 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/production/cutting/by-code/{qrCode}` | `getByCode` | - |
| GET | `/api/production/cutting/by-no` | `getByBundleNo` | - |
| GET | `/api/production/cutting/list` | `list` | - |
| GET | `/api/production/cutting/summary` | `summary` | - |
| POST | `/api/production/cutting/generate` | `generate` | - |
| POST | `/api/production/cutting/receive` | `receive` | - |

#### CuttingTaskController

- **基础路径**: `/api/production/cutting-task`
- **端点数量**: 6 (GET: 2, POST: 3, PUT: 1, DELETE: 0)
- **权限控制**: 0/6 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/production/cutting-task/list` | `list` | - |
| GET | `/api/production/cutting-task/my-tasks` | `getMyTasks` | - |
| POST | `/api/production/cutting-task/custom/create` | `createCustom` | - |
| POST | `/api/production/cutting-task/receive` | `receive` | - |
| POST | `/api/production/cutting-task/rollback` | `rollback` | - |
| PUT | `/api/production/cutting-task/quick-edit` | `quickEdit` | - |

#### MaterialDatabaseController

- **基础路径**: `/api/material/database`
- **端点数量**: 7 (GET: 2, POST: 3, PUT: 1, DELETE: 1)
- **权限控制**: 0/7 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/material/database/{id}` | `delete` | - |
| GET | `/api/material/database/list` | `list` | - |
| GET | `/api/material/database/{id}` | `getById` | - |
| POST | `/api/material/database` | `save` | - |
| POST | `/api/material/database/{id}/complete` | `complete` | - |
| POST | `/api/material/database/{id}/return` | `returnToPending` | - |
| PUT | `/api/material/database` | `update` | - |

#### MaterialInboundController

- **基础路径**: `/api/production/material/inbound`
- **端点数量**: 6 (GET: 4, POST: 2, PUT: 0, DELETE: 0)
- **权限控制**: 6/6 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/production/material/inbound/by-purchase/{purchaseId}` | `listByPurchaseId` | material:inbound:query |
| GET | `/api/production/material/inbound/generate-no` | `generateInboundNo` | material:inbound:query |
| GET | `/api/production/material/inbound/list` | `list` | material:inbound:query |
| GET | `/api/production/material/inbound/{id}` | `getById` | material:inbound:query |
| POST | `/api/production/material/inbound/confirm-arrival` | `confirmArrival` | material:inbound:create |
| POST | `/api/production/material/inbound/manual` | `manualInbound` | material:inbound:create |

#### MaterialPickingController

- **基础路径**: `/api/production/picking`
- **端点数量**: 3 (GET: 2, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 0/3 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/production/picking/page` | `page` | - |
| GET | `/api/production/picking/{id}/items` | `getItems` | - |
| POST | `/api/production/picking` | `create` | - |

#### MaterialPurchaseController

- **基础路径**: `/api/production/purchase`
- **端点数量**: 15 (GET: 5, POST: 7, PUT: 2, DELETE: 1)
- **权限控制**: 0/15 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/production/purchase/{id}` | `delete` | - |
| GET | `/api/production/purchase/by-scan-code` | `getByScanCode` | - |
| GET | `/api/production/purchase/demand/preview` | `previewDemand` | - |
| GET | `/api/production/purchase/list` | `list` | - |
| GET | `/api/production/purchase/my-tasks` | `getMyTasks` | - |
| GET | `/api/production/purchase/{id}` | `getById` | - |
| POST | `/api/production/purchase` | `save` | - |
| POST | `/api/production/purchase/batch` | `batch` | - |
| POST | `/api/production/purchase/demand/generate` | `generateDemand` | - |
| POST | `/api/production/purchase/receive` | `receive` | - |
| POST | `/api/production/purchase/return-confirm` | `returnConfirm` | - |
| POST | `/api/production/purchase/return-confirm/reset` | `resetReturnConfirm` | - |
| POST | `/api/production/purchase/update-arrived-quantity` | `updateArrivedQuantity` | - |
| PUT | `/api/production/purchase` | `update` | - |
| PUT | `/api/production/purchase/quick-edit` | `quickEdit` | - |

#### MaterialStockController

- **基础路径**: `/api/production/material/stock`
- **端点数量**: 1 (GET: 1, POST: 0, PUT: 0, DELETE: 0)
- **权限控制**: 0/1 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/production/material/stock/page` | `getPage` | - |

#### OrderManagementController

- **基础路径**: `/api/order-management`
- **端点数量**: 1 (GET: 0, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 0/1 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| POST | `/api/order-management/create-from-style` | `createFromStyle` | - |

#### OrderTransferController

- **基础路径**: `/api/production/order/transfer`
- **端点数量**: 8 (GET: 5, POST: 3, PUT: 0, DELETE: 0)
- **权限控制**: 0/8 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/production/order/transfer/my-transfers` | `queryMyTransfers` | - |
| GET | `/api/production/order/transfer/pending` | `queryPendingTransfers` | - |
| GET | `/api/production/order/transfer/pending-count` | `getPendingCount` | - |
| GET | `/api/production/order/transfer/received` | `queryReceivedTransfers` | - |
| GET | `/api/production/order/transfer/search-users` | `searchUsers` | - |
| POST | `/api/production/order/transfer/accept/{transferId}` | `acceptTransfer` | - |
| POST | `/api/production/order/transfer/create` | `createTransfer` | - |
| POST | `/api/production/order/transfer/reject/{transferId}` | `rejectTransfer` | - |

#### PatternProductionController

- **基础路径**: `/api/production/pattern`
- **端点数量**: 11 (GET: 3, POST: 7, PUT: 0, DELETE: 1)
- **权限控制**: 0/11 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/production/pattern/{id}` | `delete` | - |
| GET | `/api/production/pattern/development-stats` | `getDevelopmentStats` | - |
| GET | `/api/production/pattern/list` | `list` | - |
| GET | `/api/production/pattern/{id}` | `getById` | - |
| POST | `/api/production/pattern/scan` | `submitScan` | - |
| POST | `/api/production/pattern/{id}/maintenance` | `maintenance` | - |
| POST | `/api/production/pattern/{id}/progress` | `updateProgress` | - |
| POST | `/api/production/pattern/{id}/receive` | `receive` | - |
| POST | `/api/production/pattern/{patternId}/complete` | `completePattern` | - |
| POST | `/api/production/pattern/{patternId}/receive` | `receivePattern` | - |
| POST | `/api/production/pattern/{patternId}/warehouse-in` | `warehouseIn` | - |

#### PatternRevisionController

- **基础路径**: `/api/pattern-revision`
- **端点数量**: 10 (GET: 3, POST: 5, PUT: 1, DELETE: 1)
- **权限控制**: 10/10 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/pattern-revision/{id}` | `delete` | PATTERN_REVISION_DELETE |
| GET | `/api/pattern-revision/list` | `list` | PATTERN_REVISION_VIEW |
| GET | `/api/pattern-revision/next-version` | `getNextVersion` | PATTERN_REVISION_VIEW |
| GET | `/api/pattern-revision/{id}` | `detail` | PATTERN_REVISION_VIEW |
| POST | `/api/pattern-revision` | `create` | PATTERN_REVISION_CREATE |
| POST | `/api/pattern-revision/{id}/approve` | `approve` | PATTERN_REVISION_APPROVE |
| POST | `/api/pattern-revision/{id}/complete` | `complete` | PATTERN_REVISION_COMPLETE |
| POST | `/api/pattern-revision/{id}/reject` | `reject` | PATTERN_REVISION_REJECT |
| POST | `/api/pattern-revision/{id}/submit` | `submit` | PATTERN_REVISION_SUBMIT |
| PUT | `/api/pattern-revision/{id}` | `update` | PATTERN_REVISION_UPDATE |

#### ProductWarehousingController

- **基础路径**: `/api/production/warehousing`
- **端点数量**: 9 (GET: 3, POST: 4, PUT: 1, DELETE: 1)
- **权限控制**: 0/9 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/production/warehousing/{id}` | `delete` | - |
| GET | `/api/production/warehousing/list` | `list` | - |
| GET | `/api/production/warehousing/repair-stats` | `repairStats` | - |
| GET | `/api/production/warehousing/{id}` | `getById` | - |
| POST | `/api/production/warehousing` | `save` | - |
| POST | `/api/production/warehousing/batch` | `batchSave` | - |
| POST | `/api/production/warehousing/repair-stats/batch` | `batchRepairStats` | - |
| POST | `/api/production/warehousing/rollback-by-bundle` | `rollbackByBundle` | - |
| PUT | `/api/production/warehousing` | `update` | - |

#### ProductionOrderController

- **基础路径**: `/api/production/order`
- **端点数量**: 24 (GET: 8, POST: 13, PUT: 2, DELETE: 1)
- **权限控制**: 1/24 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/production/order/delete/{id}` | `delete` | - |
| GET | `/api/production/order/by-order-no/{orderNo}` | `getByOrderNo` | - |
| GET | `/api/production/order/detail-dto/{id}` | `detailDTO` | - |
| GET | `/api/production/order/detail/{id}` | `detail` | - |
| GET | `/api/production/order/flow/{id}` | `flow` | - |
| GET | `/api/production/order/list` | `list` | - |
| GET | `/api/production/order/node-operations/{id}` | `getNodeOperations` | - |
| GET | `/api/production/order/process-status/{orderId}` | `getAllProcessStatus` | - |
| GET | `/api/production/order/procurement-status/{orderId}` | `getProcurementStatus` | - |
| POST | `/api/production/order` | `add` | - |
| POST | `/api/production/order/close` | `close` | - |
| POST | `/api/production/order/complete` | `complete` | - |
| POST | `/api/production/order/confirm-procurement` | `confirmProcurement` | - |
| POST | `/api/production/order/delegate-process` | `delegateProcess` | PRODUCTION_ORDER_DELEGATE |
| POST | `/api/production/order/node-operations` | `saveNodeOperations` | - |
| POST | `/api/production/order/progress-workflow/lock` | `lockProgressWorkflow` | - |
| POST | `/api/production/order/progress-workflow/rollback` | `rollbackProgressWorkflow` | - |
| POST | `/api/production/order/recompute-progress` | `recomputeProgress` | - |
| POST | `/api/production/order/save` | `save` | - |
| POST | `/api/production/order/scrap` | `scrap` | - |
| POST | `/api/production/order/update-material-rate` | `updateMaterialRate` | - |
| POST | `/api/production/order/update-progress` | `updateProgress` | - |
| PUT | `/api/production/order` | `update` | - |
| PUT | `/api/production/order/quick-edit` | `quickEdit` | - |

#### ScanRecordController

- **基础路径**: `/api/production/scan`
- **端点数量**: 23 (GET: 16, POST: 7, PUT: 0, DELETE: 0)
- **权限控制**: 0/23 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/production/scan/history` | `getHistory` | - |
| GET | `/api/production/scan/list` | `list` | - |
| GET | `/api/production/scan/my-history` | `getMyHistory` | - |
| GET | `/api/production/scan/my-quality-tasks` | `getMyQualityTasks` | - |
| GET | `/api/production/scan/order-total-cost/{orderNo}` | `calculateOrderTotalCost` | - |
| GET | `/api/production/scan/order/{orderId}` | `getByOrderId` | - |
| GET | `/api/production/scan/personal-stats` | `personalStats` | - |
| GET | `/api/production/scan/process-price/{orderNo}/{processName}` | `getUnitPriceByProcess` | - |
| GET | `/api/production/scan/process-prices/{orderNo}` | `getProcessUnitPrices` | - |
| GET | `/api/production/scan/sku/is-completed` | `isSKUCompleted` | - |
| GET | `/api/production/scan/sku/list/{orderNo}` | `getSKUList` | - |
| GET | `/api/production/scan/sku/order-progress/{orderNo}` | `getOrderSKUProgress` | - |
| GET | `/api/production/scan/sku/progress` | `getSKUProgress` | - |
| GET | `/api/production/scan/sku/report/{orderNo}` | `generateSKUReport` | - |
| GET | `/api/production/scan/sku/statistics` | `querySKUStatistics` | - |
| GET | `/api/production/scan/style/{styleNo}` | `getByStyleNo` | - |
| POST | `/api/production/scan/cleanup` | `cleanup` | - |
| POST | `/api/production/scan/delete-full-link/{orderId}` | `deleteFullLinkByOrderId` | - |
| POST | `/api/production/scan/execute` | `execute` | - |
| POST | `/api/production/scan/sku/detect-mode` | `detectScanMode` | - |
| POST | `/api/production/scan/sku/validate` | `validateSKU` | - |
| POST | `/api/production/scan/undo` | `undo` | - |
| POST | `/api/production/scan/unit-price` | `resolveUnitPrice` | - |


### 库存 (stock)

#### SampleStockController

- **基础路径**: `/api/stock/sample`
- **端点数量**: 5 (GET: 2, POST: 3, PUT: 0, DELETE: 0)
- **权限控制**: 0/5 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/stock/sample/loan/list` | `listLoans` | - |
| GET | `/api/stock/sample/page` | `page` | - |
| POST | `/api/stock/sample/inbound` | `inbound` | - |
| POST | `/api/stock/sample/loan` | `loan` | - |
| POST | `/api/stock/sample/return` | `returnSample` | - |


### 款式/样衣管理 (style)

#### ProductSkuController

- **基础路径**: `/api/style/sku`
- **端点数量**: 5 (GET: 2, POST: 2, PUT: 1, DELETE: 0)
- **权限控制**: 0/5 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/style/sku/inventory/{skuCode}` | `getInventory` | - |
| GET | `/api/style/sku/list` | `list` | - |
| POST | `/api/style/sku/inventory/update` | `updateInventory` | - |
| POST | `/api/style/sku/sync/{styleId}` | `syncSkus` | - |
| PUT | `/api/style/sku/{id}` | `update` | - |

#### SecondaryProcessController

- **基础路径**: `/api/style/secondary-process`
- **端点数量**: 5 (GET: 2, POST: 1, PUT: 1, DELETE: 1)
- **权限控制**: 0/5 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/style/secondary-process/{id}` | `delete` | - |
| GET | `/api/style/secondary-process/list` | `listByStyleId` | - |
| GET | `/api/style/secondary-process/{id}` | `getById` | - |
| POST | `/api/style/secondary-process` | `create` | - |
| PUT | `/api/style/secondary-process/{id}` | `update` | - |

#### StyleAttachmentController

- **基础路径**: `/api/style/attachment`
- **端点数量**: 8 (GET: 3, POST: 4, PUT: 0, DELETE: 1)
- **权限控制**: 0/8 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/style/attachment/{id}` | `delete` | - |
| GET | `/api/style/attachment/list` | `list` | - |
| GET | `/api/style/attachment/pattern/check` | `checkPattern` | - |
| GET | `/api/style/attachment/pattern/versions` | `patternVersions` | - |
| POST | `/api/style/attachment/pattern/flow-to-center` | `flowPatternToCenter` | - |
| POST | `/api/style/attachment/pattern/upload` | `uploadPattern` | - |
| POST | `/api/style/attachment/upload` | `upload` | - |
| POST | `/api/style/attachment/upload-pattern` | `uploadPatternForDataCenter` | - |

#### StyleBomController

- **基础路径**: `/api/style/bom`
- **端点数量**: 11 (GET: 3, POST: 6, PUT: 1, DELETE: 1)
- **权限控制**: 0/11 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/style/bom/{id}` | `delete` | - |
| GET | `/api/style/bom/list` | `listByStyleId` | - |
| GET | `/api/style/bom/stock-summary/{styleId}` | `getBomStockSummary` | - |
| GET | `/api/style/bom/sync-jobs/{jobId}` | `getSyncJob` | - |
| POST | `/api/style/bom` | `save` | - |
| POST | `/api/style/bom/batch-check-stock` | `batchCheckBomStock` | - |
| POST | `/api/style/bom/check-stock/{styleId}` | `checkBomStock` | - |
| POST | `/api/style/bom/generate-purchase` | `generatePurchase` | - |
| POST | `/api/style/bom/{styleId}/sync-material-database` | `syncMaterialDatabase` | - |
| POST | `/api/style/bom/{styleId}/sync-material-database/async` | `syncMaterialDatabaseAsync` | - |
| PUT | `/api/style/bom` | `update` | - |

#### StyleInfoController

- **基础路径**: `/api/style/info`
- **端点数量**: 23 (GET: 4, POST: 16, PUT: 2, DELETE: 1)
- **权限控制**: 0/23 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/style/info/{id}` | `delete` | - |
| GET | `/api/style/info/development-stats` | `getDevelopmentStats` | - |
| GET | `/api/style/info/list` | `list` | - |
| GET | `/api/style/info/{id}` | `detail` | - |
| GET | `/api/style/info/{id}/production-req/lock` | `checkProductionReqLock` | - |
| POST | `/api/style/info` | `save` | - |
| POST | `/api/style/info/{id}/bom/complete` | `completeBom` | - |
| POST | `/api/style/info/{id}/bom/start` | `startBom` | - |
| POST | `/api/style/info/{id}/pattern/complete` | `completePattern` | - |
| POST | `/api/style/info/{id}/pattern/reset` | `resetPattern` | - |
| POST | `/api/style/info/{id}/pattern/start` | `startPattern` | - |
| POST | `/api/style/info/{id}/process/complete` | `completeProcess` | - |
| POST | `/api/style/info/{id}/process/start` | `startProcess` | - |
| POST | `/api/style/info/{id}/production-requirements/rollback` | `rollbackProductionRequirements` | - |
| POST | `/api/style/info/{id}/sample/complete` | `completeSample` | - |
| POST | `/api/style/info/{id}/sample/progress` | `updateSampleProgress` | - |
| POST | `/api/style/info/{id}/sample/reset` | `resetSample` | - |
| POST | `/api/style/info/{id}/sample/start` | `startSample` | - |
| POST | `/api/style/info/{id}/secondary/complete` | `completeSecondary` | - |
| POST | `/api/style/info/{id}/secondary/skip` | `skipSecondary` | - |
| POST | `/api/style/info/{id}/secondary/start` | `startSecondary` | - |
| PUT | `/api/style/info` | `update` | - |
| PUT | `/api/style/info/{id}/production-requirements` | `updateProductionRequirements` | - |

#### StyleOperationLogController

- **基础路径**: `/api/style/operation-log`
- **端点数量**: 1 (GET: 1, POST: 0, PUT: 0, DELETE: 0)
- **权限控制**: 0/1 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/style/operation-log/list` | `list` | - |

#### StyleProcessController

- **基础路径**: `/api/style/process`
- **端点数量**: 4 (GET: 1, POST: 1, PUT: 1, DELETE: 1)
- **权限控制**: 0/4 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/style/process/{id}` | `delete` | - |
| GET | `/api/style/process/list` | `listByStyleId` | - |
| POST | `/api/style/process` | `save` | - |
| PUT | `/api/style/process` | `update` | - |

#### StyleQuotationController

- **基础路径**: `/api/style/quotation`
- **端点数量**: 2 (GET: 1, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 0/2 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/style/quotation` | `getByStyleId` | - |
| POST | `/api/style/quotation` | `saveOrUpdate` | - |

#### StyleSizeController

- **基础路径**: `/api/style/size`
- **端点数量**: 4 (GET: 1, POST: 1, PUT: 1, DELETE: 1)
- **权限控制**: 0/4 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/style/size/{id}` | `delete` | - |
| GET | `/api/style/size/list` | `listByStyleId` | - |
| POST | `/api/style/size` | `save` | - |
| PUT | `/api/style/size` | `update` | - |

#### StyleSizePriceController

- **基础路径**: `/api/style/size-price`
- **端点数量**: 3 (GET: 1, POST: 1, PUT: 0, DELETE: 1)
- **权限控制**: 0/3 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/style/size-price/{id}` | `delete` | - |
| GET | `/api/style/size-price/list` | `list` | - |
| POST | `/api/style/size-price/batch-save` | `batchSave` | - |


### 系统管理 (system)

#### AuthController

- **基础路径**: `/api/auth`
- **端点数量**: 1 (GET: 0, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 0/1 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| POST | `/api/auth/register` | `register` | - |

#### DictController

- **基础路径**: `/api/system/dict`
- **端点数量**: 1 (GET: 1, POST: 0, PUT: 0, DELETE: 0)
- **权限控制**: 0/1 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/system/dict/list` | `list` | - |

#### FactoryController

- **基础路径**: `/api/system/factory`
- **端点数量**: 5 (GET: 2, POST: 1, PUT: 1, DELETE: 1)
- **权限控制**: 0/5 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/system/factory/{id}` | `delete` | - |
| GET | `/api/system/factory/list` | `list` | - |
| GET | `/api/system/factory/{id}` | `getById` | - |
| POST | `/api/system/factory` | `save` | - |
| PUT | `/api/system/factory` | `update` | - |

#### LoginLogController

- **基础路径**: `/api/system/login-log`
- **端点数量**: 3 (GET: 2, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 0/3 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/system/login-log/list` | `getLoginLogList` | - |
| GET | `/api/system/login-log/operations` | `getOperationLogs` | - |
| POST | `/api/system/login-log/operation` | `recordOperation` | - |

#### OperationLogController

- **基础路径**: `/api/system/operation-log`
- **端点数量**: 3 (GET: 2, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 2/3 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/system/operation-log/list` | `getOperationLogList` | MENU_LOGIN_LOG |
| GET | `/api/system/operation-log/{id}` | `getOperationLogById` | MENU_LOGIN_LOG |
| POST | `/api/system/operation-log` | `createOperationLog` | - |

#### PermissionController

- **基础路径**: `/api/system/permission`
- **端点数量**: 6 (GET: 3, POST: 1, PUT: 1, DELETE: 1)
- **权限控制**: 0/6 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/system/permission/{id}` | `deletePermission` | - |
| GET | `/api/system/permission/list` | `getPermissionList` | - |
| GET | `/api/system/permission/tree` | `getPermissionTree` | - |
| GET | `/api/system/permission/{id}` | `getPermissionById` | - |
| POST | `/api/system/permission` | `addPermission` | - |
| PUT | `/api/system/permission` | `updatePermission` | - |

#### RoleController

- **基础路径**: `/api/system/role`
- **端点数量**: 7 (GET: 3, POST: 1, PUT: 2, DELETE: 1)
- **权限控制**: 0/7 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/system/role/{id}` | `deleteRole` | - |
| GET | `/api/system/role/list` | `getRoleList` | - |
| GET | `/api/system/role/{id}` | `getRoleById` | - |
| GET | `/api/system/role/{id}/permission-ids` | `getRolePermissionIds` | - |
| POST | `/api/system/role` | `addRole` | - |
| PUT | `/api/system/role` | `updateRole` | - |
| PUT | `/api/system/role/{id}/permission-ids` | `updateRolePermissionIds` | - |

#### SerialController

- **基础路径**: `/api/system/serial`
- **端点数量**: 1 (GET: 1, POST: 0, PUT: 0, DELETE: 0)
- **权限控制**: 0/1 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/system/serial/generate` | `generate` | - |

#### UserController

- **基础路径**: `/api/system/user`
- **端点数量**: 14 (GET: 6, POST: 4, PUT: 3, DELETE: 1)
- **权限控制**: 0/14 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/system/user/{id}` | `deleteUser` | - |
| GET | `/api/system/user/list` | `getUserList` | - |
| GET | `/api/system/user/me` | `me` | - |
| GET | `/api/system/user/online-count` | `onlineCount` | - |
| GET | `/api/system/user/pending` | `getPendingUsers` | - |
| GET | `/api/system/user/permissions` | `getPermissionsByRole` | - |
| GET | `/api/system/user/{id}` | `getUserById` | - |
| POST | `/api/system/user` | `addUser` | - |
| POST | `/api/system/user/login` | `login` | - |
| POST | `/api/system/user/{id}/approve` | `approveUser` | - |
| POST | `/api/system/user/{id}/reject` | `rejectUser` | - |
| PUT | `/api/system/user` | `updateUser` | - |
| PUT | `/api/system/user/me` | `updateMe` | - |
| PUT | `/api/system/user/status` | `toggleStatus` | - |


### 模板库 (template)

#### TemplateLibraryController

- **基础路径**: `/api/template-library`
- **端点数量**: 13 (GET: 5, POST: 5, PUT: 2, DELETE: 1)
- **权限控制**: 0/13 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| DELETE | `/api/template-library/{id}` | `delete` | - |
| GET | `/api/template-library/list` | `list` | - |
| GET | `/api/template-library/process-unit-prices` | `processUnitPrices` | - |
| GET | `/api/template-library/progress-node-unit-prices` | `progressNodeUnitPrices` | - |
| GET | `/api/template-library/type/{templateType}` | `listByType` | - |
| GET | `/api/template-library/{id}` | `detail` | - |
| POST | `/api/template-library` | `create` | - |
| POST | `/api/template-library/apply-to-style` | `applyToStyle` | - |
| POST | `/api/template-library/create-from-style` | `createFromStyle` | - |
| POST | `/api/template-library/save` | `save` | - |
| POST | `/api/template-library/{id}/rollback` | `rollback` | - |
| PUT | `/api/template-library` | `update` | - |
| PUT | `/api/template-library/{id}` | `updateById` | - |

#### TemplateOperationLogController

- **基础路径**: `/api/template-library/operation-log`
- **端点数量**: 1 (GET: 1, POST: 0, PUT: 0, DELETE: 0)
- **权限控制**: 0/1 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/template-library/operation-log/list` | `list` | - |


### 仓库管理 (warehouse)

#### WarehouseDashboardController

- **基础路径**: `/api/warehouse/dashboard`
- **端点数量**: 4 (GET: 4, POST: 0, PUT: 0, DELETE: 0)
- **权限控制**: 4/4 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| GET | `/api/warehouse/dashboard/low-stock` | `getLowStockItems` | MENU_WAREHOUSE_DASHBOARD |
| GET | `/api/warehouse/dashboard/recent-operations` | `getRecentOperations` | MENU_WAREHOUSE_DASHBOARD |
| GET | `/api/warehouse/dashboard/stats` | `getStats` | MENU_WAREHOUSE_DASHBOARD |
| GET | `/api/warehouse/dashboard/trend` | `getTrendData` | MENU_WAREHOUSE_DASHBOARD |


### 微信小程序 (wechat)

#### WeChatMiniProgramAuthController

- **基础路径**: `/api/wechat/mini-program`
- **端点数量**: 1 (GET: 0, POST: 1, PUT: 0, DELETE: 0)
- **权限控制**: 0/1 个端点有权限注解

| HTTP方法 | 路径 | 方法名 | 权限码 |
|---------|------|--------|--------|
| POST | `/api/wechat/mini-program/login` | `login` | - |


## 🔍 RESTful规范分析

### 发现的问题

- ⚠️ `CommonController`: 基础路径 `/api/common` 可能需要使用复数形式
- ⚠️ `PerformanceController`: 基础路径 `/api/monitor/performance` 可能需要使用复数形式
- ⚠️ `LogisticsController.updateLogisticsStatus`: 路径 `/api/logistics/express-order/{id}/update-status` 包含动词，应使用HTTP方法表达操作
- ⚠️ `SampleStockController`: 基础路径 `/api/stock/sample` 可能需要使用复数形式
- ⚠️ `PayrollSettlementController`: 基础路径 `/api/finance/payroll-settlement` 可能需要使用复数形式
- ⚠️ `PayrollSettlementController.getOperatorSummary`: 查询操作应使用GET而不是POST
- ⚠️ `FinishedProductSettlementController`: 基础路径 `/api/finance/finished-settlement` 可能需要使用复数形式
- ⚠️ `PayrollApprovalController.updateStatus`: 路径 `/api/finance/payroll-approval/update-status` 包含动词，应使用HTTP方法表达操作
- ⚠️ `ShipmentReconciliationController.updateStatus`: 路径 `/api/finance/shipment-reconciliation/update-status` 包含动词，应使用HTTP方法表达操作
- ⚠️ `MaterialReconciliationController.updateStatus`: 路径 `/api/finance/material-reconciliation/update-status` 包含动词，应使用HTTP方法表达操作
- ⚠️ `MaterialPurchaseController`: 基础路径 `/api/production/purchase` 可能需要使用复数形式
- ⚠️ `MaterialPurchaseController.updateArrivedQuantity`: 路径 `/api/production/purchase/update-arrived-quantity` 包含动词，应使用HTTP方法表达操作
- ⚠️ `MaterialInboundController`: 基础路径 `/api/production/material/inbound` 可能需要使用复数形式
- ⚠️ `OrderManagementController`: 基础路径 `/api/order-management` 可能需要使用复数形式
- ⚠️ `OrderManagementController.createFromStyle`: 路径 `/api/order-management/create-from-style` 包含动词，应使用HTTP方法表达操作
- ⚠️ `OrderTransferController`: 基础路径 `/api/production/order/transfer` 可能需要使用复数形式
- ⚠️ `OrderTransferController.createTransfer`: 路径 `/api/production/order/transfer/create` 包含动词，应使用HTTP方法表达操作
- ⚠️ `PatternRevisionController`: 基础路径 `/api/pattern-revision` 可能需要使用复数形式
- ⚠️ `CuttingTaskController`: 基础路径 `/api/production/cutting-task` 可能需要使用复数形式
- ⚠️ `CuttingTaskController.createCustom`: 路径 `/api/production/cutting-task/custom/create` 包含动词，应使用HTTP方法表达操作
- ... 还有 34 个问题

## 📝 总结

- 系统共有 **51 个Controller**
- 提供 **330 个API端点**
- 其中 **27 个端点** 有权限控制
- 平均每个Controller有 **6.0 个端点**

**建议**：
- 继续保持使用 `@PreAuthorize` 进行细粒度的权限控制
- 考虑将一些超大Controller（端点数>20）拆分为多个子Controller
- 统一API路径命名规范，尽量遵循RESTful设计原则

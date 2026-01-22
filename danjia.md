# 单价逻辑说明

## 目标与范围
- 汇总系统内单价来源、计算与落库规则
- 覆盖生产、模板、对账、扫描等核心链路
- 标注关键入口与数据字段，便于排查与扩展

## 核心概念
- 单价：工序或订单的单位成本金额
- 工序单价：按环节配置的单位价格
- 总单价：多个环节单价合计
- 订单工价合计：总单价 × 订单数量

## 单价来源优先级
1. 款号报价总价
2. 进度模板的工序单价合计
3. 工序单价模板的匹配结果
4. 历史对账记录的最后单价
5. 款号资料中的价格字段

## ✅ 2026-01-21 优化内容

### 1. 单价为0时增加提示信息
- 文件: [ScanRecordOrchestrator.java](backend/src/main/java/com/fashion/supplychain/production/orchestration/ScanRecordOrchestrator.java)
- 方法: `resolveUnitPrice()`
- 返回字段新增 `unitPriceHint`，当单价为0时提示："未找到工序【xxx】的单价配置，请在模板中心设置工序单价模板"

### 2. 工序名称同义词映射表
- 新增文件: [ProcessSynonymMapping.java](backend/src/main/java/com/fashion/supplychain/common/ProcessSynonymMapping.java)
- 解决"车缝"vs"缝制"vs"生产"等同义词无法匹配的问题
- 支持的同义词组：
  - 采购: 物料采购、面辅料采购、备料、到料
  - 裁剪: 裁床、剪裁、开裁、裁片
  - 车缝: 缝制、缝纫、车工、生产、车位
  - 大烫: 整烫、熨烫、烫整
  - 质检: 检验、品检、验货、QC
  - 包装: 后整、打包、装箱
  - 入库: 仓储、上架、进仓

### 3. 单价修改审计日志
- 新增实体: [UnitPriceAuditLog.java](backend/src/main/java/com/fashion/supplychain/template/entity/UnitPriceAuditLog.java)
- 新增服务: [UnitPriceAuditLogService.java](backend/src/main/java/com/fashion/supplychain/template/service/UnitPriceAuditLogService.java)
- 记录字段: 款号、工序、修改前单价、修改后单价、变更来源、操作人、时间
- 数据库表: `t_unit_price_audit_log`

### 4. 纸样版本管理
- 扩展实体: [StyleAttachment.java](backend/src/main/java/com/fashion/supplychain/style/entity/StyleAttachment.java)
- 新增字段: version(版本号)、versionRemark(版本说明)、status(active/archived)、parentId(父版本ID)
- 新增API:
  - `POST /api/style/attachment/pattern/upload` - 上传纸样（支持版本管理）
  - `GET /api/style/attachment/pattern/versions` - 获取版本历史
  - `GET /api/style/attachment/pattern/check` - 检查纸样齐全
  - `POST /api/style/attachment/pattern/flow-to-center` - 流回资料中心
- 支持的bizType: pattern(纸样)、pattern_grading(放码文件)、pattern_final(最终定版)

### 5. 前端纸样管理增强
- 文件: [StylePatternTab.tsx](frontend/src/pages/StyleInfo/components/StylePatternTab.tsx)
- 新增"放码文件"标签页
- 新增纸样齐全检查提示
- 附件列表显示版本号和状态

### 6. 生产检查纸样齐全
- 创建订单时检查纸样是否齐全（只警告不阻止）
- 裁剪扫码时检查纸样是否齐全（只警告不阻止）

## 后端逻辑入口
### 基础对账单价解析
- 入口：[BaseReconciliationServiceImpl](file:///Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/finance/service/impl/BaseReconciliationServiceImpl.java)
- 解析逻辑：resolveTotalUnitPriceFromStyleQuotation
- 规则：优先用 styleId 获取报价，不可用则用 styleNo 查询款号资料再取报价

### 对账金额自动修正
- 入口：[BaseReconciliationServiceImpl](file:///Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/finance/service/impl/BaseReconciliationServiceImpl.java)
- 逻辑：autoFixAmounts
- 规则：在未审核未付款时，根据单价与数量重新计算总额和应付额

### 发货对账单价补全
- 入口：[ProductionOrderFinanceOrchestrationService](file:///Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionOrderFinanceOrchestrationService.java)
- 逻辑：发货对账构建中补全单价
- 规则：先尝试款号报价，总价无效则回退到历史单价或款号资料价格

### 进度模板单价合计
- 入口：[TemplateLibraryServiceImpl](file:///Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/template/service/impl/TemplateLibraryServiceImpl.java)
- 逻辑：resolveTotalUnitPriceFromProgressTemplate
- 规则：读取进度模板各节点单价求和

### 扫描记录单价匹配
- 入口：[ScanRecordOrchestrator](file:///Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ScanRecordOrchestrator.java)
- 逻辑：resolveUnitPrice
- 规则：从工序单价模板进行工序名称匹配

## 前端逻辑入口
### 生产进度详情单价编辑
- 入口：[ProgressDetail](file:///Users/guojunmini4/Documents/服装66666/frontend/src/pages/Production/ProgressDetail.tsx)
- 规则：主管及以上可编辑，冻结订单不可编辑
- 计算：单件工价合计为节点单价求和，订单工价合计为总单价×订单数量

### 工序单价模板维护
- 入口：[TemplateCenter](file:///Users/guojunmini4/Documents/服装66666/frontend/src/pages/TemplateCenter/index.tsx)
- 规则：工序名称不可重复，保存时绑定款号
- 匹配：根据工序名称精确或模糊匹配填充进度模板节点单价

## 关键数据字段
- styleId, styleNo：款号标识
- unitPrice：单价
- totalAmount：总额
- finalAmount：应付额
- quantity：数量
- deductionAmount：扣款

## 常见问题定位
- 单价为 0：优先检查款号报价是否存在且有效
- 对账金额不一致：确认是否触发自动修正逻辑
- 工序单价未匹配：检查工序名称规范化与模板是否保存
- 前端不可编辑：确认权限与订单冻结状态

## 关联入口速览
- 报价单价解析：[BaseReconciliationServiceImpl](file:///Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/finance/service/impl/BaseReconciliationServiceImpl.java)
- 进度模板合计：[TemplateLibraryServiceImpl](file:///Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/template/service/impl/TemplateLibraryServiceImpl.java)
- 发货对账补价：[ProductionOrderFinanceOrchestrationService](file:///Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionOrderFinanceOrchestrationService.java)
- 扫码单价匹配：[ScanRecordOrchestrator](file:///Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/orchestration/ScanRecordOrchestrator.java)
- 进度详情编辑：[ProgressDetail](file:///Users/guojunmini4/Documents/服装66666/frontend/src/pages/Production/ProgressDetail.tsx)
- 模板维护：[TemplateCenter](file:///Users/guojunmini4/Documents/服装66666/frontend/src/pages/TemplateCenter/index.tsx)

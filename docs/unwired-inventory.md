# 「做了没接」未接线方法盘点（D-851）

> 生成时间：2026-10-23 21:48｜共 156 处｜门禁：`python3 scripts/check-unwired.py --check`（只减不增）

## 判定口径

「未接线」= public 方法全后端零调用（已排除 Spring 端点/定时/事件监听/@PostConstruct 等框架回调，排除 getter/setter）。
**不代表都是 bug**——需按类别判断：预留能力保留、死代码清理、真缺陷接线。

## 分类结论

### 按类别分组】共 10 类

- **AI能力库（81 处）: AI 模块的能力/提示词/工具库，多数供 AiTool 内部按需调用或尚未接入对话流程
   backend/src/main/java/com/fashion/supplychain/intelligence/prompt/PromptVariantPersistenceService.java:25  PromptVariantEntity registerFromContent(Long tenantId, String intent, String content,
              )
   backend/src/main/java/com/fashion/supplychain/intelligence/prompt/PromptVariantPersistenceService.java:51  PromptVariantEntity pickVariantForIntent(Long tenantId, String intent)
   backend/src/main/java/com/fashion/supplychain/intelligence/prompt/PromptVariantPersistenceService.java:97  void bindSession(String sessionId, Long variantId)
   backend/src/main/java/com/fashion/supplychain/intelligence/prompt/PromptVariantPersistenceService.java:113  int totalVariants(Long tenantId, String intent)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/QdrantAdminOrchestrator.java:105  int clearTenantVectors(Long tenantId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AdvisorProfileOrchestrator.java:34  String buildProfilePrompt(Long tenantId, String userId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/QuickAnswerOrchestrator.java:44  void savePrebuiltWithTransaction(Long tenantId, String questionPattern,
                     )
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/QuickAnswerOrchestrator.java:55  int cleanExpiredWithTransaction()
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/OrderRiskTrackingOrchestrator.java:61  boolean resolveRisk(Long riskId, String handlingAction, String handlingResult)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/OrderRiskTrackingOrchestrator.java:80  boolean escalateRisk(Long riskId, String newAssignedTo)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/OrderRiskTrackingOrchestrator.java:99  boolean clearRisk(Long riskId, String cancelReason)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/OrderRiskTrackingOrchestrator.java:120  boolean reopenRisk(Long riskId, String reason)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AgentCheckpointService.java:127  void markThreadFailed(Long tenantId, String threadId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/SkillChainExecutionOrchestrator.java:243  void buildToolIndex(List<AgentTool> tools)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/KnowledgeGraphOrchestrator.java:169  List<KgSynonym> listSynonyms(Long tenantId, String entityType)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/OnnxModelService.java:194  void reloadModel()
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AgentMemoryService.java:71  void deleteCoreMemory(Long tenantId, String agentId, String key)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AgentMemoryService.java:213  void clearWorkingMemory(Long tenantId, String sessionId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/ProcessRewardOrchestrator.java:68  List<Map<String, Object>> aggregateForCurrentTenant(LocalDateTime since)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AdvisorSessionOrchestrator.java:36  String loadSessionContext(Long tenantId, String sessionId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/DecisionChainOrchestrator.java:87  String extractLesson(Long decisionId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AgentCardService.java:80  void deregisterAgent(Long tenantId, String agentId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/ApsSchedulingHelper.java:304  String parseFactoryId(String factoryId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/IntelligenceObservabilityOrchestrator.java:200  Map<String, Object> checkHealthIndicators(Long tenantId, int recentCount)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/MemoryNudgeOrchestrator.java:72  void acceptNudge(String nudgeId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/MemoryNudgeOrchestrator.java:81  void dismissNudge(String nudgeId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AuditTrailOrchestrator.java:167  void logUserFeedback(String commandId,
        String feedback,
        Integer s)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/PlatformIntelligenceOrchestrator.java:54  void writeAggregate(String metricKey, String metricDim, String period,
         )
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/SmartWorkflowOrchestrator.java:376  Map<String, Object> queryWorkflowHistory(String commandId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/TaskOrderMonitorOrchestrator.java:196  void updateTaskReminderStats(Long taskId, String reminderType)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AiOperationAuditOrchestrator.java:56  boolean approveAudit(Long auditId, String approvedBy)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/TaskTrackerOrchestrator.java:90  void completeTask(Long taskId, String resultSummary)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/TaskTrackerOrchestrator.java:105  void expireStaleTasks()
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/TaskTrackerOrchestrator.java:166  List<AiTaskTracker> listPendingTasksBySession(Long tenantId, String sessionId)
   backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/TaskTrackerOrchestrator.java:207  List<AiTaskTracker> listPendingTasksByAgent(Long tenantId, String agentName)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAgentTokenBudgetService.java:112  boolean tryDeduct(int promptTokens, int completionTokens)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAgentMetricsService.java:32  void recordRequestStart()
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAgentMetricsService.java:36  void recordRequestSuccess(long durationMs)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAgentMetricsService.java:41  void recordRequestFailure(long durationMs)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAgentMetricsService.java:54  void recordStuckDetected()
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAgentMetricsService.java:62  void recordDomainRoute(String domain)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/PiiMaskingService.java:82  int totalMasked()
   backend/src/main/java/com/fashion/supplychain/intelligence/service/PiiMaskingService.java:190  boolean containsPii(String text)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AgentContextFileLoaderService.java:132  String loadDomainContext(String domain)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/ProceduralMemoryService.java:128  String buildSopContext(List<ProceduralMemory> sops)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/ToolResultCacheService.java:276  void clearAll()
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AsyncIntelligenceAuditService.java:123  int pendingInsertCount()
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AsyncIntelligenceAuditService.java:127  int pendingUpdateCount()
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAdvisorService.java:200  String parseNlIntent(String question)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/IntentCompositionService.java:196  String mergeResponses(String originalQuestion, List<String> subResponses)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AgentBackgroundTaskService.java:140  <T> T parseInputParams(String taskId, Class<T> clazz)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/MemoryHierarchyService.java:140  void recordEpisode(Long tenantId, String userId, String summary,
              )
   backend/src/main/java/com/fashion/supplychain/intelligence/service/MemoryHierarchyService.java:172  void learnConcept(Long tenantId, String concept, String definition,
          )
   backend/src/main/java/com/fashion/supplychain/intelligence/service/ContextEngineeringService.java:229  String smartCompress(String toolResult, String queryContext)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/ContextEngineeringService.java:262  List<AiMessage> compressConversationHistory(List<AiMessage> messages)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/ContextEngineeringService.java:312  String buildMidConversationSummary(List<AiMessage> messages, int olderThanIndex)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/ContextEngineeringService.java:355  List<AiTool> filterRelevantTools(List<AiTool> allTools, String userMessage)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/OfflineEvalService.java:237  List<EvalItem> listItems(Long tenantId, Long datasetId, int limit)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/GraphRagService.java:210  int batchSyncRelations(Long tenantId, List<Map<String, String>> relations)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/PromptEvolutionService.java:183  void analyzeFeedbackTrends(Long tenantId)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/FactoryCalendarService.java:39  Set<LocalDate> loadWorkdays(String factoryId, LocalDate startDate, LocalDate endDate)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAgentToolAccessService.java:275  String generateApprovalToken(String toolName, Map<String, Object> args)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/AiAgentToolAccessService.java:313  Set<String> registeredToolNames()
   backend/src/main/java/com/fashion/supplychain/intelligence/service/ConversationMemoryService.java:311  void clearConversation(Long tenantId, String sessionId)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/VisionAnalysisService.java:100  VisionResult analyzeWithPrompt(String imageUrl, String prompt, String taskType)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/ProactiveInsightService.java:178  String buildInsightInjection(Long tenantId)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/GuardrailsConfigService.java:108  List<String> checkQuality(String content)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/MemoryBankService.java:183  void updateMemoryBank(Long tenantId, String sessionSummary,
                      )
   backend/src/main/java/com/fashion/supplychain/intelligence/service/MemoryBankService.java:205  void onArchitecturalChange(Long tenantId, String change)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/MemoryBankService.java:217  void onDecisionMade(Long tenantId, String decision, String rationale)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/MemoryBankService.java:222  void onTaskStatusChange(Long tenantId, String task, String status)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/MemoryBankService.java:237  void initializeIfAbsent(Long tenantId, String projectOverview)
   backend/src/main/java/com/fashion/supplychain/intelligence/service/EdgeTtsService.java:121  java.util.concurrent.CompletionStage<?> onBinary(java.net.http.WebSocket webSocket, ByteBuffer data, boolean )
   backend/src/main/java/com/fashion/supplychain/intelligence/helper/TextToSqlHelper.java:525  List<Map<String, Object>> extractData(ResultSet rs)
   backend/src/main/java/com/fashion/supplychain/intelligence/helper/PromptVariantHelper.java:161  int totalSegmentCount()
   backend/src/main/java/com/fashion/supplychain/intelligence/helper/PromptVariantHelper.java:165  PromptVariant mutateVariant(String segmentName, String newContent, String mutationReason)
   backend/src/main/java/com/fashion/supplychain/intelligence/helper/PromptVariantHelper.java:190  double autoEvaluateAndRecord(String segmentName, String variantId, String userMessage,
  )
   backend/src/main/java/com/fashion/supplychain/intelligence/helper/PromptVariantHelper.java:218  void autoPromoteIfEligible(String segmentName)
   backend/src/main/java/com/fashion/supplychain/intelligence/helper/ClosedOrderAiDataCleanupHelper.java:127  int cleanupAllTerminalOrders()
   backend/src/main/java/com/fashion/supplychain/intelligence/engine/dag/DagExecutor.java:194  int activeThreadCount()
   backend/src/main/java/com/fashion/supplychain/intelligence/engine/risk/AutoRemediationExecutor.java:138  boolean executeApprovedAction(Long tenantId, AiPatrolAction action)

- **其他（23 处）: 需要人工判断
   backend/src/main/java/com/fashion/supplychain/config/DatabaseMigrationHelper.java:212  boolean viewExists(String viewName)
   backend/src/main/java/com/fashion/supplychain/common/QdrantService.java:2350  boolean deleteArchivalCollection(Long tenantId)
   backend/src/main/java/com/fashion/supplychain/selection/service/SerpApiTrendService.java:275  List<Map<String, Object>> searchShopping(String keyword, int limit)
   backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionProcessTrackingOrchestrator.java:372  void createWarehousingTrackingOnScan(CuttingBundle bundle,
            com.fashion.supplychain.pr)
   backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionCleanupOrchestrator.java:93  void cleanupOrphanData()
   backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionCleanupOrchestrator.java:346  Map<String, Object> deleteFullLinkByOrderKey(String orderKey)
   backend/src/main/java/com/fashion/supplychain/production/orchestration/DeliverySlaOrchestrator.java:59  void batchRefreshSla()
   backend/src/main/java/com/fashion/supplychain/production/orchestration/SysNoticeOrchestrator.java:275  void sendWorkerAlert(Long tenantId, String workerName, ProductionOrder order)
   backend/src/main/java/com/fashion/supplychain/production/orchestration/MaterialInboundOrchestrator.java:418  List<MaterialInbound> queryInboundRecords(String purchaseId, String materialCode)
   backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionStyleOrchestrator.java:58  List<ProductionOrder> listOrdersByStyleNo(String styleNo)
   backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionStyleOrchestrator.java:109  int syncStyleInfoToOrders(Long styleId)
   backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionStyleOrchestrator.java:194  long countOrdersByStyleId(Long styleId)
   backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionStyleOrchestrator.java:217  int batchUpdateOrderStyleInfo(Long styleId, String styleName, String styleCover)
   backend/src/main/java/com/fashion/supplychain/production/orchestration/MaterialPickingOrchestrator.java:320  void deleteItemsByPickingId(String pickingId)
   backend/src/main/java/com/fashion/supplychain/production/service/CuttingBundleLookupService.java:55  CuttingBundle lookupFromParams(Map<String, Object> params)
   backend/src/main/java/com/fashion/supplychain/pos/orchestration/MemberOrchestrator.java:255  BigDecimal refundBalance(String memberId, BigDecimal amount, String saleNo)
   backend/src/main/java/com/fashion/supplychain/system/orchestration/OrderRemarkOrchestrator.java:142  List<OrderRemark> queryByTargetNo(String targetType, String targetNo)
   backend/src/main/java/com/fashion/supplychain/system/orchestration/OrganizationUnitOrchestrator.java:521  void ensureFactoryNodes()
   backend/src/main/java/com/fashion/supplychain/system/service/AppStoreService.java:30  List<AppStore> listWithJson()
   backend/src/main/java/com/fashion/supplychain/template/orchestration/TemplateStyleOrchestrator.java:735  int batchApplyBomTemplate(String templateId, List<Long> targetStyleIds, boolean overwr)
   backend/src/main/java/com/fashion/supplychain/template/orchestration/TemplateStyleOrchestrator.java:773  int batchApplyProcessTemplate(String templateId, List<Long> targetStyleIds, boolean overwr)
   backend/src/main/java/com/fashion/supplychain/shop/orchestration/ShopConsumerOrchestrator.java:211  ShopConsumerAddress defaultAddress(String consumerId)
   backend/src/main/java/com/fashion/supplychain/intelligence/agent/sse/SseEmitterHelper.java:81  SseEmitter createEmitter(long timeoutMs)

- **款式域（13 处）: 款式/SKU 域能力
   backend/src/main/java/com/fashion/supplychain/style/orchestration/CostVarianceOrchestrator.java:18  void computeAndPersistVariance(StyleQuotation q)
   backend/src/main/java/com/fashion/supplychain/style/orchestration/StyleInfoOrchestrator.java:653  Object deleteWithApproval(Long id, String reason)
   backend/src/main/java/com/fashion/supplychain/style/orchestration/StyleQuotationAuditOrchestrator.java:68  void resetAuditStatus(Long styleId)
   backend/src/main/java/com/fashion/supplychain/style/orchestration/StyleAttachmentOrchestrator.java:247  StyleAttachment saveGenerated(byte[] content, String fileName, String styleId, String bizT)
   backend/src/main/java/com/fashion/supplychain/style/helper/StyleCustomerSyncHelper.java:73  void syncCustomerInfoBatch(java.util.List<StyleInfo> styleList)
   backend/src/main/java/com/fashion/supplychain/style/helper/StyleCustomerSyncHelper.java:129  java.util.Map<String, Object> extractCustomerInfo(StyleInfo style)
   backend/src/main/java/com/fashion/supplychain/style/helper/StyleBomMaterialSyncHelper.java:167  void tryCreateBomTemplate(Long styleId)
   backend/src/main/java/com/fashion/supplychain/style/helper/StyleBomMaterialSyncHelper.java:182  void autoSyncBomRow(StyleBom styleBom)
   backend/src/main/java/com/fashion/supplychain/style/helper/StyleOperationAppendHelper.java:100  void appendPushToOrder(Long styleId, String pushedBy)
   backend/src/main/java/com/fashion/supplychain/style/helper/StyleLogHelper.java:46  void savePatternLog(Long styleId, String action, String remark)
   backend/src/main/java/com/fashion/supplychain/style/helper/StyleLogHelper.java:50  void saveSampleLog(Long styleId, String action, String remark)
   backend/src/main/java/com/fashion/supplychain/style/service/impl/StyleProcessServiceImpl.java:49  void clearProcessCache(Long styleId)
   backend/src/main/java/com/fashion/supplychain/style/service/impl/SecondaryProcessServiceImpl.java:49  void clearSecondaryCache(Long styleId)

- **外部集成（11 处）: 第三方对接抽象，可能仅部分平台使用
   backend/src/main/java/com/fashion/supplychain/integration/sync/service/EcSyncLogService.java:78  List<EcSyncLog> findDeadLetters(Long tenantId)
   backend/src/main/java/com/fashion/supplychain/integration/im/service/FeishuNotifyService.java:148  void sendPostForTenant(Long tenantId, String title, String content)
   backend/src/main/java/com/fashion/supplychain/integration/openapi/orchestration/TenantAppOrchestrator.java:168  Page<TenantAppResponse> listAllApps(String appType, String status, int page, int size)
   backend/src/main/java/com/fashion/supplychain/integration/payment/orchestration/PaymentConfigOrchestrator.java:123  void assertNotifyUrlConfigured(Long tenantId, PaymentGateway.PaymentType type)
   backend/src/main/java/com/fashion/supplychain/integration/payment/orchestration/PaymentConfirmOrchestrator.java:130  List<String> registeredBizTypes()
   backend/src/main/java/com/fashion/supplychain/integration/record/service/IntegrationRecordService.java:49  PaymentRecord savePaymentRecord(Long tenantId, String orderId, String channel,
             )
   backend/src/main/java/com/fashion/supplychain/integration/record/service/IntegrationRecordService.java:70  void savePaymentFailure(Long tenantId, String orderId, String channel,
             )
   backend/src/main/java/com/fashion/supplychain/integration/record/service/IntegrationRecordService.java:91  void updatePaymentStatus(String thirdPartyOrderId, String status, Long actualAmount)
   backend/src/main/java/com/fashion/supplychain/integration/ecommerce/orchestration/EcRefundOrchestrator.java:42  Map<String, Object> processRefundRequest(Long tenantId, String orderNo, String reason)
   backend/src/main/java/com/fashion/supplychain/integration/ecommerce/service/EcOrderSplitService.java:16  List<EcOrderSplit> listByOriginalOrderId(Long tenantId, Long originalOrderId)
   backend/src/main/java/com/fashion/supplychain/integration/ecommerce/service/EcPlatformBillService.java:44  boolean existsByPeriodAndOrder(Long tenantId, String platform, String billPeriod, String pl)

- **账务（10 处）: 账务能力未接线 = 可能少生成账单/应收，需核实
   backend/src/main/java/com/fashion/supplychain/finance/orchestration/MaterialReconciliationSyncOrchestrator.java:87  int syncFromPurchase(String purchaseId)
   backend/src/main/java/com/fashion/supplychain/finance/orchestration/MaterialReconciliationSyncOrchestrator.java:138  int syncByDateRange(String startDate, String endDate)
   backend/src/main/java/com/fashion/supplychain/finance/orchestration/ExternalAccountingOrchestrator.java:15  void syncReceivableToKingdee(String orderNo, BigDecimal amount, String customerId)
   backend/src/main/java/com/fashion/supplychain/finance/orchestration/ExternalAccountingOrchestrator.java:20  void syncPayableToYonyou(String purchaseNo, BigDecimal amount, String supplierId)
   backend/src/main/java/com/fashion/supplychain/finance/helper/WagePaymentLogAppendHelper.java:39  void appendSaveAccount(String ownerId, String ownerType, String accountType)
   backend/src/main/java/com/fashion/supplychain/finance/helper/WagePaymentLogAppendHelper.java:52  void appendConfirmOfflinePayment(String paymentId, String paymentNo)
   backend/src/main/java/com/fashion/supplychain/finance/helper/WagePaymentLogAppendHelper.java:60  void appendCancelPayment(String paymentId, String paymentNo, String reason)
   backend/src/main/java/com/fashion/supplychain/finance/helper/WagePaymentLogAppendHelper.java:65  void appendRefundPayment(String paymentId, String paymentNo, String reason)
   backend/src/main/java/com/fashion/supplychain/finance/helper/WagePaymentLogAppendHelper.java:70  void appendCreatePendingPayable(String payeeId, String amount)
   backend/src/main/java/com/fashion/supplychain/finance/helper/WagePaymentLogAppendHelper.java:74  void appendRejectPayable(String payeeId, String reason)

- **生产helper（10 处）: 生产的日志/装配/同步 helper，常见于漏接入
   backend/src/main/java/com/fashion/supplychain/production/helper/CuttingWorkflowBuilderHelper.java:156  String buildCuttingDefaultWorkflowJson()
   backend/src/main/java/com/fashion/supplychain/production/helper/PurchaseCartLogAppendHelper.java:61  void appendUpdateQuantity(String cartId, Integer quantity)
   backend/src/main/java/com/fashion/supplychain/production/helper/ProductionOrderLogAppendHelper.java:49  void appendCreateFromStyle(String orderId, String styleNo)
   backend/src/main/java/com/fashion/supplychain/production/helper/ProductWarehousingLogAppendHelper.java:59  void appendBatchWarehousing(String orderId, int itemCount)
   backend/src/main/java/com/fashion/supplychain/production/helper/MaterialDatabaseLogAppendHelper.java:53  void appendStockIn(String materialId, Integer quantity)
   backend/src/main/java/com/fashion/supplychain/production/helper/MaterialDatabaseLogAppendHelper.java:57  void appendStockOut(String materialId, Integer quantity)
   backend/src/main/java/com/fashion/supplychain/production/helper/MaterialDatabaseLogAppendHelper.java:61  void appendPriceChange(String materialId, String oldPrice, String newPrice)
   backend/src/main/java/com/fashion/supplychain/production/helper/MaterialInboundLogAppendHelper.java:58  void appendQualityCheck(String inboundId, String result)
   backend/src/main/java/com/fashion/supplychain/production/helper/OrderCostSummaryHelper.java:98  int summaryAllInternalOrders()
   backend/src/main/java/com/fashion/supplychain/production/helper/InventoryValidator.java:206  void validateMultipleStages(ProductionOrder order, int incomingQty,
                    )

- **高危-脱敏（3 处）: 脱敏方法未接线 = 接口可能泄露敏感字段，必须核实
   backend/src/main/java/com/fashion/supplychain/common/SensitiveDataMaskHelper.java:36  void maskPriceInMapList(List<Map<String, Object>> list)
   backend/src/main/java/com/fashion/supplychain/common/SensitiveDataMaskHelper.java:62  void maskPhoneInMapList(List<Map<String, Object>> list)
   backend/src/main/java/com/fashion/supplychain/common/SensitiveDataMaskHelper.java:78  void maskSensitiveFieldsInMap(Map<String, Object> data)

- **高危-数据权限（2 处）: 权限过滤器未接线 = 权限可能形同虚设，必须核实
   backend/src/main/java/com/fashion/supplychain/common/DataPermissionHelper.java:24  <T> boolean applyOperatorFilter(QueryWrapper<T> wrapper,
            String operatorIdField,)
   backend/src/main/java/com/fashion/supplychain/common/DataPermissionHelper.java:147  void addPermissionParams(java.util.Map<String, Object> params)

- **仓储（2 处）: 仓储域能力
   backend/src/main/java/com/fashion/supplychain/warehouse/orchestration/MaterialPickupReceivableOrchestrator.java:40  void syncAfterApproval(MaterialPickupRecord record, String auditRemark)
   backend/src/main/java/com/fashion/supplychain/warehouse/helper/InventoryCheckLogAppendHelper.java:60  void appendAdjust(String itemId, Integer variance, String reason)

- **高危-库存流水（1 处）: 流水统一入口未接线，各业务分散写流水
   backend/src/main/java/com/fashion/supplychain/warehouse/orchestration/StockChangeLogOrchestrator.java:61  void logChange(String changeType, String stockType, String stockId,
       )

package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleSizeService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Collator;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Locale;
import javax.imageio.ImageIO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderOrchestrator {

    public static final String CLOSE_SOURCE_MY_ORDERS = "myOrders";
    public static final String CLOSE_SOURCE_PRODUCTION_PROGRESS = "productionProgress";

    // 尺码排序解析用正则预编译：避免在比较过程中重复编译，降低开销
    private static final java.util.regex.Pattern PATTERN_NUMERIC_SIZE = java.util.regex.Pattern
            .compile("^\\d+(\\.\\d+)?$");

    private static final java.util.regex.Pattern PATTERN_NUM_XL = java.util.regex.Pattern.compile("^(\\d+)XL$");

    private static final java.util.regex.Pattern PATTERN_XS = java.util.regex.Pattern.compile("^(X{0,4})S$");

    private static final java.util.regex.Pattern PATTERN_XL = java.util.regex.Pattern.compile("^(X{1,4})L$");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private ProductionOrderProgressOrchestrationService progressOrchestrationService;

    @Autowired
    private ProductionOrderFinanceOrchestrationService financeOrchestrationService;

    @Autowired
    private ProductionOrderFlowOrchestrationService flowOrchestrationService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private com.fashion.supplychain.production.service.ScanRecordService scanRecordService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleSizeService styleSizeService;

    @Autowired
    private StyleAttachmentOrchestrator styleAttachmentOrchestrator;

    @Value("${fashion.upload-path}")
    private String uploadPath;

    public IPage<ProductionOrder> queryPage(Map<String, Object> params) {
        return productionOrderQueryService.queryPage(params);
    }

    /**
     * 获取全局订单统计数据（用于顶部统计卡片）
     * 返回符合筛选条件的订单统计，支持按工厂、关键词、状态筛选
     * 
     * @param params 查询参数（keyword, status, factoryName等）
     * @return 统计数据DTO
     */
    public com.fashion.supplychain.production.dto.ProductionOrderStatsDTO getGlobalStats(java.util.Map<String, Object> params) {
        return productionOrderQueryService.getGlobalStats(params);
    }

    public ProductionOrder getDetailById(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder order = productionOrderQueryService.getDetailById(oid);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }
        return order;
    }

    public ProductionOrder getDetailByOrderNo(String orderNo) {
        // 委托给QueryService，它会调用fillFlowStageFields填充二次工艺等所有进度数据
        ProductionOrder order = productionOrderQueryService.getDetailByOrderNo(orderNo);
        if (order == null) {
            throw new NoSuchElementException("生产订单不存在");
        }

        // 仅处理SKU生成逻辑
        if (StringUtils.hasText(order.getOrderDetails())) {
            try {
                List<Map<String, Object>> items = resolveOrderLines(order.getOrderDetails());
                if (items != null && !items.isEmpty()) {
                    String styleNo = StringUtils.hasText(order.getStyleNo()) ? order.getStyleNo().trim() : "";
                    String orderNoFinal = StringUtils.hasText(order.getOrderNo()) ? order.getOrderNo().trim() : "";
                    for (Map<String, Object> item : items) {
                        if (item == null || item.isEmpty()) {
                            continue;
                        }
                        String color = item.get("color") == null ? null : String.valueOf(item.get("color")).trim();
                        String size = item.get("size") == null ? null : String.valueOf(item.get("size")).trim();
                        if (!StringUtils.hasText(color) || !StringUtils.hasText(size)) {
                            continue;
                        }
                        String skuNo = buildSkuNo(orderNoFinal, styleNo, color, size);
                        item.put("skuNo", skuNo);
                        item.put("skuKey", skuNo);
                    }
                }
                order.setItems(items);
            } catch (Exception e) {
                System.err.println("解析订单明细失败: " + e.getMessage());
            }
        }

        return order;
    }

    public boolean saveOrUpdateOrder(ProductionOrder productionOrder) {
        if (productionOrder == null) {
            throw new IllegalArgumentException("参数错误");
        }
        boolean isCreate = productionOrder != null && !StringUtils.hasText(productionOrder.getId());
        ProductionOrder existed = null;
        String remarkForLog = null;
        if (!isCreate) {
            String orderId = StringUtils.hasText(productionOrder.getId()) ? productionOrder.getId().trim() : null;
            if (!StringUtils.hasText(orderId)) {
                throw new IllegalArgumentException("参数错误");
            }
            existed = productionOrderService.getById(orderId);
            if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
                throw new NoSuchElementException("生产订单不存在");
            }
            String st = safeText(existed.getStatus()).toLowerCase();
            if ("completed".equals(st)) {
                throw new IllegalStateException("订单已完成，无法编辑");
            }
            String remark = productionOrder.getOperationRemark();
            remarkForLog = StringUtils.hasText(remark) ? remark.trim() : "";
            if (!StringUtils.hasText(remarkForLog)) {
                throw new IllegalStateException("请填写操作备注");
            }
        }
        validateUnitPriceSources(productionOrder);

        // 创建订单时检查纸样是否齐全（只警告，不阻止）
        if (isCreate && productionOrder != null && StringUtils.hasText(productionOrder.getStyleId())) {
            checkPatternCompleteWarning(productionOrder.getStyleId());
        }

        boolean ok = productionOrderService.saveOrUpdateOrder(productionOrder);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }

        if (isCreate && productionOrder != null && StringUtils.hasText(productionOrder.getId())) {
            try {
                materialPurchaseService.generateDemandByOrderId(productionOrder.getId().trim(), false);
            } catch (Exception e) {
                String msg = e == null ? null : e.getMessage();
                if (msg == null || !msg.contains("已生成采购需求")) {
                    log.warn("Failed to generate material demand after order create: orderId={}",
                            productionOrder.getId(),
                            e);
                    scanRecordDomainService.insertOrchestrationFailure(
                            productionOrder,
                            "generateMaterialDemand",
                            msg == null ? "generateMaterialDemand failed" : ("generateMaterialDemand failed: " + msg),
                            LocalDateTime.now());
                }
            }

            // PDF自动生成功能已移除
        }

        if (!isCreate && existed != null && StringUtils.hasText(remarkForLog)) {
            try {
                ProductionOrder logOrder = productionOrderService.getById(existed.getId());
                scanRecordDomainService.insertOrderOperationRecord(logOrder != null ? logOrder : existed, "编辑",
                        remarkForLog, LocalDateTime.now());
            } catch (Exception e) {
                log.warn("Failed to log order edit: orderId={}", existed.getId(), e);
            }
        }

        return true;
    }

    private void validateUnitPriceSources(ProductionOrder productionOrder) {
        if (productionOrder == null) {
            throw new IllegalArgumentException("参数错误");
        }
        String details = safeText(productionOrder.getOrderDetails());
        if (!StringUtils.hasText(details)) {
            throw new IllegalStateException("订单明细缺少物料价格来源信息");
        }
        List<Map<String, Object>> lines = resolveOrderLines(details);
        if (lines == null || lines.isEmpty()) {
            throw new IllegalStateException("订单明细缺少物料价格来源信息");
        }
        for (Map<String, Object> r : lines) {
            if (r == null || r.isEmpty()) {
                continue;
            }
            String source = pickFirstText(r, "materialPriceSource", "material_price_source", "materialPrice来源", "物料价格来源");
            String acquiredAt = pickFirstText(r, "materialPriceAcquiredAt", "material_price_acquired_at", "materialPriceTime", "物料价格获取时间");
            String version = pickFirstText(r, "materialPriceVersion", "material_price_version", "materialPriceVer", "物料价格版本");
            if (!StringUtils.hasText(source) || !"物料采购系统".equals(source.trim())) {
                throw new IllegalStateException("物料价格来源必须为物料采购系统");
            }
            if (!StringUtils.hasText(acquiredAt)) {
                throw new IllegalStateException("物料价格获取时间不能为空");
            }
            if (!StringUtils.hasText(version)) {
                throw new IllegalStateException("物料价格版本不能为空");
            }
        }
    }

    private List<Map<String, Object>> resolveOrderLines(String details) {
        if (!StringUtils.hasText(details)) {
            return List.of();
        }
        try {
            List<Map<String, Object>> list = objectMapper.readValue(details,
                    new TypeReference<List<Map<String, Object>>>() {
                    });
            if (list != null) {
                return list;
            }
        } catch (Exception ignore) {
        }
        try {
            Map<String, Object> obj = objectMapper.readValue(details, new TypeReference<Map<String, Object>>() {
            });
            Object lines = obj == null ? null
                    : (obj.get("lines") != null ? obj.get("lines")
                            : (obj.get("items") != null ? obj.get("items")
                                    : (obj.get("details") != null ? obj.get("details") : obj.get("list"))));
            if (lines instanceof List) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> cast = (List<Map<String, Object>>) lines;
                return cast;
            }
        } catch (Exception ignore) {
        }
        return List.of();
    }

    private String buildSkuNo(String orderNo, String styleNo, String color, String size) {
        String on = StringUtils.hasText(orderNo) ? orderNo.trim() : "";
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        String c = StringUtils.hasText(color) ? color.trim() : "";
        String s = StringUtils.hasText(size) ? size.trim() : "";
        return String.format("%s:%s:%s:%s", on, sn, c, s);
    }

    private String pickFirstText(Map<String, Object> row, String... keys) {
        if (row == null || keys == null) {
            return "";
        }
        for (String k : keys) {
            if (!StringUtils.hasText(k)) {
                continue;
            }
            if (row.containsKey(k)) {
                return safeText(row.get(k));
            }
        }
        return "";
    }

    private String safeText(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    // PDF自动生成功能已移除

    public boolean deleteById(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        boolean ok = productionOrderService.deleteById(oid);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }

        try {
            // 级联删除关联的采购任务
            materialPurchaseService.deleteByOrderId(oid);
        } catch (Exception e) {
            log.warn("Failed to cascade delete material purchases: orderId={}", oid, e);
        }

        try {
            // 级联删除裁剪任务和裁剪单
            cuttingTaskService.deleteByOrderId(oid);
        } catch (Exception e) {
            log.warn("Failed to cascade delete cutting tasks: orderId={}", oid, e);
        }

        try {
            // 级联删除扫码记录
            scanRecordService.deleteByOrderId(oid);
        } catch (Exception e) {
            log.warn("Failed to cascade delete scan records: orderId={}", oid, e);
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean scrapOrder(String id, String remark) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        String r = StringUtils.hasText(remark) ? remark.trim() : null;
        if (!StringUtils.hasText(r)) {
            throw new IllegalArgumentException("remark不能为空");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        String st = safeText(existed.getStatus()).toLowerCase();
        if ("completed".equals(st)) {
            throw new IllegalStateException("订单已完成，无法报废");
        }

        // 2026-02-01: 移除采购完成限制 - 允许在任何阶段报废订单
        // ProductionOrder detail = productionOrderQueryService.getDetailById(oid);
        // ProductionOrder check = detail != null ? detail : existed;
        // if (isProcurementCompleted(check)) {
        //     throw new IllegalStateException("物料采购完成，无法报废");
        // }

        boolean ok = productionOrderService.deleteById(oid);
        if (!ok) {
            throw new IllegalStateException("报废失败");
        }
        try {
            scanRecordDomainService.insertOrderOperationRecord(existed, "报废", r, LocalDateTime.now());
        } catch (Exception e) {
            log.warn("Failed to log order scrap: orderId={}", oid, e);
        }
        return true;
    }

    public int recomputeProgressByStyleNo(String styleNo) {
        return progressOrchestrationService.recomputeProgressByStyleNo(styleNo);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateProductionProgress(String id, Integer progress, String rollbackRemark,
            String rollbackToProcessName) {
        return progressOrchestrationService.updateProductionProgress(id, progress, rollbackRemark,
                rollbackToProcessName);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateMaterialArrivalRate(String id, Integer rate) {
        return progressOrchestrationService.updateMaterialArrivalRate(id, rate);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        return financeOrchestrationService.completeProduction(id, tolerancePercent);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id, String sourceModule) {
        String src = StringUtils.hasText(sourceModule) ? sourceModule.trim() : null;
        if (!StringUtils.hasText(src)) {
            throw new AccessDeniedException("仅允许在指定模块完成");
        }
        if (!CLOSE_SOURCE_MY_ORDERS.equals(src) && !CLOSE_SOURCE_PRODUCTION_PROGRESS.equals(src)) {
            throw new AccessDeniedException("仅允许在我的订单或生产进度完成");
        }
        return financeOrchestrationService.closeOrder(id);
    }

    private boolean isProcurementCompleted(ProductionOrder order) {
        if (order == null) {
            return false;
        }
        Integer manual = order.getProcurementManuallyCompleted();
        boolean manualDone = manual != null && manual == 1;
        boolean endTimeDone = order.getProcurementEndTime() != null;
        Integer rate = order.getProcurementCompletionRate();
        boolean rateDone = rate != null && rate >= 100;
        return manualDone || endTimeDone || rateDone;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean autoCloseOrderIfEligible(String id) {
        return financeOrchestrationService.autoCloseOrderIfEligible(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean ensureFinanceRecordsForOrder(String orderId) {
        return financeOrchestrationService.ensureFinanceRecordsForOrder(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean ensureShipmentReconciliationForOrder(String orderId) {
        return financeOrchestrationService.ensureShipmentReconciliationForOrder(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public int backfillFinanceRecords() {
        return financeOrchestrationService.backfillFinanceRecords();
    }

    public ProductionOrderFlowOrchestrationService.OrderFlowResponse getOrderFlow(String orderId) {
        return flowOrchestrationService.getOrderFlow(orderId);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder lockProgressWorkflow(String id, String workflowJson) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限操作进度节点");
        }

        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        String st = existed.getStatus() == null ? "" : existed.getStatus().trim();
        if ("completed".equalsIgnoreCase(st)) {
            throw new IllegalStateException("订单已完成，无法操作");
        }

        Integer locked = existed.getProgressWorkflowLocked();
        if (locked != null && locked == 1) {
            throw new IllegalStateException("流程已锁定");
        }

        String text = StringUtils.hasText(workflowJson) ? workflowJson.trim() : null;
        if (!StringUtils.hasText(text)) {
            throw new IllegalArgumentException("workflowJson不能为空");
        }

        String normalized = normalizeProgressWorkflowJson(text);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalStateException("流程内容为空或不合法");
        }

        LocalDateTime now = LocalDateTime.now();
        UserContext ctx = UserContext.get();
        String uid = ctx == null ? null : ctx.getUserId();
        String uname = ctx == null ? null : ctx.getUsername();

        String uidTrim = uid == null ? null : uid.trim();
        uidTrim = StringUtils.hasText(uidTrim) ? uidTrim : null;
        String unameTrim = uname == null ? null : uname.trim();
        unameTrim = StringUtils.hasText(unameTrim) ? unameTrim : null;

        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowJson, normalized)
                .set(ProductionOrder::getProgressWorkflowLocked, 1)
                .set(ProductionOrder::getProgressWorkflowLockedAt, now)
                .set(ProductionOrder::getProgressWorkflowLockedBy, uidTrim)
                .set(ProductionOrder::getProgressWorkflowLockedByName, unameTrim)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        return getDetailById(oid);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder rollbackProgressWorkflow(String id, String reason) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }

        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        String remark = StringUtils.hasText(reason) ? reason.trim() : null;
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("reason不能为空");
        }

        ProductionOrder existed = productionOrderService.getById(oid);
        if (existed == null || existed.getDeleteFlag() == null || existed.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        LocalDateTime now = LocalDateTime.now();
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getProgressWorkflowLocked, 0)
                .set(ProductionOrder::getProgressWorkflowLockedAt, null)
                .set(ProductionOrder::getProgressWorkflowLockedBy, null)
                .set(ProductionOrder::getProgressWorkflowLockedByName, null)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("退回失败");
        }
        try {
            scanRecordDomainService.insertRollbackRecord(existed, "流程退回", remark, now);
        } catch (Exception e) {
            log.warn("Failed to log workflow rollback: orderId={}", oid, e);
        }

        return getDetailById(oid);
    }

    private String normalizeProgressWorkflowJson(String raw) {
        String text = StringUtils.hasText(raw) ? raw.trim() : null;
        if (!StringUtils.hasText(text)) {
            return null;
        }

        try {
            com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(text);
            com.fasterxml.jackson.databind.JsonNode arr = root == null ? null : root.get("nodes");
            if (arr == null || !arr.isArray()) {
                return null;
            }

            List<Map<String, Object>> outNodes = new ArrayList<>();
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            for (com.fasterxml.jackson.databind.JsonNode n : arr) {
                if (n == null) {
                    continue;
                }
                String name = n.hasNonNull("name") ? n.get("name").asText("") : "";
                name = StringUtils.hasText(name) ? name.trim() : "";
                if (!StringUtils.hasText(name)) {
                    continue;
                }
                String id = n.hasNonNull("id") ? n.get("id").asText("") : "";
                id = StringUtils.hasText(id) ? id.trim() : name;

                String idLower = id.trim().toLowerCase();
                if ("shipment".equals(idLower) || "出货".equals(name) || "发货".equals(name) || "发运".equals(name)) {
                    continue;
                }

                if (!seen.add(name)) {
                    continue;
                }

                java.math.BigDecimal unitPrice = java.math.BigDecimal.ZERO;
                if (n.hasNonNull("unitPrice")) {
                    com.fasterxml.jackson.databind.JsonNode v = n.get("unitPrice");
                    if (v != null) {
                        if (v.isNumber()) {
                            unitPrice = v.decimalValue();
                        } else {
                            try {
                                unitPrice = new java.math.BigDecimal(v.asText("0").trim());
                            } catch (Exception ignore) {
                                unitPrice = java.math.BigDecimal.ZERO;
                            }
                        }
                    }
                }
                if (unitPrice == null || unitPrice.compareTo(java.math.BigDecimal.ZERO) < 0) {
                    unitPrice = java.math.BigDecimal.ZERO;
                }

                outNodes.add(Map.of(
                        "id", id,
                        "name", name,
                        "unitPrice", unitPrice));
            }

            if (outNodes.isEmpty()) {
                return null;
            }

            return objectMapper.writeValueAsString(Map.of("nodes", outNodes));
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 检查纸样是否齐全（只记录警告，不阻止流程）
     */
    private void checkPatternCompleteWarning(String styleId) {
        if (!StringUtils.hasText(styleId)) {
            return;
        }
        try {
            boolean complete = styleAttachmentOrchestrator != null
                    && styleAttachmentOrchestrator.checkPatternComplete(styleId) != null
                    && Boolean.TRUE.equals(styleAttachmentOrchestrator.checkPatternComplete(styleId).get("complete"));
            if (!complete) {
                log.warn("Pattern files not complete for styleId={}, order creation continues with warning", styleId);
            }
        } catch (Exception e) {
            log.warn("Failed to check pattern complete for styleId={}: {}", styleId, e.getMessage());
        }
    }

    /**
     * 手动确认采购完成（允许50%物料差异）
     * 业务规则：
     * - materialArrivalRate < 50%: 不允许确认，必须继续采购
     * - materialArrivalRate >= 50%: 允许人工确认"回料完成"，需填写备注原因（即使100%也需要人工确认）
     *
     * @param orderId 订单ID
     * @param remark 确认备注（说明物料到货情况和确认原因）
     * @return 更新后的订单
     */
    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder confirmProcurement(String orderId, String remark) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        if (!StringUtils.hasText(remark) || remark.trim().length() < 10) {
            throw new IllegalArgumentException("确认备注至少需要10个字符，请详细说明确认原因");
        }

        // 获取订单详情（包含物料到货率）
        ProductionOrder order = productionOrderQueryService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("订单不存在: " + orderId);
        }

        // 验证物料到货率
        Integer materialArrivalRate = order.getMaterialArrivalRate();
        if (materialArrivalRate == null) {
            materialArrivalRate = 0;
        }

        // 物料到货率<50%：不允许确认
        if (materialArrivalRate < 50) {
            throw new IllegalStateException(
                String.format("物料到货率不足50%%（当前%d%%），不允许确认采购完成，请继续采购",
                    materialArrivalRate)
            );
        }

        // 已经确认过了
        Integer manuallyCompleted = order.getProcurementManuallyCompleted();
        if (manuallyCompleted != null && manuallyCompleted == 1) {
            throw new IllegalStateException("该订单采购已确认完成，无需重复确认");
        }

        // 更新确认信息
        LocalDateTime now = LocalDateTime.now();
        String userId = UserContext.userId();
        String username = UserContext.username();

        ProductionOrder updateEntity = new ProductionOrder();
        updateEntity.setId(orderId);
        updateEntity.setProcurementManuallyCompleted(1);
        updateEntity.setProcurementConfirmedBy(userId);
        updateEntity.setProcurementConfirmedByName(username);
        updateEntity.setProcurementConfirmedAt(now);
        updateEntity.setProcurementConfirmRemark(remark.trim());

        // 计算采购完成后的进度（采购是第1个节点）
        try {
            String workflowJson = order.getProgressWorkflowJson();
            if (StringUtils.hasText(workflowJson)) {
                ObjectMapper mapper = new ObjectMapper();
                Map<String, Object> workflow = mapper.readValue(workflowJson, new TypeReference<Map<String, Object>>() {});
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> nodes = (List<Map<String, Object>>) workflow.get("nodes");

                if (nodes != null && !nodes.isEmpty()) {
                    int totalNodes = nodes.size();
                    // 采购完成 = 第1个节点完成 = 1/N * 100
                    int progress = (int) Math.round(100.0 / totalNodes);
                    updateEntity.setProductionProgress(progress);
                    log.info("Order procurement confirmed - updating progress: orderId={}, totalNodes={}, progress={}%",
                            orderId, totalNodes, progress);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to calculate procurement progress: orderId={}", orderId, e);
            // 即使计算失败也继续，不阻断采购确认流程
        }

        boolean updated = productionOrderService.updateById(updateEntity);
        if (!updated) {
            throw new RuntimeException("更新采购确认信息失败");
        }

        log.info("Order procurement manually confirmed: orderId={}, materialArrivalRate={}%, confirmedBy={}, remark={}",
                orderId, materialArrivalRate, username, remark);

        // 记录扫码日志（用于追踪）
        try {
            scanRecordDomainService.insertRollbackRecord(
                order,
                "采购手动确认",
                String.format("物料到货率%d%%，确认人：%s，备注：%s", materialArrivalRate, username, remark),
                now
            );
        } catch (Exception e) {
            log.warn("Failed to log procurement confirmation: orderId={}", orderId, e);
        }

        // 返回更新后的完整订单信息
        return productionOrderQueryService.getDetailById(orderId);
    }

    /**
     * 从样衣信息创建生产订单
     * 会自动复制：BOM表、工序表、尺寸表、文件附件等
     *
     * @param styleId 样衣ID
     * @param priceType 单价类型：process(工序单价) 或 sizePrice(多码单价)
     * @param remark 备注
     * @return 创建的订单信息
     */
    @Transactional
    public Map<String, Object> createOrderFromStyle(String styleId, String priceType, String remark) {
        // 1. 验证参数
        if (!StringUtils.hasText(styleId)) {
            throw new IllegalArgumentException("样衣ID不能为空");
        }
        if (!StringUtils.hasText(priceType)) {
            throw new IllegalArgumentException("单价类型不能为空");
        }

        // 2. 获取样衣详细信息
        StyleInfo style = styleInfoService.getDetailById(Long.parseLong(styleId.trim()));
        if (style == null) {
            throw new NoSuchElementException("样衣信息不存在：" + styleId);
        }

        // 3. 检查样衣开发状态
        String progressNode = String.valueOf(style.getProgressNode() == null ? "" : style.getProgressNode()).trim();
        if (!"样衣完成".equals(progressNode)) {
            throw new IllegalStateException("样衣开发未完成，当前状态：" + progressNode + "，无法推送到下单管理");
        }

        // 4. 创建订单基本信息（暂时不保存到数据库，等所有数据准备好后一起保存）
        ProductionOrder newOrder = new ProductionOrder();
        newOrder.setStyleId(String.valueOf(style.getId()));
        newOrder.setStyleNo(style.getStyleNo());
        newOrder.setStyleName(style.getStyleName());
        newOrder.setRemarks(StringUtils.hasText(remark) ? remark.trim() : null);

        // 记录创建人信息
        String currentUserId = UserContext.userId();
        String currentUsername = UserContext.username();
        if (StringUtils.hasText(currentUserId)) {
            newOrder.setCreatedById(currentUserId);
        }
        if (StringUtils.hasText(currentUsername)) {
            newOrder.setCreatedByName(currentUsername);
        }

        // 设置初始状态
        newOrder.setProductionProgress(0);
        newOrder.setMaterialArrivalRate(0);
        newOrder.setStatus("pending"); // 待生产

        // 5. 保存订单获取ID
        boolean saved = productionOrderService.save(newOrder);
        if (!saved || newOrder.getId() == null) {
            throw new RuntimeException("创建订单失败");
        }

        String newOrderId = newOrder.getId();
        String orderNo = newOrder.getOrderNo(); // 数据库自动生成

        log.info("Created order from style: styleId={}, styleNo={}, orderId={}, orderNo={}",
                styleId, style.getStyleNo(), newOrderId, orderNo);

        // 6. 复制相关数据（BOM、工序、尺寸、附件等）
        try {
            // 从样衣复制数据到订单（如需要可在此实现）
            // 当前订单创建时已包含所有必要信息（styleId关联样衣数据）
            // BOM、工序、尺寸等数据通过 styleId 动态关联，无需复制
            // 附件通过 StyleAttachment 表的 styleId 字段关联
            // 如果后续需要订单独立数据副本，可实现以下方法：
            // copyBomData(style.getId(), newOrderId);
            // copyProcessData(style.getId(), newOrderId, priceType);
            // copySizeData(style.getId(), newOrderId);
            // copyAttachments(style.getId(), newOrderId);

            log.info("Order created with styleId={}, data linked via foreign key", styleId);
        } catch (Exception e) {
            log.error("Failed to copy data from style to order: styleId={}, orderId={}",
                    styleId, newOrderId, e);
            // 如果复制失败，删除已创建的订单
            productionOrderService.removeById(newOrderId);
            throw new RuntimeException("复制样衣数据失败：" + e.getMessage(), e);
        }

        // 7. 返回结果
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", newOrderId);
        result.put("orderNo", orderNo);
        result.put("styleNo", style.getStyleNo());
        result.put("styleName", style.getStyleName());

        return result;
    }

    /**
     * 获取订单的采购完成状态（用于工序明细显示）
     * 返回采购完成率、操作人、完成时间等信息
     *
     * @param orderId 订单ID
     * @return 采购状态信息：completed(是否完成)、completionRate(完成率)、operatorName(操作人)、completedTime(完成时间)
     */
    public Map<String, Object> getProcurementStatus(String orderId) {
        Map<String, Object> status = new LinkedHashMap<>();

        // 获取订单信息（包含物料到货率等）
        ProductionOrder order = productionOrderQueryService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("订单不存在: " + orderId);
        }

        // 获取物料到货率和人工确认状态
        Integer materialArrivalRate = order.getMaterialArrivalRate();
        Integer manuallyCompleted = order.getProcurementManuallyCompleted();
        boolean isManuallyConfirmed = (manuallyCompleted != null && manuallyCompleted == 1);

        // 判断采购是否完成
        boolean procurementComplete = false;
        String operatorName = null;
        LocalDateTime completedTime = null;

        if (materialArrivalRate != null && materialArrivalRate >= 100) {
            // 物料到货率=100%：自动认为采购完成
            procurementComplete = true;
            // 从采购单中获取最后一次收货的操作人和时间
            operatorName = order.getProcurementOperatorName();
            completedTime = order.getProcurementEndTime();
        } else if (materialArrivalRate != null && materialArrivalRate >= 50 && isManuallyConfirmed) {
            // 物料到货率≥50%且已人工确认：可以进入下一步
            procurementComplete = true;
            // 使用人工确认的操作人和时间
            operatorName = order.getProcurementConfirmedByName();
            completedTime = order.getProcurementConfirmedAt();
        }

        // 组装返回数据
        status.put("completed", procurementComplete);
        status.put("completionRate", materialArrivalRate != null ? materialArrivalRate : 0);
        status.put("operatorName", operatorName);
        status.put("completedTime", completedTime);
        status.put("manuallyConfirmed", isManuallyConfirmed);
        status.put("procurementStartTime", order.getProcurementStartTime());

        log.info("Retrieved procurement status for order: orderId={}, completed={}, rate={}%, operator={}",
                 orderId, procurementComplete, materialArrivalRate, operatorName);

        return status;
    }

    /**
     * 获取订单的所有工序节点状态（用于工序明细显示）
     * 返回裁剪、车缝、尾部、质检、入库等工序的完成状态、剩余数量、操作人等信息
     *
     * @param orderId 订单ID
     * @return 工序状态Map，key为工序阶段（cutting/sewing/finishing/quality/warehousing），value为状态详情
     */
    public Map<String, Map<String, Object>> getAllProcessStatus(String orderId) {
        Map<String, Map<String, Object>> allStatus = new LinkedHashMap<>();

        // 获取订单详细信息
        ProductionOrder order = productionOrderQueryService.getDetailById(orderId);
        if (order == null) {
            throw new NoSuchElementException("订单不存在: " + orderId);
        }

        Integer orderQty = order.getOrderQuantity() != null ? order.getOrderQuantity() : 0;
        Integer cuttingQty = order.getCuttingQuantity() != null ? order.getCuttingQuantity() : 0;
        Integer warehousingQty = order.getWarehousingQualifiedQuantity() != null ? order.getWarehousingQualifiedQuantity() : 0;

        // 1. 裁剪工序状态
        Map<String, Object> cuttingStatus = new LinkedHashMap<>();
        cuttingStatus.put("completed", order.getCuttingEndTime() != null);
        cuttingStatus.put("completionRate", order.getCuttingCompletionRate() != null ? order.getCuttingCompletionRate() : 0);
        cuttingStatus.put("completedQuantity", cuttingQty);
        cuttingStatus.put("remainingQuantity", orderQty - cuttingQty);
        cuttingStatus.put("operatorName", order.getCuttingOperatorName());
        cuttingStatus.put("startTime", order.getCuttingStartTime());
        cuttingStatus.put("completedTime", order.getCuttingEndTime());
        cuttingStatus.put("bundleCount", order.getCuttingBundleCount());
        allStatus.put("cutting", cuttingStatus);

        // 2. 车缝工序状态
        Map<String, Object> sewingStatus = new LinkedHashMap<>();
        sewingStatus.put("completed", order.getSewingEndTime() != null);
        sewingStatus.put("completionRate", order.getSewingCompletionRate() != null ? order.getSewingCompletionRate() : 0);
        // 车缝的完成数量等于入库数量（因为是按入库数量计算的）
        sewingStatus.put("completedQuantity", warehousingQty);
        sewingStatus.put("remainingQuantity", cuttingQty - warehousingQty);
        sewingStatus.put("operatorName", order.getSewingOperatorName());
        sewingStatus.put("startTime", order.getSewingStartTime());
        sewingStatus.put("completedTime", order.getSewingEndTime());
        allStatus.put("sewing", sewingStatus);

        // 3. 尾部工序状态（与车缝类似）
        Map<String, Object> finishingStatus = new LinkedHashMap<>();
        finishingStatus.put("completed", order.getQualityEndTime() != null);
        finishingStatus.put("completionRate", order.getQualityCompletionRate() != null ? order.getQualityCompletionRate() : 0);
        finishingStatus.put("completedQuantity", warehousingQty);
        finishingStatus.put("remainingQuantity", cuttingQty - warehousingQty);
        finishingStatus.put("operatorName", order.getQualityOperatorName());
        finishingStatus.put("startTime", order.getQualityStartTime());
        finishingStatus.put("completedTime", order.getQualityEndTime());
        allStatus.put("finishing", finishingStatus);

        // 4. 入库工序状态
        Map<String, Object> warehousingStatus = new LinkedHashMap<>();
        warehousingStatus.put("completed", order.getWarehousingEndTime() != null);
        warehousingStatus.put("completionRate", order.getWarehousingCompletionRate() != null ? order.getWarehousingCompletionRate() : 0);
        warehousingStatus.put("completedQuantity", warehousingQty);
        warehousingStatus.put("remainingQuantity", cuttingQty - warehousingQty);
        warehousingStatus.put("operatorName", order.getWarehousingOperatorName());
        warehousingStatus.put("startTime", order.getWarehousingStartTime());
        warehousingStatus.put("completedTime", order.getWarehousingEndTime());
        allStatus.put("warehousing", warehousingStatus);

        log.info("Retrieved all process status for order: orderId={}, cutting={}%, sewing={}%, finishing={}%, warehousing={}%",
                 orderId,
                 cuttingStatus.get("completionRate"),
                 sewingStatus.get("completionRate"),
                 finishingStatus.get("completionRate"),
                 warehousingStatus.get("completionRate"));

        return allStatus;
    }

    /**
     * 工序委派 - 将特定工序委派给工厂，并设置单价
     *
     * @param orderId 订单ID
     * @param processNode 工序节点（cutting/sewing/finishing/warehousing）
     * @param factoryId 工厂ID
     * @param unitPrice 单价（可选）
     */
    @Transactional
    public void delegateProcess(String orderId, String processNode, String factoryId, Double unitPrice) {
        // 验证订单是否存在
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new RuntimeException("订单不存在: " + orderId);
        }

        // 构建委派记录
        String delegationRecord = String.format(
            "工序[%s]委派给工厂[%s]，单价[%.2f]元，操作时间[%s]，操作人[%s]",
            getProcessNodeName(processNode),
            factoryId,
            unitPrice != null ? unitPrice : 0.0,
            new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date()),
            "当前用户" // TODO: 从SecurityContext获取当前登录用户
        );

        // 保存到订单的nodeOperations字段（JSON格式）
        String currentOperations = order.getNodeOperations();
        if (currentOperations == null || currentOperations.isEmpty()) {
            currentOperations = "{}";
        }

        // 简单追加记录（实际应该用JSON解析和更新）
        // TODO: 使用Jackson或Gson进行JSON操作
        String updatedOperations = currentOperations.replaceFirst("}",
            String.format("\"%s\":\"%s\"}", processNode, delegationRecord));

        order.setNodeOperations(updatedOperations);
        productionOrderService.updateById(order);

        log.info("工序委派成功 - 订单:{}, 工序:{}, 工厂:{}, 单价:{}",
            orderId, processNode, factoryId, unitPrice);
    }

    /**
     * 获取工序节点的中文名称
     */
    private String getProcessNodeName(String processNode) {
        switch (processNode) {
            case "cutting":
                return "裁剪";
            case "sewing":
                return "车缝";
            case "finishing":
                return "尾部";
            case "warehousing":
                return "入库";
            default:
                return processNode;
        }
    }
}

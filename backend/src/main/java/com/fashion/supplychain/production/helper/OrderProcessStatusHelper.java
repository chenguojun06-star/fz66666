package com.fashion.supplychain.production.helper;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class OrderProcessStatusHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderQueryService productionOrderQueryService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StyleAttachmentOrchestrator styleAttachmentOrchestrator;

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
     * 从样衣信息创建生产订单
     * 会自动复制：BOM表、工序表、尺寸表、文件附件等
     *
     * @param styleId 样衣ID
     * @param priceType 单价类型：process(工序单价) 或 sizePrice(多码单价)
     * @param remark 备注
     * @return 创建的订单信息
     */
    @Transactional(rollbackFor = Exception.class)
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

        // 从样衣同步跟单员和纸样师信息
        String merchandiserFromStyle = style.getOrderType(); // 跟单员存储在orderType字段
        if (StringUtils.hasText(merchandiserFromStyle)) {
            newOrder.setMerchandiser(merchandiserFromStyle.trim());
        }
        String patternMakerFromStyle = style.getSampleSupplier(); // 纸样师存储在sampleSupplier字段
        if (StringUtils.hasText(patternMakerFromStyle)) {
            newOrder.setPatternMaker(patternMakerFromStyle.trim());
        }

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
    @Transactional(rollbackFor = Exception.class)
    public void delegateProcess(String orderId, String processNode, String factoryId, Double unitPrice) {
        // 验证订单是否存在
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new RuntimeException("订单不存在: " + orderId);
        }

        // 获取当前登录用户
        UserContext ctx = UserContext.get();
        String operatorName = ctx != null && StringUtils.hasText(ctx.getUsername()) ? ctx.getUsername() : "系统";

        // 构建委派记录
        String delegationRecord = String.format(
            "工序[%s]委派给工厂[%s]，单价[%.2f]元，操作时间[%s]，操作人[%s]",
            getProcessNodeName(processNode),
            factoryId,
            unitPrice != null ? unitPrice : 0.0,
            new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new java.util.Date()),
            operatorName
        );

        // 使用Jackson安全操作JSON
        String currentOperations = order.getNodeOperations();
        try {
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> opsMap = (currentOperations != null && !currentOperations.isBlank())
                    ? objectMapper.readValue(currentOperations, java.util.Map.class)
                    : new java.util.LinkedHashMap<>();
            opsMap.put(processNode, delegationRecord);
            order.setNodeOperations(objectMapper.writeValueAsString(opsMap));
        } catch (Exception e) {
            log.warn("解析nodeOperations失败，使用新Map: {}", e.getMessage());
            java.util.Map<String, Object> opsMap = new java.util.LinkedHashMap<>();
            opsMap.put(processNode, delegationRecord);
            try {
                order.setNodeOperations(objectMapper.writeValueAsString(opsMap));
            } catch (Exception ex) {
                order.setNodeOperations("{\"" + processNode + "\":\"" + delegationRecord.replace("\"", "\\\"") + "\"}");
            }
        }

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

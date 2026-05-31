package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.QrCodeSigner;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.orchestration.SerialOrchestrator;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class SampleOrderCreationHelper {

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private PatternProductionService patternProductionService;
    @Autowired
    private CuttingBundleService cuttingBundleService;
    @Autowired
    private CuttingWorkflowBuilderHelper cuttingWorkflowBuilderHelper;
    @Autowired
    private QrCodeSigner qrCodeSigner;
    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;
    @Autowired
    private SerialOrchestrator serialOrchestrator;

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public Map<String, Object> createSampleProductionOrder(String patternProductionId) {
        PatternProduction pattern = patternProductionService.getById(patternProductionId);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("样板生产记录不存在");
        }
        if (StringUtils.hasText(pattern.getProductionOrderId())) {
            ProductionOrder existing = productionOrderService.getById(pattern.getProductionOrderId());
            if (existing != null) {
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("orderId", existing.getId());
                result.put("orderNo", existing.getOrderNo());
                result.put("patternId", patternProductionId);
                result.put("alreadyExists", true);
                return result;
            }
        }

        ProductionOrder order = buildSampleOrder(pattern);
        boolean saved = productionOrderService.save(order);
        if (!saved || !StringUtils.hasText(order.getId())) {
            throw new RuntimeException("创建样衣生产订单失败");
        }

        pattern.setProductionOrderId(order.getId());
        pattern.setUpdateBy(UserContext.username());
        pattern.setUpdateTime(LocalDateTime.now());
        patternProductionService.updateById(pattern);

        List<CuttingBundle> bundles = generateSampleBundles(order, pattern);
        if (!bundles.isEmpty()) {
            cuttingBundleService.saveBatch(bundles);
            registerProcessTrackingInitialization(order.getId(), bundles);
            log.info("[样衣订单] 生成{}个菲号, orderId={}", bundles.size(), order.getId());
        }

        log.info("[样衣订单] 创建成功: patternId={}, orderId={}, orderNo={}",
                patternProductionId, order.getId(), order.getOrderNo());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderId", order.getId());
        result.put("orderNo", order.getOrderNo());
        result.put("patternId", patternProductionId);
        result.put("bundleCount", bundles.size());
        result.put("alreadyExists", false);
        return result;
    }

    private ProductionOrder buildSampleOrder(PatternProduction pattern) {
        ProductionOrder order = new ProductionOrder();
        order.setStyleId(pattern.getStyleId());
        order.setStyleNo(pattern.getStyleNo());
        order.setSourceBizType("SAMPLE");
        order.setFactoryType("INTERNAL");
        order.setOrderQuantity(pattern.getQuantity() != null ? pattern.getQuantity() : 1);
        order.setProductionProgress(0);
        order.setMaterialArrivalRate(100);
        order.setProcurementManuallyCompleted(1);
        order.setStatus("pending");
        order.setActualStartDate(LocalDateTime.now());
        order.setRemarks("样衣生产订单（自动创建）");
        order.setCreatedById(UserContext.userId());
        order.setCreatedByName(UserContext.username());
        // 生成订单号
        order.setOrderNo(serialOrchestrator.generate("ORDER_NO"));
        if (StringUtils.hasText(pattern.getPatternMaker())) {
            order.setPatternMaker(pattern.getPatternMaker());
        }
        if (pattern.getDeliveryTime() != null) {
            order.setExpectedShipDate(pattern.getDeliveryTime());
            order.setPlannedEndDate(pattern.getDeliveryTime());
        }

        String workflow = cuttingWorkflowBuilderHelper.buildProgressWorkflowJson(pattern.getStyleNo());
        if (StringUtils.hasText(workflow)) {
            order.setProgressWorkflowJson(workflow);
        } else {
            order.setProgressWorkflowJson(buildSampleDefaultWorkflow());
        }

        return order;
    }

    private String buildSampleDefaultWorkflow() {
        List<Map<String, Object>> nodes = new ArrayList<>();
        String[][] defaults = {
            {"01", "采购", "采购"},
            {"02", "裁剪", "裁剪"},
            {"03", "车缝", "车缝"},
            {"04", "尾部", "尾部"},
            {"05", "入库", "入库"}
        };
        for (String[] d : defaults) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", d[0]);
            node.put("name", d[1]);
            node.put("processCode", d[0]);
            node.put("progressStage", d[2]);
            node.put("unitPrice", java.math.BigDecimal.ZERO);
            nodes.add(node);
        }
        Map<String, Object> workflow = new LinkedHashMap<>();
        workflow.put("nodes", nodes);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(workflow);
        } catch (Exception ex) {
            log.warn("构建样衣默认工序模板失败", ex);
            return null;
        }
    }

    private List<CuttingBundle> generateSampleBundles(ProductionOrder order, PatternProduction pattern) {
    List<CuttingBundle> result = new ArrayList<>();
    int totalQty = pattern.getQuantity() != null ? pattern.getQuantity() : 1;
    String color = StringUtils.hasText(pattern.getColor()) ? pattern.getColor().trim() : "默认";
    String size = StringUtils.hasText(pattern.getSize()) ? pattern.getSize().trim() : "均码";
        LocalDateTime now = LocalDateTime.now();

        Long existingCount = cuttingBundleService.count(
            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<CuttingBundle>()
                .eq(CuttingBundle::getProductionOrderId, order.getId()));
        int bundleIndex = existingCount == null ? 1 : existingCount.intValue() + 1;

        CuttingBundle maxBedBundle = cuttingBundleService.lambdaQuery()
                .eq(CuttingBundle::getTenantId, UserContext.tenantId())
                .orderByDesc(CuttingBundle::getBedNo)
                .last("LIMIT 1")
                .one();
        int bedNo = (maxBedBundle != null && maxBedBundle.getBedNo() != null)
                ? maxBedBundle.getBedNo() + 1 : 1;

        for (int i = 0; i < totalQty; i++) {
            CuttingBundle bundle = new CuttingBundle();
            bundle.setProductionOrderId(order.getId());
            bundle.setProductionOrderNo(order.getOrderNo());
            bundle.setStyleId(order.getStyleId());
            bundle.setStyleNo(order.getStyleNo());
            bundle.setColor(sanitizeForQrCode(color));
            bundle.setSize(sanitizeForQrCode(size));
            bundle.setQuantity(1);
            bundle.setBundleNo(bundleIndex + i);
            bundle.setBedNo(bedNo);
            bundle.setQrCode(buildSampleQrCode(order, color, size, 1, bundleIndex + i));
            bundle.setStatus("created");
            bundle.setCreateTime(now);
            bundle.setUpdateTime(now);
            result.add(bundle);
        }

        return result;
    }

    private String buildSampleQrCode(ProductionOrder order, String color, String size, int quantity, int bundleNo) {
        String orderNo = StringUtils.hasText(order.getOrderNo()) ? order.getOrderNo() : "";
        String styleNo = StringUtils.hasText(order.getStyleNo()) ? order.getStyleNo() : "";
        String c = sanitizeForQrCode(color);
        String s = sanitizeForQrCode(size);

        StringBuilder sb = new StringBuilder();
        sb.append(orderNo).append("-");
        sb.append(styleNo).append("-");
        sb.append(c).append("-");
        sb.append(s).append("-");
        sb.append(quantity).append("-");
        sb.append(bundleNo);

        String base = sb.toString();
        String skuNo = "SKU-" + orderNo + "-" + styleNo + "-" + c + "-" + s;
        String content = base + "|" + skuNo;

        return qrCodeSigner.sign(content);
    }

    private String sanitizeForQrCode(String value) {
        if (!StringUtils.hasText(value)) return "默认";
        String sanitized = value.trim();
        if (sanitized.contains("-")) {
            sanitized = sanitized.replace("-", "");
        }
        return sanitized;
    }

    private void registerProcessTrackingInitialization(String orderId, List<CuttingBundle> bundles) {
        int bundleCount = bundles == null ? 0 : bundles.size();
        Runnable action = () -> {
            try {
                processTrackingOrchestrator.appendProcessTracking(orderId, bundles);
                log.info("[样衣订单] 工序跟踪初始化成功: orderId={}, bundleCount={}", orderId, bundleCount);
            } catch (Exception e) {
                log.warn("[样衣订单] 工序跟踪初始化失败: orderId={}", orderId, e);
            }
        };

        if (TransactionSynchronizationManager.isSynchronizationActive()
                && TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            log.info("[样衣订单] 工序跟踪初始化已注册为事务后置动作: orderId={}, bundleCount={}", orderId, bundleCount);
            return;
        }

        action.run();
    }
}

package com.fashion.supplychain.production.helper;

import cn.hutool.jwt.JWT;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.OrderShareResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.production.util.ProductionOrderUtils;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class OrderShareHelper {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final long SHARE_TTL_MS = 30L * 24 * 60 * 60 * 1000;
    static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final byte[] jwtSecret;
    private final ProductionOrderService productionOrderService;
    private final ScanRecordService scanRecordService;
    private final SKUService skuService;

    public OrderShareHelper(
            @Value("${app.auth.jwt-secret:}") String secret,
            ProductionOrderService productionOrderService,
            ScanRecordService scanRecordService,
            SKUService skuService) {
        this.jwtSecret = (secret == null ? "" : secret.trim()).getBytes(StandardCharsets.UTF_8);
        this.productionOrderService = productionOrderService;
        this.scanRecordService = scanRecordService;
        this.skuService = skuService;
    }

    public byte[] jwtSecret() {
        return jwtSecret;
    }

    public String generateShareToken(String orderId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("未登录，无法生成分享链接");
        }
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        if (!Objects.equals(tenantId, order.getTenantId())) {
            throw new SecurityException("无权限分享此订单");
        }
        long now = System.currentTimeMillis();
        String token = JWT.create()
                .setPayload("type", "share")
                .setPayload("orderId", orderId)
                .setPayload("tenantId", String.valueOf(tenantId))
                .setIssuedAt(new Date(now))
                .setExpiresAt(new Date(now + SHARE_TTL_MS))
                .setKey(jwtSecret)
                .sign();
        log.info("[OrderShare] 生成分享令牌 orderId={} tenantId={}", orderId, tenantId);
        return token;
    }

    public Result<OrderShareResponse> resolveShareOrder(String token) {
        JWT jwt = parseAndVerifyToken(token);
        if (jwt == null) {
            return Result.fail("分享链接已失效或格式错误");
        }
        String type = String.valueOf(jwt.getPayload("type"));
        if (!"share".equals(type)) {
            return Result.fail("分享链接类型无效");
        }
        String orderId = extractOrderId(jwt);
        if (orderId == null) {
            return Result.fail("分享链接损坏");
        }
        Long tenantId = extractTenantId(jwt);
        if (tenantId == null) {
            return Result.fail("分享链接缺少租户信息");
        }
        UserContext previousContext = UserContext.get();
        UserContext shareQueryContext = new UserContext();
        shareQueryContext.setTenantId(tenantId);
        UserContext.set(shareQueryContext);
        try {
            ProductionOrder order = productionOrderService.getDetailById(orderId);
            if (order == null) {
                return Result.fail("订单不存在或已删除");
            }
            if (order.getTenantId() == null || !tenantId.equals(order.getTenantId())) {
                return Result.fail("分享链接无权访问该订单");
            }
            OrderShareResponse resp = buildShareResponse(token, jwt, order);
            return Result.success(resp);
        } finally {
            if (previousContext == null) {
                UserContext.clear();
            } else {
                UserContext.set(previousContext);
            }
        }
    }

    public String resolveSharedStyleCover(String token) {
        Result<OrderShareResponse> result = resolveShareOrder(token);
        if (!Integer.valueOf(200).equals(result.getCode()) || result.getData() == null) {
            return null;
        }
        return normalizeText(result.getData().getStyleCover());
    }

    private JWT parseAndVerifyToken(String token) {
        JWT jwt;
        try {
            jwt = JWT.of(token).setKey(jwtSecret);
        } catch (Exception e) {
            log.warn("[OrderShare] JWT解析失败: {}", e.getMessage());
            return null;
        }
        try {
            if (jwt.verify() && jwt.validate(0)) {
                return jwt;
            }
        } catch (Exception e) {
            log.warn("[OrderShare] JWT验证失败: {}", e.getMessage());
        }
        return null;
    }

    private String extractOrderId(JWT jwt) {
        Object raw = jwt.getPayload("orderId");
        return raw == null ? null : String.valueOf(raw);
    }

    private Long extractTenantId(JWT jwt) {
        String tenantIdText = jwt.getPayload("tenantId") == null
                ? null : String.valueOf(jwt.getPayload("tenantId"));
        if (tenantIdText == null || tenantIdText.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(tenantIdText);
        } catch (Exception e) {
            return null;
        }
    }

    private OrderShareResponse buildShareResponse(String token, JWT jwt, ProductionOrder order) {
        ScanSummary scanSummary = queryRecentScans(order.getId());
        LocalDate deliveryDate = order.getExpectedShipDate() != null
                ? order.getExpectedShipDate()
                : order.getPlannedEndDate() == null ? null : order.getPlannedEndDate().toLocalDate();
        String statusText = mapStatusText(order.getStatus());
        List<OrderShareResponse.StageProgress> stages = buildStageProgress(order, statusText);
        String currentStage = resolveCurrentStage(order, stages, scanSummary.latestScanStage, statusText);
        OrderShareResponse.AiPrediction aiPrediction = buildAiPrediction(order, deliveryDate);
        List<OrderShareResponse.ColorSizeQuantity> colorSizeQuantities = buildColorSizeQuantities(order);

        OrderShareResponse resp = new OrderShareResponse();
        resp.setToken(token);
        resp.setOrderNo(order.getOrderNo());
        resp.setStyleNo(order.getStyleNo());
        resp.setStyleName(order.getStyleName());
        resp.setStyleCover(normalizeText(order.getStyleCover()));
        resp.setColor(resolveShareColor(order, colorSizeQuantities));
        resp.setSize(order.getSize());
        resp.setOrderQuantity(order.getOrderQuantity());
        resp.setCompletedQuantity(order.getCompletedQuantity());
        resp.setProductionProgress(order.getProductionProgress());
        resp.setStatusText(statusText);
        resp.setFactoryName(order.getFactoryName());
        resp.setCompanyName(order.getCompany());
        resp.setRemarks(normalizeText(order.getRemarks()));
        resp.setLatestScanTime(scanSummary.latestScanTime);
        resp.setLatestScanStage(scanSummary.latestScanStage);
        resp.setCurrentStage(currentStage);
        resp.setSizeQuantities(buildSizeQuantities(order));
        resp.setColorSizeQuantities(colorSizeQuantities);
        resp.setStages(stages);
        resp.setRecentScans(scanSummary.recentScans);
        resp.setAiPrediction(aiPrediction);

        Object expObj = jwt.getPayload("exp");
        long expMs = expObj instanceof Date
                ? ((Date) expObj).getTime()
                : ((Number) expObj).longValue() * 1000;
        resp.setExpiresAt(expMs);

        if (deliveryDate != null) {
            resp.setPlannedEndDate(deliveryDate.format(DATE_FMT));
        }
        if (order.getActualEndDate() != null) {
            resp.setActualEndDate(order.getActualEndDate().format(DATE_FMT));
        }
        if (order.getCreateTime() != null) {
            resp.setCreateTime(order.getCreateTime().format(DATE_FMT));
        }
        return resp;
    }

    private static class ScanSummary {
        String latestScanTime;
        String latestScanStage;
        List<OrderShareResponse.ScanEntry> recentScans = new ArrayList<>();
    }

    private ScanSummary queryRecentScans(String orderId) {
        ScanSummary summary = new ScanSummary();
        try {
            QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
            qw.eq("order_id", orderId)
              .eq("scan_result", "success")
              .ne("scan_type", "orchestration")
              .eq("delete_flag", 0)
              .orderByDesc("scan_time")
              .last("LIMIT 8");
            List<ScanRecord> scans = scanRecordService.list(qw);
            if (!scans.isEmpty()) {
                ScanRecord latest = scans.get(0);
                if (latest.getScanTime() != null) {
                    summary.latestScanTime = latest.getScanTime().format(DATETIME_FMT);
                }
                summary.latestScanStage = latest.getProgressStage() != null
                        ? latest.getProgressStage()
                        : latest.getProcessName();
            }
            summary.recentScans = scans.stream().map(scan -> {
                OrderShareResponse.ScanEntry entry = new OrderShareResponse.ScanEntry();
                entry.setProcessName(scan.getProcessName() != null ? scan.getProcessName() : scan.getProgressStage());
                entry.setQuantity(scan.getQuantity());
                entry.setScanTime(scan.getScanTime() == null ? null : scan.getScanTime().format(DATETIME_FMT));
                return entry;
            }).toList();
        } catch (Exception e) {
            log.debug("[OrderShare] 查询扫码记录失败，跳过 orderId={}", orderId);
        }
        return summary;
    }

    private List<OrderShareResponse.StageProgress> buildStageProgress(ProductionOrder order, String statusText) {
        List<String> workflowNodes = parseWorkflowNodes(order);
        if (workflowNodes.isEmpty()) {
            workflowNodes = new ArrayList<>(List.of("采购", "裁剪", "车缝", "尾部", "质检", "入库"));
        }
        ensureTerminalStages(workflowNodes);
        String explicitCurrent = normalizeNodeName(order.getCurrentProcessName());
        int progressIndex = getNodeIndexFromProgress(workflowNodes, order.getProductionProgress());
        String derivedCurrent = workflowNodes.get(Math.max(0, Math.min(progressIndex, workflowNodes.size() - 1)));
        String currentStage = explicitCurrent != null && workflowNodes.contains(explicitCurrent) ? explicitCurrent : derivedCurrent;
        int currentIndex = workflowNodes.indexOf(currentStage);
        if (currentIndex < 0) {
            currentIndex = progressIndex;
        }
        List<OrderShareResponse.StageProgress> stages = new ArrayList<>();
        for (int i = 0; i < workflowNodes.size(); i++) {
            String stageName = workflowNodes.get(i);
            OrderShareResponse.StageProgress stage = new OrderShareResponse.StageProgress();
            stage.setStageName(stageName);
            stage.setRate(resolveStageDisplayRate(order, stageName, i, currentIndex, workflowNodes.size(), statusText));
            if ("已完成".equals(statusText) || i < currentIndex) {
                stage.setStatus("DONE");
            } else if (i == currentIndex) {
                stage.setStatus("ACTIVE");
            } else {
                stage.setStatus("PENDING");
            }
            stages.add(stage);
        }
        return stages;
    }

    private OrderShareResponse.AiPrediction buildAiPrediction(ProductionOrder order, LocalDate deliveryDate) {
        int progress = order.getProductionProgress() == null ? 0 : order.getProductionProgress();
        LocalDate today = LocalDate.now();
        String riskLevel;
        String riskReason;
        LocalDate predictedDate;
        if (deliveryDate != null) {
            long daysLeft = ChronoUnit.DAYS.between(today, deliveryDate);
            if (daysLeft < 0) {
                riskLevel = "HIGH";
                riskReason = "当前已逾期 " + Math.abs(daysLeft) + " 天，需要优先跟进。";
                predictedDate = today.plusDays(Math.max(2, Math.min(10, 100 - progress)));
            } else if (daysLeft <= 3 && progress < 80) {
                riskLevel = "HIGH";
                riskReason = "距离交期仅剩 " + daysLeft + " 天，当前进度为 " + progress + "%。";
                predictedDate = deliveryDate.plusDays(Math.max(1, (80 - progress + 19) / 20));
            } else if (daysLeft <= 7 && progress < 55) {
                riskLevel = "MEDIUM";
                riskReason = "交期临近，建议持续催进关键工序。";
                predictedDate = deliveryDate.plusDays(1);
            } else {
                riskLevel = "LOW";
                riskReason = "当前生产节奏正常，按计划推进中。";
                predictedDate = deliveryDate;
            }
        } else {
            riskLevel = progress < 30 ? "MEDIUM" : "LOW";
            riskReason = "暂未设置明确交期，系统根据当前进度给出预测。";
            predictedDate = today.plusDays(Math.max(3, (100 - progress + 9) / 10));
        }
        OrderShareResponse.AiPrediction prediction = new OrderShareResponse.AiPrediction();
        prediction.setPredictedFinishDate(predictedDate.format(DATE_FMT));
        prediction.setEstimatedRemainingDays((int) Math.max(0, ChronoUnit.DAYS.between(today, predictedDate)));
        prediction.setConfidence(progress >= 80 ? 90 : (progress >= 50 ? 76 : 62));
        prediction.setRiskLevel(riskLevel);
        prediction.setRiskReason(riskReason);
        return prediction;
    }

    private String resolveCurrentStage(ProductionOrder order, List<OrderShareResponse.StageProgress> stages, String latestScanStage, String statusText) {
        String currentProcessName = normalizeNodeName(order.getCurrentProcessName());
        if (currentProcessName != null) {
            boolean matched = stages.stream().anyMatch(stage -> currentProcessName.equals(normalizeNodeName(stage.getStageName())));
            if (matched) return currentProcessName;
        }
        String latestStage = normalizeNodeName(latestScanStage);
        if (latestStage != null) {
            boolean matched = stages.stream().anyMatch(stage -> latestStage.equals(normalizeNodeName(stage.getStageName())));
            if (matched) return latestStage;
        }
        for (OrderShareResponse.StageProgress stage : stages) {
            if ("ACTIVE".equals(stage.getStatus())) return stage.getStageName();
        }
        for (OrderShareResponse.StageProgress stage : stages) {
            if ("PENDING".equals(stage.getStatus())) return stage.getStageName();
        }
        return "已完成".equals(statusText) ? "已完成" : statusText;
    }

    private List<String> parseWorkflowNodes(ProductionOrder order) {
        String raw = order == null ? null : order.getProgressWorkflowJson();
        if (raw == null || raw.isBlank()) return new ArrayList<>();
        try {
            Map<?, ?> obj = OBJECT_MAPPER.readValue(raw, Map.class);
            Object itemsRaw = obj.get("nodes");
            List<?> list;
            if (itemsRaw instanceof List<?>) {
                list = (List<?>) itemsRaw;
            } else {
                itemsRaw = obj.get("steps");
                if (!(itemsRaw instanceof List<?>)) return new ArrayList<>();
                list = (List<?>) itemsRaw;
            }
            Set<String> names = new LinkedHashSet<>();
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> map)) continue;
                String name = normalizeNodeName(stringValue(map.get("name")));
                if (name == null) name = normalizeNodeName(stringValue(map.get("processName")));
                if (name == null || isHiddenShareNode(name)) continue;
                names.add(name);
            }
            return new ArrayList<>(names);
        } catch (Exception e) {
            log.warn("[OrderShare] 解析 progressWorkflowJson 失败 orderId={}", order == null ? null : order.getId(), e);
            return new ArrayList<>();
        }
    }

    private boolean isHiddenShareNode(String name) {
        return "出货".equals(name) || "发货".equals(name) || "发运".equals(name) || "shipment".equalsIgnoreCase(name);
    }

    private void ensureTerminalStages(List<String> nodes) {
        boolean hasQuality = nodes.stream().anyMatch(n -> "质检".equals(normalizeNodeName(n)));
        boolean hasWarehouse = nodes.stream().anyMatch(n -> "入库".equals(normalizeNodeName(n)));
        if (!hasQuality) {
            int warehouseIndex = -1;
            for (int i = 0; i < nodes.size(); i++) {
                if ("入库".equals(normalizeNodeName(nodes.get(i)))) { warehouseIndex = i; break; }
            }
            if (warehouseIndex >= 0) nodes.add(warehouseIndex, "质检");
            else nodes.add("质检");
        }
        if (!hasWarehouse) nodes.add("入库");
    }

    private String normalizeNodeName(String value) {
        if (value == null) return null;
        String text = value.trim();
        if (text.isEmpty()) return null;
        return switch (text) {
            case "采购备料", "采购", "procurement" -> "采购";
            case "缝制", "生产", "sewing" -> "车缝";
            case "后整", "整烫", "包装", "finishing" -> "尾部";
            case "质检", "quality" -> "质检";
            case "warehouse", "warehousing" -> "入库";
            default -> text;
        };
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private int getNodeIndexFromProgress(List<String> nodes, Integer progressValue) {
        if (nodes == null || nodes.isEmpty()) return 0;
        if (nodes.size() == 1) return 0;
        int progress = clampPercent(progressValue);
        int idx = Math.round((progress / 100f) * (nodes.size() - 1));
        return Math.max(0, Math.min(nodes.size() - 1, idx));
    }

    private int clampPercent(Integer value) {
        int safeValue = value == null ? 0 : value;
        return Math.max(0, Math.min(100, safeValue));
    }

    private int resolveStageDisplayRate(ProductionOrder order, String stageName, int stageIndex, int currentIndex, int totalStages, String statusText) {
        if ("已完成".equals(statusText) || stageIndex < currentIndex) return 100;
        if (stageIndex > currentIndex) return 0;
        int progress = clampPercent(order.getProductionProgress());
        if (totalStages <= 1) return progress;
        Integer actualRate = resolveActualRateByStage(order, stageName);
        if (actualRate != null && actualRate > 0) return clampPercent(actualRate);
        float start = (100f / totalStages) * stageIndex;
        float end = (100f / totalStages) * (stageIndex + 1);
        if (progress <= start) return 0;
        if (progress >= end) return 100;
        return Math.max(1, Math.min(99, Math.round(((progress - start) / Math.max(1f, end - start)) * 100f)));
    }

    private Integer resolveActualRateByStage(ProductionOrder order, String stageName) {
        return switch (normalizeNodeName(stageName)) {
            case "采购" -> firstNonNull(order.getProcurementCompletionRate(), order.getMaterialArrivalRate());
            case "裁剪" -> order.getCuttingCompletionRate();
            case "二次工艺" -> firstNonNull(order.getSecondaryProcessCompletionRate(), order.getSecondaryProcessRate());
            case "车缝" -> firstNonNull(order.getCarSewingCompletionRate(), order.getSewingCompletionRate());
            case "尾部" -> firstNonNull(order.getPackagingCompletionRate(), order.getIroningCompletionRate());
            case "质检" -> order.getQualityCompletionRate();
            case "入库" -> order.getWarehousingCompletionRate();
            default -> null;
        };
    }

    private Integer firstNonNull(Integer... values) {
        if (values == null) return null;
        for (Integer value : values) { if (value != null) return value; }
        return null;
    }

    private List<OrderShareResponse.SizeQuantity> buildSizeQuantities(ProductionOrder order) {
        if (order == null || order.getOrderNo() == null || order.getOrderNo().isBlank()) return new ArrayList<>();
        List<String> orderedSizes = parseSizeOrder(order.getSize());
        Map<String, Integer> quantityBySize = new HashMap<>();
        try {
            Map<String, Object> progress = skuService.getOrderSKUProgress(order.getOrderNo());
            Object skuListObj = progress == null ? null : progress.get("skuList");
            if (skuListObj instanceof List<?> skuList) {
                for (Object item : skuList) {
                    if (!(item instanceof Map<?, ?> sku)) continue;
                    String size = normalizeSizeValue(stringValue(sku.get("size")));
                    if (size == null) continue;
                    int quantity = parseInteger(sku.get("totalCount"));
                    quantityBySize.put(size, quantityBySize.getOrDefault(size, 0) + quantity);
                    if (!orderedSizes.contains(size)) orderedSizes.add(size);
                }
            }
        } catch (Exception e) {
            log.warn("[OrderShare] 获取尺码数量分布失败 orderNo={}", order == null ? null : order.getOrderNo(), e);
        }
        if (orderedSizes.isEmpty()) return new ArrayList<>();
        return orderedSizes.stream().map(size -> {
            OrderShareResponse.SizeQuantity item = new OrderShareResponse.SizeQuantity();
            item.setSize(size);
            item.setQuantity(Math.max(0, quantityBySize.getOrDefault(size, 0)));
            return item;
        }).collect(Collectors.toList());
    }

    private List<OrderShareResponse.ColorSizeQuantity> buildColorSizeQuantities(ProductionOrder order) {
        if (order == null) return new ArrayList<>();
        Map<String, Integer> quantityBySpec = new HashMap<>();
        Set<String> orderedKeys = new LinkedHashSet<>();
        collectFromOrderLines(order, quantityBySpec, orderedKeys);
        mergeFromSkuProgress(order, quantityBySpec, orderedKeys);
        if (orderedKeys.isEmpty()) return buildFallbackColorSize(order);
        return buildSortedColorSizeList(orderedKeys, quantityBySpec);
    }

    private void collectFromOrderLines(ProductionOrder order, Map<String, Integer> quantityBySpec, Set<String> orderedKeys) {
        List<Map<String, Object>> orderLines = ProductionOrderUtils.resolveOrderLines(order.getOrderDetails(), OBJECT_MAPPER);
        for (Map<String, Object> line : orderLines) {
            String color = normalizeText(stringValue(line.getOrDefault("color", line.getOrDefault("colour", line.getOrDefault("colorName", line.get("颜色"))))));
            String size = normalizeSizeValue(stringValue(line.getOrDefault("size", line.getOrDefault("sizeName", line.getOrDefault("spec", line.get("尺码"))))));
            int quantity = parseInteger(line.getOrDefault("quantity", line.getOrDefault("qty", line.getOrDefault("count", line.getOrDefault("num", line.get("数量"))))));
            if (color == null || size == null || quantity <= 0) continue;
            String key = color + "__" + size;
            quantityBySpec.put(key, quantityBySpec.getOrDefault(key, 0) + quantity);
            orderedKeys.add(key);
        }
    }

    private void mergeFromSkuProgress(ProductionOrder order, Map<String, Integer> quantityBySpec, Set<String> orderedKeys) {
        try {
            Map<String, Object> progress = order.getOrderNo() == null ? null : skuService.getOrderSKUProgress(order.getOrderNo());
            Object skuListObj = progress == null ? null : progress.get("skuList");
            if (skuListObj instanceof List<?> skuList) {
                for (Object item : skuList) {
                    if (!(item instanceof Map<?, ?> sku)) continue;
                    Object rawColor = sku.containsKey("color") ? sku.get("color") : (sku.containsKey("colour") ? sku.get("colour") : (sku.containsKey("colorName") ? sku.get("colorName") : sku.get("颜色")));
                    Object rawSize = sku.containsKey("size") ? sku.get("size") : (sku.containsKey("sizeName") ? sku.get("sizeName") : (sku.containsKey("spec") ? sku.get("spec") : sku.get("尺码")));
                    Object rawQuantity = sku.containsKey("totalCount") ? sku.get("totalCount") : (sku.containsKey("quantity") ? sku.get("quantity") : (sku.containsKey("qty") ? sku.get("qty") : sku.get("数量")));
                    String color = normalizeText(stringValue(rawColor));
                    String size = normalizeSizeValue(stringValue(rawSize));
                    int quantity = parseInteger(rawQuantity);
                    if (color == null || size == null || quantity <= 0) continue;
                    String key = color + "__" + size;
                    quantityBySpec.put(key, quantity);
                    orderedKeys.add(key);
                }
            }
        } catch (Exception e) {
            log.warn("[OrderShare] 获取颜色尺码分布失败 orderNo={}", order.getOrderNo(), e);
        }
    }

    private List<OrderShareResponse.ColorSizeQuantity> buildFallbackColorSize(ProductionOrder order) {
        String color = normalizeText(order.getColor());
        String size = normalizeSizeValue(order.getSize());
        int quantity = order.getOrderQuantity() == null ? 0 : Math.max(0, order.getOrderQuantity());
        if (color != null && size != null && quantity > 0) {
            OrderShareResponse.ColorSizeQuantity item = new OrderShareResponse.ColorSizeQuantity();
            item.setColor(color);
            item.setSize(size);
            item.setQuantity(quantity);
            return List.of(item);
        }
        return new ArrayList<>();
    }

    private List<OrderShareResponse.ColorSizeQuantity> buildSortedColorSizeList(Set<String> orderedKeys, Map<String, Integer> quantityBySpec) {
        return orderedKeys.stream().map(key -> {
            String[] parts = key.split("__", 2);
            OrderShareResponse.ColorSizeQuantity item = new OrderShareResponse.ColorSizeQuantity();
            item.setColor(parts.length > 0 ? parts[0] : null);
            item.setSize(parts.length > 1 ? parts[1] : null);
            item.setQuantity(Math.max(0, quantityBySpec.getOrDefault(key, 0)));
            return item;
        }).sorted((a, b) -> {
            String colorA = a.getColor() != null ? a.getColor() : "";
            String colorB = b.getColor() != null ? b.getColor() : "";
            int colorCompare = colorA.compareToIgnoreCase(colorB);
            if (colorCompare != 0) return colorCompare;
            return ProductionOrderUtils.compareSizeAsc(a.getSize(), b.getSize());
        }).collect(Collectors.toList());
    }

    private String resolveShareColor(ProductionOrder order, List<OrderShareResponse.ColorSizeQuantity> colorSizeQuantities) {
        List<String> colors = colorSizeQuantities == null
                ? new ArrayList<>()
                : colorSizeQuantities.stream().map(OrderShareResponse.ColorSizeQuantity::getColor).filter(value -> value != null && !value.isBlank()).distinct().collect(Collectors.toList());
        if (!colors.isEmpty()) return String.join(" / ", colors);
        return order == null ? null : normalizeText(order.getColor());
    }

    private List<String> parseSizeOrder(String rawSizes) {
        if (rawSizes == null || rawSizes.isBlank()) return new ArrayList<>();
        return Arrays.stream(rawSizes.split("[,，/\\s]+")).map(this::normalizeSizeValue).filter(value -> value != null && !value.isBlank()).distinct().collect(Collectors.toCollection(ArrayList::new));
    }

    private String normalizeSizeValue(String value) {
        if (value == null) return null;
        String text = value.trim();
        return text.isEmpty() ? null : text.toUpperCase();
    }

    private int parseInteger(Object value) {
        if (value == null) return 0;
        if (value instanceof Number number) return number.intValue();
        try { return Integer.parseInt(String.valueOf(value).trim()); } catch (Exception e) { return 0; }
    }

    private String normalizeText(String text) {
        if (text == null) return null;
        String value = text.trim();
        return value.isEmpty() ? null : value;
    }

    private String mapStatusText(String status) {
        if (status == null) return "未知";
        return switch (status) {
            case "pending"    -> "待开始";
            case "production" -> "生产中";
            case "completed"  -> "已完成";
            case "delayed"    -> "延期中";
            case "closed"     -> "已关单";
            default           -> status;
        };
    }
}

package com.fashion.supplychain.production.orchestration;

import cn.hutool.jwt.JWT;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.OrderShareResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.production.service.SKUService;
import com.fashion.supplychain.production.util.ProductionOrderUtils;
import com.fashion.supplychain.warehouse.dto.OutstockShareResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

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
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 客户订单分享编排器
 *
 * <p>核心功能：
 * <ul>
 *   <li>generateShareToken：为订单生成 30 天有效的 JWT 分享令牌（需要登录，仅订单所属租户可生成）</li>
 *   <li>resolveShareOrder：通过令牌获取可公开的订单摘要（无需登录）</li>
 * </ul>
 *
 * <p>安全设计：
 * <ul>
 *   <li>使用与系统相同的 JWT secret，令牌不可伪造</li>
 *   <li>令牌 payload 包含 type=share + orderId + tenantId，防止跨租户越权</li>
 *   <li>公开接口 (resolveShareOrder) 仅返回 OrderShareResponse 中定义的字段，严禁泄露价格/工人信息</li>
 * </ul>
 */
@Service
@Slf4j
public class OrderShareOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final long SHARE_TTL_MS = 30L * 24 * 60 * 60 * 1000; // 30 天
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final byte[] jwtSecret;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private SKUService skuService;

    @Autowired
    private ProductOutstockService productOutstockService;

    public OrderShareOrchestrator(@Value("${app.auth.jwt-secret:}") String secret) {
        this.jwtSecret = (secret == null ? "" : secret.trim()).getBytes(StandardCharsets.UTF_8);
    }

    // ───────────────────────────────────────────────────
    // 生成分享令牌（需要登录，只能分享自己租户的订单）
    // ───────────────────────────────────────────────────

    /**
     * 为指定订单生成分享令牌（30 天有效）
     *
     * @param orderId 订单 ID
     * @return share URL 中使用的 JWT token 字符串
     */
    public String generateShareToken(String orderId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("未登录，无法生成分享链接");
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        // 租户隔离：只能分享自己租户下的订单
        if (!String.valueOf(tenantId).equals(String.valueOf(order.getTenantId()))) {
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

    // ───────────────────────────────────────────────────
    // 通过令牌获取公开订单摘要（无需登录）
    // ───────────────────────────────────────────────────

    /**
     * 使用分享令牌获取可公开的订单摘要
     *
     * @param token 前端 URL path 中的令牌
     * @return 脱敏后的订单快照，或错误提示
     */
    public Result<OrderShareResponse> resolveShareOrder(String token) {
        // 1. 验证令牌
        JWT jwt;
        try {
            jwt = JWT.of(token).setKey(jwtSecret);
        } catch (Exception e) {
            return Result.fail("分享链接无效");
        }

        boolean valid;
        try {
            valid = jwt.verify() && jwt.validate(0);
        } catch (Exception e) {
            valid = false;
        }
        if (!valid) {
            return Result.fail("分享链接已失效或格式错误");
        }

        // 2. 类型检查
        Object type = jwt.getPayload("type");
        if (!"share".equals(type)) {
            return Result.fail("分享链接类型无效");
        }

        // 3. 提取 orderId
        String orderId = jwt.getPayload("orderId") == null
                ? null : String.valueOf(jwt.getPayload("orderId"));
        if (orderId == null) {
            return Result.fail("分享链接损坏");
        }
        String tenantIdText = jwt.getPayload("tenantId") == null
                ? null : String.valueOf(jwt.getPayload("tenantId"));
        Long tenantId;
        try {
            tenantId = tenantIdText == null || tenantIdText.isBlank() ? null : Long.parseLong(tenantIdText);
        } catch (Exception e) {
            tenantId = null;
        }
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

            String latestScanTime = null;
            String latestScanStage = null;
            List<OrderShareResponse.ScanEntry> recentScans = new ArrayList<>();
            try {
                QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
                qw.eq("order_id", orderId)
                  .eq("scan_result", "success")
                  .eq("delete_flag", 0)
                  .orderByDesc("scan_time")
                  .last("LIMIT 8");
                List<ScanRecord> scans = scanRecordService.list(qw);
                if (!scans.isEmpty()) {
                    ScanRecord latest = scans.get(0);
                    if (latest.getScanTime() != null) {
                        latestScanTime = latest.getScanTime().format(DATETIME_FMT);
                    }
                    latestScanStage = latest.getProgressStage() != null
                            ? latest.getProgressStage()
                            : latest.getProcessName();
                }
                recentScans = scans.stream().map(scan -> {
                    OrderShareResponse.ScanEntry entry = new OrderShareResponse.ScanEntry();
                    entry.setProcessName(scan.getProcessName() != null ? scan.getProcessName() : scan.getProgressStage());
                    entry.setQuantity(scan.getQuantity());
                    entry.setScanTime(scan.getScanTime() == null ? null : scan.getScanTime().format(DATETIME_FMT));
                    return entry;
                }).toList();
            } catch (Exception e) {
                log.debug("[OrderShare] 查询扫码记录失败，跳过 orderId={}", orderId);
            }

            LocalDate deliveryDate = order.getExpectedShipDate() != null
                    ? order.getExpectedShipDate()
                    : order.getPlannedEndDate() == null ? null : order.getPlannedEndDate().toLocalDate();
            String statusText = mapStatusText(order.getStatus());
            List<OrderShareResponse.StageProgress> stages = buildStageProgress(order, statusText);
            String currentStage = resolveCurrentStage(order, stages, latestScanStage, statusText);
            OrderShareResponse.AiPrediction aiPrediction = buildAiPrediction(order, deliveryDate);

            OrderShareResponse resp = new OrderShareResponse();
            List<OrderShareResponse.ColorSizeQuantity> colorSizeQuantities = buildColorSizeQuantities(order);
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
            resp.setLatestScanTime(latestScanTime);
            resp.setLatestScanStage(latestScanStage);
            resp.setCurrentStage(currentStage);
            resp.setSizeQuantities(buildSizeQuantities(order));
            resp.setColorSizeQuantities(colorSizeQuantities);
            resp.setStages(stages);
            resp.setRecentScans(recentScans);
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

    private List<OrderShareResponse.StageProgress> buildStageProgress(ProductionOrder order, String statusText) {
        List<String> workflowNodes = parseWorkflowNodes(order);
        if (workflowNodes.isEmpty()) {
            workflowNodes = new ArrayList<>(List.of("采购", "裁剪", "车缝", "尾部", "入库"));
        }

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
            if (matched) {
                return currentProcessName;
            }
        }
        String latestStage = normalizeNodeName(latestScanStage);
        if (latestStage != null) {
            boolean matched = stages.stream().anyMatch(stage -> latestStage.equals(normalizeNodeName(stage.getStageName())));
            if (matched) {
                return latestStage;
            }
        }
        for (OrderShareResponse.StageProgress stage : stages) {
            if ("ACTIVE".equals(stage.getStatus())) {
                return stage.getStageName();
            }
        }
        for (OrderShareResponse.StageProgress stage : stages) {
            if ("PENDING".equals(stage.getStatus())) {
                return stage.getStageName();
            }
        }
        return "已完成".equals(statusText) ? "已完成" : statusText;
    }

    private List<String> parseWorkflowNodes(ProductionOrder order) {
        String raw = order == null ? null : order.getProgressWorkflowJson();
        if (raw == null || raw.isBlank()) {
            return new ArrayList<>();
        }
        try {
            Map<?, ?> obj = OBJECT_MAPPER.readValue(raw, Map.class);
            Object itemsRaw = obj.get("nodes");
            List<?> list;
            if (itemsRaw instanceof List<?>) {
                list = (List<?>) itemsRaw;
            } else {
                itemsRaw = obj.get("steps");
                if (!(itemsRaw instanceof List<?>)) {
                    return new ArrayList<>();
                }
                list = (List<?>) itemsRaw;
            }

            Set<String> names = new LinkedHashSet<>();
            for (Object item : list) {
                if (!(item instanceof Map<?, ?> map)) {
                    continue;
                }
                String name = normalizeNodeName(stringValue(map.get("name")));
                if (name == null) {
                    name = normalizeNodeName(stringValue(map.get("processName")));
                }
                if (name == null || isHiddenShareNode(name)) {
                    continue;
                }
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

    private String normalizeNodeName(String value) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        if (text.isEmpty()) {
            return null;
        }
        return switch (text) {
            case "采购备料", "采购", "procurement" -> "采购";
            case "缝制", "生产", "sewing" -> "车缝";
            case "后整", "质检", "整烫", "包装", "finishing", "quality" -> "尾部";
            case "warehouse", "warehousing" -> "入库";
            default -> text;
        };
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private int getNodeIndexFromProgress(List<String> nodes, Integer progressValue) {
        if (nodes == null || nodes.isEmpty()) {
            return 0;
        }
        if (nodes.size() == 1) {
            return 0;
        }
        int progress = clampPercent(progressValue);
        int idx = Math.round((progress / 100f) * (nodes.size() - 1));
        return Math.max(0, Math.min(nodes.size() - 1, idx));
    }

    private int clampPercent(Integer value) {
        int safeValue = value == null ? 0 : value;
        return Math.max(0, Math.min(100, safeValue));
    }

    private int resolveStageDisplayRate(ProductionOrder order, String stageName, int stageIndex, int currentIndex, int totalStages, String statusText) {
        if ("已完成".equals(statusText) || stageIndex < currentIndex) {
            return 100;
        }
        if (stageIndex > currentIndex) {
            return 0;
        }
        int progress = clampPercent(order.getProductionProgress());
        if (totalStages <= 1) {
            return progress;
        }
        Integer actualRate = resolveActualRateByStage(order, stageName);
        if (actualRate != null && actualRate > 0) {
            return clampPercent(actualRate);
        }
        float start = (100f / totalStages) * stageIndex;
        float end = (100f / totalStages) * (stageIndex + 1);
        if (progress <= start) {
            return 0;
        }
        if (progress >= end) {
            return 100;
        }
        return Math.max(1, Math.min(99, Math.round(((progress - start) / Math.max(1f, end - start)) * 100f)));
    }

    private Integer resolveActualRateByStage(ProductionOrder order, String stageName) {
        return switch (normalizeNodeName(stageName)) {
            case "采购" -> firstNonNull(order.getProcurementCompletionRate(), order.getMaterialArrivalRate());
            case "裁剪" -> order.getCuttingCompletionRate();
            case "二次工艺" -> firstNonNull(order.getSecondaryProcessCompletionRate(), order.getSecondaryProcessRate());
            case "车缝" -> firstNonNull(order.getCarSewingCompletionRate(), order.getSewingCompletionRate());
            case "尾部" -> firstNonNull(order.getPackagingCompletionRate(), order.getIroningCompletionRate(), order.getQualityCompletionRate());
            case "入库" -> order.getWarehousingCompletionRate();
            default -> null;
        };
    }

    private Integer firstNonNull(Integer... values) {
        if (values == null) {
            return null;
        }
        for (Integer value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private List<OrderShareResponse.SizeQuantity> buildSizeQuantities(ProductionOrder order) {
        if (order == null || order.getOrderNo() == null || order.getOrderNo().isBlank()) {
            return new ArrayList<>();
        }
        List<String> orderedSizes = parseSizeOrder(order == null ? null : order.getSize());
        Map<String, Integer> quantityBySize = new HashMap<>();
        try {
            Map<String, Object> progress = skuService.getOrderSKUProgress(order.getOrderNo());
            Object skuListObj = progress == null ? null : progress.get("skuList");
            if (skuListObj instanceof List<?> skuList) {
                for (Object item : skuList) {
                    if (!(item instanceof Map<?, ?> sku)) {
                        continue;
                    }
                    String size = normalizeSizeValue(stringValue(sku.get("size")));
                    if (size == null) {
                        continue;
                    }
                    int quantity = parseInteger(sku.get("totalCount"));
                    quantityBySize.put(size, quantityBySize.getOrDefault(size, 0) + quantity);
                    if (!orderedSizes.contains(size)) {
                        orderedSizes.add(size);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[OrderShare] 获取尺码数量分布失败 orderNo={}", order == null ? null : order.getOrderNo(), e);
        }

        if (orderedSizes.isEmpty()) {
            return new ArrayList<>();
        }

        return orderedSizes.stream().map(size -> {
            OrderShareResponse.SizeQuantity item = new OrderShareResponse.SizeQuantity();
            item.setSize(size);
            item.setQuantity(Math.max(0, quantityBySize.getOrDefault(size, 0)));
            return item;
        }).collect(Collectors.toList());
    }

    private List<OrderShareResponse.ColorSizeQuantity> buildColorSizeQuantities(ProductionOrder order) {
        if (order == null) {
            return new ArrayList<>();
        }

        Map<String, Integer> quantityBySpec = new HashMap<>();
        Set<String> orderedKeys = new LinkedHashSet<>();

        List<Map<String, Object>> orderLines = ProductionOrderUtils.resolveOrderLines(order.getOrderDetails(), OBJECT_MAPPER);
        for (Map<String, Object> line : orderLines) {
            String color = normalizeText(stringValue(
                    line.getOrDefault("color",
                            line.getOrDefault("colour",
                                    line.getOrDefault("colorName", line.get("颜色"))))));
            String size = normalizeSizeValue(stringValue(
                    line.getOrDefault("size",
                            line.getOrDefault("sizeName",
                                    line.getOrDefault("spec", line.get("尺码"))))));
            int quantity = parseInteger(
                    line.getOrDefault("quantity",
                            line.getOrDefault("qty",
                                    line.getOrDefault("count",
                                            line.getOrDefault("num", line.get("数量"))))));
            if (color == null || size == null || quantity <= 0) {
                continue;
            }
            String key = color + "__" + size;
            quantityBySpec.put(key, quantityBySpec.getOrDefault(key, 0) + quantity);
            orderedKeys.add(key);
        }

        try {
            Map<String, Object> progress = order.getOrderNo() == null ? null : skuService.getOrderSKUProgress(order.getOrderNo());
            Object skuListObj = progress == null ? null : progress.get("skuList");
            if (skuListObj instanceof List<?> skuList) {
                for (Object item : skuList) {
                    if (!(item instanceof Map<?, ?> sku)) {
                        continue;
                    }
                    Object rawColor = sku.containsKey("color") ? sku.get("color")
                            : (sku.containsKey("colour") ? sku.get("colour")
                            : (sku.containsKey("colorName") ? sku.get("colorName") : sku.get("颜色")));
                    Object rawSize = sku.containsKey("size") ? sku.get("size")
                            : (sku.containsKey("sizeName") ? sku.get("sizeName")
                            : (sku.containsKey("spec") ? sku.get("spec") : sku.get("尺码")));
                    Object rawQuantity = sku.containsKey("totalCount") ? sku.get("totalCount")
                            : (sku.containsKey("quantity") ? sku.get("quantity")
                            : (sku.containsKey("qty") ? sku.get("qty") : sku.get("数量")));
                    String color = normalizeText(stringValue(rawColor));
                    String size = normalizeSizeValue(stringValue(rawSize));
                    int quantity = parseInteger(rawQuantity);
                    if (color == null || size == null || quantity <= 0) {
                        continue;
                    }
                    String key = color + "__" + size;
                    quantityBySpec.put(key, quantity);
                    orderedKeys.add(key);
                }
            }
        } catch (Exception e) {
            log.warn("[OrderShare] 获取颜色尺码分布失败 orderNo={}", order.getOrderNo(), e);
        }

        if (orderedKeys.isEmpty()) {
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

        return orderedKeys.stream()
                .map(key -> {
                    String[] parts = key.split("__", 2);
                    OrderShareResponse.ColorSizeQuantity item = new OrderShareResponse.ColorSizeQuantity();
                    item.setColor(parts.length > 0 ? parts[0] : null);
                    item.setSize(parts.length > 1 ? parts[1] : null);
                    item.setQuantity(Math.max(0, quantityBySpec.getOrDefault(key, 0)));
                    return item;
                })
                .sorted((a, b) -> {
                    int colorCompare = String.valueOf(a.getColor()).compareToIgnoreCase(String.valueOf(b.getColor()));
                    if (colorCompare != 0) {
                        return colorCompare;
                    }
                    return ProductionOrderUtils.compareSizeAsc(a.getSize(), b.getSize());
                })
                .collect(Collectors.toList());
    }

    private String resolveShareColor(ProductionOrder order, List<OrderShareResponse.ColorSizeQuantity> colorSizeQuantities) {
        List<String> colors = colorSizeQuantities == null
                ? new ArrayList<>()
                : colorSizeQuantities.stream()
                .map(OrderShareResponse.ColorSizeQuantity::getColor)
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .collect(Collectors.toList());
        if (!colors.isEmpty()) {
            return String.join(" / ", colors);
        }
        return order == null ? null : normalizeText(order.getColor());
    }

    private List<String> parseSizeOrder(String rawSizes) {
        if (rawSizes == null || rawSizes.isBlank()) {
            return new ArrayList<>();
        }
        return Arrays.stream(rawSizes.split("[,，/\\s]+"))
                .map(this::normalizeSizeValue)
                .filter(value -> value != null && !value.isBlank())
                .distinct()
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private String normalizeSizeValue(String value) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        return text.isEmpty() ? null : text.toUpperCase();
    }

    private int parseInteger(Object value) {
        if (value == null) {
            return 0;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception e) {
            return 0;
        }
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

    // ───────────────────────────────────────────────────
    // 出库记录分享（与订单分享同架构，JWT + 公开接口）
    // ───────────────────────────────────────────────────

    /**
     * 为指定客户的出库记录批量生成分享令牌（30 天有效）
     * payload: type=outstock_share, customerName, tenantId
     */
    public String generateOutstockShareToken(String customerName) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("未登录，无法生成分享链接");
        }
        if (customerName == null || customerName.isBlank()) {
            throw new IllegalArgumentException("客户名称不能为空");
        }

        long now = System.currentTimeMillis();
        String token = JWT.create()
                .setPayload("type", "outstock_share")
                .setPayload("customerName", customerName)
                .setPayload("tenantId", String.valueOf(tenantId))
                .setIssuedAt(new Date(now))
                .setExpiresAt(new Date(now + SHARE_TTL_MS))
                .setKey(jwtSecret)
                .sign();

        log.info("[OutstockShare] 生成出库分享令牌 customerName={} tenantId={}", customerName, tenantId);
        return token;
    }

    /**
     * 通过令牌获取出库记录公开摘要（无需登录）
     */
    public Result<OutstockShareResponse> resolveOutstockShare(String token) {
        if (token == null || token.isBlank()) {
            return Result.fail("无效的分享链接");
        }
        try {
            JWT jwt = JWT.of(token).setKey(jwtSecret);
            if (!jwt.verify() || !jwt.validate(0)) {
                return Result.fail("分享链接已过期或无效");
            }

            String type = (String) jwt.getPayload("type");
            if (!"outstock_share".equals(type)) {
                return Result.fail("无效的分享类型");
            }

            String customerName = (String) jwt.getPayload("customerName");
            String tenantIdStr = (String) jwt.getPayload("tenantId");
            Long tenantId = Long.parseLong(tenantIdStr);

            // 查询该客户的所有出库记录
            List<ProductOutstock> records = productOutstockService.lambdaQuery()
                    .eq(ProductOutstock::getTenantId, tenantId)
                    .eq(ProductOutstock::getCustomerName, customerName)
                    .eq(ProductOutstock::getDeleteFlag, 0)
                    .orderByDesc(ProductOutstock::getCreateTime)
                    .list();

            OutstockShareResponse resp = new OutstockShareResponse();
            resp.setToken(token);
            resp.setCustomerName(customerName);
            resp.setExpiresAt(((Date) jwt.getPayload("exp")).getTime());

            // 从第一条记录获取客户联系信息
            if (!records.isEmpty()) {
                ProductOutstock first = records.get(0);
                resp.setCustomerPhone(first.getCustomerPhone());
                resp.setShippingAddress(first.getShippingAddress());
            }

            // 构建明细列表
            List<OutstockShareResponse.OutstockItem> items = new ArrayList<>();
            int totalQty = 0;
            java.math.BigDecimal totalAmt = java.math.BigDecimal.ZERO;

            for (ProductOutstock r : records) {
                OutstockShareResponse.OutstockItem item = new OutstockShareResponse.OutstockItem();
                item.setOutstockNo(r.getOutstockNo());
                item.setOrderNo(r.getOrderNo());
                item.setStyleNo(r.getStyleNo());
                item.setStyleName(r.getStyleName());
                item.setColor(r.getColor());
                item.setSize(r.getSize());
                item.setOutstockQuantity(r.getOutstockQuantity());
                item.setSalesPrice(r.getSalesPrice());
                item.setTotalAmount(r.getTotalAmount());
                item.setTrackingNo(r.getTrackingNo());
                item.setExpressCompany(r.getExpressCompany());
                item.setOutstockTime(r.getCreateTime() != null ? r.getCreateTime().format(DATETIME_FMT) : null);
                item.setPaymentStatus(r.getPaymentStatus());
                items.add(item);

                if (r.getOutstockQuantity() != null) totalQty += r.getOutstockQuantity();
                if (r.getTotalAmount() != null) totalAmt = totalAmt.add(r.getTotalAmount());
            }

            resp.setItems(items);
            resp.setTotalQuantity(totalQty);
            resp.setTotalAmount(totalAmt);

            return Result.success(resp);
        } catch (Exception e) {
            log.warn("[OutstockShare] 解析分享令牌失败: {}", e.getMessage());
            return Result.fail("分享链接无效");
        }
    }
}

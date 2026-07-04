package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcLogisticsAnomaly;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcLogisticsAnomalyService;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.logistics.LogisticsManager;
import com.fashion.supplychain.integration.logistics.LogisticsService;
import com.fashion.supplychain.integration.logistics.TrackingInfo;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Phase 3 物流异常预警编排器
 *
 * <p>核心能力：
 * <ol>
 *   <li>扫描在途订单（status=2 已发货，shipTime 距今 > 阈值未签收）</li>
 *   <li>调用 LogisticsManager.trackShipment() 拉真实物流轨迹</li>
 *   <li>检测异常：DELAY（超时未签）/STALE（轨迹停滞）/EXCEPTION（轨迹含异常关键字）</li>
 *   <li>AI 生成处理建议（联系快递/补发/退款/外呼买家），AI 失败走规则兜底</li>
 * </ol>
 *
 * <p>设计原则：
 * <ul>
 *   <li>不加 @Transactional：单订单扫描失败不影响其他订单</li>
 *   <li>去重：同订单+同异常类型+未处理，不重复生成</li>
 *   <li>不修改 EcommerceOrder 状态，只读分析</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
public class EcLogisticsAnomalyOrchestrator {

    @Autowired @Lazy private EcommerceOrderService ecommerceOrderService;
    @Autowired @Lazy private EcLogisticsAnomalyService anomalyService;
    @Autowired @Lazy private LogisticsManager logisticsManager;
    @Autowired @Lazy private AiInferenceGateway aiInferenceGateway;

    @Value("${fashion.ecommerce.logistics.scene:logistics_anomaly_advisor}")
    private String aiScene;

    /** 发货后多少小时未签收视为潜在异常 */
    private static final int DEFAULT_PENDING_HOURS = 48;
    /** 轨迹停滞多少小时视为 STALE */
    private static final int STALE_HOURS = 24;
    /** 异常关键字 */
    private static final String[] EXCEPTION_KEYWORDS = {
            "退回", "拒收", "破损", "丢失", "异常", "问题件", "滞留", "无人签收"
    };

    /**
     * 扫描在途订单，生成异常预警
     * @return 新生成的预警数量
     */
    public int scanAnomalies() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LocalDateTime threshold = LocalDateTime.now().minusHours(DEFAULT_PENDING_HOURS);
        // 已发货(status=2) 且 shipTime 早于阈值（发货超过 48h）
        List<EcommerceOrder> inTransit = ecommerceOrderService.list(new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .eq(EcommerceOrder::getStatus, 2)
                .lt(EcommerceOrder::getShipTime, threshold));
        if (inTransit.isEmpty()) return 0;

        int created = 0;
        for (EcommerceOrder order : inTransit) {
            try {
                if (detectAndSaveAnomaly(order)) created++;
            } catch (Exception e) {
                log.warn("[LogisticsAnomaly] 扫描失败 orderNo={}: {}", order.getOrderNo(), e.getMessage());
            }
        }
        log.info("[LogisticsAnomaly] 扫描完成 tenantId={} inTransit={} newAnomalies={}",
                tenantId, inTransit.size(), created);
        return created;
    }

    /** 单订单异常检测 + 落库 */
    private boolean detectAndSaveAnomaly(EcommerceOrder order) {
        if (order.getTrackingNo() == null || order.getExpressCompany() == null) return false;
        LogisticsService.LogisticsType type = mapExpressCompany(order.getExpressCompany());
        if (type == null) return false;

        List<TrackingInfo> tracks;
        try {
            tracks = logisticsManager.trackShipment(order.getTrackingNo(), type);
        } catch (Exception e) {
            log.debug("[LogisticsAnomaly] 拉轨迹失败 orderNo={} trackingNo={}: {}",
                    order.getOrderNo(), order.getTrackingNo(), e.getMessage());
            // 拉不到轨迹，若发货超过 48h 则报 STALE
            return saveIfNotExists(order, "STALE", "HIGH",
                    (int) Duration.between(order.getShipTime(), LocalDateTime.now()).toHours() / 24,
                    "无法获取轨迹", null, null);
        }
        if (tracks == null || tracks.isEmpty()) return false;

        TrackingInfo last = tracks.get(tracks.size() - 1);
        LocalDateTime lastTime = last.getTime();
        int daysSinceUpdate = lastTime != null
                ? (int) Duration.between(lastTime, LocalDateTime.now()).toHours() / 24 : 0;
        String desc = last.getDescription();

        // 1. EXCEPTION：轨迹含异常关键字
        if (containsExceptionKeyword(desc)) {
            String severity = daysSinceUpdate > 3 ? "HIGH" : "MEDIUM";
            return saveIfNotExists(order, "EXCEPTION", severity, daysSinceUpdate, desc, lastTime, null);
        }
        // 2. STALE：轨迹停滞 > 24h
        if (lastTime != null && lastTime.isBefore(LocalDateTime.now().minusHours(STALE_HOURS))) {
            String severity = daysSinceUpdate > 3 ? "HIGH" : "MEDIUM";
            return saveIfNotExists(order, "STALE", severity, daysSinceUpdate, desc, lastTime, null);
        }
        // 3. DELAY：发货超 48h 仍未签收（兜底）
        if (order.getShipTime() != null
                && order.getShipTime().isBefore(LocalDateTime.now().minusHours(DEFAULT_PENDING_HOURS))) {
            return saveIfNotExists(order, "DELAY", "MEDIUM", daysSinceUpdate, desc, lastTime, null);
        }
        return false;
    }

    /** 落库（去重） + AI 建议 */
    private boolean saveIfNotExists(EcommerceOrder order, String anomalyType, String severity,
                                     int daysSinceUpdate, String desc,
                                     LocalDateTime lastTrackTime, TrackingInfo lastTrack) {
        Long tenantId = order.getTenantId();
        if (anomalyService.existsUnhandled(tenantId, order.getId(), anomalyType)) return false;
        // AI 生成建议
        AiAdvice advice = callAiForAdvice(order, anomalyType, severity, daysSinceUpdate, desc);
        EcLogisticsAnomaly anomaly = new EcLogisticsAnomaly();
        anomaly.setTenantId(tenantId);
        anomaly.setOrderId(order.getId());
        anomaly.setOrderNo(order.getOrderNo());
        anomaly.setTrackingNo(order.getTrackingNo());
        anomaly.setExpressCompany(order.getExpressCompany());
        anomaly.setReceiverName(order.getReceiverName());
        anomaly.setReceiverPhone(order.getReceiverPhone());
        anomaly.setAnomalyType(anomalyType);
        anomaly.setSeverity(severity);
        anomaly.setDaysSinceUpdate(daysSinceUpdate);
        anomaly.setLastTrackDesc(desc);
        anomaly.setLastTrackTime(lastTrackTime);
        anomaly.setAiAdvice(advice != null ? advice.advice : buildRuleFallback(anomalyType, severity, daysSinceUpdate));
        anomaly.setAiConfidence(advice != null ? advice.confidence : 60);
        anomaly.setHandledStatus(0);
        anomalyService.save(anomaly);
        log.info("[LogisticsAnomaly] 预警已生成 orderNo={} type={} severity={} aiConfidence={}",
                order.getOrderNo(), anomalyType, severity, anomaly.getAiConfidence());
        return true;
    }

    /** AI 生成处理建议，失败返回 null 走规则兜底 */
    private AiAdvice callAiForAdvice(EcommerceOrder order, String anomalyType, String severity,
                                      int daysSinceUpdate, String desc) {
        if (aiInferenceGateway == null) return null;
        String prompt = buildPrompt(order, anomalyType, severity, daysSinceUpdate, desc);
        try {
            IntelligenceInferenceResult res = aiInferenceGateway.chat(
                    aiScene,
                    "你是服装电商物流客服顾问。针对物流异常给出处理建议，返回 JSON："
                    + "{\"advice\":\"具体处理步骤\",\"confidence\":0-100}。"
                    + "建议可包含：联系快递催件/联系买家确认/补发/退款/外呼买家。",
                    prompt);
            if (res == null || !res.isSuccess() || res.getContent() == null) return null;
            return parseAiAdvice(res.getContent());
        } catch (Exception e) {
            log.warn("[LogisticsAnomaly] AI 调用失败，走规则兜底: {}", e.getMessage());
            return null;
        }
    }

    private String buildPrompt(EcommerceOrder order, String anomalyType, String severity,
                               int daysSinceUpdate, String desc) {
        StringBuilder sb = new StringBuilder();
        sb.append("订单号: ").append(order.getOrderNo()).append("\n");
        sb.append("快递单号: ").append(order.getTrackingNo()).append("\n");
        sb.append("快递公司: ").append(order.getExpressCompany()).append("\n");
        sb.append("收货人: ").append(order.getReceiverName()).append("\n");
        sb.append("收货电话: ").append(order.getReceiverPhone()).append("\n");
        sb.append("异常类型: ").append(anomalyType).append("\n");
        sb.append("严重度: ").append(severity).append("\n");
        sb.append("轨迹停滞天数: ").append(daysSinceUpdate).append("\n");
        sb.append("最后轨迹: ").append(desc != null ? desc : "-").append("\n");
        sb.append("请给出具体处理建议。");
        return sb.toString();
    }

    private AiAdvice parseAiAdvice(String content) {
        if (content == null) return null;
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode node = mapper.readTree(content.substring(start, end + 1));
            AiAdvice a = new AiAdvice();
            a.advice = node.has("advice") ? node.get("advice").asText() : null;
            a.confidence = node.has("confidence") ? node.get("confidence").asInt() : 60;
            return a;
        } catch (Exception e) {
            log.warn("[LogisticsAnomaly] AI 返回解析失败: {}", e.getMessage());
            return null;
        }
    }

    private String buildRuleFallback(String anomalyType, String severity, int daysSinceUpdate) {
        if ("EXCEPTION".equals(anomalyType)) return "轨迹异常，建议立即联系快递客服核实，必要时联系买家说明情况";
        if ("STALE".equals(anomalyType)) {
            return daysSinceUpdate > 3
                    ? "轨迹停滞超3天，建议联系快递催件，并外呼买家安抚"
                    : "轨迹停滞，建议联系快递催件跟进";
        }
        if ("DELAY".equals(anomalyType)) return "发货超时未签收，建议查询最新轨迹并联系买家确认";
        return "建议人工核查";
    }

    private boolean containsExceptionKeyword(String desc) {
        if (desc == null) return false;
        for (String kw : EXCEPTION_KEYWORDS) {
            if (desc.contains(kw)) return true;
        }
        return false;
    }

    /** 快递公司代码 → LogisticsType 映射 */
    private LogisticsService.LogisticsType mapExpressCompany(String code) {
        if (code == null) return null;
        return switch (code.toUpperCase()) {
            case "SF" -> LogisticsService.LogisticsType.SF;
            case "STO" -> LogisticsService.LogisticsType.STO;
            case "YTO" -> LogisticsService.LogisticsType.YTO;
            case "ZTO" -> LogisticsService.LogisticsType.ZTO;
            case "EMS" -> LogisticsService.LogisticsType.EMS;
            case "JD" -> LogisticsService.LogisticsType.JD;
            case "YD" -> LogisticsService.LogisticsType.YD;
            default -> null;
        };
    }

    /** AI 建议结果 */
    private static class AiAdvice {
        String advice;
        int confidence;
    }

    /** 扫描结果汇总 */
    @Data
    public static class ScanResult {
        private int scanned;
        private int newAnomalies;
    }
}

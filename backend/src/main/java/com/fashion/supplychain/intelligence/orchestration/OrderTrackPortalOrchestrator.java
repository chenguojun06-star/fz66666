package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.OrderTrackResponse;
import com.fashion.supplychain.intelligence.dto.OrderTrackResponse.*;
import com.fashion.supplychain.intelligence.entity.OrderShareToken;
import com.fashion.supplychain.intelligence.mapper.OrderShareTokenMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 客户进度门户编排器 — 负责 Token 生成/吊销/公开查询
 *
 * <p>生成：经过认证的用户为某订单生成 UUID share-token，写入 t_order_share_token
 * <p>吊销：删除 token，使链接失效
 * <p>公开查询：通过 token 无认证返回脱敏订单进度数据
 */
@Service
@Slf4j
public class OrderTrackPortalOrchestrator {

    private static final DateTimeFormatter MONTH_DAY = DateTimeFormatter.ofPattern("MM月dd日");

    @Autowired
    private OrderShareTokenMapper orderShareTokenMapper;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    // ─── 生成分享 Token ───────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public String generateToken(String orderId, int expireDays) {
        Long tenantId = UserContext.tenantId();
        String userId  = UserContext.userId();

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null || !tenantId.equals(order.getTenantId())) {
            throw new IllegalArgumentException("订单不存在或无权访问");
        }

        // 同一订单已有 token 则先删除旧的
        orderShareTokenMapper.delete(
            new QueryWrapper<OrderShareToken>()
                .eq("tenant_id", tenantId)
                .eq("order_id", orderId)
        );

        String token = UUID.randomUUID().toString().replace("-", "");
        OrderShareToken entity = new OrderShareToken();
        entity.setTenantId(tenantId);
        entity.setOrderId(orderId);
        entity.setOrderNo(order.getOrderNo());
        entity.setToken(token);
        entity.setExpireDays(expireDays);
        entity.setExpiresAt(LocalDateTime.now().plusDays(expireDays));
        entity.setAccessCount(0);
        entity.setCreatedBy(userId);
        entity.setCreatedAt(LocalDateTime.now());
        orderShareTokenMapper.insert(entity);

        log.info("[OrderTrack] 生成 token orderId={} expireDays={} token={}", orderId, expireDays, token);
        return token;
    }

    // ─── 吊销 Token ───────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void revokeToken(String orderId) {
        Long tenantId = UserContext.tenantId();
        int deleted = orderShareTokenMapper.delete(
            new QueryWrapper<OrderShareToken>()
                .eq("tenant_id", tenantId)
                .eq("order_id", orderId)
        );
        log.info("[OrderTrack] 吊销 token orderId={} deleted={}", orderId, deleted);
    }

    // ─── 公开查询（无需认证） ─────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public OrderTrackResponse queryByToken(String token) {
        OrderShareToken shareToken = orderShareTokenMapper.selectOne(
            new QueryWrapper<OrderShareToken>().eq("token", token)
        );
        if (shareToken == null) {
            throw new IllegalArgumentException("分享链接不存在或已失效");
        }
        if (shareToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("分享链接已过期");
        }

        // 累计访问次数
        shareToken.setAccessCount(shareToken.getAccessCount() + 1);
        orderShareTokenMapper.updateById(shareToken);

        ProductionOrder order = productionOrderService.getById(shareToken.getOrderId());
        if (order == null) {
            throw new IllegalArgumentException("订单数据不存在");
        }

        // 近期10条扫码记录
        List<ScanRecord> scans = scanRecordService.list(
            new QueryWrapper<ScanRecord>()
                .eq("order_id", order.getId())
                .eq("scan_result", "success")
                .orderByDesc("scan_time")
                .last("LIMIT 10")
        );

        List<ScanEntry> scanEntries = scans.stream()
            .map(s -> ScanEntry.builder()
                .processName(s.getProcessName() != null ? s.getProcessName() : s.getProgressStage())
                .quantity(s.getQuantity())
                .scanTime(s.getScanTime())
                .build())
            .collect(Collectors.toList());

        List<StageProgress> stages = buildStageProgress(order);
        AiPrediction aiPrediction = buildAiPrediction(order);
        String statusText = mapStatusText(order.getStatus());

        return OrderTrackResponse.builder()
            .orderNo(order.getOrderNo())
            .styleName(order.getStyleName())
            .factoryName(order.getFactoryName())
            .orderQuantity(order.getOrderQuantity())
            .completedQuantity(order.getCompletedQuantity())
            .productionProgress(order.getProductionProgress())
            .status(statusText)
            .expectedShipDate(order.getExpectedShipDate() != null
                ? order.getExpectedShipDate().atStartOfDay() : null)
            .actualStartDate(order.getActualStartDate())
            .stages(stages)
            .recentScans(scanEntries)
            .aiPrediction(aiPrediction)
            .shareInfo(ShareInfo.builder()
                .expiresAt(shareToken.getExpiresAt())
                .tokenValid(true)
                .accessCount(shareToken.getAccessCount())
                .build())
            .build();
    }

    // ─── 私有辅助 ─────────────────────────────────────────────────

    private List<StageProgress> buildStageProgress(ProductionOrder o) {
        List<StageProgress> result = new ArrayList<>();
        result.add(stage("采购备料", o.getProcurementCompletionRate()));
        result.add(stage("裁剪",     o.getCuttingCompletionRate()));
        result.add(stage("车缝",     o.getSewingCompletionRate()));
        result.add(stage("质检",     o.getQualityCompletionRate()));
        result.add(stage("入库",     o.getWarehousingCompletionRate()));

        result.add(stage("包装", o.getPackagingCompletionRate()));

        return result;
    }

    private StageProgress stage(String name, Integer rate) {
        int r = rate != null ? rate : 0;
        String status = r >= 100 ? "DONE" : (r > 0 ? "ACTIVE" : "PENDING");
        return StageProgress.builder().stageName(name).rate(r).status(status).build();
    }

    private AiPrediction buildAiPrediction(ProductionOrder o) {
        int progress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
        LocalDate today = LocalDate.now();
        String riskLevel;
        String riskReason;
        String predictedDate;

        if (o.getExpectedShipDate() != null) {
            long daysLeft = ChronoUnit.DAYS.between(today, o.getExpectedShipDate());
            if (daysLeft < 0) {
                riskLevel = "HIGH";
                riskReason = "已逾期 " + (-daysLeft) + " 天";
                predictedDate = "进行中";
            } else if (daysLeft <= 3 && progress < 80) {
                riskLevel = "HIGH";
                riskReason = "交期仅剩 " + daysLeft + " 天，进度仅 " + progress + "%";
                predictedDate = o.getExpectedShipDate().format(MONTH_DAY);
            } else if (daysLeft <= 7 && progress < 50) {
                riskLevel = "MEDIUM";
                riskReason = "进度偏慢，存在延交风险";
                predictedDate = o.getExpectedShipDate().plusDays(2).format(MONTH_DAY);
            } else {
                riskLevel = "LOW";
                riskReason = "生产节奏正常";
                predictedDate = o.getExpectedShipDate().format(MONTH_DAY);
            }
        } else {
            riskLevel = progress < 30 ? "MEDIUM" : "LOW";
            riskReason = "未设置交期，请关注进度";
            predictedDate = "待确定";
        }

        int confidence = progress >= 80 ? 90 : (progress >= 50 ? 72 : 55);
        return AiPrediction.builder()
            .predictedFinishDate(predictedDate)
            .confidence(confidence)
            .riskLevel(riskLevel)
            .riskReason(riskReason)
            .build();
    }

    private String mapStatusText(String status) {
        if (status == null) return "未知";
        return switch (status) {
            case "PENDING"   -> "待开工";
            case "IN_PROGRESS" -> "生产中";
            case "COMPLETED"   -> "已完工";
            case "CANCELLED"   -> "已取消";
            default -> status;
        };
    }
}

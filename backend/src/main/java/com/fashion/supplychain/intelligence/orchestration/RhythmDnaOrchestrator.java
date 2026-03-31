package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.RhythmDnaResponse;
import com.fashion.supplychain.intelligence.dto.RhythmDnaResponse.OrderRhythm;
import com.fashion.supplychain.intelligence.dto.RhythmDnaResponse.RhythmSegment;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 生产节奏DNA编排器 — 工序耗时占比基因图
 *
 * <p>算法：利用 flow_stage_snapshot 视图，计算每个订单各阶段
 * 从开始到完成的耗时，生成色带宽度=耗时占比的DNA条形图。
 */
@Service
@Slf4j
public class RhythmDnaOrchestrator {

    // 阶段名 → 色带颜色
    private static final Map<String, String> STAGE_COLORS = new LinkedHashMap<>();
    static {
        STAGE_COLORS.put("采购", "#4FC3F7");
        STAGE_COLORS.put("裁剪", "#81C784");
        STAGE_COLORS.put("二次工艺", "#FFB74D");
        STAGE_COLORS.put("车缝", "#7986CB");
        STAGE_COLORS.put("尾部", "#E57373");
        STAGE_COLORS.put("质检", "#BA68C8");
        STAGE_COLORS.put("入库", "#4DB6AC");
    }

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private com.fashion.supplychain.production.service.ProductionOrderService productionOrderService;

    public RhythmDnaResponse analyze() {
        RhythmDnaResponse resp = new RhythmDnaResponse();
        resp.setOrders(Collections.emptyList());
        try {
        Long tenantId = UserContext.tenantId();
        String factoryId = UserContext.factoryId();

        // 取最近的已完成/进行中订单（最多20个）
        var qw = new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.production.entity.ProductionOrder>();
        qw.eq(tenantId != null, "tenant_id", tenantId)
          .eq(StringUtils.hasText(factoryId), "factory_id", factoryId)
          .eq("delete_flag", 0)
          .in("status", "completed", "production", "delayed")
          .orderByDesc("update_time")
          .last("LIMIT 20");
        var orders = productionOrderService.list(qw);

        if (orders.isEmpty()) {
            resp.setOrders(Collections.emptyList());
            return resp;
        }

        List<String> orderIds = orders.stream()
                .map(com.fashion.supplychain.production.entity.ProductionOrder::getId)
                .collect(Collectors.toList());

        List<Map<String, Object>> snapshots = scanRecordMapper.selectFlowStageSnapshot(orderIds);
        Map<String, Map<String, Object>> snapshotMap = snapshots.stream()
                .collect(Collectors.toMap(
                        m -> String.valueOf(m.get("orderId")), m -> m, (a, b) -> a));

        List<OrderRhythm> rhythms = new ArrayList<>();
        for (var order : orders) {
            // 无扫码记录也参与分析，传空 Map 触发订单级别兜底时间条
            Map<String, Object> snap = snapshotMap.getOrDefault(order.getId(), Collections.emptyMap());
            OrderRhythm or = buildRhythm(order, snap);
            if (or != null) rhythms.add(or);
        }

        resp.setOrders(rhythms);
        } catch (Exception e) {
            log.error("[节奏DNA] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    private OrderRhythm buildRhythm(
            com.fashion.supplychain.production.entity.ProductionOrder order,
            Map<String, Object> snap) {
        // 从 snapshot 中提取各阶段开始/结束时间
        List<RhythmSegment> segments = new ArrayList<>();
        String[][] stageKeys = {
            {"采购", "procurementScanEndTime", null},
            {"裁剪", "cuttingStartTime", "cuttingEndTime"},
            {"二次工艺", "secondaryProcessStartTime", "secondaryProcessEndTime"},
            {"车缝", "carSewingStartTime", "carSewingEndTime"},
            {"尾部", "ironingStartTime", "ironingEndTime"},
            {"质检", "qualityStartTime", "qualityEndTime"},
            {"入库", "warehousingStartTime", "warehousingEndTime"},
        };

        LocalDateTime orderStart = parseTime(snap.get("orderStartTime"));
        if (orderStart == null && order.getCreateTime() != null) {
            orderStart = order.getCreateTime();
        }
        if (orderStart == null) return null;

        double totalDays = 0;
        for (String[] keys : stageKeys) {
            LocalDateTime start = parseTime(snap.get(keys[1]));
            LocalDateTime end = keys[2] != null ? parseTime(snap.get(keys[2])) : null;

            double days = 0;
            if (start != null && end != null) {
                days = Math.max(0.1, ChronoUnit.HOURS.between(start, end) / 24.0);
            } else if (start != null) {
                days = Math.max(0.1, ChronoUnit.HOURS.between(start, LocalDateTime.now()) / 24.0);
            }

            RhythmSegment seg = new RhythmSegment();
            seg.setStageName(keys[0]);
            seg.setDays(Math.round(days * 10.0) / 10.0);
            seg.setColor(STAGE_COLORS.getOrDefault(keys[0], "#9E9E9E"));
            segments.add(seg);
            totalDays += days;
        }

        // 无扫码记录时降级：用订单总用时 + 进度百分比生成估算占位色条
        if (totalDays < 0.5) {
            segments.clear();
            double elapsed = Math.max(1.0,
                    Math.round(ChronoUnit.HOURS.between(orderStart, LocalDateTime.now()) / 24.0 * 10.0) / 10.0);
            int progress = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
            if (progress > 5) {
                RhythmSegment done = new RhythmSegment();
                done.setStageName("已完成");
                done.setDays(Math.max(0.1, Math.round(elapsed * progress / 100.0 * 10) / 10.0));
                done.setColor("#4FC3F7");
                done.setBottleneck(false);
                segments.add(done);
                RhythmSegment rem = new RhythmSegment();
                rem.setStageName("进行中");
                rem.setDays(Math.max(0.1, Math.round(elapsed * (100 - progress) / 100.0 * 10) / 10.0));
                rem.setColor("#546E9A");
                rem.setBottleneck(false);
                segments.add(rem);
            } else {
                RhythmSegment single = new RhythmSegment();
                single.setStageName("待扫码");
                single.setDays(elapsed);
                single.setColor("#546E9A");
                single.setBottleneck(false);
                segments.add(single);
            }
            totalDays = segments.stream().mapToDouble(RhythmSegment::getDays).sum();
        }

        // 剔除天数近似为 0 的阶段（无数据工序不展示）
        segments.removeIf(s -> s.getDays() < 0.05);
        if (segments.isEmpty()) return null;

        // 计算占比 + 瓶颈检测
        double avgDays = totalDays / Math.max(1, segments.size());
        for (RhythmSegment seg : segments) {
            seg.setPct(totalDays > 0 ? Math.round(seg.getDays() / totalDays * 1000.0) / 10.0 : 0);
            if (!seg.isBottleneck()) {  // 占位条不做瓶颈标记
                seg.setBottleneck(seg.getDays() > avgDays * 1.5);
            }
        }

        OrderRhythm rhythm = new OrderRhythm();
        rhythm.setOrderId(order.getId());
        rhythm.setOrderNo(order.getOrderNo());
        rhythm.setStyleName(order.getStyleName());
        rhythm.setTotalDays((int) Math.ceil(totalDays));
        rhythm.setSegments(segments);
        return rhythm;
    }

    private LocalDateTime parseTime(Object value) {
        if (value instanceof LocalDateTime) return (LocalDateTime) value;
        if (value instanceof java.sql.Timestamp) return ((java.sql.Timestamp) value).toLocalDateTime();
        if (value instanceof String) {
            try {
                return LocalDateTime.parse((String) value);
            } catch (Exception e) { /* ignore */ }
        }
        return null;
    }
}

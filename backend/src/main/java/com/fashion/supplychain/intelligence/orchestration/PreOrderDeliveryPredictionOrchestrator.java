package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.PreOrderDeliveryPredictionRequest;
import com.fashion.supplychain.intelligence.dto.PreOrderDeliveryPredictionResponse;
import com.fashion.supplychain.intelligence.dto.PreOrderDeliveryPredictionResponse.TimelineNode;
import com.fashion.supplychain.intelligence.helper.FactoryVelocityCalculator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalDouble;

/**
 * 预下单交期预测编排器 — 不依赖 orderId
 *
 * <p>用途：下单人员选择工厂+输入数量后，即可预测三档完工日期，
 * 实现"下单前可见时间线"。复用 DeliveryPredictionOrchestrator 算法，
 * 但用 factoryName 聚合扫码（通过 FactoryVelocityCalculator）。
 *
 * <p>与 DeliveryPredictionOrchestrator 区别：
 * <ul>
 *   <li>不需要 orderId（订单尚未创建）</li>
 *   <li>速度计算按工厂聚合所有在制订单扫码，而非单订单</li>
 *   <li>额外计算工厂在手总件数（含本单），用于判断工厂负载</li>
 *   <li>输出 timelineNodes 供前端直接渲染时间线</li>
 * </ul>
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PreOrderDeliveryPredictionOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final FactoryVelocityCalculator factoryVelocityCalculator;

    public PreOrderDeliveryPredictionResponse predictByFactory(PreOrderDeliveryPredictionRequest request) {
        PreOrderDeliveryPredictionResponse resp = new PreOrderDeliveryPredictionResponse();
        if (request == null || request.getFactoryName() == null || request.getFactoryName().isBlank()) {
            resp.setRationale("请提供工厂名");
            return resp;
        }
        if (request.getOrderQuantity() == null || request.getOrderQuantity() <= 0) {
            resp.setRationale("请提供有效的订单数量");
            return resp;
        }

        TenantAssert.assertTenantContext();
        String factoryName = request.getFactoryName().trim();
        resp.setFactoryName(factoryName);
        resp.setOrderQuantity(request.getOrderQuantity());

        try {
            // 1. 工厂在手总件数（含本单预估）
            long pendingQty = factoryVelocityCalculator.computeFactoryPendingQuantity(factoryName)
                    + request.getOrderQuantity();
            resp.setFactoryPendingQuantity(pendingQty);

            // 2. 工厂级日均产能
            double velocity = factoryVelocityCalculator.computeFactoryVelocity(factoryName);
            resp.setFactoryDailyVelocity(Math.round(velocity * 10.0) / 10.0);

            if (velocity <= 0) {
                resp.setRationale("该工厂近14天无扫码记录，无法预测产能。建议参考工厂配置产能或先创建订单后用订单级预测。");
                resp.setConfidence(10);
                resp.setTimelineNodes(buildMinimalTimeline(request.getPlannedDeadline()));
                return resp;
            }

            // 3. 三档天数（基于工厂总负载，而非单订单数量）
            //    理由：工厂产能是共享的，新订单需排队等待，故用总负载计算排队时间
            long optDays = Math.max(1, Math.round(pendingQty / (velocity * 1.2)));
            long mlDays = Math.max(1, Math.round(pendingQty / velocity));
            long pesDays = Math.max(1, Math.round(pendingQty / (velocity * 0.7)));

            // 4. 自我校准（工厂历史偏差）
            long correctedMlDays = factoryVelocityCalculator.computeCalibratedMlDays(factoryName, mlDays);

            // 5. P80 历史百分位混合
            long blendedMlDays = correctedMlDays;
            String p80Hint = "";
            OptionalDouble p80Opt = factoryVelocityCalculator.calcP80Days(factoryName);
            if (p80Opt.isPresent()) {
                long p80Days = Math.round(p80Opt.getAsDouble());
                blendedMlDays = Math.max(1, Math.round(correctedMlDays * 0.6 + p80Days * 0.4));
                p80Hint = String.format("；P80历史%d天（混合后%d天）", p80Days, blendedMlDays);
            }

            LocalDate today = LocalDate.now();
            resp.setOptimisticDays((int) optDays);
            resp.setMostLikelyDays((int) blendedMlDays);
            resp.setPessimisticDays((int) pesDays);
            resp.setOptimisticDate(today.plusDays(optDays).format(DATE_FMT));
            resp.setMostLikelyDate(today.plusDays(blendedMlDays).format(DATE_FMT));
            resp.setPessimisticDate(today.plusDays(pesDays).format(DATE_FMT));

            // 6. 是否延期
            if (request.getPlannedDeadline() != null && !request.getPlannedDeadline().isBlank()) {
                resp.setPlannedDeadline(request.getPlannedDeadline());
                try {
                    LocalDate planned = LocalDate.parse(request.getPlannedDeadline(), DATE_FMT);
                    resp.setLikelyDelayed(today.plusDays(blendedMlDays).isAfter(planned));
                } catch (Exception ignored) {}
            }

            // 7. 置信度
            int confidence = p80Opt.isPresent()
                    ? Math.min(85, 45 + (int) velocity)
                    : Math.min(90, 40 + (int) velocity);
            resp.setConfidence(confidence);
            resp.setRationale(String.format(
                    "工厂近14天日均产能 %.1f 件/天，在手总负载 %d 件（含本单 %d 件），"
                  + "预计 %d ~ %d 天完成全部排队订单%s",
                    velocity, pendingQty, request.getOrderQuantity(), optDays, pesDays, p80Hint));

            // 8. 时间线节点
            resp.setTimelineNodes(buildTimeline(today, optDays, blendedMlDays, pesDays, request.getPlannedDeadline()));

        } catch (Exception e) {
            log.error("[预下单预测] 异常: {}", e.getMessage(), e);
            resp.setRationale("数据加载异常，请稍后重试");
        }
        return resp;
    }

    private List<TimelineNode> buildTimeline(LocalDate today, long optDays, long mlDays, long pesDays, String plannedDeadline) {
        List<TimelineNode> nodes = new ArrayList<>();
        nodes.add(new TimelineNode("today", today.format(DATE_FMT), 0, "今天", "safe"));
        nodes.add(new TimelineNode("optimistic", today.plusDays(optDays).format(DATE_FMT), (int) optDays, "乐观预计", "safe"));
        nodes.add(new TimelineNode("mostLikely", today.plusDays(mlDays).format(DATE_FMT), (int) mlDays, "最可能", "warning"));
        nodes.add(new TimelineNode("pessimistic", today.plusDays(pesDays).format(DATE_FMT), (int) pesDays, "悲观预计", "danger"));
        if (plannedDeadline != null && !plannedDeadline.isBlank()) {
            try {
                LocalDate planned = LocalDate.parse(plannedDeadline, DATE_FMT);
                int days = (int) java.time.temporal.ChronoUnit.DAYS.between(today, planned);
                String risk = days < 0 ? "danger" : (days < mlDays ? "warning" : "safe");
                nodes.add(new TimelineNode("plannedDeadline", planned.format(DATE_FMT), days, "计划交期", risk));
            } catch (Exception ignored) {}
        }
        return nodes;
    }

    private List<TimelineNode> buildMinimalTimeline(String plannedDeadline) {
        List<TimelineNode> nodes = new ArrayList<>();
        nodes.add(new TimelineNode("today", LocalDate.now().format(DATE_FMT), 0, "今天", "safe"));
        if (plannedDeadline != null && !plannedDeadline.isBlank()) {
            try {
                LocalDate planned = LocalDate.parse(plannedDeadline, DATE_FMT);
                int days = (int) java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), planned);
                nodes.add(new TimelineNode("plannedDeadline", planned.format(DATE_FMT), days, "计划交期", days < 0 ? "danger" : "warning"));
            } catch (Exception ignored) {}
        }
        return nodes;
    }
}

package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.OrderRiskTracking;
import com.fashion.supplychain.intelligence.mapper.OrderRiskTrackingMapper;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class OrderRiskTrackingOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private OrderRiskTrackingMapper riskTrackingMapper;

    public Long createRisk(String orderNo, String riskLevel, List<String> riskFactors, String assignedTo) {
        // 守卫：必填字段不能为空（表列 NOT NULL 约束）
        if (orderNo == null || orderNo.isBlank()) {
            log.warn("[订单风险闭环] orderNo为空，跳过创建");
            return null;
        }
        if (riskLevel == null || riskLevel.isBlank()) {
            log.warn("[订单风险闭环] riskLevel为空，跳过创建");
            return null;
        }
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            log.warn("[订单风险闭环] tenantId为空（非请求线程？），跳过创建");
            return null;
        }
        try {
            OrderRiskTracking tracking = new OrderRiskTracking();
            tracking.setTenantId(tenantId);
            tracking.setOrderNo(orderNo);
            tracking.setRiskLevel(riskLevel);
            tracking.setRiskFactors(MAPPER.writeValueAsString(riskFactors));
            tracking.setAssignedTo(assignedTo);
            tracking.setHandlingStatus("pending");
            riskTrackingMapper.insert(tracking);
            log.info("[订单风险闭环] 风险已创建: orderNo={}, level={}, assignedTo={}", orderNo, riskLevel, assignedTo);
            return tracking.getId();
        } catch (Exception e) {
            log.warn("[订单风险闭环] 创建风险失败: {}", e.getMessage());
            return null;
        }
    }

    public boolean resolveRisk(Long riskId, String handlingAction, String handlingResult) {
        try {
            OrderRiskTracking tracking = riskTrackingMapper.selectById(riskId);
            if (tracking == null) return false;
            tracking.setHandlingStatus("resolved");
            tracking.setHandlingAction(handlingAction);
            tracking.setHandlingResult(handlingResult);
            tracking.setHandledBy(UserContext.username());
            tracking.setHandledAt(LocalDateTime.now());
            riskTrackingMapper.updateById(tracking);
            log.info("[订单风险闭环] 风险已处理: id={}, status=resolved", riskId);
            return true;
        } catch (Exception e) {
            log.warn("[订单风险闭环] 处理风险失败: {}", e.getMessage());
            return false;
        }
    }

    public boolean escalateRisk(Long riskId, String newAssignedTo) {
        try {
            OrderRiskTracking tracking = riskTrackingMapper.selectById(riskId);
            if (tracking == null) return false;
            tracking.setHandlingStatus("escalated");
            tracking.setAssignedTo(newAssignedTo);
            riskTrackingMapper.updateById(tracking);
            log.info("[订单风险闭环] 风险已升级: id={}, newAssignee={}", riskId, newAssignedTo);
            return true;
        } catch (Exception e) {
            log.warn("[订单风险闭环] 升级风险失败: {}", e.getMessage());
            return false;
        }
    }

    public Map<String, Object> getRiskStats(int days) {
        Map<String, Object> stats = new LinkedHashMap<>();
        try {
            Long tenantId = UserContext.tenantId();
            LocalDateTime since = LocalDateTime.now().minusDays(days);
            LambdaQueryWrapper<OrderRiskTracking> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(OrderRiskTracking::getTenantId, tenantId);
            wrapper.ge(OrderRiskTracking::getCreatedAt, since);
            List<OrderRiskTracking> records = riskTrackingMapper.selectList(wrapper);

            long total = records.size();
            long pending = records.stream().filter(r -> "pending".equals(r.getHandlingStatus())).count();
            long resolved = records.stream().filter(r -> "resolved".equals(r.getHandlingStatus())).count();
            long escalated = records.stream().filter(r -> "escalated".equals(r.getHandlingStatus())).count();
            long highRisk = records.stream().filter(r -> "high".equals(r.getRiskLevel())).count();

            stats.put("period", days + "天");
            stats.put("totalRisks", total);
            stats.put("pending", pending);
            stats.put("resolved", resolved);
            stats.put("escalated", escalated);
            stats.put("highRisk", highRisk);
            stats.put("resolutionRate", total > 0 ? Math.round((double) resolved / total * 1000.0) / 10.0 + "%" : "N/A");
        } catch (Exception e) {
            log.warn("[订单风险闭环] 获取统计失败: {}", e.getMessage());
        }
        return stats;
    }
}

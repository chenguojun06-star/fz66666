package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.SmartNotificationResponse;
import com.fashion.supplychain.intelligence.dto.SmartNotificationResponse.NotificationItem;
import com.fashion.supplychain.intelligence.entity.MindPushLog;
import com.fashion.supplychain.intelligence.mapper.MindPushLogMapper;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class SmartNotificationOrchestrator {

    @Autowired
    private MindPushLogMapper mindPushLogMapper;

    public SmartNotificationResponse generateNotifications() {
        SmartNotificationResponse resp = new SmartNotificationResponse();
        try {
            Long tenantId = UserContext.tenantId();
            List<NotificationItem> notifications = new ArrayList<>();

            LocalDateTime since = LocalDateTime.now().minusHours(24);
            List<MindPushLog> recentLogs = mindPushLogMapper.selectList(
                new QueryWrapper<MindPushLog>()
                    .eq("tenant_id", tenantId)
                    .ge("pushed_at", since)
                    .orderByDesc("pushed_at")
                    .last("LIMIT 50")
            );

            for (MindPushLog pushLog : recentLogs) {
                NotificationItem n = new NotificationItem();
                n.setTitle(pushLog.getTitle());
                n.setContent(pushLog.getContent());
                n.setOrderNo(pushLog.getOrderNo());
                n.setCreatedAt(pushLog.getPushedAt() != null
                    ? pushLog.getPushedAt().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : null);

                String ruleCode = pushLog.getRuleCode();
                n.setType(ruleCode);
                switch (ruleCode) {
                    case "DELIVERY_RISK":
                        n.setPriority("high");
                        n.setTargetRole("manager");
                        break;
                    case "STAGNANT":
                        n.setPriority("high");
                        n.setTargetRole("factory");
                        break;
                    case "MATERIAL_LOW":
                        n.setPriority("medium");
                        n.setTargetRole("procurement");
                        break;
                    case "PAYROLL_READY":
                        n.setPriority("low");
                        n.setTargetRole("finance");
                        break;
                    default:
                        n.setPriority("medium");
                        n.setTargetRole("all");
                }
                notifications.add(n);
            }

            int highPriorityCount = (int) notifications.stream()
                    .filter(n -> "high".equals(n.getPriority())).count();
            resp.setNotifications(notifications);
            resp.setPendingCount(highPriorityCount);
            resp.setSentToday(notifications.size());
            double successRate = notifications.isEmpty() ? 100.0
                    : Math.round((double)(notifications.size() - highPriorityCount) / notifications.size() * 1000) / 10.0;
            resp.setSuccessRate(successRate);
        } catch (Exception e) {
            log.error("[智能通知] 数据加载异常（降级返回空数据）: {}", e.getMessage(), e);
        }
        return resp;
    }

    public void notifyTeam(String teamCode, String title, String content, Long tenantId) {
        log.info("[Notification] notifyTeam: team={}, title={}, tenantId={}", teamCode, title, tenantId);
    }

    public void notifyRole(String roleCode, String title, String content, Long tenantId) {
        log.info("[Notification] notifyRole: role={}, title={}, tenantId={}", roleCode, title, tenantId);
    }

    public void notifyKpiDashboard(String dashboardType, String targetId, String level, Long tenantId) {
        log.info("[Notification] notifyKpiDashboard: type={}, targetId={}, level={}, tenantId={}",
                dashboardType, targetId, level, tenantId);
    }
}

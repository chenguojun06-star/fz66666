package com.fashion.supplychain.intelligence.orchestration.agent;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.service.WxAlertNotifyService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SysNoticeService;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.OrderRemarkService;
import com.fashion.supplychain.system.service.TenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
@Slf4j
public class SmartRemarkAgent {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("MM-dd HH:mm");
    private static final String AI_REMARK_PREFIX = "[AI巡检]";
    private static final int URGENT_THRESHOLD = 60;
    private static final Set<String> TERMINAL_STATUSES =
            Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired
    private TenantService tenantService;
    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ScanRecordMapper scanRecordMapper;
    @Autowired
    private SysNoticeService sysNoticeService;
    @Autowired(required = false)
    private WxAlertNotifyService wxAlertNotifyService;
    @Autowired(required = false)
    private DistributedLockService distributedLockService;
    @Autowired
    private OrderRemarkService orderRemarkService;
    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator traceOrchestrator;

    @Scheduled(cron = "0 20 * * * ?")
    public void runSmartRemark() {
        if (distributedLockService != null) {
            String lockValue = distributedLockService.tryLock("job:smart-remark", 50, TimeUnit.MINUTES);
            if (lockValue == null) {
                log.debug("[SmartRemark] 其他实例正在执行，跳过");
                return;
            }
            try {
                doSmartRemark();
            } finally {
                distributedLockService.unlock("job:smart-remark", lockValue);
            }
        } else {
            doSmartRemark();
        }
    }

    private void doSmartRemark() {
        log.info("[SmartRemark] 启动智能备注巡检...");
        List<Tenant> tenants = tenantService.list();
        int totalRemarks = 0;
        int totalNotices = 0;

        for (Tenant t : tenants) {
            if (isDisabled(t)) continue;
            UserContext ctx = new UserContext();
            ctx.setTenantId(t.getId());
            ctx.setUserId("SYSTEM");
            UserContext.set(ctx);
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(t.getId(), "smart-remark",
                        "智能备注巡检：紧急度评分>=60的订单自动备注");
                List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, t.getId())
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .list();

                if (orders.isEmpty()) {
                    traceOrchestrator.finishPatrolRequest(t.getId(), commandId,
                            "无活跃订单", null, System.currentTimeMillis() - start);
                    continue;
                }

                Map<String, LocalDateTime> lastScanMap = buildLastScanMap(orders);
                LocalDateTime now = LocalDateTime.now();
                int remarks = 0;
                int notices = 0;

                for (ProductionOrder order : orders) {
                    int score = computeUrgencyScore(order, lastScanMap.get(order.getId()), now);
                    if (score < URGENT_THRESHOLD) continue;

                    if (shouldRemark(order)) {
                        String remark = buildRemark(order, lastScanMap.get(order.getId()), now, score);
                        appendRemark(order, remark);
                        remarks++;
                        log.info("[SmartRemark] 已备注订单 {}: 紧急度={}, 备注={}", order.getOrderNo(), score, remark);
                    }

                    if (shouldNotify(order)) {
                        pushNotification(t.getId(), order, lastScanMap.get(order.getId()), now, score);
                        notices++;
                    }
                }
                totalRemarks += remarks;
                totalNotices += notices;
                traceOrchestrator.recordPatrolStep(t.getId(), commandId, "smartRemark",
                        "扫描" + orders.size() + "个订单，新增备注" + remarks + "条，通知" + notices + "条",
                        System.currentTimeMillis() - start, true);
                traceOrchestrator.finishPatrolRequest(t.getId(), commandId,
                        "备注" + remarks + "条，通知" + notices + "条", null, System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SmartRemark] 租户{}巡检异常: {}", t.getId(), e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(t.getId(), commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            } finally {
                UserContext.clear();
            }
        }
        log.info("[SmartRemark] 完成，新增备注{}条，新增通知{}条", totalRemarks, totalNotices);
    }

    int computeUrgencyScore(ProductionOrder order, LocalDateTime lastScan, LocalDateTime now) {
        int score = 0;

        if (order.getPlannedEndDate() != null) {
            long daysToDeadline = ChronoUnit.DAYS.between(now, order.getPlannedEndDate());

            if (daysToDeadline < 0) {
                score += Math.min(50, (int) Math.abs(daysToDeadline) * 10);
            } else if (daysToDeadline <= 3) {
                score += 30;
                if (order.getProductionProgress() != null && order.getProductionProgress() < 50) {
                    score += 15;
                }
            } else if (daysToDeadline <= 7) {
                score += 10;
                if (order.getProductionProgress() != null && order.getProductionProgress() < 20) {
                    score += 10;
                }
            }
        }

        if (lastScan != null) {
            long stagnantDays = ChronoUnit.DAYS.between(lastScan, now);
            if (stagnantDays >= 5) {
                score += 25;
            } else if (stagnantDays >= 3) {
                score += 15;
            }
        } else {
            if (order.getCreateTime() != null && ChronoUnit.DAYS.between(order.getCreateTime(), now) >= 3) {
                score += 20;
            }
        }

        if ("urgent".equals(order.getUrgencyLevel())) {
            if (order.getProductionProgress() != null && order.getProductionProgress() < 60) {
                score += 10;
            }
        }

        // materialArrivalRate=0 通常表示"无采购数据"而非"实际0%到位"，
        // 仅在有记录且偏低(>0 且 <50)时才加分，避免未录采购的订单被批量误报
        if (order.getMaterialArrivalRate() != null && order.getMaterialArrivalRate() > 0
                && order.getMaterialArrivalRate() < 50) {
            score += 10;
        }

        return Math.min(100, score);
    }

    private boolean shouldRemark(ProductionOrder order) {
        String remarks = order.getRemarks();
        if (remarks == null || remarks.isBlank()) return true;

        String today = LocalDateTime.now().format(DateTimeFormatter.ofPattern("MM-dd"));

        if (remarks.contains(AI_REMARK_PREFIX) && remarks.contains(today)) {
            return false;
        }

        return true;
    }

    private boolean shouldNotify(ProductionOrder order) {
        String orderNo = order.getOrderNo();
        if (orderNo == null) return false;

        return sysNoticeService.lambdaQuery()
                .eq(SysNotice::getTenantId, order.getTenantId())
                .eq(SysNotice::getOrderNo, orderNo)
                .eq(SysNotice::getNoticeType, "smart_remark")
                .gt(SysNotice::getCreatedAt, LocalDateTime.now().minusHours(24))
                .count() == 0;
    }

    private String buildRemark(ProductionOrder order, LocalDateTime lastScan, LocalDateTime now, int score) {
        StringBuilder sb = new StringBuilder();
        sb.append(AI_REMARK_PREFIX).append(now.format(FMT)).append(" ");

        if (order.getPlannedEndDate() != null) {
            long daysToDeadline = ChronoUnit.DAYS.between(now, order.getPlannedEndDate());
            if (daysToDeadline < 0) {
                sb.append("已逾期").append(Math.abs(daysToDeadline)).append("天");
            } else if (daysToDeadline <= 3) {
                sb.append("距交期仅").append(daysToDeadline).append("天");
            } else if (daysToDeadline <= 7) {
                sb.append("交期临近(剩余").append(daysToDeadline).append("天)");
            }
        }

        if (order.getProductionProgress() != null) {
            sb.append("，进度").append(order.getProductionProgress()).append("%");
        }

        if (lastScan != null) {
            long stagnantDays = ChronoUnit.DAYS.between(lastScan, now);
            if (stagnantDays >= 3) {
                sb.append("，已").append(stagnantDays).append("天无扫码");
            }
        }

        // 仅在有进度记录且偏低时显示物料到位提示；=0 通常表示未录入采购数据，否则会对所有订单误报
        if (order.getMaterialArrivalRate() != null && order.getMaterialArrivalRate() > 0
                && order.getMaterialArrivalRate() < 50) {
            sb.append("，物料到位仅").append(order.getMaterialArrivalRate()).append("%");
        }

        if (score >= 80) {
            sb.append("⚠️需紧急处理");
        } else if (score >= 60) {
            sb.append("需关注");
        }

        return sb.toString();
    }

    private void appendRemark(ProductionOrder order, String remark) {
        String existing = order.getRemarks();
        String newRemarks;
        if (existing == null || existing.isBlank()) {
            newRemarks = remark;
        } else {
            newRemarks = existing + "\n" + remark;
        }
        order.setRemarks(newRemarks);
        productionOrderService.updateById(order);

        try {
            String contentBody = remark.replaceFirst("^\\[AI巡检\\]\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}\\]\\s*", "");
            OrderRemark orderRemark = new OrderRemark();
            orderRemark.setTargetType("order");
            orderRemark.setTargetNo(order.getOrderNo());
            orderRemark.setAuthorName("AI巡检");
            orderRemark.setAuthorRole("AI巡检");
            orderRemark.setContent(contentBody);
            orderRemark.setTenantId(order.getTenantId());
            orderRemark.setCreateTime(LocalDateTime.now());
            orderRemark.setDeleteFlag(0);
            orderRemarkService.save(orderRemark);
        } catch (Exception e) {
            log.warn("AI巡检备注写入t_order_remark失败: orderId={}, error={}", order.getId(), e.getMessage());
        }
    }

    private void pushNotification(Long tenantId, ProductionOrder order, LocalDateTime lastScan, LocalDateTime now, int score) {
        String toName = order.getMerchandiser();
        if (toName == null || toName.isBlank()) {
            toName = "管理员";
        }

        String title;
        String content;

        if (score >= 80) {
            title = "🚨 紧急：" + order.getOrderNo();
        } else {
            title = "⚠️ 需关注：" + order.getOrderNo();
        }

        StringBuilder body = new StringBuilder();
        body.append("订单【").append(order.getOrderNo()).append("】");

        if (order.getStyleNo() != null) {
            body.append("（").append(order.getStyleNo()).append("）");
        }

        if (order.getPlannedEndDate() != null) {
            long daysToDeadline = ChronoUnit.DAYS.between(now, order.getPlannedEndDate());
            if (daysToDeadline < 0) {
                body.append("已逾期").append(Math.abs(daysToDeadline)).append("天");
            } else {
                body.append("交期").append(order.getPlannedEndDate().format(DateTimeFormatter.ofPattern("MM-dd")));
                body.append("(剩余").append(daysToDeadline).append("天)");
            }
        }

        if (order.getProductionProgress() != null) {
            body.append("，进度").append(order.getProductionProgress()).append("%");
        }

        if (order.getFactoryName() != null) {
            body.append("，工厂：").append(order.getFactoryName());
        }

        if (lastScan != null) {
            long stagnantDays = ChronoUnit.DAYS.between(lastScan, now);
            if (stagnantDays >= 3) {
                body.append("，已").append(stagnantDays).append("天无生产记录");
            }
        }

        if (order.getMaterialArrivalRate() != null && order.getMaterialArrivalRate() < 50) {
            body.append("，物料到位率仅").append(order.getMaterialArrivalRate()).append("%");
        }

        body.append("。请及时跟进处理。");

        content = body.toString();

        SysNotice notice = new SysNotice();
        notice.setTenantId(tenantId);
        notice.setToName(toName);
        notice.setFromName("AI智能巡检");
        notice.setOrderNo(order.getOrderNo());
        notice.setTitle(title);
        notice.setContent(content);
        notice.setNoticeType("smart_remark");
        notice.setIsRead(0);
        notice.setCreatedAt(LocalDateTime.now());
        sysNoticeService.save(notice);

        if (wxAlertNotifyService != null && score >= 80) {
            try {
                String wxContent = content.length() > 20 ? content.substring(0, 20) + "…" : content;
                wxAlertNotifyService.notifyAlert(tenantId, title, wxContent, order.getOrderNo(), "pages/work/ai-assistant/index");
                log.info("[SmartRemark] 已推送微信订阅消息: {}", title);
            } catch (Exception e) {
                log.warn("[SmartRemark] 微信订阅消息推送失败: {}", e.getMessage());
            }
        }

        log.info("[SmartRemark] 已推送通知给 {}: {}", toName, title);
    }

    private Map<String, LocalDateTime> buildLastScanMap(List<ProductionOrder> orders) {
        List<String> ids = orders.stream().map(ProductionOrder::getId).collect(Collectors.toList());
        if (ids.isEmpty()) return Collections.emptyMap();

        Long tid = orders.get(0).getTenantId();
        List<Map<String, Object>> lastScans = scanRecordMapper.selectLastScanTimeByOrderIds(ids, tid);
        Map<String, LocalDateTime> map = new HashMap<>();
        for (Map<String, Object> row : lastScans) {
            String ordId = (String) row.get("orderId");
            Object ts = row.get("lastScanTime");
            if (ordId != null && ts != null) {
                if (ts instanceof Timestamp) {
                    map.put(ordId, ((Timestamp) ts).toLocalDateTime());
                } else if (ts instanceof LocalDateTime) {
                    map.put(ordId, (LocalDateTime) ts);
                }
            }
        }
        return map;
    }

    private boolean isDisabled(Tenant t) {
        if (t == null) return true;
        String s = t.getStatus();
        return "DISABLED".equalsIgnoreCase(s) || "SUSPENDED".equalsIgnoreCase(s);
    }
}

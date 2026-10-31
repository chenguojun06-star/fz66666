package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.OrderRiskTracking;
import com.fashion.supplychain.intelligence.mapper.OrderRiskTrackingMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.annotation.Lazy;

@Slf4j
@Service
@Lazy
public class OrderRiskTrackingOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private OrderRiskTrackingMapper riskTrackingMapper;

    @Transactional(rollbackFor = Exception.class)
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
        // 幂等守卫（D-906）：同一订单已有未闭环风险时**只刷新等级/因子，不再插新记录**。
        // 历史教训：D-879 之前每次评估都插一条，线上单订单堆到 2850 条、全表 30715 条，
        // 而 listOpenRisks() 每次风险评估都要全量拉出来 → 越跑越慢、统计全失真。
        // 防线放在这里（而不是只依赖调用方），任何新调用点都不会再制造重复。
        try {
            OrderRiskTracking existing = findOpenByOrderNo(tenantId, orderNo);
            if (existing != null) {
                boolean levelChanged = !riskLevel.equals(existing.getRiskLevel());
                if (levelChanged) {
                    refreshOpenRisk(existing.getId(), riskLevel, riskFactors);
                }
                log.debug("[订单风险闭环] 已有未闭环风险，跳过重复创建: orderNo={}, riskId={}, levelChanged={}",
                        orderNo, existing.getId(), levelChanged);
                return existing.getId();
            }
        } catch (Exception e) {
            log.debug("[订单风险闭环] 幂等检查失败，继续走创建: orderNo={}, err={}", orderNo, e.getMessage());
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
            log.warn("[订单风险闭环] 创建风险失败: orderNo={}, error={}", orderNo, e.getMessage(), e);
            return null;
        }
    }

    /**
     * 当前租户所有未闭环风险（pending / escalated）。
     *
     * <p>D-879：供风险表自维护使用——一次查全量再内存比对，避免逐单查库。
     */
    public List<OrderRiskTracking> listOpenRisks() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return List.of();
        }
        LambdaQueryWrapper<OrderRiskTracking> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OrderRiskTracking::getTenantId, tenantId);
        wrapper.in(OrderRiskTracking::getHandlingStatus, "pending", "escalated");
        wrapper.orderByDesc(OrderRiskTracking::getCreatedAt);
        // 防御上限（D-906）：历史脏数据可能几万条，宁可截断也不能把调用方拖死
        wrapper.last("LIMIT 5000");
        List<OrderRiskTracking> all = riskTrackingMapper.selectList(wrapper);
        // 按订单去重：**每个订单只返回最新一条**。
        // 历史上同一订单被重复插入（线上 35 个订单堆了 30715 条），
        // 不去重的话列表/统计/AI 上下文都会被同一条风险刷屏。
        Map<String, OrderRiskTracking> byOrder = new LinkedHashMap<>();
        for (OrderRiskTracking r : all) {
            if (r.getOrderNo() == null) {
                continue;
            }
            byOrder.putIfAbsent(r.getOrderNo(), r);   // 已按 created_at 倒序，首次即最新
        }
        return new ArrayList<>(byOrder.values());
    }

    /**
     * 查同一订单当前未闭环的风险（D-906 幂等守卫用）。
     *
     * @return 最新一条 pending/escalated 记录；没有则 null
     */
    public OrderRiskTracking findOpenByOrderNo(Long tenantId, String orderNo) {
        if (tenantId == null || orderNo == null || orderNo.isBlank()) {
            return null;
        }
        LambdaQueryWrapper<OrderRiskTracking> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OrderRiskTracking::getTenantId, tenantId);
        wrapper.eq(OrderRiskTracking::getOrderNo, orderNo);
        wrapper.in(OrderRiskTracking::getHandlingStatus, "pending", "escalated");
        wrapper.orderByDesc(OrderRiskTracking::getCreatedAt);
        wrapper.last("LIMIT 1");
        return riskTrackingMapper.selectOne(wrapper);
    }

    /**
     * 同一订单最近一条风险记录（任意状态）。
     *
     * <p>D-879：用于区分「首次出险」与「复现」——复现要重开原记录保留历史，
     * 不能再插一条新记录。
     */
    public OrderRiskTracking findLatestByOrderNo(String orderNo) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || orderNo == null || orderNo.isBlank()) {
            return null;
        }
        LambdaQueryWrapper<OrderRiskTracking> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OrderRiskTracking::getTenantId, tenantId);
        wrapper.eq(OrderRiskTracking::getOrderNo, orderNo);
        wrapper.orderByDesc(OrderRiskTracking::getCreatedAt);
        wrapper.last("LIMIT 1");
        return riskTrackingMapper.selectOne(wrapper);
    }

    /**
     * 风险等级/因子变化时刷新未闭环记录。
     *
     * <p>D-879：同一订单反复评估时，表里显示的应是**当前**严重程度，
     * 而不是第一次出险时的等级（danger 升级成 overdue 必须看得见）。
     * 已闭环（resolved/cancelled）的记录不刷新，保留处理时的原貌。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean refreshOpenRisk(Long riskId, String riskLevel, List<String> riskFactors) {
        try {
            OrderRiskTracking tracking = riskTrackingMapper.selectById(riskId);
            if (tracking == null) {
                return false;
            }
            if (!"pending".equals(tracking.getHandlingStatus())
                    && !"escalated".equals(tracking.getHandlingStatus())) {
                return false;
            }
            tracking.setRiskLevel(riskLevel);
            if (riskFactors != null) {
                tracking.setRiskFactors(MAPPER.writeValueAsString(riskFactors));
            }
            riskTrackingMapper.updateById(tracking);
            log.info("[订单风险闭环] 风险等级已刷新: id={}, level={}", riskId, riskLevel);
            return true;
        } catch (Exception e) {
            log.warn("[订单风险闭环] 刷新风险失败: id={}, error={}", riskId, e.getMessage(), e);
            return false;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean resolveRisk(Long riskId, String handlingAction, String handlingResult) {
        return resolveRisk(riskId, handlingAction, handlingResult, UserContext.username());
    }

    /**
     * 处理风险（指定处理人）。
     *
     * <p>D-879：自动解除场景要落「系统」而不是当前操作人——风险是评估引擎
     * 判定已恢复后自动关闭的，记到碰巧在查看页面的用户名下会误导审计。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean resolveRisk(Long riskId, String handlingAction, String handlingResult, String handledBy) {
        try {
            OrderRiskTracking tracking = riskTrackingMapper.selectById(riskId);
            if (tracking == null) return false;
            tracking.setHandlingStatus("resolved");
            tracking.setHandlingAction(handlingAction);
            tracking.setHandlingResult(handlingResult);
            tracking.setHandledBy(handledBy);
            tracking.setHandledAt(LocalDateTime.now());
            riskTrackingMapper.updateById(tracking);
            log.info("[订单风险闭环] 风险已处理: id={}, status=resolved, by={}", riskId, handledBy);
            return true;
        } catch (Exception e) {
            log.warn("[订单风险闭环] 处理风险失败: id={}, error={}", riskId, e.getMessage(), e);
            return false;
        }
    }

    @Transactional(rollbackFor = Exception.class)
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
            log.warn("[订单风险闭环] 升级风险失败: id={}, error={}", riskId, e.getMessage(), e);
            return false;
        }
    }

    /**
     * 撤销风险标签（AI误标记时人员可清除）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean clearRisk(Long riskId, String cancelReason) {
        try {
            OrderRiskTracking tracking = riskTrackingMapper.selectById(riskId);
            if (tracking == null) return false;
            tracking.setHandlingStatus("cancelled");
            tracking.setCancelledAt(LocalDateTime.now());
            tracking.setCancelledBy(UserContext.username());
            tracking.setCancelReason(cancelReason);
            riskTrackingMapper.updateById(tracking);
            log.info("[订单风险闭环] 风险已撤销: id={}, reason={}", riskId, cancelReason);
            return true;
        } catch (Exception e) {
            log.warn("[订单风险闭环] 撤销风险失败: id={}, error={}", riskId, e.getMessage(), e);
            return false;
        }
    }

    /**
     * 重开已处理的风险（误处理后可纠正）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean reopenRisk(Long riskId, String reason) {
        try {
            OrderRiskTracking tracking = riskTrackingMapper.selectById(riskId);
            if (tracking == null) return false;
            tracking.setHandlingStatus("pending");
            tracking.setHandlingAction(null);
            tracking.setHandlingResult(null);
            tracking.setHandledBy(null);
            tracking.setHandledAt(null);
            riskTrackingMapper.updateById(tracking);
            log.info("[订单风险闭环] 风险已重开: id={}, reason={}", riskId, reason);
            return true;
        } catch (Exception e) {
            log.warn("[订单风险闭环] 重开风险失败: id={}, error={}", riskId, e.getMessage(), e);
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

            // D-906 口径修复（两个错都在线上实锤过）：
            // ① 原来按**记录行**统计：同一订单被重复插入后，一个订单算成 2850 条"风险"，
            //    线上 30 天显示 9671 条风险，实际只有 12 个订单 → 数字完全是假的
            // ② highRisk 用 "high" 匹配，而库里风险等级只有 overdue / danger
            //    （见 DeliveryRiskItem 枚举）→ 高风险数**恒为 0**
            // 现在统一按**订单**统计，等级判定兼容 overdue/danger/high。
            long totalRecords = records.size();
            Map<String, OrderRiskTracking> latestByOrder = new LinkedHashMap<>();
            for (OrderRiskTracking r : records) {
                if (r.getOrderNo() == null) {
                    continue;
                }
                // records 未排序，这里按创建时间保留最新一条
                OrderRiskTracking prev = latestByOrder.get(r.getOrderNo());
                if (prev == null || (r.getCreatedAt() != null
                        && (prev.getCreatedAt() == null || r.getCreatedAt().isAfter(prev.getCreatedAt())))) {
                    latestByOrder.put(r.getOrderNo(), r);
                }
            }
            long totalOrders = latestByOrder.size();
            long pending = latestByOrder.values().stream()
                    .filter(r -> "pending".equals(r.getHandlingStatus())).count();
            long resolved = latestByOrder.values().stream()
                    .filter(r -> "resolved".equals(r.getHandlingStatus())).count();
            long escalated = latestByOrder.values().stream()
                    .filter(r -> "escalated".equals(r.getHandlingStatus())).count();
            long highRisk = latestByOrder.values().stream()
                    .filter(r -> isHighRiskLevel(r.getRiskLevel())).count();

            stats.put("period", days + "天");
            stats.put("totalRisks", totalOrders);          // 出险订单数（口径=订单）
            stats.put("totalRiskRecords", totalRecords);   // 原始记录数（排查用，前端可忽略）
            stats.put("pending", pending);
            stats.put("resolved", resolved);
            stats.put("escalated", escalated);
            stats.put("highRisk", highRisk);
            stats.put("resolutionRate",
                    totalOrders > 0 ? Math.round((double) resolved / totalOrders * 1000.0) / 10.0 + "%" : "N/A");
        } catch (Exception e) {
            log.warn("[订单风险闭环] 获取统计失败: {}", e.getMessage());
        }
        return stats;
    }

    /** 高风险等级判定（D-906）：兼容 overdue / danger / high 三种写法 */
    private static boolean isHighRiskLevel(String level) {
        return "overdue".equals(level) || "danger".equals(level) || "high".equals(level);
    }
}

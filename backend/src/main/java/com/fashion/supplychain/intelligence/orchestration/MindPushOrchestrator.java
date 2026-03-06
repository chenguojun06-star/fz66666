package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.MindPushRuleDTO;
import com.fashion.supplychain.intelligence.dto.MindPushStatusResponse;
import com.fashion.supplychain.intelligence.dto.MindPushStatusResponse.LogItem;
import com.fashion.supplychain.intelligence.dto.MindPushStatusResponse.Stats;
import com.fashion.supplychain.intelligence.entity.MindPushLog;
import com.fashion.supplychain.intelligence.entity.MindPushRule;
import com.fashion.supplychain.intelligence.mapper.MindPushLogMapper;
import com.fashion.supplychain.intelligence.mapper.MindPushRuleMapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * MindPush 主动推送中枢编排器
 *
 * <p>支持四类推送事件：
 * <ol>
 *   <li>DELIVERY_RISK — 交期风险（距交期≤N天且进度&lt;P%）</li>
 *   <li>STAGNANT      — 停滞预警（进行中订单≥3天无新扫码）</li>
 *   <li>MATERIAL_LOW  — 面料到货率低（采购完成率&lt;40% 且订单即将开工）</li>
 *   <li>PAYROLL_READY — 工资可结算（月末有已完工订单）</li>
 * </ol>
 *
 * <p>独立编排器，不混入 SmartNotificationOrchestrator。
 */
@Service
@Slf4j
public class MindPushOrchestrator {

    // ─── 四类规则默认配置 ──────────────────────────────────────────
    private static final List<Map.Entry<String, String>> DEFAULT_RULES = List.of(
        Map.entry("DELIVERY_RISK", "交期风险预警"),
        Map.entry("STAGNANT",      "生产停滞预警"),
        Map.entry("MATERIAL_LOW",  "面料到货率低"),
        Map.entry("PAYROLL_READY", "工资可结算提醒")
    );

    @Autowired
    private MindPushRuleMapper mindPushRuleMapper;

    @Autowired
    private MindPushLogMapper mindPushLogMapper;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    // ─── 查询当前状态 ──────────────────────────────────────────────

    public MindPushStatusResponse getStatus() {
        Long tenantId = UserContext.tenantId();
        List<MindPushRule> dbRules = fetchRules(tenantId);

        // 将 DB 规则转 DTO（未找到的用默认值填充）
        List<MindPushRuleDTO> ruleDtos = mergeWithDefaults(dbRules);

        // 近期20条推送日志
        List<MindPushLog> logs = mindPushLogMapper.selectList(
            new QueryWrapper<MindPushLog>()
                .eq("tenant_id", tenantId)
                .orderByDesc("pushed_at")
                .last("LIMIT 20")
        );
        List<LogItem> logItems = logs.stream().map(l -> LogItem.builder()
            .ruleCode(l.getRuleCode())
            .orderNo(l.getOrderNo())
            .title(l.getTitle())
            .content(l.getContent())
            .pushedAt(l.getPushedAt())
            .build()
        ).collect(Collectors.toList());

        // 统计
        LocalDateTime now = LocalDateTime.now();
        long pushed24h = mindPushLogMapper.selectCount(
            new QueryWrapper<MindPushLog>()
                .eq("tenant_id", tenantId)
                .ge("pushed_at", now.minusHours(24))
        );
        long pushed7d = mindPushLogMapper.selectCount(
            new QueryWrapper<MindPushLog>()
                .eq("tenant_id", tenantId)
                .ge("pushed_at", now.minusDays(7))
        );
        long activeRules = ruleDtos.stream().filter(r -> Boolean.TRUE.equals(r.getEnabled())).count();

        return MindPushStatusResponse.builder()
            .rules(ruleDtos)
            .recentLog(logItems)
            .stats(Stats.builder()
                .pushed24h(pushed24h)
                .pushed7d(pushed7d)
                .activeRules(activeRules)
                .build())
            .build();
    }

    // ─── 保存规则配置 ──────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void saveRule(MindPushRuleDTO dto) {
        Long tenantId = UserContext.tenantId();
        MindPushRule existing = mindPushRuleMapper.selectOne(
            new QueryWrapper<MindPushRule>()
                .eq("tenant_id", tenantId)
                .eq("rule_code", dto.getRuleCode())
        );
        if (existing == null) {
            MindPushRule rule = new MindPushRule();
            rule.setTenantId(tenantId);
            rule.setRuleCode(dto.getRuleCode());
            rule.setRuleName(dto.getRuleName() != null ? dto.getRuleName() : dto.getRuleCode());
            rule.setEnabled(Boolean.TRUE.equals(dto.getEnabled()) ? 1 : 0);
            rule.setThresholdDays(dto.getThresholdDays() != null ? dto.getThresholdDays() : 3);
            rule.setThresholdProgress(dto.getThresholdProgress() != null ? dto.getThresholdProgress() : 60);
            rule.setCreatedAt(LocalDateTime.now());
            rule.setUpdatedAt(LocalDateTime.now());
            mindPushRuleMapper.insert(rule);
        } else {
            if (dto.getEnabled() != null) existing.setEnabled(Boolean.TRUE.equals(dto.getEnabled()) ? 1 : 0);
            if (dto.getThresholdDays() != null) existing.setThresholdDays(dto.getThresholdDays());
            if (dto.getThresholdProgress() != null) existing.setThresholdProgress(dto.getThresholdProgress());
            existing.setUpdatedAt(LocalDateTime.now());
            mindPushRuleMapper.updateById(existing);
        }
    }

    // ─── 执行一轮推送检测 ─────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public int runPushCheck(Long tenantId) {
        List<MindPushRule> rules = fetchRules(tenantId);
        Map<String, MindPushRule> ruleMap = rules.stream()
            .collect(Collectors.toMap(MindPushRule::getRuleCode, r -> r));

        int totalPushed = 0;
        totalPushed += checkDeliveryRisk(tenantId, ruleMap);
        totalPushed += checkStagnant(tenantId, ruleMap);
        totalPushed += checkMaterialLow(tenantId, ruleMap);
        totalPushed += checkPayrollReady(tenantId, ruleMap);

        log.info("[MindPush] tenantId={} 本轮检测写入推送日志 {} 条", tenantId, totalPushed);
        return totalPushed;
    }

    // ─── 四类检测逻辑 ─────────────────────────────────────────────

    private int checkDeliveryRisk(Long tenantId, Map<String, MindPushRule> ruleMap) {
        if (!isEnabled("DELIVERY_RISK", ruleMap)) return 0;
        MindPushRule rule = ruleMap.get("DELIVERY_RISK");
        int thresholdDays = rule != null && rule.getThresholdDays() != null ? rule.getThresholdDays() : 3;
        int thresholdProgress = rule != null && rule.getThresholdProgress() != null ? rule.getThresholdProgress() : 60;

        List<ProductionOrder> orders = productionOrderService.list(
            new QueryWrapper<ProductionOrder>()
                .eq("tenant_id", tenantId)
                .in("status", "IN_PROGRESS", "PENDING")
                .isNotNull("expected_ship_date")
        );
        LocalDateTime deadline = LocalDateTime.now().plusDays(thresholdDays);
        int count = 0;
        for (ProductionOrder o : orders) {
            if (o.getExpectedShipDate() == null) continue;
            long daysLeft = ChronoUnit.DAYS.between(LocalDateTime.now(), o.getExpectedShipDate());
            int progress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
            if (daysLeft <= thresholdDays && progress < thresholdProgress) {
                String title = "⚠️ 交期风险：" + o.getOrderNo();
                String content = String.format("订单 %s 距交期仅 %d 天，当前进度 %d%%，请及时跟进", o.getOrderNo(), daysLeft, progress);
                writePushLog(tenantId, "DELIVERY_RISK", o.getId().toString(), o.getOrderNo(), title, content);
                count++;
            }
        }
        return count;
    }

    private int checkStagnant(Long tenantId, Map<String, MindPushRule> ruleMap) {
        if (!isEnabled("STAGNANT", ruleMap)) return 0;

        List<ProductionOrder> orders = productionOrderService.list(
            new QueryWrapper<ProductionOrder>()
                .eq("tenant_id", tenantId)
                .eq("status", "IN_PROGRESS")
        );
        LocalDateTime cutoff = LocalDateTime.now().minusDays(3);
        int count = 0;
        for (ProductionOrder o : orders) {
            long scanCount = scanRecordService.count(
                new QueryWrapper<ScanRecord>()
                    .eq("order_id", o.getId())
                    .ge("scan_time", cutoff)
                    .eq("scan_result", "success")
            );
            if (scanCount == 0) {
                String title = "⏸️ 生产停滞：" + o.getOrderNo();
                String content = String.format("订单 %s 已超过 3 天无扫码记录，当前进度 %d%%，请确认是否停工",
                    o.getOrderNo(), o.getProductionProgress() != null ? o.getProductionProgress() : 0);
                writePushLog(tenantId, "STAGNANT", o.getId().toString(), o.getOrderNo(), title, content);
                count++;
            }
        }
        return count;
    }

    private int checkMaterialLow(Long tenantId, Map<String, MindPushRule> ruleMap) {
        if (!isEnabled("MATERIAL_LOW", ruleMap)) return 0;

        List<ProductionOrder> orders = productionOrderService.list(
            new QueryWrapper<ProductionOrder>()
                .eq("tenant_id", tenantId)
                .in("status", "PENDING", "IN_PROGRESS")
                .isNotNull("procurement_completion_rate")
                .lt("procurement_completion_rate", 40)
        );
        int count = 0;
        for (ProductionOrder o : orders) {
            int rate = o.getProcurementCompletionRate() != null ? o.getProcurementCompletionRate() : 0;
            String title = "📦 面料不足：" + o.getOrderNo();
            String content = String.format("订单 %s 面料到货率仅 %d%%，可能影响开工进度，请及时采购", o.getOrderNo(), rate);
            writePushLog(tenantId, "MATERIAL_LOW", o.getId().toString(), o.getOrderNo(), title, content);
            count++;
        }
        return count;
    }

    private int checkPayrollReady(Long tenantId, Map<String, MindPushRule> ruleMap) {
        if (!isEnabled("PAYROLL_READY", ruleMap)) return 0;

        // 月末（每月28日以后）才触发
        if (LocalDateTime.now().getDayOfMonth() < 28) return 0;

        long completedCount = productionOrderService.count(
            new QueryWrapper<ProductionOrder>()
                .eq("tenant_id", tenantId)
                .in("status", "COMPLETED", "IN_PROGRESS")
                .gt("completed_quantity", 0)
        );
        if (completedCount > 0) {
            String title = "💰 工资可结算";
            String content = String.format("当前有 %d 个订单有已完工数量，可前往财务模块进行工资结算", completedCount);
            writePushLog(tenantId, "PAYROLL_READY", null, null, title, content);
            return 1;
        }
        return 0;
    }

    // ─── 私有辅助 ─────────────────────────────────────────────────

    private boolean isEnabled(String ruleCode, Map<String, MindPushRule> ruleMap) {
        MindPushRule rule = ruleMap.get(ruleCode);
        // 未配置规则时，默认启用
        return rule == null || Integer.valueOf(1).equals(rule.getEnabled());
    }

    private void writePushLog(Long tenantId, String ruleCode, String orderId,
                               String orderNo, String title, String content) {
        MindPushLog log = new MindPushLog();
        log.setTenantId(tenantId);
        log.setRuleCode(ruleCode);
        log.setOrderId(orderId);
        log.setOrderNo(orderNo);
        log.setTitle(title);
        log.setContent(content);
        log.setChannel("IN_APP");
        log.setPushedAt(LocalDateTime.now());
        mindPushLogMapper.insert(log);
    }

    private List<MindPushRule> fetchRules(Long tenantId) {
        return mindPushRuleMapper.selectList(
            new QueryWrapper<MindPushRule>().eq("tenant_id", tenantId)
        );
    }

    private List<MindPushRuleDTO> mergeWithDefaults(List<MindPushRule> dbRules) {
        Map<String, MindPushRule> dbMap = dbRules.stream()
            .collect(Collectors.toMap(MindPushRule::getRuleCode, r -> r));

        return DEFAULT_RULES.stream().map(entry -> {
            MindPushRuleDTO dto = new MindPushRuleDTO();
            dto.setRuleCode(entry.getKey());
            dto.setRuleName(entry.getValue());
            MindPushRule dbRule = dbMap.get(entry.getKey());
            if (dbRule != null) {
                dto.setEnabled(Integer.valueOf(1).equals(dbRule.getEnabled()));
                dto.setThresholdDays(dbRule.getThresholdDays());
                dto.setThresholdProgress(dbRule.getThresholdProgress());
            } else {
                dto.setEnabled(true);
                dto.setThresholdDays(3);
                dto.setThresholdProgress(60);
            }
            return dto;
        }).collect(Collectors.toList());
    }
}

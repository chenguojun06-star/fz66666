package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.WxAlertNotifyService;
import com.fashion.supplychain.common.tenant.TenantAssert;
import org.springframework.dao.DataAccessException;
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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
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
    private WxAlertNotifyService wxAlertNotifyService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private com.fashion.supplychain.production.service.SysNoticeService sysNoticeService;

    // ─── 查询当前状态 ──────────────────────────────────────────────

    public MindPushStatusResponse getStatus() {
        Long tenantId = UserContext.tenantId();
        List<MindPushRule> dbRules;
        try {
            dbRules = fetchRules(tenantId);
        } catch (Exception e) {
            log.warn("[MindPush] fetchRules 失败（可能表/列不存在），返回默认: {}", e.getMessage());
            dbRules = Collections.emptyList();
        }

        // 将 DB 规则转 DTO（未找到的用默认值填充）
        List<MindPushRuleDTO> ruleDtos = mergeWithDefaults(dbRules);

        // 近期20条推送日志
        List<LogItem> logItems = Collections.emptyList();
        long pushed24h = 0, pushed7d = 0;
        try {
            List<MindPushLog> logs = mindPushLogMapper.selectList(
                new QueryWrapper<MindPushLog>()
                    .eq("tenant_id", tenantId)
                    .orderByDesc("pushed_at")
                    .last("LIMIT 20")
            );
            logItems = logs.stream().map(l -> LogItem.builder()
                .id(l.getId())
                .ruleCode(l.getRuleCode())
                .orderNo(l.getOrderNo())
                .pushMessage(l.getTitle() != null ? l.getTitle() : l.getContent())
                .channel(l.getChannel())
                .createdAt(l.getPushedAt())
                .build()
            ).collect(Collectors.toList());

            LocalDateTime now = LocalDateTime.now();
            pushed24h = mindPushLogMapper.selectCount(
                new QueryWrapper<MindPushLog>()
                    .eq("tenant_id", tenantId)
                    .ge("pushed_at", now.minusHours(24))
            );
            pushed7d = mindPushLogMapper.selectCount(
                new QueryWrapper<MindPushLog>()
                    .eq("tenant_id", tenantId)
                    .ge("pushed_at", now.minusDays(7))
            );
        } catch (Exception e) {
            log.warn("[MindPush] 查询推送日志异常: {}", e.getMessage());
        }
        long activeRules = ruleDtos.stream().filter(r -> Boolean.TRUE.equals(r.getEnabled())).count();

        return MindPushStatusResponse.builder()
            .rules(ruleDtos)
            .recentLog(logItems)
            .stats(Stats.builder()
                .pushed24h(pushed24h)
                .pushed7d(pushed7d)
                .activeRules(activeRules)
                .build())
            .notifyTimeStart(extractPushTimeStart(dbRules))
            .notifyTimeEnd(extractPushTimeEnd(dbRules))
            .build();
    }

    // ─── 保存规则配置 ──────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void saveRule(MindPushRuleDTO dto) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        try {
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
                rule.setNotifyTimeStart(dto.getNotifyTimeStart() != null ? dto.getNotifyTimeStart() : "08:00");
                rule.setNotifyTimeEnd(dto.getNotifyTimeEnd() != null ? dto.getNotifyTimeEnd() : "22:00");
                rule.setCreatedAt(LocalDateTime.now());
                rule.setUpdatedAt(LocalDateTime.now());
                mindPushRuleMapper.insert(rule);
            } else {
                if (dto.getEnabled() != null) existing.setEnabled(Boolean.TRUE.equals(dto.getEnabled()) ? 1 : 0);
                if (dto.getThresholdDays() != null) existing.setThresholdDays(dto.getThresholdDays());
                if (dto.getThresholdProgress() != null) existing.setThresholdProgress(dto.getThresholdProgress());
                if (dto.getNotifyTimeStart() != null) existing.setNotifyTimeStart(dto.getNotifyTimeStart());
                if (dto.getNotifyTimeEnd() != null) existing.setNotifyTimeEnd(dto.getNotifyTimeEnd());
                existing.setUpdatedAt(LocalDateTime.now());
                mindPushRuleMapper.updateById(existing);
            }
        } catch (DataAccessException ex) {
            log.error("[MindPush] saveRule 数据库操作失败 ruleCode={}: {}", dto.getRuleCode(), ex.getMessage());
            throw new BusinessException("推送规则保存失败，请稍后重试（数据库异常）");
        }
    }

    /**
     * 批量保存推送时段（统一修改该租户所有规则的推送时段）
     */
    @Transactional(rollbackFor = Exception.class)
    public void savePushTimeWindow(String timeStart, String timeEnd) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<MindPushRule> rules = fetchRules(tenantId);
        if (rules.isEmpty()) {
            // 没有规则时，初始化全部默认规则并写入时段
            for (Map.Entry<String, String> entry : DEFAULT_RULES) {
                MindPushRule r = new MindPushRule();
                r.setTenantId(tenantId);
                r.setRuleCode(entry.getKey());
                r.setRuleName(entry.getValue());
                r.setEnabled(1);
                r.setThresholdDays(3);
                r.setThresholdProgress(60);
                r.setNotifyTimeStart(timeStart);
                r.setNotifyTimeEnd(timeEnd);
                r.setCreatedAt(LocalDateTime.now());
                r.setUpdatedAt(LocalDateTime.now());
                mindPushRuleMapper.insert(r);
            }
        } else {
            for (MindPushRule r : rules) {
                r.setNotifyTimeStart(timeStart);
                r.setNotifyTimeEnd(timeEnd);
                r.setUpdatedAt(LocalDateTime.now());
                mindPushRuleMapper.updateById(r);
            }
        }
    }

    /**
     * 检查当前时间是否在该租户的推送时段内（供 SmartNotifyJob 调用）
     */
    public boolean isWithinPushWindow(Long tenantId) {
        List<MindPushRule> rules = fetchRules(tenantId);
        String start = extractPushTimeStart(rules);
        String end = extractPushTimeEnd(rules);
        try {
            LocalTime now = LocalTime.now();
            LocalTime startTime = LocalTime.parse(start);
            LocalTime endTime = LocalTime.parse(end);
            if (startTime.isBefore(endTime)) {
                return !now.isBefore(startTime) && !now.isAfter(endTime);
            } else {
                // 跨午夜：如 22:00 - 06:00
                return !now.isBefore(startTime) || !now.isAfter(endTime);
            }
        } catch (Exception e) {
            log.warn("[MindPush] 解析推送时段失败 start={} end={}，默认允许推送", start, end);
            return true;
        }
    }

    // ─── 执行一轮推送检测 ─────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public int runPushCheck(Long tenantId) {
        List<MindPushRule> rules = fetchRules(tenantId);
        Map<String, MindPushRule> ruleMap = rules.stream()
            .collect(Collectors.toMap(MindPushRule::getRuleCode, r -> r, (a, b) -> a));

        int totalPushed = 0;
        totalPushed += safeCheck("DELIVERY_RISK", () -> checkDeliveryRisk(tenantId, ruleMap));
        totalPushed += safeCheck("STAGNANT", () -> checkStagnant(tenantId, ruleMap));
        totalPushed += safeCheck("MATERIAL_LOW", () -> checkMaterialLow(tenantId, ruleMap));
        totalPushed += safeCheck("PAYROLL_READY", () -> checkPayrollReady(tenantId, ruleMap));

        log.info("[MindPush] tenantId={} 本轮检测写入推送日志 {} 条", tenantId, totalPushed);
        return totalPushed;
    }

    /** 单项检测隔离：任一检测异常不影响其他检测 */
    private int safeCheck(String checkName, java.util.function.Supplier<Integer> check) {
        try {
            return check.get();
        } catch (Exception e) {
            log.warn("[MindPush] {} 检测异常，跳过: {}", checkName, e.getMessage());
            return 0;
        }
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
                .in("status", "production", "pending")
                .isNotNull("expected_ship_date")
        );
        int count = 0;
        for (ProductionOrder o : orders) {
            if (o.getExpectedShipDate() == null) continue;
            // 使用 LocalDate.now() 与 LocalDate 类型的 expectedShipDate 比较，避免 DateTimeException
            long daysLeft = ChronoUnit.DAYS.between(LocalDate.now(), o.getExpectedShipDate());
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
                .eq("status", "production")
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

        // procurement_completion_rate 列不存在，改为检查「未手动完成采购」的进行中/待生产订单
        List<ProductionOrder> orders = productionOrderService.list(
            new QueryWrapper<ProductionOrder>()
                .eq("tenant_id", tenantId)
                .in("status", "pending", "production")
                .eq("procurement_manually_completed", 0)
        );
        int count = 0;
        for (ProductionOrder o : orders) {
            String title = "📦 面料待確认：" + o.getOrderNo();
            String content = String.format("订单 %s 采购尚未确认完成，可能影响开工进度，请及时跟进", o.getOrderNo());
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
                .in("status", "completed", "production")
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
        String dedupKey = (orderNo != null ? orderNo : "SYS") + "_" + ruleCode;
        if (!noRecentNotice(tenantId, dedupKey, ruleCode)) {
            log.debug("[MindPush] 24h内已推送过 tenant={} key={} type={}，跳过", tenantId, dedupKey, ruleCode);
            return;
        }
        MindPushLog pushLog = new MindPushLog();
        pushLog.setTenantId(tenantId);
        pushLog.setRuleCode(ruleCode);
        pushLog.setOrderId(orderId);
        pushLog.setOrderNo(orderNo);
        pushLog.setTitle(title);
        pushLog.setContent(content);
        pushLog.setChannel("IN_APP");
        pushLog.setPushedAt(LocalDateTime.now());
        mindPushLogMapper.insert(pushLog);

        com.fashion.supplychain.production.entity.SysNotice notice = new com.fashion.supplychain.production.entity.SysNotice();
        notice.setTenantId(tenantId);
        notice.setFromName("AI小云");
        notice.setToName(""); // to_name NOT NULL，AI推送无固定接收人，置为空串
        notice.setOrderNo(dedupKey);
        notice.setTitle(title);
        notice.setContent(content);
        notice.setNoticeType(ruleCode);
        notice.setIsRead(0);
        notice.setCreatedAt(LocalDateTime.now());
        sysNoticeService.save(notice);

        wxAlertNotifyService.notifyAlert(tenantId, title, content, orderNo, null);
    }

    private boolean noRecentNotice(Long tenantId, String orderNo, String noticeType) {
        long count = sysNoticeService.lambdaQuery()
                .eq(com.fashion.supplychain.production.entity.SysNotice::getTenantId, tenantId)
                .eq(com.fashion.supplychain.production.entity.SysNotice::getOrderNo, orderNo)
                .eq(com.fashion.supplychain.production.entity.SysNotice::getNoticeType, noticeType)
                .ge(com.fashion.supplychain.production.entity.SysNotice::getCreatedAt, LocalDateTime.now().minusHours(24))
                .count();
        return count == 0;
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
                dto.setNotifyTimeStart(dbRule.getNotifyTimeStart());
                dto.setNotifyTimeEnd(dbRule.getNotifyTimeEnd());
            } else {
                dto.setEnabled(true);
                dto.setThresholdDays(3);
                dto.setThresholdProgress(60);
                dto.setNotifyTimeStart("08:00");
                dto.setNotifyTimeEnd("22:00");
            }
            return dto;
        }).collect(Collectors.toList());
    }

    /** 从规则列表中提取推送开始时间（取第一条非空值，默认 08:00） */
    private String extractPushTimeStart(List<MindPushRule> rules) {
        return rules.stream()
            .map(MindPushRule::getNotifyTimeStart)
            .filter(t -> t != null && !t.isBlank())
            .findFirst().orElse("08:00");
    }

    /** 从规则列表中提取推送结束时间（取第一条非空值，默认 22:00） */
    private String extractPushTimeEnd(List<MindPushRule> rules) {
        return rules.stream()
            .map(MindPushRule::getNotifyTimeEnd)
            .filter(t -> t != null && !t.isBlank())
            .findFirst().orElse("22:00");
    }
}

package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse.BrainAction;
import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse.BrainSignal;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceSignalResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceSignalResponse.SignalItem;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 租户智能大脑统一编排器
 *
 * <p>在现有 {@link IntelligenceBrainOrchestrator} 的基础上，融合：
 * <ul>
 *   <li>信号感知层：IntelligenceSignalOrchestrator.collectAndAnalyze()</li>
 *   <li>记忆召回层：IntelligenceMemoryOrchestrator.recallSimilar()</li>
 *   <li>AI 合成推理：基于信号 + 历史记忆生成今日 3 大行动建议</li>
 * </ul>
 *
 * <p>返回同一个 {@link IntelligenceBrainSnapshotResponse} DTO，
 * 在 signals / actions 列表中追加来自新基础设施的数据。
 */
@Service
@Slf4j
public class TenantIntelligenceBrainOrchestrator {

    @Autowired
    private IntelligenceBrainOrchestrator brainOrchestrator;

    @Autowired
    private IntelligenceSignalOrchestrator signalOrchestrator;

    @Autowired
    private IntelligenceMemoryOrchestrator memoryOrchestrator;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    private static final DateTimeFormatter FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    // ──────────────────────────────────────────────────────────────

    /**
     * 生成统一的智能大脑快照（含信号层 + 记忆层 + AI合成）。
     */
    public IntelligenceBrainSnapshotResponse unifiedSnapshot() {
        Long tenantId = UserContext.tenantId();

        // 1. 基础快照（已有编排器）
        IntelligenceBrainSnapshotResponse snapshot;
        try {
            snapshot = brainOrchestrator.snapshot();
        } catch (Exception e) {
            log.warn("[大脑快照] 基础快照失败，创建空响应: {}", e.getMessage());
            snapshot = new IntelligenceBrainSnapshotResponse();
        }
        snapshot.setGeneratedAt(LocalDateTime.now().format(FORMATTER));

        // 2. 信号采集层（降级安全）
        IntelligenceSignalResponse signalResp = null;
        try {
            signalResp = signalOrchestrator.collectAndAnalyze();
            mergeSignals(snapshot, signalResp);
        } catch (Exception e) {
            log.warn("[大脑快照] 信号采集失败，已跳过: {}", e.getMessage());
        }

        // 3. 记忆召回层（降级安全）
        IntelligenceMemoryResponse memoryResp = null;
        try {
            String topSignalTitle = pickTopSignalTitle(signalResp);
            memoryResp = memoryOrchestrator.recallSimilar(tenantId, topSignalTitle, 3);
        } catch (Exception e) {
            log.warn("[大脑快照] 记忆召回失败，已跳过: {}", e.getMessage());
        }

        // 4. AI 合成推理（降级安全）
        if (aiAdvisorService.isEnabled() && aiAdvisorService.checkAndConsumeQuota(tenantId)) {
            try {
                enrichWithAiReasoning(snapshot, signalResp, memoryResp, tenantId);
            } catch (Exception e) {
                log.warn("[大脑快照] AI合成推理失败，已跳过: {}", e.getMessage());
            }
        }

        // 5. 汇总摘要中加入信号计数
        if (signalResp != null && snapshot.getSummary() != null) {
            snapshot.getSummary().setAnomalyCount(
                    snapshot.getSummary().getAnomalyCount() + signalResp.getCriticalCount());
        }

        log.info("[大脑快照] tenantId={} signals={} actions={}", tenantId,
                snapshot.getSignals().size(), snapshot.getActions().size());
        return snapshot;
    }

    // ──────────────────────────────────────────────────────────────

    /** 将信号层结果合并到 BrainSnapshot.signals */
    private void mergeSignals(IntelligenceBrainSnapshotResponse snapshot,
                               IntelligenceSignalResponse signalResp) {
        if (signalResp == null || signalResp.getSignals() == null) return;
        for (SignalItem si : signalResp.getSignals()) {
            BrainSignal bs = new BrainSignal();
            bs.setSignalType(si.getSignalType());
            bs.setLevel(si.getSignalLevel());
            bs.setTitle(si.getSignalTitle());
            bs.setSummary(si.getSignalDetail());
            bs.setSource(si.getSourceDomain());
            bs.setRelatedOrderNo(si.getSourceId());
            snapshot.getSignals().add(bs);
        }
    }

    /** 挑最高优先级信号的标题作为记忆查询关键词 */
    private String pickTopSignalTitle(IntelligenceSignalResponse resp) {
        if (resp == null || resp.getSignals() == null || resp.getSignals().isEmpty()) {
            return "供应链最紧急问题";
        }
        return resp.getSignals().stream()
            .max((a, b) -> Integer.compare(a.getPriorityScore(), b.getPriorityScore()))
                .map(SignalItem::getSignalTitle)
                .orElse("供应链最紧急问题");
    }

    /** AI 合成：基于信号 + 历史记忆生成今日 3 个行动建议，追加到 actions */
    private void enrichWithAiReasoning(
            IntelligenceBrainSnapshotResponse snapshot,
            IntelligenceSignalResponse signalResp,
            IntelligenceMemoryResponse memoryResp,
            Long tenantId) {

        int signalCount = signalResp == null ? 0 : signalResp.getTotalSignals();
        int criticalCount = signalResp == null ? 0 : signalResp.getCriticalCount();
        String topSignal = signalResp != null && !signalResp.getSignals().isEmpty()
                ? signalResp.getSignals().get(0).getSignalTitle() : "无紧急信号";

        String memoryContext = "无历史记忆";
        if (memoryResp != null && !memoryResp.getRecalled().isEmpty()) {
            memoryContext = memoryResp.getRecalled().stream()
                    .limit(2)
                    .map(m -> m.getTitle() + ": " + truncate(m.getContent(), 80))
                    .collect(Collectors.joining("\n"));
        }

        String prompt = String.format(
                "你是工厂AI智慧大脑。当前信号 %d 条（紧急 %d 条），最严重：%s。\n"
                + "历史经验记忆：\n%s\n\n"
                + "请给出今日最重要的3个行动建议，每条格式：【优先级:高/中/低】【负责人:生产主管/采购/财务】标题：内容",
                signalCount, criticalCount, topSignal, memoryContext);

        String aiReply = aiAdvisorService.chat(
                "你是供应链工厂AI大脑，基于实时数据和历史经验给出精准行动建议。", prompt);

        if (aiReply != null && !aiReply.isBlank()) {
            // 将 AI 回复拆解为若干行动追加到 actions
            String[] lines = aiReply.split("\n");
            int added = 0;
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty() || added >= 3) continue;
                BrainAction action = new BrainAction();
                action.setActionType("ai_suggestion");
                action.setPriority(extractPriority(line));
                action.setOwnerRole(extractOwner(line));
                action.setTitle(truncate(line, 50));
                action.setSummary(aiReply);
                action.setAutoExecutable(false);
                snapshot.getActions().add(action);
                added++;
            }
            // 更新 suggestedActions 计数
            if (snapshot.getSummary() != null) {
                snapshot.getSummary().setSuggestedActions(
                        snapshot.getSummary().getSuggestedActions() + added);
            }
            log.info("[大脑快照] AI行动建议已生成 {} 条", added);
        }
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }

    private String extractPriority(String line) {
        if (line.contains("高")) return "high";
        if (line.contains("低")) return "low";
        return "medium";
    }

    private String extractOwner(String line) {
        if (line.contains("采购")) return "采购";
        if (line.contains("财务")) return "财务";
        if (line.contains("仓库")) return "仓库";
        return "生产主管";
    }
}

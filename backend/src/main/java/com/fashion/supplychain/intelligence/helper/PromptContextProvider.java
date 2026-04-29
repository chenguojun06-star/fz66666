package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import com.fashion.supplychain.intelligence.orchestration.AiMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ManagementInsightOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.PatrolClosedLoopOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.WorkerProfileOrchestrator;
import com.fashion.supplychain.intelligence.dto.WorkerProfileRequest;
import com.fashion.supplychain.intelligence.dto.WorkerProfileResponse;
import com.fashion.supplychain.intelligence.service.AiContextBuilderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Component
@Slf4j
public class PromptContextProvider {

    @Value("${xiaoyun.agent.rag.recall-top-k:3}")
    private int ragRecallTopK;

    @Value("${xiaoyun.agent.rag.similarity-threshold:0.45}")
    private float ragSimilarityThreshold;

    @Autowired private AiContextBuilderService aiContextBuilderService;
    @Autowired private AiMemoryOrchestrator aiMemoryOrchestrator;
    @Autowired private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;
    @Autowired private WorkerProfileOrchestrator workerProfileOrchestrator;
    @Autowired private ManagementInsightOrchestrator managementInsightOrchestrator;
    @Autowired private LongTermMemoryOrchestrator longTermMemoryOrchestrator;
    @Autowired(required = false) private ProcessRewardOrchestrator processRewardOrchestrator;
    @Autowired(required = false) private PatrolClosedLoopOrchestrator patrolClosedLoopOrchestrator;

    public String buildIntelligenceContext() {
        try {
            return aiContextBuilderService.buildSystemPrompt();
        } catch (Exception e) {
            log.warn("[AiAgent] 构建实时智能上下文失败: {}", e.getMessage());
            return "【实时经营上下文】暂时获取失败，请优先通过工具查询后再下结论。\n";
        }
    }

    public String buildWorkerProfile(String userName) {
        try {
            WorkerProfileRequest profileReq = new WorkerProfileRequest();
            profileReq.setOperatorName(userName);
            WorkerProfileResponse profile = workerProfileOrchestrator.getProfile(profileReq);
            if (profile != null && profile.getStages() != null && !profile.getStages().isEmpty()) {
                StringBuilder pb = new StringBuilder();
                pb.append("\n【本人效率画像（近期）】\n");
                pb.append("- 工人：").append(userName)
                  .append("，统计周期：").append(profile.getDateDays()).append("天")
                  .append("，合计完成：").append(profile.getTotalQty()).append("件\n");
                for (WorkerProfileResponse.StageProfile sp : profile.getStages()) {
                    String lvl = "excellent".equals(sp.getLevel()) ? "🌟优秀" :
                                 "good".equals(sp.getLevel())      ? "✅良好" :
                                 "below".equals(sp.getLevel())     ? "⚠️待提升" : "普通";
                    String vsDir = sp.getVsFactoryAvgPct() >= 0 ? "高于" : "低于";
                    pb.append(String.format("  - %s：日均%.1f件，%s（%s工厂均值%.1f%%）\n",
                            sp.getStageName(), sp.getAvgPerDay(), lvl,
                            vsDir, Math.abs(sp.getVsFactoryAvgPct())));
                }
                pb.append("回答该工人问题时，可结合以上画像给出有针对性的改进建议。\n");
                return pb.toString();
            }
        } catch (Exception e) {
            log.debug("[AiAgent] 工人画像注入跳过: {}", e.getMessage());
        }
        return "【工人画像】（数据暂时不可用，请勿编造工人效率数据）\n";
    }

    public String buildManagementInsight(Long tenantId) {
        try {
            if (tenantId != null) {
                java.util.Map<String, Object> summary = managementInsightOrchestrator.getExecutiveSummary(tenantId);
                Object headline = summary.get("headline");
                Object riskLevel = summary.get("overallRiskLevel");
                if (headline != null) {
                    StringBuilder sb = new StringBuilder();
                    sb.append("【实时经营快照】\n");
                    sb.append(headline).append("\n");
                    if (riskLevel != null) {
                        sb.append("整体风险等级：").append(riskLevel).append("\n");
                    }
                    sb.append("（以上为系统预计算摘要，详细数据请通过 tool_management_dashboard 工具查询）\n\n");
                    return sb.toString();
                }
            }
        } catch (Exception e) {
            log.debug("[AiAgent] 管理层经营快照注入跳过: {}", e.getMessage());
        }
        return "【实时经营快照】（数据暂时不可用，请勿编造经营数据，如需查询请调用工具）\n";
    }

    public String buildLongTermMemory(String userId) {
        try {
            List<AiLongMemory> mems = longTermMemoryOrchestrator.retrieve("user", userId, 6);
            if (mems == null || mems.isEmpty()) return "";
            StringBuilder sb = new StringBuilder("【我对你的了解（历史学习记忆）】\n");
            List<Long> hitIds = new ArrayList<>();
            for (AiLongMemory m : mems) {
                String layer = m.getLayer() == null ? "记录" : m.getLayer();
                String layerLabel = "REFLECTIVE".equals(layer) ? "经验总结" :
                                    "FACT".equals(layer) ? "个人事实" : "历史经历";
                sb.append("- [").append(layerLabel).append("] ").append(m.getContent());
                if (m.getConfidence() != null && m.getConfidence().intValue() < 8) {
                    sb.append("（参考）");
                }
                sb.append("\n");
                if (m.getId() != null) hitIds.add(m.getId());
            }
            sb.append("（以上为系统从历史对话中提炼的记忆，请结合工具查询数据综合判断，不要只依赖记忆）\n\n");
            hitIds.forEach(id -> {
                try { longTermMemoryOrchestrator.incrementHit(id); } catch (Exception e) { log.warn("[AiAgent-LTM] 命中计数更新失败: id={}", id); }
            });
            log.debug("[AiAgent-LTM] 已注入 {} 条长期记忆到提示词", mems.size());
            return sb.toString();
        } catch (Exception e) {
            log.debug("[AiAgent-LTM] 长期记忆注入跳过: {}", e.getMessage());
            return "【历史学习记忆】（加载失败，请勿编造历史对话内容）\n";
        }
    }

    public String buildMemoryContext(Long tenantId, String userId) {
        try {
            return aiMemoryOrchestrator.getMemoryContext(tenantId, userId);
        } catch (Exception e) {
            log.debug("[AiAgent] 加载历史对话记忆失败，跳过: {}", e.getMessage());
            return "【历史对话】（加载失败，请勿编造之前的对话内容）\n";
        }
    }

    public String buildRagContext(Long tenantId, String userMessage) {
        try {
            if (userMessage != null && !userMessage.isBlank()) {
                IntelligenceMemoryResponse ragResult =
                        intelligenceMemoryOrchestrator.recallSimilar(tenantId, userMessage, ragRecallTopK);
                List<IntelligenceMemoryResponse.MemoryItem> recalled = ragResult.getRecalled();
                if (recalled != null && !recalled.isEmpty()) {
                    List<IntelligenceMemoryResponse.MemoryItem> relevant = recalled.stream()
                            .filter(item -> item.getSimilarityScore() >= ragSimilarityThreshold)
                            .collect(Collectors.toList());
                    if (!relevant.isEmpty()) {
                        StringBuilder rag = new StringBuilder();
                        rag.append("【混合检索 RAG — 相关历史经验参考（融合分≥0.45）】\n");
                        for (int ri = 0; ri < relevant.size(); ri++) {
                            IntelligenceMemoryResponse.MemoryItem item = relevant.get(ri);
                            String c = item.getContent();
                            if (c != null && c.length() > 150) c = c.substring(0, 150) + "…";
                            rag.append(String.format("  %d. [%s/%s] %s（融合分%.2f，采纳%d次）\n     %s\n",
                                    ri + 1,
                                    item.getMemoryType() != null ? item.getMemoryType() : "case",
                                    item.getBusinessDomain() != null ? item.getBusinessDomain() : "general",
                                    item.getTitle() != null ? item.getTitle() : "",
                                    item.getSimilarityScore(),
                                    item.getAdoptedCount(),
                                    c != null ? c : ""));
                        }
                        rag.append("（以上为历史经验参考，判断须以工具查询的实时数据为准）\n\n");
                        log.debug("[AiAgent-RAG] 本次问题混合检索到 {} 条相关经验", relevant.size());
                        return rag.toString();
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[AiAgent-RAG] 混合检索跳过（Qdrant 未启用或记忆链失败）: {}", e.getMessage());
        }
        return "【知识库检索】（检索失败，请勿编造知识库内容，如需查询请调用工具）\n";
    }

    public String buildUserBehaviorHint() {
        try {
            if (processRewardOrchestrator == null) return "";
            java.util.Map<String, Double> topTools = processRewardOrchestrator.getHighScoreToolsForCurrentTenant(7);
            if (topTools == null || topTools.isEmpty()) return "";
            java.util.List<String> labels = topTools.entrySet().stream()
                    .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
                    .limit(3)
                    .map(e -> PromptToolLabelMapper.toolNameToLabel(e.getKey()))
                    .filter(s -> !s.isBlank())
                    .collect(java.util.stream.Collectors.toList());
            if (labels.isEmpty()) return "";
            String hint = "【你近期常用功能】: " + String.join("、", labels)
                    + " — 若与本次问题相关，我会主动结合这些能力为你解答。\n\n";
            log.debug("[AiAgent-Behavior] 行为画像注入: {}", labels);
            return hint;
        } catch (Exception e) {
            log.debug("[AiAgent-Behavior] 用户行为画像注入跳过: {}", e.getMessage());
            return "";
        }
    }

    public String buildActivePatrolBlock() {
        try {
            if (patrolClosedLoopOrchestrator == null) return "";
            List<AiPatrolAction> actions = patrolClosedLoopOrchestrator.recentForCurrentTenant(8);
            if (actions == null || actions.isEmpty()) return "";
            List<AiPatrolAction> urgent = actions.stream()
                .filter(a -> "HIGH".equals(a.getIssueSeverity()) || "MEDIUM".equals(a.getIssueSeverity()))
                .filter(a -> a.getCreateTime() != null
                          && a.getCreateTime().isAfter(LocalDateTime.now().minusHours(48)))
                .limit(3)
                .toList();
            if (urgent.isEmpty()) return "";
            StringBuilder sb = new StringBuilder();
            sb.append("【系统巡查风险（仅在用户问题相关时提及）】\n");
            for (AiPatrolAction a : urgent) {
                String severity = "HIGH".equals(a.getIssueSeverity()) ? "🔴紧急" : "🟠高";
                sb.append("- ").append(severity).append(" [").append(a.getIssueType()).append("] ")
                  .append(a.getDetectedIssue()).append("\n");
            }
            sb.append("（以上风险由系统自动巡查发现。仅当用户询问相关订单、工厂或风险时才提及，不要在无关问题中主动插入。）\n\n");
            log.debug("[AiAgent-Patrol] 注入 {} 条活跃生产风险到系统提示词", urgent.size());
            return sb.toString();
        } catch (Exception e) {
            log.debug("[AiAgent-Patrol] 巡查风险注入跳过: {}", e.getMessage());
            return "";
        }
    }
}

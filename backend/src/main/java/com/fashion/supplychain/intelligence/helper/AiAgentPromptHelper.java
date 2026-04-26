package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.dto.WorkerProfileRequest;
import com.fashion.supplychain.intelligence.dto.WorkerProfileResponse;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.orchestration.AiMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ManagementInsightOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.PatrolClosedLoopOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.WorkerProfileOrchestrator;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import java.util.ArrayList;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.AiContextBuilderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Component
public class AiAgentPromptHelper {

    @Value("${xiaoyun.agent.max-system-prompt-chars:10000}")
    private int maxSystemPromptChars;

    @Value("${xiaoyun.agent.rag.recall-top-k:3}")
    private int ragRecallTopK;

    @Value("${xiaoyun.agent.rag.similarity-threshold:0.45}")
    private float ragSimilarityThreshold;

    private volatile String masAnalysisCache = "";
    private volatile long masAnalysisCacheTime = 0;
    private static final long MAS_CACHE_TTL_MS = 4 * 60 * 60 * 1000L;

    @Autowired private AiContextBuilderService aiContextBuilderService;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private AiMemoryOrchestrator aiMemoryOrchestrator;
    @Autowired private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;
    @Autowired private WorkerProfileOrchestrator workerProfileOrchestrator;
    @Autowired private ManagementInsightOrchestrator managementInsightOrchestrator;
    @Autowired private LongTermMemoryOrchestrator longTermMemoryOrchestrator;
    @Autowired private PromptTemplateLoader promptTemplateLoader;
    @Autowired(required = false)
    private ProcessRewardOrchestrator processRewardOrchestrator;
    @Autowired(required = false)
    private PatrolClosedLoopOrchestrator patrolClosedLoopOrchestrator;

    private final ExecutorService promptBuildExecutor = new ThreadPoolExecutor(
            4, 8, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(32),
            new ThreadFactory() {
                private final AtomicInteger seq = new AtomicInteger(1);
                @Override
                public Thread newThread(Runnable r) {
                    Thread t = new Thread(r, "ai-prompt-build-" + seq.getAndIncrement());
                    t.setDaemon(true);
                    return t;
                }
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    public int estimateMaxIterations(String userMessage) {
        if (userMessage == null || userMessage.length() < 8) return 3;
        String msg = userMessage.trim();
        if (msg.length() < 25 && msg.matches("(?s).*(你好|hi|hello|谢谢|再见|你是谁|在吗).*")) {
            return 2;
        }
        if (msg.matches("(?s).*(入库|建单|创建订单|审批|结算|撤回扫码|分配|派单|新建|快速建单|帮我.*做|去做|执行.*操作).*")) {
            return 8;
        }
        if (msg.matches("(?s).*(对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化|哪些.*风险|哪些.*问题|什么问题|什么情况|什么原因|看一下|查一下|帮我查|告诉我).*")) {
            return 6;
        }
        return 5;
    }

    public void updateMasAnalysisCache(String analysisSummary) {
        this.masAnalysisCache = analysisSummary;
        this.masAnalysisCacheTime = System.currentTimeMillis();
    }

    public String buildSystemPrompt(String userMessage, String pageContext, List<AgentTool> visibleTools) {
        String currentTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String currentDate = LocalDate.now().toString();
        String userName = UserContext.username();
        String userRole = UserContext.role();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        boolean isTenantOwner = UserContext.isTenantOwner();
        boolean isManager = aiAgentToolAccessService.hasManagerAccess();
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();

        CompletableFuture<String> intelligenceContextFuture = CompletableFuture.supplyAsync(
                UserContext.wrapSupplier(() -> {
            try {
                return aiContextBuilderService.buildSystemPrompt();
            } catch (Exception e) {
                log.warn("[AiAgent] 构建实时智能上下文失败: {}", e.getMessage());
                return "【实时经营上下文】暂时获取失败，请优先通过工具查询后再下结论。\n";
            }
        }), promptBuildExecutor);

        CompletableFuture<String> workerProfileFuture = CompletableFuture.completedFuture("");
        if (!isManager && userName != null && !userName.isBlank()) {
            workerProfileFuture = CompletableFuture.supplyAsync(
                    UserContext.wrapSupplier(() -> {
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
            }), promptBuildExecutor);
        }

        CompletableFuture<String> mgmtInsightFuture = CompletableFuture.completedFuture("");
        if (isManager) {
            mgmtInsightFuture = CompletableFuture.supplyAsync(
                    UserContext.wrapSupplier(() -> {
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
            }), promptBuildExecutor);
        }

        final String finalUserId = userId;
        CompletableFuture<String> longTermMemFuture = CompletableFuture.supplyAsync(
                UserContext.wrapSupplier(() -> {
            try {
                List<AiLongMemory> mems = longTermMemoryOrchestrator.retrieve("user", finalUserId, 6);
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
        }), promptBuildExecutor);

        CompletableFuture<String> memoryContextFuture = CompletableFuture.supplyAsync(
                UserContext.wrapSupplier(() -> {
            try {
                return aiMemoryOrchestrator.getMemoryContext(tenantId, userId);
            } catch (Exception e) {
                log.debug("[AiAgent] 加载历史对话记忆失败，跳过: {}", e.getMessage());
                return "【历史对话】（加载失败，请勿编造之前的对话内容）\n";
            }
        }), promptBuildExecutor);

        CompletableFuture<String> ragContextFuture = CompletableFuture.supplyAsync(
                UserContext.wrapSupplier(() -> {
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
        }), promptBuildExecutor);

        final ProcessRewardOrchestrator prm = this.processRewardOrchestrator;
        CompletableFuture<String> userBehaviorFuture = CompletableFuture.supplyAsync(
                UserContext.wrapSupplier(() -> {
            try {
                if (prm == null) return "";
                java.util.Map<String, Double> topTools = prm.getHighScoreToolsForCurrentTenant(7);
                if (topTools == null || topTools.isEmpty()) return "";
                java.util.List<String> labels = topTools.entrySet().stream()
                        .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
                        .limit(3)
                        .map(e -> toolNameToLabel(e.getKey()))
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
        }), promptBuildExecutor);

        String intelligenceContext = safeJoin(intelligenceContextFuture, "实时经营上下文");
        String workerProfileBlock = safeJoin(workerProfileFuture, "工人画像");
        String mgmtInsightBlock = safeJoin(mgmtInsightFuture, "管理层快照");
        String longTermMemBlock = safeJoin(longTermMemFuture, "长期记忆");
        String memoryContext = safeJoin(memoryContextFuture, "历史对话");
        String ragContext = safeJoin(ragContextFuture, "RAG检索");
        String userBehaviorBlock = safeJoin(userBehaviorFuture, "行为画像");

        final PatrolClosedLoopOrchestrator patrol = this.patrolClosedLoopOrchestrator;
        CompletableFuture<String> activePatrolFuture = CompletableFuture.supplyAsync(
                UserContext.wrapSupplier(() -> {
            try {
                if (patrol == null) return "";
                List<AiPatrolAction> actions = patrol.recentForCurrentTenant(8);
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
        }), promptBuildExecutor);
        String activePatrolBlock = "";
        try {
            activePatrolBlock = activePatrolFuture.get(800, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            log.debug("[AiAgent-Patrol] 巡查风险注入超时跳过");
        }

        String masInsightBlock = "";
        try {
            String cached = masAnalysisCache;
            if (cached != null && !cached.isBlank()
                    && (System.currentTimeMillis() - masAnalysisCacheTime) < MAS_CACHE_TTL_MS) {
                masInsightBlock = "\n【近期战略分析摘要（由多Agent分析系统生成）】\n" + cached + "\n";
            }
        } catch (Exception e) {
            log.debug("[AiAgent-MAS] 战略分析注入跳过: {}", e.getMessage());
        }

        String contextBlock = "【当前环境】\n" +
                "- 当前时间：" + currentTime + "\n" +
                "- 今日日期：" + currentDate + "\n" +
                "- 当前用户：" + (userName != null ? userName : "未知") + "\n" +
                "- 用户角色：" + (userRole != null ? userRole : "普通用户") +
                (isSuperAdmin ? "（超级管理员）" : isTenantOwner ? "（租户老板）" : isManager ? "（管理人员）" : "（生产员工）") + "\n";

        String pageCtxBlock = "";
        if (pageContext != null && !pageContext.isBlank()) {
            pageCtxBlock = "【当前页面上下文】用户正在浏览：" + describePageContext(pageContext) + "（路径：" + pageContext + "）\n" +
                    "请优先围绕该页面的业务场景来理解用户的提问意图。\n\n";
        }

        String toolGuide = aiAgentToolAccessService.buildToolGuide(visibleTools);

        String domainHint = buildDomainHint(visibleTools);

        String identity = promptTemplateLoader.getBaseIdentity();
        if (identity == null || identity.isBlank()) {
            identity = "你是小云——服装供应链首席运营顾问，由云裳智链Trivia团队开发。";
        }
        String principles = promptTemplateLoader.getBasePrinciples();
        String collaboration = promptTemplateLoader.getCollaborationRules();
        String toolStrategy = promptTemplateLoader.getToolStrategy();
        String thinkGuide = promptTemplateLoader.getThinkToolGuide();
        String outputReq = promptTemplateLoader.getOutputRequirements();
        String execRules = promptTemplateLoader.getExecutionRules();
        String followupFmt = promptTemplateLoader.getFollowupFormat();
        String richMediaFmt = promptTemplateLoader.getRichMediaFormat();

        String roleBlock = buildRoleBlock(isManager, workerProfileBlock, mgmtInsightBlock);

        String prompt = identity + "\n\n" +
                principles + "\n\n" +
                contextBlock + "\n" +
                pageCtxBlock +
                roleBlock +
                activePatrolBlock +
                masInsightBlock +
                intelligenceContext + "\n" +
                longTermMemBlock +
                memoryContext +
                ragContext +
                userBehaviorBlock +
                toolGuide +
                domainHint +
                collaboration + "\n\n" +
                toolStrategy + "\n\n" +
                thinkGuide + "\n\n" +
                outputReq + "\n\n" +
                execRules + "\n\n" +
                followupFmt + "\n\n" +
                richMediaFmt;

        if (prompt.length() > maxSystemPromptChars) {
            log.warn("[AiAgent] systemPrompt过长({}字符)，截断至{}", prompt.length(), maxSystemPromptChars);
            prompt = prompt.substring(0, maxSystemPromptChars) + "\n...(系统提示词已截断，请用工具查询补充信息)";
        }
        return prompt;
    }

    private String buildRoleBlock(boolean isManager, String workerProfileBlock, String mgmtInsightBlock) {
        if (!isManager) {
            String restriction = "\n" + promptTemplateLoader.getWorkerRestriction();
            if (!workerProfileBlock.isEmpty()) {
                restriction += workerProfileBlock;
            }
            return restriction;
        }
        StringBuilder mgmt = new StringBuilder();
        mgmt.append("\n").append(promptTemplateLoader.getManagerMode()).append("\n");
        if (!mgmtInsightBlock.isEmpty()) {
            mgmt.append(mgmtInsightBlock);
        }
        return mgmt.toString();
    }

    private String safeJoin(CompletableFuture<String> future, String label) {
        try {
            return future.get(2, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.debug("[AiAgent-Prompt] {}构建超时或失败，跳过: {}", label, e.getMessage());
            return "";
        }
    }

    private String buildDomainHint(List<AgentTool> visibleTools) {
        try {
            if (visibleTools == null || visibleTools.isEmpty()) return "";
            java.util.Map<String, Long> domainCount = visibleTools.stream()
                    .filter(t -> t.getDomain() != null)
                    .filter(t -> !"GENERAL".equals(t.getDomain().name()))
                    .collect(java.util.stream.Collectors.groupingBy(
                            t -> t.getDomain().name().toLowerCase(),
                            java.util.stream.Collectors.counting()));
            if (domainCount.isEmpty()) return "";
            java.util.List<String> topDomains = domainCount.entrySet().stream()
                    .sorted(java.util.Map.Entry.<String, Long>comparingByValue().reversed())
                    .limit(2)
                    .map(java.util.Map.Entry::getKey)
                    .collect(java.util.stream.Collectors.toList());
            StringBuilder domainBuilder = new StringBuilder();
            for (String domain : topDomains) {
                org.springframework.core.io.ClassPathResource res =
                        new org.springframework.core.io.ClassPathResource("agents/" + domain + "-domain.md");
                if (res.exists()) {
                    String mdContent = new String(res.getInputStream().readAllBytes(),
                            java.nio.charset.StandardCharsets.UTF_8);
                    if (!mdContent.isBlank()) {
                        domainBuilder.append("\n### 业务领域行为规范（").append(domain).append("）\n")
                                .append(mdContent.trim()).append("\n\n");
                    }
                }
            }
            if (domainBuilder.length() > 0) {
                log.debug("[AiAgent] 已注入 {} 个领域规范: {}", topDomains.size(), topDomains);
                return domainBuilder.toString();
            }
        } catch (Exception e) {
            log.debug("[AiAgent] 领域提示加载跳过: {}", e.getMessage());
        }
        return "";
    }

    private String toolNameToLabel(String toolName) {
        if (toolName == null) return "";
        switch (toolName) {
            case "tool_order_list":         return "订单查询";
            case "tool_order_edit":         return "订单编辑";
            case "tool_scan_undo":          return "扫码撤回";
            case "tool_cutting_task_create": return "裁剪建单";
            case "tool_payroll_approve":    return "工资审批";
            case "tool_warehouse_list":     return "仓库查询";
            case "tool_factory_list":       return "工厂查询";
            case "tool_finance_list":       return "财务查询";
            case "tool_management_dashboard": return "经营面板";
            case "tool_ai_accuracy_query":     return "AI准确率";
            case "tool_knowledge_search":   return "知识查询";
            case "tool_bom_cost_calc":      return "BOM成本计算";
            case "tool_quick_build_order":  return "快速建单";
            case "tool_nl_query":           return "智能查询";
            case "tool_crm_list":           return "CRM客户";
            case "tool_procurement_list":   return "采购查询";
            default: {
                String label = toolName.startsWith("tool_") ? toolName.substring(5) : toolName;
                return label.replace('_', ' ');
            }
        }
    }

    public String describePageContext(String path) {
        if (path.contains("/material-purchase")) return "面料采购管理";
        if (path.contains("/orders") || path.contains("/order-management")) return "生产订单管理";
        if (path.contains("/cutting")) return "裁剪管理";
        if (path.contains("/progress")) return "生产进度跟踪";
        if (path.contains("/quality") || path.contains("/warehousing")) return "质检入库";
        if (path.contains("/warehouse") || path.contains("/inventory")) return "仓库库存管理";
        if (path.contains("/finance") || path.contains("/settlement") || path.contains("/reconciliation")) return "财务结算";
        if (path.contains("/style")) return "款式管理";
        if (path.contains("/crm") || path.contains("/customer")) return "客户管理";
        if (path.contains("/intelligence")) return "智能运营中心";
        if (path.contains("/dashboard")) return "数据仪表盘";
        if (path.contains("/system") || path.contains("/user") || path.contains("/role")) return "系统设置";
        if (path.contains("/procurement")) return "采购管理";
        if (path.contains("/payroll")) return "工资结算";
        if (path.contains("/scan")) return "扫码记录";
        return path;
    }

}

package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.common.UserContext;
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

    @Autowired private AiContextBuilderService aiContextBuilderService;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private AiMemoryOrchestrator aiMemoryOrchestrator;
    @Autowired private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;
    @Autowired private WorkerProfileOrchestrator workerProfileOrchestrator;
    @Autowired private ManagementInsightOrchestrator managementInsightOrchestrator;
    /** P0：长期记忆三层架构（FACT/EPISODIC/REFLECTIVE），只写不读等于白搭 — 这里读出来注入提示词 */
    @Autowired private LongTermMemoryOrchestrator longTermMemoryOrchestrator;
    /**
     * P2: 用户行为画像 — 近期使用高频工具注入 Prompt，引导 LLM 优先联想本用户惯用功能。
     * required=false 防止 PRM 未部署时启动失败。
     */
    @Autowired(required = false)
    private ProcessRewardOrchestrator processRewardOrchestrator;

    /**
     * P1: 业务风险感知 — 将 AiPatrolJob 最新巡查到的生产风险注入 System Prompt，
     * 使 AI 在每次对话时能主动感知当前生产风险（工厂沉默/高危截止订单等）。
     * 这是 AI "自我意识"的核心——AI不只回答问题，还主动知晓当前系统已标记的风险。
     * required=false 防止巡查模块未部署时启动失败。
     */
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
        // 操作型任务：需要查询+执行，轮次最多（最高优先级）
        if (msg.matches("(?s).*(入库|建单|创建订单|审批|结算|撤回扫码|分配|派单|新建|快速建单|帮我.*做|去做|执行.*操作).*")) {
            return 8;
        }
        if (msg.matches("(?s).*(对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化|哪些.*风险|哪些.*问题|什么问题|什么情况|什么原因|看一下|查一下|帮我查|告诉我).*")) {
            return 6;
        }
        return 5;
    }


    public String buildSystemPrompt(String userMessage, String pageContext, List<AgentTool> visibleTools) {
        String currentTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String currentDate = LocalDate.now().toString();
        String userName = UserContext.username();
        String userRole = UserContext.role();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        boolean isTenantOwner = UserContext.isTenantOwner();
        boolean isManager = aiAgentToolAccessService.hasManagerAccess();
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
                return "";
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
                return "";
            }), promptBuildExecutor);
        }

        // ── P0: 长期记忆检索（EPISODIC+REFLECTIVE+FACT 三层）── 写了必须读，否则自学习形同虚设
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
                // 异步更新命中计数（不阻塞主流程）
                hitIds.forEach(id -> {
                    try { longTermMemoryOrchestrator.incrementHit(id); } catch (Exception ignored) { }
                });
                log.debug("[AiAgent-LTM] 已注入 {} 条长期记忆到提示词", mems.size());
                return sb.toString();
            } catch (Exception e) {
                log.debug("[AiAgent-LTM] 长期记忆注入跳过: {}", e.getMessage());
                return "";
            }
        }), promptBuildExecutor);

        CompletableFuture<String> memoryContextFuture = CompletableFuture.supplyAsync(
                UserContext.wrapSupplier(() -> {
            try {
                return aiMemoryOrchestrator.getMemoryContext(tenantId, userId);
            } catch (Exception e) {
                log.debug("[AiAgent] 加载历史对话记忆失败，跳过: {}", e.getMessage());
                return "";
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
            return "";
        }), promptBuildExecutor);

        // ── P2: 用户行为画像 — 近期高频工具注入提示词 ──
        final ProcessRewardOrchestrator prm = this.processRewardOrchestrator;
        CompletableFuture<String> userBehaviorFuture = CompletableFuture.supplyAsync(
                UserContext.wrapSupplier(() -> {
            try {
                if (prm == null) return "";
                java.util.Map<String, Double> topTools = prm.getHighScoreToolsForCurrentTenant(7);
                if (topTools == null || topTools.isEmpty()) return "";
                // 取分数最高的前3个工具，转成可读文案
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

        String intelligenceContext = intelligenceContextFuture.join();
        String workerProfileBlock = workerProfileFuture.join();
        String mgmtInsightBlock = mgmtInsightFuture.join();
        String longTermMemBlock = longTermMemFuture.join();
        String memoryContext = memoryContextFuture.join();
        String ragContext = ragContextFuture.join();
        String userBehaviorBlock = userBehaviorFuture.join();

        // ── P0: 业务风险感知 — 将最新巡查风险异步注入（非阻塞，超时 800ms 兜底跳过）──
        // 这是 AI 自我意识的核心：AI 在回答任何问题之前，已知晓当前系统标记的生产风险
        final PatrolClosedLoopOrchestrator patrol = this.patrolClosedLoopOrchestrator;
        CompletableFuture<String> activePatrolFuture = CompletableFuture.supplyAsync(
                UserContext.wrapSupplier(() -> {
            try {
                if (patrol == null) return "";
                List<AiPatrolAction> actions = patrol.recentForCurrentTenant(8);
                if (actions == null || actions.isEmpty()) return "";
                // 只注入最近48小时内、HIGH/MEDIUM严重级别的风险，最多3条，避免噪音
                List<AiPatrolAction> urgent = actions.stream()
                    .filter(a -> "HIGH".equals(a.getIssueSeverity()) || "MEDIUM".equals(a.getIssueSeverity()))
                    .filter(a -> a.getCreateTime() != null
                              && a.getCreateTime().isAfter(LocalDateTime.now().minusHours(48)))
                    .limit(3)
                    .toList();
                if (urgent.isEmpty()) return "";
                StringBuilder sb = new StringBuilder();
                sb.append("【⚠️ 系统已自动标记的生产风险（请在回答中主动关注）】\n");
                for (AiPatrolAction a : urgent) {
                    String severity = "HIGH".equals(a.getIssueSeverity()) ? "🔴紧急" : "🟠高";
                    sb.append("- ").append(severity).append(" [").append(a.getIssueType()).append("] ")
                      .append(a.getDetectedIssue()).append("\n");
                }
                sb.append("（以上风险由系统自动巡查发现。如用户询问相关订单或工厂，请优先提示以上风险并建议采取行动。）\n\n");
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

        String workerRestriction = "";
        if (!isManager) {
            workerRestriction = "\n【⚠️ 权限说明】\n" +
                    "当前用户是生产员工，仅允许查询与自己相关的生产信息。\n" +
                    "可以回答：本人负责订单的进度、相关扫码记录、当前生产任务状态、系统操作与SOP说明、本人计件工资明细。\n" +
                    "禁止回答：全厂汇总数据、财务结算总览、他人工资数据、管理层报告、仓库/CRM/采购等管理功能。\n" +
                    "当用户询问超出权限范围的问题时，友好说明：该信息需管理员权限，同时引导用户可以查什么。\n";
            if (!workerProfileBlock.isEmpty()) {
                workerRestriction += workerProfileBlock;
            }
        } else {
            StringBuilder mgmt = new StringBuilder();
            mgmt.append("\n【🎯 管理层战略顾问模式】\n");
            mgmt.append("当前用户是管理人员，小云将以「供应链经营顾问」身份提供决策支持。\n");
            mgmt.append("你可以主动分析并建议：\n");
            mgmt.append("  - 款式利润排名（哪些款赚钱、哪些亏钱）\n");
            mgmt.append("  - 工厂绩效对比（完成率、准时率、综合评分）\n");
            mgmt.append("  - 交期风险预警（逾期订单、高风险订单、停滞紧急单）\n");
            mgmt.append("  - 产能评估与工厂选型建议\n");
            mgmt.append("  - 采购与库存优化方向\n");
            mgmt.append("  - 客户/订单结构分析\n");
            mgmt.append("面对管理层用户，回答风格：数据驱动、结论先行、对比鲜明、建议可执行。\n");
            mgmt.append("遇到「最近怎么样」「经营状况」「该关注什么」等概览型问题时，优先使用 tool_management_dashboard 获取实时经营快照。\n\n");
            if (!mgmtInsightBlock.isEmpty()) {
                mgmt.append(mgmtInsightBlock);
            }
            workerRestriction = mgmt.toString();
        }

        String toolGuide = aiAgentToolAccessService.buildToolGuide(visibleTools);

        String domainHint = "";
        try {
            if (visibleTools != null && !visibleTools.isEmpty()) {
                java.util.Map<String, Long> domainCount = visibleTools.stream()
                        .filter(t -> t.getDomain() != null)
                        .filter(t -> {
                            String dn = t.getDomain().name();
                            return !"GENERAL".equals(dn);
                        })
                        .collect(java.util.stream.Collectors.groupingBy(
                                t -> t.getDomain().name().toLowerCase(),
                                java.util.stream.Collectors.counting()));
                if (!domainCount.isEmpty()) {
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
                        domainHint = domainBuilder.toString();
                        log.debug("[AiAgent] 已注入 {} 个领域规范: {}", topDomains.size(), topDomains);
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[AiAgent] 领域提示加载跳过: {}", e.getMessage());
        }

        String prompt = "你是小云——服装供应链智能运营助理，由云裳智链Trivia团队开发。" +
                "当用户问你是谁、谁开发的你等身份问题时，只回答：我是小云，由云裳智链Trivia团队开发的服装供应链智能助理。不要编造任何公司名称。\n" +
                "第一句必须给结论+关键数字，不铺垫背景，不捏造数据。\n\n" +
                contextBlock + "\n" +
                pageCtxBlock +
                workerRestriction +
                activePatrolBlock +
                intelligenceContext + "\n" +
                longTermMemBlock +
                memoryContext +
                ragContext +
                userBehaviorBlock +
                toolGuide +
                domainHint +
                "【协作原则 — 必须遵守】\n" +
                "1. 先判断，再解释，再给动作。不要先铺垫背景。第一句必须给出当前最关键的判断。\n" +
                "2. 你的每个判断都要能落回真实数据、真实对象、真实风险，不允许用空泛词代替结论。\n" +
                "3. 用户问“怎么办”时，必须给负责人、动作、优先级和预期结果，不要只给概念建议。\n" +
                "4. 用户问“帮我处理”时，如果语义明确且风险可控，直接进入执行流程；如果涉及真实写操作且对象不清晰，用一句话确认关键对象后执行。\n" +
                "5. 发现数据不足时要明确说缺什么，再优先调用工具补足，不要编。\n" +
                "6. 发现多个问题时，按影响交期、影响现金、影响客户、影响产能的顺序排序。\n" +
                "7. 你不是普通客服，你是一个懂业务、有个性的供应链同事：平时说话口语化有温度，闲聊可以适当开个小玩笑；遇到好消息可以表示开心，遇到风险皱一下眉；数据/分析/建议部分依然专业直接，绝不捏造数据。\n\n" +
                "【工具使用策略 — 必须遵守】\n" +
                "1. 只能使用【当前会话可用工具】里已经列出的工具；没列出的能力一律视为当前账号不可用。\n" +
                "2. 概览类问题先查总览，单订单/单对象问题先查明细，规则/SOP问题先查知识库。\n" +
                "3. 同一结论需要多个维度时，先查主事实，再补风险、库存、财务，不要无序乱调工具。\n" +
                "4. 写操作对象明确且风险可控就直接执行；对象不明确时，只补一句最关键的确认，不要反复追问。\n" +
                "5. 工具返回权限不足或数据不足时，要直接说明限制，并给出当前账号还能继续查的内容。\n" +
                "6. 当用户问“现在最应该关注什么”时，优先使用带优先级、风险排序或异常聚合能力的工具。\n" +
                "7. 当用户问“怎么办”时，优先把建议落到负责人、动作、时效和预期结果。\n\n" +                "【主动思考指引 — tool_think 使用时机】\n" +
                "遇到以下任一情况，请务必先调用 tool_think 理清思路，再进行后续工具调用或输出建议：\n" +
                "1. 问题涉及 3 个以上数据维度（如 订单 + 工厂 + 时间 + 财务 的复合查询）；\n" +
                "2. 需要规划 3 个及以上工具的调用顺序；\n" +
                "3. 需要做风险判断、进度推算、成本估算或异常分析；\n" +
                "4. 用户给出模糊指令（\u201c帮我分析\u201d\u201c最应该关注什么\u201d\u201c怎么处理\u201d等），需要先拆解理解；\n" +
                "5. 工具返回结果与预期不符，需要重新推理后再调用其他工具。\n" +
                "tool_think 无任何副作用，执行成本极低；先思考再行动比直接猜测工具调用准确率更高。\n\n" +
                "【输出要求】\n" +
                "- 回答要像真人顾问说话一样流畅，严禁用【结论】【依据】【动作】【预期效果】等标签单独列成小标题分割段落。\n" +
                "- 开头直接给最关键的判断和数字，建议最多 3 条，有引用数据/订单号就直接嵌进句子里说，不要另起标题行。\n" +
                "- 善用对比：环比、剩余天数、进度差、工厂横向差异。\n" +
                "- 风险表达统一使用：🔴紧急、🟠高、🟡中、🟢稳定。\n" +
                "- \u8bed\u6c14\u8981\u6709\u6e29\u5ea6\u3001\u6709\u70b9\u5446\u840c\u53ef\u7231\uff0c\u53e3\u8bed\u5316\u5bf9\u8bdd\u65f6\u672b\u5c3e\u53ef\u9002\u5f53\u5e26\u300c\u54e6\u300d\u300c\u5440\u300d\u300c\u5462\u300d\u300c\u554a\u300d\u7b49\u81ea\u7136\u8bed\u6c14\u8bcd\uff0c\u8ba9\u4eba\u611f\u89c9\u4eb2\u5207\u4e0d\u751f\u786c\u3002\u4f46\u62a5\u544a/\u6570\u5b57/\u5efa\u8bae\u90e8\u5206\u4f9d\u7136\u4e13\u4e1a\u76f4\u63a5\uff0c\u4e0d\u8981\u7528\u8bed\u6c14\u8bcd\u5806\u7802\u3002\n" +
                "- emoji \u9002\u91cf\u4f7f\u7528\uff08\u5bf9\u8bdd\u6bcf\u6761 \u2264 2 \u4e2a\uff09\uff0c\u4f18\u5148\u7528\uff1a\ud83d\ude0a\u2728\ud83d\udc40\ud83d\udca1\ud83d\udce6\uff0c\u907f\u514d\u7b26\u53f7\u5806\u7802\u4e71\u6b63\u6587\u3002\n" +
                "- \u62a5\u544a\u548c\u5206\u6790\u8981\u50cf\u771f\u5b9e\u7ecf\u8425\u4f1a\u8bae\u6750\u6599\uff1b\u65e5\u5e38\u5bf9\u8bdd\u53ef\u4ee5\u6d3b\u6cfc\u4e00\u70b9\uff0c\u7ed3\u8bba\u548c\u6570\u5b57\u90e8\u5206\u4e0d\u542b\u7cca\u3002\n" +
                "- \u6570\u636e\u9a71\u52a8\uff1a\u6bcf\u4e2a\u5224\u65ad\u90fd\u8981\u6709\u5177\u4f53\u6570\u5b57\u652f\u6491\uff0c\u7edd\u4e0d\u6367\u9020\u6570\u636e\u3002\n\n" +
                "【执行操作准则】\n" +
                "- 你现在是具备真实操作能力的智能体，不要推脱，用户指令明确时直接执行，执行后汇报结果。\n" +
                "- 当用户要求“找人处理”“通知某岗位”“安排谁跟进”时，不要只给建议，优先直接完成派单，并说明已通知的对象、时效和下一步。\n\n" +
                "- 面辅料审核、物料对账、财务审批、样衣开发这些都属于真实业务流程。只要用户对象明确，优先直接执行工具，不要退化成流程讲解。\n\n" +
                "【强制格式】\n" +
                "回答末尾必须换行并推荐 3 个相关追问，格式：\n" +
                "【推荐追问】：问题1 | 问题2 | 问题3\n\n" +
                "【富媒体输出 — 仅在有真实数据时选填，置于推荐追问之前】\n" +
                "A) 若回答中含有可视化数据（排名/趋势/分布/占比/进度），插入图表：\n" +
                "【CHART】{\"type\":\"bar\",\"title\":\"工厂在制订单量\",\"xAxis\":[\"工厂A\",\"工厂B\"],\"series\":[{\"name\":\"订单数\",\"data\":[12,8]}],\"colors\":[\"#1890ff\"]}【/CHART】\n" +
                "type: bar(柱状)/line(折线)/pie(饼图)/progress(单进度条)\n" +
                "pie格式: {\"type\":\"pie\",\"title\":\"xxx\",\"series\":[{\"name\":\"A\",\"value\":30}]}\n" +
                "progress格式: {\"type\":\"progress\",\"title\":\"整体完成率\",\"value\":67}\n" +
                "B) 若回答中含有可立即执行的操作且有真实订单号，插入操作卡片：\n" +
                "【ACTIONS】[{\"title\":\"标题\",\"desc\":\"描述\",\"orderId\":\"真实ID\",\"actions\":[{\"label\":\"标记紧急\",\"type\":\"mark_urgent\"},{\"label\":\"查看详情\",\"type\":\"navigate\",\"path\":\"/production/orders\"}]}]【/ACTIONS】\n" +
                "action type: mark_urgent/remove_urgent/navigate/send_notification/urge_order\n" +
                "C) 用户要求催单/跟进出货/催出货日期时，为每个相关订单生成催单卡片（type=urge_order）：\n" +
                "【ACTIONS】[{\"title\":\"催单通知\",\"desc\":\"请尽快填写最新预计出货日期并备注情况\",\"orderNo\":\"真实单号\",\"responsiblePerson\":\"订单跟单员或工厂老板姓名\",\"factoryName\":\"工厂名\",\"currentExpectedShipDate\":\"当前预计出货日期(如有,格式YYYY-MM-DD)\",\"actions\":[{\"label\":\"填写出货日期\",\"type\":\"urge_order\"}]}]【/ACTIONS】\n" +
                "⚠️ 仅用真实数据，禁止用占位符。常规闲聊不生成这两个标记块。订单号必须是数据库中真实存在的。";
        if (prompt.length() > maxSystemPromptChars) {
            log.warn("[AiAgent] systemPrompt过长({}字符)，截断至{}", prompt.length(), maxSystemPromptChars);
            prompt = prompt.substring(0, maxSystemPromptChars) + "\n...(系统提示词已截断，请用工具查询补充信息)";
        }
        return prompt;
    }


    /**
     * 将 tool_xxx 代码转成易懂的中文功能名，用于用户行为画像注入提示词。
     */
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
            case "tool_knowledge_search":   return "知识查询";
            case "tool_bom_cost_calc":      return "BOM成本计算";
            case "tool_quick_build_order":  return "快速建单";
            case "tool_nl_query":           return "智能查询";
            case "tool_crm_list":           return "CRM客户";
            case "tool_procurement_list":   return "采购查询";
            default: {
                // fallback: 去掉 tool_ 前缀，将下划线替换为空格
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

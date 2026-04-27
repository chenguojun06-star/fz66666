package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.*;

@Component
@Slf4j
public class AiAgentPromptHelper {

    @Value("${xiaoyun.agent.max-system-prompt-chars:10000}")
    private int maxSystemPromptChars;

    private volatile String masAnalysisCache = "";
    private volatile long masAnalysisCacheTime = 0;
    private static final long MAS_CACHE_TTL_MS = 4 * 60 * 60 * 1000L;

    @Autowired private PromptContextProvider contextProvider;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private PromptTemplateLoader promptTemplateLoader;

    private final ExecutorService promptBuildExecutor = new ThreadPoolExecutor(
            4, 8, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(32),
            r -> {
                Thread t = new Thread(r, "ai-prompt-build-" + System.identityHashCode(r) % 1000);
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    public int estimateMaxIterations(String userMessage) {
        if (userMessage == null || userMessage.length() < 8) return 3;
        String msg = userMessage.trim();
        if (msg.length() < 25 && msg.matches("(?s).*(你好|hi|hello|谢谢|再见|你是谁|在吗).*")) return 2;
        if (msg.matches("(?s).*(入库|建单|创建订单|审批|结算|撤回扫码|分配|派单|新建|快速建单|帮我.*做|去做|执行.*操作).*")) return 8;
        if (msg.matches("(?s).*(对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化|哪些.*风险|哪些.*问题|什么问题|什么情况|什么原因|看一下|查一下|帮我查|告诉我).*")) return 6;
        return 5;
    }

    public void updateMasAnalysisCache(String analysisSummary) {
        this.masAnalysisCache = analysisSummary;
        this.masAnalysisCacheTime = System.currentTimeMillis();
    }

    public String buildSystemPrompt(String userMessage, String pageContext, List<AgentTool> visibleTools) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String userName = UserContext.username();
        String userRole = UserContext.role();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        boolean isTenantOwner = UserContext.isTenantOwner();
        boolean isManager = aiAgentToolAccessService.hasManagerAccess();

        CompletableFuture<String> intelligenceCtx = supplyAsync(() -> contextProvider.buildIntelligenceContext());
        CompletableFuture<String> workerProfile = isManager
                ? CompletableFuture.completedFuture("")
                : supplyAsync(() -> contextProvider.buildWorkerProfile(userName));
        CompletableFuture<String> mgmtInsight = isManager
                ? supplyAsync(() -> contextProvider.buildManagementInsight(tenantId))
                : CompletableFuture.completedFuture("");
        CompletableFuture<String> longTermMem = supplyAsync(() -> contextProvider.buildLongTermMemory(userId));
        CompletableFuture<String> memoryCtx = supplyAsync(() -> contextProvider.buildMemoryContext(tenantId, userId));
        CompletableFuture<String> ragCtx = supplyAsync(() -> contextProvider.buildRagContext(tenantId, userMessage));
        CompletableFuture<String> userBehavior = supplyAsync(contextProvider::buildUserBehaviorHint);
        CompletableFuture<String> activePatrol = supplyAsync(contextProvider::buildActivePatrolBlock);

        String intelligenceContext = safeJoin(intelligenceCtx, "实时经营上下文");
        String workerProfileBlock = safeJoin(workerProfile, "工人画像");
        String mgmtInsightBlock = safeJoin(mgmtInsight, "管理层快照");
        String longTermMemBlock = safeJoin(longTermMem, "长期记忆");
        String memoryContext = safeJoin(memoryCtx, "历史对话");
        String ragContext = safeJoin(ragCtx, "RAG检索");
        String userBehaviorBlock = safeJoin(userBehavior, "行为画像");
        String activePatrolBlock = safeJoinWithTimeout(activePatrol, 800, "巡查风险");

        String masInsightBlock = buildMasInsightBlock();
        String contextBlock = buildContextBlock(userName, userRole, isSuperAdmin, isTenantOwner, isManager);
        String pageCtxBlock = buildPageContextBlock(pageContext);
        String toolGuide = aiAgentToolAccessService.buildToolGuide(visibleTools);
        String domainHint = buildDomainHint(visibleTools);
        String roleBlock = buildRoleBlock(isManager, workerProfileBlock, mgmtInsightBlock);

        String prompt = assemblePrompt(contextBlock, pageCtxBlock, roleBlock, activePatrolBlock,
                masInsightBlock, intelligenceContext, longTermMemBlock, memoryContext, ragContext,
                userBehaviorBlock, toolGuide, domainHint);

        if (prompt.length() > maxSystemPromptChars) {
            log.warn("[AiAgent] systemPrompt过长({}字符)，截断至{}", prompt.length(), maxSystemPromptChars);
            prompt = prompt.substring(0, maxSystemPromptChars) + "\n...(系统提示词已截断，请用工具查询补充信息)";
        }
        return prompt;
    }

    private CompletableFuture<String> supplyAsync(Supplier<String> supplier) {
        return CompletableFuture.supplyAsync(UserContext.wrapSupplier(supplier::get), promptBuildExecutor);
    }

    @FunctionalInterface
    private interface Supplier<T> { T get(); }

    private String safeJoin(CompletableFuture<String> future, String label) {
        try { return future.get(2, TimeUnit.SECONDS); }
        catch (Exception e) { log.debug("[AiAgent-Prompt] {}构建超时或失败，跳过: {}", label, e.getMessage()); return ""; }
    }

    private String safeJoinWithTimeout(CompletableFuture<String> future, long timeoutMs, String label) {
        try { return future.get(timeoutMs, TimeUnit.MILLISECONDS); }
        catch (Exception e) { log.debug("[AiAgent-Prompt] {}注入超时跳过", label); return ""; }
    }

    private String buildMasInsightBlock() {
        try {
            String cached = masAnalysisCache;
            if (cached != null && !cached.isBlank()
                    && (System.currentTimeMillis() - masAnalysisCacheTime) < MAS_CACHE_TTL_MS) {
                return "\n【近期战略分析摘要（由多Agent分析系统生成）】\n" + cached + "\n";
            }
        } catch (Exception e) { log.debug("[AiAgent-MAS] 战略分析注入跳过: {}", e.getMessage()); }
        return "";
    }

    private String buildContextBlock(String userName, String userRole, boolean isSuperAdmin, boolean isTenantOwner, boolean isManager) {
        String currentTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String currentDate = LocalDate.now().toString();
        return "【当前环境】\n" +
                "- 当前时间：" + currentTime + "\n" +
                "- 今日日期：" + currentDate + "\n" +
                "- 当前用户：" + (userName != null ? userName : "未知") + "\n" +
                "- 用户角色：" + (userRole != null ? userRole : "普通用户") +
                (isSuperAdmin ? "（超级管理员）" : isTenantOwner ? "（租户老板）" : isManager ? "（管理人员）" : "（生产员工）") + "\n";
    }

    private String buildPageContextBlock(String pageContext) {
        if (pageContext != null && !pageContext.isBlank()) {
            return "【当前页面上下文】用户正在浏览：" + describePageContext(pageContext) + "（路径：" + pageContext + "）\n" +
                    "请优先围绕该页面的业务场景来理解用户的提问意图。\n\n";
        }
        return "";
    }

    private String buildRoleBlock(boolean isManager, String workerProfileBlock, String mgmtInsightBlock) {
        if (!isManager) {
            String restriction = "\n" + promptTemplateLoader.getWorkerRestriction();
            if (!workerProfileBlock.isEmpty()) restriction += workerProfileBlock;
            return restriction;
        }
        StringBuilder mgmt = new StringBuilder();
        mgmt.append("\n").append(promptTemplateLoader.getManagerMode()).append("\n");
        if (!mgmtInsightBlock.isEmpty()) mgmt.append(mgmtInsightBlock);
        return mgmt.toString();
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
        } catch (Exception e) { log.debug("[AiAgent] 领域提示加载跳过: {}", e.getMessage()); }
        return "";
    }

    private String assemblePrompt(String contextBlock, String pageCtxBlock, String roleBlock,
            String activePatrolBlock, String masInsightBlock, String intelligenceContext,
            String longTermMemBlock, String memoryContext, String ragContext,
            String userBehaviorBlock, String toolGuide, String domainHint) {
        String identity = promptTemplateLoader.getBaseIdentity();
        if (identity == null || identity.isBlank()) {
            identity = "你是小云——服装供应链首席运营顾问，由云裳智链Trivia团队开发。";
        }
        return identity + "\n\n" +
                promptTemplateLoader.getBasePrinciples() + "\n\n" +
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
                promptTemplateLoader.getCollaborationRules() + "\n\n" +
                promptTemplateLoader.getToolStrategy() + "\n\n" +
                promptTemplateLoader.getThinkToolGuide() + "\n\n" +
                promptTemplateLoader.getOutputRequirements() + "\n\n" +
                promptTemplateLoader.getExecutionRules() + "\n\n" +
                promptTemplateLoader.getFollowupFormat() + "\n\n" +
                promptTemplateLoader.getRichMediaFormat();
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

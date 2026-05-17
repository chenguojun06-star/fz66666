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

    @Value("${xiaoyun.agent.max-system-prompt-chars:16000}")
    private int maxSystemPromptChars;

    private volatile String masAnalysisCache = "";
    private volatile long masAnalysisCacheTime = 0;
    private static final long MAS_CACHE_TTL_MS = 4 * 60 * 60 * 1000L;

    @Autowired private PromptContextProvider contextProvider;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private PromptTemplateLoader promptTemplateLoader;
    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.orchestration.XiaoyunCoreUpgrade coreUpgrade;
    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.service.MemoryBankService memoryBankService;
    @Autowired(required = false)
    private com.fashion.supplychain.system.service.TenantService tenantService;
    @Autowired(required = false)
    private com.fashion.supplychain.system.service.FactoryService factoryService;

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
        if (msg.matches("(?s).*(我是谁|你知道我|我是什么角色|我有什么权限|我的权限|我的角色).*")) return 2;
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
                : supplyAsync(() -> contextProvider.buildWorkerContext(userName));
        CompletableFuture<String> mgmtInsight = isManager
                ? supplyAsync(() -> contextProvider.buildManagementInsight(tenantId))
                : CompletableFuture.completedFuture("");
        CompletableFuture<String> longTermMem = supplyAsync(() -> contextProvider.buildLongTermMemory(userId));
        CompletableFuture<String> memoryCtx = supplyAsync(() -> contextProvider.buildMemoryContext(tenantId, userId));
        CompletableFuture<String> ragCtx = supplyAsync(() -> contextProvider.buildRagContext(tenantId, userMessage));
        CompletableFuture<String> userBehavior = supplyAsync(contextProvider::buildUserBehaviorHint);
        CompletableFuture<String> activePatrol = supplyAsync(contextProvider::buildActivePatrolBlock);
        CompletableFuture<String> exceptionReport = isManager
                ? supplyAsync(() -> contextProvider.buildExceptionReport(tenantId))
                : CompletableFuture.completedFuture("");
        CompletableFuture<String> contextFileBlock = supplyAsync(() -> contextProvider.buildContextFileBlock(tenantId));
        CompletableFuture<String> userProfileBlock = supplyAsync(() -> contextProvider.buildUserProfileBlock(tenantId, userId));
        CompletableFuture<String> memoryBankBlock = supplyAsync(() -> buildMemoryBankContext(tenantId));
        CompletableFuture<String> selfCritiqueCtx = supplyAsync(() -> contextProvider.buildSelfCritiqueContext(tenantId));

        String intelligenceContext = safeJoin(intelligenceCtx, "实时经营上下文");
        String workerProfileBlock = safeJoin(workerProfile, "工人画像");
        String mgmtInsightBlock = safeJoin(mgmtInsight, "管理层快照");
        String longTermMemBlock = safeJoin(longTermMem, "长期记忆");
        String memoryContext = safeJoin(memoryCtx, "历史对话");
        String ragContext = safeJoin(ragCtx, "RAG检索");
        String userBehaviorBlock = safeJoin(userBehavior, "行为画像");
        String activePatrolBlock = safeJoinWithTimeout(activePatrol, 800, "巡查风险");
        String exceptionReportBlock = safeJoin(exceptionReport, "异常报告");
        String contextFileBlockStr = safeJoin(contextFileBlock, "上下文文件");
        String userProfileBlockStr = safeJoin(userProfileBlock, "用户画像");
        String memoryBankBlockStr = safeJoin(memoryBankBlock, "MemoryBank");
        String selfCritiqueBlock = safeJoin(selfCritiqueCtx, "自我评分反馈");

        String masInsightBlock = buildMasInsightBlock();
        String digitalTwinBlock = buildDigitalTwinBlock();
        String contextBlock = buildContextBlock(userName, userRole, isSuperAdmin, isTenantOwner, isManager);
        String pageCtxBlock = buildPageContextBlock(pageContext);
        // 智能工具筛选：工具太多时用 RAG 选最相关的
        List<AgentTool> effectiveTools = applyToolDiscovery(visibleTools, userMessage, pageContext);
        String toolGuide = aiAgentToolAccessService.buildToolGuide(effectiveTools);
        String domainHint = buildDomainHint(effectiveTools);
        String roleBlock = buildRoleBlock(isManager, workerProfileBlock, mgmtInsightBlock);

        String prompt = assemblePrompt(contextBlock, pageCtxBlock, roleBlock, exceptionReportBlock, activePatrolBlock,
                masInsightBlock, digitalTwinBlock, intelligenceContext, longTermMemBlock, memoryContext, ragContext,
                userBehaviorBlock, contextFileBlockStr, userProfileBlockStr, memoryBankBlockStr, selfCritiqueBlock,
                toolGuide, domainHint);

        if (prompt.length() > maxSystemPromptChars) {
            // 按优先级保住核心内容，先从低优先级块开始缩减
            int excess = prompt.length() - maxSystemPromptChars;
            log.warn("[AiAgent] systemPrompt过长({}字符 > {}上限)，超出{}字符，按优先级缩减", prompt.length(), maxSystemPromptChars, excess);
            String[] lowPriorityBlocks = {userBehaviorBlock, longTermMemBlock, masInsightBlock, contextFileBlockStr, selfCritiqueBlock};
            for (String lowBlock : lowPriorityBlocks) {
                if (prompt.length() <= maxSystemPromptChars) break;
                if (lowBlock != null && prompt.contains(lowBlock)) {
                    prompt = prompt.replace(lowBlock, (lowBlock.length() > 200 ? lowBlock.substring(0, 200) + "…\n" : lowBlock));
                }
            }
            // 如果还是超，做最终硬截断（保护工具指南不出现在截断尾部）
            if (prompt.length() > maxSystemPromptChars) {
                int cutPoint = prompt.lastIndexOf(toolGuide);
                if (cutPoint > 0) {
                    int available = maxSystemPromptChars - (prompt.length() - cutPoint) - 100;
                    if (available > 500) {
                        prompt = prompt.substring(0, available) + "\n...(上下文已截断)..." + prompt.substring(cutPoint);
                    }
                } else {
                    prompt = prompt.substring(0, maxSystemPromptChars) + "\n...(系统提示词已截断，请用工具查询补充信息)";
                }
            }
        }
        return prompt;
    }

    /**
     * 构建数字孪生提示词块（全模块实时快照）。
     */
    private String buildDigitalTwinBlock() {
        if (coreUpgrade == null) return "";
        try {
            return coreUpgrade.buildDigitalTwinPrompt();
        } catch (Exception e) {
            log.debug("[AiAgent-DT] 数字孪生构建跳过: {}", e.getMessage());
            return "";
        }
    }

    /**
     * 工具智能筛选 — 工具超过阈值时用 RAG 选最相关的。
     */
    private List<AgentTool> applyToolDiscovery(List<AgentTool> visibleTools, String userMessage, String pageContext) {
        if (coreUpgrade == null || visibleTools == null) return visibleTools;
        try {
            return coreUpgrade.filterTools(visibleTools, userMessage, pageContext);
        } catch (Exception e) {
            log.debug("[AiAgent-ToolDisc] 工具筛选跳过: {}", e.getMessage());
            return visibleTools;
        }
    }

    private CompletableFuture<String> supplyAsync(Supplier<String> supplier) {
        return CompletableFuture.supplyAsync(UserContext.wrapSupplier(supplier::get), promptBuildExecutor);
    }

    @FunctionalInterface
    private interface Supplier<T> { T get(); }

    private String safeJoin(CompletableFuture<String> future, String label) {
        try { return future.get(5, TimeUnit.SECONDS); }
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

    private String buildMemoryBankContext(Long tenantId) {
        if (memoryBankService == null || tenantId == null) return "";
        try {
            if (!memoryBankService.isInitialized(tenantId)) return "";
            String bankContext = memoryBankService.compileContextForPrompt(tenantId);
            if (bankContext != null && !bankContext.isBlank() && !bankContext.contains("尚未初始化")) {
                log.info("[AiAgent-MemoryBank] 已注入租户{}的MemoryBank上下文 ({}字符)", tenantId, bankContext.length());
                return "\n" + bankContext;
            }
        } catch (Exception e) { log.debug("[AiAgent-MemoryBank] 上下文注入跳过: {}", e.getMessage()); }
        return "";
    }

    private String buildContextBlock(String userName, String userRole, boolean isSuperAdmin, boolean isTenantOwner, boolean isManager) {
        String currentTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String currentDate = LocalDate.now().toString();
        String dayOfWeek = LocalDate.now().getDayOfWeek().getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale.CHINESE);
        StringBuilder ctx = new StringBuilder();
        ctx.append("【当前环境】\n")
            .append("- 当前时间：").append(currentTime).append(" (").append(dayOfWeek).append(")\n")
            .append("- 今日日期：").append(currentDate).append("\n")
            .append("- 当前用户：").append(userName != null ? userName : "未知").append("\n")
            .append("- 用户角色：").append(userRole != null ? userRole : "普通用户")
            .append(isSuperAdmin ? "（超级管理员）" : isTenantOwner ? "（租户老板）" : isManager ? "（管理人员）" : "（生产员工）").append("\n");
        String permissionRange = UserContext.getDataScope();
        if (permissionRange != null && !permissionRange.isBlank()) {
            String rangeLabel;
            if ("all".equals(permissionRange)) { rangeLabel = "全部数据"; }
            else if ("team".equals(permissionRange)) { rangeLabel = "本团队数据"; }
            else if ("own".equals(permissionRange)) { rangeLabel = "仅本人数据"; }
            else { rangeLabel = permissionRange; }
            ctx.append("- 数据权限范围：").append(rangeLabel).append("\n");
        }
        if (isTenantOwner) {
            ctx.append("- 租户主账号：是（拥有该租户全部管理权限）\n");
        }
        if (isSuperAdmin) {
            ctx.append("- 平台超级管理员：是（跨租户全局权限）\n");
        }
        String factoryId = UserContext.factoryId();
        if (factoryId != null && !factoryId.isBlank()) {
            ctx.append("- 所属工厂ID：").append(factoryId);
            String factoryName = resolveFactoryName(factoryId);
            if (factoryName != null && !factoryName.isBlank()) {
                ctx.append("（").append(factoryName).append("）");
            }
            ctx.append("（你是外发工厂账号，只能操作本工厂的生产数据）\n");
        }
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            ctx.append("- 当前租户ID：").append(tenantId).append("\n");
            String tenantName = resolveTenantName(tenantId);
            if (tenantName != null && !tenantName.isBlank()) {
                ctx.append("- 所属公司：").append(tenantName).append("\n");
            }
        }
        if (!isManager) {
            ctx.append("⚠️ 你是生产员工，回答应简洁明了，多用短句和数字，少用技术术语。\n");
        }
        ctx.append("\n【身份认知规则】你已通过系统上下文获知当前用户的完整身份信息（姓名、角色、公司、工厂、权限范围等）。")
            .append("当用户问「我是谁」「你知道我是谁吗」「我是什么角色」「我有什么权限」等身份相关问题时，")
            .append("必须根据【当前环境】中的信息准确回答，绝不能说「我不知道你是谁」「你还没告诉我」之类的话。")
            .append("回答示例：「你是XX公司的管理员张三，拥有全部数据查看权限」或「你是XX工厂的生产员工李四，只能查看本人相关的生产数据」。\n");
        return ctx.toString();
    }

    private String resolveTenantName(Long tenantId) {
        try {
            if (tenantService == null) return null;
            com.fashion.supplychain.system.entity.Tenant tenant = tenantService.getById(tenantId);
            return tenant != null ? tenant.getTenantName() : null;
        } catch (Exception e) {
            log.debug("[AiAgent] 租户名称解析跳过: {}", e.getMessage());
            return null;
        }
    }

    private String resolveFactoryName(String factoryId) {
        try {
            if (factoryService == null) return null;
            com.fashion.supplychain.system.entity.Factory factory = factoryService.getById(factoryId);
            return factory != null ? factory.getFactoryName() : null;
        } catch (Exception e) {
            log.debug("[AiAgent] 工厂名称解析跳过: {}", e.getMessage());
            return null;
        }
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
            String exceptionReportBlock, String activePatrolBlock,
            String masInsightBlock, String digitalTwinBlock, String intelligenceContext,
            String longTermMemBlock, String memoryContext, String ragContext,
            String userBehaviorBlock, String contextFileBlockStr, String userProfileBlockStr,
            String memoryBankBlockStr, String selfCritiqueBlock, String toolGuide, String domainHint) {
        String identity = promptTemplateLoader.getBaseIdentity();
        if (identity == null || identity.isBlank()) {
            identity = "你是小云——服装供应链首席运营顾问，由云裳智链Trivia团队开发。";
        }
        return identity + "\n\n" +
                promptTemplateLoader.getBasePrinciples() + "\n\n" +
                contextBlock + "\n" +
                pageCtxBlock +
                roleBlock +
                exceptionReportBlock +
                activePatrolBlock +
                masInsightBlock +
                digitalTwinBlock +
                contextFileBlockStr +
                userProfileBlockStr +
                intelligenceContext + "\n" +
                longTermMemBlock +
                memoryBankBlockStr +
                memoryContext +
                ragContext +
                userBehaviorBlock +
                selfCritiqueBlock +
                promptTemplateLoader.getSelfCritiqueFeedback() + "\n\n" +
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

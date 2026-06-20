package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.*;

@Component
@Lazy
@Slf4j
public class AiAgentPromptHelper {

    @Value("${xiaoyun.agent.max-system-prompt-chars:12000}")
    private int maxSystemPromptChars;

    private volatile String masAnalysisCache = "";
    private volatile long masAnalysisCacheTime = 0;
    private static final long MAS_CACHE_TTL_MS = 4 * 60 * 60 * 1000L;

    @Autowired private PromptContextProvider contextProvider;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private PromptTemplateLoader promptTemplateLoader;
    @Autowired private IntentBasedPriorityRouter intentPriorityRouter;
    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.orchestration.XiaoyunCoreUpgrade coreUpgrade;
    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.service.MemoryBankService memoryBankService;
    @Autowired(required = false)
    private com.fashion.supplychain.system.service.TenantService tenantService;
    @Autowired(required = false)
    private com.fashion.supplychain.system.service.FactoryService factoryService;
    @Autowired(required = false)
    private AiAgentMemoryHelper memoryHelper;

    /** L4 程序性记忆：人工 SOP 注入（五层记忆模型第四章） */
    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.service.ProceduralMemoryService proceduralMemoryService;

    /** L5 归档记忆：冷数据召回（五层记忆模型第五章） */
    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.service.MemoryArchiveService memoryArchiveService;

    /** GEPA 遗传优化器：对 17 个 prompt 块应用优化值（enabled/weight） */
    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.service.GepaPromptOptimizer gepaPromptOptimizer;

    /** P2升级: 结构化输出强制执行 */
    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.service.StructuredOutputEnforcer outputEnforcer;

    private final ExecutorService promptBuildExecutor = new ThreadPoolExecutor(
            8, 16, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(64),
            r -> {
                Thread t = new Thread(r, "ai-prompt-build-" + System.identityHashCode(r) % 1000);
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    public int estimateMaxIterations(String userMessage) {
        return XiaoyunPatterns.estimateMaxIterations(userMessage);
    }

    public void updateMasAnalysisCache(String analysisSummary) {
        this.masAnalysisCache = analysisSummary;
        this.masAnalysisCacheTime = System.currentTimeMillis();
    }

    public String buildSystemPrompt(String userMessage, String pageContext, List<AgentTool> visibleTools, boolean isMultiDomain) {
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
        CompletableFuture<String> entityMemCtx = supplyAsync(() -> contextProvider.buildEntityMemoryContext(tenantId, userMessage));
        CompletableFuture<String> masInsightCtx = isMultiDomain
                ? supplyAsync(() -> contextProvider.buildMasInsightContext(tenantId, userMessage))
                : CompletableFuture.completedFuture("");
        CompletableFuture<String> graphRagCtx = supplyAsync(() -> contextProvider.buildGraphRagContext(tenantId, userMessage));
        CompletableFuture<String> factoryProfileCtx = supplyAsync(() -> contextProvider.buildFactoryProfileContext(tenantId, userMessage));
        CompletableFuture<String> proceduralMemCtx = supplyAsync(() -> memoryHelper.buildProceduralMemoryBlock());
        // L4 程序性记忆：人工 SOP（按 trigger_keywords 精确匹配，区别于上面的自动学习模式）
        final Long tenantIdForSop = tenantId;
        final String userMessageForSop = userMessage;
        CompletableFuture<String> proceduralSopCtx = supplyAsync(() -> buildProceduralSopBlock(tenantIdForSop, userMessageForSop));
        // L5 归档记忆：用户问"之前/历史/上次"时召回冷数据
        CompletableFuture<String> archivalMemCtx = supplyAsync(() -> buildArchivalMemoryBlock(tenantIdForSop, userMessageForSop));

        String intelligenceContext = safeJoin(intelligenceCtx, "实时经营上下文");
        String workerProfileBlock = safeJoin(workerProfile, "工人画像");
        String mgmtInsightBlock = safeJoin(mgmtInsight, "管理层快照");
        String longTermMemBlock = safeJoin(longTermMem, "长期记忆");
        String memoryContext = safeJoin(memoryCtx, "历史对话");
        // 重查询块（RAG/EntityMemory/GraphRag 涉及 DB+Qdrant）单独设置 1.5s 更短超时，避免慢查询阻塞
        String ragContext = safeJoinWithTimeout(ragCtx, 1500, "RAG检索");
        String userBehaviorBlock = safeJoin(userBehavior, "行为画像");
        String activePatrolBlock = safeJoinWithTimeout(activePatrol, 800, "巡查风险");
        String exceptionReportBlock = safeJoin(exceptionReport, "异常报告");
        String contextFileBlockStr = safeJoin(contextFileBlock, "上下文文件");
        String userProfileBlockStr = safeJoin(userProfileBlock, "用户画像");
        String memoryBankBlockStr = safeJoin(memoryBankBlock, "MemoryBank");
        String selfCritiqueBlock = safeJoin(selfCritiqueCtx, "自我评分反馈");
        String entityMemoryBlock = safeJoinWithTimeout(entityMemCtx, 1500, "实体记忆");
        String graphRagBlock = safeJoinWithTimeout(graphRagCtx, 1500, "知识图谱");
        String factoryProfileBlock = safeJoin(factoryProfileCtx, "工厂画像");
        String proceduralMemBlock = safeJoin(proceduralMemCtx, "程序记忆");
        String proceduralSopBlock = safeJoin(proceduralSopCtx, "L4程序性SOP");
        String archivalMemBlock = safeJoin(archivalMemCtx, "L5归档记忆");

        String masFromFuture = safeJoin(masInsightCtx, "多Agent分析");
        String masFromCache = buildMasInsightBlock();
        String masInsightBlock = !masFromFuture.isBlank() ? masFromFuture
                : (!masFromCache.isBlank() ? masFromCache : "");
        String contextBlock = buildContextBlock(userName, userRole, isSuperAdmin, isTenantOwner, isManager);
        String pageCtxBlock = buildPageContextBlock(pageContext);
        // 智能工具筛选：工具太多时用 RAG 选最相关的
        List<AgentTool> effectiveTools = applyToolDiscovery(visibleTools, userMessage, pageContext);
        String toolGuide = aiAgentToolAccessService.buildToolGuide(effectiveTools);
        String domainHint = buildDomainHint(effectiveTools);
        String roleBlock = buildRoleBlock(isManager, workerProfileBlock, mgmtInsightBlock);
        String formatHint = outputEnforcer != null ? outputEnforcer.getFormatHint(userMessage) : "";

        String prompt = assemblePrompt(contextBlock, pageCtxBlock, roleBlock, exceptionReportBlock, activePatrolBlock,
                masInsightBlock, intelligenceContext, longTermMemBlock, memoryContext, ragContext,
                userBehaviorBlock, contextFileBlockStr, userProfileBlockStr, memoryBankBlockStr, selfCritiqueBlock,
                entityMemoryBlock, graphRagBlock, factoryProfileBlock, proceduralMemBlock, proceduralSopBlock,
                archivalMemBlock, formatHint,
                toolGuide, domainHint);

        if (prompt.length() > maxSystemPromptChars) {
            int excess = prompt.length() - maxSystemPromptChars;
            log.warn("[AiAgent] systemPrompt过长({}字符 > {}上限)，超出{}字符，按优先级缩减", prompt.length(), maxSystemPromptChars, excess);
            String[] lowPriorityLabels = intentPriorityRouter.routeLowPriority(userMessage);
            // 第一轮：缩短低优先级块至200字符
            for (String label : lowPriorityLabels) {
                if (prompt.length() <= maxSystemPromptChars) break;
                String openTag = "<!--BLOCK:" + label + "-->";
                String closeTag = "<!--/BLOCK:" + label + "-->";
                int start = prompt.indexOf(openTag);
                int end = prompt.indexOf(closeTag);
                if (start >= 0 && end > start) {
                    String blockContent = prompt.substring(start + openTag.length(), end);
                    if (blockContent.length() > 200) {
                        int cutAt = blockContent.lastIndexOf('\n', 200);
                        if (cutAt < 50) cutAt = 200;
                        String truncated = blockContent.substring(0, cutAt) + "…\n";
                        prompt = prompt.substring(0, start + openTag.length()) + truncated + prompt.substring(end);
                    }
                }
            }
            // 第二轮：若仍超限，完全移除低优先级块
            if (prompt.length() > maxSystemPromptChars) {
                for (String label : lowPriorityLabels) {
                    if (prompt.length() <= maxSystemPromptChars) break;
                    String openTag = "<!--BLOCK:" + label + "-->";
                    String closeTag = "<!--/BLOCK:" + label + "-->";
                    int start = prompt.indexOf(openTag);
                    int end = prompt.indexOf(closeTag);
                    if (start >= 0 && end > start) {
                        prompt = prompt.substring(0, start) + prompt.substring(end + closeTag.length());
                        log.debug("[AiAgent] 截断: 已移除 {} 块", label);
                    }
                }
            }
            // 第三轮：核心约束保护 — 以toolGuide为锚点，保留尾部核心指令
            if (prompt.length() > maxSystemPromptChars) {
                String toolOpenTag = "<!--BLOCK:toolGuide-->";
                int toolStart = prompt.indexOf(toolOpenTag);
                if (toolStart > 0) {
                    int available = maxSystemPromptChars - (prompt.length() - toolStart) - 100;
                    if (available > 500) {
                        prompt = prompt.substring(0, available) + "\n...(上下文已截断)..." + prompt.substring(toolStart);
                    } else {
                        String toolGuideContent = prompt.substring(toolStart + toolOpenTag.length());
                        int toolClose = toolGuideContent.indexOf("<!--/BLOCK:toolGuide-->");
                        if (toolClose > 0) toolGuideContent = toolGuideContent.substring(0, toolClose);
                        prompt = prompt.substring(0, Math.min(prompt.length(), maxSystemPromptChars))
                            + "\n...(上下文已截断)...\n" + toolOpenTag + toolGuideContent + "<!--/BLOCK:toolGuide-->";
                    }
                } else {
                    prompt = prompt.substring(0, maxSystemPromptChars) + "\n...(系统提示词已截断，请用工具查询补充信息)";
                }
            }
        }
        return prompt;
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
        try { return future.get(2, TimeUnit.SECONDS); }
        catch (Exception e) { log.debug("[AiAgent-Prompt] {}构建超时或失败，跳过: {}", label, e.getMessage()); return ""; }
    }

    private String safeJoinWithTimeout(CompletableFuture<String> future, long timeoutMs, String label) {
        try { return future.get(timeoutMs, TimeUnit.MILLISECONDS); }
        catch (Exception e) { log.debug("[AiAgent-Prompt] {}注入超时跳过", label); return ""; }
    }

    /**
     * 记忆系统局限性声明（STABLE 层，借鉴 CL4R1T4S 显式 Limitations 设计）。
     * 让 AI 知道自己的记忆边界，从而在记忆可能失效时主动用工具查证或反问。
     */
    private String buildMemoryLimitationsBlock() {
        return "<!--BLOCK:memoryLimitations-->"
            + "## 记忆系统边界（你必须知晓并遵守）\n"
            + "你拥有四层记忆，但每层都有局限。涉及业务数据时，**记忆仅作参考，必须用工具查实时数据**：\n"
            + "- 对话记忆（Redis）：TTL 24小时，跨天的对话上下文可能已丢失。用户说\"刚才那个订单\"时，若不确定指哪个，必须反问。\n"
            + "- 语义缓存：相似度阈值 0.86，表述差异较大的问题可能不命中。不要假设\"上次回答过\"就一定正确。\n"
            + "- 长期记忆（PostgreSQL）：可能不完整或过时。涉及金额/日期/状态等关键字段时，必须用工具验证。\n"
            + "- 工厂画像/知识库：基于历史数据学习，可能未反映最新变化。产能/工序/人员变动需查实时数据。\n"
            + "- 知识图谱/Qdrant：覆盖范围有限，冷门实体可能检索不到。\n\n"
            + "**行为准则**：\n"
            + "1. 涉及订单号/款号/金额/日期/库存/工资等具体业务数据时，**先查工具，再回答**，禁止凭记忆编造。\n"
            + "2. 记忆与工具结果冲突时，**以工具结果为准**。\n"
            + "3. 不确定记忆是否过时时，明确告知用户\"我需要查询确认\"，禁止\"可能/大概/应该是\"式模糊回答。\n"
            + "4. 用户引用历史对话但你无记录时，坦诚说明\"我没有找到相关记录\"，并主动用工具补查。\n"
            + "<!--/BLOCK:memoryLimitations-->\n\n";
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

    /**
     * L4 程序性记忆：人工 SOP 注入（五层记忆模型第四章）。
     *
     * <p>按 trigger_keywords 精确匹配用户意图，命中则注入结构化 SOP 步骤。
     * 降级安全：ProceduralMemoryService 不可用或异常时返回空字符串，不影响主流程。
     */
    private String buildProceduralSopBlock(Long tenantId, String userMessage) {
        if (proceduralMemoryService == null || tenantId == null || userMessage == null) return "";
        try {
            String sopBlock = proceduralMemoryService.buildProceduralSopBlock(tenantId, userMessage);
            if (sopBlock != null && !sopBlock.isEmpty()) {
                log.debug("[AiAgent-L4SOP] 已注入租户{}的SOP上下文 ({}字符)", tenantId, sopBlock.length());
                return sopBlock;
            }
        } catch (Exception e) {
            log.debug("[AiAgent-L4SOP] SOP注入失败（不影响主流程）: {}", e.getMessage());
        }
        return "";
    }

    /**
     * L5 归档记忆：冷数据召回（五层记忆模型第五章）。
     *
     * <p>仅当用户消息含"之前/历史/上次/以前"等历史召回关键词时触发，
     * 从 Qdrant archival_memory_{tenantId} collection 向量搜索召回。
     * 降级安全：MemoryArchiveService 不可用或 Qdrant 不可用时返回空字符串。
     */
    private String buildArchivalMemoryBlock(Long tenantId, String userMessage) {
        if (memoryArchiveService == null || tenantId == null || userMessage == null) return "";
        // 关键词触发（低优先级，避免每轮都查 Qdrant）
        if (!containsHistoryKeywords(userMessage)) return "";
        try {
            java.util.List<com.fashion.supplychain.intelligence.service.MemoryArchiveService.ArchivalMemoryHit> hits =
                    memoryArchiveService.searchArchival(tenantId, userMessage, 3);
            if (hits == null || hits.isEmpty()) return "";
            StringBuilder sb = new StringBuilder("\n【L5 归档记忆：历史召回】\n");
            sb.append("以下是从 6 个月前的历史会话中召回的相关记忆（可能已过时，请用工具验证关键数据）：\n\n");
            for (com.fashion.supplychain.intelligence.service.MemoryArchiveService.ArchivalMemoryHit hit : hits) {
                sb.append("• (").append(hit.getCreateTime() != null ? hit.getCreateTime() : "未知日期").append(") ");
                sb.append(hit.getSummary() != null ? hit.getSummary() : "").append("\n");
            }
            log.debug("[AiAgent-L5Archival] 已注入租户{}的归档记忆 ({}条)", tenantId, hits.size());
            return sb.toString();
        } catch (Exception e) {
            log.debug("[AiAgent-L5Archival] 归档召回失败（不影响主流程）: {}", e.getMessage());
        }
        return "";
    }

    /** 检测用户消息是否含历史召回关键词 */
    private boolean containsHistoryKeywords(String message) {
        if (message == null) return false;
        return message.contains("之前") || message.contains("历史") || message.contains("上次")
                || message.contains("以前") || message.contains("前次") || message.contains("曾经")
                || message.contains("之前那个") || message.contains("之前说的");
    }

    public String buildUserContextBlock() {
        String userName = UserContext.username();
        String userRole = UserContext.role();
        boolean isSuperAdmin = UserContext.isSuperAdmin();
        boolean isTenantOwner = UserContext.isTenantOwner();
        boolean isManager = aiAgentToolAccessService.hasManagerAccess();
        return buildContextBlock(userName, userRole, isSuperAdmin, isTenantOwner, isManager);
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
        String position = UserContext.position();
        if (position != null && !position.isBlank()) {
            ctx.append("- 用户职位：").append(position).append("（请据此调整沟通风格与关注点）\n");
        }
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
        return ctx.toString();
    }

    private String resolveTenantName(Long tenantId) {
        try {
            if (tenantService == null) return null;
            com.fashion.supplychain.system.entity.Tenant tenant = tenantService.getById(tenantId);
            return tenant != null ? tenant.getTenantName() : null;
        } catch (Exception e) {
            log.warn("[AiAgent] 租户名称解析失败, tenantId={}: {}", tenantId, e.getMessage());
            return null;
        }
    }

    private String resolveFactoryName(String factoryId) {
        try {
            if (factoryService == null) return null;
            com.fashion.supplychain.system.entity.Factory factory = factoryService.getById(factoryId);
            return factory != null ? factory.getFactoryName() : null;
        } catch (Exception e) {
            log.warn("[AiAgent] 工厂名称解析失败, factoryId={}: {}", factoryId, e.getMessage());
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
            String masInsightBlock, String intelligenceContext,
            String longTermMemBlock, String memoryContext, String ragContext,
            String userBehaviorBlock, String contextFileBlockStr, String userProfileBlockStr,
            String memoryBankBlockStr, String selfCritiqueBlock, String entityMemoryBlock,
            String graphRagBlock, String factoryProfileBlock, String proceduralMemBlock,
            String proceduralSopBlock, String archivalMemBlock,
            String formatHint, String toolGuide, String domainHint) {
        String identity = promptTemplateLoader.getBaseIdentity();
        if (identity == null || identity.isBlank()) {
            identity = "你是小云——服装供应链首席运营顾问，由云裳智链Trivia团队开发。";
        }

        // 加载 GEPA 已应用优化个体（applied=1），对 17 个 prompt 块应用 enabled/weight 优化
        com.fashion.supplychain.intelligence.service.GepaPromptOptimizer.PromptIndividual gepaInd = loadGepaIndividual();

        // ===== P0升级: Prompt Caching 优化 =====
        // 原则：所有静态、可复用的内容放在 prompt 最前面，形成稳定前缀。
        // OpenAI 自动缓存 >=1024 tokens 的前缀，Anthropic 需要 cache_control breakpoint。
        // 动态块（每次随用户/页面/时间变化的）放在后面，不破坏缓存前缀。
        // 效果：每次调用仅需传输动态部分（约30%），成本降低60-80%。

        StringBuilder prompt = new StringBuilder(8000);

        // ── 第1层：稳定前缀（可缓存 ~5000 tokens）──────────────
        prompt.append("<!--CACHE_STABLE_BEGIN-->");
        prompt.append(identity).append("\n\n");
        prompt.append("<!--BLOCK:principles-->").append(applyGepaGene("principles", promptTemplateLoader.getBasePrinciples(), gepaInd)).append("<!--/BLOCK:principles-->\n\n");
        prompt.append(applyGepaGene("collaboration", promptTemplateLoader.getCollaborationRules(), gepaInd)).append("\n\n");
        prompt.append(applyGepaGene("toolStrategy", promptTemplateLoader.getToolStrategy(), gepaInd)).append("\n\n");
        prompt.append(applyGepaGene("toolAntiPatterns", promptTemplateLoader.getToolAntiPatterns(), gepaInd)).append("\n\n");
        prompt.append(applyGepaGene("thinkToolGuide", promptTemplateLoader.getThinkToolGuide(), gepaInd)).append("\n\n");
        prompt.append(applyGepaGene("outputRequirements", promptTemplateLoader.getOutputRequirements(), gepaInd)).append("\n\n");
        prompt.append(applyGepaGene("executionRules", promptTemplateLoader.getExecutionRules(), gepaInd)).append("\n\n");
        prompt.append(applyGepaGene("followupFormat", promptTemplateLoader.getFollowupFormat(), gepaInd)).append("\n\n");
        prompt.append(applyGepaGene("richMediaFormat", promptTemplateLoader.getRichMediaFormat(), gepaInd)).append("\n\n");
        prompt.append(applyGepaGene("selfCritiqueFeedback", promptTemplateLoader.getSelfCritiqueFeedback(), gepaInd)).append("\n\n");
        prompt.append(applyGepaGene("memoryLimitations", buildMemoryLimitationsBlock(), gepaInd));
        prompt.append("<!--CACHE_STABLE_END-->");

        // ── 第2层：工具/领域（半稳定，工具集变化时刷新）────
        prompt.append("<!--BLOCK:toolGuide-->").append(applyGepaGene("toolGuide", toolGuide, gepaInd)).append("<!--/BLOCK:toolGuide-->");
        prompt.append("<!--BLOCK:domainHint-->").append(applyGepaGene("domainHint", domainHint, gepaInd)).append("<!--/BLOCK:domainHint-->");
        // P2升级: 结构化输出格式提示
        if (formatHint != null && !formatHint.isBlank()) {
            prompt.append("<!--BLOCK:formatHint-->").append(formatHint).append("<!--/BLOCK:formatHint-->");
        }

        // ── 第3层：动态上下文（每次变化，不缓存）──────────
        prompt.append("<!--CACHE_DYNAMIC_BEGIN-->");
        prompt.append("<!--BLOCK:context-->").append(applyGepaGene("context", contextBlock, gepaInd)).append("<!--/BLOCK:context-->\n");
        prompt.append("<!--BLOCK:pageContext-->").append(pageCtxBlock).append("<!--/BLOCK:pageContext-->");
        prompt.append("<!--BLOCK:role-->").append(roleBlock).append("<!--/BLOCK:role-->");
        prompt.append("<!--BLOCK:exceptionReport-->").append(exceptionReportBlock).append("<!--/BLOCK:exceptionReport-->");
        prompt.append("<!--BLOCK:activePatrol-->").append(activePatrolBlock).append("<!--/BLOCK:activePatrol-->");
        prompt.append("<!--BLOCK:masInsight-->").append(masInsightBlock).append("<!--/BLOCK:masInsight-->");
        prompt.append("<!--BLOCK:intelligence-->").append(applyGepaGene("intelligence", intelligenceContext, gepaInd)).append("<!--/BLOCK:intelligence-->\n");
        prompt.append("<!--BLOCK:selfCritique-->").append(selfCritiqueBlock).append("<!--/BLOCK:selfCritique-->");
        prompt.append("<!--BLOCK:longTermMem-->").append(longTermMemBlock).append("<!--/BLOCK:longTermMem-->");
        prompt.append("<!--BLOCK:memory-->").append(memoryContext).append("<!--/BLOCK:memory-->");
        prompt.append("<!--BLOCK:memoryBank-->").append(applyGepaGene("memoryBank", memoryBankBlockStr, gepaInd)).append("<!--/BLOCK:memoryBank-->");
        prompt.append("<!--BLOCK:entityMemory-->").append(entityMemoryBlock).append("<!--/BLOCK:entityMemory-->");
        prompt.append("<!--BLOCK:graphRag-->").append(graphRagBlock).append("<!--/BLOCK:graphRag-->");
        prompt.append("<!--BLOCK:factoryProfile-->").append(factoryProfileBlock).append("<!--/BLOCK:factoryProfile-->");
        prompt.append("<!--BLOCK:proceduralMem-->").append(proceduralMemBlock).append("<!--/BLOCK:proceduralMem-->");
        // L4 程序性记忆：人工 SOP（按 trigger_keywords 精确匹配，命中即注入）
        if (proceduralSopBlock != null && !proceduralSopBlock.isEmpty()) {
            prompt.append("<!--BLOCK:proceduralSopCtx-->").append(proceduralSopBlock).append("<!--/BLOCK:proceduralSopCtx-->");
        }
        // L5 归档记忆：冷数据召回（低优先级，仅在用户问历史时触发）
        if (archivalMemBlock != null && !archivalMemBlock.isEmpty()) {
            prompt.append("<!--BLOCK:archivalMemCtx-->").append(archivalMemBlock).append("<!--/BLOCK:archivalMemCtx-->");
        }
        prompt.append("<!--BLOCK:rag-->").append(applyGepaGene("rag", ragContext, gepaInd)).append("<!--/BLOCK:rag-->");
        prompt.append("<!--BLOCK:userBehavior-->").append(userBehaviorBlock).append("<!--/BLOCK:userBehavior-->");
        prompt.append("<!--BLOCK:contextFile-->").append(contextFileBlockStr).append("<!--/BLOCK:contextFile-->");
        prompt.append("<!--BLOCK:userProfile-->").append(userProfileBlockStr).append("<!--/BLOCK:userProfile-->");
        prompt.append("<!--CACHE_DYNAMIC_END-->");

        return prompt.toString();
    }

    /**
     * 加载 GEPA 已应用优化个体（applied=1 的最新记录）。
     * 失败时返回 null，调用方降级到原始流程（不应用 GEPA 优化）。
     */
    private com.fashion.supplychain.intelligence.service.GepaPromptOptimizer.PromptIndividual loadGepaIndividual() {
        if (gepaPromptOptimizer == null) return null;
        try {
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) return null;
            return gepaPromptOptimizer.getAppliedIndividual(tenantId).orElse(null);
        } catch (Exception e) {
            log.debug("[AiAgent-GEPA] 加载优化个体失败，降级到原始流程: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 对单个 prompt 块应用 GEPA 优化值。
     *
     * <p>优化策略：
     * <ul>
     *   <li>gene.enabled=false 且非核心块 → 返回空字符串（禁用该块）</li>
     *   <li>gene.weight<1.0 且块长度>200 → 按 weight 比例缩减（最少保留 200 字符）</li>
     *   <li>核心块（principles/toolGuide/memoryLimitations）保护：不应用 enabled=false</li>
     *   <li>gene=null 或 gepaInd=null → 返回原内容（降级）</li>
     * </ul>
     */
    private String applyGepaGene(String blockName, String blockContent,
                                   com.fashion.supplychain.intelligence.service.GepaPromptOptimizer.PromptIndividual gepaInd) {
        if (gepaInd == null || blockContent == null || blockContent.isEmpty()) return blockContent;
        com.fashion.supplychain.intelligence.service.GepaPromptOptimizer.GeneConfig gene = gepaInd.getGenes().get(blockName);
        if (gene == null) return blockContent;

        // 核心块保护：不应用 enabled=false
        if (!gene.isEnabled() && !isProtectedBlock(blockName)) {
            log.debug("[AiAgent-GEPA] 块 {} 被 GEPA 禁用", blockName);
            return "";
        }

        // weight 截断：weight<1.0 时按比例缩减
        if (gene.getWeight() < 1.0 && blockContent.length() > 200) {
            int targetLen = (int) (blockContent.length() * gene.getWeight());
            targetLen = Math.max(200, targetLen);
            if (targetLen < blockContent.length()) {
                int cutAt = blockContent.lastIndexOf('\n', targetLen);
                if (cutAt < 100) cutAt = targetLen;
                log.debug("[AiAgent-GEPA] 块 {} 按 weight={} 缩减 {}→{} 字符",
                        blockName, gene.getWeight(), blockContent.length(), cutAt);
                return blockContent.substring(0, cutAt) + "…\n";
            }
        }
        return blockContent;
    }

    private boolean isProtectedBlock(String blockName) {
        return "principles".equals(blockName) || "toolGuide".equals(blockName)
                || "memoryLimitations".equals(blockName);
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

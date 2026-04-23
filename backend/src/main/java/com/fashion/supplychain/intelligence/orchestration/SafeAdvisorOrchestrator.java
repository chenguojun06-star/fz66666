package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.tool.KnowledgeSearchTool;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.intelligence.service.CragEvaluator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * SafeAdvisorOrchestrator — RAG 增强版智能顾问编排器
 *
 * <p>与 {@code /ai-advisor/chat} 不同，本编排器在调用 LLM Agent 前先检索知识库：
 * <ol>
 *   <li>配额校验：检查当日 AI 调用次数是否达上限</li>
 *   <li>RAG检索：用用户问题查询 {@code t_knowledge_base}（向量+关键词混合），
 *       可选 Cohere 精排，返回 Top5 相关片段</li>
 *   <li>提示词增强：将知识库摘要注入到最终提问中</li>
 *   <li>LLM 生成：调用 {@link AiAgentOrchestrator#executeAgent(String)} 完成回答</li>
 * </ol>
 *
 * <p>知识库检索失败时自动降级，直接透传原始问题，保证可用性。
 */
@Service
@Slf4j
public class SafeAdvisorOrchestrator {

    @Autowired
    private KnowledgeSearchTool knowledgeSearchTool;

    @Autowired
    private AiAgentOrchestrator aiAgentOrchestrator;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private CragEvaluator cragEvaluator;

    /**
     * RAG 增强分析：先检索知识库，再调用 LLM Agent 输出回答。
     *
     * @param question 用户问题（非空）
     * @return Result&lt;String&gt; — 含 AI 回答，失败时 code != 200
     */
    public Result<String> analyzeAndSuggest(String question) {
        // ① 配额校验
        Long tenantId = UserContext.tenantId();
        if (!aiAdvisorService.checkAndConsumeQuota(tenantId)) {
            return Result.fail("今日 AI 咨询次数已达上限，请明天继续");
        }

        // ② RAG 知识库检索（失败静默降级，不阻断主流程）
        String knowledgeContext = "";
        try {
            String escaped = question.replace("\\", "\\\\").replace("\"", "\\\"");
            String queryJson = "{\"query\":\"" + escaped + "\"}";
            knowledgeContext = knowledgeSearchTool.execute(queryJson);
            log.debug("[SafeAdvisor] tenantId={} 知识库检索完成，返回 {} 字节",
                    tenantId, knowledgeContext == null ? 0 : knowledgeContext.length());
        } catch (Exception e) {
            log.warn("[SafeAdvisor] 知识库检索失败，回退到无 RAG 模式: {}", e.getMessage());
        }

        CragEvaluator.CragResult cragResult = cragEvaluator.evaluate(knowledgeContext);
        log.info("[SafeAdvisor] CRAG评估: level={}, topScore={}", cragResult.level(), String.format("%.2f", cragResult.topScore()));
        knowledgeContext = cragResult.filteredContext();

        // ③ 构建增强提示词
        String enrichedQuestion = buildEnrichedPrompt(question, knowledgeContext);

        // ④ 调用 LLM Agent
        return aiAgentOrchestrator.executeAgent(enrichedQuestion);
    }

    // ─────────────────────────────────────────────────────────────────
    // 内部辅助
    // ─────────────────────────────────────────────────────────────────

    /**
     * 将知识库检索结果注入提示词。
     * 若知识库返回空 / "[]" / 空字符串，直接透传原始问题（避免提示词污染）。
     */
    private String buildEnrichedPrompt(String question, String knowledgeJson) {
        if (knowledgeJson == null || knowledgeJson.isBlank()
                || "[]".equals(knowledgeJson.trim())
                || "null".equalsIgnoreCase(knowledgeJson.trim())) {
            return question + "\n\n【重要提示】知识库检索未返回相关结果，请仅基于工具查询的真实数据回答，"
                    + "不要编造任何知识库内容。如果工具也未返回数据，请明确告知用户系统暂无该数据。";
        }
        return "【知识库参考资料】\n"
                + knowledgeJson
                + "\n\n【用户问题】\n"
                + question
                + "\n\n请结合以上知识库内容给出准确、专业的回答。"
                + "若知识库内容与问题高度相关，请优先引用并简要说明出处；"
                + "若无相关内容，则直接根据系统数据和业务经验作答，不要捏造知识库原文。"
                + "回答中的每个数字和事实必须来自工具查询结果或知识库，禁止编造。";
    }
}

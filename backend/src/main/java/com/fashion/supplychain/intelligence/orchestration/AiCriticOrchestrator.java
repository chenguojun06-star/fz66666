package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.concurrent.*;

@Service
@Slf4j
public class AiCriticOrchestrator {

    private static final long CRITIC_TIMEOUT_MS = 30_000;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private final ExecutorService criticExecutor = new ThreadPoolExecutor(
            2, 4, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(32),
            r -> { Thread t = new Thread(r, "critic-worker"); t.setDaemon(true); return t; },
            new ThreadPoolExecutor.CallerRunsPolicy());

    public String reviewAndRevise(String userIntent, String draftResponse) {
        return reviewAndRevise(userIntent, draftResponse, null);
    }

    public String reviewAndRevise(String userIntent, String draftResponse,
                                   List<AiAgentToolExecHelper.ToolExecRecord> toolRecords) {
        if (draftResponse == null || draftResponse.isBlank()) return draftResponse;

        String toolEvidenceBlock = "";
        if (toolRecords != null && !toolRecords.isEmpty()) {
            StringBuilder teb = new StringBuilder("\n【工具执行记录（你必须对照这些记录审查草稿）】\n");
            for (AiAgentToolExecHelper.ToolExecRecord rec : toolRecords) {
                String ev = rec.evidence != null && rec.evidence.length() > 300
                        ? rec.evidence.substring(0, 300) + "…" : rec.evidence;
                teb.append("- 工具: ").append(rec.toolName)
                   .append(" | 结果: ").append(ev).append("\n");
            }
            teb.append("（以上是主代理实际调用的工具和返回数据，草稿中的每个数字/事实必须能溯源到这些工具结果）\n");
            toolEvidenceBlock = teb.toString();
        }

        String systemPrompt = "你是系统中的【Critic（批评检查官）】智能体。\n"
                + "主代理(Planner)针对用户的原问题生成了一份初步答案。\n"
                + "你拥有完整的工具执行记录，可以判断草稿中的数据是否真实。\n\n"
                + "审查规则（按优先级）：\n"
                + "1. 数据溯源：草稿中的每个数字、订单号、工厂名、状态等事实，必须在工具执行记录中找到对应来源。"
                + "找不到来源的数字/事实，必须抹除，替换为'系统暂无该数据'或标注为推测。\n"
                + "2. 逻辑一致性：草稿的结论是否与工具数据逻辑一致？"
                + "如工具说进度60%，草稿说'即将完成'，修正为'进度60%，按当前速度预计还需X天'。\n"
                + "3. 遗漏检测：用户问了A，草稿回答了A但忽略了工具数据中与A强相关的B，补充B。"
                + "比如用户问订单进度，工具返回了该工厂近3天无扫码，草稿没提，必须补充。\n"
                + "4. 风险标注：草稿建议的操作可能产生什么副作用？如果有，标注出来。\n"
                + "5. 替代方案：如果草稿的方案有明显风险，给出1个替代方案。\n"
                + "6. 修复态度：不能过于生硬或机械，确保回答体贴且有条理。\n"
                + "7. 消除英文：如果回答中出现了英文编程术语（如 java.time.LocalDateTime、IN_PROGRESS、progressNode 等）、"
                + "英文数据库字段名（如 patternStatus、factoryName、orderQuantity 等）、或英文状态码，"
                + "必须将其替换为对应的中文表达。禁止在最终回答中保留任何面向用户不可读的英文技术名词。\n\n"
                + "输出要求：直接输出**修改完善后的最终正文**，不要有任何如'修复后的答案'等前缀。如果觉得没问题，原样返回即可。";

        String userPrompt = "【用户原本的问题】: " + userIntent + "\n\n"
                + "【主代理给出的草稿】: " + draftResponse + "\n\n"
                + toolEvidenceBlock + "\n"
                + "请严格对照工具执行记录审查草稿，返回最终回答：";

        try {
            log.info("[AiCritic] 进行深度审查（含{}条工具记录）...", toolRecords != null ? toolRecords.size() : 0);
            Future<String> future = criticExecutor.submit(() -> doReview(systemPrompt, userPrompt, draftResponse));
            return future.get(CRITIC_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            log.warn("[AiCritic] 审查超时({}ms)，直接返回原草稿", CRITIC_TIMEOUT_MS);
            return draftResponse;
        } catch (Exception e) {
            log.warn("[AiCritic] 审查失败，退回原草稿: {}", e.getMessage());
            return draftResponse;
        }
    }

    private String doReview(String systemPrompt, String userPrompt, String fallbackDraft) {
        try {
            IntelligenceInferenceResult result = inferenceOrchestrator.chat("critic_review", systemPrompt, userPrompt);
            if (result != null && result.isSuccess() && result.getContent() != null && !result.getContent().isBlank()) {
                String revised = result.getContent().trim();
                if (revised.startsWith("修复后的答案是：") || revised.startsWith("修复后的答案是:")) {
                    revised = revised.substring("修复后的答案是：".length()).trim();
                } else if (revised.startsWith("修复后的正文：")) {
                    revised = revised.substring("修复后的正文：".length()).trim();
                }

                if (!revised.equals(fallbackDraft)) {
                    log.info("[AiCritic] 反思修正了原结果（含数据溯源审查）");
                } else {
                    log.info("[AiCritic] 原结果通过审查，无修改");
                }
                return revised;
            }
        } catch (Exception e) {
            log.warn("[AiCritic] 审查LLM调用失败: {}", e.getMessage());
        }
        return fallbackDraft;
    }
}

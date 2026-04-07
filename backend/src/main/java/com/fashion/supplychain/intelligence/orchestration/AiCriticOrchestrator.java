package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class AiCriticOrchestrator {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    /**
     * 多智能体自反思层：主逻辑生成的初步回答必须走一道审查。
     * 检测潜在的数据幻觉、态度不当、或者未完成动作就误报告成功的行为。
     */
    public String reviewAndRevise(String userIntent, String draftResponse) {
        if (draftResponse == null || draftResponse.isBlank()) return draftResponse;

        String systemPrompt = "你是系统中的【Critic（批评检查官）】智能体。\n"
                + "主代理(Planner)针对用户的原问题生成了一份初步答案。\n"
                + "你的任务是挑刺并修复：\n"
                + "1. 发现幻觉：如果在未调用工具或证据不足的情况下给出了确切金额、具体订单号状态，警告并抹除，建议用户自己去查查或者明确说系统没接这个数据。\n"
                + "2. 修复态度：不能过于生硬或机械，确保回答体贴且有条理。\n"
                + "3. 查漏补缺：如果他只查了没说结果，或者缺少了引导链接语，帮他补上。\n"                + "4. 消除英文：如果回答中出现了英文编程术语（如 java.time.LocalDateTime、IN_PROGRESS、progressNode 等）、" +
                "英文数据库字段名（如 patternStatus、factoryName、orderQuantity 等）、或英文状态码，" +
                "必须将其替换为对应的中文表达。禁止在最终回答中保留任何面向用户不可读的英文技术名词。\n"                + "输出要求：直接输出**修改完善后的最终正文**，不要有任何如‘修复后的答案’等前缀。如果觉得没问题，原样返回即可。";

        String userPrompt = "【用户原本的问题】: " + userIntent + "\n\n"
                + "【主代理给出的草稿】: " + draftResponse + "\n\n"
                + "请审查并返回最终回答：";

        try {
            log.info("[AiCritic] 进行多智能体反思审查...");
            // 使用临时 sessionId 发起反思请求，避免污染原对话上下文
            IntelligenceInferenceResult result = inferenceOrchestrator.chat("critic_review_" + System.currentTimeMillis(), systemPrompt, userPrompt);
            if (result != null && result.isSuccess() && result.getContent() != null && !result.getContent().isBlank()) {
                String revised = result.getContent().trim();
                // 简单清理可能产生的前缀
                if (revised.startsWith("修复后的答案是：") || revised.startsWith("修复后的答案是:")) {
                    revised = revised.substring("修复后的答案是：".length()).trim();
                } else if (revised.startsWith("修复后的正文：")) {
                    revised = revised.substring("修复后的正文：".length()).trim();
                }

                if (!revised.equals(draftResponse)) {
                    log.info("[AiCritic] 反思修正了原结果。");
                } else {
                    log.info("[AiCritic] 原结果通过审查，无修改。");
                }
                return revised;
            }
        } catch (Exception e) {
            log.warn("[AiCritic] 审查失败，退回原草稿: {}", e.getMessage());
        }
        return draftResponse;
    }
}

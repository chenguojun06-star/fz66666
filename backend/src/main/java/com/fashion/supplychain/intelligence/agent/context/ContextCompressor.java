package com.fashion.supplychain.intelligence.agent.context;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
public class ContextCompressor {

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Value("${xiaoyun.agent.context.compression-threshold:0.75}")
    private double compressionThreshold;

    @Value("${xiaoyun.agent.context.max-messages-before-compress:20}")
    private int maxMessagesBeforeCompress;

    public List<AiMessage> compressIfNeeded(
            List<AiMessage> messages,
            int currentTokenEstimate,
            int tokenBudget) {

        if (messages == null || messages.size() <= 4) return messages;

        double usageRatio = (double) currentTokenEstimate / tokenBudget;
        if (usageRatio < compressionThreshold) return messages;

        log.info("[ContextCompressor] 触发压缩: messages={}, tokenEstimate={}, budget={}, ratio={}",
                messages.size(), currentTokenEstimate, tokenBudget, String.format("%.2f", usageRatio));

        return compressBySummary(messages);
    }

    private List<AiMessage> compressBySummary(List<AiMessage> messages) {
        if (messages.size() <= 6) return messages;

        AiMessage systemMsg = messages.get(0);
        List<AiMessage> recentMessages = new ArrayList<>(
                messages.subList(Math.max(0, messages.size() - 4), messages.size()));
        List<AiMessage> olderMessages = messages.subList(1, Math.max(1, messages.size() - 4));

        if (olderMessages.isEmpty()) return messages;

        String summary = generateSummary(olderMessages);
        if (summary == null || summary.isBlank()) {
            log.warn("[ContextCompressor] 摘要生成失败，降级为保留最近消息");
            List<AiMessage> result = new ArrayList<>();
            result.add(systemMsg);
            result.addAll(recentMessages);
            return result;
        }

        AiMessage summaryMsg = AiMessage.system(
                "【历史对话摘要】\n" + summary + "\n（以上为之前对话的压缩摘要，关键数据请通过工具查询确认）");

        List<AiMessage> result = new ArrayList<>();
        result.add(systemMsg);
        result.add(summaryMsg);
        result.addAll(recentMessages);

        log.info("[ContextCompressor] 压缩完成: {}条 → {}条 (摘要{}字符)",
                messages.size(), result.size(), summary.length());
        return result;
    }

    private String generateSummary(List<AiMessage> olderMessages) {
        try {
            StringBuilder sb = new StringBuilder();
            sb.append("请将以下对话历史压缩为一段简洁摘要，保留：1)用户的核心问题 2)关键数据/订单号/工厂名 3)已执行的操作和结果 4)未解决的待办。");
            sb.append("删除：闲聊内容、重复提问、已撤回的操作。输出不超过300字。\n\n");

            for (AiMessage msg : olderMessages) {
                String role = msg.getRole();
                String content = msg.getContent();
                if (content == null || content.isBlank()) continue;
                if (content.length() > 200) content = content.substring(0, 200) + "...";
                sb.append(role).append(": ").append(content).append("\n");
            }

            List<AiMessage> prompt = new ArrayList<>();
            prompt.add(AiMessage.system("你是一个对话摘要助手，只输出摘要文本，不加任何解释。"));
            prompt.add(AiMessage.user(sb.toString()));

            var result = inferenceOrchestrator.chat("context-compress", prompt, null);
            if (result != null && result.getContent() != null) {
                return result.getContent().trim();
            }
        } catch (Exception e) {
            log.warn("[ContextCompressor] 摘要生成异常: {}", e.getMessage());
        }
        return null;
    }

    public int estimateTokenCount(List<AiMessage> messages) {
        if (messages == null) return 0;
        int total = 0;
        for (AiMessage msg : messages) {
            String content = msg.getContent();
            if (content != null) {
                total += content.length() / 2;
            }
            if (msg.getTool_calls() != null) {
                total += msg.getTool_calls().size() * 50;
            }
        }
        return total;
    }
}

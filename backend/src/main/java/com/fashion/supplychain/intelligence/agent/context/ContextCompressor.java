package com.fashion.supplychain.intelligence.agent.context;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.LinkedHashSet;
import java.util.stream.Collectors;

@Slf4j
@Component
@Lazy
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
    /**
     * 压缩工具返回输出，减少送入LLM的token量。类似headroom的压缩策略。
     *
     * 压缩策略：
     *   1. 截断超长JSON/列表：保留前N条 + 统计摘要
     *   2. 去除不必要的JSON字段（createdAt/updatedAt/id等元数据）
     *   3. 数字精度压缩：浮点数保留2位小数
     *
     * @param toolName  工具名称（用于日志统计）
     * @param rawOutput 原始工具输出字符串
     * @param maxChars  最大输出字符数，默认8000
     * @return 压缩后的输出
     */
    public String compressToolOutput(String toolName, String rawOutput, int maxChars) {
        if (rawOutput == null || rawOutput.isEmpty()) return rawOutput;

        int originalLen = rawOutput.length();
        String compressed = rawOutput;

        // Level 1: 截断超长输出
        if (compressed.length() > maxChars) {
            int truncated = compressed.length() - maxChars;
            compressed = compressed.substring(0, maxChars);
            compressed += "\n...[截断 " + truncated + " 字符，完整数据请通过精确查询获取]";
        }

        // Level 2: 去除常见的冗余JSON元数据字段
        compressed = removeMetadataFields(compressed);

        // Level 3: 浮点数精度压缩
        compressed = compressFloatPrecision(compressed);

        int savedTokens = (originalLen - compressed.length()) / 2;
        if (savedTokens > 10) {
            log.debug("[ContextCompressor] 工具 {} 输出压缩: {}→{} 字符, 节省 ~{} tokens",
                    toolName, originalLen, compressed.length(), savedTokens);
        }
        return compressed;
    }

    /** 默认最大输出字符数 */
    public String compressToolOutput(String toolName, String rawOutput) {
        return compressToolOutput(toolName, rawOutput, 8000);
    }

    /**
     * 去重工具调用消息，移除连续的重复工具输出。
     */
    public List<AiMessage> deduplicateToolMessages(List<AiMessage> messages) {
        if (messages == null || messages.size() <= 2) return messages;

        List<AiMessage> deduped = new ArrayList<>();
        String lastToolContent = null;
        int skipCount = 0;

        for (AiMessage msg : messages) {
            if ("tool".equals(msg.getRole()) && msg.getContent() != null) {
                if (msg.getContent().equals(lastToolContent)) {
                    skipCount++;
                    continue;
                }
                if (skipCount > 0) {
                    deduped.add(AiMessage.system("(以上连续 " + skipCount + " 条重复工具结果已省略)"));
                    skipCount = 0;
                }
                lastToolContent = msg.getContent();
            }
            deduped.add(msg);
        }

        if (skipCount > 0) {
            deduped.add(AiMessage.system("(最后 " + skipCount + " 条重复工具结果已省略)"));
        }

        if (deduped.size() < messages.size()) {
            log.info("[ContextCompressor] 去重: {}条 → {}条 (移除{}条重复工具输出)",
                    messages.size(), deduped.size(), messages.size() - deduped.size());
        }
        return deduped;
    }

    /** 移除常见元数据字段 */
    private String removeMetadataFields(String json) {
        String[] noiseKeys = {"\"createdAt\"", "\"updatedAt\"", "\"createTime\"",
                "\"updateTime\"", "\"deletedFlag\"", "\"tenantId\"", "\"version\"",
                "\"createBy\"", "\"updateBy\"", "\"remark\""};
        for (String key : noiseKeys) {
            json = json.replaceAll(
                    key + "\\s*:\\s*\"[^\"]*\"\\s*[,}]",
                    "");
            json = json.replaceAll(
                    key + "\\s*:\\s*\\d+\\s*[,}]",
                    "");
            json = json.replaceAll(
                    key + "\\s*:\\s*null\\s*[,}]",
                    "");
        }
        return json;
    }

    /** 压缩浮点数精度: 保留2位小数 */
    private String compressFloatPrecision(String text) {
        return text.replaceAll(
                "(\\d+\\.\\d{2})\\d+",
                "$1");
    }
}
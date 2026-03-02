package com.fashion.supplychain.integration.ai;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.Result;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * AI 跟单助手接口
 * POST /api/ai/chat  —  接收自然语言问题，返回智能回答
 */
@RestController
@RequestMapping("/api/ai")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
@Slf4j
public class AiChatController {

    private final AiChatOrchestrator aiChatOrchestrator;

    /**
     * 发起对话
     * 请求体：{ "question": "今天哪些订单最危险？" }
     * 响应：  { code: 200, data: { answer: "..." } }
     */
    @PostMapping("/chat")
    public Result<Map<String, String>> chat(@RequestBody Map<String, String> body) {
        String question = body != null ? body.get("question") : null;
        if (question == null || question.isBlank()) {
            return Result.fail("问题不能为空");
        }
        if (question.length() > 500) {
            return Result.fail("问题太长，请控制在500字以内");
        }

        Long tenantId = UserContext.tenantId();
        log.info("[AI助手] 租户={} 提问：{}", tenantId, question.substring(0, Math.min(question.length(), 50)));

        String answer = aiChatOrchestrator.chat(question, tenantId);
        return Result.success(Map.of("answer", answer));
    }
}

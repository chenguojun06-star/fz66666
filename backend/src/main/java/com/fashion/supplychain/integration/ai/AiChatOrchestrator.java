package com.fashion.supplychain.integration.ai;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * AI 跟单助手编排器（第58号编排器）
 * 接收自然语言问题，结合当前租户的生产订单数据，通过 DeepSeek API 生成智能回答。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AiChatOrchestrator {

    @Value("${ai.deepseek.api-key:}")
    private String apiKey;

    @Value("${ai.deepseek.api-url:https://api.deepseek.com/v1/chat/completions}")
    private String apiUrl;

    @Value("${ai.deepseek.model:deepseek-chat}")
    private String model;

    @Value("${ai.deepseek.max-tokens:1024}")
    private int maxTokens;

    private final IntegrationHttpClient httpClient;
    private final ProductionOrderService productionOrderService;

    /**
     * 处理跟单问题
     * @param question  用户自然语言问题
     * @param tenantId  租户 ID，用于过滤数据
     * @return          AI 回答文本
     */
    public String chat(String question, Long tenantId) {
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("[AI助手] DEEPSEEK_API_KEY 未配置，返回提示");
            return "AI 助手暂未配置 API Key，请联系管理员在环境变量 DEEPSEEK_API_KEY 中设置。";
        }

        String context = buildOrderContext(tenantId);
        String systemPrompt = buildSystemPrompt(context);

        Map<String, Object> requestBody = Map.of(
            "model", model,
            "max_tokens", maxTokens,
            "messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user",   "content", question)
            )
        );

        try {
            Map<?, ?> resp = httpClient.postJson(
                apiUrl,
                requestBody,
                Map.class,
                Map.of("Authorization", "Bearer " + apiKey)
            );
            return extractContent(resp);
        } catch (Exception e) {
            log.error("[AI助手] DeepSeek 请求失败: {}", e.getMessage());
            return "AI 助手暂时不可用，请稍后再试。（" + e.getMessage() + "）";
        }
    }

    // =====================================================
    // 私有方法
    // =====================================================

    /**
     * 从 DeepSeek 响应中提取回答文本
     */
    @SuppressWarnings({"unchecked","rawtypes"})
    private String extractContent(Map<?, ?> resp) {
        if (resp == null) return "AI 返回为空，请重试。";
        try {
            List choices = (List) resp.get("choices");
            if (choices == null || choices.isEmpty()) return "AI 无回复，请重试。";
            Map choice  = (Map) choices.get(0);
            Map message = (Map) choice.get("message");
            Object content = message.get("content");
            return content != null ? content.toString() : "AI 返回内容为空。";
        } catch (Exception e) {
            log.warn("[AI助手] 解析响应失败: {}", e.getMessage());
            return "AI 回复解析失败，请重试。";
        }
    }

    /**
     * 构建生产订单上下文摘要（最近 30 条进行中的订单）
     */
    private String buildOrderContext(Long tenantId) {
        LocalDate today = LocalDate.now();

        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<ProductionOrder>()
            .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
            .in(ProductionOrder::getStatus, "IN_PROGRESS", "OVERDUE", "PENDING")
            .eq(ProductionOrder::getDeleteFlag, 0)
            .orderByDesc(ProductionOrder::getCreateTime)
            .last("LIMIT 40");

        List<ProductionOrder> orders = productionOrderService.list(wrapper);

        if (orders.isEmpty()) {
            return "当前暂无进行中的订单。";
        }

        List<String> lines = new ArrayList<>();
        int highRisk = 0;
        int overdue  = 0;
        for (ProductionOrder o : orders) {
            String orderNo   = o.getOrderNo()   != null ? o.getOrderNo()   : "未知";
            String factoryName = o.getFactoryName() != null ? o.getFactoryName() : "未指定工厂";
            String status    = o.getStatus()    != null ? o.getStatus()    : "未知";
            int    progress  = o.getProductionProgress() != null ? o.getProductionProgress() : 0;
            int    qty       = o.getOrderQuantity()      != null ? o.getOrderQuantity()      : 0;

            // 剩余天数
            long daysLeft = -999;
            if (o.getExpectedShipDate() != null) {
                daysLeft = ChronoUnit.DAYS.between(today, o.getExpectedShipDate());
            }

            // 逾期/高风险标记
            String flag = "";
            if ("OVERDUE".equals(status) || daysLeft < 0) { flag = "【逾期】"; overdue++; }
            else if (daysLeft <= 7 && progress < 50) { flag = "【高风险】"; highRisk++; }

            String line = String.format("%s订单%s | 厂：%s | 进度：%d%% | 数量：%d件 | 剩余：%s天",
                flag, orderNo, factoryName, progress, qty,
                daysLeft == -999 ? "未知" : String.valueOf(daysLeft));
            lines.add(line);
        }

        StringBuilder sb = new StringBuilder();
        sb.append(String.format("当前进行中订单共 %d 条（展示前40条）", orders.size()));
        sb.append(String.format("，其中逾期 %d 条，高风险 %d 条。\n", overdue, highRisk));
        lines.forEach(l -> sb.append(l).append("\n"));
        return sb.toString();
    }

    /**
     * 构建 System Prompt
     */
    private String buildSystemPrompt(String orderContext) {
        return "你是一个专业的服装供应链生产跟单助手，帮助工厂管理员掌握订单进度、识别风险、提供建议。\n"
             + "请用简洁的中文回答，结合以下实时数据作出判断，不要凭空捏造数字。\n"
             + "如果用户问的问题与数据无关，也可以回答服装生产/供应链相关的通用知识。\n\n"
             + "=== 当前生产订单数据 ===\n"
             + orderContext
             + "\n=== 结束 ===\n";
    }
}

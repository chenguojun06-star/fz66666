package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 越狱检测器（Jailbreak Detector）。
 *
 * <p>P0 级安全升级：用户输入侧 prompt injection 防护。
 *
 * <p>检测策略（三层混合，参考 2026 阿里云 Anolisa 架构）：
 * <ol>
 *   <li>规则引擎层 — 中英文 prompt injection 模式匹配（{@link PromptInjectionPatterns}）</li>
 *   <li>结构化特征层 — Base64/Unicode 编码绕过、ASCII 艺术 jailbreak、角色劫持</li>
 *   <li>审计层 — 拦截事件落库到 t_intelligence_high_risk_audit（复用 HighRiskAuditService）</li>
 * </ol>
 *
 * <p>延迟目标：≤10ms（与 2026 业界标准对齐）。
 *
 * <p>调用点：
 * <ul>
 *   <li>{@code AiAgentOrchestrator.executeAgent} — 用户输入入口</li>
 *   <li>{@code NlQueryOrchestrator} — Text-to-SQL 入口</li>
 *   <li>任何接收用户原始输入的 LLM 调用入口</li>
 * </ul>
 */
@Service
@Slf4j
public class JailbreakDetector {

    @Autowired(required = false)
    private HighRiskAuditService highRiskAuditService;

    /** Base64 编码内容（长字符串疑似编码绕过） */
    private static final Pattern BASE64_PATTERN = Pattern.compile(
            "[A-Za-z0-9+/]{60,}={0,2}");

    /** Unicode 转义序列（密集出现疑似编码绕过） */
    private static final Pattern UNICODE_ESCAPE_PATTERN = Pattern.compile(
            "(\\\\u[0-9a-fA-F]{4}){5,}");

    /** HTML 实体编码（密集出现） */
    private static final Pattern HTML_ENTITY_PATTERN = Pattern.compile(
            "(&#[0-9]{2,4};){5,}");

    /** 疑似角色劫持关键词（中英文混合） */
    private static final Pattern ROLE_HIJACK_PATTERN = Pattern.compile(
            "(?i)(从现在起|从现在开始|从此).{0,10}(你是|你将|act as|pretend)",
            Pattern.CASE_INSENSITIVE);

    /** 检测结果 */
    public static class DetectionResult {
        private final boolean blocked;
        private final String reason;
        private final String matchedPattern;
        private final String severity; // HIGH / MEDIUM / LOW

        private DetectionResult(boolean blocked, String reason, String matchedPattern, String severity) {
            this.blocked = blocked;
            this.reason = reason;
            this.matchedPattern = matchedPattern;
            this.severity = severity;
        }

        public static DetectionResult pass() {
            return new DetectionResult(false, null, null, null);
        }

        public static DetectionResult block(String reason, String pattern, String severity) {
            return new DetectionResult(true, reason, pattern, severity);
        }

        public boolean isBlocked() { return blocked; }
        public String getReason() { return reason; }
        public String getMatchedPattern() { return matchedPattern; }
        public String getSeverity() { return severity; }
    }

    /**
     * 检测用户输入是否包含越狱/prompt injection 攻击。
     *
     * @param userInput 用户原始输入
     * @return 检测结果，blocked=true 表示应拦截请求
     */
    public DetectionResult detect(String userInput) {
        if (userInput == null || userInput.isEmpty()) {
            return DetectionResult.pass();
        }

        long start = System.currentTimeMillis();

        // 第 1 层：规则引擎 — 中英文注入模式
        String matched = PromptInjectionPatterns.detect(userInput);
        if (matched != null) {
            auditDetection(userInput, matched, "HIGH");
            return DetectionResult.block(
                    "[安全拦截] 检测到 prompt injection 尝试，请求已被阻止",
                    matched, "HIGH");
        }

        // 第 2 层：结构化特征 — 编码绕过检测
        String encodingBypass = detectEncodingBypass(userInput);
        if (encodingBypass != null) {
            auditDetection(userInput, encodingBypass, "MEDIUM");
            return DetectionResult.block(
                    "[安全拦截] 检测到编码绕过攻击，请求已被阻止",
                    encodingBypass, "MEDIUM");
        }

        // 第 3 层：角色劫持检测
        if (ROLE_HIJACK_PATTERN.matcher(userInput).find()) {
            String desc = "role_hijack";
            auditDetection(userInput, desc, "MEDIUM");
            return DetectionResult.block(
                    "[安全拦截] 检测到角色劫持尝试，请求已被阻止",
                    desc, "MEDIUM");
        }

        long elapsed = System.currentTimeMillis() - start;
        if (elapsed > 10) {
            log.debug("[JailbreakDetector] 检测耗时 {}ms（>10ms 阈值）", elapsed);
        }

        return DetectionResult.pass();
    }

    /** 检测编码绕过攻击 */
    private String detectEncodingBypass(String text) {
        if (BASE64_PATTERN.matcher(text).find()) {
            return "base64_encoding";
        }
        if (UNICODE_ESCAPE_PATTERN.matcher(text).find()) {
            return "unicode_escape";
        }
        if (HTML_ENTITY_PATTERN.matcher(text).find()) {
            return "html_entity";
        }
        return null;
    }

    /** 审计拦截事件（落库到 t_intelligence_high_risk_audit） */
    private void auditDetection(String userInput, String pattern, String severity) {
        if (highRiskAuditService == null) return;
        try {
            Long tenantId = UserContext.tenantId();
            String userId = UserContext.userId();
            String preview = userInput.length() > 200 ? userInput.substring(0, 200) + "..." : userInput;

            Map<String, Object> auditData = new LinkedHashMap<>();
            auditData.put("type", "jailbreak_detection");
            auditData.put("pattern", pattern);
            auditData.put("severity", severity);
            auditData.put("tenantId", tenantId);
            auditData.put("userId", userId);
            auditData.put("inputPreview", preview);
            auditData.put("timestamp", LocalDateTime.now().toString());

            log.warn("[JailbreakDetector] 拦截越狱尝试 tenantId={} userId={} pattern={} severity={} preview={}",
                    tenantId, userId, pattern, severity, preview);

            // 复用 HighRiskAuditService 的审计落库能力
            highRiskAuditService.registerPending(
                    userId,
                    UserContext.username(),
                    "jailbreak_detector",
                    pattern + ":" + preview);
        } catch (Exception e) {
            log.debug("[JailbreakDetector] 审计落库失败（不影响拦截）: {}", e.getMessage());
        }
    }

    /**
     * 净化用户输入（用于非拦截但需清洗的场景）。
     * 与 {@link #detect} 区别：detect 是拦截，scrub 是清洗后继续处理。
     */
    public String scrub(String userInput) {
        return PromptInjectionPatterns.scrub(userInput);
    }
}

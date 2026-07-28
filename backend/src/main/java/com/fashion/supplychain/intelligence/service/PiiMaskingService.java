package com.fashion.supplychain.intelligence.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PII 脱敏管道（PII Masking Service）。
 *
 * <p>P0 级安全升级：独立 PII 脱敏服务，覆盖输入侧 + 输出侧。
 *
 * <p>覆盖类型（7 类）：
 * <ol>
 *   <li>手机号 — 11 位中国大陆手机号</li>
 *   <li>身份证 — 18 位中国大陆身份证号</li>
 *   <li>邮箱 — 标准邮箱格式</li>
 *   <li>银行卡 — 16-19 位银行卡号</li>
 *   <li>微信号 — wx_xxx / wechat_xxx 格式</li>
 *   <li>QQ 号 — 5-12 位 QQ 号（带前缀）</li>
 *   <li>座机号 — 区号-号码 格式</li>
 * </ol>
 *
 * <p>脱敏策略：保留前 3 后 4（手机号/身份证/邮箱/银行卡），其他全替换。
 *
 * <p>调用点：
 * <ul>
 *   <li>{@code AiAgentOrchestrator.executeAgent} — 用户输入侧脱敏（防止 PII 进入 LLM 上下文）</li>
 *   <li>{@code GuardrailsConfigService.sanitizeOutput} — 输出侧脱敏（兜底）</li>
 *   <li>{@code NlQueryOrchestrator} — Text-to-SQL 输入脱敏</li>
 * </ul>
 *
 * <p>性能：单次脱敏 ≤5ms（纯正则，无外部调用）。
 */
@Service
@Slf4j
public class PiiMaskingService {

    /** 手机号 — 11 位中国大陆手机号 */
    private static final Pattern PHONE_PATTERN = Pattern.compile(
            "1[3-9]\\d{9}");

    /** 身份证 — 18 位中国大陆身份证号（最后一位可为 X） */
    private static final Pattern ID_CARD_PATTERN = Pattern.compile(
            "\\b[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]\\b");

    /** 邮箱 */
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}");

    /** 银行卡 — 16-19 位连续数字（前后有边界） */
    private static final Pattern BANK_CARD_PATTERN = Pattern.compile(
            "\\b\\d{16,19}\\b");

    /** 微信号 — wx_ / wechat_ / 微信: 前缀 */
    private static final Pattern WECHAT_PATTERN = Pattern.compile(
            "(?i)(?:wx_|wechat_|微信号[:：]?\\s*)[a-zA-Z0-9_-]{4,20}");

    /** QQ 号 — qq/qq号/QQ: 前缀 + 5-12 位数字 */
    private static final Pattern QQ_PATTERN = Pattern.compile(
            "(?i)(?:qq|qq号|QQ[:：]?\\s*)[1-9]\\d{4,11}");

    /** 座机号 — 区号-号码 */
    private static final Pattern LANDLINE_PATTERN = Pattern.compile(
            "0\\d{2,3}-\\d{7,8}");

    /** 脱敏统计结果 */
    public static class MaskResult {
        private final String masked;
        private final Map<String, Integer> counts;

        public MaskResult(String masked, Map<String, Integer> counts) {
            this.masked = masked;
            this.counts = counts;
        }

        public String getMasked() { return masked; }
        public Map<String, Integer> getCounts() { return counts; }
        public int totalMasked() {
            return counts.values().stream().mapToInt(Integer::intValue).sum();
        }
    }

    /**
     * 脱敏输入文本（保留前 3 后 4 策略）。
     *
     * @param text 原始文本
     * @return 脱敏后文本
     */
    public String mask(String text) {
        if (text == null || text.isEmpty()) return text;
        return maskDetailed(text).getMasked();
    }

    /**
     * 脱敏输入文本（带统计）。
     *
     * @param text 原始文本
     * @return 脱敏结果（含脱敏数量统计）
     */
    public MaskResult maskDetailed(String text) {
        if (text == null || text.isEmpty()) {
            return new MaskResult(text, new LinkedHashMap<>());
        }

        Map<String, Integer> counts = new LinkedHashMap<>();
        String result = text;

        // 手机号 — 保留前 3 后 4
        result = maskWithCount(result, PHONE_PATTERN, "phone", counts, this::maskPhone);

        // 身份证 — 保留前 3 后 4
        result = maskWithCount(result, ID_CARD_PATTERN, "id_card", counts, this::maskIdCard);

        // 邮箱 — 保留前 3 后 4
        result = maskWithCount(result, EMAIL_PATTERN, "email", counts, this::maskEmail);

        // 银行卡 — 保留前 3 后 4
        result = maskWithCount(result, BANK_CARD_PATTERN, "bank_card", counts, this::maskBankCard);

        // 微信号 — 全替换
        result = maskWithCount(result, WECHAT_PATTERN, "wechat", counts, m -> "***");

        // QQ 号 — 全替换
        result = maskWithCount(result, QQ_PATTERN, "qq", counts, m -> "***");

        // 座机号 — 保留区号
        result = maskWithCount(result, LANDLINE_PATTERN, "landline", counts, m -> {
            String s = m.group();
            int dash = s.indexOf('-');
            if (dash > 0) return s.substring(0, dash) + "-****";
            return "***";
        });

        return new MaskResult(result, counts);
    }

    /** 通用脱敏方法（带计数） */
    private String maskWithCount(String text, Pattern pattern, String type,
                                  Map<String, Integer> counts,
                                  java.util.function.Function<Matcher, String> masker) {
        Matcher m = pattern.matcher(text);
        StringBuffer sb = new StringBuffer();
        int count = 0;
        while (m.find()) {
            m.appendReplacement(sb, Matcher.quoteReplacement(masker.apply(m)));
            count++;
        }
        m.appendTail(sb);
        if (count > 0) counts.put(type, count);
        return sb.toString();
    }

    /** 手机号脱敏：138****1234 */
    private String maskPhone(Matcher m) {
        String s = m.group();
        if (s.length() < 8) return "***";
        return s.substring(0, 3) + "****" + s.substring(s.length() - 4);
    }

    /** 身份证脱敏：110***********1234 */
    private String maskIdCard(Matcher m) {
        String s = m.group();
        if (s.length() < 8) return "***";
        return s.substring(0, 3) + "***********" + s.substring(s.length() - 4);
    }

    /** 邮箱脱敏：abc***@example.com */
    private String maskEmail(Matcher m) {
        String s = m.group();
        int at = s.indexOf('@');
        if (at <= 3) return "***" + s.substring(at);
        return s.substring(0, 3) + "***" + s.substring(at);
    }

    /** 银行卡脱敏：621****1234 */
    private String maskBankCard(Matcher m) {
        String s = m.group();
        if (s.length() < 8) return "***";
        return s.substring(0, 3) + "****" + s.substring(s.length() - 4);
    }

    /**
     * 检测文本中是否包含 PII（不脱敏，仅检测）。
     * 用于审计日志和告警。
     */
    public boolean containsPii(String text) {
        if (text == null || text.isEmpty()) return false;
        return PHONE_PATTERN.matcher(text).find()
                || ID_CARD_PATTERN.matcher(text).find()
                || EMAIL_PATTERN.matcher(text).find()
                || BANK_CARD_PATTERN.matcher(text).find()
                || WECHAT_PATTERN.matcher(text).find()
                || QQ_PATTERN.matcher(text).find()
                || LANDLINE_PATTERN.matcher(text).find();
    }
}

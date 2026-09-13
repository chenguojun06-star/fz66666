package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Lazy
@Slf4j
public class GroundedGenerationGuard {

    private static final double GROUNDING_THRESHOLD = 0.8;

    /**
     * 数字后缀单位。多字符单位必须排在单字符之前，否则 "千克" 只会命中 "千"。
     * 刻意不含 "万/亿"：阿拉伯数字+万（如 "3万元"）真实取值是 30000，按 3 取值会制造新的误判，
     * 因此保持改造前的行为——不把它当数值声明（中文数字 "三万件" 走证据侧解析，可得 30000）。
     */
    private static final String UNIT =
            "(?:千克|公斤|%|件|单|次|天|人|个|条|工|序|厂|元|双|套|米|台|箱|批|款|色|码|只|支|卷|匹)";

    /** 数值声明：可选货币符号 + 数字（支持千分位）+ 单位后缀 */
    private static final Pattern NUMBER_PATTERN = Pattern.compile(
            "(?<![0-9.])(?:[¥￥$]|RMB|CNY)?\\s*(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?\\s*" + UNIT);

    /** 数字 token。千分位写法优先，其次普通整数/小数；(?<![0-9.]) 防止把 "1,234" 拆成 "234" */
    private static final Pattern NUMBER_TOKEN = Pattern.compile(
            "(?<![0-9.])(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?");

    private static final Pattern ORDER_REF = Pattern.compile("[A-Za-z0-9][-A-Za-z0-9]{4,30}");

    /** 中文数字：紧跟单位，或长度≥2，避免 "一共"/"十分" 这类非数字词被当成数字 */
    private static final Pattern CN_NUMERAL = Pattern.compile(
            "[零〇一两二三四五六七八九十百千万亿]+(?=" + UNIT + ")|[零〇一两二三四五六七八九十百千万亿]{2,}");

    private static final int MAX_EVIDENCE_NUMBERS = 500;
    private static final int MAX_LOG_NUMBERS = 30;

    public record GroundingResult(double groundingRate, List<String> ungroundedClaims, boolean passed) {
        public String toWarningText() {
            if (passed) return "";
            return String.format("接地率%.0f%%低于阈值，以下声明无工具数据支撑：%s",
                    groundingRate * 100, String.join("；", ungroundedClaims));
        }
    }

    public GroundingResult verify(String aiOutput, List<AiAgentToolExecHelper.ToolExecRecord> toolRecords) {
        if (aiOutput == null || aiOutput.isBlank()) {
            return new GroundingResult(1.0, List.of(), true);
        }
        if (toolRecords == null || toolRecords.isEmpty()) {
            return new GroundingResult(1.0, List.of(), true);
        }

        String allEvidence = toolRecords.stream()
                .map(r -> r.evidence != null ? r.evidence : "")
                .reduce("", (a, b) -> a + " " + b);

        List<String> claims = extractNumericClaims(aiOutput);
        if (claims.isEmpty()) {
            return new GroundingResult(1.0, List.of(), true);
        }

        // 证据侧一次性归一化成数值集合，后续按数值相等比对（不再做字符串包含）
        Set<BigDecimal> evidenceNumbers = extractEvidenceNumbers(allEvidence);

        List<String> ungrounded = new ArrayList<>();
        int grounded = 0;
        for (String claim : claims) {
            BigDecimal value = normalizedValue(claim);
            if (isGroundedInEvidence(value, evidenceNumbers)) {
                grounded++;
            } else {
                ungrounded.add(claim);
                log.info("[GroundingGuard] 数值声明无依据: claim={} normalized={} evidenceNumbers={}",
                        claim, value == null ? "N/A" : value.toPlainString(), preview(evidenceNumbers));
            }
        }

        double rate = (double) grounded / claims.size();
        boolean passed = rate >= GROUNDING_THRESHOLD;

        if (!passed) {
            log.warn("[GroundingGuard] 接地率{}/{}={}%, 未通过：{}",
                    grounded, claims.size(), String.format("%.0f", rate * 100), ungrounded);
        }

        return new GroundingResult(rate, ungrounded, passed);
    }

    private List<String> extractNumericClaims(String text) {
        List<String> claims = new ArrayList<>();
        Matcher m = NUMBER_PATTERN.matcher(text);
        while (m.find() && claims.size() < 20) {
            claims.add(m.group().trim());
        }
        return claims;
    }

    /**
     * 抽取证据中的全部数值：阿拉伯数字（含千分位、小数）+ 中文数字，统一归一化为 BigDecimal。
     * 千分位逗号、货币符号、百分号、单位后缀都不影响取值，仅取数字本身。
     */
    private Set<BigDecimal> extractEvidenceNumbers(String evidence) {
        Set<BigDecimal> numbers = new TreeSet<>();
        if (evidence == null || evidence.isBlank()) {
            return numbers;
        }
        Matcher m = NUMBER_TOKEN.matcher(evidence);
        while (m.find() && numbers.size() < MAX_EVIDENCE_NUMBERS) {
            addNormalized(numbers, m.group());
        }
        Matcher cn = CN_NUMERAL.matcher(evidence);
        while (cn.find() && numbers.size() < MAX_EVIDENCE_NUMBERS) {
            numbers.add(BigDecimal.valueOf(parseChineseNumeral(cn.group())));
        }
        return numbers;
    }

    private static void addNormalized(Set<BigDecimal> numbers, String token) {
        try {
            // 去千分位逗号 + 去小数尾零（3.0 → 3），保证与证据侧写法无关
            numbers.add(new BigDecimal(token.replace(",", "")).stripTrailingZeros());
        } catch (NumberFormatException ignored) {
            // 极端数字（超长串）忽略即可，不影响其余判定
        }
    }

    /** 声明侧归一化：无阿拉伯数字（如纯中文数字"三件"）返回 null，沿用原有"无法判定即视为接地" */
    private static BigDecimal normalizedValue(String claim) {
        Matcher m = NUMBER_TOKEN.matcher(claim);
        if (!m.find()) {
            return null;
        }
        try {
            return new BigDecimal(m.group().replace(",", "")).stripTrailingZeros();
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 数值相等判定：TreeSet 的 compareTo 语义即数值相等（3 与 3.0 相等，3 与 13 不等） */
    private boolean isGroundedInEvidence(BigDecimal value, Set<BigDecimal> evidenceNumbers) {
        if (value == null) return true;
        if (value.compareTo(BigDecimal.valueOf(2)) < 0) return true;
        return evidenceNumbers.contains(value);
    }

    /** 中文数字符号与其取值（"两" 同 "二"） */
    private static final String CN_DIGIT_CHARS = "零〇一二两三四五六七八九";
    private static final int[] CN_DIGIT_VALUES = {0, 0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9};

    /** 中文数字 → 数值，支持 零〇一两二三四五六七八九十百千万亿 */
    private static long parseChineseNumeral(String text) {
        long total = 0;
        long section = 0;
        int digit = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            int d = chineseDigit(c);
            if (d >= 0) {
                digit = d;
            } else if (c == '十') {
                section += (long) (digit == 0 ? 1 : digit) * 10;
                digit = 0;
            } else if (c == '百') {
                section += (long) (digit == 0 ? 1 : digit) * 100;
                digit = 0;
            } else if (c == '千') {
                section += (long) (digit == 0 ? 1 : digit) * 1000;
                digit = 0;
            } else if (c == '万') {
                total += (section + digit) * 10000L;
                section = 0;
                digit = 0;
            } else if (c == '亿') {
                total += (section + digit) * 100000000L;
                section = 0;
                digit = 0;
            }
        }
        return total + section + digit;
    }

    private static int chineseDigit(char c) {
        int i = CN_DIGIT_CHARS.indexOf(c);
        return i < 0 ? -1 : CN_DIGIT_VALUES[i];
    }

    private static String preview(Set<BigDecimal> numbers) {
        StringBuilder sb = new StringBuilder("[");
        int i = 0;
        for (BigDecimal n : numbers) {
            if (i >= MAX_LOG_NUMBERS) {
                sb.append("... 共").append(numbers.size()).append("个");
                break;
            }
            if (i > 0) sb.append(", ");
            sb.append(n.toPlainString());
            i++;
        }
        return sb.append("]").toString();
    }
}

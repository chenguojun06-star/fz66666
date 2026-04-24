package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class GroundedGenerationGuard {

    private static final double GROUNDING_THRESHOLD = 0.8;
    private static final Pattern NUMBER_PATTERN = Pattern.compile("\\b(\\d+\\.?\\d*)\\s*[%件单次天人个条工序厂]");
    private static final Pattern ORDER_REF = Pattern.compile("[A-Za-z0-9][-A-Za-z0-9]{4,30}");

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

        List<String> ungrounded = new ArrayList<>();
        int grounded = 0;
        for (String claim : claims) {
            if (isGroundedInEvidence(claim, allEvidence)) {
                grounded++;
            } else {
                ungrounded.add(claim);
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

    private boolean isGroundedInEvidence(String claim, String evidence) {
        String numStr = claim.replaceAll("[^0-9.]", "");
        if (numStr.isEmpty()) return true;
        try {
            double num = Double.parseDouble(numStr);
            if (num < 2) return true;
            String numInt = String.valueOf((int) num);
            return evidence.contains(numInt);
        } catch (NumberFormatException e) {
            return true;
        }
    }
}

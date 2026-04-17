package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.selection.entity.SelectionCandidate;
import com.fashion.supplychain.selection.service.SelectionCandidateService;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 款式选品来源归一化 & 封面兜底 — 从 StyleInfoOrchestrator 拆出
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class StyleSelectionSourceHelper {

    static final String SOURCE_TYPE_SELF = "SELF_DEVELOPED";
    static final String SOURCE_TYPE_SELECTION = "SELECTION_CENTER";
    static final Set<String> SELECTION_SOURCE_DETAILS = Set.of("外部市场", "供应商", "客户定制", "内部选品", "选品中心");

    private SelectionCandidateService selectionCandidateService;

    /**
     * 批量填充选品来源 + 封面兜底
     */
    public void fillSelectionSourceAndCoverFallback(List<StyleInfo> records) {
        if (records == null || records.isEmpty() || selectionCandidateService == null) {
            return;
        }

        List<Long> styleIds = records.stream()
                .map(StyleInfo::getId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        List<String> styleNos = records.stream()
                .map(StyleInfo::getStyleNo)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .toList();

        if (styleIds.isEmpty() && styleNos.isEmpty()) {
            return;
        }

        LambdaQueryWrapper<SelectionCandidate> wrapper = new LambdaQueryWrapper<SelectionCandidate>()
                .eq(SelectionCandidate::getDeleteFlag, 0)
                .orderByDesc(SelectionCandidate::getUpdateTime)
                .orderByDesc(SelectionCandidate::getId);
        wrapper.and(w -> {
            boolean appended = false;
            if (!styleIds.isEmpty()) {
                w.in(SelectionCandidate::getCreatedStyleId, styleIds);
                appended = true;
            }
            if (!styleNos.isEmpty()) {
                if (appended) {
                    w.or();
                }
                w.in(SelectionCandidate::getCreatedStyleNo, styleNos);
            }
        });

        List<SelectionCandidate> candidates = selectionCandidateService.list(wrapper);
        Map<Long, SelectionCandidate> candidateByStyleId = new HashMap<>();
        Map<String, SelectionCandidate> candidateByStyleNo = new HashMap<>();
        for (SelectionCandidate candidate : candidates) {
            if (candidate.getCreatedStyleId() != null) {
                candidateByStyleId.putIfAbsent(candidate.getCreatedStyleId(), candidate);
            }
            if (StringUtils.hasText(candidate.getCreatedStyleNo())) {
                candidateByStyleNo.putIfAbsent(candidate.getCreatedStyleNo().trim(), candidate);
            }
        }

        for (StyleInfo style : records) {
            SelectionCandidate candidate = style.getId() != null ? candidateByStyleId.get(style.getId()) : null;
            if (candidate == null && StringUtils.hasText(style.getStyleNo())) {
                candidate = candidateByStyleNo.get(style.getStyleNo().trim());
            }

            boolean looksLikeSelection = candidate != null || isSelectionDescription(style.getDescription());

            String normalizedType = normalizeSourceType(style.getDevelopmentSourceType(), looksLikeSelection);
            style.setDevelopmentSourceType(normalizedType);
            style.setDevelopmentSourceDetail(normalizeResolvedSourceDetail(style, candidate, normalizedType));
            if (!StringUtils.hasText(style.getCover()) && candidate != null) {
                String fallbackCover = extractFirstReferenceImage(candidate.getReferenceImages());
                if (StringUtils.hasText(fallbackCover)) {
                    style.setCover(fallbackCover);
                }
            }
        }
    }

    /**
     * 手动保存/更新时归一化来源字段
     */
    public void normalizeManualSourceFields(StyleInfo styleInfo) {
        if (styleInfo == null) {
            return;
        }
        String normalizedType = normalizeSourceType(styleInfo.getDevelopmentSourceType(), false);
        styleInfo.setDevelopmentSourceType(normalizedType);
        styleInfo.setDevelopmentSourceDetail(normalizeResolvedSourceDetail(styleInfo, null, normalizedType));
    }

    // ────────── private helpers ──────────

    private boolean isSelectionDescription(String description) {
        return StringUtils.hasText(description) && description.contains("选品中心");
    }

    private String normalizeSourceType(String sourceType, boolean looksLikeSelection) {
        String normalized = sourceType == null ? "" : sourceType.trim().toUpperCase();
        if (SOURCE_TYPE_SELECTION.equals(normalized) || looksLikeSelection) {
            return SOURCE_TYPE_SELECTION;
        }
        return SOURCE_TYPE_SELF;
    }

    private String normalizeResolvedSourceDetail(StyleInfo style, SelectionCandidate candidate, String sourceType) {
        String current = style == null ? "" : safeText(style.getDevelopmentSourceDetail());
        if (isValidSourceDetail(sourceType, current)) {
            return current;
        }
        return resolveSourceDetailFallback(style, candidate, sourceType);
    }

    private boolean isValidSourceDetail(String sourceType, String detail) {
        if (!StringUtils.hasText(detail) || looksLikeMojibake(detail)) {
            return false;
        }
        if (SOURCE_TYPE_SELECTION.equals(sourceType)) {
            return SELECTION_SOURCE_DETAILS.contains(detail);
        }
        return "自主开发".equals(detail);
    }

    private boolean looksLikeMojibake(String value) {
        String text = safeText(value);
        if (!StringUtils.hasText(text)) {
            return false;
        }
        if (text.length() > 12 || text.indexOf('�') >= 0) {
            return true;
        }
        return text.codePoints().anyMatch(codePoint -> codePoint >= 0x00C0 && codePoint <= 0x024F);
    }

    private String resolveSourceDetailFallback(StyleInfo style, SelectionCandidate candidate, String sourceType) {
        if (!SOURCE_TYPE_SELECTION.equals(sourceType)) {
            return "自主开发";
        }
        if (candidate != null) {
            String candidateSourceType = candidate.getSourceType() == null ? "" : candidate.getSourceType().trim().toUpperCase();
            return switch (candidateSourceType) {
                case "EXTERNAL" -> "外部市场";
                case "SUPPLIER" -> "供应商";
                case "CLIENT" -> "客户定制";
                case "INTERNAL" -> "内部选品";
                default -> "选品中心";
            };
        }
        String description = style.getDescription() == null ? "" : style.getDescription();
        if (description.contains("外部市场")) {
            return "外部市场";
        }
        if (description.contains("供应商")) {
            return "供应商";
        }
        if (description.contains("客户定制")) {
            return "客户定制";
        }
        if (description.contains("选品中心")) {
            return "选品中心";
        }
        return "选品中心";
    }

    private String safeText(String value) {
        return value == null ? "" : value.trim();
    }

    private String extractFirstReferenceImage(String referenceImages) {
        if (!StringUtils.hasText(referenceImages)) {
            return null;
        }
        String raw = referenceImages.trim();
        if (!raw.startsWith("[")) {
            return raw;
        }
        try {
            List<String> images = new com.fasterxml.jackson.databind.ObjectMapper().readValue(raw, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
            return images == null || images.isEmpty() ? null : images.get(0);
        } catch (Exception e) {
            log.warn("解析候选款参考图失败 referenceImages={}", raw, e);
            return null;
        }
    }
}

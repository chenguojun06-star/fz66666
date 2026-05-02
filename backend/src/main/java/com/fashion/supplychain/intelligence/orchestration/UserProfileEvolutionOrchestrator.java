package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.UserProfileEvolution;
import com.fashion.supplychain.intelligence.gateway.AiInferenceRouter;
import com.fashion.supplychain.intelligence.mapper.UserProfileEvolutionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserProfileEvolutionOrchestrator {

    private final UserProfileEvolutionMapper profileMapper;
    private final AiInferenceRouter inferenceRouter;

    @Async
    public void evolveProfile(Long tenantId, String userId, String userMessage,
                               String assistantResponse, String conversationId,
                               List<String> toolNames) {
        try {
            String profilePrompt = buildProfileExtractionPrompt(userMessage, assistantResponse, toolNames);

            String profileResult = inferenceRouter.chatSimple(profilePrompt);
            if (profileResult == null || profileResult.contains("NONE")) return;

            Map<String, Map.Entry<String, BigDecimal>> extracted = parseProfileExtraction(profileResult);
            if (extracted.isEmpty()) return;

            for (Map.Entry<String, Map.Entry<String, BigDecimal>> entry : extracted.entrySet()) {
                String layer = entry.getKey();
                String[] fieldAndValue = parseFieldValue(entry.getValue().getKey());
                if (fieldAndValue == null) continue;

                String fieldKey = fieldAndValue[0];
                String fieldValue = fieldAndValue[1];
                BigDecimal confidence = entry.getValue().getValue();

                upsertProfile(tenantId, userId, layer, fieldKey, fieldValue,
                        confidence, conversationId);
            }
        } catch (Exception e) {
            log.warn("[UserProfile] 画像演化失败: {}", e.getMessage());
        }
    }

    public String buildUserProfileContext(Long tenantId, String userId) {
        QueryWrapper<UserProfileEvolution> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("user_id", userId)
                .ge("confidence", 0.4)
                .orderByDesc("confidence")
                .last("LIMIT 20");
        List<UserProfileEvolution> profiles = profileMapper.selectList(qw);

        if (profiles.isEmpty()) return "";

        Map<String, List<UserProfileEvolution>> byLayer = profiles.stream()
                .collect(Collectors.groupingBy(UserProfileEvolution::getProfileLayer));

        StringBuilder sb = new StringBuilder();
        sb.append("[用户画像 — 跨会话学习]\n");

        for (Map.Entry<String, List<UserProfileEvolution>> entry : byLayer.entrySet()) {
            sb.append("## ").append(layerLabel(entry.getKey())).append("\n");
            for (UserProfileEvolution p : entry.getValue()) {
                sb.append("- ").append(p.getFieldKey()).append(": ")
                        .append(p.getFieldValue())
                        .append(" (置信度: ").append(String.format("%.0f%%", p.getConfidence().doubleValue() * 100))
                        .append(", 证据: ").append(p.getEvidenceCount()).append("次)\n");
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    public Map<String, Map<String, Object>> getUserProfileSummary(Long tenantId, String userId) {
        Map<String, Map<String, Object>> summary = new LinkedHashMap<>();

        QueryWrapper<UserProfileEvolution> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("user_id", userId)
                .ge("confidence", 0.3);
        List<UserProfileEvolution> profiles = profileMapper.selectList(qw);

        for (UserProfileEvolution p : profiles) {
            summary.computeIfAbsent(p.getProfileLayer(), k -> new LinkedHashMap<>())
                    .put(p.getFieldKey(), Map.of(
                            "value", p.getFieldValue(),
                            "confidence", p.getConfidence(),
                            "evidence", p.getEvidenceCount()
                    ));
        }
        return summary;
    }

    private void upsertProfile(Long tenantId, String userId, String layer,
                                String fieldKey, String fieldValue,
                                BigDecimal confidence, String conversationId) {
        QueryWrapper<UserProfileEvolution> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("user_id", userId)
                .eq("profile_layer", layer)
                .eq("field_key", fieldKey);
        UserProfileEvolution existing = profileMapper.selectOne(qw);

        if (existing != null) {
            existing.setEvidenceCount(existing.getEvidenceCount() + 1);
            existing.setConfidence(existing.getConfidence().add(confidence)
                    .divide(BigDecimal.valueOf(2), 2, java.math.RoundingMode.HALF_UP)
                    .min(BigDecimal.ONE));
            if (existing.getConfidence().doubleValue() < 0.95) {
                existing.setFieldValue(fieldValue);
            }
            String existingIds = existing.getSourceConversationIds();
            if (existingIds == null || existingIds.length() < 200) {
                existing.setSourceConversationIds(
                        (existingIds != null ? existingIds + "," : "") + conversationId);
            }
            existing.setLastObservedAt(LocalDateTime.now());
            profileMapper.updateById(existing);
        } else {
            UserProfileEvolution p = new UserProfileEvolution();
            p.setId("upe_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20));
            p.setTenantId(tenantId);
            p.setUserId(userId);
            p.setProfileLayer(layer);
            p.setFieldKey(fieldKey);
            p.setFieldValue(fieldValue);
            p.setConfidence(confidence);
            p.setEvidenceCount(1);
            p.setSourceConversationIds(conversationId);
            p.setLastObservedAt(LocalDateTime.now());
            p.setCreateTime(LocalDateTime.now());
            p.setUpdateTime(LocalDateTime.now());
            profileMapper.insert(p);
        }
    }

    private String buildProfileExtractionPrompt(String userMessage, String assistantResponse,
                                                  List<String> toolNames) {
        return String.format("""
                你是用户画像分析器。从以下对话中提取用户特征。
                
                ## 用户消息
                %s
                
                ## AI回复
                %s
                
                ## 使用的工具
                %s
                
                ## 提取维度
                1. ROLE: 用户角色特征（关注的生产/财务/仓库领域）
                2. BEHAVIOR: 行为模式（查询频率、偏好时间段、决策风格）
                3. PREFERENCE: 偏好（喜欢的报表格式、关注的指标、通知偏好）
                4. EXPERTISE: 专业领域（擅长的业务领域、常用术语）
                
                输出JSON，无值得提取的信息则输出NONE：
                {"ROLE": {"关注领域": "生产管理", "confidence": 0.8},
                 "BEHAVIOR": {"查询模式": "每日早上检查异常订单", "confidence": 0.6}}
                """, truncate(userMessage, 500), truncate(assistantResponse, 500),
                toolNames != null ? String.join(", ", toolNames) : "无");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Map.Entry<String, BigDecimal>> parseProfileExtraction(String response) {
        Map<String, Map.Entry<String, BigDecimal>> result = new LinkedHashMap<>();
        try {
            int start = response.indexOf('{');
            int end = response.lastIndexOf('}');
            if (start < 0 || end <= start) return result;
            String json = response.substring(start, end + 1);

            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            Map<String, Object> map = mapper.readValue(json, Map.class);

            for (Map.Entry<String, Object> entry : map.entrySet()) {
                String layer = entry.getKey();
                if (entry.getValue() instanceof Map) {
                    Map<String, Object> fields = (Map<String, Object>) entry.getValue();
                    for (Map.Entry<String, Object> field : fields.entrySet()) {
                        String fieldKey = field.getKey();
                        Object fieldVal = field.getValue();
                        if (fieldVal instanceof Map) {
                            Map<String, Object> detail = (Map<String, Object>) fieldVal;
                            String value = detail.getOrDefault("value", detail.getOrDefault(fieldKey, "")).toString();
                            BigDecimal conf = parseConfidence(detail.get("confidence"));
                            result.put(layer, new AbstractMap.SimpleEntry<>(fieldKey + "=" + value, conf));
                        } else {
                            result.put(layer, new AbstractMap.SimpleEntry<>(
                                    fieldKey + "=" + fieldVal.toString(), BigDecimal.valueOf(0.6)));
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[UserProfile] 画像解析失败: {}", e.getMessage());
        }
        return result;
    }

    private String[] parseFieldValue(String combined) {
        int eqIdx = combined.indexOf('=');
        if (eqIdx < 0) return null;
        return new String[]{combined.substring(0, eqIdx).trim(), combined.substring(eqIdx + 1).trim()};
    }

    private BigDecimal parseConfidence(Object val) {
        if (val == null) return BigDecimal.valueOf(0.6);
        try {
            return new BigDecimal(val.toString());
        } catch (Exception e) {
            return BigDecimal.valueOf(0.6);
        }
    }

    private String layerLabel(String layer) {
        return switch (layer) {
            case "ROLE" -> "角色特征";
            case "BEHAVIOR" -> "行为模式";
            case "PREFERENCE" -> "偏好设置";
            case "EXPERTISE" -> "专业领域";
            default -> layer;
        };
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() > maxLen ? text.substring(0, maxLen) + "…" : text;
    }
}

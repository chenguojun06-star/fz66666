package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 工厂画像深度学习服务
 * <p>
 * 基于历史订单数据自动学习工厂特征，提供：
 * <ul>
 *   <li>多维度画像（质量/交期/产能/成本）</li>
 *   <li>智能推荐（根据用户问题推荐最合适的工厂）</li>
 *   <li>风险预警（识别高风险工厂）</li>
 *   <li>趋势分析（评分变化趋势）</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
public class FactoryProfileLearningService {

    @Autowired private FactoryMapper factoryMapper;

    private static final int MAX_FACTORIES_IN_PROMPT = 5;

    public String buildFactoryProfileContext(Long tenantId, String userMessage) {
        try {
            TenantAssert.assertTenantContext();
            QueryWrapper<Factory> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq("delete_flag", 0)
              .eq("supplier_type", "OUTSOURCE")
              .isNotNull("supplier_tier")
              .orderByDesc("overall_score")
              .last("LIMIT " + Math.max(MAX_FACTORIES_IN_PROMPT, 10));
            List<Factory> factories = factoryMapper.selectList(qw);
            if (factories.isEmpty()) return "";

            // 如果有用户消息，做智能推荐（只展示最相关的工厂）
            List<Factory> relevantFactories = factories;
            String recommendationNote = "";
            if (userMessage != null && !userMessage.isBlank()) {
                relevantFactories = recommendFactories(factories, userMessage);
                recommendationNote = "（根据您的问题智能推荐）";
            } else {
                relevantFactories = factories.stream().limit(MAX_FACTORIES_IN_PROMPT).toList();
            }

            StringBuilder sb = new StringBuilder("【工厂画像（基于近3个月订单数据自动学习）】" + recommendationNote + "\n");
            sb.append(String.format("%-12s %5s %7s %7s %6s %5s %5s\n",
                    "工厂名称", "评级", "综合分", "准时率", "质量分", "订单", "日产能"));
            for (Factory f : relevantFactories) {
                sb.append(String.format("%-12s %4s %6.1f %6.1f%% %5.1f%% %4d %5d\n",
                        truncateName(f.getFactoryName(), 10),
                        f.getSupplierTier() != null ? f.getSupplierTier() : "-",
                        toDouble(f.getOverallScore()),
                        toDouble(f.getOnTimeDeliveryRate()),
                        toDouble(f.getQualityScore()),
                        f.getTotalOrders() != null ? f.getTotalOrders() : 0,
                        f.getDailyCapacity() != null ? f.getDailyCapacity() : 0));
            }

            // 多维度分析
            sb.append("\n▎工厂分布分析\n");
            sb.append(buildFactoryDistribution(factories));

            // 风险预警
            List<Factory> highRisk = identifyHighRiskFactories(factories);
            if (!highRisk.isEmpty()) {
                sb.append("\n▎高风险工厂预警\n");
                for (Factory f : highRisk) {
                    sb.append(String.format("  ⚠ %s [%s级]：%s\n",
                            truncateName(f.getFactoryName(), 8),
                            f.getSupplierTier(),
                            buildRiskDescription(f)));
                }
            }

            // 优质推荐
            List<Factory> topFactories = factories.stream()
                    .filter(f -> "S".equals(f.getSupplierTier()) || "A".equals(f.getSupplierTier()))
                    .limit(3)
                    .toList();
            if (!topFactories.isEmpty()) {
                sb.append("\n▎优质工厂推荐\n");
                for (Factory f : topFactories) {
                    sb.append(String.format("  ✓ %s [%s级]：综合分%.1f，准时率%.1f%%\n",
                            truncateName(f.getFactoryName(), 8),
                            f.getSupplierTier(),
                            toDouble(f.getOverallScore()),
                            toDouble(f.getOnTimeDeliveryRate())));
                }
            }

            sb.append("（以上为工厂自动学习画像，评分越高代表交期越准时、质量越好）\n");
            log.info("[FactoryProfile] 工厂画像构建完成: 总工厂={} 推荐展示={}", factories.size(), relevantFactories.size());
            return sb.toString();
        } catch (Exception e) {
            log.debug("[FactoryProfile] 工厂画像构建跳过: {}", e.getMessage());
            return "";
        }
    }

    /**
     * 智能推荐工厂：根据用户问题匹配最合适的工厂。
     * <p>考虑维度：质量要求、交期紧迫程度、产能需求、成本敏感度
     */
    private List<Factory> recommendFactories(List<Factory> factories, String userMessage) {
        String msg = userMessage.toLowerCase();

        // 计算每个工厂的匹配得分
        List<ScoredFactory> scored = new ArrayList<>();
        for (Factory factory : factories) {
            double score = calculateMatchScore(factory, msg);
            scored.add(new ScoredFactory(factory, score));
        }

        // 按匹配得分排序
        scored.sort((a, b) -> Double.compare(b.score, a.score));

        // 返回前 N 个
        return scored.stream()
                .limit(MAX_FACTORIES_IN_PROMPT)
                .map(s -> s.factory)
                .collect(Collectors.toList());
    }

    /**
     * 计算工厂与用户需求的匹配得分。
     */
    private double calculateMatchScore(Factory factory, String msg) {
        double score = toDouble(factory.getOverallScore());  // 基础分

        // 质量敏感型问题（次品、返工、质检等）→ 质量分权重提高
        if (msg.matches(".*(质量|次品|返工|报废|不良|质检|品质).*")) {
            double qualityBonus = toDouble(factory.getQualityScore()) * 0.5;
            score += qualityBonus;
        }

        // 交期敏感型问题（延期、逾期、急单、交期等）→ 准时率权重提高
        if (msg.matches(".*(延期|逾期|超期|交期|急单|赶货|准时|延误).*")) {
            double deliveryBonus = toDouble(factory.getOnTimeDeliveryRate()) * 0.5;
            score += deliveryBonus;
        }

        // 产能需求型问题（大单、批量、产能等）→ 产能权重提高
        if (msg.matches(".*(产能|产量|大单|批量|大货|多少件|多少套).*")) {
            int capacity = factory.getDailyCapacity() != null ? factory.getDailyCapacity() : 0;
            double capacityBonus = Math.min(capacity / 100.0, 5.0);
            score += capacityBonus;
        }

        // 成本敏感型问题（便宜、成本、价格、省钱等）→ 低级别工厂加分
        if (msg.matches(".*(便宜|成本|价格|省钱|性价比|划算).*")) {
            // B/C级工厂价格通常更有优势
            if ("B".equals(factory.getSupplierTier())) score += 5;
            else if ("C".equals(factory.getSupplierTier())) score += 3;
        }

        return score;
    }

    /**
     * 构建工厂分布分析文本。
     */
    private String buildFactoryDistribution(List<Factory> factories) {
        StringBuilder sb = new StringBuilder();

        // 等级分布
        Map<String, Long> tierCount = factories.stream()
                .collect(Collectors.groupingBy(
                        f -> f.getSupplierTier() != null ? f.getSupplierTier() : "未知",
                        Collectors.counting()));
        sb.append("  等级分布：");
        List<String> tiers = List.of("S", "A", "B", "C", "D");
        List<String> tierDescs = new ArrayList<>();
        for (String tier : tiers) {
            Long count = tierCount.getOrDefault(tier, 0L);
            if (count > 0) {
                tierDescs.add(tier + "级" + count + "家");
            }
        }
        sb.append(String.join("、", tierDescs));

        // 平均评分
        double avgOverall = factories.stream()
                .mapToDouble(f -> toDouble(f.getOverallScore()))
                .average()
                .orElse(0);
        double avgOnTime = factories.stream()
                .mapToDouble(f -> toDouble(f.getOnTimeDeliveryRate()))
                .average()
                .orElse(0);
        sb.append(String.format("\n  平均水平：综合分%.1f，准时率%.1f%%", avgOverall, avgOnTime));

        sb.append("\n");
        return sb.toString();
    }

    /**
     * 识别高风险工厂。
     * <p>风险判定规则：
     * <ul>
     *   <li>D级工厂（最高风险）</li>
     *   <li>C级工厂且准时率<70%</li>
     *   <li>逾期订单占比>30%</li>
     * </ul>
     */
    private List<Factory> identifyHighRiskFactories(List<Factory> factories) {
        List<Factory> highRisk = new ArrayList<>();
        for (Factory f : factories) {
            if (isHighRisk(f)) {
                highRisk.add(f);
            }
        }
        return highRisk.stream().limit(3).collect(Collectors.toList());  // 最多展示3个
    }

    private boolean isHighRisk(Factory factory) {
        // D级工厂
        if ("D".equals(factory.getSupplierTier())) return true;

        // C级工厂且准时率低
        if ("C".equals(factory.getSupplierTier())
                && toDouble(factory.getOnTimeDeliveryRate()) < 70) {
            return true;
        }

        // 逾期订单占比高
        int total = factory.getTotalOrders() != null ? factory.getTotalOrders() : 0;
        int overdue = factory.getOverdueOrders() != null ? factory.getOverdueOrders() : 0;
        if (total > 0 && (overdue / (double) total) > 0.3) {
            return true;
        }

        return false;
    }

    /**
     * 构建风险描述文本。
     */
    private String buildRiskDescription(Factory factory) {
        List<String> risks = new ArrayList<>();

        if ("D".equals(factory.getSupplierTier())) {
            risks.add("D级供应商");
        }
        if (toDouble(factory.getOnTimeDeliveryRate()) < 70) {
            risks.add(String.format("准时率仅%.1f%%", toDouble(factory.getOnTimeDeliveryRate())));
        }
        if (toDouble(factory.getQualityScore()) < 70) {
            risks.add(String.format("质量分%.1f", toDouble(factory.getQualityScore())));
        }

        int total = factory.getTotalOrders() != null ? factory.getTotalOrders() : 0;
        int overdue = factory.getOverdueOrders() != null ? factory.getOverdueOrders() : 0;
        if (total > 0) {
            double overdueRate = (overdue / (double) total) * 100;
            if (overdueRate > 30) {
                risks.add(String.format("逾期率%.1f%%", overdueRate));
            }
        }

        return risks.isEmpty() ? "需关注" : String.join("，", risks);
    }

    private String truncateName(String name, int maxLen) {
        if (name == null) return "-";
        return name.length() > maxLen ? name.substring(0, maxLen) + "…" : name;
    }

    private double toDouble(BigDecimal val) {
        return val != null ? val.setScale(1, RoundingMode.HALF_UP).doubleValue() : 0.0;
    }

    @Data
    @lombok.AllArgsConstructor
    private static class ScoredFactory {
        private Factory factory;
        private double score;
    }
}
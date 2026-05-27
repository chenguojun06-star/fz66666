package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
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
              .last("LIMIT " + MAX_FACTORIES_IN_PROMPT);
            List<Factory> factories = factoryMapper.selectList(qw);
            if (factories.isEmpty()) return "";

            StringBuilder sb = new StringBuilder("【工厂画像（基于近3个月订单数据自动评分）】\n");
            sb.append(String.format("%-12s %5s %7s %7s %6s %5s %5s\n",
                    "工厂名称", "评级", "综合分", "准时率", "质量分", "订单", "日产能"));
            for (Factory f : factories) {
                sb.append(String.format("%-12s %4s %6.1f %6.1f%% %5.1f%% %4d %5d\n",
                        truncateName(f.getFactoryName(), 10),
                        f.getSupplierTier() != null ? f.getSupplierTier() : "-",
                        toDouble(f.getOverallScore()),
                        toDouble(f.getOnTimeDeliveryRate()),
                        toDouble(f.getQualityScore()),
                        f.getTotalOrders() != null ? f.getTotalOrders() : 0,
                        f.getDailyCapacity() != null ? f.getDailyCapacity() : 0));
            }

            List<Factory> poorFactories = factories.stream()
                    .filter(f -> "C".equals(f.getSupplierTier()) || "D".equals(f.getSupplierTier()))
                    .collect(Collectors.toList());
            if (!poorFactories.isEmpty()) {
                sb.append("\n⚠ 低评分工厂预警：");
                sb.append(poorFactories.stream()
                        .map(f -> truncateName(f.getFactoryName(), 8) + "(" + f.getSupplierTier() + "级)")
                        .collect(Collectors.joining("、")));
                sb.append("\n");
            }

            long sACount = factories.stream()
                    .filter(f -> "S".equals(f.getSupplierTier()) || "A".equals(f.getSupplierTier()))
                    .count();
            if (sACount > 0) {
                sb.append("优质工厂S/A级共").append(sACount).append("家，可优先推荐。\n");
            }

            sb.append("（以上为工厂自动学习画像，评分越高代表交期越准时、质量越好）\n");
            return sb.toString();
        } catch (Exception e) {
            log.debug("[FactoryProfile] 工厂画像构建跳过: {}", e.getMessage());
            return "";
        }
    }

    private String truncateName(String name, int maxLen) {
        if (name == null) return "-";
        return name.length() > maxLen ? name.substring(0, maxLen) + "…" : name;
    }

    private double toDouble(BigDecimal val) {
        return val != null ? val.setScale(1, RoundingMode.HALF_UP).doubleValue() : 0.0;
    }
}
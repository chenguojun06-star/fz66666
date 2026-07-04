package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.EcGiftRule;
import com.fashion.supplychain.integration.ecommerce.mapper.EcGiftRuleMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 电商赠品规则服务（Phase 2 订单深加工）
 *
 * 支持三种触发类型：
 *   AMOUNT   按订单金额（≥阈值赠送）
 *   QUANTITY 按订单数量（≥阈值赠送）
 *   PLATFORM 按平台（指定平台所有订单赠送）
 */
@Slf4j
@Service
public class EcGiftRuleService extends ServiceImpl<EcGiftRuleMapper, EcGiftRule> {

    /** 查询启用的赠品规则 */
    public List<EcGiftRule> listEnabled(Long tenantId) {
        return list(new LambdaQueryWrapper<EcGiftRule>()
                .eq(EcGiftRule::getTenantId, tenantId)
                .eq(EcGiftRule::getEnabled, 1)
                .eq(EcGiftRule::getDeleteFlag, 0)
                .orderByAsc(EcGiftRule::getCreateTime));
    }

    /** 查询全部规则（含禁用） */
    public List<EcGiftRule> listByTenant(Long tenantId) {
        return list(new LambdaQueryWrapper<EcGiftRule>()
                .eq(EcGiftRule::getTenantId, tenantId)
                .eq(EcGiftRule::getDeleteFlag, 0)
                .orderByDesc(EcGiftRule::getCreateTime));
    }

    /**
     * 匹配赠品：根据订单金额/数量/平台返回命中的赠品规则
     * 同一触发类型多个规则命中时全部返回（用户可选择赠送）
     */
    public List<GiftMatch> matchGifts(Long tenantId, BigDecimal orderAmount,
                                       Integer orderQuantity, String platformCode) {
        List<EcGiftRule> rules = listEnabled(tenantId);
        List<GiftMatch> matched = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();

        for (EcGiftRule rule : rules) {
            // 时间窗口校验
            if (rule.getStartTime() != null && now.isBefore(rule.getStartTime())) continue;
            if (rule.getEndTime() != null && now.isAfter(rule.getEndTime())) continue;

            boolean hit = false;
            String reason = "";
            switch (rule.getTriggerType()) {
                case "AMOUNT":
                    if (orderAmount != null && rule.getTriggerValue() != null
                            && orderAmount.compareTo(rule.getTriggerValue()) >= 0) {
                        hit = true;
                        reason = String.format("订单金额%.2f≥%.2f", orderAmount, rule.getTriggerValue());
                    }
                    break;
                case "QUANTITY":
                    if (orderQuantity != null && rule.getTriggerValue() != null
                            && orderQuantity >= rule.getTriggerValue().intValue()) {
                        hit = true;
                        reason = String.format("订单数量%d≥%d", orderQuantity, rule.getTriggerValue().intValue());
                    }
                    break;
                case "PLATFORM":
                    if (platformCode != null && platformCode.equals(rule.getTriggerPlatform())) {
                        hit = true;
                        reason = "平台=" + platformCode;
                    }
                    break;
                default:
                    log.warn("[EcGiftRule] 未知触发类型: {}", rule.getTriggerType());
            }
            if (hit) {
                matched.add(new GiftMatch(rule.getId(), rule.getRuleName(), rule.getGiftSkuCode(),
                        rule.getGiftQuantity(), rule.getTriggerType(), reason));
            }
        }
        return matched;
    }

    /** 软删除 */
    public void softDelete(Long tenantId, Long ruleId) {
        EcGiftRule rule = getOne(new LambdaQueryWrapper<EcGiftRule>()
                .eq(EcGiftRule::getId, ruleId)
                .eq(EcGiftRule::getTenantId, tenantId));
        if (rule == null) throw new IllegalArgumentException("规则不存在或无权操作");
        rule.setDeleteFlag(1);
        updateById(rule);
    }

    /** 命中的赠品 */
    public record GiftMatch(Long ruleId, String ruleName, String giftSkuCode,
                             Integer giftQuantity, String triggerType, String reason) {}
}

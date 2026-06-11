package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.integration.ecommerce.entity.EcPurchaseSuggestion;
import com.fashion.supplychain.integration.ecommerce.mapper.EcPurchaseSuggestionMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
public class EcPurchaseSuggestionService extends ServiceImpl<EcPurchaseSuggestionMapper, EcPurchaseSuggestion> {

    public List<EcPurchaseSuggestion> listPending(Long tenantId) {
        return list(new LambdaQueryWrapper<EcPurchaseSuggestion>()
                .eq(EcPurchaseSuggestion::getTenantId, tenantId)
                .eq(EcPurchaseSuggestion::getStatus, 0)
                .orderByDesc(EcPurchaseSuggestion::getUrgencyLevel)
                .orderByDesc(EcPurchaseSuggestion::getCreateTime));
    }

    public List<EcPurchaseSuggestion> listByTenant(Long tenantId) {
        return list(new LambdaQueryWrapper<EcPurchaseSuggestion>()
                .eq(EcPurchaseSuggestion::getTenantId, tenantId)
                .orderByDesc(EcPurchaseSuggestion::getCreateTime));
    }
}

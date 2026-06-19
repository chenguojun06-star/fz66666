package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.intelligence.entity.TenantAiConfig;
import com.fashion.supplychain.intelligence.mapper.TenantAiConfigMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@Lazy
public class TenantAiConfigOrchestrator {

    @Autowired
    private TenantAiConfigMapper tenantAiConfigMapper;

    @Transactional
    public void updateById(TenantAiConfig config) {
        tenantAiConfigMapper.updateById(config);
    }
}

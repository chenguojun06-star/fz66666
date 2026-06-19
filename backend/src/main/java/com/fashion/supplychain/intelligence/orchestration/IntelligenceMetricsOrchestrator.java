package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.IntelligenceMetrics;
import com.fashion.supplychain.intelligence.mapper.IntelligenceMetricsMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@Lazy
public class IntelligenceMetricsOrchestrator {

    @Autowired
    private IntelligenceMetricsMapper intelligenceMetricsMapper;

    @Transactional
    public void update(IntelligenceMetrics entity, QueryWrapper<IntelligenceMetrics> wrapper) {
        intelligenceMetricsMapper.update(entity, wrapper);
    }
}

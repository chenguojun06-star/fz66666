package com.fashion.supplychain.integration.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.integration.record.entity.IntegrationChannelConfig;
import com.fashion.supplychain.integration.record.mapper.IntegrationChannelConfigMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@Lazy
public class ChannelConfigOrchestrator {

    @Autowired
    private IntegrationChannelConfigMapper channelConfigMapper;

    @Transactional
    public void insert(IntegrationChannelConfig config) {
        channelConfigMapper.insert(config);
    }

    @Transactional
    public void updateById(IntegrationChannelConfig config) {
        channelConfigMapper.updateById(config);
    }

    public IntegrationChannelConfig selectOne(LambdaQueryWrapper<IntegrationChannelConfig> wrapper) {
        return channelConfigMapper.selectOne(wrapper);
    }

    public List<IntegrationChannelConfig> selectList(LambdaQueryWrapper<IntegrationChannelConfig> wrapper) {
        return channelConfigMapper.selectList(wrapper);
    }
}

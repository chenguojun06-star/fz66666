package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.mapper.KnowledgeBaseMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@Lazy
public class KnowledgeBaseOrchestrator {

    @Autowired
    private KnowledgeBaseMapper knowledgeBaseMapper;

    @Transactional
    public void insert(KnowledgeBase kb) {
        knowledgeBaseMapper.insert(kb);
    }

    public Long selectCount(LambdaQueryWrapper<KnowledgeBase> wrapper) {
        return knowledgeBaseMapper.selectCount(wrapper);
    }
}

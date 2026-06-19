package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@Lazy
public class AuditLogOrchestrator {

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    @Transactional(rollbackFor = Exception.class)
    public void insert(IntelligenceAuditLog auditLog) {
        auditLogMapper.insert(auditLog);
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateById(IntelligenceAuditLog auditLog) {
        auditLogMapper.updateById(auditLog);
    }

    public IntelligenceAuditLog selectOne(QueryWrapper<IntelligenceAuditLog> wrapper) {
        return auditLogMapper.selectOne(wrapper);
    }

    public List<IntelligenceAuditLog> selectList(QueryWrapper<IntelligenceAuditLog> wrapper) {
        return auditLogMapper.selectList(wrapper);
    }
}

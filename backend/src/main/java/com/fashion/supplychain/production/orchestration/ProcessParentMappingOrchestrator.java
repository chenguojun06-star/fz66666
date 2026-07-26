package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProcessParentMapping;
import com.fashion.supplychain.production.mapper.ProcessParentMappingMapper;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
public class ProcessParentMappingOrchestrator {

    @Autowired
    private ProcessParentMappingMapper mappingMapper;

    @Autowired
    private ProcessParentMappingService mappingService;

    @Transactional(rollbackFor = Exception.class)
    public ProcessParentMapping create(ProcessParentMapping mapping) {
        if (mapping.getProcessKeyword() == null || mapping.getProcessKeyword().trim().isEmpty()) {
            throw new BusinessException("processKeyword 不能为空");
        }
        if (mapping.getParentNode() == null || mapping.getParentNode().trim().isEmpty()) {
            throw new BusinessException("parentNode 不能为空");
        }
        mapping.setProcessKeyword(mapping.getProcessKeyword().trim());
        mapping.setParentNode(mapping.getParentNode().trim());

        UserContext ctx = UserContext.get();
        if (ctx == null) {
            throw new BusinessException("用户未登录");
        }
        // P0铁律4：禁止 SuperAdmin 创建 tenantId=null 的全局映射，强制绑定当前租户
        Long currentTenantId = com.fashion.supplychain.common.tenant.TenantAssert.requireTenantId();
        mapping.setTenantId(currentTenantId);
        if (mapping.getCreateTime() == null) {
            mapping.setCreateTime(LocalDateTime.now());
        }

        mappingMapper.insert(mapping);
        mappingService.reload(currentTenantId);
        log.info("[ProcessMapping] 已新增映射 id={} keyword={} parentNode={}",
                mapping.getId(), mapping.getProcessKeyword(), mapping.getParentNode());
        return mapping;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        ProcessParentMapping existing = mappingMapper.selectById(id);
        if (existing == null) {
            throw new BusinessException("映射不存在");
        }
        // P0铁律4：移除 SuperAdmin 绕过租户校验的逻辑，所有用户均需校验同租户
        UserContext ctx = UserContext.get();
        if (ctx == null) {
            throw new BusinessException("用户未登录");
        }
        Long currentTenantId = com.fashion.supplychain.common.tenant.TenantAssert.requireTenantId();
        if (!Objects.equals(existing.getTenantId(), currentTenantId)) {
            throw new BusinessException("无权删除其他租户的映射");
        }
        mappingMapper.deleteById(id);
        mappingService.reload(existing.getTenantId());
        log.info("[ProcessMapping] 已删除映射 id={}", id);
    }
}

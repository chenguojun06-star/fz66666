package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.AgentContextFile;
import com.fashion.supplychain.intelligence.mapper.AgentContextFileMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AgentContextFileService {

    private final AgentContextFileMapper contextFileMapper;

    public String buildSystemContext(Long tenantId) {
        QueryWrapper<AgentContextFile> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
                .eq("is_active", 1)
                .orderByDesc("priority");
        List<AgentContextFile> files = contextFileMapper.selectList(qw);

        if (files.isEmpty()) {
            QueryWrapper<AgentContextFile> defaultQw = new QueryWrapper<>();
            defaultQw.eq("tenant_id", 0L).eq("is_active", 1).orderByDesc("priority");
            files = contextFileMapper.selectList(defaultQw);
        }

        if (files.isEmpty()) return "";

        return files.stream()
                .sorted(Comparator.comparingInt(f -> f.getPriority() != null ? -f.getPriority() : 0))
                .map(f -> "## " + f.getFileName() + "\n" + f.getContent())
                .collect(Collectors.joining("\n\n---\n\n"));
    }

    public void createOrUpdate(Long tenantId, String fileName, String content, Integer priority, String scope) {
        QueryWrapper<AgentContextFile> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).eq("file_name", fileName);
        AgentContextFile existing = contextFileMapper.selectOne(qw);

        if (existing != null) {
            existing.setContent(content);
            if (priority != null) existing.setPriority(priority);
            if (scope != null) existing.setScope(scope);
            existing.setUpdateTime(LocalDateTime.now());
            contextFileMapper.updateById(existing);
            log.info("[ContextFile] 更新上下文文件: {} (tenant={})", fileName, tenantId);
        } else {
            AgentContextFile file = new AgentContextFile();
            file.setId("acf_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20));
            file.setTenantId(tenantId);
            file.setFileName(fileName);
            file.setContent(content);
            file.setIsActive(1);
            file.setPriority(priority != null ? priority : 0);
            file.setScope(scope != null ? scope : "tenant");
            file.setCreateTime(LocalDateTime.now());
            file.setUpdateTime(LocalDateTime.now());
            contextFileMapper.insert(file);
            log.info("[ContextFile] 新建上下文文件: {} (tenant={})", fileName, tenantId);
        }
    }

    public List<AgentContextFile> listByTenant(Long tenantId) {
        QueryWrapper<AgentContextFile> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId).orderByDesc("priority");
        return contextFileMapper.selectList(qw);
    }

    public void toggleActive(String fileId, boolean active) {
        AgentContextFile file = contextFileMapper.selectById(fileId);
        if (file != null) {
            file.setIsActive(active ? 1 : 0);
            file.setUpdateTime(LocalDateTime.now());
            contextFileMapper.updateById(file);
        }
    }

    public void deleteFile(String fileId) {
        contextFileMapper.deleteById(fileId);
    }
}

package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.AgentContextFile;
import com.fashion.supplychain.intelligence.mapper.AgentContextFileMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AgentContextFileLoaderService {

    private final AgentContextFileMapper contextFileMapper;

    public String loadActiveContextFiles(Long tenantId) {
        QueryWrapper<AgentContextFile> qw = new QueryWrapper<>();
        qw.eq("is_active", 1)
                .and(w -> w.eq("tenant_id", 0).or().eq("tenant_id", tenantId))
                .orderByDesc("priority");
        List<AgentContextFile> files = contextFileMapper.selectList(qw);

        if (files.isEmpty()) {
            return loadDefaultContext();
        }

        List<AgentContextFile> sorted = files.stream()
                .sorted(Comparator.comparingInt(f -> f.getPriority() != null ? f.getPriority() : 0))
                .collect(Collectors.toList());

        StringBuilder sb = new StringBuilder();
        sb.append("[系统上下文文件]\n");
        for (AgentContextFile f : sorted) {
            sb.append("--- ").append(f.getFileName()).append(" ---\n");
            sb.append(f.getContent()).append("\n\n");
        }
        return sb.toString();
    }

    private String loadDefaultContext() {
        return """
                [系统默认上下文]
                你是小云，一个服装供应链智能AI助手。
                
                核心使命:
                1. 帮助用户高效管理生产订单、追踪工序进度、发现异常
                2. 提供数据驱动的经营建议和风险预警
                3. 记住用户偏好和习惯，提供个性化服务
                
                核心原则:
                - 数据隔离: 每个租户的数据完全隔离
                - 权限遵守: 严格遵循角色权限
                - 主动服务: 发现异常主动提醒
                - 可追溯: 建议追溯到数据来源
                """;
    }

    public String loadForPrompt(Long tenantId) {
        String context = loadActiveContextFiles(tenantId);
        if (context.length() > 3000) {
            context = context.substring(0, 3000) + "\n[...上下文截断]";
        }
        return context;
    }
}

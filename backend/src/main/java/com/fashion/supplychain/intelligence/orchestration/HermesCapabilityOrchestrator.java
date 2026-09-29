package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AgentContextFile;
import com.fashion.supplychain.intelligence.entity.CronJob;
import com.fashion.supplychain.intelligence.service.AgentContextFileService;
import com.fashion.supplychain.intelligence.service.CronSchedulerService;
import com.fashion.supplychain.intelligence.service.SessionSearchService;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Hermes 能力编排器（定时任务 / 会话检索 / 上下文文件）。
 *
 * <p>原逻辑位于 {@code HermesCapabilityController}（D-636 下沉）。该 Controller 同时注入了
 * {@code CronSchedulerService}、{@code SessionSearchService}、{@code AgentContextFileService}
 * 三个 Service，属「Controller 直接依赖多个 Service」，违反分层约定，故把取数与编排
 * 上移到本类。Controller 只保留端点声明与响应组装。
 *
 * <p>租户/用户上下文在编排层内部读取（{@link UserContext}），调用方无需透传。
 */
@Service
@Slf4j
public class HermesCapabilityOrchestrator {

    @Autowired
    private CronSchedulerService cronSchedulerService;

    @Autowired
    private SessionSearchService sessionSearchService;

    @Autowired
    private AgentContextFileService agentContextFileService;

    // ===== 定时任务 =====

    public List<CronJob> listCronJobs() {
        return cronSchedulerService.listByTenant(UserContext.tenantId());
    }

    public void createCronJob(String naturalLanguage, String cronExpression, String taskType) {
        cronSchedulerService.createJobFromNaturalLanguage(
                UserContext.tenantId(),
                naturalLanguage,
                cronExpression,
                taskType,
                UserContext.userId());
    }

    // ===== 会话检索 =====

    public List<Map<String, Object>> searchConversations(String query, int maxResults) {
        return sessionSearchService.search(
                UserContext.tenantId(),
                UserContext.userId(),
                query,
                maxResults);
    }

    // ===== 上下文文件 =====

    public List<AgentContextFile> listContextFiles() {
        return agentContextFileService.listByTenant(UserContext.tenantId());
    }

    public void saveContextFile(String fileName, String content, Integer priority, String scope) {
        agentContextFileService.createOrUpdate(
                UserContext.tenantId(),
                fileName,
                content,
                priority,
                scope);
    }

    public void toggleContextFile(String fileId, boolean active) {
        agentContextFileService.toggleActive(fileId, active);
    }

    public void deleteContextFile(String fileId) {
        agentContextFileService.deleteFile(fileId);
    }
}

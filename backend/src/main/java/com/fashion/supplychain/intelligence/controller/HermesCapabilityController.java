package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AgentContextFile;
import com.fashion.supplychain.intelligence.entity.CronJob;
import com.fashion.supplychain.intelligence.entity.SkillTemplate;
import com.fashion.supplychain.intelligence.orchestration.SkillEvolutionOrchestrator;
import com.fashion.supplychain.intelligence.service.AgentContextFileService;
import com.fashion.supplychain.intelligence.service.CronSchedulerService;
import com.fashion.supplychain.intelligence.service.SessionSearchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/hermes")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class HermesCapabilityController {

    private final SkillEvolutionOrchestrator skillEvolutionOrchestrator;
    private final CronSchedulerService cronSchedulerService;
    private final SessionSearchService sessionSearchService;
    private final AgentContextFileService agentContextFileService;

    @GetMapping("/skills")
    public Result<List<SkillTemplate>> listSkills() {
        Long tenantId = UserContext.tenantId();
        return Result.success(skillEvolutionOrchestrator.loadActiveSkills(tenantId));
    }

    @PostMapping("/skills/{skillId}/record")
    public Result<String> recordSkillExecution(@PathVariable String skillId,
                                                @RequestParam(defaultValue = "true") boolean success,
                                                @RequestParam(required = false) BigDecimal rating) {
        skillEvolutionOrchestrator.recordSkillExecution(skillId, success, rating);
        return Result.success("ok");
    }

    @GetMapping("/cron-jobs")
    public Result<List<CronJob>> listCronJobs() {
        Long tenantId = UserContext.tenantId();
        return Result.success(cronSchedulerService.listByTenant(tenantId));
    }

    @PostMapping("/cron-jobs")
    public Result<String> createCronJob(@RequestBody Map<String, String> body) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        cronSchedulerService.createJobFromNaturalLanguage(
                tenantId,
                body.get("naturalLanguage"),
                body.get("cronExpression"),
                body.get("taskType"),
                userId);
        return Result.success("ok");
    }

    @PostMapping("/search")
    public Result<List<Map<String, Object>>> searchConversations(@RequestBody Map<String, Object> body) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String query = (String) body.getOrDefault("query", "");
        int maxResults = body.containsKey("maxResults") ? ((Number) body.get("maxResults")).intValue() : 20;
        return Result.success(sessionSearchService.search(tenantId, userId, query, maxResults));
    }

    @GetMapping("/context-files")
    public Result<List<AgentContextFile>> listContextFiles() {
        Long tenantId = UserContext.tenantId();
        return Result.success(agentContextFileService.listByTenant(tenantId));
    }

    @PostMapping("/context-files")
    public Result<String> saveContextFile(@RequestBody Map<String, Object> body) {
        Long tenantId = UserContext.tenantId();
        agentContextFileService.createOrUpdate(
                tenantId,
                (String) body.get("fileName"),
                (String) body.get("content"),
                body.containsKey("priority") ? ((Number) body.get("priority")).intValue() : null,
                (String) body.get("scope"));
        return Result.success("ok");
    }

    @PutMapping("/context-files/{fileId}/toggle")
    public Result<String> toggleContextFile(@PathVariable String fileId,
                                             @RequestParam(defaultValue = "true") boolean active) {
        agentContextFileService.toggleActive(fileId, active);
        return Result.success("ok");
    }

    @DeleteMapping("/context-files/{fileId}")
    public Result<String> deleteContextFile(@PathVariable String fileId) {
        agentContextFileService.deleteFile(fileId);
        return Result.success("ok");
    }
}

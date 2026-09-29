package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AgentContextFile;
import com.fashion.supplychain.intelligence.entity.CronJob;
import com.fashion.supplychain.intelligence.entity.SkillTemplate;
import com.fashion.supplychain.intelligence.orchestration.HermesCapabilityOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.SkillEvolutionOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Hermes 能力接口（技能 / 定时任务 / 会话检索 / 上下文文件）。
 *
 * <p>D-636：原先本类直接注入了 CronSchedulerService、SessionSearchService、
 * AgentContextFileService 三个 Service，属「Controller 依赖多个 Service」的越层编排。
 * 取数逻辑已下沉到 {@link HermesCapabilityOrchestrator}；本类只保留
 * 「端点声明 + 请求参数解析 + 响应组装」。
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence/hermes")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class HermesCapabilityController {

    private final SkillEvolutionOrchestrator skillEvolutionOrchestrator;
    private final HermesCapabilityOrchestrator hermesCapabilityOrchestrator;

    @GetMapping("/skills")
    public Result<List<SkillTemplate>> listSkills() {
        return Result.success(skillEvolutionOrchestrator.loadActiveSkills(UserContext.tenantId()));
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
        return Result.success(hermesCapabilityOrchestrator.listCronJobs());
    }

    @PostMapping("/cron-jobs")
    public Result<String> createCronJob(@RequestBody Map<String, String> body) {
        hermesCapabilityOrchestrator.createCronJob(
                body.get("naturalLanguage"),
                body.get("cronExpression"),
                body.get("taskType"));
        return Result.success("ok");
    }

    @PostMapping("/search")
    public Result<List<Map<String, Object>>> searchConversations(@RequestBody Map<String, Object> body) {
        String query = (String) body.getOrDefault("query", "");
        int maxResults = body.containsKey("maxResults") ? ((Number) body.get("maxResults")).intValue() : 20;
        return Result.success(hermesCapabilityOrchestrator.searchConversations(query, maxResults));
    }

    @GetMapping("/context-files")
    public Result<List<AgentContextFile>> listContextFiles() {
        return Result.success(hermesCapabilityOrchestrator.listContextFiles());
    }

    @PostMapping("/context-files")
    public Result<String> saveContextFile(@RequestBody Map<String, Object> body) {
        hermesCapabilityOrchestrator.saveContextFile(
                (String) body.get("fileName"),
                (String) body.get("content"),
                body.containsKey("priority") ? ((Number) body.get("priority")).intValue() : null,
                (String) body.get("scope"));
        return Result.success("ok");
    }

    @PutMapping("/context-files/{fileId}/toggle")
    public Result<String> toggleContextFile(@PathVariable String fileId,
                                             @RequestParam(defaultValue = "true") boolean active) {
        hermesCapabilityOrchestrator.toggleContextFile(fileId, active);
        return Result.success("ok");
    }

    @DeleteMapping("/context-files/{fileId}")
    public Result<String> deleteContextFile(@PathVariable String fileId) {
        hermesCapabilityOrchestrator.deleteContextFile(fileId);
        return Result.success("ok");
    }
}

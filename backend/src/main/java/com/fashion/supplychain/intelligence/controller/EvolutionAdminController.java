package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.service.PromptEvolutionService;
import com.fashion.supplychain.intelligence.service.SelfEvolutionEngine;
import com.fashion.supplychain.intelligence.service.SelfEvolutionEngine.EvolutionProposal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/intelligence/evolution")
@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
public class EvolutionAdminController {

    @Autowired
    private SelfEvolutionEngine evolutionEngine;
    @Autowired
    private PromptEvolutionService promptEvolutionService;

    @GetMapping("/pending")
    public Result<List<Map<String, Object>>> pendingProposals() {
        return Result.success(promptEvolutionService.getPendingProposals());
    }

    @GetMapping("/history")
    public Result<List<Map<String, Object>>> evolutionHistory(
            @RequestParam(defaultValue = "30") int days) {
        return Result.success(promptEvolutionService.getEvolutionHistory(days));
    }

    @GetMapping("/active-overrides")
    public Result<Map<String, String>> activeOverrides() {
        return Result.success(promptEvolutionService.getAllActiveOverrides());
    }

    @PostMapping("/approve/{proposalId}")
    public Result<Boolean> approveProposal(@PathVariable String proposalId) {
        return Result.success(promptEvolutionService.approveProposal(proposalId));
    }

    @PostMapping("/rollback/{proposalId}")
    public Result<Boolean> rollbackProposal(@PathVariable String proposalId) {
        return Result.success(promptEvolutionService.rollbackProposal(proposalId));
    }

    @PostMapping("/test/{proposalId}")
    public Result<SelfEvolutionEngine.EvolutionResult> testProposal(@PathVariable String proposalId) {
        List<Map<String, Object>> pending = promptEvolutionService.getPendingProposals();
        EvolutionProposal proposal = pending.stream()
                .filter(r -> proposalId.equals(String.valueOf(r.get("id"))))
                .findFirst()
                .map(r -> new EvolutionProposal(
                        String.valueOf(r.get("id")),
                        String.valueOf(r.get("category")),
                        String.valueOf(r.get("description")),
                        String.valueOf(r.get("before_state")),
                        String.valueOf(r.get("after_state")),
                        Double.parseDouble(String.valueOf(r.getOrDefault("confidence", 0))),
                        String.valueOf(r.getOrDefault("source", "")),
                        null
                ))
                .orElse(null);
        if (proposal == null) {
            return Result.fail("提案不存在或已处理");
        }
        return Result.success(evolutionEngine.testProposal(proposal));
    }

    @PostMapping("/deploy/{proposalId}")
    public Result<Boolean> deployProposal(@PathVariable String proposalId) {
        List<Map<String, Object>> pending = promptEvolutionService.getPendingProposals();
        EvolutionProposal proposal = pending.stream()
                .filter(r -> proposalId.equals(String.valueOf(r.get("id"))))
                .findFirst()
                .map(r -> new EvolutionProposal(
                        String.valueOf(r.get("id")),
                        String.valueOf(r.get("category")),
                        String.valueOf(r.get("description")),
                        String.valueOf(r.get("before_state")),
                        String.valueOf(r.get("after_state")),
                        Double.parseDouble(String.valueOf(r.getOrDefault("confidence", 0))),
                        String.valueOf(r.getOrDefault("source", "")),
                        null
                ))
                .orElse(null);
        if (proposal == null) {
            return Result.fail("提案不存在或未通过测试");
        }
        return Result.success(evolutionEngine.deployProposal(proposal));
    }
}

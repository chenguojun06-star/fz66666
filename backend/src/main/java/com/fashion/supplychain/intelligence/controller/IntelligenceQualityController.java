package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.intelligence.orchestration.IntelligenceQualityOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * P1/P2升级: AI质量评估 & 安全规则管理 API
 *
 * <p>本类只做「参数校验 + 调 Orchestrator + 组装响应」。业务编排在
 * {@link IntelligenceQualityOrchestrator}，原先直接注入的两个 Service 已下沉
 * （D-630 规则6：Controller 不得直接依赖多个 Service）。
 */
@RestController
@RequestMapping("/api/intelligence")
@Slf4j
public class IntelligenceQualityController {

    @Autowired
    private IntelligenceQualityOrchestrator intelligenceQualityOrchestrator;

    /** P1: 运行Golden Test Dataset回归测试 */
    @PostMapping("/golden-eval")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public ResponseEntity<String> runGoldenEval() {
        if (!intelligenceQualityOrchestrator.isGoldenEvalAvailable()) {
            return ResponseEntity.ok("{\"status\":\"unavailable\",\"reason\":\"GoldenEvalService未初始化\"}");
        }
        return ResponseEntity.ok(intelligenceQualityOrchestrator.runGoldenEval());
    }

    /** P2: 查看安全规则配置 */
    @GetMapping("/guardrails")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> getGuardrails() {
        if (!intelligenceQualityOrchestrator.isGuardrailsAvailable()) {
            return ResponseEntity.ok(Map.of("status", "unavailable"));
        }
        return ResponseEntity.ok(intelligenceQualityOrchestrator.getGuardrails());
    }

    /** P2: 热更新安全规则 */
    @PostMapping("/guardrails/reload")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public ResponseEntity<Map<String, String>> reloadGuardrails() {
        if (!intelligenceQualityOrchestrator.isGuardrailsAvailable()) {
            return ResponseEntity.ok(Map.of("status", "unavailable"));
        }
        intelligenceQualityOrchestrator.reloadGuardrails();
        return ResponseEntity.ok(Map.of("status", "ok", "message", "安全规则已重新加载"));
    }
}

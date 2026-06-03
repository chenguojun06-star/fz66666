package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.intelligence.service.GoldenEvalService;
import com.fashion.supplychain.intelligence.service.GuardrailsConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * P1/P2升级: AI质量评估 & 安全规则管理 API
 */
@RestController
@RequestMapping("/api/intelligence")
@Slf4j
public class IntelligenceQualityController {

    @Autowired(required = false)
    private GoldenEvalService goldenEvalService;
    @Autowired(required = false)
    private GuardrailsConfigService guardrailsConfigService;

    /** P1: 运行Golden Test Dataset回归测试 */
    @PostMapping("/golden-eval")
    @PreAuthorize("hasRole('ADMIN') or hasAuthority('ai:manage')")
    public ResponseEntity<String> runGoldenEval() {
        if (goldenEvalService == null) {
            return ResponseEntity.ok("{\"status\":\"unavailable\",\"reason\":\"GoldenEvalService未初始化\"}");
        }
        return ResponseEntity.ok(goldenEvalService.runGoldenEval());
    }

    /** P2: 查看安全规则配置 */
    @GetMapping("/guardrails")
    @PreAuthorize("hasRole('ADMIN') or hasAuthority('ai:manage')")
    public ResponseEntity<Map<String, Object>> getGuardrails() {
        if (guardrailsConfigService == null) {
            return ResponseEntity.ok(Map.of("status", "unavailable"));
        }
        return ResponseEntity.ok(guardrailsConfigService.getRules());
    }

    /** P2: 热更新安全规则 */
    @PostMapping("/guardrails/reload")
    @PreAuthorize("hasRole('ADMIN') or hasAuthority('ai:manage')")
    public ResponseEntity<Map<String, String>> reloadGuardrails() {
        if (guardrailsConfigService == null) {
            return ResponseEntity.ok(Map.of("status", "unavailable"));
        }
        guardrailsConfigService.reload();
        return ResponseEntity.ok(Map.of("status", "ok", "message", "安全规则已重新加载"));
    }
}
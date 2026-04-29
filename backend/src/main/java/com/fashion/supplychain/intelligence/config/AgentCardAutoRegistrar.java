package com.fashion.supplychain.intelligence.config;

import com.fashion.supplychain.intelligence.orchestration.AgentCardService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class AgentCardAutoRegistrar {

    private final AgentCardService agentCardService;

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        registerBuiltinAgents();
        log.info("[AgentCard] Built-in agents auto-registered");
    }

    private void registerBuiltinAgents() {
        agentCardService.registerAgent(0L, "xiaoyun-main", "AI小云主控",
                "服装供应链智能助手，负责理解用户意图、调度专家Agent、整合分析结果",
                List.of("intent_analysis", "task_dispatch", "result_synthesis", "natural_language_qa"),
                List.of("text", "voice"),
                List.of("text", "structured_cards", "charts", "step_wizard"),
                "/api/intelligence/chat");

        agentCardService.registerAgent(0L, "specialist-sourcing", "采购专家",
                "面辅料采购分析、供应商评估、价格走势分析",
                List.of("supplier_evaluation", "price_trend", "procurement_planning"),
                List.of("order_no", "material_code"),
                List.of("supplier_scorecard", "price_trend_chart", "procurement_advice"),
                "/api/intelligence/agent/sourcing");

        agentCardService.registerAgent(0L, "specialist-compliance", "合规专家",
                "质检合规分析、质量问题追溯、合格率统计",
                List.of("quality_inspection", "compliance_check", "defect_analysis"),
                List.of("order_no", "scan_type"),
                List.of("quality_report", "compliance_score", "defect_distribution"),
                "/api/intelligence/agent/compliance");

        agentCardService.registerAgent(0L, "specialist-logistics", "物流专家",
                "发货物流分析、交期预测、在途监控",
                List.of("shipment_tracking", "delivery_prediction", "logistics_optimization"),
                List.of("order_no", "factory_id"),
                List.of("shipment_status", "delivery_eta", "logistics_advice"),
                "/api/intelligence/agent/logistics");

        agentCardService.registerAgent(0L, "specialist-production", "生产专家",
                "生产进度分析、工序瓶颈检测、产能评估",
                List.of("production_tracking", "bottleneck_detection", "capacity_analysis"),
                List.of("order_no", "process_name"),
                List.of("production_progress", "bottleneck_report", "capacity_chart"),
                "/api/intelligence/agent/production");

        agentCardService.registerAgent(0L, "specialist-cost", "成本专家",
                "生产成本分析、工序成本对比、异常成本检测",
                List.of("cost_analysis", "cost_comparison", "anomaly_detection"),
                List.of("order_no", "process_name"),
                List.of("cost_breakdown", "cost_trend", "anomaly_alert"),
                "/api/intelligence/agent/cost");

        agentCardService.registerAgent(0L, "specialist-delivery", "交付专家",
                "订单交付分析、逾期风险预警、健康评分",
                List.of("delivery_analysis", "overdue_prediction", "health_scoring"),
                List.of("order_no"),
                List.of("delivery_status", "risk_alert", "health_score"),
                "/api/intelligence/agent/delivery");

        agentCardService.registerAgent(0L, "knowledge-graph", "知识图谱引擎",
                "服装供应链知识图谱构建、关系推理、同义词扩展",
                List.of("entity_search", "relation_reasoning", "synonym_expansion"),
                List.of("entity_name", "relation_type"),
                List.of("entity_info", "reasoning_path", "synonym_list"),
                "/api/intelligence/knowledge-graph");
    }
}

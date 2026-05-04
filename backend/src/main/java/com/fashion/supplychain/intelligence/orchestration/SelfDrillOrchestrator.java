package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.intelligence.mapper.KnowledgeBaseMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Slf4j
public class SelfDrillOrchestrator {

    @Value("${xiaoyun.self-drill.enabled:true}")
    private boolean enabled;

    @Value("${xiaoyun.self-drill.max-scenarios-per-run:3}")
    private int maxScenariosPerRun;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AiInferenceGateway inferenceGateway;

    @Autowired
    private AgentMemoryService agentMemoryService;

    @Autowired
    private KnowledgeBaseMapper knowledgeBaseMapper;

    @Autowired
    private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;

    private static final String DRILL_AGENT_ID = "self_drill";
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final ConcurrentHashMap<Long, LocalDateTime> lastDrillTime = new ConcurrentHashMap<>();

    @Scheduled(cron = "0 30 3 * * *")
    public void runSelfDrill() {
        if (!enabled) return;
        log.info("[SelfDrill] 开始自我推演训练...");
        long startMs = System.currentTimeMillis();
        int totalScenarios = 0;
        int successScenarios = 0;

        try {
            List<Long> activeTenants = getActiveTenants();
            for (Long tenantId : activeTenants) {
                try {
                    int count = drillForTenant(tenantId);
                    totalScenarios += count;
                    successScenarios += count;
                } catch (Exception e) {
                    log.warn("[SelfDrill] 租户{}推演失败: {}", tenantId, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("[SelfDrill] 自我推演异常", e);
        }

        long elapsed = System.currentTimeMillis() - startMs;
        log.info("[SelfDrill] 自我推演完成: {}个租户, {}/{}场景成功, 耗时{}ms",
                lastDrillTime.size(), successScenarios, totalScenarios, elapsed);
    }

    private int drillForTenant(Long tenantId) {
        List<Map<String, Object>> scenarios = generateScenarios(tenantId);
        int success = 0;

        for (Map<String, Object> scenario : scenarios) {
            try {
                String question = (String) scenario.get("question");
                String category = (String) scenario.get("category");
                String dataContext = (String) scenario.get("dataContext");

                UserContext ctx = buildDrillUserContext(tenantId);
                UserContext.set(ctx);

                String drillPrompt = buildDrillPrompt(question, dataContext, category);
                IntelligenceInferenceResult result = inferenceGateway.chat("self-drill", drillPrompt, question);

                if (result.isSuccess() && result.getContent() != null && result.getContent().length() > 50) {
                    persistDrillInsight(tenantId, category, question, result.getContent(), dataContext);
                    success++;
                    log.debug("[SelfDrill] 租户{} 场景[{}]推演成功: {}字符", tenantId, category, result.getContent().length());
                }

                UserContext.clear();
            } catch (Exception e) {
                log.debug("[SelfDrill] 单场景推演失败: {}", e.getMessage());
                UserContext.clear();
            }
        }

        lastDrillTime.put(tenantId, LocalDateTime.now());
        return success;
    }

    List<Map<String, Object>> generateScenarios(Long tenantId) {
        List<Map<String, Object>> scenarios = new ArrayList<>();

        try {
            Map<String, Object> overdueStats = queryOverdueStats(tenantId);
            if (overdueStats != null && !overdueStats.isEmpty()) {
                scenarios.add(Map.of(
                        "question", "当前有哪些逾期订单？分析逾期根因并给出催办建议",
                        "category", "overdue_analysis",
                        "dataContext", formatOverdueContext(overdueStats)
                ));
            }
        } catch (Exception e) {
            log.debug("[SelfDrill] 逾期场景生成跳过: {}", e.getMessage());
        }

        try {
            Map<String, Object> factoryStats = queryFactoryPerformance(tenantId);
            if (factoryStats != null && !factoryStats.isEmpty()) {
                scenarios.add(Map.of(
                        "question", "各工厂近期生产表现如何？哪些工厂需要重点关注？",
                        "category", "factory_performance",
                        "dataContext", formatFactoryContext(factoryStats)
                ));
            }
        } catch (Exception e) {
            log.debug("[SelfDrill] 工厂表现场景生成跳过: {}", e.getMessage());
        }

        try {
            Map<String, Object> materialRisk = queryMaterialRisk(tenantId);
            if (materialRisk != null && !materialRisk.isEmpty()) {
                scenarios.add(Map.of(
                        "question", "当前物料库存有哪些风险？哪些物料可能影响生产？",
                        "category", "material_risk",
                        "dataContext", formatMaterialContext(materialRisk)
                ));
            }
        } catch (Exception e) {
            log.debug("[SelfDrill] 物料风险场景生成跳过: {}", e.getMessage());
        }

        try {
            Map<String, Object> qualityStats = queryQualityStats(tenantId);
            if (qualityStats != null && !qualityStats.isEmpty()) {
                scenarios.add(Map.of(
                        "question", "近期质检情况如何？有哪些次品率偏高的环节？",
                        "category", "quality_analysis",
                        "dataContext", formatQualityContext(qualityStats)
                ));
            }
        } catch (Exception e) {
            log.debug("[SelfDrill] 质检场景生成跳过: {}", e.getMessage());
        }

        try {
            Map<String, Object> deliveryRisk = queryDeliveryRisk(tenantId);
            if (deliveryRisk != null && !deliveryRisk.isEmpty()) {
                scenarios.add(Map.of(
                        "question", "未来7天有哪些交期风险？如何提前应对？",
                        "category", "delivery_risk",
                        "dataContext", formatDeliveryContext(deliveryRisk)
                ));
            }
        } catch (Exception e) {
            log.debug("[SelfDrill] 交期风险场景生成跳过: {}", e.getMessage());
        }

        if (scenarios.size() > maxScenariosPerRun) {
            scenarios = scenarios.subList(0, maxScenariosPerRun);
        }

        return scenarios;
    }

    private String buildDrillPrompt(String question, String dataContext, String category) {
        return "你是小云的自我推演系统，正在后台进行模拟训练以提升业务分析能力。\n" +
                "请基于下方真实数据，给出专业、具体、可操作的分析建议。\n" +
                "要求：\n" +
                "1. 所有数字必须来自下方数据，禁止编造\n" +
                "2. 给出具体行动方案（谁做、做什么、什么时候）\n" +
                "3. 标注置信度（高/中/低）\n" +
                "4. 如果发现数据异常或值得关注的模式，明确指出\n\n" +
                "【场景类型】" + category + "\n" +
                "【当前时间】" + LocalDateTime.now().format(FMT) + "\n" +
                "【业务数据】\n" + dataContext + "\n\n" +
                "【用户问题】" + question;
    }

    private void persistDrillInsight(Long tenantId, String category, String question, String insight, String dataContext) {
        try {
            String title = "[自我推演-" + category + "] " + question;
            String content = "## 自我推演洞察\n\n" +
                    "**场景**: " + question + "\n\n" +
                    "**分析**:\n" + insight + "\n\n" +
                    "**数据依据**: " + (dataContext.length() > 500 ? dataContext.substring(0, 500) + "..." : dataContext) + "\n\n" +
                    "*生成时间: " + LocalDateTime.now().format(FMT) + "*";

            agentMemoryService.setCoreMemory(tenantId, DRILL_AGENT_ID,
                    "drill_" + category + "_" + LocalDate.now(), content);

            intelligenceMemoryOrchestrator.saveCase("self_drill", category, title, content);

            if (insight.length() > 120) {
                try {
                    KnowledgeBase kb = new KnowledgeBase();
                    kb.setTenantId(tenantId);
                    kb.setCategory("faq");
                    kb.setTitle(title);
                    kb.setContent(content);
                    kb.setSource("self_drill");
                    kb.setViewCount(0);
                    kb.setHelpfulCount(0);
                    kb.setDeleteFlag(0);
                    kb.setCreateTime(LocalDateTime.now());
                    kb.setUpdateTime(LocalDateTime.now());
                    knowledgeBaseMapper.insert(kb);
                } catch (Exception kbEx) {
                    log.debug("[SelfDrill] 知识库写入跳过: {}", kbEx.getMessage());
                }
            }

            log.debug("[SelfDrill] 洞察已沉淀: tenantId={}, category={}, insightLen={}",
                    tenantId, category, insight.length());
        } catch (Exception e) {
            log.debug("[SelfDrill] 洞察沉淀失败: {}", e.getMessage());
        }
    }

    private List<Long> getActiveTenants() {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT id FROM t_tenant WHERE status NOT IN ('DISABLED','SUSPENDED') AND delete_flag = 0",
                    Long.class);
        } catch (Exception e) {
            log.warn("[SelfDrill] 查询活跃租户失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private UserContext buildDrillUserContext(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        ctx.setUserId("system_self_drill");
        ctx.setUsername("小云自我推演");
        ctx.setRole("ADMIN");
        ctx.setSuperAdmin(false);
        ctx.setTenantOwner(false);
        ctx.setPermissionRange("all");
        return ctx;
    }

    private Map<String, Object> queryOverdueStats(Long tenantId) {
        try {
            String sql = "SELECT COUNT(*) AS total, " +
                    "SUM(CASE WHEN DATEDIFF(NOW(), planned_end_date) > 7 THEN 1 ELSE 0 END) AS severe_overdue, " +
                    "SUM(CASE WHEN DATEDIFF(NOW(), planned_end_date) BETWEEN 1 AND 7 THEN 1 ELSE 0 END) AS mild_overdue, " +
                    "AVG(DATEDIFF(NOW(), planned_end_date)) AS avg_overdue_days, " +
                    "GROUP_CONCAT(DISTINCT factory_name ORDER BY factory_name SEPARATOR ', ') AS affected_factories " +
                    "FROM t_production_order WHERE tenant_id = ? AND delete_flag = 0 " +
                    "AND status NOT IN ('completed','cancelled','scrapped','archived','closed') " +
                    "AND planned_end_date < NOW() LIMIT 1";
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId);
            return rows.isEmpty() ? Collections.emptyMap() : rows.get(0);
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    private Map<String, Object> queryFactoryPerformance(Long tenantId) {
        try {
            String sql = "SELECT factory_name, COUNT(*) AS order_count, " +
                    "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed, " +
                    "ROUND(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS completion_rate " +
                    "FROM t_production_order WHERE tenant_id = ? AND delete_flag = 0 " +
                    "AND create_time >= DATE_SUB(NOW(), INTERVAL 30 DAY) " +
                    "GROUP BY factory_name ORDER BY order_count DESC LIMIT 10";
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("factories", rows);
            return result;
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    private Map<String, Object> queryMaterialRisk(Long tenantId) {
        try {
            String sql = "SELECT material_name, color, SUM(available_quantity) AS available, " +
                    "SUM(quantity) AS total, " +
                    "ROUND(SUM(available_quantity) * 100.0 / NULLIF(SUM(quantity), 0), 1) AS available_rate " +
                    "FROM t_material_stock WHERE tenant_id = ? AND delete_flag = 0 " +
                    "GROUP BY material_name, color HAVING available_rate < 30 " +
                    "ORDER BY available_rate ASC LIMIT 10";
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("lowStockMaterials", rows);
            return result;
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    private Map<String, Object> queryQualityStats(Long tenantId) {
        try {
            String sql = "SELECT process_name, COUNT(*) AS total_scans, " +
                    "SUM(CASE WHEN result = 'DEFECTIVE' THEN 1 ELSE 0 END) AS defective_count, " +
                    "ROUND(SUM(CASE WHEN result = 'DEFECTIVE' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS defect_rate " +
                    "FROM t_scan_record WHERE tenant_id = ? AND delete_flag = 0 " +
                    "AND create_time >= DATE_SUB(NOW(), INTERVAL 14 DAY) " +
                    "GROUP BY process_name HAVING defective_count > 0 " +
                    "ORDER BY defect_rate DESC LIMIT 10";
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("defectiveProcesses", rows);
            return result;
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    private Map<String, Object> queryDeliveryRisk(Long tenantId) {
        try {
            String sql = "SELECT order_no, style_no, factory_name, planned_end_date, " +
                    "progress_percentage, DATEDIFF(planned_end_date, NOW()) AS days_remaining " +
                    "FROM t_production_order WHERE tenant_id = ? AND delete_flag = 0 " +
                    "AND status NOT IN ('completed','cancelled','scrapped','archived','closed') " +
                    "AND planned_end_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY) " +
                    "AND progress_percentage < 80 " +
                    "ORDER BY days_remaining ASC LIMIT 10";
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("upcomingOrders", rows);
            return result;
        } catch (Exception e) {
            return Collections.emptyMap();
        }
    }

    private String formatOverdueContext(Map<String, Object> stats) {
        return "逾期订单总数: " + stats.getOrDefault("total", 0) +
                ", 严重逾期(>7天): " + stats.getOrDefault("severe_overdue", 0) +
                ", 轻度逾期(1-7天): " + stats.getOrDefault("mild_overdue", 0) +
                ", 平均逾期天数: " + stats.getOrDefault("avg_overdue_days", 0) +
                ", 涉及工厂: " + stats.getOrDefault("affected_factories", "无");
    }

    private String formatFactoryContext(Map<String, Object> stats) {
        Object factories = stats.get("factories");
        if (factories instanceof List<?> list) {
            StringBuilder sb = new StringBuilder("工厂表现(近30天):\n");
            for (Object item : list) {
                if (item instanceof Map<?, ?> m) {
                    sb.append("- ").append(String.valueOf(m.get("factory_name") != null ? m.get("factory_name") : "未知"))
                      .append(": 订单").append(m.get("order_count") != null ? m.get("order_count") : 0)
                      .append("单, 完成").append(m.get("completed") != null ? m.get("completed") : 0)
                      .append("单, 完成率").append(m.get("completion_rate") != null ? m.get("completion_rate") : 0).append("%\n");
                }
            }
            return sb.toString();
        }
        return "无数据";
    }

    private String formatMaterialContext(Map<String, Object> stats) {
        Object materials = stats.get("lowStockMaterials");
        if (materials instanceof List<?> list) {
            StringBuilder sb = new StringBuilder("低库存物料:\n");
            for (Object item : list) {
                if (item instanceof Map<?, ?> m) {
                    sb.append("- ").append(String.valueOf(m.get("material_name") != null ? m.get("material_name") : "未知"))
                      .append("(").append(String.valueOf(m.get("color") != null ? m.get("color") : "")).append(")")
                      .append(": 可用").append(m.get("available") != null ? m.get("available") : 0)
                      .append(", 总量").append(m.get("total") != null ? m.get("total") : 0)
                      .append(", 可用率").append(m.get("available_rate") != null ? m.get("available_rate") : 0).append("%\n");
                }
            }
            return sb.toString();
        }
        return "无数据";
    }

    private String formatQualityContext(Map<String, Object> stats) {
        Object processes = stats.get("defectiveProcesses");
        if (processes instanceof List<?> list) {
            StringBuilder sb = new StringBuilder("次品率偏高工序(近14天):\n");
            for (Object item : list) {
                if (item instanceof Map<?, ?> m) {
                    sb.append("- ").append(String.valueOf(m.get("process_name") != null ? m.get("process_name") : "未知"))
                      .append(": 扫码").append(m.get("total_scans") != null ? m.get("total_scans") : 0)
                      .append("次, 次品").append(m.get("defective_count") != null ? m.get("defective_count") : 0)
                      .append("次, 次品率").append(m.get("defect_rate") != null ? m.get("defect_rate") : 0).append("%\n");
                }
            }
            return sb.toString();
        }
        return "无数据";
    }

    private String formatDeliveryContext(Map<String, Object> stats) {
        Object orders = stats.get("upcomingOrders");
        if (orders instanceof List<?> list) {
            StringBuilder sb = new StringBuilder("7天内交期风险订单:\n");
            for (Object item : list) {
                if (item instanceof Map<?, ?> m) {
                    sb.append("- ").append(String.valueOf(m.get("order_no") != null ? m.get("order_no") : "未知"))
                      .append(" (").append(String.valueOf(m.get("style_no") != null ? m.get("style_no") : "")).append(")")
                      .append(" @ ").append(String.valueOf(m.get("factory_name") != null ? m.get("factory_name") : "未知"))
                      .append(": 交期").append(String.valueOf(m.get("planned_end_date") != null ? m.get("planned_end_date") : ""))
                      .append(", 剩余").append(m.get("days_remaining") != null ? m.get("days_remaining") : 0).append("天")
                      .append(", 进度").append(m.get("progress_percentage") != null ? m.get("progress_percentage") : 0).append("%\n");
                }
            }
            return sb.toString();
        }
        return "无数据";
    }
}

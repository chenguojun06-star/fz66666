package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class AiChatContextOrchestrator {

    private final JdbcTemplate jdbcTemplate;

    public AiChatContextOrchestrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public String buildTenantIntelligenceContext() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null || jdbcTemplate == null) {
            return "";
        }

        StringBuilder sb = new StringBuilder();
        appendBusinessGoals(sb, tenantId);
        appendPainPoints(sb, tenantId);
        appendFeedbackReasons(sb, tenantId);
        appendSolutionPlaybooks(sb, tenantId);
        appendSolutionEffects(sb, tenantId);
        appendFactorySkillMatrix(sb, tenantId);
        appendMindPushEffects(sb, tenantId);
        appendWorkerSkillGrowth(sb, tenantId);
        appendFactoryExceptionCases(sb, tenantId);
        return sb.toString();
    }

    private void appendBusinessGoals(StringBuilder sb, Long tenantId) {
        appendSection(sb, "【租户经营目标】",
                "SELECT goal_year, goal_month, delivery_target_rate, gross_margin_target, cash_recovery_days_target, inventory_turnover_target, worker_efficiency_target " +
                        "FROM t_tenant_business_goal WHERE tenant_id = ? AND enabled = 1 AND delete_flag = 0 " +
                        "ORDER BY goal_year DESC, goal_month DESC LIMIT 2",
                tenantId,
                row -> String.format("- %s：准交率目标%s%%，毛利率目标%s%%，回款天数目标%s天，库存周转%s，人效目标%s",
                        period(row.get("goal_year"), row.get("goal_month")),
                        value(row.get("delivery_target_rate")),
                        value(row.get("gross_margin_target")),
                        value(row.get("cash_recovery_days_target")),
                        value(row.get("inventory_turnover_target")),
                        value(row.get("worker_efficiency_target"))));
    }

    private void appendPainPoints(StringBuilder sb, Long tenantId) {
        appendSection(sb, "【当前高频痛点】",
                "SELECT pain_name, pain_level, trigger_count, affected_order_count, root_reason_summary, current_status " +
                        "FROM t_intelligence_pain_point WHERE tenant_id = ? AND delete_flag = 0 " +
                        "ORDER BY trigger_count DESC, update_time DESC LIMIT 6",
                tenantId,
                row -> String.format("- %s（级别:%s，触发:%s次，影响订单:%s，状态:%s，根因:%s）",
                        value(row.get("pain_name")),
                        value(row.get("pain_level")),
                        value(row.get("trigger_count")),
                        value(row.get("affected_order_count")),
                        value(row.get("current_status")),
                        shortText(row.get("root_reason_summary"), 40)));
    }

    private void appendFeedbackReasons(StringBuilder sb, Long tenantId) {
        appendSection(sb, "【最近反馈原因】",
                "SELECT suggestion_type, accepted, reason_code, reason_text, operator_name " +
                        "FROM t_intelligence_feedback_reason WHERE tenant_id = ? AND delete_flag = 0 " +
                        "ORDER BY id DESC LIMIT 5",
                tenantId,
                row -> String.format("- %s：%s，原因=%s，补充=%s，操作人=%s",
                        value(row.get("suggestion_type")),
                        truth(row.get("accepted"), "接受", "拒绝"),
                        value(row.get("reason_code")),
                        shortText(row.get("reason_text"), 30),
                        value(row.get("operator_name"))));
    }

    private void appendSolutionPlaybooks(StringBuilder sb, Long tenantId) {
        appendSection(sb, "【可引用方案库】",
                "SELECT pain_code, solution_title, owner_role, expected_days, effect_score, source_type " +
                        "FROM t_intelligence_solution_playbook WHERE (tenant_id = ? OR tenant_id = 0) AND enabled = 1 AND delete_flag = 0 " +
                        "ORDER BY tenant_id DESC, effect_score DESC, id DESC LIMIT 5",
                tenantId,
                row -> String.format("- 痛点=%s，方案=%s，责任角色=%s，预计%s天见效，效果分=%s，来源=%s",
                        value(row.get("pain_code")),
                        value(row.get("solution_title")),
                        value(row.get("owner_role")),
                        value(row.get("expected_days")),
                        value(row.get("effect_score")),
                        value(row.get("source_type"))));
    }

    private void appendSolutionEffects(StringBuilder sb, Long tenantId) {
        appendSection(sb, "【方案效果回流】",
                "SELECT pain_code, solution_code, target_type, before_metric, after_metric, improved, evaluation_note " +
                        "FROM t_intelligence_solution_effect WHERE tenant_id = ? AND delete_flag = 0 " +
                        "ORDER BY id DESC LIMIT 5",
                tenantId,
                row -> String.format("- 痛点=%s，方案=%s，对象=%s，前=%s，后=%s，结果=%s，评价=%s",
                        value(row.get("pain_code")),
                        value(row.get("solution_code")),
                        value(row.get("target_type")),
                        value(row.get("before_metric")),
                        value(row.get("after_metric")),
                        truth(row.get("improved"), "已改善", "未改善"),
                        shortText(row.get("evaluation_note"), 30)));
    }

    private void appendFactorySkillMatrix(StringBuilder sb, Long tenantId) {
        appendSection(sb, "【工厂能力画像-高绩效】",
                "SELECT COALESCE(f.factory_name, m.factory_id) AS factory_name, m.category, m.style_type, m.process_code, " +
                        "m.delivery_score, m.quality_score, m.margin_score, m.efficiency_score, m.sample_count " +
                        "FROM t_factory_skill_matrix m LEFT JOIN t_factory f ON f.id = m.factory_id " +
                        "WHERE m.tenant_id = ? AND m.delete_flag = 0 " +
                        "ORDER BY m.delivery_score DESC, m.quality_score DESC, m.efficiency_score DESC LIMIT 3",
                tenantId,
                row -> String.format("- 工厂=%s，品类=%s，款式=%s，工序=%s，交期=%s，质量=%s，毛利=%s，效率=%s，样本=%s",
                        value(row.get("factory_name")),
                        value(row.get("category")),
                        value(row.get("style_type")),
                        value(row.get("process_code")),
                        value(row.get("delivery_score")),
                        value(row.get("quality_score")),
                        value(row.get("margin_score")),
                        value(row.get("efficiency_score")),
                        value(row.get("sample_count"))));
        appendSection(sb, "【工厂能力画像-待提升】",
                "SELECT COALESCE(f.factory_name, m.factory_id) AS factory_name, m.category, m.style_type, m.process_code, " +
                        "m.delivery_score, m.quality_score, m.margin_score, m.efficiency_score, m.sample_count " +
                        "FROM t_factory_skill_matrix m LEFT JOIN t_factory f ON f.id = m.factory_id " +
                        "WHERE m.tenant_id = ? AND m.delete_flag = 0 " +
                        "ORDER BY m.efficiency_score ASC, m.quality_score ASC LIMIT 3",
                tenantId,
                row -> String.format("- 工厂=%s，品类=%s，工序=%s，交期=%s，质量=%s，效率=%s",
                        value(row.get("factory_name")),
                        value(row.get("category")),
                        value(row.get("process_code")),
                        value(row.get("delivery_score")),
                        value(row.get("quality_score")),
                        value(row.get("efficiency_score"))));
    }

    private void appendMindPushEffects(StringBuilder sb, Long tenantId) {
        appendSection(sb, "【推送效果回看】",
                "SELECT result_code, COUNT(*) AS cnt, SUM(CASE WHEN opened = 1 THEN 1 ELSE 0 END) AS opened_cnt, " +
                        "SUM(CASE WHEN handled = 1 THEN 1 ELSE 0 END) AS handled_cnt " +
                        "FROM t_mind_push_effect WHERE tenant_id = ? AND delete_flag = 0 GROUP BY result_code ORDER BY cnt DESC LIMIT 3",
                tenantId,
                row -> String.format("- 结果=%s，条数=%s，打开=%s，处理=%s",
                        value(row.get("result_code")),
                        value(row.get("cnt")),
                        value(row.get("opened_cnt")),
                        value(row.get("handled_cnt"))));
    }

    private void appendWorkerSkillGrowth(StringBuilder sb, Long tenantId) {
        appendSection(sb, "【工人成长画像-高绩效】",
                "SELECT COALESCE(w.worker_name, g.worker_id) AS worker_name, g.process_code, g.current_level, g.speed_score, " +
                        "g.quality_score, g.stability_score, g.training_count, g.growth_trend " +
                        "FROM t_worker_skill_growth g LEFT JOIN t_factory_worker w ON w.id = g.worker_id " +
                        "WHERE g.tenant_id = ? AND g.delete_flag = 0 " +
                        "ORDER BY g.stability_score DESC, g.quality_score DESC, g.speed_score DESC LIMIT 3",
                tenantId,
                row -> String.format("- 工人=%s，工序=%s，等级=%s，速度=%s，质量=%s，稳定=%s，趋势=%s",
                        value(row.get("worker_name")),
                        value(row.get("process_code")),
                        value(row.get("current_level")),
                        value(row.get("speed_score")),
                        value(row.get("quality_score")),
                        value(row.get("stability_score")),
                        value(row.get("growth_trend"))));
        appendSection(sb, "【工人成长画像-待提升】",
                "SELECT COALESCE(w.worker_name, g.worker_id) AS worker_name, g.process_code, g.current_level, g.speed_score, " +
                        "g.quality_score, g.stability_score, g.training_count, g.growth_trend " +
                        "FROM t_worker_skill_growth g LEFT JOIN t_factory_worker w ON w.id = g.worker_id " +
                        "WHERE g.tenant_id = ? AND g.delete_flag = 0 " +
                        "ORDER BY g.stability_score ASC, g.quality_score ASC LIMIT 3",
                tenantId,
                row -> String.format("- 工人=%s，工序=%s，等级=%s，速度=%s，质量=%s，稳定=%s，训练=%s次，趋势=%s",
                        value(row.get("worker_name")),
                        value(row.get("process_code")),
                        value(row.get("current_level")),
                        value(row.get("speed_score")),
                        value(row.get("quality_score")),
                        value(row.get("stability_score")),
                        value(row.get("training_count")),
                        value(row.get("growth_trend"))));
    }

    private void appendFactoryExceptionCases(StringBuilder sb, Long tenantId) {
        appendSection(sb, "【工厂异常案例】",
                "SELECT COALESCE(f.factory_name, c.factory_id) AS factory_name, c.case_type, c.order_no, c.reason_summary, c.action_taken, c.resolved " +
                        "FROM t_factory_exception_case c LEFT JOIN t_factory f ON f.id = c.factory_id " +
                        "WHERE c.tenant_id = ? AND c.delete_flag = 0 ORDER BY c.id DESC LIMIT 5",
                tenantId,
                row -> String.format("- 工厂=%s，异常=%s，订单=%s，原因=%s，措施=%s，状态=%s",
                        value(row.get("factory_name")),
                        value(row.get("case_type")),
                        value(row.get("order_no")),
                        shortText(row.get("reason_summary"), 30),
                        shortText(row.get("action_taken"), 30),
                        truth(row.get("resolved"), "已解决", "未解决")));
    }

    private void appendSection(StringBuilder sb, String title, String sql, Long tenantId, RowFormatter formatter) {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql, tenantId);
            if (rows.isEmpty()) {
                return;
            }
            sb.append(title).append("\n");
            for (Map<String, Object> row : rows) {
                sb.append(formatter.format(row)).append("\n");
            }
            sb.append("\n");
        } catch (Exception e) {
            log.warn("[AiChatContext] {} 构建失败: {}", title, e.getMessage());
        }
    }

    private String value(Object value) {
        return value == null ? "-" : String.valueOf(value);
    }

    private String shortText(Object value, int maxLength) {
        String text = value(value);
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + "...";
    }

    private String truth(Object value, String trueText, String falseText) {
        if (value == null) {
            return "-";
        }
        String text = String.valueOf(value);
        return "1".equals(text) || "true".equalsIgnoreCase(text) ? trueText : falseText;
    }

    private String period(Object year, Object month) {
        String monthText = "0".equals(String.valueOf(month)) ? "全年" : month + "月";
        return value(year) + "年" + monthText;
    }

    @FunctionalInterface
    private interface RowFormatter {
        String format(Map<String, Object> row);
    }
}

package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 质量统计工具（按裁剪菲的质检状态统计）。
 *
 * <h2>D-760 修复：本工具此前查询的列与状态值全部不存在，一调用就报 SQL 错</h2>
 *
 * <p><b>修复前的三处硬伤</b>（已用生产库逐列核实）：
 * <ol>
 *   <li>查 {@code quality_status} —— {@code t_cutting_bundle} <b>没有这一列</b>，真实列是 {@code status}
 *       → {@code ERROR 1054 Unknown column 'quality_status'}</li>
 *   <li>查 {@code order_no} —— 真实列是 {@code production_order_no}</li>
 *   <li>状态值用 {@code REJECTED / REPAIRING / REPAIR_COMPLETED / SCRAPPED} ——
 *       生产数据里<b>一个都不存在</b></li>
 * </ol>
 *
 * <p><b>权威状态取值</b>（与 {@code production.service.impl.ProductWarehousingHelper} 的常量一致）：
 * <pre>
 *   qualified             合格
 *   unqualified           不合格
 *   repaired              返修完成
 *   repaired_waiting_qc   返修待质检（= 返修中）
 *   completed             已完成
 * </pre>
 * 该表<b>没有「报废」状态</b>，因此本工具不再输出报废数/报废率 ——
 * 原先的 {@code scrapRate} 在任何数据下都恒为 0，属于「看似合理但无意义」的指标。
 */
@Slf4j
@Component
@Lazy
@AgentToolDef(name = "tool_quality_statistics", description = "质量统计工具", domain = ToolDomain.WAREHOUSE, timeoutMs = 15000)
@McpToolAnnotation(
        name = "tool_quality_statistics",
        description = "质量统计工具",
        domain = ToolDomain.WAREHOUSE,
        readOnly = true,
        timeoutSeconds = 15,
        requiresConfirmation = false,
        tags = {"质量统计", "不合格率", "返修率", "质量分析", "按工厂统计", "质检状态"}
)
public class QualityStatisticsTool extends AbstractAgentTool {

    /** 裁剪菲质检状态 —— 与 ProductWarehousingHelper 的常量保持一致（勿改字面量） */
    private static final String ST_QUALIFIED = "qualified";
    private static final String ST_UNQUALIFIED = "unqualified";
    private static final String ST_REPAIRED = "repaired";
    private static final String ST_REPAIRED_WAITING_QC = "repaired_waiting_qc";

    /** 订单号列名（不是 order_no） */
    private static final String COL_ORDER_NO = "production_order_no";

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Override
    public String getName() {
        return "tool_quality_statistics";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("enum", List.of("overview", "by_factory", "by_order", "by_reason", "trend"));
        action.put("description", "操作类型：overview=质量总览，by_factory=按工厂统计，"
                + "by_order=按订单统计，by_reason=按质检状态分布，trend=按天趋势");
        properties.put("action", action);

        properties.put("orderNo", stringProp("订单号（by_order时必填）"));
        properties.put("days", intProp("统计天数（默认30）"));

        return buildToolDef(
                "质量统计工具。当用户问'不合格率多少''返修效率''哪个工厂质量最差''各质检状态分布'时调用。"
                        + "基于裁剪菲的质检状态统计：合格 / 不合格 / 返修完成 / 返修待质检。"
                        + "注意：系统没有「报废」状态，不要回答报废率。",
                properties,
                List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null) action = "overview";
        int days = optionalInt(args, "days") != null ? optionalInt(args, "days") : 30;

        return switch (action) {
            case "overview" -> executeOverview(days);
            case "by_factory" -> executeByFactory(days);
            case "by_order" -> executeByOrder(optionalString(args, "orderNo"));
            case "by_reason" -> executeByReason(days);
            case "trend" -> executeTrend(days);
            default -> errorJson("未知操作: " + action);
        };
    }

    private String executeOverview(int days) throws Exception {
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusDays(days);

        Long total = countByStatus(tenantId, since, null);
        Long qualified = countByStatus(tenantId, since, ST_QUALIFIED);
        Long unqualified = countByStatus(tenantId, since, ST_UNQUALIFIED);
        Long repaired = countByStatus(tenantId, since, ST_REPAIRED);
        Long repairing = countByStatus(tenantId, since, ST_REPAIRED_WAITING_QC);

        // 铁律 9：0 条 ≠ 一切正常。没有样本时必须说明「无法判断」，不能报「不合格率 0%」
        if (total == 0) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("action", "overview");
            empty.put("period", days + "天");
            empty.put("totalBundles", 0);
            empty.put("note", "该时段内没有裁剪菲数据，无法判断质量情况。这不代表质量正常，只代表没有数据可分析。");
            return successJson("质量总览", empty);
        }

        double unqualifiedRate = (double) unqualified / total * 100;
        long repairTotal = repaired + repairing;
        double repairCompletionRate = repairTotal > 0 ? (double) repaired / repairTotal * 100 : 0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "overview");
        result.put("period", days + "天");
        result.put("totalBundles", total);
        result.put("qualifiedCount", qualified);
        result.put("unqualifiedCount", unqualified);
        result.put("unqualifiedRate", String.format("%.2f%%", unqualifiedRate));
        result.put("repairedCount", repaired);
        result.put("repairingCount", repairing);
        result.put("repairCompletionRate", String.format("%.2f%%", repairCompletionRate));

        return successJson("质量总览", result);
    }

    private String executeByFactory(int days) throws Exception {
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusDays(days);

        List<Map<String, Object>> byFactory = cuttingBundleMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .select("factory_name as factory",
                                "COUNT(*) as total",
                                "SUM(CASE WHEN status = '" + ST_UNQUALIFIED + "' THEN 1 ELSE 0 END) as unqualified",
                                "SUM(CASE WHEN status = '" + ST_REPAIRED + "' THEN 1 ELSE 0 END) as repaired",
                                "SUM(CASE WHEN status = '" + ST_REPAIRED_WAITING_QC + "' THEN 1 ELSE 0 END) as repairing")
                        .eq("tenant_id", tenantId)
                        .ge("create_time", since)
                        .groupBy("factory_name")
                        .orderByDesc("unqualified"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "by_factory");
        result.put("period", days + "天");
        result.put("items", byFactory);
        return successJson("按工厂质量统计", result);
    }

    private String executeByOrder(String orderNo) throws Exception {
        if (orderNo == null || orderNo.isBlank()) {
            return errorJson("by_order操作需要提供orderNo参数");
        }
        Long tenantId = UserContext.tenantId();

        Long total = countByOrderNo(tenantId, orderNo, null);
        Long unqualified = countByOrderNo(tenantId, orderNo, ST_UNQUALIFIED);
        Long repaired = countByOrderNo(tenantId, orderNo, ST_REPAIRED);
        Long repairing = countByOrderNo(tenantId, orderNo, ST_REPAIRED_WAITING_QC);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "by_order");
        result.put("orderNo", orderNo);
        result.put("totalBundles", total);
        result.put("unqualifiedCount", unqualified);
        result.put("unqualifiedRate", total > 0
                ? String.format("%.2f%%", (double) unqualified / total * 100) : "0%");
        result.put("repairedCount", repaired);
        result.put("repairingCount", repairing);
        return successJson("按订单质量统计", result);
    }

    /**
     * 按质检状态分布。
     *
     * <p><b>D-760 语义修正</b>：本 action 原先按 {@code quality_remark}（次品原因）分组，
     * 但 {@code t_cutting_bundle} <b>没有该列</b>，也没有任何「原因」维度 ——
     * 该维度在本表无数据源。现改为按真实存在的 {@code status} 分组，
     * 输出「各质检状态的菲数分布」，避免继续展示一个不存在维度的假统计。
     */
    private String executeByReason(int days) throws Exception {
        Long tenantId = UserContext.tenantId();

        List<Map<String, Object>> byStatus = cuttingBundleMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .select("COALESCE(status,'(未设置)') as status",
                                "COUNT(*) as count")
                        .eq("tenant_id", tenantId)
                        .ge("create_time", LocalDateTime.now().minusDays(days))
                        .groupBy("status")
                        .orderByDesc("count"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "by_reason");
        result.put("period", days + "天");
        result.put("note", "按质检状态分布（裁剪菲无「次品原因」字段，该维度不可用）");
        result.put("items", byStatus);
        return successJson("质检状态分布", result);
    }

    /** 按天趋势：各质检状态的菲数。原先只返回一句「请用 overview 对比」，属空实现。 */
    private String executeTrend(int days) throws Exception {
        Long tenantId = UserContext.tenantId();

        List<Map<String, Object>> trend = cuttingBundleMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .select("DATE(create_time) as day",
                                "COUNT(*) as total",
                                "SUM(CASE WHEN status = '" + ST_UNQUALIFIED + "' THEN 1 ELSE 0 END) as unqualified",
                                "SUM(CASE WHEN status = '" + ST_REPAIRED + "' THEN 1 ELSE 0 END) as repaired",
                                "SUM(CASE WHEN status = '" + ST_REPAIRED_WAITING_QC + "' THEN 1 ELSE 0 END) as repairing")
                        .eq("tenant_id", tenantId)
                        .ge("create_time", LocalDateTime.now().minusDays(days))
                        .groupBy("DATE(create_time)")
                        .orderByAsc("DATE(create_time)"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", "trend");
        result.put("period", days + "天");
        result.put("items", trend);
        return successJson("质量趋势", result);
    }

    /** 按状态计数；status 为 null 时统计全部 */
    private Long countByStatus(Long tenantId, LocalDateTime since, String status) {
        com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle> q =
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .ge("create_time", since);
        if (status != null) {
            q.eq("status", status);
        }
        return cuttingBundleMapper.selectCount(q);
    }

    /** 按订单号 + 可选状态计数 */
    private Long countByOrderNo(Long tenantId, String orderNo, String status) {
        com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle> q =
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<CuttingBundle>()
                        .eq("tenant_id", tenantId)
                        .eq(COL_ORDER_NO, orderNo);
        if (status != null) {
            q.eq("status", status);
        }
        return cuttingBundleMapper.selectCount(q);
    }
}

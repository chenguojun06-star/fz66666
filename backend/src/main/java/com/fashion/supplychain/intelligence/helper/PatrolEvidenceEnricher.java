package com.fashion.supplychain.intelligence.helper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * 巡检工单证据包富化器（D-754 P1：巡检→根因自动串联的第一环）。
 *
 * <p>此前巡检告警只说「订单X组合风险(逾期是+进度20%+物料30%)」，用户还要自己去查
 * 卡在哪、为什么。本类把订单维度的证据一次性查齐拼进工单文案：</p>
 * <ol>
 *   <li>订单基本盘：状态/进度/物料到货率/工厂/交期</li>
 *   <li>真实所处环节：t_production_process_tracking 最新扫码位置（不是按百分比推断）</li>
 *   <li>停滞时长：距最近一次扫码多久</li>
 *   <li>环节积压：该订单各环节完成量对照，定位最大断点</li>
 * </ol>
 *
 * <p>全部为轻量 SQL（仅在新工单创建时触发一次，去重层保证频率），
 * 查询失败一律静默返回空——证据是增益，绝不能阻塞工单创建。</p>
 */
@Slf4j
@Component
public class PatrolEvidenceEnricher {

    /** 订单维度的巡检类型——这些工单的 targetId 是订单号（或以订单号开头） */
    private static final List<String> ORDER_ISSUE_TYPES = List.of(
            "DEADLINE_RISK", "COMBINED_RISK", "STAGNANT_ORDER", "CUTTING_BACKLOG",
            "MATERIAL_SHORT", "QUALITY_SPIKE", "COST_OVERRUN", "FACTORY_SILENCE",
            "DELAY_RISK", "HIGH_RISK_ORDER");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    public boolean isOrderIssueType(String issueType) {
        return issueType != null && ORDER_ISSUE_TYPES.contains(issueType);
    }

    /**
     * 为订单类工单构建证据包文案（纯文本，直接可读）。失败返回空串。
     *
     * @param targetId 工单目标（订单号，可能带"、多单"后缀——只取第一单做代表）
     */
    public String buildEvidencePack(String targetId) {
        if (!StringUtils.hasText(targetId)) {
            return "";
        }
        // targetId 可能是「PO123、PO456」这种多单串，取第一单做代表深挖
        String orderNo = targetId.split("[,，、;；]")[0].trim();
        if (!StringUtils.hasText(orderNo)) {
            return "";
        }
        try {
            StringBuilder sb = new StringBuilder();

            // 1. 订单基本盘 + 2. 真实环节 + 停滞时长（一条联查）
            List<Map<String, Object>> heads = jdbcTemplate.queryForList(
                    "SELECT o.status, o.production_progress, o.material_arrival_rate, o.factory_name, " +
                    "       o.expected_ship_date, t.progress_stage AS last_stage, t.scan_time AS last_scan " +
                    "FROM t_production_order o " +
                    "LEFT JOIN t_production_process_tracking t ON t.order_no = o.order_no AND t.tenant_id = o.tenant_id " +
                    "WHERE o.order_no = ? AND o.delete_flag = 0 " +
                    "ORDER BY t.scan_time DESC LIMIT 1", orderNo);

            if (heads.isEmpty()) {
                return "";
            }
            Map<String, Object> h = heads.get(0);
            sb.append(String.format("[证据] 订单状态=%s，进度=%s%%，物料到货率=%s%%，工厂=%s，约定交期=%s",
                    h.get("status"), h.get("production_progress"),
                    h.get("material_arrival_rate"), h.get("factory_name"),
                    h.get("expected_ship_date") == null ? "未设置" : String.valueOf(h.get("expected_ship_date")).substring(0, Math.min(10, String.valueOf(h.get("expected_ship_date")).length()))));
            Object lastStage = h.get("last_stage");
            Object lastScan = h.get("last_scan");
            if (lastStage != null) {
                sb.append("，最新扫码环节=").append(lastStage);
            }
            if (lastScan != null) {
                long staleHours = (System.currentTimeMillis()
                        - java.sql.Timestamp.valueOf(String.valueOf(lastScan)).getTime()) / 3600000L;
                sb.append("，距最近扫码已 ").append(staleHours).append(" 小时");
                if (staleHours >= 48) {
                    sb.append("（停滞预警：≥48h 无扫码）");
                }
            }

            // 3. 环节积压对照：各环节完成件数，找最大断点
            List<Map<String, Object>> stageCounts = jdbcTemplate.queryForList(
                    "SELECT progress_stage, COUNT(*) AS cnt FROM t_production_process_tracking " +
                    "WHERE order_no = ? AND scan_status = 'scanned' " +
                    "GROUP BY progress_stage", orderNo);
            if (stageCounts.size() >= 2) {
                String stageLine = stageCounts.stream()
                        .map(sc -> String.valueOf(sc.get("progress_stage")) + ":" + sc.get("cnt"))
                        .reduce((a, b) -> a + " / " + b)
                        .orElse("");
                sb.append("。各环节完成量：").append(stageLine);
            }
            return sb.toString();
        } catch (Exception e) {
            log.debug("[PatrolEvidence] 证据包构建失败（静默降级）: orderNo={}, err={}", orderNo, e.getMessage());
            return "";
        }
    }
}

package com.fashion.supplychain.intelligence.engine.risk;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 异常自愈策略配置（A模式：保守起步）
 *
 * AUTO类型：AI自动执行修复动作（催单/通知/标记），人员可事后撤销
 * SUGGESTION类型：只生成建议工单（NEED_APPROVAL），人员审批后一键执行
 *
 * issueType 来源：
 * - ParallelRiskDetector 产生 RiskType.name()（DELAY/QUALITY/COST/MATERIAL/DELIVERY/FACTORY/STAGNANT）
 * - 其他巡检源可能产生描述性名称（FACTORY_SILENCE/DEADLINE_RISK/QUALITY_SPIKE 等）
 * - 两组名称均在 switch 中支持
 */
@Slf4j
@Component
public class AutoRemediationPolicy {

    public enum RemediationMode {
        AUTO,       // AI自动执行
        SUGGESTION  // 只生成建议，人员审批后执行
    }

    /**
     * 按issueType获取自愈模式
     * A模式策略（AUTO）：
     * - STAGNANT（工序停滞）→ 自动催单
     * - FACTORY / FACTORY_SILENCE（工厂失联）→ 自动通知+标记
     * - DELAY / DEADLINE_RISK（订单逾期）→ 自动排产重算+加急建议
     * - QUALITY / QUALITY_SPIKE（质量突变）→ 自动通知质检主管
     * 其余（MATERIAL/COST/DELIVERY 等）→ SUGGESTION
     */
    public RemediationMode getMode(String issueType) {
        if (issueType == null) return RemediationMode.SUGGESTION;
        return switch (issueType) {
            // AUTO模式：RiskType 枚举名
            case "STAGNANT", "FACTORY", "DELAY", "QUALITY",
            // AUTO模式：描述性名称（兼容其他巡检来源）
                 "FACTORY_SILENCE", "DEADLINE_RISK", "QUALITY_SPIKE" -> RemediationMode.AUTO;
            default -> RemediationMode.SUGGESTION;
        };
    }

    /**
     * 判断是否允许自动执行（受全局开关+租户开关控制）
     */
    public boolean isAutoRemediationEnabled(Long tenantId, String issueType) {
        // 默认开启AUTO模式，后续可通过 BackendActionFlagService 按租户关闭
        RemediationMode mode = getMode(issueType);
        return mode == RemediationMode.AUTO;
    }

    /**
     * 获取建议的修复动作描述
     */
    public String getSuggestedAction(String issueType, RiskItem risk) {
        if (risk != null && risk.getSuggestedAction() != null) {
            return risk.getSuggestedAction();
        }
        if (issueType == null) return "请人工核查处理";
        return switch (issueType) {
            case "STAGNANT" -> "自动发送催单通知给工厂组长";
            case "FACTORY", "FACTORY_SILENCE" -> "自动发送站内信给工厂管理员并标记订单风险";
            case "DELAY", "DEADLINE_RISK" -> "自动重新排产并给主管发送加急建议";
            case "QUALITY", "QUALITY_SPIKE" -> "自动通知质检主管并标记款式待复查";
            case "MATERIAL", "MATERIAL_SHORT" -> "生成采购建议单推送到购物车草稿";
            case "PAYROLL_ANOMALY" -> "建议冻结该条工资记录并通知财务审核";
            case "DELIVERY", "DELIVERY_EXCEPTION" -> "建议启动转厂评估并生成备选工厂清单";
            case "MATERIAL_DIFF" -> "建议锁定该批次并通知采购与仓库对账";
            case "COST", "COST_OVERRUN" -> "建议重算该款式难度分并更新工时基准";
            default -> "请人工核查处理";
        };
    }
}

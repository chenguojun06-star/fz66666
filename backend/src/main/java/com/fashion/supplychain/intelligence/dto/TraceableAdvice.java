package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * 小云智能顾问 - 可追溯建议卡片 (Traceable Advice Card)
 *
 * 核心设计理念 (Human-in-the-loop):
 * 1. AI 绝对不直接修改任何业务数据。
 * 2. 所有的智能诊断、多智能体辩论结果，都会封装成此对象。
 * 3. 前端在“小云聊天窗口”中渲染此卡片，展示清晰的【评估依据】和【操作按钮】。
 * 4. 只有用户点击“执行”，才会触发真实的业务 API。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TraceableAdvice {

    /** 唯一追踪ID，用于关联底层的思考链路和日志，确保数据可追溯 */
    private String traceId;

    /** 建议的简短标题，例如："PO2026 订单存在延期风险" */
    private String title;

    /** 详细的分析结论（多智能体辩论后的最终意见） */
    private String summary;

    /**
     * 评估依据 (Data Lineage)
     * 告诉用户 AI 是看了哪些数据才得出这个结论的。
     * 例如：["历史面料A延期率30%", "当前车间负荷已达 95%", "气象API提示江浙沪大雨"]
     */
    private List<String> reasoningChain;

    /**
     * 推荐执行的操作列表（供用户选择）
     * 前端渲染为按钮，例如：[{"label": "通知跟单员跟进", "action": "NOTIFY_MERCHANDISER", "params": {...}}, 
     *                     {"label": "转外发生产", "action": "TRANSFER_OUTSOURCE", "params": {...}}]
     */
    private List<ProposedAction> proposedActions;

    /** 风险或推荐指数 (1-5) */
    private Integer confidenceScore;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProposedAction {
        /** 按钮上显示的文字 */
        private String label;
        /** 前端对应的动作指令，用于触发对应 API */
        private String actionCommand;
        /** 执行该动作所需的预设参数（只读，等用户确认后作为 payload 发给后端） */
        private Map<String, Object> actionParams;
        /** 动作风险提示（如：将增加成本 5000 元） */
        private String riskWarning;
    }
}

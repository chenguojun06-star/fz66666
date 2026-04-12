package com.fashion.supplychain.intelligence.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * 智能跟进动作 —— AI 回答后基于上下文推荐的可执行操作。
 * <p>
 * 三种类型：
 * <ul>
 *   <li>EXECUTE — 直接调用 ExecutionEngine 执行命令（如出库、催单）</li>
 *   <li>NAVIGATE — 跳转到前端页面（如订单详情）</li>
 *   <li>ASK — 继续追问（文本跟进建议）</li>
 * </ul>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FollowUpAction {

    /** 显示文本，如 "直接出库给XX工厂" */
    private String label;

    /** 图标标识，前端映射为 antd icon，如 "export", "edit", "search" */
    private String icon;

    /** 动作类型 */
    private ActionType actionType;

    /**
     * 命令标识，映射到 ExecutionEngine 的 action（如 "order:edit", "order:hold"）。
     * actionType=ASK 时为空，actionType=NAVIGATE 时为前端路由路径。
     */
    private String command;

    /**
     * 数据摘要 — 在卡片上直接展示关键业务数据，让用户一眼做决策。
     * 格式："订单号: PO123 · 数量: 500件 · 工厂: 最美服装 · 交期: 06/15"
     */
    private String dataSummary;

    /** 已由 AI 上下文预填的参数（如 styleNo, orderId, quantity） */
    private Map<String, Object> prefilledParams;

    /** 需要用户补充输入的字段列表 */
    private List<ActionField> requiredInputs;

    /** 动作类型枚举 */
    public enum ActionType {
        /** 直接执行 ExecutionEngine 命令 */
        EXECUTE,
        /** 跳转前端页面 */
        NAVIGATE,
        /** 追问 / 继续对话 */
        ASK
    }

    /** 用户需补充输入的单个字段描述 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ActionField {
        /** 字段键名，提交时作为参数名 */
        private String key;
        /** 显示标签，如 "接收人" */
        private String label;
        /** 输入类型：text / number / date / select */
        private String inputType;
        /** 占位符提示 */
        private String placeholder;
        /** 默认值（可选） */
        private Object defaultValue;
        /** select 类型时的下拉选项 */
        private List<Option> options;
    }

    /** 下拉选项 */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Option {
        private String label;
        private Object value;
    }
}

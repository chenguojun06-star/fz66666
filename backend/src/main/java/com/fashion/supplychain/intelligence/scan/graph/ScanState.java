package com.fashion.supplychain.intelligence.scan.graph;

import java.util.EnumSet;
import java.util.Set;

/**
 * 扫码全流程状态枚举（P1-2 LangGraph State Graph + HITL 升级）。
 *
 * <p>用途：显式定义扫码全流程状态机，每个状态节点可中断（HITL）支持人工审批后继续。</p>
 *
 * <p>设计原则：</p>
 * <ul>
 *   <li>状态机为独立模块，不强制接入现有 ScanRecordOrchestrator 主流程</li>
 *   <li>状态转换通过 {@link #canTransitionTo(ScanState)} 校验合法性</li>
 *   <li>HITL 中断点：UNDO_PENDING（撤回审批）</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
public enum ScanState {

    /** 初始化 */
    INIT("初始化"),
    /** 待扫码（菲号已生成） */
    BUNDLE_PENDING("待扫码"),
    /** 已扫码（工序完成） */
    SCANNED("已扫码"),
    /** 待质检 */
    QUALITY_PENDING("待质检"),
    /** 质检通过 */
    QUALITY_PASSED("质检通过"),
    /** 质检失败（需返工） */
    QUALITY_FAILED("质检失败"),
    /** 待入库 */
    INBOUND_PENDING("待入库"),
    /** 已入库 */
    INBOUND_DONE("已入库"),
    /** 待撤回（HITL 中断点） */
    UNDO_PENDING("待撤回审批"),
    /** 已撤回 */
    UNDONE("已撤回"),
    /** 终止（报废） */
    TERMINATED("已终止");

    private final String description;

    ScanState(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }

    /**
     * 校验从当前状态到目标状态是否为合法转换。
     *
     * <p>合法转换规则：</p>
     * <ul>
     *   <li>INIT → BUNDLE_PENDING</li>
     *   <li>BUNDLE_PENDING → SCANNED</li>
     *   <li>SCANNED → QUALITY_PENDING</li>
     *   <li>QUALITY_PENDING → QUALITY_PASSED / QUALITY_FAILED</li>
     *   <li>QUALITY_FAILED → BUNDLE_PENDING（返工）</li>
     *   <li>QUALITY_PASSED → INBOUND_PENDING</li>
     *   <li>INBOUND_PENDING → INBOUND_DONE</li>
     *   <li>SCANNED / QUALITY_PASSED / INBOUND_DONE → UNDO_PENDING（HITL）</li>
     *   <li>UNDO_PENDING → UNDONE</li>
     *   <li>任何状态 → TERMINATED</li>
     * </ul>
     *
     * @param target 目标状态
     * @return true 表示合法转换
     */
    public boolean canTransitionTo(ScanState target) {
        if (target == null) {
            return false;
        }
        if (target == TERMINATED) {
            return true;
        }
        switch (this) {
            case INIT:
                return target == BUNDLE_PENDING;
            case BUNDLE_PENDING:
                return target == SCANNED;
            case SCANNED:
                return target == QUALITY_PENDING || target == UNDO_PENDING;
            case QUALITY_PENDING:
                return target == QUALITY_PASSED || target == QUALITY_FAILED;
            case QUALITY_FAILED:
                return target == BUNDLE_PENDING;
            case QUALITY_PASSED:
                return target == INBOUND_PENDING || target == UNDO_PENDING;
            case INBOUND_PENDING:
                return target == INBOUND_DONE;
            case INBOUND_DONE:
                return target == UNDO_PENDING;
            case UNDO_PENDING:
                return target == UNDONE;
            case UNDONE:
            case TERMINATED:
                return false;
            default:
                return false;
        }
    }

    /**
     * 返回从当前状态可直接到达的合法目标状态集合（不含 TERMINATED，便于 UI 展示）。
     */
    public Set<ScanState> nextStates() {
        Set<ScanState> next = EnumSet.noneOf(ScanState.class);
        for (ScanState s : values()) {
            if (s != TERMINATED && canTransitionTo(s)) {
                next.add(s);
            }
        }
        return next;
    }
}

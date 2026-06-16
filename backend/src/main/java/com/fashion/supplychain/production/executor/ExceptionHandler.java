package com.fashion.supplychain.production.executor;

import lombok.extern.slf4j.Slf4j;

/**
 * 扫码执行器统一异常处理工具
 * <p>
 * 将分散在各个执行器中的"不阻断"异常处理模式统一抽象，
 * 明确异常分类和处理策略，避免关键业务逻辑静默失败。
 * <p>
 * 使用方式：
 * <pre>
 *   ExceptionHandler.runRecoverable("更新工序跟踪记录", () -> {
 *       processTrackingOrchestrator.updateScanRecord(...);
 *   }, e -> log.warn("更新失败: bundleId={}", bundleId, e));
 * </pre>
 */
@Slf4j
public final class ExceptionHandler {

    private ExceptionHandler() {}

    /**
     * 处理可恢复异常 — 不阻断主流程
     * <p>
     * 适用于：工序跟踪更新、进度重算、通知推送等非关键操作
     * 这些操作失败不应阻止扫码主流程，但需要记录以便排查
     *
     * @param operation    操作描述，用于日志
     * @param action       要执行的操作
     * @param errorHandler 自定义错误处理（如记录业务参数），传 null 则使用默认 warn 日志
     */
    public static void runRecoverable(String operation, Runnable action,
                                       java.util.function.Consumer<Exception> errorHandler) {
        try {
            action.run();
        } catch (Exception e) {
            if (errorHandler != null) {
                errorHandler.accept(e);
            } else {
                log.warn("{}失败（不阻断）: {}", operation, e.getMessage());
            }
        }
    }

    /**
     * 处理可恢复异常 — 不阻断主流程，使用默认 warn 日志
     */
    public static void runRecoverable(String operation, Runnable action) {
        runRecoverable(operation, action, null);
    }

    /**
     * 处理分类异常 — 根据异常类型分别处理
     * <p>
     * 适用于：工序跟踪更新等场景，BusinessException/IllegalStateException 不阻断，
     * 其他未知异常用 error 级别记录
     *
     * @param operation           操作描述
     * @param action              要执行的操作
     * @param businessExHandler   BusinessException 处理，传 null 则使用默认 warn 日志
     * @param stateExHandler      IllegalStateException 处理，传 null 则使用默认 warn 日志
     * @param unknownExHandler    未知异常处理，传 null 则使用默认 error 日志
     */
    public static void runClassified(String operation, Runnable action,
                                      java.util.function.Consumer<com.fashion.supplychain.common.BusinessException> businessExHandler,
                                      java.util.function.Consumer<IllegalStateException> stateExHandler,
                                      java.util.function.Consumer<Exception> unknownExHandler) {
        try {
            action.run();
        } catch (com.fashion.supplychain.common.BusinessException be) {
            if (businessExHandler != null) businessExHandler.accept(be);
            else log.warn("{}（业务拒绝，不阻断）: {}", operation, be.getMessage());
        } catch (IllegalStateException ise) {
            if (stateExHandler != null) stateExHandler.accept(ise);
            else log.warn("{}（状态冲突，不阻断）: {}", operation, ise.getMessage());
        } catch (Exception e) {
            if (unknownExHandler != null) unknownExHandler.accept(e);
            else log.error("{}（未知异常）: {}", operation, e.getMessage(), e);
        }
    }
}

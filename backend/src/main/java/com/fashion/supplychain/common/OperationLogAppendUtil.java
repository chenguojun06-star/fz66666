package com.fashion.supplychain.common;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.function.BiConsumer;
import java.util.function.Function;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 操作日志工具
 *
 * <p>统一将系统操作日志写入 {@code t_operation_log}，不再追加进实体 remarks 字段。
 * remarks 仅保留人工备注；数据操作日志一律进日志记录（P0 需求：备注与操作日志分离）。
 *
 * <p>方法保持静态签名以兼容既有调用点（24 个 *LogAppendHelper 子类零改动），
 * {@link OperationLogService} 通过静态注入持有，未注入时降级为 warn 日志不阻断主流程。
 */
@Slf4j
@Component
public class OperationLogAppendUtil {

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private static OperationLogService operationLogService;

    @Autowired
    public void setOperationLogService(OperationLogService service) {
        OperationLogAppendUtil.operationLogService = service;
    }

    /**
     * 构建人类可读的日志行（与历史格式保持一致，供兼容/展示使用）
     */
    public static String buildLogEntry(String action, String detail) {
        String operator = getOperator();
        String time = LocalDateTime.now().format(FORMATTER);

        StringBuilder sb = new StringBuilder();
        sb.append("[").append(time).append("] ");
        sb.append(operator).append(" ");
        sb.append(action);
        if (StringUtils.hasText(detail)) {
            sb.append("：").append(detail);
        }
        return sb.toString();
    }

    /**
     * 记录操作日志（原 appendOperation 语义：改为写 t_operation_log，不再改动 remarks）
     *
     * @param id           目标ID（写入 targetId）
     * @param service      实体 Service（保留参数兼容既有调用，不再使用）
     * @param remarkGetter 备注读取函数（保留参数兼容既有调用，不再使用）
     * @param remarkSetter 备注写入函数（保留参数兼容既有调用，不再使用）
     * @param action       操作类型
     * @param detail       操作详情
     * @param entityName   模块/目标类型
     */
    public static <T, ID extends Serializable> void appendOperation(
            ID id,
            IService<T> service,
            Function<T, String> remarkGetter,
            BiConsumer<T, String> remarkSetter,
            String action,
            String detail,
            String entityName
    ) {
        if (id == null) {
            return;
        }
        writeLog(entityName, action, detail, String.valueOf(id), null);
    }

    /**
     * 记录操作日志（原 appendOperationToEntity 语义：改为写 t_operation_log，不再改动 remarks）
     */
    public static <T> void appendOperationToEntity(
            T entity,
            IService<T> service,
            Function<T, String> remarkGetter,
            BiConsumer<T, String> remarkSetter,
            String action,
            String detail
    ) {
        writeLog("业务实体", action, detail, null, null);
    }

    /**
     * 统一的日志写入入口：所有调用点（Helper/Orchestrator/AI 工具）都走这里。
     * try-catch 包裹，失败仅 warn，不阻断主流程；tenantId 随 UserContext 写入，符合多租户隔离。
     */
    public static void writeLog(String module, String operation, String detail, String targetId, String targetName) {
        try {
            OperationLogService service = operationLogService;
            if (service == null) {
                log.warn("OperationLogService 未注入，跳过操作日志：module={}, operation={}", module, operation);
                return;
            }
            OperationLog opLog = new OperationLog();
            opLog.setModule(StringUtils.hasText(module) ? module : "系统");
            opLog.setOperation(StringUtils.hasText(operation) ? operation : "操作");
            opLog.setDetails(detail);
            opLog.setTargetId(targetId);
            opLog.setTargetName(targetName);
            opLog.setOperatorName(getOperator());
            opLog.setOperatorId(parseOperatorId(UserContext.userId()));
            opLog.setTenantId(UserContext.tenantId());
            opLog.setOperationTime(LocalDateTime.now());
            opLog.setStatus("success");
            service.createOperationLog(opLog);
        } catch (Exception e) {
            log.warn("写操作日志失败（不阻断）: module={}, operation={}, err={}", module, operation, e.getMessage());
        }
    }

    private static Long parseOperatorId(String userId) {
        if (!StringUtils.hasText(userId)) {
            return null;
        }
        try {
            return Long.parseLong(userId.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static String getOperator() {
        UserContext ctx = UserContext.get();
        if (ctx != null && StringUtils.hasText(ctx.getUsername())) {
            return ctx.getUsername();
        }
        return "系统管理员";
    }
}

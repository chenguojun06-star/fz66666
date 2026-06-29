package com.fashion.supplychain.common;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.service.IService;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.function.BiConsumer;
import java.util.function.Function;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;

@Slf4j
public class OperationLogAppendUtil {

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public static <T> String buildLogEntry(String action, String detail) {
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

    public static String appendToRemark(String existingRemark, String action, String detail) {
        String logEntry = buildLogEntry(action, detail);
        if (StringUtils.hasText(existingRemark)) {
            return logEntry + "\n" + existingRemark;
        }
        return logEntry;
    }

    public static <T, ID extends Serializable> void appendOperation(
            ID id,
            IService<T> service,
            Function<T, String> remarkGetter,
            BiConsumer<T, String> remarkSetter,
            String action,
            String detail,
            String entityName
    ) {
        if (id == null || service == null) {
            return;
        }
        try {
            T entity = service.getById(id);
            if (entity != null) {
                String currentRemark = remarkGetter.apply(entity);
                String newRemark = appendToRemark(currentRemark, action, detail);
                remarkSetter.accept(entity, newRemark);
                service.updateById(entity);
            }
        } catch (Exception e) {
            log.warn("Failed to append operation log to {}: id={}, action={}", entityName, id, action, e);
        }
    }

    public static <T> void appendOperationToEntity(
            T entity,
            IService<T> service,
            Function<T, String> remarkGetter,
            BiConsumer<T, String> remarkSetter,
            String action,
            String detail
    ) {
        if (entity == null || service == null) {
            return;
        }
        try {
            String currentRemark = remarkGetter.apply(entity);
            String newRemark = appendToRemark(currentRemark, action, detail);
            remarkSetter.accept(entity, newRemark);
        } catch (Exception e) {
            log.warn("Failed to append operation log to entity: action={}", action, e);
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

package com.fashion.supplychain.common;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import lombok.extern.slf4j.Slf4j;

/**
 * 操作人记录工具类
 *
 * 功能：
 * 1. 全系统所有环节自动记录操作人
 * 2. 支持外协工厂场景的手动填写
 */
@Component
@Slf4j
public class OperatorRecorder {

    /**
     * 记录操作人信息（自动从上下文获取）
     *
     * @return OperatorInfo 包含操作人ID和姓名
     */
    public static OperatorInfo recordOperator() {
        return recordOperator(null, null, false);
    }

    /**
     * 记录操作人信息（支持外协模式）
     *
     * @param manualOperatorId 手动指定的操作人ID（外协场景使用）
     * @param manualOperatorName 手动指定的操作人姓名（外协场景使用）
     * @param isOutsourced 是否为外协工厂场景
     * @return OperatorInfo 包含操作人ID和姓名
     */
    public static OperatorInfo recordOperator(String manualOperatorId, String manualOperatorName, boolean isOutsourced) {
        OperatorInfo info = new OperatorInfo();

        // 外协场景：优先使用手动填写的操作人
        if (isOutsourced && StringUtils.hasText(manualOperatorName)) {
            info.setOperatorId(manualOperatorId);
            info.setOperatorName(manualOperatorName);
            info.setIsOutsourced(true);
            log.debug("外协工厂操作人: {}", manualOperatorName);
            return info;
        }

        // 正常场景：从UserContext自动获取
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            info.setOperatorId(ctx.getUserId());
            info.setOperatorName(ctx.getUsername());
            info.setIsOutsourced(false);
            log.debug("系统操作人: {}", ctx.getUsername());
            return info;
        }

        // 兜底：如果上下文为空，使用手动指定（如果有）
        if (StringUtils.hasText(manualOperatorName)) {
            info.setOperatorId(manualOperatorId);
            info.setOperatorName(manualOperatorName);
            info.setIsOutsourced(isOutsourced);
            log.warn("使用兜底操作人: {}", manualOperatorName);
            return info;
        }

        // 完全无法获取操作人
        log.error("无法获取操作人信息，UserContext为空且未提供手动操作人");
        info.setOperatorId(null);
        info.setOperatorName("未知操作人");
        info.setIsOutsourced(false);
        return info;
    }

    /**
     * 操作人信息封装类
     */
    public static class OperatorInfo {
        private String operatorId;
        private String operatorName;
        private Boolean isOutsourced = false;

        public String getOperatorId() {
            return operatorId;
        }

        public void setOperatorId(String operatorId) {
            this.operatorId = operatorId;
        }

        public String getOperatorName() {
            return operatorName;
        }

        public void setOperatorName(String operatorName) {
            this.operatorName = operatorName;
        }

        public Boolean getIsOutsourced() {
            return isOutsourced;
        }

        public void setIsOutsourced(Boolean isOutsourced) {
            this.isOutsourced = isOutsourced;
        }

        /**
         * 应用到目标对象（通用方法）
         *
         * @param target 目标对象
         * @param idFieldName 操作人ID字段名
         * @param nameFieldName 操作人姓名字段名
         */
        public void applyTo(Object target, String idFieldName, String nameFieldName) {
            if (target == null) {
                return;
            }

            try {
                // 使用反射设置字段
                if (StringUtils.hasText(idFieldName) && StringUtils.hasText(operatorId)) {
                    java.lang.reflect.Field idField = findField(target.getClass(), idFieldName);
                    if (idField != null) {
                        idField.setAccessible(true);
                        idField.set(target, operatorId);
                    }
                }

                if (StringUtils.hasText(nameFieldName) && StringUtils.hasText(operatorName)) {
                    java.lang.reflect.Field nameField = findField(target.getClass(), nameFieldName);
                    if (nameField != null) {
                        nameField.setAccessible(true);
                        nameField.set(target, operatorName);
                    }
                }
            } catch (Exception e) {
                log.error("应用操作人信息失败: {}", e.getMessage(), e);
            }
        }

        private java.lang.reflect.Field findField(Class<?> clazz, String fieldName) {
            try {
                return clazz.getDeclaredField(fieldName);
            } catch (NoSuchFieldException e) {
                if (clazz.getSuperclass() != null) {
                    return findField(clazz.getSuperclass(), fieldName);
                }
                return null;
            }
        }
    }

    /**
     * 检查是否需要启用外协模式
     *
     * @param factoryName 工厂名称
     * @return 是否为外协工厂
     */
    public static boolean isOutsourcedFactory(String factoryName) {
        if (!StringUtils.hasText(factoryName)) {
            return false;
        }

        String name = factoryName.trim().toLowerCase();

        // 关键字匹配：外协、外发、外包、代工等
        return name.contains("外协") ||
               name.contains("外发") ||
               name.contains("外包") ||
               name.contains("代工") ||
               name.contains("outsource") ||
               name.contains("外厂");
    }
}

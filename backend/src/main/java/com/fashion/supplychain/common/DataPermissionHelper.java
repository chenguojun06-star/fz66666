package com.fashion.supplychain.common;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.springframework.util.StringUtils;
import java.util.List;
import java.util.ArrayList;

/**
 * 数据权限过滤助手
 * 根据当前用户角色自动添加数据范围过滤条件
 */
public class DataPermissionHelper {

    /**
     * 为QueryWrapper添加操作人过滤条件
     *
     * @param wrapper     查询包装器
     * @param operatorIdField 操作人ID字段名
     * @param operatorNameField 操作人姓名字段名（可选）
     * @param <T> 实体类型
     * @return 是否添加了过滤条件
     */
    public static <T> boolean applyOperatorFilter(QueryWrapper<T> wrapper,
            String operatorIdField, String operatorNameField) {

        String dataScope = UserContext.getDataScope();

        switch (dataScope) {
            case "all":
                // 管理员看全部，不添加过滤
                return false;

            case "team":
                String orgUnitId = UserContext.orgUnitId();
                if (StringUtils.hasText(orgUnitId)) {
                    wrapper.eq("org_unit_id", orgUnitId);
                    return true;
                }
                return applyOwnFilter(wrapper, operatorIdField, operatorNameField);

            case "own":
            default:
                // 普通工人只看自己
                return applyOwnFilter(wrapper, operatorIdField, operatorNameField);
        }
    }

    /**
     * 添加"仅自己"的过滤条件
     */
    private static <T> boolean applyOwnFilter(QueryWrapper<T> wrapper,
            String operatorIdField, String operatorNameField) {

        String userId = UserContext.userId();
        String username = UserContext.username();

        if (StringUtils.hasText(userId) && StringUtils.hasText(operatorIdField)) {
            wrapper.eq(operatorIdField, userId);
            return true;
        }

        if (StringUtils.hasText(username) && StringUtils.hasText(operatorNameField)) {
            wrapper.eq(operatorNameField, username);
            return true;
        }

        // 如果没有用户信息，不返回任何数据
        wrapper.eq("1", "0"); // 添加一个永假条件
        return true;
    }

    /**
     * 判断当前用户是否有权查看指定操作人的数据
     *
     * @param operatorId 操作人ID
     * @param operatorName 操作人姓名
     * @return true=有权查看
     */
    public static boolean canViewRecord(String operatorId, String operatorName) {
        String dataScope = UserContext.getDataScope();

        if ("all".equals(dataScope)) {
            return true;
        }

        String currentUserId = UserContext.userId();
        String currentUsername = UserContext.username();

        if ("team".equals(dataScope)) {
            if (UserContext.isTeamLeader() || UserContext.isSupervisorOrAbove()) {
                return true;
            }
            String myOrgUnitId = UserContext.orgUnitId();
            if (StringUtils.hasText(myOrgUnitId) && StringUtils.hasText(operatorId)) {
                return true;
            }
        }

        // own: 只能看自己
        if (StringUtils.hasText(operatorId) && StringUtils.hasText(currentUserId)) {
            return operatorId.equals(currentUserId);
        }
        if (StringUtils.hasText(operatorName) && StringUtils.hasText(currentUsername)) {
            return operatorName.equals(currentUsername);
        }

        return false;
    }

    /**
     * 获取当前用户可查看的操作人ID列表
     * 用于 IN 查询
     *
     * @return 操作人ID列表，null表示可查看所有
     */
    public static List<String> getAllowedOperatorIds() {
        String dataScope = UserContext.getDataScope();

        if ("all".equals(dataScope)) {
            return null; // null表示不限制
        }

        List<String> ids = new ArrayList<>();
        String userId = UserContext.userId();
        if (StringUtils.hasText(userId)) {
            ids.add(userId);
        }

        // 注意：当前 team 范围的权限检查未完全实现
        // 未来需要：查询 t_user_team 表判断是否同团队

        return ids;
    }

    /**
     * 为Map参数添加数据权限过滤参数
     * 用于MyBatis XML查询
     *
     * @param params 查询参数Map
     */
    public static void addPermissionParams(java.util.Map<String, Object> params) {
        String dataScope = UserContext.getDataScope();
        params.put("_dataScope", dataScope);
        params.put("_currentUserId", UserContext.userId());
        params.put("_currentUsername", UserContext.username());

        if ("team".equals(dataScope)) {
            params.put("_orgUnitId", UserContext.orgUnitId());
        }
    }

    // ==================== 工厂级数据隔离 ====================

    /**
     * 判断当前用户是否为工厂账号
     */
    public static boolean isFactoryAccount() {
        return StringUtils.hasText(UserContext.factoryId());
    }

    /**
     * 为 QueryWrapper 添加工厂级别过滤（直接模式）
     * 适用于实体表有 factory_id 字段的场景
     */
    public static <T> void applyFactoryFilter(QueryWrapper<T> wrapper, String factoryIdField) {
        String factoryId = UserContext.factoryId();
        if (StringUtils.hasText(factoryId)) {
            wrapper.eq(factoryIdField, factoryId);
        }
    }

    /**
     * 查询当前工厂账号关联的订单ID列表（间接模式）
     * 适用于实体通过 orderId 关联工厂的场景
     *
     * @param orderService 生产订单 Service
     * @return 工厂的订单ID列表，非工厂账号返回 null（不限制）
     */
    public static List<String> getFactoryOrderIds(
            com.fashion.supplychain.production.service.ProductionOrderService orderService) {
        String factoryId = UserContext.factoryId();
        if (!StringUtils.hasText(factoryId)) {
            return null; // 非工厂账号，不限制
        }
        return orderService.list(
                new LambdaQueryWrapper<com.fashion.supplychain.production.entity.ProductionOrder>()
                        .select(com.fashion.supplychain.production.entity.ProductionOrder::getId)
                        .eq(com.fashion.supplychain.production.entity.ProductionOrder::getFactoryId, factoryId)
                        .and(w -> w.isNull(com.fashion.supplychain.production.entity.ProductionOrder::getDeleteFlag)
                                .or().eq(com.fashion.supplychain.production.entity.ProductionOrder::getDeleteFlag, 0))
        ).stream()
                .map(com.fashion.supplychain.production.entity.ProductionOrder::getId)
                .collect(java.util.stream.Collectors.toList());
    }
}

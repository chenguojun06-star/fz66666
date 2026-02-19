package com.fashion.supplychain.common;

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
                // 组长看团队数据
                String teamId = UserContext.get() == null ? null : UserContext.get().getTeamId();
                if (StringUtils.hasText(teamId)) {
                    // 如果有团队ID，按团队过滤
                    wrapper.eq("team_id", teamId);
                    return true;
                }
                // 没有团队ID时退化为只看自己
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
            // 注意：当前未实现团队成员查询，仅允许组长查看所有
            // 未来需要：查询是否同一团队（通过 t_user_team 表）
            if (UserContext.isTeamLeader()) {
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
            UserContext ctx = UserContext.get();
            params.put("_teamId", ctx == null ? null : ctx.getTeamId());
        }
    }
}

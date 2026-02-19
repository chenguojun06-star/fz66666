package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * 订单转移编排器
 * <p>
 * 编排跨域调用：订单转移 + 系统用户搜索
 * 从 OrderTransferController 提取用户搜索逻辑（跨域调用 UserService）
 */
@Slf4j
@Service
public class OrderTransferOrchestrator {

    @Autowired
    private UserService userService;

    /**
     * 搜索可用用户（用于订单转移目标选择）
     *
     * @param keyword  搜索关键词（姓名/用户名/ID）
     * @param page     页码
     * @param pageSize 页大小
     * @return 用户列表（仅返回必要字段：id, name, username）
     */
    public Map<String, Object> searchTransferableUsers(String keyword, Long page, Long pageSize) {
        LambdaQueryWrapper<User> queryWrapper = new LambdaQueryWrapper<>();

        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(wrapper -> wrapper
                    .like(User::getName, keyword)
                    .or()
                    .like(User::getUsername, keyword)
                    .or()
                    .eq(User::getId, keyword));
        }

        queryWrapper.eq(User::getStatus, 1)
                .orderByAsc(User::getName);

        Page<User> userPage = userService.page(new Page<>(page, pageSize), queryWrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("total", userPage.getTotal());
        result.put("records", userPage.getRecords().stream().map(user -> {
            Map<String, Object> userInfo = new HashMap<>();
            userInfo.put("id", user.getId());
            userInfo.put("name", user.getName());
            userInfo.put("username", user.getUsername());
            return userInfo;
        }).toList());

        return result;
    }
}

package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.FactoryService;
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
 * 编排跨域调用：订单转移 + 系统用户/工厂搜索
 * 安全约束：所有搜索严格限定在当前租户内（同租户隔离），禁止跨租户转移
 */
@Slf4j
@Service
public class OrderTransferOrchestrator {

    @Autowired
    private UserService userService;

    @Autowired
    private FactoryService factoryService;

    /**
     * 搜索可用用户（订单转移目标 — 仅限同租户系统内部用户）
     *
     * @param keyword  搜索关键词（姓名/用户名）
     * @param page     页码
     * @param pageSize 页大小
     * @return 用户列表（仅返回必要字段：id, name, username）
     */
    public Map<String, Object> searchTransferableUsers(String keyword, Long page, Long pageSize) {
        Long currentTenantId = UserContext.tenantId();

        LambdaQueryWrapper<User> queryWrapper = new LambdaQueryWrapper<>();

        // ✅ 租户隔离：只能搜索同租户用户
        if (currentTenantId != null) {
            queryWrapper.eq(User::getTenantId, currentTenantId);
        }

        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(wrapper -> wrapper
                    .like(User::getName, keyword)
                    .or()
                    .like(User::getUsername, keyword));
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

    /**
     * 搜索可用工厂（订单转工厂 — 仅限同租户系统内部工厂）
     *
     * @param keyword  搜索关键词（工厂名称/编码）
     * @param page     页码
     * @param pageSize 页大小
     * @return 工厂列表（id, factoryCode, factoryName, contactPerson, contactPhone）
     */
    public Map<String, Object> searchTransferableFactories(String keyword, Long page, Long pageSize) {
        Long currentTenantId = UserContext.tenantId();

        LambdaQueryWrapper<Factory> queryWrapper = new LambdaQueryWrapper<>();

        // ✅ 租户隔离：只能搜索同租户工厂
        if (currentTenantId != null) {
            queryWrapper.eq(Factory::getTenantId, currentTenantId);
        }

        if (StringUtils.hasText(keyword)) {
            queryWrapper.and(wrapper -> wrapper
                    .like(Factory::getFactoryName, keyword)
                    .or()
                    .like(Factory::getFactoryCode, keyword));
        }

        // 只查启用状态的工厂
        queryWrapper.eq(Factory::getStatus, "active")
                .eq(Factory::getDeleteFlag, 0)
                .orderByAsc(Factory::getFactoryName);

        Page<Factory> factoryPage = factoryService.page(new Page<>(page, pageSize), queryWrapper);

        Map<String, Object> result = new HashMap<>();
        result.put("total", factoryPage.getTotal());
        result.put("records", factoryPage.getRecords().stream().map(factory -> {
            Map<String, Object> factoryInfo = new HashMap<>();
            factoryInfo.put("id", factory.getId());
            factoryInfo.put("factoryCode", factory.getFactoryCode());
            factoryInfo.put("factoryName", factory.getFactoryName());
            factoryInfo.put("contactPerson", factory.getContactPerson());
            factoryInfo.put("contactPhone", factory.getContactPhone());
            return factoryInfo;
        }).toList());

        return result;
    }
}

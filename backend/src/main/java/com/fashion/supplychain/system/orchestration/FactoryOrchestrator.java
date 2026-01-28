package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.LoginLogService;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class FactoryOrchestrator {

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private LoginLogService loginLogService;

    public IPage<Factory> list(String page, String pageSize, String factoryCode, String factoryName, String status) {
        int p = parsePositiveIntOrDefault(page, 1, "page");
        int ps = parsePositiveIntOrDefault(pageSize, 10, "pageSize");
        String code = normalize(factoryCode);
        String name = normalize(factoryName);
        String st = normalize(status);

        Page<Factory> pageInfo = new Page<>(p, ps);
        LambdaQueryWrapper<Factory> wrapper = new LambdaQueryWrapper<Factory>()
                .eq(Factory::getDeleteFlag, 0)
                .like(StringUtils.hasText(code), Factory::getFactoryCode, code)
                .like(StringUtils.hasText(name), Factory::getFactoryName, name)
                .eq(StringUtils.hasText(st), Factory::getStatus, st)
                .orderByDesc(Factory::getCreateTime);
        return factoryService.page(pageInfo, wrapper);
    }

    public Factory getById(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("参数错误");
        }
        Factory factory = factoryService.getById(id);
        if (factory == null || (factory.getDeleteFlag() != null && factory.getDeleteFlag() == 1)) {
            throw new NoSuchElementException("供应商不存在");
        }
        return factory;
    }

    public boolean save(Factory factory) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (factory == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        LocalDateTime now = LocalDateTime.now();
        factory.setCreateTime(now);
        factory.setUpdateTime(now);
        if (!StringUtils.hasText(factory.getStatus())) {
            factory.setStatus("active");
        }
        if (factory.getDeleteFlag() == null) {
            factory.setDeleteFlag(0);
        }
        boolean ok = factoryService.save(factory);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        saveOperationLog("factory", factory.getId(), "CREATE", null);
        return true;
    }

    public boolean update(Factory factory) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (factory == null || !StringUtils.hasText(factory.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        String remark = normalize(factory.getOperationRemark());
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        factory.setUpdateTime(LocalDateTime.now());
        boolean ok = factoryService.updateById(factory);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }
        saveOperationLog("factory", factory.getId(), "UPDATE", remark);
        return true;
    }

    public boolean delete(String id) {
        return delete(id, null);
    }

    public boolean delete(String id, String remark) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("参数错误");
        }
        String normalized = normalize(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        Factory factory = new Factory();
        factory.setId(id);
        factory.setDeleteFlag(1);
        factory.setUpdateTime(LocalDateTime.now());
        boolean ok = factoryService.updateById(factory);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        saveOperationLog("factory", id, "DELETE", normalized);
        return true;
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String v = value.trim();
        if (v.isEmpty() || "undefined".equalsIgnoreCase(v) || "null".equalsIgnoreCase(v)) {
            return null;
        }
        return v;
    }

    private void saveOperationLog(String bizType, String bizId, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, action, operator, remark);
        } catch (Exception e) {
        }
    }

    private static int parsePositiveIntOrDefault(String raw, int defaultValue, String name) {
        String v = normalize(raw);
        if (!StringUtils.hasText(v)) {
            return defaultValue;
        }
        try {
            int parsed = Integer.parseInt(v);
            if (parsed <= 0) {
                throw new IllegalArgumentException(name + "参数错误");
            }
            return parsed;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(name + "参数错误");
        }
    }
}

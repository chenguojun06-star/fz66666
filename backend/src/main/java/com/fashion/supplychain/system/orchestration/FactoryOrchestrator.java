package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.system.dto.FactoryOrganizationSnapshot;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.helper.OrganizationUnitBindingHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class FactoryOrchestrator {

    private static final Set<String> TERMINAL_STATUSES = Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private LoginLogService loginLogService;

    @Autowired
    private OrganizationUnitBindingHelper organizationUnitBindingHelper;

    @Autowired
    private ProductionOrderService productionOrderService;

    public IPage<Factory> list(String page, String pageSize, String factoryCode, String factoryName, String status,
            String supplierType, String factoryType, String parentOrgUnitId) {
        int p = parsePositiveIntOrDefault(page, 1, "page");
        int ps = parsePositiveIntOrDefault(pageSize, 10, "pageSize");
        String code = TextUtils.safeText(factoryCode);
        String name = TextUtils.safeText(factoryName);
        String st = TextUtils.safeText(status);
        String sType = TextUtils.safeText(supplierType);
        String fType = TextUtils.safeText(factoryType);
        String parentId = TextUtils.safeText(parentOrgUnitId);

        Page<Factory> pageInfo = new Page<>(p, ps);
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<Factory> wrapper = new LambdaQueryWrapper<Factory>()
                .eq(Factory::getDeleteFlag, 0)
                .eq(!UserContext.isSuperAdmin() && tenantId != null, Factory::getTenantId, tenantId)
                .like(StringUtils.hasText(code), Factory::getFactoryCode, code)
                .like(StringUtils.hasText(name), Factory::getFactoryName, name)
                .eq(StringUtils.hasText(st), Factory::getStatus, st)
                .eq(StringUtils.hasText(sType), Factory::getSupplierType, sType)
                .eq(StringUtils.hasText(fType), Factory::getFactoryType, fType)
                .eq(StringUtils.hasText(parentId), Factory::getParentOrgUnitId, parentId)
                .orderByDesc(Factory::getCreateTime);
        IPage<Factory> result = factoryService.page(pageInfo, wrapper);
        if (result != null && result.getRecords() != null) {
            result.getRecords().forEach(factory -> applySnapshot(factory, organizationUnitBindingHelper.getFactorySnapshot(factory)));
        }
        return result;
    }

    public Factory getById(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("参数错误");
        }
        Factory factory = factoryService.getById(id);
        if (factory == null || (factory.getDeleteFlag() != null && factory.getDeleteFlag() == 1)) {
            throw new NoSuchElementException("供应商不存在");
        }
        Long currentTenantId = UserContext.tenantId();
        if (!UserContext.isSuperAdmin() && currentTenantId != null && !currentTenantId.equals(factory.getTenantId())) {
            throw new IllegalStateException("无权访问其他租户的工厂信息");
        }
        applySnapshot(factory, organizationUnitBindingHelper.getFactorySnapshot(factory));
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
        if (!StringUtils.hasText(factory.getFactoryType())) {
            factory.setFactoryType("EXTERNAL");
        }
        if (factory.getDeleteFlag() == null) {
            factory.setDeleteFlag(0);
        }
        boolean ok = factoryService.save(factory);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        FactoryOrganizationSnapshot snapshot = organizationUnitBindingHelper.syncFactoryNode(factory);
        persistSnapshot(factory.getId(), snapshot);
        saveOperationLog("factory", factory.getId(), factory.getFactoryName(), "CREATE", null);
        return true;
    }

    public boolean update(Factory factory) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (factory == null || !StringUtils.hasText(factory.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        factory.setUpdateTime(LocalDateTime.now());
        if (!StringUtils.hasText(factory.getFactoryType())) {
            factory.setFactoryType("EXTERNAL");
        }
        boolean ok = factoryService.updateById(factory);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }
        Factory latest = factoryService.getById(factory.getId());
        if (latest != null) {
            latest.setParentOrgUnitId(factory.getParentOrgUnitId());
            latest.setFactoryType(factory.getFactoryType());
            FactoryOrganizationSnapshot snapshot = organizationUnitBindingHelper.syncFactoryNode(latest);
            persistSnapshot(latest.getId(), snapshot);
        }
        saveOperationLog("factory", factory.getId(), factory.getFactoryName(), "UPDATE", null);
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
        String normalized = TextUtils.safeText(remark);
        if (!StringUtils.hasText(normalized)) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        // 删除前先获取工厂名称用于日志
        Factory existing = factoryService.getById(id);
        String factoryName = existing != null ? existing.getFactoryName() : null;

        // 检查是否存在未完成的生产订单 — 有活跃订单时禁止删除
        long activeOrders = productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getFactoryId, id)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES));
        if (activeOrders > 0) {
            throw new IllegalStateException(
                    "该工厂存在 " + activeOrders + " 个未完成的生产订单，请在订单结算完成后再删除");
        }

        boolean ok = factoryService.removeById(id);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        organizationUnitBindingHelper.deleteFactoryNode(existing != null ? existing.getOrgUnitId() : null, id);
        saveOperationLog("factory", id, factoryName, "DELETE", normalized);
        return true;
    }

    private void persistSnapshot(String factoryId, FactoryOrganizationSnapshot snapshot) {
        if (!StringUtils.hasText(factoryId) || snapshot == null) {
            return;
        }
        Factory patch = new Factory();
        patch.setId(factoryId);
        patch.setOrgUnitId(snapshot.getOrgUnitId());
        patch.setParentOrgUnitId(snapshot.getParentOrgUnitId());
        patch.setParentOrgUnitName(snapshot.getParentOrgUnitName());
        patch.setOrgPath(snapshot.getOrgPath());
        patch.setFactoryType(snapshot.getFactoryType());
        patch.setUpdateTime(LocalDateTime.now());
        factoryService.updateById(patch);
    }

    private void applySnapshot(Factory factory, FactoryOrganizationSnapshot snapshot) {
        if (factory == null || snapshot == null) {
            return;
        }
        factory.setOrgUnitId(snapshot.getOrgUnitId());
        factory.setParentOrgUnitId(snapshot.getParentOrgUnitId());
        factory.setParentOrgUnitName(snapshot.getParentOrgUnitName());
        factory.setOrgPath(snapshot.getOrgPath());
        factory.setFactoryType(snapshot.getFactoryType());
    }

    // 使用TextUtils.safeText()替代

    private void saveOperationLog(String bizType, String bizId, String targetName, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, targetName, action, operator, remark);
        } catch (Exception e) {
            log.warn("FactoryOrchestrator.saveOperationLog 记录操作日志异常: bizType={}, bizId={}", bizType, bizId, e);
        }
    }

    private static int parsePositiveIntOrDefault(String raw, int defaultValue, String name) {
        String v = TextUtils.safeText(raw);
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

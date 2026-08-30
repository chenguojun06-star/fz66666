package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.procurement.entity.SupplierUser;
import com.fashion.supplychain.procurement.service.SupplierUserService;
import com.fashion.supplychain.system.dto.FactoryOrganizationSnapshot;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.helper.OrganizationUnitBindingHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.LoginLogService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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

    @Autowired
    private com.fashion.supplychain.production.service.MaterialPurchaseService materialPurchaseService;

    @Autowired
    private SupplierUserService supplierUserService;

    @Autowired
    private PasswordEncoder passwordEncoder;

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
                .eq(StringUtils.hasText(parentId), Factory::getParentOrgUnitId, parentId)
                .orderByDesc(Factory::getCreateTime);
        // D-218：内外标签筛选与列表展示同口径——外发厂（supplierType=OUTSOURCE，含"本厂"）归外部；
        // factoryType 存储值不动（工资/订单结算语义依赖它）
        if ("EXTERNAL".equals(fType)) {
            wrapper.and(w -> w.eq(Factory::getFactoryType, "EXTERNAL")
                    .or().eq(Factory::getSupplierType, "OUTSOURCE"));
        } else if ("INTERNAL".equals(fType)) {
            wrapper.eq(Factory::getFactoryType, "INTERNAL")
                    .and(w -> w.isNull(Factory::getSupplierType).or().ne(Factory::getSupplierType, "OUTSOURCE"));
        } else if (StringUtils.hasText(fType)) {
            wrapper.eq(Factory::getFactoryType, fType);
        }
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
        if (!UserContext.isSuperAdmin()) {
            if (currentTenantId == null || !currentTenantId.equals(factory.getTenantId())) {
                throw new IllegalStateException("无权访问其他租户的工厂信息");
            }
        }
        applySnapshot(factory, organizationUnitBindingHelper.getFactorySnapshot(factory));
        return factory;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(Factory factory) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (factory == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        if (!StringUtils.hasText(factory.getFactoryName())) {
            throw new IllegalArgumentException("供应商名称不能为空");
        }
        if (!StringUtils.hasText(factory.getFactoryCode())) {
            factory.setFactoryCode("F" + System.currentTimeMillis());
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
        if (!StringUtils.hasText(factory.getAdmissionStatus())) {
            factory.setAdmissionStatus("MATERIAL".equals(factory.getSupplierType()) ? "pending" : "approved");
        }
        if (factory.getTotalOrders() == null) {
            factory.setTotalOrders(0);
        }
        if (factory.getCompletedOrders() == null) {
            factory.setCompletedOrders(0);
        }
        if (factory.getOverdueOrders() == null) {
            factory.setOverdueOrders(0);
        }
        boolean ok = factoryService.save(factory);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        FactoryOrganizationSnapshot snapshot = organizationUnitBindingHelper.syncFactoryNode(factory);
        persistSnapshot(factory.getId(), snapshot);
        saveOperationLog("factory", factory.getId(), factory.getFactoryName(), "CREATE", null);

        if ("MATERIAL".equals(factory.getSupplierType())) {
            autoCreateSupplierUser(factory);
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(Factory factory) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        if (factory == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        if (!StringUtils.hasText(factory.getId())) {
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
            // D-243：内外标签变更后同步该工厂名下所有订单的 factory_type 快照。
            // 订单的 factory_type 只在下单时写入一次，若不同步，改过标签的工厂其历史订单
            // 会停留在旧值，导致外发管理页（按 factoryType=EXTERNAL 筛选）漏单或多单。
            int synced = syncOrderFactoryType(latest.getId(), snapshot != null ? snapshot.getFactoryType() : null);
            if (synced > 0) {
                saveOperationLog("factory", factory.getId(), factory.getFactoryName(), "SYNC_ORDER_FACTORY_TYPE",
                        "内外标签变更为 " + (snapshot != null ? snapshot.getFactoryType() : "") + "，同步订单 " + synced + " 条");
            }
        }
        saveOperationLog("factory", factory.getId(), factory.getFactoryName(), "UPDATE", null);
        return true;
    }

    /**
     * D-243：全量修复——按各工厂当前的内外标签快照，刷新其名下所有订单的 factory_type。
     * <p>
     * 用于清理历史脏数据：早期改过工厂标签、但订单快照未跟着更新的订单
     * （表现为外发管理页只看到个别工厂的订单，或把"本厂"的订单当成外发单）。
     * 快照值取自 {@code getFactorySnapshot}，因此最终以组织节点 ownerType 为准，
     * 与下单时的取值逻辑完全一致。
     *
     * @return 修复统计：涉及工厂数、更新订单数、每个工厂的明细
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> syncAllOrderFactoryType() {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        Long tenantId = UserContext.tenantId();
        List<Factory> factories = factoryService.list(new LambdaQueryWrapper<Factory>()
                .eq(Factory::getDeleteFlag, 0)
                .eq(!UserContext.isSuperAdmin() && tenantId != null, Factory::getTenantId, tenantId));

        int factoryCount = 0;
        int orderCount = 0;
        List<Map<String, Object>> details = new ArrayList<>();
        for (Factory f : factories) {
            if (f == null || !StringUtils.hasText(f.getId())) {
                continue;
            }
            FactoryOrganizationSnapshot snapshot = organizationUnitBindingHelper.getFactorySnapshot(f);
            String type = snapshot != null ? snapshot.getFactoryType() : null;
            if (!StringUtils.hasText(type)) {
                continue;
            }
            int updated = syncOrderFactoryType(f.getId(), type);
            factoryCount++;
            orderCount += updated;
            if (updated > 0) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("factoryId", f.getId());
                item.put("factoryName", f.getFactoryName());
                item.put("factoryType", type);
                item.put("updatedOrders", updated);
                details.add(item);
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("factoryCount", factoryCount);
        result.put("updatedOrders", orderCount);
        result.put("details", details);
        saveOperationLog("factory", null, "全部供应商", "SYNC_ORDER_FACTORY_TYPE",
                "全量同步订单内外标签：工厂 " + factoryCount + " 个，更新订单 " + orderCount + " 条");
        return result;
    }

    /**
     * 把某个工厂名下所有未删除订单的 factory_type 刷成指定值。
     *
     * @return 更新的订单条数
     */
    private int syncOrderFactoryType(String factoryId, String factoryType) {
        if (!StringUtils.hasText(factoryId) || !StringUtils.hasText(factoryType)) {
            return 0;
        }
        Long tenantId = UserContext.tenantId();
        try {
            // 用 baseMapper.update(null, wrapper) 而非 lambdaUpdate().update()：
            // 后者只返回 boolean 拿不到影响行数，这里需要真实条数做反馈统计
            LambdaUpdateWrapper<ProductionOrder> uw = new LambdaUpdateWrapper<>();
            uw.eq(ProductionOrder::getFactoryId, factoryId)
              .eq(ProductionOrder::getDeleteFlag, 0)
              .eq(!UserContext.isSuperAdmin() && tenantId != null, ProductionOrder::getTenantId, tenantId)
              .set(ProductionOrder::getFactoryType, factoryType);
            return productionOrderService.getBaseMapper().update(null, uw);
        } catch (Exception e) {
            log.warn("[工厂类型同步] 同步订单 factoryType 失败: factoryId={}, error={}", factoryId, e.getMessage());
            return 0;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        return delete(id, null);
    }

    @Transactional(rollbackFor = Exception.class)
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

        // 存在未完成的物料采购单（该供应商在途）时禁止删除：
        // 删除后采购单 supplierId 悬空、供应商门户登录直接失效
        try {
            long activePurchases = materialPurchaseService.count(
                    new LambdaQueryWrapper<com.fashion.supplychain.production.entity.MaterialPurchase>()
                            .eq(com.fashion.supplychain.production.entity.MaterialPurchase::getSupplierId, id)
                            .eq(com.fashion.supplychain.production.entity.MaterialPurchase::getTenantId,
                                    com.fashion.supplychain.common.UserContext.tenantId())
                            .eq(com.fashion.supplychain.production.entity.MaterialPurchase::getDeleteFlag, 0)
                            .notIn(com.fashion.supplychain.production.entity.MaterialPurchase::getStatus, "completed", "cancelled"));
            if (activePurchases > 0) {
                throw new IllegalStateException(
                        "该供应商存在 " + activePurchases + " 个未完成的物料采购单，请先处理完在途采购再删除");
            }
        } catch (IllegalStateException rethrow) {
            throw rethrow;
        } catch (Exception e) {
            // 采购校验失败不阻断删除（历史数据异常时以日志暴露），核心防护是上面的订单校验
            org.slf4j.LoggerFactory.getLogger(FactoryOrchestrator.class)
                    .warn("供应商删除前的在途采购校验失败: factoryId={}, error={}", id, e.getMessage());
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

    private void autoCreateSupplierUser(Factory factory) {
        try {
            String baseUsername = "supplier_" + factory.getFactoryCode();
            String username = baseUsername;
            int suffix = 1;
            while (supplierUserService.count(new LambdaQueryWrapper<SupplierUser>()
                    .eq(SupplierUser::getUsername, username)
                    .eq(SupplierUser::getDeleteFlag, 0)) > 0) {
                suffix++;
                username = baseUsername + "_" + suffix;
            }

            String initialPassword = generateInitialPassword();

            SupplierUser user = new SupplierUser();
            user.setSupplierId(factory.getId());
            user.setTenantId(factory.getTenantId());
            user.setUsername(username);
            user.setPasswordHash(passwordEncoder.encode(initialPassword));
            user.setContactPerson(factory.getContactPerson());
            user.setContactPhone(factory.getContactPhone());
            user.setStatus("ACTIVE");
            user.setDeleteFlag(0);
            user.setCreateTime(LocalDateTime.now());
            user.setUpdateTime(LocalDateTime.now());
            supplierUserService.save(user);

            log.info("[供应商账号] 自动创建: username={}, supplierId={}, supplierName={}",
                    username, factory.getId(), factory.getFactoryName());
        } catch (Exception e) {
            log.warn("[供应商账号] 自动创建失败(不影响供应商创建): supplierId={}, error={}", factory.getId(), e.getMessage());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean approveAdmission(String id, String action, String reason) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        Factory f = factoryService.getById(id);
        if (f == null) throw new NoSuchElementException("供应商不存在");

        String newStatus;
        switch (action) {
            case "approve": newStatus = "approved"; break;
            case "probation": newStatus = "probation"; break;
            case "reject": newStatus = "rejected"; break;
            case "suspend": newStatus = "suspended"; break;
            default: throw new IllegalArgumentException("无效操作: " + action);
        }

        Factory patch = new Factory();
        patch.setId(id);
        patch.setAdmissionStatus(newStatus);
        patch.setUpdateTime(LocalDateTime.now());
        if ("approved".equals(newStatus) && f.getAdmissionDate() == null) {
            patch.setAdmissionDate(LocalDateTime.now());
        }
        boolean ok = factoryService.updateById(patch);
        if (ok) {
            saveOperationLog("factory", id, f.getFactoryName(), "ADMISSION_" + action.toUpperCase(), reason);
        }
        return ok;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateContract(String id, Factory contractFields) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        Factory f = factoryService.getById(id);
        if (f == null) throw new NoSuchElementException("供应商不存在");

        Factory patch = new Factory();
        patch.setId(id);
        patch.setContractNo(contractFields.getContractNo());
        patch.setContractStartDate(contractFields.getContractStartDate());
        patch.setContractEndDate(contractFields.getContractEndDate());
        patch.setContractAmount(contractFields.getContractAmount());
        patch.setContractTerms(contractFields.getContractTerms());
        patch.setBankName(contractFields.getBankName());
        patch.setBankAccount(contractFields.getBankAccount());
        patch.setBankBranch(contractFields.getBankBranch());
        patch.setUpdateTime(LocalDateTime.now());
        boolean ok = factoryService.updateById(patch);
        if (ok) {
            saveOperationLog("factory", id, f.getFactoryName(), "CONTRACT_UPDATE", null);
        }
        return ok;
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

    private String generateInitialPassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        StringBuilder sb = new StringBuilder(8);
        java.util.Random rnd = new java.util.Random();
        for (int i = 0; i < 8; i++) {
            sb.append(chars.charAt(rnd.nextInt(chars.length())));
        }
        return sb.toString();
    }
}

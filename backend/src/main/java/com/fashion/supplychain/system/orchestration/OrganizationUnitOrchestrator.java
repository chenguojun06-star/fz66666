package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.helper.FactoryAccountHelper;
import com.fashion.supplychain.system.helper.OrganizationUnitBindingHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.OrganizationUnitService;
import com.fashion.supplychain.system.service.UserService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class OrganizationUnitOrchestrator {

    private static final Set<String> TERMINAL_STATUSES = Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired
    private OrganizationUnitService organizationUnitService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private OrganizationUnitBindingHelper bindingHelper;

    @Autowired
    private UserService userService;

    @Autowired
    private FactoryAccountHelper factoryAccountHelper;

    @Autowired
    private DictOrchestrator dictOrchestrator;

    @Autowired
    private com.fashion.supplychain.system.service.LoginLogService loginLogService;

    @Autowired
    private ProductionOrderService productionOrderService;

    public List<OrganizationUnit> tree() {
        // 对于超级管理员（平台方），如果不传递特定租户，应该允许他查看“当前自己”能看到的数据（系统层级），或者直接绕过租户限制查看全部数据。
        // 但前端组织架构树一般是基于单个租户构建的，混合展示会导致父子节点关系错乱。
        Long tenantId = UserContext.tenantId();
        
        List<OrganizationUnit> nodes;
        if (tenantId == null && UserContext.isSuperAdmin()) {
            // [修复 BUG] 超管 (admin) 本身没有 tenant_id。如果在页面上点击"初始化模板"，
            // 插入的数据 tenant_id=null。
            // 但如果这里返回 new ArrayList<>()，前端就永远看不到自己刚刚创建的节点了。
            // 因此，对于超管（且未指定租户），我们只查询 tenant_id IS NULL 的全局组织节点。
            nodes = bindingHelper.listTenantNodes(null);
        } else {
            nodes = bindingHelper.listTenantNodes(tenantId);
        }

        Map<String, OrganizationUnit> byId = nodes.stream()
                .filter(item -> StringUtils.hasText(item.getId()))
                .collect(Collectors.toMap(OrganizationUnit::getId, Function.identity(), (a, b) -> a));
        List<OrganizationUnit> roots = new ArrayList<>();
        nodes.sort(Comparator.comparing(OrganizationUnit::getSortOrder, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(OrganizationUnit::getCreateTime, Comparator.nullsLast(Comparator.naturalOrder())));
        for (OrganizationUnit node : nodes) {
            node.setChildren(new ArrayList<>());
        }
        for (OrganizationUnit node : nodes) {
            if (StringUtils.hasText(node.getParentId()) && byId.containsKey(node.getParentId())) {
                byId.get(node.getParentId()).getChildren().add(node);
            } else {
                roots.add(node);
            }
        }
        return roots;
    }

    public List<OrganizationUnit> departmentOptions() {
        LambdaQueryWrapper<OrganizationUnit> wrapper = new LambdaQueryWrapper<OrganizationUnit>()
                .eq(OrganizationUnit::getDeleteFlag, 0)
                .in(OrganizationUnit::getNodeType, "DEPARTMENT", "FACTORY")
                .orderByAsc(OrganizationUnit::getSortOrder)
                .orderByAsc(OrganizationUnit::getCreateTime);
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            wrapper.eq(OrganizationUnit::getTenantId, tenantId);
        }
        return organizationUnitService.list(wrapper);
    }

    private boolean isProductionRelated(OrganizationUnit unit) {
        if ("FACTORY".equals(unit.getNodeType())) return true;
        if (StringUtils.hasText(unit.getCategory())) {
            String cat = unit.getCategory().trim().toUpperCase();
            if (cat.contains("生产") || cat.contains("PRODUCTION")) return true;
        }
        return false;
    }

    public List<OrganizationUnit> productionGroupOptions() {
        LambdaQueryWrapper<OrganizationUnit> wrapper = new LambdaQueryWrapper<OrganizationUnit>()
                .eq(OrganizationUnit::getDeleteFlag, 0)
                .in(OrganizationUnit::getNodeType, "DEPARTMENT", "FACTORY")
                .orderByAsc(OrganizationUnit::getSortOrder)
                .orderByAsc(OrganizationUnit::getCreateTime);
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            wrapper.eq(OrganizationUnit::getTenantId, tenantId);
        }
        List<OrganizationUnit> all = organizationUnitService.list(wrapper);
        return all.stream().filter(this::isProductionRelated).collect(java.util.stream.Collectors.toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean createDepartment(OrganizationUnit unit) {
        assertAdmin();
        validateDepartment(unit, null);
        unit.setNodeType("DEPARTMENT");
        unit.setFactoryId(null);
        unit.setOwnerType(resolveOwnerType(unit.getOwnerType()));
        unit.setDeleteFlag(0);
        unit.setStatus(StringUtils.hasText(unit.getStatus()) ? unit.getStatus() : "active");
        unit.setSortOrder(unit.getSortOrder() == null ? 0 : unit.getSortOrder());
        unit.setCreateTime(LocalDateTime.now());
        unit.setUpdateTime(LocalDateTime.now());

        // 自动收录部门类别到字典
        if (StringUtils.hasText(unit.getCategory())) {
            dictOrchestrator.autoCollect("org_unit_category", unit.getCategory());
        }

        organizationUnitService.save(unit);
        bindingHelper.refreshPaths(unit.getTenantId() != null ? unit.getTenantId() : UserContext.tenantId());
        return true;
    }

    /**
     * 从预设模板批量初始化组织架构节点。
     * templateType: FACTORY（工厂/车间）或 INTERNAL（公司内部部门）
     */
    @Transactional(rollbackFor = Exception.class)
    public void initTemplate(String templateType, String rootName, String factoryId) {
        assertAdmin();
        if (!StringUtils.hasText(rootName) || rootName.trim().isEmpty()) {
            throw new IllegalArgumentException("根节点名称不能为空");
        }
        Long tenantId = UserContext.tenantId();
        String ownerType;
        List<String> childNames;
        if ("FACTORY".equalsIgnoreCase(templateType)) {
            ownerType = "EXTERNAL";
            childNames = List.of("车间一", "车间二", "车间三");
        } else if ("INTERNAL".equalsIgnoreCase(templateType)) {
            ownerType = "INTERNAL";
            childNames = List.of("生产部门", "财务部门", "行政部门");
        } else {
            throw new IllegalArgumentException("不支持的模板类型：" + templateType);
        }
        // 创建根节点
        OrganizationUnit root = buildUnit(rootName.trim(), null, ownerType, tenantId, 0);
        // 若选择了关联工厂，根节点绑定 factoryId
        if (StringUtils.hasText(factoryId)) {
            root.setFactoryId(factoryId);
        }
        organizationUnitService.save(root);
        String rootId = root.getId();
        // 批量创建子节点
        for (int i = 0; i < childNames.size(); i++) {
            OrganizationUnit child = buildUnit(childNames.get(i), rootId, ownerType, tenantId, i + 1);
            organizationUnitService.save(child);
        }
        bindingHelper.refreshPaths(tenantId);
        // 若关联了工厂，同步更新工厂的 orgUnitId
        if (StringUtils.hasText(factoryId)) {
            Factory factoryPatch = new Factory();
            factoryPatch.setId(factoryId);
            factoryPatch.setOrgUnitId(rootId);
            factoryService.updateById(factoryPatch);
        }
    }

    /** 构造一个标准部门节点（不含 factoryId） */
    private OrganizationUnit buildUnit(String name, String parentId, String ownerType, Long tenantId, int sortOrder) {
        OrganizationUnit u = new OrganizationUnit();
        u.setNodeName(name);
        u.setParentId(parentId);
        u.setNodeType("DEPARTMENT");
        u.setOwnerType(resolveOwnerType(ownerType));
        u.setDeleteFlag(0);
        u.setStatus("active");
        u.setSortOrder(sortOrder);
        u.setTenantId(tenantId);
        u.setCreateTime(LocalDateTime.now());
        u.setUpdateTime(LocalDateTime.now());
        return u;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean updateDepartment(OrganizationUnit unit) {
        assertAdmin();
        if (unit == null || !StringUtils.hasText(unit.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        OrganizationUnit existing = organizationUnitService.getById(unit.getId());
        if (existing == null || existing.getDeleteFlag() != null && existing.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("组织节点不存在");
        }
        validateDepartment(unit, existing.getId());
        existing.setNodeName(TextUtils.safeText(unit.getNodeName()));
        existing.setParentId(TextUtils.safeText(unit.getParentId()));
        existing.setOwnerType(resolveOwnerType(unit.getOwnerType()));
        existing.setSortOrder(unit.getSortOrder() == null ? 0 : unit.getSortOrder());
        existing.setStatus(StringUtils.hasText(unit.getStatus()) ? unit.getStatus() : existing.getStatus());
        // 同步更新管理人（如前端传了该字段）
        if (unit.getManagerUserId() != null) {
            existing.setManagerUserId(StringUtils.hasText(unit.getManagerUserId()) ? unit.getManagerUserId() : null);
            existing.setManagerUserName(StringUtils.hasText(unit.getManagerUserName()) ? unit.getManagerUserName() : null);
        }
        existing.setUpdateTime(LocalDateTime.now());
        organizationUnitService.updateById(existing);
        bindingHelper.refreshPaths(existing.getTenantId());
        return true;
    }

    /**
     * 设置/更换组织节点的审批负责人。
     * 负责人将负责审批该节点下成员发起的重要操作（删除/撤回/报废等）。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean setUnitManager(String unitId, String managerUserId) {
        assertAdmin();
        OrganizationUnit unit = organizationUnitService.getById(unitId);
        if (unit == null || unit.getDeleteFlag() != null && unit.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("组织节点不存在");
        }
        if (StringUtils.hasText(managerUserId)) {
            User manager = userService.getById(managerUserId);
            if (manager == null) throw new IllegalArgumentException("指定用户不存在");
            unit.setManagerUserId(managerUserId);
            unit.setManagerUserName(manager.getUsername());
        } else {
            unit.setManagerUserId(null);
            unit.setManagerUserName(null);
        }
        unit.setUpdateTime(LocalDateTime.now());
        organizationUnitService.updateById(unit);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean deleteDepartment(String id, String remark) {
        assertAdmin();
        if (!StringUtils.hasText(TextUtils.safeText(remark))) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        OrganizationUnit existing = organizationUnitService.getById(id);
        if (existing == null || existing.getDeleteFlag() != null && existing.getDeleteFlag() == 1) {
            throw new IllegalArgumentException("组织节点不存在");
        }
        long children = organizationUnitService.count(new LambdaQueryWrapper<OrganizationUnit>()
                .eq(OrganizationUnit::getParentId, id));
        if (children > 0) {
            throw new IllegalStateException("请先移走下级部门或工厂");
        }
        long activeOrdersByOrgUnit = productionOrderService.count(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getOrgUnitId, id)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES));
        if (activeOrdersByOrgUnit > 0) {
            throw new IllegalStateException(
                    "该组织存在 " + activeOrdersByOrgUnit + " 个未完成的生产订单，请在订单结算完成后再删除");
        }
        if (StringUtils.hasText(existing.getFactoryId())) {
            long activeOrdersByFactory = productionOrderService.count(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getFactoryId, existing.getFactoryId())
                            .eq(ProductionOrder::getDeleteFlag, 0)
                            .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES));
            if (activeOrdersByFactory > 0) {
                throw new IllegalStateException(
                        "该外发工厂存在 " + activeOrdersByFactory + " 个未完成的生产订单，请在订单结算完成后再删除");
            }
        }
        organizationUnitService.removeById(id);
        userService.lambdaUpdate()
                .eq(User::getOrgUnitId, id)
                .set(User::getOrgUnitId, null)
                .set(User::getOrgUnitName, null)
                .set(User::getOrgPath, null)
                .update();

        saveOperationLog("organization", id, existing.getNodeName(), "DELETE_DEPARTMENT", remark);

        return true;
    }

    /** 获取可分配的用户列表（同租户所有活跃用户） */
    public List<User> getAssignableUsers() {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<User>()
                .eq(User::getStatus, "active")
                .orderByAsc(User::getName);
        if (tenantId != null) {
            wrapper.eq(User::getTenantId, tenantId);
        }
        List<User> users = userService.list(wrapper);
        boolean isAdmin = UserContext.isSupervisorOrAbove();
        users.forEach(u -> sanitizeUser(u, isAdmin));
        return users;
    }

    /** 将用户分配到指定组织节点 */
    @Transactional(rollbackFor = Exception.class)
    public void assignMember(String userId, String orgUnitId) {
        assertAdmin();
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(orgUnitId)) {
            throw new IllegalArgumentException("参数不完整");
        }
        Long userIdLong;
        try {
            userIdLong = Long.valueOf(userId);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("用户ID格式错误");
        }
        OrganizationUnit unit = organizationUnitService.getById(orgUnitId);
        if (unit == null || (unit.getDeleteFlag() != null && unit.getDeleteFlag() == 1)) {
            throw new IllegalArgumentException("组织节点不存在或已停用");
        }
        User user = userService.getById(userIdLong);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        User patch = new User();
        patch.setId(userIdLong);
        patch.setOrgUnitId(orgUnitId);
        patch.setOrgUnitName(unit.getNodeName());
        patch.setOrgPath(unit.getPathNames());
        if (StringUtils.hasText(unit.getFactoryId()) && !"INTERNAL".equals(unit.getOwnerType())) {
            patch.setFactoryId(unit.getFactoryId());
        }
        userService.updateById(patch);
    }

    @Transactional(rollbackFor = Exception.class)
    public int batchAssignMembers(List<String> userIds, String orgUnitId) {
        assertAdmin();
        if (userIds == null || userIds.isEmpty() || !StringUtils.hasText(orgUnitId)) {
            throw new IllegalArgumentException("参数不完整");
        }
        OrganizationUnit unit = organizationUnitService.getById(orgUnitId);
        if (unit == null || (unit.getDeleteFlag() != null && unit.getDeleteFlag() == 1)) {
            throw new IllegalArgumentException("组织节点不存在或已停用");
        }
        int count = 0;
        for (String userId : userIds) {
            Long userIdLong;
            try {
                userIdLong = Long.valueOf(userId);
            } catch (NumberFormatException e) {
                continue;
            }
            User user = userService.getById(userIdLong);
            if (user == null) continue;
            User patch = new User();
            patch.setId(userIdLong);
            patch.setOrgUnitId(orgUnitId);
            patch.setOrgUnitName(unit.getNodeName());
            patch.setOrgPath(unit.getPathNames());
            if (StringUtils.hasText(unit.getFactoryId()) && !"INTERNAL".equals(unit.getOwnerType())) {
                patch.setFactoryId(unit.getFactoryId());
            }
            userService.updateById(patch);
            count++;
        }
        return count;
    }

    /** 从组织节点移出用户（清空归属） */
    @Transactional(rollbackFor = Exception.class)
    public void removeMember(String userId, String remark) {
        assertAdmin();
        if (!StringUtils.hasText(userId)) {
            throw new IllegalArgumentException("参数不完整");
        }
        if (!StringUtils.hasText(TextUtils.safeText(remark))) {
            throw new IllegalArgumentException("操作原因不能为空");
        }
        Long userIdLong;
        try {
            userIdLong = Long.valueOf(userId);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("用户ID格式错误");
        }
        userService.lambdaUpdate()
                .eq(User::getId, userIdLong)
                .set(User::getOrgUnitId, null)
                .set(User::getOrgUnitName, null)
                .set(User::getOrgPath, null)
                .update();

        // 记录操作日志
        User user = userService.getById(userIdLong);
        String targetName = user != null ? user.getUsername() : userId;
        saveOperationLog("organization", userId, targetName, "REMOVE_MEMBER", remark);
    }

    /**
     * 设置外发工厂主账号（老板）。
     * 同一工厂前一个主账号会被自动清除，确保每个工厂只有一个主账号。
     */
    @Transactional(rollbackFor = Exception.class)
    public void setFactoryOwner(String userId, String factoryId) {
        factoryAccountHelper.setFactoryOwner(userId, factoryId);
    }

    /**
     * 按组织节点分组返回成员列表（key=orgUnitId, value=该节点下的用户列表）
     */
    public Map<String, List<User>> membersByOrgUnit() {
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<User>()
                .eq(User::getStatus, "active")
                .isNotNull(User::getOrgUnitId)
                .ne(User::getOrgUnitId, "")
                .orderByAsc(User::getName);
        if (tenantId != null) {
            wrapper.eq(User::getTenantId, tenantId);
        }
        List<User> users = userService.list(wrapper);
        // 清除敏感字段（非管理员额外脱敏手机号、邮箱等 PII）
        boolean isAdmin = UserContext.isSupervisorOrAbove();
        users.forEach(u -> sanitizeUser(u, isAdmin));
        return users.stream().collect(Collectors.groupingBy(User::getOrgUnitId));
    }

    @Transactional(rollbackFor = Exception.class)
    public void ensureFactoryNodes() {
        LambdaQueryWrapper<Factory> wrapper = new LambdaQueryWrapper<Factory>()
                .eq(Factory::getDeleteFlag, 0)
                .orderByAsc(Factory::getCreateTime);
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            wrapper.eq(Factory::getTenantId, tenantId);
        }
        List<Factory> factories = factoryService.list(wrapper);
        for (Factory factory : factories) {
            bindingHelper.syncFactoryNode(factory);
        }
        List<Factory> patches = new java.util.ArrayList<>();
        for (Factory factory : factories) {
            Factory patch = new Factory();
            patch.setId(factory.getId());
            patch.setOrgUnitId(factory.getOrgUnitId());
            patch.setParentOrgUnitId(factory.getParentOrgUnitId());
            patch.setParentOrgUnitName(factory.getParentOrgUnitName());
            patch.setOrgPath(factory.getOrgPath());
            patch.setFactoryType(factory.getFactoryType());
            patches.add(patch);
        }
        if (!patches.isEmpty()) {
            factoryService.updateBatchById(patches);
        }
    }

    private void validateDepartment(OrganizationUnit unit, String selfId) {
        if (unit == null) {
            throw new IllegalArgumentException("参数不能为空");
        }
        String nodeName = TextUtils.safeText(unit.getNodeName());
        if (!StringUtils.hasText(nodeName)) {
            throw new IllegalArgumentException("部门名称不能为空");
        }
        String parentId = TextUtils.safeText(unit.getParentId());
        if (StringUtils.hasText(parentId)) {
            OrganizationUnit parent = organizationUnitService.getById(parentId);
            if (parent == null || parent.getDeleteFlag() != null && parent.getDeleteFlag() == 1) {
                throw new IllegalArgumentException("上级部门不存在");
            }
            if (!"DEPARTMENT".equalsIgnoreCase(parent.getNodeType())
                    && !"FACTORY".equalsIgnoreCase(parent.getNodeType())) {
                throw new IllegalArgumentException("上级节点必须是部门或工厂");
            }
            if (StringUtils.hasText(selfId) && selfId.equals(parentId)) {
                throw new IllegalArgumentException("部门不能挂到自己下面");
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void createFactoryAccount(String factoryId, String username, String password,
                                      String name, String phone) {
        factoryAccountHelper.createFactoryAccount(factoryId, username, password, name, phone);
    }

    private void assertAdmin() {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
    }

    /**
     * 清除用户敏感字段。管理员仅清除密码；普通员工额外脱敏手机号、邮箱等 PII。
     */
    private void sanitizeUser(User u, boolean isAdmin) {
        u.setPassword(null);
        if (!isAdmin) {
            u.setPhone(null);
            u.setEmail(null);
            u.setLastLoginIp(null);
            u.setOpenid(null);
        }
    }

    private String resolveOwnerType(String ownerType) {
        String value = TextUtils.safeText(ownerType);
        return StringUtils.hasText(value) ? value.toUpperCase() : "NONE";
    }

    private void saveOperationLog(String bizType, String bizId, String targetName, String action, String remark) {
        try {
            UserContext ctx = UserContext.get();
            String operator = (ctx != null ? ctx.getUsername() : null);
            loginLogService.recordOperation(bizType, bizId, targetName, action, operator, remark);
        } catch (Exception e) {
            log.warn("[OrgUnit] 保存操作日志失败: bizType={}, bizId={}", bizType, bizId, e);
        }
    }
}

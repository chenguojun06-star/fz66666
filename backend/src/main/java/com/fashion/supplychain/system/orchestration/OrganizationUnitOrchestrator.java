package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.helper.OrganizationUnitBindingHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.OrganizationUnitService;
import com.fashion.supplychain.system.service.UserService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class OrganizationUnitOrchestrator {

    @Autowired
    private OrganizationUnitService organizationUnitService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private OrganizationUnitBindingHelper bindingHelper;

    @Autowired
    private UserService userService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private DictOrchestrator dictOrchestrator;

    public List<OrganizationUnit> tree() {
        List<OrganizationUnit> nodes = bindingHelper.listTenantNodes(UserContext.tenantId());
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
                .eq(OrganizationUnit::getParentId, id)
                .eq(OrganizationUnit::getDeleteFlag, 0));
        if (children > 0) {
            throw new IllegalStateException("请先移走下级部门或工厂");
        }
        existing.setDeleteFlag(1);
        existing.setUpdateTime(LocalDateTime.now());
        organizationUnitService.updateById(existing);
        // 级联清除该部门下所有人员的组织归属
        userService.lambdaUpdate()
                .eq(User::getOrgUnitId, id)
                .set(User::getOrgUnitId, null)
                .update();
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
        userService.updateById(patch);
    }

    /** 从组织节点移出用户（清空归属） */
    @Transactional(rollbackFor = Exception.class)
    public void removeMember(String userId) {
        assertAdmin();
        if (!StringUtils.hasText(userId)) {
            throw new IllegalArgumentException("参数不完整");
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
                .update();
    }

    /**
     * 设置外发工厂主账号（老板）。
     * 同一工厂前一个主账号会被自动清除，确保每个工厂只有一个主账号。
     */
    @Transactional(rollbackFor = Exception.class)
    public void setFactoryOwner(String userId, String factoryId) {
        assertAdmin();
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(factoryId)) {
            throw new IllegalArgumentException("参数不完整");
        }
        Long userIdLong;
        try {
            userIdLong = Long.valueOf(userId);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("用户ID格式错误");
        }
        User user = userService.getById(userIdLong);
        if (user == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (!factoryId.equals(user.getFactoryId())) {
            throw new IllegalArgumentException("该用户不属于该工厂");
        }
        // 清除该工厂所有用户的主账号标记
        userService.lambdaUpdate()
                .eq(User::getFactoryId, factoryId)
                .set(User::getIsFactoryOwner, false)
                .update();
        // 设置目标用户为主账号
        userService.lambdaUpdate()
                .eq(User::getId, userIdLong)
                .set(User::getIsFactoryOwner, true)
                .update();
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
            Factory patch = new Factory();
            patch.setId(factory.getId());
            patch.setOrgUnitId(factory.getOrgUnitId());
            patch.setParentOrgUnitId(factory.getParentOrgUnitId());
            patch.setParentOrgUnitName(factory.getParentOrgUnitName());
            patch.setOrgPath(factory.getOrgPath());
            patch.setFactoryType(factory.getFactoryType());
            factoryService.updateById(patch);
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

    /**
     * 为外发工厂直接创建登录账号（管理员操作，账号立即激活）。
     * 创建后工厂老板可用此账号登录，自行维护工人名册。
     */
    @Transactional(rollbackFor = Exception.class)
    public void createFactoryAccount(String factoryId, String username, String password,
                                      String name, String phone) {
        assertAdmin();
        if (!StringUtils.hasText(factoryId) || !StringUtils.hasText(username)
                || !StringUtils.hasText(password)) {
            throw new IllegalArgumentException("工厂ID、用户名、密码不能为空");
        }
        Long tenantId = UserContext.tenantId();
        // 验证工厂存在且属于当前租户
        LambdaQueryWrapper<Factory> fq = new LambdaQueryWrapper<Factory>()
                .eq(Factory::getId, factoryId)
                .eq(Factory::getDeleteFlag, 0);
        if (tenantId != null) {
            fq.eq(Factory::getTenantId, tenantId);
        }
        Factory factory = factoryService.getOne(fq);
        if (factory == null) {
            throw new IllegalArgumentException("工厂不存在");
        }
        // 验证用户名全局唯一
        QueryWrapper<User> uq = new QueryWrapper<User>().eq("username", username);
        if (userService.count(uq) > 0) {
            throw new IllegalArgumentException("用户名已存在: " + username);
        }
        // 创建工厂账号（直接激活，不需要审批）
        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(password));
        user.setName(StringUtils.hasText(name) ? name : username);
        user.setPhone(phone);
        user.setTenantId(tenantId);
        user.setFactoryId(factoryId);
        user.setIsFactoryOwner(true);
        user.setIsTenantOwner(false);
        user.setStatus("active");
        user.setPermissionRange("self");
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        // 清除同工厂其他账号的主账号标记
        userService.lambdaUpdate()
                .eq(User::getFactoryId, factoryId)
                .set(User::getIsFactoryOwner, false)
                .update();
        userService.saveUser(user);
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
}

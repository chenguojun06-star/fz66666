package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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

    public List<OrganizationUnit> tree() {
        ensureFactoryNodes();
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
        ensureFactoryNodes();
        LambdaQueryWrapper<OrganizationUnit> wrapper = new LambdaQueryWrapper<OrganizationUnit>()
                .eq(OrganizationUnit::getDeleteFlag, 0)
                .eq(OrganizationUnit::getNodeType, "DEPARTMENT")
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
        organizationUnitService.save(unit);
        bindingHelper.refreshPaths(unit.getTenantId() != null ? unit.getTenantId() : UserContext.tenantId());
        return true;
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
        if (!"DEPARTMENT".equalsIgnoreCase(existing.getNodeType())) {
            throw new IllegalArgumentException("工厂节点请到供应商管理维护");
        }
        validateDepartment(unit, existing.getId());
        existing.setNodeName(TextUtils.safeText(unit.getNodeName()));
        existing.setParentId(TextUtils.safeText(unit.getParentId()));
        existing.setOwnerType(resolveOwnerType(unit.getOwnerType()));
        existing.setSortOrder(unit.getSortOrder() == null ? 0 : unit.getSortOrder());
        existing.setStatus(StringUtils.hasText(unit.getStatus()) ? unit.getStatus() : existing.getStatus());
        existing.setUpdateTime(LocalDateTime.now());
        organizationUnitService.updateById(existing);
        bindingHelper.refreshPaths(existing.getTenantId());
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
        if (!"DEPARTMENT".equalsIgnoreCase(existing.getNodeType())) {
            throw new IllegalArgumentException("工厂节点请到供应商管理维护");
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
        return true;
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
        // 清除敏感字段
        users.forEach(u -> u.setPassword(null));
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
            if (!"DEPARTMENT".equalsIgnoreCase(parent.getNodeType())) {
                throw new IllegalArgumentException("上级节点必须是部门");
            }
            if (StringUtils.hasText(selfId) && selfId.equals(parentId)) {
                throw new IllegalArgumentException("部门不能挂到自己下面");
            }
        }
    }

    private void assertAdmin() {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
    }

    private String resolveOwnerType(String ownerType) {
        String value = TextUtils.safeText(ownerType);
        return StringUtils.hasText(value) ? value.toUpperCase() : "NONE";
    }
}

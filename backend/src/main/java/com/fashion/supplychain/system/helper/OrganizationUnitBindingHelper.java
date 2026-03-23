package com.fashion.supplychain.system.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.dto.FactoryOrganizationSnapshot;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.OrganizationUnitService;
import com.fashion.supplychain.system.service.UserService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
public class OrganizationUnitBindingHelper {

    @Autowired
    private OrganizationUnitService organizationUnitService;

    @Autowired
    private UserService userService;

    public void validateDepartmentParent(String parentId) {
        if (!StringUtils.hasText(parentId)) {
            return;
        }
        OrganizationUnit parent = organizationUnitService.getById(parentId);
        if (parent == null || isDeleted(parent)) {
            throw new IllegalArgumentException("归属部门不存在");
        }
        if (!"DEPARTMENT".equalsIgnoreCase(parent.getNodeType())) {
            throw new IllegalArgumentException("工厂只能归属于部门节点");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public FactoryOrganizationSnapshot syncFactoryNode(Factory factory) {
        if (factory == null || !StringUtils.hasText(factory.getId())) {
            throw new IllegalArgumentException("工厂信息不完整");
        }
        validateDepartmentParent(factory.getParentOrgUnitId());

        OrganizationUnit node = null;
        if (StringUtils.hasText(factory.getOrgUnitId())) {
            node = organizationUnitService.getById(factory.getOrgUnitId());
        }
        if (node == null) {
            node = organizationUnitService.getOne(new LambdaQueryWrapper<OrganizationUnit>()
                    .eq(OrganizationUnit::getFactoryId, factory.getId())
                    .eq(OrganizationUnit::getDeleteFlag, 0)
                    .last("limit 1"));
        }

        LocalDateTime now = LocalDateTime.now();
        if (node == null) {
            node = new OrganizationUnit();
            node.setFactoryId(factory.getId());
            node.setCreateTime(now);
            node.setDeleteFlag(0);
            node.setSortOrder(0);
            node.setTenantId(factory.getTenantId() != null ? factory.getTenantId() : UserContext.tenantId());
        }
        node.setParentId(trim(factory.getParentOrgUnitId()));
        node.setNodeName(trim(factory.getFactoryName()));
        node.setNodeType("FACTORY");
        node.setOwnerType(resolveFactoryType(factory.getFactoryType()));
        node.setStatus(StringUtils.hasText(factory.getStatus()) ? factory.getStatus() : "active");
        node.setUpdateTime(now);

        organizationUnitService.saveOrUpdate(node);
        refreshPaths(node.getTenantId());

        OrganizationUnit latest = organizationUnitService.getById(node.getId());
        FactoryOrganizationSnapshot snapshot = toSnapshot(factory, latest);
        factory.setOrgUnitId(snapshot.getOrgUnitId());
        factory.setParentOrgUnitId(snapshot.getParentOrgUnitId());
        factory.setParentOrgUnitName(snapshot.getParentOrgUnitName());
        factory.setOrgPath(snapshot.getOrgPath());
        factory.setFactoryType(snapshot.getFactoryType());
        return snapshot;
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteFactoryNode(String orgUnitId, String factoryId) {
        OrganizationUnit node = null;
        if (StringUtils.hasText(orgUnitId)) {
            node = organizationUnitService.getById(orgUnitId);
        }
        if (node == null && StringUtils.hasText(factoryId)) {
            node = organizationUnitService.getOne(new LambdaQueryWrapper<OrganizationUnit>()
                    .eq(OrganizationUnit::getFactoryId, factoryId)
                    .eq(OrganizationUnit::getDeleteFlag, 0)
                    .last("limit 1"));
        }
        if (node == null) {
            return;
        }
        String nodeOrgUnitId = node.getId();
        organizationUnitService.removeById(nodeOrgUnitId);
        // 工厂删除时级联清除该节点下所有成员的组织归属
        if (org.springframework.util.StringUtils.hasText(nodeOrgUnitId)) {
            userService.lambdaUpdate()
                    .eq(User::getOrgUnitId, nodeOrgUnitId)
                    .set(User::getOrgUnitId, null)
                    .update();
        }
    }

    public FactoryOrganizationSnapshot getFactorySnapshot(Factory factory) {
        if (factory == null) {
            return emptySnapshot();
        }
        OrganizationUnit node = null;
        if (StringUtils.hasText(factory.getOrgUnitId())) {
            node = organizationUnitService.getById(factory.getOrgUnitId());
        }
        if (node == null && StringUtils.hasText(factory.getId())) {
            node = organizationUnitService.getOne(new LambdaQueryWrapper<OrganizationUnit>()
                    .eq(OrganizationUnit::getFactoryId, factory.getId())
                    .eq(OrganizationUnit::getDeleteFlag, 0)
                    .last("limit 1"));
        }
        return toSnapshot(factory, node);
    }

    public List<OrganizationUnit> listTenantNodes(Long tenantId) {
        LambdaQueryWrapper<OrganizationUnit> wrapper = new LambdaQueryWrapper<OrganizationUnit>()
                .eq(OrganizationUnit::getDeleteFlag, 0)
                .orderByAsc(OrganizationUnit::getSortOrder)
                .orderByAsc(OrganizationUnit::getCreateTime);
        if (tenantId != null) {
            wrapper.eq(OrganizationUnit::getTenantId, tenantId);
        }
        return organizationUnitService.list(wrapper);
    }

    @Transactional(rollbackFor = Exception.class)
    public void refreshPaths(Long tenantId) {
        List<OrganizationUnit> nodes = listTenantNodes(tenantId);
        Map<String, OrganizationUnit> byId = nodes.stream()
                .filter(item -> StringUtils.hasText(item.getId()))
                .collect(Collectors.toMap(OrganizationUnit::getId, Function.identity(), (a, b) -> a));
        List<OrganizationUnit> ordered = new ArrayList<>(nodes);
        ordered.sort(Comparator.comparing((OrganizationUnit item) -> depth(item, byId))
                .thenComparing(OrganizationUnit::getCreateTime, Comparator.nullsLast(Comparator.naturalOrder())));

        for (OrganizationUnit item : ordered) {
            OrganizationUnit parent = StringUtils.hasText(item.getParentId()) ? byId.get(item.getParentId()) : null;
            String pathIds = parent == null ? item.getId() : joinPath(parent.getPathIds(), item.getId());
            String pathNames = parent == null ? item.getNodeName() : joinPath(parent.getPathNames(), item.getNodeName());
            if (!Objects.equals(pathIds, item.getPathIds()) || !Objects.equals(pathNames, item.getPathNames())) {
                OrganizationUnit patch = new OrganizationUnit();
                patch.setId(item.getId());
                patch.setPathIds(pathIds);
                patch.setPathNames(pathNames);
                patch.setUpdateTime(LocalDateTime.now());
                organizationUnitService.updateById(patch);
                item.setPathIds(pathIds);
                item.setPathNames(pathNames);
            }
        }
    }

    private FactoryOrganizationSnapshot toSnapshot(Factory factory, OrganizationUnit node) {
        FactoryOrganizationSnapshot snapshot = emptySnapshot();
        if (factory == null) {
            return snapshot;
        }
        snapshot.setFactoryId(factory.getId());
        snapshot.setFactoryName(factory.getFactoryName());
        snapshot.setFactoryType(resolveFactoryType(factory.getFactoryType()));
        if (node != null && !isDeleted(node)) {
            snapshot.setOrgUnitId(node.getId());
            snapshot.setOrgPath(node.getPathNames());
            snapshot.setFactoryType(StringUtils.hasText(node.getOwnerType()) ? node.getOwnerType() : snapshot.getFactoryType());
            if (StringUtils.hasText(node.getParentId())) {
                OrganizationUnit parent = organizationUnitService.getById(node.getParentId());
                if (parent != null && !isDeleted(parent)) {
                    snapshot.setParentOrgUnitId(parent.getId());
                    snapshot.setParentOrgUnitName(parent.getNodeName());
                }
            }
        } else {
            snapshot.setParentOrgUnitId(trim(factory.getParentOrgUnitId()));
            snapshot.setParentOrgUnitName(trim(factory.getParentOrgUnitName()));
            snapshot.setOrgUnitId(trim(factory.getOrgUnitId()));
            snapshot.setOrgPath(trim(factory.getOrgPath()));
        }
        return snapshot;
    }

    private FactoryOrganizationSnapshot emptySnapshot() {
        FactoryOrganizationSnapshot snapshot = new FactoryOrganizationSnapshot();
        snapshot.setFactoryType("EXTERNAL");
        return snapshot;
    }

    private boolean isDeleted(OrganizationUnit item) {
        return item != null && item.getDeleteFlag() != null && item.getDeleteFlag() == 1;
    }

    private int depth(OrganizationUnit item, Map<String, OrganizationUnit> byId) {
        int depth = 0;
        OrganizationUnit cursor = item;
        while (cursor != null && StringUtils.hasText(cursor.getParentId())) {
            depth++;
            cursor = byId.get(cursor.getParentId());
            if (depth > 32) {
                break;
            }
        }
        return depth;
    }

    private String joinPath(String parentPath, String value) {
        if (!StringUtils.hasText(parentPath)) {
            return value;
        }
        return parentPath + " / " + value;
    }

    private String resolveFactoryType(String factoryType) {
        return StringUtils.hasText(factoryType) ? factoryType.trim().toUpperCase() : "EXTERNAL";
    }

    private String trim(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}

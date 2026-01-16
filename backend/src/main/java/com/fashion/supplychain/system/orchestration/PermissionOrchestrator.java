package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.dto.PermissionNode;
import com.fashion.supplychain.system.entity.Permission;
import com.fashion.supplychain.system.service.PermissionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;

@Service
public class PermissionOrchestrator {

    @Autowired
    private PermissionService permissionService;

    public Page<Permission> list(Long page, Long pageSize, String permissionName, String permissionCode,
            String status) {
        return permissionService.getPermissionPage(page, pageSize, permissionName, permissionCode, status);
    }

    public List<PermissionNode> tree(String status) {
        List<Permission> list = permissionService.list();
        if (list == null || list.isEmpty()) {
            return List.of();
        }

        List<Permission> filtered = list;
        if (status != null && !status.isBlank()) {
            String s = status.trim();
            filtered = list.stream().filter(p -> Objects.equals(s, p.getStatus())).toList();
        }

        Map<Long, PermissionNode> byId = new HashMap<>();
        for (Permission p : filtered) {
            if (p.getId() == null) {
                continue;
            }
            PermissionNode n = new PermissionNode();
            n.setId(p.getId());
            n.setPermissionName(p.getPermissionName());
            n.setPermissionCode(p.getPermissionCode());
            n.setParentId(p.getParentId());
            n.setParentName(p.getParentName());
            n.setPermissionType(p.getPermissionType());
            n.setPath(p.getPath());
            n.setComponent(p.getComponent());
            n.setIcon(p.getIcon());
            n.setSort(p.getSort());
            n.setStatus(p.getStatus());
            n.setCreateTime(p.getCreateTime());
            n.setUpdateTime(p.getUpdateTime());
            byId.put(n.getId(), n);
        }

        List<PermissionNode> roots = new ArrayList<>();
        for (PermissionNode node : byId.values()) {
            Long pid = node.getParentId();
            if (pid == null || pid == 0 || !byId.containsKey(pid)) {
                roots.add(node);
                continue;
            }
            byId.get(pid).getChildren().add(node);
        }

        Comparator<PermissionNode> cmp = Comparator
                .comparing((PermissionNode n) -> n.getSort() == null ? 0 : n.getSort())
                .thenComparing(n -> n.getId() == null ? 0 : n.getId());
        sortTree(roots, cmp);

        return roots;
    }

    public Permission getById(Long id) {
        Permission permission = permissionService.getById(id);
        if (permission == null) {
            throw new NoSuchElementException("权限不存在");
        }
        return permission;
    }

    public boolean add(Permission permission) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        boolean success = permissionService.save(permission);
        if (!success) {
            throw new IllegalStateException("新增失败");
        }
        return true;
    }

    public boolean update(Permission permission) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        boolean success = permissionService.updateById(permission);
        if (!success) {
            throw new IllegalStateException("更新失败");
        }
        return true;
    }

    public boolean delete(Long id) {
        if (!UserContext.isTopAdmin()) {
            throw new AccessDeniedException("无权限操作");
        }
        boolean success = permissionService.removeById(id);
        if (!success) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    private void sortTree(List<PermissionNode> nodes, Comparator<PermissionNode> comparator) {
        if (nodes == null || nodes.isEmpty()) {
            return;
        }
        nodes.sort(comparator);
        for (PermissionNode n : nodes) {
            sortTree(n.getChildren(), comparator);
        }
    }
}

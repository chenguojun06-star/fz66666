package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.OrganizationUnitOrchestrator;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system/organization")
@PreAuthorize("isAuthenticated()")
public class OrganizationUnitController {

    @Autowired
    private OrganizationUnitOrchestrator organizationUnitOrchestrator;

    @GetMapping("/tree")
    public Result<List<OrganizationUnit>> tree() {
        return Result.success(organizationUnitOrchestrator.tree());
    }

    @GetMapping("/departments")
    public Result<List<OrganizationUnit>> departments() {
        return Result.success(organizationUnitOrchestrator.departmentOptions());
    }

    @GetMapping("/production-groups")
    public Result<List<OrganizationUnit>> productionGroups() {
        return Result.success(organizationUnitOrchestrator.productionGroupOptions());
    }

    @GetMapping("/members")
    public Result<Map<String, List<User>>> members() {
        return Result.success(organizationUnitOrchestrator.membersByOrgUnit());
    }

    @GetMapping("/assignable-users")
    public Result<List<User>> assignableUsers() {
        return Result.success(organizationUnitOrchestrator.getAssignableUsers());
    }

    @PostMapping("/assign-member")
    public Result<Void> assignMember(@RequestBody Map<String, String> body) {
        organizationUnitOrchestrator.assignMember(body.get("userId"), body.get("orgUnitId"));
        return Result.success(null);
    }

    @PostMapping("/assign-members")
    public Result<Integer> assignMembers(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<String> userIds = (List<String>) body.get("userIds");
        String orgUnitId = (String) body.get("orgUnitId");
        int count = organizationUnitOrchestrator.batchAssignMembers(userIds, orgUnitId);
        return Result.success(count);
    }

    @PostMapping("/remove-member")
    public Result<Void> removeMember(@RequestBody Map<String, String> body) {
        organizationUnitOrchestrator.removeMember(body.get("userId"), body.get("remark"));
        return Result.success(null);
    }

    /**
     * 设置外发工厂主账号（老板/联系人）。
     * body: { userId, factoryId }
     * 同一工厂原主账号自动清除，每个工厂只有一个主账号。
     */
    @PostMapping("/factory/set-owner")
    public Result<Void> setFactoryOwner(@RequestBody Map<String, String> body) {
        organizationUnitOrchestrator.setFactoryOwner(body.get("userId"), body.get("factoryId"));
        return Result.success(null);
    }

    /**
     * 为外发工厂直接创建登录账号（管理员直接创建，账号立即激活）。
     * body: { factoryId, username, password, name?, phone? }
     */
    @PostMapping("/factory/create-account")
    public Result<Void> createFactoryAccount(@RequestBody Map<String, String> body) {
        organizationUnitOrchestrator.createFactoryAccount(
                body.get("factoryId"), body.get("username"),
                body.get("password"), body.get("name"), body.get("phone"));
        return Result.success(null);
    }

    @PostMapping
    public Result<Boolean> create(@RequestBody OrganizationUnit unit) {
        return Result.success(organizationUnitOrchestrator.createDepartment(unit));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody OrganizationUnit unit) {
        return Result.success(organizationUnitOrchestrator.updateDepartment(unit));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id, @RequestParam(required = false) String remark) {
        return Result.success(organizationUnitOrchestrator.deleteDepartment(id, remark));
    }

    /**
     * 设置组织节点的审批负责人
     * body: { managerUserId: "xxx" }  传空字符串表示清除
     */
    @PostMapping("/{id}/set-manager")
    public Result<Boolean> setManager(@PathVariable String id, @RequestBody Map<String, String> body) {
        return Result.success(organizationUnitOrchestrator.setUnitManager(id, body.get("managerUserId")));
    }

    /**
     * 从模板批量初始化组织架构（仅超管可用）。
     * body: { templateType: "FACTORY" | "INTERNAL", rootName: "xxx" }
     */
    @PostMapping("/init-template")
    public Result<Void> initTemplate(@RequestBody Map<String, String> body) {
        organizationUnitOrchestrator.initTemplate(body.get("templateType"), body.get("rootName"), body.get("factoryId"));
        return Result.success(null);
    }
}

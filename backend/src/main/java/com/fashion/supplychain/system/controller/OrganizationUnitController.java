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

    @PostMapping("/remove-member")
    public Result<Void> removeMember(@RequestBody Map<String, String> body) {
        organizationUnitOrchestrator.removeMember(body.get("userId"));
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
}

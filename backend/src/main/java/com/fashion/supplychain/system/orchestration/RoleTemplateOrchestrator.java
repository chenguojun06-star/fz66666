package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Role;
import com.fashion.supplychain.system.entity.RoleTemplate;
import com.fashion.supplychain.system.service.RoleService;
import com.fashion.supplychain.system.service.RoleTemplateService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 角色模板编排层
 *
 * <p>覆盖「模板列表 / 模板详情 / 按模板建角色 / 新租户检测 / 一键初始化」。
 * {@code RoleTemplateController} 原先直接注入 {@code RoleTemplateService} +
 * {@code RoleService}（D-630 规则6 违规），现由本层承接；
 * 实际建角色的写操作仍复用 {@link RoleOrchestrator#applyTemplate}（事务在那一层）。
 *
 * <p><b>返回 {@link Result}：</b>与重构前 Controller 直接返回 {@code Result} 的语义逐字一致。
 */
@Slf4j
@Service
public class RoleTemplateOrchestrator {

    @Autowired
    private RoleTemplateService roleTemplateService;

    @Autowired
    private RoleService roleService;

    @Autowired
    private RoleOrchestrator roleOrchestrator;

    /** 获取启用中的角色模板列表（按 sortOrder 升序）。 */
    public Result<List<RoleTemplate>> list() {
        List<RoleTemplate> templates = roleTemplateService.lambdaQuery()
                .eq(RoleTemplate::getDeleteFlag, 0)
                .eq(RoleTemplate::getEnabled, true)
                .orderByAsc(RoleTemplate::getSortOrder)
                .list();
        return Result.success(templates);
    }

    /** 根据 ID 获取角色模板详情。 */
    public Result<RoleTemplate> getById(Long id) {
        RoleTemplate template = roleTemplateService.lambdaQuery()
                .eq(RoleTemplate::getId, id)
                .eq(RoleTemplate::getDeleteFlag, 0)
                .one();
        if (template == null) {
            return Result.fail("模板不存在");
        }
        return Result.success(template);
    }

    /** 根据模板创建角色（写操作在 {@link RoleOrchestrator} 内完成，含事务）。 */
    public Result<Long> apply(Long templateId, String roleName, String remark) {
        return Result.success(roleOrchestrator.applyTemplate(templateId, roleName, remark));
    }

    /**
     * 检测是否为新租户（该租户尚未创建过任何非模板角色）。
     *
     * <p>新租户额外返回推荐模板列表（{@code isDefault = true}），供前端引导一键初始化。
     */
    public Result<Map<String, Object>> checkNewTenant() {
        Long tenantId = UserContext.tenantId();

        long roleCount = roleService.lambdaQuery()
                .eq(Role::getTenantId, tenantId)
                .ne(Role::getIsTemplate, true) // 排除模板
                .count();

        Map<String, Object> result = new HashMap<>();
        result.put("isNewTenant", roleCount == 0);
        result.put("roleCount", roleCount);

        if (roleCount == 0) {
            List<RoleTemplate> templates = roleTemplateService.lambdaQuery()
                    .eq(RoleTemplate::getDeleteFlag, 0)
                    .eq(RoleTemplate::getEnabled, true)
                    .eq(RoleTemplate::getIsDefault, true) // 只返回默认模板
                    .orderByAsc(RoleTemplate::getSortOrder)
                    .list();
            result.put("recommendedTemplates", templates);
        }

        return Result.success(result);
    }

    /**
     * 快速初始化：一键应用多个推荐模板创建基础角色。
     *
     * <p>逐个模板独立提交，单个失败只记日志不中断 —— 保证「能建几个建几个」，
     * 与重构前行为一致。
     */
    public Result<Map<String, Object>> quickSetup(List<Long> templateIds) {
        if (templateIds == null || templateIds.isEmpty()) {
            return Result.badRequest("请选择至少一个模板");
        }

        List<Long> createdRoleIds = new ArrayList<>();
        for (Long templateId : templateIds) {
            try {
                Long roleId = roleOrchestrator.applyTemplate(templateId, null, "新租户快速初始化");
                createdRoleIds.add(roleId);
            } catch (Exception e) {
                log.warn("应用模板失败: templateId={}, error={}", templateId, e.getMessage());
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("createdCount", createdRoleIds.size());
        result.put("createdRoleIds", createdRoleIds);

        return Result.success(result);
    }
}

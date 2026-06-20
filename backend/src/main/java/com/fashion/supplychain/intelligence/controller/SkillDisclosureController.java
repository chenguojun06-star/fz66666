package com.fashion.supplychain.intelligence.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.skill.SkillDisclosureLoader;
import com.fashion.supplychain.intelligence.entity.SkillTemplate;
import com.fashion.supplychain.intelligence.mapper.SkillTemplateMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Skill 三层渐进式披露查询接口（P1-1 改造）。
 *
 * <p>借鉴 Claude Agent SDK 2026-01 Skills 规范，提供三层按需加载：
 * <ul>
 *   <li>GET  /api/intelligence/skills/{skillId}/metadata   — 仅返回 metadata 层（~50 tokens）</li>
 *   <li>GET  /api/intelligence/skills/{skillId}/skill-md   — 返回 SKILL.md 层（~500 tokens）</li>
 *   <li>POST /api/intelligence/skills/{skillId}/references — 按 query 返回 references 层</li>
 * </ul>
 *
 * <p>权限：登录用户 + 租户隔离（查询带 tenant_id）。
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence/skills")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class SkillDisclosureController {

    private final SkillTemplateMapper skillTemplateMapper;
    private final SkillDisclosureLoader skillDisclosureLoader;

    /** 仅返回 metadata 层（~50 tokens），用于常驻上下文。 */
    @GetMapping("/{skillId}/metadata")
    public Result<String> getMetadata(@PathVariable("skillId") String skillId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        SkillTemplate skill = loadSkill(skillId, tenantId);
        if (skill == null) {
            return Result.fail("技能不存在或无权访问");
        }
        return Result.success(skillDisclosureLoader.loadMetadata(skill));
    }

    /** 返回 SKILL.md 层（~500 tokens），命中后加载完整技能文档。 */
    @GetMapping("/{skillId}/skill-md")
    public Result<String> getSkillMd(@PathVariable("skillId") String skillId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        SkillTemplate skill = loadSkill(skillId, tenantId);
        if (skill == null) {
            return Result.fail("技能不存在或无权访问");
        }
        return Result.success(skillDisclosureLoader.loadSkillMd(skill));
    }

    /**
     * 按 query 返回 references 层（深度查询时加载）。
     *
     * <p>请求体示例：{"query":"逾期 货期"}
     * 若 query 为空则返回全部 references。
     */
    @PostMapping("/{skillId}/references")
    public Result<String> getReferences(@PathVariable("skillId") String skillId,
                                        @RequestBody(required = false) Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        SkillTemplate skill = loadSkill(skillId, tenantId);
        if (skill == null) {
            return Result.fail("技能不存在或无权访问");
        }
        String query = extractQuery(body);
        return Result.success(skillDisclosureLoader.loadReferences(skill, query));
    }

    /** 按 skillId + tenantId 加载技能（多租户隔离，禁止跨租户读取）。 */
    private SkillTemplate loadSkill(String skillId, Long tenantId) {
        return skillTemplateMapper.selectOne(
                new QueryWrapper<SkillTemplate>()
                        .eq("id", skillId)
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0)
                        .last("LIMIT 1"));
    }

    private String extractQuery(Map<String, Object> body) {
        if (body == null) return null;
        Object q = body.get("query");
        return q != null ? q.toString() : null;
    }
}

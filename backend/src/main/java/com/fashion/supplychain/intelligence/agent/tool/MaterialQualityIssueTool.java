package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.MaterialQualityIssue;
import com.fashion.supplychain.production.service.MaterialQualityIssueService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class MaterialQualityIssueTool extends AbstractAgentTool {

    @Autowired
    private MaterialQualityIssueService materialQualityIssueService;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    private static final java.util.Set<String> WRITE_ACTIONS = java.util.Set.of("resolve_issue");

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_issue | get_issue | stats_issue | resolve_issue"));
        properties.put("issueId", stringProp("质量问题ID"));
        properties.put("keyword", stringProp("按问题单号/物料名/供应商模糊过滤"));
        properties.put("issueType", stringProp("问题类型: quality_defect / quantity_shortage / wrong_material / damaged"));
        properties.put("severity", stringProp("严重程度: low / medium / high / critical"));
        properties.put("status", stringProp("状态: open / investigating / resolved / closed"));
        properties.put("limit", intProp("列表条数，默认10"));
        properties.put("resolutionRemark", stringProp("解决说明(resolve时)"));
        return buildToolDef(
                "物料质量管理：查看物料质量问题、问题统计、解决质量问题。用户说「物料质量」「质量问题」「面料缺陷」「物料异常」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_material_quality_issue";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.WAREHOUSE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (WRITE_ACTIONS.contains(action) && !toolAccessService.hasManagerAccess()) {
            return errorJson("质量问题解决操作需要管理员权限");
        }
        return switch (action) {
            case "list_issue" -> listIssues(args);
            case "get_issue" -> getIssue(args);
            case "stats_issue" -> statsIssues();
            case "resolve_issue" -> resolveIssue(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listIssues(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String keyword = optionalString(args, "keyword");
        String issueType = optionalString(args, "issueType");
        String severity = optionalString(args, "severity");
        String status = optionalString(args, "status");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<MaterialQualityIssue> query = new LambdaQueryWrapper<MaterialQualityIssue>()
                .eq(MaterialQualityIssue::getTenantId, tenantId)
                .eq(StringUtils.hasText(issueType), MaterialQualityIssue::getIssueType, issueType)
                .eq(StringUtils.hasText(severity), MaterialQualityIssue::getSeverity, severity)
                .eq(StringUtils.hasText(status), MaterialQualityIssue::getStatus, status)
                .and(StringUtils.hasText(keyword), q -> q
                        .like(MaterialQualityIssue::getIssueNo, keyword)
                        .or().like(MaterialQualityIssue::getMaterialName, keyword)
                        .or().like(MaterialQualityIssue::getSupplierName, keyword))
                .orderByDesc(MaterialQualityIssue::getCreateTime)
                .last("LIMIT " + limit);

        List<MaterialQualityIssue> items = materialQualityIssueService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "物料质量问题共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String getIssue(Map<String, Object> args) throws Exception {
        String issueId = requireString(args, "issueId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        MaterialQualityIssue issue = materialQualityIssueService.lambdaQuery()
                .eq(MaterialQualityIssue::getId, issueId)
                .eq(MaterialQualityIssue::getTenantId, tenantId)
                .one();
        if (issue == null) return errorJson("质量问题不存在或无权访问");
        return successJson("查询成功", Map.of("issue", toDetailDto(issue)));
    }

    private String statsIssues() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<MaterialQualityIssue> all = materialQualityIssueService.lambdaQuery()
                .eq(MaterialQualityIssue::getTenantId, tenantId)
                .list();
        long total = all.size();
        long open = all.stream().filter(i -> "open".equals(i.getStatus())).count();
        long resolved = all.stream().filter(i -> "resolved".equals(i.getStatus())).count();
        long critical = all.stream().filter(i -> "critical".equals(i.getSeverity())).count();
        Map<String, Long> byType = all.stream().filter(i -> i.getIssueType() != null)
                .collect(java.util.stream.Collectors.groupingBy(MaterialQualityIssue::getIssueType, java.util.stream.Collectors.counting()));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "物料质量问题统计: 共" + total + "条, 待处理" + open + "条, 已解决" + resolved + "条, 严重" + critical + "条");
        result.put("total", total);
        result.put("open", open);
        result.put("resolved", resolved);
        result.put("critical", critical);
        result.put("byType", byType);
        return MAPPER.writeValueAsString(result);
    }

    private String resolveIssue(Map<String, Object> args) throws Exception {
        String issueId = requireString(args, "issueId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        MaterialQualityIssue issue = materialQualityIssueService.lambdaQuery()
                .eq(MaterialQualityIssue::getId, issueId)
                .eq(MaterialQualityIssue::getTenantId, tenantId)
                .one();
        if (issue == null) return errorJson("质量问题不存在");
        if ("resolved".equals(issue.getStatus()) || "closed".equals(issue.getStatus())) {
            return errorJson("该问题已处理");
        }
        issue.setStatus("resolved");
        issue.setResolutionRemark(optionalString(args, "resolutionRemark"));
        issue.setResolverId(String.valueOf(UserContext.userId()));
        issue.setResolverName(UserContext.username());
        issue.setResolvedTime(java.time.LocalDateTime.now());
        materialQualityIssueService.updateById(issue);
        return successJson("质量问题已解决", Map.of("issueId", issueId));
    }

    private Map<String, Object> toListDto(MaterialQualityIssue i) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", i.getId());
        dto.put("issueNo", i.getIssueNo());
        dto.put("materialName", i.getMaterialName());
        dto.put("materialCode", i.getMaterialCode());
        dto.put("supplierName", i.getSupplierName());
        dto.put("orderNo", i.getOrderNo());
        dto.put("styleNo", i.getStyleNo());
        dto.put("issueType", i.getIssueType());
        dto.put("severity", i.getSeverity());
        dto.put("issueQuantity", i.getIssueQuantity());
        dto.put("status", i.getStatus());
        dto.put("createTime", i.getCreateTime());
        return dto;
    }

    private Map<String, Object> toDetailDto(MaterialQualityIssue i) {
        Map<String, Object> dto = toListDto(i);
        dto.put("purchaseNo", i.getPurchaseNo());
        dto.put("materialType", i.getMaterialType());
        dto.put("disposition", i.getDisposition());
        dto.put("evidenceImageUrls", i.getEvidenceImageUrls());
        dto.put("remark", i.getRemark());
        dto.put("resolutionRemark", i.getResolutionRemark());
        dto.put("deductionAmount", i.getDeductionAmount());
        dto.put("reporterName", i.getReporterName());
        dto.put("resolverName", i.getResolverName());
        dto.put("resolvedTime", i.getResolvedTime());
        return dto;
    }
}

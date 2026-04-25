package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.PatternRevision;
import com.fashion.supplychain.production.service.PatternRevisionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class PatternRevisionTool extends AbstractAgentTool {

    @Autowired
    private PatternRevisionService patternRevisionService;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    private static final java.util.Set<String> WRITE_ACTIONS = java.util.Set.of(
            "create_revision", "submit_for_approval", "approve_revision", "reject_revision");

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_revision | get_revision | create_revision | submit_for_approval | approve_revision | reject_revision"));
        properties.put("revisionId", stringProp("改版ID"));
        properties.put("styleId", stringProp("款式ID"));
        properties.put("styleNo", stringProp("款号过滤"));
        properties.put("status", stringProp("状态过滤: draft / submitted / approved / rejected / completed"));
        properties.put("revisionType", stringProp("改版类型: fit / design / material / process"));
        properties.put("revisionReason", stringProp("改版原因(create时)"));
        properties.put("revisionContent", stringProp("改版内容(create时)"));
        properties.put("approvalComment", stringProp("审批意见(approve/reject时)"));
        properties.put("limit", intProp("列表条数，默认10"));
        return buildToolDef(
                "样衣改版管理：查看改版记录、创建改版、提交审批、审批/驳回改版。用户说「样衣改版」「改版记录」「改版审批」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_pattern_revision";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.STYLE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (WRITE_ACTIONS.contains(action) && !toolAccessService.hasManagerAccess()) {
            return errorJson("改版写操作需要管理员权限");
        }
        if (UserContext.factoryId() != null) {
            return errorJson("外发工厂账号无权访问样衣改版数据");
        }
        return switch (action) {
            case "list_revision" -> listRevisions(args);
            case "get_revision" -> getRevision(args);
            case "create_revision" -> createRevision(args);
            case "submit_for_approval" -> submitForApproval(args);
            case "approve_revision" -> approveRevision(args);
            case "reject_revision" -> rejectRevision(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listRevisions(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String styleNo = optionalString(args, "styleNo");
        String status = optionalString(args, "status");
        String revisionType = optionalString(args, "revisionType");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<PatternRevision> query = new LambdaQueryWrapper<PatternRevision>()
                .eq(PatternRevision::getTenantId, tenantId)
                .eq(StringUtils.hasText(styleNo), PatternRevision::getStyleNo, styleNo)
                .eq(StringUtils.hasText(status), PatternRevision::getStatus, status)
                .eq(StringUtils.hasText(revisionType), PatternRevision::getRevisionType, revisionType)
                .orderByDesc(PatternRevision::getCreateTime)
                .last("LIMIT " + limit);

        List<PatternRevision> items = patternRevisionService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "样衣改版共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String getRevision(Map<String, Object> args) throws Exception {
        String revisionId = requireString(args, "revisionId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        PatternRevision r = patternRevisionService.lambdaQuery()
                .eq(PatternRevision::getId, revisionId)
                .eq(PatternRevision::getTenantId, tenantId)
                .one();
        if (r == null) return errorJson("改版记录不存在或无权访问");
        return successJson("查询成功", Map.of("revision", toDetailDto(r)));
    }

    private String createRevision(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String styleId = requireString(args, "styleId");
        PatternRevision r = new PatternRevision();
        r.setTenantId(tenantId);
        r.setStyleId(styleId);
        r.setStyleNo(optionalString(args, "styleNo"));
        r.setRevisionType(optionalString(args, "revisionType"));
        r.setRevisionReason(optionalString(args, "revisionReason"));
        r.setRevisionContent(optionalString(args, "revisionContent"));
        r.setStatus("draft");
        String nextNo = patternRevisionService.generateNextRevisionNo(r.getStyleNo());
        r.setRevisionNo(nextNo);
        patternRevisionService.save(r);
        return successJson("改版记录创建成功", Map.of("revisionId", r.getId(), "revisionNo", nextNo));
    }

    private String submitForApproval(Map<String, Object> args) throws Exception {
        String revisionId = requireString(args, "revisionId");
        TenantAssert.assertTenantContext();
        boolean ok = patternRevisionService.submitForApproval(revisionId);
        return ok ? successJson("改版已提交审批", Map.of("revisionId", revisionId)) : errorJson("提交审批失败");
    }

    private String approveRevision(Map<String, Object> args) throws Exception {
        String revisionId = requireString(args, "revisionId");
        String comment = optionalString(args, "approvalComment");
        TenantAssert.assertTenantContext();
        boolean ok = patternRevisionService.approve(revisionId, comment);
        return ok ? successJson("改版已审批通过", Map.of("revisionId", revisionId)) : errorJson("审批失败");
    }

    private String rejectRevision(Map<String, Object> args) throws Exception {
        String revisionId = requireString(args, "revisionId");
        String comment = optionalString(args, "approvalComment");
        TenantAssert.assertTenantContext();
        boolean ok = patternRevisionService.reject(revisionId, comment);
        return ok ? successJson("改版已驳回", Map.of("revisionId", revisionId)) : errorJson("驳回失败");
    }

    private Map<String, Object> toListDto(PatternRevision r) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", r.getId());
        dto.put("styleNo", r.getStyleNo());
        dto.put("revisionNo", r.getRevisionNo());
        dto.put("revisionType", r.getRevisionType());
        dto.put("revisionReason", r.getRevisionReason());
        dto.put("status", r.getStatus());
        dto.put("revisionDate", r.getRevisionDate());
        dto.put("expectedCompleteDate", r.getExpectedCompleteDate());
        dto.put("maintainerName", r.getMaintainerName());
        dto.put("createTime", r.getCreateTime());
        return dto;
    }

    private Map<String, Object> toDetailDto(PatternRevision r) {
        Map<String, Object> dto = toListDto(r);
        dto.put("styleId", r.getStyleId());
        dto.put("revisionContent", r.getRevisionContent());
        dto.put("beforeChanges", r.getBeforeChanges());
        dto.put("afterChanges", r.getAfterChanges());
        dto.put("attachmentUrls", r.getAttachmentUrls());
        dto.put("actualCompleteDate", r.getActualCompleteDate());
        dto.put("submitterName", r.getSubmitterName());
        dto.put("submitTime", r.getSubmitTime());
        dto.put("approverName", r.getApproverName());
        dto.put("approvalTime", r.getApprovalTime());
        dto.put("approvalComment", r.getApprovalComment());
        dto.put("remark", r.getRemark());
        return dto;
    }
}

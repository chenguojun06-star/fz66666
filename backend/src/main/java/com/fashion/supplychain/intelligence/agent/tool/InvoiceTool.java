package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.Invoice;
import com.fashion.supplychain.finance.service.InvoiceService;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class InvoiceTool extends AbstractAgentTool {

    @Autowired
    private InvoiceService invoiceService;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    private static final java.util.Set<String> WRITE_ACTIONS = java.util.Set.of(
            "create_invoice", "issue_invoice", "cancel_invoice", "delete_invoice");

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_invoice | get_invoice | stats_invoice | create_invoice | issue_invoice | cancel_invoice"));
        properties.put("invoiceId", stringProp("发票ID"));
        properties.put("keyword", stringProp("按发票号/抬头/卖方模糊过滤"));
        properties.put("invoiceType", stringProp("发票类型过滤: special / normal / electronic"));
        properties.put("status", stringProp("状态过滤: draft / issued / cancelled"));
        properties.put("relatedBizNo", stringProp("关联业务单号过滤"));
        properties.put("limit", intProp("列表条数，默认10"));
        properties.put("invoiceNo", stringProp("发票号(create时使用)"));
        properties.put("invoiceType_create", stringProp("发票类型(create时使用)"));
        properties.put("titleName", stringProp("发票抬头(create时使用)"));
        properties.put("amount", stringProp("金额(create时使用)"));
        properties.put("taxRate", stringProp("税率(create时使用)"));
        properties.put("relatedBizType", stringProp("关联业务类型(create时使用)"));
        properties.put("relatedBizId", stringProp("关联业务ID(create时使用)"));
        properties.put("remark", stringProp("备注"));
        return buildToolDef(
                "发票管理：查询发票列表、发票详情、发票统计、创建发票、开票、作废。用户说「看发票」「开票」「作废发票」「发票统计」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_invoice";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.FINANCE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (WRITE_ACTIONS.contains(action) && !toolAccessService.hasManagerAccess()) {
            return errorJson("发票写操作需要管理员权限");
        }
        if (UserContext.factoryId() != null) {
            return errorJson("外发工厂账号无权访问发票数据");
        }
        return switch (action) {
            case "list_invoice" -> listInvoices(args);
            case "get_invoice" -> getInvoice(args);
            case "stats_invoice" -> statsInvoice();
            case "create_invoice" -> createInvoice(args);
            case "issue_invoice" -> issueInvoice(args);
            case "cancel_invoice" -> cancelInvoice(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listInvoices(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String keyword = optionalString(args, "keyword");
        String invoiceType = optionalString(args, "invoiceType");
        String status = optionalString(args, "status");
        String relatedBizNo = optionalString(args, "relatedBizNo");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<Invoice> query = new LambdaQueryWrapper<Invoice>()
                .eq(Invoice::getTenantId, tenantId)
                .eq(Invoice::getDeleteFlag, 0)
                .eq(StringUtils.hasText(invoiceType), Invoice::getInvoiceType, invoiceType)
                .eq(StringUtils.hasText(status), Invoice::getStatus, status)
                .like(StringUtils.hasText(relatedBizNo), Invoice::getRelatedBizNo, relatedBizNo)
                .and(StringUtils.hasText(keyword), q -> q
                        .like(Invoice::getInvoiceNo, keyword)
                        .or().like(Invoice::getTitleName, keyword)
                        .or().like(Invoice::getSellerName, keyword))
                .orderByDesc(Invoice::getCreateTime)
                .last("LIMIT " + limit);

        List<Invoice> items = invoiceService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "发票共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String getInvoice(Map<String, Object> args) throws Exception {
        String invoiceId = requireString(args, "invoiceId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Invoice invoice = invoiceService.lambdaQuery()
                .eq(Invoice::getId, invoiceId)
                .eq(Invoice::getTenantId, tenantId)
                .eq(Invoice::getDeleteFlag, 0)
                .one();
        if (invoice == null) {
            return errorJson("发票不存在或无权访问");
        }
        return successJson("查询成功", Map.of("invoice", toDetailDto(invoice)));
    }

    private String statsInvoice() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Invoice> all = invoiceService.lambdaQuery()
                .eq(Invoice::getTenantId, tenantId)
                .eq(Invoice::getDeleteFlag, 0)
                .list();
        long total = all.size();
        long issued = all.stream().filter(i -> "issued".equals(i.getStatus())).count();
        long draft = all.stream().filter(i -> "draft".equals(i.getStatus())).count();
        long cancelled = all.stream().filter(i -> "cancelled".equals(i.getStatus())).count();
        BigDecimal totalAmount = all.stream()
                .filter(i -> "issued".equals(i.getStatus()))
                .map(Invoice::getTotalAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "发票统计: 共" + total + "张, 已开" + issued + "张, 草稿" + draft + "张, 已作废" + cancelled + "张");
        result.put("total", total);
        result.put("issued", issued);
        result.put("draft", draft);
        result.put("cancelled", cancelled);
        result.put("issuedTotalAmount", totalAmount);
        return MAPPER.writeValueAsString(result);
    }

    private String createInvoice(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Invoice invoice = new Invoice();
        invoice.setTenantId(tenantId);
        invoice.setInvoiceNo(optionalString(args, "invoiceNo"));
        invoice.setInvoiceType(optionalString(args, "invoiceType_create"));
        invoice.setTitleName(optionalString(args, "titleName"));
        String amountStr = optionalString(args, "amount");
        if (StringUtils.hasText(amountStr)) {
            invoice.setAmount(new BigDecimal(amountStr));
        }
        String taxRateStr = optionalString(args, "taxRate");
        if (StringUtils.hasText(taxRateStr)) {
            invoice.setTaxRate(new BigDecimal(taxRateStr));
        }
        invoice.setRelatedBizType(optionalString(args, "relatedBizType"));
        invoice.setRelatedBizId(optionalString(args, "relatedBizId"));
        invoice.setRemark(optionalString(args, "remark"));
        invoice.setStatus("draft");
        invoice.setCreatorId(String.valueOf(UserContext.userId()));
        invoice.setCreatorName(UserContext.username());
        invoiceService.save(invoice);
        return successJson("发票创建成功", Map.of("invoiceId", invoice.getId()));
    }

    private String issueInvoice(Map<String, Object> args) throws Exception {
        String invoiceId = requireString(args, "invoiceId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Invoice invoice = invoiceService.lambdaQuery()
                .eq(Invoice::getId, invoiceId)
                .eq(Invoice::getTenantId, tenantId)
                .eq(Invoice::getDeleteFlag, 0)
                .one();
        if (invoice == null) return errorJson("发票不存在");
        if (!"draft".equals(invoice.getStatus())) return errorJson("仅草稿状态可开票");
        invoice.setStatus("issued");
        invoice.setIssueDate(java.time.LocalDate.now());
        invoiceService.updateById(invoice);
        return successJson("开票成功", Map.of("invoiceId", invoiceId, "status", "issued"));
    }

    private String cancelInvoice(Map<String, Object> args) throws Exception {
        String invoiceId = requireString(args, "invoiceId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Invoice invoice = invoiceService.lambdaQuery()
                .eq(Invoice::getId, invoiceId)
                .eq(Invoice::getTenantId, tenantId)
                .eq(Invoice::getDeleteFlag, 0)
                .one();
        if (invoice == null) return errorJson("发票不存在");
        if ("cancelled".equals(invoice.getStatus())) return errorJson("发票已作废");
        invoice.setStatus("cancelled");
        invoiceService.updateById(invoice);
        return successJson("发票已作废", Map.of("invoiceId", invoiceId, "status", "cancelled"));
    }

    private Map<String, Object> toListDto(Invoice i) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", i.getId());
        dto.put("invoiceNo", i.getInvoiceNo());
        dto.put("invoiceType", i.getInvoiceType());
        dto.put("titleName", i.getTitleName());
        dto.put("sellerName", i.getSellerName());
        dto.put("amount", i.getAmount());
        dto.put("taxRate", i.getTaxRate());
        dto.put("totalAmount", i.getTotalAmount());
        dto.put("status", i.getStatus());
        dto.put("relatedBizNo", i.getRelatedBizNo());
        dto.put("issueDate", i.getIssueDate());
        dto.put("createTime", i.getCreateTime());
        return dto;
    }

    private Map<String, Object> toDetailDto(Invoice i) {
        Map<String, Object> dto = toListDto(i);
        dto.put("titleTaxNo", i.getTitleTaxNo());
        dto.put("titleAddress", i.getTitleAddress());
        dto.put("titlePhone", i.getTitlePhone());
        dto.put("titleBankName", i.getTitleBankName());
        dto.put("titleBankAccount", i.getTitleBankAccount());
        dto.put("sellerTaxNo", i.getSellerTaxNo());
        dto.put("taxAmount", i.getTaxAmount());
        dto.put("relatedBizType", i.getRelatedBizType());
        dto.put("relatedBizId", i.getRelatedBizId());
        dto.put("remark", i.getRemark());
        dto.put("creatorName", i.getCreatorName());
        return dto;
    }
}

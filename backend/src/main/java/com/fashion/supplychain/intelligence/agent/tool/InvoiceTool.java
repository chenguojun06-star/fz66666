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
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
        properties.put("action", stringProp("动作: list_invoice | get_invoice | stats_invoice | analyze_invoice | create_invoice | issue_invoice | cancel_invoice"));
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
                "发票智能管理：查询发票列表、详情、统计、智能分析（开票效率/税负/异常检测）、创建/开票/作废。用户说「看发票」「开票」「作废发票」「发票统计」「发票分析」时必须调用。",
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
            case "analyze_invoice" -> analyzeInvoice();
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
        Integer limitVal = optionalInt(args, "limit");
        int limit = limitVal != null ? Math.min(limitVal, 100) : 10;

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
                .last("LIMIT 5000")
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

    private String analyzeInvoice() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Invoice> all = invoiceService.lambdaQuery()
                .eq(Invoice::getTenantId, tenantId)
                .eq(Invoice::getDeleteFlag, 0)
                .last("LIMIT 5000")
                .list();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);

        Map<String, Object> overview = buildOverview(all);
        result.put("overview", overview);

        Map<String, Object> efficiency = buildIssuanceEfficiency(all);
        result.put("issuanceEfficiency", efficiency);

        Map<String, Object> taxAnalysis = buildTaxAnalysis(all);
        result.put("taxAnalysis", taxAnalysis);

        List<Map<String, Object>> anomalies = detectAnomalies(all);
        result.put("anomalies", anomalies);

        List<String> recommendations = buildRecommendations(all, overview, efficiency, anomalies);
        result.put("recommendations", recommendations);

        result.put("summary", buildAnalysisSummary(overview, efficiency, anomalies));
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> buildOverview(List<Invoice> all) {
        Map<String, Object> m = new LinkedHashMap<>();
        long total = all.size();
        long issued = all.stream().filter(i -> "issued".equals(i.getStatus())).count();
        long draft = all.stream().filter(i -> "draft".equals(i.getStatus())).count();
        long cancelled = all.stream().filter(i -> "cancelled".equals(i.getStatus())).count();
        BigDecimal issuedAmount = all.stream()
                .filter(i -> "issued".equals(i.getStatus()))
                .map(Invoice::getTotalAmount).filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal draftAmount = all.stream()
                .filter(i -> "draft".equals(i.getStatus()))
                .map(i -> i.getAmount() != null ? i.getAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal cancelledAmount = all.stream()
                .filter(i -> "cancelled".equals(i.getStatus()))
                .map(i -> i.getAmount() != null ? i.getAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        m.put("total", total);
        m.put("issued", issued);
        m.put("draft", draft);
        m.put("cancelled", cancelled);
        m.put("issuedAmount", issuedAmount);
        m.put("pendingAmount", draftAmount);
        m.put("cancelledAmount", cancelledAmount);
        if (total > 0) {
            m.put("issueRate", BigDecimal.valueOf(issued * 100.0 / total).setScale(1, RoundingMode.HALF_UP) + "%");
            m.put("cancelRate", BigDecimal.valueOf(cancelled * 100.0 / total).setScale(1, RoundingMode.HALF_UP) + "%");
        }
        return m;
    }

    private Map<String, Object> buildIssuanceEfficiency(List<Invoice> all) {
        Map<String, Object> m = new LinkedHashMap<>();
        List<Invoice> issuedInvoices = all.stream()
                .filter(i -> "issued".equals(i.getStatus()) && i.getCreateTime() != null && i.getIssueDate() != null)
                .toList();
        if (issuedInvoices.isEmpty()) {
            m.put("available", false);
            m.put("reason", "无已开票发票数据");
            return m;
        }
        double avgDays = issuedInvoices.stream()
                .mapToLong(i -> ChronoUnit.DAYS.between(i.getCreateTime().toLocalDate(), i.getIssueDate()))
                .average().orElse(0);
        long within3Days = issuedInvoices.stream()
                .filter(i -> ChronoUnit.DAYS.between(i.getCreateTime().toLocalDate(), i.getIssueDate()) <= 3)
                .count();
        long over7Days = issuedInvoices.stream()
                .filter(i -> ChronoUnit.DAYS.between(i.getCreateTime().toLocalDate(), i.getIssueDate()) > 7)
                .count();

        m.put("available", true);
        m.put("avgIssuanceDays", BigDecimal.valueOf(avgDays).setScale(1, RoundingMode.HALF_UP));
        m.put("within3Days", within3Days);
        m.put("over7Days", over7Days);
        m.put("timelyRate", BigDecimal.valueOf(within3Days * 100.0 / issuedInvoices.size()).setScale(1, RoundingMode.HALF_UP) + "%");
        if (avgDays <= 2) {
            m.put("assessment", "开票效率优秀，平均2天内完成");
        } else if (avgDays <= 5) {
            m.put("assessment", "开票效率一般，建议优化流程");
        } else {
            m.put("assessment", "开票效率偏低，存在流程瓶颈");
        }
        return m;
    }

    private Map<String, Object> buildTaxAnalysis(List<Invoice> all) {
        Map<String, Object> m = new LinkedHashMap<>();
        List<Invoice> issuedInvoices = all.stream()
                .filter(i -> "issued".equals(i.getStatus()))
                .toList();
        if (issuedInvoices.isEmpty()) {
            m.put("available", false);
            return m;
        }
        BigDecimal totalAmount = issuedInvoices.stream()
                .map(i -> i.getAmount() != null ? i.getAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalTax = issuedInvoices.stream()
                .map(i -> i.getTaxAmount() != null ? i.getTaxAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal avgTaxRate = totalAmount.compareTo(BigDecimal.ZERO) > 0
                ? totalTax.multiply(BigDecimal.valueOf(100)).divide(totalAmount, 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        Map<String, BigDecimal> byType = issuedInvoices.stream()
                .filter(i -> i.getInvoiceType() != null)
                .collect(Collectors.groupingBy(Invoice::getInvoiceType,
                        Collectors.reducing(BigDecimal.ZERO,
                                i -> i.getTaxAmount() != null ? i.getTaxAmount() : BigDecimal.ZERO,
                                BigDecimal::add)));

        m.put("available", true);
        m.put("totalTaxAmount", totalTax);
        m.put("avgTaxRate", avgTaxRate + "%");
        m.put("taxByInvoiceType", byType);
        return m;
    }

    private List<Map<String, Object>> detectAnomalies(List<Invoice> all) {
        return all.stream().filter(i -> {
            if (i.getAmount() != null && i.getAmount().compareTo(BigDecimal.valueOf(100000)) > 0 && "draft".equals(i.getStatus())) {
                return true;
            }
            if ("issued".equals(i.getStatus()) && i.getCreateTime() != null
                    && ChronoUnit.DAYS.between(i.getCreateTime().toLocalDate(), LocalDate.now()) > 30) {
                return true;
            }
            return false;
        }).limit(10).map(i -> {
            Map<String, Object> a = new LinkedHashMap<>();
            a.put("invoiceNo", i.getInvoiceNo());
            a.put("amount", i.getAmount());
            a.put("status", i.getStatus());
            if (i.getAmount() != null && i.getAmount().compareTo(BigDecimal.valueOf(100000)) > 0 && "draft".equals(i.getStatus())) {
                a.put("anomalyType", "大额未开票");
                a.put("suggestion", "金额超10万仍为草稿，建议尽快开票或确认");
            }
            if ("issued".equals(i.getStatus()) && i.getCreateTime() != null
                    && ChronoUnit.DAYS.between(i.getCreateTime().toLocalDate(), LocalDate.now()) > 30) {
                a.put("anomalyType", "长期未开票");
                a.put("suggestion", "创建超30天才开票，建议优化开票流程");
            }
            return a;
        }).toList();
    }

    private List<String> buildRecommendations(List<Invoice> all, Map<String, Object> overview,
                                               Map<String, Object> efficiency, List<Map<String, Object>> anomalies) {
        List<String> recs = new java.util.ArrayList<>();
        long draft = (long) overview.getOrDefault("draft", 0L);
        if (draft > 5) {
            recs.add("有" + draft + "张草稿发票待处理，建议集中开票");
        }
        if (efficiency.get("available") == Boolean.TRUE) {
            BigDecimal avgDays = (BigDecimal) efficiency.get("avgIssuanceDays");
            if (avgDays != null && avgDays.doubleValue() > 5) {
                recs.add("平均开票周期" + avgDays + "天偏长，建议设置开票SLA（3天内）");
            }
        }
        if (!anomalies.isEmpty()) {
            recs.add("发现" + anomalies.size() + "个异常项，请关注大额未开票和长期滞留发票");
        }
        long cancelled = (long) overview.getOrDefault("cancelled", 0L);
        long total = (long) overview.getOrDefault("total", 0L);
        if (total > 0 && cancelled * 100.0 / total > 10) {
            recs.add("作废率" + BigDecimal.valueOf(cancelled * 100.0 / total).setScale(1, RoundingMode.HALF_UP) + "%偏高，建议排查作废原因");
        }
        if (recs.isEmpty()) {
            recs.add("发票管理状态良好，无特别需要关注的事项");
        }
        return recs;
    }

    private String buildAnalysisSummary(Map<String, Object> overview, Map<String, Object> efficiency, List<Map<String, Object>> anomalies) {
        long total = (long) overview.getOrDefault("total", 0L);
        long issued = (long) overview.getOrDefault("issued", 0L);
        long draft = (long) overview.getOrDefault("draft", 0L);
        StringBuilder sb = new StringBuilder();
        sb.append("发票分析: 共").append(total).append("张, 已开").append(issued).append("张, 待开").append(draft).append("张");
        if (efficiency.get("available") == Boolean.TRUE) {
            sb.append(", 平均开票周期").append(efficiency.get("avgIssuanceDays")).append("天");
        }
        if (!anomalies.isEmpty()) {
            sb.append(", 发现").append(anomalies.size()).append("个异常");
        }
        return sb.toString();
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
            try {
                invoice.setAmount(new BigDecimal(amountStr));
            } catch (NumberFormatException e) {
                return errorJson("金额格式不正确: " + amountStr);
            }
        }
        String taxRateStr = optionalString(args, "taxRate");
        if (StringUtils.hasText(taxRateStr)) {
            try {
                invoice.setTaxRate(new BigDecimal(taxRateStr));
            } catch (NumberFormatException e) {
                return errorJson("税率格式不正确: " + taxRateStr);
            }
        }
        invoice.setRelatedBizType(optionalString(args, "relatedBizType"));
        invoice.setRelatedBizId(optionalString(args, "relatedBizId"));
        invoice.setRemark(optionalString(args, "remark"));
        invoice.setStatus("draft");
        String uid = UserContext.userId();
        invoice.setCreatorId(uid);
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

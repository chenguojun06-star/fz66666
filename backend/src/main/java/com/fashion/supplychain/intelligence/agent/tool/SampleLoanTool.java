package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.service.SampleStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * AI小云工具：样衣借调 & 归还
 * <p>
 * 支持动作：loan（借调）/ return（归还）
 * 安全：外发工厂账号不可操作；必须有角色；租户隔离
 * 审计：每次操作写入 t_intelligence_audit_log
 */
@Slf4j
@Component
public class SampleLoanTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private SampleStockService sampleStockService;

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    @Override
    public String getName() {
        return "tool_sample_loan";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("description", "操作类型：loan=样衣借调，return=样衣归还");
        action.put("enum", List.of("loan", "return"));
        properties.put("action", action);

        Map<String, Object> sampleStockId = new LinkedHashMap<>();
        sampleStockId.put("type", "string");
        sampleStockId.put("description", "借调时必填：要借出的样衣库存ID");
        properties.put("sampleStockId", sampleStockId);

        Map<String, Object> loanId = new LinkedHashMap<>();
        loanId.put("type", "string");
        loanId.put("description", "归还时必填：借调记录ID（之前借调操作返回的记录ID）");
        properties.put("loanId", loanId);

        Map<String, Object> borrower = new LinkedHashMap<>();
        borrower.put("type", "string");
        borrower.put("description", "借用人姓名");
        properties.put("borrower", borrower);

        Map<String, Object> borrowerId = new LinkedHashMap<>();
        borrowerId.put("type", "string");
        borrowerId.put("description", "借用人ID（可选）");
        properties.put("borrowerId", borrowerId);

        Map<String, Object> quantity = new LinkedHashMap<>();
        quantity.put("type", "integer");
        quantity.put("description", "借调或归还数量，必须大于0");
        properties.put("quantity", quantity);

        Map<String, Object> expectedReturnDate = new LinkedHashMap<>();
        expectedReturnDate.put("type", "string");
        expectedReturnDate.put("description", "预计归还日期，格式 yyyy-MM-dd，借调时填写");
        properties.put("expectedReturnDate", expectedReturnDate);

        Map<String, Object> remark = new LinkedHashMap<>();
        remark.put("type", "string");
        remark.put("description", "备注说明");
        properties.put("remark", remark);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("样衣借调与归还操作。action=loan 借出样衣，action=return 归还样衣。操作会记录到审计日志，可通过 tool_warehouse_op_log 查询历史记录。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action", "quantity"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        // 安全门禁1：外发工厂账号不允许操作仓库
        if (UserContext.factoryId() != null) {
            return MAPPER.writeValueAsString(Map.of("error", "外发工厂账号无权执行仓库操作，请联系内部管理人员"));
        }

        // 安全门禁2：必须有角色信息
        String role = UserContext.role();
        if (role == null || role.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "账号角色信息缺失，无权执行此操作"));
        }

        Map<String, Object> args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});
        String action = (String) args.get("action");
        Object qtyObj = args.get("quantity");
        if (qtyObj == null) {
            return MAPPER.writeValueAsString(Map.of("error", "缺少参数：quantity"));
        }
        int qty;
        try {
            qty = Integer.parseInt(qtyObj.toString());
        } catch (NumberFormatException e) {
            return MAPPER.writeValueAsString(Map.of("error", "quantity 必须是整数"));
        }
        if (qty <= 0) {
            return MAPPER.writeValueAsString(Map.of("error", "数量必须大于0"));
        }

        String remarkStr = (String) args.getOrDefault("remark", "");
        String operatorName = UserContext.username();
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if ("loan".equals(action)) {
            return doLoan(args, qty, remarkStr, operatorName, role, tenantId);
        } else if ("return".equals(action)) {
            return doReturn(args, qty, remarkStr, operatorName, role, tenantId);
        } else {
            return MAPPER.writeValueAsString(Map.of("error", "不支持的 action：" + action + "，仅支持 loan/return"));
        }
    }

    private String doLoan(Map<String, Object> args, int qty, String remark,
                          String operatorName, String role, Long tenantId) throws Exception {
        String sampleStockId = (String) args.get("sampleStockId");
        if (sampleStockId == null || sampleStockId.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "借调操作必须提供 sampleStockId"));
        }

        // 安全门禁3：租户隔离
        SampleStock stock = sampleStockService.getById(sampleStockId);
        if (stock == null) {
            return MAPPER.writeValueAsString(Map.of("error", "样衣库存不存在：" + sampleStockId));
        }
        if (tenantId != null && !tenantId.equals(stock.getTenantId())) {
            return MAPPER.writeValueAsString(Map.of("error", "无权操作其他租户的样衣数据"));
        }

        SampleLoan loan = new SampleLoan();
        loan.setId(UUID.randomUUID().toString().replace("-", ""));
        loan.setSampleStockId(sampleStockId);
        loan.setBorrower((String) args.getOrDefault("borrower", operatorName));
        loan.setBorrowerId((String) args.get("borrowerId"));
        loan.setQuantity(qty);
        loan.setLoanDate(LocalDateTime.now());
        loan.setStatus("borrowed");
        loan.setRemark(remark);

        String expectedStr = (String) args.get("expectedReturnDate");
        if (expectedStr != null && !expectedStr.isBlank()) {
            try {
                loan.setExpectedReturnDate(LocalDate.parse(expectedStr).atStartOfDay());
            } catch (Exception e) {
                log.warn("[SampleLoanTool] expectedReturnDate 格式错误: {}", expectedStr);
            }
        }

        try {
            sampleStockService.loan(loan);
        } catch (Exception e) {
            writeAuditLog(tenantId, "sample_loan", operatorName, role,
                    "sampleStockId=" + sampleStockId + " qty=" + qty, "FAILED", e.getMessage());
            log.error("[SampleLoanTool] 借调失败 sampleStockId={} err={}", sampleStockId, e.getMessage());
            return MAPPER.writeValueAsString(Map.of("error", "借调失败：" + e.getMessage()));
        }

        writeAuditLog(tenantId, "sample_loan", operatorName, role,
                "sampleStockId=" + sampleStockId + " qty=" + qty + " borrower=" + loan.getBorrower(),
                "SUCCESS", null);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("loanId", loan.getId());
        result.put("sampleStockId", sampleStockId);
        result.put("quantity", qty);
        result.put("borrower", loan.getBorrower());
        result.put("message", "样衣借调成功，借调记录ID：" + loan.getId());
        return MAPPER.writeValueAsString(result);
    }

    private String doReturn(Map<String, Object> args, int qty, String remark,
                            String operatorName, String role, Long tenantId) throws Exception {
        String loanId = (String) args.get("loanId");
        if (loanId == null || loanId.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "归还操作必须提供 loanId（借调记录ID）"));
        }

        try {
            sampleStockService.returnSample(loanId, qty, remark);
        } catch (Exception e) {
            writeAuditLog(tenantId, "sample_return", operatorName, role,
                    "loanId=" + loanId + " qty=" + qty, "FAILED", e.getMessage());
            log.error("[SampleLoanTool] 归还失败 loanId={} err={}", loanId, e.getMessage());
            return MAPPER.writeValueAsString(Map.of("error", "归还失败：" + e.getMessage()));
        }

        writeAuditLog(tenantId, "sample_return", operatorName, role,
                "loanId=" + loanId + " qty=" + qty, "SUCCESS", null);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("loanId", loanId);
        result.put("quantity", qty);
        result.put("message", "样衣归还成功，归还数量：" + qty + "件");
        return MAPPER.writeValueAsString(result);
    }

    private void writeAuditLog(Long tenantId, String action, String operatorName,
                               String role, String detail, String status, String errorMsg) {
        try {
            IntelligenceAuditLog log = IntelligenceAuditLog.builder()
                    .tenantId(tenantId)
                    .executorId(UserContext.userId())
                    .action(action)
                    .reason("[AI小云仓库操作] 操作人: " + operatorName + " 角色: " + role + " 参数: " + detail)
                    .status(status)
                    .errorMessage(errorMsg)
                    .createdAt(LocalDateTime.now())
                    .build();
            auditLogMapper.insert(log);
        } catch (Exception ex) {
            SampleLoanTool.log.warn("[SampleLoanTool] 审计日志写入失败: {}", ex.getMessage());
        }
    }
}

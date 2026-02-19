package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.mapper.ExpenseReimbursementMapper;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Map;

import com.fashion.supplychain.common.UserContext;

/**
 * 费用报销 Service 实现
 */
@Slf4j
@Service
public class ExpenseReimbursementServiceImpl
        extends ServiceImpl<ExpenseReimbursementMapper, ExpenseReimbursement>
        implements ExpenseReimbursementService {

    @Override
    public IPage<ExpenseReimbursement> queryPage(Map<String, Object> params) {
        int page = 1;
        int size = 20;
        if (params.containsKey("page")) {
            page = Integer.parseInt(String.valueOf(params.get("page")));
        }
        if (params.containsKey("size")) {
            size = Integer.parseInt(String.valueOf(params.get("size")));
        }

        LambdaQueryWrapper<ExpenseReimbursement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ExpenseReimbursement::getDeleteFlag, 0);

        // 按申请人筛选
        String applicantId = (String) params.get("applicantId");
        if (StringUtils.hasText(applicantId)) {
            wrapper.eq(ExpenseReimbursement::getApplicantId, Long.parseLong(applicantId));
        }

        // 按状态筛选
        String status = (String) params.get("status");
        if (StringUtils.hasText(status)) {
            wrapper.eq(ExpenseReimbursement::getStatus, status);
        }

        // 按费用类型筛选
        String expenseType = (String) params.get("expenseType");
        if (StringUtils.hasText(expenseType)) {
            wrapper.eq(ExpenseReimbursement::getExpenseType, expenseType);
        }

        // 按报销单号模糊搜索
        String reimbursementNo = (String) params.get("reimbursementNo");
        if (StringUtils.hasText(reimbursementNo)) {
            wrapper.like(ExpenseReimbursement::getReimbursementNo, reimbursementNo);
        }

        // 按标题/事由模糊搜索
        String keyword = (String) params.get("keyword");
        if (StringUtils.hasText(keyword)) {
            wrapper.like(ExpenseReimbursement::getTitle, keyword);
        }

        // 按租户筛选
        String tenantId = (String) params.get("tenantId");
        if (StringUtils.hasText(tenantId)) {
            wrapper.eq(ExpenseReimbursement::getTenantId, Long.parseLong(tenantId));
        }

        wrapper.orderByDesc(ExpenseReimbursement::getCreateTime);

        return this.page(new Page<>(page, size), wrapper);
    }

    @Override
    public String generateReimbursementNo() {
        String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String prefix = "EX" + dateStr;

        // 查询今天已有的最大序号（按租户隔离）
        LambdaQueryWrapper<ExpenseReimbursement> wrapper = new LambdaQueryWrapper<>();
        wrapper.likeRight(ExpenseReimbursement::getReimbursementNo, prefix);
        // 多租户隔离：只查询当前租户的报销单号，避免跨租户编号冲突
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            wrapper.eq(ExpenseReimbursement::getTenantId, tenantId);
        }
        wrapper.orderByDesc(ExpenseReimbursement::getReimbursementNo);
        wrapper.last("LIMIT 1");

        ExpenseReimbursement latest = this.getOne(wrapper);
        int seq = 1;
        if (latest != null && latest.getReimbursementNo() != null) {
            String lastNo = latest.getReimbursementNo();
            try {
                seq = Integer.parseInt(lastNo.substring(prefix.length())) + 1;
            } catch (NumberFormatException e) {
                log.warn("Failed to parse reimbursement no: {}", lastNo);
            }
        }

        return prefix + String.format("%03d", seq);
    }
}

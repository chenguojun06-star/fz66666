package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.ExpenseReimbursementDoc;
import com.fashion.supplychain.finance.mapper.ExpenseReimbursementDocMapper;
import com.fashion.supplychain.finance.orchestration.ExpenseReimbursementDocOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 报销单凭证 Service
 */
@Service
public class ExpenseReimbursementDocService
        extends ServiceImpl<ExpenseReimbursementDocMapper, ExpenseReimbursementDoc> {

    @Autowired
    private ExpenseReimbursementDocOrchestrator orchestrator;

    /**
     * 查询报销单下的所有凭证
     */
    public List<ExpenseReimbursementDoc> listByReimbursementId(Long tenantId, String reimbursementId) {
        return list(new LambdaQueryWrapper<ExpenseReimbursementDoc>()
                .eq(ExpenseReimbursementDoc::getTenantId, tenantId)
                .eq(ExpenseReimbursementDoc::getReimbursementId, reimbursementId)
                .eq(ExpenseReimbursementDoc::getDeleteFlag, 0)
                .orderByDesc(ExpenseReimbursementDoc::getCreateTime));
    }

    /**
     * 批量将未关联的凭证 doc 绑定到指定报销单
     * 事务处理委托给 {@link ExpenseReimbursementDocOrchestrator}
     */
    public void linkDocs(List<String> docIds, String reimbursementId, String reimbursementNo) {
        orchestrator.linkDocs(docIds, reimbursementId, reimbursementNo);
    }
}

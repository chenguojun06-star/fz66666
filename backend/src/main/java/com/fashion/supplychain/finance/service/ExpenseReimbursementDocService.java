package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.ExpenseReimbursementDoc;
import com.fashion.supplychain.finance.mapper.ExpenseReimbursementDocMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 报销单凭证 Service
 */
@Service
public class ExpenseReimbursementDocService
        extends ServiceImpl<ExpenseReimbursementDocMapper, ExpenseReimbursementDoc> {

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
     */
    @Transactional(rollbackFor = Exception.class)
    public void linkDocs(List<String> docIds, String reimbursementId, String reimbursementNo) {
        if (docIds == null || docIds.isEmpty()) return;
        for (String docId : docIds) {
            ExpenseReimbursementDoc doc = getById(docId);
            if (doc != null && doc.getReimbursementId() == null) {
                doc.setReimbursementId(reimbursementId);
                doc.setReimbursementNo(reimbursementNo);
                updateById(doc);
            }
        }
    }
}

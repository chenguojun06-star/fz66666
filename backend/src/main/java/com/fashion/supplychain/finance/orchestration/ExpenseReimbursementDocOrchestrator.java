package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.finance.entity.ExpenseReimbursementDoc;
import com.fashion.supplychain.finance.service.ExpenseReimbursementDocService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 报销单凭证写入编排器
 * <p>
 * 负责凭证与报销单的绑定等写操作，事务边界放在此处。
 * </p>
 */
@Service
public class ExpenseReimbursementDocOrchestrator {

    @Autowired
    private ExpenseReimbursementDocService docService;

    /**
     * 批量将未关联的凭证 doc 绑定到指定报销单
     */
    @Transactional(rollbackFor = Exception.class)
    public void linkDocs(List<String> docIds, String reimbursementId, String reimbursementNo) {
        if (docIds == null || docIds.isEmpty()) return;
        for (String docId : docIds) {
            ExpenseReimbursementDoc doc = docService.getById(docId);
            if (doc != null && doc.getReimbursementId() == null) {
                doc.setReimbursementId(reimbursementId);
                doc.setReimbursementNo(reimbursementNo);
                docService.updateById(doc);
            }
        }
    }
}

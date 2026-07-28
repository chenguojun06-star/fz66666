package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.ExpenseReimbursementDoc;
import com.fashion.supplychain.finance.service.ExpenseReimbursementDocService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
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
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (docIds == null || docIds.isEmpty()) return;
        // 批量查询所有 doc（保留 tenantId 过滤，P0 #4 多租户隔离）
        List<ExpenseReimbursementDoc> docs = docService.lambdaQuery()
                .in(ExpenseReimbursementDoc::getId, docIds)
                .eq(ExpenseReimbursementDoc::getTenantId, tenantId)
                .list();
        // 筛选未关联的 doc 并修改字段
        List<ExpenseReimbursementDoc> toUpdate = new ArrayList<>();
        for (ExpenseReimbursementDoc doc : docs) {
            if (doc.getReimbursementId() == null) {
                doc.setReimbursementId(reimbursementId);
                doc.setReimbursementNo(reimbursementNo);
                toUpdate.add(doc);
            }
        }
        // 批量更新
        if (!toUpdate.isEmpty()) {
            docService.updateBatchById(toUpdate);
        }
    }
}

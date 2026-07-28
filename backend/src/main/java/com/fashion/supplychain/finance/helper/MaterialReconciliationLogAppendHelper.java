package com.fashion.supplychain.finance.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class MaterialReconciliationLogAppendHelper extends AbstractOperationLogAppendHelper<MaterialReconciliation, String> {

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Override
    protected IService<MaterialReconciliation> getService() {
        return materialReconciliationService;
    }

    @Override
    protected String getEntityName() {
        return "物料对账";
    }

    @Override
    protected Function<MaterialReconciliation, String> getRemarkGetter() {
        return MaterialReconciliation::getRemark;
    }

    @Override
    protected BiConsumer<MaterialReconciliation, String> getRemarkSetter() {
        return MaterialReconciliation::setRemark;
    }

    public void appendCreate(MaterialReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "创建对账单",
            "金额：" + (recon.getFinalAmount() != null ? recon.getFinalAmount().toString() : "0"));
    }

    public void appendUpdate(MaterialReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "修改对账单", null);
    }

    public void appendDelete(MaterialReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "删除对账单", null);
    }

    public void appendVerify(MaterialReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "审核对账",
            "审核人：" + (operatorName != null ? operatorName : ""));
    }

    public void appendApprove(MaterialReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "批准对账",
            "批准人：" + (operatorName != null ? operatorName : ""));
    }

    public void appendReject(MaterialReconciliation recon, String reason, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "驳回对账",
            "驳回人：" + (operatorName != null ? operatorName : "")
                + "，原因：" + (reason != null ? reason : ""));
    }

    public void appendPaid(MaterialReconciliation recon, BigDecimal amount, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "登记付款",
            "金额：" + (amount != null ? amount.toString() : "0"));
    }
}
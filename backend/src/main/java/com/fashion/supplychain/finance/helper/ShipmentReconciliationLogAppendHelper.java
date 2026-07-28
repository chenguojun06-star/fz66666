package com.fashion.supplychain.finance.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class ShipmentReconciliationLogAppendHelper extends AbstractOperationLogAppendHelper<ShipmentReconciliation, String> {

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Override
    protected IService<ShipmentReconciliation> getService() {
        return shipmentReconciliationService;
    }

    @Override
    protected String getEntityName() {
        return "出货对账";
    }

    @Override
    protected Function<ShipmentReconciliation, String> getRemarkGetter() {
        return ShipmentReconciliation::getRemark;
    }

    @Override
    protected BiConsumer<ShipmentReconciliation, String> getRemarkSetter() {
        return ShipmentReconciliation::setRemark;
    }

    public void appendCreate(ShipmentReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "创建对账单",
            "金额：" + (recon.getFinalAmount() != null ? recon.getFinalAmount().toString() : "0"));
    }

    public void appendUpdate(ShipmentReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "修改对账单", null);
    }

    public void appendDelete(ShipmentReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "删除对账单", null);
    }

    public void appendVerify(ShipmentReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "审核对账",
            "审核人：" + (operatorName != null ? operatorName : ""));
    }

    public void appendApprove(ShipmentReconciliation recon, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "批准对账",
            "批准人：" + (operatorName != null ? operatorName : ""));
    }

    public void appendReject(ShipmentReconciliation recon, String reason, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "驳回对账",
            "驳回人：" + (operatorName != null ? operatorName : "")
                + "，原因：" + (reason != null ? reason : ""));
    }

    public void appendPaid(ShipmentReconciliation recon, BigDecimal amount, String operatorName) {
        if (recon == null) return;
        appendOperation(recon.getId(), "登记收款",
            "金额：" + (amount != null ? amount.toString() : "0"));
    }
}
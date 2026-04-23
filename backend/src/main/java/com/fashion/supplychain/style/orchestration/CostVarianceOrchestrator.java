package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.mapper.StyleQuotationMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class CostVarianceOrchestrator {

    @Autowired
    private StyleQuotationMapper styleQuotationMapper;

    public void computeAndPersistVariance(StyleQuotation q) {
        if (q == null) return;

        BigDecimal stdMat = q.getStandardMaterialCost();
        BigDecimal stdProc = q.getStandardProcessCost();
        BigDecimal stdOther = q.getStandardOtherCost();

        if (stdMat == null && stdProc == null && stdOther == null) return;

        BigDecimal actualMat = q.getMaterialCost() != null ? q.getMaterialCost() : BigDecimal.ZERO;
        BigDecimal actualProc = q.getProcessCost() != null ? q.getProcessCost() : BigDecimal.ZERO;
        BigDecimal actualOther = q.getOtherCost() != null ? q.getOtherCost() : BigDecimal.ZERO;

        BigDecimal matVar = actualMat.subtract(stdMat != null ? stdMat : BigDecimal.ZERO);
        BigDecimal procVar = actualProc.subtract(stdProc != null ? stdProc : BigDecimal.ZERO);
        BigDecimal totalStd = (stdMat != null ? stdMat : BigDecimal.ZERO)
                .add(stdProc != null ? stdProc : BigDecimal.ZERO)
                .add(stdOther != null ? stdOther : BigDecimal.ZERO);
        BigDecimal totalActual = actualMat.add(actualProc).add(actualOther);
        BigDecimal totalVar = totalActual.subtract(totalStd);

        BigDecimal varRate = BigDecimal.ZERO;
        if (totalStd.compareTo(BigDecimal.ZERO) > 0) {
            varRate = totalVar.divide(totalStd, 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100)).setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal overheadRate = q.getOverheadAllocationRate();
        BigDecimal allocatedOverhead = BigDecimal.ZERO;
        if (overheadRate != null && overheadRate.compareTo(BigDecimal.ZERO) > 0 && totalActual.compareTo(BigDecimal.ZERO) > 0) {
            allocatedOverhead = totalActual.multiply(overheadRate)
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }

        StyleQuotation patch = new StyleQuotation();
        patch.setId(q.getId());
        patch.setMaterialVariance(matVar.setScale(2, RoundingMode.HALF_UP));
        patch.setProcessVariance(procVar.setScale(2, RoundingMode.HALF_UP));
        patch.setTotalVariance(totalVar.setScale(2, RoundingMode.HALF_UP));
        patch.setVarianceRate(varRate);
        patch.setAllocatedOverheadCost(allocatedOverhead);
        styleQuotationMapper.updateById(patch);

        log.info("[成本差异] 报价单id={}, 物料差异={}, 工序差异={}, 总差异={}, 差异率={}%",
                q.getId(), matVar, procVar, totalVar, varRate);
    }
}

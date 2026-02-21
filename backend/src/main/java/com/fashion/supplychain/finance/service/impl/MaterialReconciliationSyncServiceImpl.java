package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.MaterialReconciliationSyncService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 物料对账同步服务实现类
 *
 * 核心逻辑：入库 → 对账的数据流转
 *
 * 注意：本Service只处理单模块内的CRUD操作，跨模块协调请使用MaterialReconciliationSyncOrchestrator
 */
@Slf4j
@Service
public class MaterialReconciliationSyncServiceImpl implements MaterialReconciliationSyncService {

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    /**
     * 创建物料对账记录（单模块操作）
     *
     * 注意：此方法只在本模块内创建记录，不处理跨模块数据查询
     * 完整的同步逻辑（含跨模块查询）请使用 MaterialReconciliationSyncOrchestrator.syncFromInbound()
     *
     * @param reconciliation 对账记录
     * @return 对账记录ID
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public String createReconciliation(MaterialReconciliation reconciliation) {
        if (reconciliation == null) {
            throw new RuntimeException("对账记录不能为空");
        }

        // 生成对账单号
        if (reconciliation.getReconciliationNo() == null) {
            reconciliation.setReconciliationNo(generateReconciliationNo());
        }

        // 默认状态设置
        if (reconciliation.getStatus() == null) {
            reconciliation.setStatus("pending");
        }

        // 保存对账记录
        materialReconciliationService.save(reconciliation);

        log.info("物料对账记录创建成功: reconciliationNo={}, materialCode={}, quantity={}",
                reconciliation.getReconciliationNo(), reconciliation.getMaterialCode(),
                reconciliation.getQuantity());

        return reconciliation.getId();
    }

    /**
     * 检查入库记录是否已同步
     *
     * 注意：此方法需要在Orchestrator中调用，因为需要查询入库记录信息
     *
     * @param purchaseId 采购单ID
     * @param materialCode 物料编码
     * @param inboundNo 入库单号
     * @return 是否已同步
     */
    @Override
    public boolean isReconciliationExists(String purchaseId, String materialCode, String inboundNo) {
        if (purchaseId == null || purchaseId.trim().isEmpty()) {
            return false;
        }

        LambdaQueryWrapper<MaterialReconciliation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialReconciliation::getPurchaseId, purchaseId);

        if (materialCode != null && !materialCode.trim().isEmpty()) {
            wrapper.eq(MaterialReconciliation::getMaterialCode, materialCode);
        }

        if (inboundNo != null && !inboundNo.trim().isEmpty()) {
            wrapper.like(MaterialReconciliation::getRemark, inboundNo);
        }

        return materialReconciliationService.count(wrapper) > 0;
    }

    /**
     * 生成对账单号
     * 格式：MR+YYYYMM+4位序号（如：MR2026010001）
     */
    private synchronized String generateReconciliationNo() {
        String monthPrefix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMM"));
        String prefix = "MR" + monthPrefix;

        // 查询当月最大序号
        LambdaQueryWrapper<MaterialReconciliation> wrapper = new LambdaQueryWrapper<>();
        wrapper.likeRight(MaterialReconciliation::getReconciliationNo, prefix)
               .orderByDesc(MaterialReconciliation::getReconciliationNo)
               .last("LIMIT 1");

        MaterialReconciliation last = materialReconciliationService.getOne(wrapper);

        int sequence = 1;
        if (last != null && last.getReconciliationNo() != null) {
            String lastNo = last.getReconciliationNo();
            // MR2026010001 -> 0001
            String lastSequence = lastNo.substring(lastNo.length() - 4);
            try {
                sequence = Integer.parseInt(lastSequence) + 1;
            } catch (NumberFormatException e) {
                log.warn("解析对账单号序号失败: {}", lastNo, e);
            }
        }

        return String.format("%s%04d", prefix, sequence);
    }
}

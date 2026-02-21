package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 物料对账同步编排器
 *
 * 职责：协调production模块的入库、采购服务与finance模块的对账服务
 * 实现跨模块的数据同步和事务管理
 */
@Slf4j
@Service
public class MaterialReconciliationSyncOrchestrator {

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Autowired
    private MaterialInboundService materialInboundService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    /**
     * 从入库记录同步到物料对账
     *
     * @param inbound 入库记录
     * @param purchase 采购单
     * @return 对账记录ID
     */
    @Transactional(rollbackFor = Exception.class)
    public String syncFromInbound(MaterialInbound inbound, MaterialPurchase purchase) {
        if (inbound == null) {
            throw new RuntimeException("入库记录不能为空");
        }

        if (purchase == null) {
            throw new RuntimeException("采购单不能为空");
        }

        log.info("开始同步入库记录到物料对账: inboundNo={}, purchaseNo={}",
                inbound.getInboundNo(), purchase.getPurchaseNo());

        // 1. 检查是否已同步（避免重复）
        LambdaQueryWrapper<MaterialReconciliation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialReconciliation::getPurchaseId, purchase.getId())
               .eq(MaterialReconciliation::getMaterialCode, inbound.getMaterialCode());

        MaterialReconciliation existing = materialReconciliationService.getOne(wrapper);

        if (existing != null) {
            log.warn("该入库记录已同步到对账，跳过: reconciliationNo={}", existing.getReconciliationNo());
            return existing.getId();
        }

        // 2. 创建对账记录
        MaterialReconciliation reconciliation = new MaterialReconciliation();

        // 基本信息
        reconciliation.setReconciliationNo(generateReconciliationNo());
        reconciliation.setSupplierId(purchase.getSupplierId());
        reconciliation.setSupplierName(purchase.getSupplierName());
        reconciliation.setMaterialId(purchase.getMaterialId());
        reconciliation.setMaterialCode(inbound.getMaterialCode());
        reconciliation.setMaterialName(inbound.getMaterialName());

        // 关联信息
        reconciliation.setPurchaseId(purchase.getId());
        reconciliation.setPurchaseNo(purchase.getPurchaseNo());
        reconciliation.setSourceType(purchase.getSourceType());
        reconciliation.setOrderId(purchase.getOrderId());
        reconciliation.setOrderNo(purchase.getOrderNo());
        reconciliation.setPatternProductionId(purchase.getPatternProductionId());
        reconciliation.setStyleId(purchase.getStyleId());
        reconciliation.setStyleNo(purchase.getStyleNo());
        reconciliation.setStyleName(purchase.getStyleName());

        // 数量和金额（使用入库数量和采购单价）
        reconciliation.setQuantity(inbound.getInboundQuantity());
        reconciliation.setUnitPrice(purchase.getUnitPrice());

        // 计算总金额和最终金额
        if (purchase.getUnitPrice() != null && inbound.getInboundQuantity() != null) {
            java.math.BigDecimal totalAmount = purchase.getUnitPrice().multiply(new java.math.BigDecimal(inbound.getInboundQuantity()));
            reconciliation.setTotalAmount(totalAmount);
            reconciliation.setFinalAmount(totalAmount); // 初始无扣款，最终金额=总金额
        }

        // 对账周期（使用入库时间）
        LocalDateTime inboundTime = inbound.getInboundTime();
        reconciliation.setPeriodStartDate(inboundTime.withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0));
        reconciliation.setPeriodEndDate(inboundTime.withDayOfMonth(inboundTime.toLocalDate().lengthOfMonth()).withHour(23).withMinute(59).withSecond(59));
        reconciliation.setReconciliationDate(inboundTime.format(DateTimeFormatter.ofPattern("yyyy-MM")));

        // 时间信息（从采购单和入库记录获取）
        reconciliation.setExpectedArrivalDate(purchase.getExpectedArrivalDate());
        reconciliation.setActualArrivalDate(purchase.getActualArrivalDate());
        reconciliation.setInboundDate(inbound.getInboundTime());
        reconciliation.setWarehouseLocation(inbound.getWarehouseLocation());

        // 状态和操作人
        reconciliation.setStatus("pending");
        reconciliation.setReconciliationOperatorId(inbound.getOperatorId());
        reconciliation.setReconciliationOperatorName(inbound.getOperatorName());

        reconciliation.setRemark(String.format("由入库单 %s 自动生成", inbound.getInboundNo()));

        // 3. 保存对账记录
        materialReconciliationService.save(reconciliation);

        log.info("入库记录同步到物料对账成功: reconciliationNo={}, materialCode={}, quantity={}, amount={}",
                reconciliation.getReconciliationNo(), reconciliation.getMaterialCode(),
                reconciliation.getQuantity(), reconciliation.getTotalAmount());

        return reconciliation.getId();
    }

    /**
     * 根据采购单ID同步所有入库记录
     *
     * @param purchaseId 采购单ID
     * @return 同步记录数
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncFromPurchase(String purchaseId) {
        if (purchaseId == null || purchaseId.trim().isEmpty()) {
            throw new RuntimeException("采购单ID不能为空");
        }

        // 1. 查询采购单
        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null) {
            throw new RuntimeException("采购单不存在: " + purchaseId);
        }

        // 2. 查询该采购单的所有入库记录
        List<MaterialInbound> inboundList = materialInboundService.listByPurchaseId(purchaseId);

        if (inboundList.isEmpty()) {
            log.warn("采购单 {} 没有入库记录，无法同步", purchaseId);
            return 0;
        }

        // 3. 逐条同步
        int syncCount = 0;
        for (MaterialInbound inbound : inboundList) {
            try {
                if (!isInboundSynced(inbound.getId())) {
                    syncFromInbound(inbound, purchase);
                    syncCount++;
                }
            } catch (Exception e) {
                log.error("同步入库记录失败: inboundId={}", inbound.getId(), e);
                // 继续处理下一条
            }
        }

        log.info("采购单 {} 同步完成，共同步 {} 条对账记录", purchaseId, syncCount);
        return syncCount;
    }

    /**
     * 根据时间范围同步入库记录
     *
     * @param startDate 开始日期（yyyy-MM-dd）
     * @param endDate 结束日期（yyyy-MM-dd）
     * @return 同步记录数
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncByDateRange(String startDate, String endDate) {
        // 1. 查询指定时间范围的入库记录
        LambdaQueryWrapper<MaterialInbound> wrapper = new LambdaQueryWrapper<>();

        LocalDateTime startDateTime = LocalDate.parse(startDate, DateTimeFormatter.ofPattern("yyyy-MM-dd")).atStartOfDay();
        LocalDateTime endDateTime = LocalDate.parse(endDate, DateTimeFormatter.ofPattern("yyyy-MM-dd")).atTime(23, 59, 59);

        wrapper.between(MaterialInbound::getInboundTime, startDateTime, endDateTime);
        wrapper.isNotNull(MaterialInbound::getPurchaseId);

        List<MaterialInbound> inboundList = materialInboundService.list(wrapper);

        if (inboundList.isEmpty()) {
            log.info("时间范围 {} 至 {} 没有入库记录", startDate, endDate);
            return 0;
        }

        // 2. 逐条同步
        int syncCount = 0;
        for (MaterialInbound inbound : inboundList) {
            try {
                if (isInboundSynced(inbound.getId())) {
                    continue;
                }

                // 查询关联的采购单
                MaterialPurchase purchase = materialPurchaseService.getById(inbound.getPurchaseId());
                if (purchase == null) {
                    log.warn("入库记录 {} 的采购单 {} 不存在", inbound.getInboundNo(), inbound.getPurchaseId());
                    continue;
                }

                syncFromInbound(inbound, purchase);
                syncCount++;
            } catch (Exception e) {
                log.error("同步入库记录失败: inboundId={}", inbound.getId(), e);
            }
        }

        log.info("时间范围同步完成: {} 至 {}，共同步 {} 条对账记录", startDate, endDate, syncCount);
        return syncCount;
    }

    /**
     * 检查入库记录是否已同步
     *
     * @param inboundId 入库记录ID
     * @return 是否已同步
     */
    public boolean isInboundSynced(String inboundId) {
        if (inboundId == null || inboundId.trim().isEmpty()) {
            return false;
        }

        // 通过remark字段判断（包含入库单号）
        MaterialInbound inbound = materialInboundService.getById(inboundId);
        if (inbound == null) {
            return false;
        }

        LambdaQueryWrapper<MaterialReconciliation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialReconciliation::getPurchaseId, inbound.getPurchaseId())
               .eq(MaterialReconciliation::getMaterialCode, inbound.getMaterialCode())
               .like(MaterialReconciliation::getRemark, inbound.getInboundNo());

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
